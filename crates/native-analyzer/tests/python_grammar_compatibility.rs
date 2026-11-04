//! Dependency compatibility only; does not qualify actual observation or a profile.
#[test]
fn pinned_python_grammar_loads_in_existing_tree_sitter() {
    let language: tree_sitter::Language = tree_sitter_python::LANGUAGE.into();
    assert!(
        (tree_sitter::MIN_COMPATIBLE_LANGUAGE_VERSION..=tree_sitter::LANGUAGE_VERSION)
            .contains(&language.abi_version())
    );
    let mut parser = tree_sitter::Parser::new();
    parser.set_language(&language).unwrap();
    let tree = parser.parse("from fastapi import APIRouter\nrouter = APIRouter()\n@router.get(\"/items\")\nasync def endpoint():\n    return []\n", None).unwrap();
    assert!(!tree.root_node().has_error());
}
