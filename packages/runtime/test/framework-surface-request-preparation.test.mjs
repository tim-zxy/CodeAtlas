import test from 'node:test';
import assert from 'node:assert/strict';
import constructor from '../dist/mixed-request-preparation.js';
import { withFrozenStage } from './helpers/framework-surface-stage.mjs';
import { HistoryReadBudget } from '../../storage/dist/analysis/activation-history-format.js';
import { historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { FrameworkSurfaceRequestSchema } from '../../providers/dist/native-framework-surface-contract.js';
function input(preparation, request) {
  const {
    repository,
    providerVersion,
    providerSnapshotId,
    extractorVersion,
    deadlineEpochMs,
    resourceBudget,
    languages,
  } = request.payload;
  return {
    preparation,
    repository,
    requestId: request.requestId,
    providerVersion,
    providerSnapshotId,
    extractorVersion,
    deadlineEpochMs,
    resourceBudget,
    languages,
  };
}
test('wire8 constructor derives the exact current13 Stage request with explicit ledger', async (t) => {
  assert.equal(typeof constructor.prepareMixedFrameworkSurfaceRequest, 'function');
  await withFrozenStage(t, async ({ preparation, request }) => {
    const b = new HistoryReadBudget(historyLimits),
      out = constructor.prepareMixedFrameworkSurfaceRequest(input(preparation, request), b);
    assert.equal(out.at(-1), 10);
    const actual = JSON.parse(out);
    assert.deepEqual(actual, request);
    assert.deepEqual(FrameworkSurfaceRequestSchema.parse(actual), request);
    assert.ok(b.serializedBytes > out.length);
    assert.ok(b.retainedLogicalBytes > out.length);
    assert.ok(b.items > 0);
  });
});
for (const kind of [
  'foreign-root',
  'foreign-repository',
  'missing-language',
  'duplicate-language',
  'old-extractor',
  'input-limit',
  'item-limit',
])
  test('wire8 constructor rejects ' + kind, async (t) => {
    assert.equal(typeof constructor.prepareMixedFrameworkSurfaceRequest, 'function');
    await withFrozenStage(t, async ({ preparation, request }) => {
      const v = input(preparation, request),
        b = new HistoryReadBudget(
          kind === 'item-limit' ? { ...historyLimits, maxItems: 1 } : historyLimits,
        );
      if (kind === 'foreign-root') v.repository = { ...v.repository, rootPath: '/wrong/root' };
      if (kind === 'foreign-repository')
        v.repository = { ...v.repository, id: 'repository:foreign' };
      if (kind === 'missing-language') v.languages = [];
      if (kind === 'duplicate-language') v.languages = [...v.languages, ...v.languages];
      if (kind === 'old-extractor') v.extractorVersion = 'syntax-v1';
      if (kind === 'input-limit') v.resourceBudget = { ...v.resourceBudget, maxInputBytes: 1 };
      assert.throws(
        () => constructor.prepareMixedFrameworkSurfaceRequest(v, b),
        (e) => typeof e.code === 'string',
      );
    });
  });
