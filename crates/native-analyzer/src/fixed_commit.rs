//! In-process embedding boundary. Only Source can authenticate Git object membership;
//! these checks bind the authenticated selection to the exact emitter request and bytes.
use crate::{
    code_syntax::CodeSyntaxMode,
    framework_surface::FrameworkSurfaceRequest,
    source_access::{SourceAccessError, validate_relative_components},
    syntax::SyntaxWalkControl,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    io::{self, Write},
    num::NonZeroUsize,
    process::ExitCode,
};

pub(crate) fn denied() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, "unbound fixed source")
}

pub(crate) struct BoundFiles(HashMap<String, Vec<u8>>);
impl BoundFiles {
    pub(crate) fn retained_bytes(&self) -> u64 {
        self.0.values().map(|v| v.len() as u64).sum()
    }
    pub(crate) fn read(&self, file: &Value, limit: usize) -> Result<Vec<u8>, SourceAccessError> {
        let bytes = self
            .0
            .get(file["id"].as_str().ok_or(SourceAccessError::Changed)?)
            .ok_or(SourceAccessError::Changed)?;
        if bytes.len() > limit {
            return Err(SourceAccessError::BudgetExceeded);
        }
        Ok(bytes.clone())
    }
}
fn oid(s: &str) -> bool {
    matches!(s.len(), 40 | 64)
        && s.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn bind(
    request: &Value,
    meta: &Value,
    blobs: Vec<Vec<u8>>,
    version: u64,
    reserved: u64,
) -> io::Result<BoundFiles> {
    let p = &request["payload"];
    let rev = &meta["revision"];
    let commit = meta["commitOid"]
        .as_str()
        .filter(|s| oid(s))
        .ok_or_else(denied)?;
    meta["rootTreeOid"]
        .as_str()
        .filter(|s| oid(s) && s.len() == commit.len())
        .ok_or_else(denied)?;
    meta["manifestDigest"]
        .as_str()
        .filter(|s| s.len() == 64 && oid(s))
        .ok_or_else(denied)?;
    if meta["version"] != 1
        || request["protocolVersion"] != version
        || meta["protocolVersion"] != version
        || request["requestId"].as_str().is_none_or(str::is_empty)
        || meta["requestId"] != request["requestId"]
        || p["repository"]["rootPath"] != meta["rootPath"]
        || p["repository"]["id"] != meta["repositoryId"]
        || rev["repositoryId"] != meta["repositoryId"]
        || rev["kind"] != "COMMIT"
        || rev["commitIdentity"] != commit
        || rev["id"] != format!("commit:{commit}")
        || meta["selectionFingerprint"] != rev["contentFingerprint"]
        || rev["contentFingerprint"].as_str().is_none_or(|v| {
            v.strip_prefix("sha256:")
                .is_none_or(|s| s.len() != 64 || !oid(s))
        })
    {
        return Err(denied());
    }
    if version == 2 {
        if request["type"] != "ANALYZE" || p["revision"] != *rev {
            return Err(denied());
        }
    } else {
        let target = &p["targetSource"];
        if request["type"] != "OBSERVE_CODE_SYNTAX"
            || target["repositoryId"] != rev["repositoryId"]
            || target["revisionId"] != rev["id"]
            || target["contentFingerprint"] != rev["contentFingerprint"]
        {
            return Err(denied());
        }
    }
    let rows = meta["files"].as_array().ok_or_else(denied)?;
    let files = p["sourceFiles"].as_array().ok_or_else(denied)?;
    if rows.is_empty() || rows.len() != files.len() || rows.len() != blobs.len() {
        return Err(denied());
    }
    let budget = &p["resourceBudget"];
    let max_bytes = budget[if version == 2 {
        "maxMemoryBytes"
    } else {
        "maxInputBytes"
    }]
    .as_u64()
    .ok_or_else(denied)?
    .saturating_sub(reserved)
    .min(10_000_000);
    let total = blobs
        .iter()
        .try_fold(0u64, |n, b| n.checked_add(b.len() as u64))
        .ok_or_else(denied)?;
    if total > max_bytes {
        return Err(denied());
    }
    let mut by_id = HashMap::new();
    let mut paths = HashSet::new();
    for ((row, file), bytes) in rows.iter().zip(files).zip(blobs) {
        let id = file["id"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(denied)?;
        let path = file["path"].as_str().ok_or_else(denied)?;
        if row["sourceFile"] != *file
            || file["repositoryId"] != rev["repositoryId"]
            || file["revisionId"] != rev["id"]
            || validate_relative_components(path).is_err()
            || !paths.insert(path)
            || row["blobOid"]
                .as_str()
                .is_none_or(|s| !oid(s) || s.len() != commit.len())
            || row["sizeBytes"].as_u64() != Some(bytes.len() as u64)
            || file["contentFingerprint"] != format!("sha256:{:x}", Sha256::digest(&bytes))
            || by_id.insert(id.to_owned(), bytes).is_some()
        {
            return Err(denied());
        }
    }
    Ok(BoundFiles(by_id))
}
pub fn write_java(
    request: &Value,
    meta: &Value,
    blobs: Vec<Vec<u8>>,
    workers: NonZeroUsize,
    out: &mut impl Write,
) -> io::Result<ExitCode> {
    crate::analyze::run_committed(
        request,
        bind(
            request,
            meta,
            blobs,
            2,
            crate::analyze::worker_reservation(workers),
        )?,
        workers,
        out,
    )
}
pub fn write_framework(
    request: &FrameworkSurfaceRequest,
    meta: &Value,
    blobs: Vec<Vec<u8>>,
    limits: &SyntaxWalkControl<'_>,
    out: &mut impl Write,
) -> io::Result<()> {
    let files = bind(
        request.header(),
        meta,
        blobs,
        8,
        request.0.raw_input_bytes as u64,
    )?;
    crate::code_syntax_producer::emit_with_source(
        &request.0,
        limits,
        out,
        CodeSyntaxMode::FrameworkSurfaceV4,
        Some(&files),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_exact_bound_bytes_are_admitted() {
        let commit = "a".repeat(40);
        let rev = json!({"id":format!("commit:{commit}"),"kind":"COMMIT","repositoryId":"r","commitIdentity":commit,"contentFingerprint":format!("sha256:{}","c".repeat(64))});
        let bytes = b"class Owned {}".to_vec();
        let file = json!({"id":"file:1","repositoryId":"r","revisionId":rev["id"],"path":"Owned.java","contentFingerprint":format!("sha256:{:x}",Sha256::digest(&bytes))});
        let req = json!({"requestId":"q","protocolVersion":2,"type":"ANALYZE","payload":{"repository":{"id":"r","rootPath":"C:/Owned"},"revision":rev,"sourceFiles":[file],"resourceBudget":{"maxMemoryBytes":4096}}});
        let meta = json!({"version":1,"protocolVersion":2,"requestId":"q","repositoryId":"r","rootPath":"C:/Owned","commitOid":commit,"rootTreeOid":"b".repeat(40),"manifestDigest":"d".repeat(64),"selectionFingerprint":rev["contentFingerprint"],"revision":rev,"files":[{"sourceFile":file,"blobOid":"e".repeat(40),"sizeBytes":bytes.len()}]});
        assert_eq!(
            bind(&req, &meta, vec![bytes.clone()], 2, 0)
                .unwrap()
                .read(&file, 64)
                .unwrap(),
            bytes
        );
        let mut changed = bytes.clone();
        changed[0] = b'z';
        assert!(bind(&req, &meta, vec![changed], 2, 0).is_err());
        assert!(bind(&req, &meta, vec![bytes.clone()], 2, 4096).is_err());
        let mut stale = meta;
        stale["commitOid"] = json!("f".repeat(40));
        assert!(bind(&req, &stale, vec![bytes], 2, 0).is_err());
    }
}
