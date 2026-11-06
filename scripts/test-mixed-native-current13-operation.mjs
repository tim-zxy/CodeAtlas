import test from 'node:test';
import assert from 'node:assert/strict';
import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';
let api = {};
try {
  api = await import('./mixed-native-current13-operation.mjs');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
test('actual current13 export refuses missing coordinator operation before any Source or Store attempt', async (t) => {
  const f = await dynamicOwnerFixture(t, 'repo:owned');
  assert.equal(typeof api.runMixedNativeHostOperation, 'function');
  await assert.rejects(
    api.runMixedNativeHostOperation(
      { ownerInput: f.request },
      { incoming: f.incoming, outgoing: f.outgoing },
    ),
    (error) => {
      assert.equal(error.code, 'CURRENT13_OPERATION_FAILED');
      assert.equal(error.effects.sourceCommit, 'NOT_ATTEMPTED');
      assert.equal(error.effects.graphCommit, 'NOT_ATTEMPTED');
      assert.equal(error.step, 'LOAD_OPERATION');
      return true;
    },
  );
  assert.deepEqual(f.messages, []);
});

test('initialization control refuses the coordinator epoch deadline at original checkpoints', async () => {
  assert.equal(typeof api.createCurrent13InitializationControl, 'function');
  const original = Date.now,
    base = 1000000;
  Date.now = () => base;
  try {
    const control = api.createCurrent13InitializationControl(
      { maxMetadataRows: 100, maxResultBytes: 4096, timeoutMs: 10000 },
      new AbortController().signal,
      base + 100,
    );
    Date.now = () => base + 101;
    await assert.rejects(control.checkpoint());
    assert.throws(() => control.reserveText(1));
    assert.throws(() => control.chargeMetadataRow());
  } finally {
    Date.now = original;
  }
});
