# P0-W0-003 Runtime Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Phase 0 runtime composition root so CLI and MCP construct the same immutable `KnowledgeRuntime` through explicit dependencies, validated bootstrap configuration, and a workspace-context placeholder.

**Architecture:** `@codeatlas/runtime` owns bootstrap configuration validation, workspace-context construction, and dependency orchestration. CLI and MCP remain thin transport adapters that select `ONE_SHOT` or `MCP_STDIO` and delegate to the same runtime builder. Construction is asynchronous but in-memory and local; it performs no persistence, discovery, provider, network, watcher, knowledge, or daemon work.

**Tech Stack:** Node.js 24, pnpm 11.19.0, TypeScript 7.0.2 with strict NodeNext ESM, Node built-in test runner, Prettier 3.9.6, existing architecture dependency checker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-p0-w0-003-runtime-bootstrap-design.md`

## Global Constraints

- Implement only `P0-W0-003`.
- Preserve ADR-001 local-first behavior and the dependency directions in `docs/handoff/specs/MODULE_BOUNDARIES.md`.
- Support exactly `ONE_SHOT` and `MCP_STDIO`; do not add `DAEMON`.
- Keep CLI and MCP dependent only on the public `@codeatlas/runtime` package.
- Do not add SQLite, migrations, YAML loading, `.ekp/` discovery, repository registration, indexing, providers, plugins, native IPC, LLMs, embeddings, watchers, sockets, or knowledge behavior.
- Keep the MCP process stdout empty during smoke execution.
- Use ordinary deterministic JavaScript errors; typed canonical errors belong to `P0-W1-001`.
- Do not lower an existing test, Fixture, architecture rule, Quality Gate, or acceptance criterion.
- Completion requires targeted tests, `pnpm verify`, hosted GitHub Actions, synchronized Runtime specification, and fresh evidence in `CURRENT_STATUS.md`.

---

### Task 1: Define the runtime bootstrap contract with failing tests

**Files:**

- Create: `packages/runtime/test/runtime-bootstrap.test.mjs`
- Create: `scripts/test-runtime-construction.mjs`
- Modify: `scripts/test-workspace-structure.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: the approved runtime-bootstrap design and existing package shells.
- Produces: executable contract tests for `RuntimeBuilder`, default bootstrap dependencies, and CLI/MCP shared construction.

- [ ] **Step 1: Add runtime unit tests before implementation**

Create `packages/runtime/test/runtime-bootstrap.test.mjs` with imports from `../dist/index.js`. Cover the public contract, dependency order, immutability, validation, and failure short-circuiting:

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

const runtimeModule = await import('../dist/index.js');
const {
  DefaultConfigurationBootstrap,
  DefaultWorkspaceContextFactory,
  KnowledgeRuntime,
  RuntimeBuilder,
} = runtimeModule;

const request = {
  configVersion: 1,
  mode: 'ONE_SHOT',
  workspaceRoot: '.',
};

test('RuntimeBuilder composes configuration before workspace context', async () => {
  const calls = [];
  const expectedConfig = Object.freeze({
    configVersion: 1,
    mode: 'ONE_SHOT',
    workspaceRoot: path.resolve('.'),
  });
  const expectedWorkspace = Object.freeze({
    kind: 'WORKSPACE_CONTEXT_PLACEHOLDER',
    workspaceRoot: path.resolve('.'),
  });
  const builder = new RuntimeBuilder({
    configurationBootstrap: {
      async load(actualRequest) {
        calls.push(['configuration', actualRequest]);
        return expectedConfig;
      },
    },
    workspaceContextFactory: {
      async create(config) {
        calls.push(['workspace', config]);
        return expectedWorkspace;
      },
    },
  });

  const runtime = await builder.build(request);

  assert.ok(runtime instanceof KnowledgeRuntime);
  assert.deepEqual(calls, [
    ['configuration', request],
    ['workspace', expectedConfig],
  ]);
  assert.equal(runtime.config, expectedConfig);
  assert.equal(runtime.workspace, expectedWorkspace);
  assert.equal(Object.isFrozen(runtime), true);
});

test('default bootstrap dependencies normalize and freeze state', async () => {
  const config = await new DefaultConfigurationBootstrap().load(request);
  const workspace = await new DefaultWorkspaceContextFactory().create(config);

  assert.deepEqual(config, {
    configVersion: 1,
    mode: 'ONE_SHOT',
    workspaceRoot: path.resolve('.'),
  });
  assert.equal(Object.isFrozen(config), true);
  assert.deepEqual(workspace, {
    kind: 'WORKSPACE_CONTEXT_PLACEHOLDER',
    workspaceRoot: path.resolve('.'),
  });
  assert.equal(Object.isFrozen(workspace), true);
});

for (const [name, invalid, message] of [
  ['version', { ...request, configVersion: 2 }, 'UNSUPPORTED_CONFIG_VERSION: expected 1'],
  ['mode', { ...request, mode: 'DAEMON' }, 'UNSUPPORTED_RUNTIME_MODE: DAEMON'],
  ['workspace root', { ...request, workspaceRoot: '   ' }, 'INVALID_WORKSPACE_ROOT: expected a non-empty path'],
]) {
  test(`configuration rejects invalid ${name}`, async () => {
    await assert.rejects(
      new DefaultConfigurationBootstrap().load(invalid),
      (error) => error instanceof Error && error.message === message,
    );
  });
}

test('configuration failure prevents workspace construction', async () => {
  let workspaceCalled = false;
  const builder = new RuntimeBuilder({
    configurationBootstrap: {
      async load() {
        throw new Error('configuration failed');
      },
    },
    workspaceContextFactory: {
      async create() {
        workspaceCalled = true;
        throw new Error('workspace must not run');
      },
    },
  });

  await assert.rejects(builder.build(request), /configuration failed/);
  assert.equal(workspaceCalled, false);
});

test('workspace failure exposes no partial runtime', async () => {
  const builder = new RuntimeBuilder({
    configurationBootstrap: new DefaultConfigurationBootstrap(),
    workspaceContextFactory: {
      async create() {
        throw new Error('workspace failed');
      },
    },
  });

  await assert.rejects(builder.build(request), /workspace failed/);
});
```

- [ ] **Step 2: Add the shared CLI/MCP construction Fixture**

Create `scripts/test-runtime-construction.mjs`:

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { buildCliRuntime } from '../apps/cli/dist/main.js';
import { buildMcpRuntime } from '../apps/mcp/dist/main.js';
import { KnowledgeRuntime } from '../packages/runtime/dist/index.js';

test('CLI and MCP construct the same KnowledgeRuntime contract', async () => {
  const workspaceRoot = path.join(process.cwd(), 'fixtures', 'runtime-bootstrap');
  const cli = await buildCliRuntime(workspaceRoot);
  const mcp = await buildMcpRuntime(workspaceRoot);

  assert.ok(cli instanceof KnowledgeRuntime);
  assert.ok(mcp instanceof KnowledgeRuntime);
  assert.equal(cli.kind, 'KnowledgeRuntime');
  assert.equal(mcp.kind, 'KnowledgeRuntime');
  assert.equal(cli.config.mode, 'ONE_SHOT');
  assert.equal(mcp.config.mode, 'MCP_STDIO');
  assert.deepEqual(cli.workspace, mcp.workspace);
  assert.equal(cli.workspace.kind, 'WORKSPACE_CONTEXT_PLACEHOLDER');
  assert.equal(cli.workspace.workspaceRoot, path.resolve(workspaceRoot));
});
```

- [ ] **Step 3: Update structural expectations**

In `scripts/test-workspace-structure.mjs`, replace blanket empty dependency assumptions with:

```js
const expectedPackageDependencies = Object.fromEntries(
  packageNames.map((name) => [name, {}]),
);
const expectedAppDependencies = {
  cli: { '@codeatlas/runtime': 'workspace:*' },
  daemon: {},
  mcp: { '@codeatlas/runtime': 'workspace:*' },
};
```

Use those maps in manifest assertions. Keep `export {};\n` as the exact source assertion for every package except `runtime`; for runtime, assert that `src/index.ts` contains exports for `RuntimeBuilder` and `KnowledgeRuntime`.

- [ ] **Step 4: Register the new tests**

Change the root test script to:

```json
"test": "node --test scripts/test-workspace-structure.mjs scripts/test-architecture-rules.mjs packages/runtime/test/runtime-bootstrap.test.mjs scripts/test-runtime-construction.mjs apps/cli/test/smoke.test.mjs apps/mcp/test/smoke.test.mjs"
```

- [ ] **Step 5: Verify RED**

Run:

```powershell
pnpm --filter @codeatlas/runtime build
pnpm --filter @codeatlas/cli build
pnpm --filter @codeatlas/mcp build
node --test packages/runtime/test/runtime-bootstrap.test.mjs scripts/test-runtime-construction.mjs scripts/test-workspace-structure.mjs
```

Expected: FAIL because runtime exports, app construction functions, source modules, and declared app dependencies do not exist. Confirm failures name missing contracts rather than malformed test code.

- [ ] **Step 6: Commit the red contract**

```powershell
git add package.json scripts/test-workspace-structure.mjs scripts/test-runtime-construction.mjs packages/runtime/test/runtime-bootstrap.test.mjs
git commit -m "test: define runtime bootstrap contract"
```

### Task 2: Implement immutable configuration and workspace bootstrap

**Files:**

- Create: `packages/runtime/src/configuration.ts`
- Create: `packages/runtime/src/workspace-context.ts`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**

- Consumes: `RuntimeBootstrapRequest`.
- Produces: configuration and workspace bootstrap contracts and default implementations.

- [ ] **Step 1: Implement configuration validation**

Create `packages/runtime/src/configuration.ts`:

```ts
import path from 'node:path';

export type RuntimeMode = 'ONE_SHOT' | 'MCP_STDIO';

export interface RuntimeBootstrapRequest {
  readonly configVersion: number;
  readonly mode: RuntimeMode;
  readonly workspaceRoot: string;
}

export interface EffectiveBootstrapConfig {
  readonly configVersion: 1;
  readonly mode: RuntimeMode;
  readonly workspaceRoot: string;
}

export interface ConfigurationBootstrap {
  load(request: RuntimeBootstrapRequest): Promise<EffectiveBootstrapConfig>;
}

const supportedModes: ReadonlySet<string> = new Set(['ONE_SHOT', 'MCP_STDIO']);

export class DefaultConfigurationBootstrap implements ConfigurationBootstrap {
  async load(request: RuntimeBootstrapRequest): Promise<EffectiveBootstrapConfig> {
    if (request.configVersion !== 1) {
      throw new RangeError('UNSUPPORTED_CONFIG_VERSION: expected 1');
    }
    if (!supportedModes.has(request.mode)) {
      throw new RangeError(`UNSUPPORTED_RUNTIME_MODE: ${String(request.mode)}`);
    }
    if (request.workspaceRoot.trim().length === 0) {
      throw new TypeError('INVALID_WORKSPACE_ROOT: expected a non-empty path');
    }

    return Object.freeze({
      configVersion: 1,
      mode: request.mode,
      workspaceRoot: path.resolve(request.workspaceRoot.trim()),
    });
  }
}
```

- [ ] **Step 2: Implement the workspace placeholder**

Create `packages/runtime/src/workspace-context.ts`:

```ts
import type { EffectiveBootstrapConfig } from './configuration.js';

export interface WorkspaceContext {
  readonly kind: 'WORKSPACE_CONTEXT_PLACEHOLDER';
  readonly workspaceRoot: string;
}

export interface WorkspaceContextFactory {
  create(config: EffectiveBootstrapConfig): Promise<WorkspaceContext>;
}

export class DefaultWorkspaceContextFactory implements WorkspaceContextFactory {
  async create(config: EffectiveBootstrapConfig): Promise<WorkspaceContext> {
    return Object.freeze({
      kind: 'WORKSPACE_CONTEXT_PLACEHOLDER',
      workspaceRoot: config.workspaceRoot,
    });
  }
}
```

- [ ] **Step 3: Export the contracts**

Replace `packages/runtime/src/index.ts` with:

```ts
export {
  DefaultConfigurationBootstrap,
  type ConfigurationBootstrap,
  type EffectiveBootstrapConfig,
  type RuntimeBootstrapRequest,
  type RuntimeMode,
} from './configuration.js';
export {
  DefaultWorkspaceContextFactory,
  type WorkspaceContext,
  type WorkspaceContextFactory,
} from './workspace-context.js';
```

- [ ] **Step 4: Verify partial GREEN**

Run:

```powershell
pnpm --filter @codeatlas/runtime build
node --test --test-name-pattern="default bootstrap|configuration rejects" packages/runtime/test/runtime-bootstrap.test.mjs
```

Expected: default bootstrap and three validation cases pass; builder cases remain red.

- [ ] **Step 5: Commit**

```powershell
git add packages/runtime/src/configuration.ts packages/runtime/src/workspace-context.ts packages/runtime/src/index.ts
git commit -m "feat: add runtime configuration bootstrap"
```

### Task 3: Compose the KnowledgeRuntime through explicit dependencies

**Files:**

- Create: `packages/runtime/src/knowledge-runtime.ts`
- Create: `packages/runtime/src/runtime-builder.ts`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**

- Consumes: `RuntimeBootstrapRequest`, `ConfigurationBootstrap`, and `WorkspaceContextFactory`.
- Produces: `RuntimeDependencies`, `RuntimeBuilder.build(request): Promise<KnowledgeRuntime>`, `KnowledgeRuntime`, and the bootstrap factories.

- [ ] **Step 1: Implement the immutable facade**

Create `packages/runtime/src/knowledge-runtime.ts`:

```ts
import type { EffectiveBootstrapConfig } from './configuration.js';
import type { WorkspaceContext } from './workspace-context.js';

export class KnowledgeRuntime {
  readonly kind = 'KnowledgeRuntime' as const;

  constructor(
    readonly config: EffectiveBootstrapConfig,
    readonly workspace: WorkspaceContext,
  ) {
    Object.freeze(this);
  }
}
```

- [ ] **Step 2: Implement dependency orchestration**

Create `packages/runtime/src/runtime-builder.ts`:

```ts
import type {
  ConfigurationBootstrap,
  RuntimeBootstrapRequest,
} from './configuration.js';
import { KnowledgeRuntime } from './knowledge-runtime.js';
import type { WorkspaceContextFactory } from './workspace-context.js';

export interface RuntimeDependencies {
  readonly configurationBootstrap: ConfigurationBootstrap;
  readonly workspaceContextFactory: WorkspaceContextFactory;
}

export class RuntimeBuilder {
  constructor(private readonly dependencies: RuntimeDependencies) {}

  async build(request: RuntimeBootstrapRequest): Promise<KnowledgeRuntime> {
    const config = await this.dependencies.configurationBootstrap.load(request);
    const workspace = await this.dependencies.workspaceContextFactory.create(config);
    return new KnowledgeRuntime(config, workspace);
  }
}
```

- [ ] **Step 3: Export the facade and factories**

Extend `packages/runtime/src/index.ts` with:

```ts
import { DefaultConfigurationBootstrap } from './configuration.js';
import { RuntimeBuilder, type RuntimeDependencies } from './runtime-builder.js';
import { DefaultWorkspaceContextFactory } from './workspace-context.js';

export { KnowledgeRuntime } from './knowledge-runtime.js';
export { RuntimeBuilder, type RuntimeDependencies } from './runtime-builder.js';

export function createBootstrapRuntimeDependencies(): RuntimeDependencies {
  return Object.freeze({
    configurationBootstrap: new DefaultConfigurationBootstrap(),
    workspaceContextFactory: new DefaultWorkspaceContextFactory(),
  });
}

export function createBootstrapRuntimeBuilder(): RuntimeBuilder {
  return new RuntimeBuilder(createBootstrapRuntimeDependencies());
}
```

Retain the configuration and workspace exports from Task 2.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
pnpm --filter @codeatlas/runtime build
node --test packages/runtime/test/runtime-bootstrap.test.mjs
pnpm architecture:check
```

Expected: all seven runtime-bootstrap tests pass and the architecture check passes for 17 projects.

- [ ] **Step 5: Commit**

```powershell
git add packages/runtime/src/knowledge-runtime.ts packages/runtime/src/runtime-builder.ts packages/runtime/src/index.ts
git commit -m "feat: compose knowledge runtime"
```

### Task 4: Wire CLI and MCP through the shared runtime builder

**Files:**

- Modify: `apps/cli/package.json`
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/test/smoke.test.mjs`
- Modify: `apps/mcp/package.json`
- Modify: `apps/mcp/src/main.ts`
- Modify: `apps/mcp/test/smoke.test.mjs`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `createBootstrapRuntimeBuilder()` and `KnowledgeRuntime`.
- Produces: `buildCliRuntime(workspaceRoot?)`, `buildMcpRuntime(workspaceRoot?)`, and process entry points that construct before signaling readiness.

- [ ] **Step 1: Declare only allowed runtime dependencies**

Add to both app manifests:

```json
"dependencies": {
  "@codeatlas/runtime": "workspace:*"
}
```

Run `pnpm install`. Confirm the CLI and MCP lockfile importers contain only the workspace link to `@codeatlas/runtime`, and confirm the workspace links are present under each app's dependency resolution.

- [ ] **Step 2: Implement the CLI adapter**

Replace `apps/cli/src/main.ts` with:

```ts
#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  createBootstrapRuntimeBuilder,
  type KnowledgeRuntime,
} from '@codeatlas/runtime';

export async function buildCliRuntime(
  workspaceRoot = process.cwd(),
): Promise<KnowledgeRuntime> {
  return createBootstrapRuntimeBuilder().build({
    configVersion: 1,
    mode: 'ONE_SHOT',
    workspaceRoot,
  });
}

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--smoke') {
    await buildCliRuntime();
    process.stdout.write('codeatlas-cli:ready\n');
    return 0;
  }

  process.stderr.write('codeatlas CLI behavior is not implemented in P0-W0-003\n');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
```

- [ ] **Step 3: Implement the MCP adapter**

Replace `apps/mcp/src/main.ts` with:

```ts
#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  createBootstrapRuntimeBuilder,
  type KnowledgeRuntime,
} from '@codeatlas/runtime';

export async function buildMcpRuntime(
  workspaceRoot = process.cwd(),
): Promise<KnowledgeRuntime> {
  return createBootstrapRuntimeBuilder().build({
    configVersion: 1,
    mode: 'MCP_STDIO',
    workspaceRoot,
  });
}

export async function runMcp(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--smoke') {
    await buildMcpRuntime();
    process.stderr.write('codeatlas-mcp:ready\n');
    return 0;
  }

  process.stderr.write('codeatlas MCP behavior is not implemented in P0-W0-003\n');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runMcp();
}
```

- [ ] **Step 4: Keep process smoke assertions exact**

Update only the unsupported-invocation diagnostics in the existing CLI/MCP smoke tests from `P0-W0-001` to `P0-W0-003`. Preserve the exact CLI stdout marker, the exact MCP stderr marker, and empty MCP stdout.

- [ ] **Step 5: Rebuild and run all task Fixtures**

Run:

```powershell
pnpm build
node --test packages/runtime/test/runtime-bootstrap.test.mjs scripts/test-runtime-construction.mjs apps/cli/test/smoke.test.mjs apps/mcp/test/smoke.test.mjs scripts/test-workspace-structure.mjs
pnpm architecture:check
```

Expected: all targeted tests pass; the shared check proves both adapters return the same `KnowledgeRuntime` class and the architecture gate passes for 17 projects.

- [ ] **Step 6: Commit**

```powershell
git add apps/cli apps/mcp pnpm-lock.yaml
git commit -m "feat: bootstrap runtime from cli and mcp"
```

### Task 5: Synchronize the normative runtime specification

**Files:**

- Modify: `docs/handoff/specs/RUNTIME_CONFIGURATION.md`
- Verify: `docs/handoff/DESIGN_TRACEABILITY.md`
- Verify: `docs/handoff/adr/ADR-001-local-first-runtime.md`

**Interfaces:**

- Consumes: the implemented Phase 0 public bootstrap contract.
- Produces: a normative Phase 0 subsection consistent with implementation and existing traceability.

- [ ] **Step 1: Add the Phase 0 bootstrap subsection**

Add before `## Modes and lifecycle` in `RUNTIME_CONFIGURATION.md`:

```markdown
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
```

- [ ] **Step 2: Verify governance consistency**

Confirm ADR-001 remains unchanged, the existing P0-W0-003 traceability row still maps the shared construction Fixture to Runtime and Configuration, and no Fixture or acceptance mapping changed. Confirm no later-phase implementation was added.

- [ ] **Step 3: Run documentation and architecture checks**

Run:

```powershell
pnpm format:check
pnpm architecture:check
git diff --check
```

Expected: all commands pass.

- [ ] **Step 4: Commit**

```powershell
git add docs/handoff/specs/RUNTIME_CONFIGURATION.md
git commit -m "docs: specify phase 0 runtime bootstrap"
```

### Task 6: Complete local and hosted acceptance evidence

**Files:**

- Modify: `docs/handoff/CURRENT_STATUS.md`
- Verify: `docs/handoff/PHASE_ACCEPTANCE.md`
- Verify: `docs/handoff/DESIGN_TRACEABILITY.md`
- Verify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: all implementation, Fixture, documentation, and gate results.
- Produces: a reproducible P0-W0-003 completion record and the next predecessor-valid Phase 0 task.

- [ ] **Step 1: Run the full local gate**

Run `pnpm verify`.

Expected: Prettier passes; all 16 TypeScript projects build; all prior and new tests pass with zero failures; the architecture check passes for 17 projects; Rust formatting, build, Clippy with denied warnings, and both native smoke tests pass. Record the actual new test count from output rather than estimating it.

- [ ] **Step 2: Audit Deferred scope and dependency direction**

Search changed production files for:

```text
sqlite|database|yaml|\.ekp|provider|plugin|native|llm|embedding|zvec|watch|daemon|http|socket|knowledge
```

Inspect every match in context. Expected: only legitimate `KnowledgeRuntime` naming or documented exclusions; no implementation of a later task. Run `git diff --check` and inspect `git diff --stat`.

- [ ] **Step 3: Record local evidence without prematurely claiming hosted completion**

Update `CURRENT_STATUS.md` with task `P0-W0-003`, implementation revisions, governing specifications, `pnpm verify`, actual test/project counts, the shared construction Fixture, configuration/schema/migration impact, failure short-circuit evidence, Architecture Guardrail and Deferred-scope evidence, design-document reference, unchanged ADR/traceability status, and the next task held pending hosted CI.

Commit:

```powershell
git add docs/handoff/CURRENT_STATUS.md
git commit -m "docs: record runtime bootstrap evidence"
```

- [ ] **Step 4: Push only the feature branch and wait for CI**

Run:

```powershell
git push
$headSha = git rev-parse HEAD
$runs = gh run list --repo tim-zxy/CodeAtlas --branch codex/p0-w0-001-bootstrap --limit 3 --json databaseId,headSha,status,conclusion
$runId = (($runs | ConvertFrom-Json) | Where-Object headSha -eq $headSha | Select-Object -First 1).databaseId
gh run watch $runId --repo tim-zxy/CodeAtlas --exit-status
```

If `$runId` is empty because GitHub has not registered the push yet, repeat the
read-only `gh run list` assignment after the run appears. Expected: TypeScript
and Rust jobs succeed. Do not merge `main`.

- [ ] **Step 5: Close status with hosted evidence**

Update `CURRENT_STATUS.md` to mark P0-W0-003 complete and record the successful run ID, URL, head SHA, date, and job conclusions. Select the next unblocked Phase 0 task from `WORK_BREAKDOWN.md` by predecessor order.

Commit and push:

```powershell
git add docs/handoff/CURRENT_STATUS.md
git commit -m "docs: close runtime bootstrap task"
git push
```

- [ ] **Step 6: Verify the final branch state**

Wait for GitHub Actions on the final status commit. Then run:

```powershell
pnpm verify
git status --porcelain=v1
git rev-parse HEAD
git rev-parse '@{upstream}'
```

Expected: the full local gate passes again, the worktree is clean, local HEAD equals upstream, and the final GitHub Actions run succeeds. Report runner deprecation annotations separately from mandatory Gate results.
