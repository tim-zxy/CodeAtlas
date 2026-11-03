import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  EvidenceSchema,
  ProviderFactBindingSchema,
  FactEvidenceSchema,
  ProviderSnapshotSchema,
  ProviderIdSchema,
  SourceFileSchema,
  EntityIdSchema,
  ContentFingerprintSchema,
  UtcInstantSchema,
  RepoBasisSchema,
  SupportRefSchema,
  parseSyntaxEvidence,
  parseSyntaxEvidenceV2,
  parseSyntaxEvidenceV3,
  parseSyntaxEvidenceV4,
  type ScopedRef,
  type SupportRef,
} from '@codeatlas/ir';
import { NativeCompositionError, remainingCompositionLimits } from './native-code-syntax-budget.js';
import { freezeComposition } from './native-composition-input.js';
import { createHash } from 'node:crypto';
import {
  chargeCompositionJSON,
  spendComposition,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
/** H1 canonical history encoding: UTF16 key order, including numeric-looking keys. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function syntaxHistoryDigest(
  domain: string,
  value: unknown,
  context: CodeSyntaxCompositionBudget,
): string {
  chargeCompositionJSON(value, context.limits, context.budget);
  // Reserve the equally sized canonical representation before constructing it.
  chargeCompositionJSON(value, context.limits, context.budget);
  spendComposition(
    context.budget,
    context.limits,
    'serializedBytes',
    Buffer.byteLength(domain) + 1,
  );
  return createHash('sha256')
    .update(domain + '\0')
    .update(canonical(value))
    .digest('hex');
}

export class SyntaxHistoryCandidateError extends Error {
  constructor(readonly code: 'INVALID_CANDIDATE' | 'RESOURCE_LIMIT_EXCEEDED') {
    super(code);
    this.name = 'SyntaxHistoryCandidateError';
  }
}
const pairInput = z.strictObject({
  body: z.strictObject({
    schemaVersion: z.literal(1),
    providerSyntaxId: EntityIdSchema,
    originSnapshot: ProviderSnapshotSchema,
    sourceFile: SourceFileSchema,
    unitId: EntityIdSchema,
    envelope: z.strictObject({
      schema: z.literal('codeatlas.syntax-evidence'),
      version: z.literal(1),
      payload: z.unknown(),
    }),
  }),
  selectedNodes: z.array(CanonicalNodeSchema),
});
const bindingBody = pairInput.shape.body.extend({
  envelope: pairInput.shape.body.shape.envelope.extend({ version: z.literal(2) }),
});
const bindingAwareBody = pairInput.shape.body.extend({
  envelope: pairInput.shape.body.shape.envelope.extend({ version: z.literal(3) }),
});
const surfaceBody = pairInput.shape.body.extend({
  envelope: pairInput.shape.body.shape.envelope.extend({ version: z.literal(4) }),
});
const surfacePairInput = pairInput.extend({
  body: surfaceBody,
  selectedEdges: z.array(CanonicalEdgeSchema),
});
const bindingAwarePairInput = pairInput.extend({ body: bindingAwareBody });
const bindingPairInput = pairInput.extend({ body: bindingBody });
const payloadContext = z.object({
  id: EntityIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  sourceFingerprint: z.string(),
  sourceRange: z.object({ sourceFileId: EntityIdSchema }),
  supportRefs: z.array(SupportRefSchema),
});
/** Pure declared pair assembly. The owned Stage/Store still verifies Source, units, raw and publication authority. */
export function createSyntaxHistoryPair(input: unknown, context: CodeSyntaxCompositionBudget) {
  return createPair(input, context, 1);
}
export function createBindingSyntaxHistoryPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return createPair(input, context, 2);
}
function createPair(input: unknown, context: CodeSyntaxCompositionBudget, version: 1 | 2 | 3 | 4) {
  try {
    remainingCompositionLimits(context);
    const q = (v: unknown) => chargeCompositionJSON(v, context.limits, context.budget);
    const encoded = q(input);
    q(input);
    q(input);
    const owned = (
        version === 4
          ? surfacePairInput
          : version === 3
            ? bindingAwarePairInput
            : version === 2
              ? bindingPairInput
              : pairInput
      ).parse(JSON.parse(encoded)),
      body = owned.body,
      source = body.sourceFile,
      snapshot = body.originSnapshot;
    const requirePair = (v: unknown) => {
      if (!v) throw new SyntaxHistoryCandidateError('INVALID_CANDIDATE');
    };
    q(body.envelope);
    q(body.envelope);
    const p = payloadContext.parse(body.envelope.payload),
      basis = RepoBasisSchema.parse(p.supportRefs[0]?.basis);
    requirePair(
      basis &&
        p.repositoryId === source.repositoryId &&
        p.revisionId === source.revisionId &&
        p.sourceRange.sourceFileId === source.id &&
        p.sourceFingerprint === source.contentFingerprint,
    );
    requirePair(
      snapshot.repositoryId === source.repositoryId &&
        snapshot.requestedRevisionId === source.revisionId &&
        snapshot.requestedRevisionFingerprint === basis!.contentFingerprint &&
        snapshot.outcome === 'SUCCEEDED',
    );
    const values = new Map<string, unknown>(),
      entities: ScopedRef[] = [],
      supports: SupportRef[] = [];
    const available = [
      { kind: 'SOURCE_FILE' as const, value: source },
      ...owned.selectedNodes.map((value) => ({ kind: 'CODE_NODE' as const, value })),
      ...('selectedEdges' in owned
        ? owned.selectedEdges.map((value) => ({ kind: 'CODE_EDGE' as const, value }))
        : []),
    ];
    q(available);
    for (const { kind, value } of available) {
      requirePair(
        value.repositoryId === source.repositoryId &&
          value.revisionId === source.revisionId &&
          !values.has(kind + ':' + value.id),
      );
      const entity = { kind, id: EntityIdSchema.parse(value.id), revisionId: value.revisionId },
        ref = { scope: 'REPOSITORY' as const, repositoryId: source.repositoryId, entity };
      q([kind + ':' + value.id, value, ref]);
      values.set(kind + ':' + value.id, value);
      entities.push(ref);
    }
    for (const support of p.supportRefs) {
      const key = support.entity.kind + ':' + support.entity.id,
        value = values.get(key);
      q([key, value ?? null]);
      requirePair(
        value &&
          isDeepStrictEqual(support.basis, basis) &&
          support.entity.revisionId === source.revisionId &&
          support.valueDigest ===
            syntaxHistoryDigest('codeatlas-phase1-support-value-v1', value, context),
      );
      supports.push(support);
    }
    const supported = new Set(supports.map((s) => s.entity.kind + ':' + s.entity.id));
    q([...supported]);
    requirePair(supported.size === supports.length && supported.has('SOURCE_FILE:' + source.id));
    const pending: unknown[] = [body.envelope.payload];
    while (pending.length) {
      const item = pending.pop();
      if (item === null || typeof item !== 'object') continue;
      if (Array.isArray(item)) {
        for (const child of item) pending.push(child);
        continue;
      }
      const r = item as Record<string, unknown>;
      if (r.scope !== undefined) {
        const ref = r as {
          scope: unknown;
          repositoryId: unknown;
          entity: { kind: unknown; id: unknown };
        };
        requirePair(
          ref.scope === 'REPOSITORY' &&
            ref.repositoryId === source.repositoryId &&
            (ref.entity.kind === 'CODE_NODE' ||
              (version === 4 && ref.entity.kind === 'CODE_EDGE')) &&
            supported.has(String(ref.entity.kind) + ':' + ref.entity.id),
        );
      }
      for (const v of Object.values(r)) pending.push(v);
    }
    q({ availableEntities: entities, availableSupports: supports });
    q({ availableEntities: entities, availableSupports: supports });
    q(body.envelope);
    q(body.envelope);
    const references = { availableEntities: entities, availableSupports: supports };
    const bindingContext = {
      references,
      codeNodes: owned.selectedNodes,
      sourceFiles: [source],
      ...('selectedEdges' in owned ? { codeEdges: owned.selectedEdges } : {}),
    };
    if (version >= 2) {
      q(bindingContext);
      q(bindingContext);
    }
    const payload = (
      version === 4
        ? parseSyntaxEvidenceV4(body.envelope, bindingContext)
        : version === 3
          ? parseSyntaxEvidenceV3(body.envelope, bindingContext)
          : version === 2
            ? parseSyntaxEvidenceV2(body.envelope, bindingContext)
            : parseSyntaxEvidence(body.envelope, references)
    ).payload;
    const { id: initialId, ...withoutId } = payload;
    q(withoutId);
    requirePair(
      initialId ===
        'syntax:' + syntaxHistoryDigest(`codeatlas-syntax-initial-v${version}`, withoutId, context),
    );
    const completeBody = {
      ...body,
      envelope: { schema: 'codeatlas.syntax-evidence' as const, version, payload },
    };
    q(completeBody);
    const od = syntaxHistoryDigest(`codeatlas-syntax-origin-v${version}`, completeBody, context),
      originId = 'syntax-origin:' + od;
    const pd = syntaxHistoryDigest(
        `codeatlas-syntax-projection-v${version}`,
        { originId, payload: withoutId },
        context,
      ),
      projectionId = 'syntax:' + pd;
    const projected = {
      schema: 'codeatlas.syntax-evidence',
      version,
      payload: { ...payload, id: projectionId },
    };
    q(projected);
    const encode = (v: unknown) => {
      q(v);
      q(v);
      return canonical(v);
    };
    const result = {
      origin: {
        id: originId,
        repository_id: source.repositoryId,
        revision_id: source.revisionId,
        origin_snapshot_id: snapshot.id,
        origin_digest: od,
        origin_json: encode(completeBody),
      },
      projection: {
        id: projectionId,
        repository_id: source.repositoryId,
        origin_id: originId,
        projection_digest: pd,
        envelope_json: encode(projected),
      },
      member: { originId, projectionId, unitId: body.unitId },
      metadata: {
        id: originId,
        unitId: body.unitId,
        originSnapshotId: snapshot.id,
        valueDigest: od,
        basis,
      },
    };
    q(result);
    return freezeComposition(result);
  } catch (e) {
    if (e instanceof SyntaxHistoryCandidateError) throw e;
    if (e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new SyntaxHistoryCandidateError(e.code);
    throw new SyntaxHistoryCandidateError('INVALID_CANDIDATE');
  }
}

const retainedInput = z.strictObject({
  body: pairInput.shape.body,
  originNodes: z.array(CanonicalNodeSchema),
  currentBasis: RepoBasisSchema,
  currentNodes: z.array(CanonicalNodeSchema),
});
/** Revalidate complete immutable origin against old values; only current support basis/digests and projection ID change. */
export function reprojectSyntaxHistoryPair(input: unknown, context: CodeSyntaxCompositionBudget) {
  return reprojectPair(input, context, 1);
}
export function reprojectBindingSyntaxHistoryPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return reprojectPair(input, context, 2);
}
function reprojectPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
  version: 1 | 2 | 3 | 4,
) {
  try {
    remainingCompositionLimits(context);
    const q = (v: unknown) => chargeCompositionJSON(v, context.limits, context.budget),
      encoded = q(input);
    q(input);
    q(input);
    const owned = (
        version === 4
          ? retainedInput.extend({
              body: surfaceBody,
              originEdges: z.array(CanonicalEdgeSchema),
              currentEdges: z.array(CanonicalEdgeSchema),
            })
          : version === 3
            ? retainedInput.extend({ body: bindingAwareBody })
            : version === 2
              ? retainedInput.extend({ body: bindingBody })
              : retainedInput
      ).parse(JSON.parse(encoded)),
      initial = createPair(
        {
          body: owned.body,
          selectedNodes: owned.originNodes,
          ...('originEdges' in owned ? { selectedEdges: owned.originEdges } : {}),
        },
        context,
        version,
      ),
      body = owned.body,
      source = body.sourceFile,
      basis = owned.currentBasis;
    const check = (v: unknown) => {
      if (!v) throw new SyntaxHistoryCandidateError('INVALID_CANDIDATE');
    };
    check(basis.repositoryId === source.repositoryId && basis.revisionId === source.revisionId);
    q(body.envelope);
    q(body.envelope);
    const old = payloadContext.parse(body.envelope.payload),
      { id: ignored, ...meaning } = body.envelope.payload as Record<string, unknown>;
    void ignored;
    const values = new Map<string, unknown>(),
      entities: ScopedRef[] = [];
    const available = [
      { kind: 'SOURCE_FILE' as const, value: source },
      ...owned.currentNodes.map((value) => ({ kind: 'CODE_NODE' as const, value })),
      ...('currentEdges' in owned
        ? owned.currentEdges.map((value) => ({ kind: 'CODE_EDGE' as const, value }))
        : []),
    ];
    q(available);
    for (const { kind, value } of available) {
      check(
        value.repositoryId === basis.repositoryId &&
          value.revisionId === basis.revisionId &&
          !values.has(kind + ':' + value.id),
      );
      const ref = {
        scope: 'REPOSITORY' as const,
        repositoryId: basis.repositoryId,
        entity: { kind, id: EntityIdSchema.parse(value.id), revisionId: basis.revisionId },
      };
      q([kind + ':' + value.id, value, ref]);
      values.set(kind + ':' + value.id, value);
      entities.push(ref);
    }
    const supports: SupportRef[] = [];
    for (const support of old.supportRefs) {
      const key = support.entity.kind + ':' + support.entity.id,
        value = values.get(key);
      q([key, value ?? null]);
      check(value);
      const replacement = SupportRefSchema.parse({
        ...support,
        basis,
        valueDigest: syntaxHistoryDigest('codeatlas-phase1-support-value-v1', value, context),
      });
      q(replacement);
      supports.push(replacement);
    }
    const payload = { ...meaning, supportRefs: supports };
    q(payload);
    const pd = syntaxHistoryDigest(
        `codeatlas-syntax-projection-v${version}`,
        { originId: initial.origin.id, payload },
        context,
      ),
      projectionId = 'syntax:' + pd,
      envelope = {
        schema: 'codeatlas.syntax-evidence',
        version,
        payload: { id: projectionId, ...payload },
      },
      referenceContext = { availableEntities: entities, availableSupports: supports };
    q(envelope);
    q(envelope);
    q(referenceContext);
    q(referenceContext);
    const bindingContext = {
      references: referenceContext,
      codeNodes: owned.currentNodes,
      ...('currentEdges' in owned ? { codeEdges: owned.currentEdges } : {}),
      sourceFiles: [source],
    };
    if (version >= 2) {
      q(bindingContext);
      q(bindingContext);
    }
    const parsed =
      version === 4
        ? parseSyntaxEvidenceV4(envelope, bindingContext)
        : version === 3
          ? parseSyntaxEvidenceV3(envelope, bindingContext)
          : version === 2
            ? parseSyntaxEvidenceV2(envelope, bindingContext)
            : parseSyntaxEvidence(envelope, referenceContext);
    for (const support of supports)
      if (
        support.entity.kind === 'CODE_NODE' ||
        (version === 4 && support.entity.kind === 'CODE_EDGE')
      ) {
        const value = [
          ...owned.currentNodes,
          ...('currentEdges' in owned ? owned.currentEdges : []),
        ].find((n) => n.id === String(support.entity.id));
        check(value && parsed.payload.confidence.score <= value.confidence.score);
      }
    q(parsed);
    q(parsed);
    const result = {
      ...initial,
      projection: {
        id: projectionId,
        repository_id: basis.repositoryId,
        origin_id: initial.origin.id,
        projection_digest: pd,
        envelope_json: canonical(parsed),
      },
      member: { ...initial.member, projectionId },
    };
    q(result);
    return freezeComposition(result);
  } catch (e) {
    if (e instanceof SyntaxHistoryCandidateError) throw e;
    if (e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new SyntaxHistoryCandidateError(e.code);
    throw new SyntaxHistoryCandidateError('INVALID_CANDIDATE');
  }
}

const historyText = z
    .string()
    .min(1)
    .refine((v) => v.trim() === v && v.isWellFormed()),
  historyDigestText = z.string().regex(/^[a-f0-9]{64}$/);
const historyUnit = z.strictObject({
  id: EntityIdSchema,
  providerId: ProviderIdSchema,
  kind: historyText,
  sourceFileIds: z.array(EntityIdSchema),
});
const manifestSource = z.strictObject({
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  contentFingerprint: ContentFingerprintSchema,
});
const manifestCoverage = z.strictObject({
  unitId: EntityIdSchema,
  facet: historyText,
  originSnapshotId: EntityIdSchema,
  coverage: z.literal('COMPLETE'),
});
const manifestObservation = z.strictObject({
  snapshotId: EntityIdSchema,
  requestIdentity: historyDigestText,
  outputIdentity: historyDigestText,
  javaProvenance: z
    .strictObject({
      kind: z.literal('PARSED_V2'),
      requestId: historyText,
      startedAt: UtcInstantSchema,
      settledAt: UtcInstantSchema,
    })
    .nullable(),
  scope: z.strictObject({
    unitIds: z.array(EntityIdSchema),
    removedSourceFileIds: z.array(EntityIdSchema),
  }),
  qualificationRef: historyText,
});
const manifestTransition = z.strictObject({
  kind: z.literal('TRANSITION_DRAFT'),
  activationId: EntityIdSchema,
  oldBasis: RepoBasisSchema,
  targetSource: manifestSource,
  historyDigest: historyDigestText,
  ledgerDigest: historyDigestText,
  diff: z.array(
    z.strictObject({
      kind: z.enum(['UNCHANGED', 'ADDED', 'MODIFIED', 'REMOVED']),
      before: SourceFileSchema.nullable(),
      after: SourceFileSchema.nullable(),
    }),
  ),
  supportDecisions: z.array(
    z.strictObject({
      evidenceId: EntityIdSchema,
      action: z.enum(['RETAIN', 'SUPERSEDE', 'INVALIDATE']),
      replacementEvidenceId: EntityIdSchema.nullable(),
    }),
  ),
  addedEvidenceIds: z.array(EntityIdSchema),
  survivingFactKeys: z.array(
    z.strictObject({ factType: z.enum(['NODE', 'EDGE']), id: EntityIdSchema }),
  ),
  coverageOrigins: z.array(manifestCoverage),
  syntaxRequirements: z.array(
    z.strictObject({
      originId: EntityIdSchema,
      action: z.enum(['REVALIDATE_FINAL_BASIS', 'RETIRE_ORIGIN']),
    }),
  ),
});
const manifestInput = z.strictObject({
  mode: z.enum(['FULL', 'DELTA']),
  state: z.strictObject({
    basis: RepoBasisSchema,
    repositoryLocatorDigest: historyDigestText,
    inventory: z.array(SourceFileSchema),
    contracts: z.array(
      z.strictObject({
        providerId: ProviderIdSchema,
        extractor: historyText,
        normalizer: historyText,
        contract: historyText,
        policy: historyText,
      }),
    ),
    units: z.array(historyUnit),
    snapshots: z.array(ProviderSnapshotSchema),
    nodes: z.array(CanonicalNodeSchema),
    edges: z.array(CanonicalEdgeSchema),
    supports: z.array(
      z.strictObject({
        factType: z.enum(['NODE', 'EDGE']),
        canonical: z.union([CanonicalNodeSchema, CanonicalEdgeSchema]),
        evidence: EvidenceSchema,
        binding: ProviderFactBindingSchema,
        factEvidence: FactEvidenceSchema,
        dependencyUnitIds: z.array(EntityIdSchema).nullable(),
        valueDigest: historyDigestText,
      }),
    ),
    coverage: z.array(
      z.strictObject({
        unitId: EntityIdSchema,
        facet: historyText,
        originSnapshotId: EntityIdSchema,
        coverage: z.literal('COMPLETE'),
      }),
    ),
  }),
  parent: z
    .strictObject({
      activationId: EntityIdSchema,
      repositoryId: EntityIdSchema,
      revisionId: EntityIdSchema,
    })
    .nullable(),
  observation: manifestObservation.nullable(),
  transitions: manifestTransition.nullable(),
  syntax: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('NEW'), body: pairInput.shape.body }),
      z.strictObject({
        kind: z.literal('RETAINED'),
        body: pairInput.shape.body,
        originNodes: z.array(CanonicalNodeSchema),
      }),
    ]),
  ),
});
/** Strict pure candidate construction; Runtime must run H1 validators and Storage owns all publication authority. */
const versionedManifestInput = manifestInput.extend({
  syntax: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('NEW'),
        body: z.union([pairInput.shape.body, bindingBody, bindingAwareBody]),
      }),
      z.strictObject({
        kind: z.literal('RETAINED'),
        body: z.union([pairInput.shape.body, bindingBody, bindingAwareBody]),
        originNodes: z.array(CanonicalNodeSchema),
      }),
    ]),
  ),
});
const surfaceManifestInput = manifestInput.extend({
  syntax: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('NEW'), body: surfaceBody }),
      z.strictObject({
        kind: z.literal('RETAINED'),
        body: surfaceBody,
        originNodes: z.array(CanonicalNodeSchema),
        originEdges: z.array(CanonicalEdgeSchema),
      }),
    ]),
  ),
});
export function createFrameworkSurfaceSyntaxHistoryManifest(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return createManifest(input, context, 4);
}
export function createSyntaxHistoryManifest(input: unknown, context: CodeSyntaxCompositionBudget) {
  return createManifest(input, context, false);
}
export function createVersionedSyntaxHistoryManifest(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return createManifest(input, context, true);
}
function createManifest(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
  versioned: boolean | 4,
) {
  try {
    remainingCompositionLimits(context);
    const q = (v: unknown) => chargeCompositionJSON(v, context.limits, context.budget),
      encoded = q(input);
    q(input);
    q(input);
    const owned = (
      versioned === 4 ? surfaceManifestInput : versioned ? versionedManifestInput : manifestInput
    ).parse(JSON.parse(encoded));
    const check = (v: unknown) => {
      if (!v) throw new SyntaxHistoryCandidateError('INVALID_CANDIDATE');
    };
    check(Object.hasOwn(owned, 'observation') && Object.hasOwn(owned, 'transitions'));
    if (owned.parent) check(owned.parent.repositoryId === owned.state.basis.repositoryId);
    if (owned.mode === 'FULL') check(owned.transitions === null);
    else {
      const t = owned.transitions;
      check(t && owned.parent);
      q(t);
      check(
        t!.activationId === owned.parent!.activationId &&
          t!.oldBasis.repositoryId === owned.state.basis.repositoryId &&
          t!.oldBasis.revisionId === owned.parent!.revisionId &&
          t!.oldBasis.revisionId === owned.state.basis.revisionId &&
          isDeepStrictEqual(t!.targetSource, {
            repositoryId: owned.state.basis.repositoryId,
            revisionId: owned.state.basis.revisionId,
            contentFingerprint: owned.state.basis.contentFingerprint,
          }),
      );
    }
    const pairs: ReturnType<typeof createSyntaxHistoryPair>[] = [],
      seen = new Set<string>();
    for (const item of owned.syntax) {
      check(owned.mode !== 'FULL' || item.kind === 'NEW');
      const body = item.body,
        unit = owned.state.units.find((u) => u.id === body.unitId),
        snapshot = owned.state.snapshots.find((s) => s.id === body.originSnapshot.id);
      check(
        unit &&
          unit.providerId === body.originSnapshot.providerId &&
          unit.sourceFileIds.includes(body.sourceFile.id) &&
          owned.state.inventory.some((f) => isDeepStrictEqual(f, body.sourceFile)) &&
          snapshot &&
          isDeepStrictEqual(snapshot, body.originSnapshot),
      );
      const pair =
        item.kind === 'NEW'
          ? createPair(
              {
                body,
                selectedNodes: owned.state.nodes,
                ...(versioned === 4 ? { selectedEdges: owned.state.edges } : {}),
              },
              context,
              body.envelope.version,
            )
          : reprojectPair(
              {
                body,
                originNodes: item.originNodes,
                ...('originEdges' in item
                  ? { originEdges: item.originEdges, currentEdges: owned.state.edges }
                  : {}),
                currentBasis: owned.state.basis,
                currentNodes: owned.state.nodes,
              },
              context,
              body.envelope.version,
            );
      if (item.kind === 'NEW') check(isDeepStrictEqual(pair.metadata.basis, owned.state.basis));
      check(!seen.has(pair.origin.id));
      q(pair.origin.id);
      seen.add(pair.origin.id);
      pairs.push(pair);
    }
    q(pairs);
    pairs.sort((a, b) => (a.origin.id < b.origin.id ? -1 : a.origin.id > b.origin.id ? 1 : 0));
    const state = { ...owned.state, syntaxOrigins: pairs.map((p) => p.metadata) },
      members = pairs.map((p) => p.member);
    q(state);
    q(members);
    const manifest = {
      schemaVersion: 1 as const,
      parent: owned.parent,
      state,
      observation: owned.observation,
      transitions: owned.transitions,
      syntaxMembers: members,
      codeIdentity: state.basis.codeActivationDigest,
      sourceIdentity: syntaxHistoryDigest(
        'codeatlas-activation-source-v1',
        state.inventory,
        context,
      ),
      originRegistryDigest: syntaxHistoryDigest(
        'codeatlas-activation-origins-v1',
        state.snapshots,
        context,
      ),
    };
    q(manifest);
    const activationId =
        'activation:' + syntaxHistoryDigest('codeatlas-activation-history-v1', manifest, context),
      result = {
        manifest,
        activationId,
        origins: pairs.map((p) => p.origin),
        projections: pairs.map((p) => p.projection),
        members,
      };
    q(result);
    return freezeComposition(result);
  } catch (e) {
    if (e instanceof SyntaxHistoryCandidateError) throw e;
    if (e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new SyntaxHistoryCandidateError(e.code);
    throw new SyntaxHistoryCandidateError('INVALID_CANDIDATE');
  }
}

export function createBindingAwareSyntaxHistoryPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return createPair(input, context, 3);
}
export function reprojectBindingAwareSyntaxHistoryPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return reprojectPair(input, context, 3);
}

export function createFrameworkSurfaceSyntaxHistoryPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return createPair(input, context, 4);
}
export function reprojectFrameworkSurfaceSyntaxHistoryPair(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
) {
  return reprojectPair(input, context, 4);
}
