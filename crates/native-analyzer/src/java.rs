use std::collections::HashMap;

use sha2::{Digest, Sha256};
use tree_sitter::{Node, Parser};

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
}

impl LanguageAnalyzer for JavaAnalyzer {
    fn analyze(
        &mut self,
        relative_path: &str,
        source: &[u8],
    ) -> Result<LanguageAnalysis, AnalyzerError> {
        let tree = self
            .parser
            .parse(source, None)
            .ok_or(AnalyzerError::ParserFailed)?;
        let root = tree.root_node();
        let mut collector = SymbolCollector::new(relative_path, source);
        collector.collect(root);
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
}

impl<'a> SymbolCollector<'a> {
    fn new(relative_path: &'a str, source: &'a [u8]) -> Self {
        Self {
            relative_path,
            source,
            owners: Vec::new(),
            ordinals: HashMap::new(),
            symbols: Vec::new(),
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
                self.push("java.package", &name, "", name_node);
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
                    self.push(kind, &name, "", name_node);
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
                    self.push(kind, &name, &signature, name_node);
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
                        self.push("java.field", &name, "", name_node);
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
            if let Some(type_node) = parameter.child_by_field_name("type")
                && let Some(type_name) = self.text(type_node)
            {
                types.push(type_name.trim().to_owned());
            }
        }
        format!("({})", types.join(","))
    }

    fn text(&self, node: Node<'_>) -> Option<&str> {
        std::str::from_utf8(self.source.get(node.byte_range())?).ok()
    }

    fn push(&mut self, kind: &str, name: &str, signature: &str, name_node: Node<'_>) {
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
            span: span(name_node),
        });
    }
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
