import {
  CanonicalIdSchema,
  EdgeFactKeySchema,
  NodeFactKeySchema,
  type CanonicalId,
  type EdgeFactKey,
  type NodeFactKey,
} from '@codeatlas/ir';

import { digestIdentityTuple } from './identity-tuple.js';
export { CanonicalIdentityEncodingError } from './identity-tuple.js';

export function nodeFactKey(fields: readonly (string | number)[]): NodeFactKey {
  return NodeFactKeySchema.parse(digestIdentityTuple('node-fact-v1', fields));
}

export function edgeFactKey(fields: readonly (string | number)[]): EdgeFactKey {
  return EdgeFactKeySchema.parse(digestIdentityTuple('edge-fact-v1', fields));
}

export function canonicalFactId(
  factType: 'NODE' | 'EDGE',
  factKey: NodeFactKey | EdgeFactKey,
): CanonicalId {
  return CanonicalIdSchema.parse(
    digestIdentityTuple(factType === 'NODE' ? 'canonical-node-v1' : 'canonical-edge-v1', [factKey]),
  );
}
