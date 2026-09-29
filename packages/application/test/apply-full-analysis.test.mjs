import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyFullAnalysis } from '../dist/index.js';

const input = { repositoryId: 'repo-A', revisionId: 'rev-A', contentFingerprint: 'sha256:rev-A' };
const snapshot = {
  id: 'snapshot-A',
  repositoryId: input.repositoryId,
  providerId: 'native',
  providerVersion: '1',
  runtimeVersion: '1',
  requestedRevisionId: input.revisionId,
  requestedRevisionFingerprint: input.contentFingerprint,
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:01.000Z',
  capabilities: [],
  diagnostics: [],
  outcome: 'SUCCEEDED',
};

test('SUCCEEDED observation activates exactly once through the FactStore port', async () => {
  const stage = { candidate: true };
  const calls = [];
  await applyFullAnalysis(input, {
    observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
    factStore: {
      applyAnalysisBatch(value, expected) {
        calls.push({ value, expected });
      },
    },
  });
  assert.deepEqual(calls, [{ value: stage, expected: { ...input, snapshot } }]);
});

test('PARTIAL, changed context, and staging failure never call FactStore', async () => {
  let writes = 0;
  const factStore = {
    applyAnalysisBatch() {
      writes++;
    },
  };
  for (const result of [
    { outcome: 'PARTIAL', snapshot: { ...snapshot, outcome: 'PARTIAL' }, stage: {} },
    {
      outcome: 'SUCCEEDED',
      snapshot: { ...snapshot, requestedRevisionFingerprint: 'sha256:stale' },
      stage: {},
    },
  ]) {
    await assert.rejects(
      applyFullAnalysis(input, { observeAndStage: async () => result, factStore }),
    );
  }
  await assert.rejects(
    applyFullAnalysis(input, {
      observeAndStage: async () => {
        throw new Error('stream failed');
      },
      factStore,
    }),
  );
  assert.equal(writes, 0);
});
