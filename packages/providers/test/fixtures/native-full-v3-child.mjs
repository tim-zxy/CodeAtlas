import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const mode = process.argv[2];
if (mode === 'early-close') process.exit(7);
if (mode === 'slow-stdin') await new Promise((resolve) => setTimeout(resolve, 100));
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks);
if (raw.length > 1_000_000 || raw.at(-1) !== 10 || raw.includes(13)) process.exit(8);
const lines = raw.toString('utf8').trimEnd().split('\n');
if (lines.length !== 2) process.exit(9);
const request = JSON.parse(lines[0]);
const completion = JSON.parse(lines[1]);
if (
  request.protocolVersion !== 3 ||
  request.type !== 'ANALYZE' ||
  request.sequence !== 0 ||
  request.payload.baselineState !== null ||
  completion.type !== 'REQUEST_COMPLETED' ||
  completion.protocolVersion !== 3 ||
  completion.requestId !== request.requestId ||
  completion.sequence !== 1 ||
  completion.payload.summaryRecords !== 0 ||
  completion.payload.integrityChecksum !==
    createHash('sha256')
      .update(lines[0] + '\n')
      .digest('hex')
)
  process.exit(10);
// No source work or response is possible before complete input integrity is verified.
process.stderr.write(`verified-request:${raw.length}\n`);
if (mode === 'hang') await new Promise(() => setInterval(() => {}, 1000));
if (mode === 'stderr-overflow') process.stderr.write('x'.repeat(2000));
let output = await readFile(
  new URL('../../../../fixtures/ipc/analysis-v3/valid-empty.jsonl', import.meta.url),
);
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
if (mode === 'bad-checksum') {
  const records = output.toString('utf8').trimEnd().split('\n');
  const terminal = JSON.parse(records.pop());
  terminal.payload.integrityChecksum = 'sha256:' + '0'.repeat(64);
  output = Buffer.from(records.join('\n') + '\n' + JSON.stringify(terminal) + '\n');
}
if (mode === 'truncated')
  output = output.subarray(0, output.lastIndexOf(10, output.length - 2) + 1);
if (mode === 'post-terminal') output = Buffer.concat([output, Buffer.from('{}\n')]);
if (mode === 'oversize-summary')
  output = Buffer.from(
    JSON.stringify({
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: 0,
      type: 'ANALYSIS_SUMMARY',
      payload: { padding: 'x'.repeat(1_000_001) },
    }) + '\n',
  );
process.stdout.write(output);
if (mode === 'nonzero') process.exitCode = 7;
