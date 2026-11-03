import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareHistoryTransition,
  historyDraftDigest,
  HistoryTransitionError,
} from '../dist/history-transition-input.js';
import {
  cases,
  loadHistoryCase,
  limits,
  assertDeepFrozen,
} from './fixtures/history-transition-helpers.mjs';
const valid = () => loadHistoryCase('H02-present').input;
const rejects = (f, code) =>
  assert.throws(
    f,
    (e) => e instanceof HistoryTransitionError && e.code === code && e.message === code,
  );
for (const c of cases.filter((c) =>
  ['H01', 'H02', 'H03', 'H04', 'H14', 'H16', 'H17'].includes(c.family),
))
  test('owned input ' + c.id, () => {
    const { input, expected } = loadHistoryCase(c.id);
    if (expected.error) rejects(() => prepareHistoryTransition(input, limits), expected.error);
    else {
      const p = prepareHistoryTransition(input, limits);
      assert.deepEqual(p.packet, input);
      assert.notStrictEqual(p.packet, input);
      assertDeepFrozen(assert, p.packet);
      input.target.source.contentFingerprint = 'mutation';
      assert.notEqual(p.packet.target.source.contentFingerprint, 'mutation');
    }
  });
test('H03 winner and original candidate are different records', () => {
  const p = valid();
  assert.notDeepEqual(p.history.state.supports[0].canonical, p.history.state.nodes[0]);
});
test('H04 changed confidence state is valid by itself but not as current', () => {
  const p = loadHistoryCase('H04-confidence').input;
  const self = structuredClone(p);
  self.history.state = structuredClone(self.current);
  assert.doesNotThrow(() => prepareHistoryTransition(self, limits));
  rejects(() => prepareHistoryTransition(p, limits), 'HISTORY_CHANGED');
});
test('H17 rejects callbacks, proxies, nonplain values and cycles without calling code', () => {
  let calls = 0;
  for (const change of [
    (p) =>
      Object.defineProperty(p, 'observation', {
        get() {
          calls++;
          return null;
        },
        enumerable: true,
      }),
    (p) => {
      p.observation = new Proxy(
        {},
        {
          ownKeys() {
            calls++;
            return [];
          },
        },
      );
    },
    (p) => {
      p.observation = {
        toJSON() {
          calls++;
          return null;
        },
      };
    },
    (p) => {
      p.observation = new Date();
    },
    (p) => {
      p.observation = p;
    },
  ]) {
    const p = valid();
    change(p);
    rejects(() => prepareHistoryTransition(p, limits), 'INVALID_HISTORY');
  }
  assert.equal(calls, 0);
});
test('H17 unsafe limit objects are rejected without getters or coercion', () => {
  let calls = 0;
  const l = { ...limits };
  Object.defineProperty(l, 'maxItems', {
    get() {
      calls++;
      return 1;
    },
    enumerable: true,
  });
  rejects(() => prepareHistoryTransition(valid(), l), 'INVALID_HISTORY');
  assert.equal(calls, 0);
});
test('H18 limit schema has no defaults, overflow, fractions or extra options', () => {
  for (const l of [
    null,
    {},
    { ...limits, maxDepth: 0 },
    { ...limits, maxItems: 1.5 },
    { ...limits, maxItems: Infinity },
    { ...limits, maxItems: Number.MAX_SAFE_INTEGER + 1 },
    { ...limits, other: 1 },
  ])
    rejects(() => prepareHistoryTransition(valid(), l), 'INVALID_HISTORY');
});
test('H18 cumulative input/validation bytes and items have exact boundaries', () => {
  const p = valid(),
    b = prepareHistoryTransition(p, limits).budget;
  assert.ok(b.serializedBytes > Buffer.byteLength(JSON.stringify(p)));
  for (const key of ['maxSerializedBytes', 'maxItems']) {
    const n = key === 'maxItems' ? b.items : b.serializedBytes;
    assert.doesNotThrow(() => prepareHistoryTransition(p, { ...limits, [key]: n }));
    rejects(
      () => prepareHistoryTransition(p, { ...limits, [key]: n - 1 }),
      'RESOURCE_LIMIT_EXCEEDED',
    );
  }
  rejects(() => prepareHistoryTransition(p, { ...limits, maxDepth: 1 }), 'RESOURCE_LIMIT_EXCEEDED');
});
test('H18 draft digest sorts object keys and preserves array order', () => {
  const a = historyDraftDigest({ z: '雪', a: ['😀', 1] }, limits, { items: 0, serializedBytes: 0 });
  assert.equal(
    a,
    historyDraftDigest({ a: ['😀', 1], z: '雪' }, limits, { items: 0, serializedBytes: 0 }),
  );
  assert.notEqual(
    a,
    historyDraftDigest({ a: [1, '😀'], z: '雪' }, limits, { items: 0, serializedBytes: 0 }),
  );
  assert.equal(a, '33253f5d5caa1588b578357c4510bbf67d26611e0631d60ac57ef478ff802934');
});

test('H02 Native Python dependencies cannot silently span multiple file units', () => {
  const p = valid();
  for (const state of [p.history.state, p.current])
    state.supports.find(
      (s) =>
        s.binding.providerFact.providerId === 'native' &&
        s.binding.providerFact.providerFactId === 'opaque:a',
    ).dependencyUnitIds = ['py:a', 'py:b'];
  rejects(() => prepareHistoryTransition(p, limits), 'INVALID_HISTORY');
});
test('H18 ordinal encoding includes numeric keys and does not recurse on deep JSON', () => {
  const counter = () => ({ items: 0, serializedBytes: 0 });
  assert.equal(
    historyDraftDigest({ 2: 'b', 10: 'a' }, limits, counter()),
    'a76f9931f09e47db676e50eebb06409ca3288449353bcd0eed02e168f7c6caf2',
  );
});
test('H18 permitted deep JSON uses iterative encoding', () => {
  const counter = () => ({ items: 0, serializedBytes: 0 });
  let deep = null;
  for (let i = 0; i < 8000; i++) deep = { x: deep };
  assert.equal(
    historyDraftDigest(deep, limits, counter()),
    'e614d5f99e765010ae7119dea50dd5dcda4534449a0699cfd6b6ca6421877da3',
  );
});
