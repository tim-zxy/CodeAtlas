import {
  CanonicalFactRefSchema,
  CanonicalIdSchema,
  EdgeFactKeySchema,
  EntityIdSchema,
  NodeFactKeySchema,
  ProviderEdgeSchema,
  ProviderFactIdSchema,
  ProviderIdSchema,
  ProviderNodeSchema,
  type CanonicalFactRef,
  type CanonicalId,
  type EdgeFactKey,
  type EntityId,
  type NodeFactKey,
  type ProviderEdge,
  type ProviderFactId,
  type ProviderId,
  type ProviderNode,
  type ProviderNodeRef,
} from '../src/index.js';

const providerId: ProviderId = ProviderIdSchema.parse('provider:typescript');
const providerFactId: ProviderFactId = ProviderFactIdSchema.parse('provider-fact:node-01');
const canonicalId: CanonicalId = CanonicalIdSchema.parse('canonical:node-01');
const entityId: EntityId = EntityIdSchema.parse('entity:repo-01');
const nodeFactKey: NodeFactKey = NodeFactKeySchema.parse('node-key:01');
const edgeFactKey: EdgeFactKey = EdgeFactKeySchema.parse('edge-key:01');
const canonicalFactRef: CanonicalFactRef = CanonicalFactRefSchema.parse({
  factType: 'NODE',
  id: 'canonical:node-01',
});
const providerNode: ProviderNode = ProviderNodeSchema.parse({
  providerId: 'provider:typescript',
  providerFactId: 'provider-fact:node-widget',
  providerSnapshotId: 'entity:provider-snapshot-01',
  repositoryId: 'entity:repo-01',
  revisionId: 'entity:revision-01',
  providerKind: 'ts.class.declaration',
  name: 'Widget',
  qualifiedName: null,
  sourceRange: null,
  confidence: { score: 1, method: 'parser', reasons: ['syntax'] },
});
const providerEdge: ProviderEdge = ProviderEdgeSchema.parse({
  providerId: 'provider:typescript',
  providerFactId: 'provider-fact:edge-call-exact',
  providerSnapshotId: 'entity:provider-snapshot-01',
  repositoryId: 'entity:repo-01',
  revisionId: 'entity:revision-01',
  providerKind: 'ts.call.expression',
  source: {
    factType: 'NODE',
    providerId: 'provider:typescript',
    providerFactId: 'provider-fact:node-source',
  },
  target: {
    state: 'RESOLVED',
    resolution: 'EXACT',
    target: {
      factType: 'NODE',
      providerId: 'provider:typescript',
      providerFactId: 'provider-fact:node-target',
    },
  },
  sourceRange: null,
  confidence: { score: 0.95, method: 'parser', reasons: ['binding'] },
});
const acceptProviderId = (value: ProviderId): ProviderId => value;
const acceptProviderFactId = (value: ProviderFactId): ProviderFactId => value;
const acceptCanonicalId = (value: CanonicalId): CanonicalId => value;
const acceptEntityId = (value: EntityId): EntityId => value;
const acceptNodeFactKey = (value: NodeFactKey): NodeFactKey => value;
const acceptEdgeFactKey = (value: EdgeFactKey): EdgeFactKey => value;
const acceptProviderNodeRef = (value: ProviderNodeRef): ProviderNodeRef => value;

acceptProviderId(providerId);
acceptProviderFactId(providerFactId);
acceptCanonicalId(canonicalId);
acceptEntityId(entityId);
acceptNodeFactKey(nodeFactKey);
acceptEdgeFactKey(edgeFactKey);
ProviderNodeSchema.parse(providerNode);
ProviderEdgeSchema.parse(providerEdge);

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
// @ts-expect-error CanonicalFactRef must not masquerade as ProviderNodeRef.
acceptProviderNodeRef(canonicalFactRef);
// @ts-expect-error ProviderFactId must not masquerade as CanonicalId.
acceptCanonicalId(providerFactId);
