import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { transportMemoryValue } from '../helpers/native-full-v3-memory-corpus.mjs';

const name = process.argv[2];
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const bytes = Buffer.concat(chunks);
const records = bytes.toString('utf8').trimEnd().split('\n');
if (records.length !== 2 || bytes.length > 1_000_000 || bytes.at(-1) !== 10) process.exit(9);
const request = JSON.parse(records[0]),
  completion = JSON.parse(records[1]);
if (
  completion.type !== 'REQUEST_COMPLETED' ||
  completion.sequence !== 1 ||
  completion.payload.summaryRecords !== 0 ||
  completion.payload.integrityChecksum !==
    createHash('sha256')
      .update(records[0] + '\n')
      .digest('hex')
)
  process.exit(10);
const { value } = transportMemoryValue(name);
const p = request.payload;
const context = {
  repositoryId: p.repository.id,
  revisionId: p.revision.id,
  revisionFingerprint: p.revision.contentFingerprint,
  providerSnapshotId: p.providerSnapshotId,
};
const hash = createHash('sha256');
let sequence = 0;
const counts = { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 };
async function emit(type, payload, terminal = false) {
  const line =
    JSON.stringify({
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: sequence++,
      type,
      payload,
    }) + '\n';
  if (!terminal) hash.update(line);
  if (!process.stdout.write(line)) await once(process.stdout, 'drain');
}
await emit('ANALYSIS_STARTED', context);
for (const s of value.summaries) {
  await emit('SOURCE_FILE', s.sourceFile);
  counts.sourceFiles++;
}
for (const n of value.nodes) {
  await emit('NODE', n);
  counts.nodes++;
}
for (const s of value.summaries)
  for (const c of s.coverage) {
    await emit('COVERAGE', c);
    counts.coverage++;
  }
if (name === 'oversized-staged-fact') {
  await emit('DIAGNOSTIC', {
    code: 'OVERSIZED',
    severity: 'ERROR',
    message: 'x'.repeat(1_000_001),
    sourceRange: null,
  });
  counts.diagnostics++;
}
for (const s of value.summaries)
  await emit('ANALYSIS_SUMMARY', name === 'deep-unknown-input' ? value.unknownSummary : s);
await emit(
  'ANALYSIS_COMPLETED',
  {
    ...context,
    outcome: 'SUCCEEDED',
    counts,
    capabilities: [],
    contentFingerprint: p.revision.contentFingerprint,
    integrityChecksum: 'sha256:' + hash.digest('hex'),
    summaryRecords: value.summaries.length,
    analysisState: value.header,
  },
  true,
);
