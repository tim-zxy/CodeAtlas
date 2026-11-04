//! Java syntax-only adapter; exact existing declaration IDs, never framework semantics.
use crate::{
    java::JavaAnalyzer,
    language::{AnalyzerError, SymbolFact},
    syntax::{SyntaxFileObservation, SyntaxRequest, SyntaxWalkControl},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, ops::ControlFlow};
use tree_sitter::{Node, ParseOptions, Parser};
#[derive(Debug)]
pub enum JavaSyntaxError {
    InvalidOwnerMapping,
    Analyzer(AnalyzerError),
}
impl From<AnalyzerError> for JavaSyntaxError {
    fn from(e: AnalyzerError) -> Self {
        Self::Analyzer(e)
    }
}
pub struct JavaSyntaxAnalyzer {
    parser: Parser,
    code: JavaAnalyzer,
}
impl JavaSyntaxAnalyzer {
    pub fn new() -> Result<Self, AnalyzerError> {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_java::LANGUAGE.into())
            .map_err(|_| AnalyzerError::GrammarUnavailable)?;
        Ok(Self {
            parser,
            code: JavaAnalyzer::new()?,
        })
    }
    pub fn observe(
        &mut self,
        request: &SyntaxRequest,
        index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<SyntaxFileObservation, JavaSyntaxError> {
        self.observe_payload(&request.header()["payload"], index, source, control)
    }
    pub(crate) fn observe_payload(
        &mut self,
        p: &Value,
        index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<SyntaxFileObservation, JavaSyntaxError> {
        self.observe_payload_core(p, index, source, control, false, false)
    }
    pub(crate) fn observe_binding_syntax(
        &mut self,
        p: &Value,
        index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<SyntaxFileObservation, JavaSyntaxError> {
        self.observe_payload_core(p, index, source, control, true, false)
    }
    pub(crate) fn observe_binding_sufficiency(
        &mut self,
        p: &Value,
        index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<SyntaxFileObservation, JavaSyntaxError> {
        self.observe_payload_core(p, index, source, control, true, true)
    }
    fn observe_payload_core(
        &mut self,
        p: &Value,
        index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
        binding: bool,
        sufficiency: bool,
    ) -> Result<SyntaxFileObservation, JavaSyntaxError> {
        control.check()?;
        if source.len() > control.max_source_bytes
            || control.max_items == 0
            || control.max_depth == 0
            || control.max_result_bytes == 0
        {
            #[cfg(test)]
            eprintln!(
                "AB_GUARD java.syntax.admission source_bytes={} source_limit={} items_limit={} depth_limit={} bytes_limit={}",
                source.len(),
                control.max_source_bytes,
                control.max_items,
                control.max_depth,
                control.max_result_bytes
            );
            return Err(AnalyzerError::ResourceLimit.into());
        }
        let file = p["sourceFiles"]
            .get(index)
            .ok_or(AnalyzerError::ParserFailed)?;
        if file["languageHint"] != "java"
            || !p["languages"].as_array().is_some_and(|ls| {
                ls.iter().any(|l| {
                    l["languageId"] == "java"
                        && l["grammarVersion"] == "0.23.5"
                        && l["analyzerVersion"] == env!("CARGO_PKG_VERSION")
                })
            })
        {
            return Err(AnalyzerError::GrammarUnavailable.into());
        }
        // ponytail: two bounded passes per changed Java file reuse proven Code IDs;
        // share a tree only if measured parsing cost justifies changing that visitor.
        let analysis = self.code.analyze_until(
            file["path"].as_str().unwrap(),
            source,
            control.deadline,
            control.cancelled,
            control.max_result_bytes,
        )?;
        let mut owners = HashMap::new();
        for o in p["owners"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|o| o["sourceFileId"] == file["id"])
        {
            let id = o["providerNodeRef"]["providerFactId"].as_str().unwrap();
            if !analysis.symbols.iter().any(|s| s.provider_fact_id == id)
                && !(sufficiency
                    && id
                        == crate::java_relations::compilation_unit_id(
                            file["path"].as_str().unwrap(),
                        ))
            {
                return Err(JavaSyntaxError::InvalidOwnerMapping);
            }
            owners.insert(id.to_owned(), o["providerNodeRef"].clone());
        }
        let mut progress = |_: &tree_sitter::ParseState| {
            if control.check().is_err() {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        };
        let options = ParseOptions::new().progress_callback(&mut progress);
        let tree = self
            .parser
            .parse_with_options(
                &mut |offset, _| source.get(offset..).unwrap_or_default(),
                None,
                Some(options),
            )
            .ok_or(if control.check().is_err() {
                AnalyzerError::BudgetExceeded
            } else {
                AnalyzerError::ParserFailed
            })?;
        control.check()?;
        std::str::from_utf8(source).map_err(|_| AnalyzerError::ParserFailed)?;
        let root = tree.root_node();
        let mut c = Collector {
            source,
            binding,
            sufficiency,
            surface: p["syntaxContract"] == "SYNTAX_BINDING_V4",
            module: if sufficiency {
                owners
                    .get(&crate::java_relations::compilation_unit_id(
                        file["path"].as_str().unwrap(),
                    ))
                    .cloned()
            } else {
                None
            },
            file,
            control,
            symbols: &analysis.symbols,
            owners,
            out: SyntaxFileObservation {
                work_items: 0,
                nodes: vec![],
                edges: vec![],
                observations: vec![],
                coverage: Value::Null,
                diagnostics: vec![],
            },
            items: 0,
            bytes: 0,
            partial: root.has_error(),
        };
        c.walk(root, 0)?;
        c.out.coverage = json!({"sourceFileId":file["id"],"sourceFingerprint":file["contentFingerprint"],"status":if c.partial{"PARTIAL"}else{"COMPLETE"},"limitations":if c.partial{vec!["UNRESOLVED_OR_UNSUPPORTED_SYNTAX"]}else{vec![]}});
        if root.has_error() {
            c.out.diagnostics.push(json!({"code":"SYNTAX_ERROR","severity":"WARNING","message":"Java source contains syntax errors","sourceRange":c.range(root)}));
        }
        let metadata =
            serde_json::to_vec(&json!({"coverage":c.out.coverage,"diagnostics":c.out.diagnostics}))
                .map_err(|_| AnalyzerError::ParserFailed)?
                .len();
        if c.bytes.saturating_add(metadata) > control.max_result_bytes
            || c.out.observations.len() + c.out.diagnostics.len() > control.max_items
        {
            #[cfg(test)]
            eprintln!(
                "AB_GUARD java.syntax.metadata bytes={} bytes_limit={} records={} items_limit={}",
                c.bytes.saturating_add(metadata),
                control.max_result_bytes,
                c.out.observations.len() + c.out.diagnostics.len(),
                control.max_items
            );
            return Err(AnalyzerError::ResourceLimit.into());
        }
        control.check()?;
        c.out.work_items = c.items;
        if sufficiency {
            let mut scopes = HashMap::new();
            let mut pending = vec![(root, 0)];
            while let Some((n, d)) = pending.pop() {
                c.tick(d)?;
                if [
                    "method_declaration",
                    "constructor_declaration",
                    "class_declaration",
                    "interface_declaration",
                    "record_declaration",
                    "enum_declaration",
                    "annotation_type_declaration",
                ]
                .contains(&n.kind())
                    && let Some(r) = c.owner(n)
                {
                    scopes.insert(n.id(), r);
                }
                for child in children(n) {
                    pending.push((child, d + 1));
                }
            }
            if let Some(r) = &c.module {
                scopes.insert(root.id(), r.clone());
            } else {
                return Err(JavaSyntaxError::InvalidOwnerMapping);
            }
            c.out.work_items = c.items;
            crate::binding_sufficiency::augment(
                root, p, file, source, control, &scopes, &mut c.out,
            )?;
        }
        Ok(c.out)
    }
}
fn children<'a>(n: Node<'a>) -> Vec<Node<'a>> {
    let mut c = n.walk();
    n.named_children(&mut c).collect()
}
fn unresolved(s: &str) -> Value {
    json!({"state":"UNRESOLVED","resolution":"UNRESOLVED","originalHint":s,"candidates":[]})
}
struct Collector<'a, 'b> {
    source: &'a [u8],
    binding: bool,
    sufficiency: bool,
    surface: bool,
    module: Option<Value>,
    file: &'a Value,
    control: &'a SyntaxWalkControl<'b>,
    symbols: &'a [SymbolFact],
    owners: HashMap<String, Value>,
    out: SyntaxFileObservation,
    items: usize,
    bytes: usize,
    partial: bool,
}
impl Collector<'_, '_> {
    fn tick(&mut self, depth: usize) -> Result<(), AnalyzerError> {
        self.control.check()?;
        self.items = self.items.saturating_add(1);
        if depth > self.control.max_depth || self.items > self.control.max_items {
            #[cfg(test)]
            eprintln!(
                "AB_GUARD java.syntax.tick depth={} depth_limit={} items={} items_limit={}",
                depth, self.control.max_depth, self.items, self.control.max_items
            );
            Err(AnalyzerError::ResourceLimit)
        } else {
            Ok(())
        }
    }
    fn text(&self, n: Node<'_>) -> &str {
        std::str::from_utf8(&self.source[n.byte_range()]).unwrap_or("")
    }
    fn range(&self, n: Node<'_>) -> Value {
        let a = n.start_position();
        let b = n.end_position();
        json!({"sourceFileId":self.file["id"],"startLine":a.row,"startColumn":a.column,"endLine":b.row,"endColumn":b.column})
    }
    fn owner(&self, mut n: Node<'_>) -> Option<Value> {
        loop {
            if self.sufficiency && n.kind() == "program" {
                return self.module.clone();
            }
            if [
                "method_declaration",
                "constructor_declaration",
                "class_declaration",
                "interface_declaration",
                "record_declaration",
                "enum_declaration",
                "annotation_type_declaration",
                "variable_declarator",
            ]
            .contains(&n.kind())
                && let Some(name) = n.child_by_field_name("name")
            {
                let a = name.start_position();
                let b = name.end_position();
                let fact = self.symbols.iter().find(|s| {
                    s.span.start_line == a.row
                        && s.span.start_column == a.column
                        && s.span.end_line == b.row
                        && s.span.end_column == b.column
                });
                if let Some(f) = fact {
                    return self.owners.get(&f.provider_fact_id).cloned();
                }
                if (self.binding && !self.sufficiency) || n.kind() != "variable_declarator" {
                    return None;
                }
            }
            n = n.parent()?;
        }
    }
    fn lexical_scope(&mut self, n: Node<'_>) -> Result<Option<Value>, AnalyzerError> {
        let mut cursor = n.parent();
        let mut depth = 0;
        while let Some(parent) = cursor {
            self.tick(depth)?;
            depth += 1;
            if ["lambda_expression", "object_creation_expression"].contains(&parent.kind()) {
                self.partial = true;
                return Ok(None);
            }
            if [
                "method_declaration",
                "constructor_declaration",
                "class_declaration",
                "interface_declaration",
                "record_declaration",
                "enum_declaration",
                "annotation_type_declaration",
            ]
            .contains(&parent.kind())
            {
                let scope = self.owner(parent);
                if scope.is_none() {
                    self.partial = true;
                }
                return Ok(scope);
            }
            cursor = parent.parent();
        }
        if self.sufficiency {
            return Ok(self.module.clone());
        }
        self.partial = true;
        Ok(None)
    }
    fn emit(&mut self, n: Node<'_>, kind: &str, mut payload: Value) -> Result<(), AnalyzerError> {
        let mut h = Sha256::new();
        let domain = if self.binding {
            "java-syntax-v2"
        } else {
            "java-syntax-v1"
        };
        h.update(domain.as_bytes());
        h.update(b"\0");
        for value in [
            self.file["path"].as_str().unwrap().to_owned(),
            kind.to_owned(),
            n.start_byte().to_string(),
            n.end_byte().to_string(),
        ] {
            h.update(value.len().to_string().as_bytes());
            h.update(b":");
            h.update(value.as_bytes());
        }
        let owner = self.owner(n);
        if owner.is_none() {
            self.partial = true;
        }
        let scope = if self.binding && !self.surface {
            self.lexical_scope(n)?
        } else {
            None
        };
        if self.binding {
            self.tick(0)?;
            if kind == "ASSIGNMENT" {
                let value = n.child_by_field_name("value").or_else(|| {
                    if self.sufficiency {
                        n.child_by_field_name("right")
                    } else {
                        None
                    }
                });
                payload["assignmentForm"] = json!(if value.is_some() {
                    "DIRECT_VALUE"
                } else {
                    "OTHER"
                });
                payload["valueRange"] = value.map(|v| self.range(v)).unwrap_or(Value::Null);
            } else if kind == "DECLARATION" && payload.get("declarationForm").is_none() {
                payload["declarationForm"] = json!("CALLABLE");
                payload["declaredName"] =
                    json!(n.child_by_field_name("name").map(|v| self.text(v)));
            }
        }
        let mut v = json!({"providerSyntaxId":format!("{domain}:{:x}",h.finalize()),"sourceFileId":self.file["id"],"sourceFingerprint":self.file["contentFingerprint"],"sourceRange":self.range(n),"owner":owner,"syntaxKind":kind,"payload":payload});
        if self.binding {
            v["lexicalScope"] = json!(scope);
        }
        self.bytes = self.bytes.saturating_add(
            serde_json::to_vec(&v)
                .map_err(|_| AnalyzerError::ParserFailed)?
                .len(),
        );
        if self.bytes > self.control.max_result_bytes
            || self.out.observations.len() >= self.control.max_items
        {
            #[cfg(test)]
            eprintln!(
                "AB_GUARD java.syntax.emit bytes={} bytes_limit={} records={} items_limit={}",
                self.bytes,
                self.control.max_result_bytes,
                self.out.observations.len(),
                self.control.max_items
            );
            return Err(AnalyzerError::ResourceLimit);
        }
        self.out.observations.push(v);
        Ok(())
    }
    fn unknown(&mut self, reason: &str) -> Value {
        self.partial = true;
        json!({"kind":"UNKNOWN","reason":reason})
    }
    fn hint(&self, n: Node<'_>) -> Option<String> {
        if [
            "identifier",
            "type_identifier",
            "scoped_identifier",
            "scoped_type_identifier",
            "field_access",
            "this",
            "super",
        ]
        .contains(&n.kind())
        {
            let s = self.text(n);
            if !s.contains(['(', ')', '[', ']']) {
                return Some(s.to_owned());
            }
        }
        None
    }
    fn value(&mut self, n: Node<'_>, depth: usize) -> Result<Value, AnalyzerError> {
        self.tick(depth)?;
        let text = self.text(n).to_owned();
        Ok(match n.kind() {
            "string_literal" => match serde_json::from_str::<String>(&text) {
                Ok(s) => json!({"kind":"STRING","value":s}),
                Err(_) => self.unknown("UNSUPPORTED_STRING"),
            },
            "true" => json!({"kind":"BOOLEAN","value":true}),
            "false" => json!({"kind":"BOOLEAN","value":false}),
            "null_literal" => json!({"kind":"NULL"}),
            "decimal_integer_literal" | "decimal_floating_point_literal" => {
                let s = text.replace('_', "");
                let v = s
                    .trim_end_matches(['L', 'l', 'F', 'f', 'D', 'd'])
                    .parse::<f64>()
                    .ok()
                    .filter(|v| {
                        v.is_finite()
                            && !(*v == 0.0 && v.is_sign_negative())
                            && (n.kind() != "decimal_integer_literal"
                                || v.abs() <= 9_007_199_254_740_991.0)
                    });
                match v {
                    Some(v) => json!({"kind":"NUMBER","value":v}),
                    None => self.unknown("UNSUPPORTED_NUMBER"),
                }
            }
            "array_initializer" | "element_value_array_initializer" => {
                let mut values = vec![];
                for x in children(n) {
                    values.push(self.value(x, depth + 1)?);
                }
                json!({"kind":"ARRAY","items":values})
            }
            "method_invocation" if self.surface => json!({"kind":"UNKNOWN","reason":"CALL_RESULT"}),
            "object_creation_expression"
                if self.surface && crate::framework_surface::ordinary_constructor(n) =>
            {
                json!({"kind":"UNKNOWN","reason":"CONSTRUCTION_RESULT"})
            }
            "lambda_expression" | "method_reference"
                if self.surface && crate::framework_surface::bounded_callback(n, self.source) =>
            {
                json!({"kind":"UNKNOWN","reason":"CALLBACK_VALUE"})
            }
            "this" if self.surface => {
                json!({"kind":"REFERENCE","name":"this","target":unresolved("this")})
            }
            "identifier" | "field_access" | "scoped_identifier" => match self.hint(n) {
                Some(s) => json!({"kind":"REFERENCE","name":s,"target":unresolved(&s)}),
                None => self.unknown("DYNAMIC_REFERENCE"),
            },
            _ => self.unknown("DYNAMIC_EXPRESSION"),
        })
    }
    fn arguments(&mut self, n: Node<'_>) -> Result<Vec<Value>, AnalyzerError> {
        let mut values = vec![];
        for c in children(n) {
            let (name, value) = if c.kind() == "element_value_pair" {
                (
                    c.child_by_field_name("key")
                        .map(|n| self.text(n).to_owned()),
                    c.child_by_field_name("value")
                        .ok_or(AnalyzerError::ParserFailed)?,
                )
            } else {
                (None, c)
            };
            values.push(
                json!({"name":name,"value":self.value(value,0)?,"sourceRange":self.range(c)}),
            );
        }
        Ok(values)
    }
    fn walk(&mut self, n: Node<'_>, depth: usize) -> Result<(), AnalyzerError> {
        self.tick(depth)?;
        match n.kind() {
            "annotation" | "marker_annotation" => {
                let name = n
                    .child_by_field_name("name")
                    .ok_or(AnalyzerError::ParserFailed)?;
                let name = self.text(name).to_owned();
                let args = match n.child_by_field_name("arguments") {
                    Some(a) => self.arguments(a)?,
                    None => vec![],
                };
                self.emit(
                    n,
                    "DECORATION",
                    json!({"callee":{"name":name,"target":unresolved(&name)},"arguments":args}),
                )?;
            }
            "object_creation_expression"
                if self.surface && crate::framework_surface::ordinary_constructor(n) =>
            {
                let ty = n
                    .child_by_field_name("type")
                    .ok_or(AnalyzerError::ParserFailed)?;
                let nominal = if ty.kind() == "generic_type" {
                    children(ty)
                        .into_iter()
                        .find(|n| n.kind() != "type_arguments")
                        .unwrap_or(ty)
                } else {
                    ty
                };
                let name = self.text(nominal).to_owned();
                let args = self.arguments(
                    n.child_by_field_name("arguments")
                        .ok_or(AnalyzerError::ParserFailed)?,
                )?;
                self.emit(n,"INVOCATION",json!({"callee":{"name":name,"target":unresolved(&name)},"receiver":null,"arguments":args}))?;
            }
            "method_invocation" => {
                let method = n
                    .child_by_field_name("name")
                    .ok_or(AnalyzerError::ParserFailed)?;
                let receiver = n.child_by_field_name("object");
                let object = receiver.and_then(|n| self.hint(n));
                let name = match &object {
                    Some(o) => format!("{o}.{}", self.text(method)),
                    None => self.text(method).to_owned(),
                };
                let args = self.arguments(
                    n.child_by_field_name("arguments")
                        .ok_or(AnalyzerError::ParserFailed)?,
                )?;
                let value = match receiver {
                    Some(n) => self.value(n, 0)?,
                    None => Value::Null,
                };
                self.emit(n,"INVOCATION",json!({"callee":{"name":name,"target":unresolved(&name)},"receiver":value,"arguments":args}))?;
            }
            "method_declaration" | "constructor_declaration" => {
                let mut names = vec![];
                if let Some(params) = n.child_by_field_name("parameters") {
                    for p in children(params) {
                        if let Some(name) = p.child_by_field_name("name") {
                            names.push(self.text(name).to_owned());
                        } else {
                            self.partial = true;
                        }
                    }
                }
                let declared = n
                    .child_by_field_name("type")
                    .map(|n| self.text(n).to_owned());
                let mut modifiers = vec![];
                if let Some(m) = children(n).into_iter().find(|n| n.kind() == "modifiers") {
                    let mut cursor = m.walk();
                    for k in m.children(&mut cursor) {
                        if [
                            "public",
                            "private",
                            "protected",
                            "static",
                            "final",
                            "abstract",
                            "synchronized",
                            "native",
                            "strictfp",
                            "default",
                        ]
                        .contains(&k.kind())
                        {
                            modifiers.push(k.kind().to_owned());
                        }
                    }
                }
                self.emit(
                    n,
                    "DECLARATION",
                    json!({"declaredType":declared,"parameterNames":names,"modifiers":modifiers}),
                )?;
            }
            "assignment_expression"
                if self.sufficiency
                    && n.child_by_field_name("operator")
                        .is_some_and(|op| self.text(op) == "=") =>
            {
                if let (Some(left), Some(right)) = (
                    n.child_by_field_name("left"),
                    n.child_by_field_name("right"),
                ) {
                    if left.kind() == "identifier"
                        || (self.surface
                            && left.kind() == "field_access"
                            && left
                                .child_by_field_name("object")
                                .is_some_and(|o| o.kind() == "this")
                            && left
                                .child_by_field_name("field")
                                .is_some_and(|f| f.kind() == "identifier"))
                    {
                        let value = self.value(right, 0)?;
                        let name = self.text(left).to_owned();
                        self.emit(n, "ASSIGNMENT", json!({"targetName":name,"value":value}))?;
                    } else {
                        self.partial = true;
                    }
                } else {
                    self.partial = true;
                }
            }
            "variable_declarator" => {
                if self.binding {
                    self.tick(depth)?;
                    if let (Some(name), Some(parent)) = (n.child_by_field_name("name"), n.parent())
                        && ["field_declaration", "local_variable_declaration"]
                            .contains(&parent.kind())
                        && let Some(ty) = parent.child_by_field_name("type")
                    {
                        let declared = self.text(ty).to_owned();
                        if declared != "var" {
                            self.emit(n, "DECLARATION", json!({"declarationForm":"TYPED_BINDING","declaredName":self.text(name),"declaredType":declared,"parameterNames":[],"modifiers":[]}))?;
                        } else {
                            self.partial = true;
                        }
                    }
                }
                if let (Some(name), Some(value)) = (
                    n.child_by_field_name("name"),
                    n.child_by_field_name("value"),
                ) {
                    let v = self.value(value, 0)?;
                    self.emit(
                        n,
                        "ASSIGNMENT",
                        json!({"targetName":self.text(name),"value":v}),
                    )?;
                }
            }
            _ => {}
        }
        for child in children(n) {
            self.walk(child, depth + 1)?;
        }
        Ok(())
    }
}
