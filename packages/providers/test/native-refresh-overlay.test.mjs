import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../dist/index.js';
import { buildRefreshCase, chunkBytes, finish } from './helpers/native-refresh-v3-corpus.mjs';
import { stateDigest } from './helpers/native-full-v3-corpus.mjs';

// D3 preflight of its mandatory C proof, not database overlay/seal acceptance.
const globalDiagnostic = {
  code: 'RUN_NOTICE',
  severity: 'INFO',
  message: 'Run observation',
  sourceRange: null,
};
function observation(declared = [], emitted = []) {
  const c = buildRefreshCase('noop');
  const summaries = c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY');
  declared.forEach((diagnostics, i) => {
    summaries[i].payload.diagnostics = diagnostics;
  });
  const terminal = c.records.at(-1);
  terminal.payload.analysisState.summaryDigest = stateDigest(summaries.map((e) => e.payload));
  terminal.payload.counts.diagnostics = emitted.length;
  c.records.splice(
    c.records.length - 1,
    0,
    ...emitted.map((payload) => ({
      protocolVersion: 3,
      requestId: c.request.requestId,
      type: 'DIAGNOSTIC',
      payload,
    })),
  );
  c.eventBytes = finish(c.records);
  return c;
}
async function decode(c) {
  return api.decodeNativeRefreshV3(
    c.requestBytes,
    chunkBytes(c.eventBytes),
    { async accept() {} },
    api.NATIVE_CLIENT_HARD_LIMITS,
    c.trustedMemoryBudgetBytes,
  );
}
const violation = (error) =>
  error instanceof api.NativeClientError && error.code === 'PROTOCOL_VIOLATION';

test('D3 preflight: run-global diagnostics remain stream-only observations', async () => {
  const result = await decode(observation([], [globalDiagnostic]));
  assert.equal(result.terminal.payload.counts.diagnostics, 1);
  assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
});

test('D3 preflight: source-less file diagnostics require one originating file and observation', async () => {
  await assert.rejects(
    decode(
      observation([[globalDiagnostic], [globalDiagnostic]], [globalDiagnostic, globalDiagnostic]),
    ),
    violation,
  );
  await assert.rejects(decode(observation([[globalDiagnostic]], [])), violation);
  await assert.rejects(
    decode(observation([[globalDiagnostic]], [globalDiagnostic, globalDiagnostic])),
    violation,
  );
  const result = await decode(observation([[globalDiagnostic]], [globalDiagnostic]));
  assert.equal(result.terminal.payload.counts.diagnostics, 1);
});

test('D3 preflight: undeclared source-backed diagnostics still refuse', async () => {
  const local = {
    ...globalDiagnostic,
    sourceRange: { sourceFileId: 'f-0', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
  };
  await assert.rejects(decode(observation([], [local])), violation);
  const result = await decode(observation([[local]], [local]));
  assert.equal(result.terminal.payload.counts.diagnostics, 1);
});
