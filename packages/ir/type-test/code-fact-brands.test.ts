import {
  CanonicalIdSchema,
  EdgeFactKeySchema,
  EntityIdSchema,
  NodeFactKeySchema,
  ProviderFactIdSchema,
  ProviderIdSchema,
  type CanonicalId,
  type EdgeFactKey,
  type EntityId,
  type NodeFactKey,
  type ProviderFactId,
  type ProviderId,
} from '../src/index.js';

const providerId: ProviderId = ProviderIdSchema.parse('provider:typescript');
const providerFactId: ProviderFactId = ProviderFactIdSchema.parse('provider-fact:node-01');
const canonicalId: CanonicalId = CanonicalIdSchema.parse('canonical:node-01');
const entityId: EntityId = EntityIdSchema.parse('entity:repo-01');
const nodeFactKey: NodeFactKey = NodeFactKeySchema.parse('node-key:01');
const edgeFactKey: EdgeFactKey = EdgeFactKeySchema.parse('edge-key:01');
const acceptProviderId = (value: ProviderId): ProviderId => value;
const acceptProviderFactId = (value: ProviderFactId): ProviderFactId => value;
const acceptCanonicalId = (value: CanonicalId): CanonicalId => value;
const acceptEntityId = (value: EntityId): EntityId => value;
const acceptNodeFactKey = (value: NodeFactKey): NodeFactKey => value;
const acceptEdgeFactKey = (value: EdgeFactKey): EdgeFactKey => value;

acceptProviderId(providerId);
acceptProviderFactId(providerFactId);
acceptCanonicalId(canonicalId);
acceptEntityId(entityId);
acceptNodeFactKey(nodeFactKey);
acceptEdgeFactKey(edgeFactKey);

// @ts-expect-error ProviderFactId must not masquerade as ProviderId.
acceptProviderId(providerFactId);
// @ts-expect-error ProviderId must not masquerade as ProviderFactId.
acceptProviderFactId(providerId);
// @ts-expect-error CanonicalId must not masquerade as ProviderFactId.
acceptProviderFactId(canonicalId);
// @ts-expect-error EntityId must not masquerade as CanonicalId.
acceptCanonicalId(entityId);
// @ts-expect-error CanonicalId must not masquerade as EntityId.
acceptEntityId(canonicalId);
// @ts-expect-error EdgeFactKey must not masquerade as NodeFactKey.
acceptNodeFactKey(edgeFactKey);
// @ts-expect-error NodeFactKey must not masquerade as EdgeFactKey.
acceptEdgeFactKey(nodeFactKey);
// @ts-expect-error CanonicalId must not masquerade as NodeFactKey.
acceptNodeFactKey(canonicalId);
// @ts-expect-error ProviderFactId must not masquerade as EdgeFactKey.
acceptEdgeFactKey(providerFactId);
