import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { mergeStagedAnalysis, normalizeStagedAnalysis } from '../../providers/dist/index.js';
import {
  RepositoryAnalysisStage,
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
      await run(db);
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
      'provider_snapshots',
    ].map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
  );
}

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
