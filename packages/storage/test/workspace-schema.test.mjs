import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runMigrations } from '../dist/index.js';

const fixtureUrl = new URL(
  '../../../fixtures/storage/workspace-schema/cases.json',
  import.meta.url,
);
const manifestUrl = new URL('../migrations/workspace/manifest.json', import.meta.url);
const migrationNames = ['workspace_core', 'repositories', 'revision_sets'];
const expectedTables = ['workspace', 'repositories', 'revision_sets', 'revision_set_items'];
const expectedTriggers = [
  'trg_frozen_revision_set_delete',
  'trg_frozen_revision_set_update',
  'trg_frozen_revision_set_item_insert',
  'trg_frozen_revision_set_item_update',
  'trg_frozen_revision_set_item_delete',
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

test('p0-workspace-schema-v1 Fixture maps to task and acceptance', async () => {
  assert.deepEqual(JSON.parse(await readFile(fixtureUrl, 'utf8')), {
    schemaVersion: 1,
    id: 'p0-workspace-schema-v1',
    task: 'P0-W1-007',
    governingSpec: 'docs/handoff/specs/SQLITE_SCHEMA.md',
    acceptance:
      'W001-W003 exist after fresh and sequential workspace upgrades and frozen RevisionSets are immutable',
    cases: [
      'fresh-to-latest',
      'sequential-upgrade',
      'constraints-and-isolation',
      'frozen-revision-set',
    ],
  });
});

test('workspace manifest declares immutable W001-W003 only', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.databaseKind, 'WORKSPACE');
  assert.deepEqual(
    manifest.migrations.map(({ version, name }) => ({ version, name })),
    migrationNames.map((name, index) => ({ version: index + 1, name })),
  );
  assert.ok(manifest.migrations.every(({ backupRequired }) => backupRequired === false));
});

test('fresh workspace database reaches version 3 with exact Phase 0 inventory', async () => {
  const temporary = await temporaryDirectory('codeatlas-workspace-schema-fresh-');
  const databasePath = join(temporary.directory, 'workspace.sqlite');
  try {
    const request = { databasePath, databaseKind: 'WORKSPACE', manifestUrl };
    assert.deepEqual((await runMigrations(request)).appliedVersions, [1, 2, 3]);
    assert.deepEqual((await runMigrations(request)).appliedVersions, []);
    const database = new DatabaseSync(databasePath);
    try {
      assert.equal(userVersion(database), 3);
      assert.deepEqual(inventory(database, 'table'), [...expectedTables].sort());
      assert.deepEqual(inventory(database, 'trigger'), [...expectedTriggers].sort());
      assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
      for (const forbidden of [
        'services',
        'contracts',
        'documents',
        'claims',
        'knowledge_items',
        'evaluation_runs',
        'usage_events',
        'canonical_nodes',
      ]) {
        assert.ok(!inventory(database, 'table').includes(forbidden), forbidden);
      }
    } finally {
      database.close();
    }
  } finally {
    await temporary.remove();
  }
});

test('all three sequential upgrade boundaries preserve preceding tables', async () => {
  const temporary = await temporaryDirectory('codeatlas-workspace-schema-sequential-');
  const databasePath = join(temporary.directory, 'workspace.sqlite');
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  try {
    for (let version = 1; version <= 3; version++) {
      const prefixManifestUrl = pathToFileURL(
        join(temporary.directory, `manifest-${version}.json`),
      );
      await writeFile(
        prefixManifestUrl,
        JSON.stringify({ ...manifest, migrations: manifest.migrations.slice(0, version) }),
      );
      for (const migration of manifest.migrations.slice(0, version)) {
        await writeFile(
          join(temporary.directory, migration.file),
          await readFile(new URL(migration.file, manifestUrl)),
        );
      }
      const result = await runMigrations({
        databasePath,
        databaseKind: 'WORKSPACE',
        manifestUrl: prefixManifestUrl,
      });
      assert.deepEqual(result.appliedVersions, [version]);
      assert.equal(result.initialVersion, version - 1);
      const database = new DatabaseSync(databasePath);
      try {
        assert.equal(userVersion(database), version);
        const tables = inventory(database, 'table');
        for (const required of expectedTables.slice(0, [1, 2, 4][version - 1])) {
          assert.ok(tables.includes(required), `${required} at version ${version}`);
        }
      } finally {
        database.close();
      }
    }
  } finally {
    await temporary.remove();
  }
});
