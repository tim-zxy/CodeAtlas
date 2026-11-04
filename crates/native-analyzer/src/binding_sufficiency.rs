//! Fixed private wire7 library boundary; no CLI or production admission.
use crate::{
    code_syntax::{CodeSyntaxMode, CodeSyntaxRequest, decode_code_syntax_request_mode},
    syntax::{SyntaxRequestError, SyntaxWalkControl},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    cell::Cell,
    collections::{BTreeSet, HashMap},
    io::{self, Write},
};
use tree_sitter::Node;
#[derive(Debug)]
pub struct BindingSufficiencyRequest(CodeSyntaxRequest);
impl BindingSufficiencyRequest {
    pub fn header(&self) -> &Value {
        self.0.header()
    }
    pub fn request_checksum(&self) -> &str {
        self.0.request_checksum()
    }
}
pub fn decode_binding_sufficiency_request(
    bytes: &[u8],
) -> Result<BindingSufficiencyRequest, SyntaxRequestError> {
    decode_code_syntax_request_mode(bytes, CodeSyntaxMode::BindingV3).map(BindingSufficiencyRequest)
}
pub fn write_binding_sufficiency_observation(
    r: &BindingSufficiencyRequest,
    c: &SyntaxWalkControl<'_>,
    out: &mut impl Write,
) -> io::Result<()> {
    crate::code_syntax_producer::write_code_syntax_observation_mode(
        &r.0,
        c,
        out,
        CodeSyntaxMode::BindingV3,
    )
}
pub fn serve_binding_sufficiency_request(
    bytes: &[u8],
    c: &SyntaxWalkControl<'_>,
    out: &mut impl Write,
) -> io::Result<()> {
    match decode_binding_sufficiency_request(bytes) {
        Ok(r) => write_binding_sufficiency_observation(&r, c, out),
        Err(e) => {
            if bytes.len() > crate::syntax::SYNTAX_MAX_REQUEST_BYTES {
                return Err(io::Error::other("Invalid binding request framing"));
            }
            let first = bytes.split(|b| *b == b'\n').next().unwrap_or_default();
            let v: Value = serde_json::from_slice(first)?;
            let id = v["requestId"]
                .as_str()
                .filter(|s| !s.is_empty() && s.trim_matches(crate::syntax::trim) == *s)
                .ok_or_else(|| io::Error::other("Invalid binding request identity"))?;
            let mut raw = serde_json::to_vec(
                &json!({"protocolVersion":7,"requestId":id,"sequence":0,"type":"REQUEST_FAILED","payload":{"code":e.code(),"message":"Invalid binding observation request","retryable":false}}),
            )?;
            raw.push(b'\n');
            if raw.len() > crate::syntax::SYNTAX_MAX_REQUEST_BYTES {
                return Err(io::Error::other("Binding response limit"));
            }
            out.write_all(&raw)?;
            out.flush()
        }
    }
}
fn children(n: Node<'_>) -> Vec<Node<'_>> {
    let mut c = n.walk();
    n.named_children(&mut c).collect()
}
fn text<'a>(n: Node<'_>, source: &'a [u8]) -> &'a str {
    std::str::from_utf8(&source[n.byte_range()]).unwrap_or("")
}
fn range(n: Node<'_>, file: &Value) -> Value {
    let a = n.start_position();
    let b = n.end_position();
    json!({"sourceFileId":file["id"],"startLine":a.row,"startColumn":a.column,"endLine":b.row,"endColumn":b.column})
}
pub(crate) fn tick_binding(
    c: &SyntaxWalkControl<'_>,
    items: &Cell<usize>,
) -> Result<(), crate::language::AnalyzerError> {
    c.check()?;
    let next = items.get().saturating_add(1);
    if next > c.max_items {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD binding.ancestor_tick items={} items_limit={}",
            next, c.max_items
        );
        return Err(crate::language::AnalyzerError::ResourceLimit);
    }
    items.set(next);
    Ok(())
}
pub(crate) fn scope(
    n: Node<'_>,
    scopes: &HashMap<usize, Value>,
    include: bool,
    c: &SyntaxWalkControl<'_>,
    items: &Cell<usize>,
) -> Result<Option<Value>, crate::language::AnalyzerError> {
    let mut child = n;
    let mut cursor = if include { Some(n) } else { n.parent() };
    while let Some(p) = cursor {
        tick_binding(c, items)?;
        if [
            "class_definition",
            "lambda",
            "list_comprehension",
            "set_comprehension",
            "dictionary_comprehension",
            "generator_expression",
            "lambda_expression",
        ]
        .contains(&p.kind())
        {
            return Ok(None);
        }
        let outside_python = p.kind() == "function_definition"
            && p.child_by_field_name("body")
                .is_none_or(|body| body.id() != child.id());
        if !outside_python {
            if let Some(r) = scopes.get(&p.id()) {
                return Ok(Some(r.clone()));
            }
        }
        child = p;
        cursor = p.parent();
    }
    Ok(None)
}
fn control(
    n: Node<'_>,
    c: &SyntaxWalkControl<'_>,
    items: &Cell<usize>,
) -> Result<&'static str, crate::language::AnalyzerError> {
    let mut cursor = Some(n);
    while let Some(p) = cursor {
        tick_binding(c, items)?;
        if [
            "if_statement",
            "conditional_expression",
            "for_statement",
            "for_in_clause",
            "while_statement",
            "with_statement",
            "try_statement",
            "except_clause",
            "case_clause",
            "switch_expression",
            "switch_statement",
            "enhanced_for_statement",
            "catch_clause",
            "do_statement",
        ]
        .contains(&p.kind())
        {
            return Ok("CONDITIONAL");
        }
        if ["lambda", "lambda_expression", "generator_expression"].contains(&p.kind()) {
            return Ok("UNKNOWN");
        }
        cursor = p.parent();
    }
    Ok("UNCONDITIONAL")
}
pub(crate) fn canonical(v: &Value) -> String {
    match v {
        Value::Object(o) => {
            let mut keys: Vec<_> = o.keys().collect();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|k| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical(&o[*k])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Value::Array(a) => format!(
            "[{}]",
            a.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        _ => v.to_string(),
    }
}
fn rekey(v: &mut Value, n: Node<'_>, file: &Value) {
    let domain = if file["languageHint"] == "python" {
        "python-syntax-v3"
    } else {
        "java-syntax-v3"
    };
    let mut h = Sha256::new();
    h.update(domain);
    h.update(b"\0");
    for s in [
        file["path"].as_str().unwrap().to_owned(),
        v["syntaxKind"].as_str().unwrap().to_owned(),
        n.start_byte().to_string(),
        n.end_byte().to_string(),
        canonical(&v["payload"]),
    ] {
        h.update(s.len().to_string());
        h.update(b":");
        h.update(s);
    }
    v["providerSyntaxId"] = json!(format!("{domain}:{:x}", h.finalize()));
}
fn push_observation(
    records: &mut Vec<Value>,
    v: Value,
    c: &SyntaxWalkControl<'_>,
    items: &Cell<usize>,
    bytes: &mut usize,
    previous: bool,
) -> Result<(), crate::language::AnalyzerError> {
    use crate::language::AnalyzerError as E;
    c.check()?;
    let size = serde_json::to_vec(&v).map_err(|_| E::ParserFailed)?.len();
    let next_bytes = bytes
        .saturating_add(size)
        .saturating_add(usize::from(previous));
    let next_items = items.get().saturating_add(1);
    if next_bytes > c.max_result_bytes || next_items > c.max_items {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD binding.push bytes={} bytes_limit={} items={} items_limit={}",
            next_bytes, c.max_result_bytes, next_items, c.max_items
        );
        return Err(E::ResourceLimit);
    }
    *bytes = next_bytes;
    items.set(next_items);
    records.push(v);
    Ok(())
}
/// Reuses the language collector's parsed tree and exact Code scope IDs. No reparse.
pub(crate) fn augment(
    root: Node<'_>,
    p: &Value,
    file: &Value,
    source: &[u8],
    c: &SyntaxWalkControl<'_>,
    scopes: &HashMap<usize, Value>,
    out: &mut crate::syntax::SyntaxFileObservation,
) -> Result<(), crate::language::AnalyzerError> {
    use crate::language::AnalyzerError as E;
    let surface = p["syntaxContract"] == "SYNTAX_BINDING_V4";
    let mut nodes = vec![];
    let mut pending = vec![(root, 0)];
    let mut work = out.work_items;
    while let Some((n, d)) = pending.pop() {
        c.check()?;
        work = work.saturating_add(1);
        if work > c.max_items || d > c.max_depth {
            #[cfg(test)]
            eprintln!(
                "AB_GUARD binding.tree_walk items={} items_limit={} depth={} depth_limit={}",
                work, c.max_items, d, c.max_depth
            );
            return Err(E::ResourceLimit);
        }
        nodes.push(n);
        for child in children(n).into_iter().rev() {
            pending.push((child, d + 1));
        }
    }
    let accounted_items = Cell::new(work.saturating_add(out.observations.len()));
    if accounted_items.get() > c.max_items {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD binding.initial_count items={} items_limit={}",
            accounted_items.get(),
            c.max_items
        );
        return Err(E::ResourceLimit);
    }
    let mut limits: HashMap<usize, BTreeSet<String>> =
        scopes.keys().map(|id| (*id, BTreeSet::new())).collect();
    if out.coverage["status"] != "COMPLETE" {
        for l in limits.values_mut() {
            l.insert("BASE_SYNTAX_PARTIAL".into());
        }
    }
    let mut additions = vec![];
    if work.saturating_add(out.observations.len()) > c.max_items {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD binding.initial_records items={} items_limit={}",
            work.saturating_add(out.observations.len()),
            c.max_items
        );
        return Err(E::ResourceLimit);
    }
    for v in &mut out.observations {
        c.check()?;
        let r = &v["sourceRange"];
        if let Some(n) = nodes.iter().find(|n| {
            range(**n, file) == *r
                && match v["syntaxKind"].as_str() {
                    Some("DECLARATION") => [
                        "function_definition",
                        "method_declaration",
                        "constructor_declaration",
                        "variable_declarator",
                    ]
                    .contains(&n.kind()),
                    Some("ASSIGNMENT") => [
                        "assignment",
                        "assignment_expression",
                        "variable_declarator",
                        "dotted_name",
                        "aliased_import",
                    ]
                    .contains(&n.kind()),
                    Some("INVOCATION") => {
                        ["call", "method_invocation"].contains(&n.kind())
                            || (surface && n.kind() == "object_creation_expression")
                    }
                    Some("DECORATION") => {
                        ["decorator", "annotation", "marker_annotation"].contains(&n.kind())
                    }
                    _ => true,
                }
        }) {
            v["controlContext"] = json!(control(*n, c, &accounted_items)?);
            v["lexicalScope"] = json!(scope(*n, scopes, false, c, &accounted_items)?);
            if surface {
                crate::framework_surface::common(v, *n, file, source, c, &accounted_items, scopes)?;
            } else {
                rekey(v, *n, file);
            }
        } else {
            return Err(E::ParserFailed);
        }
    }
    let old_count = out.observations.len();
    let mut result_bytes = serde_json::to_vec(&(
        &out.nodes,
        &out.edges,
        &out.observations,
        &out.coverage,
        &out.diagnostics,
    ))
    .map_err(|_| E::ParserFailed)?
    .len();
    if accounted_items.get() > c.max_items || result_bytes > c.max_result_bytes {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD binding.initial_bytes items={} items_limit={} bytes={} bytes_limit={}",
            accounted_items.get(),
            c.max_items,
            result_bytes,
            c.max_result_bytes
        );
        return Err(E::ResourceLimit);
    }
    let mut emit = |n: Node<'_>,
                    kind: &str,
                    payload: Value,
                    lex: Option<Value>,
                    owner: Option<Value>|
     -> Result<(), E> {
        let control_node = if surface && kind == "CALLBACK_BINDING" {
            n.parent().and_then(|p| p.parent()).unwrap_or(n)
        } else {
            n
        };
        let mut v = json!({"providerSyntaxId":"pending","sourceFileId":file["id"],"sourceFingerprint":file["contentFingerprint"],"sourceRange":range(n,file),"owner":owner,"lexicalScope":lex,"controlContext":control(control_node,c,&accounted_items)?,"syntaxKind":kind,"payload":payload});
        if surface {
            crate::framework_surface::common(&mut v, n, file, source, c, &accounted_items, scopes)?;
        } else {
            rekey(&mut v, n, file);
        }
        let previous = old_count + additions.len() > 0;
        push_observation(
            &mut additions,
            v,
            c,
            &accounted_items,
            &mut result_bytes,
            previous,
        )
    };
    for n in &nodes {
        c.check()?;
        let kind = n.kind();
        if surface
            && crate::framework_surface::collect_node(
                *n,
                file,
                source,
                scopes,
                &out.observations,
                c,
                &accounted_items,
                &mut emit,
            )?
        {
            limits
                .get_mut(&root.id())
                .unwrap()
                .insert("INCOMPLETE_SURFACE_ENUMERATION".into());
        }
        if file["languageHint"] == "java"
            && kind == "block"
            && n.parent().is_some_and(|p| {
                !["method_declaration", "constructor_declaration"].contains(&p.kind())
            })
        {
            limits
                .get_mut(&root.id())
                .unwrap()
                .insert("BLOCK_SCOPE_PROMOTED_CONSERVATIVELY".into());
        }

        if [
            "class_definition",
            "lambda",
            "lambda_expression",
            "list_comprehension",
            "set_comprehension",
            "dictionary_comprehension",
            "generator_expression",
            "type_alias_statement",
            "type_parameter",
            "object_creation_expression",
        ]
        .contains(&kind)
            && !(surface
                && (crate::framework_surface::ordinary_constructor(*n)
                    || crate::framework_surface::bounded_callback(*n, source)))
        {
            if let Some(l) = limits.get_mut(&root.id()) {
                l.insert(format!("UNSUPPORTED_BINDING_SCOPE:{kind}"));
            }
            continue;
        }
        let effect = match kind {
            "for_statement" | "for_in_clause" | "enhanced_for_statement" => Some((
                "ITERATION_TARGET",
                n.child_by_field_name("left")
                    .or_else(|| n.child_by_field_name("name")),
            )),
            "with_item" => {
                let v = n.child_by_field_name("value");
                v.filter(|v| v.kind() == "as_pattern")
                    .and_then(|v| v.child_by_field_name("alias"))
                    .map(|a| ("CONTEXT_TARGET", Some(a)))
            }
            "resource" => n
                .child_by_field_name("name")
                .map(|name| ("CONTEXT_TARGET", Some(name))),
            "except_clause" => n
                .child_by_field_name("alias")
                .or_else(|| {
                    n.child_by_field_name("value")
                        .filter(|v| v.kind() == "as_pattern")
                        .and_then(|v| v.child_by_field_name("alias"))
                })
                .map(|a| ("EXCEPTION_TARGET", Some(a))),
            "catch_formal_parameter" => Some(("EXCEPTION_TARGET", n.child_by_field_name("name"))),
            "named_expression" => Some(("WALRUS_TARGET", n.child_by_field_name("name"))),
            "augmented_assignment" => Some(("AUGMENT", n.child_by_field_name("left"))),
            "assignment_expression" => {
                if n.child_by_field_name("operator")
                    .is_some_and(|op| text(op, source) == "=")
                {
                    None
                } else {
                    Some(("AUGMENT", n.child_by_field_name("left")))
                }
            }
            "update_expression" => Some(("AUGMENT", children(*n).first().copied())),
            "delete_statement" => Some(("UNBIND", children(*n).first().copied())),
            "global_statement" => Some(("GLOBAL", None)),
            "nonlocal_statement" => Some(("NONLOCAL", None)),
            "case_clause" => Some(("PATTERN_TARGET", None)),
            _ => None,
        };
        let type_scope = scopes.get(&n.id()).filter(|_| {
            [
                "class_declaration",
                "interface_declaration",
                "record_declaration",
                "enum_declaration",
                "annotation_type_declaration",
            ]
            .contains(&kind)
        });
        let java_import = kind == "import_declaration";
        let python_import = ["import_statement", "import_from_statement"].contains(&kind);
        if type_scope.is_none() && !java_import && !python_import && effect.is_none() {
            continue;
        }
        let lex = scope(*n, scopes, false, c, &accounted_items)?;
        let owner = lex.clone();
        if let Some(r) = type_scope {
            emit(
                *n,
                "DECLARATION",
                json!({"declarationForm":"TYPE","declaredName":n.child_by_field_name("name").map(|v|text(v,source)),"declaredType":null,"parameterNames":[],"modifiers":[]}),
                lex.clone(),
                Some(r.clone()),
            )?;
        }
        if java_import {
            let named = children(*n);
            let name = named
                .iter()
                .find(|n| ["scoped_identifier", "identifier"].contains(&n.kind()))
                .map(|n| text(*n, source));
            let stat = {
                let mut w = n.walk();
                n.children(&mut w).any(|x| x.kind() == "static")
            };
            let star = named.iter().any(|n| n.kind() == "asterisk");
            let q = name.unwrap_or("");
            let imported = (!star).then(|| q.rsplit('.').next().unwrap_or(""));
            if q.is_empty() {
                limits
                    .get_mut(&root.id())
                    .unwrap()
                    .insert("UNKNOWN_IMPORT".into());
            }
            emit(
                *n,
                "IMPORT_BINDING",
                json!({"language":"java","importKind":if q.is_empty(){"UNKNOWN"}else{match(stat,star){(false,false)=>"JAVA_TYPE",(true,false)=>"JAVA_STATIC_MEMBER",(false,true)=>"JAVA_WILDCARD",(true,true)=>"JAVA_STATIC_WILDCARD"}},"qualifiedName":if q.is_empty(){None}else{Some(q)},"importedName":imported,"boundName":imported}),
                lex.clone(),
                owner.clone(),
            )?;
        }
        if python_import {
            let module = n.child_by_field_name("module_name");
            let from = module.map(|m| text(m, source));
            for item in children(*n) {
                tick_binding(c, &accounted_items)?;
                if module.is_some_and(|m| m.id() == item.id()) {
                    continue;
                }
                if item.kind() == "wildcard_import" {
                    emit(
                        item,
                        "IMPORT_BINDING",
                        json!({"language":"python","importKind":"PYTHON_WILDCARD","qualifiedName":from,"importedName":null,"boundName":null}),
                        lex.clone(),
                        owner.clone(),
                    )?;
                    continue;
                }
                if !["dotted_name", "aliased_import"].contains(&item.kind()) {
                    continue;
                }
                let original = item.child_by_field_name("name").unwrap_or(item);
                let name = text(original, source);
                let alias = item.child_by_field_name("alias").map(|v| text(v, source));
                let qualified = from
                    .map(|m| {
                        if m.ends_with('.') {
                            format!("{m}{name}")
                        } else {
                            format!("{m}.{name}")
                        }
                    })
                    .unwrap_or_else(|| name.into());
                let bound = alias.unwrap_or_else(|| {
                    if from.is_some() {
                        name
                    } else {
                        name.split('.').next().unwrap_or(name)
                    }
                });
                emit(
                    item,
                    "IMPORT_BINDING",
                    json!({"language":"python","importKind":if from.is_some_and(|m|m.starts_with('.')){"PYTHON_RELATIVE"}else if from.is_some(){"PYTHON_SYMBOL"}else{"PYTHON_MODULE"},"qualifiedName":qualified,"importedName":from.map(|_|name),"boundName":bound}),
                    lex.clone(),
                    owner.clone(),
                )?;
                for old in &mut out.observations {
                    if old["syntaxKind"] == "ASSIGNMENT" && old["sourceRange"] == range(item, file)
                    {
                        old["payload"]["targetName"] = json!(bound);
                        rekey(old, item, file);
                    }
                }
            }
        }
        if let Some((eff, target)) = effect {
            let targets: Vec<_> = if ["GLOBAL", "NONLOCAL"].contains(&eff) {
                children(*n)
                    .into_iter()
                    .filter(|v| v.kind() == "identifier")
                    .collect()
            } else if eff == "PATTERN_TARGET" {
                nodes
                    .iter()
                    .copied()
                    .filter(|v| {
                        v.kind() == "identifier"
                            && v.start_byte() >= n.start_byte()
                            && v.end_byte()
                                <= n.child_by_field_name("consequence")
                                    .map(|b| b.start_byte())
                                    .unwrap_or(n.end_byte())
                    })
                    .collect()
            } else {
                target.into_iter().collect()
            };
            let mut names = vec![];
            for t in targets {
                if t.kind() == "identifier" {
                    names.push((t, text(t, source).to_owned()));
                } else {
                    let leaves = children(t);
                    if leaves.len() == 1 && leaves[0].kind() == "identifier" {
                        names.push((leaves[0], text(leaves[0], source).to_owned()));
                    } else {
                        limits
                            .get_mut(&root.id())
                            .unwrap()
                            .insert("UNSUPPORTED_BINDING_TARGET".into());
                    }
                }
            }
            if names.is_empty() {
                limits
                    .get_mut(&root.id())
                    .unwrap()
                    .insert(format!("UNKNOWN_BINDING:{eff}"));
                emit(
                    *n,
                    "BINDING_EFFECT",
                    json!({"name":null,"effect":"UNSUPPORTED_BINDING","targetScopeRef":null}),
                    lex.clone(),
                    owner.clone(),
                )?;
            }
            for (_site, name) in names {
                let target = if eff == "GLOBAL" {
                    scopes.get(&root.id()).cloned()
                } else if eff == "NONLOCAL" {
                    let mut cursor = n.parent();
                    let mut current = false;
                    let mut found = None;
                    while let Some(a) = cursor {
                        tick_binding(c, &accounted_items)?;
                        if let Some(r) = scopes.get(&a.id()) {
                            if !current {
                                current = true;
                            } else if a.id() != root.id()
                                && out.observations.iter().any(|v| {
                                    v["syntaxKind"] == "ASSIGNMENT"
                                        && v["payload"]["targetName"] == name
                                        && v["lexicalScope"] == *r
                                })
                            {
                                found = Some(r.clone());
                                break;
                            }
                        }
                        cursor = a.parent();
                    }
                    found
                } else {
                    lex.clone()
                };
                if target.is_none() || eff == "PATTERN_TARGET" {
                    limits
                        .get_mut(&root.id())
                        .unwrap()
                        .insert(format!("UNPROVEN_BINDING:{eff}"));
                }
                emit(
                    *n,
                    "BINDING_EFFECT",
                    json!({"name":name,"effect":eff,"targetScopeRef":target}),
                    lex.clone(),
                    owner.clone(),
                )?;
            }
        }
    }
    drop(emit);
    out.observations.extend(additions);
    for n in &nodes {
        c.check()?;
        if n.id() != root.id()
            && scopes.contains_key(&n.id())
            && scope(*n, scopes, false, c, &accounted_items)?.is_none()
        {
            limits
                .get_mut(&n.id())
                .unwrap()
                .insert("PARENT_SCOPE_UNKNOWN".into());
        }
    }
    let partial = limits.values().any(|l| !l.is_empty());
    if partial {
        for l in limits.values_mut() {
            l.insert("FILE_BINDING_PARTIAL".into());
        }
    }
    for n in &nodes {
        c.check()?;
        if let Some(r) = scopes.get(&n.id()) {
            let l = limits.get(&n.id()).unwrap();
            let parent = scope(*n, scopes, false, c, &accounted_items)?;
            let mut v = json!({"providerSyntaxId":"pending","sourceFileId":file["id"],"sourceFingerprint":file["contentFingerprint"],"sourceRange":range(*n,file),"owner":r,"lexicalScope":r,"controlContext":"UNCONDITIONAL","syntaxKind":"BINDING_SCOPE","payload":{"scopeRef":r,"parentScopeRef":parent,"status":if l.is_empty(){"COMPLETE"}else{"PARTIAL"},"limitations":l.iter().collect::<Vec<_>>()}});
            if surface {
                crate::framework_surface::common(
                    &mut v,
                    *n,
                    file,
                    source,
                    c,
                    &accounted_items,
                    scopes,
                )?;
            } else {
                rekey(&mut v, *n, file);
            }
            let previous = !out.observations.is_empty();
            push_observation(
                &mut out.observations,
                v,
                c,
                &accounted_items,
                &mut result_bytes,
                previous,
            )?;
        }
    }
    if partial {
        out.coverage["status"] = json!("PARTIAL");
        out.coverage["limitations"] = json!(["INCOMPLETE_BINDING_ENUMERATION"]);
    }
    work = accounted_items.get();
    let bytes = serde_json::to_vec(&(
        &out.nodes,
        &out.edges,
        &out.observations,
        &out.coverage,
        &out.diagnostics,
    ))
    .map_err(|_| E::ParserFailed)?
    .len();
    if work > c.max_items || bytes > c.max_result_bytes {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD binding.final items={} items_limit={} bytes={} bytes_limit={}",
            work, c.max_items, bytes, c.max_result_bytes
        );
        return Err(E::ResourceLimit);
    }
    out.work_items = work;
    c.check()?;
    let _ = p;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use std::{
        path::PathBuf,
        sync::atomic::AtomicBool,
        time::{Duration, Instant},
    };
    fn root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/phase1/syntax-contract/binding-pipeline")
    }
    #[test]
    fn binding_sufficiency_source_oracle() {
        let input: Value =
            serde_json::from_slice(&std::fs::read(root().join("inputs.json")).unwrap()).unwrap();
        for case in input["cases"].as_array().unwrap() {
            let name = case["file"].as_str().unwrap();
            let source = std::fs::read(root().join("sources").join(name)).unwrap();
            let mut req = input["requestTemplate"].clone();
            let p = &mut req["payload"];
            p["repository"]["rootPath"] = json!(
                root()
                    .canonicalize()
                    .unwrap()
                    .to_string_lossy()
                    .trim_start_matches(r"\\?\")
                    .replace('\\', "/")
            );
            p["sourceFiles"][0]["path"] = json!(format!("sources/{name}"));
            p["sourceFiles"][0]["contentFingerprint"] =
                json!(format!("sha256:{:x}", Sha256::digest(&source)));
            p["owners"] = json!([]);
            p["resourceBudget"]["maxEvents"] = json!(10_000);
            if name.ends_with(".java") {
                use crate::language::LanguageAnalyzer;
                p["sourceFiles"][0]["languageHint"] = json!("java");
                p["languages"] = json!([{"languageId":"java","grammarVersion":"0.23.5","analyzerVersion":env!("CARGO_PKG_VERSION"),"compatibilityVersion":"syntax-v1"}]);
                let analysis = crate::java::JavaAnalyzer::new()
                    .unwrap()
                    .analyze(&format!("sources/{name}"), &source)
                    .unwrap();
                let mut ids: Vec<_> = analysis
                    .symbols
                    .iter()
                    .map(|s| s.provider_fact_id.clone())
                    .collect();
                ids.push(crate::java_relations::compilation_unit_id(&format!(
                    "sources/{name}"
                )));
                p["owners"]=Value::Array(ids.iter().map(|id|json!({"sourceFileId":p["sourceFiles"][0]["id"],"providerNodeRef":{"factType":"NODE","providerId":p["providerId"],"providerFactId":id},"canonicalRef":{"scope":"REPOSITORY","repositoryId":p["targetSource"]["repositoryId"],"entity":{"kind":"CODE_NODE","id":format!("code:{id}"),"revisionId":p["targetSource"]["revisionId"]}}})).collect());
            }
            p["ownerBinding"]["ownerMapDigest"] =
                json!(crate::syntax::owner_map_digest(p).unwrap());
            let mut bytes = serde_json::to_vec(&req).unwrap();
            bytes.push(b'\n');
            assert!(crate::binding_syntax::decode_binding_syntax_request(&bytes).is_err());
            let parsed = decode_binding_sufficiency_request(&bytes)
                .unwrap_or_else(|e| panic!("{name}: {e:?}"));
            let cancelled = AtomicBool::new(false);
            let b = &p_budget(&req);
            let control = crate::syntax::SyntaxWalkControl {
                deadline: Instant::now()
                    + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
                cancelled: &cancelled,
                max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
                max_items: b["maxItems"].as_u64().unwrap() as usize,
                max_depth: b["maxDepth"].as_u64().unwrap() as usize,
                max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
            };
            let mut raw = vec![];
            write_binding_sufficiency_observation(&parsed, &control, &mut raw).unwrap();
            let events: Vec<Value> = raw
                .split(|b| *b == b'\n')
                .filter(|b| !b.is_empty())
                .map(|b| serde_json::from_slice(b).unwrap())
                .collect();
            let last = events.last().unwrap();
            assert_eq!(last["type"], "OBSERVATION_COMPLETED", "{name}: {events:?}");
            assert!(events.iter().all(|e| e["protocolVersion"] == 7));
            assert_eq!(
                last["payload"]["syntaxOutcome"] == "COMPLETE",
                case["complete"].as_bool().unwrap(),
                "{name}: {events:?}"
            );
            let obs: Vec<_> = events
                .iter()
                .filter(|e| e["type"] == "SYNTAX_OBSERVATION")
                .map(|e| &e["payload"])
                .collect();
            assert!(
                obs.iter().any(|s| s["syntaxKind"] == "BINDING_SCOPE"),
                "{name}"
            );
            assert!(
                obs.iter().all(|s| s.get("controlContext").is_some()),
                "{name}"
            );
            for k in case["imports"].as_array().unwrap() {
                assert!(
                    obs.iter()
                        .any(|s| s["syntaxKind"] == "IMPORT_BINDING"
                            && s["payload"]["importKind"] == *k),
                    "{name}: missing {k}"
                );
            }
            for k in case["effects"].as_array().unwrap() {
                assert!(
                    obs.iter().any(
                        |s| s["syntaxKind"] == "BINDING_EFFECT" && s["payload"]["effect"] == *k
                    ),
                    "{name}: missing {k}"
                );
            }
            for s in obs
                .iter()
                .filter(|s| s["syntaxKind"] == "BINDING_SCOPE")
                .skip(1)
            {
                if s["payload"]["parentScopeRef"].is_null() {
                    assert!(
                        s["payload"]["limitations"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|l| l == "PARENT_SCOPE_UNKNOWN"),
                        "missing parent limitation: {name}"
                    );
                }
            }
            if name.starts_with("single-") {
                let module = events
                    .iter()
                    .find(|e| {
                        e["type"] == "NODE" && e["payload"]["providerKind"] == "python.module"
                    })
                    .unwrap();
                let site = obs
                    .iter()
                    .find(|s| s["syntaxKind"] != "BINDING_SCOPE")
                    .unwrap();
                assert_eq!(
                    site["lexicalScope"]["providerFactId"], module["payload"]["providerFactId"],
                    "coincident EOF ranges must use the syntax AST kind: {name}"
                );
            }
            if name == "defaults.py" {
                let outer = events
                    .iter()
                    .find(|e| e["type"] == "NODE" && e["payload"]["name"] == "outer")
                    .unwrap();
                let call = obs
                    .iter()
                    .find(|s| {
                        s["syntaxKind"] == "INVOCATION"
                            && s["payload"]["callee"]["name"] == "factory"
                    })
                    .unwrap();
                assert_eq!(
                    call["lexicalScope"]["providerFactId"],
                    outer["payload"]["providerFactId"]
                );
            }
            if name == "Assignment.java" {
                assert!(
                    obs.iter().any(|s| s["syntaxKind"] == "ASSIGNMENT"
                        && s["payload"]["value"]["kind"] == "NUMBER"
                        && s["payload"]["value"]["value"] == 2.0),
                    "plain assignment is not AUGMENT"
                );
            }
            if let Ok(dir) = std::env::var("CODEATLAS_BINDING_SUFFICIENCY_OUTPUT") {
                std::fs::create_dir_all(&dir).unwrap();
                for (ext, data) in [("request.jsonl", &bytes), ("output.jsonl", &raw)] {
                    let target = PathBuf::from(&dir).join(format!("{name}.{ext}"));
                    assert!(!target.exists());
                    std::fs::write(target, data).unwrap();
                }
            }
        }
    }
    #[test]
    fn binding_sufficiency_rejects_before_retaining_oversized_records() {
        let source = b"import a\nimport b\n";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_python::LANGUAGE.into())
            .unwrap();
        let tree = parser.parse(source.as_slice(), None).unwrap();
        let root = tree.root_node();
        let file = json!({"id":"file:one","path":"app.py","contentFingerprint":"declared","languageHint":"python"});
        let scopes = HashMap::from([(
            root.id(),
            json!({"factType":"NODE","providerId":"native","providerFactId":"module:declared"}),
        )]);
        let mut out = crate::syntax::SyntaxFileObservation {
            work_items: 0,
            nodes: vec![],
            edges: vec![],
            observations: vec![],
            coverage: json!({"status":"COMPLETE"}),
            diagnostics: vec![],
        };
        let cancelled = AtomicBool::new(false);
        let c = SyntaxWalkControl {
            deadline: Instant::now() + Duration::from_secs(1),
            cancelled: &cancelled,
            max_source_bytes: 1000,
            max_items: 1000,
            max_depth: 64,
            max_result_bytes: 1000,
        };
        assert!(matches!(
            augment(root, &Value::Null, &file, source, &c, &scopes, &mut out),
            Err(crate::language::AnalyzerError::ResourceLimit)
        ));
        let retained: usize = out
            .observations
            .iter()
            .map(|v| serde_json::to_vec(v).unwrap().len())
            .sum();
        assert!(
            retained <= c.max_result_bytes,
            "oversized retained buffer: {retained}"
        );
    }
    #[test]
    fn binding_sufficiency_ancestor_walks_use_same_item_budget() {
        let source = b"if True:\n    x = 1\n";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_python::LANGUAGE.into())
            .unwrap();
        let tree = parser.parse(source.as_slice(), None).unwrap();
        let root = tree.root_node();
        let file = json!({"id":"file:one","path":"app.py","contentFingerprint":"declared","languageHint":"python"});
        let scopes = HashMap::from([(
            root.id(),
            json!({"factType":"NODE","providerId":"native","providerFactId":"module:declared"}),
        )]);
        let mut out = crate::syntax::SyntaxFileObservation {
            work_items: 0,
            nodes: vec![],
            edges: vec![],
            // Independent base observation corresponding to x = 1 in this Source.
            observations: vec![json!({
                "providerSyntaxId":"assignment:declared", "sourceFileId":"file:one",
                "sourceFingerprint":"declared", "sourceRange":{"sourceFileId":"file:one","startLine":1,"startColumn":4,"endLine":1,"endColumn":9},
                "owner":{"factType":"NODE","providerId":"native","providerFactId":"module:declared"},
                "syntaxKind":"ASSIGNMENT", "payload":{"assignmentForm":"DIRECT_VALUE","targetName":"x","value":{"kind":"NUMBER","value":1},"valueRange":{"sourceFileId":"file:one","startLine":1,"startColumn":8,"endLine":1,"endColumn":9}}
            })],
            coverage: json!({"status":"COMPLETE"}),
            diagnostics: vec![],
        };
        let cancelled = AtomicBool::new(false);
        let c = SyntaxWalkControl {
            deadline: Instant::now() + Duration::from_secs(1),
            cancelled: &cancelled,
            max_source_bytes: 1000,
            max_items: 10,
            max_depth: 64,
            max_result_bytes: 1000,
        };
        assert!(
            matches!(
                augment(root, &Value::Null, &file, source, &c, &scopes, &mut out),
                Err(crate::language::AnalyzerError::ResourceLimit)
            ),
            "scope/control ancestor visits must not be free"
        );
    }
    #[test]
    #[ignore = "manual original Spring scope regression requires an approved owned batch"]
    fn binding_scope_demand_spring() {
        use std::{fs, io::Write};
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let task = repo
            .join(".superpowers/sdd/2026-10-31-phase1-b-remaining-execution/scope-demand")
            .canonicalize()
            .unwrap();
        let output = fs::canonicalize(
            std::env::var_os("CODEATLAS_SCOPE_DEMAND_OUTPUT").expect("explicit owned scope output"),
        )
        .unwrap();
        assert_eq!(output.parent(), Some(task.as_path()));
        assert_eq!(
            fs::read_dir(&output).unwrap().count(),
            0,
            "never overwrite a prior capture"
        );
        let save = |name: &str, bytes: &[u8]| {
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(output.join(name))
                .unwrap();
            f.write_all(bytes).unwrap();
            f.flush().unwrap();
        };
        let bytes = fs::read(repo.join(".superpowers/sdd/2026-10-31-phase1-b-remaining-execution/framework-source-characterization/run-01/spring.request.jsonl")).unwrap();
        assert_eq!(
            format!("{:x}", Sha256::digest(&bytes)),
            "cdeec15871d68d771495f69bfd51e12504444a4936fc45145484fc25e1d0bc9e"
        );
        let request = decode_binding_sufficiency_request(&bytes).unwrap();
        let header: Value = serde_json::from_slice(&bytes).unwrap();
        let p = &header["payload"];
        assert!(p["deadlineEpochMs"].is_null());
        let b = &p["resourceBudget"];
        save("spring.request.jsonl", &bytes);
        let cancelled = AtomicBool::new(false);
        let control = SyntaxWalkControl {
            deadline: Instant::now() + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
            cancelled: &cancelled,
            max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
            max_items: b["maxItems"].as_u64().unwrap() as usize,
            max_depth: b["maxDepth"].as_u64().unwrap() as usize,
            max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
        };
        let mut raw = Vec::new();
        let result = write_binding_sufficiency_observation(&request, &control, &mut raw);
        save("spring.output.jsonl", &raw);
        let events: Vec<Value> = raw
            .split(|b| *b == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        let terminal = events.last().cloned().unwrap_or(Value::Null);
        save("spring.observation.json", &serde_json::to_vec_pretty(&json!({"requestSha256":format!("{:x}",Sha256::digest(&bytes)),"outputSha256":format!("{:x}",Sha256::digest(&raw)),"resourceBudget":b,"terminal":terminal,"writerError":result.as_ref().err().map(ToString::to_string),"meaning":"Budget regression only; complete observation is not framework publication."})).unwrap());
        assert!(result.is_ok(), "writer did not settle: {result:?}");
        assert_eq!(
            terminal["type"], "OBSERVATION_COMPLETED",
            "original cap still refused; preserve raw and do not raise cap"
        );
    }
    fn p_budget(r: &Value) -> Value {
        r["payload"]["resourceBudget"].clone()
    }
}
