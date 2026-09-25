use std::collections::HashMap;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use sha2::{Digest, Sha256};
use tree_sitter::{Node, ParseOptions, Parser};

use crate::language::{
    AnalyzerError, LanguageAnalysis, LanguageAnalyzer, SourceSpan, SymbolFact, SyntaxCoverage,
    SyntaxDiagnostic,
};

pub struct JavaAnalyzer {
    parser: Parser,
}

impl JavaAnalyzer {
    pub fn new() -> Result<Self, AnalyzerError> {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_java::LANGUAGE.into())
            .map_err(|_| AnalyzerError::GrammarUnavailable)?;
        Ok(Self { parser })
    }

    pub fn analyze_until(
        &mut self,
        relative_path: &str,
        source: &[u8],
        deadline: Instant,
        cancelled: &AtomicBool,
        max_result_bytes: usize,
    ) -> Result<LanguageAnalysis, AnalyzerError> {
        self.analyze_inner(
            relative_path,
            source,
            Some((deadline, cancelled)),
            max_result_bytes,
        )
    }

    fn analyze_inner(
        &mut self,
        relative_path: &str,
        source: &[u8],
        budget: Option<(Instant, &AtomicBool)>,
        max_result_bytes: usize,
    ) -> Result<LanguageAnalysis, AnalyzerError> {
        let exhausted = || {
            budget.is_some_and(|(deadline, cancelled)| {
                Instant::now() >= deadline || cancelled.load(Ordering::Relaxed)
            })
        };
        if exhausted() {
            return Err(AnalyzerError::BudgetExceeded);
        }
        let tree = if budget.is_some() {
            let mut progress = |_state: &tree_sitter::ParseState| {
                if exhausted() {
                    ControlFlow::Break(())
                } else {
                    ControlFlow::Continue(())
                }
            };
            let options = ParseOptions::new().progress_callback(&mut progress);
            self.parser.parse_with_options(
                &mut |offset, _| source.get(offset..).unwrap_or_default(),
                None,
                Some(options),
            )
        } else {
            self.parser.parse(source, None)
        }
        .ok_or(if exhausted() {
            AnalyzerError::BudgetExceeded
        } else {
            AnalyzerError::ParserFailed
        })?;
        if exhausted() {
            return Err(AnalyzerError::BudgetExceeded);
        }
        let root = tree.root_node();
        let mut collector = SymbolCollector::new(relative_path, source, max_result_bytes);
        collector.collect(root);
        if collector.over_budget {
            return Err(AnalyzerError::ResourceLimit);
        }
        if exhausted() {
            return Err(AnalyzerError::BudgetExceeded);
        }
        let coverage = if root.has_error() {
            SyntaxCoverage::Partial
        } else {
            SyntaxCoverage::Complete
        };
        let diagnostics = if root.has_error() {
            vec![SyntaxDiagnostic {
                code: "SYNTAX_ERROR".into(),
                message: "Java source contains syntax errors".into(),
                span: find_error(root).map(span),
            }]
        } else {
            Vec::new()
        };
        Ok(LanguageAnalysis {
            symbols: collector.symbols,
            diagnostics,
            coverage,
        })
    }
}

impl LanguageAnalyzer for JavaAnalyzer {
    fn analyze(
        &mut self,
        relative_path: &str,
        source: &[u8],
    ) -> Result<LanguageAnalysis, AnalyzerError> {
        self.analyze_inner(relative_path, source, None, usize::MAX)
    }
}

fn find_error(node: Node<'_>) -> Option<Node<'_>> {
    if node.is_error() || node.is_missing() {
        return Some(node);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.has_error()
            && let Some(error) = find_error(child)
        {
            return Some(error);
        }
    }
    None
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

struct SymbolCollector<'a> {
    relative_path: &'a str,
    source: &'a [u8],
    owners: Vec<String>,
    ordinals: HashMap<(String, String, String, String), usize>,
    symbols: Vec<SymbolFact>,
    result_bytes: usize,
    max_result_bytes: usize,
    over_budget: bool,
}

impl<'a> SymbolCollector<'a> {
    fn new(relative_path: &'a str, source: &'a [u8], max_result_bytes: usize) -> Self {
        Self {
            relative_path,
            source,
            owners: Vec::new(),
            ordinals: HashMap::new(),
            symbols: Vec::new(),
            result_bytes: 0,
            max_result_bytes,
            over_budget: false,
        }
    }

    fn collect(&mut self, root: Node<'_>) {
        let mut cursor = root.walk();
        for child in root.named_children(&mut cursor) {
            if child.kind() == "package_declaration"
                && let Some(name_node) = first_named_child(child)
                && let Some(name) = self.text(name_node)
            {
                let name = name.to_owned();
                self.push("java.package", &name, "", false, name_node);
                self.owners.push(name);
                break;
            }
        }
        let mut cursor = root.walk();
        for child in root.named_children(&mut cursor) {
            if child.kind() != "package_declaration" {
                self.visit(child);
            }
        }
    }

    fn visit(&mut self, node: Node<'_>) {
        if self.over_budget {
            return;
        }
        match node.kind() {
            "class_declaration" | "interface_declaration" => {
                let kind = if node.kind() == "class_declaration" {
                    "java.class"
                } else {
                    "java.interface"
                };
                if let Some(name_node) = node.child_by_field_name("name")
                    && let Some(name) = self.text(name_node)
                {
                    let name = name.to_owned();
                    self.push(kind, &name, "", has_static_modifier(node), name_node);
                    self.owners.push(name);
                    if let Some(body) = node.child_by_field_name("body") {
                        self.visit_children(body);
                    }
                    self.owners.pop();
                }
            }
            "method_declaration" | "constructor_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name")
                    && let Some(name) = self.text(name_node)
                {
                    let name = name.to_owned();
                    let signature = self.signature(node);
                    let kind = if node.kind() == "constructor_declaration" {
                        "java.constructor"
                    } else {
                        "java.method"
                    };
                    self.push(
                        kind,
                        &name,
                        &signature,
                        has_static_modifier(node),
                        name_node,
                    );
                }
            }
            "field_declaration" => {
                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    if child.kind() == "variable_declarator"
                        && let Some(name_node) = child.child_by_field_name("name")
                        && let Some(name) = self.text(name_node)
                    {
                        let name = name.to_owned();
                        self.push(
                            "java.field",
                            &name,
                            "",
                            has_static_modifier(node),
                            name_node,
                        );
                    }
                }
            }
            _ => self.visit_children(node),
        }
    }

    fn visit_children(&mut self, node: Node<'_>) {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.visit(child);
        }
    }

    fn signature(&self, node: Node<'_>) -> String {
        let Some(parameters) = node.child_by_field_name("parameters") else {
            return "()".into();
        };
        let mut types = Vec::new();
        let mut cursor = parameters.walk();
        for parameter in parameters.named_children(&mut cursor) {
            let type_node = if parameter.kind() == "spread_parameter" {
                let mut children = parameter.walk();
                parameter.named_children(&mut children).find(|child| {
                    !matches!(
                        child.kind(),
                        "modifiers" | "annotation" | "marker_annotation" | "variable_declarator"
                    )
                })
            } else {
                parameter.child_by_field_name("type")
            };
            if let Some(type_node) = type_node.and_then(|type_node| self.text(type_node)) {
                let mut signature = type_node.trim().to_owned();
                if parameter.kind() == "spread_parameter" {
                    signature.push_str("...");
                }
                let dimensions = if parameter.kind() == "spread_parameter" {
                    let mut children = parameter.walk();
                    parameter
                        .named_children(&mut children)
                        .find(|child| child.kind() == "variable_declarator")
                        .and_then(|declarator| declarator.child_by_field_name("dimensions"))
                } else {
                    parameter.child_by_field_name("dimensions")
                };
                if let Some(dimensions) = dimensions.and_then(|node| self.text(node)) {
                    signature.push_str(dimensions.trim());
                }
                types.push(signature);
            }
        }
        format!("({})", types.join(","))
    }

    fn text(&self, node: Node<'_>) -> Option<&str> {
        std::str::from_utf8(self.source.get(node.byte_range())?).ok()
    }

    fn push(
        &mut self,
        kind: &str,
        name: &str,
        signature: &str,
        is_static: bool,
        name_node: Node<'_>,
    ) {
        let estimated = 512usize.saturating_add(
            kind.len()
                .saturating_add(name.len())
                .saturating_add(signature.len())
                .saturating_add(self.owners.iter().map(String::len).sum::<usize>())
                .saturating_mul(3),
        );
        self.result_bytes = self.result_bytes.saturating_add(estimated);
        if self.result_bytes > self.max_result_bytes {
            self.over_budget = true;
            return;
        }
        let owner = self.owners.join("/");
        let key = (
            kind.to_owned(),
            owner,
            name.to_owned(),
            signature.to_owned(),
        );
        let ordinal = self.ordinals.entry(key).or_default();
        let provider_fact_id = fact_id(
            self.relative_path,
            kind,
            &self.owners,
            name,
            signature,
            *ordinal,
        );
        *ordinal += 1;
        let qualified_name = if kind == "java.package" || self.owners.is_empty() {
            Some(name.to_owned())
        } else {
            Some(format!("{}.{}", self.owners.join("."), name))
        };
        self.symbols.push(SymbolFact {
            provider_fact_id,
            provider_kind: kind.to_owned(),
            name: name.to_owned(),
            qualified_name,
            signature: signature.to_owned(),
            is_static,
            span: span(name_node),
        });
    }
}

fn has_static_modifier(node: Node<'_>) -> bool {
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .find(|child| child.kind() == "modifiers")
        .is_some_and(|modifiers| {
            let mut cursor = modifiers.walk();
            modifiers
                .children(&mut cursor)
                .any(|child| child.kind() == "static")
        })
}

fn first_named_child(node: Node<'_>) -> Option<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).next()
}

fn fact_id(
    path: &str,
    kind: &str,
    owners: &[String],
    name: &str,
    signature: &str,
    ordinal: usize,
) -> String {
    let mut hash = Sha256::new();
    hash.update(b"java-symbol-v1\0");
    for value in [path, kind] {
        hash_field(&mut hash, value);
    }
    hash_field(&mut hash, &owners.len().to_string());
    for owner in owners {
        hash_field(&mut hash, owner);
    }
    for value in [name, signature] {
        hash_field(&mut hash, value);
    }
    hash_field(&mut hash, &ordinal.to_string());
    format!("java-symbol-v1:{:x}", hash.finalize())
}

fn hash_field(hash: &mut Sha256, value: &str) {
    hash.update(value.len().to_string().as_bytes());
    hash.update(b":");
    hash.update(value.as_bytes());
}
