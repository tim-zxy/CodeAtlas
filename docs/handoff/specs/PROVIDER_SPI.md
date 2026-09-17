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

## Events and outcome

Events conform to Native IPC concepts even for in-process providers. A stream ends in exactly one completed or failed terminal event. Coverage states distinguish covered, partial, unsupported, excluded, and failed. Diagnostics have stable codes, severity, source references, and provider metadata.

## Normalization and merging

Provider IDs remain in ProviderNode/ProviderEdge and ProviderFactBinding. Normalizers map to canonical kinds and fact keys. `FactMerger` merges equivalent support, respects exact/heuristic/ambiguous/unresolved hierarchy, and exposes explanations. Primary, secondary, and shadow roles affect orchestration and comparison, not automatic authority.

## Contract tests

Every provider must pass descriptor/schema, deterministic replay, cancellation, terminal-event, invalid-event, coverage, diagnostics, unresolved-target, and refresh semantics. Native/reference dual-support fixtures verify canonical fact lifetime.

## Native language extension

The public Provider SPI remains versioned and provider-independent. A future NativeProvider may expose negotiated provider-side `LanguageDescriptor` metadata (`grammarVersion`, `analyzerVersion`, `analysisCompatibilityId`); language capability maturity requires Fixture/Evaluation evidence. The current strict ProviderSnapshot v1 has no extension field, so persistence of this metadata requires a separately approved compatible schema/version rather than an unvalidated extra key. See [ADR-014](../adr/ADR-014-multilanguage-native-analyzer.md) and the [Native Analyzer Scalability specification](../../specs/native-analyzer-scalability.md).

