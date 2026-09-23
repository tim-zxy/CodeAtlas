# P0-W4-001 Provider and Plugin SPI Design

Date: 2026-09-23
Task: P0-W4-001
Status: design approved in conversation; written specification awaiting review

## Purpose and success criteria

Phase 0 needs public, provider-independent contracts that let later runtime work select code-intelligence providers and framework plugins without depending on a Java parser or a Spring implementation. The task succeeds when strict executable schemas and TypeScript interfaces cover descriptors, capabilities, full and refresh analysis, plugin detection and candidate extraction, and deterministic routing metadata. A declared fake-provider/plugin Fixture must prove positive and negative cases. Root tests, the architecture check, and `pnpm verify` must pass before the implementation task is complete.

This design implements the existing [Provider SPI](../../handoff/specs/PROVIDER_SPI.md), [Plugin SPI](../../handoff/specs/PLUGIN_SPI.md), [Module Boundaries](../../handoff/specs/MODULE_BOUNDARIES.md), and P0-W4-001 traceability row. It does not change a frozen decision or the strict ProviderSnapshot v1 schema.

## Package boundaries

`@codeatlas/providers` owns `CodeIntelligenceProvider`, its public request/descriptor schemas, and pure provider-routing metadata. It imports `@codeatlas/ir` and reuses the existing Native IPC event and complete-stream schemas. A native adapter can implement this SPI later; P0-W4-001 does not add that adapter or an orchestrator.

`@codeatlas/plugins` owns `FrameworkPlugin`, descriptor/context/result schemas, candidate-extraction output, and pure plugin-routing metadata. It imports `@codeatlas/ir` and the provider read contract where necessary. It does not depend on execution, contracts, knowledge, storage, or application packages. Existing architecture allowlists remain authoritative.

Providers observe source and emit provider facts. Plugins consume bounded, immutable canonical facts/artifact metadata and derive framework semantics. Neither SPI can publish canonical state, write SQLite, or determine truth from routing order.

## Provider contract

The public descriptor contains an exact provider ID and version, nonempty unique protocol and IR schema version lists, unique language IDs, and unique fine-grained capability IDs. Capability IDs are stable exact strings; the initial known names include symbol, import, reference, call, inheritance, override, source range, incremental refresh, and coverage. The contract allows later capabilities without changing this Phase 0 list. Provider-side language grammar/analyzer metadata may be exposed by a native descriptor, but is not added to ProviderSnapshot v1.

The interface is `describe(): Promise<ProviderDescriptor>`, `analyze(request: FullAnalysisRequest): AsyncIterable<AnalysisEvent>`, and `refresh(request: RefreshAnalysisRequest): AsyncIterable<AnalysisEvent>`. The requests reuse the existing IPC repository, revision, normalized file scope/change sets, snapshot ID, requested capabilities, deadline, and resource budget. They additionally carry a JSON-safe, read-only configuration value and an `AbortSignal` for in-process cancellation. Those two process-local fields are not serialized into Native IPC v1. Request schemas validate the serializable fields with the existing IPC request payload schemas, and validate configuration separately; `AbortSignal` is checked as a process-local capability.

Each emitted `AnalysisEvent` is an existing `NativeEventEnvelope` for `ANALYZE` or `REFRESH`. The complete event stream is validated against the matching `NativeEventStreamSchema` before it can be used as an applicable result. This preserves request context, contiguous sequence, legal event types, counts, budgets, and exactly one terminal event. The existing native client remains responsible for byte-stream checksum verification. A failed, cancelled, truncated, or invalid stream exposes no applicable partial result. Contract helpers may collect and validate a fake stream; they do not apply canonical facts or manage subprocesses. Provider facts retain provider identity and unresolved targets.

## Plugin contract

The descriptor declares an exact plugin ID/version, unique supported language and framework IDs, required provider capabilities, produced semantic capabilities, a versioned configuration-schema reference `{ schema, version }`, and trust class `BUILT_IN`. It does not embed executable validators or grant runtime permissions. Phase 3 may design third-party trust separately.

`detect(input)` receives bounded, read-only canonical fact/artifact views plus typed JSON-safe configuration and returns a strict result with `matched`, canonical input evidence references, and diagnostics. A positive detection requires at least one evidence reference; negative detection cannot claim a framework fact. Detection is side-effect free at the SPI boundary.

`extract(input)` receives the same bounded context and a positive detection result, and yields candidate semantic facts. Each candidate has a declared semantic capability, a versioned payload envelope, and one or more canonical input support references. The common shell and JSON safety are validated now. Phase 1's canonical runtime/contract schemas validate the meaning and fields of `EntryPoint`, `TaskDefinition`, `DataResource`, `Contract`, and related payloads before application workflows can publish them. This avoids freezing unfinished Phase 1 semantic models in Phase 0 while ensuring every emitted candidate is traceable to input facts. Dynamic/unknown behavior is represented by diagnostics and incomplete coverage, not invented certainty.

Plugin configuration and contexts contain no raw environment, shell, network, or arbitrary filesystem handles. The SPI expresses data access, not execution sandboxing.

## Deterministic routing metadata

Registration metadata is separate from descriptive capability facts. Provider registrations have a validated role (`PRIMARY`, `SECONDARY`, or `SHADOW`), safe-integer priority, and unique stable provider ID. A pure selection function filters by requested language and all required capabilities, then sorts by role in `PRIMARY`, `SECONDARY`, `SHADOW` order, descending priority, and provider ID in exact lexical order. Plugin registrations use priority and stable plugin ID; a pure selection function filters by language, framework, and provider capabilities, then sorts by descending priority and plugin ID. Duplicate IDs are rejected rather than resolved by input order. Neither function invokes providers/plugins or treats rank as authority over canonical truth.

## Failure handling and acceptance

Strict schemas reject unknown keys, duplicate descriptor values, malformed versions/IDs, mismatched request and event contexts, invalid terminal/sequence/count behavior, invalid detection evidence, and candidates lacking support. Unsupported routing requirements produce an empty candidate list. Validation failures retain the existing typed IR/IPC error style where applicable; in-process exceptions and cancellation remain failures and never produce an applicable partial result.

The `p0-provider-plugin-spi-v1` Fixture declares fake provider/plugin contract cases for descriptor/schema validation, deterministic replay, full/refresh streams, cancellation, terminal and invalid events, coverage and diagnostics, unresolved targets, detection positive/negative with evidence, candidate extraction, capability filtering, duplicate rejection, and stable routing order. Focused Node tests run it through the public exports and are included in root `pnpm test`. `pnpm verify` and the architecture guardrail are mandatory. Completion records the Fixture ID, task ID, governing specs, acceptance gate, exact commands/results, and any contract/traceability changes in `CURRENT_STATUS.md` and `DESIGN_TRACEABILITY.md`.

## Scope boundary

This task adds no Spring/Mongo/Kafka/FastAPI implementation, Java parsing, source scanning, native-process adapter, provider normalization/FactMerger, runtime registry/execution orchestration, database migration or write path, canonical publication, knowledge compilation, third-party plugin loading, or adaptive routing. Those remain in their assigned later phases.
