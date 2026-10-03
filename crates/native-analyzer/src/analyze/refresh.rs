use super::*;
use codeatlas_native_analyzer::request_v3::ValidatedRequestV3;
use codeatlas_native_analyzer::retained::{RetainedFile, decode_retained_file};

type Failure = (&'static str, &'static str);
const INVALID: Failure = (
    "INVALID_REQUEST",
    "Retained facts do not match the baseline",
);
const RESOURCE: Failure = (
    "RESOURCE_LIMIT_EXCEEDED",
    "Refresh workspace exceeds budget",
);

// Pinned Rust 1.98 BTree nodes hold 11 key/value slots and up to 12 edges.
// Reserve a whole internal node per entry, including alignment/parent space.
// This is conservative owned-workspace accounting, not an RSS claim.
const TREE_ENTRY: usize = 11
    * (std::mem::size_of::<String>() + std::mem::size_of::<SiteStatistics>())
    + 16 * std::mem::size_of::<usize>();
fn add(a: usize, b: usize) -> Result<usize, Failure> {
    a.checked_add(b).ok_or(RESOURCE)
}
fn multiply(a: usize, b: usize) -> Result<usize, Failure> {
    a.checked_mul(b).ok_or(RESOURCE)
}
fn value_charge(v: &Value) -> Result<usize, Failure> {
    let heap = match v {
        Value::String(s) => s.capacity(),
        Value::Array(a) => a.iter().try_fold(
            multiply(a.capacity(), std::mem::size_of::<Value>())?,
            |sum, v| add(sum, value_charge(v)?),
        )?,
        Value::Object(o) => o
            .iter()
            .try_fold(multiply(o.len(), TREE_ENTRY)?, |sum, (k, v)| {
                add(add(sum, k.capacity())?, value_charge(v)?)
            })?,
        _ => 0,
    };
    add(std::mem::size_of::<Value>(), heap)
}
fn extraction_charge(a: &LanguageAnalysis) -> Result<usize, Failure> {
    // Reserve the retained structs and their bounded JSON fact projections.
    // One node payload has fewer than 32 properties including nested records;
    // this also covers a candidate entry for every declaration in the index.
    let nodes = add(a.symbols.len(), a.relation_sites.len())?;
    let mut bytes = multiply(nodes, multiply(32, TREE_ENTRY)?)?;
    bytes = add(
        bytes,
        multiply(a.symbols.capacity(), std::mem::size_of::<SymbolFact>())?,
    )?;
    bytes = add(
        bytes,
        multiply(
            a.relation_sites.capacity(),
            std::mem::size_of::<codeatlas_native_analyzer::language::RelationSite>(),
        )?,
    )?;
    bytes = add(
        bytes,
        multiply(
            a.diagnostics.capacity(),
            std::mem::size_of::<codeatlas_native_analyzer::language::SyntaxDiagnostic>(),
        )?,
    )?;
    // Diagnostic + optional range has nine fixed properties in total.
    bytes = add(
        bytes,
        multiply(a.diagnostics.len(), multiply(9, TREE_ENTRY)?)?,
    )?;
    for s in &a.symbols {
        for text in [&s.provider_fact_id, &s.provider_kind, &s.name, &s.signature] {
            bytes = add(bytes, text.capacity())?;
        }
        bytes = add(bytes, s.qualified_name.as_ref().map_or(0, String::capacity))?;
    }
    for s in &a.relation_sites {
        for text in [&s.variant, &s.source_fact_id, &s.target_hint] {
            bytes = add(bytes, text.capacity())?;
        }
    }
    for d in &a.diagnostics {
        bytes = add(bytes, add(d.code.capacity(), d.message.capacity())?)?;
    }
    bytes = add(bytes, multiply(a.site_statistics.len(), TREE_ENTRY)?)?;
    add(bytes, std::mem::size_of::<RetainedFile>())
}
pub(super) fn run<W: Write>(
    request: &ValidatedRequestV3,
    workers: NonZeroUsize,
    output: &mut W,
) -> io::Result<ExitCode> {
    run_observed(request, workers, output, &|_| {})
}
fn run_observed<W: Write, F: Fn(&str) + Sync>(
    validated: &ValidatedRequestV3,
    workers: NonZeroUsize,
    output: &mut W,
    on_parse: &F,
) -> io::Result<ExitCode> {
    let header = validated.header();
    let p = &header["payload"];
    let context = &p["analysisStateContext"];
    let language = &context["language"];
    let compatible = p["targetRevision"]["kind"] == "WORKTREE"
        && p["baseRevisionId"] == p["targetRevision"]["id"]
        && context["providerId"] == "native"
        && context["providerVersion"] == env!("CARGO_PKG_VERSION")
        && context["resolverVersion"] == JAVA_RESOLVER_VERSION
        && language["languageId"] == "java"
        && language["grammarVersion"] == "0.23.5"
        && language["analyzerVersion"] == env!("CARGO_PKG_VERSION")
        && language["compatibilityVersion"] == "1";
    let refuse = |output: &mut W, failure: Failure| {
        write_one(
            output,
            json!({"protocolVersion":3,"requestId":header["requestId"],"sequence":0,
            "type":"REQUEST_FAILED","payload":{"error":error(failure.0,failure.1,false)}}),
        )?;
        Ok(ExitCode::SUCCESS)
    };
    if !compatible {
        return refuse(output, INVALID);
    }
    let Some(baseline) = validated.baseline() else {
        return refuse(output, INVALID);
    };
    let admission = (|| -> Result<(usize, usize), Failure> {
        let limit = usize::try_from(
            p["resourceBudget"]["maxMemoryBytes"]
                .as_u64()
                .ok_or(INVALID)?,
        )
        .map_err(|_| RESOURCE)?;
        // Original decoded input, retained clones and projection scratch overlap.
        let input = add(value_charge(header)?, value_charge(baseline)?)?;
        let reserved = add(
            multiply(input, 4)?,
            add(
                MAX_LINE_BYTES,
                multiply(workers.get(), WORKER_RESERVATION_BYTES as usize)?,
            )?,
        )?;
        if reserved >= limit {
            return Err(RESOURCE);
        }
        Ok((limit, reserved))
    })();
    let (limit, mut reserved) = match admission {
        Ok(v) => v,
        Err(e) => return refuse(output, e),
    };
    let mut legacy = header.clone();
    legacy["protocolVersion"] = json!(2);
    legacy["type"] = json!("ANALYZE");
    legacy.as_object_mut().unwrap().remove("sequence");
    let payload = legacy["payload"].as_object_mut().unwrap();
    let revision = payload.remove("targetRevision").unwrap();
    let source_files = payload.remove("targetSourceFiles").unwrap();
    for key in [
        "analysisStateContext",
        "baseRevisionId",
        "baseRevisionFingerprint",
        "baselineState",
        "changes",
    ] {
        payload.remove(key);
    }
    payload.insert("revision".into(), revision);
    payload.insert("sourceFiles".into(), source_files);
    let Some(mut request) = parse_request(&legacy) else {
        return refuse(output, INVALID);
    };
    drop(legacy);
    request.protocol_version = 3;
    if !request.capabilities.iter().any(|c| c == "SYMBOL") {
        return refuse(output, ("UNSUPPORTED_CAPABILITY", "SYMBOL is required"));
    }
    if request.max_events < 2 {
        return refuse(output, RESOURCE);
    }
    let started = Instant::now();
    let check = || {
        if remaining_budget(&request, started).is_zero() {
            Err(("BUDGET_EXCEEDED", "Refresh deadline exceeded"))
        } else {
            Ok(())
        }
    };
    let mut files = Vec::new();
    for s in baseline["summaries"].as_array().unwrap() {
        if let Err(e) = check() {
            return refuse(output, e);
        }
        match decode_retained_file(s) {
            Ok(f) => files.push(f),
            Err(_) => return refuse(output, INVALID),
        };
    }
    let base_index = match build_index(&files, limit - reserved, &check) {
        Ok(v) => v,
        Err(e) => return refuse(output, e),
    };
    if let Err(e) = verify_baseline(&request, &files, &base_index, &check) {
        return refuse(output, e);
    }
    drop(base_index);
    if let Err(e) = check() {
        return refuse(output, e);
    }
    let mut prior = Vec::new();
    for f in &files {
        for e in &f.emitted_facts {
            let kind = if e["factType"] == "NODE" {
                "NODE"
            } else {
                "EDGE"
            };
            let id = e["providerFactId"].as_str().unwrap();
            if prior
                .iter()
                .any(|f: &FactDigest| f.kind == kind && f.id == id)
            {
                continue;
            }
            let charge = std::mem::size_of::<FactDigest>()
                .saturating_add(id.len())
                .saturating_add(64);
            if reserved.saturating_add(charge) > limit {
                return refuse(output, RESOURCE);
            }
            reserved += charge;
            prior.try_reserve_exact(1).map_err(io::Error::other)?;
            prior.push(FactDigest {
                kind,
                id: id.to_owned(),
                digest: e["contentDigest"].as_str().unwrap().to_owned(),
                ownership: if e["ownership"] == "SHARED" {
                    "SHARED"
                } else {
                    "FILE"
                },
            });
        }
    }
    let target_context = json!({"providerSnapshotId":request.snapshot_id,"repositoryId":request.repository_id,
        "revisionId":request.revision_id,"revisionFingerprint":request.revision_fingerprint});
    let mut stream = EventWriter::new(output, &request.id, &target_context, request.max_events, 3);
    stream.failure_type = "REFRESH_FAILED";
    if !stream.emit("REFRESH_STARTED", target_context.clone(), false)? {
        return Ok(ExitCode::SUCCESS);
    }
    let result = (|| -> Result<bool, Failure> {
        files.retain(|f| {
            request
                .source_files
                .iter()
                .any(|s| s["id"] == f.source_file["id"])
        });
        let changes = &p["changes"];
        let changed: Vec<_> = request
            .source_files
            .iter()
            .filter(|s| {
                ["added", "modified"]
                    .iter()
                    .any(|k| changes[k].as_array().unwrap().contains(s))
            })
            .collect();
        for chunk in changed.chunks(workers.get()) {
            check()?;
            let deadline = Instant::now()
                .checked_add(remaining_budget(&request, started))
                .ok_or(RESOURCE)?;
            let cancelled = AtomicBool::new(false);
            let results = std::thread::scope(|scope| {
                let jobs: Vec<_> = chunk
                    .iter()
                    .map(|file| {
                        let cancel = &cancelled;
                        let root = &request.root;
                        scope.spawn(move || {
                            parse_source_observed(root, file, deadline, cancel, true, on_parse)
                        })
                    })
                    .collect();
                jobs.into_iter().map(|job| job.join()).collect::<Vec<_>>()
            });
            for (source, result) in chunk.iter().zip(results) {
                check()?;
                let analysis = checked_result(result)?;
                let charge = add(extraction_charge(&analysis)?, value_charge(source)?)?;
                reserved = add(reserved, charge)?;
                if reserved >= limit {
                    return Err(RESOURCE);
                }
                files.retain(|f| f.source_file["id"] != source["id"]);
                files.push(RetainedFile {
                    source_file: (**source).clone(),
                    analysis,
                    coverage: Vec::new(),
                    emitted_facts: Vec::new(),
                });
            }
        }
        files.sort_unstable_by(|a, b| {
            a.source_file["path"]
                .as_str()
                .cmp(&b.source_file["path"].as_str())
        });
        let index = build_index(&files, limit - reserved, &check)?;
        reserved = add(reserved, index.accounted_bytes())?;
        let mut state = context.as_object().unwrap().clone();
        for (key, value) in [
            ("schemaVersion", json!(1)),
            ("repositoryId", json!(request.repository_id)),
            ("revisionId", json!(request.revision_id)),
            ("contentFingerprint", json!(request.revision_fingerprint)),
            ("requestedCapabilities", json!(request.capabilities)),
            ("sourceFileCount", json!(files.len())),
            ("summaryDigest", json!("0".repeat(64))),
        ] {
            state.insert(key.into(), value);
        }
        stream.full =
            Some(FullMetadata::new(Value::Object(state), limit - reserved).map_err(|_| RESOURCE)?);
        let mut target = Vec::<FactDigest>::new();
        let mut counts = json!({"sourceFiles":0,"upsertedNodes":0,"removedNodes":0,"upsertedEdges":0,"removedEdges":0,"coverage":0,"diagnostics":0});
        for source in &changed {
            if !stream
                .emit("SOURCE_FILE", (**source).clone(), false)
                .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
            {
                return Ok(false);
            }
            counts["sourceFiles"] = json!(counts["sourceFiles"].as_u64().unwrap() + 1);
        }
        let mut partial = false;
        for file in &files {
            check()?;
            let statistics = visit_facts(&request, file, &index, |kind, payload, ownership| {
                check()?;
                if ownership == "FILE" {
                    stream
                        .full
                        .as_mut()
                        .unwrap()
                        .capture_owned(kind, &payload, ownership)
                        .map_err(|_| RESOURCE)?;
                }
                let id = payload["providerFactId"].as_str().unwrap();
                let digest = fact_content_digest(&payload);
                if let Some(old) = target.iter().find(|f| f.kind == kind && f.id == id) {
                    if old.digest != digest || old.ownership != "SHARED" || ownership != "SHARED" {
                        return Err(INVALID);
                    }
                    return Ok(());
                }
                let charge = add(add(std::mem::size_of::<FactDigest>(), id.len())?, 64)?;
                reserved = add(reserved, charge)?;
                if reserved >= limit {
                    return Err(RESOURCE);
                }
                stream.full.as_mut().unwrap().memory_budget = limit - reserved;
                target.try_reserve_exact(1).map_err(|_| RESOURCE)?;
                target.push(FactDigest {
                    kind,
                    id: id.to_owned(),
                    digest: digest.clone(),
                    ownership,
                });
                if !prior
                    .iter()
                    .any(|f| f.kind == kind && f.id == id && f.digest == digest)
                {
                    let event = if kind == "NODE" {
                        "UPSERT_NODE"
                    } else {
                        "UPSERT_EDGE"
                    };
                    if !stream
                        .emit(event, payload, false)
                        .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
                    {
                        return Err(RESOURCE);
                    }
                    let key = if kind == "NODE" {
                        "upsertedNodes"
                    } else {
                        "upsertedEdges"
                    };
                    counts[key] = json!(counts[key].as_u64().unwrap() + 1);
                }
                Ok(())
            })?;
            let coverage = if file.analysis.coverage == SyntaxCoverage::Partial {
                partial = true;
                "PARTIAL"
            } else {
                "COMPLETE"
            };
            for cap in &request.capabilities {
                if !stream
                    .emit(
                        "COVERAGE",
                        coverage_payload(
                            &request,
                            cap,
                            &file.source_file["id"],
                            coverage,
                            statistics.get(cap).ok_or(INVALID)?,
                        ),
                        false,
                    )
                    .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
                {
                    return Ok(false);
                }
                counts["coverage"] = json!(counts["coverage"].as_u64().unwrap() + 1);
            }
            for d in &file.analysis.diagnostics {
                let range=d.span.as_ref().map(|s|json!({"sourceFileId":file.source_file["id"],"startLine":s.start_line,"startColumn":s.start_column,"endLine":s.end_line,"endColumn":s.end_column}));
                if !stream.emit("DIAGNOSTIC",json!({"code":d.code,"severity":"WARNING","message":d.message,"sourceRange":range}),false).map_err(|_|("INTERNAL_ANALYZER_FAILURE","Output write failed"))? {return Ok(false);}
                counts["diagnostics"] = json!(counts["diagnostics"].as_u64().unwrap() + 1);
            }
            if !stream
                .emit_summary(
                    &file.source_file,
                    &file.analysis,
                    &statistics,
                    &request,
                    Some(&index),
                )
                .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
            {
                return Ok(false);
            }
        }
        prior.sort_unstable_by(|a, b| (a.kind, &a.id).cmp(&(b.kind, &b.id)));
        for old in &prior {
            check()?;
            if !target.iter().any(|f| f.kind == old.kind && f.id == old.id) {
                let event = if old.kind == "NODE" {
                    "REMOVE_NODE"
                } else {
                    "REMOVE_EDGE"
                };
                if !stream
                    .emit(
                        event,
                        json!({"factType":old.kind,"providerId":"native","providerFactId":old.id}),
                        false,
                    )
                    .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
                {
                    return Ok(false);
                }
                let key = if old.kind == "NODE" {
                    "removedNodes"
                } else {
                    "removedEdges"
                };
                counts[key] = json!(counts[key].as_u64().unwrap() + 1);
            }
        }
        check()?;
        let mut terminal = target_context.as_object().unwrap().clone();
        terminal.insert(
            "outcome".into(),
            json!(if partial { "PARTIAL" } else { "SUCCEEDED" }),
        );
        terminal.insert("counts".into(), counts);
        terminal.insert("capabilities".into(),json!(request.capabilities.iter().map(|name|json!({"name":name,"support":"SUPPORTED","coverage":if partial {"PARTIAL"} else {"COMPLETE"}})).collect::<Vec<_>>()));
        terminal.insert(
            "contentFingerprint".into(),
            json!(request.revision_fingerprint),
        );
        terminal.insert("integrityChecksum".into(), json!(stream.checksum()));
        stream.finish_state(&mut terminal);
        if !stream
            .emit("REFRESH_COMPLETED", Value::Object(terminal), true)
            .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
        {
            return Ok(false);
        }
        Ok(true)
    })();
    match result {
        Ok(_) => Ok(ExitCode::SUCCESS),
        Err(_) if stream.failed => Ok(ExitCode::SUCCESS),
        Err(e) => stream.fail(&target_context, e.0, e.1),
    }
}

fn visit_facts(
    request: &Request,
    file: &RetainedFile,
    index: &DeclarationIndex,
    mut accept: impl FnMut(&'static str, Value, &'static str) -> Result<(), Failure>,
) -> Result<std::collections::BTreeMap<String, SiteStatistics>, Failure> {
    let path = file.source_file["path"].as_str().unwrap();
    let mut statistics = file.analysis.site_statistics.clone();
    for symbol in &file.analysis.symbols {
        accept(
            "NODE",
            symbol_payload(request, &file.source_file, symbol),
            "FILE",
        )?;
    }
    if request.capabilities.iter().any(|c| c == "IMPORT") {
        for symbol in
            file.analysis.symbols.iter().filter(|s| {
                s.provider_kind == "java.package" && index.emits_package_container(&s.name)
            })
        {
            accept("NODE", package_node(request, &symbol.name), "SHARED")?;
        }
        accept(
            "NODE",
            json!({"providerId":"native","providerFactId":compilation_unit_id(path),
            "providerSnapshotId":request.snapshot_id,"repositoryId":request.repository_id,
            "revisionId":request.revision_id,"providerKind":"java.compilation_unit",
            "name":path,"qualifiedName":path,"sourceRange":null,
            "confidence":{"score":1,"method":"parser","reasons":[]}}),
            "FILE",
        )?;
    }
    for site in &file.analysis.relation_sites {
        let cap = relation_capability(site.kind);
        if !request.capabilities.iter().any(|c| c == cap) {
            continue;
        }
        let relation = index.resolve(path, site);
        let resolution = match &relation.target {
            RelationTarget::Resolved { resolution, .. }
            | RelationTarget::NonResolved { resolution, .. } => *resolution,
        };
        let buckets = &mut statistics.get_mut(cap).ok_or(INVALID)?.resolution_counts;
        let bucket = match resolution {
            "EXACT" => &mut buckets.exact,
            "HEURISTIC" => &mut buckets.heuristic,
            "AMBIGUOUS" => &mut buckets.ambiguous,
            "UNRESOLVED" => &mut buckets.unresolved,
            "UNSUPPORTED" => &mut buckets.unsupported,
            _ => return Err(INVALID),
        };
        *bucket = bucket.checked_add(1).ok_or(RESOURCE)?;
        accept(
            "EDGE",
            relation_payload(request, &file.source_file, relation),
            "FILE",
        )?;
    }
    Ok(statistics)
}

fn build_index(
    files: &[RetainedFile],
    limit: usize,
    check: &impl Fn() -> Result<(), Failure>,
) -> Result<DeclarationIndex, Failure> {
    let mut index = DeclarationIndex::new(limit);
    for file in files {
        check()?;
        let path = file.source_file["path"].as_str().unwrap();
        index
            .insert(path, &file.analysis.symbols)
            .map_err(|_| RESOURCE)?;
        index
            .insert_inheritance(path, &file.analysis.relation_sites)
            .map_err(|_| RESOURCE)?;
        index
            .set_file_imports(path, &file.analysis.relation_sites)
            .map_err(|_| RESOURCE)?;
    }
    Ok(index)
}

fn verify_baseline(
    request: &Request,
    files: &[RetainedFile],
    index: &DeclarationIndex,
    check: &impl Fn() -> Result<(), Failure>,
) -> Result<(), Failure> {
    for file in files {
        check()?;
        let mut count = 0usize;
        visit_facts(request, file, index, |kind, payload, ownership| {
            check()?;
            let digest = fact_content_digest(&payload);
            if !file.emitted_facts.iter().any(|fact| {
                fact["factType"] == kind
                    && fact["providerFactId"] == payload["providerFactId"]
                    && fact["contentDigest"] == digest
                    && fact["ownership"] == ownership
            }) {
                return Err(INVALID);
            }
            count = count.checked_add(1).ok_or(RESOURCE)?;
            Ok(())
        })?;
        if count != file.emitted_facts.len() {
            return Err(INVALID);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::*;
    use super::run_observed;
    use codeatlas_native_analyzer::request_v3::decode_request_v3;
    use std::fs;
    use std::sync::Mutex;

    struct Fixture {
        root: std::path::PathBuf,
        header: Value,
        summaries: Vec<Value>,
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            for name in ["Caller.java", "Added.java"] {
                let _ = fs::remove_file(self.root.join(name));
            }
            let _ = fs::remove_dir(&self.root);
        }
    }
    fn fixture(name: &str, shared: bool) -> Fixture {
        let root =
            std::env::temp_dir().join(format!("codeatlas-refresh-{name}-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let raw = include_str!("../../../../fixtures/ipc/protocol-v3/valid-refresh.jsonl");
        let mut header: Value = serde_json::from_str(raw.lines().next().unwrap()).unwrap();
        let mut files = Vec::new();
        for (name, source) in if shared {
            vec![
                ("Caller.java", "package p; import p.*; class Caller {}"),
                ("Added.java", "package p; class Added {}"),
            ]
        } else {
            vec![("Caller.java", "class Caller { void run() { Added.go(); } }")]
        } {
            fs::write(root.join(name), source).unwrap();
            let mut file: Value = serde_json::from_str::<Value>(raw.lines().nth(1).unwrap())
                .unwrap()["payload"]["sourceFile"]
                .clone();
            file["id"] = json!(name);
            file["path"] = json!(name);
            file["contentFingerprint"] =
                json!(format!("sha256:{:x}", Sha256::digest(source.as_bytes())));
            files.push(file);
        }
        let caps = vec!["SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"];
        let request = Request {
            protocol_version: 3,
            id: "full".into(),
            snapshot_id: "baseline".into(),
            repository_id: "r".into(),
            root: root.to_str().unwrap().into(),
            revision_id: "rev".into(),
            revision_fingerprint: "base".into(),
            capabilities: caps.iter().map(|s| s.to_string()).collect(),
            source_files: files.clone(),
            max_duration_ms: 10_000,
            max_memory_bytes: 256 * 1024 * 1024,
            max_events: 10_000,
            deadline_epoch_ms: None,
        };
        let mut state = header["payload"]["baselineState"].clone();
        state["requestedCapabilities"] = json!(caps);
        state["sourceFileCount"] = json!(files.len());
        let mut output = Vec::new();
        run_parsed(
            request,
            NonZeroUsize::new(1).unwrap(),
            &mut output,
            Some(state),
        )
        .unwrap();
        let events = events(&output);
        assert_eq!(events.last().unwrap()["type"], "ANALYSIS_COMPLETED");
        let summaries = events
            .iter()
            .filter(|e| e["type"] == "ANALYSIS_SUMMARY")
            .map(|e| e["payload"].clone())
            .collect();
        let p = &mut header["payload"];
        p["providerSnapshotId"] = json!("target");
        p["repository"]["rootPath"] = json!(root);
        p["resourceBudget"] =
            json!({"maxDurationMs":10_000,"maxMemoryBytes":256*1024*1024,"maxEvents":10_000});
        p["requestedCapabilities"] = json!(caps);
        p["targetSourceFiles"] = json!(files);
        p["baselineState"] = events.last().unwrap()["payload"]["analysisState"].clone();
        Fixture {
            root,
            header,
            summaries,
        }
    }
    fn events(bytes: &[u8]) -> Vec<Value> {
        bytes
            .split(|b| *b == b'\n')
            .filter(|s| !s.is_empty())
            .map(|s| serde_json::from_slice(s).unwrap())
            .collect()
    }
    fn execute(f: &mut Fixture) -> (Vec<Value>, Vec<String>) {
        f.summaries.sort_unstable_by(|a, b| {
            a["sourceFile"]["path"]
                .as_str()
                .cmp(&b["sourceFile"]["path"].as_str())
        });
        let mut canonical = Vec::new();
        write_canonical(&json!(f.summaries), &mut canonical).unwrap();
        f.header["payload"]["baselineState"]["summaryDigest"] =
            json!(format!("{:x}", Sha256::digest(canonical)));
        let mut bytes = serde_json::to_vec(&f.header).unwrap();
        bytes.push(b'\n');
        for (i, s) in f.summaries.iter().enumerate() {
            bytes.extend(serde_json::to_vec(&json!({"protocolVersion":3,"requestId":"req","sequence":i+1,"type":"BASELINE_SUMMARY","payload":s})).unwrap());
            bytes.push(b'\n');
        }
        let checksum = format!("{:x}", Sha256::digest(&bytes));
        bytes.extend(serde_json::to_vec(&json!({"protocolVersion":3,"requestId":"req","sequence":f.summaries.len()+1,"type":"REQUEST_COMPLETED",
            "payload":{"summaryRecords":f.summaries.len(),"integrityChecksum":checksum}})).unwrap());
        bytes.push(b'\n');
        let request = decode_request_v3(&bytes).unwrap();
        let paths = Mutex::new(Vec::new());
        let mut output = Vec::new();
        run_observed(&request, NonZeroUsize::new(1).unwrap(), &mut output, &|p| {
            paths.lock().unwrap().push(p.to_owned())
        })
        .unwrap();
        (events(&output), paths.into_inner().unwrap())
    }
    #[test]
    fn refresh_unknown_caller_resolves_without_parsing_caller() {
        let mut f = fixture("add", false);
        let source = b"class Added { static void go() {} }";
        fs::write(f.root.join("Added.java"), source).unwrap();
        let mut added = f.header["payload"]["targetSourceFiles"][0].clone();
        added["id"] = json!("Added.java");
        added["path"] = json!("Added.java");
        added["contentFingerprint"] = json!(format!("sha256:{:x}", Sha256::digest(source)));
        f.header["payload"]["targetRevision"]["contentFingerprint"] = json!("target");
        f.header["payload"]["targetSourceFiles"]
            .as_array_mut()
            .unwrap()
            .push(added.clone());
        f.header["payload"]["changes"]["added"] = json!([added]);
        let (events, paths) = execute(&mut f);
        assert_eq!(paths, vec!["Added.java"]);
        assert_eq!(events.last().unwrap()["type"], "REFRESH_COMPLETED");
        // Hand-derived from Added.java / java.method / owner Added / go / () / ordinal 0.
        let expected =
            "java-symbol-v1:8b7dba6e53f8c3e348437bd513755eca8093bd49d570cdb42fe7152f1a2af1f3";
        assert!(events.iter().any(|e| e["type"] == "UPSERT_EDGE"
            && e["payload"]["target"]["target"]["providerFactId"] == expected));
        assert!(
            events.iter().any(
                |e| e["type"] == "UPSERT_EDGE" && e["payload"]["target"]["state"] == "RESOLVED"
            )
        );
        assert_eq!(
            events.iter().filter(|e| e["type"] == "SOURCE_FILE").count(),
            1
        );
    }
    #[test]
    fn noop_parses_nothing() {
        let mut f = fixture("noop", false);
        fs::remove_file(f.root.join("Caller.java")).unwrap();
        let (events, paths) = execute(&mut f);
        assert!(paths.is_empty());
        assert_eq!(events.last().unwrap()["type"], "REFRESH_COMPLETED");
        assert!(
            !events
                .iter()
                .any(|e| e["type"].as_str().unwrap().starts_with("UPSERT_")
                    || e["type"].as_str().unwrap().starts_with("REMOVE_"))
        );
    }
    #[test]
    fn delete_only_parses_nothing() {
        let mut f = fixture("delete", false);
        let old = f.header["payload"]["targetSourceFiles"][0].clone();
        f.header["payload"]["targetSourceFiles"] = json!([]);
        f.header["payload"]["changes"]["deleted"] = json!([{"id":old["id"],"path":old["path"],"previousContentFingerprint":old["contentFingerprint"]}]);
        f.header["payload"]["targetRevision"]["contentFingerprint"] = json!("deleted");
        let (events, paths) = execute(&mut f);
        assert!(paths.is_empty());
        assert_eq!(events.last().unwrap()["type"], "REFRESH_COMPLETED");
        assert!(events.iter().any(|e| e["type"] == "REMOVE_NODE"));
    }
    #[test]
    fn forged_file_owner_rejected_even_with_same_union() {
        let mut f = fixture("forged", true);
        let first = f.summaries[0]["emittedFacts"].clone();
        f.summaries[0]["emittedFacts"] = f.summaries[1]["emittedFacts"].clone();
        f.summaries[1]["emittedFacts"] = first;
        let (events, paths) = execute(&mut f);
        assert!(paths.is_empty());
        assert_eq!(
            events.last().unwrap()["payload"]["error"]["code"],
            "INVALID_REQUEST"
        );
        assert!(!events.iter().any(|e| e["type"] == "REFRESH_COMPLETED"));
    }
    #[test]
    fn shared_container_all_owner_ledgers_match() {
        let mut f = fixture("shared", true);
        for s in &f.summaries {
            assert!(
                s["emittedFacts"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|e| e["ownership"] == "SHARED")
            );
        }
        let (events, paths) = execute(&mut f);
        assert!(paths.is_empty());
        assert_eq!(events.last().unwrap()["type"], "REFRESH_COMPLETED");
    }
    #[test]
    fn baseline_semantic_ledger_mismatch_refuses_before_parse() {
        let mut f = fixture("digest", false);
        f.summaries[0]["emittedFacts"][0]["contentDigest"] = json!("0".repeat(64));
        let (events, paths) = execute(&mut f);
        assert!(paths.is_empty());
        assert_eq!(
            events.last().unwrap()["payload"]["error"]["code"],
            "INVALID_REQUEST"
        );
    }

    #[test]
    fn refresh_event_exhaustion_keeps_one_reserved_failure_terminal() {
        let mut f = fixture("events", false);
        let source = b"class Caller { void run() {} }";
        fs::write(f.root.join("Caller.java"), source).unwrap();
        let p = &mut f.header["payload"];
        p["targetSourceFiles"][0]["contentFingerprint"] =
            json!(format!("sha256:{:x}", Sha256::digest(source)));
        p["changes"]["modified"] = json!([p["targetSourceFiles"][0]]);
        p["resourceBudget"]["maxEvents"] = json!(3);
        let (events, _) = execute(&mut f);
        assert_eq!(events.len(), 3);
        assert_eq!(
            events
                .iter()
                .filter(|e| e["type"] == "REFRESH_FAILED")
                .count(),
            1
        );
        assert_eq!(events.last().unwrap()["type"], "REFRESH_FAILED");
    }

    #[test]
    fn different_or_immutable_revision_refuses() {
        for mode in ["different", "immutable"] {
            let mut f = fixture(mode, false);
            let p = &mut f.header["payload"];
            if mode == "different" {
                p["targetRevision"]["id"] = json!("other");
                p["targetSourceFiles"][0]["revisionId"] = json!("other");
            } else {
                p["targetRevision"] = json!({"id":"rev","repositoryId":"r","kind":"COMMIT","contentFingerprint":"base","commitIdentity":"commit"});
            }
            let (events, paths) = execute(&mut f);
            assert!(paths.is_empty());
            assert_eq!(
                events.last().unwrap()["payload"]["error"]["code"],
                "INVALID_REQUEST"
            );
        }
    }

    #[test]
    fn refresh_admission_deadline_and_memory_refuse_before_parse() {
        for (mode, code) in [
            ("expired", "BUDGET_EXCEEDED"),
            ("memory", "RESOURCE_LIMIT_EXCEEDED"),
        ] {
            let mut f = fixture(mode, false);
            if mode == "expired" {
                f.header["payload"]["deadlineEpochMs"] = json!(0);
            } else {
                f.header["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(1);
            }
            let (events, paths) = execute(&mut f);
            assert!(paths.is_empty());
            assert_eq!(events.len(), 1);
            assert_eq!(events[0]["type"], "REQUEST_FAILED");
            assert_eq!(events[0]["payload"]["error"]["code"], code);
        }
    }

    #[test]
    fn refresh_budget_accepts_safe_integer_json_number_representation() {
        let mut f = fixture("float-budget", false);
        f.header["payload"]["resourceBudget"]["maxMemoryBytes"] = json!((256 * 1024 * 1024) as f64);
        let (events, paths) = execute(&mut f);
        assert!(paths.is_empty());
        assert_eq!(events.last().unwrap()["type"], "REFRESH_COMPLETED");
    }

    #[test]
    fn refresh_memory_accounting_overflow_is_resource_failure() {
        assert_eq!(super::add(usize::MAX, 1), Err(super::RESOURCE));
        assert_eq!(super::multiply(usize::MAX, 2), Err(super::RESOURCE));
    }

    #[test]
    fn refresh_retention_charges_diagnostic_vector_capacity_even_when_empty() {
        let analysis = LanguageAnalysis {
            symbols: Vec::new(),
            relation_sites: Vec::new(),
            diagnostics: Vec::with_capacity(256),
            coverage: SyntaxCoverage::Complete,
            site_statistics: std::collections::BTreeMap::new(),
        };
        let required = analysis.diagnostics.capacity()
            * std::mem::size_of::<codeatlas_native_analyzer::language::SyntaxDiagnostic>()
            + std::mem::size_of::<super::RetainedFile>();
        assert!(super::extraction_charge(&analysis).unwrap() >= required);
    }

    #[test]
    fn refresh_changed_fingerprint_and_language_fail_without_parser_invocation() {
        for (mode, code) in [
            ("drift", "SOURCE_CHANGED"),
            ("unsupported", "UNSUPPORTED_LANGUAGE"),
        ] {
            let mut f = fixture(mode, false);
            let p = &mut f.header["payload"];
            if mode == "drift" {
                p["targetSourceFiles"][0]["contentFingerprint"] = json!(format!(
                    "sha256:{:x}",
                    Sha256::digest(b"declared different bytes")
                ));
            } else {
                p["targetSourceFiles"][0]["languageHint"] = json!("python");
            }
            p["changes"]["modified"] = json!([p["targetSourceFiles"][0]]);
            let (events, paths) = execute(&mut f);
            assert!(paths.is_empty());
            assert_eq!(events.last().unwrap()["type"], "REFRESH_FAILED");
            assert_eq!(events.last().unwrap()["payload"]["error"]["code"], code);
            assert!(!events.iter().any(|e| e["type"] == "REFRESH_COMPLETED"));
        }
    }
}
