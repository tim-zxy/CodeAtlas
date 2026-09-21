import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runMigrations } from '../dist/index.js';

const schemaFixtureUrl = new URL(
  '../../../fixtures/storage/repository-schema/cases.json',
  import.meta.url,
);
const productionManifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
const migrationNames = [
  'repo_core',
  'source_revision',
  'provider_runtime',
  'code_graph',
  'evidence',
  'analysis_coverage',
  'diagnostics',
];
const expectedTables = [
  'repository',
  'repository_state',
  'revisions',
  'source_files',
  'provider_snapshots',
  'provider_capabilities',
  'canonical_nodes',
  'canonical_edges',
  'unresolved_targets',
  'evidence',
  'fact_evidence',
  'provider_fact_bindings',
  'analysis_coverage',
  'analysis_diagnostics',
];
const criticalIndexes = [
  'idx_revisions_fingerprint',
  'idx_source_files_path',
  'idx_provider_snapshots_revision',
  'idx_canonical_nodes_fact_key',
  'idx_canonical_nodes_kind',
  'idx_canonical_edges_fact_key',
  'idx_canonical_edges_source',
  'idx_canonical_edges_target',
  'idx_unresolved_targets_hint',
  'idx_evidence_snapshot_status',
  'idx_provider_fact_bindings_provider',
  'idx_analysis_coverage_capability',
  'idx_analysis_diagnostics_snapshot',
];

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return { directory, remove: () => rm(directory, { recursive: true }) };
}

function inventory(database, type) {
  return database
    .prepare('SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name')
    .all(type, 'sqlite_%')
    .map((row) => row.name);
}

function userVersion(database) {
  return database.prepare('PRAGMA user_version').get().user_version;
}

test('p0-repository-schema-v1 Fixture maps to task and acceptance', async () => {
  assert.deepEqual(JSON.parse(await readFile(schemaFixtureUrl, 'utf8')), {
    schemaVersion: 1,
    id: 'p0-repository-schema-v1',
    task: 'P0-W1-006',
    governingSpec: 'docs/handoff/specs/SQLITE_SCHEMA.md',
    acceptance:
      'R001-R007 and critical indexes exist after fresh and sequential repository upgrades',
    cases: ['fresh-to-latest', 'sequential-upgrade', 'constraints-and-isolation'],
  });
});

test('repository manifest declares immutable R001-R007 only', async () => {
  const manifest = JSON.parse(await readFile(productionManifestUrl, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.databaseKind, 'REPOSITORY');
  assert.deepEqual(
    manifest.migrations.map(({ version, name }) => ({ version, name })),
    migrationNames.map((name, index) => ({ version: index + 1, name })),
  );
  assert.ok(manifest.migrations.every(({ backupRequired }) => backupRequired === false));
});

test('fresh repository database reaches version 7 with exact Phase 0 tables and critical indexes', async () => {
  const tmp = await temporaryDirectory('codeatlas-repo-schema-fresh-');
  const databasePath = join(tmp.directory, 'repo.sqlite');
  try {
    const request = {
      databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl: productionManifestUrl,
    };
    assert.deepEqual((await runMigrations(request)).appliedVersions, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual((await runMigrations(request)).appliedVersions, []);
    const db = new DatabaseSync(databasePath);
    try {
      assert.equal(userVersion(db), 7);
      assert.deepEqual(inventory(db, 'table'), [...expectedTables].sort());
      for (const index of criticalIndexes) assert.ok(inventory(db, 'index').includes(index), index);
      assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
      assert.equal(db.prepare('SELECT indexed_revision_id FROM repository_state').get(), undefined);
      for (const forbidden of [
        'workspace',
        'revision_sets',
        'knowledge_items',
        'execution_nodes',
        'runtime_flows',
      ]) {
        assert.ok(!inventory(db, 'table').includes(forbidden), forbidden);
      }
    } finally {
      db.close();
    }
  } finally {
    await tmp.remove();
  }
});

test('all seven sequential upgrade boundaries preserve preceding tables', async () => {
  const tmp = await temporaryDirectory('codeatlas-repo-schema-sequential-');
  const databasePath = join(tmp.directory, 'repo.sqlite');
  const manifest = JSON.parse(await readFile(productionManifestUrl, 'utf8'));
  try {
    for (let version = 1; version <= 7; version++) {
      const prefixManifestUrl = pathToFileURL(join(tmp.directory, `manifest-${version}.json`));
      await writeFile(
        prefixManifestUrl,
        JSON.stringify({ ...manifest, migrations: manifest.migrations.slice(0, version) }),
      );
      for (const migration of manifest.migrations.slice(0, version)) {
        await writeFile(
          join(tmp.directory, migration.file),
          await readFile(new URL(migration.file, productionManifestUrl)),
        );
      }
      const result = await runMigrations({
        databasePath,
        databaseKind: 'REPOSITORY',
        manifestUrl: prefixManifestUrl,
      });
      assert.deepEqual(result.appliedVersions, [version]);
      assert.equal(result.initialVersion, version - 1);
      const db = new DatabaseSync(databasePath);
      try {
        assert.equal(userVersion(db), version);
        const tables = inventory(db, 'table');
        for (const required of expectedTables.slice(0, [2, 4, 6, 9, 12, 13, 14][version - 1])) {
          assert.ok(tables.includes(required), `${required} at version ${version}`);
        }
      } finally {
        db.close();
      }
    }
    assert.deepEqual(
      (
        await runMigrations({
          databasePath,
          databaseKind: 'REPOSITORY',
          manifestUrl: productionManifestUrl,
        })
      ).appliedVersions,
      [],
    );
  } finally {
    await tmp.remove();
  }
});
