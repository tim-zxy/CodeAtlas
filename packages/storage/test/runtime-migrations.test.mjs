import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { loadMigrationPlan, runMigrations } from '../dist/index.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
const root = new URL('../../../fixtures/phase1/runtime-storage/', import.meta.url);
const expected = JSON.parse(readFileSync(new URL('expected.json', root)));
const manifest = (kind) => new URL('../migrations/' + kind + '/manifest.json', import.meta.url);
const version = (db) => db.prepare('PRAGMA user_version').get().user_version;
const prefix = (p, n) => ({ ...p, latestVersion: n, migrations: p.migrations.slice(0, n) });
for (const kind of ['repository', 'workspace']) {
  test(
    kind + ' historical runtime migration inventory, empty, upgrade, rerun and read-only reopen',
    async (t) => {
      const e = expected[kind],
        p = prefix(await loadMigrationPlan(manifest(kind), kind.toUpperCase()), e.latestVersion);
      assert.equal(p.latestVersion, e.latestVersion);
      assert.ok(p.migrations.slice(e.previousVersion).every((m) => m.backupRequired === false));
      // Unique retained owned files; never a user database or mutable R4.
      const dir = mkdtempSync(join(tmpdir(), 'codeatlas-b5-migration-')),
        path = join(dir, 'owned.sqlite');
      const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
      t.after(() => {
        if (db.isOpen) db.close();
      });
      applyMigrationPlan(db, prefix(p, e.previousVersion));
      db.prepare('INSERT INTO ' + kind + '(slot,id,root_path) VALUES(1,?,?)').run(
        kind + ':owned',
        dir,
      );
      const oldTables = db
        .prepare(
          "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all();
      const oldRows = oldTables.map(({ name }) => [
        name,
        db.prepare('SELECT * FROM "' + name + '"').all(),
      ]);
      const r = applyMigrationPlan(db, p);
      assert.deepEqual(
        r.appliedVersions,
        Array.from(
          { length: e.latestVersion - e.previousVersion },
          (_, i) => e.previousVersion + i + 1,
        ),
      );
      for (const row of oldTables)
        assert.equal(
          db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(row.name).sql,
          row.sql,
        );
      for (const [name, rows] of oldRows)
        assert.deepEqual(db.prepare('SELECT * FROM "' + name + '"').all(), rows);
      const tables = new Map(
        db
          .prepare('PRAGMA table_list')
          .all()
          .map((x) => [x.name, x]),
      );
      for (const name of e.newTables) assert.equal(tables.get(name)?.strict, 1, name);
      assert.deepEqual(
        [...tables.keys()].filter((name) => !name.startsWith('sqlite_')).sort(),
        [...oldTables.map((row) => row.name), ...e.newTables].sort(),
      );
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.deepEqual(applyMigrationPlan(db, p).appliedVersions, []);
      db.close();
      const ro = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(version(ro), e.latestVersion);
        assert.deepEqual(ro.prepare('PRAGMA foreign_key_check').all(), []);
      } finally {
        ro.close();
      }
      const emptyPath = join(dir, 'empty.sqlite');
      const empty = await runMigrations({
        databasePath: emptyPath,
        databaseKind: kind.toUpperCase(),
        manifestUrl: manifest(kind),
      });
      assert.equal(empty.finalVersion, kind === 'workspace' ? 8 : e.latestVersion);
    },
  );
  test(
    kind + ' failure rolls back only failing version and retains committed predecessor',
    async (t) => {
      const e = expected[kind],
        p = prefix(await loadMigrationPlan(manifest(kind), kind.toUpperCase()), e.latestVersion);
      assert.equal(p.latestVersion, e.latestVersion);
      const db = new DatabaseSync(':memory:');
      t.after(() => db.close());
      const bad = {
        ...p,
        migrations: p.migrations.map((m, i) =>
          i === p.migrations.length - 1
            ? { ...m, sql: m.sql + '\nINSERT INTO absent_b5_table VALUES(1);' }
            : m,
        ),
      };
      assert.throws(() => applyMigrationPlan(db, bad));
      assert.equal(version(db), e.latestVersion - 1);
      assert.equal(
        db.prepare('SELECT count(*) n FROM sqlite_schema WHERE name=?').get(e.newTables.at(-1)).n,
        0,
      );
      assert.equal(applyMigrationPlan(db, p).finalVersion, e.latestVersion);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    },
  );
}
test('runtime graph relations are activation-local, immutable and reject dangling resolved targets', async (t) => {
  const p = await loadMigrationPlan(manifest('repository'), 'REPOSITORY');
  assert.equal(p.latestVersion, 13);
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => db.close());
  applyMigrationPlan(db, p);
  db.exec(
    "INSERT INTO repository(slot,id,root_path)VALUES(1,'r','owned'); INSERT INTO revisions(id,repository_id,kind,content_fingerprint)VALUES('v','r','WORKTREE','fp'); INSERT INTO activation_history(id,repository_id,revision_id,manifest_digest,manifest_json)VALUES('s','r','v','" +
      'a'.repeat(64) +
      "','{}');",
  );
  const a = db.prepare(
    'INSERT INTO runtime_activations(id,repository_id,revision_id,parent_id,syntax_activation_id,code_basis_json,syntax_membership_digest,policy_digest,candidate_digest,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const id of ['a', 'b'])
    a.run(
      id,
      'r',
      'v',
      null,
      's',
      '{}',
      'b'.repeat(64),
      'c'.repeat(64),
      'd'.repeat(64),
      'codeatlas.runtime-activation',
      1,
      '{}',
      'e'.repeat(64),
    );
  const base = ['k', 'codeatlas.runtime-fact-set', 1, '{}', 'f'.repeat(64)];
  db.prepare(
    'INSERT INTO runtime_domain_facts(activation_id,entity_id,fact_key,kind,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?)',
  ).run('a', 'entry', 'entry-key', 'ENTRY_POINT', ...base.slice(1));
  db.prepare(
    'INSERT INTO execution_contexts(activation_id,entity_id,fact_key,entry_id,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?)',
  ).run('a', 'ctx', ...['ctx-key', 'entry', ...base.slice(1)]);
  const node = db.prepare(
    'INSERT INTO execution_nodes(activation_id,entity_id,fact_key,context_id,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?)',
  );
  node.run('a', 'node', 'node-key', 'ctx', ...base.slice(1));
  assert.throws(() => node.run('b', 'bad', 'bad-key', 'ctx', ...base.slice(1)), /FOREIGN KEY/);
  const edge = db.prepare(
    'INSERT INTO execution_edges(activation_id,entity_id,fact_key,context_id,source_id,target_id,target_resolution,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  );

  db.prepare(
    'INSERT INTO execution_contexts(activation_id,entity_id,fact_key,entry_id,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?)',
  ).run('a', 'other-context', 'other-key', 'entry', ...base.slice(1));
  assert.throws(
    () =>
      edge.run(
        'a',
        'wrong-context',
        'wrong-key',
        'other-context',
        'node',
        null,
        'NON_RESOLVED',
        ...base.slice(1),
      ),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      db
        .prepare(
          'INSERT INTO execution_contexts(activation_id,entity_id,fact_key,entry_id,schema_name,schema_version,payload_json,value_digest)VALUES(?,?,?,?,?,?,?,?)',
        )
        .run('a', 'missing-entry', 'missing-key', null, ...base.slice(1)),
    /NOT NULL/,
  );
  assert.throws(
    () => edge.run('a', 'edge', 'edge-key', 'ctx', 'node', 'absent', 'RESOLVED', ...base.slice(1)),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => edge.run('a', 'edge', 'edge-key', 'ctx', 'node', null, 'RESOLVED', ...base.slice(1)),
    /CHECK/,
  );
  edge.run('a', 'edge', 'edge-key', 'ctx', 'node', null, 'NON_RESOLVED', ...base.slice(1));
  assert.throws(
    () => db.exec("UPDATE runtime_activations SET payload_json='{}' WHERE id='a'"),
    /IMMUTABLE/,
  );
  assert.throws(() => db.exec("DELETE FROM execution_nodes WHERE entity_id='node'"), /IMMUTABLE/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
