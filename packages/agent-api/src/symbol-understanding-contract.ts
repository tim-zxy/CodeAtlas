import { z } from 'zod';
import {
  CanonicalIdSchema,
  EntityIdSchema,
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  CanonicalFactRefSchema,
  EvidenceIdSchema,
  SourceRangeSchema,
  ContentFingerprintSchema,
  RepositoryRelativePathSchema,
  UtcInstantSchema,
  ProviderSnapshotOutcomeSchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { parseCodeQueryEnvelope } from '@codeatlas/application';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { knowledgeSearchResponseDigest } from './knowledge-search-contract.js';
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const symbolUnderstandingBudgetSchema = z.strictObject({
  maxNodes: positive,
  maxEdges: positive,
  maxMetadataRows: positive,
  maxOutputBytes: positive,
  maxTokens: positive,
});
export const symbolUnderstandingRequestSchema = z.strictObject({
  version: z.literal(1),
  mode: z.literal('STORED_CODE'),
  symbolId: CanonicalIdSchema,
  expectedRevisionId: EntityIdSchema,
  budget: symbolUnderstandingBudgetSchema,
});
const truncation = z.enum([
  'NODE_LIMIT',
  'EDGE_LIMIT',
  'DEPTH_LIMIT',
  'INCOMING_LIMIT',
  'OUTGOING_LIMIT',
]);
const coverage = z.enum(['COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN']);
const engineeringResult = z.strictObject({
  schema: z.literal('code-query-result'),
  version: z.literal(1),
  payload: z.strictObject({
    operation: z.literal('UNDERSTAND'),
    repositoryId: EntityIdSchema,
    revisionId: EntityIdSchema,
    indexedContentFingerprint: ContentFingerprintSchema.nullable(),
    freshness: z.strictObject({
      state: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
      basis: z.literal('PERSISTED_SOURCE'),
      worktreeObservation: z.literal('NOT_OBSERVED'),
    }),
    budget: z.strictObject({
      maxNodes: positive,
      maxEdges: positive,
      maxMetadataRows: positive,
      maxResultBytes: positive,
      timeoutMs: positive,
    }),
    warnings: z.array(
      z.enum([
        'WORKTREE_NOT_OBSERVED',
        'REPOSITORY_COVERAGE_UNPROVEN',
        'COVERAGE_UNKNOWN',
        'COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE',
        'PARTIAL_COVERAGE',
        'UNSUPPORTED_COVERAGE',
        'SOURCE_STALE',
        'SOURCE_FRESHNESS_UNKNOWN',
        'INCOMPLETE_RESOLUTION',
      ]),
    ),
    truncation: z.array(truncation),
    refs: z.strictObject({
      facts: z.array(CanonicalFactRefSchema),
      sources: z.array(
        z.strictObject({
          sourceFileId: EntityIdSchema,
          revisionId: EntityIdSchema,
          path: RepositoryRelativePathSchema,
          range: SourceRangeSchema.nullable(),
        }),
      ),
      evidence: z.array(
        z.strictObject({
          fact: CanonicalFactRefSchema,
          evidenceId: EvidenceIdSchema,
          providerSnapshotId: EntityIdSchema,
        }),
      ),
    }),
    coverage: z.strictObject({
      basis: z.literal('SUPPORT_SNAPSHOTS'),
      observations: z.array(
        z.strictObject({
          snapshot: z.strictObject({
            id: EntityIdSchema,
            repositoryId: EntityIdSchema,
            requestedRevisionId: EntityIdSchema,
            requestedRevisionFingerprint: ContentFingerprintSchema,
            startedAt: UtcInstantSchema,
            completedAt: UtcInstantSchema,
            outcome: ProviderSnapshotOutcomeSchema,
          }),
          capability: z.string().min(1),
          support: z.enum(['SUPPORTED', 'UNSUPPORTED']),
          capabilityCoverage: coverage,
          sourceFileId: EntityIdSchema.nullable(),
          rowId: positive.nullable(),
          fileCoverage: coverage.nullable(),
        }),
      ),
    }),
    symbol: CanonicalNodeSchema,
    incoming: z.array(CanonicalEdgeSchema),
    outgoing: z.array(CanonicalEdgeSchema),
  }),
});
export const symbolUnderstandingErrorMessages = Object.freeze({
  INVALID_INPUT: 'Supply valid versioned exact symbol arguments.',
  CONTEXT_UNAVAILABLE: 'Use an active server-issued symbol context.',
  PERMISSION_DENIED: 'The server did not authorize the complete stored symbol result.',
  TOKEN_COUNTER_UNAVAILABLE: 'A matching exact server token measurement is required.',
  BUDGET_EXCEEDED: 'The complete symbol result cannot fit the effective budget.',
  CANCELLED: 'The symbol request was cancelled.',
  DEADLINE: 'The symbol deadline expired.',
  DATA_INVALID: 'The stored symbol data is invalid.',
  PROVIDER_UNAVAILABLE: 'The required stored code provider is unavailable.',
  NOT_INDEXED: 'The selected repository has no active code graph.',
  SYMBOL_NOT_FOUND: 'The exact symbol is unavailable in the active graph.',
  REVISION_MISMATCH: 'The active code revision does not match the expected revision.',
});
export type SymbolUnderstandingErrorCode = keyof typeof symbolUnderstandingErrorMessages;
const errorCode = z.enum(
  Object.keys(symbolUnderstandingErrorMessages) as [
    SymbolUnderstandingErrorCode,
    ...SymbolUnderstandingErrorCode[],
  ],
);
const warnings = [
  'OWNED_TEST_ONLY',
  'NO_PRODUCTION_AUTHORITY',
  'KNOWLEDGE_META_NOT_APPLICABLE',
  'WORKTREE_NOT_OBSERVED',
] as const;
const success = z
  .strictObject({
    data: z.strictObject({
      mode: z.literal('STORED_CODE'),
      workspaceId: EntityIdSchema,
      repositoryId: EntityIdSchema,
      engineeringResult,
      entryRuntimeRelevance: z.strictObject({
        availability: z.literal('NOT_EVALUATED'),
        value: z.null(),
      }),
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
        reasons: z.array(truncation),
        frontier: z.null(),
      }),
    }),
  })
  .superRefine((r, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: 'custom', message: 'Invalid exact stored symbol result' });
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
const failure = z
  .strictObject({ error: z.strictObject({ code: errorCode, message: z.string() }) })
  .refine((v) => v.error.message === symbolUnderstandingErrorMessages[v.error.code]);
export const symbolUnderstandingResponseSchema = z.union([success, failure]);
export type SymbolUnderstandingResponse = z.infer<typeof symbolUnderstandingResponseSchema>;
export type SymbolUnderstandingBudget = z.infer<typeof symbolUnderstandingBudgetSchema>;
export function symbolUnderstandingFailure(
  code: SymbolUnderstandingErrorCode,
): SymbolUnderstandingResponse {
  return Object.freeze({
    error: Object.freeze({ code, message: symbolUnderstandingErrorMessages[code] }),
  });
}
export const symbolUnderstandingResponseDigest = knowledgeSearchResponseDigest;
export function serializeSymbolUnderstandingResponse(value: unknown, c: RuntimeRequestControl) {
  return canonicalCompilationJson(
    symbolUnderstandingResponseSchema.parse(JSON.parse(canonicalCompilationJson(value, c))),
    c,
  );
}
export function symbolUnderstandingWireSchemas() {
  return {
    input: { ...z.toJSONSchema(symbolUnderstandingRequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(symbolUnderstandingResponseSchema), type: 'object' as const },
  };
}
