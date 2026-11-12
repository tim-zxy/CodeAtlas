import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { runInitCommand } from '../dist/init.js';
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
async function fixture() {
  const base = await fs.mkdtemp(
      path.join(realpathSync.native(os.tmpdir()), 'codeatlas-cli-init-owned-'),
    ),
    root = path.join(base, 'workspace'),
    repo = path.join(base, 'repo');
  await fs.mkdir(root);
  await fs.mkdir(repo);
  const defaults = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/phase1/security-config/inputs/defaults.json', import.meta.url),
      'utf8',
    ),
  );
  defaults.runtime.workspaceRoot = root;
  Object.assign(defaults.indexing.resourceBudget, {
    maxInputBytes: 1000000,
    maxOutputBytes: 1000000,
    maxItems: 10000,
    maxDepth: 100,
    maxDurationMs: 10000,
    maxMemoryBytes: 10000000,
  });
  const configuration = path.join(base, 'sources.json');
  await fs.writeFile(configuration, JSON.stringify({ defaults, maxInputBytes: 1000000 }));
  return {
    base,
    root,
    args: [
      'init',
      '--root',
      root,
      '--configuration',
      configuration,
      '--max-config-bytes',
      '1000000',
      '--repository',
      repo,
    ],
  };
}
const execute = (args) =>
  spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: { PATH: '', SystemRoot: process.env.SystemRoot ?? '' },
  });
test('actual CLI creates explicit metadata without Rust/LLM and matching second run is readonly', async () => {
  const f = await fixture(),
    first = execute(f.args);
  assert.equal(first.status, 0, first.stderr);
  const r = JSON.parse(first.stdout);
  assert.equal(r.outcome, 'CREATED');
  const before = await fs.readFile(path.join(f.root, '.ekp', 'init.json'));
  const second = execute(f.args);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).outcome, 'ALREADY_INITIALIZED');
  assert.deepEqual(await fs.readFile(path.join(f.root, '.ekp', 'init.json')), before);
});
test('CLI help invalid flags and config read limit do not initialize a workspace', async () => {
  const f = await fixture();
  assert.equal(execute(['init', '--help']).status, 0);
  for (const args of [
    [],
    [...f.args, '--index'],
    [...f.args, '--root', f.root],
    f.args.map((x) => (x === '1000000' ? '1' : x)),
  ]) {
    const r = execute(args.length ? args : ['init']);
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
  }
  await assert.rejects(fs.stat(path.join(f.root, '.ekp')), { code: 'ENOENT' });
});
test('CLI output failure retains a known committed init result', async () => {
  const f = await fixture();
  let errorText = '';
  const out = new Writable({
      write(chunk, encoding, callback) {
        callback(Object.assign(Error('OWNED_PIPE_FAILURE'), { code: 'EPIPE' }));
      },
    }),
    err = new Writable({
      write(chunk, encoding, callback) {
        errorText += chunk.toString();
        callback();
      },
    });
  assert.equal(await runInitCommand(f.args, { stdout: out, stderr: err }), 1);
  const error = JSON.parse(errorText);
  assert.equal(error.code, 'INIT_OUTPUT_FAILED');
  assert.equal(error.initializationEffect, 'COMMITTED');
  assert.equal(error.directoryCreated, true);
  await fs.stat(path.join(f.root, '.ekp', 'init.json'));
});
