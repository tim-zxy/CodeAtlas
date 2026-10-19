// Fault-only IPC child. Successful parser/resolver correctness still uses Rust.
import assert from 'node:assert/strict';
import { decodeNativeRequestV3 } from '../../../providers/dist/index.js';
import { finish } from '../../../providers/test/helpers/native-refresh-v3-corpus.mjs';

const mode = process.argv[2];
assert.ok(['partial', 'bad-checksum', 'late-exit', 'valid-noop', 'blocked-stdin'].includes(mode));
if (mode === 'blocked-stdin') {
  // Test-only gated reader: no source/IPC read or output before cancellation.
  // Keep the process alive without reading stdin; the real owner must terminate it.
  setInterval(() => {}, 1000);
  process.stderr.write('D5_INPUT_READER_GATED\n');
  await new Promise(() => {});
}
const chunks = [];
let inputBytes = 0;
for await (const chunk of process.stdin) {
  inputBytes += chunk.length;
  assert.ok(inputBytes <= 1_000_000);
  chunks.push(chunk);
}
const { header: request, baseline } = decodeNativeRequestV3(Buffer.concat(chunks));
assert.equal(request.type, 'REFRESH');
const p = request.payload;
assert.deepEqual(p.changes, { added: [], modified: [], deleted: [] });
assert.equal(p.baseRevisionFingerprint, p.targetRevision.contentFingerprint);
assert.deepEqual(
  p.targetSourceFiles,
  baseline.summaries.map((s) => s.sourceFile),
);
const context = {
  providerSnapshotId: p.providerSnapshotId,
  repositoryId: p.repository.id,
  revisionId: p.targetRevision.id,
  revisionFingerprint: p.targetRevision.contentFingerprint,
};
const coverage = baseline.summaries.flatMap((s) => s.coverage);
const entries = [
  { type: 'REFRESH_STARTED', payload: context },
  ...coverage.map((payload) => ({ type: 'COVERAGE', payload })),
  ...baseline.summaries.map((payload) => ({ type: 'ANALYSIS_SUMMARY', payload })),
  {
    type: 'REFRESH_COMPLETED',
    payload: {
      ...context,
      outcome: mode === 'partial' ? 'PARTIAL' : 'SUCCEEDED',
      counts: {
        sourceFiles: 0,
        upsertedNodes: 0,
        removedNodes: 0,
        upsertedEdges: 0,
        removedEdges: 0,
        coverage: coverage.length,
        diagnostics: 0,
      },
      capabilities: p.requestedCapabilities.map((name) => ({
        name,
        support: 'SUPPORTED',
        coverage: 'COMPLETE',
      })),
      contentFingerprint: p.targetRevision.contentFingerprint,
      integrityChecksum: '',
      analysisState: baseline.header,
      summaryRecords: baseline.summaries.length,
    },
  },
];
const records = entries.map((entry, sequence) => ({
  protocolVersion: 3,
  requestId: request.requestId,
  sequence,
  ...entry,
}));
let output = finish(records);
if (mode === 'bad-checksum') {
  records.at(-1).payload.integrityChecksum = 'sha256:' + '0'.repeat(64);
  output = Buffer.from(records.map((record) => JSON.stringify(record) + '\n').join(''));
}
process.stdout.write(output);
if (mode === 'late-exit') process.exitCode = 7;
