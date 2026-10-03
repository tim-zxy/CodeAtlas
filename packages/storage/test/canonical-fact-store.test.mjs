import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { mergeStagedAnalysis, normalizeStagedAnalysis } from '../../providers/dist/index.js';
import { normalizeNativeAnalysis } from '../../providers/dist/index.js';
import { collectMergeSupports } from '../../providers/dist/fact-merger-input.js';
import { selectMergedGroup } from '../../providers/dist/fact-merger-selection.js';
import { normalizeJavaNode } from '../../providers/dist/java-node-normalizer.js';
import { normalizeJavaEdge } from '../../providers/dist/canonical-normalizer.js';
import {
  RepositoryAnalysisStage,
  RepositoryPatchStage,
  RepositoryCanonicalFactStore,
  runMigrations,
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
const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);

async function withDatabase(run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-fact-store-'));
  const path = join(directory, 'repo.sqlite');
  try {
    await runMigrations({ databasePath: path, databaseKind: 'REPOSITORY', manifestUrl });
    const db = new DatabaseSync(path);
    try {
      const request = result.request;
      db.prepare('INSERT INTO repository (slot, id, root_path) VALUES (1, ?, ?)').run(
        request.payload.repository.id,
        request.payload.repository.rootPath,
      );
      db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run(
        request.payload.repository.id,
      );
      db.prepare(
        'INSERT INTO revisions (id, repository_id, kind, content_fingerprint) VALUES (?, ?, ?, ?)',
      ).run(
        request.payload.revision.id,
        request.payload.repository.id,
        request.payload.revision.kind,
        request.payload.revision.contentFingerprint,
      );
      const insert = db.prepare(`INSERT INTO source_files
        (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, language_hint, sensitivity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const file of request.payload.sourceFiles)
        insert.run(
          file.revisionId,
          file.id,
          file.repositoryId,
          file.path,
          file.contentFingerprint,
          file.classification.role,
          file.classification.provenance,
          file.classification.contentKind,
          file.languageHint,
          file.sensitivity,
        );
      await run(db, path);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function candidate(db, snapshotId, fingerprint, options = {}) {
  const stage = new RepositoryAnalysisStage(db);
  const request = result.request;
  for (const original of result.events) {
    if (['SOURCE_FILE', 'NODE', 'EDGE', 'COVERAGE', 'DIAGNOSTIC'].includes(original.type)) {
      const event = structuredClone(original);
      if (event.payload?.providerSnapshotId) event.payload.providerSnapshotId = snapshotId;
      if (event.type === 'COVERAGE' && options.danglingCoverage) {
        event.payload.sourceFileId = 'missing-source';
      }
      await stage.accept(event);
    }
  }
  if (options.diagnostic) {
    await stage.accept({ type: 'DIAGNOSTIC', payload: options.diagnostic });
  }
  normalizeStagedAnalysis(stage, request);
  const snapshot = {
    id: snapshotId,
    repositoryId: request.payload.repository.id,
    providerId: 'native',
    providerVersion: '1',
    runtimeVersion: '1',
    requestedRevisionId: request.payload.revision.id,
    requestedRevisionFingerprint: fingerprint,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: result.terminal.payload.capabilities,
    diagnostics: options.diagnostic ? [options.diagnostic] : [],
    outcome: 'SUCCEEDED',
  };
  mergeStagedAnalysis(stage, snapshot);
  const terminal = structuredClone(result.terminal);
  terminal.payload.providerSnapshotId = snapshotId;
  terminal.payload.revisionFingerprint = fingerprint;
  if (options.diagnostic) terminal.payload.counts.diagnostics++;
  stage.confirmSucceeded(terminal);
  return { stage, snapshot };
}

function graph(db) {
  return Object.fromEntries(
    [
      'repository_state',
      'canonical_nodes',
      'canonical_edges',
      'evidence',
      'fact_evidence',
      'provider_fact_bindings',
      'active_support_candidates',
      'provider_snapshots',
    ].map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
  );
}

test('full apply refuses same-fingerprint source classification drift without publication', async () => {
  await withDatabase(async (db) => {
    const prepared = await candidate(
      db,
      'classification-drift',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      db.prepare('UPDATE source_files SET sensitivity=? WHERE id=?').run(
        'SECRET',
        result.request.payload.sourceFiles[0].id,
      );
      const before = graph(db);
      assert.throws(
        () =>
          new RepositoryCanonicalFactStore(db).applyAnalysisBatch(prepared.stage, {
            repositoryId: prepared.snapshot.repositoryId,
            revisionId: prepared.snapshot.requestedRevisionId,
            contentFingerprint: prepared.snapshot.requestedRevisionFingerprint,
            snapshot: prepared.snapshot,
          }),
        /source.*differs/i,
      );
      assert.deepEqual(graph(db), before);
      assert.equal(db.isTransaction, false);
    } finally {
      prepared.stage.close();
    }
  });
});
test('patch stage rejects support whose Evidence names a different Provider Fact', async () => {
  await withDatabase(async (db) => {
    const initial = await candidate(
      db,
      'snapshot-identity-base',
      result.request.payload.revision.contentFingerprint,
    );
    const [group] = initial.stage.readSupportGroups();
    const support = group[0];
    initial.stage.close();
    const stage = new RepositoryPatchStage(db, (items) => items[0].canonical);
    try {
      assert.throws(
        () =>
          stage.appendSupport({
            ...support,
            evidence: {
              ...support.evidence,
              providerFact: {
                ...support.evidence.providerFact,
                providerFactId: 'different-provider-fact',
              },
            },
          }),
        /identity|Provider Fact/i,
      );
      assert.deepEqual([...stage.readSupports()], []);
    } finally {
      stage.close();
    }
  });
});

test('patch apply activates a successful zero-event same-WORKTREE refresh atomically', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-initial',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const before = graph(db);
    const base = result.request.payload.revision.contentFingerprint;
    const target = 'sha256:revision-fixture-next';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-patch-zero',
      requestedRevisionFingerprint: target,
    };
    try {
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: base,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      const after = graph(db);
      assert.deepEqual(after.canonical_nodes, before.canonical_nodes);
      assert.deepEqual(after.canonical_edges, before.canonical_edges);
      assert.deepEqual(after.evidence, before.evidence);
      assert.deepEqual(after.provider_fact_bindings, before.provider_fact_bindings);
      assert.equal(after.repository_state[0].indexed_content_fingerprint, target);
      assert.equal(after.provider_snapshots.length, before.provider_snapshots.length + 1);
      assert.throws(
        () =>
          store.applyAnalysisPatch(stage, {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: base,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: target,
            snapshot,
          }),
        (error) => error.code === 'BASE_REVISION_MISMATCH',
      );
      assert.deepEqual(graph(db), after);
    } finally {
      stage.close();
    }
  });
});

test('patch apply rejects a dangling active FactEvidence link without advancing activation', async () => {
  await withDatabase(async (db, path) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-dangling-link-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const active = db
      .prepare("SELECT id FROM evidence WHERE status = 'ACTIVE' AND fact_type = 'NODE' LIMIT 1")
      .get();
    assert.ok(active);
    db.prepare(
      'INSERT INTO fact_evidence (fact_type, canonical_fact_id, evidence_id) VALUES (?, ?, ?)',
    ).run('NODE', 'missing-canonical-node', active.id);
    const target = 'sha256:revision-dangling-link';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const before = graph(db);
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-dangling-link-patch',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    try {
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      assert.throws(
        () =>
          store.applyAnalysisPatch(stage, {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: target,
            snapshot,
          }),
        (error) => error.code === 'FULL_ANALYSIS_REQUIRED',
      );
      assert.deepEqual(graph(db), before);
      const reopened = new DatabaseSync(path);
      try {
        assert.deepEqual(graph(reopened), before);
      } finally {
        reopened.close();
      }
    } finally {
      stage.close();
    }
  });
});

test('patch apply rejects stale base, changed revision, immutable target, and legacy candidates without mutation', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-fallback-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const base = result.request.payload.revision.contentFingerprint;
    const target = 'sha256:revision-fixture-next';
    const revisionId = initial.snapshot.requestedRevisionId;
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(target, revisionId);
    const before = graph(db);
    let serial = 0;
    const attempt = (overrides = {}) => {
      const snapshot = {
        ...initial.snapshot,
        id: `snapshot-fallback-${serial++}`,
        requestedRevisionId: overrides.targetRevisionId ?? revisionId,
        requestedRevisionFingerprint: target,
      };
      const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
      try {
        stage.confirmSucceeded({
          type: 'REFRESH_COMPLETED',
          payload: {
            repositoryId: snapshot.repositoryId,
            revisionId: snapshot.requestedRevisionId,
            revisionFingerprint: target,
            providerSnapshotId: snapshot.id,
            outcome: 'SUCCEEDED',
            counts: {
              sourceFiles: 0,
              upsertedNodes: 0,
              removedNodes: 0,
              upsertedEdges: 0,
              removedEdges: 0,
              coverage: 0,
              diagnostics: 0,
            },
          },
        });
        assert.throws(
          () =>
            store.applyAnalysisPatch(stage, {
              repositoryId: snapshot.repositoryId,
              baseRevisionId: revisionId,
              baseContentFingerprint: overrides.baseContentFingerprint ?? base,
              targetRevisionId: snapshot.requestedRevisionId,
              targetContentFingerprint: target,
              snapshot,
            }),
          (error) => error.code === overrides.code,
        );
        assert.deepEqual(graph(db), before);
      } finally {
        stage.close();
      }
    };
    attempt({ baseContentFingerprint: 'sha256:wrong-base', code: 'BASE_REVISION_MISMATCH' });
    db.prepare(
      'INSERT INTO revisions (id, repository_id, kind, content_fingerprint) VALUES (?, ?, ?, ?)',
    ).run('other-revision', initial.snapshot.repositoryId, 'WORKTREE', target);
    attempt({ targetRevisionId: 'other-revision', code: 'FULL_ANALYSIS_REQUIRED' });
    db.prepare('UPDATE revisions SET kind = ? WHERE id = ?').run('SNAPSHOT', revisionId);
    attempt({ code: 'FULL_ANALYSIS_REQUIRED' });
    db.prepare('UPDATE revisions SET kind = ? WHERE id = ?').run('WORKTREE', revisionId);
    db.exec('DELETE FROM active_support_candidates');
    const legacy = graph(db);
    // The baseline for this case includes the deliberately migrated-but-unbackfilled state.
    assert.throws(
      () => {
        const snapshot = {
          ...initial.snapshot,
          id: 'snapshot-legacy',
          requestedRevisionFingerprint: target,
        };
        const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
        try {
          stage.confirmSucceeded({
            type: 'REFRESH_COMPLETED',
            payload: {
              repositoryId: snapshot.repositoryId,
              revisionId,
              revisionFingerprint: target,
              providerSnapshotId: snapshot.id,
              outcome: 'SUCCEEDED',
              counts: {
                sourceFiles: 0,
                upsertedNodes: 0,
                removedNodes: 0,
                upsertedEdges: 0,
                removedEdges: 0,
                coverage: 0,
                diagnostics: 0,
              },
            },
          });
          store.applyAnalysisPatch(stage, {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: revisionId,
            baseContentFingerprint: base,
            targetRevisionId: revisionId,
            targetContentFingerprint: target,
            snapshot,
          });
        } finally {
          stage.close();
        }
      },
      (error) => error.code === 'FULL_ANALYSIS_REQUIRED',
    );
    assert.deepEqual(graph(db), legacy);
  });
});

test('patch apply invalidates one removed Provider edge and deletes its last-supported fact', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-remove-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const old = db
      .prepare(
        `SELECT binding.provider_id, binding.provider_fact_id, binding.canonical_fact_id,
      binding.evidence_id FROM provider_fact_bindings AS binding WHERE binding.fact_type = 'EDGE' LIMIT 1`,
      )
      .get();
    assert.ok(old);
    const before = graph(db);
    const target = 'sha256:revision-fixture-remove';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-remove-patch',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    try {
      await stage.accept({
        type: 'REMOVE_EDGE',
        payload: {
          factType: 'EDGE',
          providerId: old.provider_id,
          providerFactId: old.provider_fact_id,
        },
      });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 1,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      const after = graph(db);
      assert.equal(after.canonical_edges.length, before.canonical_edges.length - 1);
      assert.equal(after.provider_fact_bindings.length, before.provider_fact_bindings.length - 1);
      assert.equal(
        after.active_support_candidates.length,
        before.active_support_candidates.length - 1,
      );
      assert.equal(
        db.prepare('SELECT status FROM evidence WHERE id = ?').get(old.evidence_id).status,
        'INVALIDATED',
      );
      assert.equal(after.repository_state[0].indexed_content_fingerprint, target);
    } finally {
      stage.close();
    }
  });
});

test('patch apply removes a last-supported node with no dependent edges', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-remove-node-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const old = db
      .prepare(
        `SELECT binding.canonical_fact_id, binding.evidence_id,
      binding.provider_id, binding.provider_fact_id FROM provider_fact_bindings AS binding
      WHERE binding.fact_type = 'NODE' AND NOT EXISTS (
        SELECT 1 FROM canonical_edges AS edge
        WHERE edge.source_node_id = binding.canonical_fact_id
          OR edge.target_node_id = binding.canonical_fact_id)
        AND (SELECT count(*) FROM provider_fact_bindings AS peer
          WHERE peer.fact_type = 'NODE' AND peer.canonical_fact_id = binding.canonical_fact_id) = 1
      LIMIT 1`,
      )
      .get();
    assert.ok(old);
    assert.equal(
      db
        .prepare(
          `SELECT count(*) AS n FROM canonical_edges
      WHERE source_node_id = ? OR target_node_id = ?`,
        )
        .get(old.canonical_fact_id, old.canonical_fact_id).n,
      0,
    );
    const before = graph(db);
    const target = 'sha256:revision-fixture-remove-node';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-remove-node-patch',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    try {
      await stage.accept({
        type: 'REMOVE_NODE',
        payload: {
          factType: 'NODE',
          providerId: old.provider_id,
          providerFactId: old.provider_fact_id,
        },
      });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 1,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      assert.equal(graph(db).canonical_nodes.length, before.canonical_nodes.length - 1);
      assert.equal(
        db.prepare('SELECT status FROM evidence WHERE id = ?').get(old.evidence_id).status,
        'INVALIDATED',
      );
    } finally {
      stage.close();
    }
  });
});

test('patch apply supersedes an upserted Provider edge with a new Evidence candidate', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-upsert-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const normalized = normalizeNativeAnalysis(result);
    const pair = normalized.edges[0];
    const old = db
      .prepare(
        `SELECT evidence_id FROM provider_fact_bindings
      WHERE fact_type = 'EDGE' AND provider_id = ? AND provider_fact_id = ?`,
      )
      .get(pair.provider.providerId, pair.provider.providerFactId);
    assert.ok(old);
    const target = 'sha256:revision-fixture-upsert';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-upsert-patch',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    try {
      const providerEdge = result.events.find(
        (event) =>
          event.type === 'EDGE' && event.payload.providerFactId === pair.provider.providerFactId,
      ).payload;
      await stage.accept({
        type: 'UPSERT_EDGE',
        payload: { ...providerEdge, providerSnapshotId: snapshot.id },
      });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 1,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      const [support] = collectMergeSupports({
        repositoryId: snapshot.repositoryId,
        revisionId: snapshot.requestedRevisionId,
        observations: [{ snapshot, nodes: [], edges: [pair] }],
      });
      stage.putNormalizedEdge(pair);
      stage.appendSupport(support);
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      assert.equal(
        db.prepare('SELECT status FROM evidence WHERE id = ?').get(old.evidence_id).status,
        'SUPERSEDED',
      );
      assert.equal(
        db.prepare('SELECT count(*) AS n FROM canonical_edges').get().n,
        normalized.edges.length,
      );
      assert.ok(
        db
          .prepare('SELECT id FROM evidence WHERE id = ? AND status = ?')
          .get(support.evidence.id, 'ACTIVE'),
      );
      assert.ok(
        db
          .prepare('SELECT evidence_id FROM active_support_candidates WHERE evidence_id = ?')
          .get(support.evidence.id),
      );
    } finally {
      stage.close();
    }
  });
});

test('patch apply rejects changed source drift and malformed active candidate before mutation', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-guard-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const target = 'sha256:revision-fixture-guard';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-guard-patch',
      requestedRevisionFingerprint: target,
    };
    const run = async (event) => {
      const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
      try {
        if (event) await stage.accept(event);
        stage.confirmSucceeded({
          type: 'REFRESH_COMPLETED',
          payload: {
            repositoryId: snapshot.repositoryId,
            revisionId: snapshot.requestedRevisionId,
            revisionFingerprint: target,
            providerSnapshotId: snapshot.id,
            outcome: 'SUCCEEDED',
            counts: {
              sourceFiles: event ? 1 : 0,
              upsertedNodes: 0,
              removedNodes: 0,
              upsertedEdges: 0,
              removedEdges: 0,
              coverage: 0,
              diagnostics: 0,
            },
          },
        });
        store.applyAnalysisPatch(stage, {
          repositoryId: snapshot.repositoryId,
          baseRevisionId: snapshot.requestedRevisionId,
          baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
          targetRevisionId: snapshot.requestedRevisionId,
          targetContentFingerprint: target,
          snapshot,
        });
      } finally {
        stage.close();
      }
    };
    const before = graph(db);
    const source = result.request.payload.sourceFiles[0];
    await assert.rejects(
      run({
        type: 'SOURCE_FILE',
        payload: {
          ...source,
          contentFingerprint: 'sha256:wrong-file-content',
        },
      }),
    );
    assert.deepEqual(graph(db), before);
    db.exec(`UPDATE active_support_candidates SET candidate_json =
      json_set(candidate_json, '$.id', 'wrong-canonical-id')
      WHERE evidence_id = (SELECT evidence_id FROM active_support_candidates LIMIT 1)`);
    const corrupt = graph(db);
    await assert.rejects(run(null), (error) => error.code === 'FULL_ANALYSIS_REQUIRED');
    assert.deepEqual(graph(db), corrupt);
  });
});

test('patch apply reselects a retained second Provider support without deleting the fact', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-two-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const pair = normalizeNativeAnalysis(result).nodes.find(
      (item) => item.canonical.kind === 'TYPE',
    );
    assert.ok(pair);
    const alternateSnapshot = {
      ...initial.snapshot,
      id: 'snapshot-two-alternate',
      providerId: 'z-other',
    };
    const alternatePair = {
      provider: { ...pair.provider, providerId: 'z-other' },
      canonical: {
        ...pair.canonical,
        name: 'AlternateName',
        confidence: {
          ...pair.canonical.confidence,
          score: 0.2,
        },
      },
    };
    const [alternate] = collectMergeSupports({
      repositoryId: alternateSnapshot.repositoryId,
      revisionId: alternateSnapshot.requestedRevisionId,
      observations: [{ snapshot: alternateSnapshot, nodes: [alternatePair], edges: [] }],
    });
    db.prepare(
      `INSERT INTO provider_snapshots
      (id, repository_id, provider_id, provider_version, runtime_version,
       requested_revision_id, requested_revision_fingerprint, started_at, completed_at, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      alternateSnapshot.id,
      alternateSnapshot.repositoryId,
      alternateSnapshot.providerId,
      alternateSnapshot.providerVersion,
      alternateSnapshot.runtimeVersion,
      alternateSnapshot.requestedRevisionId,
      alternateSnapshot.requestedRevisionFingerprint,
      Date.parse(alternateSnapshot.startedAt),
      Date.parse(alternateSnapshot.completedAt),
      'SUCCEEDED',
    );
    db.prepare(
      `INSERT INTO evidence
      (id, repository_id, revision_id, provider_snapshot_id, fact_type, provider_id, provider_fact_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      alternate.evidence.id,
      alternate.evidence.repositoryId,
      alternate.evidence.revisionId,
      alternateSnapshot.id,
      'NODE',
      'z-other',
      pair.provider.providerFactId,
      'ACTIVE',
    );
    db.prepare('INSERT INTO fact_evidence VALUES (?, ?, ?)').run(
      'NODE',
      pair.canonical.id,
      alternate.evidence.id,
    );
    db.prepare('INSERT INTO provider_fact_bindings VALUES (?, ?, ?, ?, ?, ?)').run(
      'NODE',
      'z-other',
      pair.provider.providerFactId,
      alternateSnapshot.id,
      pair.canonical.id,
      alternate.evidence.id,
    );
    db.prepare('INSERT INTO active_support_candidates VALUES (?, ?, ?, ?)').run(
      alternate.evidence.id,
      'NODE',
      pair.canonical.id,
      JSON.stringify(alternate.canonical),
    );
    const native = db
      .prepare(
        `SELECT evidence_id FROM provider_fact_bindings
      WHERE fact_type = 'NODE' AND provider_id = 'native' AND canonical_fact_id = ?`,
      )
      .get(pair.canonical.id);
    assert.ok(native);
    const target = 'sha256:revision-fixture-two';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-two-remove',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
    try {
      await stage.accept({ type: 'REMOVE_NODE', payload: pair.provider });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 1,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      assert.equal(
        db.prepare('SELECT name FROM canonical_nodes WHERE id = ?').get(pair.canonical.id).name,
        'AlternateName',
      );
      assert.equal(
        db
          .prepare('SELECT confidence_score FROM canonical_nodes WHERE id = ?')
          .get(pair.canonical.id).confidence_score,
        0.2,
      );
      assert.equal(
        db.prepare('SELECT status FROM evidence WHERE id = ?').get(native.evidence_id).status,
        'INVALIDATED',
      );
      assert.equal(
        db.prepare('SELECT status FROM evidence WHERE id = ?').get(alternate.evidence.id).status,
        'ACTIVE',
      );
      assert.ok(
        db
          .prepare('SELECT evidence_id FROM active_support_candidates WHERE evidence_id = ?')
          .get(alternate.evidence.id),
      );
    } finally {
      stage.close();
    }
  });
});

test('patch edge reselection matches two-provider CALL full and one-support goldens', async () => {
  const golden = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/normalization/two-provider-same-call/expected/lifetimes.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const recipe = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/normalization/two-provider-same-call/inputs/analysis.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-call-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const pair = normalizeNativeAnalysis(result).edges.find(
      (item) => item.provider.providerFactId === 'call-ctor',
    );
    assert.equal(pair.canonical.id, golden.full.edges[0]);
    const supports = new Map();
    for (const observation of [...recipe.observations].reverse()) {
      const snapshot = {
        ...observation.snapshot,
        requestedRevisionFingerprint: result.request.payload.revision.contentFingerprint,
      };
      const edgePair = {
        provider: { ...pair.provider, providerId: observation.providerId },
        canonical: {
          ...pair.canonical,
          confidence: {
            score: observation.score,
            method: observation.providerId,
            reasons: [],
          },
        },
      };
      const [support] = collectMergeSupports({
        repositoryId: snapshot.repositoryId,
        revisionId: snapshot.requestedRevisionId,
        observations: [{ snapshot, nodes: [], edges: [edgePair] }],
      });
      supports.set(observation.providerId, support);
      db.prepare(
        `INSERT INTO provider_snapshots
        (id, repository_id, provider_id, provider_version, runtime_version,
         requested_revision_id, requested_revision_fingerprint, started_at, completed_at, outcome)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        snapshot.id,
        snapshot.repositoryId,
        snapshot.providerId,
        snapshot.providerVersion,
        snapshot.runtimeVersion,
        snapshot.requestedRevisionId,
        snapshot.requestedRevisionFingerprint,
        Date.parse(snapshot.startedAt),
        Date.parse(snapshot.completedAt),
        'SUCCEEDED',
      );
      db.prepare(
        `INSERT INTO evidence
        (id, repository_id, revision_id, provider_snapshot_id, fact_type, provider_id, provider_fact_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        support.evidence.id,
        snapshot.repositoryId,
        snapshot.requestedRevisionId,
        snapshot.id,
        'EDGE',
        observation.providerId,
        pair.provider.providerFactId,
        'ACTIVE',
      );
      db.prepare('INSERT INTO fact_evidence VALUES (?, ?, ?)').run(
        'EDGE',
        pair.canonical.id,
        support.evidence.id,
      );
      db.prepare('INSERT INTO provider_fact_bindings VALUES (?, ?, ?, ?, ?, ?)').run(
        'EDGE',
        observation.providerId,
        pair.provider.providerFactId,
        snapshot.id,
        pair.canonical.id,
        support.evidence.id,
      );
      db.prepare('INSERT INTO active_support_candidates VALUES (?, ?, ?, ?)').run(
        support.evidence.id,
        'EDGE',
        pair.canonical.id,
        JSON.stringify(support.canonical),
      );
    }
    const remove = async (providerId, base, target, serial) => {
      db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
        target,
        initial.snapshot.requestedRevisionId,
      );
      const snapshot = {
        ...initial.snapshot,
        id: `snapshot-call-remove-${serial}`,
        providerId,
        requestedRevisionFingerprint: target,
      };
      const stage = new RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
      try {
        await stage.accept({
          type: 'REMOVE_EDGE',
          payload: { factType: 'EDGE', providerId, providerFactId: pair.provider.providerFactId },
        });
        stage.confirmSucceeded({
          type: 'REFRESH_COMPLETED',
          payload: {
            repositoryId: snapshot.repositoryId,
            revisionId: snapshot.requestedRevisionId,
            revisionFingerprint: target,
            providerSnapshotId: snapshot.id,
            outcome: 'SUCCEEDED',
            counts: {
              sourceFiles: 0,
              upsertedNodes: 0,
              removedNodes: 0,
              upsertedEdges: 0,
              removedEdges: 1,
              coverage: 0,
              diagnostics: 0,
            },
          },
        });
        store.applyAnalysisPatch(stage, {
          repositoryId: snapshot.repositoryId,
          baseRevisionId: snapshot.requestedRevisionId,
          baseContentFingerprint: base,
          targetRevisionId: snapshot.requestedRevisionId,
          targetContentFingerprint: target,
          snapshot,
        });
      } finally {
        stage.close();
      }
    };
    const base = result.request.payload.revision.contentFingerprint;
    const full = 'sha256:call-two-providers';
    await remove('native', base, full, 'native');
    const edge = db
      .prepare('SELECT id, confidence_score, confidence_method FROM canonical_edges WHERE id = ?')
      .get(pair.canonical.id);
    assert.equal(edge.id, golden.full.edges[0]);
    assert.equal(edge.confidence_score, golden.full.confidence[0].score);
    assert.equal(edge.confidence_method, golden.full.confidence[0].method);
    assert.deepEqual(
      db
        .prepare(
          `SELECT evidence_id FROM active_support_candidates
      WHERE fact_type = 'EDGE' AND canonical_fact_id = ? ORDER BY evidence_id`,
        )
        .all(pair.canonical.id)
        .map((row) => row.evidence_id),
      [supports.get('alpha').evidence.id, supports.get('beta').evidence.id].sort(),
    );
    await remove('beta', full, 'sha256:call-one-provider', 'beta');
    const one = db
      .prepare('SELECT id, confidence_score, confidence_method FROM canonical_edges WHERE id = ?')
      .get(pair.canonical.id);
    assert.equal(one.id, golden.one.edges[0]);
    assert.equal(one.confidence_score, golden.one.confidence[0].score);
    assert.equal(one.confidence_method, golden.one.confidence[0].method);
    assert.deepEqual(
      db
        .prepare(
          `SELECT evidence_id, candidate_json FROM active_support_candidates
      WHERE fact_type = 'EDGE' AND canonical_fact_id = ?`,
        )
        .all(pair.canonical.id)
        .map((row) => ({ ...row })),
      [
        {
          evidence_id: supports.get('alpha').evidence.id,
          candidate_json: JSON.stringify(supports.get('alpha').canonical),
        },
      ],
    );
  });
});

test('patch apply rolls back retired support when final pointer update fails', async () => {
  await withDatabase(async (db, path) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-rollback-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const old = db
      .prepare(
        "SELECT provider_id, provider_fact_id FROM provider_fact_bindings WHERE fact_type = 'EDGE' LIMIT 1",
      )
      .get();
    const target = 'sha256:revision-fixture-rollback';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const before = graph(db);
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-rollback-patch',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    try {
      await stage.accept({
        type: 'REMOVE_EDGE',
        payload: {
          factType: 'EDGE',
          providerId: old.provider_id,
          providerFactId: old.provider_fact_id,
        },
      });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 1,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      db.exec(`CREATE TRIGGER fail_patch_retirement BEFORE UPDATE ON evidence
        BEGIN SELECT RAISE(ABORT, 'injected retirement failure'); END`);
      assert.throws(
        () =>
          store.applyAnalysisPatch(stage, {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: target,
            snapshot,
          }),
        /injected retirement failure/,
      );
      assert.deepEqual(graph(db), before);
      db.exec('DROP TRIGGER fail_patch_retirement');
      db.exec(`CREATE TRIGGER fail_patch_activation BEFORE UPDATE ON repository_state
        BEGIN SELECT RAISE(ABORT, 'injected pointer failure'); END`);
      assert.throws(
        () =>
          store.applyAnalysisPatch(stage, {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: target,
            snapshot,
          }),
        /injected pointer failure/,
      );
      assert.deepEqual(graph(db), before);
      const reopened = new DatabaseSync(path);
      try {
        assert.deepEqual(graph(reopened), before);
      } finally {
        reopened.close();
      }
    } finally {
      stage.close();
    }
  });
});

test('patch apply rejects a node removal that would strand an unchanged edge', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-dangling-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const old = db
      .prepare(
        `SELECT binding.provider_id, binding.provider_fact_id
      FROM provider_fact_bindings AS binding JOIN canonical_edges AS edge
        ON edge.source_node_id = binding.canonical_fact_id
      WHERE binding.fact_type = 'NODE' LIMIT 1`,
      )
      .get();
    assert.ok(old);
    const target = 'sha256:revision-fixture-dangling';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const before = graph(db);
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-dangling-patch',
      requestedRevisionFingerprint: target,
    };
    const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
    try {
      await stage.accept({
        type: 'REMOVE_NODE',
        payload: {
          factType: 'NODE',
          providerId: old.provider_id,
          providerFactId: old.provider_fact_id,
        },
      });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 1,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      assert.throws(
        () =>
          store.applyAnalysisPatch(stage, {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: target,
            snapshot,
          }),
        (error) => error.code === 'INVALID_PATCH',
      );
      assert.deepEqual(graph(db), before);
    } finally {
      stage.close();
    }
  });
});

test('patch apply adds a new Provider node and original support candidate', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-add-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const before = graph(db);
    const target = 'sha256:revision-fixture-add';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-add-patch',
      requestedRevisionFingerprint: target,
    };
    const original = result.events.find(
      (event) => event.type === 'NODE' && event.payload.providerKind === 'java.package_container',
    ).payload;
    const providerNode = {
      ...original,
      providerFactId: 'new-package-container',
      providerSnapshotId: snapshot.id,
      name: 'new.pkg',
      qualifiedName: 'new.pkg',
    };
    const pair = {
      provider: {
        factType: 'NODE',
        providerId: providerNode.providerId,
        providerFactId: providerNode.providerFactId,
      },
      canonical: normalizeJavaNode(providerNode, {
        get() {
          return null;
        },
        getByPath() {
          return null;
        },
      }),
    };
    const [support] = collectMergeSupports({
      repositoryId: snapshot.repositoryId,
      revisionId: snapshot.requestedRevisionId,
      observations: [{ snapshot, nodes: [pair], edges: [] }],
    });
    const stage = new RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
    try {
      await stage.accept({ type: 'UPSERT_NODE', payload: providerNode });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 1,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      stage.putNormalizedNode(pair);
      stage.appendSupport(support);
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      const after = graph(db);
      assert.equal(after.canonical_nodes.length, before.canonical_nodes.length + 1);
      assert.ok(db.prepare('SELECT id FROM canonical_nodes WHERE id = ?').get(pair.canonical.id));
      assert.ok(
        db
          .prepare('SELECT evidence_id FROM active_support_candidates WHERE evidence_id = ?')
          .get(support.evidence.id),
      );
    } finally {
      stage.close();
    }
  });
});

test('patch apply modifies one node and adds one edge without replacing unrelated facts', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const initial = await candidate(
      db,
      'snapshot-mixed-base',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      store.applyAnalysisBatch(initial.stage, {
        repositoryId: initial.snapshot.repositoryId,
        revisionId: initial.snapshot.requestedRevisionId,
        contentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        snapshot: initial.snapshot,
      });
    } finally {
      initial.stage.close();
    }
    const before = graph(db);
    const target = 'sha256:revision-fixture-mixed';
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      target,
      initial.snapshot.requestedRevisionId,
    );
    const snapshot = {
      ...initial.snapshot,
      id: 'snapshot-mixed-patch',
      requestedRevisionFingerprint: target,
    };
    const oldNode = result.events.find(
      (event) => event.type === 'NODE' && event.payload.providerFactId === 'class-a',
    ).payload;
    const providerNode = {
      ...oldNode,
      providerSnapshotId: snapshot.id,
      name: 'ChangedDisplayName',
    };
    const files = result.request.payload.sourceFiles;
    const sourceLookup = {
      get(id) {
        return files.find((file) => file.id === id) ?? null;
      },
      getByPath(path) {
        return files.find((file) => file.path === path) ?? null;
      },
    };
    const nodePair = {
      provider: {
        factType: 'NODE',
        providerId: providerNode.providerId,
        providerFactId: providerNode.providerFactId,
      },
      canonical: normalizeJavaNode(providerNode, sourceLookup),
    };
    const originalEdge = result.events.find(
      (event) => event.type === 'EDGE' && event.payload.providerFactId === 'import-i',
    ).payload;
    const providerEdge = {
      ...originalEdge,
      providerFactId: 'new-import-from-b',
      providerSnapshotId: snapshot.id,
      source: { ...originalEdge.source, providerFactId: 'unit-b' },
      sourceRange: { ...originalEdge.sourceRange, sourceFileId: 'file-B.java' },
    };
    const normalized = normalizeNativeAnalysis(result);
    const nodeByProviderId = new Map(
      normalized.nodes.map((pair) => [pair.provider.providerFactId, pair.canonical]),
    );
    const edgePair = {
      provider: {
        factType: 'EDGE',
        providerId: providerEdge.providerId,
        providerFactId: providerEdge.providerFactId,
      },
      canonical: normalizeJavaEdge(providerEdge, nodeByProviderId, sourceLookup),
    };
    const supports = collectMergeSupports({
      repositoryId: snapshot.repositoryId,
      revisionId: snapshot.requestedRevisionId,
      observations: [{ snapshot, nodes: [nodePair], edges: [edgePair] }],
    });
    const stage = new RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
    try {
      await stage.accept({ type: 'UPSERT_EDGE', payload: providerEdge });
      await stage.accept({ type: 'UPSERT_NODE', payload: providerNode });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: target,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 1,
            removedNodes: 0,
            upsertedEdges: 1,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      stage.putNormalizedNode(nodePair);
      stage.putNormalizedEdge(edgePair);
      for (const support of supports) stage.appendSupport(support);
      store.applyAnalysisPatch(stage, {
        repositoryId: snapshot.repositoryId,
        baseRevisionId: snapshot.requestedRevisionId,
        baseContentFingerprint: initial.snapshot.requestedRevisionFingerprint,
        targetRevisionId: snapshot.requestedRevisionId,
        targetContentFingerprint: target,
        snapshot,
      });
      const after = graph(db);
      assert.equal(after.canonical_nodes.length, before.canonical_nodes.length);
      assert.equal(after.canonical_edges.length, before.canonical_edges.length + 1);
      assert.equal(
        db.prepare('SELECT name FROM canonical_nodes WHERE id = ?').get(nodePair.canonical.id).name,
        'ChangedDisplayName',
      );
      assert.ok(
        db.prepare('SELECT id FROM canonical_edges WHERE id = ?').get(edgePair.canonical.id),
      );
      assert.equal(after.repository_state[0].indexed_content_fingerprint, target);
    } finally {
      stage.close();
    }
  });
});

test('full apply preserves every support candidate for future reselection', async () => {
  await withDatabase(async (db) => {
    const { stage, snapshot } = await candidate(
      db,
      'snapshot-candidates',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      new RepositoryCanonicalFactStore(db).applyAnalysisBatch(stage, {
        repositoryId: result.request.payload.repository.id,
        revisionId: result.request.payload.revision.id,
        contentFingerprint: result.request.payload.revision.contentFingerprint,
        snapshot,
      });
      const bindings = db
        .prepare('SELECT evidence_id, canonical_fact_id FROM provider_fact_bindings')
        .all();
      const candidates = db
        .prepare(
          'SELECT evidence_id, canonical_fact_id, candidate_json FROM active_support_candidates',
        )
        .all();
      assert.equal(bindings.length, candidates.length);
      assert.ok(bindings.length > 0);
      for (const row of candidates) {
        assert.ok(bindings.some((binding) => binding.evidence_id === row.evidence_id));
        assert.equal(JSON.parse(row.candidate_json).id, row.canonical_fact_id);
      }
    } finally {
      stage.close();
    }
  });
});

test('full apply rejects a support candidate outside the requested repository', async () => {
  await withDatabase(async (db) => {
    const { stage, snapshot } = await candidate(
      db,
      'snapshot-foreign-support',
      result.request.payload.revision.contentFingerprint,
    );
    try {
      db.exec(`UPDATE temp.analysis_support
        SET payload = json_set(payload, '$.canonical.repositoryId', 'foreign-repository')
        WHERE evidence_id = (SELECT evidence_id FROM temp.analysis_support LIMIT 1)`);
      assert.throws(() =>
        new RepositoryCanonicalFactStore(db).applyAnalysisBatch(stage, {
          repositoryId: result.request.payload.repository.id,
          revisionId: result.request.payload.revision.id,
          contentFingerprint: result.request.payload.revision.contentFingerprint,
          snapshot,
        }),
      );
      assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM active_support_candidates').get().n, 0);
    } finally {
      stage.close();
    }
  });
});

test('full apply activates facts and both freshness fields together', async () => {
  await withDatabase(async (db) => {
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    const { stage, snapshot } = await candidate(
      db,
      'snapshot-A',
      result.request.payload.revision.contentFingerprint,
    );
    new RepositoryCanonicalFactStore(db).applyAnalysisBatch(stage, {
      repositoryId: snapshot.repositoryId,
      revisionId: snapshot.requestedRevisionId,
      contentFingerprint: snapshot.requestedRevisionFingerprint,
      snapshot,
    });
    assert.ok(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n > 0);
    assert.ok(db.prepare('SELECT count(*) AS n FROM provider_fact_bindings').get().n > 0);
    assert.deepEqual(
      {
        ...db
          .prepare('SELECT indexed_revision_id, indexed_content_fingerprint FROM repository_state')
          .get(),
      },
      {
        indexed_revision_id: snapshot.requestedRevisionId,
        indexed_content_fingerprint: snapshot.requestedRevisionFingerprint,
      },
    );
    stage.close();
  });
});

test('failed same-WORKTREE replacement restores the old graph and activation fields', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const first = await candidate(
      db,
      'snapshot-A',
      result.request.payload.revision.contentFingerprint,
    );
    store.applyAnalysisBatch(first.stage, {
      repositoryId: first.snapshot.repositoryId,
      revisionId: first.snapshot.requestedRevisionId,
      contentFingerprint: first.snapshot.requestedRevisionFingerprint,
      snapshot: first.snapshot,
    });
    first.stage.close();
    const before = graph(db);
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      'sha256:new-source',
      first.snapshot.requestedRevisionId,
    );
    const second = await candidate(db, 'snapshot-B', 'sha256:new-source');
    db.exec(`CREATE TEMP TRIGGER fail_new_node BEFORE INSERT ON canonical_nodes
      BEGIN SELECT RAISE(ABORT, 'injected new-node failure'); END`);
    assert.throws(() =>
      store.applyAnalysisBatch(second.stage, {
        repositoryId: second.snapshot.repositoryId,
        revisionId: second.snapshot.requestedRevisionId,
        contentFingerprint: second.snapshot.requestedRevisionFingerprint,
        snapshot: second.snapshot,
      }),
    );
    db.exec('DROP TRIGGER temp.fail_new_node');
    assert.deepEqual(graph(db), before);
    second.stage.close();
  });
});

test('same-WORKTREE success retires old support and replaces graph under one pointer', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const first = await candidate(
      db,
      'snapshot-A',
      result.request.payload.revision.contentFingerprint,
    );
    store.applyAnalysisBatch(first.stage, {
      repositoryId: first.snapshot.repositoryId,
      revisionId: first.snapshot.requestedRevisionId,
      contentFingerprint: first.snapshot.requestedRevisionFingerprint,
      snapshot: first.snapshot,
    });
    first.stage.close();
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      'sha256:new-source',
      first.snapshot.requestedRevisionId,
    );
    const second = await candidate(db, 'snapshot-B', 'sha256:new-source');
    store.applyAnalysisBatch(second.stage, {
      repositoryId: second.snapshot.repositoryId,
      revisionId: second.snapshot.requestedRevisionId,
      contentFingerprint: second.snapshot.requestedRevisionFingerprint,
      snapshot: second.snapshot,
    });
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM evidence WHERE provider_snapshot_id = 'snapshot-A' AND status = 'ACTIVE'",
        )
        .get().n,
      0,
    );
    assert.ok(
      db
        .prepare(
          "SELECT count(*) AS n FROM evidence WHERE provider_snapshot_id = 'snapshot-A' AND status = 'SUPERSEDED'",
        )
        .get().n > 0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM provider_fact_bindings WHERE provider_snapshot_id = 'snapshot-A'",
        )
        .get().n,
      0,
    );
    assert.equal(
      db
        .prepare(
          `SELECT count(*) AS n FROM active_support_candidates AS candidate
           JOIN evidence AS evidence ON evidence.id = candidate.evidence_id
           WHERE evidence.provider_snapshot_id = 'snapshot-A'`,
        )
        .get().n,
      0,
    );
    assert.ok(
      db
        .prepare(
          "SELECT count(*) AS n FROM provider_fact_bindings WHERE provider_snapshot_id = 'snapshot-B'",
        )
        .get().n > 0,
    );
    assert.equal(
      db.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
        .indexed_content_fingerprint,
      'sha256:new-source',
    );
    second.stage.close();
  });
});

test('changed source or failure at pointer update retains the prior graph', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const first = await candidate(
      db,
      'snapshot-A',
      result.request.payload.revision.contentFingerprint,
    );
    store.applyAnalysisBatch(first.stage, {
      repositoryId: first.snapshot.repositoryId,
      revisionId: first.snapshot.requestedRevisionId,
      contentFingerprint: first.snapshot.requestedRevisionFingerprint,
      snapshot: first.snapshot,
    });
    first.stage.close();
    const before = graph(db);
    const stale = await candidate(
      db,
      'snapshot-stale',
      result.request.payload.revision.contentFingerprint,
    );
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      'sha256:changed',
      first.snapshot.requestedRevisionId,
    );
    assert.throws(
      () =>
        store.applyAnalysisBatch(stale.stage, {
          repositoryId: stale.snapshot.repositoryId,
          revisionId: stale.snapshot.requestedRevisionId,
          contentFingerprint: stale.snapshot.requestedRevisionFingerprint,
          snapshot: stale.snapshot,
        }),
      /Source revision changed/,
    );
    assert.deepEqual(graph(db), before);
    stale.stage.close();
    const next = await candidate(db, 'snapshot-next', 'sha256:changed');
    db.exec(`CREATE TEMP TRIGGER fail_pointer BEFORE UPDATE ON repository_state
      BEGIN SELECT RAISE(ABORT, 'injected pointer failure'); END`);
    assert.throws(() =>
      store.applyAnalysisBatch(next.stage, {
        repositoryId: next.snapshot.repositoryId,
        revisionId: next.snapshot.requestedRevisionId,
        contentFingerprint: next.snapshot.requestedRevisionFingerprint,
        snapshot: next.snapshot,
      }),
    );
    db.exec('DROP TRIGGER temp.fail_pointer');
    assert.deepEqual(graph(db), before);
    next.stage.close();
  });
});

test('validated zero-fact success can atomically clear the active graph', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const first = await candidate(
      db,
      'snapshot-A',
      result.request.payload.revision.contentFingerprint,
    );
    store.applyAnalysisBatch(first.stage, {
      repositoryId: first.snapshot.repositoryId,
      revisionId: first.snapshot.requestedRevisionId,
      contentFingerprint: first.snapshot.requestedRevisionFingerprint,
      snapshot: first.snapshot,
    });
    first.stage.close();
    const stage = new RepositoryAnalysisStage(db);
    for (const file of result.request.payload.sourceFiles) {
      await stage.accept({ type: 'SOURCE_FILE', payload: file });
    }
    normalizeStagedAnalysis(stage, result.request);
    const snapshot = { ...first.snapshot, id: 'snapshot-empty', capabilities: [] };
    mergeStagedAnalysis(stage, snapshot);
    const terminal = structuredClone(result.terminal);
    terminal.payload.providerSnapshotId = snapshot.id;
    terminal.payload.counts = {
      sourceFiles: result.request.payload.sourceFiles.length,
      nodes: 0,
      edges: 0,
      coverage: 0,
      diagnostics: 0,
    };
    terminal.payload.capabilities = [];
    stage.confirmSucceeded(terminal);
    store.applyAnalysisBatch(stage, {
      repositoryId: snapshot.repositoryId,
      revisionId: snapshot.requestedRevisionId,
      contentFingerprint: snapshot.requestedRevisionFingerprint,
      snapshot,
    });
    assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_fact_bindings').get().n, 0);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM evidence WHERE status = 'ACTIVE'").get().n,
      0,
    );
    stage.close();
  });
});

test('Store rejects a completed stage that omits persisted source files', async () => {
  await withDatabase(async (db) => {
    const stage = new RepositoryAnalysisStage(db);
    const snapshot = {
      id: 'snapshot-empty-invalid',
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
    const terminal = structuredClone(result.terminal);
    terminal.payload.providerSnapshotId = snapshot.id;
    terminal.payload.counts = { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 };
    terminal.payload.capabilities = [];
    stage.confirmSucceeded(terminal);
    assert.throws(
      () =>
        new RepositoryCanonicalFactStore(db).applyAnalysisBatch(stage, {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          contentFingerprint: snapshot.requestedRevisionFingerprint,
          snapshot,
        }),
      /Staged source file inventory is incomplete/,
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 0);
    stage.close();
  });
});

test('dangling coverage and diagnostic source references cannot replace an active graph', async () => {
  await withDatabase(async (db) => {
    const store = new RepositoryCanonicalFactStore(db);
    const first = await candidate(
      db,
      'snapshot-valid',
      result.request.payload.revision.contentFingerprint,
    );
    store.applyAnalysisBatch(first.stage, {
      repositoryId: first.snapshot.repositoryId,
      revisionId: first.snapshot.requestedRevisionId,
      contentFingerprint: first.snapshot.requestedRevisionFingerprint,
      snapshot: first.snapshot,
    });
    first.stage.close();
    const before = graph(db);
    const diagnostic = {
      code: 'TEST',
      severity: 'WARNING',
      message: 'Test diagnostic',
      sourceRange: {
        sourceFileId: 'missing-source',
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 1,
      },
    };
    for (const [snapshotId, options] of [
      ['snapshot-bad-coverage', { danglingCoverage: true }],
      ['snapshot-bad-diagnostic', { diagnostic }],
    ]) {
      const next = await candidate(
        db,
        snapshotId,
        result.request.payload.revision.contentFingerprint,
        options,
      );
      assert.throws(
        () =>
          store.applyAnalysisBatch(next.stage, {
            repositoryId: next.snapshot.repositoryId,
            revisionId: next.snapshot.requestedRevisionId,
            contentFingerprint: next.snapshot.requestedRevisionFingerprint,
            snapshot: next.snapshot,
          }),
        /Source range has no file|Coverage source has no file/,
      );
      assert.deepEqual(graph(db), before);
      next.stage.close();
    }
  });
});
