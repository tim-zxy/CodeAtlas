import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Writable } from 'node:stream';
import { runIndexCommandLine } from '../dist/index-command.js';
import { openRepositoryIndexSession } from '../../../packages/storage/dist/index.js';
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const execute = (args) =>
  spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', windowsHide: true });

test('index CLI help describes explicit write versus persisted-only status', () => {
  const result = execute(['index', '--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /incremental/);
  assert.match(result.stdout, /initialize/);
  assert.match(result.stdout, /NOT_OBSERVED/);
});

test('index CLI handles an actual closed stdout pipe with a controlled diagnostic', async () => {
  const child = spawn(process.execPath, [entry, 'index', '--help'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  child.stdout.destroy();
  const result = await completion;
  assert.equal(result.code, 1, stderr);
  assert.equal(result.signal, null);
  const diagnostic = JSON.parse(stderr);
  assert.equal(diagnostic.effects.graphCommit, 'NOT_ATTEMPTED');
  assert.doesNotMatch(stderr, /EPIPE|stack|node:internal/);
});

test('index CLI synthetic committed receipt retains COMMITTED after a real stdout pipe failure', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-cli-committed-output-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = JSON.parse(
    await readFile(
      new URL('../../../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  );
  const configPath = path.join(directory, 'configuration.json');
  await writeFile(configPath, JSON.stringify(input.configuration));
  const childEntry = fileURLToPath(
    new URL('./fixtures/index-committed-output-child.mjs', import.meta.url),
  );
  const child = spawn(process.execPath, [childEntry, configPath], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  child.stdout.destroy();
  const result = await completion;
  assert.equal(result.code, 1, stderr);
  assert.equal(result.signal, null);
  assert.deepEqual(JSON.parse(stderr).effects, {
    databaseInitialized: true,
    sourceReconciled: true,
    graphCommit: 'COMMITTED',
  });
  assert.doesNotMatch(stderr, /EPIPE|stack|node:internal/);
  // Synthetic adapter returns a validated literal receipt and creates no DB.
  await assert.rejects(readFile(path.join(directory, 'synthetic.sqlite')), { code: 'ENOENT' });
});

for (const args of [
  ['index', 'incremental', '--initialize'],
  ['index', 'status', '--database', 'missing'],
  ['index', 'status', '--database', 'missing', '--database', 'other'],
  [
    'index',
    'status',
    '--database',
    'missing',
    '--repository',
    'fixture-repo',
    '--max-metadata-rows',
    '0',
    '--max-result-bytes',
    '10',
    '--timeout-ms',
    '10',
  ],
  [
    'index',
    'status',
    '--database',
    'missing',
    '--repository',
    'fixture-repo',
    '--max-metadata-rows',
    '01',
    '--max-result-bytes',
    '10',
    '--timeout-ms',
    '10',
  ],
  [
    'index',
    'status',
    '--database',
    'missing',
    '--repository',
    'fixture-repo',
    '--max-metadata-rows',
    '9007199254740992',
    '--max-result-bytes',
    '10',
    '--timeout-ms',
    '10',
  ],
])
  test(`index CLI rejects invalid flags: ${args.join(' ')}`, () => {
    const result = execute(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).code, 'INVALID_REQUEST');
  });

for (const args of [
  ['index', '--help'],
  ['index', 'status'],
]) {
  test(`index CLI handles failed output without leaking errors: ${args.join(' ')}`, async () => {
    const broken = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('private stream detail'));
      },
    });
    let diagnostic = '';
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        diagnostic += chunk;
        callback();
      },
    });
    const code = await runIndexCommandLine(args, {
      stdout: broken,
      stderr: args.includes('--help') ? sink : broken,
    });
    assert.equal(code, 1);
    assert.doesNotMatch(diagnostic, /private stream detail|stack/);
    assert.equal(broken.listenerCount('error'), 0);
    if (diagnostic) assert.equal(JSON.parse(diagnostic).effects.graphCommit, 'NOT_ATTEMPTED');
  });
}

test('index CLI status reads SQLite without Native or mutation', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-cli-index-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryRoot = path.join(directory, 'repo');
  await mkdir(repositoryRoot);
  const databasePath = path.join(directory, 'repository.sqlite');
  const session = await openRepositoryIndexSession(
    {
      databasePath,
      repositoryRoot: await realpath(repositoryRoot),
      repositoryId: 'fixture-repo',
      initialize: true,
      readOnly: false,
    },
    { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
  );
  session.close();
  const before = await readFile(databasePath);
  const result = execute([
    'index',
    'status',
    '--database',
    databasePath,
    '--repository',
    'fixture-repo',
    '--max-metadata-rows',
    '20',
    '--max-result-bytes',
    '10000',
    '--timeout-ms',
    '5000',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.kind, 'INDEX_STATUS');
  assert.equal(json.status.freshness.worktree, 'NOT_OBSERVED');
  assert.deepEqual(await readFile(databasePath), before);
});

test('index CLI full retains admission refusal before initialization', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-cli-index-refusal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = JSON.parse(
    await readFile(
      new URL('../../../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  ).configuration;
  const configPath = path.join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const databasePath = path.join(directory, 'missing.sqlite');
  const result = execute([
    'index',
    'full',
    '--database',
    databasePath,
    '--repository',
    'fixture-repo',
    '--root',
    path.join(directory, 'missing-root'),
    '--native',
    path.join(directory, 'missing-native'),
    '--config',
    configPath,
    '--initialize',
  ]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(JSON.parse(result.stderr).effects.graphCommit, 'NOT_ATTEMPTED');
  await assert.rejects(readFile(databasePath), { code: 'ENOENT' });
});
