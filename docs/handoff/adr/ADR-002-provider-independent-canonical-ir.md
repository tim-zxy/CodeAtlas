# ADR 002 Provider Independent Canonical IR

Status: Accepted

Decision: Every analyzer emits provider facts that are normalized into versioned Canonical IR. Provider identity, evidence, resolution, coverage, and uncertainty are retained. No provider database schema is a public contract.

Consequences: providers are replaceable/comparable; normalization and FactMerger are mandatory; breaking IR changes require adapters, fixtures, and migration planning.

