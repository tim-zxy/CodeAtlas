//! Derived provider cache validation; never an authoritative graph or database writer.
use crate::{java_relations::compilation_unit_id, request_v3::V3ContractError};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{self, Write};

pub(crate) const CAPS: [&str; 5] = ["SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"];
pub(crate) fn object(v: &Value, keys: &[&str]) -> bool {
    v.as_object()
        .is_some_and(|o| o.len() == keys.len() && keys.iter().all(|k| o.contains_key(*k)))
}
fn js_space(c: char) -> bool {
    matches!(c,'\u{9}'..='\u{d}'|'\u{20}'|'\u{a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
pub(crate) fn exact(v: &Value) -> bool {
    v.as_str()
        .is_some_and(|s| !s.is_empty() && s.trim_matches(js_space) == s)
}
pub(crate) fn limited(v: &Value) -> bool {
    exact(v) && v.as_str().is_some_and(|s| s.encode_utf16().count() <= 128)
}
pub(crate) fn number(v: &Value) -> Option<u64> {
    v.as_f64()
        .filter(|n| {
            n.is_finite()
                && *n >= 0.0
                && !n.is_sign_negative()
                && n.fract() == 0.0
                && *n <= 9_007_199_254_740_991.0
        })
        .map(|n| n as u64)
}
pub(crate) fn digest(v: &Value) -> bool {
    v.as_str().is_some_and(|s| {
        s.len() == 64
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}
pub(crate) fn choice(v: &Value, options: &[&str]) -> bool {
    v.as_str().is_some_and(|s| options.contains(&s))
}
pub(crate) fn array(v: &Value, valid: impl Fn(&Value) -> bool) -> bool {
    v.as_array().is_some_and(|a| a.iter().all(valid))
}
pub(crate) fn capabilities(v: &Value) -> bool {
    v.as_array().is_some_and(|a| {
        !a.is_empty()
            && a.iter().all(|v| choice(v, &CAPS))
            && a.iter()
                .filter_map(Value::as_str)
                .collect::<BTreeSet<_>>()
                .len()
                == a.len()
    })
}
pub(crate) fn path(v: &Value) -> bool {
    exact(v)
        && v.as_str().is_some_and(|s| {
            !s.contains(['\\', '\0'])
                && !s.starts_with('/')
                && !s.ends_with('/')
                && !(s.len() >= 3
                    && s.as_bytes()[0].is_ascii_alphabetic()
                    && s.as_bytes()[1..3] == *b":/")
                && !s.split('/').any(|p| p.is_empty() || p == "." || p == "..")
        })
}
pub(crate) fn source_file(v: &Value) -> bool {
    object(
        v,
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
    ) && ["id", "repositoryId", "revisionId", "contentFingerprint"]
        .iter()
        .all(|k| exact(&v[k]))
        && path(&v["path"])
        && object(&v["classification"], &["role", "provenance", "contentKind"])
        && choice(&v["classification"]["role"], &["SOURCE", "TEST", "OTHER"])
        && choice(
            &v["classification"]["provenance"],
            &["AUTHORED", "GENERATED", "VENDOR"],
        )
        && choice(&v["classification"]["contentKind"], &["TEXT", "BINARY"])
        && (v["languageHint"].is_null() || exact(&v["languageHint"]))
        && choice(
            &v["sensitivity"],
            &["PUBLIC", "INTERNAL", "SENSITIVE", "SECRET"],
        )
}
pub(crate) fn language(v: &Value) -> bool {
    object(
        v,
        &[
            "languageId",
            "grammarVersion",
            "analyzerVersion",
            "compatibilityVersion",
        ],
    ) && v["languageId"] == "java"
        && ["grammarVersion", "analyzerVersion", "compatibilityVersion"]
            .iter()
            .all(|k| limited(&v[k]))
}
pub(crate) fn context(v: &Value) -> bool {
    object(
        v,
        &[
            "providerId",
            "providerVersion",
            "language",
            "resolverVersion",
            "normalizerVersion",
            "policyFingerprint",
        ],
    ) && ["providerId", "providerVersion", "policyFingerprint"]
        .iter()
        .all(|k| exact(&v[k]))
        && ["resolverVersion", "normalizerVersion"]
            .iter()
            .all(|k| limited(&v[k]))
        && language(&v["language"])
}
pub(crate) fn state_header(v: &Value) -> bool {
    object(
        v,
        &[
            "schemaVersion",
            "repositoryId",
            "revisionId",
            "contentFingerprint",
            "providerId",
            "providerVersion",
            "language",
            "resolverVersion",
            "normalizerVersion",
            "policyFingerprint",
            "requestedCapabilities",
            "sourceFileCount",
            "summaryDigest",
        ],
    ) && v["schemaVersion"].as_f64() == Some(1.0)
        && [
            "repositoryId",
            "revisionId",
            "contentFingerprint",
            "providerId",
            "providerVersion",
            "policyFingerprint",
        ]
        .iter()
        .all(|k| exact(&v[k]))
        && language(&v["language"])
        && limited(&v["resolverVersion"])
        && limited(&v["normalizerVersion"])
        && capabilities(&v["requestedCapabilities"])
        && number(&v["sourceFileCount"]).is_some()
        && digest(&v["summaryDigest"])
}
fn span(v: &Value, range: bool) -> bool {
    let keys = if range {
        vec![
            "sourceFileId",
            "startLine",
            "startColumn",
            "endLine",
            "endColumn",
        ]
    } else {
        vec!["startLine", "startColumn", "endLine", "endColumn"]
    };
    object(v, &keys)
        && (!range || exact(&v["sourceFileId"]))
        && ["startLine", "startColumn", "endLine", "endColumn"]
            .iter()
            .all(|k| number(&v[k]).is_some())
        && (number(&v["endLine"]), number(&v["endColumn"]))
            >= (number(&v["startLine"]), number(&v["startColumn"]))
}
fn diagnostic(v: &Value, file: &Value) -> bool {
    object(v, &["code", "severity", "message", "sourceRange"])
        && exact(&v["code"])
        && limited(&v["message"])
        && choice(&v["severity"], &["INFO", "WARNING", "ERROR"])
        && (v["sourceRange"].is_null()
            || (span(&v["sourceRange"], true) && v["sourceRange"]["sourceFileId"] == file["id"]))
}
fn coverage(v: &Value, file: &Value) -> bool {
    if !object(
        v,
        &[
            "capability",
            "sourceFileId",
            "support",
            "coverage",
            "statistics",
        ],
    ) || !choice(&v["capability"], &CAPS)
        || v["sourceFileId"] != file["id"]
        || !choice(&v["support"], &["SUPPORTED", "UNSUPPORTED"])
        || !choice(&v["coverage"], &["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"])
    {
        return false;
    }
    let s = &v["statistics"];
    let r = &s["resolutionCounts"];
    if !object(
        s,
        &[
            "eligibleSites",
            "coveredSites",
            "unsupportedSites",
            "partialSites",
            "resolutionCounts",
        ],
    ) || !object(
        r,
        &[
            "EXACT",
            "HEURISTIC",
            "AMBIGUOUS",
            "UNRESOLVED",
            "UNSUPPORTED",
        ],
    ) {
        return false;
    }
    let Some(eligible) = number(&s["eligibleSites"]) else {
        return false;
    };
    let Some(covered) = number(&s["coveredSites"]) else {
        return false;
    };
    let Some(unsupported) = number(&s["unsupportedSites"]) else {
        return false;
    };
    let Some(partial) = number(&s["partialSites"]) else {
        return false;
    };
    let Some(sum) = r
        .as_object()
        .unwrap()
        .values()
        .try_fold(0u64, |sum, n| sum.checked_add(number(n)?))
    else {
        return false;
    };
    eligible == covered + unsupported + partial
        && sum <= 9_007_199_254_740_991
        && sum
            == if v["capability"] == "SYMBOL" {
                0
            } else {
                covered
            }
}
pub(crate) fn summary(v: &Value) -> bool {
    if !object(
        v,
        &[
            "schemaVersion",
            "sourceFile",
            "symbols",
            "relationSites",
            "diagnostics",
            "coverage",
            "emittedFacts",
        ],
    ) || v["schemaVersion"].as_f64() != Some(1.0)
        || !source_file(&v["sourceFile"])
    {
        return false;
    }
    let f = &v["sourceFile"];
    let mut ids = BTreeSet::new();
    if !array(&v["symbols"], |s| {
        object(
            s,
            &[
                "providerFactId",
                "providerKind",
                "name",
                "qualifiedName",
                "signature",
                "isStatic",
                "span",
            ],
        ) && ["providerFactId", "providerKind", "name"]
            .iter()
            .all(|k| exact(&s[k]))
            && (s["qualifiedName"].is_null() || exact(&s["qualifiedName"]))
            && s["signature"].is_string()
            && s["isStatic"].is_boolean()
            && span(&s["span"], false)
    }) {
        return false;
    }
    for s in v["symbols"].as_array().unwrap() {
        if !ids.insert(s["providerFactId"].as_str().unwrap()) {
            return false;
        }
    }
    let unit = compilation_unit_id(f["path"].as_str().unwrap());
    if !array(&v["relationSites"], |s| {
        object(
            s,
            &[
                "kind",
                "variant",
                "sourceFactId",
                "targetHint",
                "arity",
                "span",
            ],
        ) && choice(&s["kind"], &CAPS[1..])
            && s["variant"].as_str().is_some_and(|s| !s.is_empty())
            && s["targetHint"].as_str().is_some_and(|s| !s.is_empty())
            && exact(&s["sourceFactId"])
            && (ids.contains(s["sourceFactId"].as_str().unwrap()) || s["sourceFactId"] == unit)
            && (s["arity"].is_null() || number(&s["arity"]).is_some())
            && span(&s["span"], false)
    }) {
        return false;
    }
    let sites = v["relationSites"].as_array().unwrap();
    if sites.iter().map(canonical).collect::<BTreeSet<_>>().len() != sites.len()
        || !array(&v["diagnostics"], |d| diagnostic(d, f))
        || !array(&v["coverage"], |c| coverage(c, f))
    {
        return false;
    }
    let caps = v["coverage"].as_array().unwrap();
    if caps
        .iter()
        .map(|c| c["capability"].as_str().unwrap())
        .collect::<BTreeSet<_>>()
        .len()
        != caps.len()
    {
        return false;
    }
    if !array(&v["emittedFacts"], |e| {
        object(
            e,
            &["factType", "providerFactId", "contentDigest", "ownership"],
        ) && choice(&e["factType"], &["NODE", "EDGE"])
            && exact(&e["providerFactId"])
            && digest(&e["contentDigest"])
            && choice(&e["ownership"], &["FILE", "SHARED"])
    }) {
        return false;
    }
    let facts = v["emittedFacts"].as_array().unwrap();
    facts
        .iter()
        .map(|e| {
            (
                e["factType"].as_str().unwrap(),
                e["providerFactId"].as_str().unwrap(),
            )
        })
        .collect::<BTreeSet<_>>()
        .len()
        == facts.len()
}

/// Shared canonical recipe, writable to a bounded buffer or directly to SHA-256.
/// serde_json's configured Map is key-ordered (preserve_order is not enabled).
pub fn write_canonical<W: Write>(v: &Value, out: &mut W) -> io::Result<()> {
    match v {
        Value::Number(n) => write!(
            out,
            "{{\"$nativeNumber\":\"{:016x}\"}}",
            n.as_f64().unwrap().to_bits()
        ),
        Value::Array(a) => {
            out.write_all(b"[")?;
            for (i, value) in a.iter().enumerate() {
                if i != 0 {
                    out.write_all(b",")?;
                }
                write_canonical(value, out)?;
            }
            out.write_all(b"]")
        }
        Value::Object(o) => {
            out.write_all(b"{")?;
            for (i, (key, value)) in o.iter().enumerate() {
                if i != 0 {
                    out.write_all(b",")?;
                }
                serde_json::to_writer(&mut *out, key).map_err(io::Error::other)?;
                out.write_all(b":")?;
                write_canonical(value, out)?;
            }
            out.write_all(b"}")
        }
        _ => serde_json::to_writer(out, v).map_err(io::Error::other),
    }
}
fn canonical(v: &Value) -> String {
    let mut bytes = Vec::new();
    write_canonical(v, &mut bytes).expect("in-memory canonical write");
    String::from_utf8(bytes).expect("JSON is UTF-8")
}
fn site_key(v: &Value) -> (&str, &str, u64, u64, u64, u64, &str, &str, Option<u64>) {
    let s = &v["span"];
    (
        v["kind"].as_str().unwrap(),
        v["sourceFactId"].as_str().unwrap(),
        number(&s["startLine"]).unwrap(),
        number(&s["startColumn"]).unwrap(),
        number(&s["endLine"]).unwrap(),
        number(&s["endColumn"]).unwrap(),
        v["variant"].as_str().unwrap(),
        v["targetHint"].as_str().unwrap(),
        number(&v["arity"]),
    )
}
fn summary_digest(summaries: &[Value]) -> String {
    let mut ordered = summaries.to_vec();
    ordered.sort_by(|a, b| {
        a["sourceFile"]["path"]
            .as_str()
            .cmp(&b["sourceFile"]["path"].as_str())
    });
    for s in &mut ordered {
        s["symbols"].as_array_mut().unwrap().sort_by(|a, b| {
            a["providerFactId"]
                .as_str()
                .cmp(&b["providerFactId"].as_str())
        });
        s["relationSites"]
            .as_array_mut()
            .unwrap()
            .sort_by(|a, b| site_key(a).cmp(&site_key(b)));
        s["diagnostics"]
            .as_array_mut()
            .unwrap()
            .sort_by_key(canonical);
        s["coverage"]
            .as_array_mut()
            .unwrap()
            .sort_by(|a, b| a["capability"].as_str().cmp(&b["capability"].as_str()));
        s["emittedFacts"].as_array_mut().unwrap().sort_by(|a, b| {
            (a["factType"].as_str(), a["providerFactId"].as_str())
                .cmp(&(b["factType"].as_str(), b["providerFactId"].as_str()))
        });
    }
    format!(
        "{:x}",
        Sha256::digest(canonical(&json!(ordered)).as_bytes())
    )
}
pub fn validate_analysis_state(v: &Value) -> Result<(), V3ContractError> {
    let invalid = || V3ContractError::invalid();
    if !object(v, &["header", "summaries"])
        || !state_header(&v["header"])
        || !array(&v["summaries"], summary)
    {
        return Err(invalid());
    }
    let h = &v["header"];
    let summaries = v["summaries"].as_array().unwrap();
    if number(&h["sourceFileCount"]) != Some(summaries.len() as u64)
        || h["summaryDigest"] != summary_digest(summaries)
    {
        return Err(invalid());
    }
    let mut ids = BTreeSet::new();
    let mut paths = BTreeSet::new();
    let mut owners = BTreeMap::<(&str, &str), (&str, &str)>::new();
    for s in summaries {
        let f = &s["sourceFile"];
        if f["repositoryId"] != h["repositoryId"]
            || f["revisionId"] != h["revisionId"]
            || !ids.insert(f["id"].as_str().unwrap())
            || !paths.insert(f["path"].as_str().unwrap())
        {
            return Err(invalid());
        }
        let caps = s["coverage"].as_array().unwrap();
        if caps.len() != h["requestedCapabilities"].as_array().unwrap().len()
            || caps.iter().any(|c| {
                !h["requestedCapabilities"]
                    .as_array()
                    .unwrap()
                    .contains(&c["capability"])
            })
        {
            return Err(invalid());
        }
        for fact in s["emittedFacts"].as_array().unwrap() {
            let key = (
                fact["factType"].as_str().unwrap(),
                fact["providerFactId"].as_str().unwrap(),
            );
            let owner = (
                fact["ownership"].as_str().unwrap(),
                fact["contentDigest"].as_str().unwrap(),
            );
            if owners
                .get(&key)
                .is_some_and(|old| old.0 != "SHARED" || owner.0 != "SHARED" || old.1 != owner.1)
            {
                return Err(invalid());
            }
            owners.insert(key, owner);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_full_output_state_vectors() {
        // Summary validation only; fact correspondence is checked by the TS
        // staged port, and real Rust writer framing belongs to packet B Task 5.
        let vectors: Value = serde_json::from_str(include_str!(
            "../../../fixtures/ipc/analysis-v3/payload-vectors.json"
        ))
        .unwrap();
        let entries = vectors["vectors"].as_array().unwrap();
        assert_eq!(entries.len(), 21);
        for entry in entries {
            assert_eq!(
                validate_analysis_state(&entry["bundle"]).is_ok(),
                entry["stateValid"].as_bool().unwrap(),
                "{}",
                entry["id"]
            );
        }
    }
    #[test]
    fn independent_unicode_and_numeric_vectors() {
        let vectors: Value = serde_json::from_str(include_str!(
            "../../../fixtures/ipc/protocol-v3/summary-vectors.json"
        ))
        .unwrap();
        let s = json!({"schemaVersion":1,"sourceFile":vectors["sourceFile"],"symbols":[],"relationSites":[],"diagnostics":[],"coverage":[],"emittedFacts":[]});
        assert!(summary(&s));
        assert_eq!(
            summary_digest(std::slice::from_ref(&s)),
            format!(
                "{:x}",
                Sha256::digest(vectors["canonicalEmptyFile"].as_str().unwrap().as_bytes())
            )
        );
        assert_eq!(summary_digest(&[]), vectors["emptyDigest"]);
        for (n, bits) in [
            (0.0, "0000000000000000"),
            (1.0, "3ff0000000000000"),
            (0.1, "3fb999999999999a"),
            (1e-7, "3e7ad7f29abcaf48"),
        ] {
            assert_eq!(
                canonical(&json!(n)),
                format!("{{\"$nativeNumber\":\"{bits}\"}}")
            );
        }
        let mut a = s.clone();
        a["sourceFile"]["id"] = json!("bmp");
        a["sourceFile"]["path"] = json!("\u{e000}.java");
        let mut b = s;
        b["sourceFile"]["id"] = json!("astral");
        b["sourceFile"]["path"] = json!("𝒜.java");
        let original = vectors["canonicalEmptyFile"].as_str().unwrap();
        let body = &original[1..original.len() - 1];
        let bytes = format!(
            "[{},{}]",
            body.replace("\"f-a\"", "\"bmp\"")
                .replace("src/A.java", "\u{e000}.java"),
            body.replace("\"f-a\"", "\"astral\"")
                .replace("src/A.java", "𝒜.java")
        );
        assert_eq!(
            summary_digest(&[b, a]),
            format!("{:x}", Sha256::digest(bytes.as_bytes()))
        );
        let path = "源码/𝒜.java";
        assert_eq!(
            compilation_unit_id(path),
            format!(
                "java-compilation-unit-v1:{:x}",
                Sha256::digest(
                    format!("java-compilation-unit-v1\0{}:{path}", path.len()).as_bytes()
                )
            )
        );
    }

    #[test]
    fn ownership_and_resolver_inputs_are_strict() {
        let raw = include_str!("../../../fixtures/ipc/protocol-v3/valid-refresh.jsonl");
        let records: Vec<Value> = raw
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        let mut s = records[1]["payload"].clone();
        s["symbols"] = json!([{"providerFactId":"s","providerKind":"java.method","name":"方法","qualifiedName":null,"signature":"m(int)","isStatic":true,"span":{"startLine":0,"startColumn":0,"endLine":0,"endColumn":4}}]);
        s["relationSites"] = json!([{"kind":"CALL","variant":"direct","sourceFactId":"s","targetHint":"unknown","arity":1,"span":{"startLine":0,"startColumn":0,"endLine":0,"endColumn":4}}]);
        s["emittedFacts"] = json!([{"factType":"NODE","providerFactId":"shared","contentDigest":"a".repeat(64),"ownership":"SHARED"}]);
        assert!(summary(&s));
        for field in ["arity", "span"] {
            let mut bad = s.clone();
            bad["relationSites"][0][field] = json!(-1);
            assert!(!summary(&bad));
        }
        let mut negative = s.clone();
        negative["symbols"][0]["span"]["startLine"] = serde_json::from_str("-0").unwrap();
        assert!(!summary(&negative));
        let mut unit = s.clone();
        unit["sourceFile"]["path"] = json!("源码/𝒜.java");
        unit["relationSites"][0]["sourceFactId"] = json!(compilation_unit_id("源码/𝒜.java"));
        assert!(summary(&unit));
        let mut b = s.clone();
        b["sourceFile"]["id"] = json!("f-b");
        b["sourceFile"]["path"] = json!("B.java");
        b["coverage"][0]["sourceFileId"] = json!("f-b");
        let mut bundle = json!({"header":records[0]["payload"]["baselineState"],"summaries":[s,b]});
        bundle["header"]["sourceFileCount"] = json!(2);
        let refresh_digest = |b: &mut Value| {
            b["header"]["summaryDigest"] =
                json!(summary_digest(b["summaries"].as_array().unwrap()));
        };
        refresh_digest(&mut bundle);
        validate_analysis_state(&bundle).unwrap();
        bundle["summaries"][1]["emittedFacts"][0]["contentDigest"] = json!("b".repeat(64));
        refresh_digest(&mut bundle);
        assert!(validate_analysis_state(&bundle).is_err());
        bundle["summaries"][1]["emittedFacts"][0]["contentDigest"] = json!("a".repeat(64));
        bundle["summaries"][1]["emittedFacts"][0]["ownership"] = json!("FILE");
        refresh_digest(&mut bundle);
        assert!(validate_analysis_state(&bundle).is_err());
    }
}
