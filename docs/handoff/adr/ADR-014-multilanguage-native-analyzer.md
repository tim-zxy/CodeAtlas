# ADR 014 Multi Language Native Analyzer and Performance Architecture

Status: Accepted as a backward-compatible architecture extension on 2026-09-17.

## Context

Java is the first Native Analyzer language, but a Java-shaped NativeProvider main flow would obstruct later languages. Incremental accuracy and memory/latency must be designed into the native pipeline without making the Rust analyzer own SQLite or framework semantics.

## Decision

Use an internal `LanguageAnalyzer` SPI inside NativeProvider, with separate language extraction/resolution and an evaluation-derived capability matrix. Recommended internals are core parser runtime, language adapters, repository resolver, and fact emitter, flowing through `Parse & Extract -> Index & Resolve -> Emit`. Framework interpretation stays in Plugins; Java syntax analysis does not implement Spring semantics, and future Python syntax analysis does not implement FastAPI semantics.

Use Rust/Tree-sitter, file fingerprints, file-level refresh, bounded per-worker parsers, in-memory incremental trees only while alive, no persistent AST, parallel file parsing, JSONL streaming, staging, and a SQLite batch activation transaction on the TypeScript side. Record stage timings and peak memory and benchmark cold, 1-file, 5-file, and 50-file runs. Versioned provider-side LanguageDescriptor/IPC metadata carries grammar, analyzer, and compatibility versions. The existing strict ProviderSnapshot v1 is unchanged; any persisted snapshot extension needs its own compatible schema/version decision. Detailed contract: [`docs/specs/native-analyzer-scalability.md`](../../specs/native-analyzer-scalability.md).

## Compatibility and phase effect

External Provider SPI and Native IPC remain versioned and provider-independent. Existing Java code, if present, is wrapped at the narrowest internal adapter boundary rather than rewritten. Phase 0/0.5 priorities and quality gates are unchanged; Phase 1 does not require all languages. `FAST`, `BALANCED`, and `PRECISE` are later analysis-depth profiles and do not change Canonical IR.

## Consequences

Capability maturity is registered only from Fixture/Evaluation evidence. Runtime restart reparses changed files, not all files, unless a compatible full rebuild is required. Stdout remains protocol-only, and failures preserve the last active graph. Numeric performance gates follow measured baselines rather than unsupported targets.
