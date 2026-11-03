import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planHistoryTransition,
  prepareHistoryTransitionDraft,
} from '../dist/history-transition.js';
import { HistoryTransitionError } from '../dist/history-transition-input.js';
import {
  cases as oldCases,
  loadHistoryCase,
  assertDeepFrozen,
} from './fixtures/history-transition-helpers.mjs';
import { loadDeltaCase, limits, legacyBudgets } from './fixtures/delta-support-helpers.mjs';
for (const c of oldCases)
  test('pipeline old literal ' + c.id, () => {
    const { input, expected } = loadHistoryCase(c.id);
    if (expected.error) {
      for (const fn of [planHistoryTransition, prepareHistoryTransitionDraft])
        assert.throws(
          () => fn(input, limits),
          (e) =>
            e instanceof HistoryTransitionError &&
            e.code === expected.error &&
            e.message === expected.error,
        );
    } else {
      const result = prepareHistoryTransitionDraft(input, limits);
      assert.deepEqual(result.transition, expected);
      assert.deepEqual(planHistoryTransition(input, limits), expected);
      assert.deepEqual(Object.keys(result).sort(), ['budget', 'limits', 'packet', 'transition']);
      assert.deepEqual(result.packet, input);
      assert.notStrictEqual(result.packet, input);
      assertDeepFrozen(assert, result.packet);
      assertDeepFrozen(assert, result.limits);
      assertDeepFrozen(assert, result.transition);
    }
  });
for (const c of legacyBudgets)
  test('exact pre-refactor budget ' + c.id, () => {
    const { input, expected } = loadHistoryCase(c.id),
      r = prepareHistoryTransitionDraft(input, limits);
    assert.equal(r.budget.serializedBytes, c.boundary.maxSerializedBytes);
    assert.equal(r.budget.items, c.boundary.maxItems);
    for (const key of ['maxSerializedBytes', 'maxItems']) {
      for (const fn of [planHistoryTransition, prepareHistoryTransitionDraft]) {
        const n = c.boundary[key];
        const v = fn(input, { ...limits, [key]: n });
        assert.deepEqual(fn === planHistoryTransition ? v : v.transition, expected);
        assert.throws(
          () => fn(input, { ...limits, [key]: n - 1 }),
          (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        );
      }
    }
  });
test('D08 hidden original reference declaration stays compatible with old public', () => {
  const p = loadDeltaCase('D08-hidden-unresolved').input;
  assert.doesNotThrow(() => planHistoryTransition(p, limits));
  assert.deepEqual(
    prepareHistoryTransitionDraft(p, limits).transition,
    planHistoryTransition(p, limits),
  );
});
test('owned pipeline counters are per call, not an authority or reusable allowance', () => {
  const p = loadDeltaCase('D01-no-op').input,
    r = prepareHistoryTransitionDraft(p, limits),
    original = structuredClone(r.packet);
  r.budget.items = 0;
  r.budget.serializedBytes = 0;
  p.history.state.snapshots[0].runtimeVersion = 'mutated';
  assert.deepEqual(r.packet, original);
  assert.equal(Object.hasOwn(r, 'authenticated'), false);
  assert.equal(Object.hasOwn(r, 'ready'), false);
  assert.deepEqual(planHistoryTransition(original, limits), r.transition);
  assert.throws(
    () => prepareHistoryTransitionDraft(r, limits),
    (e) => e.code === 'INVALID_HISTORY',
  );
});
test('unknown wrapper boundary never calls getters or proxy traps', () => {
  let calls = 0;
  const p = loadDeltaCase('D01-no-op').input;
  Object.defineProperty(p, 'history', {
    enumerable: true,
    get() {
      calls++;
      return null;
    },
  });
  assert.throws(
    () => prepareHistoryTransitionDraft(p, limits),
    (e) => e.code === 'INVALID_HISTORY',
  );
  assert.equal(calls, 0);
});
