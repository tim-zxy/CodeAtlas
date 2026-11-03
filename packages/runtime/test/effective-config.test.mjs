import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import * as runtime from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/security-config/', import.meta.url);
const defaults = JSON.parse(await readFile(new URL('inputs/defaults.json', root), 'utf8'));
const fresh = () => ({ defaults: structuredClone(defaults), maxInputBytes: 65536 });
function load(input = fresh()) {
  assert.equal(typeof runtime.loadEffectiveConfig, 'function', 'Missing EffectiveConfig loader');
  return runtime.loadEffectiveConfig(input);
}
function bad(change) {
  const x = fresh();
  change(x);
  assert.throws(
    () => load(x),
    (e) => e.code === 'CONFIG_INVALID' && !e.message.includes('NEVER_ECHO'),
  );
}
test('defaults validated and immutable without mutating sources', () => {
  const x = fresh();
  const c = load(x);
  assert.equal(c.runtime.workspaceRoot, path.resolve('/fixture/workspace'));
  assert.equal(c.security.localOnly, true);
  assert.equal(c.embedding.enabled, false);
  assert.throws(() => (c.security.localOnly = false), TypeError);
  assert.throws(() => c.providers.push({}), TypeError);
  assert.deepEqual(x.defaults, defaults);
});
test('repository-overrides-workspace-over-global', () => {
  const x = fresh();
  x.global = 'configVersion: 1\nindexing:\n  nativeAnalyzer:\n    parseWorkers: 2\n';
  x.workspace = 'configVersion: 1\nindexing:\n  nativeAnalyzer:\n    parseWorkers: 3\n';
  x.repository = 'configVersion: 1\nindexing:\n  nativeAnalyzer:\n    parseWorkers: 4\n';
  assert.equal(load(x).indexing.nativeAnalyzer.parseWorkers, 4);
});
test('explicit false is not replaced by lower precedence true', () => {
  const x = fresh();
  x.defaults.security.allowSensitiveRemote = true;
  x.workspace = 'configVersion: 1\nsecurity:\n  allowSensitiveRemote: false\n';
  assert.equal(load(x).security.allowSensitiveRemote, false);
});
test('unknown-key-warns-without-value', () => {
  const x = fresh();
  x.workspace = 'configVersion: 1\nllm:\n  futureSetting: NEVER_ECHO\n';
  const c = load(x);
  assert.deepEqual(c.warnings, [{ code: 'UNKNOWN_CONFIG_KEY', path: ['llm'] }]);
  assert.ok(!JSON.stringify(c).includes('NEVER_ECHO'));
});
test('every YAML source needs supported config version', () => {
  bad((x) => (x.global = 'security:\n  localOnly: true\n'));
  bad((x) => (x.repository = 'configVersion: 2\n'));
});
test('duplicate keys aliases tags and multiple documents rejected', () => {
  for (const yaml of [
    'configVersion: 1\nconfigVersion: 1\n',
    'configVersion: 1\na: &x [1]\nb: *x\n',
    'configVersion: 1\nx: !custom value\n',
    'configVersion: 1\n---\nconfigVersion: 1\n',
    '%YAML 1.1\n---\nconfigVersion: 1\n',
  ])
    bad((x) => (x.workspace = yaml));
});
test('raw inline credential forbidden but ENV reference retained', () => {
  bad((x) => (x.workspace = 'configVersion: 1\nllm:\n  apiKey: NEVER_ECHO\n'));
  const x = fresh();
  x.workspace =
    'configVersion: 1\nllm:\n  credentialRef:\n    kind: ENVIRONMENT\n    name: MODEL_API_KEY\n';
  assert.deepEqual(load(x).llm.credentialRef, { kind: 'ENVIRONMENT', name: 'MODEL_API_KEY' });
});
test('missing necessary resource bounds not guessed', () => {
  bad((x) => delete x.defaults.indexing.resourceBudget.maxMemoryBytes);
  bad((x) => (x.defaults.indexing.resourceBudget.maxDepth = 0));
});
test('string booleans unsupported mode and worker counts refused', () => {
  bad((x) => (x.workspace = 'configVersion: 1\nsecurity:\n  localOnly: \"false\"\n'));
  bad((x) => (x.defaults.runtime.mode = 'DAEMON'));
  bad((x) => (x.defaults.indexing.nativeAnalyzer.parseWorkers = 0));
});
test('input byte budget applies before YAML parsing', () =>
  bad((x) => {
    x.maxInputBytes = 1;
    x.workspace = 'configVersion: 1\n';
  }));
test('disabled deferred embedding and degraded generation remain disabled', () => {
  bad((x) => (x.defaults.embedding.enabled = true));
  bad((x) => (x.defaults.knowledge.degradedCandidates = true));
});
test('remote model cannot be enabled by endpoint alone', () =>
  bad((x) => {
    x.defaults.llm.enabled = true;
    x.defaults.llm.endpoint = 'https://models.example/v1';
    x.defaults.llm.resourceBudget = {
      maxInputTokens: 32,
      maxOutputTokens: 16,
      maxInvocations: 1,
      maxDurationMs: 1000,
    };
  }));
test('URL credentials and non-HTTP schemes refused', () => {
  bad((x) => (x.defaults.llm.endpoint = 'https://user:NEVER_ECHO@host.invalid/v1'));
  bad((x) => (x.defaults.llm.endpoint = 'file:///private/key'));
});
test('hostile input accessors and prototype injection have no side effect', () => {
  const x = fresh();
  let called = false;
  Object.defineProperty(x.defaults, 'unsafe', {
    enumerable: true,
    get() {
      called = true;
      throw Error('secret');
    },
  });
  assert.throws(
    () => load(x),
    (e) => e.code === 'CONFIG_INVALID',
  );
  assert.equal(called, false);
  const y = fresh();
  y.workspace = 'configVersion: 1\n__proto__:\n  polluted: true\n';
  const c = load(y);
  assert.equal({}.polluted, undefined);
  assert.equal(c.security.localOnly, true);
});
test('full config drives explicit existing bootstrap composition', async () => {
  assert.equal(
    typeof runtime.buildConfiguredRuntime,
    'function',
    'Missing configured runtime composition',
  );
  const result = await runtime.buildConfiguredRuntime(
    fresh(),
    runtime.createBootstrapRuntimeBuilder(),
  );
  assert.equal(result.runtime.config.mode, 'ONE_SHOT');
  assert.equal(result.runtime.config.workspaceRoot, result.effectiveConfig.runtime.workspaceRoot);
  assert.equal(result.runtime.workspace.kind, 'WORKSPACE_CONTEXT_PLACEHOLDER');
});
