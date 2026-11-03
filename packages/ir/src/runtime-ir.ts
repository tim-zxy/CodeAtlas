import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { SourceRangeSchema } from './references.js';
import { ConfidenceSchema, ResolutionLevelSchema } from './confidence.js';
import { IrValidationError } from './errors.js';
import {
  RuntimeEntityIdSchema,
  RepoBasisSchema,
  ScopedRefSchema,
  Phase1ScopedRefsSchema,
  SupportRefSchema,
  Phase1SupportRefsSchema,
  Phase1ExactStringSchema as Text,
  Phase1OrdinalSchema as Ordinal,
  Phase1CoverageSchema,
  Phase1ReferenceContextSchema,
  parsePhase1Envelope,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertScopedRef,
  assertSupportRefs,
  assertNestedScopedRefs,
  assertUnique,
  basisKey,
  type Phase1ReferenceContext,
  type RepoBasis,
} from './phase1-support.js';
export const RuntimeContextKindSchema = z.enum(['REQUEST', 'EVENT', 'JOB', 'TASK', 'BATCH']);
export const RuntimeTransitionKindSchema = z.enum([
  'CALL',
  'HTTP',
  'RPC',
  'PUBLISH',
  'CONSUME',
  'CREATE_TASK',
  'EXECUTE_TASK',
  'DATA_CHANGE',
  'BRANCH',
  'JOIN',
  'RETRY',
  'FAILURE',
  'COMPENSATION',
]);
export const RuntimeBaseShape = {
  id: RuntimeEntityIdSchema,
  factKey: Text,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  basis: RepoBasisSchema,
  sourceRange: SourceRangeSchema.nullable(),
  supportRefs: Phase1SupportRefsSchema,
  confidence: ConfidenceSchema,
  resolution: ResolutionLevelSchema,
};
export const EntryPointSchema = z.strictObject({
  ...RuntimeBaseShape,
  triggerKind: z.enum([
    'HTTP',
    'RPC',
    'MESSAGE',
    'SCHEDULE',
    'TASK',
    'DATA_CHANGE',
    'BATCH',
    'CLI',
    'MANUAL',
  ]),
  ownerRef: ScopedRefSchema,
  contextKind: RuntimeContextKindSchema,
  contractRef: ScopedRefSchema.nullable(),
  taskRef: ScopedRefSchema.nullable(),
});
export const TaskDefinitionSchema = z.strictObject({
  ...RuntimeBaseShape,
  taskKind: z.enum(['JOB', 'TASK', 'BATCH']),
  implementationRef: ScopedRefSchema,
  triggerRef: ScopedRefSchema.nullable(),
});
export const DataResourceSchema = z.strictObject({
  ...RuntimeBaseShape,
  resourceKind: Text,
  logicalName: Text.nullable(),
  namespace: Text.nullable(),
  schemaRef: ScopedRefSchema.nullable(),
});
export const DataChangeTriggerSchema = z.strictObject({
  ...RuntimeBaseShape,
  resourceRef: ScopedRefSchema,
  operation: z.enum(['INSERT', 'UPDATE', 'DELETE', 'UNKNOWN']),
  handlerRef: ScopedRefSchema,
});
const pathSegment = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('LITERAL'), value: Text }),
  z.strictObject({ kind: z.literal('PARAMETER'), name: Text }),
]);
export const HttpContractSignatureSchema = z.strictObject({
  kind: z.literal('HTTP'),
  method: Text,
  pathSegments: z.array(pathSegment),
  querySchemaRef: ScopedRefSchema.nullable(),
  requestSchemaRef: ScopedRefSchema.nullable(),
  responseSchemaRef: ScopedRefSchema.nullable(),
  serviceHint: Text.nullable(),
});
export const MessageContractSignatureSchema = z.strictObject({
  kind: z.literal('MESSAGE'),
  transport: Text,
  namespace: Text.nullable(),
  channel: Text,
  role: z.enum(['PRODUCER', 'CONSUMER']),
  payloadSchemaRef: ScopedRefSchema.nullable(),
  keySchemaRef: ScopedRefSchema.nullable(),
});
export const RpcContractSignatureSchema = z.strictObject({
  kind: z.literal('RPC'),
  service: Text,
  operation: Text,
  requestSchemaRef: ScopedRefSchema.nullable(),
  responseSchemaRef: ScopedRefSchema.nullable(),
});
export const ContractSchema = z
  .strictObject({
    ...RuntimeBaseShape,
    direction: z.enum(['PROVIDER', 'CONSUMER']),
    protocol: z.enum(['HTTP', 'MESSAGE', 'RPC']),
    serviceRef: ScopedRefSchema.nullable(),
    signature: z.discriminatedUnion('kind', [
      HttpContractSignatureSchema,
      MessageContractSignatureSchema,
      RpcContractSignatureSchema,
    ]),
    implementationRef: ScopedRefSchema.nullable(),
  })
  .superRefine((v, c) => {
    if (v.protocol !== v.signature.kind)
      c.addIssue({
        code: 'custom',
        path: ['signature'],
        message: 'Contract protocol differs from signature',
      });
  });
export const ExecutionContextSchema = z.strictObject({
  ...RuntimeBaseShape,
  kind: RuntimeContextKindSchema,
  entryRef: ScopedRefSchema,
  parentContextRef: ScopedRefSchema.nullable(),
});
export const ExecutionNodeSchema = z.strictObject({
  ...RuntimeBaseShape,
  contextRef: ScopedRefSchema,
  kind: z.enum(['ENTRY', 'CODE', 'TASK', 'DATA', 'BOUNDARY']),
  targetRef: ScopedRefSchema,
});
export const RuntimeTargetSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('RESOLVED'), target: ScopedRefSchema }),
  z.strictObject({
    state: z.literal('NON_RESOLVED'),
    resolution: z.enum(['AMBIGUOUS', 'UNRESOLVED', 'UNSUPPORTED']),
    hint: Text.nullable(),
    candidates: Phase1ScopedRefsSchema,
  }),
]);
export const ExecutionEdgeSchema = z.strictObject({
  ...RuntimeBaseShape,
  contextRef: ScopedRefSchema,
  sourceRef: ScopedRefSchema,
  target: RuntimeTargetSchema,
  transitionKind: RuntimeTransitionKindSchema,
  guard: Text.nullable(),
  boundaryRef: ScopedRefSchema.nullable(),
});
export const RuntimeFlowStepSchema = z.strictObject({
  stepKey: Text,
  ordinal: Ordinal,
  contextRef: ScopedRefSchema,
  executionNodeRefs: Phase1ScopedRefsSchema.min(1),
  incomingEdgeRefs: Phase1ScopedRefsSchema,
  outgoingStepKeys: z.array(Text),
  supportRefs: Phase1SupportRefsSchema,
});
export const RuntimeFlowSchema = z
  .strictObject({
    ...RuntimeBaseShape,
    entryRef: ScopedRefSchema,
    derivationVersion: Text,
    contexts: Phase1ScopedRefsSchema.min(1),
    steps: z.array(RuntimeFlowStepSchema).min(1),
    branches: z.array(
      z.strictObject({
        fromStepKey: Text,
        toStepKeys: z.array(Text).min(1),
        supportRefs: Phase1SupportRefsSchema,
      }),
    ),
    boundaries: Phase1ScopedRefsSchema,
    coverage: Phase1CoverageSchema,
  })
  .superRefine((flow, ctx) => {
    try {
      assertUnique(flow.steps.map((s) => s.stepKey));
      assertUnique(flow.steps.map((s) => s.ordinal));
      const steps = new Set(flow.steps.map((s) => s.stepKey));
      for (const step of flow.steps) {
        assertUnique(step.outgoingStepKeys);
        for (const key of step.outgoingStepKeys) phase1Assert(steps.has(key));
      }
      for (const branch of flow.branches) {
        phase1Assert(steps.has(branch.fromStepKey));
        assertUnique(branch.toStepKeys);
        for (const key of branch.toStepKeys) phase1Assert(steps.has(key));
      }
    } catch (error) {
      if (!(error instanceof IrValidationError)) throw error;
      ctx.addIssue({ code: 'custom', message: 'Invalid RuntimeFlow step structure' });
    }
  });
export type RuntimeFlow = z.infer<typeof RuntimeFlowSchema>;
const RuntimeFactSetObjectSchema = z.strictObject({
  basis: RepoBasisSchema,
  externalRefs: Phase1ScopedRefsSchema,
  supportInventory: z.array(SupportRefSchema),
  entryPoints: z.array(EntryPointSchema),
  tasks: z.array(TaskDefinitionSchema),
  dataResources: z.array(DataResourceSchema),
  triggers: z.array(DataChangeTriggerSchema),
  contracts: z.array(ContractSchema),
  contexts: z.array(ExecutionContextSchema),
  nodes: z.array(ExecutionNodeSchema),
  edges: z.array(ExecutionEdgeSchema),
  flows: z.array(RuntimeFlowSchema),
});
type RuntimeFactSetObject = z.infer<typeof RuntimeFactSetObjectSchema>;
function knownKind(ref: z.infer<typeof ScopedRefSchema>, kind: string): void {
  phase1Assert(ref.entity.kind === kind);
}
function assertCommon(
  record: z.infer<z.ZodObject<typeof RuntimeBaseShape>>,
  context: Phase1ReferenceContext,
  basis: RepoBasis,
): void {
  phase1Assert(
    record.repositoryId === basis.repositoryId &&
      record.revisionId === basis.revisionId &&
      basisKey(record.basis) === basisKey(basis),
  );
  assertSupportRefs(record.supportRefs, context, basis);
  if (record.sourceRange) {
    phase1Assert(
      context.availableEntities.some(
        (ref) =>
          ref.scope === 'REPOSITORY' &&
          ref.repositoryId === basis.repositoryId &&
          ref.entity.kind === 'SOURCE_FILE' &&
          ref.entity.id === record.sourceRange!.sourceFileId &&
          ref.entity.revisionId === basis.revisionId,
      ),
    );
  }
}
function validateFlow(flow: RuntimeFlow, context: Phase1ReferenceContext): void {
  assertCommon(flow, context, flow.basis);
  assertNestedScopedRefs(flow, context);
  knownKind(flow.entryRef, 'ENTRY_POINT');
  for (const ref of flow.contexts) knownKind(ref, 'EXECUTION_CONTEXT');
  const contexts = new Set(flow.contexts.map((ref) => ref.entity.id));
  for (const step of flow.steps) {
    knownKind(step.contextRef, 'EXECUTION_CONTEXT');
    phase1Assert(contexts.has(step.contextRef.entity.id));
    for (const ref of step.executionNodeRefs) knownKind(ref, 'EXECUTION_NODE');
    for (const ref of step.incomingEdgeRefs) knownKind(ref, 'EXECUTION_EDGE');
    assertSupportRefs(step.supportRefs, context, flow.basis);
  }
  for (const branch of flow.branches) assertSupportRefs(branch.supportRefs, context, flow.basis);
}
function validateSet(value: RuntimeFactSetObject): void {
  const groups = [
    ['ENTRY_POINT', value.entryPoints],
    ['TASK_DEFINITION', value.tasks],
    ['DATA_RESOURCE', value.dataResources],
    ['DATA_CHANGE_TRIGGER', value.triggers],
    ['CONTRACT', value.contracts],
    ['EXECUTION_CONTEXT', value.contexts],
    ['EXECUTION_NODE', value.nodes],
    ['EXECUTION_EDGE', value.edges],
    ['RUNTIME_FLOW', value.flows],
  ] as const;
  const records = [
    ...value.entryPoints,
    ...value.tasks,
    ...value.dataResources,
    ...value.triggers,
    ...value.contracts,
    ...value.contexts,
    ...value.nodes,
    ...value.edges,
    ...value.flows,
  ];
  assertUnique(records.map((r) => r.id));
  assertUnique(records.map((r) => r.factKey));
  for (const ref of value.externalRefs)
    if (ref.scope === 'REPOSITORY')
      phase1Assert(
        ref.repositoryId === value.basis.repositoryId &&
          ref.entity.revisionId === value.basis.revisionId,
      );
  const availableEntities = [
    ...value.externalRefs,
    ...groups.flatMap(([kind, items]) =>
      items.map((item) => ({
        scope: 'REPOSITORY' as const,
        repositoryId: value.basis.repositoryId,
        entity: { kind, id: item.id, revisionId: value.basis.revisionId },
      })),
    ),
  ];
  const context = Phase1ReferenceContextSchema.parse({
    availableEntities,
    availableSupports: value.supportInventory,
  });
  for (const record of records) {
    assertCommon(record, context, value.basis);
    assertNestedScopedRefs(record, context);
  }
  for (const entry of value.entryPoints) {
    knownKind(entry.ownerRef, 'CODE_NODE');
    if (entry.contractRef) knownKind(entry.contractRef, 'CONTRACT');
    if (entry.taskRef) knownKind(entry.taskRef, 'TASK_DEFINITION');
  }
  for (const task of value.tasks) knownKind(task.implementationRef, 'CODE_NODE');
  for (const trigger of value.triggers) {
    knownKind(trigger.resourceRef, 'DATA_RESOURCE');
    knownKind(trigger.handlerRef, 'CODE_NODE');
  }
  for (const c of value.contexts) {
    knownKind(c.entryRef, 'ENTRY_POINT');
    if (c.parentContextRef) knownKind(c.parentContextRef, 'EXECUTION_CONTEXT');
    phase1Assert(c.parentContextRef?.entity.id !== c.id);
  }
  const contexts = new Map<string, z.infer<typeof ExecutionContextSchema>>(
    value.contexts.map((c) => [c.id, c]),
  );
  for (const context of value.contexts) {
    const seen = new Set<string>([context.id]);
    let parent = context.parentContextRef;
    while (parent !== null) {
      phase1Assert(!seen.has(parent.entity.id));
      seen.add(parent.entity.id);
      const next = contexts.get(parent.entity.id);
      phase1Assert(next);
      parent = next.parentContextRef;
    }
  }
  for (const n of value.nodes) knownKind(n.contextRef, 'EXECUTION_CONTEXT');
  const nodes = new Map<string, z.infer<typeof ExecutionNodeSchema>>(
    value.nodes.map((n) => [n.id, n]),
  );
  for (const e of value.edges) {
    knownKind(e.contextRef, 'EXECUTION_CONTEXT');
    knownKind(e.sourceRef, 'EXECUTION_NODE');
    const source = nodes.get(e.sourceRef.entity.id);
    phase1Assert(source && source.contextRef.entity.id === e.contextRef.entity.id);
    if (e.target.state === 'RESOLVED') {
      knownKind(e.target.target, 'EXECUTION_NODE');
      const target = nodes.get(e.target.target.entity.id);
      phase1Assert(target);
      if (source.contextRef.entity.id !== target.contextRef.entity.id)
        phase1Assert(
          e.boundaryRef !== null && !['CALL', 'BRANCH', 'JOIN'].includes(e.transitionKind),
        );
    } else
      for (const candidate of e.target.candidates) {
        knownKind(candidate, 'EXECUTION_NODE');
        phase1Assert(nodes.has(candidate.entity.id));
      }
  }
  for (const flow of value.flows) validateFlow(flow, context);
}
export const RuntimeFactSetSchema = RuntimeFactSetObjectSchema.superRefine((value, ctx) => {
  try {
    validateSet(value);
  } catch (error) {
    if (!(error instanceof IrValidationError) && !(error instanceof z.ZodError)) throw error;
    ctx.addIssue({ code: 'custom', message: 'Invalid Runtime fact-set reference closure' });
  }
});
export type RuntimeFactSet = z.infer<typeof RuntimeFactSetSchema>;
export function parseRuntimeFactSet(input: unknown) {
  return parsePhase1Envelope('codeatlas.runtime-fact-set', RuntimeFactSetSchema, input);
}
export function parseRuntimeFlow(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope('codeatlas.runtime-flow', RuntimeFlowSchema, input);
  validateFlow(result.payload, parsePhase1ReferenceContext(contextInput));
  return result;
}
