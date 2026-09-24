import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';
import { EntityIdSchema } from '../../ir/dist/index.js';

import * as source from '../dist/index.js';
import { SourceScanError } from '../dist/errors.js';
import {
  fingerprintFile,
  fingerprintInventory,
  observeWithDependencies,
} from '../dist/fingerprint.js';
import { git, hasCode, materialize, repoPath } from './helpers.mjs';

const fixtureRoot = fileURLToPath(
  new URL('../../../fixtures/source/worktree-fingerprint/', import.meta.url),
);
const repositoryId = EntityIdSchema.parse('fingerprint-fixture-repository');

test('worktree-fingerprint Fixture pins raw byte hashes, sizes, selected paths, and inventory hash', async () => {
  assert.equal(typeof source.observeGitWorktree, 'function');
  const fixtures = await discoverFixtures(fixtureRoot);
  assert.deepEqual(
    fixtures.map((fixture) => fixture.manifest.id),
    ['worktree-fingerprint'],
  );
  const fixture = fixtures[0];
  const setup = JSON.parse(await readFile(fixture.inputs.setup, 'utf8'));
  const expected = JSON.parse(await readFile(fixture.expected.fingerprints, 'utf8'));
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-'));
  try {
    const repo = await materialize(setup, base);
    const request = {
      repositoryId,
      startingPath: repo,
      workspaceRoot: base,
      config: setup.config,
    };
    const first = await source.observeGitWorktree(request);
    assert.deepEqual(
      first.files.map((file) => file.path),
      expected.paths,
    );
    for (const file of first.files) {
      assert.deepEqual(
        { contentFingerprint: file.contentFingerprint, sizeBytes: file.sizeBytes },
        expected.files[file.path],
        file.path,
      );
    }
    assert.deepEqual(
      first.files.map((file) => file.classification),
      [
        { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        { role: 'OTHER', provenance: 'VENDOR', contentKind: 'BINARY' },
      ],
    );
    assert.deepEqual(
      first.files.map((file) => file.languageHint),
      ['java', 'java', 'java', null],
    );
    assert.equal(first.contentFingerprint, expected.contentFingerprint);
    assert.equal(fingerprintInventory([...first.files].reverse()), expected.contentFingerprint);
    assert.deepEqual(await source.observeGitWorktree(request), first);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('same-size byte edits change the worktree hash while excluded edits do not', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-change-'));
  try {
    const repo = await materialize(
      {
        branch: 'main',
        commit: true,
        files: [
          { path: 'src/A.java', text: 'class A {}\n' },
          { path: 'build/Skip.java', text: 'class Skip {}\n' },
          { path: '.env', text: 'secret-one' },
        ],
      },
      base,
    );
    const request = {
      repositoryId,
      startingPath: repo,
      workspaceRoot: base,
      config: { include: [], exclude: [] },
    };
    const before = await source.observeGitWorktree(request);
    assert.deepEqual(
      before.files.map((file) => file.path),
      ['src/A.java'],
    );
    await writeFile(join(repo, 'build', 'Skip.java'), 'class Else {}\n');
    await writeFile(join(repo, '.env'), 'secret-two');
    assert.equal(
      (await source.observeGitWorktree(request)).contentFingerprint,
      before.contentFingerprint,
    );
    await writeFile(join(repo, 'src', 'A.java'), 'class B {}\n');
    const after = await source.observeGitWorktree(request);
    assert.equal(after.files[0].sizeBytes, before.files[0].sizeBytes);
    assert.notEqual(after.files[0].contentFingerprint, before.files[0].contentFingerprint);
    assert.notEqual(after.contentFingerprint, before.contentFingerprint);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('empty selected inventory has one stable domain-separated fingerprint', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-empty-'));
  try {
    const repo = await materialize(
      { branch: 'main', commit: true, files: [{ path: '.env', text: 'secret' }] },
      base,
    );
    const observed = await source.observeGitWorktree({
      repositoryId,
      startingPath: repo,
      workspaceRoot: base,
      config: { include: [], exclude: [] },
    });
    assert.deepEqual(observed.files, []);
    assert.equal(
      observed.contentFingerprint,
      'sha256:fa14911f2e95bbc10e0896eac2bc5d58ff3f8965105c6415f112d1c53807ccb3',
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('disappearing or non-file selected paths fail with SOURCE_CHANGED', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-race-'));
  try {
    const file = join(base, 'Gone.java');
    await writeFile(file, 'class Gone {}');
    await rm(file);
    await assert.rejects(fingerprintFile(file, repoPath('Gone.java')), hasCode('SOURCE_CHANGED'));
    await assert.rejects(fingerprintFile(base, repoPath('Gone.java')), hasCode('SOURCE_CHANGED'));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('changed classification or read failure cannot return a partial observation', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-atomic-'));
  try {
    const repo = await materialize(
      { branch: 'main', commit: true, files: [{ path: 'src/A.java', text: 'class A {}' }] },
      base,
    );
    const request = {
      repositoryId,
      startingPath: repo,
      workspaceRoot: base,
      config: { include: [], exclude: [] },
    };
    await assert.rejects(
      observeWithDependencies(request, {
        fingerprintFile: async () => ({
          contentFingerprint: 'sha256:fake',
          sizeBytes: 10,
          languageHint: 'java',
          classification: { role: 'OTHER', provenance: 'AUTHORED', contentKind: 'TEXT' },
        }),
      }),
      hasCode('SOURCE_CHANGED'),
    );
    await assert.rejects(
      observeWithDependencies(request, {
        fingerprintFile: async () => {
          throw new SourceScanError('FILE_READ_FAILED', 'Cannot read file');
        },
      }),
      hasCode('FILE_READ_FAILED'),
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a selected ancestor replaced by a junction cannot redirect fingerprinting outside the repository', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-parent-'));
  try {
    const repo = await materialize(
      { branch: 'main', commit: true, files: [{ path: 'src/A.java', text: 'class A {}\n' }] },
      base,
    );
    const outside = join(base, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'A.java'), 'class Different {}\n');
    let swapped = false;
    await assert.rejects(
      observeWithDependencies(
        {
          repositoryId,
          startingPath: repo,
          workspaceRoot: base,
          config: { include: [], exclude: [] },
        },
        {
          fingerprintFile: async (absolutePath, path) => {
            if (!swapped) {
              await rename(join(repo, 'src'), join(repo, 'src-original'));
              await symlink(
                outside,
                join(repo, 'src'),
                process.platform === 'win32' ? 'junction' : 'dir',
              );
              swapped = true;
            }
            return fingerprintFile(absolutePath, path);
          },
        },
      ),
      hasCode('SOURCE_CHANGED'),
    );
    assert.equal(swapped, true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a selected ancestor cannot redirect into a denied in-repository secrets directory', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-secret-parent-'));
  try {
    const repo = await materialize(
      {
        branch: 'main',
        commit: true,
        files: [
          { path: 'src/A.java', text: 'class Public {}\n' },
          { path: 'secrets/A.java', text: 'class Private {}\n' },
        ],
      },
      base,
    );
    const request = {
      repositoryId,
      startingPath: repo,
      workspaceRoot: base,
      config: { include: [], exclude: [] },
    };
    await assert.rejects(
      observeWithDependencies(request, {
        fingerprintFile: async (absolutePath, path) => {
          await rename(join(repo, 'src'), join(repo, 'src-original'));
          await symlink(
            join(repo, 'secrets'),
            join(repo, 'src'),
            process.platform === 'win32' ? 'junction' : 'dir',
          );
          return fingerprintFile(absolutePath, path);
        },
      }),
      hasCode('SOURCE_CHANGED'),
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a HEAD change during observation cannot be accepted', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-head-race-'));
  try {
    const repo = await materialize(
      { branch: 'main', commit: true, files: [{ path: 'src/A.java', text: 'class A {}\n' }] },
      base,
    );
    const request = {
      repositoryId,
      startingPath: repo,
      workspaceRoot: base,
      config: { include: [], exclude: [] },
    };
    await assert.rejects(
      observeWithDependencies(request, {
        fingerprintFile: async (absolutePath, path) => {
          const value = await fingerprintFile(absolutePath, path);
          git(repo, [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.test',
            'commit',
            '--allow-empty',
            '-m',
            'head-changed',
          ]);
          return value;
        },
      }),
      hasCode('SOURCE_CHANGED'),
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test(
  'selected leaf symlinks cannot be fingerprinted',
  { skip: process.platform === 'win32' },
  async () => {
    const base = await mkdtemp(join(tmpdir(), 'codeatlas-fingerprint-leaf-link-'));
    try {
      const file = join(base, 'A.java');
      await writeFile(join(base, 'Original.java'), 'class A {}\n');
      await symlink(join(base, 'Original.java'), file, 'file');
      await assert.rejects(fingerprintFile(file, repoPath('A.java')), hasCode('SOURCE_CHANGED'));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  },
);
