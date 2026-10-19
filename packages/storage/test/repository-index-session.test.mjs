import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
  symlink,
  link,
  rename,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as storage from '../dist/index.js';
import * as sessionDiagnostics from '../dist/indexing/repository-index-session.js';

async function fixture(t) {
  assert.equal(
    typeof storage.openRepositoryIndexSession,
    'function',
    'Missing index repository session',
  );
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-index-session-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryRoot = path.join(directory, 'repo');
  await mkdir(repositoryRoot);
  const databasePath = path.join(directory, 'repository.sqlite');
  const input = {
    databasePath,
    repositoryRoot: await realpath(repositoryRoot),
    repositoryId: 'fixture-repo',
    initialize: true,
    readOnly: false,
  };
  const control = { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} };
  return { directory, input, control };
}

test('private session lifetime observes every acquired writer before connection close', async (t) => {
  assert.equal(typeof sessionDiagnostics.observeRepositoryIndexSessionLifetime, 'function');
  const f = await fixture(t);
  const result = await sessionDiagnostics.observeRepositoryIndexSessionLifetime(async () => {
    const session = await storage.openRepositoryIndexSession(f.input, f.control);
    session.database.exec('CREATE TEMP TABLE stage(id INTEGER PRIMARY KEY AUTOINCREMENT)');
    session.database.exec('INSERT INTO stage DEFAULT VALUES');
    session.database.exec('DROP TABLE stage');
    session.database.exec('BEGIN');
    session.close(); // The real owning close rolls back before settling its connection.
    session.close();
    return 'settled';
  });
  assert.equal(result.value, 'settled');
  assert.equal(result.threw, false);
  assert.deepEqual(result.evidence, {
    scope: 'REPOSITORY_INDEX_SESSION_LIFETIME_ONLY',
    openedConnections: 1,
    closedConnections: 1,
    transactionClosed: true,
    tempClosed: true,
    connectionClosed: true,
    captureFailed: false,
  });
  assert.equal(Object.hasOwn(storage, 'observeRepositoryIndexSessionLifetime'), false);
});

test('session lifetime cannot infer closure from an unclosed writer or from no acquisition', async (t) => {
  assert.equal(typeof sessionDiagnostics.observeRepositoryIndexSessionLifetime, 'function');
  const f = await fixture(t);
  let session;
  try {
    const result = await sessionDiagnostics.observeRepositoryIndexSessionLifetime(async () => {
      session = await storage.openRepositoryIndexSession(f.input, f.control);
    });
    assert.equal(result.evidence.openedConnections, 1);
    assert.equal(result.evidence.closedConnections, 0);
    assert.equal(result.evidence.connectionClosed, false);
    assert.equal(result.evidence.transactionClosed, null);
    assert.equal(result.evidence.tempClosed, null);
  } finally {
    session?.close();
  }
  const refused = await sessionDiagnostics.observeRepositoryIndexSessionLifetime(() => {
    throw 0;
  });
  assert.equal(refused.threw, true);
  assert.equal(refused.error, 0);
  assert.equal(refused.evidence.connectionClosed, null);
  assert.equal(refused.evidence.tempClosed, null);
});

test('session lifetime catches TEMP leaks before close destroys their visible evidence', async (t) => {
  assert.equal(typeof sessionDiagnostics.observeRepositoryIndexSessionLifetime, 'function');
  const f = await fixture(t);
  const failure = new Error('original workload failure');
  const result = await sessionDiagnostics.observeRepositoryIndexSessionLifetime(async () => {
    const session = await storage.openRepositoryIndexSession(f.input, f.control);
    try {
      session.database.exec('CREATE TEMP TABLE unfinished_stage(x)');
      throw failure;
    } finally {
      session.close();
    }
  });
  assert.equal(result.error, failure);
  assert.equal(result.evidence.tempClosed, false);
  assert.equal(result.evidence.transactionClosed, true);
  assert.equal(result.evidence.connectionClosed, true);
});

test('session lifetime includes failed binding acquisitions and borrowed read snapshots', async (t) => {
  assert.equal(typeof sessionDiagnostics.observeRepositoryIndexSessionLifetime, 'function');
  const f = await fixture(t);
  (await storage.openRepositoryIndexSession(f.input, f.control)).close();
  const result = await sessionDiagnostics.observeRepositoryIndexSessionLifetime(async () => {
    const read = await storage.openRepositoryIndexSession(
      { ...f.input, initialize: false, readOnly: true },
      f.control,
    );
    assert.equal(read.database.isTransaction, true);
    read.close();
    await storage.openRepositoryIndexSession(
      { ...f.input, initialize: false, repositoryId: 'wrong-owner' },
      f.control,
    );
  });
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'REPOSITORY_MISMATCH');
  assert.equal(result.evidence.openedConnections, 2);
  assert.equal(result.evidence.closedConnections, 2);
  assert.equal(result.evidence.transactionClosed, true);
  assert.equal(result.evidence.tempClosed, true);
  assert.equal(result.evidence.connectionClosed, true);
});

test('index repository initializes R010 and exposes bounded persisted-only status', async (t) => {
  const f = await fixture(t);
  const session = await storage.openRepositoryIndexSession(f.input, f.control);
  try {
    assert.equal(session.initialized, true);
    assert.equal(session.database.prepare('PRAGMA user_version').get().user_version, 10);
    assert.deepEqual(session.sourceState.load('fixture-repo'), null);
    const view = await session.readStatus();
    assert.equal(view.freshness.state, 'NOT_INDEXED');
    assert.equal(view.freshness.worktree, 'NOT_OBSERVED');
    assert.equal(view.baseline.state, 'MISSING');
    assert.equal(session.database.isTransaction, false);
  } finally {
    session.close();
  }
  const before = await readFile(f.input.databasePath);
  const read = await storage.openRepositoryIndexSession(
    { ...f.input, initialize: false, readOnly: true },
    f.control,
  );
  try {
    assert.equal(read.initialized, false);
    assert.equal((await read.readStatus()).freshness.state, 'NOT_INDEXED');
    assert.throws(() => read.database.exec('CREATE TABLE forbidden(x)'));
  } finally {
    read.close();
    read.close();
  }
  assert.deepEqual(await readFile(f.input.databasePath), before);
});

test('index repository refuses an existing destination without altering sentinel', async (t) => {
  const f = await fixture(t);
  await writeFile(f.input.databasePath, 'sentinel');
  await assert.rejects(
    storage.openRepositoryIndexSession(f.input, f.control),
    (e) => e.code === 'DATABASE_ALREADY_EXISTS',
  );
  assert.equal(await readFile(f.input.databasePath, 'utf8'), 'sentinel');
});

test('index repository has one initialization winner and never adopts it', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([
    storage.openRepositoryIndexSession(f.input, f.control),
    storage.openRepositoryIndexSession(f.input, f.control),
  ]);
  const winners = results.filter((r) => r.status === 'fulfilled');
  assert.equal(winners.length, 1);
  winners[0].value.close();
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'DATABASE_ALREADY_EXISTS');
});

test('index repository refuses a parent root without modifying the bound database', async (t) => {
  const f = await fixture(t);
  (await storage.openRepositoryIndexSession(f.input, f.control)).close();
  const before = await readFile(f.input.databasePath);
  await assert.rejects(
    storage.openRepositoryIndexSession(
      { ...f.input, initialize: false, repositoryRoot: await realpath(f.directory) },
      f.control,
    ),
    (e) => e.code === 'REPOSITORY_MISMATCH',
  );
  assert.deepEqual(await readFile(f.input.databasePath), before);
});

test('index repository refuses replacement between identity capture and SQLite open', async (t) => {
  const f = await fixture(t);
  (await storage.openRepositoryIndexSession(f.input, f.control)).close();
  const before = await readFile(f.input.databasePath);
  const preserved = path.join(f.directory, 'preserved.sqlite');
  let checks = 0;
  const control = {
    ...f.control,
    async checkpoint() {
      if (++checks === 2) {
        await rename(f.input.databasePath, preserved);
        await writeFile(f.input.databasePath, 'foreign replacement sentinel');
      }
    },
  };
  await assert.rejects(
    storage.openRepositoryIndexSession({ ...f.input, initialize: false }, control),
    (e) => e.code === 'DATABASE_UNAVAILABLE',
  );
  assert.equal(await readFile(f.input.databasePath, 'utf8'), 'foreign replacement sentinel');
  assert.deepEqual(await readFile(preserved), before);
});

test('index status retains one read snapshot across a concurrent WAL metadata update', async (t) => {
  const f = await fixture(t);
  (await storage.openRepositoryIndexSession(f.input, f.control)).close();
  const writer = new DatabaseSync(f.input.databasePath);
  writer.exec('PRAGMA journal_mode=WAL');
  const reader = await storage.openRepositoryIndexSession(
    { ...f.input, initialize: false, readOnly: true },
    f.control,
  );
  try {
    assert.equal((await reader.readStatus()).freshness.state, 'NOT_INDEXED');
    // Owned metadata-only test setup, not canonical fact publication.
    writer
      .prepare('UPDATE repository_state SET indexed_content_fingerprint=?')
      .run('sha256:' + '1'.repeat(64));
    assert.equal((await reader.readStatus()).freshness.state, 'NOT_INDEXED');
  } finally {
    reader.close();
    writer.close();
  }
  const reopened = await storage.openRepositoryIndexSession(
    { ...f.input, initialize: false, readOnly: true },
    f.control,
  );
  try {
    assert.equal((await reopened.readStatus()).freshness.state, 'UNKNOWN');
  } finally {
    reopened.close();
  }
});

for (const kind of ['symlink', 'hardlink', 'foreign', 'old-schema', 'new-schema']) {
  test(`index repository refuses ${kind} without migration`, async (t) => {
    const f = await fixture(t);
    const session = await storage.openRepositoryIndexSession(f.input, f.control);
    session.close();
    if (kind === 'old-schema' || kind === 'new-schema') {
      const db = new DatabaseSync(f.input.databasePath);
      db.exec(`PRAGMA user_version = ${kind === 'old-schema' ? 9 : 11}`);
      db.close();
    }
    let databasePath = f.input.databasePath;
    if (kind === 'symlink' || kind === 'hardlink') {
      databasePath = path.join(f.directory, 'alias.sqlite');
      if (kind === 'symlink' && process.platform === 'win32') {
        const alias = path.join(f.directory, 'linked-parent');
        await symlink(f.directory, alias, 'junction');
        databasePath = path.join(alias, 'repository.sqlite');
      } else if (kind === 'symlink') await symlink(f.input.databasePath, databasePath);
      else await link(f.input.databasePath, databasePath);
    }
    const before = await readFile(f.input.databasePath);
    await assert.rejects(
      storage.openRepositoryIndexSession(
        {
          ...f.input,
          databasePath,
          initialize: false,
          repositoryId: kind === 'foreign' ? 'foreign-repo' : f.input.repositoryId,
        },
        f.control,
      ),
    );
    assert.deepEqual(await readFile(f.input.databasePath), before);
  });
}

test('index repository refuses TEXT before unbudgeted materialization and closes connection', async (t) => {
  const f = await fixture(t);
  const session = await storage.openRepositoryIndexSession(f.input, f.control);
  session.close();
  let bytes = 0;
  const control = {
    ...f.control,
    reserveText(size) {
      bytes += size;
      throw new Error('budget');
    },
  };
  await assert.rejects(
    storage.openRepositoryIndexSession({ ...f.input, initialize: false, readOnly: true }, control),
  );
  assert.ok(bytes > 0);
  const db = new DatabaseSync(f.input.databasePath);
  db.exec('BEGIN EXCLUSIVE');
  db.exec('ROLLBACK');
  db.close();
});

test('index repository reports a missing existing database without creating one', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    storage.openRepositoryIndexSession({ ...f.input, initialize: false }, f.control),
    (e) => e.code === 'DATABASE_UNAVAILABLE',
  );
  await assert.rejects(readFile(f.input.databasePath), { code: 'ENOENT' });
});

test('index repository distinguishes a workspace from an old repository', async (t) => {
  const f = await fixture(t);
  await storage.runMigrations({
    databasePath: f.input.databasePath,
    databaseKind: 'WORKSPACE',
    manifestUrl: new URL('../migrations/workspace/manifest.json', import.meta.url),
  });
  await assert.rejects(
    storage.openRepositoryIndexSession(
      { ...f.input, initialize: false, readOnly: true },
      f.control,
    ),
    (e) => e.code === 'DATABASE_KIND_MISMATCH',
  );
});

test('index repository does not treat unexamined corrupt Native summaries as compatible', async (t) => {
  const f = await fixture(t);
  const session = await storage.openRepositoryIndexSession(f.input, f.control);
  try {
    const fp = 'sha256:' + '1'.repeat(64);
    session.sourceState.replace(null, {
      revision: {
        id: 'rev',
        repositoryId: 'fixture-repo',
        kind: 'WORKTREE',
        contentFingerprint: fp,
        baseRevisionId: null,
      },
      files: [],
    });
    // Explicit corrupt-state setup only: not a Native or fact publication claim.
    session.database
      .prepare("INSERT INTO provider_snapshots VALUES(?,?,'native','1','1',?,?,0,0,'SUCCEEDED')")
      .run('snapshot', 'fixture-repo', 'rev', fp);
    session.database
      .prepare("INSERT INTO native_analysis_state VALUES(?, 'native',?,?,?,?)")
      .run('fixture-repo', 'snapshot', 'rev', fp, '{"invalid":"unexamined header"}');
    const view = await session.readStatus();
    assert.equal(view.baseline.state, 'PRESENT_UNVERIFIED');
    assert.equal(view.coverage.snapshotId, 'snapshot');
    assert.equal(session.database.isTransaction, false);
  } finally {
    session.close();
  }
});

test('index repository refuses a Native pointer referencing a different provider snapshot', async (t) => {
  const f = await fixture(t);
  const session = await storage.openRepositoryIndexSession(f.input, f.control);
  try {
    const fp = 'sha256:' + '1'.repeat(64);
    session.sourceState.replace(null, {
      revision: {
        id: 'rev',
        repositoryId: 'fixture-repo',
        kind: 'WORKTREE',
        contentFingerprint: fp,
        baseRevisionId: null,
      },
      files: [],
    });
    // Deliberately inconsistent derived metadata in a negative-only database.
    session.database
      .prepare(
        "INSERT INTO provider_snapshots VALUES(?,?,'other-provider','1','1',?,?,0,0,'SUCCEEDED')",
      )
      .run('snapshot', 'fixture-repo', 'rev', fp);
    session.database
      .prepare("INSERT INTO native_analysis_state VALUES(?, 'native',?,?,?,?)")
      .run('fixture-repo', 'snapshot', 'rev', fp, '{}');
    await assert.rejects(session.readStatus(), (e) => e.code === 'INDEX_DATA_INVALID');
    assert.equal(session.database.isTransaction, false);
  } finally {
    session.close();
  }
});
