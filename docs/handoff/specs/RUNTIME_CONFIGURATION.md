# Runtime and Configuration Specification

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

## Degradation

Native/reference provider absence reports unsupported coverage and uses allowed alternatives. LLM absence leaves deterministic graph/query capabilities usable. Embedding defaults disabled; FTS5 remains available. Failed knowledge update retains publication. `ekp doctor` checks environment/capabilities; `ekp status` reports project state.

## Packaging

Phase 1 distributes a TypeScript npm package plus platform-specific Rust binary packages; users need no Rust toolchain. Product, provider protocol, Canonical IR, database schema, config, workflow, and prompt versions evolve independently with explicit compatibility checks.

