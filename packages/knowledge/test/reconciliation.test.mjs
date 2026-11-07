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

function batch(count, sourceRows = Array(count).fill(rows[0])) {
  const x = make();
  x.subjects = sourceRows.map((row, i) => {
    const candidate = structuredClone(row.candidate);
    candidate.candidateEnvelope.payload.id = `candidate:bulk:${i}`;
    return candidate;
  });
  x.existingItems = sourceRows.map((row, i) => {
    const existing = structuredClone(row.existing);
    existing.itemEnvelope.payload.id = `knowledge:bulk:${i}`;
    existing.revisionEnvelope.payload.itemId = existing.itemEnvelope.payload.id;
    existing.revisionEnvelope.payload.id = `revision:bulk:${i}`;
    existing.itemEnvelope.payload.publishedRevisionId = existing.revisionEnvelope.payload.id;
    return existing;
  });
  return x;
}

test('bounded batch reuses validated inputs while preserving every ambiguity/review action', async () => {
  const run = (await api()).reconcileKnowledge;
  const x = batch(8),
    reference = run(x);
  assert.equal(reference.actions.length, 8);
  for (const action of reference.actions) {
    assert.equal(action.operation, 'REVIEW_REQUIRED');
    assert.equal(action.requiresReview, true);
    assert.equal(action.retainedItemId, null);
    assert.equal(action.existingItemIds.length, 8);
    assert.deepEqual(action.reasons, ['AMBIGUOUS_EXACT_IDENTITIES']);
  }
  x.control = { ...control(), maxItems: 200000 };
  assert.deepEqual(run(x), reference);
  x.control = { ...control(), maxItems: 1 };
  assert.deepEqual(run(x).actions, []);
  assert.deepEqual(run(x).diagnostics, ['CONTROL_BUDGET']);
});

test('one reconciliation batch preserves exact identities across all five approved types', async () => {
  const input = batch(rows.length, rows);
  const result = (await api()).reconcileKnowledge(input);
  assert.equal(result.actions.length, 5);
  for (let i = 0; i < 5; i++) {
    const action = result.actions.find((value) => value.candidateId === `candidate:bulk:${i}`);
    assert.equal(action.operation, 'UNCHANGED');
    assert.equal(action.retainedItemId, `knowledge:bulk:${i}`);
    assert.equal(action.revisionIntent, 'NONE');
  }
});
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

test('ordered arrays inside Claim literal JSON remain distinct even under reference-like keys', async () => {
  const run = (await api()).reconcileKnowledge;
  for (const key of ['steps', 'participants', 'repositoryIds']) {
    const x = make();
    x.subjects[0].stateBinding.claims[0].payload.value = {
      kind: 'LITERAL',
      value: { [key]: ['first', 'second'] },
    };
    const before = run(x);
    x.subjects[0].stateBinding.claims[0].payload.value.value[key].reverse();
    const after = run(x);
    assert.notEqual(after.inputDigest, before.inputDigest, key);
  }
});

test('whole-plan data budget includes literal object key work', async () => {
  const x = make();
  x.control.maxItems = 100000;
  x.subjects[0].stateBinding.claims[0].payload.value = {
    kind: 'LITERAL',
    value: { ['x'.repeat(100001)]: null },
  };
  const out = (await api()).reconcileKnowledge(x);
  assert.deepEqual(out.actions, []);
  assert(out.diagnostics.includes('CONTROL_BUDGET'));
});
test('oversized arrays refuse before bulk descriptor materialization', async () => {
  const { KnowledgeBudget } = await import('../dist/comparison-contract.js');
  const values = Array(1001).fill(null);
  const c = control();
  c.maxItems = 10;
  const original = Object.getOwnPropertyDescriptors;
  let bulkReads = 0;
  try {
    Object.getOwnPropertyDescriptors = (value) => {
      if (value === values) bulkReads++;
      return original(value);
    };
    assert.throws(() => new KnowledgeBudget(c).data(values), /CONTROL_BUDGET/);
    assert.equal(bulkReads, 0);
  } finally {
    Object.getOwnPropertyDescriptors = original;
  }
});
