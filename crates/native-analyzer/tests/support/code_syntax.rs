#![allow(dead_code)]
use codeatlas_native_analyzer::{
    code_syntax::{decode_code_syntax_request, write_code_syntax_observation},
    syntax::SyntaxWalkControl,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
pub fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/phase1/code-syntax-producer-oracle")
}
pub fn sha(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
pub fn unique_name() -> String {
    format!(
        "{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
pub fn instantiate(request: &str, events: &str, root: &str) -> (Vec<u8>, Vec<u8>) {
    assert_eq!(request.matches("\"__OWNED_ROOT__\"").count(), 1);
    let raw = request
        .replace("\"__OWNED_ROOT__\"", &serde_json::to_string(root).unwrap())
        .into_bytes();
    let expected = events.replace("\"__REQUEST_SHA256__\"", &format!("\"{}\"", sha(&raw)));
    assert!(expected.ends_with('\n'));
    let last = expected[..expected.len() - 1].rfind('\n').unwrap() + 1;
    let digest = sha(expected[..last].as_bytes());
    assert_eq!(expected.matches("\"__TERMINAL_SHA256__\"").count(), 1);
    (
        raw,
        expected
            .replace("\"__TERMINAL_SHA256__\"", &format!("\"{digest}\""))
            .into_bytes(),
    )
}
pub struct Case {
    pub dir: PathBuf,
    pub raw: Vec<u8>,
    pub expected: Vec<u8>,
    pub id: String,
}
impl Case {
    pub fn new(id: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("codeatlas-code-syntax-b2-{}", unique_name()));
        fs::create_dir(&dir).unwrap();
        let base = fixture().join("cases").join(id);
        let (raw, expected) = instantiate(
            &fs::read_to_string(base.join("request.template.jsonl")).unwrap(),
            &fs::read_to_string(base.join("events.template.jsonl")).unwrap(),
            dir.to_str().unwrap(),
        );
        let r: Value = serde_json::from_slice(&raw).unwrap();
        for f in r["payload"]["sourceFiles"].as_array().unwrap() {
            let path = Path::new(f["path"].as_str().unwrap());
            assert!(path.components().all(|c| matches!(c, Component::Normal(_))));
            let dest = dir.join(path);
            fs::create_dir_all(dest.parent().unwrap()).unwrap();
            fs::write(dest, fs::read(base.join("sources").join(path)).unwrap()).unwrap();
        }
        Self {
            dir,
            raw,
            expected,
            id: id.into(),
        }
    }
    pub fn request(&self) -> Value {
        serde_json::from_slice(&self.raw).unwrap()
    }
    pub fn set_request(&mut self, v: &Value) {
        self.raw = serde_json::to_vec(v).unwrap();
        self.raw.push(b'\n');
    }
    pub fn emit(&self) -> std::io::Result<Vec<u8>> {
        let r = decode_code_syntax_request(&self.raw).unwrap();
        let cancelled = AtomicBool::new(false);
        let c = control(&cancelled, r.header());
        let mut output = vec![];
        write_code_syntax_observation(&r, &c, &mut output)?;
        Ok(output)
    }
}
impl Drop for Case {
    fn drop(&mut self) {
        let p = self.dir.canonicalize().unwrap();
        assert!(p.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        assert!(
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("codeatlas-code-syntax-b2-")
        );
        fs::remove_dir_all(p).unwrap();
    }
}
pub fn control<'a>(cancelled: &'a AtomicBool, r: &Value) -> SyntaxWalkControl<'a> {
    let b = &r["payload"]["resourceBudget"];
    SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
        cancelled,
        max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
        max_items: b["maxItems"].as_u64().unwrap() as usize,
        max_depth: b["maxDepth"].as_u64().unwrap() as usize,
        max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
    }
}
pub fn records(b: &[u8]) -> Vec<Value> {
    b.split(|b| *b == b'\n')
        .filter(|x| !x.is_empty())
        .map(|x| serde_json::from_slice(x).unwrap())
        .collect()
}
