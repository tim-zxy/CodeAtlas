use std::collections::{BTreeMap, BTreeSet, VecDeque};

use sha2::{Digest, Sha256};

use crate::language::{
    AnalyzerError, RelationKind, RelationSite, RelationTarget, ResolvedRelation, SymbolFact,
};

pub struct DeclarationIndex {
    by_qualified: BTreeMap<String, Vec<SymbolFact>>,
    path_packages: BTreeMap<String, String>,
    super_types: BTreeMap<String, Vec<(String, String, String)>>,
    imports_by_path: BTreeMap<String, Vec<(String, String)>>,
    max_bytes: usize,
    used_bytes: usize,
}

impl DeclarationIndex {
    pub fn accounted_bytes(&self) -> usize {
        self.used_bytes
    }
    pub fn new(max_bytes: usize) -> Self {
        Self {
            by_qualified: BTreeMap::new(),
            path_packages: BTreeMap::new(),
            super_types: BTreeMap::new(),
            imports_by_path: BTreeMap::new(),
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
            if symbol.provider_kind == "java.package" {
                self.path_packages
                    .insert(path.to_owned(), symbol.name.clone());
            }
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

    pub fn set_file_imports(
        &mut self,
        path: &str,
        sites: &[RelationSite],
    ) -> Result<(), AnalyzerError> {
        if self.imports_by_path.contains_key(path) {
            return Ok(());
        }
        let bytes = sites
            .iter()
            .filter(|site| site.kind == RelationKind::Import)
            .fold(path.len(), |total, site| {
                total
                    .saturating_add(256)
                    .saturating_add(site.variant.len())
                    .saturating_add(site.target_hint.len())
            });
        if self.used_bytes.saturating_add(bytes) > self.max_bytes {
            return Err(AnalyzerError::ResourceLimit);
        }
        let imports: Vec<_> = sites
            .iter()
            .filter(|site| site.kind == RelationKind::Import)
            .map(|site| (site.variant.clone(), site.target_hint.clone()))
            .collect();
        self.imports_by_path.insert(path.to_owned(), imports);
        self.used_bytes = self.used_bytes.saturating_add(bytes);
        Ok(())
    }

    fn imports(&self, path: &str) -> &[(String, String)] {
        self.imports_by_path
            .get(path)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn insert_inheritance(
        &mut self,
        path: &str,
        sites: &[RelationSite],
    ) -> Result<(), AnalyzerError> {
        for site in sites
            .iter()
            .filter(|site| site.kind == RelationKind::Inheritance)
        {
            let charge = 256usize
                .saturating_add(path.len())
                .saturating_add(site.source_fact_id.len())
                .saturating_add(site.target_hint.len())
                .saturating_add(site.variant.len());
            let new_used = self.used_bytes.saturating_add(charge);
            if new_used > self.max_bytes {
                return Err(AnalyzerError::ResourceLimit);
            }
            self.super_types
                .entry(site.source_fact_id.clone())
                .or_default()
                .push((
                    path.to_owned(),
                    site.target_hint.clone(),
                    site.variant.clone(),
                ));
            self.used_bytes = new_used;
        }
        Ok(())
    }

    pub fn resolve(&self, path: &str, site: &RelationSite) -> ResolvedRelation {
        let owner = self.symbol_by_id(&site.source_fact_id);
        let package = self
            .path_packages
            .get(path)
            .map(String::as_str)
            .unwrap_or("");
        let mut candidates: Vec<&SymbolFact> = match site.kind {
            RelationKind::Import => self.import_candidates(&site.target_hint, &site.variant),
            RelationKind::Inheritance => self.type_candidates(path, package, &site.target_hint).0,
            RelationKind::Call => self.call_candidates(path, package, owner, site),
            RelationKind::Reference => self.reference_candidates(path, package, owner, site),
        };
        candidates.sort_by(|left, right| left.provider_fact_id.cmp(&right.provider_fact_id));
        candidates.dedup_by(|left, right| left.provider_fact_id == right.provider_fact_id);
        let from_wildcard = match site.kind {
            RelationKind::Inheritance => self.type_candidates(path, package, &site.target_hint).1,
            RelationKind::Call => match site.variant.as_str() {
                "constructor" => self.type_candidates(path, package, &site.target_hint).1,
                "qualified" => site
                    .target_hint
                    .rsplit_once('.')
                    .is_some_and(|(receiver, _)| self.type_candidates(path, package, receiver).1),
                "direct" => candidates.iter().any(|candidate| {
                    self.imports(path).iter().any(|(variant, imported)| {
                        variant == "static_wildcard"
                            && candidate
                                .qualified_name
                                .as_deref()
                                .is_some_and(|name| name.starts_with(&format!("{imported}.")))
                    })
                }),
                _ => false,
            },
            RelationKind::Reference => {
                if site.variant == "type" {
                    self.type_candidates(path, package, &site.target_hint).1
                } else {
                    site.target_hint
                        .replace("::", ".")
                        .rsplit_once('.')
                        .is_some_and(|(receiver, _)| {
                            receiver != "this" && self.type_candidates(path, package, receiver).1
                        })
                }
            }
            RelationKind::Import => false,
        };
        let target = if site.kind == RelationKind::Import
            && site.variant == "wildcard"
            && self.has_package(&site.target_hint)
        {
            RelationTarget::Resolved {
                fact_id: package_container_fact_id(&site.target_hint),
                resolution: "EXACT",
            }
        } else {
            match candidates.as_slice() {
                [] => RelationTarget::NonResolved {
                    resolution: "UNRESOLVED",
                    hint: site.target_hint.clone(),
                    candidates: Vec::new(),
                },
                [candidate] => RelationTarget::Resolved {
                    fact_id: candidate.provider_fact_id.clone(),
                    resolution: if from_wildcard
                        || (site.kind == RelationKind::Call
                            && site.arity.is_some_and(|arity| arity > 0))
                        || (site.kind == RelationKind::Call
                            && matches!(site.variant.as_str(), "direct" | "this")
                            && owner
                                .and_then(|symbol| symbol.qualified_name.as_deref())
                                .and_then(|name| name.rsplit_once('.'))
                                .is_some_and(|(type_name, _)| {
                                    candidate.qualified_name.as_deref().is_none_or(|name| {
                                        !name.starts_with(&format!("{type_name}."))
                                    })
                                })
                            && !self.imports(path).iter().any(|(variant, imported)| {
                                variant == "static"
                                    && candidate.qualified_name.as_deref() == Some(imported)
                            })) {
                        "HEURISTIC"
                    } else {
                        "EXACT"
                    },
                },
                many => RelationTarget::NonResolved {
                    resolution: "AMBIGUOUS",
                    hint: site.target_hint.clone(),
                    candidates: many
                        .iter()
                        .map(|item| item.provider_fact_id.clone())
                        .collect(),
                },
            }
        };
        let provider_kind = match site.kind {
            RelationKind::Import => format!("java.import.{}", site.variant),
            RelationKind::Call => "java.call".to_owned(),
            RelationKind::Inheritance => "java.inheritance".to_owned(),
            RelationKind::Reference => "java.reference".to_owned(),
        };
        ResolvedRelation {
            provider_fact_id: relation_fact_id(path, site, 0),
            provider_kind,
            source_fact_id: site.source_fact_id.clone(),
            target,
            span: site.span.clone(),
        }
    }

    fn symbol_by_id(&self, fact_id: &str) -> Option<&SymbolFact> {
        self.by_qualified
            .values()
            .flat_map(|values| values.iter())
            .find(|symbol| symbol.provider_fact_id == fact_id)
    }

    fn import_candidates(&self, hint: &str, variant: &str) -> Vec<&SymbolFact> {
        self.candidates(hint, None)
            .into_iter()
            .filter(|symbol| match variant {
                "normal" => is_type(symbol),
                // Package symbols are per source file, not a canonical package node.
                // A wildcard import cannot truthfully resolve to one of them.
                "wildcard" => false,
                "static" => symbol.is_static,
                "static_wildcard" => is_type(symbol),
                _ => false,
            })
            .collect()
    }

    fn has_package(&self, package: &str) -> bool {
        self.candidates(package, None)
            .iter()
            .any(|symbol| symbol.provider_kind == "java.package")
    }

    pub fn should_emit_package_container(&self, path: &str, package: &str) -> bool {
        self.path_packages
            .iter()
            .find(|(_, name)| name.as_str() == package)
            .is_some_and(|(first_path, _)| first_path == path)
            && self.emits_package_container(package)
    }

    pub fn emits_package_container(&self, package: &str) -> bool {
        self.imports_by_path.values().any(|imports| {
            imports
                .iter()
                .any(|(variant, hint)| variant == "wildcard" && hint == package)
        })
    }

    fn type_candidates(&self, path: &str, package: &str, hint: &str) -> (Vec<&SymbolFact>, bool) {
        if hint.contains('.') {
            return (
                self.candidates(hint, None)
                    .into_iter()
                    .filter(|symbol| is_type(symbol))
                    .collect(),
                false,
            );
        }
        let mut names = Vec::new();
        if !package.is_empty() {
            names.push((format!("{package}.{hint}"), false));
        } else {
            names.push((hint.to_owned(), false));
        }
        {
            for (variant, imported) in self.imports(path) {
                if variant == "normal" && imported.rsplit('.').next() == Some(hint) {
                    names.push((imported.clone(), false));
                } else if variant == "wildcard" {
                    names.push((format!("{imported}.{hint}"), true));
                }
            }
        }
        let mut candidates = Vec::new();
        for (name, wildcard) in &names {
            if !wildcard {
                candidates.extend(
                    self.candidates(name, None)
                        .into_iter()
                        .filter(|symbol| is_type(symbol)),
                );
            }
        }
        if !candidates.is_empty() {
            return (candidates, false);
        }
        for (name, wildcard) in &names {
            if *wildcard {
                candidates.extend(
                    self.candidates(name, None)
                        .into_iter()
                        .filter(|symbol| is_type(symbol)),
                );
            }
        }
        let from_wildcard = !candidates.is_empty();
        (candidates, from_wildcard)
    }

    fn call_candidates(
        &self,
        path: &str,
        package: &str,
        owner: Option<&SymbolFact>,
        site: &RelationSite,
    ) -> Vec<&SymbolFact> {
        let hint = site.target_hint.as_str();
        let owner_type = owner
            .and_then(|symbol| symbol.qualified_name.as_deref())
            .and_then(|name| name.rsplit_once('.'))
            .map(|(name, _)| name);
        let (types, method, require_static) = if site.variant == "constructor" {
            let (types, _) = self.type_candidates(path, package, hint);
            (types, hint.rsplit('.').next().unwrap_or(hint), false)
        } else if site.variant == "this_constructor" {
            let type_name = owner_type.unwrap_or("");
            let method = type_name.rsplit('.').next().unwrap_or(type_name);
            let types = self
                .candidates(type_name, None)
                .into_iter()
                .filter(|symbol| is_type(symbol))
                .collect();
            (types, method, false)
        } else if let Some((receiver, method)) = hint.rsplit_once('.') {
            if receiver == "this" {
                let types = owner_type
                    .into_iter()
                    .flat_map(|name| self.candidates(name, None))
                    .filter(|symbol| is_type(symbol))
                    .collect();
                (types, method, false)
            } else {
                let (types, _) = self.type_candidates(path, package, receiver);
                (types, method, true)
            }
        } else {
            let types = owner_type
                .into_iter()
                .flat_map(|name| self.candidates(name, None))
                .filter(|symbol| is_type(symbol))
                .collect();
            (types, hint, false)
        };
        let kind = if matches!(site.variant.as_str(), "constructor" | "this_constructor") {
            "java.constructor"
        } else {
            "java.method"
        };
        let mut candidates = Vec::new();
        for type_symbol in types {
            let Some(type_name) = type_symbol.qualified_name.as_deref() else {
                continue;
            };
            let qualified = format!("{type_name}.{method}");
            let local: Vec<_> = self
                .candidates(&qualified, site.arity)
                .into_iter()
                .filter(|symbol| {
                    symbol.provider_kind == kind && (!require_static || symbol.is_static)
                })
                .collect();
            if kind == "java.method" && matches!(site.variant.as_str(), "direct" | "this") {
                let overridden: BTreeSet<_> = local
                    .iter()
                    .map(|symbol| symbol.signature.as_str())
                    .collect();
                candidates.extend(
                    self.inherited_methods(type_symbol, method, site.arity)
                        .into_iter()
                        .filter(|symbol| !overridden.contains(symbol.signature.as_str())),
                );
            }
            candidates.extend(local);
        }
        if candidates.is_empty() && site.variant == "direct" {
            for (variant, import) in self.imports(path) {
                if variant == "static" && import.rsplit('.').next() == Some(method) {
                    candidates.extend(self.candidates(import, site.arity).into_iter().filter(
                        |symbol| symbol.provider_kind == "java.method" && symbol.is_static,
                    ));
                } else if variant == "static_wildcard" {
                    let qualified = format!("{import}.{method}");
                    candidates.extend(self.candidates(&qualified, site.arity).into_iter().filter(
                        |symbol| symbol.provider_kind == "java.method" && symbol.is_static,
                    ));
                }
            }
        }
        candidates
    }

    fn inherited_methods(
        &self,
        owner_type: &SymbolFact,
        method: &str,
        arity: Option<usize>,
    ) -> Vec<&SymbolFact> {
        let mut seen = BTreeSet::new();
        let mut queue = VecDeque::from([owner_type]);
        let mut interfaces = VecDeque::new();
        let mut inherited = Vec::new();
        let mut covered_signatures = BTreeSet::new();
        seen.insert(owner_type.provider_fact_id.as_str());
        while !queue.is_empty() {
            let mut next = VecDeque::new();
            let mut candidates = Vec::new();
            for current in queue {
                if let Some(parents) = self.super_types.get(&current.provider_fact_id) {
                    for (path, hint, variant) in parents {
                        let package = self
                            .path_packages
                            .get(path)
                            .map(String::as_str)
                            .unwrap_or("");
                        for parent in self.type_candidates(path, package, hint).0 {
                            if !seen.insert(parent.provider_fact_id.as_str()) {
                                continue;
                            }
                            if variant == "class" && parent.provider_kind == "java.class" {
                                if let Some(name) = parent.qualified_name.as_deref() {
                                    candidates.extend(
                                        self.candidates(&format!("{name}.{method}"), arity)
                                            .into_iter()
                                            .filter(|symbol| symbol.provider_kind == "java.method"),
                                    );
                                }
                                next.push_back(parent);
                            } else if parent.provider_kind == "java.interface" {
                                interfaces.push_back(parent);
                            }
                        }
                    }
                }
            }
            for candidate in &candidates {
                if !covered_signatures.contains(candidate.signature.as_str()) {
                    inherited.push(*candidate);
                }
            }
            covered_signatures.extend(
                candidates
                    .iter()
                    .map(|candidate| candidate.signature.as_str()),
            );
            queue = next;
        }
        while !interfaces.is_empty() {
            let mut next = VecDeque::new();
            let mut candidates = Vec::new();
            for current in interfaces {
                if let Some(name) = current.qualified_name.as_deref() {
                    candidates.extend(
                        self.candidates(&format!("{name}.{method}"), arity)
                            .into_iter()
                            .filter(|symbol| symbol.provider_kind == "java.method"),
                    );
                }
                if let Some(parents) = self.super_types.get(&current.provider_fact_id) {
                    for (path, hint, _) in parents {
                        let package = self
                            .path_packages
                            .get(path)
                            .map(String::as_str)
                            .unwrap_or("");
                        for parent in self.type_candidates(path, package, hint).0 {
                            if parent.provider_kind == "java.interface"
                                && seen.insert(parent.provider_fact_id.as_str())
                            {
                                next.push_back(parent);
                            }
                        }
                    }
                }
            }
            for candidate in &candidates {
                if !covered_signatures.contains(candidate.signature.as_str()) {
                    inherited.push(*candidate);
                }
            }
            covered_signatures.extend(
                candidates
                    .iter()
                    .map(|candidate| candidate.signature.as_str()),
            );
            interfaces = next;
        }
        inherited
    }

    fn reference_candidates(
        &self,
        path: &str,
        package: &str,
        owner: Option<&SymbolFact>,
        site: &RelationSite,
    ) -> Vec<&SymbolFact> {
        if site.variant == "type" {
            return self.type_candidates(path, package, &site.target_hint).0;
        }
        let owner_type = owner
            .and_then(|symbol| symbol.qualified_name.as_deref())
            .and_then(|name| name.rsplit_once('.'))
            .map(|(name, _)| name);
        let hint = site.target_hint.replace("::", ".");
        let Some((receiver, member)) = hint.rsplit_once('.') else {
            return Vec::new();
        };
        let type_names: Vec<String> = if receiver == "this" {
            owner_type.into_iter().map(str::to_owned).collect()
        } else {
            self.type_candidates(path, package, receiver)
                .0
                .into_iter()
                .filter_map(|symbol| symbol.qualified_name.clone())
                .collect()
        };
        type_names
            .into_iter()
            .flat_map(|name| self.candidates(&format!("{name}.{member}"), None))
            .filter(|symbol| {
                if site.variant == "field" {
                    symbol.provider_kind == "java.field"
                } else {
                    symbol.provider_kind == "java.method"
                }
            })
            .collect()
    }
}

fn is_type(symbol: &SymbolFact) -> bool {
    matches!(
        symbol.provider_kind.as_str(),
        "java.class" | "java.interface"
    )
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

pub fn package_container_fact_id(package: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(b"java-package-container-v1\0");
    hash.update(package.len().to_string().as_bytes());
    hash.update(b":");
    hash.update(package.as_bytes());
    format!("java-package-container-v1:{:x}", hash.finalize())
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
