//! Controlled library writer. Production admission/dispatch remains a separate obligation.
use crate::{
    java_syntax::{JavaSyntaxAnalyzer, JavaSyntaxError},
    language::AnalyzerError,
    python::PythonSyntaxAnalyzer,
    source_access::{SourceAccessError, read_verified_source},
    syntax::{SyntaxRequest, SyntaxWalkControl},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::{self, Write},
    path::Path,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub fn write_syntax_observation(
    request: &SyntaxRequest,
    limits: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    let p = &request.header()["payload"];
    let b = &p["resourceBudget"];
    let binding = json!({"expectedActivationBasis":p["expectedActivationBasis"],"targetSource":p["targetSource"],"ownerBinding":p["ownerBinding"],"extractorVersion":p["extractorVersion"]});
    let mut writer = Writer {
        output,
        request_id: request.header()["requestId"].clone(),
        sequence: 0,
        bytes: 0,
        hash: Sha256::new(),
        max_events: b["maxEvents"].as_u64().unwrap().min(10_000),
        failure: None,
        max_bytes: b["maxOutputBytes"].as_u64().unwrap().min(10_000_000),
    };
    let duration = Duration::from_millis(b["maxDurationMs"].as_u64().unwrap());
    let now = Instant::now();
    let mut deadline = now
        .checked_add(duration)
        .unwrap_or(limits.deadline)
        .min(limits.deadline);
    if let Some(epoch) = p["deadlineEpochMs"].as_u64() {
        let epoch_now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let remaining = epoch.saturating_sub(epoch_now.min(u64::MAX as u128) as u64);
        deadline = deadline.min(
            now.checked_add(Duration::from_millis(remaining))
                .unwrap_or(deadline),
        );
    }
    // No memory reservation is inferred here. An admitted caller must supply measured limits.
    let control = SyntaxWalkControl {
        deadline,
        cancelled: limits.cancelled,
        max_source_bytes: limits.max_source_bytes,
        max_items: limits
            .max_items
            .min(b["maxItems"].as_u64().unwrap() as usize),
        max_depth: limits
            .max_depth
            .min(b["maxDepth"].as_u64().unwrap() as usize),
        max_result_bytes: limits.max_result_bytes.min(writer.max_bytes as usize),
    };
    let run = (|| -> Result<(), &'static str> {
        control.check().map_err(analyzer_code)?;
        writer
            .emit("SYNTAX_STARTED", binding.clone(), false)
            .map_err(|_| "RESOURCE_LIMIT_EXCEEDED")?;
        let mut input_bytes = request.raw_input_bytes;
        let mut remaining_items = control.max_items;
        let mut counts = json!({"nodes":0,"edges":0,"syntax":0,"coverage":0,"diagnostics":0});
        let mut partial = false;
        let mut files: Vec<_> = p["sourceFiles"]
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
            .collect();
        files.sort_by(|a, b| {
            a.1["path"]
                .as_str()
                .cmp(&b.1["path"].as_str())
                .then(a.1["id"].as_str().cmp(&b.1["id"].as_str()))
        });
        for (index, file) in files {
            if remaining_items == 0 {
                return Err("RESOURCE_LIMIT_EXCEEDED");
            }
            let file_control = SyntaxWalkControl {
                max_items: remaining_items,
                ..control
            };
            control.check().map_err(analyzer_code)?;
            let source = read_verified_source(
                Path::new(p["repository"]["rootPath"].as_str().unwrap()),
                file["path"].as_str().unwrap(),
                file["contentFingerprint"].as_str().unwrap(),
                control.max_source_bytes.min(
                    (b["maxInputBytes"].as_u64().unwrap() as usize).saturating_sub(input_bytes),
                ),
            )
            .map_err(source_code)?;
            input_bytes += source.len();
            let result = match file["languageHint"].as_str() {
                Some("python") => PythonSyntaxAnalyzer::new()
                    .and_then(|mut a| a.observe(request, index, &source, &file_control))
                    .map_err(analyzer_code)?,
                Some("java") => JavaSyntaxAnalyzer::new()
                    .map_err(analyzer_code)?
                    .observe(request, index, &source, &file_control)
                    .map_err(|e| match e {
                        JavaSyntaxError::InvalidOwnerMapping => "INVALID_REQUEST",
                        JavaSyntaxError::Analyzer(e) => analyzer_code(e),
                    })?,
                _ => return Err("UNSUPPORTED_LANGUAGE"),
            };
            remaining_items = remaining_items
                .checked_sub(result.work_items)
                .ok_or("RESOURCE_LIMIT_EXCEEDED")?;
            partial |= result.coverage["status"] != "COMPLETE";
            for (kind, key, items) in [
                ("NODE", "nodes", result.nodes),
                ("EDGE", "edges", result.edges),
                ("SYNTAX_OBSERVATION", "syntax", result.observations),
                ("COVERAGE", "coverage", vec![result.coverage]),
                ("DIAGNOSTIC", "diagnostics", result.diagnostics),
            ] {
                for item in items {
                    control.check().map_err(analyzer_code)?;
                    writer
                        .emit(kind, item, false)
                        .map_err(|_| "RESOURCE_LIMIT_EXCEEDED")?;
                    counts[key] = json!(counts[key].as_u64().unwrap() + 1);
                }
            }
        }
        control.check().map_err(analyzer_code)?;
        let mut terminal = binding;
        terminal["outcome"] = json!(if partial { "PARTIAL" } else { "SUCCEEDED" });
        terminal["counts"] = counts;
        terminal["checksum"] = json!(format!("{:x}", writer.hash.clone().finalize()));
        writer
            .emit("SYNTAX_COMPLETED", terminal, true)
            .map_err(|_| "RESOURCE_LIMIT_EXCEEDED")?;
        Ok(())
    })();
    if let Some(error) = writer.failure.take() {
        return Err(error);
    }
    if let Err(code) = run {
        let code = if control.cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            "CANCELLED"
        } else {
            code
        };
        writer.emit(
            if writer.sequence == 0 {
                "REQUEST_FAILED"
            } else {
                "SYNTAX_FAILED"
            },
            json!({"code":code,"message":"Syntax observation did not complete","retryable":false}),
            true,
        )?;
    }
    writer.output.flush()
}
fn analyzer_code(e: AnalyzerError) -> &'static str {
    match e {
        AnalyzerError::BudgetExceeded => "BUDGET_EXCEEDED",
        AnalyzerError::ResourceLimit => "RESOURCE_LIMIT_EXCEEDED",
        AnalyzerError::GrammarUnavailable => "UNSUPPORTED_LANGUAGE",
        AnalyzerError::ParserFailed => "INTERNAL_ANALYZER_FAILURE",
    }
}
fn source_code(e: SourceAccessError) -> &'static str {
    match e {
        SourceAccessError::Changed => "SOURCE_CHANGED",
        SourceAccessError::BudgetExceeded => "RESOURCE_LIMIT_EXCEEDED",
        SourceAccessError::InvalidPath
        | SourceAccessError::InvalidRoot
        | SourceAccessError::LinkDenied => "INVALID_REQUEST",
        SourceAccessError::Io(_) => "INTERNAL_ANALYZER_FAILURE",
    }
}
struct Writer<'a, W> {
    output: &'a mut W,
    request_id: Value,
    sequence: u64,
    bytes: u64,
    hash: Sha256,
    failure: Option<io::Error>,
    max_events: u64,
    max_bytes: u64,
}
impl<W: Write> Writer<'_, W> {
    fn emit(&mut self, kind: &str, payload: Value, terminal: bool) -> io::Result<()> {
        let mut raw = serde_json::to_vec(
            &json!({"protocolVersion":4,"requestId":self.request_id,"sequence":self.sequence,"type":kind,"payload":payload}),
        )?;
        raw.push(b'\n');
        if raw.len() > 1_000_000
            || self.sequence + 1 + u64::from(!terminal) > self.max_events
            || self.bytes + raw.len() as u64 > self.max_bytes
        {
            return Err(io::Error::other("Syntax output limit"));
        }
        if let Err(error) = self.output.write_all(&raw) {
            self.failure = Some(error);
            return Err(io::Error::other("Syntax output unavailable"));
        }
        self.hash.update(&raw);
        self.bytes += raw.len() as u64;
        self.sequence += 1;
        Ok(())
    }
}
