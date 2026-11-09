import { z } from 'zod';
import { type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  knowledgeSearchRequestSchema,
  knowledgeSearchResponseSchema,
  knowledgeSearchResponseDigest,
  type KnowledgeSearchErrorCode,
} from './knowledge-search-contract.js';
import { projectContextBudgetSchema } from './project-context-contract.js';
export const projectL1RequestSchema = z.strictObject({
  version: z.literal(2),
  depth: z.literal('L1'),
  query: z.strictObject({
    mode: knowledgeSearchRequestSchema.shape.mode,
    text: knowledgeSearchRequestSchema.shape.text,
    filters: knowledgeSearchRequestSchema.shape.filters,
  }),
  budget: projectContextBudgetSchema,
});
const base = knowledgeSearchResponseSchema.options[0];
const success = base.safeExtend({
  data: base.shape.data.extend({
    depth: z.literal('L1'),
    contextVersion: z.literal(2),
    selectionBasis: z.literal('EXPLICIT_LEXICAL_QUERY'),
    projectCompleteness: z.literal('NOT_ASSESSED'),
  }),
});
export const projectL1ErrorMessages = Object.freeze({
  INVALID_INPUT: 'Supply valid versioned explicit L1 query arguments.',
  CONTEXT_UNAVAILABLE: 'Use an active server-issued L1 context.',
  PERMISSION_DENIED: 'The server did not authorize the complete selected L1 read.',
  TOKEN_COUNTER_UNAVAILABLE: 'A matching exact server token measurement is required.',
  BUDGET_EXCEEDED: 'The complete L1 result cannot fit the effective budget.',
  CANCELLED: 'The L1 request was cancelled.',
  DEADLINE: 'The L1 request deadline expired.',
  INDEX_UNAVAILABLE: 'The selected published index is unavailable or changed.',
  DATA_INVALID: 'The selected published L1 data is invalid.',
  PROVIDER_UNAVAILABLE: 'The required published retrieval provider is unavailable.',
});
const code = z.enum(
  Object.keys(projectL1ErrorMessages) as [KnowledgeSearchErrorCode, ...KnowledgeSearchErrorCode[]],
);
const failure = z
  .strictObject({ error: z.strictObject({ code, message: z.string() }) })
  .refine((v) => v.error.message === projectL1ErrorMessages[v.error.code]);
export const projectL1ResponseSchema = z.union([success, failure]);
export type ProjectL1Response = z.infer<typeof projectL1ResponseSchema>;
export function projectL1Failure(code: KnowledgeSearchErrorCode): ProjectL1Response {
  return Object.freeze({ error: Object.freeze({ code, message: projectL1ErrorMessages[code] }) });
}
export function serializeProjectL1Response(value: unknown, c: RuntimeRequestControl) {
  return canonicalCompilationJson(
    projectL1ResponseSchema.parse(JSON.parse(canonicalCompilationJson(value, c))),
    c,
  );
}
export const projectL1ResponseDigest = knowledgeSearchResponseDigest;
export function projectL1WireSchemas() {
  return {
    input: { ...z.toJSONSchema(projectL1RequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(projectL1ResponseSchema), type: 'object' as const },
  };
}
