import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runMigrations, loadMigrationPlan } from '../dist/index.js';

const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
const fixtureUrl = new URL(
  '../../../fixtures/storage/native-analysis-state/cases.json',
  import.meta.url,
);
// Released values from PR #17's manifest, not calculated by the migration loader.
const releasedChecksums = [
  'aee2f70c50dad27f48ad74be5f59c05ad3260f793f07e581c8e8e161333825f3',
  '9f72c9de43ff151f878aa22d0641bb294ef8a24ec5fb7eebbab537348ce0675e',
  'e4e996c807312aac19262f18123fb07fb09de1ead58c0c52323284fd718017a4',
  '8fe353964ab1d749e25a661f2e41c1730376fe4ab0857a5ce598f7058208f354',
  '39f0175b2c25616d7f07cd0ed1d769c36c92355602949e018bfefc11a5428934',
  '0aef0920c2db24d9ae23e6cf05b7ab620ebf76e7ce0f1db82ac21b3c90c678fc',
  'f9e862c1a64d5cf917345036b5b7caee7b60b358020410b01e808b750011d7d4',
  'bd57f0d186f3834dd9dc8be9d36b7f0bebdab96f6cbbaa04d5d86fc46b49180a',
  '35a708e895e009be17336eb748a53406148d031523ad741da8d272e04758e870',
];
const releasedFiles = [
  'repo_core',
  'source_revision',
  'provider_runtime',
  'code_graph',
  'evidence',
  'analysis_coverage',
  'diagnostics',
  'indexed_fingerprint',
  'active_support_candidates',
];

async function withDatabase(t, run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-r010-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'repo.sqlite');
  const request = { databasePath, databaseKind: 'REPOSITORY', manifestUrl };
  await run({ directory, databasePath, request });
}

async function prefixManifest(directory, version, sqlSuffix = '') {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const migrations = structuredClone(manifest.migrations.slice(0, version));
  for (const entry of migrations) {
    let sql = await readFile(new URL(entry.file, manifestUrl), 'utf8');
    if (entry.version === version && sqlSuffix) {
      sql = sql.replace(/\r\n?/g, '\n') + sqlSuffix;
      entry.checksum = 'sha256:' + createHash('sha256').update(sql).digest('hex');
    }
    await writeFile(join(directory, entry.file), sql);
  }
  const url = pathToFileURL(
    join(directory, `manifest-${version}${sqlSuffix ? '-failed' : ''}.json`),
  );
  await writeFile(url, JSON.stringify({ ...manifest, migrations }));
  return url;
}

function seed(db) {
  db.exec(`
    INSERT INTO repository (slot,id,root_path) VALUES (1,'repo','/repo');
    INSERT INTO repository_state (repository_id,indexed_revision_id,indexed_content_fingerprint)
      VALUES ('repo','worktree','old-fingerprint');
    INSERT INTO revisions (id,repository_id,kind,content_fingerprint)
      VALUES ('worktree','repo','WORKTREE','old-fingerprint');
    INSERT INTO source_files (revision_id,id,repository_id,path,content_fingerprint,role,
      provenance,content_kind,language_hint,sensitivity)
      VALUES ('worktree','file','repo','A.java','file-fingerprint','SOURCE','AUTHORED','TEXT','java','INTERNAL');
    INSERT INTO provider_snapshots (id,repository_id,provider_id,provider_version,runtime_version,
      requested_revision_id,requested_revision_fingerprint,started_at,completed_at,outcome)
      VALUES ('snapshot','repo','native','1','1','worktree','old-fingerprint',1,2,'SUCCEEDED');
    INSERT INTO provider_capabilities (snapshot_id,name,support,coverage)
      VALUES ('snapshot','SYMBOL','SUPPORTED','COMPLETE');
    INSERT INTO canonical_nodes (revision_id,id,repository_id,fact_key,kind,name,
      confidence_score,confidence_method,confidence_reasons_json)
      VALUES ('worktree','node','repo','node-key','MODULE','Old',1,'exact','[]');
    INSERT INTO canonical_edges (revision_id,id,repository_id,fact_key,kind,source_node_id,
      target_state,resolution,confidence_score,confidence_method,confidence_reasons_json)
      VALUES ('worktree','edge','repo','edge-key','CALL','node','UNRESOLVED','UNRESOLVED',0,'unresolved','[]');
    INSERT INTO unresolved_targets (revision_id,edge_id,original_hint,candidates_json)
      VALUES ('worktree','edge','missing()','[]');
    INSERT INTO evidence (id,repository_id,revision_id,provider_snapshot_id,fact_type,
      provider_id,provider_fact_id,status)
      VALUES ('evidence','repo','worktree','snapshot','NODE','native','provider-node','ACTIVE');
    INSERT INTO fact_evidence (fact_type,canonical_fact_id,evidence_id) VALUES ('NODE','node','evidence');
    INSERT INTO provider_fact_bindings (fact_type,provider_id,provider_fact_id,provider_snapshot_id,
      canonical_fact_id,evidence_id) VALUES ('NODE','native','provider-node','snapshot','node','evidence');
    INSERT INTO active_support_candidates (evidence_id,fact_type,canonical_fact_id,candidate_json)
      VALUES ('evidence','NODE','node','{"test":"retained"}');
    INSERT INTO analysis_coverage (provider_snapshot_id,capability_name,source_file_id,status)
      VALUES ('snapshot','SYMBOL','file','COMPLETE');
    INSERT INTO analysis_diagnostics (provider_snapshot_id,ordinal,code,severity,message)
      VALUES ('snapshot',0,'TEST','INFO','retained');
  `);
}

function existingState(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'native_analysis_%' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

function emptyDerived(db) {
  assert.deepEqual(db.prepare('SELECT * FROM native_analysis_state').all(), []);
  assert.deepEqual(db.prepare('SELECT * FROM native_analysis_file').all(), []);
}

const cases = {
  'fresh-r010-and-rerun': async (t) =>
    withDatabase(t, async ({ request, databasePath }) => {
      assert.deepEqual(
        (await runMigrations(request)).appliedVersions,
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      );
      assert.deepEqual((await runMigrations(request)).appliedVersions, []);
      const db = new DatabaseSync(databasePath);
      try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
        emptyDerived(db);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        for (const table of ['native_analysis_state', 'native_analysis_file'])
          assert.equal(
            db
              .prepare('PRAGMA table_list')
              .all()
              .find((row) => row.name === table).strict,
            1,
          );
      } finally {
        db.close();
      }
    }),
  'r009-upgrade-preserves-state': async (t) =>
    withDatabase(t, async ({ directory, request, databasePath }) => {
      await runMigrations({ ...request, manifestUrl: await prefixManifest(directory, 9) });
      const oldDb = new DatabaseSync(databasePath);
      let before;
      try {
        seed(oldDb);
        before = existingState(oldDb);
      } finally {
        oldDb.close();
      }
      assert.deepEqual((await runMigrations(request)).appliedVersions, [10]);
      const db = new DatabaseSync(databasePath);
      try {
        assert.deepEqual(existingState(db), before);
        emptyDerived(db);
      } finally {
        db.close();
      }
    }),
  'r010-failure-rolls-back': async (t) =>
    withDatabase(t, async ({ directory, request, databasePath }) => {
      const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
      assert.equal(manifest.migrations.at(-1).version, 10);
      await runMigrations({ ...request, manifestUrl: await prefixManifest(directory, 9) });
      const oldDb = new DatabaseSync(databasePath);
      let before;
      try {
        seed(oldDb);
        before = existingState(oldDb);
      } finally {
        oldDb.close();
      }
      const failedUrl = await prefixManifest(
        directory,
        10,
        'SELECT * FROM missing_r010_failure;\n',
      );
      await assert.rejects(runMigrations({ ...request, manifestUrl: failedUrl }), {
        code: 'MIGRATION_FAILED',
      });
      const db = new DatabaseSync(databasePath);
      try {
        assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
        assert.deepEqual(existingState(db), before);
        assert.deepEqual(
          db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'native_analysis_%'").all(),
          [],
        );
      } finally {
        db.close();
      }
      assert.deepEqual((await runMigrations(request)).appliedVersions, [10]);
    }),
  'immutable-r001-r009': async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    assert.deepEqual(
      manifest.migrations.slice(0, 9),
      releasedFiles.map((name, index) => ({
        version: index + 1,
        name,
        file: `${String(index + 1).padStart(3, '0')}_${name}.sql`,
        checksum: `sha256:${releasedChecksums[index]}`,
        backupRequired: false,
      })),
    );
    const plan = await loadMigrationPlan(manifestUrl, 'REPOSITORY');
    assert.equal(plan.latestVersion, 10);
    assert.deepEqual(manifest.migrations.at(-1), {
      version: 10,
      name: 'native_analysis_state',
      file: '010_native_analysis_state.sql',
      checksum: 'sha256:' + createHash('sha256').update(plan.migrations.at(-1).sql).digest('hex'),
      backupRequired: false,
    });
  },
  'derived-constraints-and-source-independence': async (t) =>
    withDatabase(t, async ({ request, databasePath }) => {
      await runMigrations(request);
      const db = new DatabaseSync(databasePath);
      try {
        seed(db);
        const header = db.prepare('INSERT INTO native_analysis_state VALUES (?,?,?,?,?,?)');
        const file = db.prepare('INSERT INTO native_analysis_file VALUES (?,?,?,?,?,?)');
        assert.throws(
          () => header.run('missing', 'native', 'snapshot', 'worktree', 'old-fingerprint', '{}'),
          /FOREIGN KEY/,
        );
        assert.throws(
          () => header.run('repo', 'native', 'missing', 'worktree', 'old-fingerprint', '{}'),
          /FOREIGN KEY/,
        );
        assert.throws(
          () => header.run('repo', 'native', 'snapshot', 'worktree', 'old-fingerprint', '{'),
          /CHECK/,
        );
        header.run('repo', 'native', 'snapshot', 'worktree', 'old-fingerprint', '{}');
        assert.throws(
          () => header.run('repo', 'native', 'snapshot', 'worktree', 'old-fingerprint', '{}'),
          /UNIQUE/,
        );
        assert.throws(
          () => file.run('repo', 'other', 'file', 'A.java', 'file-fingerprint', '{}'),
          /FOREIGN KEY/,
        );
        assert.throws(
          () => file.run('repo', 'native', 'file', 'A.java', 'file-fingerprint', '{'),
          /CHECK/,
        );
        file.run('repo', 'native', 'file', 'A.java', 'file-fingerprint', '{}');
        assert.throws(
          () => file.run('repo', 'native', 'file', 'B.java', 'file-fingerprint', '{}'),
          /UNIQUE/,
        );
        assert.throws(
          () => file.run('repo', 'native', 'other-file', 'A.java', 'file-fingerprint', '{}'),
          /UNIQUE/,
        );
        db.exec(
          "DELETE FROM source_files; UPDATE revisions SET content_fingerprint='new-fingerprint';",
        );
        assert.equal(db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n, 1);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        db.exec('DELETE FROM native_analysis_state');
        emptyDerived(db);
      } finally {
        db.close();
      }
    }),
  'too-new-and-workspace-isolation': async (t) =>
    withDatabase(t, async ({ directory, request, databasePath }) => {
      await runMigrations(request);
      const db = new DatabaseSync(databasePath);
      try {
        db.exec('PRAGMA user_version=11');
      } finally {
        db.close();
      }
      await assert.rejects(runMigrations(request), { code: 'DATABASE_TOO_NEW' });
      const workspacePath = join(directory, 'workspace.sqlite');
      await runMigrations({
        databasePath: workspacePath,
        databaseKind: 'WORKSPACE',
        manifestUrl: new URL('../migrations/workspace/manifest.json', import.meta.url),
      });
      const workspace = new DatabaseSync(workspacePath);
      try {
        assert.equal(workspace.prepare('PRAGMA user_version').get().user_version, 3);
        assert.deepEqual(
          workspace
            .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'native_analysis_%'")
            .all(),
          [],
        );
      } finally {
        workspace.close();
      }
    }),
};

test('p05-native-analysis-state-store-v1 maps every declared case to an executed test', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(fixture.task, 'P05-W3-020-B');
  assert.equal(fixture.id, 'p05-native-analysis-state-store-v1');
  assert.equal(
    fixture.governingSpec,
    'docs/superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md',
  );
  assert.deepEqual(fixture.cases, Object.keys(cases));
});
for (const [id, run] of Object.entries(cases)) test(`R010 ${id}`, run);
