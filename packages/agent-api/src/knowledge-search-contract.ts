import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  basisKey,
  EntityIdSchema,
  Phase1KnowledgeTypeSchema,
  KnowledgeScopeSchema,
  Phase1CoverageSchema,
  Phase1SupportRefsSchema,
  Phase1BasisSchema,
  SourceFreshnessSchema,
  CompilationCurrencySchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const types = z
  .array(Phase1KnowledgeTypeSchema)
  .min(1)
  .max(5)
  .refine((v) => new Set(v).size === v.length)
  .nullable();
export const knowledgeSearchBudgetSchema = z.strictObject({
  maxDepth: z.literal(0),
  maxOutputBytes: positive,
  maxTokens: positive,
});
export const knowledgeSearchRequestSchema = z.strictObject({
  version: z.literal(1),
  mode: z.literal('LEXICAL_PHRASE'),
  text: z.string().refine((v) => v.trim().length > 0),
  scope: z.literal('WORKSPACE'),
  filters: z.strictObject({ types }),
  page: z.strictObject({ limit: positive, cursor: z.null() }),
  budget: knowledgeSearchBudgetSchema,
});
export const knowledgeSearchErrorMessages = Object.freeze({
  INVALID_INPUT: 'Supply valid versioned first-page phrase search arguments.',
  CONTEXT_UNAVAILABLE: 'Use an active server-issued search context.',
  PERMISSION_DENIED: 'The server did not authorize the complete selected search.',
  TOKEN_COUNTER_UNAVAILABLE: 'A matching exact server token measurement is required.',
  BUDGET_EXCEEDED: 'The complete search response cannot fit the effective budget.',
  CANCELLED: 'The search request was cancelled.',
  DEADLINE: 'The search request deadline expired.',
  INDEX_UNAVAILABLE: 'The selected search index is unavailable or changed.',
  DATA_INVALID: 'The selected published search data is invalid.',
  PROVIDER_UNAVAILABLE: 'The required published search provider is unavailable.',
});
export type KnowledgeSearchErrorCode = keyof typeof knowledgeSearchErrorMessages;
const code = z.enum(
  Object.keys(knowledgeSearchErrorMessages) as [
    KnowledgeSearchErrorCode,
    ...KnowledgeSearchErrorCode[],
  ],
);
export const searchProvenanceSchema = z.strictObject({
  attemptId: EntityIdSchema,
  runId: EntityIdSchema,
  snapshotId: EntityIdSchema,
  revisionSetId: EntityIdSchema,
  evaluationId: EntityIdSchema,
});
export const searchHitSchema = z.strictObject({
  ref: z.strictObject({
    kind: z.literal('KNOWLEDGE_ITEM'),
    id: EntityIdSchema,
    revisionId: EntityIdSchema,
  }),
  type: Phase1KnowledgeTypeSchema,
  title: z.string(),
  summary: z.string(),
  goal: z.string(),
  scope: KnowledgeScopeSchema,
  sourceFreshness: SourceFreshnessSchema,
  compilationCurrency: CompilationCurrencySchema,
  coverage: Phase1CoverageSchema,
  supportRefs: Phase1SupportRefsSchema,
  provenance: searchProvenanceSchema,
});
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const success = z.strictObject({
  data: z.strictObject({
    mode: z.literal('LEXICAL_PHRASE'),
    scope: z.literal('WORKSPACE'),
    workspaceId: EntityIdSchema,
    index: z.strictObject({ headDigest: digest, contentDigest: digest }),
    results: z.array(searchHitSchema),
    page: z.strictObject({ hasMore: z.boolean(), nextCursor: z.null() }),
    quality: z.literal('NOT_EVALUABLE'),
    productionQuery: z.literal('NOT_AUTHORIZED'),
  }),
  meta: z.strictObject({
    basisRefs: z.array(Phase1BasisSchema),
    sourceFreshness: SourceFreshnessSchema.nullable(),
    compilationCurrency: CompilationCurrencySchema.nullable(),
    coverage: Phase1CoverageSchema.nullable(),
    warnings: z.array(
      z.enum([
        'OWNED_TEST_ONLY',
        'NO_PRODUCTION_AUTHORITY',
        'LIVE_SOURCE_NOT_OBSERVED',
        'DISPLAY_FIELDS_ONLY',
        'NO_GRAPH_EXPANSION',
        'AFFECTED',
        'STALE',
        'OUTDATED_WORKFLOW',
        'OUTDATED_PROMPT',
        'OUTDATED_MODEL_POLICY',
      ]),
    ),
    truncation: z.strictObject({
      truncated: z.boolean(),
      reasons: z.array(z.literal('MAX_RESULTS')),
      frontier: z.array(z.never()),
    }),
  }),
});
const checkedSuccess = success.superRefine((r, ctx) => {
  const fail = () =>
    ctx.addIssue({ code: 'custom', message: 'Inconsistent owned search metadata' });
  const hits = r.data.results,
    m = r.meta;
  const uniform = <T>(v: T[]): T | null =>
    v.length && v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0]! : null;
  if (
    r.data.page.hasMore !== m.truncation.truncated ||
    JSON.stringify(m.truncation.reasons) !==
      JSON.stringify(r.data.page.hasMore ? ['MAX_RESULTS'] : []) ||
    (r.data.page.hasMore && !hits.length)
  )
    fail();
  if (new Set(hits.map((h) => h.ref.id)).size !== hits.length) fail();
  if (
    JSON.stringify(m.sourceFreshness) !==
      JSON.stringify(uniform(hits.map((h) => h.sourceFreshness))) ||
    JSON.stringify(m.compilationCurrency) !==
      JSON.stringify(uniform(hits.map((h) => h.compilationCurrency))) ||
    JSON.stringify(m.coverage) !== JSON.stringify(uniform(hits.map((h) => h.coverage)))
  )
    fail();
  const expected = new Set(hits.flatMap((h) => h.supportRefs).map((s) => basisKey(s.basis))),
    actual = m.basisRefs.map(basisKey);
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== actual.length ||
    actual.some((k) => !expected.has(k))
  )
    fail();
  if (
    new Set(m.warnings).size !== m.warnings.length ||
    [
      'OWNED_TEST_ONLY',
      'NO_PRODUCTION_AUTHORITY',
      'LIVE_SOURCE_NOT_OBSERVED',
      'DISPLAY_FIELDS_ONLY',
      'NO_GRAPH_EXPANSION',
    ].some((w) => !m.warnings.includes(w as (typeof m.warnings)[number]))
  )
    fail();
});
const failure = z
  .strictObject({ error: z.strictObject({ code, message: z.string() }) })
  .refine((v) => v.error.message === knowledgeSearchErrorMessages[v.error.code]);
export const knowledgeSearchResponseSchema = z.union([checkedSuccess, failure]);
export type KnowledgeSearchResponse = z.infer<typeof knowledgeSearchResponseSchema>;
export type KnowledgeSearchBudget = z.infer<typeof knowledgeSearchBudgetSchema>;
export function knowledgeSearchFailure(code: KnowledgeSearchErrorCode): KnowledgeSearchResponse {
  return Object.freeze({
    error: Object.freeze({ code, message: knowledgeSearchErrorMessages[code] }),
  });
}
export function serializeKnowledgeSearchResponse(
  value: unknown,
  control: RuntimeRequestControl,
): string {
  return canonicalCompilationJson(
    knowledgeSearchResponseSchema.parse(JSON.parse(canonicalCompilationJson(value, control))),
    control,
  );
}
export const knowledgeSearchResponseDigest = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
export function knowledgeSearchWireSchemas() {
  return {
    input: { ...z.toJSONSchema(knowledgeSearchRequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(knowledgeSearchResponseSchema), type: 'object' as const },
  };
}
