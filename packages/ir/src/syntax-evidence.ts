import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { SourceRangeSchema } from './references.js';
import { ConfidenceSchema, ResolutionLevelSchema } from './confidence.js';
import { ContentFingerprintSchema } from './source-identity.js';

import {
  Phase1ExactStringSchema as Text,
  ScopedRefSchema,
  Phase1ScopedRefsSchema,
  Phase1SupportRefsSchema,
  parsePhase1Envelope,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertSupportRefs,
  assertNestedScopedRefs,
  type RepoBasis,
} from './phase1-support.js';
export type SyntaxValue =
  | { kind: 'STRING'; value: string }
  | { kind: 'NUMBER'; value: number }
  | { kind: 'BOOLEAN'; value: boolean }
  | { kind: 'NULL' }
  | {
      kind: 'REFERENCE';
      name: string;
      resolution: z.infer<typeof ResolutionLevelSchema>;
      candidates: z.infer<typeof ScopedRefSchema>[];
    }
  | { kind: 'ARRAY'; items: SyntaxValue[] }
  | { kind: 'OBJECT'; entries: { name: string; value: SyntaxValue }[] }
  | { kind: 'UNKNOWN'; reason: string };
export const SyntaxValueSchema: z.ZodType<SyntaxValue> = z.lazy(() =>
  z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('STRING'), value: z.string() }),
      z.strictObject({
        kind: z.literal('NUMBER'),
        value: z
          .number()
          .finite()
          .refine((v) => !Object.is(v, -0)),
      }),
      z.strictObject({ kind: z.literal('BOOLEAN'), value: z.boolean() }),
      z.strictObject({ kind: z.literal('NULL') }),
      z.strictObject({
        kind: z.literal('REFERENCE'),
        name: Text,
        resolution: ResolutionLevelSchema,
        candidates: Phase1ScopedRefsSchema,
      }),
      z.strictObject({ kind: z.literal('ARRAY'), items: z.array(SyntaxValueSchema) }),
      z.strictObject({
        kind: z.literal('OBJECT'),
        entries: z.array(z.strictObject({ name: Text, value: SyntaxValueSchema })),
      }),
      z.strictObject({ kind: z.literal('UNKNOWN'), reason: Text }),
    ])
    .superRefine((value, ctx) => {
      if (value.kind === 'REFERENCE') {
        const resolved = value.resolution === 'EXACT' || value.resolution === 'HEURISTIC';
        if (
          (resolved && value.candidates.length !== 1) ||
          (value.resolution === 'AMBIGUOUS' && value.candidates.length < 2)
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Reference candidates disagree with resolution',
          });
        if (value.candidates.some((ref) => ref.entity.kind !== 'CODE_NODE'))
          ctx.addIssue({ code: 'custom', message: 'Syntax reference requires code owner' });
      }
    }),
);
export const SyntaxCalleeSchema = z
  .strictObject({
    state: z.enum(['RESOLVED', 'NON_RESOLVED']),
    name: Text,
    target: ScopedRefSchema.nullable(),
    candidates: Phase1ScopedRefsSchema,
  })
  .superRefine((v, c) => {
    if (
      (v.state === 'RESOLVED') !== (v.target !== null) ||
      (v.state === 'RESOLVED' && v.candidates.length !== 0)
    )
      c.addIssue({ code: 'custom', message: 'Callee resolution differs from target' });
  });
export const SyntaxArgumentSchema = z.strictObject({
  name: Text.nullable(),
  value: SyntaxValueSchema,
  sourceRange: SourceRangeSchema,
});
const common = {
  id: EntityIdSchema,
  syntaxKey: Text,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  sourceFingerprint: ContentFingerprintSchema,
  sourceRange: SourceRangeSchema,
  owner: ScopedRefSchema.nullable(),
  supportRefs: Phase1SupportRefsSchema,
  confidence: ConfidenceSchema,
  extractionVersion: Text,
};
export const SyntaxEvidenceSchema = z.discriminatedUnion('syntaxKind', [
  z.strictObject({
    ...common,
    syntaxKind: z.literal('DECORATION'),
    payload: z.strictObject({
      callee: SyntaxCalleeSchema,
      arguments: z.array(SyntaxArgumentSchema),
    }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('INVOCATION'),
    payload: z.strictObject({
      callee: SyntaxCalleeSchema,
      receiver: SyntaxValueSchema.nullable(),
      arguments: z.array(SyntaxArgumentSchema),
    }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('DECLARATION'),
    payload: z.strictObject({
      declaredType: Text.nullable(),
      parameterNames: z.array(Text),
      modifiers: z.array(Text),
    }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('ASSIGNMENT'),
    payload: z.strictObject({ targetName: Text, value: SyntaxValueSchema }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('ARTIFACT'),
    payload: z.strictObject({
      mediaType: Text,
      logicalPath: Text,
      contentDigest: Text,
      declaredValues: z.array(z.strictObject({ name: Text, value: SyntaxValueSchema })),
    }),
  }),
]);
export type SyntaxEvidence = z.infer<typeof SyntaxEvidenceSchema>;
export function parseSyntaxEvidence(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope('codeatlas.syntax-evidence', SyntaxEvidenceSchema, input);
  const value = result.payload,
    context = parsePhase1ReferenceContext(contextInput);
  const basis = value.supportRefs[0]!.basis;
  phase1Assert(
    'repositoryId' in basis &&
      basis.repositoryId === value.repositoryId &&
      basis.revisionId === value.revisionId,
  );
  assertSupportRefs(value.supportRefs, context, basis as RepoBasis);
  assertNestedScopedRefs(value, context);
  if (value.owner)
    phase1Assert(
      value.owner.scope === 'REPOSITORY' &&
        value.owner.repositoryId === value.repositoryId &&
        value.owner.entity.kind === 'CODE_NODE' &&
        value.owner.entity.revisionId === value.revisionId,
    );
  phase1Assert(
    context.availableEntities.some(
      (ref) =>
        ref.scope === 'REPOSITORY' &&
        ref.repositoryId === value.repositoryId &&
        ref.entity.kind === 'SOURCE_FILE' &&
        ref.entity.id === value.sourceRange.sourceFileId &&
        ref.entity.revisionId === value.revisionId,
    ),
  );
  function sameFile(v: unknown): void {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const child of v) sameFile(child);
      return;
    }
    const record = v as Record<string, unknown>;
    if (Object.hasOwn(record, 'sourceRange')) {
      const range = SourceRangeSchema.parse(record.sourceRange);
      phase1Assert(range.sourceFileId === value.sourceRange.sourceFileId);
    }
    for (const child of Object.values(record)) sameFile(child);
  }
  sameFile(value.payload);
  return result;
}
