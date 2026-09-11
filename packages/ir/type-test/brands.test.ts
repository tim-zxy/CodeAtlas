import {
  CanonicalIdSchema,
  EntityIdSchema,
  type CanonicalId,
  type EntityId,
} from '../src/index.js';

const entityId: EntityId = EntityIdSchema.parse('entity:01');
const canonicalId: CanonicalId = CanonicalIdSchema.parse('canonical:01');
const acceptEntityId = (value: EntityId): EntityId => value;

acceptEntityId(entityId);
// @ts-expect-error CanonicalId must not masquerade as EntityId.
acceptEntityId(canonicalId);
