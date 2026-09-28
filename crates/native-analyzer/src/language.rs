#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceSpan {
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SymbolFact {
    pub provider_fact_id: String,
    pub provider_kind: String,
    pub name: String,
    pub qualified_name: Option<String>,
    pub signature: String,
    pub is_static: bool,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelationKind {
    Import,
    Call,
    Inheritance,
    Reference,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelationSite {
    pub kind: RelationKind,
    pub variant: String,
    pub source_fact_id: String,
    pub target_hint: String,
    pub arity: Option<usize>,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RelationTarget {
    Resolved {
        fact_id: String,
        resolution: &'static str,
    },
    NonResolved {
        resolution: &'static str,
        hint: String,
        candidates: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRelation {
    pub provider_fact_id: String,
    pub provider_kind: String,
    pub source_fact_id: String,
    pub target: RelationTarget,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntaxDiagnostic {
    pub code: String,
    pub message: String,
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyntaxCoverage {
    Complete,
    Partial,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ResolutionCounts {
    pub exact: u64,
    pub heuristic: u64,
    pub ambiguous: u64,
    pub unresolved: u64,
    pub unsupported: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SiteStatistics {
    pub eligible_sites: u64,
    pub covered_sites: u64,
    pub unsupported_sites: u64,
    pub partial_sites: u64,
    pub resolution_counts: ResolutionCounts,
}

impl SiteStatistics {
    pub fn covered(&mut self) {
        self.eligible_sites += 1;
        self.covered_sites += 1;
    }

    pub fn unsupported(&mut self) {
        self.eligible_sites += 1;
        self.unsupported_sites += 1;
    }

    pub fn partial(&mut self) {
        self.eligible_sites += 1;
        self.partial_sites += 1;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanguageAnalysis {
    pub symbols: Vec<SymbolFact>,
    pub relation_sites: Vec<RelationSite>,
    pub diagnostics: Vec<SyntaxDiagnostic>,
    pub coverage: SyntaxCoverage,
    pub site_statistics: BTreeMap<String, SiteStatistics>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalyzerError {
    GrammarUnavailable,
    ParserFailed,
    BudgetExceeded,
    ResourceLimit,
}

pub trait LanguageAnalyzer {
    fn analyze(
        &mut self,
        relative_path: &str,
        source: &[u8],
    ) -> Result<LanguageAnalysis, AnalyzerError>;
}
use std::collections::BTreeMap;
