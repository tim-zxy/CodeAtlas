import { z } from 'zod';
import { RuntimeBaseShape, parseRuntimeFactSet } from './runtime-ir.js';
import {
  RepoBasisSchema,
  ScopedRefSchema,
  Phase1ScopedRefsSchema,
  SupportRefSchema,
  Phase1ReferenceContextSchema,
  parsePhase1Envelope,
  phase1Assert,
  basisKey,
  assertSupportRefs,
  assertNestedScopedRefs,
  assertUnique,
  scopedRefKey,
  supportKey,
} from './phase1-support.js';
const codeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_NODE',
);
const ref = (kind: string) =>
  ScopedRefSchema.refine((r) => r.scope === 'REPOSITORY' && r.entity.kind === kind);
const common = { ...RuntimeBaseShape, ownerRef: codeRef };
export const FrameworkBindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.enum(['MESSAGE_PUBLISH', 'MESSAGE_CONSUME', 'HTTP_CALL']),
    contractRef: ref('CONTRACT'),
  }),
  z.strictObject({
    ...common,
    kind: z.enum(['DATA_READ', 'DATA_WRITE']),
    resourceRef: ref('DATA_RESOURCE'),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('DATA_WATCH'),
    resourceRef: ref('DATA_RESOURCE'),
    handlerRef: codeRef,
  }),
  z.strictObject({
    ...common,
    kind: z.enum(['TASK_CREATE', 'TASK_EXECUTE']),
    taskRef: ref('TASK_DEFINITION'),
  }),
  z.strictObject({ ...common, kind: z.literal('DEPENDENCY'), dependencyRef: codeRef }),
]);
export type FrameworkBinding = z.infer<typeof FrameworkBindingSchema>;
export const FrameworkBindingSetSchema = z.strictObject({
  basis: RepoBasisSchema,
  externalRefs: Phase1ScopedRefsSchema,
  supportInventory: z.array(SupportRefSchema),
  bindings: z.array(FrameworkBindingSchema),
});
export type FrameworkBindingSet = z.infer<typeof FrameworkBindingSetSchema>;
/** Structural closure against this candidate, not live Store authentication. */
export function parseFrameworkBindingSet(input: unknown, runtimeInput: unknown) {
  const result = parsePhase1Envelope(
    'codeatlas.framework-binding-set',
    FrameworkBindingSetSchema,
    input,
  );
  const p = result.payload,
    runtime = parseRuntimeFactSet(runtimeInput).payload;
  phase1Assert(basisKey(p.basis) === basisKey(runtime.basis));
  const context = Phase1ReferenceContextSchema.parse({
    availableEntities: [
      ...runtime.externalRefs,
      ...(['contracts', 'dataResources', 'tasks'] as const).flatMap((group) => {
        const kind = {
          contracts: 'CONTRACT',
          dataResources: 'DATA_RESOURCE',
          tasks: 'TASK_DEFINITION',
        }[group];
        return runtime[group].map((r) => ({
          scope: 'REPOSITORY',
          repositoryId: p.basis.repositoryId,
          entity: { kind, id: r.id, revisionId: p.basis.revisionId },
        }));
      }),
    ],
    availableSupports: runtime.supportInventory,
  });
  const external = new Set(runtime.externalRefs.map(scopedRefKey));
  for (const r of p.externalRefs) phase1Assert(external.has(scopedRefKey(r)));
  assertUnique(p.supportInventory.map((s) => JSON.stringify([basisKey(s.basis), s.entity])));
  const inventory = new Set(runtime.supportInventory.map(supportKey));
  for (const s of p.supportInventory) phase1Assert(inventory.has(supportKey(s)));
  const own = { ...context, availableSupports: p.supportInventory };
  assertUnique(p.bindings.map((b) => b.id));
  assertUnique(p.bindings.map((b) => b.factKey));
  for (const b of p.bindings) {
    phase1Assert(
      b.repositoryId === p.basis.repositoryId &&
        b.revisionId === p.basis.revisionId &&
        basisKey(b.basis) === basisKey(p.basis) &&
        b.sourceRange !== null,
    );
    assertSupportRefs(b.supportRefs, own, p.basis);
    assertNestedScopedRefs(b, own);
    phase1Assert(
      p.externalRefs.some(
        (r) =>
          r.scope === 'REPOSITORY' &&
          r.repositoryId === p.basis.repositoryId &&
          r.entity.revisionId === p.basis.revisionId &&
          r.entity.kind === 'SOURCE_FILE' &&
          r.entity.id === b.sourceRange!.sourceFileId,
      ),
    );
    if ('resourceRef' in b)
      phase1Assert(runtime.dataResources.some((r) => r.id === b.resourceRef.entity.id));
    if ('taskRef' in b) phase1Assert(runtime.tasks.some((r) => r.id === b.taskRef.entity.id));
    if ('contractRef' in b) {
      const c = runtime.contracts.find((c) => c.id === b.contractRef.entity.id);
      phase1Assert(
        c && c.implementationRef && scopedRefKey(c.implementationRef) === scopedRefKey(b.ownerRef),
      );
      if (b.kind === 'HTTP_CALL') phase1Assert(c.protocol === 'HTTP' && c.direction === 'CONSUMER');
      else
        phase1Assert(
          c.protocol === 'MESSAGE' &&
            c.signature.kind === 'MESSAGE' &&
            c.signature.role === (b.kind === 'MESSAGE_PUBLISH' ? 'PRODUCER' : 'CONSUMER'),
        );
    }
  }
  return result;
}
