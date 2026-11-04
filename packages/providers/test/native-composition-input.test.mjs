import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCompositionCase, limits } from './fixtures/native-composition-helpers.mjs';
import { readNativeCompositionInputs } from '../dist/native-composition-input.js';
const run = (c) => readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, limits);
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test('strict complete ' + id, async () => {
    const c = await loadCompositionCase(id),
      p = run(c);
    assert.deepEqual(p.snapshot, c.expected.snapshot);
  });
for (const id of [
  'python-partial',
  'syntax-partial',
  'java-partial',
  'mismatched-target',
  'mismatched-snapshot',
  'inventory-omission',
  'unsupported-source',
  'temporal-mismatch',
])
  test('fixed refusal ' + id, async () => {
    const c = await loadCompositionCase(id);
    assert.throws(
      () => run(c),
      (e) => e.code === c.expected.error && e.message === e.code,
    );
  });
test('typed_result_is_revalidated_without_callbacks', async () => {
  let calls = 0;
  const c = await loadCompositionCase('mixed');
  Object.defineProperty(c.metadata, 'java', {
    enumerable: true,
    get() {
      calls++;
      throw Error('secret');
    },
  });
  assert.throws(
    () => run(c),
    (e) => e.code === 'INVALID_INPUT',
  );
  assert.equal(calls, 0);
});
test('java_scope_requires_all_five_legacy_capabilities', async () => {
  const c = await loadCompositionCase('mixed');
  c.metadata.java.request.payload.requestedCapabilities.pop();
  assert.throws(
    () => run(c),
    (e) => e.code === 'UNSUPPORTED_SCOPE',
  );
});
import { reseal } from './fixtures/native-composition-helpers.mjs';
const error = (fn, code = 'INVALID_INPUT') =>
  assert.throws(fn, (e) => e.code === code && e.message === code);
for (const kind of [
  'proxy',
  'cycle',
  'symbol',
  'hidden',
  'sparse',
  'negativezero',
  'unicode',
  'prototype',
  'toJSON',
])
  test('unsafe data ' + kind, async () => {
    const c = await loadCompositionCase('mixed');
    let calls = 0;
    const m = c.metadata;
    if (kind === 'proxy')
      c.metadata = new Proxy(m, {
        ownKeys() {
          calls++;
          throw Error('private');
        },
      });
    if (kind === 'cycle') m.extra = m;
    if (kind === 'symbol') m[Symbol('private')] = 1;
    if (kind === 'hidden') Object.defineProperty(m, 'private', { value: 1 });
    if (kind === 'sparse') delete m.inventory[0];
    if (kind === 'negativezero') m.extra = -0;
    if (kind === 'unicode') m.tool.target = '\ud800';
    if (kind === 'prototype') Object.setPrototypeOf(m, new Date());
    if (kind === 'toJSON')
      m.toJSON = () => {
        calls++;
        return {};
      };
    error(() => run(c));
    assert.equal(calls, 0);
  });
test('byte_views_are_owned_or_rejected', async () => {
  for (const kind of ['shared', 'detached', 'proxy', 'subclass']) {
    const c = await loadCompositionCase('mixed');
    if (kind === 'shared') c.requestBytes = new Uint8Array(new SharedArrayBuffer(1));
    if (kind === 'detached') {
      const v = new Uint8Array(c.requestBytes);
      structuredClone(v, { transfer: [v.buffer] });
      c.requestBytes = v;
    }
    if (kind === 'proxy') c.requestBytes = new Proxy(c.requestBytes, {});
    if (kind === 'subclass') c.requestBytes = new (class extends Uint8Array {})(c.requestBytes);
    error(() => run(c));
  }
  const c = await loadCompositionCase('mixed'),
    p = run(c);
  c.requestBytes.fill(0);
  c.outputBytes.fill(0);
  c.metadata.inventory.length = 0;
  assert.equal(p.metadata.inventory.length, 2);
  assert.notEqual(p.requestBytes[0], 0);
  assert.notEqual(p.outputBytes[0], 0);
});
test('intrinsic byte length ignores shadow getter', async () => {
  const c = await loadCompositionCase('mixed');
  let calls = 0;
  Object.defineProperty(c.requestBytes, 'byteLength', {
    get() {
      calls++;
      return 0;
    },
  });
  run(c);
  assert.equal(calls, 0);
});
for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth'])
  test('exact adjacent ' + key, async () => {
    const c = await loadCompositionCase('mixed');
    let lo = 1,
      hi = key === 'maxDepth' ? 512 : 1000000;
    while (lo < hi) {
      const n = Math.floor((lo + hi) / 2);
      try {
        readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, {
          ...limits,
          [key]: n,
        });
        hi = n;
      } catch (e) {
        assert.equal(e.code, 'RESOURCE_LIMIT_EXCEEDED');
        lo = n + 1;
      }
    }
    readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, {
      ...limits,
      [key]: lo,
    });
    error(
      () =>
        readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, {
          ...limits,
          [key]: lo - 1,
        }),
      'RESOURCE_LIMIT_EXCEEDED',
    );
  });
test('aggregate_budget_is_not_per_component_budget', async () => {
  const c = await loadCompositionCase('mixed'),
    n = c.requestBytes.length + c.outputBytes.length;
  assert.ok(c.requestBytes.length < n && c.outputBytes.length < n);
  error(
    () =>
      readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, {
        ...limits,
        maxSerializedBytes: n,
      }),
    'RESOURCE_LIMIT_EXCEEDED',
  );
});
test('two_valid_children_cannot_omit_declared_source', async () => {
  const c = await loadCompositionCase('inventory-omission');
  error(() => run(c), 'INVALID_CONTEXT');
});
for (const change of [
  (m) => (m.codeSyntax.tool.profile = 'other'),
  (m) => (m.codeSyntax.runtimeVersion = 'other'),
  (m) => (m.codeSyntax.providerVersion = 'other'),
  (m) => (m.java.terminal.payload.revisionFingerprint = 'wrong'),
  (m) => (m.inventory[0].sensitivity = 'PUBLIC'),
  (m) => (m.inventory[0].id = m.inventory[1].id),
  (m) => (m.inventory[0].path = m.inventory[1].path),
  (m) => (m.java = null),
])
  test('same_snapshot_does_not_hide_context_mismatch ' + change.toString(), async () => {
    const c = await loadCompositionCase('mixed');
    change(c.metadata);
    assert.throws(
      () => run(c),
      (e) =>
        ['INVALID_INPUT', 'INVALID_CONTEXT', 'INCOMPLETE_OBSERVATION'].includes(e.code) &&
        e.message === e.code,
    );
  });
test('removed is not a full projection', async () => {
  const c = await loadCompositionCase('mixed'),
    r = JSON.parse(c.requestBytes);
  r.payload.removedSourceFiles.push({
    id: 'gone',
    path: 'gone.py',
    previousContentFingerprint: 'sha256:' + 'a'.repeat(64),
  });
  Object.assign(c, reseal(r, c.outputBytes.toString().trimEnd().split('\n').map(JSON.parse)));
  error(() => run(c), 'UNSUPPORTED_SCOPE');
});
test('Java parsed hard line limit is resource refusal', async () => {
  const c = await loadCompositionCase('mixed');
  c.metadata.java.events.find((e) => e.type === 'NODE').payload.name = 'x'.repeat(1000000);
  error(() => run(c), 'RESOURCE_LIMIT_EXCEEDED');
});
for (const value of [
  null,
  {},
  { ...limits, extra: 1 },
  { ...limits, maxItems: 0 },
  { ...limits, maxDepth: -0 },
  { ...limits, maxDepth: Infinity },
  { ...limits, maxItems: 1.5 },
  { ...limits, maxItems: Number.MAX_SAFE_INTEGER + 1 },
])
  test('explicit limits reject ' + JSON.stringify(value), async () => {
    const c = await loadCompositionCase('mixed');
    error(() => readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, value));
  });
test('limit getter is never invoked', async () => {
  const c = await loadCompositionCase('mixed');
  let calls = 0;
  const l = { ...limits };
  Object.defineProperty(l, 'maxDepth', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  error(() => readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, l));
  assert.equal(calls, 0);
});
for (const field of ['providerVersion', 'runtimeVersion', 'tool', 'startedAt', 'settledAt'])
  test('Java declaration mismatch ' + field, async () => {
    const c = await loadCompositionCase('mixed');
    c.metadata.java[field] =
      field === 'tool'
        ? { target: 'other', profile: 'test' }
        : field.endsWith('At')
          ? '2026-10-24T00:00:00.004Z'
          : 'other';
    error(() => run(c), 'INVALID_CONTEXT');
  });
for (const field of ['providerId', 'repositoryId', 'revisionId', 'providerSnapshotId'])
  test('Java original fact context ' + field, async () => {
    const c = await loadCompositionCase('mixed');
    c.metadata.java.events.find((e) => e.type === 'NODE').payload[field] = 'identity:other';
    assert.throws(
      () => run(c),
      (e) => ['INVALID_INPUT', 'INVALID_CONTEXT'].includes(e.code) && e.message === e.code,
    );
  });
test('parsed result cannot add trusted or retained fields', async () => {
  for (const key of ['authenticated', 'ready', 'retained', 'settled']) {
    const c = await loadCompositionCase('mixed');
    c.metadata[key] = true;
    error(() => run(c));
  }
});
