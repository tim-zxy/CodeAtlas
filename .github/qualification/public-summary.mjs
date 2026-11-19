import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function validatedSummary() {
  const file = path.resolve('.superpowers/native-memory/exact-pack/acceptance/ci-result.json');
  const stat = await lstat(file);
  assert(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 1024);
  assert.equal(await realpath(file), file);
  const receipt = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.command, 'collect');
  assert.equal(typeof receipt.success, 'boolean');
  assert.equal(process.env.ACTUAL_OUTCOME, receipt.success ? 'success' : 'failure');
  const fields = ['schemaVersion', 'command', 'success', 'stage'];
  if (receipt.success) {
    fields.push('archiveSha256', 'approvalSha256');
    assert.equal(receipt.stage, 'ACTUAL');
    const bytes = await readFile('fixtures/ipc/refresh-v3/approved-transport-a1.json');
    assert.equal(receipt.approvalSha256, sha256(bytes));
    assert.match(receipt.archiveSha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.archiveSha256, JSON.parse(bytes).archive.sha256);
  } else {
    fields.push('code');
    assert.equal(receipt.code, 'D5_CI_FAILED');
    assert(['APPROVAL', 'ARCHIVE', 'INSTALL', 'ACTUAL'].includes(receipt.stage));
  }
  assert.deepEqual(Object.keys(receipt).sort(), fields.sort());
  assert.match(process.env.ACTUAL_DURATION_MS, /^(0|[1-9][0-9]{0,6})$/);
  const durationMs = Number(process.env.ACTUAL_DURATION_MS);
  assert(durationMs <= 110 * 60_000);
  // Hash only validated, ordered scalars; raw receipt bytes are never published.
  const receiptSha256 = sha256(JSON.stringify(fields.map((key) => receipt[key])));
  return {
    status: receipt.success ? 'PASSED' : 'FAILED',
    successfulCollections: receipt.success ? 1 : 0,
    durationMs,
    receiptSha256,
  };
}

const summary = await validatedSummary().catch(() => null);
if (summary) {
  const directory = path.join(await realpath(process.env.RUNNER_TEMP), 'codeatlas-public-summary');
  await mkdir(directory);
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary) + '\n', {
    flag: 'wx',
  });
  await appendFile(process.env.GITHUB_OUTPUT, 'ready=true\n');
}
