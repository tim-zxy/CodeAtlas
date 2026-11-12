import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
const api = await import('../dist/indexing/workspace-initialization.js').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
async function fixture(t) {
  assert.equal(typeof api.initializeWorkspaceMetadata, 'function');
  const directory = await fs.mkdtemp(
    path.join(realpathSync.native(os.tmpdir()), 'workspace-init-owned-'),
  );
  t.after(async () => {
    assert(realpathSync.native(directory).startsWith(realpathSync.native(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const workspaceRoot = path.join(directory, 'workspace'),
    repositoryRoot = path.join(directory, 'repo');
  await fs.mkdir(workspaceRoot);
  await fs.mkdir(repositoryRoot);
  const input = {
    databasePath: path.join(directory, 'workspace.sqlite'),
    workspaceId: 'workspace:owned',
    workspaceRoot: await fs.realpath(workspaceRoot),
    repositories: [
      { repositoryId: 'repository:owned', repositoryRoot: await fs.realpath(repositoryRoot) },
    ],
  };
  const control = { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} };
  return { directory, input, control };
}
function inspect(file, read) {
  const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    return read(db);
  } finally {
    db.close();
  }
}
test('new Workspace metadata and registered repositories persist after real close and reopen', async (t) => {
  const f = await fixture(t),
    result = await api.initializeWorkspaceMetadata(f.input, f.control);
  assert.equal(result.metadataEffect, 'COMMITTED');
  assert.equal(result.cleanupState, 'SETTLED');
  assert.equal(result.databaseVersion, 8);
  inspect(f.input.databasePath, (db) => {
    assert.deepEqual(
      { ...db.prepare('SELECT * FROM workspace').get() },
      { slot: 1, id: 'workspace:owned', root_path: f.input.workspaceRoot },
    );
    assert.deepEqual(
      { ...db.prepare('SELECT * FROM repositories').get() },
      {
        repository_id: 'repository:owned',
        workspace_id: 'workspace:owned',
        root_path: f.input.repositories[0].repositoryRoot,
      },
    );
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
    assert.equal(db.prepare('SELECT count(*) n FROM revision_sets').get().n, 0);
  });
});
test('existing target is refused without adopting or changing its bytes', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.input.databasePath, 'OWNED_OLD_CONTENT');
  await assert.rejects(
    api.initializeWorkspaceMetadata(f.input, f.control),
    (e) => e.code === 'DATABASE_ALREADY_EXISTS' && e.metadataEffect === 'NOT_COMMITTED',
  );
  assert.equal(await fs.readFile(f.input.databasePath, 'utf8'), 'OWNED_OLD_CONTENT');
});
test('duplicate repository IDs and canonical roots refuse before database creation', async (t) => {
  for (const mode of ['id', 'root']) {
    const f = await fixture(t);
    const second = path.join(f.directory, 'second');
    await fs.mkdir(second);
    f.input.repositories.push({
      repositoryId: mode === 'id' ? 'repository:owned' : 'repository:second',
      repositoryRoot:
        mode === 'root' ? f.input.repositories[0].repositoryRoot : await fs.realpath(second),
    });
    await assert.rejects(api.initializeWorkspaceMetadata(f.input, f.control));
    await assert.rejects(fs.stat(f.input.databasePath), { code: 'ENOENT' });
  }
});
test('input is owned before asynchronous control callbacks and accessors never execute', async (t) => {
  const f = await fixture(t);
  let first = true;
  f.control.checkpoint = async () => {
    if (first) {
      first = false;
      f.input.workspaceId = 'workspace:mutated';
      f.input.repositories[0].repositoryId = 'repository:mutated';
    }
  };
  await api.initializeWorkspaceMetadata(f.input, f.control);
  inspect(f.input.databasePath, (db) =>
    assert.equal(db.prepare('SELECT id FROM workspace').get().id, 'workspace:owned'),
  );
  const g = await fixture(t);
  let called = false;
  Object.defineProperty(g.input, 'workspaceId', {
    enumerable: true,
    get() {
      called = true;
      return 'wrong';
    },
  });
  await assert.rejects(api.initializeWorkspaceMetadata(g.input, g.control));
  assert.equal(called, false);
  await assert.rejects(fs.stat(g.input.databasePath), { code: 'ENOENT' });
});
test('metadata COMMIT failure rolls back W001/W002 rows but preserves completed migrations', async (t) => {
  const f = await fixture(t),
    original = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    if (sql === 'COMMIT' && this.prepare('SELECT count(*) n FROM workspace').get().n > 0)
      throw Error('OWNED_COMMIT_FAILURE');
    return original.call(this, sql);
  };
  t.after(() => (DatabaseSync.prototype.exec = original));
  await assert.rejects(
    api.initializeWorkspaceMetadata(f.input, f.control),
    (e) => e.metadataEffect === 'NOT_COMMITTED' && e.cleanupState === 'SETTLED',
  );
  inspect(f.input.databasePath, (db) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
    assert.equal(db.prepare('SELECT count(*) n FROM workspace').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM repositories').get().n, 0);
  });
});
test('lost metadata COMMIT acknowledgement stays UNKNOWN without automatic rewriting', async (t) => {
  const f = await fixture(t),
    original = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    const metadata =
      sql === 'COMMIT' && this.prepare('SELECT count(*) n FROM workspace').get().n > 0;
    const result = original.call(this, sql);
    if (metadata) throw Error('OWNED_LOST_ACK');
    return result;
  };
  t.after(() => (DatabaseSync.prototype.exec = original));
  await assert.rejects(
    api.initializeWorkspaceMetadata(f.input, f.control),
    (e) => e.metadataEffect === 'UNKNOWN',
  );
  inspect(f.input.databasePath, (db) =>
    assert.equal(db.prepare('SELECT count(*) n FROM repositories').get().n, 1),
  );
  await assert.rejects(
    api.initializeWorkspaceMetadata(f.input, f.control),
    (e) => e.code === 'DATABASE_ALREADY_EXISTS',
  );
});
test('migration failure retains the committed prefix and closes the new database', async (t) => {
  const f = await fixture(t),
    original = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    if (sql.includes('CREATE TABLE revision_sets')) throw Error('OWNED_MIGRATION_FAILURE');
    return original.call(this, sql);
  };
  t.after(() => (DatabaseSync.prototype.exec = original));
  await assert.rejects(
    api.initializeWorkspaceMetadata(f.input, f.control),
    (e) => e.metadataEffect === 'NOT_COMMITTED' && e.cleanupState === 'SETTLED',
  );
  inspect(f.input.databasePath, (db) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal(db.prepare('SELECT count(*) n FROM workspace').get().n, 0);
  });
});
test('postcommit close failure preserves COMMITTED with cleanup UNKNOWN', async (t) => {
  const f = await fixture(t),
    original = DatabaseSync.prototype.close;
  let retained;
  DatabaseSync.prototype.close = function () {
    retained = this;
    throw Error('OWNED_CLOSE_FAILURE');
  };
  try {
    await assert.rejects(
      api.initializeWorkspaceMetadata(f.input, f.control),
      (e) => e.metadataEffect === 'COMMITTED' && e.cleanupState === 'UNKNOWN',
    );
  } finally {
    DatabaseSync.prototype.close = original;
    if (retained?.isOpen) original.call(retained);
  }
  inspect(f.input.databasePath, (db) =>
    assert.equal(db.prepare('SELECT count(*) n FROM repositories').get().n, 1),
  );
});
test('cancel and budget refusal before acquisition create no target', async (t) => {
  for (const kind of ['CANCELLED', 'RESOURCE_LIMIT_EXCEEDED']) {
    const f = await fixture(t);
    if (kind === 'CANCELLED')
      f.control.checkpoint = async () => {
        throw Object.assign(Error('owned cancel'), { code: kind });
      };
    else
      f.control.reserveText = () => {
        throw Object.assign(Error('owned budget'), { code: kind });
      };
    await assert.rejects(
      api.initializeWorkspaceMetadata(f.input, f.control),
      (e) => e.code === kind && e.metadataEffect === 'NOT_COMMITTED',
    );
    await assert.rejects(fs.stat(f.input.databasePath), { code: 'ENOENT' });
  }
});
test('asynchronous budget settlement refuses UNKNOWN before acquisition', async (t) => {
  const f = await fixture(t);
  f.control.reserveText = async () => {};
  await assert.rejects(
    api.initializeWorkspaceMetadata(f.input, f.control),
    (e) => e.cleanupState === 'UNKNOWN' && e.metadataEffect === 'NOT_COMMITTED',
  );
  await assert.rejects(fs.stat(f.input.databasePath), { code: 'ENOENT' });
});
test('aliased database parent is refused without creating a target through the link', async (t) => {
  const f = await fixture(t),
    parent = path.join(f.directory, 'actual'),
    alias = path.join(f.directory, 'alias');
  await fs.mkdir(parent);
  await fs.symlink(parent, alias, 'junction');
  f.input.databasePath = path.join(alias, 'workspace.sqlite');
  await assert.rejects(api.initializeWorkspaceMetadata(f.input, f.control));
  await assert.rejects(fs.stat(path.join(parent, 'workspace.sqlite')), { code: 'ENOENT' });
});
