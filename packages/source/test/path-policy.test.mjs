import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { decodeGitIgnoredPaths, gitIgnoredPaths } from '../dist/git.js';
import { compilePathPolicy, selectPath } from '../dist/path-policy.js';
import { hasCode, materialize, repoPath } from './helpers.mjs';

test('rooted globs match segment wildcards and recursive paths', () => {
  const policy = compilePathPolicy({
    include: ['build/generated/**', 'src/?est*.java'],
    exclude: [],
  });
  assert.equal(policy.decision(repoPath('build/generated/Keep.java')), 'INCLUDE');
  assert.equal(policy.decision(repoPath('src/TestOne.java')), 'INCLUDE');
  assert.equal(policy.decision(repoPath('other/TestOne.java')), 'DEFAULT');
  assert.equal(policy.couldIncludeDescendant('build'), true);
  assert.equal(policy.couldIncludeDescendant('unrelated'), false);
  assert.equal(policy.mayDescend('build'), true);
});

test('explicit exclusion and security denial beat inclusion', () => {
  const policy = compilePathPolicy({
    include: ['build/generated/**', 'config/.env.local', '.git/**'],
    exclude: ['**/Skip.java'],
  });
  assert.equal(selectPath(repoPath('build/generated/Keep.java'), policy, true), true);
  assert.equal(selectPath(repoPath('build/generated/Skip.java'), policy, false), false);
  assert.equal(selectPath(repoPath('config/.env.local'), policy, false), false);
  assert.equal(selectPath(repoPath('.git/config'), policy, false), false);
  assert.equal(policy.mayDescend('.git'), false);
  assert.equal(policy.mayDescend('config/secrets'), false);
});

test('default build and vendor exclusions need explicit include', () => {
  const defaultPolicy = compilePathPolicy({ include: [], exclude: [] });
  for (const path of ['build/A.java', 'dist/A.java', 'target/A.java', 'vendor/A.java']) {
    assert.equal(selectPath(repoPath(path), defaultPolicy, false), false, path);
  }
  assert.equal(defaultPolicy.mayDescend('vendor'), false);
  const includePolicy = compilePathPolicy({ include: ['vendor/lib/**'], exclude: [] });
  assert.equal(includePolicy.mayDescend('vendor'), true);
  assert.equal(selectPath(repoPath('vendor/lib/A.java'), includePolicy, true), true);
});

test('invalid patterns raise typed input errors', () => {
  for (const pattern of [
    '',
    '/absolute',
    'C:/absolute',
    'a\\b',
    'a//b',
    'a/../b',
    'a/./b',
    '!negated',
  ]) {
    assert.throws(
      () => compilePathPolicy({ include: [pattern], exclude: [] }),
      hasCode('INVALID_INPUT'),
    );
  }
});

test('NUL-delimited Git output preserves embedded newlines', () => {
  assert.deepEqual(
    [...decodeGitIgnoredPaths(Buffer.from('a\nnewline.tmp\0a space.tmp\0'))].sort(),
    ['a\nnewline.tmp', 'a space.tmp'].sort(),
  );
});

test('Git ignore queries preserve spaces and supported special names', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-source-ignore-'));
  try {
    const repo = await materialize(
      {
        branch: 'main',
        commit: false,
        files: [
          { path: '.gitignore', text: '*.tmp\n' },
          { path: 'a space.tmp', text: 'x' },
          ...(process.platform === 'win32' ? [] : [{ path: 'a\nnewline.tmp', text: 'y' }]),
          { path: 'plain.java', text: 'class Plain {}' },
        ],
      },
      base,
    );
    const paths = [
      'a space.tmp',
      ...(process.platform === 'win32' ? [] : ['a\nnewline.tmp']),
      'plain.java',
    ].map(repoPath);
    const ignored = await gitIgnoredPaths(repo, paths);
    assert.deepEqual(
      [...ignored].sort(),
      ['a space.tmp', ...(process.platform === 'win32' ? [] : ['a\nnewline.tmp'])].sort(),
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
