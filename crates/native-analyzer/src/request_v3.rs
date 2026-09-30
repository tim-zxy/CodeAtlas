//! Input-contract-only v3 decoder. Not connected to serve_once or capability advertisement.
use crate::analysis_state::{
    array, capabilities, choice, context, digest, exact, limited, number, object, path,
    source_file, state_header, summary, validate_analysis_state,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

// JSON permits escaped lone UTF-16 units; serde_json rejects them during parsing.
// Mask only those six-byte escapes so syntax/envelope precedence still agrees
// with JSON.parse, then reject their scalar values before payload validation.
fn scalar_json(line: &str) -> (String, bool) {
    let mut masked = line.to_owned();
    let bytes = line.as_bytes();
    let mut quoted = false;
    let mut i = 0;
    let mut invalid = false;
    let unit = |at: usize| -> Option<u16> {
        if bytes.get(at..at + 2) != Some(b"\\u") {
            return None;
        }
        let hex = bytes.get(at + 2..at + 6)?;
        if !hex.iter().all(u8::is_ascii_hexdigit) {
            return None;
        }
        u16::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()
    };
    while i < bytes.len() {
        if bytes[i] == b'"' {
            quoted = !quoted;
            i += 1;
        } else if quoted && bytes[i] == b'\\' {
            if let Some(n) = unit(i) {
                if (0xd800..=0xdbff).contains(&n)
                    && unit(i + 6).is_some_and(|low| (0xdc00..=0xdfff).contains(&low))
                {
                    i += 12;
                    continue;
                }
                if (0xd800..=0xdfff).contains(&n) {
                    masked.replace_range(i..i + 6, "\\ufffd");
                    invalid = true;
                }
                i += 6;
            } else {
                i += 2;
            }
        } else {
            i += 1;
        }
    }
    (masked, invalid)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V3ContractError {
    code: &'static str,
}
impl V3ContractError {
    pub fn code(&self) -> &'static str {
        self.code
    }
    pub(crate) fn invalid() -> Self {
        Self {
            code: "INVALID_REQUEST",
        }
    }
    fn corruption() -> Self {
        Self {
            code: "PROTOCOL_CORRUPTION",
        }
    }
}
impl std::fmt::Display for V3ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Native v3 contract: {}", self.code)
    }
}
impl std::error::Error for V3ContractError {}
#[derive(Debug)]
pub struct ValidatedRequestV3 {
    header: Value,
    baseline: Option<Value>,
}
impl ValidatedRequestV3 {
    pub fn header(&self) -> &Value {
        &self.header
    }
    pub fn baseline(&self) -> Option<&Value> {
        self.baseline.as_ref()
    }
}

fn revision(v: &Value, repo: &Value) -> bool {
    let extra = match v["kind"].as_str() {
        Some("WORKTREE") => "baseRevisionId",
        Some("COMMIT") => "commitIdentity",
        Some("SNAPSHOT") => "sourceRevisionId",
        _ => return false,
    };
    object(
        v,
        &["id", "repositoryId", "kind", "contentFingerprint", extra],
    ) && ["id", "repositoryId", "contentFingerprint"]
        .iter()
        .all(|k| exact(&v[k]))
        && v["repositoryId"] == *repo
        && (exact(&v[extra]) || (extra != "commitIdentity" && v[extra].is_null()))
}
fn files(v: &Value, repo: &Value, rev: &Value) -> bool {
    if !array(v, |f| {
        source_file(f) && f["repositoryId"] == *repo && f["revisionId"] == *rev
    }) {
        return false;
    }
    let a = v.as_array().unwrap();
    a.iter()
        .map(|f| f["id"].as_str().unwrap())
        .collect::<BTreeSet<_>>()
        .len()
        == a.len()
        && a.iter()
            .map(|f| f["path"].as_str().unwrap())
            .collect::<BTreeSet<_>>()
            .len()
            == a.len()
}
fn header(v: &Value) -> bool {
    if !object(
        v,
        &[
            "protocolVersion",
            "requestId",
            "sequence",
            "type",
            "payload",
        ],
    ) || !limited(&v["requestId"])
    {
        return false;
    }
    let p = &v["payload"];
    let mut keys = vec![
        "irSchemaVersion",
        "providerSnapshotId",
        "repository",
        "requestedCapabilities",
        "deadlineEpochMs",
        "resourceBudget",
        "analysisStateContext",
        "baselineState",
    ];
    match v["type"].as_str() {
        Some("ANALYZE") => keys.extend(["revision", "sourceFiles"]),
        Some("REFRESH") => keys.extend([
            "baseRevisionId",
            "baseRevisionFingerprint",
            "targetRevision",
            "changes",
            "targetSourceFiles",
        ]),
        _ => return false,
    }
    if !object(p, &keys)
        || p["irSchemaVersion"].as_f64() != Some(1.0)
        || !exact(&p["providerSnapshotId"])
        || !object(&p["repository"], &["id", "rootPath"])
        || !exact(&p["repository"]["id"])
        || !exact(&p["repository"]["rootPath"])
        || !capabilities(&p["requestedCapabilities"])
        || !(p["deadlineEpochMs"].is_null()
            || p["deadlineEpochMs"].as_f64().is_some_and(|n| {
                n.is_finite()
                    && n.fract() == 0.0
                    && n.abs() <= 9_007_199_254_740_991.0
                    && !(n == 0.0 && n.is_sign_negative())
            }))
        || !context(&p["analysisStateContext"])
    {
        return false;
    }
    let budget = &p["resourceBudget"];
    if !object(budget, &["maxDurationMs", "maxMemoryBytes", "maxEvents"])
        || !["maxDurationMs", "maxMemoryBytes", "maxEvents"]
            .iter()
            .all(|k| number(&budget[k]).is_some_and(|n| n > 0))
    {
        return false;
    }
    let repo = &p["repository"]["id"];
    if v["type"] == "ANALYZE" {
        return p["baselineState"].is_null()
            && revision(&p["revision"], repo)
            && files(&p["sourceFiles"], repo, &p["revision"]["id"]);
    }
    let b = &p["baselineState"];
    let c = &p["analysisStateContext"];
    let changes = &p["changes"];
    if !exact(&p["baseRevisionId"])
        || !exact(&p["baseRevisionFingerprint"])
        || !revision(&p["targetRevision"], repo)
        || !files(&p["targetSourceFiles"], repo, &p["targetRevision"]["id"])
        || !state_header(b)
        || b["repositoryId"] != *repo
        || b["revisionId"] != p["baseRevisionId"]
        || b["contentFingerprint"] != p["baseRevisionFingerprint"]
        || c.as_object().unwrap().iter().any(|(k, v)| b[k] != *v)
    {
        return false;
    }
    let caps: BTreeSet<_> = p["requestedCapabilities"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    if b["requestedCapabilities"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect::<BTreeSet<_>>()
        != caps
        || !object(changes, &["added", "modified", "deleted"])
        || !files(&changes["added"], repo, &p["targetRevision"]["id"])
        || !files(&changes["modified"], repo, &p["targetRevision"]["id"])
        || !array(&changes["deleted"], |d| {
            object(d, &["id", "path", "previousContentFingerprint"])
                && exact(&d["id"])
                && path(&d["path"])
                && exact(&d["previousContentFingerprint"])
        })
    {
        return false;
    }
    let changed: Vec<_> = ["added", "modified", "deleted"]
        .iter()
        .flat_map(|k| changes[k].as_array().unwrap())
        .collect();
    changed
        .iter()
        .map(|f| f["id"].as_str().unwrap())
        .collect::<BTreeSet<_>>()
        .len()
        == changed.len()
}
fn delta_matches(h: &Value, summaries: &[Value]) -> bool {
    let p = &h["payload"];
    let prior: BTreeMap<_, _> = summaries
        .iter()
        .map(|s| (s["sourceFile"]["path"].as_str().unwrap(), &s["sourceFile"]))
        .collect();
    let target: BTreeMap<_, _> = p["targetSourceFiles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| (f["path"].as_str().unwrap(), f))
        .collect();
    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut deleted = Vec::new();
    for (path, f) in &target {
        if let Some(old) = prior.get(path) {
            if old["id"] != f["id"] {
                return false;
            }
            if [
                "contentFingerprint",
                "languageHint",
                "classification",
                "sensitivity",
            ]
            .iter()
            .any(|k| old[k] != f[k])
            {
                modified.push((*f).clone());
            }
        } else {
            added.push((*f).clone());
        }
    }
    for (path, f) in &prior {
        if !target.contains_key(path) {
            deleted.push(json!({"id":f["id"],"path":f["path"],"previousContentFingerprint":f["contentFingerprint"]}));
        }
    }
    let matches = |expected: &[Value], actual: &Value| {
        let a = actual.as_array().unwrap();
        expected.len() == a.len()
            && a.iter()
                .map(|f| f["path"].as_str().unwrap())
                .collect::<BTreeSet<_>>()
                .len()
                == a.len()
            && expected.iter().all(|f| a.contains(f))
    };
    matches(&added, &p["changes"]["added"])
        && matches(&modified, &p["changes"]["modified"])
        && matches(&deleted, &p["changes"]["deleted"])
}
pub fn decode_request_v3(bytes: &[u8]) -> Result<ValidatedRequestV3, V3ContractError> {
    let corrupt = V3ContractError::corruption;
    let invalid = V3ContractError::invalid;
    if bytes.len() > 1_000_000 {
        return Err(V3ContractError {
            code: "RESOURCE_LIMIT_EXCEEDED",
        });
    }
    if bytes.last() != Some(&b'\n') || bytes.contains(&b'\r') || bytes.starts_with(&[239, 187, 191])
    {
        return Err(corrupt());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| corrupt())?;
    let lines: Vec<_> = text[..text.len() - 1].split('\n').collect();
    if lines.iter().any(|s| s.trim().is_empty()) {
        return Err(corrupt());
    }
    let mut invalid_scalar = false;
    let records: Vec<Value> = lines
        .iter()
        .map(|s| {
            let (masked, invalid) = scalar_json(s);
            invalid_scalar |= invalid;
            serde_json::from_str(&masked).map_err(|_| corrupt())
        })
        .collect::<Result<_, _>>()?;
    if records.len() < 2
        || records
            .iter()
            .enumerate()
            .any(|(i, r)| r["type"] == "REQUEST_COMPLETED" && i != records.len() - 1)
    {
        return Err(corrupt());
    }
    for r in &records {
        if r["protocolVersion"].as_f64() != Some(3.0) {
            return Err(V3ContractError {
                code: "INCOMPATIBLE_PROTOCOL_VERSION",
            });
        }
    }
    let first = &records[0];
    let last = records.last().unwrap();
    if !limited(&first["requestId"]) {
        return Err(invalid());
    }
    if records.iter().enumerate().any(|(i, r)| {
        r["requestId"] != first["requestId"] || number(&r["sequence"]) != Some(i as u64)
    }) || !choice(&first["type"], &["ANALYZE", "REFRESH"])
        || last["type"] != "REQUEST_COMPLETED"
        || records[1..records.len() - 1]
            .iter()
            .any(|r| r["type"] != "BASELINE_SUMMARY")
    {
        return Err(corrupt());
    }
    if invalid_scalar || !header(first) {
        return Err(invalid());
    }
    let mut summaries = Vec::new();
    for r in &records[1..records.len() - 1] {
        if !object(
            r,
            &[
                "protocolVersion",
                "requestId",
                "sequence",
                "type",
                "payload",
            ],
        ) || !summary(&r["payload"])
        {
            return Err(invalid());
        }
        summaries.push(r["payload"].clone());
    }
    let baseline = if first["type"] == "ANALYZE" {
        if !summaries.is_empty() {
            return Err(invalid());
        }
        None
    } else {
        let b = json!({"header":first["payload"]["baselineState"],"summaries":summaries});
        validate_analysis_state(&b)?;
        if !delta_matches(first, b["summaries"].as_array().unwrap()) {
            return Err(invalid());
        }
        Some(b)
    };
    if !object(
        last,
        &[
            "protocolVersion",
            "requestId",
            "sequence",
            "type",
            "payload",
        ],
    ) || !object(&last["payload"], &["summaryRecords", "integrityChecksum"])
        || number(&last["payload"]["summaryRecords"]) != Some((records.len() - 2) as u64)
        || !digest(&last["payload"]["integrityChecksum"])
    {
        return Err(invalid());
    }
    let prefix_end = bytes[..bytes.len() - 1]
        .iter()
        .rposition(|b| *b == b'\n')
        .map_or(0, |i| i + 1);
    if last["payload"]["integrityChecksum"] != format!("{:x}", Sha256::digest(&bytes[..prefix_end]))
    {
        return Err(corrupt());
    }
    Ok(ValidatedRequestV3 {
        header: first.clone(),
        baseline,
    })
}
