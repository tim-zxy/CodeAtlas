import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFixedCommitFiles } from '../dist/fixed-commit-files.js';

test('fixed selection returns committed bytes after a checkout edit; missing commit and path are refused', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeatlas-fixed-objects-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: '',
  };
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'core.autocrlf=false',
        '-C',
        root,
        ...args,
      ],
      { env, encoding: 'utf8' },
    ).trim();
  git('init', '--quiet');
  const contents = Buffer.from('owned source\n');
  await fs.writeFile(path.join(root, 'sample.java'), contents);
  git('add', '--', 'sample.java');
  git('commit', '--quiet', '-m', 'owned source');
  const request = {
    repositoryId: 'repo:owned',
    rootPath: root,
    commitOid: git('rev-parse', 'HEAD'),
    paths: ['sample.java'],
    maxObjectBytes: 8192,
  };
  const blobOid = git('rev-parse', request.commitOid + ':sample.java');
  await fs.writeFile(path.join(root, 'sample.java'), 'changed checkout');
  const account = {
    checkpoint() {},
    own() {},
    visitItem() {},
    reserveBuffer() {},
    readBytes() {},
    invalidate() {},
  };
  const authorize = (p) => assert.equal(p, 'sample.java');
  const result = await readFixedCommitFiles(request, account, authorize);
  assert.deepEqual(result.files, [
    {
      path: 'sample.java',
      bytes: contents,
      blobOid,
      contentFingerprint: 'sha256:' + createHash('sha256').update(contents).digest('hex'),
    },
  ]);
  assert.equal(result.files[0].bytes.buffer.byteLength, contents.length);
  await assert.rejects(
    readFixedCommitFiles({ ...request, commitOid: '0'.repeat(40) }, account, authorize),
    { code: 'SOURCE_CHANGED' },
  );
  await assert.rejects(
    readFixedCommitFiles({ ...request, paths: ['missing.java'] }, account, (p) =>
      assert.equal(p, 'missing.java'),
    ),
    { code: 'SOURCE_CHANGED' },
  );
});
