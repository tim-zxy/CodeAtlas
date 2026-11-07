import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { historyFixture, historyLimits, prefixPlan } from './helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
const api = async () => {
  const u = new URL('../dist/runtime/runtime-fact-store.js', import.meta.url);
  assert.ok(existsSync(u), 'Runtime Store implementation must exist');
  return import(u.href);
};
const candidate = (basis) => ({
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
test('Runtime Store authenticates current inputs, publishes atomically, reopens and reports stale last-good', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId),
    capture = store.readRuntimeBasis(historyLimits);
  assert.equal(capture.status, 'AVAILABLE');
  assert.equal(capture.runtimeActivationId, null);
  const input = { expected: capture.identity, candidate: candidate(capture.identity.codeBasis) };
  const out = store.applyRuntimeBatch(input, historyLimits);
  assert.equal(out.status, 'COMMITTED');
  assert.ok(out.activationId.startsWith('runtime-activation:'));
  const view = store.traceRuntime(historyLimits);
  assert.equal(view.status, 'CURRENT');
  assert.deepEqual(view.candidate, input.candidate);
  const ro = new RuntimeFactStore(f.reopen(true), f.input.repositoryId);
  assert.deepEqual(ro.traceRuntime(historyLimits), view);
  assert.throws(() => store.applyRuntimeBatch(input, historyLimits), /RUNTIME_INPUT_CHANGED/);
  assert.equal(store.traceRuntime(historyLimits).activationId, out.activationId);
  f.db
    .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
    .run(f.input.repositoryId);
  const stale = store.traceRuntime(historyLimits);
  assert.equal(stale.status, 'AFFECTED');
  assert.equal(stale.activationId, out.activationId);
  assert.deepEqual(stale.candidate, input.candidate);
});
test('Runtime Store rejects partial, wrong current Syntax and over-budget before publication', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId),
    c = store.readRuntimeBasis(historyLimits),
    input = { expected: c.identity, candidate: candidate(c.identity.codeBasis) };
  const partial = structuredClone(input);
  partial.candidate.coverage = { status: 'PARTIAL', limitations: ['UNPROVED'], unverifiedRefs: [] };
  assert.throws(() => store.applyRuntimeBatch(partial, historyLimits), /RUNTIME_PARTIAL/);
  const changed = structuredClone(input);
  changed.expected.syntaxMembershipDigest = '0'.repeat(64);
  assert.throws(() => store.applyRuntimeBatch(changed, historyLimits), /RUNTIME_INPUT_CHANGED/);
  assert.throws(() => store.applyRuntimeBatch(input, { ...historyLimits, maxRows: 1 }));
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_activations').get().n, 0);
  assert.equal(store.traceRuntime(historyLimits).status, 'NOT_AVAILABLE');
  assert.deepEqual(store.applyRuntimeBatch(input, historyLimits).status, 'COMMITTED');
});

test('joint Syntax and Runtime uses the genuine Stage lease and one transaction', async (t) => {
  const { RuntimeFactStore } = await api();
  const { observationFixture } = await import('./helpers/mixed-analysis-fixture.mjs');
  const { freezeOnConnection } = await import('./helpers/mixed-analysis-store-fixture.mjs');
  const { captureRuntimeActivationContext } =
    await import('../dist/analysis/activation-history.js');
  const { MixedAnalysisStore } = await import('../dist/analysis/mixed-analysis-store.js');
  const f = await observationFixture(t, 'mixed');
  applyMigrationPlan(f.db, await prefixPlan(13));
  assert.equal(typeof captureRuntimeActivationContext, 'function');
  const frozen = freezeOnConnection(f.db, 'mixed', captureRuntimeActivationContext);
  const store = new MixedAnalysisStore(f.db);
  assert.equal(typeof store.applyWithRuntime, 'function');
  const out = store.applyWithRuntime(
    frozen.token.lease,
    historyLimits,
    candidate(frozen.token.basis),
    null,
  );
  assert.ok(out.syntaxActivationId.startsWith('activation:'));
  assert.ok(out.runtimeActivationId.startsWith('runtime-activation:'));
  const view = new RuntimeFactStore(f.db, f.input.repositoryId).traceRuntime(historyLimits);
  assert.equal(view.status, 'CURRENT');
  assert.equal(view.identity.syntaxActivationId, out.syntaxActivationId);
  assert.throws(() =>
    store.applyWithRuntime(frozen.token.lease, historyLimits, candidate(frozen.token.basis), null),
  );
  frozen.stage.close();
});

test('nonempty Runtime preserves exact graph/Flow and authenticated historical Source/Code supports', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId),
    cap = store.readRuntimeBasis(historyLimits),
    basis = cap.identity.codeBasis,
    x = candidate(basis),
    p = x.facts.payload;
  const { createHash } = await import('node:crypto');
  const canon = (v) =>
    Array.isArray(v)
      ? '[' + v.map(canon).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + canon(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v);
  const source = f.expected.targetInventory[0],
    owner = f.expected.history.state.nodes[0];
  const support = (kind, v) => ({
    basis,
    entity: { kind, id: v.id, revisionId: basis.revisionId },
    valueDigest: createHash('sha256')
      .update('codeatlas-phase1-support-value-v1\0' + canon(v))
      .digest('hex'),
  });
  p.supportInventory = [support('SOURCE_FILE', source), support('CODE_NODE', owner)];
  const ref = (kind, id) => ({
    scope: 'REPOSITORY',
    repositoryId: basis.repositoryId,
    entity: { kind, id, revisionId: basis.revisionId },
  });
  p.externalRefs = [ref('SOURCE_FILE', source.id), ref('CODE_NODE', owner.id)];
  const base = (id) => ({
    id,
    factKey: id + '-key',
    repositoryId: basis.repositoryId,
    revisionId: basis.revisionId,
    basis,
    sourceRange: null,
    supportRefs: p.supportInventory,
    confidence: { score: 0.5, method: 'runtime-execution-declaration-v1', reasons: ['DECLARED'] },
    resolution: 'HEURISTIC',
  });
  p.entryPoints = [
    {
      ...base('entry:one'),
      triggerKind: 'MANUAL',
      ownerRef: ref('CODE_NODE', owner.id),
      contextKind: 'REQUEST',
      contractRef: null,
      taskRef: null,
    },
  ];
  p.contexts = [
    {
      ...base('context:one'),
      kind: 'REQUEST',
      entryRef: ref('ENTRY_POINT', 'entry:one'),
      parentContextRef: null,
    },
  ];
  p.nodes = [
    {
      ...base('node:one'),
      contextRef: ref('EXECUTION_CONTEXT', 'context:one'),
      kind: 'ENTRY',
      targetRef: ref('ENTRY_POINT', 'entry:one'),
    },
  ];
  p.flows = [
    {
      ...base('flow:one'),
      entryRef: ref('ENTRY_POINT', 'entry:one'),
      derivationVersion: 'runtime-flow-v2',
      contexts: [ref('EXECUTION_CONTEXT', 'context:one')],
      steps: [
        {
          stepKey: 'step:one',
          ordinal: 0,
          contextRef: ref('EXECUTION_CONTEXT', 'context:one'),
          executionNodeRefs: [ref('EXECUTION_NODE', 'node:one')],
          incomingEdgeRefs: [],
          outgoingStepKeys: [],
          supportRefs: p.supportInventory,
        },
      ],
      branches: [],
      boundaries: [],
      coverage: x.coverage,
    },
  ];
  const forged = structuredClone(x);
  forged.facts.payload.supportInventory[0].valueDigest = '0'.repeat(64);
  assert.throws(() =>
    store.applyRuntimeBatch({ expected: cap.identity, candidate: forged }, historyLimits),
  );
  const out = store.applyRuntimeBatch({ expected: cap.identity, candidate: x }, historyLimits);
  assert.equal(out.status, 'COMMITTED');
  assert.deepEqual(store.traceRuntime(historyLimits).candidate, x);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_support_membership').get().n, 2);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_flow_steps').get().n, 1);
  f.db
    .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
    .run(f.input.repositoryId);
  assert.deepEqual(store.traceRuntime(historyLimits).candidate, x);
});
test('joint Runtime SQL failure rolls back Syntax and Source and revokes the consumed lease', async (t) => {
  await api();
  const { constants } = await import('node:sqlite');
  const { observationFixture } = await import('./helpers/mixed-analysis-fixture.mjs');
  const { freezeOnConnection, allRows } =
    await import('./helpers/mixed-analysis-store-fixture.mjs');
  const { captureRuntimeActivationContext } =
    await import('../dist/analysis/activation-history.js');
  const { MixedAnalysisStore } = await import('../dist/analysis/mixed-analysis-store.js');
  const f = await observationFixture(t, 'mixed');
  applyMigrationPlan(f.db, await prefixPlan(13));
  const before = allRows(f.db),
    frozen = freezeOnConnection(f.db, 'mixed', captureRuntimeActivationContext),
    store = new MixedAnalysisStore(f.db);
  f.db.setAuthorizer((action, table) =>
    action === constants.SQLITE_INSERT && table === 'runtime_activations'
      ? constants.SQLITE_DENY
      : constants.SQLITE_OK,
  );
  assert.throws(() =>
    store.applyWithRuntime(frozen.token.lease, historyLimits, candidate(frozen.token.basis), null),
  );
  f.db.setAuthorizer(null);
  assert.deepEqual(allRows(f.db), before);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_activations').get().n, 0);
  assert.throws(() =>
    store.applyWithRuntime(frozen.token.lease, historyLimits, candidate(frozen.token.basis), null),
  );
  frozen.stage.close();
});
test('post-COMMIT output error retains unknown identity and is resolved by a fresh read-only recovery', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId),
    c = store.readRuntimeBasis(historyLimits),
    exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    exec(sql);
    if (sql === 'COMMIT') throw Error('POST_COMMIT_OUTPUT');
  };
  try {
    assert.throws(
      () =>
        store.applyRuntimeBatch(
          { expected: c.identity, candidate: candidate(c.identity.codeBasis) },
          historyLimits,
        ),
      /POST_COMMIT_OUTPUT/,
    );
  } finally {
    f.db.exec = exec;
  }
  const result = store.settlement();
  assert.equal(result.status, 'COMMIT_OUTCOME_UNKNOWN');
  assert.ok(result.activationId);
  assert.equal(typeof store.inspectOutcome, 'function');
  const recovery = store.inspectOutcome(historyLimits);
  assert.equal(recovery.status, 'COMMITTED');
  assert.equal(recovery.activationId, result.activationId);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_activations').get().n, 1);
});

test('unchanged Code basis cannot reuse Runtime after a declared full-history recovery changes Syntax activation', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId),
    before = store.readRuntimeBasis(historyLimits),
    value = candidate(before.identity.codeBasis);
  const first = store.applyRuntimeBatch(
    { expected: before.identity, candidate: value },
    historyLimits,
  );
  const old = store.readRuntimeBasis(historyLimits),
    m = structuredClone(f.expected.history);
  m.parent = {
    activationId: old.identity.syntaxActivationId,
    repositoryId: f.input.repositoryId,
    revisionId: old.identity.codeBasis.revisionId,
  };
  const { referenceCanonical } = await import('./helpers/r011-history-fixture.mjs'),
    { createHash } = await import('node:crypto');
  const json = referenceCanonical(m),
    digest = createHash('sha256')
      .update('codeatlas-activation-history-v1\0' + json)
      .digest('hex'),
    next = 'activation:' + digest;
  // Owned declaration fixture: accurate-parent full recovery after pointer loss.
  // This does not claim a new producer Syntax record, Source run, or a reusable Stage lease.
  f.db.exec('BEGIN');
  f.db
    .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
    .run(f.input.repositoryId);
  f.db
    .prepare(
      'INSERT INTO activation_history(id,repository_id,revision_id,parent_id,manifest_digest,manifest_json)VALUES(?,?,?,?,?,?)',
    )
    .run(next, f.input.repositoryId, m.state.basis.revisionId, m.parent.activationId, digest, json);
  f.db
    .prepare('INSERT INTO active_history_pointer(repository_id,activation_id)VALUES(?,?)')
    .run(f.input.repositoryId, next);
  f.db.exec('COMMIT');
  const fresh = store.readRuntimeBasis(historyLimits);
  assert.deepEqual(fresh.identity.codeBasis, old.identity.codeBasis);
  assert.notEqual(fresh.identity.syntaxActivationId, old.identity.syntaxActivationId);
  assert.equal(store.traceRuntime(historyLimits).status, 'AFFECTED');
  assert.throws(
    () => store.applyRuntimeBatch({ expected: old.identity, candidate: value }, historyLimits),
    /RUNTIME_INPUT_CHANGED/,
  );
  const second = store.applyRuntimeBatch(
    { expected: fresh.identity, candidate: value },
    historyLimits,
  );
  assert.equal(second.status, 'COMMITTED');
  assert.notEqual(second.activationId, first.activationId);
  assert.equal(store.traceRuntime(historyLimits).status, 'CURRENT');
});

test('framework inputs are authenticated current SQLite values and reject stale identity or old Syntax', async (t) => {
  const { RuntimeFactStore } = await api();
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId);
  const expected = store.readRuntimeBasis(historyLimits).identity;
  assert.equal(typeof store.readFrameworkInputs, 'function');
  const inputs = store.readFrameworkInputs(expected, historyLimits);
  assert.deepEqual(inputs.basis, expected.codeBasis);
  assert.deepEqual(inputs.nodes, f.expected.history.state.nodes);
  assert.deepEqual(inputs.sourceFiles, f.expected.targetInventory);
  assert.deepEqual(inputs.syntaxEvidence, []);
  assert(inputs.supportInventory.some((s) => s.entity.kind === 'CODE_NODE'));
  assert(inputs.providerCapabilities.includes('SYMBOL'));
  assert.throws(
    () =>
      store.readFrameworkInputs(
        { ...expected, syntaxMembershipDigest: '0'.repeat(64) },
        historyLimits,
      ),
    /RUNTIME_INPUT_CHANGED/,
  );
  assert.throws(() => store.readFrameworkInputs(expected, { ...historyLimits, maxRows: 1 }));
  const old = await historyFixture(t, 'syntax-ancestor');
  applyMigrationPlan(old.db, await prefixPlan(13));
  const oldStore = new RuntimeFactStore(old.db, old.input.repositoryId);
  const oldBasis = oldStore.readRuntimeBasis(historyLimits).identity;
  assert.throws(
    () => oldStore.readFrameworkInputs(oldBasis, historyLimits),
    /RUNTIME_SYNTAX_VERSION_NOT_SUPPORTED/,
  );
});

for (const format of [1, 2])
  test('empty Runtime trace format' + format + ' refuses unknown repository schema', async (t) => {
    const { RuntimeFactStore } = await api(),
      f = await historyFixture(t);
    applyMigrationPlan(f.db, await prefixPlan(13));
    const store = new RuntimeFactStore(f.db, f.input.repositoryId);
    f.db.exec('PRAGMA user_version=14');
    const trace = () =>
      format === 1 ? store.traceRuntime(historyLimits) : store.traceRuntimeV2(historyLimits);
    assert.throws(trace, (error) => error.code === 'CONTEXT_UNAVAILABLE');
    assert.equal(f.db.isTransaction, false);
    assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_state').get().n, 0);
  });

test('Runtime committed recovery checks schema in its fresh view without erasing commit fact', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId);
  const expected = store.readRuntimeBasis(historyLimits).identity;
  const result = store.applyRuntimeBatch(
    { expected, candidate: candidate(expected.codeBasis) },
    historyLimits,
  );
  const prepare = DatabaseSync.prototype.prepare,
    headers = [];
  DatabaseSync.prototype.prepare = function (sql) {
    if (/pragma_(?:user_version|encoding)/.test(sql))
      headers.push({ own: this !== f.db, transaction: this.isTransaction, sql });
    return Reflect.apply(prepare, this, [sql]);
  };
  try {
    assert.equal(store.inspectOutcome(historyLimits).activationId, result.activationId);
  } finally {
    DatabaseSync.prototype.prepare = prepare;
  }
  assert.ok(headers.some((row) => /pragma_user_version/.test(row.sql)));
  assert.ok(headers.some((row) => /pragma_encoding/.test(row.sql)));
  assert.ok(headers.every((row) => row.own && row.transaction));
  f.db.exec('PRAGMA user_version=14');
  assert.throws(
    () => store.inspectOutcome(historyLimits),
    (error) => error.code === 'CONTEXT_UNAVAILABLE',
  );
  assert.equal(store.settlement().status, 'COMMITTED');
  assert.equal(store.settlement().activationId, result.activationId);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_activations').get().n, 1);
  assert.equal(f.db.isTransaction, false);
});

test('empty Runtime trace charges header admission before any stored body', async (t) => {
  const { RuntimeFactStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId);
  const prepare = f.db.prepare.bind(f.db),
    queries = [];
  f.db.prepare = (sql) => {
    queries.push({ sql, transaction: f.db.isTransaction });
    return prepare(sql);
  };
  try {
    assert.throws(
      () => store.traceRuntime({ ...historyLimits, maxRows: 1 }),
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

test('Runtime empty trace refuses a genuine schema13 database with non-UTF8 encoding', async (t) => {
  const { RuntimeFactStore } = await api();
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => db.close());
  db.exec("PRAGMA encoding='UTF-16le'");
  applyMigrationPlan(db, await prefixPlan(13));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 13);
  assert.equal(db.prepare('PRAGMA encoding').get().encoding, 'UTF-16le');
  const store = new RuntimeFactStore(db, 'repo:owned');
  assert.throws(
    () => store.traceRuntime(historyLimits),
    (error) => error.code === 'CONTEXT_UNAVAILABLE',
  );
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare('SELECT count(*) n FROM runtime_state').get().n, 0);
});
