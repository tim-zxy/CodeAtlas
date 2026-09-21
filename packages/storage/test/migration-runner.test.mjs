import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const fixtureRoot = new URL('../../../fixtures/storage/migrations/', import.meta.url);
const upgradeManifestUrl = new URL('migration-upgrade/manifest.json', fixtureRoot);

async function writePlanFixture(t, manifest, files) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-migration-plan-'));
  t.after(() => rm(directory, { recursive: true }));
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(directory, name), bytes);
  return pathToFileURL(join(directory, 'manifest.json'));
}

async function assertMigrationError(code, callback) {
  await assert.rejects(callback, (error) => {
    assert.equal(error?.name, 'StorageMigrationError');
    assert.equal(error?.code, code);
    return true;
  });
}

test('p0-migration-runner-v1 Fixture index is authoritative', async () => {
  const index = JSON.parse(await readFile(new URL('cases.json', fixtureRoot), 'utf8'));
  assert.deepEqual(index, {
    schemaVersion: 1,
    id: 'p0-migration-runner-v1',
    task: 'P0-W1-005',
    governingSpec: 'docs/handoff/specs/SQLITE_SCHEMA.md',
    acceptance: 'Sequential, rollback, rerun, lock, checksum gates',
    cases: ['migration-empty', 'migration-upgrade', 'migration-failure', 'database-too-new'],
  });
});

test('storage exports the migration contract', async () => {
  const storage = await import('../dist/index.js');
  assert.equal(typeof storage.StorageMigrationError, 'function');
  assert.equal(typeof storage.runMigrations, 'function');
});

test('loader verifies and freezes the upgrade plan', async () => {
  const { loadMigrationPlan } = await import('../dist/index.js');
  const plan = await loadMigrationPlan(upgradeManifestUrl, 'REPOSITORY');
  assert.equal(plan.latestVersion, 2);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.migrations), true);
  assert.equal(Object.isFrozen(plan.migrations[0]), true);
  assert.deepEqual(
    plan.migrations.map(({ version, name }) => ({ version, name })),
    [
      { version: 1, name: 'create_probe' },
      { version: 2, name: 'add_revision' },
    ],
  );
  assert.equal(
    plan.migrations[0].sql,
    'CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL);\n',
  );
});

test('loader normalizes CRLF and CR to the same checksum input', async (t) => {
  const { loadMigrationPlan } = await import('../dist/index.js');
  const manifest = JSON.parse(await readFile(upgradeManifestUrl, 'utf8'));
  const manifestUrl = await writePlanFixture(t, manifest, {
    '001-create-probe.sql':
      'CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL);\r\n',
    '002-add-revision.sql':
      "ALTER TABLE migration_probe ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;\rINSERT INTO migration_probe (id, value) VALUES (1, 'ready');\r",
  });
  const plan = await loadMigrationPlan(manifestUrl, 'REPOSITORY');
  assert.equal(plan.migrations[0].sql.includes('\r'), false);
  assert.equal(plan.migrations[1].sql.includes('\r'), false);
});

test('loader rejects malformed manifests and unsafe paths', async (t) => {
  const { loadMigrationPlan } = await import('../dist/index.js');
  const valid = JSON.parse(await readFile(upgradeManifestUrl, 'utf8'));
  const bad = [
    { ...valid, extra: true },
    { ...valid, schemaVersion: 2 },
    { ...valid, migrations: [valid.migrations[0], { ...valid.migrations[1], version: 3 }] },
    {
      ...valid,
      migrations: [valid.migrations[0], { ...valid.migrations[1], name: 'create_probe' }],
    },
    {
      ...valid,
      migrations: [valid.migrations[0], { ...valid.migrations[1], file: '001-create-probe.sql' }],
    },
    ...['C:/001.sql', 'nested\\001.sql', './001.sql', '../001.sql', 'nested//001.sql'].map(
      (file) => ({ ...valid, migrations: [{ ...valid.migrations[0], file }] }),
    ),
    { ...valid, migrations: [{ ...valid.migrations[0], checksum: 'sha256:ABC' }] },
  ];
  for (const manifest of bad) {
    const url = await writePlanFixture(t, manifest, {});
    await assertMigrationError('MIGRATION_MANIFEST_INVALID', () =>
      loadMigrationPlan(url, 'REPOSITORY'),
    );
  }
});

test('loader rejects invalid UTF-8, BOM, changed checksum, and wrong kind', async (t) => {
  const { loadMigrationPlan } = await import('../dist/index.js');
  const valid = JSON.parse(await readFile(upgradeManifestUrl, 'utf8'));
  for (const bytes of [
    Buffer.from([0xc3, 0x28]),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('SELECT 1;\n')]),
  ]) {
    const url = await writePlanFixture(
      t,
      { ...valid, migrations: [valid.migrations[0]] },
      { '001-create-probe.sql': bytes },
    );
    await assertMigrationError('MIGRATION_FILE_INVALID', () =>
      loadMigrationPlan(url, 'REPOSITORY'),
    );
  }
  const changed = {
    ...valid,
    migrations: [{ ...valid.migrations[0], checksum: `sha256:${'0'.repeat(64)}` }],
  };
  const checksumUrl = await writePlanFixture(t, changed, {
    '001-create-probe.sql': await readFile(
      new URL('migration-upgrade/001-create-probe.sql', fixtureRoot),
    ),
  });
  await assertMigrationError('MIGRATION_CHECKSUM_MISMATCH', () =>
    loadMigrationPlan(checksumUrl, 'REPOSITORY'),
  );
  await assertMigrationError('MIGRATION_DATABASE_KIND_MISMATCH', () =>
    loadMigrationPlan(upgradeManifestUrl, 'WORKSPACE'),
  );
});
