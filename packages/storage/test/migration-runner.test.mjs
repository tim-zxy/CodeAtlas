import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const fixtureRoot = new URL('../../../fixtures/storage/migrations/', import.meta.url);

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
