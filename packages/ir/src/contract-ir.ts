import { supportKey, entityRefKey, type ScopedRef, type SupportRef } from './phase1-support.js';
import { z } from 'zod';
import { ConfidenceSchema } from './confidence.js';
import { ContractSchema } from './runtime-ir.js';
import { EntityIdSchema } from './ids.js';
import { parseIr } from './validation.js';
import {
  WorkspaceBasisSchema,
  RepoBasisSchema,
  Phase1BasisSchema,
  Phase1DigestSchema,
  Phase1ExactStringSchema as Text,
  ScopedRefSchema,
  Phase1ScopedRefsSchema,
  Phase1SupportRefsSchema,
  ensurePhase1Data,
  parsePhase1Envelope,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertNestedScopedRefs,
  assertSupportRefs,
  assertUnique,
  basisKey,
  scopedRefKey,
  type Phase1ReferenceContext,
} from './phase1-support.js';
export const RepositoryRuntimeBindingSchema = z.strictObject({
  repoBasis: RepoBasisSchema,
  syntaxActivationId: EntityIdSchema,
  syntaxMembershipDigest: Phase1DigestSchema,
  runtimeActivationId: EntityIdSchema,
  runtimeCandidateDigest: Phase1DigestSchema,
});
export type RepositoryRuntimeBinding = z.infer<typeof RepositoryRuntimeBindingSchema>;
const contractRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CONTRACT',
);
const serviceRef = ScopedRefSchema.refine(
  (r) => r.scope === 'WORKSPACE' && r.entity.kind === 'SERVICE',
);
export const ServiceSchema = z
  .strictObject({
    id: EntityIdSchema,
    factKey: Text,
    logicalServiceKey: Text,
    location: z.enum(['WORKSPACE', 'OUTSIDE_WORKSPACE', 'KNOWN_EXTERNAL']),
    repositoryRef: ScopedRefSchema.nullable(),
    supportRefs: Phase1SupportRefsSchema,
  })
  .superRefine((s, c) => {
    if (
      (s.location === 'WORKSPACE') !== (s.repositoryRef !== null) ||
      (s.repositoryRef &&
        (s.repositoryRef.scope !== 'REPOSITORY' || s.repositoryRef.entity.kind !== 'REPOSITORY'))
    )
      c.addIssue({
        code: 'custom',
        message: 'Service location differs from repository registration',
      });
  });
export const ServiceIdentitySchema = z.strictObject({
  id: EntityIdSchema,
  factKey: Text,
  serviceRef,
  sourceBasis: Phase1BasisSchema,
  identityKind: z.enum(['LOGICAL_SERVICE', 'HTTP_ORIGIN', 'MESSAGE_NAMESPACE']),
  namespace: Text,
  key: Text,
  supportRefs: Phase1SupportRefsSchema,
});
export const FrozenServiceCatalogSchema = z.strictObject({
  workspaceBasis: WorkspaceBasisSchema,
  services: z.array(ServiceSchema),
  entries: z.array(ServiceIdentitySchema),
  contractBindings: z.array(
    z.strictObject({ contractRef, serviceRef, supportRefs: Phase1SupportRefsSchema }),
  ),
});
export const FrozenContractSetSchema = z.strictObject({
  workspaceBasis: WorkspaceBasisSchema,
  repositoryBindings: z.array(RepositoryRuntimeBindingSchema),
  catalog: FrozenServiceCatalogSchema,
  contractRefs: z.array(z.strictObject({ ref: contractRef, contract: ContractSchema })),
});
export type FrozenContractSet = z.infer<typeof FrozenContractSetSchema>;
export const ContractMatchSchema = z.strictObject({
  id: EntityIdSchema,
  factKey: Text,
  workspaceBasis: WorkspaceBasisSchema,
  consumerRef: contractRef,
  status: z.enum([
    'MATCHED',
    'AMBIGUOUS',
    'UNRESOLVED',
    'CONFLICTED',
    'OUTSIDE_WORKSPACE',
    'KNOWN_EXTERNAL',
  ]),
  candidateProviderRefs: Phase1ScopedRefsSchema,
  selectedProviderRef: contractRef.nullable(),
  reasons: z.array(Text).min(1),
  supportRefs: Phase1SupportRefsSchema,
  basisRefs: z.array(Phase1BasisSchema).min(1),
  confidence: ConfidenceSchema,
});
export type ContractMatch = z.infer<typeof ContractMatchSchema>;
export function assertRepositoryRuntimeBindings(
  bindings: RepositoryRuntimeBinding[],
  context: Phase1ReferenceContext,
): void {
  assertUnique(bindings.map((b) => b.repoBasis.repositoryId));
  for (const s of context.availableSupports)
    if ('repositoryId' in s.basis) {
      const binding = bindings.find(
        (b) => b.repoBasis.repositoryId === ('repositoryId' in s.basis ? s.basis.repositoryId : ''),
      );
      phase1Assert(binding && basisKey(binding.repoBasis) === basisKey(s.basis));
    }
}
export function parseContractMatch(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope('codeatlas.contract-match', ContractMatchSchema, input);
  const p = result.payload,
    context = parsePhase1ReferenceContext(contextInput);
  assertNestedScopedRefs(p, context);
  assertSupportRefs(p.supportRefs, context);
  assertUnique(p.basisRefs.map(basisKey));
  for (const b of p.basisRefs)
    phase1Assert(p.supportRefs.some((s) => basisKey(s.basis) === basisKey(b)));
  for (const s of p.supportRefs)
    phase1Assert(p.basisRefs.some((b) => basisKey(s.basis) === basisKey(b)));
  for (const r of [p.consumerRef, ...p.candidateProviderRefs]) {
    phase1Assert(
      r.scope === 'REPOSITORY' &&
        r.entity.kind === 'CONTRACT' &&
        p.basisRefs.some(
          (b) =>
            'repositoryId' in b &&
            b.repositoryId === r.repositoryId &&
            b.revisionId === r.entity.revisionId,
        ),
    );
  }
  phase1Assert(
    p.candidateProviderRefs.every((r) => scopedRefKey(r) !== scopedRefKey(p.consumerRef)),
  );
  if (p.status === 'MATCHED')
    phase1Assert(
      p.selectedProviderRef !== null &&
        p.candidateProviderRefs.length === 1 &&
        scopedRefKey(p.selectedProviderRef) === scopedRefKey(p.candidateProviderRefs[0]!),
    );
  else phase1Assert(p.selectedProviderRef === null);
  if (p.status === 'AMBIGUOUS') phase1Assert(p.candidateProviderRefs.length >= 2);
  if (
    p.status === 'UNRESOLVED' ||
    p.status === 'OUTSIDE_WORKSPACE' ||
    p.status === 'KNOWN_EXTERNAL'
  )
    phase1Assert(p.candidateProviderRefs.length === 0);
  return result;
}
export function parseFrozenContractSet(input: unknown, contextInput: unknown): FrozenContractSet {
  ensurePhase1Data(input);
  const p = parseIr(FrozenContractSetSchema, input),
    context = parsePhase1ReferenceContext(contextInput);
  assertRepositoryRuntimeBindings(p.repositoryBindings, context);
  phase1Assert(basisKey(p.workspaceBasis) === basisKey(p.catalog.workspaceBasis));
  assertUnique(p.catalog.services.map((s) => s.id));
  assertUnique(p.catalog.services.map((s) => s.factKey));
  assertUnique(p.catalog.entries.map((s) => s.id));
  assertUnique(p.catalog.entries.map((s) => s.factKey));
  assertUnique(p.contractRefs.map((r) => scopedRefKey(r.ref)));
  const augmented = {
    ...context,
    availableEntities: [
      ...context.availableEntities,
      ...p.catalog.services.map((s) => ({
        scope: 'WORKSPACE' as const,
        workspaceId: p.workspaceBasis.workspaceId,
        entity: { kind: 'SERVICE', id: s.id, revisionId: p.workspaceBasis.revisionSetId },
      })),
    ],
  };
  for (const r of p.contractRefs) {
    phase1Assert(r.ref.scope === 'REPOSITORY');
    const repositoryId = r.ref.repositoryId;
    const b = p.repositoryBindings.find((b) => b.repoBasis.repositoryId === repositoryId);
    phase1Assert(
      b &&
        r.ref.entity.id === r.contract.id &&
        r.ref.entity.revisionId === r.contract.revisionId &&
        basisKey(b.repoBasis) === basisKey(r.contract.basis) &&
        r.contract.repositoryId === b.repoBasis.repositoryId,
    );
    assertNestedScopedRefs(r, augmented);
    assertSupportRefs(r.contract.supportRefs, augmented, r.contract.basis);
  }
  const contractKeys = new Set(p.contractRefs.map((c) => scopedRefKey(c.ref)));
  assertUnique(p.catalog.contractBindings.map((b) => scopedRefKey(b.contractRef)));
  for (const b of p.catalog.contractBindings)
    phase1Assert(contractKeys.has(scopedRefKey(b.contractRef)));
  for (const record of [
    ...p.catalog.services,
    ...p.catalog.entries,
    ...p.catalog.contractBindings,
  ]) {
    assertNestedScopedRefs(record, augmented);
    assertSupportRefs(record.supportRefs, augmented);
  }
  for (const entry of p.catalog.entries)
    phase1Assert(entry.supportRefs.some((s) => basisKey(s.basis) === basisKey(entry.sourceBasis)));
  for (const s of p.catalog.services)
    if (s.repositoryRef) {
      const r = s.repositoryRef;
      phase1Assert(
        r.scope === 'REPOSITORY' &&
          p.repositoryBindings.some(
            (b) =>
              b.repoBasis.repositoryId === r.repositoryId &&
              b.repoBasis.revisionId === r.entity.revisionId,
          ),
      );
    }
  return p;
}

export function frozenContractReferenceContext(raw: FrozenContractSet, extra: SupportRef[] = []) {
  const supports = [
    ...extra,
    ...raw.contractRefs.flatMap((c) => c.contract.supportRefs),
    ...raw.catalog.services.flatMap((s) => s.supportRefs),
    ...raw.catalog.entries.flatMap((s) => s.supportRefs),
    ...raw.catalog.contractBindings.flatMap((s) => s.supportRefs),
  ];
  const membership = new Map<string, SupportRef>();
  for (const s of supports) {
    const key = JSON.stringify([basisKey(s.basis), entityRefKey(s.entity)]),
      old = membership.get(key);
    phase1Assert(!old || supportKey(old) === supportKey(s));
    membership.set(key, s);
  }
  const availableEntities: ScopedRef[] = [];
  for (const s of membership.values()) {
    if ('repositoryId' in s.basis)
      availableEntities.push({
        scope: 'REPOSITORY',
        repositoryId: s.basis.repositoryId,
        entity: s.entity,
      });
    else if ('workspaceId' in s.basis)
      availableEntities.push({
        scope: 'WORKSPACE',
        workspaceId: s.basis.workspaceId,
        entity: s.entity,
      });
    else phase1Assert(false);
  }
  availableEntities.push(...raw.contractRefs.map((c) => c.ref));
  for (const s of raw.catalog.services)
    if (s.repositoryRef) availableEntities.push(s.repositoryRef);
  const unique = new Map(availableEntities.map((r) => [scopedRefKey(r), r]));
  const context = {
    availableEntities: [...unique.values()],
    availableSupports: [...membership.values()],
  };
  return context;
}
