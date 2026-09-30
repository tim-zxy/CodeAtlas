# Code Intelligence Provider SPI

## Responsibility

A provider observes source and emits provider facts, coverage, and diagnostics. It does not choose canonical identity, mutate SQLite, compile knowledge, or decide truth by execution order.

```ts
interface CodeIntelligenceProvider {
  describe(): Promise<ProviderDescriptor>;
  analyze(request: FullAnalysisRequest): AsyncIterable<AnalysisEvent>;
  refresh(request: RefreshAnalysisRequest): AsyncIterable<AnalysisEvent>;
}

interface ProviderDescriptor {
  providerId: string;
  providerVersion: string;
  protocolVersions: number[];
  irSchemaVersions: number[];
  languages: string[];
  capabilities: ProviderCapability[];
}
```

Capabilities are fine-grained: symbol, import, reference, call, inheritance, override, source range, incremental refresh, coverage, and later advanced flow/data capabilities. Requests include repository, revision, normalized file scope, configuration, cancellation/deadline, and resource budget.

## Phase 0 executable contract

`@codeatlas/providers` exports strict `ProviderDescriptorSchema`, `FullAnalysisRequestSchema`, and `RefreshAnalysisRequestSchema` with types inferred from them. Descriptor version, language, and capability lists are nonempty and duplicate-free. Full/refresh requests wrap an existing Native IPC v1 `ANALYZE`/`REFRESH` envelope with JSON-safe process-local configuration and an `AbortSignal`; the latter two fields are not serialized into IPC v1.

`validateProviderStream` collects only within the request's event budget and applies `NativeEventStreamSchema` to the complete stream. It returns a result only for a successful completed terminal event. Invalid, truncated, failed, or cancelled streams produce no applicable partial result; cancellation closes the iterator. The native-process client remains responsible for raw JSONL checksum verification.

`ProviderRegistrationSchema` adds a role and safe-integer priority outside the descriptor. `selectProviderCandidates` rejects duplicate IDs, filters by language and all required capabilities, then orders by `PRIMARY`, `SECONDARY`, `SHADOW`, descending priority, and exact provider ID. Routing order is deterministic selection metadata, never a truth or publication rule.

## Events and outcome

Events conform to Native IPC concepts even for in-process providers. A stream ends in exactly one completed or failed terminal event. Coverage states distinguish covered, partial, unsupported, excluded, and failed. Diagnostics have stable codes, severity, source references, and provider metadata.

For P05-W3-003 Native IPC v2 `ANALYZE`, per-file/capability coverage additionally reports recognized eligible sites partitioned into covered, unsupported, and partial sites, plus relation-target resolution counts. An honestly emitted ambiguous or unresolved relation is covered extraction, not a claimed resolved target. Syntax-error regions that cannot be enumerated leave coverage `PARTIAL`; zero facts in a valid empty file remain a successful complete observation. A v1 Provider response has categorical coverage only, and its numeric statistics are unavailable rather than zero. This is observation metadata, not Canonical Fact identity or a state-activation decision (ADR-015).

## Normalization and merging

Provider IDs remain in ProviderNode/ProviderEdge and ProviderFactBinding. Normalizers map to canonical kinds and fact keys. `FactMerger` merges equivalent support, respects exact/heuristic/ambiguous/unresolved hierarchy, and exposes explanations. Primary, secondary, and shadow roles affect orchestration and comparison, not automatic authority.

P05-W4-001 exposes `normalizeNativeAnalysis` for a complete validated v1/v2
Native `ANALYZE` result. It rechecks the completed stream and Provider Fact
context, maps all nodes before relations, and returns deterministic
Provider-to-Canonical pairs plus a node-reference lookup. The function is pure:
it does not merge duplicate support, create Evidence/bindings, activate SQLite,
or publish a partial graph. Failed/truncated/mixed-context streams, unknown
Java Provider kinds, absent references, and invalid source-backed locations
return a controlled typed failure with no partial batch. The Java mapping and
versioned identity recipe are specified in the accepted
[`P05-W4-001 design`](../../superpowers/specs/2026-09-28-p05-w4-001-canonical-normalization-design.md);
the language-neutral Canonical schemas remain in `@codeatlas/ir`.

P05-W4-002 exposes `mergeCanonicalObservations` as a pure, all-or-nothing
current-view operation. One `SUCCEEDED` snapshot per Provider supplies validated
normalized pairs for one repository/revision; non-success, duplicate, or
cross-context observations raise `FactMergeError` with a structured path.
Same-key facts retain separate active Evidence and ProviderFactBinding rows.
The representative is one real support chosen by resolution/source-backed
priority and stable Provider tuple; multi-support confidence is the minimum
score without agreement boosting. A last-support removal produces an empty
current view, not a database deletion or historical Evidence transition.
Application Apply and REFRESH remain separate tasks. The exact behavior and
limits are governed by the accepted
[`P05-W4-002 design`](../../superpowers/specs/2026-09-28-p05-w4-002-fact-merger-design.md).

## Contract tests

Every provider must pass descriptor/schema, deterministic replay, cancellation, terminal-event, invalid-event, coverage, diagnostics, unresolved-target, and refresh semantics. Native/reference dual-support fixtures verify canonical fact lifetime.

## Native language extension

[ADR-016](../adr/ADR-016-native-refresh-derived-analysis-state.md) accepts provider-owned derived extraction summaries and a separately negotiated Native v3 path, without adding a Canonical/ProviderSnapshot v1 extension field. The first [contract packet](../../superpowers/specs/2026-09-30-p05-w3-020-v3-contract-design.md) was approved and has isolated TS/Rust input validators locally (review/integration open). Existing public Provider SPI and native-client type unions remain unchanged until the separately reviewed composition packet; contract schemas alone do not register a supported language or incremental capability. Grammar/analyzer/resolver/normalizer/policy/capability context governs summary compatibility; worker count and root locator are not semantic discriminators.

The public Provider SPI remains versioned and provider-independent. A future NativeProvider may expose negotiated provider-side `LanguageDescriptor` metadata (`grammarVersion`, `analyzerVersion`, `analysisCompatibilityId`); language capability maturity requires Fixture/Evaluation evidence. The current strict ProviderSnapshot v1 has no extension field, so persistence of this metadata requires a separately approved compatible schema/version rather than an unvalidated extra key. See [ADR-014](../adr/ADR-014-multilanguage-native-analyzer.md) and the [Native Analyzer Scalability specification](../../specs/native-analyzer-scalability.md).
