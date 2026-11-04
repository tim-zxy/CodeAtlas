//! Isolated strict v4 request contract and bounded library controls; no process dispatch or state authority.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub(crate) const SYNTAX_MAX_REQUEST_BYTES: usize = 1_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyntaxRequestError {
    code: &'static str,
}
impl SyntaxRequestError {
    pub fn code(&self) -> &'static str {
        self.code
    }
}
type Result<T> = std::result::Result<T, SyntaxRequestError>;
pub(crate) fn error(code: &'static str) -> SyntaxRequestError {
    SyntaxRequestError { code }
}
pub(crate) fn require(ok: bool) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(error("INVALID_REQUEST"))
    }
}
pub(crate) fn fields(v: &Value, keys: &[&str]) -> Result<()> {
    let o = v.as_object().ok_or(error("INVALID_REQUEST"))?;
    require(o.len() == keys.len() && keys.iter().all(|k| o.contains_key(*k)))
}
pub(crate) fn trim(c: char) -> bool {
    matches!(c,'\u{0009}'..='\u{000d}'|'\u{0020}'|'\u{00a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
pub(crate) fn text(v: &Value) -> Result<&str> {
    let s = v.as_str().ok_or(error("INVALID_REQUEST"))?;
    require(!s.is_empty() && s.trim_matches(trim) == s)?;
    Ok(s)
}
pub(crate) fn number(v: &Value) -> Result<u64> {
    let n = v.as_f64().ok_or(error("INVALID_REQUEST"))?;
    require(
        n.is_finite()
            && (0.0..=9_007_199_254_740_991.0).contains(&n)
            && n.fract() == 0.0
            && !(n == 0.0 && n.is_sign_negative()),
    )?;
    Ok(n as u64)
}
fn array(v: &Value) -> Result<&Vec<Value>> {
    v.as_array().ok_or(error("INVALID_REQUEST"))
}
fn hex(v: &Value) -> Result<()> {
    let s = text(v)?;
    require(
        s.len() == 64
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
    )
}
fn strings(v: &Value, keys: &[&str]) -> Result<()> {
    for k in keys {
        text(&v[*k])?;
    }
    Ok(())
}
fn basis(v: &Value, active: bool) -> Result<()> {
    let keys = if active {
        &[
            "repositoryId",
            "revisionId",
            "contentFingerprint",
            "codeActivationDigest",
        ][..]
    } else {
        &["repositoryId", "revisionId", "contentFingerprint"][..]
    };
    fields(v, keys)?;
    strings(v, &keys[..3])?;
    if active {
        hex(&v["codeActivationDigest"])?;
    }
    Ok(())
}
fn relative(v: &Value) -> Result<&str> {
    let s = text(v)?;
    let drive = s.as_bytes().get(1) == Some(&b':')
        && s.as_bytes().get(2) == Some(&b'/')
        && s.as_bytes()[0].is_ascii_alphabetic();
    require(
        !s.contains(['\\', '\0'])
            && !s.starts_with('/')
            && !drive
            && !s.ends_with('/')
            && !s.split('/').any(|c| c.is_empty() || c == "." || c == ".."),
    )?;
    Ok(s)
}
fn unique(values: impl Iterator<Item = String>) -> Result<()> {
    let mut seen = HashSet::new();
    for s in values {
        require(seen.insert(s))?;
    }
    Ok(())
}
pub(crate) fn depth(v: &Value, at: u64, max: u64) -> Result<()> {
    if at > max {
        #[cfg(test)]
        eprintln!(
            "AB_GUARD serialization.depth depth={} depth_limit={}",
            at, max
        );
        return Err(error("RESOURCE_LIMIT_EXCEEDED"));
    }
    match v {
        Value::Array(a) => {
            for child in a {
                depth(child, at + 1, max)?;
            }
        }
        Value::Object(o) => {
            for child in o.values() {
                depth(child, at + 1, max)?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[derive(Debug)]
pub struct SyntaxRequest {
    header: Value,
    pub(crate) raw_input_bytes: usize,
}
impl SyntaxRequest {
    pub fn header(&self) -> &Value {
        &self.header
    }
}

pub fn decode_syntax_request(bytes: &[u8]) -> Result<SyntaxRequest> {
    if bytes.len() > SYNTAX_MAX_REQUEST_BYTES {
        return Err(error("RESOURCE_LIMIT_EXCEEDED"));
    }
    require(
        !bytes.is_empty()
            && bytes.last() == Some(&b'\n')
            && !bytes[..bytes.len() - 1].contains(&b'\n')
            && !bytes.contains(&b'\r')
            && !bytes.starts_with(&[239, 187, 191]),
    )?;
    let r: Value = serde_json::from_slice(bytes).map_err(|_| error("INVALID_REQUEST"))?;
    if r.get("protocolVersion").is_some() && number(&r["protocolVersion"]).ok() != Some(4) {
        return Err(error("INCOMPATIBLE_PROTOCOL_VERSION"));
    }
    fields(
        &r,
        &[
            "protocolVersion",
            "requestId",
            "sequence",
            "type",
            "payload",
        ],
    )?;
    require(
        number(&r["protocolVersion"])? == 4
            && number(&r["sequence"])? == 0
            && r["type"] == "OBSERVE_SYNTAX",
    )?;
    text(&r["requestId"])?;
    let p = &r["payload"];
    fields(
        p,
        &[
            "irSchemaVersion",
            "repository",
            "expectedActivationBasis",
            "targetSource",
            "ownerBinding",
            "providerId",
            "providerVersion",
            "providerSnapshotId",
            "extractorVersion",
            "languages",
            "sourceFiles",
            "removedSourceFiles",
            "owners",
            "deadlineEpochMs",
            "resourceBudget",
        ],
    )?;
    validate_common_payload(p)?;
    let budget = &p["resourceBudget"];
    if bytes.len() as u64 > number(&budget["maxInputBytes"])? {
        return Err(error("RESOURCE_LIMIT_EXCEEDED"));
    }
    depth(&r, 0, number(&budget["maxDepth"])?)?;
    require(owner_map_digest(p)? == p["ownerBinding"]["ownerMapDigest"].as_str().unwrap())?;
    Ok(SyntaxRequest {
        header: r,
        raw_input_bytes: bytes.len(),
    })
}
pub(crate) fn validate_common_payload(p: &Value) -> Result<()> {
    require(number(&p["irSchemaVersion"])? == 1)?;
    fields(&p["repository"], &["id", "rootPath"])?;
    strings(&p["repository"], &["id", "rootPath"])?;
    strings(
        p,
        &[
            "providerId",
            "providerVersion",
            "providerSnapshotId",
            "extractorVersion",
        ],
    )?;
    let t = &p["targetSource"];
    basis(t, false)?;
    let b = &p["expectedActivationBasis"];
    require(p["repository"]["id"] == t["repositoryId"])?;
    if !b.is_null() {
        basis(b, true)?;
        require(b["repositoryId"] == t["repositoryId"])?;
    }
    let binding = &p["ownerBinding"];
    let kind = text(&binding["kind"])?;
    match kind {
        "ACTIVE_CODE" => {
            fields(binding, &["kind", "codeActivationDigest", "ownerMapDigest"])?;
            hex(&binding["codeActivationDigest"])?;
            require(
                !b.is_null()
                    && b["codeActivationDigest"] == binding["codeActivationDigest"]
                    && b["repositoryId"] == t["repositoryId"]
                    && b["revisionId"] == t["revisionId"]
                    && b["contentFingerprint"] == t["contentFingerprint"],
            )?;
        }
        "PROVISIONAL_CODE" => {
            fields(binding, &["kind", "stageDigest", "ownerMapDigest"])?;
            hex(&binding["stageDigest"])?;
        }
        _ => return Err(error("INVALID_REQUEST")),
    }
    hex(&binding["ownerMapDigest"])?;
    let languages = array(&p["languages"])?;
    require(!languages.is_empty())?;
    for l in languages {
        fields(
            l,
            &[
                "languageId",
                "grammarVersion",
                "analyzerVersion",
                "compatibilityVersion",
            ],
        )?;
        strings(
            l,
            &[
                "languageId",
                "grammarVersion",
                "analyzerVersion",
                "compatibilityVersion",
            ],
        )?;
        require(l["languageId"] == "java" || l["languageId"] == "python")?;
    }
    unique(
        languages
            .iter()
            .map(|l| l["languageId"].as_str().unwrap().to_owned()),
    )?;
    let files = array(&p["sourceFiles"])?;
    let removed = array(&p["removedSourceFiles"])?;
    for f in files {
        fields(
            f,
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
        )?;
        strings(
            f,
            &[
                "id",
                "repositoryId",
                "revisionId",
                "contentFingerprint",
                "sensitivity",
            ],
        )?;
        relative(&f["path"])?;
        require(
            f["repositoryId"] == t["repositoryId"]
                && f["revisionId"] == t["revisionId"]
                && languages
                    .iter()
                    .any(|l| l["languageId"] == f["languageHint"]),
        )?;
        require(
            ["PUBLIC", "INTERNAL", "SENSITIVE"]
                .iter()
                .any(|s| f["sensitivity"] == *s),
        )?;
        let c = &f["classification"];
        fields(c, &["role", "provenance", "contentKind"])?;
        require(
            (c["role"] == "SOURCE" || c["role"] == "TEST")
                && c["contentKind"] == "TEXT"
                && ["AUTHORED", "GENERATED", "VENDOR"]
                    .iter()
                    .any(|s| c["provenance"] == *s),
        )?;
    }
    for f in removed {
        fields(f, &["id", "path", "previousContentFingerprint"])?;
        strings(f, &["id", "previousContentFingerprint"])?;
        relative(&f["path"])?;
    }
    for key in ["id", "path"] {
        unique(
            files
                .iter()
                .chain(removed)
                .map(|f| f[key].as_str().unwrap().to_owned()),
        )?;
    }
    let owners = array(&p["owners"])?;
    for o in owners {
        fields(o, &["sourceFileId", "providerNodeRef", "canonicalRef"])?;
        text(&o["sourceFileId"])?;
        let provider = &o["providerNodeRef"];
        fields(provider, &["factType", "providerId", "providerFactId"])?;
        strings(provider, &["providerId", "providerFactId"])?;
        require(provider["factType"] == "NODE" && provider["providerId"] == p["providerId"])?;
        let canonical = &o["canonicalRef"];
        fields(canonical, &["scope", "repositoryId", "entity"])?;
        let entity = &canonical["entity"];
        fields(entity, &["kind", "id", "revisionId"])?;
        strings(entity, &["id", "revisionId"])?;
        require(
            canonical["scope"] == "REPOSITORY"
                && canonical["repositoryId"] == t["repositoryId"]
                && entity["kind"] == "CODE_NODE"
                && entity["revisionId"] == t["revisionId"],
        )?;
        require(
            files
                .iter()
                .any(|f| f["id"] == o["sourceFileId"] && f["languageHint"] == "java"),
        )?;
    }
    unique(owners.iter().map(|o| {
        o["providerNodeRef"]["providerFactId"]
            .as_str()
            .unwrap()
            .to_owned()
    }))?;
    unique(owners.iter().map(|o| {
        o["canonicalRef"]["entity"]["id"]
            .as_str()
            .unwrap()
            .to_owned()
    }))?;
    if !p["deadlineEpochMs"].is_null() {
        number(&p["deadlineEpochMs"])?;
    }
    let budget = &p["resourceBudget"];
    let keys = [
        "maxDurationMs",
        "maxMemoryBytes",
        "maxEvents",
        "maxItems",
        "maxInputBytes",
        "maxOutputBytes",
        "maxDepth",
    ];
    fields(budget, &keys)?;
    for key in keys {
        require(number(&budget[key])? > 0)?;
    }
    Ok(())
}
pub(crate) fn owner_map_digest(p: &Value) -> Result<String> {
    let mut hash = Sha256::new();
    hash.update(b"codeatlas-native-syntax-owner-map-v1\0");
    fn add(hash: &mut Sha256, s: &str) {
        hash.update(s.len().to_string().as_bytes());
        hash.update(b":");
        hash.update(s.as_bytes());
    }
    let mut values = Vec::<String>::new();
    let t = &p["targetSource"];
    let b = &p["expectedActivationBasis"];
    let o = &p["ownerBinding"];
    for k in ["repositoryId", "revisionId", "contentFingerprint"] {
        values.push(text(&t[k])?.to_owned());
    }
    values.push(if b.is_null() { "NONE" } else { "ACTIVE" }.into());
    if !b.is_null() {
        for k in [
            "repositoryId",
            "revisionId",
            "contentFingerprint",
            "codeActivationDigest",
        ] {
            values.push(text(&b[k])?.to_owned());
        }
    }
    values.push(text(&o["kind"])?.into());
    values.push(
        text(
            &o[if o["kind"] == "ACTIVE_CODE" {
                "codeActivationDigest"
            } else {
                "stageDigest"
            }],
        )?
        .into(),
    );
    values.push(text(&p["providerId"])?.into());
    values.push(text(&p["providerSnapshotId"])?.into());
    let mut files: Vec<_> = array(&p["sourceFiles"])?.iter().collect();
    files.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    values.push(files.len().to_string());
    for f in files {
        for k in ["id", "path", "contentFingerprint"] {
            values.push(text(&f[k])?.into());
        }
        values.push(f["languageHint"].as_str().unwrap_or("").into());
        for k in ["role", "provenance", "contentKind"] {
            values.push(text(&f["classification"][k])?.into());
        }
        values.push(text(&f["sensitivity"])?.into());
    }
    let mut owners: Vec<_> = array(&p["owners"])?.iter().collect();
    owners.sort_by(|a, b| {
        [
            a["sourceFileId"].as_str(),
            a["providerNodeRef"]["providerId"].as_str(),
            a["providerNodeRef"]["providerFactId"].as_str(),
        ]
        .cmp(&[
            b["sourceFileId"].as_str(),
            b["providerNodeRef"]["providerId"].as_str(),
            b["providerNodeRef"]["providerFactId"].as_str(),
        ])
    });
    values.push(owners.len().to_string());
    for owner in owners {
        values.push(text(&owner["sourceFileId"])?.into());
        for k in ["providerId", "providerFactId"] {
            values.push(text(&owner["providerNodeRef"][k])?.into());
        }
        values.push(text(&owner["canonicalRef"]["repositoryId"])?.into());
        for k in ["kind", "id", "revisionId"] {
            values.push(text(&owner["canonicalRef"]["entity"][k])?.into());
        }
    }
    for value in values {
        add(&mut hash, &value);
    }
    Ok(format!("{:x}", hash.finalize()))
}

use crate::language::AnalyzerError;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};
pub struct SyntaxWalkControl<'a> {
    pub deadline: Instant,
    pub cancelled: &'a AtomicBool,
    pub max_source_bytes: usize,
    pub max_items: usize,
    pub max_depth: usize,
    pub max_result_bytes: usize,
}
impl SyntaxWalkControl<'_> {
    pub(crate) fn check(&self) -> std::result::Result<(), AnalyzerError> {
        if self.cancelled.load(Ordering::Relaxed) || Instant::now() >= self.deadline {
            Err(AnalyzerError::BudgetExceeded)
        } else {
            Ok(())
        }
    }
}
#[derive(Debug, PartialEq)]
pub struct SyntaxFileObservation {
    /// Internal Syntax visitor ticks; never serialized as provider/Canonical facts.
    pub work_items: usize,
    pub nodes: Vec<Value>,
    pub edges: Vec<Value>,
    pub observations: Vec<Value>,
    pub coverage: Value,
    pub diagnostics: Vec<Value>,
}

pub use crate::syntax_producer::write_syntax_observation;

pub use crate::syntax_dispatch::{serve_syntax_request, serve_syntax_request_from_budget};
