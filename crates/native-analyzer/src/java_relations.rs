use std::collections::BTreeMap;

use sha2::{Digest, Sha256};
use tree_sitter::Node;

use crate::language::{
    AnalyzerError, RelationKind, RelationSite, SourceSpan, SymbolFact, SyntaxDiagnostic,
};

pub fn compilation_unit_id(path: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(b"java-compilation-unit-v1\0");
    hash.update(path.len().to_string().as_bytes());
    hash.update(b":");
    hash.update(path.as_bytes());
    format!("java-compilation-unit-v1:{:x}", hash.finalize())
}

pub fn collect_sites(
    root: Node<'_>,
    source: &[u8],
    path: &str,
    symbols: &[SymbolFact],
    max_result_bytes: usize,
) -> Result<(Vec<RelationSite>, Vec<SyntaxDiagnostic>), AnalyzerError> {
    let mut by_span = BTreeMap::new();
    for symbol in symbols {
        by_span.insert((symbol.span.start_line, symbol.span.start_column), symbol);
    }
    let mut visitor = Visitor {
        source,
        by_span,
        compilation_unit_id: compilation_unit_id(path),
        sites: Vec::new(),
        diagnostics: Vec::new(),
        max_result_bytes,
        used_bytes: 0,
    };
    visitor.visit(root, None, None)?;
    Ok((visitor.sites, visitor.diagnostics))
}

struct Visitor<'a> {
    source: &'a [u8],
    by_span: BTreeMap<(usize, usize), &'a SymbolFact>,
    compilation_unit_id: String,
    sites: Vec<RelationSite>,
    diagnostics: Vec<SyntaxDiagnostic>,
    max_result_bytes: usize,
    used_bytes: usize,
}

impl Visitor<'_> {
    fn visit(
        &mut self,
        node: Node<'_>,
        type_owner: Option<&str>,
        callable_owner: Option<&str>,
    ) -> Result<(), AnalyzerError> {
        match node.kind() {
            "import_declaration" => {
                self.import(node)?;
                return Ok(());
            }
            "class_declaration" | "interface_declaration" => {
                let owner = node
                    .child_by_field_name("name")
                    .and_then(|name| self.symbol_id(name));
                let owner = owner.as_deref().or(type_owner);
                for field in ["superclass", "interfaces", "extends_interfaces"] {
                    if let Some(clause) = node.child_by_field_name(field) {
                        self.inheritance(clause, owner)?;
                    }
                }
                if let Some(body) = node.child_by_field_name("body") {
                    self.children(body, owner, None)?;
                }
                return Ok(());
            }
            "method_declaration" | "constructor_declaration" => {
                let owner = node
                    .child_by_field_name("name")
                    .and_then(|name| self.symbol_id(name));
                if let Some(return_type) = node.child_by_field_name("type") {
                    self.type_reference(return_type, owner.as_deref())?;
                }
                if let Some(parameters) = node.child_by_field_name("parameters") {
                    self.parameter_type_references(parameters, owner.as_deref())?;
                }
                if let Some(body) = node.child_by_field_name("body") {
                    self.children(body, type_owner, owner.as_deref())?;
                }
                return Ok(());
            }
            "field_declaration" | "local_variable_declaration" => {
                if let Some(field_type) = node.child_by_field_name("type") {
                    self.type_reference(field_type, callable_owner.or(type_owner))?;
                }
            }
            "method_invocation" => {
                let Some(name_node) = node.child_by_field_name("name") else {
                    return Ok(());
                };
                let Some(name) = self.text(name_node) else {
                    return Ok(());
                };
                let receiver = node
                    .child_by_field_name("object")
                    .and_then(|item| self.text(item));
                let hint =
                    receiver.map_or_else(|| name.to_owned(), |item| format!("{item}.{name}"));
                let variant = match receiver {
                    Some("this") => "this",
                    Some(_) => "qualified",
                    None => "direct",
                };
                let arity = node.child_by_field_name("arguments").map(argument_count);
                self.call_site(callable_owner, variant, hint, arity, name_node)?;
                return self.children(node, type_owner, callable_owner);
            }
            "object_creation_expression" => {
                if let Some(type_node) = node.child_by_field_name("type")
                    && let Some(hint) = self.text(type_node)
                {
                    let arity = node.child_by_field_name("arguments").map(argument_count);
                    self.call_site(
                        callable_owner,
                        "constructor",
                        hint.to_owned(),
                        arity,
                        type_node,
                    )?;
                }
                return self.children(node, type_owner, callable_owner);
            }
            "explicit_constructor_invocation" => {
                if let Some(constructor) = node.child_by_field_name("constructor")
                    && self.text(constructor) == Some("this")
                {
                    let type_name = type_owner
                        .and_then(|id| {
                            self.by_span
                                .values()
                                .find(|fact| fact.provider_fact_id == id)
                        })
                        .map_or("", |fact| fact.name.as_str());
                    let hint = format!("this.{type_name}");
                    let arity = node.child_by_field_name("arguments").map(argument_count);
                    self.call_site(callable_owner, "this_constructor", hint, arity, constructor)?;
                }
                return self.children(node, type_owner, callable_owner);
            }
            "field_access" => {
                if let Some(field) = node.child_by_field_name("field")
                    && let Some(field_name) = self.text(field)
                {
                    let receiver = node
                        .child_by_field_name("object")
                        .and_then(|item| self.text(item));
                    let hint = receiver.map_or_else(
                        || field_name.to_owned(),
                        |item| format!("{item}.{field_name}"),
                    );
                    self.reference(callable_owner.or(type_owner), "field", hint, field)?;
                }
                return self.children(node, type_owner, callable_owner);
            }
            "method_reference" => {
                let mut cursor = node.walk();
                let named: Vec<_> = node.named_children(&mut cursor).collect();
                if let [receiver, method, ..] = named.as_slice()
                    && let (Some(left), Some(right)) = (self.text(*receiver), self.text(*method))
                {
                    self.reference(
                        callable_owner.or(type_owner),
                        "method",
                        format!("{left}::{right}"),
                        *method,
                    )?;
                }
                return Ok(());
            }
            _ => {}
        }
        self.children(node, type_owner, callable_owner)
    }

    fn children(
        &mut self,
        node: Node<'_>,
        type_owner: Option<&str>,
        callable_owner: Option<&str>,
    ) -> Result<(), AnalyzerError> {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.visit(child, type_owner, callable_owner)?;
        }
        Ok(())
    }

    fn import(&mut self, node: Node<'_>) -> Result<(), AnalyzerError> {
        let mut cursor = node.walk();
        let is_static = node
            .children(&mut cursor)
            .any(|child| child.kind() == "static");
        let mut cursor = node.walk();
        let is_wildcard = node
            .children(&mut cursor)
            .any(|child| child.kind() == "asterisk");
        let mut cursor = node.walk();
        if let Some(name_node) = node
            .named_children(&mut cursor)
            .find(|child| child.kind() != "asterisk")
            && let Some(hint) = self.text(name_node)
        {
            let variant = match (is_static, is_wildcard) {
                (false, false) => "normal",
                (true, false) => "static",
                (false, true) => "wildcard",
                (true, true) => "static_wildcard",
            };
            self.push(
                RelationKind::Import,
                variant,
                self.compilation_unit_id.clone(),
                hint.to_owned(),
                None,
                name_node,
            )?;
        }
        Ok(())
    }

    fn inheritance(&mut self, clause: Node<'_>, owner: Option<&str>) -> Result<(), AnalyzerError> {
        let Some(owner) = owner else {
            return Ok(());
        };
        let mut cursor = clause.walk();
        for child in clause.named_children(&mut cursor) {
            if child.kind() == "type_list" {
                let mut nested = child.walk();
                for named in child.named_children(&mut nested) {
                    self.inheritance_type(named, owner)?;
                }
            } else {
                self.inheritance_type(child, owner)?;
            }
        }
        Ok(())
    }

    fn inheritance_type(&mut self, node: Node<'_>, owner: &str) -> Result<(), AnalyzerError> {
        if let Some(hint) = self.text(node) {
            self.push(
                RelationKind::Inheritance,
                "type",
                owner.to_owned(),
                hint.to_owned(),
                None,
                node,
            )?;
        }
        Ok(())
    }

    fn parameter_type_references(
        &mut self,
        parameters: Node<'_>,
        owner: Option<&str>,
    ) -> Result<(), AnalyzerError> {
        let mut cursor = parameters.walk();
        for parameter in parameters.named_children(&mut cursor) {
            if let Some(type_node) = parameter.child_by_field_name("type") {
                self.type_reference(type_node, owner)?;
            }
        }
        Ok(())
    }

    fn type_reference(&mut self, node: Node<'_>, owner: Option<&str>) -> Result<(), AnalyzerError> {
        if matches!(
            node.kind(),
            "void_type" | "integral_type" | "floating_point_type" | "boolean_type"
        ) {
            return Ok(());
        }
        if let Some(hint) = self.text(node) {
            self.reference(owner, "type", hint.to_owned(), node)?;
        }
        Ok(())
    }

    fn reference(
        &mut self,
        owner: Option<&str>,
        variant: &str,
        hint: String,
        node: Node<'_>,
    ) -> Result<(), AnalyzerError> {
        if let Some(owner) = owner {
            self.push(
                RelationKind::Reference,
                variant,
                owner.to_owned(),
                hint,
                None,
                node,
            )?;
        }
        Ok(())
    }

    fn call_site(
        &mut self,
        owner: Option<&str>,
        variant: &str,
        hint: String,
        arity: Option<usize>,
        node: Node<'_>,
    ) -> Result<(), AnalyzerError> {
        if let Some(owner) = owner {
            self.push(
                RelationKind::Call,
                variant,
                owner.to_owned(),
                hint,
                arity,
                node,
            )?;
        } else {
            self.used_bytes = self.used_bytes.saturating_add(512);
            if self.used_bytes > self.max_result_bytes {
                return Err(AnalyzerError::ResourceLimit);
            }
            self.diagnostics.push(SyntaxDiagnostic {
                code: "UNSUPPORTED_RELATION_SOURCE".into(),
                message: "Call has no declared callable source".into(),
                span: Some(span(node)),
            });
        }
        Ok(())
    }

    fn push(
        &mut self,
        kind: RelationKind,
        variant: &str,
        source_fact_id: String,
        target_hint: String,
        arity: Option<usize>,
        node: Node<'_>,
    ) -> Result<(), AnalyzerError> {
        let charge = 512usize
            .saturating_add(source_fact_id.len())
            .saturating_add(target_hint.len())
            .saturating_add(variant.len());
        self.used_bytes = self.used_bytes.saturating_add(charge);
        if self.used_bytes > self.max_result_bytes {
            return Err(AnalyzerError::ResourceLimit);
        }
        self.sites.push(RelationSite {
            kind,
            variant: variant.to_owned(),
            source_fact_id,
            target_hint,
            arity,
            span: span(node),
        });
        Ok(())
    }

    fn symbol_id(&self, name_node: Node<'_>) -> Option<String> {
        self.by_span
            .get(&(
                name_node.start_position().row,
                name_node.start_position().column,
            ))
            .map(|symbol| symbol.provider_fact_id.clone())
    }

    fn text(&self, node: Node<'_>) -> Option<&str> {
        std::str::from_utf8(self.source.get(node.byte_range())?).ok()
    }
}

fn argument_count(list: Node<'_>) -> usize {
    let mut cursor = list.walk();
    list.named_children(&mut cursor).count()
}

fn span(node: Node<'_>) -> SourceSpan {
    let start = node.start_position();
    let end = node.end_position();
    SourceSpan {
        start_line: start.row,
        start_column: start.column,
        end_line: end.row,
        end_column: end.column,
    }
}
