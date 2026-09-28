import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';
import { executeNativeRequest, NativeClientError, summarizeNativeCoverage } from '../dist/index.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureRoot = path.join(repositoryRoot, 'fixtures/native');
const fixtureIds = [
  'java-coverage-mixed',
  'java-coverage-syntax',
  'java-coverage-unsupported-declaration',
  'java-coverage-unsupported',
  'java-coverage-zero',
];

function nativeBinaryPath() {
  const target = process.env.CARGO_TARGET_DIR;
  const root = target ? path.resolve(repositoryRoot, target) : path.join(repositoryRoot, 'target');
  return path.join(
    root,
    'debug',
    process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
  );
}

async function requestFor(fixture) {
  const sourceRoot = fixture.inputs.source;
  const names = (await readdir(path.join(sourceRoot, 'src')))
    .filter((name) => name.endsWith('.java'))
    .sort();
  const sourceFiles = await Promise.all(
    names.map(async (name) => {
      const source = await readFile(path.join(sourceRoot, 'src', name));
      return {
        id: `file-${name}`,
        repositoryId: 'repo-fixture',
        revisionId: 'rev-fixture',
        path: `src/${name}`,
        contentFingerprint: `sha256:${createHash('sha256').update(source).digest('hex')}`,
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: 'java',
        sensitivity: 'PUBLIC',
      };
    }),
  );
  return {
    protocolVersion: 2,
    requestId: `analyze-${fixture.manifest.id}`,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot-fixture',
      repository: { id: 'repo-fixture', rootPath: sourceRoot },
      requestedCapabilities: fixture.manifest.capabilities,
      deadlineEpochMs: null,
      resourceBudget: { maxDurationMs: 10_000, maxMemoryBytes: 64 * 1024 * 1024, maxEvents: 100 },
      revision: {
        id: 'rev-fixture',
        repositoryId: 'repo-fixture',
        contentFingerprint: 'sha256:revision-fixture',
        kind: 'WORKTREE',
        baseRevisionId: null,
      },
      sourceFiles,
    },
  };
}

function execute(request, workers = 1) {
  return executeNativeRequest(request, {
    executablePath: nativeBinaryPath(),
    arguments: ['--parse-workers', String(workers)],
    timeoutMs: 10_000,
  });
}

test('registered v2 Java Fixtures pin facts, coverage, diagnostics, outcomes and worker consistency', async () => {
  const fixtures = (await discoverFixtures(fixtureRoot)).filter((fixture) =>
    fixtureIds.includes(fixture.manifest.id),
  );
  assert.deepEqual(
    fixtures.map((fixture) => fixture.manifest.id),
    fixtureIds,
  );
  for (const fixture of fixtures) {
    const request = await requestFor(fixture);
    const one = await execute(request, 1);
    const two = await execute(request, 2);
    assert.deepEqual(one.events, two.events, `${fixture.manifest.id}/workers`);
    assert.equal(one.request.protocolVersion, 2);
    const summary = summarizeNativeCoverage(one);
    assert.equal(summary.statisticsAvailable, true);
    assert.equal(
      summary.files.length,
      request.payload.sourceFiles.length * request.payload.requestedCapabilities.length,
    );
    const actual = Object.fromEntries(
      [
        ['nodes', 'NODE'],
        ['edges', 'EDGE'],
        ['coverage', 'COVERAGE'],
        ['diagnostics', 'DIAGNOSTIC'],
      ].map(([name, type]) => [
        name,
        one.events.filter((event) => event.type === type).map((event) => event.payload),
      ]),
    );
    actual.terminal = one.terminal.payload;
    for (const name of ['nodes', 'edges', 'coverage', 'diagnostics', 'terminal']) {
      assert.deepEqual(
        actual[name],
        JSON.parse(await readFile(fixture.expected[name], 'utf8')),
        `${fixture.manifest.id}/${name}`,
      );
    }
    if (fixture.manifest.id === 'java-coverage-zero') {
      assert.equal(one.terminal.payload.outcome, 'SUCCEEDED');
      assert.ok(summary.files.every((file) => file.statistics.eligibleSites === 0));
    }
    if (fixture.manifest.id === 'java-coverage-syntax') {
      assert.equal(one.terminal.payload.outcome, 'PARTIAL');
      assert.ok(summary.warnings.some((warning) => warning.code === 'PARTIAL_COVERAGE'));
    }
    if (fixture.manifest.id === 'java-coverage-unsupported-declaration') {
      assert.equal(one.terminal.payload.outcome, 'PARTIAL');
      assert.ok(summary.warnings.some((warning) => warning.code === 'UNSUPPORTED_SITE'));
    }
    if (fixture.manifest.id === 'java-coverage-mixed') {
      const syntheticNodes = actual.nodes.filter((node) => node.sourceRange === null);
      assert.ok(syntheticNodes.length > 0);
      assert.ok(
        summary.files.find((file) => file.capability === 'SYMBOL').statistics.eligibleSites <
          actual.nodes.length,
      );
    }
  }
});

test('two-file source Fixture keeps v2 facts and statistics stable across worker counts', async () => {
  const fixtures = (await discoverFixtures(fixtureRoot)).filter(
    (fixture) => fixture.manifest.id === 'java-call-basic',
  );
  assert.equal(fixtures.length, 1);
  const request = await requestFor(fixtures[0]);
  assert.deepEqual(
    request.payload.sourceFiles.map((file) => file.path),
    ['src/A.java', 'src/B.java'],
  );
  const one = await execute(request, 1);
  const two = await execute(request, 2);
  assert.deepEqual(two.events, one.events);
  assert.deepEqual(summarizeNativeCoverage(two), summarizeNativeCoverage(one));
  assert.equal(
    summarizeNativeCoverage(two).files.length,
    request.payload.sourceFiles.length * request.payload.requestedCapabilities.length,
  );
});

test('v2 failed or corrupt real-binary streams release no applicable result', async () => {
  const fixtures = (await discoverFixtures(fixtureRoot)).filter(
    (fixture) => fixture.manifest.id === 'java-coverage-zero',
  );
  const request = await requestFor(fixtures[0]);
  for (const mutation of ['event-limit', 'stale-source']) {
    const invalid = structuredClone(request);
    if (mutation === 'event-limit') invalid.payload.resourceBudget.maxEvents = 2;
    else invalid.payload.sourceFiles[0].contentFingerprint = `sha256:${'0'.repeat(64)}`;
    const applied = [];
    await assert.rejects(
      execute(invalid).then((value) => applied.push(value)),
      (error) => {
        assert.ok(error instanceof NativeClientError);
        assert.equal('events' in error, false);
        return true;
      },
    );
    assert.deepEqual(applied, [], mutation);
  }
});
