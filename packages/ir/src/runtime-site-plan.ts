import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { SourceRangeSchema } from './references.js';
import { FrameworkBindingSchema } from './framework-binding-ir.js';
import { SyntaxEvidenceV4Schema, validateSyntaxSurfaceClosure } from './syntax-evidence-v4.js';
import {
  ensurePhase1Data,
  Phase1ExactStringSchema as Text,
  Phase1DigestSchema,
  RepoBasisSchema,
  ScopedRefSchema,
  assertUnique,
  basisKey,
  phase1Assert,
  scopedRefKey,
} from './phase1-support.js';
import { parseIr } from './validation.js';
const nodeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_NODE',
);
const edgeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_EDGE',
);
export const RuntimeSitePlanV1Schema = z.strictObject({
  basis: RepoBasisSchema,
  syntaxMembershipDigest: Phase1DigestSchema,
  entries: z.array(
    z.strictObject({
      siteKey: Text,
      sourceRange: SourceRangeSchema,
      ownerRef: nodeRef,
      codeCallRef: edgeRef.nullable(),
      role: z.enum([
        'FRAMEWORK_BOUNDARY',
        'FRAMEWORK_ORIGIN',
        'CALLBACK_BODY',
        'ORDINARY_CALL',
        'DECLARATION_ONLY',
      ]),
      bindingIds: z.array(EntityIdSchema),
      proofSyntaxKeys: z.array(Text).min(1),
    }),
  ),
});
export type RuntimeSitePlanV1 = z.infer<typeof RuntimeSitePlanV1Schema>;
const context = z.strictObject({
  basis: RepoBasisSchema,
  syntaxMembershipDigest: Phase1DigestSchema,
  syntaxEvidence: z.array(SyntaxEvidenceV4Schema),
  syntaxContext: z.unknown(),
  bindings: z.array(FrameworkBindingSchema),
});
/** Structural/membership closure only. Trusted fixed compiler proves role semantics. */
export function parseRuntimeSitePlan(input: unknown, contextInput: unknown): RuntimeSitePlanV1 {
  ensurePhase1Data(input);
  ensurePhase1Data(contextInput);
  const p = parseIr(RuntimeSitePlanV1Schema, input),
    c = parseIr(context, contextInput);
  phase1Assert(
    basisKey(p.basis) === basisKey(c.basis) &&
      p.syntaxMembershipDigest === c.syntaxMembershipDigest,
  );
  validateSyntaxSurfaceClosure(c.syntaxEvidence, c.syntaxContext);
  for (const s of c.syntaxEvidence)
    phase1Assert(s.repositoryId === p.basis.repositoryId && s.revisionId === p.basis.revisionId);
  assertUnique(c.bindings.map((b) => b.id));
  for (const b of c.bindings)
    phase1Assert(
      basisKey(b.basis) === basisKey(p.basis) &&
        b.repositoryId === p.basis.repositoryId &&
        b.revisionId === p.basis.revisionId,
    );
  const syntax = new Map(c.syntaxEvidence.map((s) => [s.syntaxKey, s])),
    bindings = new Map(c.bindings.map((b) => [String(b.id), b]));
  const invocations = c.syntaxEvidence.filter((s) => s.syntaxKind === 'INVOCATION');
  assertUnique(p.entries.map((e) => e.siteKey));
  phase1Assert(p.entries.length === invocations.length);
  for (const entry of p.entries) {
    const s = syntax.get(entry.siteKey);
    phase1Assert(
      s?.syntaxKind === 'INVOCATION' &&
        s.owner &&
        scopedRefKey(s.owner) === scopedRefKey(entry.ownerRef) &&
        isDeepStrictEqual(s.sourceRange, entry.sourceRange) &&
        isDeepStrictEqual(s.payload.codeCallRef, entry.codeCallRef),
    );
    assertUnique(entry.bindingIds);
    assertUnique(entry.proofSyntaxKeys);
    phase1Assert(entry.proofSyntaxKeys.includes(entry.siteKey));
    for (const key of entry.proofSyntaxKeys) phase1Assert(syntax.has(key));
    for (const id of entry.bindingIds) phase1Assert(bindings.has(String(id)));
    if (entry.role === 'FRAMEWORK_BOUNDARY')
      phase1Assert(
        entry.bindingIds.length > 0 &&
          entry.bindingIds.some(
            (id) =>
              scopedRefKey(bindings.get(String(id))!.ownerRef) === scopedRefKey(entry.ownerRef),
          ),
      );
    if (entry.role === 'CALLBACK_BODY')
      phase1Assert(
        s.callbackScope !== null &&
          c.syntaxEvidence.some(
            (r) =>
              r.syntaxKind === 'CALLBACK_BINDING' &&
              r.payload.status === 'COMPLETE' &&
              r.payload.body &&
              isDeepStrictEqual(r.payload.body.sourceRange, s.sourceRange) &&
              entry.proofSyntaxKeys.includes(r.syntaxKey),
          ),
      );
    else phase1Assert(s.callbackScope === null);
    if (entry.role === 'ORDINARY_CALL' || entry.role === 'DECLARATION_ONLY')
      phase1Assert(entry.bindingIds.length === 0);
  }
  return p;
}
export const RuntimeDerivationV2Schema = z.strictObject({
  syntaxContract: z.literal('SYNTAX_BINDING_V4'),
  rulesVersion: z.literal('framework-rules-v2'),
  coverageVersion: z.literal('framework-coverage-v2'),
  graphPolicy: z.literal('LOCAL_DECLARED_RUNTIME_V2'),
  sitePlan: RuntimeSitePlanV1Schema,
  sitePlanDigest: Phase1DigestSchema,
});
export type RuntimeDerivationV2 = z.infer<typeof RuntimeDerivationV2Schema>;
