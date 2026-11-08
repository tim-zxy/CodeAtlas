import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from '../dist/integration-candidate.js';
import {
  fixture,
  account,
  control,
  options,
  wr,
  rr,
  hash,
  canonical,
} from './helpers/captured-integration-fixture.mjs';
const build = (snapshot, opts = options(), c = control(), a = account()) =>
  buildCapturedIntegrationCandidate(snapshot, opts, c, a);
test('explicit frozen bindings generate a literal Integration candidate without identity or publication', () => {
  const f = fixture(),
    snapshot = createCompilationInputSnapshot(f.raw, control()),
    out = build(snapshot),
    p = out.candidate.payload;
  assert.deepEqual(p.structuredContent, {
    kind: 'INTEGRATION',
    title: 'Contract match m',
    summary: 'Matched contract c -> p',
    participantRefs: [wr('SERVICE', 's1'), wr('SERVICE', 's2')],
    contractMatchRefs: [wr('CONTRACT_MATCH', 'm')],
    boundaryRefs: [rr('CONTRACT', 'c'), rr('CONTRACT', 'p')],
    limitations: [],
  });
  assert.equal(p.id, 'draft');
  assert.equal(p.publicationState, 'CANDIDATE');
  assert.deepEqual(p.supportRefs, [f.support]);
  assert.equal(out.capturedInputDigest, snapshot.inputDigest);
  assert.equal(out.authorization, 'NOT_ESTABLISHED');
  assert.equal(out.quality, 'NOT_EVALUABLE');
  assert.equal(out.publication, 'NOT_ATTEMPTED');
  assert.ok(Object.isFrozen(p.structuredContent));
});
test('legacy capture remains parseable but missing bindings refuse Integration generation', () => {
  const f = fixture();
  delete f.raw.workspaceCapture.contractBindings;
  const snapshot = createCompilationInputSnapshot(f.raw, control());
  assert.throws(() => build(snapshot), { code: 'INTEGRATION_BINDINGS_UNAVAILABLE' });
});
test('binding assignment changes input digest and actual participants, never repository inference', () => {
  const f = fixture(),
    first = createCompilationInputSnapshot(f.raw, control());
  [
    f.raw.workspaceCapture.contractBindings.bindings[0].serviceRef,
    f.raw.workspaceCapture.contractBindings.bindings[1].serviceRef,
  ] = [wr('SERVICE', 's2'), wr('SERVICE', 's1')];
  const second = createCompilationInputSnapshot(f.raw, control());
  assert.notEqual(first.inputDigest, second.inputDigest);
  assert.deepEqual(build(second).candidate.payload.structuredContent.participantRefs, [
    wr('SERVICE', 's1'),
    wr('SERVICE', 's2'),
  ]);
  const stale = structuredClone(first);
  stale.workspaceCapture.contractBindings = second.workspaceCapture.contractBindings;
  assert.throws(() => build(stale));
});
test('unresolved or same-service match is not upgraded to an integration', () => {
  const unresolved = fixture();
  unresolved.match.status = 'UNRESOLVED';
  unresolved.match.candidateProviderRefs = [];
  unresolved.match.selectedProviderRef = null;
  assert.throws(() => build(createCompilationInputSnapshot(unresolved.raw, control())), {
    code: 'INTEGRATION_MATCH_NOT_RESOLVED',
  });
  const same = fixture();
  same.raw.workspaceCapture.contractBindings.bindings[1].serviceRef = wr('SERVICE', 's1');
  assert.throws(() => build(createCompilationInputSnapshot(same.raw, control())), {
    code: 'INTEGRATION_DISTINCT_PARTICIPANTS_REQUIRED',
  });
});
test('missing mapping, foreign ref and altered support refuse without a candidate', () => {
  const f = fixture(),
    s = createCompilationInputSnapshot(f.raw, control());
  assert.throws(() => build(s, { ...options(), matchRef: wr('CONTRACT_MATCH', 'absent') }));
  for (const change of [
    (v) => v.workspaceCapture.contractBindings.bindings.pop(),
    (v) => (v.workspaceCapture.contractBindings.bindings[0].serviceRef.entity.revisionId = 'other'),
    (v) =>
      (v.workspaceCapture.contractBindings.bindings[0].supportRefs[0].valueDigest = 'f'.repeat(64)),
  ]) {
    const v = structuredClone(s);
    change(v);
    assert.throws(() => build(v));
  }
});
test('weakest coverage and cancellation/budget are preserved', () => {
  const f = fixture();
  f.raw.repositories[0].coverage = {
    status: 'PARTIAL',
    limitations: ['SOURCE_PARTIAL'],
    unverifiedRefs: [],
  };
  const s = createCompilationInputSnapshot(f.raw, control());
  assert.deepEqual(build(s).candidate.payload.coverage, {
    status: 'PARTIAL',
    limitations: ['SOURCE_PARTIAL'],
    unverifiedRefs: [],
  });
  const c = new AbortController();
  c.abort();
  assert.throws(() => build(s, options(), control({ signal: c.signal })), { code: 'CANCELLED' });
  assert.throws(() => build(s, options(), control({ maxItems: 1 })));
  const a = account();
  a.visitItem = () => {
    throw Object.assign(Error('bounded'), { code: 'BUDGET_EXCEEDED' });
  };
  assert.throws(() => build(s, options(), control(), a), { code: 'BUDGET_EXCEEDED' });
});

test('nested options accessors are refused without getter execution or raw error leakage', () => {
  const f = fixture(),
    snapshot = createCompilationInputSnapshot(f.raw, control());
  let calls = 0;
  const o = options();
  Object.defineProperty(o.matchRef.entity, 'id', {
    enumerable: true,
    get() {
      calls++;
      return 'm';
    },
  });
  assert.throws(() => build(snapshot, o));
  assert.equal(calls, 0);
  const a = account();
  a.checkpoint = () => {
    throw Object.assign(Error('private detail'), { code: 'sensitive-private-code' });
  };
  assert.throws(() => build(snapshot, options(), control(), a), {
    code: 'INTEGRATION_INPUT_INVALID',
  });
});

test('incoming unknown cleanup remains unknown even when invalidation succeeds', () => {
  const f = fixture(),
    snapshot = createCompilationInputSnapshot(f.raw, control()),
    a = account();
  a.checkpoint = () => {
    throw Object.assign(Error('unsettled'), { code: 'BUDGET_EXCEEDED', cleanupState: 'UNKNOWN' });
  };
  assert.throws(() => build(snapshot, options(), control(), a), {
    code: 'BUDGET_EXCEEDED',
    cleanupState: 'UNKNOWN',
  });
});

import { reconcileKnowledge } from '../../knowledge/dist/index.js';
const reconcile = (subject, c = control()) =>
  reconcileKnowledge({
    subjects: [subject],
    existingItems: [],
    policyRef: 'knowledge-exact-reference-v1',
    intents: [],
    disappearedItemIds: [],
    control: c,
  });
test('captured Integration directly supplies conservative Reconciliation with honest missing state', () => {
  const snapshot = createCompilationInputSnapshot(fixture().raw, control());
  const result = build(snapshot),
    subject = result.reconciliationSubject;
  assert.ok(subject);
  assert.equal(subject.candidateEnvelope, result.candidate);
  assert.equal(subject.stateBinding, null);
  assert.ok(Object.isFrozen(subject.referenceContext.availableEntities));
  const plan = reconcile(subject);
  assert.equal(plan.actions.length, 1);
  const action = plan.actions[0];
  assert.equal(action.operation, 'REVIEW_REQUIRED');
  assert.deepEqual(action.reasons, ['STATE_EVIDENCE_MISSING']);
  assert.equal(action.revisionIntent, 'NONE');
  assert.equal(action.retainedItemId, null);
  assert.equal(action.previousRevisionId, null);
  assert.equal(action.candidateId, 'draft');
  assert.equal(plan.reviewRequired, true);
});
test('Reconciliation revalidates changed candidate refs and context instead of trusting generator result', () => {
  const s = build(createCompilationInputSnapshot(fixture().raw, control())).reconciliationSubject;
  assert.ok(s);
  const changed = structuredClone(s);
  changed.candidateEnvelope.payload.structuredContent.participantRefs[0].entity.revisionId =
    'stale';
  assert.throws(() => reconcile(changed));
  const missing = structuredClone(s);
  missing.referenceContext.availableEntities = [];
  assert.throws(() => reconcile(missing));
  const brokenSupport = structuredClone(s);
  brokenSupport.referenceContext.availableSupports = [];
  assert.throws(() => reconcile(brokenSupport));
});
test('captured Reconciliation control refusal returns no applicable actions', () => {
  const s = build(createCompilationInputSnapshot(fixture().raw, control())).reconciliationSubject;
  assert.ok(s);
  const low = reconcile(s, control({ maxItems: 1 }));
  assert.deepEqual(low.actions, []);
  assert.deepEqual(low.diagnostics, ['CONTROL_BUDGET']);
  const controller = new AbortController();
  controller.abort();
  const cancelled = reconcile(s, control({ signal: controller.signal }));
  assert.deepEqual(cancelled.actions, []);
  assert.deepEqual(cancelled.diagnostics, ['CONTROL_CANCELLED']);
});
