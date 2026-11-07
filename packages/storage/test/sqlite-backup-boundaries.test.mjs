import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { applyMigrationPlan } from '../dist/migrations/runner.js';

// Tiny test-owned SQLite, not a CodeAtlas workspace schema or candidate W009-W011.
// This exercises the actual backup API; it is not production backup orchestration,
// writer quiescence proof, lock handoff, user-DB admission or automatic recovery.
const schema = `
  CREATE TABLE backup_parent(id TEXT PRIMARY KEY, label TEXT NOT NULL) STRICT;
  CREATE TABLE backup_child(id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES backup_parent(id)) STRICT;
`;
const probe = 'CREATE TABLE backup_lock_probe(id INTEGER PRIMARY KEY) STRICT';
const migration = (version, sql, backupRequired) => ({
  version,
  name: 'test-owned-backup-' + version,
  file: 'test-owned-' + version + '.sql',
  checksum: 'sha256:' + createHash('sha256').update(sql).digest('hex'),
  backupRequired,
  sql,
});
const plan = (backupRequired) => ({
  schemaVersion: 1,
  databaseKind: 'WORKSPACE',
  latestVersion: 2,
  migrations: [migration(1, schema, false), migration(2, probe, backupRequired)],
});
function fixture(t) {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'codeatlas-sqlite-backup-'));
  const sourceDirectory = join(directory, 'source');
  const backupDirectory = join(directory, 'backup');
  mkdirSync(sourceDirectory);
  mkdirSync(backupDirectory);
  const sourcePath = join(sourceDirectory, 'source.sqlite');
  const backupPath = join(backupDirectory, 'backup.sqlite');
  const writer = new DatabaseSync(sourcePath, { enableForeignKeyConstraints: true });
  const connections = [writer];
  t.after(() => {
    for (const connection of connections.reverse()) {
      if (!connection.isOpen) continue;
      if (connection.isTransaction) connection.exec('ROLLBACK');
      connection.close();
    }
    // Recursive cleanup is restricted to this exact test-owned temporary directory.
    assert.equal(resolve(dirname(directory)), temporaryRoot);
    assert.ok(basename(directory).startsWith('codeatlas-sqlite-backup-'));
    rmSync(directory, { recursive: true, force: true });
  });
  writer.exec(schema);
  writer.exec('PRAGMA user_version=1');
  assert.equal(writer.prepare('PRAGMA journal_mode=WAL').get().journal_mode, 'wal');
  assert.equal(writer.prepare('PRAGMA wal_autocheckpoint=0').get().wal_autocheckpoint, 0);
  const beforeSentinel = readFileSync(sourcePath);
  writer.exec('BEGIN IMMEDIATE');
  writer
    .prepare('INSERT INTO backup_parent VALUES(?,?)')
    .run('uncheckpointed-sentinel', 'committed-in-WAL');
  writer.prepare('INSERT INTO backup_child VALUES(?,?)').run('child', 'uncheckpointed-sentinel');
  writer.exec('COMMIT');
  assert.deepEqual(readFileSync(sourcePath), beforeSentinel);
  assert.ok(statSync(sourcePath + '-wal').size > 32);
  const connect = (options = {}) => {
    const connection = new DatabaseSync(sourcePath, {
      enableForeignKeyConstraints: true,
      timeout: 0,
      ...options,
    });
    connections.push(connection);
    return connection;
  };
  return { writer, connect, connections, sourcePath, backupPath, backupDirectory, beforeSentinel };
}
const absentProbe = (db) =>
  assert.equal(
    db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='backup_lock_probe'").get().n,
    0,
  );

test('actual backup preserves committed uncheckpointed WAL with a separate writer guard and readonly source', async (t) => {
  const f = fixture(t),
    guard = f.connect(),
    source = f.connect({ readOnly: true }),
    contender = f.connect();
  assert.ok(
    source.prepare('PRAGMA page_count').get().page_count <= 16,
    'fixture stays intentionally small',
  );
  guard.exec('BEGIN IMMEDIATE');
  try {
    assert.throws(
      () => applyMigrationPlan(contender, plan(false)),
      (error) => error.code === 'MIGRATION_LOCKED',
    );
    assert.equal(contender.isTransaction, false);
    absentProbe(contender);
    assert.deepEqual(readdirSync(f.backupDirectory), []);
    let progressCalls = 0;
    const pending = backup(source, f.backupPath, {
      source: 'main',
      target: 'main',
      rate: 1,
      progress({ totalPages, remainingPages }) {
        progressCalls++;
        assert.ok(Number.isSafeInteger(totalPages) && totalPages > 0 && totalPages <= 16);
        assert.ok(
          Number.isSafeInteger(remainingPages) &&
            remainingPages >= 0 &&
            remainingPages <= totalPages,
        );
      },
    });
    assert.equal(typeof pending.then, 'function');
    const pages = await pending; // Real API settlement; no timeout-as-cancel wrapper.
    assert.ok(Number.isSafeInteger(pages) && pages > 0 && pages <= 16);
    assert.ok(progressCalls > 0);
    assert.equal(guard.isTransaction, true);
    assert.equal(source.isTransaction, false);
    assert.deepEqual(readFileSync(f.sourcePath), f.beforeSentinel);
    assert.ok(statSync(f.sourcePath + '-wal').size > 32);
    assert.deepEqual(readdirSync(f.backupDirectory), ['backup.sqlite']);

    // No source WAL/SHM was copied to this independent directory. The original
    // writer remains open and its sentinel is still only in the source WAL.
    const restored = new DatabaseSync(f.backupPath, {
      readOnly: true,
      enableForeignKeyConstraints: true,
    });
    f.connections.push(restored);
    assert.deepEqual(
      restored
        .prepare('PRAGMA integrity_check')
        .all()
        .map((row) => row.integrity_check),
      ['ok'],
    );
    assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(restored.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(
      restored.prepare('SELECT label FROM backup_parent WHERE id=?').get('uncheckpointed-sentinel')
        .label,
      'committed-in-WAL',
    );
    assert.equal(
      restored
        .prepare('SELECT p.id FROM backup_child c JOIN backup_parent p ON p.id=c.parent_id')
        .get().id,
      'uncheckpointed-sentinel',
    );
    absentProbe(restored);
    restored.close();
    assert.throws(
      () => applyMigrationPlan(contender, plan(false)),
      (error) => error.code === 'MIGRATION_LOCKED',
    );
    absentProbe(contender);
  } finally {
    guard.exec('ROLLBACK');
  }
  assert.equal(f.writer.prepare('PRAGMA user_version').get().user_version, 1);
  absentProbe(f.writer);
});

test('an actual completed backup does not bypass the existing backupRequired migration refusal', async (t) => {
  const f = fixture(t),
    guard = f.connect(),
    source = f.connect({ readOnly: true }),
    contender = f.connect();
  guard.exec('BEGIN IMMEDIATE');
  try {
    await backup(source, f.backupPath, { source: 'main', target: 'main', rate: 1 });
    assert.throws(
      () => applyMigrationPlan(contender, plan(true)),
      (error) => error.code === 'MIGRATION_BACKUP_REQUIRED',
    );
  } finally {
    guard.exec('ROLLBACK');
  }
  assert.throws(
    () => applyMigrationPlan(contender, plan(true)),
    (error) => error.code === 'MIGRATION_BACKUP_REQUIRED',
  );
  assert.equal(contender.isTransaction, false);
  assert.equal(contender.prepare('PRAGMA user_version').get().user_version, 1);
  absentProbe(contender);
});
