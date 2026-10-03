import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { runMigrations } from '../dist/index.js';

const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
const fixtureUrl = new URL(
  '../../../fixtures/storage/active-support-candidates/cases.json',
  import.meta.url,
);

test('p05-active-support-candidates-v1 maps R009 checks to P05-W1-011', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.id, 'p05-active-support-candidates-v1');
  assert.equal(fixture.task, 'P05-W1-011');
  assert.ok(fixture.cases.includes('r008-to-r009-preserves-graph'));
  assert.ok(fixture.cases.includes('failed-full-replacement-restores-candidates'));
});

test('R009 creates active candidates tied to bindings without changing prior schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-r009-'));
  const path = join(directory, 'repo.sqlite');
  try {
    await runMigrations({ databasePath: path, databaseKind: 'REPOSITORY', manifestUrl });
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get('active_support_candidates');
      assert.equal(table?.name, 'active_support_candidates');
      const foreignKeys = db.prepare('PRAGMA foreign_key_list(active_support_candidates)').all();
      assert.deepEqual(
        foreignKeys.map(({ from, table, to, on_delete }) => [from, table, to, on_delete]),
        [
          ['evidence_id', 'provider_fact_bindings', 'evidence_id', 'CASCADE'],
          ['fact_type', 'provider_fact_bindings', 'fact_type', 'CASCADE'],
          ['canonical_fact_id', 'provider_fact_bindings', 'canonical_fact_id', 'CASCADE'],
        ],
      );
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('R008 to R009 leaves old active graph and bindings without invented candidates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-r009-upgrade-'));
  const path = join(directory, 'repo.sqlite');
  try {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const prefixUrl = pathToFileURL(join(directory, 'manifest-r008.json'));
    await writeFile(
      prefixUrl,
      JSON.stringify({ ...manifest, migrations: manifest.migrations.slice(0, 8) }),
    );
    for (const entry of manifest.migrations.slice(0, 8)) {
      await writeFile(
        join(directory, entry.file),
        await readFile(new URL(entry.file, manifestUrl)),
      );
    }
    await runMigrations({ databasePath: path, databaseKind: 'REPOSITORY', manifestUrl: prefixUrl });
    const oldDb = new DatabaseSync(path);
    try {
      oldDb.exec(`
        INSERT INTO repository (slot, id, root_path) VALUES (1, 'repo', '/repo');
        INSERT INTO repository_state (repository_id, indexed_revision_id, indexed_content_fingerprint)
          VALUES ('repo', 'worktree', 'fingerprint-a');
        INSERT INTO revisions (id, repository_id, kind, content_fingerprint, base_revision_id)
          VALUES ('worktree', 'repo', 'WORKTREE', 'fingerprint-a', NULL);
        INSERT INTO provider_snapshots
          (id, repository_id, provider_id, provider_version, runtime_version,
           requested_revision_id, requested_revision_fingerprint, started_at, completed_at, outcome)
          VALUES ('snapshot', 'repo', 'native', '1', '1', 'worktree', 'fingerprint-a', 1, 2, 'SUCCEEDED');
        INSERT INTO canonical_nodes
          (revision_id, id, repository_id, fact_key, kind, name,
           confidence_score, confidence_method, confidence_reasons_json)
          VALUES ('worktree', 'node', 'repo', 'key', 'MODULE', 'Old', 1, 'exact', '[]');
        INSERT INTO evidence
          (id, repository_id, revision_id, provider_snapshot_id, fact_type,
           provider_id, provider_fact_id, status)
          VALUES ('evidence', 'repo', 'worktree', 'snapshot', 'NODE', 'native', 'provider-node', 'ACTIVE');
        INSERT INTO fact_evidence (fact_type, canonical_fact_id, evidence_id)
          VALUES ('NODE', 'node', 'evidence');
        INSERT INTO provider_fact_bindings
          (fact_type, provider_id, provider_fact_id, provider_snapshot_id, canonical_fact_id, evidence_id)
          VALUES ('NODE', 'native', 'provider-node', 'snapshot', 'node', 'evidence');
      `);
    } finally {
      oldDb.close();
    }
    assert.deepEqual(
      (await runMigrations({ databasePath: path, databaseKind: 'REPOSITORY', manifestUrl }))
        .appliedVersions,
      [9, 10],
    );
    const db = new DatabaseSync(path);
    try {
      assert.equal(
        db.prepare('SELECT name FROM canonical_nodes WHERE id = ?').get('node').name,
        'Old',
      );
      assert.equal(
        db.prepare('SELECT status FROM evidence WHERE id = ?').get('evidence').status,
        'ACTIVE',
      );
      assert.equal(db.prepare('SELECT count(*) AS n FROM provider_fact_bindings').get().n, 1);
      assert.equal(db.prepare('SELECT count(*) AS n FROM active_support_candidates').get().n, 0);
      const state = db
        .prepare('SELECT indexed_revision_id, indexed_content_fingerprint FROM repository_state')
        .get();
      assert.equal(state.indexed_revision_id, 'worktree');
      assert.equal(state.indexed_content_fingerprint, 'fingerprint-a');
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
