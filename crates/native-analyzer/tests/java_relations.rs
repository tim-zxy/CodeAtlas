use codeatlas_native_analyzer::java::JavaAnalyzer;
use codeatlas_native_analyzer::java_relations::compilation_unit_id;
use codeatlas_native_analyzer::language::{
    AnalyzerError, LanguageAnalyzer, RelationKind, RelationSite, RelationTarget, SourceSpan,
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
    assert_eq!(analysis.site_statistics["CALL"].covered_sites, 0);
    assert_eq!(analysis.site_statistics["CALL"].unsupported_sites, 1);
    assert_eq!(analysis.site_statistics["CALL"].eligible_sites, 1);
}

#[test]
fn relation_statistics_count_sites_without_synthetic_compilation_unit() {
    let analysis = analyze_sites(
        "src/A.java",
        b"import demo.B; class A { void run() { new B(); } }",
    );
    assert_eq!(analysis.site_statistics["IMPORT"].covered_sites, 1);
    assert_eq!(analysis.site_statistics["IMPORT"].eligible_sites, 1);
    assert_eq!(analysis.site_statistics["CALL"].covered_sites, 1);
    assert_eq!(analysis.site_statistics["CALL"].eligible_sites, 1);
    assert_eq!(analysis.site_statistics["SYMBOL"].covered_sites, 2);
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

#[test]
fn resolves_relation_cross_file_static_calls_imports_inheritance_and_constructor() {
    let library = analyze_sites(
        "src/B.java",
        b"package demo; public class B { public B() {} public static void run() {} }",
    );
    let client = analyze_sites(
        "src/A.java",
        b"package app; import demo.B; import static demo.B.run; class A extends B { void go() { B.run(); run(); new B(); } }",
    );
    let mut index = DeclarationIndex::new(32 * 1024);
    index.insert("src/A.java", &client.symbols).unwrap();
    index.insert("src/B.java", &library.symbols).unwrap();
    index
        .set_file_imports("src/A.java", &client.relation_sites)
        .unwrap();
    let expected_run = library
        .symbols
        .iter()
        .find(|fact| fact.name == "run")
        .unwrap();
    let expected_constructor = library
        .symbols
        .iter()
        .find(|fact| fact.provider_kind == "java.constructor")
        .unwrap();
    for site in client
        .relation_sites
        .iter()
        .filter(|site| site.kind == RelationKind::Call)
    {
        let result = index.resolve("src/A.java", site);
        let expected = if site.variant == "constructor" {
            expected_constructor
        } else {
            expected_run
        };
        assert!(
            matches!(result.target, RelationTarget::Resolved { ref fact_id, .. } if fact_id == &expected.provider_fact_id),
            "{}",
            site.target_hint
        );
    }
    let inheritance = client
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Inheritance)
        .unwrap();
    let target = library
        .symbols
        .iter()
        .find(|fact| fact.name == "B" && fact.provider_kind == "java.class")
        .unwrap();
    assert!(
        matches!(index.resolve("src/A.java", inheritance).target, RelationTarget::Resolved { ref fact_id, .. } if fact_id == &target.provider_fact_id)
    );
    for site in client
        .relation_sites
        .iter()
        .filter(|site| site.kind == RelationKind::Import)
    {
        assert!(matches!(
            index.resolve("src/A.java", site).target,
            RelationTarget::Resolved { .. }
        ));
    }
}

#[test]
fn resolves_relation_ambiguous_equal_arity_overloads_without_guessing() {
    let analyzed = analyze_sites(
        "src/B.java",
        b"package demo; class B { void run(String x) {} void run(Integer x) {} void go() { run(null); } }",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    index.insert("src/B.java", &analyzed.symbols).unwrap();
    let call = analyzed
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    let result = index.resolve("src/B.java", call);
    assert!(
        matches!(result.target, RelationTarget::NonResolved { resolution: "AMBIGUOUS", ref candidates, .. } if candidates.len() == 2 && candidates[0] < candidates[1])
    );
}

#[test]
fn resolves_relation_unavailable_external_call_as_unresolved() {
    let analyzed = analyze_sites("src/A.java", b"class A { void go() { External.run(); } }");
    let mut index = DeclarationIndex::new(4096);
    index.insert("src/A.java", &analyzed.symbols).unwrap();
    let call = analyzed
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    assert!(
        matches!(index.resolve("src/A.java", call).target, RelationTarget::NonResolved { resolution: "UNRESOLVED", ref candidates, .. } if candidates.is_empty())
    );
}

#[test]
fn sole_same_arity_call_without_argument_types_is_not_exact() {
    let analyzed = analyze_sites(
        "src/A.java",
        b"class A { void run(int value) {} void go() { run(\"text\"); } }",
    );
    let mut index = DeclarationIndex::new(8192);
    index.insert("src/A.java", &analyzed.symbols).unwrap();
    let call = analyzed
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    assert!(matches!(
        index.resolve("src/A.java", call).target,
        RelationTarget::Resolved {
            resolution: "HEURISTIC",
            ..
        }
    ));
}

#[test]
fn wildcard_import_resolves_one_indexed_package_container() {
    let client = analyze_sites("src/A.java", b"package app; import demo.*; class A {} ");
    let first = analyze_sites("src/B.java", b"package demo; class B {} ");
    let second = analyze_sites("src/C.java", b"package demo; class C {} ");
    let mut index = DeclarationIndex::new(16 * 1024);
    for (path, analysis) in [
        ("src/A.java", &client),
        ("src/B.java", &first),
        ("src/C.java", &second),
    ] {
        index.insert(path, &analysis.symbols).unwrap();
    }
    index
        .set_file_imports("src/A.java", &client.relation_sites)
        .unwrap();
    let import = client
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Import)
        .unwrap();
    assert!(matches!(
        index.resolve("src/A.java", import).target,
        RelationTarget::Resolved { ref fact_id, resolution: "EXACT" }
            if fact_id == &codeatlas_native_analyzer::relation_index::package_container_fact_id("demo")
    ));
}

#[test]
fn inherited_search_uses_each_ancestors_imports_and_class_before_interface() {
    let grand = analyze_sites(
        "src/Grand.java",
        b"package lib; class Grand { void ping() {} }",
    );
    let base = analyze_sites(
        "src/Base.java",
        b"package demo; import lib.Grand; class Base extends Grand {} ",
    );
    let interface = analyze_sites(
        "src/I.java",
        b"package demo; interface I { default void ping() {} }",
    );
    let child = analyze_sites(
        "src/Child.java",
        b"package demo; class Child extends Base implements I { void go() { ping(); } }",
    );
    let mut index = DeclarationIndex::new(64 * 1024);
    for (path, analysis) in [
        ("src/Grand.java", &grand),
        ("src/Base.java", &base),
        ("src/I.java", &interface),
        ("src/Child.java", &child),
    ] {
        index.insert(path, &analysis.symbols).unwrap();
        index
            .insert_inheritance(path, &analysis.relation_sites)
            .unwrap();
        index
            .set_file_imports(path, &analysis.relation_sites)
            .unwrap();
    }
    let call = child
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    let grand_method = &grand
        .symbols
        .iter()
        .find(|symbol| symbol.name == "ping")
        .unwrap()
        .provider_fact_id;
    assert!(matches!(index.resolve("src/Child.java", call).target,
        RelationTarget::Resolved { ref fact_id, resolution: "HEURISTIC" } if fact_id == grand_method));
}

#[test]
fn local_same_arity_different_signature_does_not_hide_inherited_overload() {
    let base = analyze_sites(
        "src/Base.java",
        b"package demo; class Base { void ping(String value) {} }",
    );
    let child = analyze_sites(
        "src/Child.java",
        b"package demo; class Child extends Base { void ping(Integer value) {} void go() { ping(null); } }",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    for (path, analysis) in [("src/Base.java", &base), ("src/Child.java", &child)] {
        index.insert(path, &analysis.symbols).unwrap();
        index
            .insert_inheritance(path, &analysis.relation_sites)
            .unwrap();
    }
    let call = child
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    assert!(matches!(index.resolve("src/Child.java", call).target,
        RelationTarget::NonResolved { resolution: "AMBIGUOUS", ref candidates, .. } if candidates.len() == 2));
}

#[test]
fn deeper_class_overload_is_not_hidden_by_nearer_different_signature() {
    let grand = analyze_sites(
        "src/Grand.java",
        b"package demo; class Grand { void ping(String value) {} }",
    );
    let base = analyze_sites(
        "src/Base.java",
        b"package demo; class Base extends Grand { void ping(Integer value) {} }",
    );
    let child = analyze_sites(
        "src/Child.java",
        b"package demo; class Child extends Base { void go() { ping(null); } }",
    );
    let mut index = DeclarationIndex::new(24 * 1024);
    for (path, analysis) in [
        ("src/Grand.java", &grand),
        ("src/Base.java", &base),
        ("src/Child.java", &child),
    ] {
        index.insert(path, &analysis.symbols).unwrap();
        index
            .insert_inheritance(path, &analysis.relation_sites)
            .unwrap();
    }
    let call = child
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    assert!(matches!(index.resolve("src/Child.java", call).target,
        RelationTarget::NonResolved { resolution: "AMBIGUOUS", ref candidates, .. } if candidates.len() == 2));
}

#[test]
fn local_identical_signature_overrides_inherited_candidate() {
    let base = analyze_sites(
        "src/Base.java",
        b"package demo; class Base { void ping(String value) {} }",
    );
    let child = analyze_sites("src/Child.java", b"package demo; class Child extends Base { void ping(String value) {} void go() { ping(\"x\"); } }");
    let mut index = DeclarationIndex::new(16 * 1024);
    for (path, analysis) in [("src/Base.java", &base), ("src/Child.java", &child)] {
        index.insert(path, &analysis.symbols).unwrap();
        index
            .insert_inheritance(path, &analysis.relation_sites)
            .unwrap();
    }
    let call = child
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    let own = &child
        .symbols
        .iter()
        .find(|symbol| symbol.name == "ping")
        .unwrap()
        .provider_fact_id;
    assert!(matches!(index.resolve("src/Child.java", call).target,
        RelationTarget::Resolved { ref fact_id, resolution: "HEURISTIC" } if fact_id == own));
}

#[test]
fn direct_call_can_reach_indexed_superclass_method() {
    let parent = analyze_sites(
        "src/Base.java",
        b"package demo; class Base { void ping() {} }",
    );
    let child = analyze_sites(
        "src/Child.java",
        b"package demo; class Child extends Base { void go() { ping(); this.ping(); } }",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    index.insert("src/Base.java", &parent.symbols).unwrap();
    index.insert("src/Child.java", &child.symbols).unwrap();
    index
        .insert_inheritance("src/Child.java", &child.relation_sites)
        .unwrap();
    let expected = &parent
        .symbols
        .iter()
        .find(|symbol| symbol.name == "ping")
        .unwrap()
        .provider_fact_id;
    for call in child
        .relation_sites
        .iter()
        .filter(|site| site.kind == RelationKind::Call)
    {
        assert!(matches!(
            index.resolve("src/Child.java", call).target,
            RelationTarget::Resolved { ref fact_id, resolution: "HEURISTIC" } if fact_id == expected
        ));
    }
}

#[test]
fn explicit_static_import_call_remains_exact_without_wildcard() {
    let library = analyze_sites(
        "src/B.java",
        b"package demo; class B { static void ping() {} }",
    );
    let client = analyze_sites(
        "src/A.java",
        b"package demo; import static demo.B.ping; class A { void go() { ping(); } }",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    index.insert("src/A.java", &client.symbols).unwrap();
    index.insert("src/B.java", &library.symbols).unwrap();
    index
        .set_file_imports("src/A.java", &client.relation_sites)
        .unwrap();
    let call = client
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    assert!(matches!(
        index.resolve("src/A.java", call).target,
        RelationTarget::Resolved {
            resolution: "EXACT",
            ..
        }
    ));
}

#[test]
fn resolves_relation_wildcard_import_and_this_constructor_without_inventing_targets() {
    let library = analyze_sites("src/B.java", b"package demo; class B {} ");
    let client = analyze_sites(
        "src/A.java",
        b"package app; import demo.*; class A extends B { A() { this(1); } A(int x) {} }",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    index.insert("src/A.java", &client.symbols).unwrap();
    index.insert("src/B.java", &library.symbols).unwrap();
    index
        .set_file_imports("src/A.java", &client.relation_sites)
        .unwrap();
    let inheritance = client
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Inheritance)
        .unwrap();
    assert!(matches!(
        index.resolve("src/A.java", inheritance).target,
        RelationTarget::Resolved {
            resolution: "HEURISTIC",
            ..
        }
    ));
    let constructor_call = client
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    let constructor = client
        .symbols
        .iter()
        .find(|fact| fact.signature == "(int)")
        .unwrap();
    let resolved = index.resolve("src/A.java", constructor_call);
    assert!(
        matches!(&resolved.target, RelationTarget::Resolved { fact_id, resolution: "HEURISTIC" } if fact_id == &constructor.provider_fact_id),
        "{:?}",
        resolved.target
    );
}

#[test]
fn resolves_relation_field_and_method_references_to_declared_members() {
    let analyzed = analyze_sites(
        "src/A.java",
        b"class A { int value; static void stat() {} void go() { int x = this.value; Runnable r = A::stat; } }",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    index.insert("src/A.java", &analyzed.symbols).unwrap();
    for (hint, member) in [("this.value", "value"), ("A::stat", "stat")] {
        let site = analyzed
            .relation_sites
            .iter()
            .find(|site| site.target_hint == hint)
            .unwrap();
        let expected = analyzed
            .symbols
            .iter()
            .find(|fact| fact.name == member)
            .unwrap();
        assert!(
            matches!(index.resolve("src/A.java", site).target, RelationTarget::Resolved { ref fact_id, resolution: "EXACT" } if fact_id == &expected.provider_fact_id)
        );
    }
}

#[test]
fn resolves_relation_ambiguous_candidates_in_fact_id_order_across_insertion_orders() {
    let first = analyze_sites(
        "src/First.java",
        b"class B { void run() {} void go() { run(); } }",
    );
    let second = analyze_sites("src/Second.java", b"class B { void run() {} }");
    let call = first
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Call)
        .unwrap();
    let mut forward = DeclarationIndex::new(16 * 1024);
    forward.insert("src/First.java", &first.symbols).unwrap();
    forward.insert("src/Second.java", &second.symbols).unwrap();
    let mut reverse = DeclarationIndex::new(16 * 1024);
    reverse.insert("src/Second.java", &second.symbols).unwrap();
    reverse.insert("src/First.java", &first.symbols).unwrap();
    let target = forward.resolve("src/First.java", call).target;
    assert!(
        matches!(&target, RelationTarget::NonResolved { resolution: "AMBIGUOUS", candidates, .. } if candidates.len() == 2 && candidates[0] < candidates[1])
    );
    assert_eq!(target, reverse.resolve("src/First.java", call).target);
}

#[test]
fn resolves_relation_same_package_target_remains_exact_with_redundant_wildcard_import() {
    let analyzed = analyze_sites(
        "src/A.java",
        b"package demo; import demo.*; class B {} class A extends B {}",
    );
    let mut index = DeclarationIndex::new(16 * 1024);
    index.insert("src/A.java", &analyzed.symbols).unwrap();
    index
        .set_file_imports("src/A.java", &analyzed.relation_sites)
        .unwrap();
    let inheritance = analyzed
        .relation_sites
        .iter()
        .find(|site| site.kind == RelationKind::Inheritance)
        .unwrap();
    assert!(matches!(
        index.resolve("src/A.java", inheritance).target,
        RelationTarget::Resolved {
            resolution: "EXACT",
            ..
        }
    ));
}
