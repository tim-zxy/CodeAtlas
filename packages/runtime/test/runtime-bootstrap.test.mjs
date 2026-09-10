import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
const {
  DefaultConfigurationBootstrap,
  DefaultWorkspaceContextFactory,
  KnowledgeRuntime,
  RuntimeBuilder,
  createBootstrapRuntimeDependencies,
} = await import('../dist/index.js');
const request = { configVersion: 1, mode: 'ONE_SHOT', workspaceRoot: '.' };
test('default bootstrap dependency collection is publicly frozen', () => {
  assert.equal(Object.isFrozen(createBootstrapRuntimeDependencies()), true);
});
test('RuntimeBuilder composes configuration before workspace context', async () => {
  const calls = [];
  const config = Object.freeze({
    configVersion: 1,
    mode: 'ONE_SHOT',
    workspaceRoot: path.resolve('.'),
  });
  const workspace = Object.freeze({
    kind: 'WORKSPACE_CONTEXT_PLACEHOLDER',
    workspaceRoot: path.resolve('.'),
  });
  const runtime = await new RuntimeBuilder({
    configurationBootstrap: {
      async load(r) {
        calls.push(['configuration', r]);
        return config;
      },
    },
    workspaceContextFactory: {
      async create(c) {
        calls.push(['workspace', c]);
        return workspace;
      },
    },
  }).build(request);
  assert.ok(runtime instanceof KnowledgeRuntime);
  assert.deepEqual(calls, [
    ['configuration', request],
    ['workspace', config],
  ]);
  assert.equal(runtime.config, config);
  assert.equal(runtime.workspace, workspace);
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
  [
    'workspace root',
    { ...request, workspaceRoot: '   ' },
    'INVALID_WORKSPACE_ROOT: expected a non-empty path',
  ],
])
  test('configuration rejects invalid ' + name, async () =>
    assert.rejects(
      new DefaultConfigurationBootstrap().load(invalid),
      (e) => e instanceof Error && e.message === message,
    ),
  );
test('configuration failure prevents workspace construction', async () => {
  let called = false;
  const b = new RuntimeBuilder({
    configurationBootstrap: {
      async load() {
        throw new Error('configuration failed');
      },
    },
    workspaceContextFactory: {
      async create() {
        called = true;
      },
    },
  });
  await assert.rejects(b.build(request), /configuration failed/);
  assert.equal(called, false);
});
test('workspace failure exposes no partial runtime', async () => {
  const b = new RuntimeBuilder({
    configurationBootstrap: new DefaultConfigurationBootstrap(),
    workspaceContextFactory: {
      async create() {
        throw new Error('workspace failed');
      },
    },
  });
  await assert.rejects(b.build(request), /workspace failed/);
});
