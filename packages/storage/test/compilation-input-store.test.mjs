import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { createCompilationInputSnapshot } from '../../application/dist/compilation-input-contract.js';
import { DocumentStore } from '../dist/documents/document-store.js';
import { createHash } from 'node:crypto';
import { captureCompilationInput } from '../../application/dist/capture-compilation-input.js';
const api = await import('../dist/knowledge/compilation-input-store.js').catch(() => ({}));
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2000000,
  maxItems: 200000,
  maxDepth: 100,
  memoryBudgetBytes: 20000000,
};
const control = () => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
});
const check = () => {};
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
async function fixture(t, version = 10) {
  const root = await realpath(tmpdir()),
    dir = await mkdtemp(path.join(root, 'codeatlas-owned-snapshot-'));
  assert.equal(path.dirname(dir), root);
  const file = path.join(dir, 'owned.sqlite'),
    db = new DatabaseSync(file),
    connections = [db];
  t.after(async () => {
    for (const c of connections) if (c.isOpen) c.close();
    assert.equal(path.dirname(dir), root);
    await rm(dir, { recursive: true, force: true });
  });
  const plan = await loadMigrationPlan(
    new URL('../migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  assert.equal(plan.latestVersion, 8);
  applyMigrationPlan(db, plan);
  db.exec(
    "INSERT INTO workspace VALUES(1,'ws:one','/owned'); INSERT INTO revision_sets VALUES('set:one','ws:one',0,1)",
  );
  const doc = await readFile(
    new URL(
      '../../../docs/superpowers/specs/2026-11-07-w009-w011-ddl-review-candidate.md',
      import.meta.url,
    ),
    'utf8',
  );
  const blocks = [...doc.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map((x) =>
    x[1].replace(/\r\n?/g, '\n'),
  );
  for (let v = 9; v <= version; v++) {
    const sql = await readFile(
      new URL(
        '../migrations/workspace-proposed/' + (v === 9 ? '009_knowledge.sql' : '010_lifecycle.sql'),
        import.meta.url,
      ),
      'utf8',
    );
    assert.equal(sql.replace(/\r\n?/g, '\n'), blocks[v - 9]);
    db.exec('BEGIN IMMEDIATE');
    db.exec(sql);
    db.exec('PRAGMA user_version=' + v);
    db.exec('COMMIT');
  }
  const captureRequest = {
    schemaVersion: 1,
    workspaceId: 'ws:one',
    scope: { kind: 'WORKSPACE', workspaceId: 'ws:one' },
    revisionSetId: 'set:one',
    repositoryIds: [],
    selectedEntityRefs: [],
    selectedDocumentRevisions: [],
    policyVersions: { securityPolicyRef: 'security:owned', domainPolicyRef: 'domain:owned' },
  };
  const key = {
    runId: 'run:one',
    subject: { issuerNamespace: 'owned:test', subjectId: 'synthetic' },
    requestKey: 'request:one',
    request: {
      schemaVersion: 1,
      captureRequest,
      updateMode: 'FULL',
      expectedHeads: { heads: [] },
      workflowRef: 'workflow:owned',
      modelPolicyRef: null,
    },
  };
  const snapshot = createCompilationInputSnapshot(
    {
      schemaVersion: 1,
      snapshotId: 'snapshot:one',
      workspaceId: 'ws:one',
      scope: captureRequest.scope,
      revisionSetId: 'set:one',
      selection: { repositoryIds: [], selectedEntityRefs: [], selectedDocumentRevisions: [] },
      workspaceCapture: null,
      repositories: [],
      documents: [],
      policyVersions: captureRequest.policyVersions,
      captureWindow: {
        startedAt: '2026-11-08T00:00:00.000Z',
        completedAt: '2026-11-08T00:00:01.000Z',
      },
      coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
    },
    control(),
  );
  const open = () => api.openCompilationInputStore(db, 'ws:one', limits);
  const reopen = () => {
    const c = new DatabaseSync(file);
    connections.push(c);
    return c;
  };
  return { db, file, key, snapshot, open, reopen };
}
test('owned snapshot persists atomically and reopens through exact10 reader', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  assert.equal(
    store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check).state,
    'CAPTURING',
  );
  const receipt = store.putSnapshot(f.key, f.snapshot, limits, control(), check);
  assert.equal(receipt.status, 'COMMITTED');
  assert.equal(receipt.cleanupState, 'SETTLED');
  assert.equal(receipt.reused, false);
  assert.deepEqual(store.readSnapshot(f.key, limits, control(), check), f.snapshot);
  assert.equal(store.putSnapshot(f.key, f.snapshot, limits, control(), check).reused, true);
  assert.throws(() => f.db.exec("UPDATE compilation_input_snapshots SET input_digest='changed'"));
  f.db.close();
  const reopened = await api.openCompilationInputStore(f.reopen(), 'ws:one', limits);
  assert.deepEqual(reopened.readSnapshot(f.key, limits, control(), check), f.snapshot);
  assert.equal(
    reopened.inspectCommit(f.key, 'snapshot:one', limits, control(), check).status,
    'COMMITTED',
  );
});

test('existing capture ports to disk Store preserve nonempty support membership and reject corrupt extras', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  f.db.exec(
    "INSERT INTO repositories VALUES('repo:one','ws:one','/owned/source');INSERT INTO revision_sets VALUES('set:source','ws:one',0,0)",
  );
  const fingerprint = 'sha256:' + '0'.repeat(64);
  f.db
    .prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)')
    .run('set:source', 'repo:one', 'rev:one', fingerprint);
  f.db.exec("UPDATE revision_sets SET frozen=1 WHERE id='set:source'");
  const request = f.key.request.captureRequest;
  request.revisionSetId = 'set:source';
  request.repositoryIds = ['repo:one'];
  const ref = {
    scope: 'REPOSITORY',
    repositoryId: 'repo:one',
    entity: { kind: 'SOURCE_FILE', id: 'file:one', revisionId: 'rev:one' },
  };
  request.selectedEntityRefs = [ref];
  const value = {
    id: 'file:one',
    repositoryId: 'repo:one',
    revisionId: 'rev:one',
    path: 'owned.txt',
    contentFingerprint: fingerprint,
    classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: 'text',
    sensitivity: 'INTERNAL',
  };
  const basis = {
    repositoryId: 'repo:one',
    revisionId: 'rev:one',
    contentFingerprint: fingerprint,
    codeActivationDigest: '0'.repeat(64),
  };
  const hash = (domain, v) =>
    createHash('sha256')
      .update(domain + canonical(v))
      .digest('hex');
  const support = {
    ref: {
      basis,
      entity: ref.entity,
      valueDigest: hash('codeatlas-phase1-support-value-v1\0', value),
    },
    valueSchemaRef: 'SourceFile@1',
    value,
    capturedValueDigest: hash('codeatlas.capture-value.v1\n', {
      valueSchemaRef: 'SourceFile@1',
      value,
    }),
  };
  const selection = {
    workspaceId: 'ws:one',
    revisionSetId: 'set:source',
    registeredRepositories: [{ repositoryId: 'repo:one', rootPath: '/owned/source' }],
    revisionSetEntries: [
      { repositoryId: 'repo:one', revisionId: 'rev:one', revisionFingerprint: fingerprint },
    ],
  };
  let releases = 0,
    time = 0;
  store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check);
  const snapshot = await captureCompilationInput(request, control(), {
    account: { checkpoint() {}, own() {}, invalidate() {} },
    allocateSnapshotId: () => 'snapshot:source',
    now: () => (time++ ? '2026-11-08T00:00:01.000Z' : '2026-11-08T00:00:00.000Z'),
    currentPolicyVersions: () => request.policyVersions,
    authorizeSelection: check,
    authorizeRepositoryRead: check,
    authorizeWorkspaceRead: check,
    readSelection: () => selection,
    acquireRepository: () => ({
      handle: {},
      capture: {
        repoBasis: basis,
        runtimeActivationDigest: null,
        entities: [{ ref, valueSchemaRef: 'SourceFile@1', value }],
        supports: [support],
        coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
      },
    }),
    acquireWorkspace: () => ({ handle: {}, selection, workspaceCapture: null, documents: [] }),
    verifySource: check,
    recheckRepository: check,
    recheckWorkspace: check,
    releaseRepository: () => {
      releases++;
    },
    releaseWorkspace: () => {
      releases++;
    },
  });
  assert.equal(releases, 2);
  assert.equal(store.putSnapshot(f.key, snapshot, limits, control(), check).status, 'COMMITTED');
  assert.deepEqual(store.readSnapshot(f.key, limits, control(), check), snapshot);
  assert.equal(f.db.prepare('SELECT count(*) n FROM snapshot_supports').get().n, 1);
  f.db.close();
  const reopenedDb = f.reopen(),
    reopened = await api.openCompilationInputStore(reopenedDb, 'ws:one', limits);
  assert.deepEqual(reopened.readSnapshot(f.key, limits, control(), check), snapshot);
  reopenedDb
    .prepare('INSERT INTO snapshot_supports VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(
      'ws:one',
      snapshot.snapshotId,
      'set:source',
      'extra',
      '{}',
      '{}',
      'a'.repeat(64),
      'b'.repeat(64),
      'SourceFile@1',
      '{}',
    );
  assert.throws(
    () => reopened.inspectCommit(f.key, snapshot.snapshotId, limits, control(), check),
    { code: 'SNAPSHOT_SUPPORT_MISMATCH' },
  );
});
test('wrong workspace, changed idempotency request and unknown schema refuse without writes', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check);
  const changed = structuredClone(f.key);
  changed.request.workflowRef = 'foreign';
  assert.throws(() => store.putSnapshot(changed, f.snapshot, limits, control(), check));
  const foreign = structuredClone(f.snapshot);
  foreign.workspaceId = 'ws:foreign';
  assert.throws(() => store.putSnapshot(f.key, foreign, limits, control(), check));
  assert.equal(f.db.prepare('SELECT count(*) n FROM compilation_input_snapshots').get().n, 0);
  f.db.exec('PRAGMA user_version=11');
  assert.throws(() => store.readSnapshot(f.key, limits, control(), check));
});

test('limits, cancelled controls and FK-disabled connections cannot create a run', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  assert.throws(() =>
    store.createRun({ ...f.key, createdAtMs: 0 }, { ...limits, maxRows: 1 }, control(), check),
  );
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () =>
      store.createRun(
        { ...f.key, createdAtMs: 0 },
        limits,
        { ...control(), signal: controller.signal },
        check,
      ),
    { code: 'CANCELLED' },
  );
  f.db.exec('PRAGMA foreign_keys=OFF');
  assert.throws(() => store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check), {
    code: 'SNAPSHOT_FOREIGN_KEYS_REQUIRED',
  });
  assert.equal(f.db.prepare('SELECT count(*) n FROM compilation_runs').get().n, 0);
});
test('precommit failure rolls back; only the settled original attempt proves absence', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check);
  let calls = 0;
  assert.throws(() =>
    store.putSnapshot(f.key, f.snapshot, limits, control(), () => {
      if (++calls === 2) throw Error('owned fault');
    }),
  );
  assert.equal(f.db.isTransaction, false);
  assert.equal(
    store.inspectCommit(f.key, 'snapshot:one', limits, control(), check).status,
    'NOT_COMMITTED',
  );
  const fresh = await api.openCompilationInputStore(f.reopen(), 'ws:one', limits);
  assert.equal(
    fresh.inspectCommit(f.key, 'snapshot:one', limits, control(), check).status,
    'COMMIT_OUTCOME_UNKNOWN',
  );
  assert.throws(() => fresh.putSnapshot(f.key, f.snapshot, limits, control(), check), {
    code: 'SNAPSHOT_OWNER_UNSETTLED',
  });
  assert.equal(f.db.prepare('SELECT snapshot_id FROM compilation_runs').get().snapshot_id, null);
});
test('lost acknowledgement stays unknown but full inspection recovers actual commit', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check);
  const exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    const result = exec(sql);
    if (sql === 'COMMIT') throw Error('lost acknowledgement');
    return result;
  };
  const receipt = store.putSnapshot(f.key, f.snapshot, limits, control(), check);
  assert.equal(receipt.status, 'COMMIT_OUTCOME_UNKNOWN');
  f.db.exec = exec;
  assert.equal(
    store.inspectCommit(f.key, 'snapshot:one', limits, control(), check).status,
    'COMMITTED',
  );
  assert.throws(() => store.putSnapshot(f.key, f.snapshot, limits, control(), check));
});
test('acknowledged commit survives a failed postcommit cleanup check', async (t) => {
  const f = await fixture(t),
    store = await f.open();
  store.createRun({ ...f.key, createdAtMs: 0 }, limits, control(), check);
  let calls = 0;
  const receipt = store.putSnapshot(f.key, f.snapshot, limits, control(), () => {
    if (++calls === 3) throw Object.assign(Error('owned cleanup'), { cleanupState: 'UNKNOWN' });
  });
  assert.equal(receipt.status, 'COMMITTED');
  assert.equal(receipt.cleanupState, 'UNKNOWN');
  assert.equal(f.db.prepare('SELECT count(*) n FROM compilation_input_snapshots').get().n, 1);
  assert.throws(() => store.putSnapshot(f.key, f.snapshot, limits, control(), check));
});
for (const version of [9, 10])
  test(
    'private exact prefix' +
      version +
      ' rejects changed guards while production readers remain closed',
    async (t) => {
      const f = await fixture(t, version);
      await f.open();
      assert.throws(() => new DocumentStore(f.db, 'ws:one'), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
      f.db.exec('DROP TRIGGER proposed_knowledge_revisions_no_update');
      await assert.rejects(f.open(), { code: 'SNAPSHOT_SCHEMA_UNSUPPORTED' });
    },
  );
