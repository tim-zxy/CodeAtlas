import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CanonicalIdSchema, EdgeFactKeySchema, NodeFactKeySchema } from '../../ir/dist/index.js';
import { canonicalFactId, edgeFactKey, nodeFactKey } from '../dist/canonical-fact-identity.js';

test('node identity uses the pinned versioned tuple digest', () => {
  const key = nodeFactKey(['repo-fixture', 'rev-fixture', 'PACKAGE', 'demo']);
  assert.equal(
    key,
    'node-fact-v1:e3058dd65a50ac30faeaf863cb1cb4ba95b7d76ac78ef2b28e4a2d98898597c1',
  );
  assert.equal(
    canonicalFactId('NODE', key),
    'canonical-node-v1:a8ec6366dcc13d35b8539d3fcc1aaadb0e0233e1773825f3ae06612a49865c1e',
  );
  assert.equal(NodeFactKeySchema.parse(key), key);
  assert.equal(CanonicalIdSchema.parse(canonicalFactId('NODE', key)), canonicalFactId('NODE', key));
});

test('edge identity has separate domains and pinned vectors', () => {
  const key = edgeFactKey(['repo', 'rev', 'CALL']);
  assert.equal(
    key,
    'edge-fact-v1:8ae16fbd2fc3fd09a88f56cbc46e0e5ba6d58c51ff8af8c4643859d5730a3462',
  );
  assert.equal(
    canonicalFactId('EDGE', key),
    'canonical-edge-v1:c56bf1819fd9c7a9e4acb23d77abee747366bad3854dfdfd874a6bb59fdb6e10',
  );
  assert.equal(EdgeFactKeySchema.parse(key), key);
});

test('length-delimited UTF-8 fields are unambiguous and repository-scoped', () => {
  assert.equal(
    nodeFactKey(['é']),
    'node-fact-v1:11142a6d06528009ab6bc25bff34613bea906cb5d508319ba29f02444ab85b5a',
  );
  assert.notEqual(nodeFactKey(['a:b\0c']), nodeFactKey(['a', 'b\0c']));
  assert.notEqual(
    nodeFactKey(['repo-a', 'rev', 'PACKAGE', 'demo']),
    nodeFactKey(['repo-b', 'rev', 'PACKAGE', 'demo']),
  );
  assert.notEqual(
    nodeFactKey(['repo', 'rev-a', 'PACKAGE', 'demo']),
    nodeFactKey(['repo', 'rev-b', 'PACKAGE', 'demo']),
  );
});
