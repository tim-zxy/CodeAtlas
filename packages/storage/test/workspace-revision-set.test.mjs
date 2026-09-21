import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { runMigrations } from '../dist/index.js';

const manifestUrl = new URL('../migrations/workspace/manifest.json', import.meta.url);

test('p0-workspace-schema-v1 constraints-and frozen RevisionSet immutability', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-workspace-freeze-'));
  const databasePath = join(directory, 'workspace.sqlite');
  try {
    await runMigrations({ databasePath, databaseKind: 'WORKSPACE', manifestUrl });
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        INSERT INTO workspace (slot, id, root_path) VALUES (1, 'workspace-a', '/workspace-a');
        INSERT INTO repositories (repository_id, workspace_id, root_path)
          VALUES ('repo-a', 'workspace-a', '/workspace-a/repo-a');
        INSERT INTO repositories (repository_id, workspace_id, root_path)
          VALUES ('repo-b', 'workspace-a', '/workspace-a/repo-b');
        INSERT INTO revision_sets (id, workspace_id, created_at, frozen)
          VALUES ('set-a', 'workspace-a', 1000, 0);
        INSERT INTO revision_set_items
          (revision_set_id, repository_id, revision_id, revision_fingerprint)
          VALUES ('set-a', 'repo-a', 'rev-a', 'fp-a');
        UPDATE revision_set_items SET revision_id = 'rev-a2', revision_fingerprint = 'fp-a2'
          WHERE revision_set_id = 'set-a' AND repository_id = 'repo-a';
        INSERT INTO revision_set_items
          (revision_set_id, repository_id, revision_id, revision_fingerprint)
          VALUES ('set-a', 'repo-b', 'rev-b', 'fp-b');
        DELETE FROM revision_set_items
          WHERE revision_set_id = 'set-a' AND repository_id = 'repo-b';
        UPDATE revision_sets SET frozen = 1 WHERE id = 'set-a';
      `);

      assert.deepEqual(
        { ...database.prepare('SELECT id, frozen FROM revision_sets').get() },
        { id: 'set-a', frozen: 1 },
      );
      assert.deepEqual(
        {
          ...database
            .prepare('SELECT revision_id, revision_fingerprint FROM revision_set_items')
            .get(),
        },
        { revision_id: 'rev-a2', revision_fingerprint: 'fp-a2' },
      );
      assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);

      for (const sql of [
        "UPDATE revision_sets SET frozen = 0 WHERE id = 'set-a'",
        "UPDATE revision_sets SET created_at = 2000 WHERE id = 'set-a'",
        "DELETE FROM revision_sets WHERE id = 'set-a'",
        "INSERT INTO revision_set_items (revision_set_id, repository_id, revision_id, revision_fingerprint) VALUES ('set-a', 'repo-b', 'rev-b', 'fp-b')",
        "UPDATE revision_set_items SET revision_id = 'rev-a3' WHERE revision_set_id = 'set-a'",
        "DELETE FROM revision_set_items WHERE revision_set_id = 'set-a'",
        "DELETE FROM repositories WHERE repository_id = 'repo-a'",
        "DELETE FROM workspace WHERE id = 'workspace-a'",
      ]) {
        assert.throws(() => database.exec(sql), /frozen|FOREIGN KEY constraint failed/);
      }

      assert.throws(() =>
        database.exec(
          "INSERT INTO workspace (slot, id, root_path) VALUES (2, 'workspace-b', '/workspace-b')",
        ),
      );
      assert.throws(() =>
        database.exec(
          "INSERT INTO repositories (repository_id, workspace_id, root_path) VALUES ('repo-c', 'workspace-a', '/workspace-a/repo-a')",
        ),
      );
      assert.throws(() =>
        database.exec(
          "INSERT INTO revision_sets (id, workspace_id, created_at, frozen) VALUES ('bad-set', 'workspace-a', 1000, 2)",
        ),
      );
      assert.throws(() =>
        database.exec(
          "INSERT INTO revision_set_items (revision_set_id, repository_id, revision_id, revision_fingerprint) VALUES ('missing-set', 'repo-a', 'rev-a', 'fp-a')",
        ),
      );
      assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
