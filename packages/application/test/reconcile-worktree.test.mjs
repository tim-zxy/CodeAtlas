import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';
import { EntityIdSchema } from '../../ir/dist/index.js';
import { materialize } from '../../source/test/helpers.mjs';
import { RepositorySourceStateStore, runMigrations } from '../../storage/dist/index.js';
import { reconcileGitWorktree } from '../dist/index.js';

const fixtureRoot = fileURLToPath(
  new URL('../../../fixtures/source/restart-reconciliation/', import.meta.url),
);
const manifestUrl = new URL('../../storage/migrations/repository/manifest.json', import.meta.url);
const repositoryId = EntityIdSchema.parse('reconciliation-repository');

test('restart-reconciliation Fixture preserves identities and detects exact selected path changes', async () => {
  const [fixture] = await discoverFixtures(fixtureRoot);
  assert.equal(fixture.manifest.id, 'restart-reconciliation');
  const setup = JSON.parse(await readFile(fixture.inputs.setup, 'utf8'));
  const expected = JSON.parse(await readFile(fixture.expected.changes, 'utf8'));
  const base = await mkdtemp(join(tmpdir(), 'codeatlas-reconcile-'));
  const databasePath = join(base, 'repo.sqlite');
  try {
    const repo = await materialize(setup, base);
    await runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl });
    const request = { repositoryId, startingPath: repo, workspaceRoot: base, config: setup.config };
    const open = () => new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    let database = open();
    database
      .prepare('INSERT INTO repository (slot, id, root_path) VALUES (1, ?, ?)')
      .run(repositoryId, repo);
    database
      .prepare('INSERT INTO repository_state (repository_id, indexed_revision_id) VALUES (?, NULL)')
      .run(repositoryId);
    const first = await reconcileGitWorktree(request, new RepositorySourceStateStore(database));
    assert.deepEqual(first.changedPaths, expected.initialChangedPaths);
    assert.equal(first.revision.baseRevisionId, null);
    assert.equal(first.files.length, 2);
    assert.ok(first.files.every((file) => Number.isSafeInteger(file.sizeBytes)));
    const firstIds = new Map(
      new RepositorySourceStateStore(database)
        .load(repositoryId)
        .files.map((file) => [file.path, file.id]),
    );
    await assert.rejects(
      reconcileGitWorktree(
        { ...request, startingPath: join(base, 'missing') },
        new RepositorySourceStateStore(database),
      ),
    );
    assert.equal(
      new RepositorySourceStateStore(database).load(repositoryId).revision.contentFingerprint,
      first.revision.contentFingerprint,
    );
    await writeFile(join(repo, 'src/Keep.java'), 'class Bad {}\n');
    database.exec(
      "CREATE TRIGGER fail_source_insert BEFORE INSERT ON source_files BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
    );
    await assert.rejects(reconcileGitWorktree(request, new RepositorySourceStateStore(database)), {
      code: 'SOURCE_STATE_WRITE_FAILED',
    });
    assert.equal(
      new RepositorySourceStateStore(database).load(repositoryId).revision.contentFingerprint,
      first.revision.contentFingerprint,
    );
    database.exec('DROP TRIGGER fail_source_insert');
    await writeFile(
      join(repo, 'src/Keep.java'),
      setup.files.find((file) => file.path === 'src/Keep.java').text,
    );
    database.close();

    database = open();
    const restarted = await reconcileGitWorktree(request, new RepositorySourceStateStore(database));
    assert.deepEqual(restarted.changedPaths, []);
    assert.equal(restarted.revision.id, first.revision.id);
    database.close();

    for (const edit of setup.edits) await writeFile(join(repo, ...edit.path.split('/')), edit.text);
    for (const path of setup.deletes) await unlink(join(repo, ...path.split('/')));
    database = open();
    const changed = await reconcileGitWorktree(request, new RepositorySourceStateStore(database));
    assert.deepEqual(changed.changedPaths, expected.afterEditsChangedPaths);
    assert.equal(changed.revision.id, first.revision.id);
    const changedFiles = new RepositorySourceStateStore(database).load(repositoryId).files;
    assert.equal(
      changedFiles.find((file) => file.path === 'src/Keep.java').id,
      firstIds.get('src/Keep.java'),
    );
    assert.ok(!changedFiles.some((file) => file.path === 'src/Remove.java'));
    assert.equal(
      database.prepare('SELECT indexed_revision_id FROM repository_state').get()
        .indexed_revision_id,
      null,
    );
    assert.deepEqual(
      database
        .prepare('PRAGMA table_info(source_files)')
        .all()
        .map((row) => row.name)
        .includes('size_bytes'),
      false,
    );
    database.close();

    database = open();
    assert.deepEqual(
      (await reconcileGitWorktree(request, new RepositorySourceStateStore(database))).changedPaths,
      [],
    );
    await writeFile(join(repo, 'src/Remove.java'), 'class New {}\n');
    const readded = await reconcileGitWorktree(request, new RepositorySourceStateStore(database));
    assert.deepEqual(readded.changedPaths, expected.afterReaddChangedPaths);
    const readdedId = new RepositorySourceStateStore(database)
      .load(repositoryId)
      .files.find((file) => file.path === 'src/Remove.java').id;
    assert.notEqual(readdedId, firstIds.get('src/Remove.java'));
    database.close();
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
