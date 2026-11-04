import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { EntityRefSchema } from './references.js';
import { UtcInstantSchema } from './time.js';
import { IrValidationError } from './errors.js';
import {
  KnowledgeItemIdSchema,
  KnowledgeRevisionIdSchema,
  KnowledgeScopeSchema,
  ScopedRefSchema,
  Phase1ScopedRefsSchema,
  Phase1ExactStringSchema as Text,
  Phase1SupportRefsSchema,
  Phase1DigestSchema,
  Phase1CoverageSchema,
  parsePhase1Envelope,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertSupportRefs,
  assertNestedScopedRefs,
  assertUnique,
  type Phase1ReferenceContext,
} from './phase1-support.js';
export const Phase1KnowledgeTypeSchema = z.enum([
  'COMPONENT',
  'CAPABILITY',
  'RUNTIME_FLOW_REFERENCE',
  'BUSINESS_FLOW',
  'INTEGRATION',
]);
export const SourceFreshnessSchema = z.enum(['FRESH', 'AFFECTED', 'STALE']);
export const CompilationCurrencySchema = z.enum([
  'CURRENT',
  'OUTDATED_WORKFLOW',
  'OUTDATED_PROMPT',
  'OUTDATED_MODEL_POLICY',
]);
const relationship = z.strictObject({
  kind: Text,
  target: ScopedRefSchema,
  supportRefs: Phase1SupportRefsSchema,
});
export const ComponentContentSchema = z.strictObject({
  kind: z.literal('COMPONENT'),
  title: Text,
  summary: Text,
  implementationRefs: Phase1ScopedRefsSchema.min(1),
  entryPointRefs: Phase1ScopedRefsSchema,
  responsibilityClaims: Phase1ScopedRefsSchema,
  relationships: z.array(relationship),
});
export const CapabilityContentSchema = z.strictObject({
  kind: z.literal('CAPABILITY'),
  title: Text,
  summary: Text,
  componentRefs: Phase1ScopedRefsSchema.min(1),
  entryPointRefs: Phase1ScopedRefsSchema,
  runtimeFlowRefs: Phase1ScopedRefsSchema,
  supportedClaimRefs: Phase1ScopedRefsSchema,
});
export const IntegrationContentSchema = z.strictObject({
  kind: z.literal('INTEGRATION'),
  title: Text,
  summary: Text,
  participantRefs: Phase1ScopedRefsSchema.min(2),
  contractMatchRefs: Phase1ScopedRefsSchema.min(1),
  boundaryRefs: Phase1ScopedRefsSchema,
  limitations: z.array(Text),
});
export const BusinessFlowContentSchema = z
  .strictObject({
    kind: z.literal('BUSINESS_FLOW'),
    title: Text,
    goal: Text,
    participants: Phase1ScopedRefsSchema.min(1),
    steps: z
      .array(
        z.strictObject({
          stepKey: Text,
          action: Text,
          supportRefs: Phase1SupportRefsSchema,
          nextStepKeys: z.array(Text),
        }),
      )
      .min(1),
    runtimeFlowRefs: Phase1ScopedRefsSchema.min(1),
    limitations: z.array(Text),
  })
  .superRefine((v, c) => {
    try {
      assertUnique(v.steps.map((s) => s.stepKey));
      const keys = new Set(v.steps.map((s) => s.stepKey));
      for (const step of v.steps) {
        assertUnique(step.nextStepKeys);
        for (const key of step.nextStepKeys) phase1Assert(keys.has(key));
      }
    } catch (error) {
      if (!(error instanceof IrValidationError)) throw error;
      c.addIssue({ code: 'custom', message: 'Invalid BusinessFlow step references' });
    }
  });
export const RuntimeFlowReferenceContentSchema = z.strictObject({
  kind: z.literal('RUNTIME_FLOW_REFERENCE'),
  runtimeFlowRef: ScopedRefSchema,
  basisRef: ScopedRefSchema,
  summary: Text,
  limitations: z.array(Text),
});
export const KnowledgeStructuredContentSchema = z.discriminatedUnion('kind', [
  ComponentContentSchema,
  CapabilityContentSchema,
  IntegrationContentSchema,
  BusinessFlowContentSchema,
  RuntimeFlowReferenceContentSchema,
]);
export const KnowledgeCandidateSchema = z
  .strictObject({
    id: EntityIdSchema,
    type: Phase1KnowledgeTypeSchema,
    scope: KnowledgeScopeSchema,
    importance: Text,
    structuredContent: KnowledgeStructuredContentSchema,
    supportRefs: Phase1SupportRefsSchema,
    inputSnapshotRef: EntityRefSchema,
    generationMethod: z.enum(['PARSER_GROUNDED', 'SOURCE_GROUNDED_DEGRADED']),
    coverage: Phase1CoverageSchema,
    unverifiedRelations: z.array(
      z.strictObject({
        source: ScopedRefSchema,
        target: ScopedRefSchema,
        kind: Text,
        reason: Text,
      }),
    ),
    publicationState: z.literal('CANDIDATE'),
  })
  .superRefine((v, c) => {
    if (v.type !== v.structuredContent.kind)
      c.addIssue({
        code: 'custom',
        path: ['structuredContent', 'kind'],
        message: 'Candidate type differs from content',
      });
    if (v.inputSnapshotRef.kind !== 'COMPILATION_INPUT_SNAPSHOT')
      c.addIssue({
        code: 'custom',
        path: ['inputSnapshotRef', 'kind'],
        message: 'Compilation input snapshot is required',
      });
    if (v.generationMethod === 'SOURCE_GROUNDED_DEGRADED' && v.coverage.status === 'COMPLETE')
      c.addIssue({
        code: 'custom',
        path: ['coverage'],
        message: 'Degraded input requires explicit coverage limitations',
      });
  });
export type KnowledgeCandidate = z.infer<typeof KnowledgeCandidateSchema>;
export const KnowledgeItemSchema = z
  .strictObject({
    id: KnowledgeItemIdSchema,
    type: Phase1KnowledgeTypeSchema,
    scope: KnowledgeScopeSchema,
    importance: Text,
    lifecycleState: z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED', 'SUPERSEDED', 'ARCHIVED']),
    publishedRevisionId: KnowledgeRevisionIdSchema.nullable(),
    sourceFreshness: SourceFreshnessSchema,
    compilationCurrency: CompilationCurrencySchema,
  })
  .superRefine((v, c) => {
    if (
      (v.lifecycleState === 'DRAFT' && v.publishedRevisionId !== null) ||
      (v.lifecycleState === 'ACTIVE' && v.publishedRevisionId === null)
    )
      c.addIssue({
        code: 'custom',
        path: ['publishedRevisionId'],
        message: 'Draft item cannot have published revision',
      });
  });
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
export const KnowledgeRevisionSchema = z
  .strictObject({
    id: KnowledgeRevisionIdSchema,
    itemId: KnowledgeItemIdSchema,
    previousRevisionId: KnowledgeRevisionIdSchema.nullable(),
    revisionSetId: EntityIdSchema,
    structuredContent: KnowledgeStructuredContentSchema,
    semanticFingerprint: Phase1DigestSchema,
    presentationFingerprint: Phase1DigestSchema,
    supportRefs: Phase1SupportRefsSchema,
    inputSnapshotRef: EntityRefSchema,
    compilationRunId: EntityIdSchema,
    evaluationRef: EntityRefSchema,
    publicationState: z.enum(['CANDIDATE', 'VALIDATED', 'PUBLISHED', 'REJECTED']),
    createdAt: UtcInstantSchema,
  })
  .superRefine((v, c) => {
    if (v.id === v.previousRevisionId)
      c.addIssue({
        code: 'custom',
        path: ['previousRevisionId'],
        message: 'Revision cannot precede itself',
      });
    if (
      v.inputSnapshotRef.kind !== 'COMPILATION_INPUT_SNAPSHOT' ||
      v.evaluationRef.kind !== 'EVALUATION_RUN'
    )
      c.addIssue({ code: 'custom', message: 'Invalid provenance reference kind' });
  });
export type KnowledgeRevision = z.infer<typeof KnowledgeRevisionSchema>;
function validateContent(value: unknown, context: Phase1ReferenceContext): void {
  assertNestedScopedRefs(value, context);
  const content = (value as { structuredContent: z.infer<typeof KnowledgeStructuredContentSchema> })
    .structuredContent;
  const kind = (ref: z.infer<typeof ScopedRefSchema>, allowed: readonly string[]) =>
    phase1Assert(allowed.includes(ref.entity.kind));
  switch (content.kind) {
    case 'COMPONENT':
      for (const ref of content.implementationRefs) kind(ref, ['CODE_NODE']);
      for (const ref of content.entryPointRefs) kind(ref, ['ENTRY_POINT']);
      for (const ref of content.responsibilityClaims) kind(ref, ['CLAIM']);
      break;
    case 'CAPABILITY':
      for (const ref of content.componentRefs) kind(ref, ['COMPONENT']);
      for (const ref of content.entryPointRefs) kind(ref, ['ENTRY_POINT']);
      for (const ref of content.runtimeFlowRefs) kind(ref, ['RUNTIME_FLOW']);
      for (const ref of content.supportedClaimRefs) kind(ref, ['CLAIM']);
      break;
    case 'INTEGRATION':
      for (const ref of content.participantRefs) kind(ref, ['COMPONENT', 'SERVICE']);
      for (const ref of content.contractMatchRefs) kind(ref, ['CONTRACT_MATCH']);
      for (const ref of content.boundaryRefs)
        kind(ref, ['CONTRACT', 'CONTRACT_MATCH', 'EXECUTION_EDGE']);
      break;
    case 'BUSINESS_FLOW':
      for (const ref of content.participants) kind(ref, ['COMPONENT', 'SERVICE']);
      for (const ref of content.runtimeFlowRefs) kind(ref, ['RUNTIME_FLOW']);
      break;
    case 'RUNTIME_FLOW_REFERENCE':
      kind(content.runtimeFlowRef, ['RUNTIME_FLOW']);
      kind(content.basisRef, ['REVISION', 'REVISION_SET', 'COMPILATION_INPUT_SNAPSHOT']);
  }
  function supports(v: unknown): void {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const child of v) supports(child);
      return;
    }
    const object = v as Record<string, unknown>;
    if (Object.hasOwn(object, 'supportRefs'))
      assertSupportRefs(Phase1SupportRefsSchema.parse(object.supportRefs), context);
    for (const child of Object.values(object)) supports(child);
  }
  supports(value);
}
export function parseKnowledgeCandidate(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope(
    'codeatlas.knowledge-candidate',
    KnowledgeCandidateSchema,
    input,
  );
  validateContent(result.payload, parsePhase1ReferenceContext(contextInput));
  return result;
}
export function parseKnowledgeItem(input: unknown) {
  return parsePhase1Envelope('codeatlas.knowledge-item', KnowledgeItemSchema, input);
}
export function parseKnowledgeRevision(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope(
    'codeatlas.knowledge-revision',
    KnowledgeRevisionSchema,
    input,
  );
  validateContent(result.payload, parsePhase1ReferenceContext(contextInput));
  return result;
}
