import {
  fixture,
  control,
  options,
  account,
} from '../../../application/test/helpers/captured-integration-fixture.mjs';
import { createCompilationInputSnapshot } from '../../../application/dist/compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from '../../../application/dist/integration-candidate.js';
import { evaluateCandidateRecord } from '../../../application/dist/evaluation-record.js';
import { offlinePublicationState } from '../../../ir/dist/offline-publication-contract.js';
export const approve = {
  kind: 'TEST_REVIEW_NOT_AUTHORITY',
  review: ({ planDigest }) => ({ decision: 'APPROVED', planDigest }),
};
export function sample() {
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

export const limits = {
  maxRows: 10000,
  maxSerializedBytes: 4000000,
  maxItems: 400000,
  maxDepth: 100,
  memoryBudgetBytes: 40000000,
};

export function sampleSet() {
  const first = fixture(),
    second = fixture(),
    mapping = { c: 'c2', p: 'p2', s1: 's3', s2: 's4', m: 'm2' };
  const rewrite = (v) =>
    Array.isArray(v)
      ? v.map(rewrite)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)]))
        : typeof v === 'string'
          ? (mapping[v] ??
            (v.startsWith('service:') ? 'service:' + (mapping[v.slice(8)] ?? v.slice(8)) : v))
          : v;
  const other = rewrite(second.raw);
  first.raw.repositories[0].entities.push(...other.repositories[0].entities);
  first.raw.workspaceCapture.entities.push(...other.workspaceCapture.entities);
  first.raw.workspaceCapture.contractBindings.bindings.push(
    ...other.workspaceCapture.contractBindings.bindings,
  );
  first.raw.selection.selectedEntityRefs.push(...other.selection.selectedEntityRefs);
  const c = control(),
    snapshot = createCompilationInputSnapshot(first.raw, c),
    subjects = [];
  for (const [id, match] of [
    ['draft', 'm'],
    ['draft2', 'm2'],
  ]) {
    const built = buildCapturedIntegrationCandidate(
        snapshot,
        {
          ...options(),
          candidateId: id,
          matchRef: {
            scope: 'WORKSPACE',
            workspaceId: 'w',
            entity: { kind: 'CONTRACT_MATCH', id: match, revisionId: 'rs' },
          },
        },
        c,
        account(),
      ),
      subject = structuredClone(built.reconciliationSubject);
    subject.stateBinding = structuredClone(sample().input.subjects[0].stateBinding);
    subject.stateBinding.claims[0].payload.id = 'state:' + id;
    subject.stateBinding.claims[0].payload.subject =
      subject.candidateEnvelope.payload.structuredContent.participantRefs[0];
    subjects.push(subject);
  }
  const candidates = subjects.map((s) => s.candidateEnvelope),
    input = {
      workspaceId: 'w',
      runId: 'run:set',
      subject: { issuerNamespace: 'owned-test', subjectId: 'tester' },
      requestKey: 'request:set',
      snapshot,
      candidates,
      subjects,
      evaluation: evaluateCandidateRecord(
        { evaluationId: 'eval:set', runId: 'run:set', snapshot, candidates },
        c,
      ),
    };
  return { c, input, state: offlinePublicationState('w', [], c) };
}
