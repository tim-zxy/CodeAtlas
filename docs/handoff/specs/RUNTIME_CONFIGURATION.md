# Runtime and Configuration Specification

Packet D written-spec acceptance (2026-10-04): the latest user “确认” accepts the [composition specification](../../superpowers/specs/2026-10-04-p05-w3-020-native-refresh-composition-design.md). Its [D1–D6 executable plan](../../superpowers/plans/2026-10-04-p05-w3-020-native-refresh-composition.md) is written and awaiting separate review/native execution confirmation. No code, Fixture registration, memory calibration/profile installation, gate passage or phase promotion follows. Final-build exact-purpose measurement and separate numeric approval precede production acceptance; E and original phase exits remain open. Earlier direction-only/pending-spec/missing-plan notes below are historical.

Packet D [written detail](../../superpowers/specs/2026-10-04-p05-w3-020-native-refresh-composition-design.md) awaits review: trusted scalar REFRESH_TRANSPORT admission precedes lazy preparation, SQL TEXT retention, serialization/stage/spawn; indexed summaries versus complete current inventory determine delta. New purpose requires final-build evidence and separate numeric approval, not borrowed FULL_TRANSPORT/REFRESH_VERIFY values. No worker/configuration knob, automatic full fallback or startup calibration is added.

## Phase 0 runtime bootstrap

`RuntimeBuilder` constructs an immutable `KnowledgeRuntime` from explicit
`RuntimeDependencies`. The Phase 0 dependencies validate configuration version
`1` and the `ONE_SHOT | MCP_STDIO` runtime mode, normalize an explicit
workspace root, and create a discriminated `WORKSPACE_CONTEXT_PLACEHOLDER`.
CLI and MCP use the same builder and differ only in runtime mode.

Phase 0 construction is asynchronous but in-memory. It performs no YAML loading,
workspace discovery, database work, source reconciliation, provider invocation,
network access, watching, or background service startup. Typed canonical errors
remain part of the Common IR task.

## Modes and lifecycle

Supported modes are `ONE_SHOT`, `MCP_STDIO`, and optional Phase 2 `DAEMON`. Startup loads global/workspace/repository overrides, validates config, opens and migrates databases, reconciles missed file changes, initializes capabilities, then serves the use case. MCP starts a watcher while alive; one-shot relies on startup reconciliation.

## Discovery and initialization

Commands search upward for `.ekp/`. `ekp init` creates workspace metadata/config/databases and registers repositories but does not force indexing or knowledge compilation; `--index` opts in. Repositories may live outside the workspace root.

## Configuration precedence

`repository override > workspace > global > defaults`. YAML is the user input; services receive only a validated immutable `EffectiveConfig`.

```ts
interface EffectiveConfig {
  runtime: RuntimeConfig;
  indexing: IndexingConfig;
  providers: ProviderConfig[];
  plugins: PluginConfig[];
  knowledge: KnowledgeConfig;
  llm: LlmConfig;
  embedding: EmbeddingConfig;
  agents: AgentConfig;
  security: SecurityConfig;
}
```

Config version is mandatory. Unknown keys warn with paths in Phase 1. Secrets use environment or OS credentials, not workspace YAML. Default exclusions cover VCS/build/vendor artifacts and common secret files, while index, LLM, and embedding access policies remain distinct.

For Phase 0.5 native analysis, `EffectiveConfig.indexing.nativeAnalyzer.parseWorkers` is the sole control-plane source for requested parse-worker mode (`AUTO` or explicit positive safe integer). The runtime derives an effective count under the request memory/resource budget, rejects an impossible explicit request, and records requested/effective values with analysis telemetry. This does not expand the Phase 0 bootstrap object, require YAML loading in P05-W2-001, or add a new Native IPC v1 field. The worker-count/default policy is EVOLVABLE only with pinned Fixture and benchmark evidence; see [Native Analyzer Scalability](../../specs/native-analyzer-scalability.md).

## Degradation

Native/reference provider absence reports unsupported coverage and uses allowed alternatives. LLM absence leaves deterministic graph/query capabilities usable. Embedding defaults disabled; FTS5 remains available. Failed knowledge update retains publication. `ekp doctor` checks environment/capabilities; `ekp status` reports project state.

Under accepted ADR-016, Native v3 composition receives versioned summaries through validated local IPC, not a new user-facing cache/worker knob or SQLite filename passed to Rust. parseWorkers remains the sole worker input and is excluded from semantic summary compatibility. Source-policy/capability/version changes require an explicit compatible bootstrap; an empty latest reconciliation delta is insufficient when baseline inventory differs. Metadata shares existing byte/memory budgets; hard-cap failure retains the graph and does not automatically fall back to full parsing. Detailed composition and telemetry remain later P05-W3-020 packets.

## Native metadata admission

Task1A implemented after revised-plan confirmation (2026-10-03): private verifier validates/admit trusted scalar before opener; dedicated static array is empty and no public Runtime export/configuration knob is added. Invalid scalar/refusal ordering pass fresh tests; no fake positive/numeric approval or actual RSS gate is claimed. Required-root27 missing old-purpose profiles remain open after the Node digest changes; final-build measurement is5. Earlier proposed/pending-plan wording is historical, not permission to bypass those gates.

C1 written amendment accepted (2026-10-03 after25e7797): private `verifyNativeRefreshObservation(memoryBudgetBytes,openObservation)` validates/admit trusted scalar before opening once, then delegates to C primitive. Separate static `nativeRefreshVerificationProfiles` in existing excluded profile module binds REFRESH_VERIFY/build/corpus/evidence/policy. Its numeric value is absent; full/read profiles cannot authorize it. Exact interfaces/provenance/ordering are in the [accepted amendment](../../superpowers/specs/2026-10-03-p05-w3-020-c1-memory-preflight-proposal.md); revised-plan review precedes implementation and numeric approval precedes installation. No public API/configuration knob, automatic calibration, worker setting, D transport or SQLite workflow. Earlier direction-only wording is historical.

C1 preflight direction approval (2026-10-03) permits [written review](../../superpowers/specs/2026-10-03-p05-w3-020-c1-memory-preflight-proposal.md), not implementation: a private verification owner would admit its trusted budget before lazy raw preparation, using a separate exact-build REFRESH_VERIFY profile. Its numeric value is absent; READ_SEAL/FULL_TRANSPORT cannot authorize it. No configuration knob, automatic calibration, worker setting, D transport or SQLite workflow is introduced.

Packet B metadata admission is an exact built-implementation/Node/V8/platform/architecture/Zod profile, not a user-tunable reservation. The explicitly approved2026-10-02 profile reserves280,453,120 bytes plus twice retained SQL UTF-8 and records optional memoryPolicyRevision, memoryCandidateEvidenceDigest, observedPeakBytes and fluctuationAllowanceBytes. These fields identify offline immutable high-water/range evidence; Runtime still consumes a static reservation and never calibrates or reduces it automatically. Missing/changed identities fail closed before observation; bounded Provider request framing also precedes Runtime schema copies/database access. See CURRENT_STATUS and the accepted stability amendment for hashes, finite-sampling limitations and fresh gates. No new worker/cache knob or phase scope is introduced.

## Packaging

Phase 1 distributes a TypeScript npm package plus platform-specific Rust binary packages; users need no Rust toolchain. Product, provider protocol, Canonical IR, database schema, config, workflow, and prompt versions evolve independently with explicit compatibility checks.
