import { createHash } from 'node:crypto';

import {
  CanonicalIdSchema,
  EdgeFactKeySchema,
  NodeFactKeySchema,
  type CanonicalId,
  type EdgeFactKey,
  type NodeFactKey,
} from '@codeatlas/ir';

function digest(domain: string, fields: readonly (string | number)[]): string {
  const hash = createHash('sha256')
    .update(domain, 'utf8')
    .update(Buffer.from([0]));
  for (const field of fields) {
    if (
      typeof field === 'number' &&
      (!Number.isSafeInteger(field) || field < 0 || Object.is(field, -0))
    ) {
      throw new TypeError('Canonical identity coordinates must be non-negative safe integers');
    }
    const bytes = Buffer.from(String(field), 'utf8');
    hash.update(String(bytes.byteLength), 'ascii').update(':', 'ascii').update(bytes);
  }
  return `${domain}:${hash.digest('hex')}`;
}

export function nodeFactKey(fields: readonly (string | number)[]): NodeFactKey {
  return NodeFactKeySchema.parse(digest('node-fact-v1', fields));
}

export function edgeFactKey(fields: readonly (string | number)[]): EdgeFactKey {
  return EdgeFactKeySchema.parse(digest('edge-fact-v1', fields));
}

export function canonicalFactId(
  factType: 'NODE' | 'EDGE',
  factKey: NodeFactKey | EdgeFactKey,
): CanonicalId {
  return CanonicalIdSchema.parse(
    digest(factType === 'NODE' ? 'canonical-node-v1' : 'canonical-edge-v1', [factKey]),
  );
}
