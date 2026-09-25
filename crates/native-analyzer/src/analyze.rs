use std::collections::HashSet;
use std::io::{self, Write};
use std::num::NonZeroUsize;
use std::path::Path;
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::java_relations::compilation_unit_id;
use codeatlas_native_analyzer::language::{
    LanguageAnalysis, RelationKind, RelationTarget, SyntaxCoverage,
};
use codeatlas_native_analyzer::relation_index::DeclarationIndex;
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

struct Request {
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
            write_one(
                output,
                json!({"protocolVersion": 1, "requestId": request_id, "sequence": 0,
                "type": "REQUEST_FAILED", "payload": {"error": error("INVALID_REQUEST", "Invalid ANALYZE request", false)}}),
            )?;
            return Ok(ExitCode::SUCCESS);
        }
    };
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
            json!({"protocolVersion": 1, "requestId": request.id, "sequence": 0,
            "type": "REQUEST_FAILED", "payload": {"error": error("UNSUPPORTED_CAPABILITY", "Requested capability is unsupported", false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    if request.max_events < 2 {
        write_one(
            output,
            json!({"protocolVersion": 1, "requestId": request.id, "sequence": 0,
            "type": "REQUEST_FAILED", "payload": {"error": error("RESOURCE_LIMIT_EXCEEDED", "Event budget is too small", false)}}),
        )?;
        return Ok(ExitCode::SUCCESS);
    }
    if (worker_count.get() as u64).saturating_mul(WORKER_RESERVATION_BYTES)
        > request.max_memory_bytes
    {
        write_one(
            output,
            json!({"protocolVersion": 1, "requestId": request.id, "sequence": 0,
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
    let mut stream = EventWriter::new(output, &request.id, &context, request.max_events);
    if stream.failure_reservation()? > MAX_LINE_BYTES as u64 {
        write_one(
            stream.output,
            json!({"protocolVersion": 1, "requestId": request.id, "sequence": 0,
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
            for symbol in analysis.symbols {
                let span = symbol.span;
                if !stream.emit("NODE", json!({
                "providerId": "native",
                "providerFactId": symbol.provider_fact_id,
                "providerSnapshotId": request.snapshot_id,
                "repositoryId": request.repository_id,
                "revisionId": request.revision_id,
                "providerKind": symbol.provider_kind,
                "name": symbol.name,
                "qualifiedName": symbol.qualified_name,
                "sourceRange": {"sourceFileId": source_file["id"], "startLine": span.start_line,
                    "startColumn": span.start_column, "endLine": span.end_line, "endColumn": span.end_column},
                "confidence": {"score": 1, "method": "parser", "reasons": []}
            }), false)? {
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
                json!({"capability": "SYMBOL", "sourceFileId": source_file["id"],
            "support": "SUPPORTED", "coverage": coverage}),
                false,
            )? {
                return Ok(ExitCode::SUCCESS);
            }
            counts.coverage += 1;
            for diagnostic in analysis.diagnostics {
                let range = diagnostic.span.map(|span| {
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
        }
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
    terminal.insert("contentFingerprint".into(), json!(checksum));
    terminal.insert("integrityChecksum".into(), json!(checksum));
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
            parse_source(&root, &file, deadline, cancelled, false)
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
            let include_import = request
                .capabilities
                .iter()
                .any(|capability| capability == "IMPORT");
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
            let additional = 1usize
                .saturating_add(analysis.symbols.len())
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
            for symbol in analysis.symbols {
                let span = symbol.span;
                if !stream.emit("NODE", json!({
                    "providerId": "native", "providerFactId": symbol.provider_fact_id,
                    "providerSnapshotId": request.snapshot_id, "repositoryId": request.repository_id,
                    "revisionId": request.revision_id, "providerKind": symbol.provider_kind,
                    "name": symbol.name, "qualifiedName": symbol.qualified_name,
                    "sourceRange": {"sourceFileId": source_file["id"], "startLine": span.start_line,
                        "startColumn": span.start_column, "endLine": span.end_line, "endColumn": span.end_column},
                    "confidence": {"score": 1, "method": "parser", "reasons": []}
                }), false)? {
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
                let target = match relation.target {
                    RelationTarget::Resolved {
                        fact_id,
                        resolution,
                    } => json!({
                        "state": "RESOLVED", "resolution": resolution,
                        "target": {"factType": "NODE", "providerId": "native", "providerFactId": fact_id}
                    }),
                    RelationTarget::NonResolved {
                        resolution,
                        hint,
                        candidates,
                    } => json!({
                        "state": "UNRESOLVED", "resolution": resolution, "originalHint": hint,
                        "candidates": candidates.into_iter().map(|provider_fact_id| json!({
                            "factType": "NODE", "providerId": "native", "providerFactId": provider_fact_id
                        })).collect::<Vec<_>>()
                    }),
                };
                let span = relation.span;
                if !stream.emit("EDGE", json!({
                    "providerId": "native", "providerFactId": relation.provider_fact_id,
                    "providerSnapshotId": request.snapshot_id, "repositoryId": request.repository_id,
                    "revisionId": request.revision_id, "providerKind": relation.provider_kind,
                    "source": {"factType": "NODE", "providerId": "native", "providerFactId": relation.source_fact_id},
                    "target": target,
                    "sourceRange": {"sourceFileId": source_file["id"], "startLine": span.start_line,
                        "startColumn": span.start_column, "endLine": span.end_line, "endColumn": span.end_column},
                    "confidence": {"score": 1, "method": "parser", "reasons": []}
                }), false)? {
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
                    json!({
                        "capability": capability, "sourceFileId": source_file["id"],
                        "support": "SUPPORTED", "coverage": coverage
                    }),
                    false,
                )? {
                    return Ok(ExitCode::SUCCESS);
                }
                counts.coverage += 1;
            }
            for diagnostic in analysis.diagnostics {
                let range = diagnostic.span.map(|span| json!({
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
        }
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
    terminal.insert("contentFingerprint".into(), json!(checksum));
    terminal.insert("integrityChecksum".into(), json!(checksum));
    stream.emit("ANALYSIS_COMPLETED", Value::Object(terminal), true)?;
    Ok(ExitCode::SUCCESS)
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
        || integer(&object["protocolVersion"])? != 1
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

struct EventWriter<'a, W: Write> {
    output: &'a mut W,
    request_id: &'a str,
    context: Value,
    sequence: u64,
    bytes: u64,
    max_events: u64,
    max_line_bytes: usize,
    max_total_bytes: u64,
    digest: Sha256,
}
impl<'a, W: Write> EventWriter<'a, W> {
    fn new(output: &'a mut W, request_id: &'a str, context: &Value, max_events: u64) -> Self {
        Self {
            output,
            request_id,
            context: context.clone(),
            sequence: 0,
            bytes: 0,
            max_events: max_events.min(MAX_EVENT_COUNT),
            max_line_bytes: MAX_LINE_BYTES,
            max_total_bytes: MAX_TOTAL_BYTES,
            digest: Sha256::new(),
        }
    }
    fn has_room(&self, additional_nonterminal: usize) -> bool {
        self.sequence
            .saturating_add(additional_nonterminal as u64)
            .saturating_add(1)
            <= self.max_events
    }
    fn emit(&mut self, event_type: &str, payload: Value, terminal: bool) -> io::Result<bool> {
        let event = json!({"protocolVersion": 1, "requestId": self.request_id,
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
        let event = json!({"protocolVersion": 1, "requestId": self.request_id,
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
    use sha2::Digest;
    use std::fs;
    use std::num::NonZeroUsize;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier, Mutex};
    use std::time::Duration;

    use super::{EventWriter, Request, ordered_batch, run_relations, timed_batch};

    #[test]
    fn relation_second_pass_same_length_source_change_fails_without_completion() {
        let root =
            std::env::temp_dir().join(format!("codeatlas-relation-race-{}", std::process::id()));
        fs::create_dir_all(root.join("src")).unwrap();
        let first = b"class A {}";
        let changed = b"class B {}";
        let path = root.join("src/A.java");
        fs::write(&path, first).unwrap();
        let request = Request {
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
        let mut stream = EventWriter::new(&mut output, &request.id, &context, 100);
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
            !events.iter().any(
                |event| event["type"] == "ANALYSIS_COMPLETED" || event["type"] == "SOURCE_FILE"
            )
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
        let mut stream = EventWriter::new(&mut output, &request.id, &context, 100);
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
            let mut stream = EventWriter::new(&mut output, "request", &context, 100);
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
