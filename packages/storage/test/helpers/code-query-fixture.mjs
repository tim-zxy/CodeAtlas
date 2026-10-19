import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { applyAnalysisPatch, applyFullAnalysis } from '../../../application/dist/index.js';
import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  ProviderSnapshotSchema,
  SourceFileSchema,
} from '../../../ir/dist/index.js';
import { mergeStagedAnalysis } from '../../../providers/dist/index.js';
import { collectMergeSupports } from '../../../providers/dist/fact-merger-input.js';
import { selectMergedGroup } from '../../../providers/dist/fact-merger-selection.js';
import {
  RepositoryAnalysisStage,
  RepositoryCanonicalFactStore,
  RepositoryPatchStage,
  RepositorySourceStateStore,
  runMigrations,
} from '../../dist/index.js';

const fixtureRoot = new URL('../../../../fixtures/queries/code-query/', import.meta.url);
const observation = JSON.parse(
  await readFile(new URL('inputs/observation.json', fixtureRoot), 'utf8'),
);
const patch = JSON.parse(await readFile(new URL('inputs/patch.json', fixtureRoot), 'utf8'));
const confidence = { score: 1, method: 'fixture-observation', reasons: [] };
const manifestUrl = new URL('../../migrations/repository/manifest.json', import.meta.url);

function range(line, column = 0, endColumn = 1) {
  return {
    sourceFileId: observation.sourceFileId,
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn,
  };
}
// A deterministic test Provider declares opaque normalized IDs; this is not a
// Java extraction/identity benchmark. All facts still cross IR, merge and Apply.
function normalized(providerId, snapshotId) {
  const nodeRef = (id) => ({ factType: 'NODE', id: `query-node-${id}` });
  const providerRef = (id) => ({
    factType: 'NODE',
    providerId,
    providerFactId: `provider-node-${id}`,
  });
  const base = {
    repositoryId: observation.repositoryId,
    revisionId: observation.revisionId,
    confidence,
  };
  const nodes = observation.nodes.map((item) => {
    const canonical = CanonicalNodeSchema.parse({
      ...base,
      id: `query-node-${item.id}`,
      factKey: `query-node-key-${item.id}`,
      kind: item.kind,
      ...(item.kind === 'TYPE' ? { typeKind: item.subkind } : { symbolKind: item.subkind }),
      name: item.name,
      qualifiedName: item.qualifiedName,
      sourceRange: range(item.line, item.column, item.endColumn),
    });
    const provider = { factType: 'NODE', providerId, providerFactId: `provider-node-${item.id}` };
    const payload = {
      providerId,
      providerFactId: provider.providerFactId,
      providerSnapshotId: snapshotId,
      repositoryId: observation.repositoryId,
      revisionId: observation.revisionId,
      providerKind: `query-fixture.${item.kind}`,
      name: item.name,
      qualifiedName: item.qualifiedName,
      sourceRange: canonical.sourceRange,
      confidence,
    };
    return { provider, canonical, payload };
  });
  const edges = observation.edges.map((item) => {
    const target =
      item.target === undefined
        ? {
            state: 'UNRESOLVED',
            resolution: item.resolution,
            originalHint: item.hint,
            candidates: item.candidates.map(nodeRef),
          }
        : { state: 'RESOLVED', resolution: item.resolution, target: nodeRef(item.target) };
    const canonical = CanonicalEdgeSchema.parse({
      ...base,
      id: `query-edge-${item.id}`,
      factKey: `query-edge-key-${item.id}`,
      kind: item.kind,
      source: nodeRef(item.source),
      target,
      sourceRange: range(item.line),
    });
    const provider = { factType: 'EDGE', providerId, providerFactId: `provider-edge-${item.id}` };
    const payload = {
      providerId,
      providerFactId: provider.providerFactId,
      providerSnapshotId: snapshotId,
      repositoryId: observation.repositoryId,
      revisionId: observation.revisionId,
      providerKind: `query-fixture.${item.kind}`,
      source: providerRef(item.source),
      target:
        item.target === undefined
          ? {
              state: 'UNRESOLVED',
              resolution: item.resolution,
              originalHint: item.hint,
              candidates: item.candidates.map(providerRef),
            }
          : { state: 'RESOLVED', resolution: item.resolution, target: providerRef(item.target) },
      sourceRange: canonical.sourceRange,
      confidence,
    };
    return { provider, canonical, payload };
  });
  return { nodes, edges };
}

function snapshot(providerId, id, fingerprint, coverage = 'COMPLETE') {
  return ProviderSnapshotSchema.parse({
    id,
    repositoryId: observation.repositoryId,
    providerId,
    providerVersion: 'fixture-v1',
    runtimeVersion: 'fixture-v1',
    requestedRevisionId: observation.revisionId,
    requestedRevisionFingerprint: fingerprint,
    startedAt: '2026-10-13T00:00:00.000Z',
    completedAt: '2026-10-13T00:00:01.000Z',
    capabilities: [
      { name: 'SYMBOL', support: 'SUPPORTED', coverage },
      { name: 'CALL', support: 'SUPPORTED', coverage },
    ],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  });
}
function readState(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      db
        .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => ({ ...row }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]),
  );
}

export async function withCodeQueryDatabase(t, scenario, callback) {
  if (!['current', 'multi-provider', 'stale', 'not-indexed'].includes(scenario))
    throw new Error('Unknown query fixture scenario');
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-query-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'repository with spaces.sqlite');
  await runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl });
  const db = new DatabaseSync(databasePath);
  let beforeState;
  try {
    // Existing repository registration is test setup, never graph activation.
    db.prepare('INSERT INTO repository(slot,id,root_path) VALUES(1,?,?)').run(
      observation.repositoryId,
      directory,
    );
    db.prepare('INSERT INTO repository_state(repository_id) VALUES(?)').run(
      observation.repositoryId,
    );
    const sourceFile = SourceFileSchema.parse({
      id: observation.sourceFileId,
      repositoryId: observation.repositoryId,
      revisionId: observation.revisionId,
      path: observation.path,
      contentFingerprint: 'query-source-fingerprint',
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    });
    const source = new RepositorySourceStateStore(db);
    const revision = {
      id: observation.revisionId,
      repositoryId: observation.repositoryId,
      kind: 'WORKTREE',
      contentFingerprint: observation.fingerprint,
      baseRevisionId: null,
    };
    source.replace(null, { revision, files: [sourceFile] });
    const store = new RepositoryCanonicalFactStore(db);
    if (scenario !== 'not-indexed') {
      const facts = normalized(observation.providerId, observation.snapshotId);
      const run = snapshot(observation.providerId, observation.snapshotId, observation.fingerprint);
      const stage = new RepositoryAnalysisStage(db);
      try {
        await stage.accept({ type: 'SOURCE_FILE', payload: sourceFile });
        for (const item of facts.nodes) {
          await stage.accept({ type: 'NODE', payload: item.payload });
          stage.putNormalizedNode({ provider: item.provider, canonical: item.canonical });
        }
        for (const item of facts.edges) {
          await stage.accept({ type: 'EDGE', payload: item.payload });
          stage.putNormalizedEdge({ provider: item.provider, canonical: item.canonical });
        }
        for (const capability of run.capabilities)
          await stage.accept({
            type: 'COVERAGE',
            payload: {
              capability: capability.name,
              sourceFileId: sourceFile.id,
              coverage: capability.coverage,
            },
          });
        mergeStagedAnalysis(stage, run);
        stage.confirmSucceeded({
          type: 'ANALYSIS_COMPLETED',
          payload: {
            providerSnapshotId: run.id,
            repositoryId: run.repositoryId,
            revisionId: run.requestedRevisionId,
            revisionFingerprint: run.requestedRevisionFingerprint,
            capabilities: run.capabilities,
            outcome: 'SUCCEEDED',
            counts: { sourceFiles: 1, nodes: 8, edges: 12, coverage: 2, diagnostics: 0 },
          },
        });
        await applyFullAnalysis(
          {
            repositoryId: run.repositoryId,
            revisionId: run.requestedRevisionId,
            contentFingerprint: run.requestedRevisionFingerprint,
          },
          {
            observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot: run, stage }),
            factStore: store,
          },
        );
      } finally {
        stage.close();
      }
    }
    if (scenario === 'stale' || scenario === 'multi-provider') {
      source.replace(source.load(observation.repositoryId), {
        revision: { ...revision, contentFingerprint: patch.targetFingerprint },
        files: [sourceFile],
      });
    }
    if (scenario === 'multi-provider') {
      const facts = normalized(patch.providerId, patch.snapshotId);
      const run = snapshot(
        patch.providerId,
        patch.snapshotId,
        patch.targetFingerprint,
        patch.capabilityCoverage,
      );
      const stage = new RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
      try {
        for (const item of facts.nodes) {
          await stage.accept({ type: 'UPSERT_NODE', payload: item.payload });
          stage.putNormalizedNode({ provider: item.provider, canonical: item.canonical });
        }
        for (const item of facts.edges) {
          await stage.accept({ type: 'UPSERT_EDGE', payload: item.payload });
          stage.putNormalizedEdge({ provider: item.provider, canonical: item.canonical });
        }
        const supports = collectMergeSupports({
          repositoryId: observation.repositoryId,
          revisionId: observation.revisionId,
          observations: [
            {
              snapshot: run,
              nodes: facts.nodes.map(({ provider, canonical }) => ({ provider, canonical })),
              edges: facts.edges.map(({ provider, canonical }) => ({ provider, canonical })),
            },
          ],
        });
        for (const support of supports) stage.appendSupport(support);
        stage.confirmSucceeded({
          type: 'REFRESH_COMPLETED',
          payload: {
            providerSnapshotId: run.id,
            repositoryId: run.repositoryId,
            revisionId: run.requestedRevisionId,
            revisionFingerprint: run.requestedRevisionFingerprint,
            outcome: 'SUCCEEDED',
            counts: {
              sourceFiles: 0,
              upsertedNodes: 8,
              removedNodes: 0,
              upsertedEdges: 12,
              removedEdges: 0,
              coverage: 0,
              diagnostics: 0,
            },
          },
        });
        await applyAnalysisPatch(
          {
            repositoryId: observation.repositoryId,
            baseRevisionId: observation.revisionId,
            baseContentFingerprint: patch.baseFingerprint,
            targetRevisionId: observation.revisionId,
            targetContentFingerprint: patch.targetFingerprint,
          },
          {
            observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot: run, stage }),
            factStore: store,
          },
        );
      } finally {
        stage.close();
      }
    }
    beforeState = readState(db);
  } finally {
    db.close();
  }
  const symbolIds = Object.fromEntries(observation.nodes.map(({ id }) => [id, `query-node-${id}`]));
  await callback({ databasePath, repositoryId: observation.repositoryId, symbolIds, beforeState });
}
