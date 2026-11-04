import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
let api;
try {
  api = await import('../dist/mixed-execution-config.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const fixture = JSON.parse(
  fs.readFileSync('fixtures/phase1/mixed-runtime-readiness/mixed-execution/cases.json'),
);
const input = () => structuredClone(fixture.configuration);
test('A5 configuration uses independent explicit rows, bytes, events and original caps', () => {
  const c = input(),
    old = structuredClone(c),
    out = api.resolveMixedExecutionConfig(c);
  assert.deepEqual(c, old);
  assert.deepEqual(out, fixture.expectedConfiguration);
  assert.ok(Object.isFrozen(out.native.transportLimits));
});
for (const kind of [
  'missing',
  'disabled',
  'duplicate',
  'version',
  'kind',
  'unknown',
  'missing-field',
  'zero',
  'unsafe',
  'stdin',
  'stdout',
  'hard',
  'events',
  'pattern',
])
  test('A5 configuration rejects ' + kind, () => {
    const c = input(),
      p = c.providers[0];
    if (kind === 'missing') c.providers = [];
    if (kind === 'disabled') p.enabled = false;
    if (kind === 'duplicate') c.providers.push(structuredClone(p));
    if (kind === 'version') p.configurationSchemaVersion = 1;
    if (kind === 'kind') p.configuration.kind = 'LEGACY';
    if (kind === 'unknown') p.configuration.extra = true;
    if (kind === 'missing-field') delete p.configuration.history.maxRows;
    if (kind === 'zero') p.configuration.native.maxEvents = 0;
    if (kind === 'unsafe') p.configuration.history.maxRows = Number.MAX_SAFE_INTEGER + 1;
    if (kind === 'stdin') c.indexing.resourceBudget.maxInputBytes = 1;
    if (kind === 'stdout') c.indexing.resourceBudget.maxOutputBytes = 1;
    if (kind === 'hard')
      p.configuration.native.transportLimits.maxLineBytes = Number.MAX_SAFE_INTEGER;
    if (kind === 'events') p.configuration.native.maxEvents = 1;
    if (kind === 'pattern') p.configuration.source.include = [{}];
    assert.throws(
      () => api.resolveMixedExecutionConfig(c),
      (e) => e.code === 'CONFIG_INVALID',
    );
  });
test('A5 parser does not create public route', async () => {
  assert.equal((await import('../dist/index.js')).resolveMixedExecutionConfig, undefined);
});
