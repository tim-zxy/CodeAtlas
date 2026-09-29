import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EntityIdSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderFactRefSchema,
  ProviderSnapshotSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderFactBinding,
  type ProviderSnapshot,
} from '@codeatlas/ir';
import { z } from 'zod';

import { type NormalizedEdgePair, type NormalizedNodePair } from './canonical-normalizer.js';
import { CanonicalIdentityEncodingError } from './identity-tuple.js';
import { providerEvidenceId } from './provider-evidence-identity.js';

export type FactMergeErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CONTEXT'
  | 'DUPLICATE_SUPPORT'
  | 'FACT_CONFLICT'
  | 'DANGLING_REFERENCE'
  | 'IDENTITY_ENCODING_FAILED';

export class FactMergeError extends Error {
  constructor(
    readonly code: FactMergeErrorCode,
    readonly path: readonly (string | number)[],
  ) {
    super(`Fact merge failed: ${code}`);
    this.name = 'FactMergeError';
  }
}

export interface MergeObservation {
  readonly snapshot: ProviderSnapshot;
  readonly nodes: readonly NormalizedNodePair[];
  readonly edges: readonly NormalizedEdgePair[];
}

export interface MergeInput {
  readonly repositoryId: string;
  readonly revisionId: string;
  readonly observations: readonly MergeObservation[];
}

export interface MergeSupport {
  readonly factType: 'NODE' | 'EDGE';
  readonly canonical: CanonicalNode | CanonicalEdge;
  readonly snapshotId: string;
  readonly inputPath: readonly (string | number)[];
  readonly evidence: Evidence;
  readonly factEvidence: FactEvidence;
  readonly binding: ProviderFactBinding;
}

const PairSchema = <T extends z.ZodType>(schema: T) =>
  z.strictObject({
    provider: ProviderFactRefSchema,
    canonical: schema,
  });
const InputSchema = z.strictObject({
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  observations: z.array(
    z.strictObject({
      snapshot: ProviderSnapshotSchema,
      nodes: z.array(PairSchema(CanonicalNodeSchema)),
      edges: z.array(PairSchema(CanonicalEdgeSchema)),
    }),
  ),
});

function validate<T>(schema: z.ZodType<T>, value: unknown, path: readonly (string | number)[]): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FactMergeError('INVALID_INPUT', [
      ...path,
      ...(parsed.error.issues[0]?.path ?? []).map((part) =>
        typeof part === 'symbol' ? String(part) : part,
      ),
    ]);
  }
  return parsed.data;
}

export function collectMergeSupports(input: MergeInput): readonly MergeSupport[] {
  const validated = validate(InputSchema, input, []);
  const supports: MergeSupport[] = [];
  const providers = new Set<string>();
  const snapshots = new Set<string>();
  const seen = new Set<string>();
  for (const [observationIndex, observation] of validated.observations.entries()) {
    const base = ['observations', observationIndex] as const;
    const { snapshot } = observation;
    if (snapshot.repositoryId !== validated.repositoryId)
      throw new FactMergeError('INVALID_CONTEXT', [...base, 'snapshot', 'repositoryId']);
    if (snapshot.requestedRevisionId !== validated.revisionId)
      throw new FactMergeError('INVALID_CONTEXT', [...base, 'snapshot', 'requestedRevisionId']);
    if (snapshot.outcome !== 'SUCCEEDED')
      throw new FactMergeError('INVALID_CONTEXT', [...base, 'snapshot', 'outcome']);
    if (providers.has(snapshot.providerId))
      throw new FactMergeError('DUPLICATE_SUPPORT', [...base, 'snapshot', 'providerId']);
    providers.add(snapshot.providerId);
    if (snapshots.has(snapshot.id))
      throw new FactMergeError('DUPLICATE_SUPPORT', [...base, 'snapshot', 'id']);
    snapshots.add(snapshot.id);

    for (const factType of ['NODE', 'EDGE'] as const) {
      const field = factType === 'NODE' ? 'nodes' : 'edges';
      for (const [index, pair] of observation[field].entries()) {
        const path = [...base, field, index];
        if (pair.provider.factType !== factType)
          throw new FactMergeError('INVALID_CONTEXT', [...path, 'provider', 'factType']);
        if (pair.provider.providerId !== snapshot.providerId)
          throw new FactMergeError('INVALID_CONTEXT', [...path, 'provider', 'providerId']);
        if (pair.canonical.repositoryId !== validated.repositoryId)
          throw new FactMergeError('INVALID_CONTEXT', [...path, 'canonical', 'repositoryId']);
        if (pair.canonical.revisionId !== validated.revisionId)
          throw new FactMergeError('INVALID_CONTEXT', [...path, 'canonical', 'revisionId']);
        const unique = JSON.stringify([
          snapshot.id,
          factType,
          pair.provider.providerId,
          pair.provider.providerFactId,
        ]);
        if (seen.has(unique))
          throw new FactMergeError('DUPLICATE_SUPPORT', [...path, 'provider', 'providerFactId']);
        seen.add(unique);
        let evidenceId;
        try {
          evidenceId = providerEvidenceId(
            validated.repositoryId,
            validated.revisionId,
            snapshot.id,
            factType,
            pair.provider.providerId,
            pair.provider.providerFactId,
          );
        } catch (error) {
          if (error instanceof CanonicalIdentityEncodingError) {
            const fieldPaths = [
              ['repositoryId'],
              ['revisionId'],
              [...base, 'snapshot', 'id'],
              [...path, 'provider', 'factType'],
              [...path, 'provider', 'providerId'],
              [...path, 'provider', 'providerFactId'],
            ];
            throw new FactMergeError(
              'IDENTITY_ENCODING_FAILED',
              fieldPaths[error.fieldIndex] ?? path,
            );
          }
          throw new FactMergeError('INVALID_INPUT', path);
        }
        const fact = { factType, id: pair.canonical.id };
        const evidence = validate(
          EvidenceSchema,
          {
            id: evidenceId,
            repositoryId: validated.repositoryId,
            revisionId: validated.revisionId,
            providerSnapshotId: snapshot.id,
            providerFact: pair.provider,
            status: 'ACTIVE',
          },
          path,
        );
        const factEvidence = validate(FactEvidenceSchema, { fact, evidenceId }, path);
        const binding = validate(
          ProviderFactBindingSchema,
          {
            providerFact: pair.provider,
            providerSnapshotId: snapshot.id,
            canonicalFact: fact,
            evidenceId,
          },
          path,
        );
        supports.push({
          factType,
          canonical: pair.canonical,
          snapshotId: snapshot.id,
          inputPath: path,
          evidence,
          factEvidence,
          binding,
        });
      }
    }
  }
  return supports;
}
