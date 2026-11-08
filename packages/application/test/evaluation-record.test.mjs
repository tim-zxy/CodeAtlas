import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonical } from './helpers/captured-integration-fixture.mjs';
import { parseOfflineEvaluationRecord } from '../../ir/dist/evaluation-record-contract.js';
import assert from 'node:assert/strict';
import { fixture, control, options, account } from './helpers/captured-integration-fixture.mjs';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from '../dist/integration-candidate.js';
const api = await import('../dist/evaluation-record.js').catch(() => ({}));
const sample = () => {
  const c = control(),
    snapshot = createCompilationInputSnapshot(fixture().raw, c),
    candidate = buildCapturedIntegrationCandidate(snapshot, options(), c, account()).candidate;
  return { c, snapshot, candidate };
};
test('actual candidate checks bind full snapshot and content without quality admission', () => {
  const f = sample();
  const r = api.evaluateCandidateRecord(
    { evaluationId: 'eval', runId: 'run', snapshot: f.snapshot, candidates: [f.candidate] },
    f.c,
  );
  assert.equal(r.quality, 'NOT_EVALUABLE');
  assert.equal(r.publication, 'NOT_AUTHORIZED');
  assert.equal(r.structuralResult, 'VALID');
  assert.equal(r.workspaceId, 'w');
  assert.equal(r.snapshotId, 'snap');
  assert.match(r.candidateDigest, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(r));
});
test('empty, duplicated, wrong-snapshot and extra PASS inputs refuse', () => {
  const f = sample(),
    base = { evaluationId: 'eval', runId: 'run', snapshot: f.snapshot, candidates: [f.candidate] };
  for (const patch of [
    { candidates: [] },
    { candidates: [f.candidate, f.candidate] },
    { status: 'PASS' },
    {
      candidates: [
        {
          ...f.candidate,
          payload: {
            ...f.candidate.payload,
            inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: 'other' },
          },
        },
      ],
    },
  ])
    assert.throws(() => api.evaluateCandidateRecord({ ...base, ...patch }, f.c));
});

test('independent digest vectors bind full snapshot and candidate content', () => {
  const f = sample(),
    input = { evaluationId: 'eval', runId: 'run', snapshot: f.snapshot, candidates: [f.candidate] },
    r = api.evaluateCandidateRecord(input, f.c);
  const hash = (domain, value) =>
    createHash('sha256')
      .update(domain + '\0' + canonical(value))
      .digest('hex');
  assert.equal(r.snapshotDigest, hash('codeatlas.offline-evaluation.snapshot.v1', f.snapshot));
  assert.equal(
    r.candidateDigest,
    hash('codeatlas.offline-evaluation.candidates.v1', [f.candidate]),
  );
  const changed = structuredClone(f.snapshot);
  changed.captureWindow.completedAt = '2026-11-08T00:00:02.000Z';
  assert.equal(changed.inputDigest, f.snapshot.inputDigest);
  assert.throws(() => parseOfflineEvaluationRecord(r, { ...input, snapshot: changed }, f.c));
  const abort = new AbortController();
  abort.abort();
  assert.throws(() => api.evaluateCandidateRecord(input, { ...f.c, signal: abort.signal }));
  assert.throws(() => api.evaluateCandidateRecord(input, { ...f.c, maxItems: 1 }));
});
