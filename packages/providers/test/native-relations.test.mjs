import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';
import { executeNativeRequest, normalizeNativeAnalysis } from '../dist/index.js';
import { directCallMetrics } from './native-relation-metrics.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureRoot = path.join(repositoryRoot, 'fixtures/native');
const fixtureIds = ['java-call-basic', 'java-inheritance', 'java-overload', 'java-unresolved-call'];

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
  assert.ok(names.length > 0, fixture.manifest.id);
  const sourceFiles = await Promise.all(
    names.map(async (name) => {
      const relativePath = `src/${name}`;
      const source = await readFile(path.join(sourceRoot, relativePath));
      return {
        id: `file-${name}`,
        repositoryId: 'repo-fixture',
        revisionId: 'rev-fixture',
        path: relativePath,
        contentFingerprint: `sha256:${createHash('sha256').update(source).digest('hex')}`,
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: 'java',
        sensitivity: 'PUBLIC',
      };
    }),
  );
  return {
    protocolVersion: 1,
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

async function actualFor(fixture) {
  const request = await requestFor(fixture);
  const result = await executeNativeRequest(request, {
    executablePath: nativeBinaryPath(),
    arguments: ['--parse-workers', '1'],
    timeoutMs: request.payload.resourceBudget.maxDurationMs,
  });
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
  return {
    result,
    ...Object.fromEntries(
      [
        ['nodes', 'NODE'],
        ['edges', 'EDGE'],
        ['coverage', 'COVERAGE'],
        ['diagnostics', 'DIAGNOSTIC'],
      ].map(([name, type]) => [
        name,
        result.events.filter((event) => event.type === type).map((event) => event.payload),
      ]),
    ),
  };
}

test('real Native binary matches registered Java relation Fixtures and direct-call gates', async () => {
  const fixtures = (await discoverFixtures(fixtureRoot)).filter((fixture) =>
    fixtureIds.includes(fixture.manifest.id),
  );
  assert.deepEqual(
    fixtures.map((fixture) => fixture.manifest.id),
    fixtureIds,
  );
  const expectedCalls = [];
  const actualCalls = [];
  const criticalIds = [];
  for (const fixture of fixtures) {
    const actual = await actualFor(fixture);
    for (const name of ['nodes', 'edges', 'coverage', 'diagnostics']) {
      assert.deepEqual(
        actual[name],
        JSON.parse(await readFile(fixture.expected[name], 'utf8')),
        `${fixture.manifest.id}/${name}`,
      );
    }
    if (['java-overload', 'java-call-basic', 'java-inheritance'].includes(fixture.manifest.id)) {
      const normalized = normalizeNativeAnalysis(actual.result);
      assert.equal(normalized.nodes.length, actual.nodes.length, fixture.manifest.id);
      assert.equal(normalized.edges.length, actual.edges.length, fixture.manifest.id);
      assert.equal(
        normalized.edges.filter((pair) => pair.canonical.target.state === 'UNRESOLVED').length,
        actual.edges.filter((edge) => edge.target.state === 'UNRESOLVED').length,
        fixture.manifest.id,
      );
    }
    expectedCalls.push(...JSON.parse(await readFile(fixture.expected.edges, 'utf8')));
    actualCalls.push(...actual.edges);
    criticalIds.push(
      ...fixture.manifest.criticalFacts
        .filter((fact) => fact.type === 'EDGE' && fact.importance === 'CRITICAL')
        .map((fact) => fact.id),
    );
  }
  const metrics = directCallMetrics(expectedCalls, actualCalls, criticalIds);
  assert.ok(metrics.precision !== null && metrics.precision >= 0.95, JSON.stringify(metrics));
  assert.ok(metrics.recall !== null && metrics.recall >= 0.9, JSON.stringify(metrics));
});
