import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { setup } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import {
  openR010FixtureDatabase,
  historyLimits,
} from '../../storage/test/helpers/r011-history-fixture.mjs';
import * as prep from '../dist/mixed-source-preparation.js';
const operationBudget = {
  maxInputBytes: Number.MAX_SAFE_INTEGER,
  maxOutputBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  maxMemoryBytes: Number.MAX_SAFE_INTEGER,
  maxDurationMs: Math.floor(Number.MAX_SAFE_INTEGER / 2),
};
const policy = () => ({
  operation: 'INDEX',
  phase: 'PRIMARY',
  scope: { workspaceId: 'workspace:a2', repositoryId: 'repo:a2' },
  callerCapabilities: ['INDEX', 'READ_SOURCE'],
  permissionContext: {
    workspaceId: 'workspace:a2',
    repositoryIds: ['repo:a2'],
    allowedOperations: ['INDEX', 'READ_SOURCE'],
  },
  source: {
    path: null,
    classification: 'INTERNAL',
    form: 'DERIVED',
    secretDetected: false,
    policyBlocked: false,
    derivedAccessAllowed: true,
  },
  destination: 'LOCAL',
  settings: {
    localOnly: true,
    remoteLlmEnabled: false,
    remoteEmbeddingEnabled: false,
    allowRemoteFallback: false,
    allowSensitiveRemote: false,
    allowRawSourceRemote: false,
  },
});
async function base(t) {
  const f = await setup(t),
    db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  return {
    ...f,
    db,
    input: {
      request: f.request,
      policy: policy(),
      database: db.database,
      repository: { id: 'repo:a2', rootPath: f.root },
      operationBudget,
      limits: historyLimits,
      control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
    },
  };
}
test('A4 private bounded Source preparation commits and charges recheck on one account', async (t) => {
  const f = await base(t),
    p = await prep.prepareBudgetedMixedSourceOperation(f.input);
  assert.equal(p.effects.sourceCommit, 'COMMITTED');
  const before = p.budget.rows;
  await p.verifySelection();
  assert.ok(p.budget.rows > before);
  assert.deepEqual(f.db.sourceState.load('repo:a2'), p.state);
  assert.equal((await import('../dist/index.js')).prepareBudgetedMixedSourceOperation, undefined);
});
for (const [key, cap] of [
  ['maxItems', 'maxItems'],
  ['maxDepth', 'maxDepth'],
  ['memoryBudgetBytes', 'maxMemoryBytes'],
])
  test('A4 global ' + cap + ' cap refuses before SQL/Source', async (t) => {
    const f = await base(t);
    let queries = 0;
    const original = f.db.database.prepare.bind(f.db.database);
    f.db.database.prepare = (sql) => {
      queries++;
      return original(sql);
    };
    await assert.rejects(
      prep.prepareBudgetedMixedSourceOperation({
        ...f.input,
        operationBudget: { ...operationBudget, [cap]: 1 },
      }),
    );
    assert.equal(queries, 0);
    assert.equal(f.state.calls, 0);
  });
for (const kind of [
  'overflow',
  'invalid',
  'rows',
  'input',
  'cancel',
  'ambient',
  'root',
  'id',
  'permission',
])
  test('A4 bounded preparation ' + kind + ' retains honest failure effects', async (t) => {
    const f = await base(t),
      v = { ...f.input };
    if (kind === 'overflow')
      v.operationBudget = { ...operationBudget, maxDurationMs: Number.MAX_SAFE_INTEGER };
    if (kind === 'invalid') v.operationBudget = { ...operationBudget, maxItems: 0 };
    if (kind === 'rows') v.limits = { ...historyLimits, maxRows: 1 };
    if (kind === 'input') v.operationBudget = { ...operationBudget, maxInputBytes: 1 };
    if (kind === 'cancel') f.controller.abort();
    if (kind === 'ambient') f.db.database.exec('BEGIN');
    if (kind === 'root') v.repository = { ...v.repository, rootPath: path.join(f.root, 'foreign') };
    if (kind === 'id') v.repository = { ...v.repository, id: 'repository:foreign' };
    if (kind === 'permission') v.policy = { ...policy(), callerCapabilities: [] };
    await assert.rejects(prep.prepareBudgetedMixedSourceOperation(v));
    if (kind === 'ambient') {
      assert.equal(f.db.database.isTransaction, true);
      f.db.database.exec('ROLLBACK');
    }
    assert.equal(f.db.sourceState.load('repo:a2'), null);
    if (kind !== 'input') assert.equal(f.state.calls, 0);
  });
test('A4 independent SQL/serialization domains do not become operation input/item caps', async (t) => {
  const f = await base(t),
    p = await prep.prepareBudgetedMixedSourceOperation({
      ...f.input,
      operationBudget: { ...operationBudget, maxInputBytes: Number.MAX_SAFE_INTEGER - 1 },
    });
  assert.equal(p.budget.limits.maxRows, historyLimits.maxRows);
  assert.equal(p.budget.limits.maxSerializedBytes, historyLimits.maxSerializedBytes);
  p.account.invalidate();
});

test('A4 operation duration tightens caller deadline before later SQL delivery', async (t) => {
  const f = await base(t),
    originalNow = Date.now,
    originalPrepare = f.db.database.prepare.bind(f.db.database);
  const start = originalNow();
  let clock = start;
  Date.now = () => clock;
  f.db.database.prepare = (sql) => {
    clock = start + 1;
    return originalPrepare(sql);
  };
  try {
    await assert.rejects(
      prep.prepareBudgetedMixedSourceOperation({
        ...f.input,
        control: { ...f.input.control, deadlineEpochMs: start + 60000 },
        operationBudget: { ...operationBudget, maxDurationMs: 1 },
      }),
      (e) => e.code === 'DEADLINE_EXCEEDED' && e.effects.sourceCommit === 'NOT_ATTEMPTED',
    );
    assert.equal(f.state.calls, 0);
  } finally {
    Date.now = originalNow;
  }
});
