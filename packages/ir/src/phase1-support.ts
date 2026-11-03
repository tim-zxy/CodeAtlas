import { types } from 'node:util';
import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { EntityRefSchema } from './references.js';
import { ContentFingerprintSchema } from './source-identity.js';
import { JsonValueSchema, parseSchemaEnvelope, type JsonValue } from './envelope.js';
import { IrValidationError } from './errors.js';
import { parseIr } from './validation.js';

export const Phase1ExactStringSchema = z
  .string()
  .min(1)
  .refine((v) => v.trim() === v);
export const Phase1DigestSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .brand<'Phase1Digest'>();
export const Phase1OrdinalSchema = z
  .number()
  .int()
  .nonnegative()
  .safe()
  .refine((v) => !Object.is(v, -0));
export const RuntimeEntityIdSchema = EntityIdSchema.brand<'RuntimeEntityId'>();
export type RuntimeEntityId = z.infer<typeof RuntimeEntityIdSchema>;
export const DocumentIdSchema = EntityIdSchema.brand<'DocumentId'>();
export type DocumentId = z.infer<typeof DocumentIdSchema>;
export const DocumentRevisionIdSchema = EntityIdSchema.brand<'DocumentRevisionId'>();
export type DocumentRevisionId = z.infer<typeof DocumentRevisionIdSchema>;
export const KnowledgeItemIdSchema = EntityIdSchema.brand<'KnowledgeItemId'>();
export type KnowledgeItemId = z.infer<typeof KnowledgeItemIdSchema>;
export const KnowledgeRevisionIdSchema = EntityIdSchema.brand<'KnowledgeRevisionId'>();
export type KnowledgeRevisionId = z.infer<typeof KnowledgeRevisionIdSchema>;

export const RepoBasisSchema = z.strictObject({
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  contentFingerprint: ContentFingerprintSchema,
  codeActivationDigest: Phase1DigestSchema,
});
export type RepoBasis = z.infer<typeof RepoBasisSchema>;
export const DocumentBasisSchema = z.strictObject({
  documentId: DocumentIdSchema,
  documentRevisionId: DocumentRevisionIdSchema,
  contentFingerprint: ContentFingerprintSchema,
});
export const WorkspaceBasisSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  revisionSetId: EntityIdSchema,
  workspaceActivationDigest: Phase1DigestSchema,
});
export const Phase1BasisSchema = z.union([
  RepoBasisSchema,
  DocumentBasisSchema,
  WorkspaceBasisSchema,
]);
export const ScopedRefSchema = z.discriminatedUnion('scope', [
  z.strictObject({
    scope: z.literal('REPOSITORY'),
    repositoryId: EntityIdSchema,
    entity: EntityRefSchema,
  }),
  z.strictObject({
    scope: z.literal('WORKSPACE'),
    workspaceId: EntityIdSchema,
    entity: EntityRefSchema,
  }),
]);
export type ScopedRef = z.infer<typeof ScopedRefSchema>;
export const Phase1ScopedRefsSchema = z.array(ScopedRefSchema).superRefine((refs, ctx) => {
  if (new Set(refs.map(scopedRefKey)).size !== refs.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate entity reference' });
});
export const SupportRefSchema = z
  .strictObject({
    basis: Phase1BasisSchema,
    entity: EntityRefSchema,
    valueDigest: Phase1DigestSchema,
  })
  .superRefine((value, ctx) => {
    const expected =
      'repositoryId' in value.basis
        ? value.basis.revisionId
        : 'documentId' in value.basis
          ? value.basis.documentRevisionId
          : value.basis.revisionSetId;
    if (value.entity.revisionId !== expected)
      ctx.addIssue({
        code: 'custom',
        path: ['entity', 'revisionId'],
        message: 'Support revision differs from basis',
      });
  });
export type SupportRef = z.infer<typeof SupportRefSchema>;
export const Phase1SupportRefsSchema = z
  .array(SupportRefSchema)
  .min(1)
  .superRefine((refs, ctx) => {
    if (new Set(refs.map(supportKey)).size !== refs.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate support' });
  });
export const KnowledgeScopeSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('REPOSITORY'), repositoryId: EntityIdSchema }),
    z.strictObject({ kind: z.literal('WORKSPACE'), workspaceId: EntityIdSchema }),
    z.strictObject({
      kind: z.literal('CROSS_REPO'),
      workspaceId: EntityIdSchema,
      repositoryIds: z.array(EntityIdSchema).min(2),
    }),
  ])
  .superRefine((scope, ctx) => {
    if (
      scope.kind === 'CROSS_REPO' &&
      new Set(scope.repositoryIds).size !== scope.repositoryIds.length
    )
      ctx.addIssue({ code: 'custom', path: ['repositoryIds'], message: 'Duplicate repository' });
  });
export const Phase1CoverageSchema = z
  .strictObject({
    status: z.enum(['COMPLETE', 'PARTIAL', 'UNSUPPORTED']),
    limitations: z.array(Phase1ExactStringSchema),
    unverifiedRefs: z.array(ScopedRefSchema),
  })
  .superRefine((coverage, ctx) => {
    if (
      coverage.status === 'COMPLETE' &&
      (coverage.limitations.length || coverage.unverifiedRefs.length)
    )
      ctx.addIssue({ code: 'custom', message: 'Complete coverage cannot hide limitations' });
  });
export const Phase1ReferenceContextSchema = z
  .strictObject({
    availableEntities: z.array(ScopedRefSchema),
    availableSupports: z.array(SupportRefSchema),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.availableEntities.map(scopedRefKey)).size !== value.availableEntities.length)
      ctx.addIssue({
        code: 'custom',
        path: ['availableEntities'],
        message: 'Duplicate entity reference',
      });
    if (new Set(value.availableSupports.map(supportKey)).size !== value.availableSupports.length)
      ctx.addIssue({
        code: 'custom',
        path: ['availableSupports'],
        message: 'Duplicate support reference',
      });
  });
export type Phase1ReferenceContext = z.infer<typeof Phase1ReferenceContextSchema>;
export function phase1Assert(value: unknown): asserts value {
  if (!value)
    throw new IrValidationError([{ path: [], message: 'Invalid Phase1 reference or value' }]);
}
export function ensurePhase1Data(input: unknown): void {
  const ancestors = new Set<object>();
  function visit(value: unknown): void {
    if (value === null || typeof value !== 'object') {
      phase1Assert(
        value === null ||
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)),
      );
      return;
    }
    phase1Assert(!types.isProxy(value) && !ancestors.has(value));
    const array = Array.isArray(value);
    phase1Assert(
      array
        ? Object.getPrototypeOf(value) === Array.prototype
        : Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null,
    );
    const descriptors = Object.getOwnPropertyDescriptors(value);
    phase1Assert(Reflect.ownKeys(value).every((k) => typeof k === 'string'));
    if (array) {
      phase1Assert(Object.keys(descriptors).length === value.length + 1);
      for (let i = 0; i < value.length; i++) phase1Assert(Object.hasOwn(descriptors, String(i)));
    }
    ancestors.add(value);
    for (const [key, d] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      phase1Assert(Object.hasOwn(d, 'value') && d.enumerable);
      visit(d.value);
    }
    ancestors.delete(value);
  }
  try {
    visit(input);
  } catch {
    phase1Assert(false);
  }
  parseIr(JsonValueSchema, input);
}
export function parsePhase1Envelope<T extends z.ZodType>(
  schema: string,
  payload: T,
  input: unknown,
): { schema: string; version: number; payload: z.output<T> } {
  ensurePhase1Data(input);
  // Existing optional EntityRef fields include undefined in TypeScript, although
  // their runtime schema and the envelope's before/after JSON checks reject it.
  // Keep the narrow cast at this checked boundary, preserving each schema's output.
  return parseSchemaEnvelope(
    { schema, version: 1, payload: payload as unknown as z.ZodType<JsonValue> },
    input,
  ) as { schema: string; version: number; payload: z.output<T> };
}
export function parsePhase1ReferenceContext(input: unknown): Phase1ReferenceContext {
  ensurePhase1Data(input);
  return parseIr(Phase1ReferenceContextSchema, input);
}
export function entityRefKey(ref: z.infer<typeof EntityRefSchema>): string {
  return JSON.stringify([ref.kind, ref.id, ref.revisionId ?? null]);
}
export function scopedRefKey(ref: ScopedRef): string {
  return JSON.stringify([
    ref.scope,
    ref.scope === 'REPOSITORY' ? ref.repositoryId : ref.workspaceId,
    entityRefKey(ref.entity),
  ]);
}
export function basisKey(basis: z.infer<typeof Phase1BasisSchema>): string {
  return 'repositoryId' in basis
    ? JSON.stringify([
        'REPOSITORY',
        basis.repositoryId,
        basis.revisionId,
        basis.contentFingerprint,
        basis.codeActivationDigest,
      ])
    : 'documentId' in basis
      ? JSON.stringify([
          'DOCUMENT',
          basis.documentId,
          basis.documentRevisionId,
          basis.contentFingerprint,
        ])
      : JSON.stringify([
          'WORKSPACE',
          basis.workspaceId,
          basis.revisionSetId,
          basis.workspaceActivationDigest,
        ]);
}
export function supportKey(ref: SupportRef): string {
  return JSON.stringify([basisKey(ref.basis), entityRefKey(ref.entity), ref.valueDigest]);
}
export function assertScopedRef(ref: ScopedRef, context: Phase1ReferenceContext): void {
  phase1Assert(
    context.availableEntities.some((known) => scopedRefKey(known) === scopedRefKey(ref)),
  );
}
export function assertSupportRefs(
  refs: SupportRef[],
  context: Phase1ReferenceContext,
  expectedBasis?: RepoBasis,
): void {
  phase1Assert(refs.length > 0);
  const available = new Set(context.availableSupports.map(supportKey));
  for (const ref of refs) {
    phase1Assert(available.has(supportKey(ref)));
    if (expectedBasis) phase1Assert(basisKey(ref.basis) === basisKey(expectedBasis));
    phase1Assert(
      context.availableEntities.some(
        (known) =>
          entityRefKey(known.entity) === entityRefKey(ref.entity) &&
          (!('repositoryId' in ref.basis) ||
            (known.scope === 'REPOSITORY' && known.repositoryId === ref.basis.repositoryId)) &&
          (!('workspaceId' in ref.basis) ||
            (known.scope === 'WORKSPACE' && known.workspaceId === ref.basis.workspaceId)),
      ),
    );
  }
}
export function assertNestedScopedRefs(value: unknown, context: Phase1ReferenceContext): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) assertNestedScopedRefs(child, context);
    return;
  }
  const object = value as Record<string, unknown>;
  if (
    (object.scope === 'REPOSITORY' || object.scope === 'WORKSPACE') &&
    Object.hasOwn(object, 'entity')
  ) {
    assertScopedRef(object as ScopedRef, context);
    return;
  }
  for (const child of Object.values(object)) assertNestedScopedRefs(child, context);
}
export function assertUnique(values: readonly (string | number)[]): void {
  phase1Assert(new Set(values).size === values.length);
}
