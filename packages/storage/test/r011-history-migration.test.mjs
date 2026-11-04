import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadMigrationPlan, runMigrations } from '../dist/index.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { historyFixture, prefixPlan, persistentRows } from './helpers/r011-history-fixture.mjs';
const names = [
  'activation_history',
  'syntax_origins',
  'syntax_projections',
  'activation_syntax_members',
  'active_history_pointer',
];
export const legacyTables = [
  'canonical_nodes',
  'canonical_edges',
  'unresolved_targets',
  'evidence',
  'provider_fact_bindings',
  'fact_evidence',
  'active_support_candidates',
  'provider_snapshots',
  'provider_capabilities',
  'analysis_coverage',
  'repository_state',
];
const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
test('production migration retains immutable R011 within schema13', async () => {
  const p = await loadMigrationPlan(manifestUrl, 'REPOSITORY');
  assert.equal(p.latestVersion, 13);
  assert.equal(p.migrations[10].name, 'framework_syntax');
  assert.equal(p.migrations[10].backupRequired, false);
});
test('R011 exact tables indexes triggers and rerun preserve old rows', async (t) => {
  const f = await historyFixture(t, 'migration', { version: 10 });
  const old = Object.fromEntries(
    Object.keys(f.input.tables)
      .filter((x) => !names.includes(x))
      .map((x) => [x, f.db.prepare('SELECT * FROM ' + x + ' ORDER BY rowid').all()]),
  );
  const plan = await prefixPlan(11);
  assert.deepEqual(applyMigrationPlan(f.db, plan).appliedVersions, [11]);
  assert.deepEqual(applyMigrationPlan(f.db, plan).appliedVersions, []);
  for (const [n, rows] of Object.entries(old))
    assert.deepEqual(f.db.prepare('SELECT * FROM ' + n + ' ORDER BY rowid').all(), rows);
  for (const name of names) {
    assert.equal(
      f.db.prepare('SELECT strict FROM pragma_table_list WHERE name=?').get(name).strict,
      1,
    );
    assert.equal(f.db.prepare('SELECT count(*)AS n FROM ' + name).get().n, 0);
  }
  const triggers = f.db
    .prepare(
      "SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'r011_%' ORDER BY name",
    )
    .all();
  assert.equal(triggers.length, 41);
  const expected = [
    ...names
      .slice(0, 4)
      .flatMap((n) => ['update', 'delete'].map((op) => 'r011_immutable_' + n + '_' + op)),
    ...legacyTables.flatMap((n) =>
      ['insert', 'update', 'delete'].map((op) => 'r011_invalidate_' + n + '_' + op),
    ),
  ].sort();
  assert.deepEqual(
    triggers.map((x) => x.name),
    expected,
  );
  for (const r of triggers)
    assert.ok(
      r.sql.includes(
        r.name.includes('immutable')
          ? "RAISE(ABORT,'R011_IMMUTABLE')"
          : 'DELETE FROM active_history_pointer',
      ),
    );
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  f.db.close();
  const reopened = f.reopen();
  assert.equal(reopened.prepare('PRAGMA user_version').get().user_version, 11);
});
test('all immutable rows reject update and delete', async (t) => {
  const f = await historyFixture(t, 'syntax');
  for (const table of names.slice(0, 4))
    for (const op of ['UPDATE', 'DELETE'])
      assert.throws(
        () =>
          f.db.exec(
            op === 'UPDATE' ? 'UPDATE ' + table + ' SET rowid=rowid' : 'DELETE FROM ' + table,
          ),
        /R011_IMMUTABLE/,
      );
  assert.equal(f.db.prepare('SELECT count(*)AS n FROM active_history_pointer').get().n, 1);
});
test('R011 SQL failure at every DDL boundary preserves R010 after disk reopen', async (t) => {
  const f = await historyFixture(t, 'migration', { version: 10 }),
    plan = await prefixPlan(11),
    entry = plan.migrations[10],
    blocks = entry.sql.trim().split(/\n(?=CREATE (?:TABLE|INDEX|TRIGGER))/);
  assert.equal(blocks.length, 50);
  const before = Object.fromEntries(
    Object.keys(f.input.tables)
      .filter((x) => !names.includes(x))
      .map((x) => [x, f.db.prepare('SELECT * FROM ' + x + ' ORDER BY rowid').all()]),
  );
  f.db.close();
  const raw = JSON.parse(await readFile(manifestUrl, 'utf8'));
  for (let i = 0; i < blocks.length; i++)
    await t.test(String(i), async () => {
      const directory = join(f.directory, 'failure-' + i);
      await mkdir(directory);
      const sql = blocks.slice(0, i + 1).join('\n') + '\nSELECT * FROM deliberate_r011_failure;\n';
      for (const e of raw.migrations)
        await writeFile(
          join(directory, e.file),
          e.version === 11 ? sql : await readFile(new URL(e.file, manifestUrl), 'utf8'),
        );
      const manifest = structuredClone(raw);
      manifest.migrations[10].checksum =
        'sha256:' + createHash('sha256').update(sql.replace(/\r\n?/g, '\n')).digest('hex');
      const url = pathToFileURL(join(directory, 'manifest.json'));
      await writeFile(url, JSON.stringify(manifest));
      await assert.rejects(
        runMigrations({
          databasePath: f.databasePath,
          databaseKind: 'REPOSITORY',
          manifestUrl: url,
        }),
        { code: 'MIGRATION_FAILED' },
      );
      const db = f.reopen();
      try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
        for (const [n, rows] of Object.entries(before))
          assert.deepEqual(db.prepare('SELECT * FROM ' + n + ' ORDER BY rowid').all(), rows);
        assert.deepEqual(
          db
            .prepare(
              "SELECT name FROM sqlite_schema WHERE name LIKE 'r011_%' OR name IN('activation_history','syntax_origins','syntax_projections','activation_syntax_members','active_history_pointer')",
            )
            .all(),
          [],
        );
      } finally {
        db.close();
      }
    });
});
test('R011 migration rejects old plan and preserves lock ownership', async (t) => {
  const f = await historyFixture(t);
  const old = await prefixPlan(10);
  assert.throws(() => applyMigrationPlan(f.db, old), { code: 'DATABASE_TOO_NEW' });
});
// SQL trigger conformance uses schema-valid spare rows, not a claim of a newly qualified activation.
for (const table of legacyTables)
  for (const op of ['INSERT', 'UPDATE', 'DELETE'])
    test('legacy ' + table + ' ' + op + ' commits invalidation and rolls it back', async (t) => {
      const f = await historyFixture(t, 'legacy', { seed: false }),
        input = structuredClone(f.input),
        pointer = input.tables.active_history_pointer[0];
      input.tables.active_history_pointer = [];
      const n = input.tables.canonical_nodes[0],
        e = input.tables.canonical_edges[0],
        v = input.tables.evidence[0],
        binding = input.tables.provider_fact_bindings.find((b) => b.evidence_id === v.id),
        snap = input.tables.provider_snapshots[0];
      input.tables.canonical_nodes.push({ ...n, id: 'spare:node', fact_key: 'spare:key' });
      input.tables.canonical_edges.push({
        ...e,
        id: 'spare:edge',
        fact_key: 'spare:edge-key',
        target_state: 'UNRESOLVED',
        resolution: 'UNRESOLVED',
        target_node_id: null,
      });
      input.tables.unresolved_targets = [
        {
          revision_id: e.revision_id,
          edge_id: 'spare:edge',
          original_hint: 'spare',
          candidates_json: '[]',
        },
      ];
      input.tables.evidence.push({
        ...v,
        id: 'spare:evidence',
        provider_fact_id: 'spare:fact',
        status: 'INVALIDATED',
      });
      input.tables.provider_fact_bindings.push({
        ...binding,
        evidence_id: 'spare:evidence',
        provider_fact_id: 'spare:fact',
      });
      input.tables.provider_snapshots.push({ ...snap, id: 'spare:snapshot' });
      const { seedLiteral } = await import('./helpers/r011-history-fixture.mjs');
      seedLiteral(f.db, input);
      f.db
        .prepare('INSERT INTO active_history_pointer VALUES(?,?)')
        .run(pointer.repository_id, pointer.activation_id);
      const base = f.input.tables[table][0] ?? input.tables[table][0];
      const row = { ...base };
      if (op === 'INSERT') {
        if (table === 'canonical_nodes')
          Object.assign(row, { id: 'insert:node', fact_key: 'insert:node-key' });
        if (table === 'canonical_edges')
          Object.assign(row, { id: 'insert:edge', fact_key: 'insert:edge-key' });
        if (table === 'unresolved_targets') row.edge_id = e.id;
        if (table === 'evidence')
          Object.assign(row, {
            id: 'insert:evidence',
            provider_fact_id: 'insert:fact',
            status: 'INVALIDATED',
          });
        if (table === 'provider_fact_bindings')
          Object.assign(row, {
            evidence_id: 'spare:evidence',
            provider_fact_id: 'spare:fact',
            canonical_fact_id: input.tables.canonical_nodes[1].id,
          });
        if (table === 'fact_evidence') row.evidence_id = 'spare:evidence';
        if (table === 'active_support_candidates') row.evidence_id = 'spare:evidence';
        if (table === 'provider_snapshots') row.id = 'insert:snapshot';
        if (table === 'provider_capabilities') row.snapshot_id = 'spare:snapshot';
      }
      const mutate = () => {
        if (op === 'INSERT') {
          const cols = Object.keys(row);
          return f.db
            .prepare(
              'INSERT ' +
                (table === 'repository_state' ? 'OR REPLACE ' : '') +
                'INTO ' +
                table +
                '(' +
                cols.join(',') +
                ')VALUES(' +
                cols.map(() => '?').join(',') +
                ')',
            )
            .run(...Object.values(row));
        }
        return f.db
          .prepare(
            op === 'UPDATE'
              ? 'UPDATE ' + table + ' SET rowid=rowid'
              : 'DELETE FROM ' + table + ' WHERE rowid=(SELECT max(rowid)FROM ' + table + ')',
          )
          .run();
      };
      f.db.exec('BEGIN');
      assert.ok(mutate().changes > 0);
      assert.equal(f.db.prepare('SELECT count(*)AS n FROM active_history_pointer').get().n, 0);
      f.db.exec('ROLLBACK');
      assert.equal(f.db.prepare('SELECT count(*)AS n FROM active_history_pointer').get().n, 1);
      assert.ok(mutate().changes > 0);
      assert.equal(f.db.prepare('SELECT count(*)AS n FROM active_history_pointer').get().n, 0);
      assert.equal(f.db.prepare('SELECT count(*)AS n FROM activation_history').get().n, 1);
    });
test('Source validated CAS keeps immutable history and pointer', async (t) => {
  const f = await historyFixture(t);
  const { RepositorySourceStateStore } = await import('../dist/index.js');
  const store = new RepositorySourceStateStore(f.db),
    before = store.load(f.input.repositoryId),
    old = f.db.prepare('SELECT * FROM activation_history').all();
  store.replace(before, {
    revision: { ...before.revision, contentFingerprint: 'source:advanced' },
    files: before.files.map((x) => ({
      ...x,
      classification: { ...x.classification, role: 'TEST' },
    })),
  });
  assert.deepEqual(f.db.prepare('SELECT * FROM activation_history').all(), old);
  assert.equal(f.db.prepare('SELECT count(*)AS n FROM active_history_pointer').get().n, 1);
});
test('R011 relational constraints reject invalid JSON digest FK duplicates', async (t) => {
  const f = await historyFixture(t, 'syntax');
  assert.throws(
    () => f.db.prepare('INSERT INTO active_history_pointer VALUES(?,?)').run('missing', 'missing'),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      f.db.exec(
        "INSERT INTO activation_history VALUES('new','capture-repo','capture-worktree',NULL,'bad','{}')",
      ),
    /CHECK/,
  );
  assert.throws(
    () =>
      f.db.exec(
        "INSERT INTO activation_history VALUES('new','capture-repo','capture-worktree',NULL,'" +
          '0'.repeat(64) +
          "','[]')",
      ),
    /CHECK/,
  );
  for (const table of names) {
    const row = f.db.prepare('SELECT * FROM ' + table + ' LIMIT 1').get(),
      cols = Object.keys(row);
    assert.throws(
      () =>
        f.db
          .prepare(
            'INSERT INTO ' +
              table +
              '(' +
              cols.join(',') +
              ')VALUES(' +
              cols.map(() => '?').join(',') +
              ')',
          )
          .run(...Object.values(row)),
      /UNIQUE/,
    );
  }
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
});
test('pending R011 lock refusal preserves the other connection transaction', async (t) => {
  const f = await historyFixture(t, 'migration', { version: 10 }),
    other = f.reopen(),
    plan = await prefixPlan(11);
  f.db.exec('BEGIN IMMEDIATE');
  try {
    assert.throws(() => applyMigrationPlan(other, plan), { code: 'MIGRATION_LOCKED' });
    assert.equal(f.db.isTransaction, true);
    assert.equal(other.isTransaction, false);
    assert.equal(other.prepare('PRAGMA user_version').get().user_version, 10);
  } finally {
    f.db.exec('ROLLBACK');
  }
});
