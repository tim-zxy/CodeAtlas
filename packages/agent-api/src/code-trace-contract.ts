import { z } from 'zod';
import {
  CanonicalIdSchema,
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  EntityIdSchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { parseCodeQueryEnvelope } from '@codeatlas/application';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  symbolUnderstandingBudgetSchema,
  symbolUnderstandingEngineeringResultSchema,
  symbolUnderstandingErrorMessages,
  symbolUnderstandingResponseDigest,
  type SymbolUnderstandingErrorCode,
} from './symbol-understanding-contract.js';
const depth = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .refine((n) => !Object.is(n, -0));
export const codeTraceBudgetSchema = symbolUnderstandingBudgetSchema.extend({ maxDepth: depth });
export const codeTraceRequestSchema = z.strictObject({
  version: z.literal(2),
  kind: z.literal('CODE'),
  symbolId: CanonicalIdSchema,
  expectedRevisionId: EntityIdSchema,
  direction: z.literal('OUTGOING_CALLS'),
  budget: codeTraceBudgetSchema,
});
const engineeringResult = symbolUnderstandingEngineeringResultSchema.extend({
  payload: symbolUnderstandingEngineeringResultSchema.shape.payload
    .omit({ symbol: true, incoming: true, outgoing: true })
    .extend({
      operation: z.literal('CODE_TRACE'),
      nodes: z.array(z.strictObject({ node: CanonicalNodeSchema, depth })).min(1),
      edges: z.array(CanonicalEdgeSchema),
    }),
});
const warnings = [
  'OWNED_TEST_ONLY',
  'NO_PRODUCTION_AUTHORITY',
  'KNOWLEDGE_META_NOT_APPLICABLE',
  'WORKTREE_NOT_OBSERVED',
] as const;
const success = z
  .strictObject({
    data: z.strictObject({
      kind: z.literal('CODE'),
      queryVersion: z.literal(2),
      direction: z.literal('OUTGOING_CALLS'),
      relationshipSemantics: z.literal('STATIC_CALLS_NOT_RUNTIME'),
      workspaceId: EntityIdSchema,
      repositoryId: EntityIdSchema,
      engineeringResult,
      quality: z.literal('NOT_EVALUABLE'),
      productionQuery: z.literal('NOT_AUTHORIZED'),
    }),
    meta: z.strictObject({
      basisRefs: z.null(),
      sourceFreshness: z.null(),
      compilationCurrency: z.null(),
      coverage: z.null(),
      warnings: z.array(z.enum(warnings)),
      truncation: z.strictObject({
        truncated: z.boolean(),
        reasons: symbolUnderstandingEngineeringResultSchema.shape.payload.shape.truncation,
        frontier: z.null(),
      }),
    }),
  })
  .superRefine((r, ctx) => {
    const fail = () => ctx.addIssue({ code: 'custom', message: 'Invalid exact static code trace' });
    try {
      parseCodeQueryEnvelope(r.data.engineeringResult);
    } catch {
      fail();
    }
    if (
      r.data.repositoryId !== r.data.engineeringResult.payload.repositoryId ||
      JSON.stringify(r.meta.truncation.reasons) !==
        JSON.stringify(r.data.engineeringResult.payload.truncation) ||
      r.meta.truncation.truncated !== r.meta.truncation.reasons.length > 0 ||
      r.meta.warnings.length !== warnings.length ||
      new Set(r.meta.warnings).size !== warnings.length ||
      warnings.some((w) => !r.meta.warnings.includes(w))
    )
      fail();
  });
export const codeTraceErrorMessages = symbolUnderstandingErrorMessages;
export type CodeTraceErrorCode = SymbolUnderstandingErrorCode;
const errorCode = z.enum(
  Object.keys(codeTraceErrorMessages) as [CodeTraceErrorCode, ...CodeTraceErrorCode[]],
);
const failure = z
  .strictObject({ error: z.strictObject({ code: errorCode, message: z.string() }) })
  .refine((v) => v.error.message === codeTraceErrorMessages[v.error.code]);
export const codeTraceResponseSchema = z.union([success, failure]);
export type CodeTraceBudget = z.infer<typeof codeTraceBudgetSchema>;
export type CodeTraceResponse = z.infer<typeof codeTraceResponseSchema>;
export const codeTraceResponseDigest = symbolUnderstandingResponseDigest;
export function codeTraceFailure(code: CodeTraceErrorCode): CodeTraceResponse {
  return Object.freeze({ error: Object.freeze({ code, message: codeTraceErrorMessages[code] }) });
}
export function serializeCodeTraceResponse(value: unknown, c: RuntimeRequestControl) {
  return canonicalCompilationJson(
    codeTraceResponseSchema.parse(JSON.parse(canonicalCompilationJson(value, c))),
    c,
  );
}
export function codeTraceWireSchemas() {
  return {
    input: { ...z.toJSONSchema(codeTraceRequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(codeTraceResponseSchema), type: 'object' as const },
  };
}
