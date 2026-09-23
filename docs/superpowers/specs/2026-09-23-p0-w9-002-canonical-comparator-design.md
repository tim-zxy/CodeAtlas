# P0-W9-002 Canonical Comparator Design

Date: 2026-09-23
Task: P0-W9-002
Status: written specification awaiting review

## Purpose and authority

Phase 0 needs a deterministic, provider-independent comparison of expected and actual Canonical Code IR. The comparator identifies absent facts, unexpected facts, changed canonical payloads, and changed target resolution without silently equating ambiguous facts. It is successful when the four required classifications are reproducible, actionable, and tested against valid and invalid graph inputs. P0-W9-001's Fixture registry is integrated; P0-W9-003 will consume comparison results for metrics and the eval CLI.

This design implements the P0-W9-002 row in the [work breakdown](../../handoff/WORK_BREAKDOWN.md), [Phase 0 acceptance](../../handoff/PHASE_ACCEPTANCE.md), and [traceability matrix](../../handoff/DESIGN_TRACEABILITY.md). It follows the [Evaluation specification](../../handoff/specs/EVALUATION.md), [Canonical IR specification](../../handoff/specs/CANONICAL_IR.md), ADR-002, and ADR-012. It changes no frozen IR schema or baseline.

## Boundary and input

`@codeatlas/evaluation` owns a pure, synchronous comparator exported through its public package entry point. Its input is two named collections, `expected` and `actual`, each containing arrays of `CanonicalNode` and `CanonicalEdge` values. It does not discover files, parse Fixture artifact formats, invoke providers, read storage, or calculate metrics. The caller loads data; the comparator validates it with the existing strict IR schemas before matching. It does not mutate or retain caller-owned arrays or facts.

Each side must have unique node FactKeys, unique edge FactKeys, and unique Canonical IDs across its nodes and edges. Duplicate identities and invalid IR values fail the entire comparison with a stable error code and an input path such as `actual.edges[2].factKey`; no partial result is returned. Graph references are not required to resolve to a supplied node: differing dangling references remain observable as differences, not invented targets. No same-repository or same-revision assumption is imposed; `repositoryId` and `revisionId` are compared fields.

## Matching and graph references

Nodes and edges are paired independently. First, pair unique facts of the same type with equal `factKey`. Next, among facts still unmatched, pair equal `CanonicalId` only when that ID occurs once on each side. No name-, range-, kind-, or heuristic similarity pairing occurs. Remaining expected facts are `MISSING`; remaining actual facts are `EXTRA`. Matching by FactKey first permits independently generated but equivalent graphs to compare; the ID fallback exposes a changed FactKey as a field difference rather than merely a missing/extra pair. Matching only by ID would over-report differences; matching only by FactKey would obscure changed identity semantics.

Before comparing edge endpoints, build a mapping from expected node IDs to their paired actual node IDs. When an expected reference names a paired node, only its mapped actual ID is equivalent; equal literal IDs must not override that pairing. When the expected reference is unpaired, literal IDs are equivalent only if the actual reference is also unpaired. This rule applies to edge sources, resolved targets, and unresolved candidate lists. For example, if FactKey pairing maps expected nodes `1→2` and `2→1`, literal edge references `1→2` on both sides are different connections, not an unchanged pair. The mapping does not resolve an unresolved target, reorder candidates, or pair a dangling node reference by guesswork. Candidate array order remains significant because IR preserves it.

## Difference model

The public result contains every paired fact, including unchanged pairs, plus unmatched expected and actual facts. Each entry identifies `NODE` or `EDGE`, the expected and/or actual `id` and `factKey`, and the pairing basis (`FACT_KEY`, `ID`, or none). Paired entries contain a stable list of differences; unchanged pairs have an empty list. Each difference identifies one of `SEMANTIC_DIFFERENCE` or `RESOLUTION_DIFFERENCE`, an exact field path, and the expected and actual JSON values where applicable. An unmatched entry instead carries `MISSING` or `EXTRA`. This lets P0-W9-003 count a paired fact once even if several fields or both difference classes changed.

For nodes, changed canonical payload fields other than the opaque `id` are `SEMANTIC_DIFFERENCE`: `factKey` when paired by ID, repository/revision identity, kind/subkind, names, source range, and confidence. For edges, `factKey` when paired by ID, repository/revision identity, kind, source reference, source range, and confidence are semantic differences. The target subtree is classified as `RESOLUTION_DIFFERENCE`: state, resolution level, resolved node reference, unresolved hint, and ordered candidates. If semantic and target fields both differ, both classes appear on the same paired entry. An `id` difference on a FactKey match is recorded in the identities but is not itself a semantic failure; Canonical IDs are opaque and may differ across equivalent independently produced facts.

All returned arrays use ordinal code-unit string comparison independent of input order and locale. Entries sort by the tuple `(fact-type rank, expected FactKey or actual FactKey, actual FactKey or empty string, expected ID or actual ID, entry rank)`, where fact-type rank is `NODE` before `EDGE` and entry rank is paired, then `MISSING`, then `EXTRA`. Field differences sort by class (`SEMANTIC_DIFFERENCE` before `RESOLUTION_DIFFERENCE`) and then field path; array positions use paths such as `target.candidates[0].id`. The comparator does not include timestamps, environment-specific paths, provider identity, or nondeterministic diagnostics.

## Failure behavior and verification

Validation is atomic. Errors identify `expected` or `actual`, `nodes` or `edges`, the array index and offending identity/field; diagnostics do not echo source text or unrestricted payloads. Invalid values (including holes in JavaScript input arrays), duplicate IDs/FactKeys, and malformed target unions are rejected before matching. A comparison of empty collections returns an empty, valid result.

Focused tests and a small declared comparator Fixture will cover identical graphs with different IDs, swapped literal IDs under FactKey pairing, each of the four required classifications, FactKey changes recovered by ID, simultaneous semantic and resolution changes, target state/level/candidate-order changes, unresolved references, duplicate identities, invalid IR including sparse arrays, empty graphs, and input permutations yielding byte-identical serialized results. Include tests proving inputs are unmodified. The implementation plan will register these checks under the P0-W9-002 traceability row, run the package tests and root `pnpm verify`, and record fresh evidence in `CURRENT_STATUS.md` before claiming implementation complete.

P0-W9-002 does not compute precision, recall, critical-fact recall, quality-gate thresholds, Fixture reports, or CLI output; those remain P0-W9-003. It does not regenerate expected baselines, normalize Provider facts, infer target resolution, alter Canonical IR, or publish canonical/knowledge state.
