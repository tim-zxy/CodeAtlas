import assert from 'node:assert/strict';
import { test } from 'node:test';

import { directCallMetrics } from './native-relation-metrics.mjs';

const call = (id, target, resolution = 'EXACT') => ({
  providerFactId: id,
  providerKind: 'java.call',
  target: target
    ? { state: 'RESOLVED', resolution, target: { providerFactId: target } }
    : { state: 'UNRESOLVED', resolution },
});

test('wrong target is both a false positive and missed critical call', () => {
  assert.deepEqual(directCallMetrics([call('site', 'right')], [call('site', 'wrong')], ['site']), {
    tp: 0,
    fp: 1,
    fn: 1,
    precision: 0,
    recall: 0,
  });
});

test('extra resolved call counts as false positive', () => {
  assert.deepEqual(
    directCallMetrics(
      [call('site', 'right')],
      [call('site', 'right'), call('extra', 'bad')],
      ['site'],
    ),
    { tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1 },
  );
});

test('missing or ambiguous critical call counts as false negative', () => {
  assert.deepEqual(directCallMetrics([call('site', 'right')], [], ['site']).fn, 1);
  assert.deepEqual(
    directCallMetrics([call('site', 'right')], [call('site', null, 'AMBIGUOUS')], ['site']).fn,
    1,
  );
});

test('zero denominators cannot pass a direct-call gate', () => {
  assert.deepEqual(directCallMetrics([], [], []), {
    tp: 0,
    fp: 0,
    fn: 0,
    precision: null,
    recall: null,
  });
});
