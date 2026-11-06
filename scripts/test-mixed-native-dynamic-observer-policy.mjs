import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashMixedNativeLaunch } from './mixed-native-launch-handshake.mjs';

import { createHash } from 'node:crypto';

function makeVectors() {
  const fixtureRoot = process.platform === 'win32' ? 'D:/fixture' : '/fixture';
  return ['GIT', 'V2', 'SURFACE_V8'].map((role, i) => {
    const plan = {
      executablePath: fixtureRoot + '/native.exe',
      arguments: ['quote"slash\\', '雪😀'],
      environment: { Z: 'value\n', A: 'é' },
      cwd: fixtureRoot,
      stdinSha256: String(i + 1).repeat(64),
    };
    const normalized = {
      ...plan,
      environment: { A: 'é', Z: 'value\n' },
      stdinSha256: '0'.repeat(64),
    };
    const zero = JSON.stringify(normalized);
    return {
      id: 'launch-' + (i + 1),
      role,
      phase: i === 0 ? 'SOURCE' : 'ANALYSIS',
      prefix: zero.slice(0, -66),
      staticSha: hashMixedNativeLaunch(normalized),
      stdinSha: plan.stdinSha256,
      commandSha: hashMixedNativeLaunch(plan),
    };
  });
}

test('V2 JavaScript dynamic launch hashes and registration vectors use host-absolute fixture paths', async () => {
  const source = fs.readFileSync(
    new URL('./mixed-native-dynamic-observer-policy.cs', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    '[DllImport',
    'System.Diagnostics',
    'FileStream',
    'IntPtr',
    'File.Read',
    'Process.Start',
  ])
    assert.equal(source.includes(forbidden), false);

  const vectors = makeVectors();
  for (const v of vectors) {
    const digest = (stdin) =>
      createHash('sha256')
        .update('codeatlas-mixed-native-launch-v1\0' + v.prefix + stdin + '\"}')
        .digest('hex');
    assert.equal(v.staticSha, digest('0'.repeat(64)));
    assert.equal(v.commandSha, digest(v.stdinSha));
  }
  assert.throws(
    () =>
      hashMixedNativeLaunch({
        executablePath: 'relative.exe',
        arguments: [],
        environment: {},
        cwd: process.platform === 'win32' ? 'D:/fixture' : '/fixture',
        stdinSha256: '0'.repeat(64),
      }),
    { code: 'INVALID_MIXED_NATIVE_LAUNCH' },
  );
  const { createMixedNativeDynamicControlCodec } =
    await import('./mixed-native-dynamic-control-codec.mjs');
  const limits = { maxFrameBytes: 4096, maxTotalBytes: 65536, maxFrames: 100 };
  const sender = createMixedNativeDynamicControlCodec('a'.repeat(64), limits);
  const receiver = createMixedNativeDynamicControlCodec('a'.repeat(64), limits);
  const decoded = vectors.flatMap((v) =>
    receiver.push(
      sender.encode({
        type: 'REGISTER',
        launchId: v.id,
        role: v.role,
        phase: v.phase,
        contextDigest: 'd'.repeat(64),
        staticCommandSha256: v.staticSha,
        stdinSha256: v.stdinSha,
        commandSha256: v.commandSha,
      }),
    ),
  );
  receiver.finish();
  assert.deepEqual(
    decoded.map((v) => v.role),
    ['GIT', 'V2', 'SURFACE_V8'],
  );
});

test(
  'V2 pure dynamic observer registration, hashes and lifecycle',
  { skip: process.platform !== 'win32' },
  async () => {
    const vectors = makeVectors();
    const r = spawnSync(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        fileURLToPath(new URL('./test-mixed-native-dynamic-observer-policy.ps1', import.meta.url)),
        '-VectorsBase64',
        Buffer.from(JSON.stringify(vectors)).toString('base64'),
      ],
      { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const result = JSON.parse(r.stdout.trim());
    assert.equal(result.kind, 'PURE_DYNAMIC_OBSERVER_UNIT');
    assert.ok(result.passed >= 35);
    assert.equal(result.snapshot.complete, true);
    assert.equal(result.snapshot.measurementEligible, false);
    assert.equal(result.actualRuns, 0);
    const { createMixedNativeDynamicControlCodec } =
      await import('./mixed-native-dynamic-control-codec.mjs');
    const codec = createMixedNativeDynamicControlCodec('a'.repeat(64), {
      maxFrameBytes: 4096,
      maxTotalBytes: 65536,
      maxFrames: 100,
    });
    const literalCodec = createMixedNativeDynamicControlCodec('a'.repeat(64), {
      maxFrameBytes: 4096,
      maxTotalBytes: 65536,
      maxFrames: 100,
    });
    const first = vectors[0];
    assert.equal(
      literalCodec
        .encode({
          type: 'REGISTER',
          launchId: first.id,
          role: first.role,
          phase: first.phase,
          contextDigest: 'd'.repeat(64),
          staticCommandSha256: first.staticSha,
          stdinSha256: first.stdinSha,
          commandSha256: first.commandSha,
        })
        .toString('ascii'),
      result.registerLiteral,
    );
    const decoded = result.frames.flatMap((line) => codec.push(Buffer.from(line, 'ascii')));
    codec.finish();
    assert.deepEqual(
      decoded.map((x) => x.type),
      [
        'BOUND',
        'READY',
        'ACQUIRED',
        'RELEASED',
        'BOUND',
        'READY',
        'ACQUIRED',
        'RELEASED',
        'BOUND',
        'READY',
        'ACQUIRED',
        'RELEASED',
      ],
    );
  },
);
