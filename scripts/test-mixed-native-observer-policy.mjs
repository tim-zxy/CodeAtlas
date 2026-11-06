import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
test('pure C# observer policy and cross-language control vectors', () => {
  const source = fs.readFileSync(
    new URL('./mixed-native-observer-policy.cs', import.meta.url),
    'utf8',
  );
  for (const forbidden of ['[DllImport', 'System.Diagnostics', 'FileStream', 'IntPtr'])
    assert.equal(source.includes(forbidden), false);
  const unit = fileURLToPath(new URL('./test-mixed-native-observer-policy.ps1', import.meta.url));
  const r = spawnSync(
    'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoProfile', '-NonInteractive', '-File', unit],
    { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000 },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const result = JSON.parse(r.stdout.trim());
  assert.equal(result.kind, 'PURE_OBSERVER_POLICY_UNIT');
  assert.ok(result.passed >= 25);
  assert.equal(result.actualCollectorRuns, 0);
  assert.equal(result.actualNativeRuns, 0);
  const codec = createMixedNativeControlCodec('a'.repeat(64), {
      maxFrameBytes: 1024,
      maxTotalBytes: 65536,
      maxFrames: 100,
    }),
    out = [];
  for (const frame of result.frames) out.push(...codec.push(Buffer.from(frame, 'ascii')));
  codec.finish();
  assert.deepEqual(
    out.map((m) => m.type),
    ['READY', 'ACQUIRED', 'RELEASED'],
  );
  assert.equal(result.snapshot.measurementEligible, false);
  assert.equal(result.snapshot.executionAuthorized, false);
});
