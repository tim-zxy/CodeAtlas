//! Isolated v5 request/library boundary; no CLI or production admission.
use crate::syntax::{
    SYNTAX_MAX_REQUEST_BYTES, SyntaxRequestError, depth, error, fields, number, owner_map_digest,
    require, text, validate_common_payload,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
#[derive(Debug)]
pub struct CodeSyntaxRequest {
    header: Value,
    pub(crate) raw_input_bytes: usize,
    checksum: String,
}
impl CodeSyntaxRequest {
    pub fn header(&self) -> &Value {
        &self.header
    }
    pub fn request_checksum(&self) -> &str {
        &self.checksum
    }
}
pub fn decode_code_syntax_request(bytes: &[u8]) -> Result<CodeSyntaxRequest, SyntaxRequestError> {
    decode_code_syntax_request_core(bytes, false)
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CodeSyntaxMode {
    CodeSyntaxV1,
    BindingV2,
    BindingV3,
    FrameworkSurfaceV4,
}
impl CodeSyntaxMode {
    pub(crate) fn version(self) -> u64 {
        match self {
            Self::CodeSyntaxV1 => 5,
            Self::BindingV2 => 6,
            Self::BindingV3 => 7,
            Self::FrameworkSurfaceV4 => 8,
        }
    }
    pub(crate) fn selector(self) -> Option<&'static str> {
        match self {
            Self::CodeSyntaxV1 => None,
            Self::BindingV2 => Some("SYNTAX_BINDING_V2"),
            Self::BindingV3 => Some("SYNTAX_BINDING_V3"),
            Self::FrameworkSurfaceV4 => Some("SYNTAX_BINDING_V4"),
        }
    }
}
pub(crate) fn decode_code_syntax_request_core(
    bytes: &[u8],
    binding: bool,
) -> Result<CodeSyntaxRequest, SyntaxRequestError> {
    decode_code_syntax_request_mode(
        bytes,
        if binding {
            CodeSyntaxMode::BindingV2
        } else {
            CodeSyntaxMode::CodeSyntaxV1
        },
    )
}
pub(crate) fn decode_code_syntax_request_mode(
    bytes: &[u8],
    mode: CodeSyntaxMode,
) -> Result<CodeSyntaxRequest, SyntaxRequestError> {
    let version = mode.version();
    let binding = mode.selector().is_some();
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
    if r.get("protocolVersion").is_some() && number(&r["protocolVersion"]).ok() != Some(version) {
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
        number(&r["protocolVersion"])? == version
            && number(&r["sequence"])? == 0
            && r["type"] == "OBSERVE_CODE_SYNTAX",
    )?;
    text(&r["requestId"])?;
    let p = &r["payload"];
    let mut keys = vec![
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
        "codeContract",
    ];
    if binding {
        keys.push("syntaxContract");
    }
    fields(p, &keys)?;
    if binding {
        require(p["syntaxContract"].as_str() == mode.selector())?;
    }
    require(p["codeContract"] == "PYTHON_SYNTAX_CODE_V1")?;
    if mode == CodeSyntaxMode::FrameworkSurfaceV4 {
        require(p["extractorVersion"] == "syntax-v2")?;
    }
    validate_common_payload(p)?;
    if bytes.len() as u64 > number(&p["resourceBudget"]["maxInputBytes"])? {
        return Err(error("RESOURCE_LIMIT_EXCEEDED"));
    }
    depth(&r, 0, number(&p["resourceBudget"]["maxDepth"])?)?;
    require(owner_map_digest(p)? == p["ownerBinding"]["ownerMapDigest"].as_str().unwrap())?;
    Ok(CodeSyntaxRequest {
        header: r,
        raw_input_bytes: bytes.len(),
        checksum: format!("{:x}", Sha256::digest(bytes)),
    })
}

pub(crate) struct CodeSyntaxFileObservation {
    pub syntax: crate::syntax::SyntaxFileObservation,
    pub code_coverage: Vec<Value>,
}
pub use crate::code_syntax_producer::serve_code_syntax_request;
pub use crate::code_syntax_producer::write_code_syntax_observation;

pub use crate::code_syntax_producer::serve_code_syntax_request_from_budget;
