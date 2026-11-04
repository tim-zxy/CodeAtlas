import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { ConfidenceSchema } from './confidence.js';
import { RuntimeTransitionKindSchema } from './runtime-ir.js';
import { RepositoryRuntimeBindingSchema, assertRepositoryRuntimeBindings } from './contract-ir.js';
import {
  WorkspaceBasisSchema,
  Phase1ExactStringSchema as Text,
  ScopedRefSchema,
  Phase1SupportRefsSchema,
  SupportRefSchema,
  Phase1CoverageSchema,
  parsePhase1Envelope,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertUnique,
  assertNestedScopedRefs,
  assertSupportRefs,
  supportKey,
  scopedRefKey,
} from './phase1-support.js';
export const WorkspaceExecutionNodeSchema = z.strictObject({
  id: EntityIdSchema,
  factKey: Text,
  repositoryRuntimeRef: ScopedRefSchema.refine(
    (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'EXECUTION_NODE',
  ),
});
export const WorkspaceExecutionEdgeSchema = z.strictObject({
  id: EntityIdSchema,
  factKey: Text,
  sourceRef: ScopedRefSchema,
  targetRef: ScopedRefSchema,
  matchRef: ScopedRefSchema,
  transitionKind: RuntimeTransitionKindSchema,
  supportRefs: Phase1SupportRefsSchema,
  confidence: ConfidenceSchema,
});
export const WorkspaceExecutionSchema = z.strictObject({
  workspaceBasis: WorkspaceBasisSchema,
  repositoryBindings: z.array(RepositoryRuntimeBindingSchema),
  nodes: z.array(WorkspaceExecutionNodeSchema),
  edges: z.array(WorkspaceExecutionEdgeSchema),
  coverage: Phase1CoverageSchema,
  supportInventory: z.array(SupportRefSchema),
});
export type WorkspaceExecution = z.infer<typeof WorkspaceExecutionSchema>;
export function parseWorkspaceExecution(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope(
    'codeatlas.workspace-execution',
    WorkspaceExecutionSchema,
    input,
  );
  const p = result.payload,
    context = parsePhase1ReferenceContext(contextInput);
  assertRepositoryRuntimeBindings(p.repositoryBindings, context);
  assertUnique([...p.nodes, ...p.edges].map((r) => r.id));
  assertUnique([...p.nodes, ...p.edges].map((r) => r.factKey));
  assertUnique(p.nodes.map((n) => scopedRefKey(n.repositoryRuntimeRef)));
  assertUnique(p.supportInventory.map(supportKey));
  const available = new Set(context.availableSupports.map(supportKey));
  for (const s of p.supportInventory) phase1Assert(available.has(supportKey(s)));
  const nodeRefs = p.nodes.map((n) => ({
    scope: 'WORKSPACE' as const,
    workspaceId: p.workspaceBasis.workspaceId,
    entity: {
      kind: 'WORKSPACE_EXECUTION_NODE',
      id: n.id,
      revisionId: p.workspaceBasis.revisionSetId,
    },
  }));
  const own = {
    availableEntities: [...context.availableEntities, ...nodeRefs],
    availableSupports: p.supportInventory,
  };
  for (const n of p.nodes) {
    const r = n.repositoryRuntimeRef;
    phase1Assert(
      r.scope === 'REPOSITORY' &&
        p.repositoryBindings.some(
          (b) =>
            b.repoBasis.repositoryId === r.repositoryId &&
            b.repoBasis.revisionId === r.entity.revisionId,
        ),
    );
    assertNestedScopedRefs(n, own);
  }
  const keys = new Set(nodeRefs.map(scopedRefKey));
  for (const e of p.edges) {
    phase1Assert(
      keys.has(scopedRefKey(e.sourceRef)) &&
        keys.has(scopedRefKey(e.targetRef)) &&
        e.matchRef.scope === 'WORKSPACE' &&
        e.matchRef.workspaceId === p.workspaceBasis.workspaceId &&
        e.matchRef.entity.kind === 'CONTRACT_MATCH' &&
        e.matchRef.entity.revisionId === p.workspaceBasis.revisionSetId,
    );
    assertNestedScopedRefs(e, own);
    assertSupportRefs(e.supportRefs, own);
  }
  assertNestedScopedRefs(p.coverage, own);
  return result;
}
