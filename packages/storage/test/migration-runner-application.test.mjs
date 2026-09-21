import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runMigrations } from '../dist/index.js';

const upgrade = new URL(
  '../../../fixtures/storage/migrations/migration-upgrade/manifest.json',
  import.meta.url,
);

async function temporaryDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-migration-db-'));
  return {
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

for (const [kind, manifestUrl] of [
  [
    'REPOSITORY',
    new URL(
      '../../../fixtures/storage/migrations/migration-empty/repository-manifest.json',
      import.meta.url,
    ),
  ],
  [
    'WORKSPACE',
    new URL(
      '../../../fixtures/storage/migrations/migration-empty/workspace-manifest.json',
      import.meta.url,
    ),
  ],
]) {
  test(`empty ${kind} manifest creates a reusable version-zero database`, async () => {
    const temporary = await temporaryDatabase();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await runMigrations({
          databasePath: temporary.databasePath,
          databaseKind: kind,
          manifestUrl,
        });
        assert.deepEqual(result, {
          databaseKind: kind,
          initialVersion: 0,
          finalVersion: 0,
          appliedVersions: [],
        });
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.appliedVersions), true);
      }
      const database = new DatabaseSync(temporary.databasePath);
      try {
        assert.equal(database.prepare('PRAGMA user_version').get().user_version, 0);
      } finally {
        database.close();
      }
    } finally {
      await temporary.remove();
    }
  });
}

test('upgrade applies sequentially, persists data, and does not replay', async () => {
  const temporary = await temporaryDatabase();
  try {
    const request = {
      databasePath: temporary.databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl: upgrade,
    };
    assert.deepEqual(await runMigrations(request), {
      databaseKind: 'REPOSITORY',
      initialVersion: 0,
      finalVersion: 2,
      appliedVersions: [1, 2],
    });
    assert.deepEqual(await runMigrations(request), {
      databaseKind: 'REPOSITORY',
      initialVersion: 2,
      finalVersion: 2,
      appliedVersions: [],
    });
    const database = new DatabaseSync(temporary.databasePath);
    try {
      assert.deepEqual(
        { ...database.prepare('SELECT id, value, revision FROM migration_probe').get() },
        { id: 1, value: 'ready', revision: 1 },
      );
    } finally {
      database.close();
    }
  } finally {
    await temporary.remove();
  }
});

test('partial upgrade applies only pending version', async () => {
  const temporary = await temporaryDatabase();
  const planDirectory = await mkdtemp(join(tmpdir(), 'codeatlas-migration-partial-'));
  try {
    const manifest = JSON.parse(await readFile(upgrade, 'utf8'));
    manifest.migrations = manifest.migrations.slice(0, 1);
    await writeFile(join(planDirectory, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(
      join(planDirectory, '001-create-probe.sql'),
      await readFile(new URL('001-create-probe.sql', upgrade)),
    );
    const request = {
      databasePath: temporary.databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl: pathToFileURL(join(planDirectory, 'manifest.json')),
    };
    assert.deepEqual((await runMigrations(request)).appliedVersions, [1]);
    assert.deepEqual(
      (await runMigrations({ ...request, manifestUrl: upgrade })).appliedVersions,
      [2],
    );
  } finally {
    await temporary.remove();
    await rm(planDirectory, { recursive: true });
  }
});

test('invalid request is rejected before database creation', async () => {
  const temporary = await temporaryDatabase();
  try {
    const request = {
      databasePath: temporary.databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl: upgrade,
    };
    for (const changed of [
      { databasePath: '' },
      { databasePath: ' database.sqlite ' },
      { databaseKind: 'REPO' },
      { manifestUrl: upgrade.href },
      { lockTimeoutMs: -1 },
      { lockTimeoutMs: 0.5 },
      { lockTimeoutMs: NaN },
      { lockTimeoutMs: Infinity },
      { lockTimeoutMs: Number.MAX_SAFE_INTEGER + 1 },
    ])
      await expectError('MIGRATION_MANIFEST_INVALID', () =>
        runMigrations({ ...request, ...changed }),
      );
    for (const lockTimeoutMs of [0, 250]) {
      const result = await runMigrations({ ...request, lockTimeoutMs });
      assert.equal(result.finalVersion, 2);
    }
  } finally {
    await temporary.remove();
  }
});
