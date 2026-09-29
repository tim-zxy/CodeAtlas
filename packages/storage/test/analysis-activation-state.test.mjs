import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as storage from '../dist/index.js';

const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
const fixtureUrl = new URL(
  '../../../fixtures/storage/repository-activation/cases.json',
  import.meta.url,
);

test('p05-repository-activation-v1 Fixture declares R008 and freshness recovery cases', async () => {
  assert.deepEqual(JSON.parse(await readFile(fixtureUrl, 'utf8')), {
    schemaVersion: 1,
    id: 'p05-repository-activation-v1',
    task: 'P05-W1-010',
    governingSpec: 'docs/handoff/specs/SQLITE_SCHEMA.md',
    acceptance: 'R008 preserves legacy graph and records honest indexed fingerprint freshness',
    cases: ['fresh-to-latest', 'legacy-pointer-upgrade', 'failed-upgrade-rollback'],
  });
});

async function withDatabase(run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-analysis-state-'));
  const databasePath = join(directory, 'repo.sqlite');
  try {
    return await run({ directory, databasePath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function seedRepository(db) {
  db.exec(`
    INSERT INTO repository (slot, id, root_path) VALUES (1, 'repo-a', '/repo-a');
    INSERT INTO repository_state (repository_id) VALUES ('repo-a');
    INSERT INTO revisions (id, repository_id, kind, content_fingerprint, base_revision_id)
      VALUES ('worktree-a', 'repo-a', 'WORKTREE', 'fingerprint-a', NULL);
  `);
}

test('R008 fresh state distinguishes not-indexed, current, stale, and unknown', async () => {
  await withDatabase(async ({ databasePath }) => {
    assert.equal(typeof storage.readAnalysisFreshness, 'function');
    assert.equal(typeof storage.readActiveAnalysisState, 'function');
    assert.deepEqual(
      (await storage.runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl }))
        .appliedVersions,
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    const db = new DatabaseSync(databasePath);
    try {
      seedRepository(db);
      assert.equal(storage.readAnalysisFreshness(db, 'repo-a'), 'NOT_INDEXED');
      assert.deepEqual(storage.readActiveAnalysisState(db, 'repo-a'), {
        revisionId: null,
        contentFingerprint: null,
      });
      db.exec(`UPDATE repository_state SET indexed_revision_id = 'worktree-a',
        indexed_content_fingerprint = 'fingerprint-a' WHERE repository_id = 'repo-a'`);
      assert.equal(storage.readAnalysisFreshness(db, 'repo-a'), 'CURRENT');
      db.exec(`UPDATE revisions SET content_fingerprint = 'fingerprint-b' WHERE id = 'worktree-a'`);
      assert.equal(storage.readAnalysisFreshness(db, 'repo-a'), 'STALE');
      db.exec(
        `UPDATE repository_state SET indexed_content_fingerprint = NULL WHERE repository_id = 'repo-a'`,
      );
      assert.equal(storage.readAnalysisFreshness(db, 'repo-a'), 'UNKNOWN');
      db.exec(`UPDATE repository_state SET indexed_revision_id = NULL,
        indexed_content_fingerprint = 'fingerprint-a' WHERE repository_id = 'repo-a'`);
      assert.notEqual(storage.readAnalysisFreshness(db, 'repo-a'), 'CURRENT');
    } finally {
      db.close();
    }
  });
});

test('R008 upgrades legacy pointer without inventing fingerprint or removing graph', async () => {
  await withDatabase(async ({ directory, databasePath }) => {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const prefixUrl = pathToFileURL(join(directory, 'manifest-v7.json'));
    await writeFile(
      prefixUrl,
      JSON.stringify({ ...manifest, migrations: manifest.migrations.slice(0, 7) }),
    );
    for (const entry of manifest.migrations.slice(0, 7)) {
      await writeFile(
        join(directory, entry.file),
        await readFile(new URL(entry.file, manifestUrl)),
      );
    }
    await storage.runMigrations({
      databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl: prefixUrl,
    });
    const oldDb = new DatabaseSync(databasePath);
    try {
      seedRepository(oldDb);
      oldDb.exec(`
        UPDATE repository_state SET indexed_revision_id = 'worktree-a' WHERE repository_id = 'repo-a';
        INSERT INTO canonical_nodes
          (revision_id, id, repository_id, fact_key, kind, name,
           confidence_score, confidence_method, confidence_reasons_json)
          VALUES ('worktree-a', 'old-node', 'repo-a', 'old-key', 'MODULE', 'old', 1, 'exact', '[]');
      `);
    } finally {
      oldDb.close();
    }
    assert.deepEqual(
      (await storage.runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl }))
        .appliedVersions,
      [8],
    );
    const db = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(storage.readActiveAnalysisState(db, 'repo-a'), {
        revisionId: 'worktree-a',
        contentFingerprint: null,
      });
      assert.equal(storage.readAnalysisFreshness(db, 'repo-a'), 'UNKNOWN');
      assert.equal(
        db.prepare('SELECT name FROM canonical_nodes WHERE id = ?').get('old-node').name,
        'old',
      );
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
      assert.deepEqual(
        (await storage.runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl }))
          .appliedVersions,
        [],
      );
    } finally {
      db.close();
    }
  });
});

test('failed R008 migration rolls back its new column and preserves the legacy graph', async () => {
  await withDatabase(async ({ directory, databasePath }) => {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const prefixUrl = pathToFileURL(join(directory, 'manifest-v7.json'));
    await writeFile(
      prefixUrl,
      JSON.stringify({ ...manifest, migrations: manifest.migrations.slice(0, 7) }),
    );
    for (const entry of manifest.migrations.slice(0, 7)) {
      await writeFile(
        join(directory, entry.file),
        await readFile(new URL(entry.file, manifestUrl)),
      );
    }
    await storage.runMigrations({
      databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl: prefixUrl,
    });
    const oldDb = new DatabaseSync(databasePath);
    try {
      seedRepository(oldDb);
      oldDb.exec(`
        UPDATE repository_state SET indexed_revision_id = 'worktree-a' WHERE repository_id = 'repo-a';
        INSERT INTO canonical_nodes
          (revision_id, id, repository_id, fact_key, kind, name,
           confidence_score, confidence_method, confidence_reasons_json)
          VALUES ('worktree-a', 'old-node', 'repo-a', 'old-key', 'MODULE', 'old', 1, 'exact', '[]');
      `);
    } finally {
      oldDb.close();
    }
    const failingSql =
      'ALTER TABLE repository_state ADD COLUMN indexed_content_fingerprint TEXT;\nSELECT missing FROM absent;\n';
    const failingFile = '008_fail_after_column.sql';
    await writeFile(join(directory, failingFile), failingSql);
    const failingManifestUrl = pathToFileURL(join(directory, 'manifest-failing.json'));
    await writeFile(
      failingManifestUrl,
      JSON.stringify({
        ...manifest,
        migrations: [
          ...manifest.migrations.slice(0, 7),
          {
            version: 8,
            name: 'fail_after_column',
            file: failingFile,
            checksum: `sha256:${createHash('sha256').update(failingSql).digest('hex')}`,
            backupRequired: false,
          },
        ],
      }),
    );
    await assert.rejects(
      storage.runMigrations({
        databasePath,
        databaseKind: 'REPOSITORY',
        manifestUrl: failingManifestUrl,
      }),
      { code: 'MIGRATION_FAILED' },
    );
    const db = new DatabaseSync(databasePath);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
      assert.ok(
        !db
          .prepare('PRAGMA table_info(repository_state)')
          .all()
          .some((row) => row.name === 'indexed_content_fingerprint'),
      );
      assert.equal(
        db.prepare('SELECT indexed_revision_id FROM repository_state').get().indexed_revision_id,
        'worktree-a',
      );
      assert.equal(
        db.prepare('SELECT name FROM canonical_nodes WHERE id = ?').get('old-node').name,
        'old',
      );
    } finally {
      db.close();
    }
  });
});
