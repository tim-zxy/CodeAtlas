import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { hasCode, materialize, repoPath } from './helpers.mjs';

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
