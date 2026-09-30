# Runtime and Configuration Specification

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
  runtime: RuntimeConfig; indexing: IndexingConfig;
  providers: ProviderConfig[]; plugins: PluginConfig[];
  knowledge: KnowledgeConfig; llm: LlmConfig;
  embedding: EmbeddingConfig; agents: AgentConfig;
  security: SecurityConfig;
}
```

Config version is mandatory. Unknown keys warn with paths in Phase 1. Secrets use environment or OS credentials, not workspace YAML. Default exclusions cover VCS/build/vendor artifacts and common secret files, while index, LLM, and embedding access policies remain distinct.

For Phase 0.5 native analysis, `EffectiveConfig.indexing.nativeAnalyzer.parseWorkers` is the sole control-plane source for requested parse-worker mode (`AUTO` or explicit positive safe integer). The runtime derives an effective count under the request memory/resource budget, rejects an impossible explicit request, and records requested/effective values with analysis telemetry. This does not expand the Phase 0 bootstrap object, require YAML loading in P05-W2-001, or add a new Native IPC v1 field. The worker-count/default policy is EVOLVABLE only with pinned Fixture and benchmark evidence; see [Native Analyzer Scalability](../../specs/native-analyzer-scalability.md).

## Degradation

Native/reference provider absence reports unsupported coverage and uses allowed alternatives. LLM absence leaves deterministic graph/query capabilities usable. Embedding defaults disabled; FTS5 remains available. Failed knowledge update retains publication. `ekp doctor` checks environment/capabilities; `ekp status` reports project state.

Under accepted ADR-016, Native v3 composition receives versioned summaries through validated local IPC, not a new user-facing cache/worker knob or SQLite filename passed to Rust. parseWorkers remains the sole worker input and is excluded from semantic summary compatibility. Source-policy/capability/version changes require an explicit compatible bootstrap; an empty latest reconciliation delta is insufficient when baseline inventory differs. Metadata shares existing byte/memory budgets; hard-cap failure retains the graph and does not automatically fall back to full parsing. Detailed composition and telemetry remain later P05-W3-020 packets.

## Packaging

Phase 1 distributes a TypeScript npm package plus platform-specific Rust binary packages; users need no Rust toolchain. Product, provider protocol, Canonical IR, database schema, config, workflow, and prompt versions evolve independently with explicit compatibility checks.

