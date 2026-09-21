import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { loadMigrationPlan, runMigrations } from '../dist/index.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';

const fixtures = new URL('../../../fixtures/storage/migrations/', import.meta.url);
const upgrade = new URL('migration-upgrade/manifest.json', fixtures);

async function temporary(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return {
    directory,
    databasePath: join(directory, 'fixture.sqlite'),
    remove: () => rm(directory, { recursive: true }),
  };
}

async function expectError(code, operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.name, 'StorageMigrationError');
    assert.equal(error?.code, code);
    return true;
  });
}

function version(database) {
  return database.prepare('PRAGMA user_version').get().user_version;
}
function hasTable(database, table) {
  return (
    database
      .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table).count === 1
  );
}

async function sqlManifest(t, sql, backupRequired = false) {
  const plan = await temporary('codeatlas-migration-sql-');
  t.after(plan.remove);
  await writeFile(join(plan.directory, '001-test.sql'), sql);
  await writeFile(
    join(plan.directory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      databaseKind: 'REPOSITORY',
      migrations: [
        {
          version: 1,
          name: 'test',
          file: '001-test.sql',
          checksum: `sha256:${createHash('sha256').update(sql).digest('hex')}`,
          backupRequired,
        },
      ],
    }),
  );
  return pathToFileURL(join(plan.directory, 'manifest.json'));
}

test('failed second migration rolls back its schema and keeps first version', async () => {
  const tmp = await temporary('codeatlas-migration-failure-');
  try {
    await expectError('MIGRATION_FAILED', () =>
      runMigrations({
        databasePath: tmp.databasePath,
        databaseKind: 'REPOSITORY',
        manifestUrl: new URL('migration-failure/manifest.json', fixtures),
      }),
    );
    const database = new DatabaseSync(tmp.databasePath);
    try {
      assert.equal(version(database), 1);
      assert.equal(hasTable(database, 'stable_probe'), true);
      assert.equal(hasTable(database, 'rolled_back_probe'), false);
    } finally {
      database.close();
    }
  } finally {
    await tmp.remove();
  }
});

test('too-new database preserves prior state', async () => {
  const tmp = await temporary('codeatlas-migration-too-new-');
  try {
    const database = new DatabaseSync(tmp.databasePath);
    try {
      database.exec(
        "CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES ('kept'); PRAGMA user_version = 1",
      );
    } finally {
      database.close();
    }
    await expectError('DATABASE_TOO_NEW', () =>
      runMigrations({
        databasePath: tmp.databasePath,
        databaseKind: 'REPOSITORY',
        manifestUrl: new URL('database-too-new/manifest.json', fixtures),
      }),
    );
    const inspect = new DatabaseSync(tmp.databasePath);
    try {
      assert.equal(version(inspect), 1);
      assert.equal(inspect.prepare('SELECT value FROM sentinel').get().value, 'kept');
    } finally {
      inspect.close();
    }
  } finally {
    await tmp.remove();
  }
});

test('write lock prevents migration without partial state', async () => {
  const tmp = await temporary('codeatlas-migration-lock-');
  try {
    const blocker = new DatabaseSync(tmp.databasePath);
    try {
      blocker.exec('BEGIN IMMEDIATE');
      await expectError('MIGRATION_LOCKED', () =>
        runMigrations({
          databasePath: tmp.databasePath,
          databaseKind: 'REPOSITORY',
          manifestUrl: upgrade,
          lockTimeoutMs: 0,
        }),
      );
      blocker.exec('ROLLBACK');
      assert.equal(version(blocker), 0);
      assert.equal(hasTable(blocker, 'migration_probe'), false);
    } finally {
      blocker.close();
    }
  } finally {
    await tmp.remove();
  }
});

for (const sql of ['COMMIT;\n', 'ROLLBACK;\n', 'PRAGMA user_version = 99;\n']) {
  test(`migration SQL cannot execute ${sql.trim()}`, async (t) => {
    const tmp = await temporary('codeatlas-migration-escape-');
    try {
      const manifestUrl = await sqlManifest(t, sql);
      await expectError('MIGRATION_FAILED', () =>
        runMigrations({
          databasePath: tmp.databasePath,
          databaseKind: 'REPOSITORY',
          manifestUrl,
        }),
      );
      const inspect = new DatabaseSync(tmp.databasePath);
      try {
        assert.equal(version(inspect), 0);
      } finally {
        inspect.close();
      }
    } finally {
      await tmp.remove();
    }
  });
}

test('backup-required migration is refused before mutation', async (t) => {
  const tmp = await temporary('codeatlas-migration-backup-');
  try {
    const manifestUrl = await sqlManifest(
      t,
      'CREATE TABLE backup_probe (id INTEGER PRIMARY KEY);\n',
      true,
    );
    await expectError('MIGRATION_BACKUP_REQUIRED', () =>
      runMigrations({
        databasePath: tmp.databasePath,
        databaseKind: 'REPOSITORY',
        manifestUrl,
      }),
    );
    const inspect = new DatabaseSync(tmp.databasePath);
    try {
      assert.equal(version(inspect), 0);
      assert.equal(hasTable(inspect, 'backup_probe'), false);
    } finally {
      inspect.close();
    }
  } finally {
    await tmp.remove();
  }
});

test('concurrent version advance is re-read under lock and not replayed', async () => {
  const tmp = await temporary('codeatlas-migration-concurrent-');
  try {
    const plan = await loadMigrationPlan(upgrade, 'REPOSITORY');
    const firstOnly = { ...plan, latestVersion: 1, migrations: [plan.migrations[0]] };
    const database = new DatabaseSync(tmp.databasePath);
    let advanced = false;
    try {
      const result = applyMigrationPlan(database, plan, {
        beforeAcquire: () => {
          if (advanced) return;
          advanced = true;
          const other = new DatabaseSync(tmp.databasePath);
          try {
            applyMigrationPlan(other, firstOnly);
          } finally {
            other.close();
          }
        },
      });
      assert.deepEqual(result.appliedVersions, [2]);
      assert.equal(result.initialVersion, 0);
      assert.equal(result.finalVersion, 2);
    } finally {
      database.close();
    }
  } finally {
    await tmp.remove();
  }
});
