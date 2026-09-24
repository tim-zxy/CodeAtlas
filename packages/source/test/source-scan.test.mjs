import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';
import { EntityIdSchema } from '../../ir/dist/index.js';

import { classifyFile } from '../dist/classify.js';
import { SourceScanError } from '../dist/errors.js';
import { discoverGitContext, gitIgnoredPaths } from '../dist/git.js';
import { scanWithDependencies } from '../dist/scan.js';
import { scanGitRepository } from '../dist/index.js';
import { walkCandidates } from '../dist/walk.js';
import { git, hasCode, materialize, repoPath } from './helpers.mjs';

const fixtureRoot = fileURLToPath(new URL('../../../fixtures/source/', import.meta.url));
const repositoryId = EntityIdSchema.parse('registered-repository-1');

async function inDirectory(run) {
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-source-scan-'));
  try {
    await run(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

test('all three declared source Fixtures produce exact sorted inventories', async () => {
  const scanFixtureIds = new Set(['basic-java-repo', 'generated-vendor', 'gitignore']);
  const fixtures = (await discoverFixtures(fixtureRoot)).filter((fixture) =>
    scanFixtureIds.has(fixture.manifest.id),
  );
  assert.deepEqual(
    fixtures.map((fixture) => fixture.manifest.id),
    ['basic-java-repo', 'generated-vendor', 'gitignore'],
  );
  for (const fixture of fixtures) {
    await inDirectory(async (base) => {
      const setup = JSON.parse(await readFile(fixture.inputs.setup, 'utf8'));
      const expected = JSON.parse(await readFile(fixture.expected.inventory, 'utf8'));
      const repo = await materialize(setup, base);
      const workspaceRoot =
        fixture.manifest.id === 'basic-java-repo' ? join(base, 'workspace') : base;
      if (workspaceRoot !== base) await mkdir(workspaceRoot);
      const result = await scanGitRepository({
        repositoryId,
        startingPath: repo,
        workspaceRoot,
        config: setup.config,
      });
      assert.equal(result.repositoryId, repositoryId);
      assert.equal(result.branchName, 'main');
      assert.equal(result.headCommit, git(repo, ['rev-parse', 'HEAD']).trim());
      if (fixture.manifest.id === 'basic-java-repo') {
        assert.deepEqual(result.workspacePosition, { kind: 'EXTERNAL' });
      }
      assert.deepEqual(
        result.files.map((file) => file.path),
        expected.paths,
        fixture.manifest.id,
      );
      for (const file of result.files) {
        assert.deepEqual(
          { languageHint: file.languageHint, classification: file.classification },
          expected.files[file.path],
          `${fixture.manifest.id}: ${file.path}`,
        );
        assert.ok(Object.isFrozen(file) && Object.isFrozen(file.classification));
      }
      assert.ok(Object.isFrozen(result) && Object.isFrozen(result.files));
    });
  }
});

test('public scan rejects non-Git and malformed configuration with typed errors', async () =>
  inDirectory(async (base) => {
    const plain = join(base, 'plain');
    await mkdir(plain);
    const request = {
      repositoryId,
      startingPath: plain,
      workspaceRoot: base,
      config: { include: [], exclude: [] },
    };
    await assert.rejects(scanGitRepository(request), hasCode('NON_GIT_DIRECTORY'));
    await assert.rejects(
      scanGitRepository({ ...request, repositoryId: ' ' }),
      hasCode('INVALID_INPUT'),
    );
    await assert.rejects(
      scanGitRepository({ ...request, config: { include: ['../escape'], exclude: [] } }),
      hasCode('INVALID_INPUT'),
    );
    await assert.rejects(scanGitRepository(undefined), hasCode('INVALID_INPUT'));
    await assert.rejects(
      scanGitRepository({ ...request, config: { include: Array(1), exclude: [] } }),
      hasCode('INVALID_INPUT'),
    );
  }));

test('scan discards buffered and classified observations when later traversal fails', async () =>
  inDirectory(async (base) => {
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
    const dependencies = {
      discoverGitContext,
      gitIgnoredPaths: async () => new Set(),
      walkCandidates: async function* () {
        for (let index = 0; index < 128; index += 1) {
          yield { absolutePath: join(repo, 'src', 'A.java'), path: repoPath('src/A.java') };
        }
        throw new SourceScanError('SOURCE_CHANGED', 'Source entry changed during scan');
      },
      classifyFile: async () => ({
        languageHint: 'java',
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      }),
    };
    await assert.rejects(scanWithDependencies(request, dependencies), hasCode('SOURCE_CHANGED'));
  }));

test('internal dependency seam uses the same real components as the public entry point', async () =>
  inDirectory(async (base) => {
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
    const expected = await scanGitRepository(request);
    const actual = await scanWithDependencies(request, {
      discoverGitContext,
      gitIgnoredPaths,
      walkCandidates,
      classifyFile,
    });
    assert.deepEqual(actual, expected);
  }));
