# P0-W0-003 Runtime Bootstrap Design

**Date:** 2026-09-10  
**Status:** Approved in principle; implementation pending written-spec review  
**Task:** P0-W0-003  
**Authorities:** ADR-001, Runtime and Configuration Specification, Module Boundaries Specification  
**Acceptance mapping:** CLI/MCP shared runtime-construction smoke -> same `KnowledgeRuntime` without domain-layer inversion

## Goal

Establish the smallest shared TypeScript composition root that lets the CLI and MCP adapters construct the same `KnowledgeRuntime` abstraction with explicit dependencies, validated bootstrap configuration, and a workspace-context placeholder.

This task creates a runtime bootstrap contract only. It does not implement indexing, persistence, repository discovery, provider execution, knowledge compilation, or long-lived serving.

## Architectural position

The runtime package owns dependency composition and lifecycle assembly. It may depend on lower adapters and application contracts as those become available, but it does not own domain rules. CLI and MCP are transport adapters: they choose a supported runtime mode and workspace root, delegate construction to the runtime package, and do not construct storage or domain services directly.

The Phase 0 bootstrap remains local and deterministic. Construction performs no network access, database access, native process execution, filesystem discovery, or background work.

## Supported modes

P0-W0-003 supports exactly:

- `ONE_SHOT` for the CLI shell.
- `MCP_STDIO` for the MCP shell.

`DAEMON` is a Phase 2 capability and is not represented as a supported Phase 0 runtime mode.

## Public bootstrap contracts

The runtime package exposes contracts equivalent to the following:

```ts
export type RuntimeMode = 'ONE_SHOT' | 'MCP_STDIO';

export interface RuntimeBootstrapRequest {
  readonly configVersion: 1;
  readonly mode: RuntimeMode;
  readonly workspaceRoot: string;
}

export interface EffectiveBootstrapConfig {
  readonly configVersion: 1;
  readonly mode: RuntimeMode;
}

export interface WorkspaceContext {
  readonly kind: 'WORKSPACE_CONTEXT_PLACEHOLDER';
  readonly workspaceRoot: string;
}

export interface ConfigurationBootstrap {
  load(request: RuntimeBootstrapRequest): Promise<EffectiveBootstrapConfig>;
}

export interface WorkspaceContextFactory {
  create(
    workspaceRoot: string,
    config: EffectiveBootstrapConfig,
  ): Promise<WorkspaceContext>;
}

export interface RuntimeDependencies {
  readonly configurationBootstrap: ConfigurationBootstrap;
  readonly workspaceContextFactory: WorkspaceContextFactory;
}

export class RuntimeBuilder {
  constructor(dependencies: RuntimeDependencies);
  build(request: RuntimeBootstrapRequest): Promise<KnowledgeRuntime>;
}

export class KnowledgeRuntime {
  readonly kind: 'KnowledgeRuntime';
  readonly config: EffectiveBootstrapConfig;
  readonly workspace: WorkspaceContext;
}

export function createBootstrapRuntimeDependencies(): RuntimeDependencies;
export function createBootstrapRuntimeBuilder(): RuntimeBuilder;
```

Exact declaration layout may be split across focused files, but implementation must preserve these names and responsibilities unless review evidence requires a documented correction before coding.

## Configuration bootstrap behavior

The Phase 0 configuration bootstrap:

1. requires `configVersion`, `mode`, and `workspaceRoot`;
2. accepts only configuration version `1`;
3. accepts only `ONE_SHOT` and `MCP_STDIO`;
4. rejects an empty or whitespace-only workspace root;
5. resolves the workspace root to a normalized absolute path;
6. returns immutable configuration and workspace objects.

It does not read YAML, merge global/workspace/repository files, read secrets, inspect `.ekp/`, or materialize the Phase 1 `EffectiveConfig`. The narrow `EffectiveBootstrapConfig` name prevents the placeholder from masquerading as the complete Phase 1 configuration contract.

Validation failures use deterministic messages and ordinary JavaScript error classes. Typed canonical errors remain owned by P0-W1-001 and are not introduced early.

## Workspace context placeholder

The placeholder carries only its explicit discriminator and normalized workspace root. It must not expose repository registrations, revision sets, database handles, source fingerprints, watchers, or lifecycle status that has not been implemented.

The discriminator makes placeholder state observable and prevents consumers from treating it as a fully initialized workspace.

## Construction flow

```text
CLI --smoke                         MCP --smoke
    |                                   |
    | mode=ONE_SHOT                     | mode=MCP_STDIO
    +-----------------+-----------------+
                      |
          createBootstrapRuntimeBuilder()
                      |
               RuntimeBuilder
          +-----------+-----------+
          |                       |
ConfigurationBootstrap    WorkspaceContextFactory
          |                       |
          +-----------+-----------+
                      |
              KnowledgeRuntime
```

Both adapters use the same runtime package factory and builder. Adapter code may supply different modes, but it must not duplicate configuration or workspace construction.

`RuntimeBuilder.build` is asynchronous even though Phase 0 implementations are in-memory. This preserves the lifecycle boundary needed by later configuration, migration, reconciliation, and capability initialization without implementing those behaviors now.

## CLI and MCP behavior

The existing explicit `--smoke` commands remain process-level probes:

- CLI continues to write `codeatlas-cli:ready` to stdout.
- MCP continues to write `codeatlas-mcp:ready` to stderr and keeps stdout empty for protocol safety.

Before writing the ready marker, each adapter must successfully construct its `KnowledgeRuntime`. Unsupported invocations continue to exit nonzero and must not accidentally start a runtime.

Adapter modules expose focused construction functions for the shared construction test. Importing an adapter module must not execute its command-line main path.

## Error and failure semantics

- Invalid bootstrap input fails before a `KnowledgeRuntime` is returned.
- If configuration creation fails, workspace-context creation is not called.
- If workspace-context creation fails, no partial runtime is exposed.
- Construction has no persistent state, so rollback is not applicable.
- Errors do not trigger a remote fallback or a daemon.

## Test and Fixture design

### Runtime unit tests

Tests inject fake `RuntimeDependencies` and prove:

- dependencies are invoked in configuration-then-workspace order;
- the workspace factory receives the validated configuration;
- the returned value is a `KnowledgeRuntime`;
- returned bootstrap state is immutable;
- unsupported config versions, modes, and blank workspace roots fail deterministically;
- configuration failure prevents workspace creation;
- workspace failure prevents runtime creation.

### Shared runtime-construction check

A process-independent contract test imports the compiled CLI and MCP construction functions and proves:

- both return instances of the same exported `KnowledgeRuntime` class;
- CLI uses `ONE_SHOT`;
- MCP uses `MCP_STDIO`;
- both produce the same workspace-context contract;
- neither adapter imports storage or another forbidden implementation package.

### Existing process smoke checks

The existing CLI and MCP smoke tests remain and prove that actual entry points construct successfully, preserve stdout/stderr discipline, and reject unsupported invocations.

### Required gates

Completion requires:

- targeted runtime unit and construction tests;
- all CLI/MCP smoke tests;
- `pnpm architecture:check`;
- full `pnpm verify`;
- successful hosted GitHub Actions on the final commit.

## Planned file responsibilities

- `packages/runtime/src/configuration.ts`: bootstrap configuration types, validation, and default in-memory implementation.
- `packages/runtime/src/workspace-context.ts`: placeholder contract and default factory.
- `packages/runtime/src/knowledge-runtime.ts`: immutable runtime facade.
- `packages/runtime/src/runtime-builder.ts`: explicit dependency orchestration.
- `packages/runtime/src/index.ts`: public exports and bootstrap factory functions.
- `packages/runtime/test/runtime-bootstrap.test.mjs`: injected-dependency and validation tests.
- `apps/cli/src/main.ts`: CLI adapter construction and guarded main entry.
- `apps/mcp/src/main.ts`: MCP adapter construction and guarded main entry.
- `scripts/test-runtime-construction.mjs`: cross-adapter acceptance check.
- relevant package manifests and root test command: declared workspace dependencies and test registration.
- `docs/handoff/specs/RUNTIME_CONFIGURATION.md`: synchronize the accepted Phase 0 bootstrap contract.
- `docs/handoff/CURRENT_STATUS.md`: record final commands, counts, hosted CI evidence, deferred-scope check, and next unblocked task.

The existing traceability relationship does not change, so `DESIGN_TRACEABILITY.md` needs no edit unless implementation changes the Fixture, acceptance gate, or governing specification.

## Architecture guardrails

The implementation must preserve all of the following:

- apps depend on runtime, never concrete storage;
- runtime composition contains no domain rule;
- runtime objects contain no provider-specific identity or framework type;
- no SQLite ownership is introduced outside storage;
- no LLM, embedding, network, native analyzer, watcher, or daemon behavior is introduced;
- no global singleton or implicit mutable dependency container is introduced;
- no unresolved design is hidden behind a fake completed service.

## Compatibility and design governance

This design implements the existing P0-W0-003 task and does not amend a FROZEN decision. No ADR is required.

The normative Runtime and Configuration Specification will gain a Phase 0 bootstrap subsection during implementation because the public runtime contract is being made concrete. If implementation evidence contradicts this design, work stops to classify the issue as implementation, Fixture, or design-assumption error before changing the contract or gates.

