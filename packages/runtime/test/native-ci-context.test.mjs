import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('Native Fixture caller temp resolves to the same physical path used by index ownership', async () => {
  assert.equal(tmpdir(), await realpath(tmpdir()));
});

test('Windows checkout preserves TypeScript template bytes and published SQL line endings', async (t) => {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'codeatlas-ci-typescript-'));
  assert.equal(path.dirname(root), parent);
  t.after(async () => {
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: true });
  });
  const source = path.join(root, 'source');
  const checkout = path.join(root, 'checkout');
  await mkdir(source);
  const git = (...args) => {
    const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  };
  git('init', '--template=', '--initial-branch=main', source);
  git('-C', source, 'config', 'core.autocrlf', 'false');
  await copyFile(
    new URL('../../../.gitattributes', import.meta.url),
    path.join(source, '.gitattributes'),
  );
  const files = [
    ['packages/storage/src/statement.ts', Buffer.from('export const sql = `SELECT\n1;`;\n')],
    ['apps/cli/src/main.ts', Buffer.from('export const message = `one\ntwo`;\n')],
    ['packages/storage/migrations/repository/001_repo_core.sql', Buffer.from('SELECT 1;\r\n')],
  ];
  for (const [relative, bytes] of files) {
    const file = path.join(source, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  git('-C', source, 'add', '.');
  git(
    '-C',
    source,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@invalid',
    '-c',
    'commit.gpgSign=false',
    '-c',
    'core.hooksPath=' + path.join(root, 'no-hooks'),
    'commit',
    '-m',
    'Owned TypeScript byte-contract Fixture',
  );
  git('clone', '--config', 'core.autocrlf=true', source, checkout);
  for (const [relative, bytes] of files)
    assert.deepEqual(await readFile(path.join(checkout, relative)), bytes, relative);
});
