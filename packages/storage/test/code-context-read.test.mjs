import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cases, captureFixture } from './helpers/code-context-capture-fixture.mjs';
import { historyFixture, historyLimits } from './helpers/r011-history-fixture.mjs';
test('private read exposes original view and consumed receipt', async (t) => {
  const { readCodeContextSnapshot } = await import('../dist/analysis/code-context-read.js');
  const f = await captureFixture(t, 'complete');
  const r = readCodeContextSnapshot(f.db, f.sample.repository.id, f.limits, { schemaVersion: 10 });
  assert.deepEqual(r.view, f.expected);
  assert.equal(r.consumed.rows, f.limits.maxRows);
  assert.equal(r.consumed.serializedBytes, f.limits.maxSerializedBytes);
  assert.equal(r.consumed.items, 0);
  assert.ok(r.retainedLogicalBytes > 0);
  assert.equal(Object.isFrozen(r.view), true);
  assert.equal('handle' in r, false);
});
for (const c of cases)
  test('unchanged R010 literal and boundaries ' + c.id, async (t) => {
    const { readCodeContextSnapshot } = await import('../dist/analysis/code-context-read.js');
    const f = await captureFixture(t, c.id),
      r = readCodeContextSnapshot(f.db, c.repository.id, f.limits, { schemaVersion: 10 });
    assert.deepEqual(r.view, f.expected);
    for (const key of ['maxRows', 'maxSerializedBytes', 'memoryBudgetBytes'])
      assert.throws(
        () =>
          readCodeContextSnapshot(
            f.db,
            c.repository.id,
            { ...f.limits, [key]: f.limits[key] - 1 },
            { schemaVersion: 10 },
          ),
        (e) => e.code === 'CODE_CAPTURE_LIMIT_EXCEEDED',
      );
  });
test('fixed schema10 rejects11 while schema11 read remains data only', async (t) => {
  const { readCodeContextSnapshot } = await import('../dist/analysis/code-context-read.js'),
    f = await historyFixture(t);
  const limits = {
    maxRows: historyLimits.maxRows,
    maxSerializedBytes: historyLimits.maxSerializedBytes,
    memoryBudgetBytes: historyLimits.memoryBudgetBytes,
  };
  assert.throws(
    () => readCodeContextSnapshot(f.db, f.input.repositoryId, limits, { schemaVersion: 10 }),
    (e) => e.code === 'CODE_CAPTURE_UNAVAILABLE',
  );
  const r = readCodeContextSnapshot(f.db, f.input.repositoryId, limits, {
    schemaVersion: 11,
    maxItems: historyLimits.maxItems,
    maxDepth: historyLimits.maxDepth,
  });
  assert.deepEqual(r.view.activeBasis, f.expected.activeBasis);
  assert.equal(r.view.historicalSourceProof, 'UNAVAILABLE');
  assert.ok(r.consumed.items > 0);
  assert.equal('handle' in r, false);
});
test('schema11 returns bounded decoded records for exact persisted membership checks', async (t) => {
  const { readCodeContextSnapshot } = await import('../dist/analysis/code-context-read.js'),
    f = await historyFixture(t);
  const r = readCodeContextSnapshot(
    f.db,
    f.input.repositoryId,
    {
      maxRows: historyLimits.maxRows,
      maxSerializedBytes: historyLimits.maxSerializedBytes,
      memoryBudgetBytes: historyLimits.memoryBudgetBytes,
    },
    { schemaVersion: 11, maxItems: historyLimits.maxItems, maxDepth: historyLimits.maxDepth },
  );
  assert.deepEqual(r.entries?.NODE, f.expected.history.state.nodes);
  assert.deepEqual(r.entries?.SOURCE_FILE, f.expected.targetInventory);
  assert.deepEqual(r.entries?.PROVIDER_SNAPSHOT[0].id, f.expected.history.state.snapshots[0].id);
  assert.equal(Object.isFrozen(r.entries), true);
});
test('schema11 rejects SQLite malformed UTF8 before trusting byte census', async (t) => {
  const { readCodeContextSnapshot } = await import('../dist/analysis/code-context-read.js'),
    f = await historyFixture(t);
  f.db.exec("UPDATE repository SET root_path=CAST(X'80' AS TEXT)");
  assert.throws(
    () =>
      readCodeContextSnapshot(f.db, f.input.repositoryId, historyLimits, {
        schemaVersion: 11,
        maxItems: historyLimits.maxItems,
        maxDepth: historyLimits.maxDepth,
      }),
    (e) => e.code === 'INVALID_CODE_CAPTURE',
  );
});
