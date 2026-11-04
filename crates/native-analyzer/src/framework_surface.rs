//! Private wire8 library boundary. Not CLI dispatch or production qualification.
use crate::{
    code_syntax::{CodeSyntaxMode, CodeSyntaxRequest, decode_code_syntax_request_mode},
    syntax::{SyntaxRequestError, SyntaxWalkControl},
};
use std::io::{self, Write};
pub struct FrameworkSurfaceRequest(CodeSyntaxRequest);
impl FrameworkSurfaceRequest {
    pub fn header(&self) -> &serde_json::Value {
        self.0.header()
    }
    pub fn request_checksum(&self) -> &str {
        self.0.request_checksum()
    }
}
pub fn decode_framework_surface_request(
    bytes: &[u8],
) -> Result<FrameworkSurfaceRequest, SyntaxRequestError> {
    decode_code_syntax_request_mode(bytes, CodeSyntaxMode::FrameworkSurfaceV4)
        .map(FrameworkSurfaceRequest)
}
pub fn write_framework_surface_observation(
    request: &FrameworkSurfaceRequest,
    control: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    crate::code_syntax_producer::write_code_syntax_observation_mode(
        &request.0,
        control,
        output,
        CodeSyntaxMode::FrameworkSurfaceV4,
    )
}
use crate::binding_sufficiency::{scope, tick_binding};
use crate::language::AnalyzerError;
use serde_json::{Value, json};
use std::{cell::Cell, collections::HashMap};
use tree_sitter::Node;
fn text<'a>(n: Node<'_>, source: &'a [u8]) -> &'a str {
    std::str::from_utf8(&source[n.byte_range()]).unwrap_or("")
}
fn range(n: Node<'_>, file: &Value) -> Value {
    let a = n.start_position();
    let b = n.end_position();
    json!({"sourceFileId":file["id"],"startLine":a.row,"startColumn":a.column,"endLine":b.row,"endColumn":b.column})
}
fn site(n: Node<'_>, file: &Value) -> Value {
    json!({"syntaxKind":"INVOCATION","sourceRange":range(n,file)})
}
pub(crate) fn ordinary_constructor(n: Node<'_>) -> bool {
    if n.kind() != "object_creation_expression"
        || n.child_by_field_name("type").is_none()
        || n.child_by_field_name("arguments").is_none()
    {
        return false;
    }
    let mut c = n.walk();
    n.named_children(&mut c).all(|x| {
        matches!(
            x.kind(),
            "type_identifier"
                | "scoped_type_identifier"
                | "generic_type"
                | "annotated_type"
                | "argument_list"
                | "type_arguments"
        )
    })
}
fn parameter_name(n: Node<'_>) -> Option<Node<'_>> {
    match n.kind() {
        "identifier" => Some(n),
        "formal_parameter" | "default_parameter" | "typed_default_parameter" => {
            n.child_by_field_name("name")
        }
        "typed_parameter" => n.named_child(0).filter(|x| x.kind() == "identifier"),
        _ => None,
    }
}
fn lambda_parameter(n: Node<'_>) -> Option<Node<'_>> {
    let params = n.child_by_field_name("parameters")?;
    if params.kind() == "identifier" {
        return Some(params);
    }
    if params.named_child_count() != 1 {
        return None;
    }
    parameter_name(params.named_child(0)?)
}
/// Bounded syntax shape only. Framework and handler binding remain in Plugins.
pub(crate) fn bounded_callback(n: Node<'_>, source: &[u8]) -> bool {
    if !n.parent().is_some_and(|p| {
        p.kind() == "argument_list" && p.parent().is_some_and(|c| c.kind() == "method_invocation")
    }) {
        return false;
    }
    match n.kind() {
        "lambda_expression" => {
            let (Some(param), Some(body)) = (lambda_parameter(n), n.child_by_field_name("body"))
            else {
                return false;
            };
            if body.kind() != "method_invocation" || body.child_by_field_name("name").is_none() {
                return false;
            }
            if body
                .child_by_field_name("object")
                .is_some_and(|o| o.kind() != "this")
            {
                return false;
            }
            let Some(args) = body.child_by_field_name("arguments") else {
                return false;
            };
            args.named_child_count() == 1
                && args.named_child(0).is_some_and(|v| {
                    v.kind() == "identifier" && text(v, source) == text(param, source)
                })
        }
        "method_reference" => {
            n.named_child_count() == 2
                && n.named_child(0).is_some_and(|v| v.kind() == "this")
                && n.named_child(1).is_some_and(|v| v.kind() == "identifier")
        }
        _ => false,
    }
}
pub(crate) fn rekey(v: &mut Value, n: Node<'_>, file: &Value) {
    use sha2::{Digest, Sha256};
    let domain = if file["languageHint"] == "java" {
        "java-syntax-v4"
    } else {
        "python-syntax-v4"
    };
    let mut hash = Sha256::new();
    hash.update(domain);
    hash.update(b"\0");
    let meaning = json!({"owner":v["owner"],"lexicalScope":v["lexicalScope"],"callbackScope":v["callbackScope"],"controlContext":v["controlContext"],"payload":v["payload"]});
    for field in [
        file["path"].as_str().unwrap().to_owned(),
        v["syntaxKind"].as_str().unwrap().to_owned(),
        n.start_byte().to_string(),
        n.end_byte().to_string(),
        crate::binding_sufficiency::canonical(&meaning),
    ] {
        hash.update(field.len().to_string());
        hash.update(b":");
        hash.update(field);
    }
    v["providerSyntaxId"] = json!(format!("{domain}:{:x}", hash.finalize()));
}
pub(crate) fn common(
    v: &mut Value,
    n: Node<'_>,
    file: &Value,
    source: &[u8],
    c: &SyntaxWalkControl<'_>,
    items: &Cell<usize>,
    scopes: &HashMap<usize, Value>,
) -> Result<(), AnalyzerError> {
    tick_binding(c, items)?;
    v["callbackScope"] = Value::Null;
    if v["syntaxKind"] == "INVOCATION" {
        let callee = n
            .child_by_field_name(if n.kind() == "call" {
                "function"
            } else if n.kind() == "object_creation_expression" {
                "type"
            } else {
                "name"
            })
            .ok_or(AnalyzerError::ParserFailed)?;
        v["payload"]["calleeRange"] = range(callee, file);
        v["payload"]["invocationForm"] = json!(if n.kind() == "object_creation_expression" {
            "CONSTRUCT"
        } else {
            "CALL"
        });
        if let Some(parent) = n
            .parent()
            .filter(|p| p.kind() == "lambda_expression" && bounded_callback(*p, source))
        {
            let consumer = parent
                .parent()
                .and_then(|a| a.parent())
                .ok_or(AnalyzerError::ParserFailed)?;
            let outer = scope(consumer, scopes, false, c, items)?;
            if outer.as_ref() == Some(&v["owner"]) {
                v["callbackScope"] = range(parent, file);
                v["lexicalScope"] = Value::Null;
                v["controlContext"] = json!("UNKNOWN");
            }
        }
    }
    rekey(v, n, file);
    Ok(())
}
fn invocation_node(n: Node<'_>) -> bool {
    n.kind() == "method_invocation"
        || ordinary_constructor(n)
        || (n.kind() == "call" && n.parent().is_none_or(|p| p.kind() != "decorator"))
}
fn invocation<'a>(
    n: Node<'_>,
    file: &Value,
    records: &'a [Value],
    c: &SyntaxWalkControl<'_>,
    items: &Cell<usize>,
) -> Result<Option<&'a Value>, AnalyzerError> {
    let r = range(n, file);
    // ponytail: paid bounded linear lookup; add an index only if actual Source budgets require it.
    for record in records {
        tick_binding(c, items)?;
        if record["syntaxKind"] == "INVOCATION" && record["sourceRange"] == r {
            return Ok(Some(record));
        }
    }
    Ok(None)
}
/// Called in the existing paid AST pass; emits only relations present in those exact AST fields.
pub(crate) fn collect_node<'t>(
    n: Node<'t>,
    file: &Value,
    source: &[u8],
    scopes: &HashMap<usize, Value>,
    records: &[Value],
    (c, items): (&SyntaxWalkControl<'_>, &Cell<usize>),
    emit: &mut impl FnMut(
        Node<'t>,
        &str,
        Value,
        Option<Value>,
        Option<Value>,
    ) -> Result<(), AnalyzerError>,
) -> Result<bool, AnalyzerError> {
    if let Some(params) = n
        .parent()
        .filter(|p| matches!(p.kind(), "parameters" | "formal_parameters"))
    {
        let Some(declaration) = params.parent().filter(|d| {
            matches!(
                d.kind(),
                "function_definition" | "method_declaration" | "constructor_declaration"
            )
        }) else {
            return Ok(false);
        };
        if matches!(n.kind(), "keyword_separator" | "positional_separator") {
            return Ok(false);
        }
        let Some(name) = parameter_name(n) else {
            return Ok(true);
        };
        let Some(owner) = scopes.get(&declaration.id()) else {
            return Ok(true);
        };
        tick_binding(c, items)?;
        let mut ordinal = 0;
        let mut keyword = false;
        let mut cursor = params.walk();
        for sibling in params.named_children(&mut cursor) {
            tick_binding(c, items)?;
            if sibling.id() == n.id() {
                break;
            }
            if sibling.kind() == "keyword_separator" {
                keyword = true;
            }
            if parameter_name(sibling).is_some() {
                ordinal += 1;
            }
        }
        let ty = n.child_by_field_name("type");
        let default = n.child_by_field_name("value");
        emit(
            n,
            "PARAMETER_BINDING",
            json!({"callableRef":owner,"language":file["languageHint"],"name":text(name,source),"ordinal":ordinal,"parameterForm":if keyword{"KEYWORD_ONLY"}else{"POSITIONAL"},"declaredType":ty.map(|t|text(t,source)),"typeRange":ty.map(|t|range(t,file)),"defaultValueRange":default.map(|d|range(d,file))}),
            Some(owner.clone()),
            Some(owner.clone()),
        )?;
    }
    if invocation_node(n) {
        let Some(record) = invocation(n, file, records, c, items)? else {
            return Ok(false);
        };
        let owner = (!record["owner"].is_null()).then(|| record["owner"].clone());
        let lex = (!record["lexicalScope"].is_null()).then(|| record["lexicalScope"].clone());
        let receiver = if n.kind() == "call" {
            n.child_by_field_name("function")
                .filter(|f| f.kind() == "attribute")
                .and_then(|f| f.child_by_field_name("object"))
        } else {
            n.child_by_field_name("object")
        };
        if let Some(producer) = receiver.filter(|n| invocation_node(*n)) {
            tick_binding(c, items)?;
            emit(
                n,
                "VALUE_LINK",
                json!({"relation":"RECEIVER_RESULT","producer":site(producer,file),"consumer":site(n,file),"argumentIndex":null}),
                lex.clone(),
                owner.clone(),
            )?;
        }
        if let Some(args) = n.child_by_field_name("arguments") {
            let mut cursor = args.walk();
            for (index, arg) in args.named_children(&mut cursor).enumerate() {
                tick_binding(c, items)?;
                let value = if arg.kind() == "keyword_argument" {
                    arg.child_by_field_name("value").unwrap_or(arg)
                } else {
                    arg
                };
                if invocation_node(value) {
                    emit(
                        n,
                        "VALUE_LINK",
                        json!({"relation":"ARGUMENT_RESULT","producer":site(value,file),"consumer":site(n,file),"argumentIndex":index}),
                        lex.clone(),
                        owner.clone(),
                    )?;
                }
            }
        }
    }
    if bounded_callback(n, source) {
        let args = n.parent().unwrap();
        let consumer = args.parent().unwrap();
        let lex = scope(consumer, scopes, false, c, items)?;
        let Some(record) = invocation(consumer, file, records, c, items)? else {
            return Ok(true);
        };
        if lex.is_none() || record["owner"].is_null() || Some(&record["owner"]) != lex.as_ref() {
            return Ok(true);
        }
        let mut cursor = args.walk();
        let mut index = None;
        for (i, arg) in args.named_children(&mut cursor).enumerate() {
            tick_binding(c, items)?;
            if arg.id() == n.id() {
                index = Some(i);
                break;
            }
        }
        let body = n.child_by_field_name("body");
        let (form, names, reference) = if n.kind() == "lambda_expression" {
            (
                "JAVA_LAMBDA_DIRECT_CALL",
                vec![text(lambda_parameter(n).unwrap(), source).to_owned()],
                Value::Null,
            )
        } else {
            (
                "JAVA_METHOD_REFERENCE",
                vec![],
                json!({"qualifier":"THIS","memberName":text(n.named_child(1).unwrap(),source)}),
            )
        };
        emit(
            n,
            "CALLBACK_BINDING",
            json!({"consumer":site(consumer,file),"argumentIndex":index.ok_or(AnalyzerError::ParserFailed)?,"callbackForm":form,"parentScopeRef":lex,"parameterNames":names,"body":body.map(|n|site(n,file)),"reference":reference,"status":"COMPLETE","limitations":[]}),
            lex.clone(),
            lex,
        )?;
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use std::{
        fs,
        io::Write,
        path::PathBuf,
        sync::atomic::AtomicBool,
        time::{Duration, Instant},
    };
    fn save(p: &std::path::Path, b: &[u8]) {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(p)
            .unwrap();
        f.write_all(b).unwrap();
        f.flush().unwrap();
    }
    #[test]
    #[ignore = "explicit approved fixed 12-Source library batch only"]
    fn surface_source_truth() {
        let task = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/ab-local-closure")
            .canonicalize()
            .unwrap();
        let input = PathBuf::from(
            std::env::var_os("CODEATLAS_AB_BATCH_INPUT").expect("explicit frozen input directory"),
        )
        .canonicalize()
        .unwrap();
        let output = PathBuf::from(
            std::env::var_os("CODEATLAS_AB_BATCH_OUTPUT").expect("explicit new output directory"),
        )
        .canonicalize()
        .unwrap();
        assert!(input.starts_with(&task) && output.starts_with(&task));
        assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
        let pack: Value =
            serde_json::from_slice(&fs::read(input.join("syntax-requests.json")).unwrap()).unwrap();
        let cases = pack["cases"].as_array().unwrap();
        assert_eq!(cases.len(), 12);
        let mut failures = vec![];
        for case in cases {
            let id = case["id"].as_str().unwrap();
            assert!(matches!(
                id,
                "J1" | "J2" | "J3" | "J4" | "J5" | "J6" | "J7" | "P1" | "P2" | "P3" | "P4" | "P5"
            ));
            let bytes = serde_json::to_vec(&case["request"]).unwrap();
            let mut bytes = bytes;
            bytes.push(b'\n');
            save(&output.join(format!("{id}.request.jsonl")), &bytes);
            let request = decode_framework_surface_request(&bytes).unwrap();
            let p = &request.header()["payload"];
            assert!(
                PathBuf::from(p["repository"]["rootPath"].as_str().unwrap())
                    .canonicalize()
                    .unwrap()
                    .starts_with(&task)
            );
            let b = &p["resourceBudget"];
            assert_eq!(b["maxDurationMs"], 1000);
            assert_eq!(b["maxItems"], 1000);
            assert_eq!(b["maxDepth"], 64);
            assert_eq!(b["maxOutputBytes"], 65536);
            assert_eq!(b["maxMemoryBytes"], 65536);
            assert_eq!(b["maxInputBytes"], 65536);
            assert_eq!(b["maxEvents"], 10000);
            assert!(p["deadlineEpochMs"].is_null());
            let cancelled = AtomicBool::new(false);
            let c = SyntaxWalkControl {
                deadline: Instant::now() + Duration::from_millis(1000),
                cancelled: &cancelled,
                max_source_bytes: 65536,
                max_items: 1000,
                max_depth: 64,
                max_result_bytes: 65536,
            };
            let mut stream = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(output.join(format!("{id}.output.jsonl")))
                .unwrap();
            let result = write_framework_surface_observation(&request, &c, &mut stream);
            stream.flush().unwrap();
            drop(stream);
            let raw = fs::read(output.join(format!("{id}.output.jsonl"))).unwrap();
            let events: Vec<Value> = raw
                .split(|b| *b == b'\n')
                .filter(|l| !l.is_empty())
                .map(|l| serde_json::from_slice(l).unwrap())
                .collect();
            let terminal = events.last().cloned().unwrap_or(Value::Null);
            let observations: Vec<_> = events
                .iter()
                .filter(|e| e["type"] == "SYNTAX_OBSERVATION")
                .map(|e| &e["payload"])
                .collect();
            let fields = observations.iter().all(|r| {
                r.get("callbackScope").is_some()
                    && (r["syntaxKind"] != "INVOCATION"
                        || r["payload"].get("calleeRange").is_some())
            });
            let parameters = observations
                .iter()
                .filter(|r| {
                    r["syntaxKind"] == "DECLARATION"
                        && r["payload"]["declarationForm"] == "CALLABLE"
                })
                .all(|d| {
                    d["payload"]["parameterNames"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .enumerate()
                        .all(|(i, n)| {
                            observations
                                .iter()
                                .filter(|r| {
                                    r["syntaxKind"] == "PARAMETER_BINDING"
                                        && r["payload"]["callableRef"] == d["owner"]
                                        && r["payload"]["ordinal"] == i
                                        && r["payload"]["name"] == *n
                                })
                                .count()
                                == 1
                        })
                });
            let semantic_fields = match id {
                "J1" => observations.iter().any(|r| {
                    r["syntaxKind"] == "ASSIGNMENT"
                        && r["payload"]["targetName"] == "this.repository"
                }),
                "J2" => observations.iter().any(|r| {
                    r["syntaxKind"] == "INVOCATION" && r["payload"]["invocationForm"] == "CONSTRUCT"
                }),
                "J4" | "J5" => {
                    observations.iter().any(|r| r["syntaxKind"] == "VALUE_LINK")
                        && observations.iter().any(|r| {
                            r["syntaxKind"] == "CALLBACK_BINDING"
                                && r["payload"]["callbackForm"]
                                    == if id == "J4" {
                                        "JAVA_LAMBDA_DIRECT_CALL"
                                    } else {
                                        "JAVA_METHOD_REFERENCE"
                                    }
                        })
                }
                "P1" | "P2" => observations.iter().any(|r| {
                    r["syntaxKind"] == "PARAMETER_BINDING"
                        && !r["payload"]["defaultValueRange"].is_null()
                }),
                "P3" => observations.iter().any(|r| {
                    r["syntaxKind"] == "PARAMETER_BINDING"
                        && !r["payload"]["typeRange"].is_null()
                        && r["payload"]["defaultValueRange"].is_null()
                }),
                "J6" => terminal["payload"]["syntaxOutcome"] == "PARTIAL",
                _ => true,
            };
            let record = json!({"id":id,"kind":"ACTUAL_LIBRARY_TEST","requestSha256":format!("{:x}",Sha256::digest(&bytes)),"outputSha256":format!("{:x}",Sha256::digest(&raw)),"terminal":terminal,"newCommonFields":fields,"parameterClosure":parameters,"sourceFields":semantic_fields,"writerError":result.as_ref().err().map(ToString::to_string)});
            save(
                &output.join(format!("{id}.observation.json")),
                &serde_json::to_vec_pretty(&record).unwrap(),
            );
            if result.is_err()
                || terminal["type"] != "OBSERVATION_COMPLETED"
                || observations.is_empty()
                || !fields
                || !parameters
                || !semantic_fields
            {
                failures.push(id.to_owned());
            }
        }
        assert!(
            failures.is_empty(),
            "fixed Source truth failures (raw retained): {failures:?}"
        );
    }
}
