import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { RepositorySourceStateStore, runMigrations } from '../dist/index.js';

const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
const repositoryId = 'repository-1';

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-source-state-'));
  const databasePath = join(directory, 'repo.sqlite');
  try {
    await runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl });
    const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    database
      .prepare('INSERT INTO repository (slot, id, root_path) VALUES (1, ?, ?)')
      .run(repositoryId, '/repo');
    database
      .prepare('INSERT INTO repository_state (repository_id, indexed_revision_id) VALUES (?, NULL)')
      .run(repositoryId);
    try {
      await run(database, databasePath);
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function state(fingerprint, paths = ['src/A.java'], baseRevisionId = null) {
  return {
    revision: {
      id: 'worktree-1',
      repositoryId,
      kind: 'WORKTREE',
      contentFingerprint: fingerprint,
      baseRevisionId,
    },
    files: paths.map((path, index) => ({
      id: `file-${path}`,
      repositoryId,
      revisionId: 'worktree-1',
      path,
      contentFingerprint: `sha256:${index}-${fingerprint}`,
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    })),
  };
}

test('R002 worktree state survives reopen, changes in place, and leaves indexing pointer untouched', async () => {
  await fixture(async (database, databasePath) => {
    const store = new RepositorySourceStateStore(database);
    assert.equal(store.load(repositoryId), null);
    const first = state('sha256:first');
    store.replace(null, first);
    assert.deepEqual(store.load(repositoryId), first);
    const reopened = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    try {
      const restart = new RepositorySourceStateStore(reopened);
      assert.deepEqual(restart.load(repositoryId), first);
      const second = state('sha256:second', ['src/A.java', 'src/B.java']);
      restart.replace(first, second);
      assert.deepEqual(restart.load(repositoryId), second);
      const third = state('sha256:third', ['src/B.java']);
      restart.replace(second, third);
      assert.deepEqual(restart.load(repositoryId), third);
      assert.equal(
        reopened.prepare('SELECT indexed_revision_id FROM repository_state').get()
          .indexed_revision_id,
        null,
      );
      assert.throws(() => restart.replace(first, second), { code: 'SOURCE_STATE_CONFLICT' });
      assert.deepEqual(restart.load(repositoryId), third);
    } finally {
      reopened.close();
    }
  });
});

test('same-repository COMMIT lookup and registration are explicit', async () => {
  await fixture(async (database) => {
    const store = new RepositorySourceStateStore(database);
    assert.throws(() => store.load('missing'), { code: 'REPOSITORY_NOT_REGISTERED' });
    assert.equal(store.findCommitRevisionId(repositoryId, 'head-1'), null);
    database
      .prepare(
        "INSERT INTO revisions (id, repository_id, kind, content_fingerprint, commit_identity) VALUES (?, ?, 'COMMIT', ?, ?)",
      )
      .run('commit-1', repositoryId, 'sha256:commit', 'head-1');
    assert.equal(store.findCommitRevisionId(repositoryId, 'head-1'), 'commit-1');
    assert.equal(store.findCommitRevisionId(repositoryId, 'head-2'), null);
    database
      .prepare(
        "INSERT INTO revisions (id, repository_id, kind, content_fingerprint, commit_identity) VALUES (?, ?, 'COMMIT', ?, ?)",
      )
      .run('commit-2', repositoryId, 'sha256:other', 'head-1');
    assert.throws(() => store.findCommitRevisionId(repositoryId, 'head-1'), {
      code: 'SOURCE_STATE_INVALID',
    });
  });
});

test('transaction failure rolls back revision and files', async () => {
  await fixture(async (database) => {
    const store = new RepositorySourceStateStore(database);
    const first = state('sha256:first');
    store.replace(null, first);
    database.exec(
      "CREATE TRIGGER fail_source_insert BEFORE INSERT ON source_files BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
    );
    assert.throws(() => store.replace(first, state('sha256:second', ['src/B.java'])), {
      code: 'SOURCE_STATE_WRITE_FAILED',
    });
    assert.deepEqual(store.load(repositoryId), first);
    database.exec('DROP TRIGGER fail_source_insert');
  });
});

test('ambiguous and malformed persisted worktree rows are rejected', async () => {
  await fixture(async (database) => {
    const store = new RepositorySourceStateStore(database);
    database
      .prepare(
        "INSERT INTO revisions (id, repository_id, kind, content_fingerprint) VALUES (?, ?, 'WORKTREE', ?)",
      )
      .run('one', repositoryId, 'sha256:one');
    database
      .prepare(
        "INSERT INTO revisions (id, repository_id, kind, content_fingerprint) VALUES (?, ?, 'WORKTREE', ?)",
      )
      .run('two', repositoryId, 'sha256:two');
    assert.throws(() => store.load(repositoryId), { code: 'WORKTREE_AMBIGUOUS' });
    database.prepare("DELETE FROM revisions WHERE id = 'two'").run();
    database
      .prepare(
        'INSERT INTO source_files (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, language_hint, sensitivity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'one',
        'bad-file',
        repositoryId,
        '../escape',
        'sha256:x',
        'SOURCE',
        'AUTHORED',
        'TEXT',
        'java',
        'PUBLIC',
      );
    assert.throws(() => store.load(repositoryId), { code: 'SOURCE_STATE_INVALID' });
  });
});
