import { z } from 'zod';
import {
  EntityIdSchema,
  Phase1ExactStringSchema,
  RepoBasisSchema,
  Phase1CoverageSchema,
  ExecutionNodeSchema,
  ExecutionEdgeSchema,
  RuntimeFlowSchema,
  RuntimeFlowStepSchema,
  ScopedRefSchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { knowledgeSearchResponseDigest } from './knowledge-search-contract.js';
const nonnegative = z
  .number()
  .int()
  .nonnegative()
  .safe()
  .refine((n) => !Object.is(n, -0));
const positive = nonnegative.refine((n) => n > 0);
export const storedStructureBudgetSchema = z.strictObject({
  maxDepth: nonnegative,
  maxNodes: positive,
  maxEdges: positive,
  maxMetadataRows: positive,
  maxOutputBytes: positive,
  maxTokens: positive,
});
const executionStart = z.strictObject({ kind: z.literal('EXECUTION_NODE'), id: EntityIdSchema });
const runtimeStart = z.strictObject({
  kind: z.literal('RUNTIME_FLOW'),
  id: EntityIdSchema,
  stepKey: Phase1ExactStringSchema,
});
const exact = {
  expectedActivationId: EntityIdSchema,
  expectedRevisionId: EntityIdSchema,
  direction: z.literal('FORWARD'),
};
const execution = z.strictObject({
  kind: z.literal('EXECUTION'),
  ...exact,
  startRef: executionStart,
});
const runtime = z.strictObject({ kind: z.literal('RUNTIME'), ...exact, startRef: runtimeStart });
export const storedStructureSelectionSchema = z.discriminatedUnion('kind', [execution, runtime]);
export const storedStructureRequestSchema = z.discriminatedUnion('kind', [
  execution.extend({ version: z.literal(3), budget: storedStructureBudgetSchema }),
  runtime.extend({ version: z.literal(3), budget: storedStructureBudgetSchema }),
]);
export const projectL2RequestSchema = z.strictObject({
  version: z.literal(3),
  depth: z.literal('L2'),
  selection: storedStructureSelectionSchema,
  budget: storedStructureBudgetSchema,
});
const start = z.union([executionStart, runtimeStart]);
const reason = z.enum(['MAX_DEPTH', 'MAX_NODES', 'MAX_EDGES']);
const truncation = z.strictObject({
  truncated: z.boolean(),
  reasons: z.array(reason),
  frontier: z.array(
    z.strictObject({
      fromRef: start,
      targetRef: start.nullable(),
      edgeRef: ScopedRefSchema.nullable(),
      reason,
    }),
  ),
});
const common = {
  repositoryId: EntityIdSchema,
  activationId: EntityIdSchema,
  revisionId: EntityIdSchema,
  codeBasis: RepoBasisSchema,
  status: z.enum(['CURRENT', 'AFFECTED']),
  viewVersion: z.union([z.literal(1), z.literal(2)]),
  coverageScope: z.literal('LOCAL_DECLARED_RUNTIME'),
  relationshipSemantics: z.literal('STORED_DERIVED_NOT_OBSERVED_EXECUTION'),
  coverage: Phase1CoverageSchema,
  truncation,
};
const { steps: _steps, branches: _branches, ...header } = RuntimeFlowSchema.shape;
export const storedStructureResultSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...common,
      kind: z.literal('EXECUTION'),
      root: executionStart,
      nodes: z.array(z.strictObject({ node: ExecutionNodeSchema, depth: nonnegative })).min(1),
      edges: z.array(ExecutionEdgeSchema),
    }),
    z.strictObject({
      ...common,
      kind: z.literal('RUNTIME'),
      root: runtimeStart,
      flowHeader: z.strictObject(header),
      steps: z.array(z.strictObject({ step: RuntimeFlowStepSchema, depth: nonnegative })).min(1),
      links: z.array(
        z.strictObject({
          fromStepKey: Phase1ExactStringSchema,
          toStepKey: Phase1ExactStringSchema,
        }),
      ),
      branches: z.array(RuntimeFlowSchema.shape.branches.element),
    }),
  ])
  .superRefine((v, c) => {
    const bad = () =>
      c.addIssue({ code: 'custom', message: 'Invalid exact stored structure projection' });
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (v.repositoryId !== v.codeBasis.repositoryId || v.revisionId !== v.codeBasis.revisionId)
      bad();
    const t = v.truncation;
    if (
      new Set(t.reasons).size !== t.reasons.length ||
      t.truncated !== t.reasons.length > 0 ||
      t.truncated !== t.frontier.length > 0 ||
      t.frontier.some(
        (f) =>
          !t.reasons.includes(f.reason) ||
          f.fromRef.kind !== v.root.kind ||
          (f.targetRef && f.targetRef.kind !== v.root.kind),
      )
    )
      bad();
    if (v.kind === 'EXECUTION') {
      if (
        v.nodes[0]?.node.id !== v.root.id ||
        v.nodes[0]?.depth !== 0 ||
        new Set(v.nodes.map((n) => n.node.id)).size !== v.nodes.length ||
        new Set(v.edges.map((e) => e.id)).size !== v.edges.length
      )
        bad();
      for (const row of [...v.nodes.map((n) => n.node), ...v.edges])
        if (
          !equal(row.basis, v.codeBasis) ||
          row.repositoryId !== v.repositoryId ||
          row.revisionId !== v.revisionId
        )
          bad();
    } else {
      if (
        v.flowHeader.id !== v.root.id ||
        !equal(v.flowHeader.basis, v.codeBasis) ||
        v.steps[0]?.step.stepKey !== v.root.stepKey ||
        v.steps[0]?.depth !== 0 ||
        new Set(v.steps.map((s) => s.step.stepKey)).size !== v.steps.length
      )
        bad();
      const keys = new Set(v.steps.map((s) => s.step.stepKey));
      if (
        v.links.some(
          (l) =>
            !keys.has(l.fromStepKey) ||
            !keys.has(l.toStepKey) ||
            !v.steps
              .find((s) => s.step.stepKey === l.fromStepKey)
              ?.step.outgoingStepKeys.includes(l.toStepKey),
        )
      )
        bad();
    }
  });
const warnings = [
  'OWNED_TEST_ONLY',
  'NO_PRODUCTION_AUTHORITY',
  'KNOWLEDGE_META_NOT_APPLICABLE',
  'STORED_DERIVATION_NOT_OBSERVED_EXECUTION',
] as const;
const data = z.strictObject({
  kind: z.enum(['EXECUTION', 'RUNTIME']),
  queryVersion: z.literal(3),
  workspaceId: EntityIdSchema,
  repositoryId: EntityIdSchema,
  engineeringResult: storedStructureResultSchema,
  quality: z.literal('NOT_EVALUABLE'),
  productionQuery: z.literal('NOT_AUTHORIZED'),
});
const meta = z.strictObject({
  basisRefs: z.null(),
  sourceFreshness: z.null(),
  compilationCurrency: z.null(),
  coverage: z.null(),
  warnings: z.array(z.enum(warnings)),
  truncation,
});
const checked = z.strictObject({ data, meta }).superRefine((r, c) => {
  if (
    r.data.repositoryId !== r.data.engineeringResult.repositoryId ||
    r.data.kind !== r.data.engineeringResult.kind ||
    JSON.stringify(r.meta.truncation) !== JSON.stringify(r.data.engineeringResult.truncation) ||
    r.meta.warnings.length !== warnings.length ||
    new Set(r.meta.warnings).size !== warnings.length ||
    warnings.some((w) => !r.meta.warnings.includes(w))
  )
    c.addIssue({ code: 'custom', message: 'Invalid stored structure response binding' });
});
export const storedStructureErrorMessages = Object.freeze({
  INVALID_INPUT: 'Supply valid exact versioned stored structure arguments.',
  CONTEXT_UNAVAILABLE: 'Use an active server-issued stored structure context.',
  PERMISSION_DENIED: 'The server did not authorize the selected stored structure read.',
  TOKEN_COUNTER_UNAVAILABLE: 'A matching exact server token measurement is required.',
  BUDGET_EXCEEDED: 'The complete stored structure result cannot fit the effective budget.',
  CANCELLED: 'The stored structure request was cancelled.',
  DEADLINE: 'The stored structure request deadline expired.',
  DATA_INVALID: 'The stored structure data is invalid.',
  PROVIDER_UNAVAILABLE: 'The required stored structure provider is unavailable.',
  NOT_AVAILABLE: 'The selected repository has no available stored Runtime activation.',
  STRUCTURE_NOT_FOUND: 'The exact stored structure start is unavailable.',
  ACTIVATION_MISMATCH: 'The active Runtime activation differs from the expected activation.',
  REVISION_MISMATCH: 'The stored code revision differs from the expected revision.',
});
export type StoredStructureErrorCode = keyof typeof storedStructureErrorMessages;
const errorCode = z.enum(
  Object.keys(storedStructureErrorMessages) as [
    StoredStructureErrorCode,
    ...StoredStructureErrorCode[],
  ],
);
const failure = z
  .strictObject({ error: z.strictObject({ code: errorCode, message: z.string() }) })
  .refine((v) => v.error.message === storedStructureErrorMessages[v.error.code]);
export const storedStructureResponseSchema = z.union([checked, failure]);
export const projectL2ResponseSchema = z.union([
  checked.safeExtend({
    data: data.extend({
      depth: z.literal('L2'),
      contextVersion: z.literal(3),
      selectionBasis: z.literal('EXPLICIT_STORED_STRUCTURE'),
      projectCompleteness: z.literal('NOT_ASSESSED'),
    }),
  }),
  failure,
]);
export type StoredStructureResponse = z.infer<typeof storedStructureResponseSchema>;
export type ProjectL2Response = z.infer<typeof projectL2ResponseSchema>;
export function storedStructureFailure(code: StoredStructureErrorCode) {
  return Object.freeze({
    error: Object.freeze({ code, message: storedStructureErrorMessages[code] }),
  });
}
export const projectL2Failure = storedStructureFailure;
export function serializeStoredStructureResponse(v: unknown, c: RuntimeRequestControl) {
  return canonicalCompilationJson(
    storedStructureResponseSchema.parse(JSON.parse(canonicalCompilationJson(v, c))),
    c,
  );
}
export function serializeProjectL2Response(v: unknown, c: RuntimeRequestControl) {
  return canonicalCompilationJson(
    projectL2ResponseSchema.parse(JSON.parse(canonicalCompilationJson(v, c))),
    c,
  );
}
export const storedStructureResponseDigest = knowledgeSearchResponseDigest;
export function storedStructureWireSchemas() {
  return {
    input: { ...z.toJSONSchema(storedStructureRequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(storedStructureResponseSchema), type: 'object' as const },
  };
}
export function projectL2WireSchemas() {
  return {
    input: { ...z.toJSONSchema(projectL2RequestSchema), type: 'object' as const },
    output: { ...z.toJSONSchema(projectL2ResponseSchema), type: 'object' as const },
  };
}
