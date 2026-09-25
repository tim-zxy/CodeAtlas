use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::java_relations::compilation_unit_id;
use codeatlas_native_analyzer::language::{
    AnalyzerError, LanguageAnalyzer, RelationKind, RelationSite, SourceSpan,
};
use codeatlas_native_analyzer::relation_index::{DeclarationIndex, relation_fact_id};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

fn analyze_sites(
    path: &str,
    source: &[u8],
) -> codeatlas_native_analyzer::language::LanguageAnalysis {
    JavaAnalyzer::new()
        .unwrap()
        .analyze_with_relations_until(
            path,
            source,
            Instant::now() + Duration::from_secs(2),
            &AtomicBool::new(false),
            4 * 1024 * 1024,
        )
        .unwrap()
}

#[test]
fn declaration_index_finds_later_file_method_by_qualified_name_and_arity() {
    let symbols = JavaAnalyzer::new()
        .unwrap()
        .analyze("src/B.java", b"package demo; class B { void run() {} }")
        .unwrap()
        .symbols;
    let mut index = DeclarationIndex::new(4096);
    index.insert("src/B.java", &symbols).unwrap();

    let matches = index.candidates("demo.B.run", Some(0));
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].provider_kind, "java.method");
    assert_eq!(matches[0].signature, "()");
}

#[test]
fn declaration_index_rejects_instead_of_dropping_facts_when_budget_is_too_small() {
    let symbols = JavaAnalyzer::new()
        .unwrap()
        .analyze("src/B.java", b"class B { void run() {} }")
        .unwrap()
        .symbols;
    assert!(matches!(
        DeclarationIndex::new(1).insert("src/B.java", &symbols),
        Err(AnalyzerError::ResourceLimit)
    ));
}

#[test]
fn declaration_index_preserves_static_metadata_without_changing_symbol_identity() {
    let symbols = JavaAnalyzer::new()
        .unwrap()
        .analyze(
            "src/B.java",
            b"class B { static void run() {} void other() {} }",
        )
        .unwrap()
        .symbols;
    let static_method = symbols.iter().find(|item| item.name == "run").unwrap();
    let instance_method = symbols.iter().find(|item| item.name == "other").unwrap();
    assert!(static_method.is_static);
    assert!(!instance_method.is_static);
    assert!(
        static_method
            .provider_fact_id
            .starts_with("java-symbol-v1:")
    );
}

#[test]
fn declaration_index_candidates_do_not_depend_on_file_insertion_order() {
    let mut analyzer = JavaAnalyzer::new().unwrap();
    let first = analyzer
        .analyze("src/First.java", b"package demo; class B { void run() {} }")
        .unwrap()
        .symbols;
    let second = analyzer
        .analyze(
            "src/Second.java",
            b"package demo; class B { void run() {} }",
        )
        .unwrap()
        .symbols;
    let mut forward = DeclarationIndex::new(8192);
    forward.insert("src/First.java", &first).unwrap();
    forward.insert("src/Second.java", &second).unwrap();
    let mut reverse = DeclarationIndex::new(8192);
    reverse.insert("src/Second.java", &second).unwrap();
    reverse.insert("src/First.java", &first).unwrap();
    let ids = |index: &DeclarationIndex| {
        index
            .candidates("demo.B.run", Some(0))
            .into_iter()
            .map(|fact| fact.provider_fact_id.clone())
            .collect::<Vec<_>>()
    };
    let observed = ids(&forward);
    assert_eq!(observed.len(), 2);
    assert_eq!(observed, ids(&reverse));
    assert!(observed[0] < observed[1]);
}

#[test]
fn relation_identity_is_stable_for_a_site_but_distinguishes_variant_and_position() {
    let site = RelationSite {
        kind: RelationKind::Call,
        variant: "direct".into(),
        source_fact_id: "caller-fact".into(),
        target_hint: "run".into(),
        arity: Some(0),
        span: SourceSpan {
            start_line: 4,
            start_column: 8,
            end_line: 4,
            end_column: 11,
        },
    };
    let first = relation_fact_id("src/A.java", &site, 0);
    assert!(first.starts_with("java-relation-v1:"));
    assert_eq!(first, relation_fact_id("src/A.java", &site, 0));
    assert_ne!(first, relation_fact_id("src/A.java", &site, 1));
    let mut moved = site.clone();
    moved.span.start_column += 1;
    assert_ne!(first, relation_fact_id("src/A.java", &moved, 0));
    let mut different_variant = site;
    different_variant.variant = "static".into();
    assert_ne!(first, relation_fact_id("src/A.java", &different_variant, 0));
}

#[test]
fn relation_sites_imports_use_a_file_source_even_without_package_declaration() {
    let analysis = analyze_sites(
        "src/A.java",
        b"import demo.B;\nimport static demo.B.run;\nimport demo.*;\nclass A {}",
    );
    let imports: Vec<_> = analysis
        .relation_sites
        .iter()
        .filter(|site| site.kind == RelationKind::Import)
        .collect();
    assert_eq!(imports.len(), 3);
    assert_eq!(
        imports
            .iter()
            .map(|site| site.variant.as_str())
            .collect::<Vec<_>>(),
        ["normal", "static", "wildcard"]
    );
    assert_eq!(
        imports
            .iter()
            .map(|site| site.target_hint.as_str())
            .collect::<Vec<_>>(),
        ["demo.B", "demo.B.run", "demo"]
    );
    assert!(
        imports
            .iter()
            .all(|site| site.source_fact_id == compilation_unit_id("src/A.java"))
    );
    assert_eq!(imports[0].span.start_line, 0);
    assert_eq!(imports[0].span.start_column, 7);
    assert_eq!(imports[0].span.end_column, 13);
}

#[test]
fn relation_sites_inheritance_and_type_references_keep_type_owner() {
    let analysis = analyze_sites(
        "src/A.java",
        b"interface I {} class A extends B implements I { B field; }",
    );
    let owner = analysis
        .symbols
        .iter()
        .find(|symbol| symbol.name == "A")
        .unwrap();
    let inheritance: Vec<_> = analysis
        .relation_sites
        .iter()
        .filter(|site| site.kind == RelationKind::Inheritance)
        .collect();
    assert_eq!(
        inheritance
            .iter()
            .map(|site| site.target_hint.as_str())
            .collect::<Vec<_>>(),
        ["B", "I"]
    );
    assert!(
        inheritance
            .iter()
            .all(|site| site.source_fact_id == owner.provider_fact_id)
    );
    assert!(
        analysis
            .relation_sites
            .iter()
            .any(|site| site.kind == RelationKind::Reference && site.target_hint == "B")
    );
}

#[test]
fn relation_sites_calls_and_member_references_have_real_callable_owners() {
    let analysis = analyze_sites(
        "src/A.java",
        b"class A { A() { this(1); } A(int x) {} static void stat() {} void run() { this.go(); go(); A.stat(); new A(); int x=this.value; Runnable r = A::stat; } void go() {} int value; }",
    );
    let calls: Vec<_> = analysis
        .relation_sites
        .iter()
        .filter(|site| site.kind == RelationKind::Call)
        .collect();
    assert_eq!(
        calls
            .iter()
            .map(|site| site.target_hint.as_str())
            .collect::<Vec<_>>(),
        ["this.A", "this.go", "go", "A.stat", "A"]
    );
    let run = analysis
        .symbols
        .iter()
        .find(|symbol| symbol.name == "run")
        .unwrap();
    assert!(
        calls
            .iter()
            .skip(1)
            .all(|site| site.source_fact_id == run.provider_fact_id)
    );
    assert!(
        analysis
            .relation_sites
            .iter()
            .any(|site| site.kind == RelationKind::Reference && site.target_hint == "this.value")
    );
    assert!(
        analysis
            .relation_sites
            .iter()
            .any(|site| site.kind == RelationKind::Reference && site.target_hint == "A::stat")
    );
    assert!(
        analysis
            .relation_sites
            .iter()
            .all(|site| !site.variant.starts_with("spring."))
    );
}

#[test]
fn relation_sites_do_not_assign_initializer_calls_to_a_made_up_method() {
    let analysis = analyze_sites(
        "src/A.java",
        b"class A { static { helper(); } void helper() {} }",
    );
    assert!(
        !analysis
            .relation_sites
            .iter()
            .any(|site| site.kind == RelationKind::Call)
    );
    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "UNSUPPORTED_RELATION_SOURCE")
    );
}

#[test]
fn relation_sites_charge_diagnostics_to_the_result_budget() {
    let result = JavaAnalyzer::new().unwrap().analyze_with_relations_until(
        "src/A.java",
        b"class A { static { helper(); } void helper() {} }",
        Instant::now() + Duration::from_secs(2),
        &AtomicBool::new(false),
        1500,
    );
    assert!(matches!(result, Err(AnalyzerError::ResourceLimit)));
}
