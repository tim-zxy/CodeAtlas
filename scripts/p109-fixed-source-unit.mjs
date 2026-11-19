// Local owned integration driver. Production CLI has no fixed-source framing command.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function runPrepared({ captureDir, side, kind, committedInput, checkedRequest }) {
  assert(['sender', 'listener'].includes(side));
  assert(['code', 'syntax'].includes(kind));
  const dir = path.join(captureDir, side);
  const requestBytes = fs.readFileSync(path.join(dir, kind + '.request.json'));
  const saved = JSON.parse(requestBytes);
  assert.deepEqual(saved, checkedRequest);
  assert(requestBytes.equals(Buffer.from(JSON.stringify(saved) + '\n')));
  assert.equal(checkedRequest.payload.repository.id, 'repo:p109:owned:' + side);
  assert.equal(checkedRequest.protocolVersion, kind === 'code' ? 2 : 8);
  const blobs = [];
  const files = committedInput.files.map(({ bytes, ...row }) => {
    assert(Buffer.isBuffer(bytes));
    assert.equal(row.sizeBytes, bytes.length);
    blobs.push(bytes);
    return row;
  });
  const requestBudget = checkedRequest.payload.resourceBudget;
  assert(
    blobs.reduce((n, b) => n + b.length, 0) <=
      Math.min(
        10_000_000,
        kind === 'code' ? requestBudget.maxMemoryBytes : requestBudget.maxInputBytes,
      ),
  );
  const header = Buffer.from(
    JSON.stringify({
      request: requestBytes.toString('utf8'),
      metadata: { ...committedInput, files },
    }),
  );
  assert(header.length <= 262144);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const deps = fileURLToPath(new URL('../target/debug/deps/', import.meta.url));
  const bins = fs.readdirSync(deps).filter((x) => /^fixed_commit_native-[a-f0-9]+\.exe$/.test(x));
  assert.equal(bins.length, 1);
  const outputPath = path.join(dir, kind + '.output.jsonl');
  const env = { P109_OUTPUT: outputPath };
  for (const k of ['SystemRoot', 'WINDIR', 'SystemDrive'])
    if (process.env[k]) env[k] = process.env[k];
  const result = spawnSync(
    path.join(deps, bins[0]),
    ['--exact', 'emit_owned_packet', '--ignored'],
    {
      cwd: dir,
      env,
      input: Buffer.concat([length, header, ...blobs]),
      windowsHide: true,
      timeout: 40000,
      maxBuffer: 262144,
    },
  );
  if (result.error || result.status !== 0)
    throw Error(result.error?.message ?? 'owned Rust input or emitter refused');
  const outputBytes = fs.readFileSync(outputPath);
  const terminal = JSON.parse(outputBytes.toString('utf8').trimEnd().split('\n').at(-1));
  assert.equal(terminal.type, kind === 'code' ? 'ANALYSIS_COMPLETED' : 'OBSERVATION_COMPLETED');
  return { requestBytes, outputBytes };
}
