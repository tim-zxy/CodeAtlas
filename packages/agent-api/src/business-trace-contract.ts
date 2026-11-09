import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  EntityIdSchema,
  Phase1BasisSchema,
  Phase1CoverageSchema,
  Phase1ExactStringSchema,
  Phase1ScopedRefsSchema,
  Phase1SupportRefsSchema,
  SourceFreshnessSchema,
  CompilationCurrencySchema,
  basisKey,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';

const nonnegative = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .refine((v) => !Object.is(v, -0));
const positive = nonnegative.refine((v) => v > 0);
export const businessTraceBudgetSchema = z.strictObject({
  maxDepth: nonnegative,
  maxSteps: positive,
  maxEdges: positive,
  maxOutputBytes: positive,
  maxTokens: positive,
});
export const businessTraceStartRefSchema = z.strictObject({
  kind: z.literal('KNOWLEDGE_ITEM'),
  id: EntityIdSchema,
  revisionId: EntityIdSchema,
});
export const businessTraceRequestSchema = z.union([
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('BUSINESS'),
    startRef: businessTraceStartRefSchema,
    startStepKey: Phase1ExactStringSchema,
    direction: z.enum(['FORWARD', 'BACKWARD']),
    budget: businessTraceBudgetSchema,
  }),
  z.strictObject({ version: z.literal(1), kind: z.enum(['CODE', 'EXECUTION', 'RUNTIME']) }),
]);
export type BusinessTraceArguments = z.infer<typeof businessTraceRequestSchema>;
export type BusinessTraceBudget = z.infer<typeof businessTraceBudgetSchema>;
export const businessTraceErrorMessages = Object.freeze({
  INVALID_INPUT: 'Supply valid versioned BUSINESS trace arguments.',
  FEATURE_UNAVAILABLE: 'This trace kind is not available.',
  CONTEXT_UNAVAILABLE: 'Use an active server-issued trace context.',
  PERMISSION_DENIED: 'The server did not authorize the complete selected read.',
  TOKEN_COUNTER_UNAVAILABLE: 'A matching exact server token measurement is required.',
  BUDGET_EXCEEDED: 'The complete trace response cannot fit the effective budget.',
  CANCELLED: 'The trace request was cancelled.',
  DEADLINE: 'The trace request deadline expired.',
  NOT_FOUND: 'The selected published business flow or step is unavailable.',
  DATA_INVALID: 'The selected published trace data is invalid.',
  PROVIDER_UNAVAILABLE: 'The required published read provider is unavailable.',
});
export type BusinessTraceErrorCode = keyof typeof businessTraceErrorMessages;
const errorCode = z.enum(
  Object.keys(businessTraceErrorMessages) as [BusinessTraceErrorCode, ...BusinessTraceErrorCode[]],
);
const reason = z.enum(['MAX_DEPTH', 'MAX_STEPS', 'MAX_EDGES']);
const frontier = z.strictObject({
  fromStepKey: Phase1ExactStringSchema,
  toStepKey: Phase1ExactStringSchema,
  depth: nonnegative,
  reason,
});
export const businessTraceWarningCodes = [
  'LIVE_SOURCE_NOT_OBSERVED',
  'DECLARED_BUSINESS_STEPS_ONLY',
  'NO_QUALITY_ADMISSION',
  'HISTORICAL_PUBLISHED_REVISION',
  'FRESH',
  'AFFECTED',
  'STALE',
  'CURRENT',
  'OUTDATED_WORKFLOW',
  'OUTDATED_PROMPT',
  'OUTDATED_MODEL_POLICY',
  'OWNED_TEST_ONLY',
  'NO_PRODUCTION_AUTHORITY',
  'UNCLASSIFIED_WARNING',
] as const;
const successSchema = z
  .strictObject({
    data: z.strictObject({
      kind: z.literal('BUSINESS'),
      startRef: businessTraceStartRefSchema,
      startStepKey: Phase1ExactStringSchema,
      direction: z.enum(['FORWARD', 'BACKWARD']),
      title: Phase1ExactStringSchema,
      goal: Phase1ExactStringSchema,
      steps: z
        .array(
          z.strictObject({
            stepKey: Phase1ExactStringSchema,
            action: Phase1ExactStringSchema,
            supportRefs: Phase1SupportRefsSchema,
            depth: nonnegative,
          }),
        )
        .min(1),
      edges: z.array(
        z.strictObject({
          fromStepKey: Phase1ExactStringSchema,
          toStepKey: Phase1ExactStringSchema,
        }),
      ),
      currentHeadRevisionId: EntityIdSchema,
      isCurrentHead: z.boolean(),
      participants: Phase1ScopedRefsSchema,
      runtimeFlowRefs: Phase1ScopedRefsSchema,
      supportRefs: Phase1SupportRefsSchema,
      provenance: z.strictObject({
        attemptId: EntityIdSchema,
        runId: EntityIdSchema,
        snapshotId: EntityIdSchema,
        revisionSetId: EntityIdSchema,
        evaluationId: EntityIdSchema,
      }),
      limitations: z.array(Phase1ExactStringSchema),
      quality: z.literal('NOT_EVALUABLE'),
      productionQuery: z.literal('NOT_AUTHORIZED'),
    }),
    meta: z.strictObject({
      basisRefs: z.array(Phase1BasisSchema).min(1),
      sourceFreshness: SourceFreshnessSchema,
      compilationCurrency: CompilationCurrencySchema,
      coverage: Phase1CoverageSchema,
      warnings: z.array(z.enum(businessTraceWarningCodes)),
      truncation: z.strictObject({
        truncated: z.boolean(),
        reasons: z.array(reason),
        frontier: z.array(frontier),
      }),
    }),
  })
  .superRefine((value, ctx) => {
    const fail = () =>
        ctx.addIssue({ code: 'custom', message: 'Inconsistent public trace association' }),
      d = value.data,
      m = value.meta;
    const keys = new Set(d.steps.map((s) => s.stepKey));
    if (keys.size !== d.steps.length || !keys.has(d.startStepKey)) fail();
    if (d.isCurrentHead !== (d.currentHeadRevisionId === d.startRef.revisionId)) fail();
    if (!d.isCurrentHead && !m.warnings.includes('HISTORICAL_PUBLISHED_REVISION')) fail();
    if (
      new Set(m.warnings).size !== m.warnings.length ||
      !m.warnings.includes('OWNED_TEST_ONLY') ||
      !m.warnings.includes('NO_PRODUCTION_AUTHORITY')
    )
      fail();
    const edges = new Set<string>();
    for (const edge of d.edges) {
      const key = JSON.stringify([edge.fromStepKey, edge.toStepKey]);
      if (edges.has(key) || !keys.has(edge.fromStepKey) || !keys.has(edge.toStepKey)) fail();
      edges.add(key);
    }
    for (const item of m.truncation.frontier)
      if (!keys.has(d.direction === 'FORWARD' ? item.fromStepKey : item.toStepKey)) fail();
    const reasons = [...new Set(m.truncation.frontier.map((f) => f.reason))].sort();
    if (
      m.truncation.truncated !== m.truncation.frontier.length > 0 ||
      JSON.stringify([...m.truncation.reasons].sort()) !== JSON.stringify(reasons)
    )
      fail();
    const expected = new Set(
        [...d.supportRefs, ...d.steps.flatMap((s) => s.supportRefs)].map((s) => basisKey(s.basis)),
      ),
      actual = m.basisRefs.map(basisKey);
    if (
      actual.length !== expected.size ||
      new Set(actual).size !== actual.length ||
      actual.some((k) => !expected.has(k))
    )
      fail();
  });
const failureSchema = z
  .strictObject({ error: z.strictObject({ code: errorCode, message: z.string() }) })
  .superRefine((value, ctx) => {
    if (value.error.message !== businessTraceErrorMessages[value.error.code])
      ctx.addIssue({ code: 'custom', message: 'Unsafe error message' });
  });
export const businessTraceResponseSchema = z.union([successSchema, failureSchema]);
export type BusinessTraceResponse = z.infer<typeof businessTraceResponseSchema>;
export type BusinessTraceSuccess = z.infer<typeof successSchema>;
export function serializeBusinessTraceResponse(
  value: unknown,
  control: RuntimeRequestControl,
): string {
  const owned = JSON.parse(canonicalCompilationJson(value, control));
  return canonicalCompilationJson(businessTraceResponseSchema.parse(owned), control);
}
export const businessTraceResponseDigest = (serializedResponse: string): string =>
  createHash('sha256').update(serializedResponse, 'utf8').digest('hex');
export function businessTraceFailure(code: BusinessTraceErrorCode): BusinessTraceResponse {
  return Object.freeze({
    error: Object.freeze({ code, message: businessTraceErrorMessages[code] }),
  });
}

/** Generate wire schemas with this package's own Zod instance; do not cross-cast Zod versions. */
export function businessTraceWireSchemas() {
  return {
    input: { ...z.toJSONSchema(businessTraceRequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(businessTraceResponseSchema), type: 'object' as const },
  };
}
