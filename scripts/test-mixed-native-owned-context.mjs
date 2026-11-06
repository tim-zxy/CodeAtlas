import test from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from './mixed-native-owned-context.mjs';
import {
  captureActivationContext,
  captureRuntimeActivationContext,
  recheckActivationContext,
  releaseActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import { HistoryCaptureError } from '../packages/storage/dist/analysis/activation-history-format.js';
import {
  historyFixture,
  historyLimits,
  persistentRows,
} from '../packages/storage/test/helpers/r011-history-fixture.mjs';

const failure = (code) => (e) =>
  e instanceof HistoryCaptureError && e.code === code && e.message === code;
function bind(db, handle, limits = historyLimits) {
  assert.equal(typeof adapter.bindMixedNativeOwnedContext, 'function');
  return adapter.bindMixedNativeOwnedContext(db, handle, limits);
}
function noAuthority(status) {
  for (const key of [
    'executionAuthorized',
    'productionAdmission',
    'measurementEligible',
    'environmentAuthenticated',
    'sourceHistoryAuthenticated',
    'toolImagesAuthenticated',
    'applicationOwnershipVerified',
    'databaseFileIdentityVerified',
  ])
    assert.equal(status[key], false, key);
  assert.equal(status.readsetFreshness, 'RECHECK_REQUIRED');
  assert.ok(Object.isFrozen(status));
}
for (const version of [11, 13]) {
  test(
    'genuine existing R0' + version + ' handle supplies frozen Storage readset without writes',
    async (t) => {
      const f = await historyFixture(t, 'available', { version });
      const before = persistentRows(f.db);
      const capture = (version === 11 ? captureActivationContext : captureRuntimeActivationContext)(
        f.db,
        f.input.repositoryId,
        historyLimits,
      );
      const context = bind(f.db, capture.handle);
      t.after(() => context.release());
      assert.deepEqual(Object.keys(context).sort(), ['readset', 'recheck', 'release', 'status']);
      assert.ok(
        Object.isFrozen(context) &&
          Object.isFrozen(context.readset) &&
          Object.isFrozen(context.readset.data),
      );
      assert.deepEqual(context.readset.data.view, capture.view);
      assert.equal(typeof context.readset.identity, 'string');
      assert.ok(Number.isSafeInteger(context.readset.committedSnapshotCount));
      assert.ok(context.readset.usage.rows > 0);
      const status = context.status();
      assert.equal(status.status, 'STORAGE_READSET_BOUND');
      assert.equal(status.storageReadsetVerified, true);
      noAuthority(status);
      context.recheck();
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(persistentRows(f.db), before);
      context.release();
      context.release();
      assert.equal(f.db.isOpen, true);
      assert.equal(context.status().status, 'RELEASED');
      assert.equal(context.status().storageReadsetVerified, false);
      noAuthority(context.status());
      assert.equal(status.status, 'STORAGE_READSET_BOUND');
      assert.throws(
        () => recheckActivationContext(f.db, capture.handle, historyLimits),
        failure('HISTORY_RELEASED'),
      );
    },
  );
}
test('caller data shaped like a capture cannot substitute for opaque Storage lease', async (t) => {
  const f = await historyFixture(t, 'available');
  for (const handle of [{}, { view: f.expected }, Object.freeze({ handle: {} })])
    assert.throws(() => bind(f.db, handle), failure('INVALID_HISTORY'));
});
test('proxy handle is rejected without invoking traps', async (t) => {
  const f = await historyFixture(t, 'available');
  let trapped = false;
  const handle = new Proxy(
    {},
    {
      get() {
        trapped = true;
        throw Error('trap');
      },
    },
  );
  assert.throws(() => bind(f.db, handle), failure('INVALID_HISTORY'));
  assert.equal(trapped, false);
});
test('capture cannot move to another connection of the identical SQLite file', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const other = f.reopen();
  assert.throws(() => bind(other, capture.handle), failure('INVALID_HISTORY'));
  // Failure before ownership does not release the caller's valid same-connection lease.
  recheckActivationContext(f.db, capture.handle, historyLimits);
  releaseActivationContext(f.db, capture.handle);
});
test('fake database cannot authenticate a genuine capture', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.throws(() => bind({}, capture.handle), failure('INVALID_HISTORY'));
  releaseActivationContext(f.db, capture.handle);
});
test('already released handle is not converted to success', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  releaseActivationContext(f.db, capture.handle);
  assert.throws(() => bind(f.db, capture.handle), failure('HISTORY_RELEASED'));
});
test('closed connection before binding remains HISTORY_RELEASED', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.close();
  assert.throws(() => bind(f.db, capture.handle), failure('HISTORY_RELEASED'));
});
test('failed recheck is sticky while release remains possible and idempotent', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const context = bind(f.db, capture.handle);
  f.db.close();
  assert.throws(() => context.recheck(), failure('HISTORY_RELEASED'));
  assert.equal(context.status().status, 'FAILED');
  assert.equal(context.status().storageReadsetVerified, false);
  context.release();
  context.release();
  assert.equal(context.status().status, 'FAILED');
  noAuthority(context.status());
});
test('external release is detected rather than trusting an old readset', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const context = bind(f.db, capture.handle);
  releaseActivationContext(f.db, capture.handle);
  assert.throws(() => context.recheck(), failure('HISTORY_RELEASED'));
  context.release();
  assert.equal(context.status().status, 'FAILED');
});
test('explicit existing Storage budget refusal is retained and transaction closes', async (t) => {
  const f = await historyFixture(t, 'available');
  const before = persistentRows(f.db);
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.throws(
    () => bind(f.db, capture.handle, { ...historyLimits, maxRows: 1 }),
    failure('HISTORY_LIMIT_EXCEEDED'),
  );
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(persistentRows(f.db), before);
  releaseActivationContext(f.db, capture.handle);
});
test('limits are copied through existing Storage validation before future rechecks', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const limits = { ...historyLimits };
  const context = bind(f.db, capture.handle, limits);
  limits.maxRows = 1;
  limits.memoryBudgetBytes = 1;
  context.recheck();
  context.release();
  assert.equal(context.status().status, 'RELEASED');
});
test('accessor limits refuse without evaluating them or claiming the valid handle', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  let called = false;
  const limits = { ...historyLimits };
  Object.defineProperty(limits, 'maxRows', {
    enumerable: true,
    get() {
      called = true;
      return 1;
    },
  });
  assert.throws(() => bind(f.db, capture.handle, limits), failure('INVALID_HISTORY'));
  assert.equal(called, false);
  recheckActivationContext(f.db, capture.handle, historyLimits);
  releaseActivationContext(f.db, capture.handle);
});
test('schema-only fixture without Repository or Source registration cannot fabricate context', async (t) => {
  const f = await historyFixture(t, 'available', { seed: false });
  assert.throws(
    () => captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    (e) => e instanceof HistoryCaptureError,
  );
  assert.throws(() => bind(f.db, {}), failure('INVALID_HISTORY'));
  assert.equal(f.db.isTransaction, false);
});
test('legitimate Source with unavailable activation history remains explicitly unavailable', async (t) => {
  const f = await historyFixture(t, 'no-history');
  const before = persistentRows(f.db);
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.equal(capture.view.status, 'UNAVAILABLE');
  const context = bind(f.db, capture.handle);
  assert.equal(context.readset.data.view.status, 'UNAVAILABLE');
  assert.equal(context.readset.data.view.history, null);
  noAuthority(context.status());
  context.recheck();
  context.release();
  assert.deepEqual(persistentRows(f.db), before);
});
test('release preserves original closed-connection Storage failure then stays idempotent', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const context = bind(f.db, capture.handle);
  f.db.close();
  assert.throws(() => context.release(), failure('HISTORY_RELEASED'));
  context.release();
  assert.equal(context.status().status, 'FAILED');
  assert.equal(context.status().storageReadsetVerified, false);
  noAuthority(context.status());
});
test('recheck after wrapper release cannot revive the captured readset', async (t) => {
  const f = await historyFixture(t, 'available');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const context = bind(f.db, capture.handle);
  context.release();
  assert.throws(() => context.recheck(), failure('HISTORY_RELEASED'));
  assert.equal(context.status().status, 'FAILED');
  context.release();
  assert.equal(f.db.isOpen, true);
});
