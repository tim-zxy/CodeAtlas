use std::collections::HashSet;
use std::io::{self, Write};
use std::num::NonZeroUsize;
use std::path::Path;
use std::process::ExitCode;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::language::{LanguageAnalysis, LanguageAnalyzer, SyntaxCoverage};
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
    if request
        .capabilities
        .iter()
        .any(|capability| capability != "SYMBOL")
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
    let mut stream = EventWriter::new(output, &request.id, request.max_events);
    stream.emit("ANALYSIS_STARTED", context.clone(), false)?;
    let started = Instant::now();
    let mut counts = Counts::default();
    let mut partial = false;
    // At most one batch of worker_count files is parsed before output drains.
    // Holding a later completed result can therefore never accumulate across batches.
    for chunk in request.source_files.chunks(worker_count.get()) {
        let results = ordered_batch(chunk, &|file| parse_source(&request.root, file));
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
                Ok(Err(ProcessingError::Parser)) | Err(_) => {
                    return stream.fail(&context, "INTERNAL_ANALYZER_FAILURE", "Java parse failed");
                }
            };
            if !stream.has_room(analysis.symbols.len() + analysis.diagnostics.len() + 2) {
                return stream.fail(&context, "RESOURCE_LIMIT_EXCEEDED", "Event budget exceeded");
            }
            stream.emit("SOURCE_FILE", source_file.clone(), false)?;
            counts.source_files += 1;
            for symbol in analysis.symbols {
                let span = symbol.span;
                stream.emit("NODE", json!({
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
            }), false)?;
                counts.nodes += 1;
            }
            let coverage = match analysis.coverage {
                SyntaxCoverage::Complete => "COMPLETE",
                SyntaxCoverage::Partial => {
                    partial = true;
                    "PARTIAL"
                }
            };
            stream.emit(
                "COVERAGE",
                json!({"capability": "SYMBOL", "sourceFileId": source_file["id"],
            "support": "SUPPORTED", "coverage": coverage}),
                false,
            )?;
            counts.coverage += 1;
            for diagnostic in analysis.diagnostics {
                let range = diagnostic.span.map(|span| {
                    json!({"sourceFileId": source_file["id"],
                "startLine": span.start_line, "startColumn": span.start_column,
                "endLine": span.end_line, "endColumn": span.end_column})
                });
                stream.emit(
                    "DIAGNOSTIC",
                    json!({"code": diagnostic.code, "severity": "WARNING",
                "message": diagnostic.message, "sourceRange": range}),
                    false,
                )?;
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
    Parser,
}

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

fn parse_source(root: &str, source_file: &Value) -> Result<LanguageAnalysis, ProcessingError> {
    let path = source_file["path"].as_str().expect("validated path");
    if source_file["languageHint"] != "java" || !path.ends_with(".java") {
        return Err(ProcessingError::Unsupported);
    }
    let expected = source_file["contentFingerprint"]
        .as_str()
        .expect("validated fingerprint");
    let source_bytes = read_verified_source(
        Path::new(root),
        path,
        expected,
        (WORKER_RESERVATION_BYTES / 2) as usize,
    )
    .map_err(ProcessingError::Source)?;
    let mut analyzer = JavaAnalyzer::new().map_err(|_| ProcessingError::Parser)?;
    analyzer
        .analyze(path, &source_bytes)
        .map_err(|_| ProcessingError::Parser)
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
    coverage: u64,
    diagnostics: u64,
}
impl Counts {
    fn to_value(&self) -> Value {
        json!({"sourceFiles": self.source_files, "nodes": self.nodes, "edges": 0,
            "coverage": self.coverage, "diagnostics": self.diagnostics})
    }
}

struct EventWriter<'a, W: Write> {
    output: &'a mut W,
    request_id: &'a str,
    sequence: u64,
    bytes: u64,
    max_events: u64,
    digest: Sha256,
}
impl<'a, W: Write> EventWriter<'a, W> {
    fn new(output: &'a mut W, request_id: &'a str, max_events: u64) -> Self {
        Self {
            output,
            request_id,
            sequence: 0,
            bytes: 0,
            max_events: max_events.min(MAX_EVENT_COUNT),
            digest: Sha256::new(),
        }
    }
    fn has_room(&self, additional_nonterminal: usize) -> bool {
        self.sequence
            .saturating_add(additional_nonterminal as u64)
            .saturating_add(1)
            <= self.max_events
    }
    fn emit(&mut self, event_type: &str, payload: Value, terminal: bool) -> io::Result<()> {
        let event = json!({"protocolVersion": 1, "requestId": self.request_id,
            "sequence": self.sequence, "type": event_type, "payload": payload});
        let mut line = serde_json::to_vec(&event).map_err(io::Error::other)?;
        line.push(b'\n');
        if line.len() > MAX_LINE_BYTES
            || self.bytes + line.len() as u64 > MAX_TOTAL_BYTES
            || self.sequence >= self.max_events
        {
            return Err(io::Error::other("IPC output limit exceeded"));
        }
        self.output.write_all(&line)?;
        self.output.flush()?;
        if !terminal {
            self.digest.update(&line);
        }
        self.sequence += 1;
        self.bytes += line.len() as u64;
        Ok(())
    }
    fn checksum(&self) -> String {
        format!("sha256:{:x}", self.digest.clone().finalize())
    }
    fn fail(&mut self, context: &Value, code: &str, message: &str) -> io::Result<ExitCode> {
        let mut payload = context.as_object().expect("context object").clone();
        payload.insert("error".into(), error(code, message, false));
        self.emit("ANALYSIS_FAILED", Value::Object(payload), true)?;
        Ok(ExitCode::SUCCESS)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier, Mutex};
    use std::time::Duration;

    use super::ordered_batch;

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
