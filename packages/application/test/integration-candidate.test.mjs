import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from '../dist/integration-candidate.js';
const control = (changes = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...changes,
});
const zero = '0'.repeat(64);
const coverage = () => ({ status: 'COMPLETE', limitations: [], unverifiedRefs: [] });
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const basis = {
  repositoryId: 'r',
  revisionId: 'v',
  contentFingerprint: 'sha256:' + zero,
  codeActivationDigest: zero,
};
const wr = (kind, id) => ({
  scope: 'WORKSPACE',
  workspaceId: 'w',
  entity: { kind, id, revisionId: 'rs' },
});
const rr = (kind, id) => ({
  scope: 'REPOSITORY',
  repositoryId: 'r',
  entity: { kind, id, revisionId: 'v' },
});
function fixture() {
  const file = {
    id: 'f',
    repositoryId: 'r',
    revisionId: 'v',
    path: 'a.java',
    contentFingerprint: 'sha256:' + zero,
    classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: 'java',
    sensitivity: 'INTERNAL',
  };
  const support = {
    basis,
    entity: rr('SOURCE_FILE', 'f').entity,
    valueDigest: hash('codeatlas-phase1-support-value-v1\0' + canonical(file)),
  };
  const source = {
    ref: support,
    valueSchemaRef: 'SourceFile@1',
    value: file,
    capturedValueDigest: hash(
      'codeatlas.capture-value.v1\n' + canonical({ value: file, valueSchemaRef: 'SourceFile@1' }),
    ),
  };
  const workspaceBasis = { workspaceId: 'w', revisionSetId: 'rs', workspaceActivationDigest: zero };
  const confidence = { score: 1, method: 'fixture', reasons: ['literal'] };
  const service = (id) => ({
    ref: wr('SERVICE', id),
    valueSchemaRef: 'Service@1',
    value: {
      id,
      factKey: id,
      logicalServiceKey: id,
      location: 'WORKSPACE',
      repositoryRef: rr('REPOSITORY', 'r'),
      supportRefs: [support],
    },
  });
  const contract = (id, direction) => ({
    ref: rr('CONTRACT', id),
    valueSchemaRef: 'Contract@1',
    value: {
      id,
      factKey: id,
      repositoryId: 'r',
      revisionId: 'v',
      basis,
      sourceRange: { sourceFileId: 'f', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
      supportRefs: [support],
      confidence,
      resolution: 'EXACT',
      direction,
      protocol: 'HTTP',
      serviceRef: null,
      implementationRef: null,
      signature: {
        kind: 'HTTP',
        method: 'GET',
        pathSegments: [],
        querySchemaRef: null,
        requestSchemaRef: null,
        responseSchemaRef: null,
        serviceHint: null,
      },
    },
  });
  const match = {
    id: 'm',
    factKey: 'm',
    workspaceBasis,
    consumerRef: rr('CONTRACT', 'c'),
    status: 'MATCHED',
    candidateProviderRefs: [rr('CONTRACT', 'p')],
    selectedProviderRef: rr('CONTRACT', 'p'),
    reasons: ['EXACT'],
    supportRefs: [support],
    basisRefs: [basis],
    confidence,
  };
  const raw = {
    schemaVersion: 1,
    snapshotId: 'snap',
    workspaceId: 'w',
    scope: { kind: 'WORKSPACE', workspaceId: 'w' },
    revisionSetId: 'rs',
    selection: {
      repositoryIds: ['r'],
      selectedEntityRefs: [
        rr('CONTRACT', 'c'),
        rr('CONTRACT', 'p'),
        wr('SERVICE', 's1'),
        wr('SERVICE', 's2'),
        wr('CONTRACT_MATCH', 'm'),
      ],
      selectedDocumentRevisions: [],
    },
    repositories: [
      {
        repoBasis: basis,
        runtimeActivationDigest: zero,
        entities: [contract('c', 'CONSUMER'), contract('p', 'PROVIDER')],
        supports: [source],
        coverage: coverage(),
      },
    ],
    workspaceCapture: {
      workspaceBasis,
      entities: [
        service('s1'),
        service('s2'),
        { ref: wr('CONTRACT_MATCH', 'm'), valueSchemaRef: 'ContractMatch@1', value: match },
      ],
      supports: [],
      coverage: coverage(),
      contractBindings: {
        schemaVersion: 1,
        bindings: [
          {
            contractRef: rr('CONTRACT', 'c'),
            serviceRef: wr('SERVICE', 's1'),
            supportRefs: [support],
          },
          {
            contractRef: rr('CONTRACT', 'p'),
            serviceRef: wr('SERVICE', 's2'),
            supportRefs: [support],
          },
        ],
      },
    },
    documents: [],
    policyVersions: { securityPolicyRef: 'security', domainPolicyRef: 'domain' },
    captureWindow: {
      startedAt: '2026-11-08T00:00:00.000Z',
      completedAt: '2026-11-08T00:00:01.000Z',
    },
    coverage: coverage(),
  };
  return { raw, match, support };
}
function account() {
  let invalid = false;
  return {
    checkpoint() {
      assert.equal(invalid, false);
    },
    own() {
      this.checkpoint();
    },
    reserveBuffer() {
      this.checkpoint();
    },
    visitItem() {
      this.checkpoint();
    },
    invalidate() {
      invalid = true;
    },
  };
}
const options = () => ({
  candidateId: 'draft',
  matchRef: wr('CONTRACT_MATCH', 'm'),
  importance: 'normal',
});
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
