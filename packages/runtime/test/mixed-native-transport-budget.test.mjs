import test from 'node:test';
import assert from 'node:assert/strict';
import { withMixedNativeTransportBudget } from '../src/mixed-native-transport-budget.ts';
import { HistoryReadBudget } from '../../storage/dist/analysis/activation-history-format.js';
import { spendCodeSyntaxBudget } from '../../providers/dist/native-code-syntax-budget.js';
import { readFrameworkSurfaceRequestSnapshotWithBudget } from '../../providers/dist/native-framework-surface-stream.js';
import { readSurfaceCapture } from '../../../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';

const limits = {
  maxRows: 100,
  maxSerializedBytes: 1000,
  maxItems: 1000,
  maxDepth: 40,
  memoryBudgetBytes: 2000,
};
function budget(changes = {}) {
  return new HistoryReadBudget({ ...limits, ...changes });
}

test('bridge carries existing counters and exact remaining memory/serialized caps', async () => {
  const b = budget();
  b.add('rows', 2);
  b.add('serializedBytes', 20);
  b.add('items', 3);
  b.pin(50);
  const result = await withMixedNativeTransportBudget(b, async (ledger) => {
    assert.deepEqual(ledger, {
      limits: { maxSerializedBytes: 970, maxItems: 1000, maxDepth: 40 },
      budget: { serializedBytes: 20, items: 3 },
    });
    await Promise.resolve();
    spendCodeSyntaxBudget(ledger, 'serializedBytes', 7);
    spendCodeSyntaxBudget(ledger, 'items', 5);
    return 'owned result';
  });
  assert.equal(result, 'owned result');
  assert.deepEqual([b.rows, b.serializedBytes, b.items, b.retainedLogicalBytes], [2, 27, 8, 57]);
});

test('serialized remaining can be the smaller cap and exact boundary charges once', async () => {
  const b = budget({ maxSerializedBytes: 30 });
  b.add('serializedBytes', 20);
  await withMixedNativeTransportBudget(b, async (ledger) => {
    assert.equal(ledger.limits.maxSerializedBytes, 30);
    spendCodeSyntaxBudget(ledger, 'serializedBytes', 10);
  });
  assert.equal(b.serializedBytes, 30);
  assert.equal(b.retainedLogicalBytes, 10);
});

for (const asynchronous of [false, true])
  test(`bridge preserves actual charges and original ${asynchronous ? 'async' : 'sync'} failure`, async () => {
    const b = budget(),
      marker = Object.assign(Error('original failure'), { cleanupState: 'UNKNOWN' });
    const action = (ledger) => {
      spendCodeSyntaxBudget(ledger, 'serializedBytes', 9);
      spendCodeSyntaxBudget(ledger, 'items', 4);
      if (asynchronous) return Promise.reject(marker);
      throw marker;
    };
    await assert.rejects(withMixedNativeTransportBudget(b, action), (e) => e === marker);
    assert.deepEqual([b.serializedBytes, b.items, b.retainedLogicalBytes], [9, 4, 9]);
  });

test('failed spend retains earlier bytes/items without charging rejected amount', async () => {
  const b = budget({ maxSerializedBytes: 10 });
  await assert.rejects(
    withMixedNativeTransportBudget(b, async (ledger) => {
      spendCodeSyntaxBudget(ledger, 'serializedBytes', 3);
      spendCodeSyntaxBudget(ledger, 'items', 2);
      spendCodeSyntaxBudget(ledger, 'serializedBytes', 8);
    }),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.deepEqual([b.serializedBytes, b.items, b.retainedLogicalBytes], [3, 2, 3]);
});

for (const changes of [{ maxSerializedBytes: 1 }, { memoryBudgetBytes: 1 }])
  test('exhausted/zero bridge cap refuses before action: ' + JSON.stringify(changes), async () => {
    const b = budget(changes);
    if (changes.maxSerializedBytes) b.add('serializedBytes', 1);
    let entered = false;
    await assert.rejects(
      withMixedNativeTransportBudget(b, async () => {
        entered = true;
      }),
      (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
    );
    assert.equal(entered, false);
  });

test('real wire8 decoder refusal imports actual parser charges', async () => {
  const b = budget({ maxSerializedBytes: 1000000, maxItems: 3, memoryBudgetBytes: 2000000 });
  const raw = readSurfaceCapture('P5').syntax.request;
  await assert.rejects(
    withMixedNativeTransportBudget(b, async (ledger) =>
      readFrameworkSurfaceRequestSnapshotWithBudget(raw, ledger),
    ),
    (e) => typeof e.code === 'string',
  );
  assert.ok(b.serializedBytes > 0);
  assert.equal(b.items, 3);
  assert.equal(b.retainedLogicalBytes, b.serializedBytes);
});
