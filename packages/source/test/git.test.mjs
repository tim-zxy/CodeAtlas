import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';

import { discoverGitContext } from '../dist/git.js';
import { git, hasCode, materialize } from './helpers.mjs';

const setup = {
  branch: 'main',
  commit: true,
  files: [{ path: 'src/Main.java', text: 'class Main {}\n' }],
};

test('basic-java-repo Fixture is registered with declared input and expected artifacts', async () => {
  const fixtures = await discoverFixtures(
    fileURLToPath(new URL('../../../fixtures/source/basic-java-repo/', import.meta.url)),
  );
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].manifest.id, 'basic-java-repo');
  assert.ok(fixtures[0].inputs.setup.endsWith('setup.json'));
  assert.ok(fixtures[0].expected.inventory.endsWith('expected.json'));
});

async function inTemporaryDirectory(run) {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-source-git-'));
  try {
    await run(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

test('discovers root, branch and HEAD from a nested starting directory', async () =>
  inTemporaryDirectory(async (base) => {
    const repo = await materialize(setup, base);
    const context = await discoverGitContext(join(repo, 'src'), base);
    assert.equal(context.rootPath, await realpath(repo));
    assert.equal(context.branchName, 'main');
    assert.equal(context.headCommit, git(repo, ['rev-parse', 'HEAD']).trim());
    assert.deepEqual(context.workspacePosition, { kind: 'CHILD', path: 'repo' });
  }));

test('reports an external repository without fabricating workspace-relative identity', async () =>
  inTemporaryDirectory(async (base) => {
    const repo = await materialize(setup, base);
    const workspace = join(base, 'workspace');
    await mkdir(workspace);
    const context = await discoverGitContext(repo, workspace);
    assert.deepEqual(context.workspacePosition, { kind: 'EXTERNAL' });
  }));

test('an unborn repository has no HEAD commit', async () =>
  inTemporaryDirectory(async (base) => {
    const repo = await materialize({ ...setup, commit: false }, base);
    const context = await discoverGitContext(repo, repo);
    assert.equal(context.headCommit, null);
    assert.equal(context.branchName, 'main');
    assert.deepEqual(context.workspacePosition, { kind: 'ROOT' });
  }));

test('detached HEAD has no branch name', async () =>
  inTemporaryDirectory(async (base) => {
    const repo = await materialize(setup, base);
    git(repo, ['checkout', '--detach']);
    const context = await discoverGitContext(repo, base);
    assert.equal(context.branchName, null);
    assert.equal(context.headCommit, git(repo, ['rev-parse', 'HEAD']).trim());
  }));

test('a non-Git directory fails with a typed unsupported-source error', async () =>
  inTemporaryDirectory(async (base) => {
    const nonGit = join(base, 'plain');
    await mkdir(nonGit);
    await assert.rejects(discoverGitContext(nonGit, base), hasCode('NON_GIT_DIRECTORY'));
  }));
