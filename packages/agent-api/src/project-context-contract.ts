import { z } from 'zod';
import {
  basisKey,
  Phase1BasisSchema,
  SourceFreshnessSchema,
  CompilationCurrencySchema,
  Phase1CoverageSchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  knowledgeSearchBudgetSchema,
  searchHitSchema,
  knowledgeSearchResponseDigest,
} from './knowledge-search-contract.js';
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const projectContextBudgetSchema = knowledgeSearchBudgetSchema.extend({
  maxItems: positive,
});
export const projectContextRequestSchema = z.strictObject({
  version: z.literal(1),
  depth: z.literal('L0'),
  budget: projectContextBudgetSchema,
});
// Wire refs use existing item/revision identity, without introducing a new Canonical model.
const selectedRef = z.strictObject({
  itemId: searchHitSchema.shape.ref.shape.id,
  revisionId: searchHitSchema.shape.ref.shape.revisionId,
});
export const projectContextItemSchema = searchHitSchema
  .omit({ goal: true })
  .extend({ summarySource: z.enum(['SUMMARY', 'GOAL', 'NONE']) });
const warning = z.enum([
  'OWNED_TEST_ONLY',
  'NO_PRODUCTION_AUTHORITY',
  'EXPLICIT_SELECTION_ONLY',
  'CURRENT_PUBLISHED_HEADS_ONLY',
  'LIVE_SOURCE_NOT_OBSERVED',
  'NO_SELECTED_KNOWLEDGE',
  'SELECTED_CURRENT_REVISION_UNAVAILABLE',
  'AFFECTED',
  'STALE',
  'OUTDATED_WORKFLOW',
  'OUTDATED_PROMPT',
  'OUTDATED_MODEL_POLICY',
]);
export const projectContextErrorMessages = Object.freeze({
  INVALID_INPUT: 'Supply valid versioned L0 context arguments.',
  CONTEXT_UNAVAILABLE: 'Use an active server-issued project context.',
  PERMISSION_DENIED: 'The server did not authorize the complete selected context.',
  TOKEN_COUNTER_UNAVAILABLE: 'A matching exact server token measurement is required.',
  BUDGET_EXCEEDED: 'The complete project context cannot fit the effective budget.',
  CANCELLED: 'The project context request was cancelled.',
  DEADLINE: 'The project context deadline expired.',
  DATA_INVALID: 'The selected published context data is invalid.',
  PROVIDER_UNAVAILABLE: 'The required selected metadata provider is unavailable.',
});
const code = z.enum(
  Object.keys(projectContextErrorMessages) as [
    ProjectContextErrorCode,
    ...ProjectContextErrorCode[],
  ],
);
const success = z.strictObject({
  data: z.strictObject({
    depth: z.literal('L0'),
    workspaceId: searchHitSchema.shape.ref.shape.id,
    coverageScope: z.literal('EXPLICIT_SELECTION_ONLY'),
    projectCompleteness: z.literal('NOT_ASSESSED'),
    status: z.enum(['AVAILABLE', 'PARTIAL', 'MISSING_DATA']),
    selectedRefs: z.array(selectedRef),
    missingRefs: z.array(selectedRef),
    omittedRefs: z.array(selectedRef),
    items: z.array(projectContextItemSchema),
    quality: z.literal('NOT_EVALUABLE'),
    productionQuery: z.literal('NOT_AUTHORIZED'),
  }),
  meta: z.strictObject({
    basisRefs: z.array(Phase1BasisSchema),
    sourceFreshness: SourceFreshnessSchema.nullable(),
    compilationCurrency: CompilationCurrencySchema.nullable(),
    coverage: Phase1CoverageSchema.nullable(),
    warnings: z.array(warning),
    truncation: z.strictObject({
      truncated: z.boolean(),
      reasons: z.array(z.literal('MAX_ITEMS')),
      frontier: z.array(z.never()),
    }),
  }),
});

const key = (r: { itemId: string; revisionId: string }) => JSON.stringify([r.itemId, r.revisionId]);
const checked = success.superRefine((r, ctx) => {
  const fail = () =>
      ctx.addIssue({ code: 'custom', message: 'Inconsistent limited project context' }),
    d = r.data,
    m = r.meta;
  const items = d.items.map((h) => ({ itemId: h.ref.id, revisionId: h.ref.revisionId })),
    all = [...items, ...d.missingRefs, ...d.omittedRefs].map(key),
    selected = d.selectedRefs.map(key);
  if (
    new Set(selected).size !== selected.length ||
    new Set(all).size !== all.length ||
    all.length !== selected.length ||
    all.some((k) => !selected.includes(k))
  )
    fail();
  const status = !items.length
    ? 'MISSING_DATA'
    : d.missingRefs.length || d.omittedRefs.length
      ? 'PARTIAL'
      : 'AVAILABLE';
  if (d.status !== status) fail();
  if (
    m.truncation.truncated !== d.omittedRefs.length > 0 ||
    JSON.stringify(m.truncation.reasons) !==
      JSON.stringify(d.omittedRefs.length ? ['MAX_ITEMS'] : [])
  )
    fail();
  const uniform = <T>(a: T[]) =>
    a.length && a.every((v) => JSON.stringify(v) === JSON.stringify(a[0])) ? a[0] : null;
  if (
    JSON.stringify(m.sourceFreshness) !==
      JSON.stringify(uniform(d.items.map((h) => h.sourceFreshness))) ||
    JSON.stringify(m.compilationCurrency) !==
      JSON.stringify(uniform(d.items.map((h) => h.compilationCurrency))) ||
    JSON.stringify(m.coverage) !== JSON.stringify(uniform(d.items.map((h) => h.coverage)))
  )
    fail();
  const expected = new Set(d.items.flatMap((h) => h.supportRefs).map((s) => basisKey(s.basis))),
    actual = m.basisRefs.map(basisKey);
  if (
    expected.size !== actual.length ||
    new Set(actual).size !== actual.length ||
    actual.some((k) => !expected.has(k))
  )
    fail();
  const required = [
    'OWNED_TEST_ONLY',
    'NO_PRODUCTION_AUTHORITY',
    'EXPLICIT_SELECTION_ONLY',
    'CURRENT_PUBLISHED_HEADS_ONLY',
    'LIVE_SOURCE_NOT_OBSERVED',
  ];
  if (!selected.length) required.push('NO_SELECTED_KNOWLEDGE');
  if (d.missingRefs.length) required.push('SELECTED_CURRENT_REVISION_UNAVAILABLE');
  if (
    new Set(m.warnings).size !== m.warnings.length ||
    required.some((w) => !m.warnings.includes(w as (typeof m.warnings)[number]))
  )
    fail();
  for (const h of d.items)
    if (
      (h.summarySource === 'NONE' && h.summary !== '') ||
      (h.summarySource !== 'NONE' && !h.summary.length)
    )
      fail();
});
const failure = z
  .strictObject({ error: z.strictObject({ code, message: z.string() }) })
  .refine((v) => v.error.message === projectContextErrorMessages[v.error.code]);
export const projectContextResponseSchema = z.union([checked, failure]);
export type ProjectContextResponse = z.infer<typeof projectContextResponseSchema>;
export type ProjectContextBudget = z.infer<typeof projectContextBudgetSchema>;
export type ProjectContextErrorCode = keyof typeof projectContextErrorMessages;
export function projectContextFailure(code: ProjectContextErrorCode): ProjectContextResponse {
  return Object.freeze({
    error: Object.freeze({ code, message: projectContextErrorMessages[code] }),
  });
}
export function serializeProjectContextResponse(value: unknown, c: RuntimeRequestControl) {
  return canonicalCompilationJson(
    projectContextResponseSchema.parse(JSON.parse(canonicalCompilationJson(value, c))),
    c,
  );
}
export const projectContextResponseDigest = knowledgeSearchResponseDigest;
export function projectContextWireSchemas() {
  return {
    input: { ...z.toJSONSchema(projectContextRequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(projectContextResponseSchema), type: 'object' as const },
  };
}
