import { openR010FixtureDatabase } from './r011-history-fixture.mjs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
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
  RepositoryPatchStage,
  RepositoryCanonicalFactStore,
} from '../../dist/index.js';
import {
  cases,
  reference,
  readPlan,
} from '../../../../fixtures/phase1/code-context-capture/authoring.mjs';

export { cases };
export async function captureFixture(t, id, options = {}) {
  const sample = structuredClone(cases.find((c) => c.id === id));
  if (!sample) throw new Error('Unknown capture fixture');
  options.mutateSample?.(sample);
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-code-capture-'));
  let session;
  t.after(async () => {
    if (session?.database.isOpen) session.close();
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('codeatlas-code-capture-'));
    await rm(directory, { recursive: true, force: true });
  });
  const root = join(directory, 'repository');
  await mkdir(root);
  const rootPath = await realpath(root),
    databasePath = join(directory, 'repository.sqlite');
  // Freeze independent root-dependent expected before the first capture.
  const literal = JSON.parse(
    readFileSync(
      new URL(
        '../../../../fixtures/phase1/code-context-capture/expected/views.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )[sample.id];
  const dynamic = reference(sample, rootPath);
  if (!options.mutateSample)
    assert.deepEqual(
      { ...dynamic.view, repositoryLocatorDigest: literal.repositoryLocatorDigest },
      literal,
    );
  const expected = {
    ...dynamic,
    view: options.mutateSample
      ? dynamic.view
      : { ...literal, repositoryLocatorDigest: dynamic.view.repositoryLocatorDigest },
  };
  const plan = readPlan(sample, rootPath);
  const bytes = JSON.stringify({ ...expected, readPlan: plan }, null, 2) + '\n';
  await writeFile(join(directory, 'independent-expected.json'), bytes, { flag: 'wx' });
  await writeFile(
    join(directory, 'independent-expected.sha256'),
    createHash('sha256').update(bytes).digest('hex') + '\n',
    { flag: 'wx' },
  );
  session = await openR010FixtureDatabase(databasePath, sample.repository.id, rootPath);
  if (sample.revision)
    session.sourceState.replace(null, {
      revision: sample.revision,
      files: sample.files.map((f) => SourceFileSchema.parse(f)),
    });
  const db = session.database;
  async function applyRun(run, index, database = db) {
    const store = new RepositoryCanonicalFactStore(database);
    const snapshot = ProviderSnapshotSchema.parse(run.snapshot);
    const nodes = run.nodes.map((p) => ({
      ...p,
      canonical: CanonicalNodeSchema.parse(p.canonical),
    }));
    const edges = run.edges.map((p) => ({
      ...p,
      canonical: CanonicalEdgeSchema.parse(p.canonical),
    }));
    if (options.reverseInputOrder) {
      nodes.reverse();
      edges.reverse();
    }
    const full = index === 0;
    const stage = full
      ? new RepositoryAnalysisStage(database)
      : new RepositoryPatchStage(database, (g) => selectMergedGroup(g).fact);
    const payload = (p, factType) => {
      const c = p.canonical;
      return {
        providerId: p.provider.providerId,
        providerFactId: p.provider.providerFactId,
        providerSnapshotId: snapshot.id,
        repositoryId: c.repositoryId,
        revisionId: c.revisionId,
        providerKind: 'capture-fixture.' + c.kind,
        ...(factType === 'NODE'
          ? { name: c.name, qualifiedName: c.qualifiedName }
          : {
              source: {
                factType: 'NODE',
                providerId: snapshot.providerId,
                providerFactId: 'provider:' + c.source.id,
              },
              target:
                c.target.state === 'RESOLVED'
                  ? {
                      state: 'RESOLVED',
                      resolution: c.target.resolution,
                      target: {
                        factType: 'NODE',
                        providerId: snapshot.providerId,
                        providerFactId: 'provider:' + c.target.target.id,
                      },
                    }
                  : {
                      state: 'UNRESOLVED',
                      resolution: c.target.resolution,
                      originalHint: c.target.originalHint,
                      candidates: c.target.candidates.map((r) => ({
                        factType: 'NODE',
                        providerId: snapshot.providerId,
                        providerFactId: 'provider:' + r.id,
                      })),
                    },
            }),
        sourceRange: c.sourceRange,
        confidence: c.confidence,
      };
    };
    try {
      if (full)
        for (const f of sample.files) await stage.accept({ type: 'SOURCE_FILE', payload: f });
      for (const p of nodes) {
        await stage.accept({ type: full ? 'NODE' : 'UPSERT_NODE', payload: payload(p, 'NODE') });
        stage.putNormalizedNode(p);
      }
      for (const p of edges) {
        await stage.accept({ type: full ? 'EDGE' : 'UPSERT_EDGE', payload: payload(p, 'EDGE') });
        stage.putNormalizedEdge(p);
      }
      for (const c of run.coverage)
        await stage.accept({
          type: 'COVERAGE',
          payload: full ? c : { ...c, support: 'SUPPORTED' },
        });
      if (full) mergeStagedAnalysis(stage, snapshot);
      else
        for (const support of collectMergeSupports({
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          observations: [{ snapshot, nodes, edges }],
        }))
          stage.appendSupport(support);
      stage.confirmSucceeded({
        type: full ? 'ANALYSIS_COMPLETED' : 'REFRESH_COMPLETED',
        payload: {
          providerSnapshotId: snapshot.id,
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: snapshot.requestedRevisionFingerprint,
          ...(full ? { capabilities: snapshot.capabilities } : {}),
          outcome: 'SUCCEEDED',
          counts: full
            ? {
                sourceFiles: sample.files.length,
                nodes: nodes.length,
                edges: edges.length,
                coverage: run.coverage.length,
                diagnostics: 0,
              }
            : {
                sourceFiles: 0,
                upsertedNodes: nodes.length,
                removedNodes: 0,
                upsertedEdges: edges.length,
                removedEdges: 0,
                coverage: run.coverage.length,
                diagnostics: 0,
              },
        },
      });
      if (full)
        await applyFullAnalysis(
          {
            repositoryId: snapshot.repositoryId,
            revisionId: snapshot.requestedRevisionId,
            contentFingerprint: snapshot.requestedRevisionFingerprint,
          },
          {
            observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
            factStore: store,
          },
        );
      else {
        const previous = sample.runs[index - 1].snapshot;
        await applyAnalysisPatch(
          {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: previous.requestedRevisionId,
            baseContentFingerprint: previous.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: snapshot.requestedRevisionFingerprint,
          },
          {
            observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
            factStore: store,
          },
        );
      }
    } finally {
      stage.close();
    }
  }
  // Stale Source is created AFTER the last successful Code activation.
  if (
    sample.runs.length &&
    sample.revision.contentFingerprint !== sample.runs[0].snapshot.requestedRevisionFingerprint
  ) {
    const current = session.sourceState.load(sample.repository.id);
    session.sourceState.replace(current, {
      revision: {
        ...sample.revision,
        contentFingerprint: sample.runs[0].snapshot.requestedRevisionFingerprint,
      },
      files: sample.files,
    });
  }
  for (const [i, run] of sample.runs.entries()) await applyRun(run, i);
  if (
    sample.runs.length &&
    sample.revision.contentFingerprint !== sample.runs.at(-1).snapshot.requestedRevisionFingerprint
  )
    session.sourceState.replace(session.sourceState.load(sample.repository.id), {
      revision: sample.revision,
      files: sample.files,
    });
  return {
    sample,
    limits: plan.limits,
    readPlan: plan,
    db,
    session,
    expected: expected.view,
    transcripts: expected.transcripts,
    rootPath,
    directory,
    databasePath,
    applyRun,
  };
}
