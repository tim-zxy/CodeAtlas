import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const preload = new URL('./fixtures/native-actual-diagnostic.mjs', import.meta.url).href;
const binary = path.resolve(
  root,
  process.env.CARGO_TARGET_DIR ?? 'target',
  'debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const request = await readFile(
  new URL('../../../fixtures/ipc/handshake-v1/describe-v1/request.jsonl', import.meta.url),
  'utf8',
);
const program = String.raw`
  import { spawn } from 'node:child_process';
  import { once } from 'node:events';
  const [binary, request, mode] = process.argv.slice(1);
  process.stderr.write('ordinary stderr\n');
  for (let n = 0; n < (mode === 'cap' ? 65 : 1); n++) {
    const child = spawn(mode === 'other' ? process.execPath : binary,
      mode === 'other' ? ['-e', 'process.stdout.write("other")'] : [],
      { env: {}, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    const closed = once(child, 'close');
    if (mode === 'kill') setTimeout(() => child.kill(), 50);
    else child.stdin.end(request);
    const [code] = await closed;
    if (mode !== 'kill' && code !== 0) throw new Error('Native failed');
  }
`;

function run(directory, mode, instrumented = true, inherited = false, importUrl = preload) {
  const nestedProgram = `
    import { spawnSync } from 'node:child_process';
    const child = spawnSync(process.execPath,
      ['--input-type=module', '-e', ${JSON.stringify(program)}, ...process.argv.slice(1)],
      { env: process.env, stdio: 'inherit', windowsHide: true });
    process.exitCode = child.status ?? 1;
  `;
  return spawnSync(
    process.execPath,
    [
      ...(instrumented && !inherited ? [`--import=${importUrl}`] : []),
      '--input-type=module',
      '-e',
      inherited ? nestedProgram : program,
      binary,
      request,
      mode,
    ],
    {
      cwd: directory,
      env: {
        ...process.env,
        CODEATLAS_ACTUAL_DIAGNOSTIC_DIR: directory,
        NODE_OPTIONS: inherited ? `--import=${preload}` : '',
      },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1_000_000,
      windowsHide: true,
    },
  );
}

async function rows(directory) {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.jsonl'));
  return (
    await Promise.all(files.map((name) => readFile(path.join(directory, name), 'utf8')))
  ).flatMap((text) => text.trim().split('\n').filter(Boolean).map(JSON.parse));
}

async function trial(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-actual-diagnostic-'));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('ACTUAL diagnostics preserve real Native stdout and ordinary stderr with scalar-only sidecar', async () => {
  await trial(async (directory) => {
    const baseline = run(directory, 'normal', false);
    assert.equal(baseline.status, 0, baseline.stderr);
    const observed = run(directory, 'normal');
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.stdout, baseline.stdout);
    assert.equal(observed.stderr, 'ordinary stderr\n');
    const records = await rows(directory);
    assert.equal(records.length, 1);
    const row = records[0];
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        'scope',
        'sequence',
        'inputWriteCallBytes',
        'outputPushBytes',
        'outputPushChunks',
        'firstInputMs',
        'firstOutputMs',
        'lastOutputMs',
        'stdoutEofMs',
        'exitMs',
        'closeMs',
        'killMs',
        'exitCode',
        'signal',
      ].sort(),
    );
    assert.equal(row.scope, 'ACTUAL_DIAGNOSTIC_ONLY');
    assert.equal(row.sequence, 1);
    assert.equal(row.inputWriteCallBytes, Buffer.byteLength(request));
    assert.equal(row.outputPushBytes, Buffer.byteLength(observed.stdout));
    assert.ok(row.outputPushChunks > 0);
    for (const field of [
      'firstInputMs',
      'firstOutputMs',
      'lastOutputMs',
      'stdoutEofMs',
      'exitMs',
      'closeMs',
    ]) {
      assert.ok(Number.isFinite(row[field]) && row[field] >= 0, field);
    }
    assert.equal(row.exitCode, 0);
    assert.equal(row.signal, null);
    assert.equal(row.killMs, null);
  });
});

test('ACTUAL diagnostics retain killed Native lifecycle without inventing first input or output', async () => {
  await trial(async (directory) => {
    const observed = run(directory, 'kill');
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.stdout, '');
    assert.equal(observed.stderr, 'ordinary stderr\n');
    const [row] = await rows(directory);
    assert.equal(row.firstInputMs, null);
    assert.equal(row.firstOutputMs, null);
    assert.ok(row.killMs >= 0);
    assert.ok(row.closeMs >= row.killMs);
    assert.equal(row.outputPushBytes, 0);
  });
});

test('ACTUAL diagnostics cap real Native records at 64 without dropping the 65th response', async () => {
  await trial(async (directory) => {
    const baseline = run(directory, 'cap', false);
    assert.equal(baseline.status, 0, baseline.stderr);
    const observed = run(directory, 'cap');
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.stdout, baseline.stdout);
    assert.equal(observed.stderr, baseline.stderr);
    const records = await rows(directory);
    assert.equal(records.length, 64);
    assert.deepEqual(
      records.map((row) => row.sequence),
      Array.from({ length: 64 }, (_, n) => n + 1),
    );
  });
});

test('ACTUAL diagnostics do not record unrelated child processes', async () => {
  await trial(async (directory) => {
    const observed = run(directory, 'other');
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.stdout, 'other');
    assert.equal(observed.stderr, 'ordinary stderr\n');
    assert.deepEqual(await rows(directory), []);
  });
});

test('ACTUAL preload propagates to a Node worker at an unrelated cwd without contaminating its streams', async () => {
  await trial(async (directory) => {
    const baseline = run(directory, 'normal', false);
    const observed = run(directory, 'normal', true, true);
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.stdout, baseline.stdout);
    assert.equal(observed.stderr, 'ordinary stderr\n');
    const records = await rows(directory);
    assert.equal(records.length, 1);
    assert.equal(records[0].scope, 'ACTUAL_DIAGNOSTIC_ONLY');
  });
});

test('original offline preload still emits its original marker without creating ACTUAL sidecars', async () => {
  await trial(async (directory) => {
    const baseline = run(directory, 'normal', false);
    const observed = run(
      directory,
      'normal',
      true,
      false,
      new URL('./fixtures/native-dense-diagnostic.mjs', import.meta.url).href,
    );
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.stdout, baseline.stdout);
    const lines = observed.stderr.trim().split('\n');
    assert.equal(lines[0], 'ordinary stderr');
    assert.equal(lines.length, 2);
    const prefix = '[DENSE_NATIVE_DIAGNOSTIC]';
    assert.ok(lines[1].startsWith(prefix));
    assert.equal(JSON.parse(lines[1].slice(prefix.length)).scope, 'OFFLINE_TEST_DIAGNOSTIC_ONLY');
    assert.deepEqual(await rows(directory), []);
  });
});

test('ACTUAL preload refuses an absent diagnostic directory before running the workload', () => {
  for (const directory of [
    '',
    path.join(tmpdir(), 'codeatlas-absent-diagnostic-' + randomUUID()),
  ]) {
    const observed = spawnSync(
      process.execPath,
      [`--import=${preload}`, '-e', 'process.stdout.write("ran")'],
      {
        env: { ...process.env, NODE_OPTIONS: '', CODEATLAS_ACTUAL_DIAGNOSTIC_DIR: directory },
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true,
      },
    );
    assert.equal(observed.status, 1);
    assert.equal(observed.stdout, '');
    assert.match(observed.stderr, /ACTUAL_DIAGNOSTIC_DIRECTORY_REQUIRED/);
    if (directory) assert.equal(observed.stderr.includes(directory), false);
  }
});
