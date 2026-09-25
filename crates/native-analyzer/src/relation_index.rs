use std::collections::BTreeMap;

use sha2::{Digest, Sha256};

use crate::language::{AnalyzerError, RelationKind, RelationSite, SymbolFact};

pub struct DeclarationIndex {
    by_qualified: BTreeMap<String, Vec<SymbolFact>>,
    max_bytes: usize,
    used_bytes: usize,
}

impl DeclarationIndex {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            by_qualified: BTreeMap::new(),
            max_bytes,
            used_bytes: 0,
        }
    }

    pub fn insert(&mut self, path: &str, symbols: &[SymbolFact]) -> Result<(), AnalyzerError> {
        let charge = symbols.iter().fold(0usize, |total, symbol| {
            total.saturating_add(
                512usize.saturating_add(
                    path.len()
                        .saturating_add(symbol.provider_fact_id.len())
                        .saturating_add(symbol.provider_kind.len())
                        .saturating_add(symbol.name.len())
                        .saturating_add(symbol.signature.len())
                        .saturating_add(symbol.qualified_name.as_deref().unwrap_or("").len()),
                ),
            )
        });
        let new_used = self.used_bytes.saturating_add(charge);
        if new_used > self.max_bytes {
            return Err(AnalyzerError::ResourceLimit);
        }
        for symbol in symbols {
            self.by_qualified
                .entry(
                    symbol
                        .qualified_name
                        .clone()
                        .unwrap_or_else(|| symbol.name.clone()),
                )
                .or_default()
                .push(symbol.clone());
        }
        self.used_bytes = new_used;
        Ok(())
    }

    pub fn candidates(&self, qualified_name: &str, arity: Option<usize>) -> Vec<&SymbolFact> {
        let mut candidates: Vec<_> = self
            .by_qualified
            .get(qualified_name)
            .into_iter()
            .flatten()
            .filter(|symbol| {
                arity.is_none_or(|wanted| signature_arity(&symbol.signature) == wanted)
            })
            .collect();
        candidates.sort_by(|left, right| left.provider_fact_id.cmp(&right.provider_fact_id));
        candidates
    }
}

fn signature_arity(signature: &str) -> usize {
    let Some(inner) = signature
        .strip_prefix('(')
        .and_then(|value| value.strip_suffix(')'))
    else {
        return 0;
    };
    if inner.is_empty() {
        return 0;
    }
    let mut depth = 0usize;
    let mut count = 1usize;
    for byte in inner.bytes() {
        match byte {
            b'<' => depth += 1,
            b'>' => depth = depth.saturating_sub(1),
            b',' if depth == 0 => count += 1,
            _ => {}
        }
    }
    count
}

pub fn relation_fact_id(path: &str, site: &RelationSite, ordinal: usize) -> String {
    let mut hash = Sha256::new();
    hash.update(b"java-relation-v1\0");
    let kind = match site.kind {
        RelationKind::Import => "import",
        RelationKind::Call => "call",
        RelationKind::Inheritance => "inheritance",
        RelationKind::Reference => "reference",
    };
    for field in [
        path,
        kind,
        &site.variant,
        &site.source_fact_id,
        &site.target_hint,
        &site.span.start_line.to_string(),
        &site.span.start_column.to_string(),
        &ordinal.to_string(),
    ] {
        hash.update(field.len().to_string().as_bytes());
        hash.update(b":");
        hash.update(field.as_bytes());
    }
    format!("java-relation-v1:{:x}", hash.finalize())
}
