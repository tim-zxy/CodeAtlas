import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
const base = await loadMigrationPlan(
  new URL('../migrations/workspace/manifest.json', import.meta.url),
  'WORKSPACE',
);
const plan = base;
const prefix = (n) => ({
  ...plan,
  latestVersion: n,
  migrations: plan.migrations.slice(0, n),
});
for (const n of [0, 6, 7])
  test('existing migration runner upgrades ' + n + ' to8 and reruns unchanged', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys=ON');
      if (n) applyMigrationPlan(db, prefix(n));
      assert.deepEqual(
        applyMigrationPlan(db, plan).appliedVersions,
        Array.from({ length: 8 - n }, (_, i) => n + i + 1),
      );
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
      assert.equal(applyMigrationPlan(db, plan).appliedVersions.length, 0);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      db.close();
    }
  });
for (const failedVersion of [7, 8])
  test(
    'document migration ' + failedVersion + ' failure retains only committed predecessor',
    () => {
      const db = new DatabaseSync(':memory:');
      try {
        applyMigrationPlan(db, prefix(failedVersion - 1));
        const target = plan.migrations[failedVersion - 1];
        const bad = {
          ...prefix(failedVersion),
          migrations: [
            ...plan.migrations.slice(0, failedVersion - 1),
            { ...target, sql: target.sql + '\nINSERT INTO missing_table VALUES(1);' },
          ],
        };
        assert.throws(() => applyMigrationPlan(db, bad), { code: 'MIGRATION_FAILED' });
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, failedVersion - 1);
        assert.equal(
          db
            .prepare('SELECT count(*) n FROM sqlite_schema WHERE name=?')
            .get(failedVersion === 7 ? 'documents' : 'claims').n,
          0,
        );
        if (failedVersion === 8)
          assert.equal(
            db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='documents'").get().n,
            1,
          );
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      } finally {
        db.close();
      }
    },
  );

test('newer database refuses original8 plan without downgrade', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA user_version=9');
    assert.throws(() => applyMigrationPlan(db, plan), {
      code: 'DATABASE_TOO_NEW',
    });
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
  } finally {
    db.close();
  }
});

test('genuine schema7 supports structure Store and refuses unsupported6', async () => {
  const { DocumentStore } = await import('../dist/documents/document-store.js');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    applyMigrationPlan(db, prefix(6));
    assert.throws(() => new DocumentStore(db, 'ws:one'), { code: 'DOCUMENT_SCHEMA_UNSUPPORTED' });
    applyMigrationPlan(db, prefix(7));
    assert.ok(new DocumentStore(db, 'ws:one'));
  } finally {
    db.close();
  }
});
