use std::collections::HashSet;
use std::io::{self, Write};
use std::num::NonZeroUsize;
use std::path::Path;
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use codeatlas_native_analyzer::analysis_state::write_canonical;
use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::java_relations::compilation_unit_id;
use codeatlas_native_analyzer::language::{
    LanguageAnalysis, RelationKind, RelationTarget, ResolvedRelation, SiteStatistics, SymbolFact,
    SyntaxCoverage,
};
use codeatlas_native_analyzer::relation_index::{DeclarationIndex, package_container_fact_id};
use codeatlas_native_analyzer::source_access::{SourceAccessError, read_verified_source};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

const MAX_LINE_BYTES: usize = 1_000_000;
const MAX_EVENT_COUNT: u64 = 10_000;
const MAX_TOTAL_BYTES: u64 = 10_000_000;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
// Five pinned Windows MSVC debug runs peaked at 5.51 MiB (basic) and 2.98 MiB
// (nested); 16 MiB reserves headroom for each parser plus one bounded source.
const WORKER_RESERVATION_BYTES: u64 = 16 * 1024 * 1024;
// The 2026-09-25 dense-source benchmark observed 14.71 MiB peak for 63,014
// source bytes and 17.93 MiB for 97,904 bytes. Admit only the measured-safe
// size band under the 16 MiB worker reservation; this is not a hard RSS cap.
const SOURCE_BYTES_PER_WORKER: usize = 64 * 1024;
const RESULT_BYTES_PER_WORKER: usize = (WORKER_RESERVATION_BYTES / 4) as usize;
const JAVA_RESOLVER_VERSION: &str = "1";

struct Request {
    protocol_version: u64,
    id: String,
    snapshot_id: String,
    repository_id: String,
    root: String,
    revision_id: String,
    revision_fingerprint: String,
    capabilities: Vec<String>,
    source_files: Vec<Value>,
    max_duration_ms: u64,
    max_memory_bytes: u64,
    max_events: u64,
    deadline_epoch_ms: Option<i64>,
}

pub(crate) fn run<W: Write, E: Write>(
    request: Value,
    worker_count: NonZeroUsize,
    output: &mut W,
    _diagnostics: &mut E,
) -> io::Result<ExitCode> {
    let request_id = request
        .get("requestId")
        .and_then(exact)
        .unwrap_or("")
        .to_owned();
    let parsed = parse_request(&request);
    let request = match parsed {
        Some(request) => request,
        None => {
            if request_id.is_empty() {
                return Ok(ExitCode::from(2));
            }
            let version = if request["protocolVersion"] == 2 {
                2
            } else {
                1
            };
            let code = if request["protocolVersion"]
                .as_u64()
                .is_some_and(|value| value != 1 && value != 2)
            {
                "INCOMPATIBLE_PROTOCOL_VERSION"
            } else {
                "INVALID_REQUEST"
            };
            write_one(
                output,
                json!({"protocolVersion": version, "requestId": request_id, "sequence": 0,
                "type": "REQUEST_FAILED", "payload": {"error": error(code, "Invalid ANALYZE request", false)}}),
            )?;
            return Ok(ExitCode::SUCCESS);
        }
    };
    run_parsed(request, worker_count, output, None)
}

pub(crate) fn run_full_v3<W: Write>(
    header: &Value,
    worker_count: NonZeroUsize,
    output: &mut W,
) -> io::Result<ExitCode> {
    let context = &header["payload"]["analysisStateContext"];
    let language = &context["language"];
    let compatible = context["providerId"] == "native"
        && context["providerVersion"] == env!("CARGO_PKG_VERSION")
        && context["resolverVersion"] == JAVA_RESOLVER_VERSION
        && language["languageId"] == "java"
        && language["grammarVersion"] == "0.23.5"
        && language["analyzerVersion"] == env!("CARGO_PKG_VERSION")
        && language["compatibilityVersion"] == "1";
    // Reuse legacy semantic/source admission without widening its wire schema.
    let mut legacy = header.clone();
    legacy["protocolVersion"] = json!(2);
    legacy.as_object_mut().unwrap().remove("sequence");
    let payload = legacy["payload"].as_object_mut().unwrap();
    payload.remove("analysisStateContext");
    payload.remove("baselineState");
    let parsed = parse_request(&legacy);
    if !compatible || parsed.is_none() {
        write_one(
            output,
            json!({"protocolVersion":3,"requestId":header["requestId"],
            "sequence":0,"type":"REQUEST_FAILED","payload":{"error":error(
                "INVALID_REQUEST","Invalid full analysis context",false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    let mut request = parsed.unwrap();
    request.protocol_version = 3;
    let mut state = context.as_object().unwrap().clone();
    state.insert("schemaVersion".into(), json!(1));
    state.insert("repositoryId".into(), json!(request.repository_id));
    state.insert("revisionId".into(), json!(request.revision_id));
    state.insert(
        "contentFingerprint".into(),
        json!(request.revision_fingerprint),
    );
    state.insert("requestedCapabilities".into(), json!(request.capabilities));
    state.insert("sourceFileCount".into(), json!(request.source_files.len()));
    state.insert("summaryDigest".into(), json!("0".repeat(64)));
    drop(legacy);
    run_parsed(request, worker_count, output, Some(Value::Object(state)))
}

fn run_parsed<W: Write>(
    request: Request,
    worker_count: NonZeroUsize,
    output: &mut W,
    state: Option<Value>,
) -> io::Result<ExitCode> {
    if !request
        .capabilities
        .iter()
        .any(|capability| capability == "SYMBOL")
        || request.capabilities.iter().any(|capability| {
            !matches!(
                capability.as_str(),
                "SYMBOL" | "IMPORT" | "CALL" | "INHERITANCE" | "REFERENCE"
            )
        })
    {
        write_one(
            output,
            json!({"protocolVersion": request.protocol_version, "requestId": request.id, "sequence": 0,
            "type": "REQUEST_FAILED", "payload": {"error": error("UNSUPPORTED_CAPABILITY", "Requested capability is unsupported", false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    if request.max_events < 2 {
        write_one(
            output,
            json!({"protocolVersion": request.protocol_version, "requestId": request.id, "sequence": 0,
            "type": "REQUEST_FAILED", "payload": {"error": error("RESOURCE_LIMIT_EXCEEDED", "Event budget is too small", false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    if (worker_count.get() as u64).saturating_mul(WORKER_RESERVATION_BYTES)
        > request.max_memory_bytes
    {
        write_one(
            output,
            json!({"protocolVersion": request.protocol_version, "requestId": request.id, "sequence": 0,
            "type": "REQUEST_FAILED", "payload": {"error": error("RESOURCE_LIMIT_EXCEEDED", "Parse workers exceed memory budget", false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    let context = json!({
        "providerSnapshotId": request.snapshot_id,
        "repositoryId": request.repository_id,
        "revisionId": request.revision_id,
        "revisionFingerprint": request.revision_fingerprint,
    });
    let mut stream = EventWriter::new(
        output,
        &request.id,
        &context,
        request.max_events,
        request.protocol_version,
    );
    if let Some(state) = state {
        let full = FullMetadata::new(
            state,
            usize::try_from(request.max_memory_bytes.saturating_sub(
                (worker_count.get() as u64).saturating_mul(WORKER_RESERVATION_BYTES),
            ))
            .unwrap_or(usize::MAX),
        );
        match full {
            Ok(full) => stream.full = Some(full),
            Err(_) => {
                write_one(
                    stream.output,
                    json!({"protocolVersion":3,"requestId":request.id,"sequence":0,
                    "type":"REQUEST_FAILED","payload":{"error":error("RESOURCE_LIMIT_EXCEEDED","Summary context exceeds budget",false)}}),
                )?;
                return Ok(ExitCode::SUCCESS);
            }
        }
    }
    if stream.failure_reservation()? > MAX_LINE_BYTES as u64 {
        write_one(
            stream.output,
            json!({"protocolVersion": request.protocol_version, "requestId": request.id, "sequence": 0,
            "type": "REQUEST_FAILED", "payload": {"error": error("RESOURCE_LIMIT_EXCEEDED", "Request context exceeds output limit", false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    if !stream.emit("ANALYSIS_STARTED", context.clone(), false)? {
        return Ok(ExitCode::SUCCESS);
    }
    if request
        .capabilities
        .iter()
        .any(|capability| capability != "SYMBOL")
    {
        return run_relations(&request, worker_count, &context, &mut stream, || {});
    }
    let started = Instant::now();
    let mut counts = Counts::default();
    let mut partial = false;
    // At most one batch of worker_count files is parsed before output drains.
    // Holding a later completed result can therefore never accumulate across batches.
    for chunk in request.source_files.chunks(worker_count.get()) {
        let remaining = remaining_budget(&request, started);
        if remaining.is_zero() {
            return stream.fail(&context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
        }
        let root = request.root.clone();
        let Some(results) = timed_batch(chunk, remaining, move |file, deadline, cancelled| {
            parse_source(&root, &file, deadline, cancelled, false)
        }) else {
            return stream.fail(&context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
        };
        for (source_file, result) in chunk.iter().zip(results) {
            if started.elapsed().as_millis() >= u128::from(request.max_duration_ms)
                || request
                    .deadline_epoch_ms
                    .is_some_and(|deadline| now_epoch_ms() >= deadline)
            {
                return stream.fail(&context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
            }
            let analysis = match result {
                Ok(Ok(analysis)) => analysis,
                Ok(Err(ProcessingError::Source(error))) => {
                    let (code, message) = source_error(&error);
                    return stream.fail(&context, code, message);
                }
                Ok(Err(ProcessingError::Unsupported)) => {
                    return stream.fail(
                        &context,
                        "UNSUPPORTED_LANGUAGE",
                        "Source language is unsupported",
                    );
                }
                Ok(Err(ProcessingError::Ineligible)) => {
                    return stream.fail(
                        &context,
                        "INVALID_REQUEST",
                        "Source is not eligible Java text",
                    );
                }
                Ok(Err(ProcessingError::Deadline)) => {
                    return stream.fail(&context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
                }
                Ok(Err(ProcessingError::ResourceLimit)) => {
                    return stream.fail(
                        &context,
                        "RESOURCE_LIMIT_EXCEEDED",
                        "Parse result exceeds worker reservation",
                    );
                }
                Ok(Err(ProcessingError::Parser)) | Err(_) => {
                    return stream.fail(&context, "INTERNAL_ANALYZER_FAILURE", "Java parse failed");
                }
            };
            if !stream.has_room(analysis.symbols.len() + analysis.diagnostics.len() + 2) {
                return stream.fail(&context, "RESOURCE_LIMIT_EXCEEDED", "Event budget exceeded");
            }
            if !stream.emit("SOURCE_FILE", source_file.clone(), false)? {
                return Ok(ExitCode::SUCCESS);
            }
            counts.source_files += 1;
            for symbol in &analysis.symbols {
                if !stream.emit("NODE", symbol_payload(&request, source_file, symbol), false)? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.nodes += 1;
            }
            let coverage = match analysis.coverage {
                SyntaxCoverage::Complete => "COMPLETE",
                SyntaxCoverage::Partial => {
                    partial = true;
                    "PARTIAL"
                }
            };
            if !stream.emit(
                "COVERAGE",
                coverage_payload(
                    &request,
                    "SYMBOL",
                    &source_file["id"],
                    coverage,
                    &analysis.site_statistics["SYMBOL"],
                ),
                false,
            )? {
                return Ok(ExitCode::SUCCESS);
            }
            counts.coverage += 1;
            for diagnostic in &analysis.diagnostics {
                let range = diagnostic.span.as_ref().map(|span| {
                    json!({"sourceFileId": source_file["id"],
                "startLine": span.start_line, "startColumn": span.start_column,
                "endLine": span.end_line, "endColumn": span.end_column})
                });
                if !stream.emit(
                    "DIAGNOSTIC",
                    json!({"code": diagnostic.code, "severity": "WARNING",
                "message": diagnostic.message, "sourceRange": range}),
                    false,
                )? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.diagnostics += 1;
            }
            if !stream.emit_summary(
                source_file,
                &analysis,
                &analysis.site_statistics,
                &request,
                None,
            )? {
                return Ok(ExitCode::SUCCESS);
            }
        }
    }
    if request.protocol_version == 3 && remaining_budget(&request, started).is_zero() {
        return stream.fail(&context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
    }
    let checksum = stream.checksum();
    let mut terminal = context.as_object().expect("context object").clone();
    terminal.insert(
        "outcome".into(),
        json!(if partial { "PARTIAL" } else { "SUCCEEDED" }),
    );
    terminal.insert("counts".into(), counts.to_value());
    terminal.insert(
        "capabilities".into(),
        json!([{"name": "SYMBOL", "support": "SUPPORTED",
        "coverage": if partial { "PARTIAL" } else { "COMPLETE" }}]),
    );
    terminal.insert(
        "contentFingerprint".into(),
        json!(if request.protocol_version == 3 {
            &request.revision_fingerprint
        } else {
            &checksum
        }),
    );
    terminal.insert("integrityChecksum".into(), json!(checksum));
    stream.finish_state(&mut terminal);
    stream.emit("ANALYSIS_COMPLETED", Value::Object(terminal), true)?;
    Ok(ExitCode::SUCCESS)
}

fn run_relations<W: Write>(
    request: &Request,
    worker_count: NonZeroUsize,
    context: &Value,
    stream: &mut EventWriter<'_, W>,
    before_second_pass: impl FnOnce(),
) -> io::Result<ExitCode> {
    let started = Instant::now();
    let worker_bytes = (worker_count.get() as u64).saturating_mul(WORKER_RESERVATION_BYTES);
    let index_budget = request.max_memory_bytes.saturating_sub(worker_bytes);
    if index_budget == 0 {
        return stream.fail(
            context,
            "RESOURCE_LIMIT_EXCEEDED",
            "Declaration index exceeds memory budget",
        );
    }
    let mut index = DeclarationIndex::new(usize::try_from(index_budget).unwrap_or(usize::MAX));
    for chunk in request.source_files.chunks(worker_count.get()) {
        let remaining = remaining_budget(request, started);
        if remaining.is_zero() {
            return stream.fail(context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
        }
        let root = request.root.clone();
        let Some(results) = timed_batch(chunk, remaining, move |file, deadline, cancelled| {
            parse_source(&root, &file, deadline, cancelled, true)
        }) else {
            return stream.fail(context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
        };
        for (source_file, result) in chunk.iter().zip(results) {
            let analysis = match checked_result(result) {
                Ok(analysis) => analysis,
                Err((code, message)) => return stream.fail(context, code, message),
            };
            let path = source_file["path"].as_str().expect("validated path");
            if index.insert(path, &analysis.symbols).is_err() {
                return stream.fail(
                    context,
                    "RESOURCE_LIMIT_EXCEEDED",
                    "Declaration index exceeds memory budget",
                );
            }
            if index
                .insert_inheritance(path, &analysis.relation_sites)
                .is_err()
            {
                return stream.fail(
                    context,
                    "RESOURCE_LIMIT_EXCEEDED",
                    "Inheritance index exceeds memory budget",
                );
            }
            if index
                .set_file_imports(path, &analysis.relation_sites)
                .is_err()
            {
                return stream.fail(
                    context,
                    "RESOURCE_LIMIT_EXCEEDED",
                    "Import index exceeds memory budget",
                );
            }
        }
    }

    before_second_pass();
    let mut counts = Counts::default();
    let mut partial = false;
    for chunk in request.source_files.chunks(worker_count.get()) {
        let remaining = remaining_budget(request, started);
        if remaining.is_zero() {
            return stream.fail(context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
        }
        let root = request.root.clone();
        let Some(results) = timed_batch(chunk, remaining, move |file, deadline, cancelled| {
            parse_source(&root, &file, deadline, cancelled, true)
        }) else {
            return stream.fail(context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
        };
        for (source_file, result) in chunk.iter().zip(results) {
            if remaining_budget(request, started).is_zero() {
                return stream.fail(context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
            }
            let analysis = match checked_result(result) {
                Ok(analysis) => analysis,
                Err((code, message)) => return stream.fail(context, code, message),
            };
            let path = source_file["path"].as_str().expect("validated path");
            if index
                .set_file_imports(path, &analysis.relation_sites)
                .is_err()
            {
                return stream.fail(
                    context,
                    "RESOURCE_LIMIT_EXCEEDED",
                    "Import context exceeds memory budget",
                );
            }
            if let Some(full) = &mut stream.full {
                full.memory_budget = usize::try_from(index_budget)
                    .unwrap_or(usize::MAX)
                    .saturating_sub(index.accounted_bytes());
            }
            let include_import = request
                .capabilities
                .iter()
                .any(|capability| capability == "IMPORT");
            let container_packages: Vec<_> = if include_import {
                analysis
                    .symbols
                    .iter()
                    .filter(|symbol| {
                        symbol.provider_kind == "java.package"
                            && index.should_emit_package_container(path, &symbol.name)
                    })
                    .map(|symbol| symbol.name.clone())
                    .collect()
            } else {
                Vec::new()
            };
            let included_sites: Vec<_> = analysis
                .relation_sites
                .iter()
                .filter(|site| {
                    let capability = match site.kind {
                        RelationKind::Import => "IMPORT",
                        RelationKind::Call => "CALL",
                        RelationKind::Inheritance => "INHERITANCE",
                        RelationKind::Reference => "REFERENCE",
                    };
                    request
                        .capabilities
                        .iter()
                        .any(|requested| requested == capability)
                })
                .collect();
            let mut site_statistics = analysis.site_statistics.clone();
            let additional = 1usize
                .saturating_add(analysis.symbols.len())
                .saturating_add(container_packages.len())
                .saturating_add(usize::from(include_import))
                .saturating_add(included_sites.len())
                .saturating_add(request.capabilities.len())
                .saturating_add(analysis.diagnostics.len());
            if !stream.has_room(additional) {
                return stream.fail(context, "RESOURCE_LIMIT_EXCEEDED", "Event budget exceeded");
            }
            if !stream.emit("SOURCE_FILE", source_file.clone(), false)? {
                return Ok(ExitCode::SUCCESS);
            }
            counts.source_files += 1;
            for symbol in &analysis.symbols {
                if !stream.emit("NODE", symbol_payload(request, source_file, symbol), false)? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.nodes += 1;
            }
            for package in container_packages {
                if !stream.emit("NODE", package_node(request, &package), false)? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.nodes += 1;
            }
            if include_import {
                if !stream.emit("NODE", json!({
                    "providerId": "native", "providerFactId": compilation_unit_id(path),
                    "providerSnapshotId": request.snapshot_id, "repositoryId": request.repository_id,
                    "revisionId": request.revision_id, "providerKind": "java.compilation_unit",
                    "name": path, "qualifiedName": path, "sourceRange": null,
                    "confidence": {"score": 1, "method": "parser", "reasons": []}
                }), false)? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.nodes += 1;
            }
            for site in included_sites {
                let relation = index.resolve(path, site);
                let resolution = match &relation.target {
                    RelationTarget::Resolved { resolution, .. }
                    | RelationTarget::NonResolved { resolution, .. } => *resolution,
                };
                let capability = relation_capability(site.kind);
                let buckets = &mut site_statistics
                    .get_mut(capability)
                    .expect("analyzed relation capability")
                    .resolution_counts;
                match resolution {
                    "EXACT" => buckets.exact += 1,
                    "HEURISTIC" => buckets.heuristic += 1,
                    "AMBIGUOUS" => buckets.ambiguous += 1,
                    "UNRESOLVED" => buckets.unresolved += 1,
                    "UNSUPPORTED" => buckets.unsupported += 1,
                    _ => {
                        return stream.fail(
                            context,
                            "INTERNAL_ANALYZER_FAILURE",
                            "Unknown relation resolution",
                        );
                    }
                }
                if !stream.emit(
                    "EDGE",
                    relation_payload(request, source_file, relation),
                    false,
                )? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.edges += 1;
            }
            let coverage = match analysis.coverage {
                SyntaxCoverage::Complete => "COMPLETE",
                SyntaxCoverage::Partial => {
                    partial = true;
                    "PARTIAL"
                }
            };
            for capability in &request.capabilities {
                if !stream.emit(
                    "COVERAGE",
                    coverage_payload(
                        request,
                        capability,
                        &source_file["id"],
                        coverage,
                        &site_statistics[capability],
                    ),
                    false,
                )? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.coverage += 1;
            }
            for diagnostic in &analysis.diagnostics {
                let range = diagnostic.span.as_ref().map(|span| json!({
                    "sourceFileId": source_file["id"], "startLine": span.start_line,
                    "startColumn": span.start_column, "endLine": span.end_line, "endColumn": span.end_column
                }));
                if !stream.emit(
                    "DIAGNOSTIC",
                    json!({
                        "code": diagnostic.code, "severity": "WARNING",
                        "message": diagnostic.message, "sourceRange": range
                    }),
                    false,
                )? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.diagnostics += 1;
            }
            if !stream.emit_summary(
                source_file,
                &analysis,
                &site_statistics,
                request,
                Some(&index),
            )? {
                return Ok(ExitCode::SUCCESS);
            }
        }
    }
    if request.protocol_version == 3 && remaining_budget(request, started).is_zero() {
        return stream.fail(context, "BUDGET_EXCEEDED", "Analysis deadline exceeded");
    }
    let checksum = stream.checksum();
    let mut terminal = context.as_object().expect("context object").clone();
    terminal.insert(
        "outcome".into(),
        json!(if partial { "PARTIAL" } else { "SUCCEEDED" }),
    );
    terminal.insert("counts".into(), counts.to_value());
    terminal.insert("capabilities".into(), json!(request.capabilities.iter().map(|name| json!({
        "name": name, "support": "SUPPORTED", "coverage": if partial { "PARTIAL" } else { "COMPLETE" }
    })).collect::<Vec<_>>()));
    terminal.insert(
        "contentFingerprint".into(),
        json!(if request.protocol_version == 3 {
            &request.revision_fingerprint
        } else {
            &checksum
        }),
    );
    terminal.insert("integrityChecksum".into(), json!(checksum));
    stream.finish_state(&mut terminal);
    stream.emit("ANALYSIS_COMPLETED", Value::Object(terminal), true)?;
    Ok(ExitCode::SUCCESS)
}

fn relation_capability(kind: RelationKind) -> &'static str {
    match kind {
        RelationKind::Import => "IMPORT",
        RelationKind::Call => "CALL",
        RelationKind::Inheritance => "INHERITANCE",
        RelationKind::Reference => "REFERENCE",
    }
}
fn package_node(request: &Request, package: &str) -> Value {
    json!({"providerId":"native","providerFactId":package_container_fact_id(package),
        "providerSnapshotId":request.snapshot_id,"repositoryId":request.repository_id,
        "revisionId":request.revision_id,"providerKind":"java.package_container",
        "name":package,"qualifiedName":package,"sourceRange":null,
        "confidence":{"score":1,"method":"parser","reasons":[]}})
}

fn coverage_payload(
    request: &Request,
    capability: &str,
    source_file_id: &Value,
    coverage: &str,
    statistics: &SiteStatistics,
) -> Value {
    let mut payload = json!({"capability": capability, "sourceFileId": source_file_id,
        "support": "SUPPORTED", "coverage": coverage});
    if request.protocol_version >= 2 {
        payload["statistics"] = json!({
            "eligibleSites": statistics.eligible_sites,
            "coveredSites": statistics.covered_sites,
            "unsupportedSites": statistics.unsupported_sites,
            "partialSites": statistics.partial_sites,
            "resolutionCounts": {
                "EXACT": statistics.resolution_counts.exact,
                "HEURISTIC": statistics.resolution_counts.heuristic,
                "AMBIGUOUS": statistics.resolution_counts.ambiguous,
                "UNRESOLVED": statistics.resolution_counts.unresolved,
                "UNSUPPORTED": statistics.resolution_counts.unsupported,
            }
        });
    }
    payload
}

fn checked_result(
    result: std::thread::Result<Result<LanguageAnalysis, ProcessingError>>,
) -> Result<LanguageAnalysis, (&'static str, &'static str)> {
    match result {
        Ok(Ok(analysis)) => Ok(analysis),
        Ok(Err(ProcessingError::Source(error))) => Err(source_error(&error)),
        Ok(Err(ProcessingError::Unsupported)) => {
            Err(("UNSUPPORTED_LANGUAGE", "Source language is unsupported"))
        }
        Ok(Err(ProcessingError::Ineligible)) => {
            Err(("INVALID_REQUEST", "Source is not eligible Java text"))
        }
        Ok(Err(ProcessingError::Deadline)) => {
            Err(("BUDGET_EXCEEDED", "Analysis deadline exceeded"))
        }
        Ok(Err(ProcessingError::ResourceLimit)) => Err((
            "RESOURCE_LIMIT_EXCEEDED",
            "Parse result exceeds worker reservation",
        )),
        Ok(Err(ProcessingError::Parser)) | Err(_) => {
            Err(("INTERNAL_ANALYZER_FAILURE", "Java parse failed"))
        }
    }
}

fn parse_request(value: &Value) -> Option<Request> {
    let object = value.as_object()?;
    if !keys(object, &["protocolVersion", "requestId", "type", "payload"])
        || !matches!(integer(&object["protocolVersion"])?, 1 | 2)
        || object["type"] != "ANALYZE"
    {
        return None;
    }
    let id = exact(&object["requestId"])?;
    if id.encode_utf16().count() > 128 {
        return None;
    }
    let payload = object["payload"].as_object()?;
    if !keys(
        payload,
        &[
            "irSchemaVersion",
            "providerSnapshotId",
            "repository",
            "requestedCapabilities",
            "deadlineEpochMs",
            "resourceBudget",
            "revision",
            "sourceFiles",
        ],
    ) || integer(&payload["irSchemaVersion"])? != 1
    {
        return None;
    }
    let snapshot_id = exact(&payload["providerSnapshotId"])?;
    let repository = payload["repository"].as_object()?;
    if !keys(repository, &["id", "rootPath"]) {
        return None;
    }
    let repository_id = exact(&repository["id"])?;
    let root = exact(&repository["rootPath"])?;
    if !Path::new(root).is_absolute() {
        return None;
    }
    let revision = payload["revision"].as_object()?;
    let kind = exact(&revision["kind"])?;
    let revision_keys = match kind {
        "WORKTREE" => &[
            "id",
            "repositoryId",
            "contentFingerprint",
            "kind",
            "baseRevisionId",
        ][..],
        "SNAPSHOT" => &[
            "id",
            "repositoryId",
            "contentFingerprint",
            "kind",
            "sourceRevisionId",
        ][..],
        "COMMIT" => &[
            "id",
            "repositoryId",
            "contentFingerprint",
            "kind",
            "commitIdentity",
        ][..],
        _ => return None,
    };
    if !keys(revision, revision_keys) || exact(&revision["repositoryId"])? != repository_id {
        return None;
    }
    match kind {
        "WORKTREE" => {
            optional_exact(&revision["baseRevisionId"])?;
        }
        "SNAPSHOT" => {
            optional_exact(&revision["sourceRevisionId"])?;
        }
        _ => {
            exact(&revision["commitIdentity"])?;
        }
    }
    let revision_id = exact(&revision["id"])?;
    let revision_fingerprint = exact(&revision["contentFingerprint"])?;
    let capabilities = payload["requestedCapabilities"].as_array()?;
    if capabilities.is_empty()
        || capabilities
            .iter()
            .any(|capability| exact(capability).is_none())
    {
        return None;
    }
    let capabilities: Vec<String> = capabilities
        .iter()
        .map(|value| value.as_str().expect("validated capability").to_owned())
        .collect();
    if capabilities.iter().collect::<HashSet<_>>().len() != capabilities.len() {
        return None;
    }
    let budget = payload["resourceBudget"].as_object()?;
    if !keys(budget, &["maxDurationMs", "maxMemoryBytes", "maxEvents"]) {
        return None;
    }
    let max_duration_ms = positive(&budget["maxDurationMs"])?;
    let max_memory_bytes = positive(&budget["maxMemoryBytes"])?;
    let max_events = positive(&budget["maxEvents"])?;
    let deadline_epoch_ms = if payload["deadlineEpochMs"].is_null() {
        None
    } else {
        Some(epoch_milliseconds(&payload["deadlineEpochMs"])?)
    };
    let source_files = payload["sourceFiles"].as_array()?;
    let mut seen = HashSet::new();
    for file in source_files {
        let file = file.as_object()?;
        if !keys(
            file,
            &[
                "id",
                "repositoryId",
                "revisionId",
                "path",
                "contentFingerprint",
                "classification",
                "languageHint",
                "sensitivity",
            ],
        ) {
            return None;
        }
        let file_id = exact(&file["id"])?;
        if !seen.insert(file_id)
            || exact(&file["repositoryId"])? != repository_id
            || exact(&file["revisionId"])? != revision_id
        {
            return None;
        }
        let path = exact(&file["path"])?;
        if !valid_path(path) {
            return None;
        }
        let fingerprint = exact(&file["contentFingerprint"])?;
        if !valid_sha256(fingerprint) {
            return None;
        }
        let class = file["classification"].as_object()?;
        if !keys(class, &["role", "provenance", "contentKind"])
            || !matches!(class["role"].as_str()?, "SOURCE" | "TEST" | "OTHER")
            || !matches!(
                class["provenance"].as_str()?,
                "AUTHORED" | "GENERATED" | "VENDOR"
            )
            || !matches!(class["contentKind"].as_str()?, "TEXT" | "BINARY")
            || !(file["languageHint"].is_null() || exact(&file["languageHint"]).is_some())
            || !matches!(
                file["sensitivity"].as_str()?,
                "PUBLIC" | "INTERNAL" | "SENSITIVE" | "SECRET"
            )
        {
            return None;
        }
    }
    Some(Request {
        protocol_version: integer(&object["protocolVersion"])?,
        id: id.into(),
        snapshot_id: snapshot_id.into(),
        repository_id: repository_id.into(),
        root: root.into(),
        revision_id: revision_id.into(),
        revision_fingerprint: revision_fingerprint.into(),
        capabilities,
        source_files: source_files.clone(),
        max_duration_ms,
        max_memory_bytes,
        max_events,
        deadline_epoch_ms,
    })
}

fn keys(object: &Map<String, Value>, expected: &[&str]) -> bool {
    object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
}
fn exact(value: &Value) -> Option<&str> {
    let text = value.as_str()?;
    (!text.is_empty() && text.trim() == text).then_some(text)
}
fn optional_exact(value: &Value) -> Option<()> {
    if value.is_null() || exact(value).is_some() {
        Some(())
    } else {
        None
    }
}
fn integer(value: &Value) -> Option<u64> {
    if let Some(number) = value.as_u64() {
        return (number <= MAX_SAFE_INTEGER).then_some(number);
    }
    let number = value.as_f64()?;
    (number.is_finite()
        && number >= 0.0
        && number.fract() == 0.0
        && number <= MAX_SAFE_INTEGER as f64)
        .then_some(number as u64)
}
fn positive(value: &Value) -> Option<u64> {
    integer(value).filter(|number| *number > 0)
}
fn epoch_milliseconds(value: &Value) -> Option<i64> {
    let number = value.as_f64()?;
    (number.is_finite() && number.fract() == 0.0 && number.abs() <= MAX_SAFE_INTEGER as f64)
        .then_some(number as i64)
}
fn valid_path(path: &str) -> bool {
    !path.contains(['\\', ':', '\0'])
        && !path.starts_with('/')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}
fn valid_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    })
}
fn source_error(error: &SourceAccessError) -> (&'static str, &'static str) {
    match error {
        SourceAccessError::Changed => ("SOURCE_CHANGED", "Source changed during analysis"),
        SourceAccessError::BudgetExceeded => {
            ("RESOURCE_LIMIT_EXCEEDED", "Source exceeds memory budget")
        }
        SourceAccessError::InvalidRoot
        | SourceAccessError::InvalidPath
        | SourceAccessError::LinkDenied => ("INVALID_REQUEST", "Source path is not allowed"),
        SourceAccessError::Io(_) => ("INTERNAL_ANALYZER_FAILURE", "Cannot read source"),
    }
}

enum ProcessingError {
    Source(SourceAccessError),
    Unsupported,
    Ineligible,
    Deadline,
    ResourceLimit,
    Parser,
}

fn remaining_budget(request: &Request, started: Instant) -> Duration {
    let duration = Duration::from_millis(request.max_duration_ms).saturating_sub(started.elapsed());
    let epoch = request.deadline_epoch_ms.map_or(duration, |deadline| {
        Duration::from_millis(deadline.saturating_sub(now_epoch_ms()).max(0) as u64)
    });
    duration.min(epoch)
}

fn timed_batch<T, R, F>(
    files: &[T],
    remaining: Duration,
    process: F,
) -> Option<Vec<std::thread::Result<R>>>
where
    T: Clone + Send + 'static,
    R: Send + 'static,
    F: Fn(T, Instant, &AtomicBool) -> R + Send + Sync + 'static,
{
    let deadline = Instant::now().checked_add(remaining)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    let process = Arc::new(process);
    let (sender, receiver) = std::sync::mpsc::sync_channel(files.len());
    let mut handles = Vec::with_capacity(files.len());
    for (index, file) in files.iter().cloned().enumerate() {
        let sender = sender.clone();
        let cancelled = Arc::clone(&cancelled);
        let process = Arc::clone(&process);
        handles.push(std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                process(file, deadline, &cancelled)
            }));
            let _ = sender.send((index, result));
        }));
    }
    drop(sender);
    let mut ordered: Vec<_> = std::iter::repeat_with(|| None).take(files.len()).collect();
    for _ in files {
        match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok((index, result)) => ordered[index] = Some(result),
            Err(_) => {
                cancelled.store(true, Ordering::Relaxed);
                return None;
            }
        }
    }
    for handle in handles {
        let _ = handle.join();
    }
    Some(ordered.into_iter().map(Option::unwrap).collect())
}

#[cfg(test)]
fn ordered_batch<T: Sync, R: Send, F: Fn(&T) -> R + Sync>(
    items: &[T],
    process: &F,
) -> Vec<std::thread::Result<R>> {
    std::thread::scope(|scope| {
        let jobs: Vec<_> = items
            .iter()
            .map(|item| scope.spawn(|| process(item)))
            .collect();
        jobs.into_iter().map(|job| job.join()).collect()
    })
}

fn parse_source(
    root: &str,
    source_file: &Value,
    deadline: Instant,
    cancelled: &AtomicBool,
    with_relations: bool,
) -> Result<LanguageAnalysis, ProcessingError> {
    parse_source_observed(
        root,
        source_file,
        deadline,
        cancelled,
        with_relations,
        &|_| {},
    )
}

fn parse_source_observed<F: Fn(&str) + Sync>(
    root: &str,
    source_file: &Value,
    deadline: Instant,
    cancelled: &AtomicBool,
    with_relations: bool,
    on_parse: &F,
) -> Result<LanguageAnalysis, ProcessingError> {
    if Instant::now() >= deadline || cancelled.load(Ordering::Relaxed) {
        return Err(ProcessingError::Deadline);
    }
    let path = source_file["path"].as_str().expect("validated path");
    if source_file["classification"]["contentKind"] != "TEXT" {
        return Err(ProcessingError::Ineligible);
    }
    if source_file["languageHint"] != "java" || !path.ends_with(".java") {
        return Err(ProcessingError::Unsupported);
    }
    let expected = source_file["contentFingerprint"]
        .as_str()
        .expect("validated fingerprint");
    let source_bytes =
        read_verified_source(Path::new(root), path, expected, SOURCE_BYTES_PER_WORKER)
            .map_err(ProcessingError::Source)?;
    if Instant::now() >= deadline || cancelled.load(Ordering::Relaxed) {
        return Err(ProcessingError::Deadline);
    }
    let mut analyzer = JavaAnalyzer::new().map_err(|_| ProcessingError::Parser)?;
    on_parse(path);
    let analysis = if with_relations {
        analyzer.analyze_with_relations_until(
            path,
            &source_bytes,
            deadline,
            cancelled,
            RESULT_BYTES_PER_WORKER,
        )
    } else {
        analyzer.analyze_until(
            path,
            &source_bytes,
            deadline,
            cancelled,
            RESULT_BYTES_PER_WORKER,
        )
    };
    analysis.map_err(|error| match error {
        codeatlas_native_analyzer::language::AnalyzerError::BudgetExceeded => {
            ProcessingError::Deadline
        }
        codeatlas_native_analyzer::language::AnalyzerError::ResourceLimit => {
            ProcessingError::ResourceLimit
        }
        _ => ProcessingError::Parser,
    })
}
fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}
fn error(code: &str, message: &str, retryable: bool) -> Value {
    json!({"code": code, "message": message, "retryable": retryable})
}
fn write_one<W: Write>(output: &mut W, event: Value) -> io::Result<()> {
    serde_json::to_writer(&mut *output, &event).map_err(io::Error::other)?;
    output.write_all(b"\n")?;
    output.flush()
}

#[derive(Default)]
struct Counts {
    source_files: u64,
    nodes: u64,
    edges: u64,
    coverage: u64,
    diagnostics: u64,
}
impl Counts {
    fn to_value(&self) -> Value {
        json!({"sourceFiles": self.source_files, "nodes": self.nodes, "edges": self.edges,
            "coverage": self.coverage, "diagnostics": self.diagnostics})
    }
}

struct FactDigest {
    kind: &'static str,
    id: String,
    digest: String,
    ownership: &'static str,
}

struct HashWriter(Sha256);
impl Write for HashWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Only owned byte/vector capacities are charged here; existing parser/result
/// and declaration-index policy reservations remain separate. Not an RSS cap.
struct LimitedBytes {
    bytes: Vec<u8>,
    limit: usize,
}
impl LimitedBytes {
    fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
        }
    }
}
impl Write for LimitedBytes {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let len = self
            .bytes
            .len()
            .checked_add(bytes.len())
            .ok_or_else(metadata_limit)?;
        if len > self.limit {
            return Err(metadata_limit());
        }
        self.bytes
            .try_reserve_exact(bytes.len())
            .map_err(io::Error::other)?;
        if self.bytes.capacity() > self.limit {
            return Err(metadata_limit());
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn metadata_limit() -> io::Error {
    io::Error::other("Native summary resource limit exceeded")
}

struct FullMetadata {
    header: Value,
    memory_budget: usize,
    serialized_bytes: usize,
    header_bytes: usize,
    files: Vec<(String, Vec<u8>)>,
    facts: Vec<FactDigest>,
}
impl FullMetadata {
    fn new(header: Value, memory_budget: usize) -> io::Result<Self> {
        let mut counter = LimitedBytes::new(MAX_LINE_BYTES.min(memory_budget));
        serde_json::to_writer(&mut counter, &header).map_err(io::Error::other)?;
        let serialized_bytes = counter.bytes.len() + b"{\"header\":,\"summaries\":[]}".len();
        let header_bytes = counter.bytes.len();
        if serialized_bytes > MAX_LINE_BYTES || header_bytes > memory_budget {
            return Err(metadata_limit());
        }
        Ok(Self {
            header,
            memory_budget,
            serialized_bytes,
            header_bytes,
            files: Vec::new(),
            facts: Vec::new(),
        })
    }
    fn used_bytes(&self) -> usize {
        self.header_bytes
            .saturating_add(
                self.files
                    .capacity()
                    .saturating_mul(std::mem::size_of::<(String, Vec<u8>)>()),
            )
            .saturating_add(
                self.files
                    .iter()
                    .map(|(path, bytes)| path.capacity().saturating_add(bytes.capacity()))
                    .sum::<usize>(),
            )
            .saturating_add(
                self.facts
                    .capacity()
                    .saturating_mul(std::mem::size_of::<FactDigest>()),
            )
            .saturating_add(
                self.facts
                    .iter()
                    .map(|f| f.id.capacity().saturating_add(f.digest.capacity()))
                    .sum::<usize>(),
            )
    }
    fn available(&self) -> usize {
        self.memory_budget.saturating_sub(self.used_bytes())
    }
    fn capture(&mut self, kind: &str, payload: &Value) -> io::Result<()> {
        self.capture_owned(kind, payload, "FILE")
    }
    fn capture_owned(
        &mut self,
        kind: &str,
        payload: &Value,
        ownership: &'static str,
    ) -> io::Result<()> {
        let id = payload["providerFactId"]
            .as_str()
            .expect("emitted fact identity");
        let growth = if self.facts.len() == self.facts.capacity() {
            std::mem::size_of::<FactDigest>()
        } else {
            0
        };
        if growth.saturating_add(id.len()).saturating_add(64) > self.available() {
            return Err(metadata_limit());
        }
        let digest = fact_content_digest(payload);
        self.facts.try_reserve_exact(1).map_err(io::Error::other)?;
        self.facts.push(FactDigest {
            kind: if kind == "NODE" { "NODE" } else { "EDGE" },
            id: id.to_owned(),
            digest,
            ownership,
        });
        if self.used_bytes() > self.memory_budget {
            return Err(metadata_limit());
        }
        Ok(())
    }
}

fn symbol_payload(request: &Request, file: &Value, symbol: &SymbolFact) -> Value {
    let span = &symbol.span;
    json!({"providerId":"native","providerFactId":symbol.provider_fact_id,
        "providerSnapshotId":request.snapshot_id,"repositoryId":request.repository_id,
        "revisionId":request.revision_id,"providerKind":symbol.provider_kind,
        "name":symbol.name,"qualifiedName":symbol.qualified_name,
        "sourceRange":{"sourceFileId":file["id"],"startLine":span.start_line,
            "startColumn":span.start_column,"endLine":span.end_line,"endColumn":span.end_column},
        "confidence":{"score":1,"method":"parser","reasons":[]}})
}

fn relation_payload(request: &Request, file: &Value, relation: ResolvedRelation) -> Value {
    let target = match relation.target {
        RelationTarget::Resolved {
            fact_id,
            resolution,
        } => json!({"state":"RESOLVED","resolution":resolution,
            "target":{"factType":"NODE","providerId":"native","providerFactId":fact_id}}),
        RelationTarget::NonResolved {
            resolution,
            hint,
            candidates,
        } => json!({"state":"UNRESOLVED",
            "resolution":resolution,"originalHint":hint,"candidates":candidates.into_iter().map(|id|
                json!({"factType":"NODE","providerId":"native","providerFactId":id})).collect::<Vec<_>>()}),
    };
    let span = relation.span;
    json!({"providerId":"native","providerFactId":relation.provider_fact_id,
        "providerSnapshotId":request.snapshot_id,"repositoryId":request.repository_id,
        "revisionId":request.revision_id,"providerKind":relation.provider_kind,
        "source":{"factType":"NODE","providerId":"native","providerFactId":relation.source_fact_id},
        "target":target,"sourceRange":{"sourceFileId":file["id"],"startLine":span.start_line,
            "startColumn":span.start_column,"endLine":span.end_line,"endColumn":span.end_column},
        "confidence":{"score":1,"method":"parser","reasons":[]}})
}

fn fact_content_digest(payload: &Value) -> String {
    // Hash in constant auxiliary space; only the snapshot identity is omitted.
    let mut hash = HashWriter(Sha256::new());
    hash.write_all(b"{").expect("hash write");
    let mut first = true;
    for (key, value) in payload.as_object().expect("fact object") {
        if key == "providerSnapshotId" {
            continue;
        }
        if !first {
            hash.write_all(b",").expect("hash write");
        }
        first = false;
        serde_json::to_writer(&mut hash, key).expect("hash key");
        hash.write_all(b":").expect("hash write");
        write_canonical(value, &mut hash).expect("hash value");
    }
    hash.write_all(b"}").expect("hash write");
    format!("{:x}", hash.0.finalize())
}

fn symbol_summary(symbol: &codeatlas_native_analyzer::language::SymbolFact) -> Value {
    json!({"providerFactId":symbol.provider_fact_id,"providerKind":symbol.provider_kind,
        "name":symbol.name,"qualifiedName":symbol.qualified_name,"signature":symbol.signature,
        "isStatic":symbol.is_static,"span":span_summary(&symbol.span)})
}
fn span_summary(span: &codeatlas_native_analyzer::language::SourceSpan) -> Value {
    json!({"startLine":span.start_line,"startColumn":span.start_column,
        "endLine":span.end_line,"endColumn":span.end_column})
}
fn site_summary(site: &codeatlas_native_analyzer::language::RelationSite) -> Value {
    json!({"kind":relation_capability(site.kind),"variant":site.variant,
        "sourceFactId":site.source_fact_id,"targetHint":site.target_hint,"arity":site.arity,
        "span":span_summary(&site.span)})
}
fn diagnostic_summary(
    diagnostic: &codeatlas_native_analyzer::language::SyntaxDiagnostic,
    file: &Value,
) -> Value {
    let range = diagnostic.span.as_ref().map(|span| {
        let mut range = span_summary(span);
        range["sourceFileId"] = file["id"].clone();
        range
    });
    json!({"code":diagnostic.code,"severity":"WARNING","message":diagnostic.message,"sourceRange":range})
}

struct SummaryOrder {
    symbols: Vec<usize>,
    sites: Vec<usize>,
    diagnostics: Vec<(usize, Vec<u8>)>,
}
impl SummaryOrder {
    fn bytes(&self) -> usize {
        (self.symbols.capacity() + self.sites.capacity()) * std::mem::size_of::<usize>()
            + self.diagnostics.capacity() * std::mem::size_of::<(usize, Vec<u8>)>()
            + self
                .diagnostics
                .iter()
                .map(|(_, key)| key.capacity())
                .sum::<usize>()
    }
    fn new(analysis: &LanguageAnalysis, file: &Value, limit: usize) -> io::Result<Self> {
        let initial = (analysis.symbols.len() + analysis.relation_sites.len())
            * std::mem::size_of::<usize>()
            + analysis.diagnostics.len() * std::mem::size_of::<(usize, Vec<u8>)>();
        if initial > limit {
            return Err(metadata_limit());
        }
        let mut order = Self {
            symbols: (0..analysis.symbols.len()).collect(),
            sites: (0..analysis.relation_sites.len()).collect(),
            diagnostics: Vec::with_capacity(analysis.diagnostics.len()),
        };
        order
            .symbols
            .sort_unstable_by_key(|&i| &analysis.symbols[i].provider_fact_id);
        order.sites.sort_unstable_by_key(|&i| {
            let s = &analysis.relation_sites[i];
            (
                relation_capability(s.kind),
                &s.source_fact_id,
                s.span.start_line,
                s.span.start_column,
                s.span.end_line,
                s.span.end_column,
                &s.variant,
                &s.target_hint,
                s.arity,
            )
        });
        for (i, diagnostic) in analysis.diagnostics.iter().enumerate() {
            let mut key = LimitedBytes::new(limit.saturating_sub(order.bytes()));
            write_canonical(&diagnostic_summary(diagnostic, file), &mut key)?;
            order.diagnostics.push((i, key.bytes));
        }
        order.diagnostics.sort_unstable_by(|a, b| a.1.cmp(&b.1));
        Ok(order)
    }
}

/// Build one file, never a whole graph/summary Value. Piece Values stay within
/// the existing bounded parse/result working reservation; byte/vector storage
/// is admitted independently, including simultaneous wire/canonical buffers.
struct SummaryInput<'a> {
    file: &'a Value,
    analysis: &'a LanguageAnalysis,
    statistics: &'a std::collections::BTreeMap<String, SiteStatistics>,
    request: &'a Request,
    facts: &'a [FactDigest],
    order: &'a SummaryOrder,
}

fn write_file_summary(
    out: &mut LimitedBytes,
    canonical: bool,
    input: &SummaryInput<'_>,
) -> io::Result<()> {
    let SummaryInput {
        file,
        analysis,
        statistics,
        request,
        facts,
        order,
    } = *input;
    fn value(out: &mut LimitedBytes, canonical: bool, v: &Value) -> io::Result<()> {
        if canonical {
            write_canonical(v, out)
        } else {
            serde_json::to_writer(out, v).map_err(io::Error::other)
        }
    }
    fn array(
        out: &mut LimitedBytes,
        canonical: bool,
        values: impl Iterator<Item = Value>,
    ) -> io::Result<()> {
        out.write_all(b"[")?;
        for (i, v) in values.enumerate() {
            if i != 0 {
                out.write_all(b",")?;
            }
            value(out, canonical, &v)?;
        }
        out.write_all(b"]")
    }
    let coverage = if analysis.coverage == SyntaxCoverage::Complete {
        "COMPLETE"
    } else {
        "PARTIAL"
    };
    let mut capabilities: Vec<_> = request.capabilities.iter().collect();
    capabilities.sort_unstable();
    out.write_all(b"{\"coverage\":")?;
    array(
        out,
        canonical,
        capabilities
            .into_iter()
            .map(|cap| coverage_payload(request, cap, &file["id"], coverage, &statistics[cap])),
    )?;
    out.write_all(b",\"diagnostics\":")?;
    array(
        out,
        canonical,
        order
            .diagnostics
            .iter()
            .map(|(i, _)| diagnostic_summary(&analysis.diagnostics[*i], file)),
    )?;
    out.write_all(b",\"emittedFacts\":")?;
    array(out, canonical, facts.iter().map(|f| json!({"factType":f.kind,"providerFactId":f.id,"contentDigest":f.digest,"ownership":f.ownership})))?;
    out.write_all(b",\"relationSites\":")?;
    array(
        out,
        canonical,
        order
            .sites
            .iter()
            .map(|&i| site_summary(&analysis.relation_sites[i])),
    )?;
    out.write_all(b",\"schemaVersion\":")?;
    value(out, canonical, &json!(1))?;
    out.write_all(b",\"sourceFile\":")?;
    value(out, canonical, file)?;
    out.write_all(b",\"symbols\":")?;
    array(
        out,
        canonical,
        order
            .symbols
            .iter()
            .map(|&i| symbol_summary(&analysis.symbols[i])),
    )?;
    out.write_all(b"}")
}

struct EventWriter<'a, W: Write> {
    output: &'a mut W,
    request_id: &'a str,
    protocol_version: u64,
    context: Value,
    sequence: u64,
    bytes: u64,
    max_events: u64,
    max_line_bytes: usize,
    max_total_bytes: u64,
    digest: Sha256,
    full: Option<FullMetadata>,
}
impl<'a, W: Write> EventWriter<'a, W> {
    fn new(
        output: &'a mut W,
        request_id: &'a str,
        context: &Value,
        max_events: u64,
        protocol_version: u64,
    ) -> Self {
        Self {
            output,
            request_id,
            protocol_version,
            context: context.clone(),
            sequence: 0,
            bytes: 0,
            max_events: max_events.min(MAX_EVENT_COUNT),
            max_line_bytes: MAX_LINE_BYTES,
            max_total_bytes: MAX_TOTAL_BYTES,
            digest: Sha256::new(),
            full: None,
        }
    }
    fn has_room(&self, additional_nonterminal: usize) -> bool {
        self.sequence
            .saturating_add(additional_nonterminal as u64)
            .saturating_add(1)
            <= self.max_events
    }
    fn emit_summary(
        &mut self,
        file: &Value,
        analysis: &LanguageAnalysis,
        statistics: &std::collections::BTreeMap<String, SiteStatistics>,
        request: &Request,
        index: Option<&DeclarationIndex>,
    ) -> io::Result<bool> {
        let Some(full) = &mut self.full else {
            return Ok(true);
        };
        let prepared = (|| -> io::Result<LimitedBytes> {
            if request.capabilities.iter().any(|c| c == "IMPORT") {
                for symbol in analysis.symbols.iter().filter(|s| {
                    s.provider_kind == "java.package"
                        && index.is_some_and(|i| i.emits_package_container(&s.name))
                }) {
                    full.capture_owned("NODE", &package_node(request, &symbol.name), "SHARED")?;
                }
            }
            full.facts
                .sort_unstable_by(|a, b| (a.kind, &a.id).cmp(&(b.kind, &b.id)));
            // Reserve the retained file slot/path before allocating buffers.
            let path = file["path"].as_str().expect("file path");
            let growth = if full.files.len() == full.files.capacity() {
                std::mem::size_of::<(String, Vec<u8>)>()
            } else {
                0
            };
            if path.len().saturating_add(growth) > full.available() {
                return Err(metadata_limit());
            }
            full.files.try_reserve_exact(1).map_err(io::Error::other)?;
            let path = path.to_owned();
            let available = full.available().saturating_sub(path.capacity());
            let order = SummaryOrder::new(analysis, file, available)?;
            let available = available.saturating_sub(order.bytes());
            let mut wire = LimitedBytes::new(
                available.min(MAX_LINE_BYTES.saturating_sub(full.serialized_bytes)),
            );
            let input = SummaryInput {
                file,
                analysis,
                statistics,
                request,
                facts: &full.facts,
                order: &order,
            };
            write_file_summary(&mut wire, false, &input)?;
            let mut canonical = LimitedBytes::new(available.saturating_sub(wire.bytes.capacity()));
            write_file_summary(&mut canonical, true, &input)?;
            full.serialized_bytes = full
                .serialized_bytes
                .saturating_add(wire.bytes.len())
                .saturating_add(usize::from(!full.files.is_empty()));
            if full.serialized_bytes > MAX_LINE_BYTES {
                return Err(metadata_limit());
            }
            full.files.push((path, canonical.bytes));
            full.facts.clear();
            Ok(wire)
        })();
        let wire = match prepared {
            Ok(wire) => wire,
            Err(_) => {
                let context = self.context.clone();
                self.fail(
                    &context,
                    "RESOURCE_LIMIT_EXCEEDED",
                    "Summary workspace or size exceeds budget",
                )?;
                return Ok(false);
            }
        };
        // No reconstructed whole-summary Value or second line-sized copy.
        let prefix = format!(
            "{{\"protocolVersion\":3,\"requestId\":{},\"sequence\":{},\"type\":\"ANALYSIS_SUMMARY\",\"payload\":",
            serde_json::to_string(self.request_id).map_err(io::Error::other)?,
            self.sequence
        );
        let size = prefix
            .len()
            .saturating_add(wire.bytes.len())
            .saturating_add(b"}\n".len());
        if !self.has_room(1)
            || size > self.max_line_bytes
            || self
                .bytes
                .saturating_add(size as u64)
                .saturating_add(self.failure_reservation()?)
                > self.max_total_bytes
        {
            let context = self.context.clone();
            self.fail(
                &context,
                "RESOURCE_LIMIT_EXCEEDED",
                "Summary IPC limit exceeded",
            )?;
            return Ok(false);
        }
        for bytes in [prefix.as_bytes(), wire.bytes.as_slice(), b"}\n"] {
            self.output.write_all(bytes)?;
            self.digest.update(bytes);
        }
        self.output.flush()?;
        self.sequence += 1;
        self.bytes += size as u64;
        Ok(true)
    }
    fn finish_state(&mut self, terminal: &mut Map<String, Value>) {
        if let Some(mut full) = self.full.take() {
            full.files.sort_unstable_by(|a, b| a.0.cmp(&b.0));
            let mut digest = Sha256::new();
            digest.update(b"[");
            for (i, (_, bytes)) in full.files.iter().enumerate() {
                if i != 0 {
                    digest.update(b",");
                }
                digest.update(bytes);
            }
            digest.update(b"]");
            full.header["summaryDigest"] = json!(format!("{:x}", digest.finalize()));
            terminal.insert("summaryRecords".into(), json!(full.files.len()));
            terminal.insert("analysisState".into(), full.header);
        }
    }
    fn emit(&mut self, event_type: &str, payload: Value, terminal: bool) -> io::Result<bool> {
        if let Some(full) = &mut self.full
            && matches!(event_type, "NODE" | "EDGE")
            && payload["providerKind"] != "java.package_container"
            && full.capture(event_type, &payload).is_err()
        {
            let context = self.context.clone();
            self.fail(
                &context,
                "RESOURCE_LIMIT_EXCEEDED",
                "Summary memory budget exceeded",
            )?;
            return Ok(false);
        }
        let event = json!({"protocolVersion": self.protocol_version, "requestId": self.request_id,
            "sequence": self.sequence, "type": event_type, "payload": payload});
        let mut line = serde_json::to_vec(&event).map_err(io::Error::other)?;
        line.push(b'\n');
        let reserve = if event_type == "ANALYSIS_FAILED" {
            0
        } else {
            self.failure_reservation()?
        };
        if line.len() > self.max_line_bytes
            || self
                .bytes
                .saturating_add(line.len() as u64)
                .saturating_add(reserve)
                > self.max_total_bytes
            || self.sequence >= self.max_events
        {
            if event_type == "ANALYSIS_FAILED" {
                return Err(io::Error::other(
                    "Failure terminal exceeds IPC output limit",
                ));
            }
            let context = self.context.clone();
            self.fail(
                &context,
                "RESOURCE_LIMIT_EXCEEDED",
                "IPC output limit exceeded",
            )?;
            return Ok(false);
        }
        self.output.write_all(&line)?;
        self.output.flush()?;
        if !terminal {
            self.digest.update(&line);
        }
        self.sequence += 1;
        self.bytes += line.len() as u64;
        Ok(true)
    }
    fn failure_reservation(&self) -> io::Result<u64> {
        let mut payload = self.context.as_object().expect("context object").clone();
        payload.insert(
            "error".into(),
            error(
                "RESOURCE_LIMIT_EXCEEDED",
                "IPC output limit exceeded",
                false,
            ),
        );
        let event = json!({"protocolVersion": self.protocol_version, "requestId": self.request_id,
            "sequence": self.max_events.saturating_sub(1), "type": "ANALYSIS_FAILED", "payload": payload});
        // All closed failure codes/messages fit within this margin. Reserve it
        // while streaming so a later resource failure still has a legal terminal.
        Ok(serde_json::to_vec(&event).map_err(io::Error::other)?.len() as u64 + 1 + 256)
    }
    fn checksum(&self) -> String {
        format!("sha256:{:x}", self.digest.clone().finalize())
    }
    fn fail(&mut self, context: &Value, code: &str, message: &str) -> io::Result<ExitCode> {
        let mut payload = context.as_object().expect("context object").clone();
        payload.insert("error".into(), error(code, message, false));
        if !self.emit("ANALYSIS_FAILED", Value::Object(payload), true)? {
            return Err(io::Error::other("Failure terminal not emitted"));
        }
        Ok(ExitCode::SUCCESS)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn retained_fact_digest_omits_only_snapshot() {
        let mut payload = serde_json::json!({"providerSnapshotId":"old","name":"𝒜","n":1});
        let expected = format!(
            "{:x}",
            sha2::Sha256::digest(
                b"{\"n\":{\"$nativeNumber\":\"3ff0000000000000\"},\"name\":\"\xf0\x9d\x92\x9c\"}"
            )
        );
        assert_eq!(super::fact_content_digest(&payload), expected);
        payload["providerSnapshotId"] = serde_json::json!("new");
        assert_eq!(super::fact_content_digest(&payload), expected);
        payload["name"] = serde_json::json!("B");
        assert_ne!(super::fact_content_digest(&payload), expected);
    }

    #[test]
    fn retained_parse_observer_runs_only_after_verified_source() {
        let root = std::env::temp_dir().join(format!(
            "codeatlas-retained-observer-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let source = b"class A {}";
        fs::write(root.join("A.java"), source).unwrap();
        let mut file = serde_json::json!({"path":"A.java","languageHint":"java",
            "classification":{"contentKind":"TEXT"},"contentFingerprint":"sha256:bad"});
        let calls = AtomicUsize::new(0);
        let observe = |path: &str| {
            assert_eq!(path, "A.java");
            calls.fetch_add(1, Ordering::Relaxed);
        };
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let cancelled = std::sync::atomic::AtomicBool::new(false);
        assert!(
            super::parse_source_observed(
                root.to_str().unwrap(),
                &file,
                deadline,
                &cancelled,
                true,
                &observe
            )
            .is_err()
        );
        assert_eq!(calls.load(Ordering::Relaxed), 0);
        file["contentFingerprint"] =
            serde_json::json!(format!("sha256:{:x}", sha2::Sha256::digest(source)));
        assert!(
            super::parse_source_observed(
                root.to_str().unwrap(),
                &file,
                deadline,
                &cancelled,
                true,
                &observe
            )
            .is_ok()
        );
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        fs::remove_file(root.join("A.java")).unwrap();
        fs::remove_dir(root).unwrap();
    }
    use sha2::Digest;
    use std::fs;
    use std::num::NonZeroUsize;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier, Mutex};
    use std::time::Duration;

    use super::{
        EventWriter, FullMetadata, LimitedBytes, Request, checked_result, ordered_batch,
        run_relations, timed_batch,
    };

    #[test]
    fn full_metadata_buffers_refuse_growth_before_crossing_budget() {
        use std::io::Write;
        let mut bytes = LimitedBytes::new(4);
        bytes.write_all(b"1234").unwrap();
        assert!(bytes.write_all(b"5").is_err());
        assert_eq!(bytes.bytes, b"1234");
        assert!(bytes.bytes.capacity() <= 4);
        let mut full = FullMetadata::new(serde_json::json!({}), 2).unwrap();
        assert!(
            full.capture("NODE", &serde_json::json!({"providerFactId":"id"}))
                .is_err()
        );
        assert!(full.facts.is_empty());
    }

    #[test]
    fn injected_worker_panic_maps_to_internal_failure_and_v2_terminal() {
        let caught = std::thread::spawn(|| panic!("test-only injected parser panic")).join();
        let (code, message) = checked_result(caught).unwrap_err();
        assert_eq!(code, "INTERNAL_ANALYZER_FAILURE");
        let context = serde_json::json!({"providerSnapshotId":"s","repositoryId":"r","revisionId":"v","revisionFingerprint":"f"});
        let mut output = Vec::new();
        let mut stream = EventWriter::new(&mut output, "request", &context, 10, 2);
        stream
            .emit("ANALYSIS_STARTED", context.clone(), false)
            .unwrap();
        stream.fail(&context, code, message).unwrap();
        let events: Vec<serde_json::Value> = output
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        assert_eq!(events.len(), 2);
        assert_eq!(events[1]["protocolVersion"], 2);
        assert_eq!(events[1]["type"], "ANALYSIS_FAILED");
        assert_eq!(events[1]["payload"]["error"]["code"], code);
    }

    #[test]
    fn relation_second_pass_same_length_source_change_fails_without_completion() {
        source_change_before_second_pass(1);
    }

    #[test]
    fn full_v3_second_pass_same_length_source_change_fails_without_summary() {
        source_change_before_second_pass(3);
    }

    fn source_change_before_second_pass(version: u64) {
        let root = std::env::temp_dir().join(format!(
            "codeatlas-relation-race-{}-{version}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("src")).unwrap();
        let first = b"class A {}";
        let changed = b"class B {}";
        let path = root.join("src/A.java");
        fs::write(&path, first).unwrap();
        let request = Request {
            protocol_version: version,
            id: "relation-race".into(),
            snapshot_id: "snapshot".into(),
            repository_id: "repo".into(),
            root: root.to_str().unwrap().into(),
            revision_id: "revision".into(),
            revision_fingerprint: "sha256:revision".into(),
            capabilities: vec!["SYMBOL".into(), "CALL".into()],
            source_files: vec![serde_json::json!({
                "id": "file-a", "path": "src/A.java", "contentFingerprint": format!("sha256:{:x}", sha2::Sha256::digest(first)),
                "languageHint": "java", "classification": {"contentKind": "TEXT"}
            })],
            max_duration_ms: 10_000,
            max_memory_bytes: 64 * 1024 * 1024,
            max_events: 100,
            deadline_epoch_ms: None,
        };
        let context = serde_json::json!({"providerSnapshotId":"snapshot","repositoryId":"repo","revisionId":"revision","revisionFingerprint":"sha256:revision"});
        let mut output = Vec::new();
        let mut stream = EventWriter::new(&mut output, &request.id, &context, 100, version);
        if version == 3 {
            stream.full = Some(FullMetadata::new(serde_json::json!({}), 1024 * 1024).unwrap());
        }
        stream
            .emit("ANALYSIS_STARTED", context.clone(), false)
            .unwrap();
        run_relations(
            &request,
            NonZeroUsize::new(1).unwrap(),
            &context,
            &mut stream,
            || {
                fs::write(&path, changed).unwrap();
            },
        )
        .unwrap();
        let events: Vec<serde_json::Value> = output
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
        assert_eq!(
            events.last().unwrap()["payload"]["error"]["code"],
            "SOURCE_CHANGED"
        );
        assert!(
            !events
                .iter()
                .any(|event| event["type"] == "ANALYSIS_COMPLETED"
                    || event["type"] == "SOURCE_FILE"
                    || event["type"] == "ANALYSIS_SUMMARY")
        );
        fs::remove_file(path).unwrap();
        fs::remove_dir(root.join("src")).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn relation_jsonl_byte_limit_emits_failure_instead_of_completion() {
        let root =
            std::env::temp_dir().join(format!("codeatlas-relation-bytes-{}", std::process::id()));
        fs::create_dir_all(root.join("src")).unwrap();
        let source = b"class A {}";
        let path = root.join("src/A.java");
        fs::write(&path, source).unwrap();
        let request = Request {
            protocol_version: 1,
            id: "relation-bytes".into(),
            snapshot_id: "snapshot".into(),
            repository_id: "repo".into(),
            root: root.to_str().unwrap().into(),
            revision_id: "revision".into(),
            revision_fingerprint: "sha256:revision".into(),
            capabilities: vec!["SYMBOL".into(), "CALL".into()],
            source_files: vec![serde_json::json!({
                "id": "file-a", "path": "src/A.java", "contentFingerprint": format!("sha256:{:x}", sha2::Sha256::digest(source)),
                "languageHint": "java", "classification": {"contentKind": "TEXT"}
            })],
            max_duration_ms: 10_000,
            max_memory_bytes: 64 * 1024 * 1024,
            max_events: 100,
            deadline_epoch_ms: None,
        };
        let context = serde_json::json!({"providerSnapshotId":"snapshot","repositoryId":"repo","revisionId":"revision","revisionFingerprint":"sha256:revision"});
        let mut output = Vec::new();
        let mut stream = EventWriter::new(&mut output, &request.id, &context, 100, 1);
        stream
            .emit("ANALYSIS_STARTED", context.clone(), false)
            .unwrap();
        stream.max_total_bytes = stream.bytes + stream.failure_reservation().unwrap() + 300;
        run_relations(
            &request,
            NonZeroUsize::new(1).unwrap(),
            &context,
            &mut stream,
            || {},
        )
        .unwrap();
        let events: Vec<serde_json::Value> = output
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
        assert_eq!(
            events.last().unwrap()["payload"]["error"]["code"],
            "RESOURCE_LIMIT_EXCEEDED"
        );
        fs::remove_file(path).unwrap();
        fs::remove_dir(root.join("src")).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn line_and_total_byte_overflow_emit_failure_terminal() {
        for line_limit in [true, false] {
            let mut output = Vec::new();
            let context = serde_json::json!({"providerSnapshotId":"s","repositoryId":"r","revisionId":"v","revisionFingerprint":"f"});
            let mut stream = EventWriter::new(&mut output, "request", &context, 100, 1);
            let reserved = stream.failure_reservation().unwrap();
            if line_limit {
                stream.max_line_bytes = reserved as usize + 1;
            } else {
                stream.max_total_bytes = reserved + 300;
            }
            assert!(
                stream
                    .emit("ANALYSIS_STARTED", context.clone(), false)
                    .unwrap()
            );
            assert!(
                !stream
                    .emit("NODE", serde_json::json!({"name": "x".repeat(500)}), false)
                    .unwrap()
            );
            let lines: Vec<serde_json::Value> = output
                .split(|byte| *byte == b'\n')
                .filter(|line| !line.is_empty())
                .map(|line| serde_json::from_slice(line).unwrap())
                .collect();
            assert_eq!(lines.len(), 2);
            assert_eq!(lines[1]["type"], "ANALYSIS_FAILED");
            assert_eq!(
                lines[1]["payload"]["error"]["code"],
                "RESOURCE_LIMIT_EXCEEDED"
            );
        }
    }

    #[test]
    fn slow_worker_does_not_hold_deadline_until_batch_join() {
        let started = std::time::Instant::now();
        let result = timed_batch(
            &[0usize, 1],
            Duration::from_millis(25),
            |index, _, cancelled| {
                if index == 0 {
                    while !cancelled.load(Ordering::Relaxed) {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                }
                index
            },
        );
        assert!(result.is_none());
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn later_completion_and_slow_drain_hold_at_most_one_batch() {
        let completed = AtomicUsize::new(0);
        let high_water = AtomicUsize::new(0);
        let barrier = Arc::new(Barrier::new(2));
        let completion_order = Mutex::new(Vec::new());
        let mut order = Vec::new();
        for chunk in (0..6).collect::<Vec<_>>().chunks(2) {
            let results = ordered_batch(chunk, &|index| {
                if index % 2 == 0 {
                    barrier.wait();
                    std::thread::sleep(Duration::from_millis(5));
                } else {
                    barrier.wait();
                }
                let now = completed.fetch_add(1, Ordering::SeqCst) + 1;
                high_water.fetch_max(now, Ordering::SeqCst);
                completion_order.lock().unwrap().push(*index);
                *index
            });
            for result in results {
                order.push(result.unwrap());
                std::thread::sleep(Duration::from_millis(5));
                completed.fetch_sub(1, Ordering::SeqCst);
            }
        }
        assert_eq!(order, [0, 1, 2, 3, 4, 5]);
        assert_eq!(*completion_order.lock().unwrap(), [1, 0, 3, 2, 5, 4]);
        assert_eq!(high_water.load(Ordering::SeqCst), 2);
    }
}
