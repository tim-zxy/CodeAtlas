use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::language::{LanguageAnalyzer, SyntaxCoverage};
use serde_json::Value;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

fn assert_exact_symbols(relative_path: &str, source: &[u8], expected_json: &str) {
    let mut analyzer = JavaAnalyzer::new().expect("Java grammar loads");
    let analysis = analyzer
        .analyze(relative_path, source)
        .expect("Java parses");
    let expected: Vec<Value> = serde_json::from_str(expected_json).expect("golden JSON parses");
    assert_eq!(analysis.symbols.len(), expected.len());
    for (actual, expected) in analysis.symbols.iter().zip(&expected) {
        assert_eq!(actual.provider_fact_id, expected["providerFactId"]);
        assert_eq!(actual.provider_kind, expected["providerKind"]);
        assert_eq!(actual.name, expected["name"]);
        assert_eq!(
            actual.qualified_name.as_deref(),
            expected["qualifiedName"].as_str()
        );
        assert_eq!(actual.span.start_line, expected["sourceRange"]["startLine"]);
        assert_eq!(
            actual.span.start_column,
            expected["sourceRange"]["startColumn"]
        );
        assert_eq!(actual.span.end_line, expected["sourceRange"]["endLine"]);
        assert_eq!(actual.span.end_column, expected["sourceRange"]["endColumn"]);
    }
}

#[test]
fn extracts_basic_package_types_and_members() {
    assert_exact_symbols(
        "src/Basic.java",
        include_bytes!("../../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
        include_str!("../../../fixtures/native/java-basic-symbol/expected/nodes.json"),
    );
    let mut analyzer = JavaAnalyzer::new().expect("Java grammar loads");
    let result = analyzer
        .analyze(
            "src/Basic.java",
            include_bytes!("../../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
        )
        .expect("valid Java parses");
    let kinds: Vec<(&str, &str)> = result
        .symbols
        .iter()
        .map(|fact| (fact.provider_kind.as_str(), fact.name.as_str()))
        .collect();
    assert_eq!(
        kinds,
        [
            ("java.package", "sample.basic"),
            ("java.interface", "Greeter"),
            ("java.method", "greet"),
            ("java.class", "Basic"),
            ("java.field", "count"),
            ("java.constructor", "Basic"),
            ("java.method", "greet"),
        ]
    );
    assert_eq!(result.coverage, SyntaxCoverage::Complete);
    assert!(result.diagnostics.is_empty());
    assert_eq!(result.site_statistics["SYMBOL"].covered_sites, 7);
    assert_eq!(result.site_statistics["SYMBOL"].eligible_sites, 7);
}

#[test]
fn symbol_statistics_count_source_declarators_but_not_empty_files() {
    let mut analyzer = JavaAnalyzer::new().unwrap();
    let result = analyzer
        .analyze("src/A.java", b"class A { int a, b; }")
        .unwrap();
    assert_eq!(result.site_statistics["SYMBOL"].covered_sites, 3);
    assert_eq!(result.site_statistics["SYMBOL"].unsupported_sites, 0);
    assert_eq!(result.site_statistics["SYMBOL"].partial_sites, 0);
    let empty = analyzer
        .analyze("src/Empty.java", b"// valid empty file")
        .unwrap();
    assert_eq!(empty.site_statistics["SYMBOL"].eligible_sites, 0);
    assert_eq!(empty.coverage, SyntaxCoverage::Complete);
}

#[test]
fn unrecognized_malformed_region_is_not_invented_as_a_symbol_site() {
    let mut analyzer = JavaAnalyzer::new().unwrap();
    let result = analyzer.analyze("src/Broken.java", b"class {}").unwrap();
    assert_eq!(result.coverage, SyntaxCoverage::Partial);
    assert_eq!(result.site_statistics["SYMBOL"].covered_sites, 0);
    assert_eq!(result.site_statistics["SYMBOL"].partial_sites, 0);
    assert_eq!(result.site_statistics["SYMBOL"].eligible_sites, 0);
}

#[test]
fn nested_types_and_overloads_keep_distinct_identity() {
    assert_exact_symbols(
        "src/Outer.java",
        include_bytes!("../../../fixtures/native/java-nested-types/source/src/Outer.java"),
        include_str!("../../../fixtures/native/java-nested-types/expected/nodes.json"),
    );
    let mut analyzer = JavaAnalyzer::new().expect("Java grammar loads");
    let result = analyzer
        .analyze(
            "src/Outer.java",
            include_bytes!("../../../fixtures/native/java-nested-types/source/src/Outer.java"),
        )
        .expect("valid Java parses");
    let runs: Vec<_> = result
        .symbols
        .iter()
        .filter(|fact| fact.provider_kind == "java.method" && fact.name == "run")
        .collect();
    assert_eq!(runs.len(), 2);
    assert_eq!(runs[0].signature, "(int)");
    assert_eq!(runs[1].signature, "(String)");
    assert_ne!(runs[0].provider_fact_id, runs[1].provider_fact_id);
    assert!(
        result
            .symbols
            .iter()
            .any(|fact| fact.provider_kind == "java.interface"
                && fact.qualified_name.as_deref() == Some("sample.nested.Outer.Inner"))
    );
    assert!(
        result
            .symbols
            .iter()
            .all(|fact| !fact.provider_kind.starts_with("spring."))
    );
}

#[test]
fn syntax_errors_report_partial_coverage_without_inventing_symbols() {
    let mut analyzer = JavaAnalyzer::new().expect("Java grammar loads");
    let result = analyzer
        .analyze(
            "src/Broken.java",
            b"package sample; class Broken { void run( }",
        )
        .expect("a syntax tree still exists");
    assert_eq!(result.coverage, SyntaxCoverage::Partial);
    assert!(!result.diagnostics.is_empty());
}

#[test]
fn empty_source_is_complete_and_has_no_symbols() {
    let mut analyzer = JavaAnalyzer::new().expect("Java grammar loads");
    let result = analyzer
        .analyze("src/Empty.java", b"")
        .expect("empty Java parses");
    assert_eq!(result.coverage, SyntaxCoverage::Complete);
    assert!(result.symbols.is_empty());
    assert!(result.diagnostics.is_empty());
}

#[test]
fn duplicate_names_in_different_owners_have_distinct_ids() {
    let source = b"class First { int value; } class Second { int value; }";
    let mut analyzer = JavaAnalyzer::new().expect("Java grammar loads");
    let result = analyzer
        .analyze("src/Duplicates.java", source)
        .expect("valid Java parses");
    let fields: Vec<_> = result
        .symbols
        .iter()
        .filter(|symbol| symbol.provider_kind == "java.field")
        .collect();
    assert_eq!(fields.len(), 2);
    assert_eq!(fields[0].qualified_name.as_deref(), Some("First.value"));
    assert_eq!(fields[1].qualified_name.as_deref(), Some("Second.value"));
    assert_ne!(fields[0].provider_fact_id, fields[1].provider_fact_id);
}

#[test]
fn varargs_and_declarator_dimensions_have_stable_distinct_signatures() {
    let mut analyzer = JavaAnalyzer::new().unwrap();
    let first = analyzer
        .analyze("src/Shapes.java", b"class Shapes { void run(String... xs) {} void run(String[] xs) {} void other(int xs[]) {} }")
        .unwrap();
    let methods: Vec<_> = first
        .symbols
        .iter()
        .filter(|fact| fact.provider_kind == "java.method")
        .collect();
    assert_eq!(
        methods
            .iter()
            .map(|fact| fact.signature.as_str())
            .collect::<Vec<_>>(),
        ["(String...)", "(String[])", "(int[])"]
    );
    assert_ne!(methods[0].provider_fact_id, methods[1].provider_fact_id);
    let second = analyzer
        .analyze("src/Shapes.java", b"class Shapes { void run(String[] xs) {} void run(String... xs) {} void other(int xs[]) {} }")
        .unwrap();
    for fact in methods {
        let reordered = second
            .symbols
            .iter()
            .find(|candidate| {
                candidate.provider_kind == fact.provider_kind
                    && candidate.name == fact.name
                    && candidate.signature == fact.signature
            })
            .unwrap();
        assert_eq!(fact.provider_fact_id, reordered.provider_fact_id);
    }
}

#[test]
fn large_valid_java_file_stops_at_accounted_result_budget() {
    let mut source = String::from("class Many { ");
    for index in 0..9_000 {
        source.push_str(&format!("int field{index}; "));
    }
    source.push('}');
    assert!(source.len() < 8 * 1024 * 1024);
    let mut analyzer = JavaAnalyzer::new().unwrap();
    let result = analyzer.analyze_until(
        "src/Many.java",
        source.as_bytes(),
        Instant::now() + Duration::from_secs(30),
        &AtomicBool::new(false),
        4 * 1024 * 1024,
    );
    assert_eq!(
        result,
        Err(codeatlas_native_analyzer::language::AnalyzerError::ResourceLimit)
    );
}
