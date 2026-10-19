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
fn retain_upsert(
    pending: &mut Vec<(&'static str, Value)>,
    kind: &'static str,
    payload: Value,
    reserved: &mut usize,
    limit: usize,
    metadata_bytes: usize,
) -> Result<(), Failure> {
    let payload_bytes = value_charge(&payload)?;
    let slot = std::mem::size_of::<(&str, Value)>();
    let capacity = pending.capacity();
    let growing = pending.len() == capacity;
    let new_array = if growing {
        multiply(add(capacity, 1)?, slot)?
    } else {
        0
    };
    // reserved includes the old array; admit overlap with its replacement before allocation.
    if add(
        add(add(*reserved, payload_bytes)?, new_array)?,
        metadata_bytes,
    )? > limit
    {
        return Err(RESOURCE);
    }
    pending.try_reserve_exact(1).map_err(|_| RESOURCE)?;
    let growth = multiply(
        pending.capacity().checked_sub(capacity).ok_or(RESOURCE)?,
        slot,
    )?;
    let resident = add(add(*reserved, payload_bytes)?, growth)?;
    if add(resident, metadata_bytes)? > limit {
        return Err(RESOURCE);
    }
    // Value's inline storage is conservatively charged in both payload and array.
    *reserved = resident;
    pending.push((kind, payload));
    Ok(())
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
#[cfg(test)]
fn run_observed<W: Write, F: Fn(&str) + Sync>(
    validated: &ValidatedRequestV3,
    workers: NonZeroUsize,
    output: &mut W,
    on_parse: &F,
) -> io::Result<ExitCode> {
    run_with_observers(validated, workers, output, on_parse, &|_| {})
}
#[cfg(test)]
fn run_with_observers<W: Write, F: Fn(&str) + Sync, G: Fn(&str) + Sync>(
    validated: &ValidatedRequestV3,
    workers: NonZeroUsize,
    output: &mut W,
    on_parse: &F,
    on_parsed: &G,
) -> io::Result<ExitCode> {
    run_with_diagnostic(validated, workers, output, on_parse, on_parsed, None)
}

pub(super) fn run_diagnostic<W: Write>(
    validated: &ValidatedRequestV3,
    workers: NonZeroUsize,
    output: &mut W,
    observation: &dyn ParseObserver,
) -> io::Result<ExitCode> {
    run_with_diagnostic(
        validated,
        workers,
        output,
        &|_| {},
        &|_| {},
        Some(observation),
    )
}

fn run_with_diagnostic<W: Write, F: Fn(&str) + Sync, G: Fn(&str) + Sync>(
    validated: &ValidatedRequestV3,
    workers: NonZeroUsize,
    output: &mut W,
    on_parse: &F,
    on_parsed: &G,
    observation: Option<&dyn ParseObserver>,
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
    if let Some(observer) = observation {
        observer.begin();
    }
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
                    .enumerate()
                    .map(|(slot, file)| {
                        let cancel = &cancelled;
                        let root = &request.root;
                        scope.spawn(move || {
                            let result = if let Some(observer) = observation {
                                parse_source(
                                    root,
                                    file,
                                    deadline,
                                    cancel,
                                    true,
                                    Some((observer, slot)),
                                )
                            } else {
                                parse_source_observed(root, file, deadline, cancel, true, on_parse)
                            };
                            on_parsed(file["path"].as_str().unwrap());
                            result
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
        // Bounded preview and serialization/growth/envelope overlap during ordered output.
        reserved = add(reserved, multiply(3, MAX_LINE_BYTES)?)?;
        if reserved >= limit {
            return Err(RESOURCE);
        }
        stream.full =
            Some(FullMetadata::new(Value::Object(state), limit - reserved).map_err(|_| RESOURCE)?);
        let mut target = Vec::<FactDigest>::new();
        let mut pending = Vec::new();
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
                    retain_upsert(
                        &mut pending,
                        kind,
                        payload,
                        &mut reserved,
                        limit,
                        stream.full.as_ref().unwrap().used_bytes(),
                    )?;
                    stream.full.as_mut().unwrap().memory_budget = limit - reserved;
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
        pending.sort_unstable_by(|(ka, a), (kb, b)| {
            (ka, a["providerFactId"].as_str()).cmp(&(kb, b["providerFactId"].as_str()))
        });
        for (kind, payload) in pending {
            check()?;
            let event = if kind == "NODE" {
                "UPSERT_NODE"
            } else {
                "UPSERT_EDGE"
            };
            // Verify the whole next line within the reserved scratch before EventWriter allocates it.
            let envelope = json!({"protocolVersion":stream.protocol_version,"requestId":stream.request_id,
                "sequence":stream.sequence,"type":event,"payload":null});
            let mut bounded = LimitedBytes::new(MAX_LINE_BYTES + 3);
            serde_json::to_writer(&mut bounded, &envelope).map_err(|_| RESOURCE)?;
            serde_json::to_writer(&mut bounded, &payload).map_err(|_| RESOURCE)?;
            // Replacing four-byte null with payload and adding LF gives the exact wire length.
            if bounded.bytes.len() - 3 > MAX_LINE_BYTES {
                return Err(RESOURCE);
            }
            drop(bounded);
            if !stream
                .emit(event, payload, false)
                .map_err(|_| ("INTERNAL_ANALYZER_FAILURE", "Output write failed"))?
            {
                return Ok(false);
            }
            let key = if kind == "NODE" {
                "upsertedNodes"
            } else {
                "upsertedEdges"
            };
            counts[key] = json!(counts[key].as_u64().unwrap() + 1);
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
    use super::{RESOURCE, retain_upsert, run_observed, value_charge};
    use codeatlas_native_analyzer::request_v3::decode_request_v3;
    use std::fs;
    use std::sync::Mutex;

    #[test]
    fn pending_upsert_budget_covers_payload_and_transient_capacity_growth() {
        let payload = json!({"providerFactId":"fact-a"});
        let charge = value_charge(&payload).unwrap();
        let slot = std::mem::size_of::<(&str, Value)>();
        let mut pending = Vec::new();
        let mut reserved = 10;
        assert_eq!(
            retain_upsert(
                &mut pending,
                "NODE",
                payload.clone(),
                &mut reserved,
                10 + charge + slot + 20 - 1,
                20
            ),
            Err(RESOURCE)
        );
        assert!(pending.is_empty());
        assert_eq!(reserved, 10);
        retain_upsert(
            &mut pending,
            "NODE",
            payload.clone(),
            &mut reserved,
            10 + charge + slot + 20,
            20,
        )
        .unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(reserved, 10 + charge + slot);
        let before = reserved;
        let peak = before + charge + 2 * slot + 20;
        assert_eq!(
            retain_upsert(
                &mut pending,
                "EDGE",
                payload.clone(),
                &mut reserved,
                peak - 1,
                20
            ),
            Err(RESOURCE)
        );
        assert_eq!(pending.len(), 1);
        assert_eq!(reserved, before);
        retain_upsert(&mut pending, "EDGE", payload, &mut reserved, peak, 20).unwrap();
        assert_eq!(reserved, before + charge + slot);
    }
    #[test]
    fn pending_upsert_accounting_overflow_refuses_without_retention() {
        let mut pending = Vec::new();
        let mut reserved = usize::MAX;
        assert_eq!(
            retain_upsert(
                &mut pending,
                "NODE",
                json!({"providerFactId":"x"}),
                &mut reserved,
                usize::MAX,
                0
            ),
            Err(RESOURCE)
        );
        assert!(pending.is_empty());
    }
    struct Fixture {
        root: std::path::PathBuf,
        header: Value,
        summaries: Vec<Value>,
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            if let Ok(entries) = fs::read_dir(&self.root) {
                for entry in entries.flatten() {
                    let _ = fs::remove_file(entry.path());
                }
            }
            let _ = fs::remove_dir(&self.root);
        }
    }
    fn fixture(name: &str, shared: bool) -> Fixture {
        let sources = if shared {
            vec![
                (
                    "Caller.java".into(),
                    "package p; import p.*; class Caller {}".into(),
                ),
                ("Added.java".into(), "package p; class Added {}".into()),
            ]
        } else {
            vec![(
                "Caller.java".into(),
                "class Caller { void run() { Added.go(); } }".into(),
            )]
        };
        fixture_sources(name, &sources)
    }
    fn fixture_sources(name: &str, sources: &[(String, String)]) -> Fixture {
        let root =
            std::env::temp_dir().join(format!("codeatlas-refresh-{name}-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let raw = include_str!("../../../../fixtures/ipc/protocol-v3/valid-refresh.jsonl");
        let mut header: Value = serde_json::from_str(raw.lines().next().unwrap()).unwrap();
        let mut files = Vec::new();
        for (name, source) in sources {
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
            None,
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
    #[test]
    fn registered_c2_transitions_parse_only_declared_changed_files_after_restart() {
        let manifest: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/native/java-refresh-producer/expected/transitions.json"
        ))
        .unwrap();
        let source_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-refresh-producer/source");
        for row in manifest["cases"].as_array().unwrap() {
            let read_sources = |inventory: &Value| {
                inventory
                    .as_object()
                    .unwrap()
                    .iter()
                    .map(|(name, artifact)| {
                        (
                            name.clone(),
                            fs::read_to_string(source_root.join(artifact.as_str().unwrap()))
                                .unwrap(),
                        )
                    })
                    .collect::<Vec<_>>()
            };
            let before = read_sources(&row["baseline"]);
            let mut f =
                fixture_sources(&format!("counts-{}", row["id"].as_str().unwrap()), &before);
            let old = f.header["payload"]["targetSourceFiles"]
                .as_array()
                .unwrap()
                .clone();
            let after = read_sources(&row["target"]);
            let mut target = Vec::new();
            for (name, source) in &after {
                fs::write(f.root.join(name), source).unwrap();
                let mut file: Value = serde_json::from_str::<Value>(
                    include_str!("../../../../fixtures/ipc/protocol-v3/valid-refresh.jsonl")
                        .lines()
                        .nth(1)
                        .unwrap(),
                )
                .unwrap()["payload"]["sourceFile"]
                    .clone();
                file["id"] = json!(name);
                file["path"] = json!(name);
                file["contentFingerprint"] =
                    json!(format!("sha256:{:x}", Sha256::digest(source.as_bytes())));
                if let Some(role) = row["classificationChange"].as_str() {
                    file["classification"]["role"] = json!(role);
                }
                target.push(file);
            }
            let added: Vec<_> = target
                .iter()
                .filter(|f| !old.iter().any(|o| o["id"] == f["id"]))
                .cloned()
                .collect();
            let modified: Vec<_> = target
                .iter()
                .filter(|f| old.iter().any(|o| o["id"] == f["id"] && o != *f))
                .cloned()
                .collect();
            let deleted: Vec<_> = old.iter().filter(|o| !target.iter().any(|f| o["id"] == f["id"])).map(|o| {
                fs::remove_file(f.root.join(o["path"].as_str().unwrap())).unwrap();
                json!({"id":o["id"],"path":o["path"],"previousContentFingerprint":o["contentFingerprint"]})
            }).collect();
            f.header["payload"]["targetSourceFiles"] = json!(target);
            f.header["payload"]["changes"] =
                json!({"added":added,"modified":modified,"deleted":deleted});
            f.header["payload"]["targetRevision"]["contentFingerprint"] = json!("target-c2");
            let (events, mut paths) = execute(&mut f);
            assert_eq!(
                events.last().unwrap()["type"],
                "REFRESH_COMPLETED",
                "{}",
                row["id"]
            );
            paths.sort();
            assert_eq!(json!(paths), row["changed"], "{}", row["id"]);
            assert_eq!(events.last().unwrap()["payload"]["outcome"], row["outcome"]);
            f.summaries = events
                .iter()
                .filter(|e| e["type"] == "ANALYSIS_SUMMARY")
                .map(|e| e["payload"].clone())
                .collect();
            f.header["payload"]["baselineState"] =
                events.last().unwrap()["payload"]["analysisState"].clone();
            f.header["payload"]["baseRevisionFingerprint"] = json!("target-c2");
            f.header["payload"]["changes"] = json!({"added":[],"modified":[],"deleted":[]});
            // Remove even retained source bytes: the next invocation must use summaries alone.
            for (name, _) in after {
                fs::remove_file(f.root.join(name)).unwrap();
            }
            let (restarted, paths) = execute(&mut f);
            assert!(paths.is_empty(), "{}", row["id"]);
            assert_eq!(
                restarted.last().unwrap()["type"],
                "REFRESH_COMPLETED",
                "{}",
                row["id"]
            );
            assert_eq!(
                restarted.last().unwrap()["payload"]["outcome"],
                row["outcome"]
            );
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
        let request = validated(f);
        let paths = Mutex::new(Vec::new());
        let mut output = Vec::new();
        run_observed(&request, NonZeroUsize::new(1).unwrap(), &mut output, &|p| {
            paths.lock().unwrap().push(p.to_owned())
        })
        .unwrap();
        (events(&output), paths.into_inner().unwrap())
    }
    fn validated(f: &mut Fixture) -> codeatlas_native_analyzer::request_v3::ValidatedRequestV3 {
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
        decode_request_v3(&bytes).unwrap()
    }
    fn two_changed(name: &str) -> Fixture {
        let mut f = fixture(name, false);
        let mut changed = Vec::new();
        for (name, source) in [
            (
                "Caller.java",
                "class Caller { void run() { Added.go(); Added.go(); } }",
            ),
            ("Added.java", "class Added { static void go() {} }"),
        ] {
            fs::write(f.root.join(name), source).unwrap();
            let mut file = f.header["payload"]["targetSourceFiles"][0].clone();
            file["id"] = json!(name);
            file["path"] = json!(name);
            file["contentFingerprint"] =
                json!(format!("sha256:{:x}", Sha256::digest(source.as_bytes())));
            changed.push(file);
        }
        f.header["payload"]["targetSourceFiles"] = json!(changed);
        f.header["payload"]["targetRevision"]["contentFingerprint"] = json!("two-changed");
        f.header["payload"]["changes"] =
            json!({"added":[changed[1]],"modified":[changed[0]],"deleted":[]});
        f
    }
    #[test]
    fn retained_index_and_relation_verification_obey_cooperative_deadline_checks() {
        let f = fixture("retained-deadline-checks", true);
        let files = f
            .summaries
            .iter()
            .map(|s| super::decode_retained_file(s).unwrap())
            .collect::<Vec<_>>();
        let checks = std::cell::Cell::new(0);
        let expired = || {
            checks.set(checks.get() + 1);
            if checks.get() == 2 {
                Err(("BUDGET_EXCEEDED", "Refresh deadline exceeded"))
            } else {
                Ok(())
            }
        };
        let result = super::build_index(&files, 256 * 1024 * 1024, &expired);
        assert!(matches!(result, Err(("BUDGET_EXCEEDED", _))));
        assert_eq!(
            checks.get(),
            2,
            "refuse inside retained index reconstruction"
        );
        let index = super::build_index(&files, 256 * 1024 * 1024, &|| Ok(())).unwrap();
        let request = Request {
            protocol_version: 3,
            id: "full".into(),
            snapshot_id: "baseline".into(),
            repository_id: "r".into(),
            root: f.root.to_str().unwrap().into(),
            revision_id: "rev".into(),
            revision_fingerprint: "base".into(),
            capabilities: vec!["SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
            source_files: files.iter().map(|f| f.source_file.clone()).collect(),
            max_duration_ms: 10_000,
            max_memory_bytes: 256 * 1024 * 1024,
            max_events: 10_000,
            deadline_epoch_ms: None,
        };
        checks.set(0);
        assert!(matches!(
            super::verify_baseline(&request, &files, &index, &expired),
            Err(("BUDGET_EXCEEDED", _))
        ));
        assert_eq!(
            checks.get(),
            2,
            "refuse inside per-fact regeneration, without parsing"
        );
    }
    #[test]
    fn forced_opposite_worker_completion_orders_preserve_exact_output_and_counts() {
        let mut f = two_changed("completion-order");
        let request = validated(&mut f);
        let mut outputs = Vec::new();
        for first in ["Added.java", "Caller.java"] {
            let (release, arrived) = std::sync::mpsc::channel();
            let arrived = Mutex::new(arrived);
            let order = Mutex::new(Vec::new());
            let parses = Mutex::new(Vec::new());
            let mut output = Vec::new();
            super::run_with_observers(
                &request,
                NonZeroUsize::new(2).unwrap(),
                &mut output,
                &|p| parses.lock().unwrap().push(p.to_owned()),
                &|p| {
                    if p != first {
                        arrived
                            .lock()
                            .unwrap()
                            .recv_timeout(Duration::from_secs(1))
                            .unwrap();
                    }
                    order.lock().unwrap().push(p.to_owned());
                    if p == first {
                        release.send(()).unwrap();
                    }
                },
            )
            .unwrap();
            assert_eq!(order.lock().unwrap()[0], first);
            let mut parses = parses.into_inner().unwrap();
            parses.sort();
            assert_eq!(parses, vec!["Added.java", "Caller.java"]);
            let observed = events(&output);
            assert_eq!(observed.last().unwrap()["type"], "REFRESH_COMPLETED");
            for kind in ["UPSERT_NODE", "UPSERT_EDGE", "REMOVE_NODE", "REMOVE_EDGE"] {
                let ids = observed
                    .iter()
                    .filter(|e| e["type"] == kind)
                    .map(|e| e["payload"]["providerFactId"].as_str().unwrap())
                    .collect::<Vec<_>>();
                assert!(ids.windows(2).all(|pair| pair[0] < pair[1]), "{kind}");
            }
            outputs.push(output);
        }
        assert_eq!(outputs[0], outputs[1]);
        let mut single = Vec::new();
        run_observed(
            &request,
            NonZeroUsize::new(1).unwrap(),
            &mut single,
            &|_| {},
        )
        .unwrap();
        assert_eq!(single, outputs[0]);
    }
    #[test]
    fn parser_worker_exception_is_failed_observation_not_completed_state() {
        let mut f = two_changed("panic");
        let request = validated(&mut f);
        let mut output = Vec::new();
        run_observed(
            &request,
            NonZeroUsize::new(2).unwrap(),
            &mut output,
            &|_| panic!("private parser exception"),
        )
        .unwrap();
        let observed = events(&output);
        assert_eq!(observed.last().unwrap()["type"], "REFRESH_FAILED");
        assert_eq!(
            observed.last().unwrap()["payload"]["error"]["code"],
            "INTERNAL_ANALYZER_FAILURE"
        );
        assert!(!observed.iter().any(|e| e["type"] == "REFRESH_COMPLETED"));
    }
    #[test]
    fn blocked_protocol_writer_prevents_parsing_until_drain() {
        struct Blocked {
            bytes: Vec<u8>,
            blocked: std::sync::mpsc::Sender<()>,
            release: std::sync::mpsc::Receiver<()>,
        }
        impl Write for Blocked {
            fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
                if self.bytes.is_empty() {
                    self.blocked.send(()).unwrap();
                    self.release.recv_timeout(Duration::from_secs(1)).unwrap();
                }
                self.bytes.extend_from_slice(bytes);
                Ok(bytes.len())
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        let mut f = two_changed("backpressure");
        let request = validated(&mut f);
        let (blocked, observe_blocked) = std::sync::mpsc::channel();
        let (release, observe_release) = std::sync::mpsc::channel();
        let parses = Mutex::new(Vec::new());
        std::thread::scope(|scope| {
            let job = scope.spawn(|| {
                let mut output = Blocked {
                    bytes: Vec::new(),
                    blocked,
                    release: observe_release,
                };
                run_observed(&request, NonZeroUsize::new(2).unwrap(), &mut output, &|p| {
                    parses.lock().unwrap().push(p.to_owned())
                })
                .unwrap();
                output.bytes
            });
            observe_blocked
                .recv_timeout(Duration::from_secs(1))
                .unwrap();
            assert!(parses.lock().unwrap().is_empty());
            release.send(()).unwrap();
            let output = job.join().unwrap();
            assert_eq!(events(&output).last().unwrap()["type"], "REFRESH_COMPLETED");
        });
        let mut paths = parses.into_inner().unwrap();
        paths.sort();
        assert_eq!(paths, vec!["Added.java", "Caller.java"]);
    }
    #[test]
    fn partial_protocol_write_error_never_returns_a_complete_observation() {
        struct Broken {
            bytes: Vec<u8>,
        }
        impl Write for Broken {
            fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
                if !self.bytes.is_empty() {
                    return Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed consumer"));
                }
                let len = bytes.len().min(11);
                self.bytes.extend_from_slice(&bytes[..len]);
                Ok(len)
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        let mut f = two_changed("write-error");
        let request = validated(&mut f);
        let mut output = Broken { bytes: Vec::new() };
        let parses = Mutex::new(Vec::new());
        assert!(
            run_observed(&request, NonZeroUsize::new(2).unwrap(), &mut output, &|p| {
                parses.lock().unwrap().push(p.to_owned())
            })
            .is_err()
        );
        assert_eq!(output.bytes.len(), 11);
        assert!(!output.bytes.ends_with(b"\n"));
        assert!(parses.into_inner().unwrap().is_empty());
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
    fn ordered_refresh_workspace_boundary_fails_closed_after_changed_only_parsing() {
        let mut f = two_changed("ordered-workspace-boundary");
        // Derive this Fixture's admission boundary; this is not a policy/RSS threshold.
        let (mut low, mut high) = (1_u64, 256 * 1024 * 1024);
        while low < high {
            let middle = low + (high - low) / 2;
            f.header["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(middle);
            let (observed, _) = execute(&mut f);
            if observed.last().unwrap()["type"] == "REFRESH_COMPLETED" {
                high = middle;
            } else {
                low = middle + 1;
            }
        }
        f.header["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(low);
        let (success, _) = execute(&mut f);
        assert_eq!(success.last().unwrap()["type"], "REFRESH_COMPLETED");
        f.header["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(low - 1);
        let (failed, mut paths) = execute(&mut f);
        paths.sort();
        assert_eq!(paths, vec!["Added.java", "Caller.java"]);
        assert_eq!(failed.last().unwrap()["type"], "REFRESH_FAILED");
        assert_eq!(
            failed.last().unwrap()["payload"]["error"]["code"],
            "RESOURCE_LIMIT_EXCEEDED"
        );
        assert!(!failed.iter().any(|e| e["type"] == "REFRESH_COMPLETED"));
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
