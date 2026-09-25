use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::language::{
    AnalyzerError, LanguageAnalyzer, RelationKind, RelationSite, SourceSpan,
};
use codeatlas_native_analyzer::relation_index::{DeclarationIndex, relation_fact_id};

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
