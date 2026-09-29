import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { RepositoryAnalysisStage } from '../../storage/dist/index.js';
import { collectMergeSupports } from '../dist/fact-merger-input.js';
import {
  finalizeStagedSupports,
  mergeCanonicalObservations,
  mergeStagedAnalysis,
  normalizeNativeAnalysis,
  normalizeStagedAnalysis,
} from '../dist/index.js';

const result = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/normalization/canonical-normalization/inputs/result.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

test('staged normalization matches the canonical Fixture with edges before nodes', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db);
  const events = result.events.filter((event) =>
    ['SOURCE_FILE', 'NODE', 'EDGE'].includes(event.type),
  );
  const edges = events.filter((event) => event.type === 'EDGE');
  const others = events.filter((event) => event.type !== 'EDGE');
  for (const event of [...edges, ...others]) await stage.accept(event);
  normalizeStagedAnalysis(stage, result.request);
  const expected = normalizeNativeAnalysis(result);
  assert.deepEqual([...stage.readNormalizedNodes()], expected.nodes);
  assert.deepEqual([...stage.readNormalizedEdges()], expected.edges);
  stage.close();
  db.close();
});

test('staged support grouping matches the registered two-provider selection Fixture', async () => {
  const recipe = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/normalization/two-provider-same-call/inputs/analysis.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const base = normalizeNativeAnalysis(result);
  const observations = recipe.observations.map(({ snapshot, nodeFactIds, edgeFactIds, score }) => ({
    snapshot,
    nodes: base.nodes
      .filter((pair) => nodeFactIds.includes(pair.provider.providerFactId))
      .map((pair) => ({
        provider: { ...pair.provider, providerId: snapshot.providerId },
        canonical: {
          ...pair.canonical,
          confidence: { score, method: snapshot.providerId, reasons: [] },
        },
      })),
    edges: base.edges
      .filter((pair) => edgeFactIds.includes(pair.provider.providerFactId))
      .map((pair) => ({
        provider: { ...pair.provider, providerId: snapshot.providerId },
        canonical: {
          ...pair.canonical,
          confidence: { score, method: snapshot.providerId, reasons: [] },
        },
      })),
  }));
  const input = { repositoryId: recipe.repositoryId, revisionId: recipe.revisionId, observations };
  const expected = mergeCanonicalObservations(input);
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db);
  for (const support of collectMergeSupports(input)) stage.appendSupport(support);
  finalizeStagedSupports(stage);
  for (const [kind, field] of [
    ['NODE', 'nodes'],
    ['EDGE', 'edges'],
    ['EVIDENCE', 'evidence'],
    ['FACT_EVIDENCE', 'factEvidence'],
    ['BINDING', 'bindings'],
  ]) {
    assert.deepEqual(
      [...stage.readMergedRows(kind)].map((row) => row.value),
      expected[field],
    );
  }
  stage.close();
  db.close();
});

test('zero-fact staged normalization yields no canonical rows', () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db);
  normalizeStagedAnalysis(stage, result.request);
  assert.deepEqual([...stage.readNormalizedNodes()], []);
  assert.deepEqual([...stage.readNormalizedEdges()], []);
  stage.close();
  db.close();
});

test('staged merge preserves one-provider canonical facts and support identities', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db);
  for (const event of result.events) {
    if (['SOURCE_FILE', 'NODE', 'EDGE'].includes(event.type)) await stage.accept(event);
  }
  normalizeStagedAnalysis(stage, result.request);
  const snapshot = {
    id: result.request.payload.providerSnapshotId,
    repositoryId: result.request.payload.repository.id,
    providerId: 'native',
    providerVersion: '1',
    runtimeVersion: '1',
    requestedRevisionId: result.request.payload.revision.id,
    requestedRevisionFingerprint: result.request.payload.revision.contentFingerprint,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: [],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  mergeStagedAnalysis(stage, snapshot);
  const normalized = normalizeNativeAnalysis(result);
  const expected = mergeCanonicalObservations({
    repositoryId: snapshot.repositoryId,
    revisionId: snapshot.requestedRevisionId,
    observations: [{ snapshot, nodes: normalized.nodes, edges: normalized.edges }],
  });
  for (const [kind, field] of [
    ['NODE', 'nodes'],
    ['EDGE', 'edges'],
    ['EVIDENCE', 'evidence'],
    ['FACT_EVIDENCE', 'factEvidence'],
    ['BINDING', 'bindings'],
  ]) {
    assert.deepEqual(
      [...stage.readMergedRows(kind)].map((row) => row.value),
      expected[field],
    );
  }
  stage.close();
  db.close();
});

test('staged normalization rejects a dangling edge even when it arrived first', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db);
  const edge = result.events.find((event) => event.type === 'EDGE');
  await stage.accept(edge);
  for (const event of result.events.filter((entry) => entry.type === 'SOURCE_FILE')) {
    await stage.accept(event);
  }
  assert.throws(() => normalizeStagedAnalysis(stage, result.request));
  assert.deepEqual([...stage.readNormalizedEdges()], []);
  stage.close();
  db.close();
});
