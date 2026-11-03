//! Bounded literal-input syntax extraction. Caller must authenticate/read Source bytes.
use crate::{language::AnalyzerError, syntax::SyntaxRequest};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap},
    ops::ControlFlow,
};
use tree_sitter::{Node, ParseOptions, Parser};

pub use crate::syntax::{SyntaxFileObservation as PythonSyntaxObservation, SyntaxWalkControl};
pub struct PythonSyntaxAnalyzer {
    parser: Parser,
}
impl PythonSyntaxAnalyzer {
    pub fn new() -> Result<Self, AnalyzerError> {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_python::LANGUAGE.into())
            .map_err(|_| AnalyzerError::GrammarUnavailable)?;
        Ok(Self { parser })
    }
    pub fn observe(
        &mut self,
        request: &SyntaxRequest,
        file_index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<PythonSyntaxObservation, AnalyzerError> {
        self.observe_payload(
            &request.header()["payload"],
            file_index,
            source,
            control,
            false,
            false,
            false,
        )
        .map(|r| r.syntax)
    }
    pub(crate) fn observe_code_syntax(
        &mut self,
        p: &Value,
        file_index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<crate::code_syntax::CodeSyntaxFileObservation, AnalyzerError> {
        self.observe_payload(p, file_index, source, control, true, false, false)
    }
    pub(crate) fn observe_binding_syntax(
        &mut self,
        p: &Value,
        file_index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<crate::code_syntax::CodeSyntaxFileObservation, AnalyzerError> {
        self.observe_payload(p, file_index, source, control, true, true, false)
    }
    pub(crate) fn observe_binding_sufficiency(
        &mut self,
        p: &Value,
        index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
    ) -> Result<crate::code_syntax::CodeSyntaxFileObservation, AnalyzerError> {
        self.observe_payload(p, index, source, control, true, true, true)
    }
    fn observe_payload(
        &mut self,
        p: &Value,
        file_index: usize,
        source: &[u8],
        control: &SyntaxWalkControl<'_>,
        code: bool,
        binding: bool,
        sufficiency: bool,
    ) -> Result<crate::code_syntax::CodeSyntaxFileObservation, AnalyzerError> {
        control.check()?;
        if source.len() > control.max_source_bytes
            || control.max_depth == 0
            || control.max_items == 0
            || control.max_result_bytes == 0
        {
            return Err(AnalyzerError::ResourceLimit);
        }
        if !p["languages"].as_array().is_some_and(|languages| {
            languages.iter().any(|l| {
                l["languageId"] == "python"
                    && l["grammarVersion"] == "0.25.0"
                    && l["analyzerVersion"] == env!("CARGO_PKG_VERSION")
            })
        }) {
            return Err(AnalyzerError::GrammarUnavailable);
        }
        let file = p["sourceFiles"]
            .get(file_index)
            .ok_or(AnalyzerError::ParserFailed)?;
        if file["languageHint"] != "python" {
            return Err(AnalyzerError::ParserFailed);
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
        let module = id("python-module-v1", &[file["path"].as_str().unwrap().into()]);
        let mut c = Collector {
            p,
            binding,
            file,
            source,
            control,
            module,
            ids: HashMap::new(),
            out: PythonSyntaxObservation {
                work_items: 0,
                nodes: vec![],
                edges: vec![],
                observations: vec![],
                coverage: Value::Null,
                diagnostics: vec![],
            },
            items: 0,
            result_bytes: 0,
            partial: root.has_error(),
            code: code.then(|| CodeStats::new(root.has_error())),
        };
        let path = file["path"].as_str().unwrap();
        let node = c.provider_node(&c.module.clone(), "python.module", path, path, root);
        c.emit(0, node)?;
        c.code_unit(0, true, "")?;
        c.declare(root, &mut vec![], 0)?;
        c.walk(root, 0)?;
        control.check()?;
        let status = if c.partial { "PARTIAL" } else { "COMPLETE" };
        c.out.coverage = json!({"sourceFileId":file["id"],"sourceFingerprint":file["contentFingerprint"],"status":status,"limitations":if c.partial{vec!["UNRESOLVED_OR_UNSUPPORTED_SYNTAX"]}else{vec![]}});
        if root.has_error() {
            c.emit(3,json!({"code":"SYNTAX_ERROR","severity":"WARNING","message":"Python source contains syntax errors","sourceRange":c.range(root)}))?;
        }
        let code_coverage = if c.code.is_some() {
            for _ in 0..4 {
                c.tick(0)?;
            }
            c.code.as_ref().unwrap().finish(file)
        } else {
            vec![]
        };
        let code_bytes = if code {
            serde_json::to_vec(&code_coverage)
                .map_err(|_| AnalyzerError::ParserFailed)?
                .len()
        } else {
            0
        };
        let metadata = serde_json::to_vec(&c.out.coverage)
            .map_err(|_| AnalyzerError::ParserFailed)?
            .len();
        if c.result_bytes
            .saturating_add(metadata)
            .saturating_add(code_bytes)
            > control.max_result_bytes
        {
            return Err(AnalyzerError::ResourceLimit);
        }
        c.out.work_items = c.items;
        if sufficiency {
            let mut scopes: HashMap<usize, Value> =
                c.ids.iter().map(|(n, id)| (*n, c.reference(id))).collect();
            scopes.insert(root.id(), c.reference(&c.module));
            crate::binding_sufficiency::augment(
                root, p, file, source, control, &scopes, &mut c.out,
            )?;
        }
        Ok(crate::code_syntax::CodeSyntaxFileObservation {
            syntax: c.out,
            code_coverage,
        })
    }
}
fn children<'t>(n: Node<'t>) -> Vec<Node<'t>> {
    let mut cursor = n.walk();
    n.named_children(&mut cursor).collect()
}
fn id(domain: &str, parts: &[String]) -> String {
    let mut h = Sha256::new();
    h.update(domain.as_bytes());
    h.update(b"\0");
    for p in parts {
        h.update(p.len().to_string().as_bytes());
        h.update(b":");
        h.update(p.as_bytes());
    }
    format!("{domain}:{:x}", h.finalize())
}
fn unresolved(name: &str) -> Value {
    json!({"state":"UNRESOLVED","resolution":"UNRESOLVED","originalHint":name,"candidates":[]})
}
#[derive(Default)]
struct CodeStats {
    units: [[usize; 3]; 4],
    limits: [BTreeSet<&'static str>; 4],
}
impl CodeStats {
    fn new(has_error: bool) -> Self {
        let mut s = Self::default();
        if has_error {
            for facet in 1..4 {
                s.limits[facet].insert("SYNTAX_ERROR");
            }
        }
        s
    }
    fn finish(&self, file: &Value) -> Vec<Value> {
        ["MODULE","FUNCTION","IMPORT","REFERENCE"].iter().enumerate().map(|(i,facet)|{let u=self.units[i];let limits:Vec<_>=self.limits[i].iter().copied().collect();json!({"sourceFileId":file["id"],"sourceFingerprint":file["contentFingerprint"],"codeContract":"PYTHON_SYNTAX_CODE_V1","facet":facet,"status":if limits.is_empty(){"COMPLETE"}else{"PARTIAL"},"limitations":limits,"statistics":{"eligibleSites":u[0],"coveredSites":u[1],"unsupportedSites":u[2],"partialSites":0,"resolutionCounts":{"EXACT":0,"HEURISTIC":0,"AMBIGUOUS":0,"UNRESOLVED":if i>=2{u[1]}else{0},"UNSUPPORTED":0}}})}).collect()
    }
}
struct Collector<'a, 'b> {
    p: &'a Value,
    binding: bool,
    file: &'a Value,
    source: &'a [u8],
    control: &'a SyntaxWalkControl<'b>,
    module: String,
    ids: HashMap<usize, String>,
    out: PythonSyntaxObservation,
    items: usize,
    result_bytes: usize,
    partial: bool,
    code: Option<CodeStats>,
}
impl Collector<'_, '_> {
    fn code_unit(
        &mut self,
        facet: usize,
        covered: bool,
        reason: &'static str,
    ) -> Result<(), AnalyzerError> {
        if self.code.is_some() {
            self.tick(0)?;
            let c = self.code.as_mut().unwrap();
            c.units[facet][0] += 1;
            c.units[facet][if covered { 1 } else { 2 }] += 1;
            if !covered {
                c.limits[facet].insert(reason);
            }
        }
        Ok(())
    }
    fn code_limit(&mut self, facet: usize, reason: &'static str) -> Result<(), AnalyzerError> {
        if self.code.is_some() {
            self.tick(0)?;
            self.code.as_mut().unwrap().limits[facet].insert(reason);
        }
        Ok(())
    }

    fn tick(&mut self, depth: usize) -> Result<(), AnalyzerError> {
        self.control.check()?;
        self.items = self.items.saturating_add(1);
        if depth > self.control.max_depth || self.items > self.control.max_items {
            Err(AnalyzerError::ResourceLimit)
        } else {
            Ok(())
        }
    }
    fn emit(&mut self, slot: u8, value: Value) -> Result<(), AnalyzerError> {
        self.control.check()?;
        self.result_bytes = self.result_bytes.saturating_add(
            serde_json::to_vec(&value)
                .map_err(|_| AnalyzerError::ParserFailed)?
                .len(),
        );
        let count = self.out.nodes.len()
            + self.out.edges.len()
            + self.out.observations.len()
            + self.out.diagnostics.len();
        if count >= self.control.max_items || self.result_bytes > self.control.max_result_bytes {
            return Err(AnalyzerError::ResourceLimit);
        }
        match slot {
            0 => self.out.nodes.push(value),
            1 => self.out.edges.push(value),
            2 => self.out.observations.push(value),
            _ => self.out.diagnostics.push(value),
        }
        Ok(())
    }
    fn text(&self, n: Node<'_>) -> &str {
        std::str::from_utf8(&self.source[n.byte_range()]).unwrap_or("")
    }
    fn range(&self, n: Node<'_>) -> Value {
        let a = n.start_position();
        let b = n.end_position();
        json!({"sourceFileId":self.file["id"],"startLine":a.row,"startColumn":a.column,"endLine":b.row,"endColumn":b.column})
    }
    fn reference(&self, id: &str) -> Value {
        json!({"factType":"NODE","providerId":self.p["providerId"],"providerFactId":id})
    }
    fn provider_node(
        &self,
        id: &str,
        kind: &str,
        name: &str,
        qualified: &str,
        n: Node<'_>,
    ) -> Value {
        json!({"providerId":self.p["providerId"],"providerFactId":id,"providerSnapshotId":self.p["providerSnapshotId"],"repositoryId":self.p["targetSource"]["repositoryId"],"revisionId":self.p["targetSource"]["revisionId"],"providerKind":kind,"name":name,"qualifiedName":qualified,"sourceRange":self.range(n),"confidence":{"score":1,"method":"parser","reasons":[]}})
    }
    fn declare(
        &mut self,
        n: Node<'_>,
        scopes: &mut Vec<String>,
        depth: usize,
    ) -> Result<(), AnalyzerError> {
        self.tick(depth)?;
        let declaration = n.kind() == "function_definition" || n.kind() == "class_definition";
        if declaration {
            let name_node = n
                .child_by_field_name("name")
                .ok_or(AnalyzerError::ParserFailed)?;
            let name = self.text(name_node).to_owned();
            scopes.push(name.clone());
            if n.kind() == "function_definition" {
                let q = format!(
                    "{}::{}",
                    self.file["path"].as_str().unwrap(),
                    scopes.join(".")
                );
                let provider = id(
                    "python-symbol-v1",
                    &[
                        q.clone(),
                        name_node.start_byte().to_string(),
                        name_node.end_byte().to_string(),
                    ],
                );
                self.ids.insert(n.id(), provider.clone());
                self.emit(
                    0,
                    self.provider_node(&provider, "python.symbol", &name, &q, name_node),
                )?;
                self.code_unit(1, true, "")?;
            } else {
                self.partial = true;
                self.code_limit(1, "UNSUPPORTED_CLASS_SCOPE")?;
            }
        }
        for child in children(n) {
            self.declare(child, scopes, depth + 1)?;
        }
        if declaration {
            scopes.pop();
        }
        Ok(())
    }
    fn owner(&self, mut n: Node<'_>) -> Option<String> {
        loop {
            if n.kind() == "decorator" {
                let definition = n.parent()?.child_by_field_name("definition")?;
                return self.ids.get(&definition.id()).cloned();
            }
            if n.kind() == "class_definition" {
                return None;
            }
            if let Some(id) = self.ids.get(&n.id()) {
                return Some(id.clone());
            }
            match n.parent() {
                Some(parent) => n = parent,
                None => return Some(self.module.clone()),
            }
        }
    }
    fn lexical_scope(&mut self, n: Node<'_>) -> Result<Option<String>, AnalyzerError> {
        let mut child = n;
        let mut cursor = n.parent();
        let mut depth = 0;
        while let Some(parent) = cursor {
            self.tick(depth)?;
            depth += 1;
            match parent.kind() {
                "class_definition"
                | "lambda"
                | "list_comprehension"
                | "set_comprehension"
                | "dictionary_comprehension"
                | "generator_expression" => {
                    self.partial = true;
                    return Ok(None);
                }
                "function_definition" => {
                    if parent
                        .child_by_field_name("body")
                        .is_some_and(|body| body.id() == child.id())
                    {
                        let scope = self.ids.get(&parent.id()).cloned();
                        if scope.is_none() {
                            self.partial = true;
                        }
                        return Ok(scope);
                    }
                    // Ordinary default expressions evaluate outside the new function.
                    if child.kind() != "parameters" {
                        self.partial = true;
                        return Ok(None);
                    }
                }
                "type" | "type_parameter" | "type_parameter_list" => {
                    self.partial = true;
                    return Ok(None);
                }
                _ => {}
            }
            child = parent;
            cursor = parent.parent();
        }
        Ok(Some(self.module.clone()))
    }
    fn hint(&self, n: Node<'_>) -> Option<String> {
        match n.kind() {
            "identifier" | "dotted_name" => Some(self.text(n).to_owned()),
            "attribute" => {
                let object = self.hint(n.child_by_field_name("object")?)?;
                let field = n.child_by_field_name("attribute")?;
                Some(format!("{object}.{}", self.text(field)))
            }
            _ => None,
        }
    }
    fn observation(
        &mut self,
        n: Node<'_>,
        kind: &str,
        mut payload: Value,
    ) -> Result<(), AnalyzerError> {
        let provider = id(
            if self.binding {
                "python-syntax-v2"
            } else {
                "python-syntax-v1"
            },
            &[
                self.file["path"].as_str().unwrap().into(),
                kind.into(),
                n.start_byte().to_string(),
                n.end_byte().to_string(),
            ],
        );
        let owner = self.owner(n).map(|id| self.reference(&id));
        let scope = if self.binding && self.p["syntaxContract"] != "SYNTAX_BINDING_V4" {
            self.lexical_scope(n)?.map(|id| self.reference(&id))
        } else {
            None
        };
        if self.binding {
            self.tick(0)?;
            if kind == "ASSIGNMENT" {
                let direct = n.kind() == "assignment"
                    && n.parent().is_none_or(|p| p.kind() != "assignment")
                    && n.child_by_field_name("type").is_none()
                    && n.child_by_field_name("right")
                        .is_some_and(|r| r.kind() != "assignment");
                payload["assignmentForm"] = json!(if direct {
                    "DIRECT_VALUE"
                } else if n.kind() == "aliased_import" || n.kind() == "dotted_name" {
                    "IMPORT_ALIAS"
                } else {
                    "OTHER"
                });
                payload["valueRange"] = if direct {
                    self.range(n.child_by_field_name("right").unwrap())
                } else {
                    Value::Null
                };
            } else if kind == "DECLARATION" {
                payload["declarationForm"] = json!("CALLABLE");
                payload["declaredName"] =
                    json!(n.child_by_field_name("name").map(|name| self.text(name)));
            }
        }
        let mut value = json!({"providerSyntaxId":provider,"sourceFileId":self.file["id"],"sourceFingerprint":self.file["contentFingerprint"],"sourceRange":self.range(n),"owner":owner,"syntaxKind":kind,"payload":payload});
        if self.binding {
            value["lexicalScope"] = json!(scope);
        }
        self.emit(2, value)
    }
    fn edge(&mut self, n: Node<'_>, kind: &str, hint: &str) -> Result<(), AnalyzerError> {
        let facet = if kind == "python.import" { 2 } else { 3 };
        let Some(owner) = self.owner(n) else {
            self.code_unit(facet, false, "UNSUPPORTED_OWNER")?;
            self.partial = true;
            return Ok(());
        };
        let provider = id(
            "python-edge-v1",
            &[
                kind.into(),
                self.file["path"].as_str().unwrap().into(),
                n.start_byte().to_string(),
                n.end_byte().to_string(),
                hint.into(),
            ],
        );
        self.emit(1,json!({"providerId":self.p["providerId"],"providerFactId":provider,"providerSnapshotId":self.p["providerSnapshotId"],"repositoryId":self.p["targetSource"]["repositoryId"],"revisionId":self.p["targetSource"]["revisionId"],"providerKind":kind,"source":self.reference(&owner),"target":unresolved(hint),"sourceRange":self.range(n),"confidence":{"score":1,"method":"parser","reasons":[]}}))?;
        self.code_unit(facet, true, "")
    }
    fn unknown(&mut self, reason: &str) -> Value {
        // A fully observed v6 call may still have an unknown return value.
        if !self.binding || reason != "CALL_RESULT" {
            self.partial = true;
        }
        json!({"kind":"UNKNOWN","reason":reason})
    }
    fn value(&mut self, n: Node<'_>, depth: usize) -> Result<Value, AnalyzerError> {
        self.tick(depth)?;
        let text = self.text(n).to_owned();
        Ok(match n.kind() {
            "string" => {
                let quote = text.find(['\'', '"']);
                if let Some(i) = quote {
                    let prefix = &text[..i];
                    let q = text.as_bytes()[i] as char;
                    let triple = text[i..].starts_with(&q.to_string().repeat(3));
                    let width = if triple { 3 } else { 1 };
                    if (prefix.is_empty() || prefix.eq_ignore_ascii_case("u"))
                        && text.len() >= i + width * 2
                        && !text[i + width..text.len() - width].contains('\\')
                    {
                        json!({"kind":"STRING","value":&text[i+width..text.len()-width]})
                    } else {
                        self.unknown("DYNAMIC_OR_ESCAPED_STRING")
                    }
                } else {
                    self.unknown("UNSUPPORTED_STRING")
                }
            }
            "integer" | "float" => {
                let cleaned = text.replace('_', "");
                let number = cleaned.parse::<f64>().ok().filter(|v| {
                    v.is_finite()
                        && !(*v == 0.0 && v.is_sign_negative())
                        && (n.kind() != "integer" || v.abs() <= 9_007_199_254_740_991.0)
                });
                match number {
                    Some(v) => json!({"kind":"NUMBER","value":v}),
                    None => self.unknown("UNSUPPORTED_NUMBER"),
                }
            }
            "true" => json!({"kind":"BOOLEAN","value":true}),
            "false" => json!({"kind":"BOOLEAN","value":false}),
            "none" => json!({"kind":"NULL"}),
            "list" | "tuple" => {
                let mut values = vec![];
                for child in children(n) {
                    values.push(self.value(child, depth + 1)?);
                }
                json!({"kind":"ARRAY","items":values})
            }
            "dictionary" => {
                let edge_start = self.out.edges.len();
                let before = self.code.as_ref().map(|c| c.units[3]);
                let mut entries = vec![];
                let mut valid = true;
                for pair in children(n) {
                    if pair.kind() != "pair" {
                        valid = false;
                        break;
                    }
                    let Some(key) = pair.child_by_field_name("key") else {
                        valid = false;
                        break;
                    };
                    let Some(value) = pair.child_by_field_name("value") else {
                        valid = false;
                        break;
                    };
                    let k = self.value(key, depth + 1)?;
                    if let Some(s) = k.get("value").and_then(Value::as_str) {
                        if s.is_empty()
                            || s.trim_matches(crate::syntax::trim) != s
                            || entries.iter().any(|e: &Value| e["name"] == s)
                        {
                            valid = false;
                            break;
                        }
                        entries.push(json!({"name":s,"value":self.value(value,depth+1)?}));
                    } else {
                        valid = false;
                        break;
                    }
                }
                if valid {
                    json!({"kind":"OBJECT","entries":entries})
                } else {
                    if let Some(before) = before {
                        self.tick(0)?;
                        let c = self.code.as_mut().unwrap();
                        let delta = c.units[3][0] - before[0];
                        c.units[3][1] = before[1];
                        c.units[3][2] = before[2] + delta;
                        if delta > 0 {
                            c.limits[3].insert("UNSUPPORTED_VALUE_REFERENCE");
                        }
                        self.out.edges.truncate(edge_start);
                    }
                    self.unknown("UNSUPPORTED_DICTIONARY")
                }
            }
            "identifier" | "attribute" => {
                if let Some(name) = self.hint(n) {
                    self.edge(n, "python.reference", &name)?;
                    json!({"kind":"REFERENCE","name":name,"target":unresolved(&name)})
                } else {
                    self.unknown("DYNAMIC_REFERENCE")
                }
            }
            "call" => self.unknown("CALL_RESULT"),
            _ => self.unknown("DYNAMIC_EXPRESSION"),
        })
    }
    fn call(&mut self, n: Node<'_>) -> Result<Value, AnalyzerError> {
        let function = n
            .child_by_field_name("function")
            .ok_or(AnalyzerError::ParserFailed)?;
        let name = self.hint(function).unwrap_or_else(|| {
            self.partial = true;
            "<dynamic>".into()
        });
        let mut args = vec![];
        let arguments = n
            .child_by_field_name("arguments")
            .ok_or(AnalyzerError::ParserFailed)?;
        for child in children(arguments) {
            let (name, value) = if child.kind() == "keyword_argument" {
                (
                    child
                        .child_by_field_name("name")
                        .map(|n| self.text(n).to_owned()),
                    child
                        .child_by_field_name("value")
                        .ok_or(AnalyzerError::ParserFailed)?,
                )
            } else {
                (None, child)
            };
            args.push(
                json!({"name":name,"value":self.value(value,0)?,"sourceRange":self.range(child)}),
            );
        }
        Ok(json!({"callee":{"name":name,"target":unresolved(&name)},"arguments":args}))
    }
    fn walk(&mut self, n: Node<'_>, depth: usize) -> Result<(), AnalyzerError> {
        self.tick(depth)?;
        match n.kind() {
            "decorator" => {
                if let Some(child) = children(n).first().copied() {
                    let payload = if child.kind() == "call" {
                        self.call(child)?
                    } else {
                        let name = self.hint(child).unwrap_or_else(|| "<dynamic>".into());
                        json!({"callee":{"name":name,"target":unresolved(&name)},"arguments":[]})
                    };
                    self.observation(n, "DECORATION", payload)?;
                }
            }
            "call" => {
                if n.parent().is_none_or(|p| p.kind() != "decorator") {
                    let mut payload = self.call(n)?;
                    payload["receiver"] = Value::Null;
                    self.observation(n, "INVOCATION", payload)?;
                }
            }
            "assignment" => {
                if let (Some(left), Some(right)) = (
                    n.child_by_field_name("left"),
                    n.child_by_field_name("right"),
                ) {
                    if left.kind() == "identifier" {
                        let value = self.value(right, 0)?;
                        self.observation(
                            n,
                            "ASSIGNMENT",
                            json!({"targetName":self.text(left),"value":value}),
                        )?;
                    } else {
                        self.partial = true;
                    }
                }
            }
            "function_definition" => {
                let mut names = vec![];
                if let Some(parameters) = n.child_by_field_name("parameters") {
                    for p in children(parameters) {
                        let name = if p.kind() == "identifier" {
                            Some(p)
                        } else {
                            p.child_by_field_name("name").or_else(|| {
                                children(p).into_iter().find(|n| n.kind() == "identifier")
                            })
                        };
                        if let Some(name) = name {
                            names.push(self.text(name).to_owned());
                        } else {
                            self.partial = true;
                        }
                    }
                }
                let mut cursor = n.walk();
                let modifiers: Vec<_> = n
                    .children(&mut cursor)
                    .filter(|n| n.kind() == "async")
                    .map(|_| "async")
                    .collect();
                self.observation(
                    n,
                    "DECLARATION",
                    json!({"declaredType":null,"parameterNames":names,"modifiers":modifiers}),
                )?;
            }
            "import_statement" | "import_from_statement" => {
                let module = n.child_by_field_name("module_name");
                for child in children(n) {
                    if child.kind() == "wildcard_import" && self.code.is_some() {
                        self.code_unit(2, false, "UNSUPPORTED_WILDCARD_IMPORT")?;
                        self.partial = true;
                    }
                    if module.is_some_and(|m| m.id() == child.id())
                        || !["dotted_name", "aliased_import"].contains(&child.kind())
                    {
                        continue;
                    }
                    let original = child.child_by_field_name("name").unwrap_or(child);
                    let name = self.text(original).to_owned();
                    let hint = module
                        .map(|m| format!("{}.{}", self.text(m), name))
                        .unwrap_or(name.clone());
                    self.edge(child, "python.import", &hint)?;
                    let alias = child
                        .child_by_field_name("alias")
                        .map(|a| self.text(a).to_owned())
                        .unwrap_or(name);
                    self.observation(child,"ASSIGNMENT",json!({"targetName":alias,"value":{"kind":"REFERENCE","name":hint,"target":unresolved(&hint)}}))?;
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

#[cfg(test)]
mod code_syntax_tests;
