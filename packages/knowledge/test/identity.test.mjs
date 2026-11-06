import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../fixtures/phase1/knowledge-identity/', import.meta.url);
const vectors = JSON.parse(readFileSync(new URL('inputs.json', root))).subjects;
const expected = JSON.parse(readFileSync(new URL('expected.json', root)));
const control = (x = {}) => ({
  maxItems: 100000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...x,
});
const api = () => import('../dist/index.js');
const input = (row = vectors[0]) => ({
  candidate: structuredClone(row.candidate),
  existingItems: [structuredClone(row.existing)],
  policyRef: expected.policyRef,
});
for (const row of vectors)
  test(row.name + ' exact identity survives presentation rewrite', async () => {
    const { resolveKnowledgeIdentity: run } = await api();
    assert.equal(typeof run, 'function');
    const x = input(row),
      before = structuredClone(x);
    const out = run(x, control());
    assert.equal(out.outcome, expected.same);
    assert.equal(out.matchedId, 'knowledge:one');
    assert.equal(out.requiresReview, false);
    assert.equal(out.score, null);
    assert.equal(out.thresholdRef, null);
    assert.equal(out.ambiguityMarginRef, null);
    assert.deepEqual(x, before);
    if ('title' in x.candidate.candidateEnvelope.payload.structuredContent)
      x.candidate.candidateEnvelope.payload.structuredContent.title = '改名 🚀';
    if ('summary' in x.candidate.candidateEnvelope.payload.structuredContent)
      x.candidate.candidateEnvelope.payload.structuredContent.summary = 'Reworded description';
    const changed = run(x, control());
    assert.equal(changed.outcome, expected.same);
    assert.equal(changed.matchedId, out.matchedId);
  });
test('grounding value changes propose UPDATE without opaque ID allocation', async () => {
  const x = input();
  const old = 'b'.repeat(64),
    next = '1'.repeat(64);
  x.candidate = JSON.parse(JSON.stringify(x.candidate).split(old).join(next));
  const out = (await api()).resolveKnowledgeIdentity(x, control());
  assert.equal(out.outcome, expected.changedSemantic);
  assert.equal(out.matchedId, 'knowledge:one');
  assert.equal(out.requiresReview, true);
});
test('BusinessFlow goal is semantic rather than presentation', async () => {
  const x = input(vectors.find((r) => r.name === 'BUSINESS_FLOW'));
  x.candidate.candidateEnvelope.payload.structuredContent.goal = 'Reject an invalid item';
  const out = (await api()).resolveKnowledgeIdentity(x, control());
  assert.equal(out.outcome, 'UPDATE');
  assert.equal(out.matchedId, 'knowledge:one');
});
test('recomputed producer matches independent Python literal fingerprints', async () => {
  const { fingerprintKnowledgeComparison } = await import('../dist/comparison-contract.js');
  for (const row of vectors)
    assert.deepEqual(
      fingerprintKnowledgeComparison(row.candidate, control()),
      expected.fingerprints[row.name],
    );
});
test('unknown old policy and forged stored fingerprints require review', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  for (const change of [
    (x) => (x.existingItems[0].fingerprintPolicyRef = null),
    (x) => (x.existingItems[0].revisionEnvelope.payload.semanticFingerprint = '0'.repeat(64)),
  ]) {
    const x = input();
    change(x);
    const out = run(x, control());
    assert.equal(out.outcome, 'REVIEW_REQUIRED');
    assert.equal(out.matchedId, null);
  }
});
test('same scoped entity in a different revision requires review', async () => {
  const x = input();
  x.candidate = JSON.parse(
    JSON.stringify(x.candidate).split('revision:worktree').join('revision:next'),
  );
  assert.equal(
    (await api()).resolveKnowledgeIdentity(x, control()).outcome,
    expected.changedRevision,
  );
});
test('no existing identity requests NEW; same name in another scope is distinct', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  const x = input();
  x.existingItems = [];
  const out = run(x, control());
  assert.equal(out.outcome, expected.noExisting);
  assert.equal(out.matchedId, null);
  const other = input();
  other.candidate = JSON.parse(JSON.stringify(other.candidate).split('repo:one').join('repo:two'));
  assert.equal(run(other, control()).outcome, 'NEW');
});
test('missing, mixed, unrelated and wrong-snapshot state evidence requires review', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  for (const change of [
    (x) => (x.candidate.stateBinding = null),
    (x) => {
      const c = structuredClone(x.candidate.stateBinding.claims[0]);
      c.payload.id = 'claim:two';
      c.payload.stateIntent = 'TARGET';
      x.candidate.stateBinding.claims.push(c);
    },
    (x) =>
      (x.candidate.stateBinding.claims[0].payload.subject =
        x.candidate.referenceContext.availableEntities.find(
          (r) => r.entity.kind === 'SOURCE_FILE',
        )),
    (x) => (x.candidate.stateBinding.inputSnapshotRef.id = 'snapshot:foreign'),
  ]) {
    const x = input();
    change(x);
    const out = run(x, control());
    assert.equal(out.outcome, 'REVIEW_REQUIRED');
    assert.equal(out.matchedId, null);
  }
});
test('CURRENT and TARGET are separate partitions, never inferred conflicts', async () => {
  const x = input();
  x.candidate.stateBinding.claims[0].payload.stateIntent = 'TARGET';
  const out = (await api()).resolveKnowledgeIdentity(x, control());
  assert.equal(out.outcome, 'NEW');
  assert.notEqual(out.outcome, 'CONFLICT');
});
test('multiple exact identities require review and alternatives are deterministic', async () => {
  const x = input(),
    second = structuredClone(x.existingItems[0]);
  second.itemEnvelope.payload.id = 'knowledge:two';
  second.itemEnvelope.payload.publishedRevisionId = 'knowledge-revision:two';
  second.revisionEnvelope.payload.id = 'knowledge-revision:two';
  second.revisionEnvelope.payload.itemId = 'knowledge:two';
  x.existingItems.push(second);
  const run = (await api()).resolveKnowledgeIdentity,
    out = run(x, control());
  assert.equal(out.outcome, 'REVIEW_REQUIRED');
  assert.equal(out.alternatives.length, 2);
  x.existingItems.reverse();
  assert.deepEqual(run(x, control()), out);
});
test('unapproved numeric policy cannot be smuggled into exact input', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  const x = input();
  x.policyRef = 'unapproved';
  assert.equal(run(x, control()).outcome, 'REVIEW_REQUIRED');
  x.score = 0.95;
  assert.throws(() => run(x, control()));
});
test('foreign published revision and accessor input fail before identity selection', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  assert.equal(typeof run, 'function');
  const x = input();
  x.existingItems[0].revisionEnvelope.payload.itemId = 'knowledge:foreign';
  assert.throws(() => run(x, control()));
  let reads = 0;
  const y = input();
  Object.defineProperty(y.candidate, 'candidateEnvelope', {
    enumerable: true,
    get() {
      reads++;
      return x.candidate.candidateEnvelope;
    },
  });
  assert.throws(() => run(y, control()));
  assert.equal(reads, 0);
});
test('cancel, deadline, depth and item budget cannot yield a matched identity', async () => {
  const run = (await api()).resolveKnowledgeIdentity,
    a = new AbortController();
  a.abort();
  for (const c of [
    control({ signal: a.signal }),
    control({ deadlineEpochMs: 0 }),
    control({ maxItems: 1 }),
    control({ maxDepth: 0 }),
  ]) {
    const out = run(input(), c);
    assert.equal(out.outcome, 'REVIEW_REQUIRED');
    assert.equal(out.matchedId, null);
  }
});

test('cyclic comparison input is invalid data rather than a depth review', async () => {
  const apiRun = (await api()).resolveKnowledgeIdentity;
  const x = input();
  x.candidate.stateBinding.claims.push(x.candidate);
  assert.throws(
    () => apiRun(x, control()),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
});

test('control data validation never invokes a getter or Proxy trap', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  for (const key of ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal']) {
    let reads = 0;
    const c = control(),
      old = c[key];
    Object.defineProperty(c, key, {
      get() {
        reads++;
        return old;
      },
    });
    assert.throws(
      () => run(input(), c),
      (e) => e.code === 'IR_VALIDATION_FAILED',
    );
    assert.equal(reads, 0);
  }
  let traps = 0;
  const c = new Proxy(control(), {
    get() {
      traps++;
      throw Error('trap');
    },
    ownKeys() {
      traps++;
      throw Error('trap');
    },
  });
  assert.throws(
    () => run(input(), c),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
  assert.equal(traps, 0);
});
test('genuine cancellation uses the AbortSignal brand rather than a caller getter', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  let reads = 0;
  const c = control();
  Object.defineProperty(c.signal, 'aborted', {
    get() {
      reads++;
      throw Error('caller getter');
    },
  });
  assert.equal(run(input(), c).outcome, 'UNCHANGED');
  assert.equal(reads, 0);
});

test('historical lifecycle identities require review instead of implicit restoration', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  for (const state of ['SUPERSEDED', 'ARCHIVED', 'DEPRECATED']) {
    const x = input();
    x.existingItems[0].itemEnvelope.payload.lifecycleState = state;
    const out = run(x, control());
    assert.equal(out.outcome, 'REVIEW_REQUIRED');
    assert.equal(out.matchedId, null);
    assert.equal(out.requiresReview, true);
  }
});
test('a deadline crossed after the final state read cannot return NEW', async () => {
  const run = (await api()).resolveKnowledgeIdentity;
  const x = input();
  x.existingItems = [];
  const c = control({ deadlineEpochMs: 50 });
  const original = Date.now;
  let now = 0;
  try {
    Date.now = () => {
      if (new Error().stack.includes('stateOf')) {
        now = 100;
        return 0;
      }
      return now;
    };
    const out = run(x, c);
    assert.equal(out.outcome, 'REVIEW_REQUIRED');
    assert.equal(out.matchedId, null);
    assert(out.reasons.includes('CONTROL_DEADLINE'));
  } finally {
    Date.now = original;
  }
});
