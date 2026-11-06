import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rows = JSON.parse(
  readFileSync(new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url)),
).subjects;
const control = () => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
});
const make = () => ({
  subjects: [structuredClone(rows[0].candidate)],
  existingItems: [structuredClone(rows[0].existing)],
  policyRef: 'knowledge-exact-reference-v1',
  intents: [],
  disappearedItemIds: [],
  control: control(),
});
const api = () => import('../dist/index.js');
test('reconciliation emits bound plans, never writes or allocates identities', async () => {
  const run = (await api()).reconcileKnowledge;
  assert.equal(typeof run, 'function');
  const x = make();
  const out = run(x);
  assert.equal(out.actions.length, 1);
  assert.equal(out.actions[0].operation, 'UNCHANGED');
  assert.equal(out.actions[0].retainedItemId, 'knowledge:one');
  assert.equal(out.actions[0].revisionIntent, 'NONE');
  assert.equal(out.applicability.advancedDrift, 'DEFERRED');
  x.existingItems = [];
  const fresh = run(x);
  assert.equal(fresh.actions[0].operation, 'NEW');
  assert.equal(fresh.actions[0].retainedItemId, null);
  assert.equal(fresh.actions[0].revisionIntent, 'NEW_ITEM');
  assert.equal(fresh.actions[0].requiresReview, true);
});
test('split and evidence-insufficient merge are review-only requests', async () => {
  const run = (await api()).reconcileKnowledge;
  for (const kind of ['SPLIT', 'MERGE']) {
    const x = make();
    x.intents = [{ kind, candidateIds: ['candidate:one'], existingItemIds: ['knowledge:one'] }];
    const out = run(x);
    assert.equal(out.actions.length, 1);
    const a = out.actions[0];
    assert.equal(a.operation, kind);
    assert.equal(a.requiresReview, true);
    assert.equal(a.retainedItemId, null);
    assert.equal(a.revisionIntent, 'NONE');
    assert.deepEqual(a.supersededItemIds, []);
  }
});
test('disappearance affects support without automatic deprecation', async () => {
  const x = make();
  x.subjects = [];
  x.disappearedItemIds = ['knowledge:one'];
  const out = (await api()).reconcileKnowledge(x);
  assert.equal(out.actions[0].supportHealthIntent, 'AFFECTED');
  assert.notEqual(out.actions[0].operation, 'DEPRECATE');
  assert.equal(out.actions[0].requiresReview, true);
});
test('CURRENT/TARGET requests cannot manufacture conflict without time/value proof', async () => {
  const x = make();
  x.subjects[0].stateBinding.claims[0].payload.stateIntent = 'TARGET';
  x.intents = [
    { kind: 'CONFLICT', candidateIds: ['candidate:one'], existingItemIds: ['knowledge:one'] },
  ];
  const out = (await api()).reconcileKnowledge(x);
  assert.equal(out.actions[0].operation, 'REVIEW_REQUIRED');
  assert.equal(out.actions[0].requiresReview, true);
});
test('duplicate, foreign and contradictory requests cannot publish a plan', async () => {
  const run = (await api()).reconcileKnowledge;
  assert.equal(typeof run, 'function');
  for (const change of [
    (x) => x.subjects.push(structuredClone(x.subjects[0])),
    (x) => x.disappearedItemIds.push('knowledge:foreign'),
    (x) =>
      x.intents.push({
        kind: 'SPLIT',
        candidateIds: ['candidate:foreign'],
        existingItemIds: ['knowledge:one'],
      }),
    (x) => {
      x.disappearedItemIds = ['knowledge:one'];
      x.intents = [
        { kind: 'MERGE', candidateIds: ['candidate:one'], existingItemIds: ['knowledge:one'] },
      ];
    },
  ]) {
    const x = make();
    change(x);
    assert.throws(() => run(x));
  }
});
test('whole-plan cooperative control returns no partial executable actions', async () => {
  const x = make();
  x.control.maxItems = 1;
  const out = (await api()).reconcileKnowledge(x);
  assert.equal(out.reviewRequired, true);
  assert.deepEqual(out.actions, []);
  assert(out.diagnostics.length);
});

test('plan input rejects an own __proto__ key and symbol keys', async () => {
  const run = (await api()).reconcileKnowledge;
  for (const key of ['__proto__', Symbol('foreign')]) {
    const x = make();
    Object.defineProperty(x, key, { value: null, enumerable: true });
    assert.throws(
      () => run(x),
      (e) => e.code === 'IR_VALIDATION_FAILED',
    );
  }
});

test('unapproved plan policy cannot produce intent actions', async () => {
  const x = make();
  x.policyRef = 'foreign-policy';
  x.intents = [
    { kind: 'MERGE', candidateIds: ['candidate:one'], existingItemIds: ['knowledge:one'] },
  ];
  const out = (await api()).reconcileKnowledge(x);
  assert.deepEqual(out.actions, []);
  assert(out.diagnostics.includes('POLICY_NOT_APPROVED'));
  assert.equal(out.reviewRequired, true);
});
test('multi-candidate review intent preserves every candidate binding', async () => {
  const x = make(),
    second = structuredClone(x.subjects[0]);
  second.candidateEnvelope.payload.id = 'candidate:two';
  x.subjects.push(second);
  x.intents = [
    {
      kind: 'SPLIT',
      candidateIds: ['candidate:two', 'candidate:one'],
      existingItemIds: ['knowledge:one'],
    },
  ];
  const out = (await api()).reconcileKnowledge(x);
  assert.deepEqual(out.actions[0].candidateIds, ['candidate:one', 'candidate:two']);
  assert.equal(out.actions[0].requiresReview, true);
});

test('whole-plan control getter refuses without executing caller code', async () => {
  const apiRun = (await api()).reconcileKnowledge;
  const x = make();
  let reads = 0;
  Object.defineProperty(x.control, 'maxItems', {
    get() {
      reads++;
      return 1000000;
    },
  });
  assert.throws(
    () => apiRun(x),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
  assert.equal(reads, 0);
});
test('ambiguous review plan retains every compared existing revision without a survivor', async () => {
  const x = make(),
    second = structuredClone(x.existingItems[0]);
  second.itemEnvelope.payload.id = 'knowledge:two';
  second.itemEnvelope.payload.publishedRevisionId = 'knowledge-revision:two';
  second.revisionEnvelope.payload.id = 'knowledge-revision:two';
  second.revisionEnvelope.payload.itemId = 'knowledge:two';
  x.existingItems.push(second);
  const run = (await api()).reconcileKnowledge,
    out = run(x),
    a = out.actions[0];
  assert.equal(a.operation, 'REVIEW_REQUIRED');
  assert.equal(a.retainedItemId, null);
  assert.deepEqual(a.existingItemIds, ['knowledge:one', 'knowledge:two']);
  assert.deepEqual(a.existingRevisionRefs, [
    { itemId: 'knowledge:one', revisionId: 'knowledge-revision:one' },
    { itemId: 'knowledge:two', revisionId: 'knowledge-revision:two' },
  ]);
  x.existingItems.reverse();
  assert.deepEqual(run(x), out);
});

test('plan binds the exact supplied content without granting capture authority', async () => {
  const run = (await api()).reconcileKnowledge,
    x = make(),
    first = run(x);
  assert.match(first.inputDigest, /^[a-f0-9]{64}$/);
  x.subjects[0].candidateEnvelope.payload.structuredContent.summary = 'Reworded presentation';
  const changed = run(x);
  assert.equal(changed.actions[0].operation, 'UNCHANGED');
  assert.notEqual(changed.inputDigest, first.inputDigest);
});
