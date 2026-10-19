import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as storage from '../../dist/index.js';
import { RepositoryPatchStage } from '../../dist/index.js';
import {
  mergeStagedAnalysis,
  validateNativeStateCandidate,
} from '../../../providers/dist/index.js';
import { selectMergedGroup } from '../../../providers/dist/fact-merger-selection.js';
import { collectMergeSupports } from '../../../providers/dist/fact-merger-input.js';
import { normalizeJavaNode } from '../../../providers/dist/java-node-normalizer.js';
import { baseCase, stateDigest } from '../../../providers/test/helpers/native-full-v3-corpus.mjs';
const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };

export async function emptyNativePatch(
  t,
  withSource = false,
  twoSources = false,
  retiredOwners = null,
  databasePath = ':memory:',
  otherProviderKind = null,
  normalizerVersion = '1',
) {
  const db = new DatabaseSync(databasePath);
  const plan = await storage.loadMigrationPlan(
    new URL('../../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  for (const migration of plan.migrations) db.exec(migration.sql);
  db.exec('PRAGMA user_version=10');
  db.prepare('INSERT INTO repository (slot,id,root_path) VALUES (1,?,?)').run('r', '/r');
  db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run('r');
  db.prepare(
    'INSERT INTO revisions (id,repository_id,kind,content_fingerprint) VALUES (?,?,?,?)',
  ).run('rev', 'r', 'WORKTREE', 'base');
  const fixture = baseCase(retiredOwners ? 'shared' : withSource ? 'empty' : 'zero-file');
  const bundle = fixture.bundle;
  bundle.header.normalizerVersion = normalizerVersion;
  // Component-only corpus: its deliberately nullable synthetic CU facts are
  // excluded from this owned test copy, just as in the Provider overlay suite.
  // Frozen corpus helpers/goldens and production normalizers stay unchanged.
  const nodes = retiredOwners
    ? fixture.nodes.filter((n) => n.providerKind !== 'java.compilation_unit')
    : [];
  if (retiredOwners) {
    for (const s of bundle.summaries)
      s.emittedFacts = s.emittedFacts.filter(
        (f) => !f.providerFactId.startsWith('java-compilation-unit-v1:'),
      );
    bundle.header.summaryDigest = stateDigest(bundle.summaries);
  }
  if (twoSources) {
    const second = structuredClone(bundle.summaries[0]);
    second.sourceFile.id = 'f-1';
    second.sourceFile.path = 'src/1.java';
    second.sourceFile.contentFingerprint = 'fp-1';
    second.coverage[0].sourceFileId = 'f-1';
    bundle.summaries.push(second);
    bundle.header.sourceFileCount = 2;
    bundle.header.summaryDigest = stateDigest(bundle.summaries);
  }
  const { schemaVersion, sourceFileCount, summaryDigest, ...expected } = bundle.header;
  const oldSnapshot = {
    id: 'snap',
    repositoryId: 'r',
    providerId: 'native',
    providerVersion: '0.0.0',
    runtimeVersion: '0.0.0',
    requestedRevisionId: 'rev',
    requestedRevisionFingerprint: 'base',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: [{ name: 'SYMBOL', support: 'SUPPORTED', coverage: 'COMPLETE' }],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  for (const s of bundle.summaries) {
    const f = s.sourceFile;
    db.prepare(
      `INSERT INTO source_files (revision_id,id,repository_id,path,content_fingerprint,role,provenance,content_kind,language_hint,sensitivity)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      f.revisionId,
      f.id,
      f.repositoryId,
      f.path,
      f.contentFingerprint,
      f.classification.role,
      f.classification.provenance,
      f.classification.contentKind,
      f.languageHint,
      f.sensitivity,
    );
  }
  const fullStage = new storage.RepositoryAnalysisStage(db, limits);
  const initialToken = storage.captureNativeActivationToken(db, 'r');
  try {
    for (const s of bundle.summaries) {
      await fullStage.accept({ type: 'SOURCE_FILE', payload: s.sourceFile });
      for (const coverage of s.coverage)
        await fullStage.accept({ type: 'COVERAGE', payload: coverage });
      await fullStage.acceptNativeSummary(s);
    }
    for (const node of nodes) {
      await fullStage.accept({ type: 'NODE', payload: node });
      fullStage.putNormalizedNode({
        provider: {
          factType: 'NODE',
          providerId: node.providerId,
          providerFactId: node.providerFactId,
        },
        canonical: normalizeJavaNode(node, new Map(fixture.sources.map((f) => [f.id, f]))),
      });
    }
    if (nodes.length) mergeStagedAnalysis(fullStage, oldSnapshot);
    fullStage.confirmSucceeded({
      type: 'ANALYSIS_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'r',
        revisionId: 'rev',
        revisionFingerprint: 'base',
        providerSnapshotId: 'snap',
        capabilities: oldSnapshot.capabilities,
        counts: {
          sourceFiles: bundle.summaries.length,
          nodes: nodes.length,
          edges: 0,
          coverage: bundle.summaries.length,
          diagnostics: 0,
        },
      },
    });
    fullStage.sealNativeState(
      JSON.stringify(bundle.header),
      expected,
      validateNativeStateCandidate,
      limits,
    );
    new storage.RepositoryCanonicalFactStore(db).applyNativeAnalysisBatch(
      fullStage,
      {
        repositoryId: 'r',
        revisionId: 'rev',
        contentFingerprint: 'base',
        snapshot: oldSnapshot,
      },
      initialToken,
    );
  } finally {
    fullStage.close();
  }
  // Component-only provenance seed, following canonical-fact-store.test.mjs.
  // Native graph/state above still comes through the real full Store writer.
  let otherSupport = null;
  if (otherProviderKind) {
    const node = nodes.find((n) =>
      otherProviderKind === 'source-less' ? n.sourceRange === null : n.sourceRange !== null,
    );
    assert.ok(node, `missing ${otherProviderKind} fixture node`);
    const canonical = normalizeJavaNode(node, new Map(fixture.sources.map((f) => [f.id, f])));
    const snapshot = { ...oldSnapshot, id: 'snap-other', providerId: 'z-other' };
    [otherSupport] = collectMergeSupports({
      repositoryId: 'r',
      revisionId: 'rev',
      observations: [
        {
          snapshot,
          nodes: [
            {
              provider: {
                factType: 'NODE',
                providerId: 'z-other',
                providerFactId: node.providerFactId,
              },
              canonical: {
                ...canonical,
                name: 'OtherProviderName',
                confidence: { ...canonical.confidence, score: 0.2 },
              },
            },
          ],
          edges: [],
        },
      ],
    });
    db.prepare(
      `INSERT INTO provider_snapshots
      (id,repository_id,provider_id,provider_version,runtime_version,requested_revision_id,
       requested_revision_fingerprint,started_at,completed_at,outcome)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      snapshot.id,
      'r',
      'z-other',
      snapshot.providerVersion,
      snapshot.runtimeVersion,
      'rev',
      'base',
      Date.parse(snapshot.startedAt),
      Date.parse(snapshot.completedAt),
      'SUCCEEDED',
    );
    db.prepare(
      `INSERT INTO evidence
      (id,repository_id,revision_id,provider_snapshot_id,fact_type,provider_id,provider_fact_id,status)
      VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      otherSupport.evidence.id,
      'r',
      'rev',
      snapshot.id,
      'NODE',
      'z-other',
      node.providerFactId,
      'ACTIVE',
    );
    db.prepare('INSERT INTO fact_evidence VALUES (?,?,?)').run(
      'NODE',
      canonical.id,
      otherSupport.evidence.id,
    );
    db.prepare('INSERT INTO provider_fact_bindings VALUES (?,?,?,?,?,?)').run(
      'NODE',
      'z-other',
      node.providerFactId,
      snapshot.id,
      canonical.id,
      otherSupport.evidence.id,
    );
    db.prepare('INSERT INTO active_support_candidates VALUES (?,?,?,?)').run(
      otherSupport.evidence.id,
      'NODE',
      canonical.id,
      JSON.stringify(otherSupport.canonical),
    );
  }
  const baseline = storage.readNativeAnalysisState(
    db,
    expected,
    validateNativeStateCandidate,
    limits,
  );
  assert.equal(baseline.status, 'AVAILABLE');
  const target = structuredClone(bundle);
  const removedNodes = [];
  if (retiredOwners) {
    target.summaries = target.summaries.filter((s) => !retiredOwners.includes(s.sourceFile.id));
    target.header.contentFingerprint = 'target';
    target.header.sourceFileCount = target.summaries.length;
    target.header.summaryDigest = stateDigest(target.summaries);
    for (const owner of retiredOwners) db.prepare('DELETE FROM source_files WHERE id=?').run(owner);
    db.prepare('UPDATE revisions SET content_fingerprint=? WHERE id=?').run('target', 'rev');
    const retainedIds = new Set(
      target.summaries.flatMap((s) => s.emittedFacts.map((f) => f.providerFactId)),
    );
    for (const node of nodes)
      if (!retainedIds.has(node.providerFactId))
        removedNodes.push({
          factType: 'NODE',
          providerId: 'native',
          providerFactId: node.providerFactId,
        });
  }
  const context = {
    baseline: structuredClone(baseline.state),
    targetSourceFiles: target.summaries.map((s) => s.sourceFile),
  };
  const stage = new RepositoryPatchStage(
    db,
    (group) => selectMergedGroup(group).fact,
    limits,
    context,
  );
  t.after(() => {
    stage.close();
    if (db.isOpen) db.close();
  });
  const snapshot = {
    ...oldSnapshot,
    id: 'snap-next',
    requestedRevisionFingerprint: target.header.contentFingerprint,
  };
  const terminal = {
    type: 'REFRESH_COMPLETED',
    payload: {
      outcome: 'SUCCEEDED',
      repositoryId: 'r',
      revisionId: 'rev',
      revisionFingerprint: target.header.contentFingerprint,
      providerSnapshotId: snapshot.id,
      capabilities: snapshot.capabilities,
      counts: {
        sourceFiles: 0,
        upsertedNodes: 0,
        removedNodes: removedNodes.length,
        upsertedEdges: 0,
        removedEdges: 0,
        coverage: target.summaries.length,
        diagnostics: 0,
      },
      summaryRecords: target.summaries.length,
      analysisState: target.header,
    },
  };
  for (const removal of removedNodes)
    await stage.acceptNativeEvent({ type: 'REMOVE_NODE', payload: removal });
  for (const s of target.summaries) {
    await stage.acceptNativeSummary(s);
    for (const coverage of s.coverage)
      await stage.acceptNativeEvent({ type: 'COVERAGE', payload: coverage });
  }
  return {
    db,
    stage,
    context,
    snapshot,
    terminal,
    expected: { ...expected, contentFingerprint: target.header.contentFingerprint },
    token: baseline.token,
    otherSupport,
  };
}
