//! V5 library writer only. No CLI dispatch,profile or Store authority.
use crate::{
    code_syntax::{CodeSyntaxFileObservation, CodeSyntaxRequest, decode_code_syntax_request},
    java_syntax::{JavaSyntaxAnalyzer, JavaSyntaxError},
    language::AnalyzerError,
    python::PythonSyntaxAnalyzer,
    source_access::{SourceAccessError, read_verified_source},
    syntax::{SYNTAX_MAX_REQUEST_BYTES, SyntaxWalkControl, depth, trim},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::{self, Write},
    path::Path,
    sync::atomic::Ordering,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
pub fn write_code_syntax_observation(
    request: &CodeSyntaxRequest,
    limits: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    write_code_syntax_observation_core(request, limits, output, false)
}
pub(crate) fn write_code_syntax_observation_core(
    request: &CodeSyntaxRequest,
    limits: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
    binding_v6: bool,
) -> io::Result<()> {
    write_code_syntax_observation_mode(
        request,
        limits,
        output,
        if binding_v6 {
            crate::code_syntax::CodeSyntaxMode::BindingV2
        } else {
            crate::code_syntax::CodeSyntaxMode::CodeSyntaxV1
        },
    )
}
pub(crate) fn write_code_syntax_observation_mode(
    request: &CodeSyntaxRequest,
    limits: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
    mode: crate::code_syntax::CodeSyntaxMode,
) -> io::Result<()> {
    let binding_v6 = mode.selector().is_some();
    let v7 = matches!(
        mode,
        crate::code_syntax::CodeSyntaxMode::BindingV3
            | crate::code_syntax::CodeSyntaxMode::FrameworkSurfaceV4
    );
    let p = &request.header()["payload"];
    let b = &p["resourceBudget"];
    let mut binding = json!({"expectedActivationBasis":p["expectedActivationBasis"],"targetSource":p["targetSource"],"ownerBinding":p["ownerBinding"],"extractorVersion":p["extractorVersion"],"codeContract":p["codeContract"],"requestChecksum":request.request_checksum()});
    if binding_v6 {
        binding["syntaxContract"] = p["syntaxContract"].clone();
    }
    // Same hard event/output/line bounds as the existing Native client,not new defaults.
    let mut writer = Writer {
        output,
        version: mode.version(),
        request_id: request.header()["requestId"].clone(),
        sequence: 0,
        bytes: 0,
        hash: Sha256::new(),
        max_events: b["maxEvents"].as_u64().unwrap().min(10_000),
        max_bytes: b["maxOutputBytes"].as_u64().unwrap().min(10_000_000),
        max_depth: b["maxDepth"].as_u64().unwrap().min(limits.max_depth as u64),
        failure: None,
    };
    let now = Instant::now();
    let mut deadline = now
        .checked_add(Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()))
        .unwrap_or(limits.deadline)
        .min(limits.deadline);
    if let Some(epoch) = p["deadlineEpochMs"].as_u64() {
        let epoch_now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u64::MAX as u128) as u64;
        deadline = deadline.min(
            now.checked_add(Duration::from_millis(epoch.saturating_sub(epoch_now)))
                .unwrap_or(deadline),
        );
    }
    let control = SyntaxWalkControl {
        deadline,
        cancelled: limits.cancelled,
        max_source_bytes: limits.max_source_bytes,
        max_items: limits
            .max_items
            .min(usize::try_from(b["maxItems"].as_u64().unwrap()).unwrap_or(usize::MAX)),
        max_depth: limits
            .max_depth
            .min(usize::try_from(b["maxDepth"].as_u64().unwrap()).unwrap_or(usize::MAX)),
        max_result_bytes: limits.max_result_bytes.min(writer.max_bytes as usize),
    };
    let run = (|| -> Result<(), &'static str> {
        control.check().map_err(analyzer_code)?;
        writer
            .emit("OBSERVATION_STARTED", binding.clone(), false)
            .map_err(|_| "RESOURCE_LIMIT_EXCEEDED")?;
        let mut input_bytes = request.raw_input_bytes;
        let max_input = usize::try_from(b["maxInputBytes"].as_u64().unwrap()).unwrap_or(usize::MAX);
        let mut remaining_items = control.max_items;
        let mut code_partial = false;
        let mut syntax_partial = false;
        let mut python_files = 0;
        let mut counts = json!({"nodes":0,"edges":0,"syntax":0,"codeCoverage":0,"syntaxCoverage":0,"diagnostics":0});
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
            control.check().map_err(analyzer_code)?;
            if remaining_items == 0 {
                #[cfg(test)]
                eprintln!(
                    "AB_GUARD writer.remaining_items remaining={} items_limit={}",
                    remaining_items, control.max_items
                );
                return Err("RESOURCE_LIMIT_EXCEEDED");
            }
            let file_control = SyntaxWalkControl {
                max_items: remaining_items,
                ..control
            };
            let source = read_verified_source(
                Path::new(p["repository"]["rootPath"].as_str().unwrap()),
                file["path"].as_str().unwrap(),
                file["contentFingerprint"].as_str().unwrap(),
                control
                    .max_source_bytes
                    .min(max_input.saturating_sub(input_bytes)),
            )
            .map_err(source_code)?;
            #[cfg(test)]
            if input_bytes.checked_add(source.len()).is_none() {
                eprintln!(
                    "AB_GUARD writer.input_overflow bytes={} added={} capacity={}",
                    input_bytes,
                    source.len(),
                    usize::MAX
                );
            }
            input_bytes = input_bytes
                .checked_add(source.len())
                .ok_or("RESOURCE_LIMIT_EXCEEDED")?;
            if input_bytes > max_input {
                #[cfg(test)]
                eprintln!(
                    "AB_GUARD writer.input_bytes bytes={} bytes_limit={}",
                    input_bytes, max_input
                );
                return Err("RESOURCE_LIMIT_EXCEEDED");
            }
            let result = match file["languageHint"].as_str() {
                Some("python") => {
                    python_files += 1;
                    PythonSyntaxAnalyzer::new()
                        .and_then(|mut a| {
                            if v7 {
                                a.observe_binding_sufficiency(p, index, &source, &file_control)
                            } else if binding_v6 {
                                a.observe_binding_syntax(p, index, &source, &file_control)
                            } else {
                                a.observe_code_syntax(p, index, &source, &file_control)
                            }
                        })
                        .map_err(analyzer_code)?
                }
                Some("java") => {
                    let mut analyzer = JavaSyntaxAnalyzer::new().map_err(analyzer_code)?;
                    let syntax = if v7 {
                        analyzer.observe_binding_sufficiency(p, index, &source, &file_control)
                    } else if binding_v6 {
                        analyzer.observe_binding_syntax(p, index, &source, &file_control)
                    } else {
                        analyzer.observe_payload(p, index, &source, &file_control)
                    };
                    let syntax = syntax.map_err(|e| match e {
                        JavaSyntaxError::InvalidOwnerMapping => "INVALID_REQUEST",
                        JavaSyntaxError::Analyzer(e) => analyzer_code(e),
                    })?;
                    if !syntax.nodes.is_empty() || !syntax.edges.is_empty() {
                        return Err("INTERNAL_ANALYZER_FAILURE");
                    }
                    CodeSyntaxFileObservation {
                        syntax,
                        code_coverage: vec![],
                    }
                }
                _ => return Err("UNSUPPORTED_LANGUAGE"),
            };
            #[cfg(test)]
            if remaining_items
                .checked_sub(result.syntax.work_items)
                .is_none()
            {
                eprintln!(
                    "AB_GUARD writer.work_underflow used={} remaining={}",
                    result.syntax.work_items, remaining_items
                );
            }
            remaining_items = remaining_items
                .checked_sub(result.syntax.work_items)
                .ok_or("RESOURCE_LIMIT_EXCEEDED")?;
            syntax_partial |= result.syntax.coverage["status"] != "COMPLETE";
            code_partial |= result
                .code_coverage
                .iter()
                .any(|c| c["status"] != "COMPLETE");
            for (kind, key, items) in [
                ("NODE", "nodes", result.syntax.nodes),
                ("EDGE", "edges", result.syntax.edges),
                ("SYNTAX_OBSERVATION", "syntax", result.syntax.observations),
                ("CODE_COVERAGE", "codeCoverage", result.code_coverage),
                (
                    "SYNTAX_COVERAGE",
                    "syntaxCoverage",
                    vec![result.syntax.coverage],
                ),
                ("DIAGNOSTIC", "diagnostics", result.syntax.diagnostics),
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
        terminal["codeOutcome"] = json!(if python_files == 0 {
            "NOT_APPLICABLE"
        } else if code_partial {
            "PARTIAL"
        } else {
            "COMPLETE"
        });
        terminal["syntaxOutcome"] = json!(if syntax_partial {
            "PARTIAL"
        } else {
            "COMPLETE"
        });
        terminal["outcome"] = json!(if code_partial || syntax_partial {
            "PARTIAL"
        } else {
            "SUCCEEDED"
        });
        terminal["counts"] = counts;
        terminal["checksum"] = json!(format!("{:x}", writer.hash.clone().finalize()));
        writer
            .emit("OBSERVATION_COMPLETED", terminal, true)
            .map_err(|_| "RESOURCE_LIMIT_EXCEEDED")?;
        Ok(())
    })();
    let completed = run.is_ok();
    if let Some(e) = writer.failure.take() {
        return Err(e);
    }
    if let Err(code) = run {
        let code = if control.cancelled.load(Ordering::Relaxed) {
            "CANCELLED"
        } else {
            code
        };
        writer.emit(if writer.sequence==0{"REQUEST_FAILED"}else{"OBSERVATION_FAILED"},json!({"code":code,"message":"Code/Syntax observation did not complete","retryable":false}),true)?;
    }
    writer.output.flush()?;
    // Completed bytes are not applicable if the owning library call fails settlement.
    if completed && control.check().is_err() {
        return Err(io::Error::new(
            io::ErrorKind::Interrupted,
            "Code/Syntax observation did not settle",
        ));
    }
    Ok(())
}

pub fn serve_code_syntax_request(
    bytes: &[u8],
    control: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    if let Some(request) = decode_or_refuse(bytes, output)? {
        write_code_syntax_observation(&request, control, output)
    } else {
        Ok(())
    }
}
/// Explicit v5 dispatch using only strictly validated caller budgets.
pub fn serve_code_syntax_request_from_budget(
    bytes: &[u8],
    cancelled: &std::sync::atomic::AtomicBool,
    output: &mut impl Write,
) -> io::Result<()> {
    let Some(request) = decode_or_refuse(bytes, output)? else {
        return Ok(());
    };
    let b = &request.header()["payload"]["resourceBudget"];
    let size = |key: &str| usize::try_from(b[key].as_u64().unwrap()).map_err(|_| invalid());
    let now = Instant::now();
    let control = SyntaxWalkControl {
        deadline: now
            .checked_add(Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()))
            .unwrap_or(now),
        cancelled,
        max_source_bytes: size("maxInputBytes")?,
        max_items: size("maxItems")?,
        max_depth: size("maxDepth")?,
        max_result_bytes: size("maxOutputBytes")?,
    };
    write_code_syntax_observation(&request, &control, output)
}
fn decode_or_refuse(
    bytes: &[u8],
    output: &mut impl Write,
) -> io::Result<Option<CodeSyntaxRequest>> {
    if bytes.len() > SYNTAX_MAX_REQUEST_BYTES {
        return Err(invalid());
    }
    match decode_code_syntax_request(bytes) {
        Ok(r) => Ok(Some(r)),
        Err(error) => {
            let first = bytes.split(|b| *b == b'\n').next().ok_or_else(invalid)?;
            let v: Value = serde_json::from_slice(first).map_err(|_| invalid())?;
            let id = v["requestId"]
                .as_str()
                .filter(|s| !s.is_empty() && s.trim_matches(trim) == *s)
                .ok_or_else(invalid)?;
            let mut record = serde_json::to_vec(
                &json!({"protocolVersion":5,"requestId":id,"sequence":0,"type":"REQUEST_FAILED","payload":{"code":error.code(),"message":"Invalid Code/Syntax observation request","retryable":false}}),
            )?;
            record.push(b'\n');
            if record.len() > SYNTAX_MAX_REQUEST_BYTES {
                return Err(invalid());
            }
            output.write_all(&record)?;
            output.flush()?;
            Ok(None)
        }
    }
}
fn invalid() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "Invalid Code/Syntax request framing or identity",
    )
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
    #[cfg(test)]
    if matches!(&e, SourceAccessError::BudgetExceeded) {
        eprintln!(
            "AB_GUARD source.read bytes=UNKNOWN limit=REQUEST_DERIVED; see frozen request allowance"
        );
    }
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
    version: u64,
    request_id: Value,
    sequence: u64,
    bytes: u64,
    hash: Sha256,
    max_events: u64,
    max_bytes: u64,
    max_depth: u64,
    failure: Option<io::Error>,
}
impl<W: Write> Writer<'_, W> {
    fn emit(&mut self, kind: &str, payload: Value, terminal: bool) -> io::Result<()> {
        let record = json!({"protocolVersion":self.version,"requestId":self.request_id,"sequence":self.sequence,"type":kind,"payload":payload});
        depth(&record, 0, self.max_depth)
            .map_err(|_| io::Error::other("Code/Syntax output depth limit"))?;
        let mut raw = serde_json::to_vec(&record)?;
        raw.push(b'\n');
        if raw.len() > SYNTAX_MAX_REQUEST_BYTES
            || self.sequence + 1 + u64::from(!terminal) > self.max_events
            || self.bytes + raw.len() as u64 > self.max_bytes
        {
            #[cfg(test)]
            eprintln!(
                "AB_GUARD writer.emit line_bytes={} line_limit={} events={} events_limit={} bytes={} bytes_limit={}",
                raw.len(),
                SYNTAX_MAX_REQUEST_BYTES,
                self.sequence + 1 + u64::from(!terminal),
                self.max_events,
                self.bytes + raw.len() as u64,
                self.max_bytes
            );
            return Err(io::Error::other("Code/Syntax output limit"));
        }
        if let Err(e) = self.output.write_all(&raw) {
            self.failure = Some(e);
            return Err(io::Error::other("Code/Syntax output unavailable"));
        }
        self.hash.update(&raw);
        self.bytes += raw.len() as u64;
        self.sequence += 1;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn code_syntax_line_limit_uses_exact_serialized_bytes() {
        let envelope = |payload: Value| json!({"protocolVersion":5,"requestId":"line:unit","sequence":0,"type":"NODE","payload":payload});
        let empty = serde_json::to_vec(&envelope(json!(""))).unwrap().len() + 1;
        let n = SYNTAX_MAX_REQUEST_BYTES - empty;
        for delta in [-1isize, 0, 1] {
            let mut out = vec![];
            let mut w = Writer {
                output: &mut out,
                version: 5,
                request_id: json!("line:unit"),
                sequence: 0,
                bytes: 0,
                hash: Sha256::new(),
                max_events: 10_000,
                max_bytes: 10_000_000,
                max_depth: 1,
                failure: None,
            };
            let result = w.emit(
                "NODE",
                json!("x".repeat((n as isize + delta) as usize)),
                false,
            );
            assert_eq!(result.is_ok(), delta <= 0);
            if delta <= 0 {
                assert_eq!(
                    out.len(),
                    (SYNTAX_MAX_REQUEST_BYTES as isize + delta) as usize
                );
            } else {
                assert!(out.is_empty());
            }
        }
    }
}
