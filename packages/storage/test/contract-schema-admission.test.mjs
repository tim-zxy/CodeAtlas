import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { historyFixture, historyLimits, prefixPlan } from './helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { RuntimeFactStore } from '../dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../dist/runtime/contract-store.js';
import { workspaceRuntimeInputDigest, workspaceRuntimeInputDigestV2 } from '@codeatlas/ir';
const plan = await loadMigrationPlan(
  new URL('../migrations/workspace/manifest.json', import.meta.url),
  'WORKSPACE',
);
async function fixture(t, version = 8, format = 1, publish = true) {
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const repo = new RuntimeFactStore(f.db, f.input.repositoryId),
    basis = repo.readRuntimeBasis(historyLimits).identity;
  const candidate = {
    facts: {
      schema: 'codeatlas.runtime-fact-set',
      version: 1,
      payload: {
        basis: basis.codeBasis,
        externalRefs: [],
        supportInventory: [],
        entryPoints: [],
        tasks: [],
        dataResources: [],
        triggers: [],
        contracts: [],
        contexts: [],
        nodes: [],
        edges: [],
        flows: [],
      },
    },
    bindings: {
      schema: 'codeatlas.framework-binding-set',
      version: 1,
      payload: { basis: basis.codeBasis, externalRefs: [], supportInventory: [], bindings: [] },
    },
    coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
    termination: 'COMPLETE',
  };
  repo.applyRuntimeBatch({ expected: basis, candidate }, historyLimits);
  const current = repo.readRuntimeBasis(historyLimits).identity,
    runtime = repo.traceRuntime(historyLimits);
  const binding = {
    repoBasis: current.codeBasis,
    syntaxActivationId: current.syntaxActivationId,
    syntaxMembershipDigest: current.syntaxMembershipDigest,
    runtimeActivationId: current.runtimeActivationId,
    runtimeCandidateDigest: runtime.identity.candidateDigest,
  };
  const db = new DatabaseSync(f.directory + '/contract-admission.sqlite', {
    enableForeignKeyConstraints: true,
  });
  f.connections.push(db);
  applyMigrationPlan(db, {
    ...plan,
    latestVersion: version,
    migrations: plan.migrations.slice(0, version),
  });
  db.prepare('INSERT INTO workspace VALUES(1,?,?)').run('ws:admission', 'owned');
  db.prepare('INSERT INTO repositories VALUES(?,?,?)').run(
    f.input.repositoryId,
    'ws:admission',
    f.input.tables.repository[0].root_path,
  );
  db.prepare('INSERT INTO revision_sets VALUES(?,?,0,0)').run('set:admission', 'ws:admission');
  db.prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)').run(
    'set:admission',
    current.codeBasis.repositoryId,
    current.codeBasis.revisionId,
    current.codeBasis.contentFingerprint,
  );
  db.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run('set:admission');
  const workspaceBasis = {
    workspaceId: 'ws:admission',
    revisionSetId: 'set:admission',
    workspaceActivationDigest: '0'.repeat(64),
  };
  const frozen = {
    workspaceBasis,
    repositoryBindings: [binding],
    catalog: { workspaceBasis, services: [], entries: [], contractBindings: [] },
    contractRefs: [],
  };
  if (format === 2) {
    frozen.matchingPolicyVersion = 'declared-http-schema-v1';
    frozen.schemaDocuments = [];
  }
  workspaceBasis.workspaceActivationDigest =
    format === 2 ? workspaceRuntimeInputDigestV2(frozen) : workspaceRuntimeInputDigest(frozen);
  const batch = {
    expectedOldActivationId: null,
    frozen,
    matches: [],
    execution: {
      schema: 'codeatlas.workspace-execution',
      version: 1,
      payload: {
        workspaceBasis,
        repositoryBindings: [binding],
        nodes: [],
        edges: [],
        coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
        supportInventory: [],
      },
    },
  };
  const store = new ContractStore(db, 'ws:admission', [repo]);
  const apply = (batch) =>
    format === 2
      ? store.applyWorkspaceBatchV2(batch, historyLimits, historyLimits.maxSerializedBytes)
      : store.applyWorkspaceBatch(batch, historyLimits);
  const trace = (limits = historyLimits) =>
    format === 2 ? store.traceWorkspaceRuntimeV2(limits) : store.traceWorkspaceRuntime(limits);
  const read = () =>
    format === 2
      ? store.readWorkspaceInputsV2(frozen, historyLimits, historyLimits.maxSerializedBytes)
      : store.readWorkspaceInputs(frozen, historyLimits);
  const committed = publish ? apply(batch) : null;
  if (committed) assert.equal(committed.status, 'COMMITTED');
  return { ...f, db, store, batch, trace, apply, read, committed };
}
const invalid = (error) => error instanceof Error && error.message === 'INVALID_WORKSPACE_RUNTIME';
const image = (db) => ({
  state: db.prepare('SELECT * FROM workspace_runtime_state').all(),
  activations: db.prepare('SELECT * FROM workspace_runtime_activations').all(),
});
for (const format of [1, 2]) {
  test(
    'Contract trace format' + format + ' rejects unknown schema before returning an empty result',
    async (t) => {
      const f = await fixture(t, 8, format, false);
      f.db.exec('PRAGMA user_version=9');
      assert.throws(() => f.trace(), invalid);
      assert.equal(f.db.isTransaction, false);
    },
  );
  test('Contract trace format' + format + ' rejects disabled FKs in its owned view', async (t) => {
    const f = await fixture(t, 8, format);
    const before = image(f.db);
    f.db.exec('PRAGMA foreign_keys=OFF');
    assert.throws(() => f.trace(), invalid);
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(image(f.db), before);
  });
  test(
    'Contract inspect format' +
      format +
      ' rejects unknown schema despite a real committed activation',
    async (t) => {
      const f = await fixture(t, 8, format);
      assert.equal(f.store.inspectOutcome(historyLimits).activationId, f.committed.activationId);
      f.db.exec('PRAGMA user_version=9');
      assert.throws(() => f.store.inspectOutcome(historyLimits), invalid);
      assert.equal(f.db.isTransaction, false);
      assert.equal(f.store.settlement().status, 'COMMITTED');
    },
  );
  test(
    'Contract prepare format' +
      format +
      ' refuses FK-disabled preparation without changing last-good',
    async (t) => {
      const f = await fixture(t, 8, format),
        before = image(f.db);
      f.db.exec('PRAGMA foreign_keys=OFF');
      assert.throws(() => f.read(), invalid);
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(image(f.db), before);
    },
  );
}
test('Contract admission SQL consumes the original request row budget and stops before body delivery', async (t) => {
  const f = await fixture(t, 8, 1, false),
    prepare = f.db.prepare.bind(f.db),
    queries = [];
  f.db.prepare = (sql) => {
    queries.push({ sql, transaction: f.db.isTransaction });
    return prepare(sql);
  };
  try {
    assert.throws(
      () => f.trace({ ...historyLimits, maxRows: 1 }),
      (error) => error.code === 'HISTORY_LIMIT_EXCEEDED',
    );
  } finally {
    f.db.prepare = prepare;
  }
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /pragma_user_version/);
  assert.equal(queries[0].transaction, true);
  assert.equal(f.db.isTransaction, false);
});
for (const version of [6, 7, 8])
  test(
    'supported workspace' + version + ' retains current/empty trace and fresh-connection recovery',
    async (t) => {
      const f = await fixture(t, version, 1, false);
      assert.equal(f.trace().status, 'NOT_AVAILABLE');
      const committed = f.apply(f.batch);
      assert.equal(f.trace().status, 'CURRENT');
      const prepare = DatabaseSync.prototype.prepare,
        checks = [];
      DatabaseSync.prototype.prepare = function (sql) {
        if (/pragma_(?:user_version|foreign_keys)/.test(sql))
          checks.push({ sql, own: this !== f.db, transaction: this.isTransaction });
        return Reflect.apply(prepare, this, [sql]);
      };
      try {
        assert.equal(f.store.inspectOutcome(historyLimits).activationId, committed.activationId);
      } finally {
        DatabaseSync.prototype.prepare = prepare;
      }
      assert.ok(checks.some((row) => /pragma_user_version/.test(row.sql)));
      assert.ok(checks.some((row) => /pragma_foreign_keys/.test(row.sql)));
      assert.ok(checks.every((row) => row.own && row.transaction));
    },
  );

for (const format of [1, 2])
  test('Contract apply format' + format + ' rejects disabled FKs before publication', async (t) => {
    const f = await fixture(t, 8, format),
      before = image(f.db);
    f.db.exec('PRAGMA foreign_keys=OFF');
    assert.throws(
      () => f.apply({ ...f.batch, expectedOldActivationId: f.committed.activationId }),
      invalid,
    );
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(image(f.db), before);
  });
