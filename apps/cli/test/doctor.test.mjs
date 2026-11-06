import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { runDoctorCommand } from '../dist/doctor.js';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, readFile, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRepositoryIndexSession } from '../../../packages/storage/dist/index.js';
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const execute = (args, options = {}) =>
  spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
async function temporary(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'codeatlas-cli-doctor-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('actual doctor reports admission from empty cwd without tools, probes or new files', async (t) => {
  const cwd = await temporary(t);
  const before = await readdir(cwd);
  const result = execute(['doctor', '--memory-budget-bytes', '1'], {
    cwd,
    env: { PATH: '', SystemRoot: process.env.SystemRoot ?? '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.nativeBinary, 'NOT_PROBED');
  assert.equal(report.executionAuthorized, false);
  assert.equal(report.memoryBudgetBytes, 1);
  assert.deepEqual(
    report.admissionChecks.map((x) => x.workspace),
    ['READ_SEAL', 'FULL_TRANSPORT', 'REFRESH_VERIFY', 'REFRESH_TRANSPORT'],
  );
  assert.ok(
    report.admissionChecks.every(
      (x) => x.status === 'REFUSED' && x.code === 'RESOURCE_LIMIT_EXCEEDED',
    ),
  );
  assert.match(report.environment.implementationDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readdir(cwd), before);
});

test('doctor help and invalid flags preserve stdout/stderr and strict explicit budget rules', () => {
  const help = execute(['doctor', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /NOT_PROBED/);
  assert.match(help.stdout, /not.*qualif/i);
  for (const args of [
    [],
    ['--memory-budget-bytes', '0'],
    ['--memory-budget-bytes', '01'],
    ['--memory-budget-bytes', '1e3'],
    ['--memory-budget-bytes', '9007199254740992'],
    ['--memory-budget-bytes', '1', '--memory-budget-bytes', '2'],
    ['--native', 'missing'],
    ['--help', 'extra'],
  ]) {
    const out = execute(['doctor', ...args]);
    assert.equal(out.status, 2);
    assert.equal(out.stdout, '');
    assert.equal(JSON.parse(out.stderr).code, 'INVALID_INSTALL_INSPECTION_INPUT');
  }
});

test('actual status alias reuses index status JSON and leaves owned SQLite unchanged', async (t) => {
  const directory = await temporary(t);
  const root = path.join(directory, 'repo');
  await mkdir(root);
  const databasePath = path.join(directory, 'repository.sqlite');
  const session = await openRepositoryIndexSession(
    {
      databasePath,
      repositoryRoot: await realpath(root),
      repositoryId: 'fixture-repo',
      initialize: true,
      readOnly: false,
    },
    { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
  );
  session.close();
  const before = await readFile(databasePath);
  const flags = [
    '--database',
    databasePath,
    '--repository',
    'fixture-repo',
    '--max-metadata-rows',
    '10000',
    '--max-result-bytes',
    '1000000',
    '--timeout-ms',
    '10000',
  ];
  const old = execute(['index', 'status', ...flags]);
  const alias = execute(['status', ...flags]);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(old.status, 0, old.stderr);
  assert.equal(alias.stdout, old.stdout);
  assert.equal(JSON.parse(alias.stdout).kind, 'INDEX_STATUS');
  assert.deepEqual(await readFile(databasePath), before);
});

test('status alias refuses write and missing-budget options without creating database', async (t) => {
  const directory = await temporary(t);
  const file = path.join(directory, 'missing.sqlite');
  for (const flags of [
    ['--database', file, '--repository', 'fixture-repo'],
    ['--database', file, '--initialize'],
    ['--native', 'missing'],
  ]) {
    const out = execute(['status', ...flags]);
    assert.equal(out.status, 2);
    assert.equal(out.stdout, '');
    assert.equal(JSON.parse(out.stderr).code, 'INVALID_REQUEST');
  }
  assert.deepEqual(await readdir(directory), []);
});

test('actual doctor closed stdout pipe exits with a safe error and no uncaught stack', async () => {
  const child = spawn(process.execPath, [entry, 'doctor', '--help'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (x) => (stderr += x));
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  child.stdout.destroy();
  const result = await completion;
  assert.equal(result.code, 1, stderr);
  assert.equal(result.signal, null);
  assert.equal(JSON.parse(stderr).code, 'INSTALL_INSPECTION_FAILED');
  assert.doesNotMatch(stderr, /EPIPE|stack|node:internal/);
});

for (const mode of ['inspection', 'stdout', 'stderr'])
  test(`doctor ${mode} failure stays safe and releases stream listeners`, async () => {
    const read = fs.readFileSync;
    let stdout = '',
      stderr = '';
    const sink = (which) =>
      new Writable({
        write(chunk, encoding, done) {
          if (which === mode) done(Error('private stream detail'));
          else {
            if (which === 'stdout') stdout += chunk;
            else stderr += chunk;
            done();
          }
        },
      });
    const output = sink('stdout'),
      errors = sink('stderr');
    if (mode === 'inspection') {
      fs.readFileSync = () => {
        throw Error('private path detail');
      };
      syncBuiltinESMExports();
    }
    try {
      const args = mode === 'stderr' ? ['doctor'] : ['doctor', '--memory-budget-bytes', '1'];
      assert.equal(await runDoctorCommand(args, { stdout: output, stderr: errors }), 1);
      assert.equal(output.listenerCount('error'), 0);
      assert.equal(errors.listenerCount('error'), 0);
      assert.doesNotMatch(stdout + stderr, /private|stack|node:internal/);
      if (mode === 'inspection') {
        assert.equal(stdout, '');
        assert.equal(JSON.parse(stderr).code, 'INSTALL_INSPECTION_FAILED');
      }
    } finally {
      fs.readFileSync = read;
      syncBuiltinESMExports();
    }
  });
