//! Restore resolver inputs from a strictly validated summary, without source access.
use crate::analysis_state::{number, summary};
use crate::language::{
    LanguageAnalysis, RelationKind, RelationSite, SiteStatistics, SourceSpan, SymbolFact,
    SyntaxCoverage, SyntaxDiagnostic,
};
use crate::request_v3::V3ContractError;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug)]
pub struct RetainedFile {
    pub source_file: Value,
    pub analysis: LanguageAnalysis,
    pub coverage: Vec<Value>,
    pub emitted_facts: Vec<Value>,
}

fn index(v: &Value) -> Result<usize, V3ContractError> {
    number(v)
        .and_then(|n| usize::try_from(n).ok())
        .ok_or_else(V3ContractError::invalid)
}
fn span(v: &Value) -> Result<SourceSpan, V3ContractError> {
    Ok(SourceSpan {
        start_line: index(&v["startLine"])?,
        start_column: index(&v["startColumn"])?,
        end_line: index(&v["endLine"])?,
        end_column: index(&v["endColumn"])?,
    })
}
fn text(v: &Value) -> String {
    v.as_str().expect("validated summary string").to_owned()
}

pub fn decode_retained_file(value: &Value) -> Result<RetainedFile, V3ContractError> {
    if !summary(value) {
        return Err(V3ContractError::invalid());
    }
    let symbols = value["symbols"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            Ok(SymbolFact {
                provider_fact_id: text(&s["providerFactId"]),
                provider_kind: text(&s["providerKind"]),
                name: text(&s["name"]),
                qualified_name: s["qualifiedName"].as_str().map(str::to_owned),
                signature: text(&s["signature"]),
                is_static: s["isStatic"].as_bool().unwrap(),
                span: span(&s["span"])?,
            })
        })
        .collect::<Result<Vec<_>, V3ContractError>>()?;
    let relation_sites = value["relationSites"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            Ok(RelationSite {
                kind: match s["kind"].as_str().unwrap() {
                    "IMPORT" => RelationKind::Import,
                    "CALL" => RelationKind::Call,
                    "INHERITANCE" => RelationKind::Inheritance,
                    "REFERENCE" => RelationKind::Reference,
                    _ => unreachable!("validated relation kind"),
                },
                variant: text(&s["variant"]),
                source_fact_id: text(&s["sourceFactId"]),
                target_hint: text(&s["targetHint"]),
                arity: if s["arity"].is_null() {
                    None
                } else {
                    Some(index(&s["arity"])?)
                },
                span: span(&s["span"])?,
            })
        })
        .collect::<Result<Vec<_>, V3ContractError>>()?;
    let diagnostics = value["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            Ok(SyntaxDiagnostic {
                code: text(&d["code"]),
                message: text(&d["message"]),
                span: if d["sourceRange"].is_null() {
                    None
                } else {
                    Some(span(&d["sourceRange"])?)
                },
            })
        })
        .collect::<Result<Vec<_>, V3ContractError>>()?;
    let coverage = value["coverage"].as_array().unwrap().clone();
    let site_statistics: BTreeMap<_, _> = coverage
        .iter()
        .map(|c| {
            let s = &c["statistics"];
            (
                text(&c["capability"]),
                SiteStatistics {
                    eligible_sites: number(&s["eligibleSites"]).unwrap(),
                    covered_sites: number(&s["coveredSites"]).unwrap(),
                    unsupported_sites: number(&s["unsupportedSites"]).unwrap(),
                    partial_sites: number(&s["partialSites"]).unwrap(),
                    resolution_counts: Default::default(),
                },
            )
        })
        .collect();
    let syntax = if coverage.iter().any(|c| c["coverage"] == "PARTIAL") {
        SyntaxCoverage::Partial
    } else {
        SyntaxCoverage::Complete
    };
    Ok(RetainedFile {
        source_file: value["sourceFile"].clone(),
        analysis: LanguageAnalysis {
            symbols,
            relation_sites,
            diagnostics,
            coverage: syntax,
            site_statistics,
        },
        coverage,
        emitted_facts: value["emittedFacts"].as_array().unwrap().clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::decode_retained_file;
    use crate::java::JavaAnalyzer;
    use crate::language::{LanguageAnalysis, RelationKind, SourceSpan};
    use serde_json::{Value, json};
    use std::sync::atomic::AtomicBool;
    use std::time::{Duration, Instant};

    fn span(s: &SourceSpan) -> Value {
        json!({"startLine":s.start_line,"startColumn":s.start_column,
            "endLine":s.end_line,"endColumn":s.end_column})
    }
    fn summary(a: &LanguageAnalysis) -> Value {
        let raw = include_str!("../../../fixtures/ipc/protocol-v3/valid-refresh.jsonl");
        let mut s: Value =
            serde_json::from_str::<Value>(raw.lines().nth(1).unwrap()).unwrap()["payload"].clone();
        s["symbols"] = json!(
            a.symbols
                .iter()
                .map(|x| json!({
            "providerFactId":x.provider_fact_id,"providerKind":x.provider_kind,
            "name":x.name,"qualifiedName":x.qualified_name,"signature":x.signature,
            "isStatic":x.is_static,"span":span(&x.span)}))
                .collect::<Vec<_>>()
        );
        s["relationSites"] = json!(
            a.relation_sites
                .iter()
                .map(|x| json!({
            "kind":match x.kind {RelationKind::Import=>"IMPORT",RelationKind::Call=>"CALL",
                RelationKind::Inheritance=>"INHERITANCE",RelationKind::Reference=>"REFERENCE"},
            "variant":x.variant,"sourceFactId":x.source_fact_id,"targetHint":x.target_hint,
            "arity":x.arity,"span":span(&x.span)}))
                .collect::<Vec<_>>()
        );
        s["diagnostics"] = json!(a.diagnostics.iter().map(|x| {
            let range = x.span.as_ref().map(|p| { let mut v=span(p);
                v["sourceFileId"]=s["sourceFile"]["id"].clone(); v });
            json!({"code":x.code,"severity":"WARNING","message":x.message,"sourceRange":range})
        }).collect::<Vec<_>>());
        s["coverage"] = json!(a.site_statistics.iter().map(|(cap,x)| json!({
            "capability":cap,"sourceFileId":s["sourceFile"]["id"],"support":"SUPPORTED",
            "coverage":if a.coverage==crate::language::SyntaxCoverage::Complete {"COMPLETE"} else {"PARTIAL"},
            "statistics":{"eligibleSites":x.eligible_sites,"coveredSites":x.covered_sites,
            "unsupportedSites":x.unsupported_sites,"partialSites":x.partial_sites,
            "resolutionCounts":{"EXACT":0,"HEURISTIC":0,"AMBIGUOUS":0,
                "UNRESOLVED":if cap=="SYMBOL" {0} else {x.covered_sites},"UNSUPPORTED":0}}
        })).collect::<Vec<_>>());
        s
    }
    fn extracted() -> LanguageAnalysis {
        JavaAnalyzer::new().unwrap().analyze_with_relations_until("src/A.java",
            b"package p; import p.Other; class A extends Other { static void f() { missing(); } }",
            Instant::now()+Duration::from_secs(10), &AtomicBool::new(false), 1_000_000).unwrap()
    }
    #[test]
    fn retained_roundtrip_preserves_resolution_inputs() {
        let original = extracted();
        let wire = summary(&original);
        let decoded = decode_retained_file(&wire).unwrap();
        assert_eq!(decoded.analysis, original);
        assert_eq!(decoded.source_file, wire["sourceFile"]);
        assert_eq!(
            decoded.coverage,
            wire["coverage"].as_array().unwrap().clone()
        );
        assert_eq!(
            decoded.emitted_facts,
            wire["emittedFacts"].as_array().unwrap().clone()
        );
    }

    #[test]
    fn retained_roundtrip_preserves_real_syntax_diagnostics() {
        let original = JavaAnalyzer::new()
            .unwrap()
            .analyze_with_relations_until(
                "src/A.java",
                b"class A { void broken( {",
                Instant::now() + Duration::from_secs(10),
                &AtomicBool::new(false),
                1_000_000,
            )
            .unwrap();
        assert!(!original.diagnostics.is_empty());
        assert_eq!(original.coverage, crate::language::SyntaxCoverage::Partial);
        assert_eq!(
            decode_retained_file(&summary(&original)).unwrap().analysis,
            original
        );
    }
    #[test]
    fn coverage_resolution_buckets_are_reset_not_added() {
        let original = extracted();
        let mut wire = summary(&original);
        let rows = wire["coverage"].as_array_mut().unwrap();
        for row in rows {
            if row["capability"] == "SYMBOL" {
                continue;
            }
            let n = row["statistics"]["coveredSites"].clone();
            row["statistics"]["resolutionCounts"]["UNRESOLVED"] = json!(0);
            row["statistics"]["resolutionCounts"]["EXACT"] = n;
        }
        assert_eq!(
            decode_retained_file(&wire)
                .unwrap()
                .analysis
                .site_statistics,
            original.site_statistics
        );
    }
    #[test]
    fn retained_foreign_relation_owner_rejected() {
        let mut wire = summary(&extracted());
        wire["relationSites"][0]["sourceFactId"] = json!("foreign-file-symbol");
        assert_eq!(
            decode_retained_file(&wire).unwrap_err().code(),
            "INVALID_REQUEST"
        );
    }
    #[test]
    fn retained_rejects_invalid_numbers_before_conversion() {
        let good = summary(&extracted());
        for n in [json!(-1), json!(0.5), json!(9_007_199_254_740_992u64)] {
            let mut wire = good.clone();
            wire["symbols"][0]["span"]["startLine"] = n;
            assert!(decode_retained_file(&wire).is_err());
        }
    }

    #[test]
    fn retained_preserves_partial_and_unsupported_extraction_statistics() {
        let mut wire = summary(&extracted());
        wire["coverage"][0]["coverage"] = json!("PARTIAL");
        let stats = &mut wire["coverage"][0]["statistics"];
        let covered = stats["coveredSites"].as_u64().unwrap();
        stats["eligibleSites"] = json!(covered + 5);
        stats["unsupportedSites"] = json!(2);
        stats["partialSites"] = json!(3);
        let decoded = decode_retained_file(&wire).unwrap();
        let cap = wire["coverage"][0]["capability"].as_str().unwrap();
        let actual = &decoded.analysis.site_statistics[cap];
        assert_eq!(actual.eligible_sites, covered + 5);
        assert_eq!(actual.covered_sites, covered);
        assert_eq!(actual.unsupported_sites, 2);
        assert_eq!(actual.partial_sites, 3);
        assert_eq!(actual.resolution_counts, Default::default());
        assert_eq!(
            decoded.analysis.coverage,
            crate::language::SyntaxCoverage::Partial
        );
    }
}
