import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyAnalysisPatch } from '../dist/index.js';

const input = {
  repositoryId: 'repo-A',
  baseRevisionId: 'rev-A',
  baseContentFingerprint: 'sha256:base',
  targetRevisionId: 'rev-A',
  targetContentFingerprint: 'sha256:target',
};
const snapshot = {
  id: 'snapshot-patch',
  repositoryId: input.repositoryId,
  providerId: 'native',
  providerVersion: '1',
  runtimeVersion: '1',
  requestedRevisionId: input.targetRevisionId,
  requestedRevisionFingerprint: input.targetContentFingerprint,
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:01.000Z',
  capabilities: [],
  diagnostics: [],
  outcome: 'SUCCEEDED',
};

test('matching successful patch calls the opaque store exactly once', async () => {
  const stage = { provisional: true };
  const calls = [];
  await applyAnalysisPatch(input, {
    observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
    factStore: { applyAnalysisPatch: (value, expected) => calls.push({ value, expected }) },
  });
  assert.deepEqual(calls, [{ value: stage, expected: { ...input, snapshot } }]);
});

test('partial, failed staging, and mismatched source never call the store', async () => {
  let calls = 0;
  const factStore = { applyAnalysisPatch: () => calls++ };
  const observations = [
    { outcome: 'PARTIAL', snapshot: { ...snapshot, outcome: 'PARTIAL' }, stage: {} },
    { outcome: 'SUCCEEDED', snapshot: { ...snapshot, outcome: 'PARTIAL' }, stage: {} },
    { outcome: 'SUCCEEDED', snapshot: { ...snapshot, repositoryId: 'other' }, stage: {} },
    {
      outcome: 'SUCCEEDED',
      snapshot: { ...snapshot, requestedRevisionId: 'other' },
      stage: {},
    },
    {
      outcome: 'SUCCEEDED',
      snapshot: { ...snapshot, requestedRevisionFingerprint: 'sha256:other' },
      stage: {},
    },
  ];
  for (const observation of observations)
    await assert.rejects(
      applyAnalysisPatch(input, { observeAndStage: async () => observation, factStore }),
    );
  await assert.rejects(
    applyAnalysisPatch(input, {
      observeAndStage: async () => {
        throw new Error('corrupt stream');
      },
      factStore,
    }),
    /corrupt stream/,
  );
  assert.equal(calls, 0);
});
