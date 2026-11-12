import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { realpathSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const api = await import('../dist/workspace-initialization.js').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
async function fixture() {
  const base = await fs.mkdtemp(
    path.join(realpathSync.native(os.tmpdir()), 'codeatlas-init-owned-'),
  );
  const root = path.join(base, 'workspace'),
    repo = path.join(base, 'external-repo');
  await fs.mkdir(root);
  await fs.mkdir(repo);
  const defaults = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/phase1/security-config/inputs/defaults.json', import.meta.url),
      'utf8',
    ),
  );
  defaults.runtime.workspaceRoot = root;
  Object.assign(defaults.indexing.resourceBudget, {
    maxInputBytes: 1000000,
    maxOutputBytes: 1000000,
    maxItems: 10000,
    maxDepth: 100,
    maxDurationMs: 10000,
    maxMemoryBytes: 10000000,
  });
  return {
    base,
    root,
    repo,
    request: {
      workspaceRoot: root,
      repositories: [repo],
      configuration: { defaults, maxInputBytes: 1000000 },
    },
  };
}
function inspect(file, action) {
  const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    return action(db);
  } finally {
    db.close();
  }
}
async function snapshot(directory) {
  const rows = [];
  for (const name of (await fs.readdir(directory)).sort()) {
    const p = path.join(directory, name),
      s = await fs.lstat(p);
    if (s.isDirectory()) rows.push([name, await snapshot(p)]);
    else rows.push([name, (await fs.readFile(p)).toString('base64'), s.mtimeMs]);
  }
  return rows;
}
test('explicit init creates both real database bindings and matching reentry is readonly', async () => {
  const f = await fixture();
  assert.equal(typeof api.initializeWorkspace, 'function');
  const r = await api.initializeWorkspace(f.request);
  assert.equal(r.outcome, 'CREATED');
  assert.equal(r.cleanupState, 'SETTLED');
  inspect(r.workspaceDatabasePath, (db) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
    assert.equal(db.prepare('SELECT id FROM workspace').get().id, r.workspaceId);
    assert.equal(db.prepare('SELECT count(*) n FROM repositories').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) n FROM revision_sets').get().n, 0);
  });
  inspect(r.repositories[0].databasePath, (db) => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 13);
    assert.equal(db.prepare('SELECT root_path FROM repository').get().root_path, f.repo);
    assert.equal(db.prepare('SELECT count(*) n FROM revisions').get().n, 0);
  });
  const before = await snapshot(path.join(f.root, '.ekp'));
  const again = await api.initializeWorkspace(f.request);
  assert.equal(again.outcome, 'ALREADY_INITIALIZED');
  assert.equal(again.workspaceId, r.workspaceId);
  assert.deepEqual(await snapshot(path.join(f.root, '.ekp')), before);
});
test('unknown or interrupted .ekp is never overwritten adopted or resumed', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.root, '.ekp'));
  await fs.writeFile(path.join(f.root, '.ekp', 'sentinel'), 'OWNED_OLD');
  const before = await snapshot(path.join(f.root, '.ekp'));
  await assert.rejects(api.initializeWorkspace(f.request));
  assert.deepEqual(await snapshot(path.join(f.root, '.ekp')), before);
});
test('invalid configuration duplicate roots and pre-cancellation create no .ekp', async () => {
  for (const mode of ['config', 'duplicate', 'cancel']) {
    const f = await fixture(),
      controller = new AbortController();
    if (mode === 'config') delete f.request.configuration.defaults.indexing.resourceBudget.maxItems;
    if (mode === 'duplicate') f.request.repositories.push(f.repo);
    if (mode === 'cancel') controller.abort();
    await assert.rejects(api.initializeWorkspace(f.request, controller.signal));
    await assert.rejects(fs.stat(path.join(f.root, '.ekp')), { code: 'ENOENT' });
  }
});
test('complete workspace conflicts and missing database refuse without modifying old state', async () => {
  for (const mode of ['config', 'missing']) {
    const f = await fixture(),
      r = await api.initializeWorkspace(f.request);
    if (mode === 'config') f.request.configuration.defaults.agents.defaultDepth = 'L1';
    else
      await fs.rename(r.repositories[0].databasePath, r.repositories[0].databasePath + '.retained');
    const before = await snapshot(path.join(f.root, '.ekp'));
    await assert.rejects(api.initializeWorkspace(f.request));
    assert.deepEqual(await snapshot(path.join(f.root, '.ekp')), before);
  }
});
test('repository creation failure preserves partial files without a completion marker', async () => {
  const f = await fixture(),
    original = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    if (sql.includes('CREATE TABLE canonical_nodes')) throw Error('OWNED_FAILURE');
    return original.call(this, sql);
  };
  try {
    await assert.rejects(
      api.initializeWorkspace(f.request),
      (e) => e.directoryCreated === true && e.initializationEffect === 'NOT_COMMITTED',
    );
  } finally {
    DatabaseSync.prototype.exec = original;
  }
  await fs.stat(path.join(f.root, '.ekp', 'config.yaml'));
  await assert.rejects(fs.stat(path.join(f.root, '.ekp', 'init.json')), { code: 'ENOENT' });
  const before = await snapshot(path.join(f.root, '.ekp'));
  await assert.rejects(api.initializeWorkspace(f.request));
  assert.deepEqual(await snapshot(path.join(f.root, '.ekp')), before);
});
test('concurrent initialization has one creator and stable published identity', async () => {
  const f = await fixture(),
    results = await Promise.allSettled([
      api.initializeWorkspace(f.request),
      api.initializeWorkspace(f.request),
    ]);
  assert.equal(
    results.filter((r) => r.status === 'fulfilled' && r.value.outcome === 'CREATED').length,
    1,
  );
  const r = await api.initializeWorkspace(f.request);
  assert.equal(r.outcome, 'ALREADY_INITIALIZED');
});

test('readonly reentry of a closed WAL-mode database creates no sidecars or writes', async () => {
  const f = await fixture(),
    r = await api.initializeWorkspace(f.request);
  const db = new DatabaseSync(r.repositories[0].databasePath);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE owned_indexed(n INTEGER); INSERT INTO owned_indexed VALUES(1)',
  );
  db.close();
  const before = await snapshot(path.join(f.root, '.ekp'));
  const result = await api.initializeWorkspace(f.request);
  assert.equal(result.outcome, 'ALREADY_INITIALIZED');
  assert.deepEqual(await snapshot(path.join(f.root, '.ekp')), before);
});
test('recognized config replacement during later verification refuses before readonly success', async () => {
  const f = await fixture(),
    r = await api.initializeWorkspace(f.request),
    original = fs.lstat;
  const { syncBuiltinESMExports } = await import('node:module');
  let replaced = false;
  fs.lstat = async function (file, ...args) {
    if (file === r.workspaceDatabasePath && !replaced) {
      replaced = true;
      const p = path.join(f.root, '.ekp', 'config.yaml'),
        text = await fs.readFile(p);
      await fs.rename(p, path.join(f.base, 'retained-config.yaml'));
      await fs.writeFile(p, text);
    }
    return original.call(this, file, ...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(api.initializeWorkspace(f.request));
    assert.equal(replaced, true);
  } finally {
    fs.lstat = original;
    syncBuiltinESMExports();
  }
});
test('Storage readonly verification preserves a mid-operation deadline category', async () => {
  const f = await fixture(),
    r = await api.initializeWorkspace(f.request);
  const storage = await import('../../storage/dist/indexing/workspace-initialization.js');
  let calls = 0;
  await assert.rejects(
    storage.verifyWorkspaceInitialization(
      {
        databasePath: r.workspaceDatabasePath,
        workspaceId: r.workspaceId,
        workspaceRoot: r.workspaceRoot,
        repositories: r.repositories.map(({ repositoryId, repositoryRoot }) => ({
          repositoryId,
          repositoryRoot,
        })),
      },
      {
        async checkpoint() {
          if (++calls === 2) throw Object.assign(Error('owned deadline'), { code: 'DEADLINE' });
        },
        reserveText() {},
        chargeMetadataRow() {},
      },
    ),
    (e) => e.code === 'DEADLINE',
  );
});

test('active WAL state refuses before readonly open without modifying its bytes', async () => {
  const f = await fixture(),
    r = await api.initializeWorkspace(f.request),
    db = new DatabaseSync(r.repositories[0].databasePath);
  try {
    db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE owned_pending(n INTEGER); INSERT INTO owned_pending VALUES(1)',
    );
    const before = await snapshot(path.join(f.root, '.ekp'));
    await assert.rejects(api.initializeWorkspace(f.request));
    assert.deepEqual(await snapshot(path.join(f.root, '.ekp')), before);
  } finally {
    db.close();
  }
});
test('mid-initialization cancellation preserves stop category and partial files', async () => {
  const f = await fixture(),
    controller = new AbortController(),
    original = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    const r = original.call(this, sql);
    if (sql.includes('CREATE TABLE canonical_nodes')) controller.abort();
    return r;
  };
  try {
    await assert.rejects(
      api.initializeWorkspace(f.request, controller.signal),
      (e) =>
        e.code === 'CANCELLED' &&
        e.directoryCreated === true &&
        e.initializationEffect === 'NOT_COMMITTED',
    );
  } finally {
    DatabaseSync.prototype.exec = original;
  }
  await fs.stat(path.join(f.root, '.ekp'));
  await assert.rejects(fs.stat(path.join(f.root, '.ekp', 'init.json')), { code: 'ENOENT' });
});
test('empty repository selection remains metadata-only and is idempotent', async () => {
  const f = await fixture();
  f.request.repositories = [];
  const r = await api.initializeWorkspace(f.request);
  assert.deepEqual(r.repositories, []);
  assert.equal((await api.initializeWorkspace(f.request)).outcome, 'ALREADY_INITIALIZED');
});

test('replacement during completion marker close is not adopted as a new file pin', async () => {
  const f = await fixture(),
    original = fs.open;
  const { syncBuiltinESMExports } = await import('node:module');
  let replaced = false;
  fs.open = async function (file, ...args) {
    const handle = await original.call(this, file, ...args);
    if (file === path.join(f.root, '.ekp', 'init.json')) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close();
        const bytes = await fs.readFile(file);
        await fs.rename(file, path.join(f.base, 'retained-marker.json'));
        await fs.writeFile(file, bytes);
        replaced = true;
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      api.initializeWorkspace(f.request),
      (e) => e.initializationEffect === 'COMMITTED',
    );
    assert.equal(replaced, true);
  } finally {
    fs.open = original;
    syncBuiltinESMExports();
  }
});

test('unknown configuration diagnostics survive init without retaining unknown values', async () => {
  const f = await fixture();
  f.request.configuration.defaults.llm.futureSetting = 'NEVER_ECHO';
  const r = await api.initializeWorkspace(f.request);
  assert.deepEqual(r.warnings, [{ code: 'UNKNOWN_CONFIG_KEY', path: ['llm'] }]);
  assert(!JSON.stringify(r).includes('NEVER_ECHO'));
  assert(
    !(await fs.readFile(path.join(f.root, '.ekp', 'config.yaml'), 'utf8')).includes('NEVER_ECHO'),
  );
});
