// Fault child only. Successful correctness is exercised against the real Rust binary.
import { createHash } from 'node:crypto';
import { buildRefreshCase } from './native-refresh-v3-corpus.mjs';

const mode = process.argv[2];
if (mode === 'early-close') process.exit(7);
if (mode === 'slow-stdin') await new Promise((resolve) => setTimeout(resolve, 100));
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks);
if (raw.length > 1_000_000 || raw.at(-1) !== 10 || raw.includes(13)) process.exit(8);
const lines = raw.toString('utf8').slice(0, -1).split('\n');
const request = JSON.parse(lines[0]),
  completion = JSON.parse(lines.at(-1));
if (
  request.type !== 'REFRESH' ||
  request.sequence !== 0 ||
  completion.type !== 'REQUEST_COMPLETED' ||
  completion.requestId !== request.requestId ||
  completion.sequence !== lines.length - 1 ||
  completion.payload.summaryRecords !== lines.length - 2 ||
  completion.payload.integrityChecksum !==
    createHash('sha256')
      .update(lines.slice(0, -1).join('\n') + '\n')
      .digest('hex')
)
  process.exit(9);
for (let i = 1; i < lines.length - 1; i++) {
  const record = JSON.parse(lines[i]);
  if (
    record.type !== 'BASELINE_SUMMARY' ||
    record.sequence !== i ||
    record.requestId !== request.requestId
  )
    process.exit(10);
}
process.stderr.write(`verified-request:${raw.length}\n`);
if (mode === 'hang') await new Promise(() => setInterval(() => {}, 1000));
if (mode === 'stderr-overflow') process.stderr.write('x'.repeat(2000));
let output = buildRefreshCase(mode === 'partial' ? 'partial' : undefined).eventBytes;
if (mode === 'bad-checksum') {
  const records = output.toString('utf8').trimEnd().split('\n');
  const terminal = JSON.parse(records.pop());
  terminal.payload.integrityChecksum = 'sha256:' + '0'.repeat(64);
  output = Buffer.from(records.join('\n') + '\n' + JSON.stringify(terminal) + '\n');
}
if (mode === 'truncated')
  output = output.subarray(0, output.lastIndexOf(10, output.length - 2) + 1);
if (mode === 'analyzer-failed')
  output = Buffer.from(
    JSON.stringify({
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: 0,
      type: 'REQUEST_FAILED',
      payload: { error: { code: 'INVALID_REQUEST', message: 'Invalid request', retryable: false } },
    }) + '\n',
  );
process.stdout.write(output);
if (mode === 'post-terminal' || mode === 'late-exit' || mode === 'slow-stdin') {
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (mode === 'post-terminal') process.stdout.write('{}\n');
  else process.exitCode = 7;
}
