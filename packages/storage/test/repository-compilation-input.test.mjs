import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFixture, historyLimits, prefixPlan } from './helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import * as api from '../dist/runtime/runtime-fact-store.js';
const check = () => undefined;
async function fixture(t) {
  const f = await historyFixture(t, 'syntax');
  applyMigrationPlan(f.db, await prefixPlan(13));
  return { ...f, store: new api.RuntimeFactStore(f.db, f.input.repositoryId) };
}
test('private repository capture owns Code/Evidence/Syntax view, shares budget and releases once', async (t) => {
  assert.equal(typeof api.captureRepositoryCompilationInputs, 'function');
  const f = await fixture(t),
    budget = new HistoryReadBudget(historyLimits);
  const { handle, view } = api.captureRepositoryCompilationInputs(f.store, budget, check);
  assert.ok(view.nodes.length);
  assert.ok(view.evidence.length);
  assert.ok(view.syntaxEvidence.length);
  assert.equal(view.runtimeActivation, null);
  assert.equal(api.repositoryCompilationWorkspaceSnapshot(f.store, handle), null);
  assert.equal(f.db.isTransaction, false);
  const rows = budget.rows;
  api.recheckRepositoryCompilationInputs(f.store, handle, budget, check);
  assert.ok(budget.rows > rows);
  api.releaseRepositoryCompilationInputs(f.store, handle);
  assert.throws(() => api.releaseRepositoryCompilationInputs(f.store, handle));
});

const emptyCandidate = (basis) => ({
  facts: {
    schema: 'codeatlas.runtime-fact-set',
    version: 1,
    payload: {
      basis,
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
    payload: { basis, externalRefs: [], supportInventory: [], bindings: [] },
  },
  coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
  termination: 'COMPLETE',
});
test('capture exposes only fully validated original Runtime activation digest', async (t) => {
  const f = await fixture(t),
    current = f.store.readRuntimeBasis(historyLimits);
  f.store.applyRuntimeBatch(
    { expected: current.identity, candidate: emptyCandidate(current.identity.codeBasis) },
    historyLimits,
  );
  const { handle, view } = api.captureRepositoryCompilationInputs(
    f.store,
    new HistoryReadBudget(historyLimits),
    check,
  );
  const row = f.db.prepare('SELECT value_digest FROM runtime_activations').get();
  assert.equal(view.runtimeActivation.valueDigest, row.value_digest);
  assert.equal(Object.isFrozen(view.runtimeActivation.candidate), true);
  assert.deepEqual(
    api.repositoryCompilationWorkspaceSnapshot(f.store, handle).candidate,
    view.runtimeActivation.candidate,
  );
  assert.throws(() =>
    api.repositoryCompilationWorkspaceSnapshot(
      new api.RuntimeFactStore(f.db, f.input.repositoryId),
      handle,
    ),
  );
  api.releaseRepositoryCompilationInputs(f.store, handle);
});
test('real WAL writer between component reads cannot mix views; final recheck rejects movement', async (t) => {
  const f = await fixture(t);
  f.db.exec('PRAGMA journal_mode=WAL');
  const writer = f.reopen(),
    original = f.db.prepare('SELECT root_path FROM repository').get().root_path;
  let changed = false;
  const budget = new HistoryReadBudget(historyLimits);
  const captured = api.captureRepositoryCompilationInputs(f.store, budget, () => {
    if (!changed && f.db.isTransaction && budget.rows > 20) {
      // Existing bounded readers have pinned their view before the independent writer.
      writer.prepare('UPDATE repository SET root_path=?').run(original + '-moved');
      changed = true;
    }
    return undefined;
  });
  assert.equal(changed, true);
  assert.equal(captured.view.rootPath, original);
  assert.equal(f.db.isTransaction, false);
  assert.throws(() =>
    api.recheckRepositoryCompilationInputs(
      f.store,
      captured.handle,
      new HistoryReadBudget(historyLimits),
      check,
    ),
  );
  api.releaseRepositoryCompilationInputs(f.store, captured.handle);
});
test('strict controls and cumulative budgets reject entire read and settle transactions', async (t) => {
  const f = await fixture(t);
  for (const control of [
    async () => undefined,
    new Proxy(check, {}),
    () => true,
    () => Promise.resolve(),
    () => {
      throw Error('private text');
    },
  ]) {
    assert.throws(
      () =>
        api.captureRepositoryCompilationInputs(
          f.store,
          new HistoryReadBudget(historyLimits),
          control,
        ),
      /CONTEXT_UNAVAILABLE/,
    );
    assert.equal(f.db.isTransaction, false);
  }
  for (const limits of [
    { ...historyLimits, maxRows: 1 },
    { ...historyLimits, maxSerializedBytes: 1 },
    { ...historyLimits, memoryBudgetBytes: 1 },
  ]) {
    assert.throws(() =>
      api.captureRepositoryCompilationInputs(f.store, new HistoryReadBudget(limits), check),
    );
    assert.equal(f.db.isTransaction, false);
  }
  let calls = 0;
  assert.throws(() =>
    api.captureRepositoryCompilationInputs(f.store, new HistoryReadBudget(historyLimits), () => {
      if (++calls > 30) throw Error();
      return undefined;
    }),
  );
  assert.ok(calls > 30);
  assert.equal(f.db.isTransaction, false);
  f.db.exec('BEGIN');
  assert.throws(() =>
    api.captureRepositoryCompilationInputs(f.store, new HistoryReadBudget(historyLimits), check),
  );
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
});
test('capture rejects corrupted Code/Evidence membership without Runtime', async (t) => {
  const f = await fixture(t);
  f.db.prepare('DELETE FROM fact_evidence').run();
  assert.throws(() =>
    api.captureRepositoryCompilationInputs(f.store, new HistoryReadBudget(historyLimits), check),
  );
  assert.equal(f.db.isTransaction, false);
});
test('handles reject closed/reopened connections while release still settles once', async (t) => {
  const f = await fixture(t),
    { handle } = api.captureRepositoryCompilationInputs(
      f.store,
      new HistoryReadBudget(historyLimits),
      check,
    );
  f.db.close();
  assert.throws(() => api.repositoryCompilationWorkspaceSnapshot(f.store, handle));
  f.db.open();
  assert.throws(() => api.repositoryCompilationWorkspaceSnapshot(f.store, handle));
  assert.throws(() =>
    api.recheckRepositoryCompilationInputs(
      f.store,
      handle,
      new HistoryReadBudget(historyLimits),
      check,
    ),
  );
  api.releaseRepositoryCompilationInputs(f.store, handle);
  assert.throws(() => api.releaseRepositoryCompilationInputs(f.store, handle));
});

test('mid-read connection reincarnation and cancellation cannot yield a capture', async (t) => {
  const f = await fixture(t),
    budget = new HistoryReadBudget(historyLimits);
  let moved = false;
  assert.throws(() =>
    api.captureRepositoryCompilationInputs(f.store, budget, () => {
      if (!moved && f.db.isTransaction && budget.rows > 20) {
        moved = true;
        f.db.close();
        f.db.open();
      }
      return undefined;
    }),
  );
  assert.equal(moved, true);
  assert.equal(f.db.isTransaction, false);
});

for (const corruption of [
  'value_digest',
  'candidate_digest',
  'unknown_format',
  'resealed_candidate',
]) {
  test('Runtime integrity refuses ' + corruption + ' with no partial capture', async (t) => {
    const f = await fixture(t),
      current = f.store.readRuntimeBasis(historyLimits);
    f.store.applyRuntimeBatch(
      { expected: current.identity, candidate: emptyCandidate(current.identity.codeBasis) },
      historyLimits,
    );
    // Corruption is confined to this disposable owned fixture, never a production mutation.
    f.db.exec('DROP TRIGGER r012_immutable_runtime_activations_update');
    if (corruption === 'value_digest' || corruption === 'candidate_digest')
      f.db.prepare('UPDATE runtime_activations SET ' + corruption + '=?').run('0'.repeat(64));
    else {
      const { createHash } = await import('node:crypto');
      const row = f.db.prepare('SELECT payload_json FROM runtime_activations').get();
      const payload = JSON.parse(row.payload_json);
      if (corruption === 'unknown_format') payload.formatVersion = 999;
      else payload.candidate.coverage.limitations.push('tampered');
      const raw = JSON.stringify(payload),
        digest = createHash('sha256')
          .update('runtime-storage-value-v1\0' + raw)
          .digest('hex');
      f.db
        .prepare('UPDATE runtime_activations SET payload_json=?, value_digest=?')
        .run(raw, digest);
    }
    assert.throws(() =>
      api.captureRepositoryCompilationInputs(f.store, new HistoryReadBudget(historyLimits), check),
    );
    assert.equal(f.db.isTransaction, false);
  });
}

test('format2 activation retains exact derivation validation and original value digest', async (t) => {
  const f = await historyFixture(t, 'available');
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new api.RuntimeFactStore(f.db, f.input.repositoryId),
    current = store.readRuntimeBasis(historyLimits);
  const { runtimeSitePlanDigest } = await import('@codeatlas/ir');
  const sitePlan = {
    basis: current.identity.codeBasis,
    syntaxMembershipDigest: current.identity.syntaxMembershipDigest,
    entries: [],
  };
  const candidate = {
    ...emptyCandidate(current.identity.codeBasis),
    derivation: {
      syntaxContract: 'SYNTAX_BINDING_V4',
      rulesVersion: 'framework-rules-v2',
      coverageVersion: 'framework-coverage-v2',
      graphPolicy: 'LOCAL_DECLARED_RUNTIME_V2',
      sitePlan,
      sitePlanDigest: runtimeSitePlanDigest(sitePlan),
    },
  };
  store.applyRuntimeBatchV2({ expected: current.identity, candidate }, historyLimits);
  const captured = api.captureRepositoryCompilationInputs(
    store,
    new HistoryReadBudget(historyLimits),
    check,
  );
  assert.deepEqual(captured.view.runtimeActivation.candidate, candidate);
  assert.equal(
    captured.view.runtimeActivation.valueDigest,
    f.db.prepare('SELECT value_digest FROM runtime_activations').get().value_digest,
  );
  api.recheckRepositoryCompilationInputs(
    store,
    captured.handle,
    new HistoryReadBudget(historyLimits),
    check,
  );
  api.releaseRepositoryCompilationInputs(store, captured.handle);
});

test('promise-returning sync control settles rejected native promises', async (t) => {
  const f = await fixture(t);
  assert.throws(
    () =>
      api.captureRepositoryCompilationInputs(f.store, new HistoryReadBudget(historyLimits), () =>
        Promise.reject(Error('private')),
      ),
    /CONTEXT_UNAVAILABLE/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.db.isTransaction, false);
});
test('reopened connection caller transaction is never rolled back by old capture owner', async (t) => {
  const f = await fixture(t),
    budget = new HistoryReadBudget(historyLimits);
  let moved = false;
  assert.throws(
    () =>
      api.captureRepositoryCompilationInputs(f.store, budget, () => {
        if (!moved && f.db.isTransaction && budget.rows > 20) {
          moved = true;
          f.db.close();
          f.db.open();
          f.db.exec('BEGIN');
        }
        return undefined;
      }),
    /CONTEXT_UNAVAILABLE/,
  );
  assert.equal(moved, true);
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
});
