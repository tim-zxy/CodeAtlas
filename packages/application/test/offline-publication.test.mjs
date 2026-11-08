import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, control, options, account } from './helpers/captured-integration-fixture.mjs';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from '../dist/integration-candidate.js';
import { evaluateCandidateRecord } from '../dist/evaluation-record.js';
import {
  prepareOfflinePublication,
  OfflinePublicationPreparer,
} from '../dist/offline-publication.js';
import {
  offlinePublicationState,
  readOfflinePublicationCommand,
} from '../../ir/dist/offline-publication-contract.js';

const approve = {
  kind: 'TEST_REVIEW_NOT_AUTHORITY',
  review: ({ planDigest }) => ({ decision: 'APPROVED', planDigest }),
};
function sample() {
  const c = control(),
    snapshot = createCompilationInputSnapshot(fixture().raw, c);
  const built = buildCapturedIntegrationCandidate(snapshot, options(), c, account());
  const subject = structuredClone(built.reconciliationSubject),
    candidate = subject.candidateEnvelope;
  // Explicit synthetic state evidence, not inferred from MATCHED or Source.
  subject.stateBinding = {
    inputSnapshotRef: candidate.payload.inputSnapshotRef,
    claims: [
      {
        schema: 'codeatlas.claim',
        version: 1,
        payload: {
          id: 'test-state',
          subject: candidate.payload.structuredContent.participantRefs[0],
          predicate: 'synthetic-test-state',
          value: { kind: 'LITERAL', value: 'owned test' },
          scope: candidate.payload.scope,
          stateIntent: 'CURRENT',
          claimKind: 'OBSERVED',
          evidenceRefs: candidate.payload.supportRefs,
          confidence: { score: 1, method: 'TEST', reasons: ['SYNTHETIC'] },
          authority: 'OBSERVED',
        },
      },
    ],
  };
  const input = {
    workspaceId: 'w',
    runId: 'run',
    subject: { issuerNamespace: 'owned-test', subjectId: 'tester' },
    requestKey: 'request',
    snapshot,
    candidates: [candidate],
    evaluation: evaluateCandidateRecord(
      { evaluationId: 'eval', runId: 'run', snapshot, candidates: [candidate] },
      c,
    ),
    subjects: [subject],
  };
  return { c, input, state: offlinePublicationState('w', [], c) };
}
function reevaluate(f) {
  f.input.evaluation = evaluateCandidateRecord(
    {
      evaluationId: 'eval',
      runId: 'run',
      snapshot: f.input.snapshot,
      candidates: f.input.candidates,
    },
    f.c,
  );
}

test('NEW command uses opaque IDs, actual state and explicit non-authority review', async () => {
  const f = sample(),
    a = await prepareOfflinePublication(f.input, f.state, approve, f.c),
    b = await prepareOfflinePublication(f.input, f.state, approve, f.c);
  const e = a.entries[0];
  assert.equal(e.operation, 'NEW');
  assert.equal(e.expectedHead, null);
  assert.match(e.record.itemEnvelope.payload.id, /^[a-f0-9-]{36}$/);
  assert.notEqual(e.record.itemEnvelope.payload.id, b.entries[0].record.itemEnvelope.payload.id);
  assert.equal(a.requestDigest, b.requestDigest);
  assert.notEqual(a.commandDigest, b.commandDigest);
  assert.equal(a.request.priorStateDigest, f.state.stateDigest);
  assert.equal(a.request.reviewKind, 'TEST_REVIEW_NOT_AUTHORITY');
  assert.equal(a.quality, 'NOT_EVALUABLE');
  assert.equal(a.productionPublication, 'NOT_AUTHORIZED');
  assert.equal(e.record.itemEnvelope.payload.sourceFreshness, 'AFFECTED');
  assert.ok(Object.isFrozen(a.entries[0].record));
});
test('UPDATE retains reconciled item and exact previous head; unchanged is unsupported', async () => {
  const f = sample(),
    first = await prepareOfflinePublication(f.input, f.state, approve, f.c);
  f.state = offlinePublicationState(
    'w',
    first.entries.map((e) => e.record),
    f.c,
  );
  await assert.rejects(() => prepareOfflinePublication(f.input, f.state, approve, f.c));
  f.input.candidates[0].payload.structuredContent.limitations.push('synthetic semantic change');
  reevaluate(f);
  const next = await prepareOfflinePublication(f.input, f.state, approve, f.c),
    e = next.entries[0];
  assert.equal(e.operation, 'UPDATE');
  assert.equal(e.record.itemEnvelope.payload.id, first.entries[0].record.itemEnvelope.payload.id);
  assert.equal(e.expectedHead, first.entries[0].record.revisionEnvelope.payload.id);
  assert.equal(e.record.revisionEnvelope.payload.previousRevisionId, e.expectedHead);
  assert.notEqual(e.record.revisionEnvelope.payload.id, e.expectedHead);
});
test('missing, partial, substituted subjects and unavailable state evidence refuse', async () => {
  for (const change of [
    (f) => {
      f.input.subjects = [];
    },
    (f) => {
      f.input.subjects.push(f.input.subjects[0]);
    },
    (f) => {
      f.input.subjects[0].candidateEnvelope = structuredClone(f.input.candidates[0]);
      f.input.subjects[0].candidateEnvelope.payload.importance = 'other';
    },
    (f) => {
      f.input.subjects[0].stateBinding = null;
    },
  ]) {
    const f = sample();
    change(f);
    await assert.rejects(() => prepareOfflinePublication(f.input, f.state, approve, f.c));
  }
});
test('forged prior state, wrong workspace, evaluation substitution and extra caller PASS refuse', async () => {
  for (const change of [
    (f) => {
      f.state.stateDigest = 'a'.repeat(64);
    },
    (f) => {
      f.state.workspaceId = 'other';
    },
    (f) => {
      f.input.evaluation = { ...f.input.evaluation, runId: 'other' };
    },
    (f) => {
      f.input.status = 'PASS';
    },
  ]) {
    const f = sample();
    change(f);
    await assert.rejects(() => prepareOfflinePublication(f.input, f.state, approve, f.c));
  }
});
test('every NEW and UPDATE needs explicit approved test review for actual plan digest', async () => {
  for (const review of [
    { kind: 'HUMAN', review: approve.review },
    {
      kind: 'TEST_REVIEW_NOT_AUTHORITY',
      review: () => ({ decision: 'APPROVED', planDigest: 'a'.repeat(64) }),
    },
    {
      kind: 'TEST_REVIEW_NOT_AUTHORITY',
      review: ({ planDigest }) => ({ decision: 'REJECTED', planDigest }),
    },
  ]) {
    const f = sample();
    await assert.rejects(() => prepareOfflinePublication(f.input, f.state, review, f.c));
  }
  const f = sample(),
    first = await prepareOfflinePublication(f.input, f.state, approve, f.c);
  f.state = offlinePublicationState(
    'w',
    first.entries.map((e) => e.record),
    f.c,
  );
  f.input.candidates[0].payload.structuredContent.limitations.push('changed');
  reevaluate(f);
  await assert.rejects(() =>
    prepareOfflinePublication(
      f.input,
      f.state,
      {
        kind: 'TEST_REVIEW_NOT_AUTHORITY',
        review: ({ planDigest }) => ({ decision: 'REJECTED', planDigest }),
      },
      f.c,
    ),
  );
});
test('review callback cannot substitute caller data; late cancellation refuses', async () => {
  const f = sample();
  const result = await prepareOfflinePublication(
    f.input,
    f.state,
    {
      kind: 'TEST_REVIEW_NOT_AUTHORITY',
      review: ({ plan, planDigest }) => {
        assert.ok(Object.isFrozen(plan));
        f.input.requestKey = 'mutated';
        return { decision: 'APPROVED', planDigest };
      },
    },
    f.c,
  );
  assert.equal(result.request.requestKey, 'request');
  const abort = new AbortController(),
    g = sample();
  await assert.rejects(() =>
    prepareOfflinePublication(
      g.input,
      g.state,
      {
        kind: 'TEST_REVIEW_NOT_AUTHORITY',
        review: ({ planDigest }) => {
          abort.abort();
          return { decision: 'APPROVED', planDigest };
        },
      },
      { ...g.c, signal: abort.signal },
    ),
  );
  await assert.rejects(() =>
    prepareOfflinePublication(g.input, g.state, approve, { ...g.c, maxItems: 1 }),
  );
});
test('intra-set reference targets refuse instead of rewriting identities', async () => {
  const f = sample();
  f.input.candidates[0].payload.id =
    f.input.candidates[0].payload.structuredContent.participantRefs[0].entity.id;
  reevaluate(f);
  await assert.rejects(() => prepareOfflinePublication(f.input, f.state, approve, f.c));
});

test('preparer retry inspects the committed request before fresh-state reconciliation or review', async () => {
  const f = sample();
  let actualState = f.state,
    stored = null,
    reads = 0,
    reviews = 0,
    lookups = 0;
  const ports = {
    lookup(subject, requestKey, requestDigest) {
      lookups++;
      assert.deepEqual(subject, f.input.subject);
      assert.equal(requestKey, f.input.requestKey);
      if (!stored) return { status: 'ABSENT' };
      assert.equal(requestDigest, stored.requestDigest, 'REQUEST_INPUT_CHANGED');
      return stored.inspection;
    },
    readState() {
      reads++;
      return actualState;
    },
  };
  const preparer = new OfflinePublicationPreparer(ports);
  const reviewer = {
    kind: 'TEST_REVIEW_NOT_AUTHORITY',
    review({ planDigest }) {
      reviews++;
      return { decision: 'APPROVED', planDigest };
    },
  };
  const first = await preparer.prepare(f.input, reviewer, f.c);
  assert.equal(first.status, 'PREPARED');
  assert.deepEqual(
    readOfflinePublicationCommand(preparer.identity, first.handle, f.c),
    first.command,
  );
  assert.throws(() => readOfflinePublicationCommand(preparer.identity, first.command, f.c));
  assert.throws(() => {
    preparer.identity = {};
  });
  assert.equal(preparer.issue, undefined);
  actualState = offlinePublicationState(
    'w',
    first.command.entries.map((e) => e.record),
    f.c,
  );
  stored = {
    requestDigest: first.command.requestDigest,
    inspection: {
      status: 'COMMITTED',
      receipt: {
        itemId: first.command.entries[0].record.itemEnvelope.payload.id,
        revisionId: first.command.entries[0].record.revisionEnvelope.payload.id,
      },
    },
  };
  // Captured methods stay fixed even if the caller later replaces the adapter fields.
  ports.readState = () => {
    throw new Error('MUST_NOT_READ_AFTER_COMMIT');
  };
  const second = await preparer.prepare(structuredClone(f.input), reviewer, f.c);
  assert.deepEqual(second, { status: 'EXISTING', inspection: stored.inspection });
  assert.equal(Object.hasOwn(second, 'handle'), false);
  assert.equal(lookups, 2);
  assert.equal(reads, 1);
  assert.equal(reviews, 1);
  const changed = structuredClone(f.input);
  changed.candidates[0].payload.structuredContent.summary = 'changed logical request';
  changed.subjects[0].candidateEnvelope = changed.candidates[0];
  changed.evaluation = evaluateCandidateRecord(
    {
      evaluationId: 'eval',
      runId: 'run',
      snapshot: changed.snapshot,
      candidates: changed.candidates,
    },
    f.c,
  );
  await assert.rejects(() => preparer.prepare(changed, reviewer, f.c), /REQUEST_INPUT_CHANGED/);
  assert.equal(reads, 1);
  assert.equal(reviews, 1);
});

test('preparer returns every existing outcome without reads, review or new issued handle', async () => {
  for (const status of ['COMMIT_OUTCOME_UNKNOWN', 'NOT_COMMITTED']) {
    const f = sample();
    const preparer = new OfflinePublicationPreparer({
      lookup: () => ({ status }),
      readState: () => {
        throw new Error('MUST_NOT_READ');
      },
    });
    const result = await preparer.prepare(
      f.input,
      {
        kind: 'TEST_REVIEW_NOT_AUTHORITY',
        review: () => {
          throw new Error('MUST_NOT_REVIEW');
        },
      },
      f.c,
    );
    assert.deepEqual(result, { status: 'EXISTING', inspection: { status } });
  }
});
