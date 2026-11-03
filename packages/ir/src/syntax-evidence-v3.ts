import { z } from 'zod';
import { CanonicalNodeSchema } from './canonical-code-fact.js';
import { SourceFileSchema } from './source-file.js';
import { SourceRangeSchema } from './references.js';
import { ResolutionLevelSchema } from './confidence.js';
import { SyntaxEvidenceV2Schema } from './syntax-evidence-v2.js';
import { parseIr } from './validation.js';
import {
  ensurePhase1Data,
  Phase1ExactStringSchema as Text,
  ScopedRefSchema,
  Phase1ReferenceContextSchema,
  RepoBasisSchema,
  phase1Assert,
  assertNestedScopedRefs,
  assertSupportRefs,
  assertUnique,
  entityRefKey,
  scopedRefKey,
} from './phase1-support.js';
export const BindingControlContextSchema = z.enum(['UNCONDITIONAL', 'CONDITIONAL', 'UNKNOWN']);
export const BindingImportPayloadSchema = z
  .strictObject({
    language: z.enum(['java', 'python']),
    importKind: z.enum([
      'JAVA_TYPE',
      'JAVA_STATIC_MEMBER',
      'JAVA_WILDCARD',
      'JAVA_STATIC_WILDCARD',
      'PYTHON_MODULE',
      'PYTHON_SYMBOL',
      'PYTHON_RELATIVE',
      'PYTHON_WILDCARD',
      'UNKNOWN',
    ]),
    qualifiedName: Text.nullable(),
    importedName: Text.nullable(),
    boundName: Text.nullable(),
  })
  .superRefine((p, c) => {
    const ok = (v: unknown) => {
      if (!v) c.addIssue({ code: 'custom', message: 'Invalid import binding' });
    };
    if (p.importKind === 'UNKNOWN') return;
    ok(p.importKind.startsWith(p.language === 'java' ? 'JAVA_' : 'PYTHON_'));
    ok(p.qualifiedName !== null);
    if (p.importKind.includes('WILDCARD')) ok(p.importedName === null && p.boundName === null);
    else if (p.importKind === 'PYTHON_RELATIVE') ok(p.qualifiedName?.startsWith('.'));
    else {
      ok(p.boundName !== null);
      if (p.importKind === 'PYTHON_MODULE') ok(p.importedName === null);
      else ok(p.importedName !== null && p.qualifiedName?.split('.').at(-1) === p.importedName);
      if (p.language === 'java')
        ok(p.boundName === p.importedName && !p.qualifiedName?.includes('*'));
    }
  });
export const BindingEffectBasePayloadSchema = z
  .strictObject({
    name: Text.nullable(),
    effect: z.enum([
      'ITERATION_TARGET',
      'CONTEXT_TARGET',
      'EXCEPTION_TARGET',
      'PATTERN_TARGET',
      'WALRUS_TARGET',
      'UNBIND',
      'AUGMENT',
      'GLOBAL',
      'NONLOCAL',
      'UNSUPPORTED_BINDING',
    ]),
  })
  .superRefine((p, c) => {
    if (p.effect !== 'UNSUPPORTED_BINDING' && p.name === null)
      c.addIssue({ code: 'custom', message: 'Binding effect requires name' });
  });
export const BindingScopeBasePayloadSchema = z
  .strictObject({ status: z.enum(['COMPLETE', 'PARTIAL']), limitations: z.array(Text) })
  .superRefine((p, c) => {
    if (
      (p.status === 'COMPLETE') !== (p.limitations.length === 0) ||
      new Set(p.limitations).size !== p.limitations.length
    )
      c.addIssue({ code: 'custom', message: 'Scope coverage disagrees with limitations' });
  });
const codeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_NODE',
  'Expected repository Code reference',
);
const [decoration, invocation, declaration, assignment, artifact] = SyntaxEvidenceV2Schema.options;
const control = { controlContext: BindingControlContextSchema };
const callee = decoration.shape.payload.shape.callee
  .safeExtend({ resolution: ResolutionLevelSchema })
  .superRefine((p, c) => {
    if (
      (p.state === 'RESOLVED') !== ['EXACT', 'HEURISTIC'].includes(p.resolution) ||
      (p.resolution === 'AMBIGUOUS' && p.candidates.length < 2) ||
      (p.resolution === 'UNSUPPORTED' && p.candidates.length !== 0)
    )
      c.addIssue({ code: 'custom', message: 'Callee precision disagrees with state' });
  });
const common = decoration.omit({ syntaxKind: true, payload: true }).extend(control);
export function syntaxRangeContains(
  outer: z.infer<typeof SourceRangeSchema>,
  inner: z.infer<typeof SourceRangeSchema>,
): boolean {
  const le = (al: number, ac: number, bl: number, bc: number) => al < bl || (al === bl && ac <= bc);
  return (
    outer.sourceFileId === inner.sourceFileId &&
    le(outer.startLine, outer.startColumn, inner.startLine, inner.startColumn) &&
    le(inner.endLine, inner.endColumn, outer.endLine, outer.endColumn)
  );
}
export const SyntaxEvidenceV3Schema = z
  .discriminatedUnion('syntaxKind', [
    decoration.extend({ ...control, payload: decoration.shape.payload.safeExtend({ callee }) }),
    invocation.extend({ ...control, payload: invocation.shape.payload.safeExtend({ callee }) }),
    declaration.extend({
      ...control,
      payload: z.strictObject({
        ...declaration.shape.payload.shape,
        declarationForm: z.enum(['CALLABLE', 'TYPED_BINDING', 'TYPE', 'OTHER']),
      }),
    }),
    assignment.extend(control),
    artifact.extend(control),
    common.extend({ syntaxKind: z.literal('IMPORT_BINDING'), payload: BindingImportPayloadSchema }),
    common.extend({
      syntaxKind: z.literal('BINDING_EFFECT'),
      payload: BindingEffectBasePayloadSchema.safeExtend({ targetScopeRef: codeRef.nullable() }),
    }),
    common.extend({
      syntaxKind: z.literal('BINDING_SCOPE'),
      payload: BindingScopeBasePayloadSchema.safeExtend({
        scopeRef: codeRef,
        parentScopeRef: codeRef.nullable(),
      }),
    }),
  ])
  .superRefine((s, c) => {
    const ok = (v: unknown) => {
      if (!v) c.addIssue({ code: 'custom', message: 'Invalid Syntax v3 structure' });
    };
    if (s.syntaxKind === 'ASSIGNMENT') {
      const p = s.payload;
      ok((p.assignmentForm === 'DIRECT_VALUE') === (p.valueRange !== null));
      if (p.valueRange) ok(syntaxRangeContains(s.sourceRange, p.valueRange));
    }
    if (s.syntaxKind === 'DECLARATION')
      ok(s.payload.declarationForm === 'OTHER' || s.payload.declaredName !== null);
    if (s.syntaxKind === 'BINDING_SCOPE') ok(s.controlContext === 'UNCONDITIONAL');
  });
export type SyntaxEvidenceV3 = z.infer<typeof SyntaxEvidenceV3Schema>;
const envelope = z.strictObject({
  schema: z.literal('codeatlas.syntax-evidence'),
  version: z.literal(3),
  payload: SyntaxEvidenceV3Schema,
});
const contextSchema = z.strictObject({
  references: Phase1ReferenceContextSchema,
  codeNodes: z.array(CanonicalNodeSchema),
  sourceFiles: z.array(SourceFileSchema).optional(),
});
export function parseSyntaxEvidenceV3(input: unknown, contextInput: unknown) {
  ensurePhase1Data(input);
  ensurePhase1Data(contextInput);
  const result = parseIr(envelope, input),
    c = parseIr(contextSchema, contextInput),
    s = result.payload;
  const basis = RepoBasisSchema.parse(s.supportRefs[0]!.basis);
  phase1Assert(basis.repositoryId === s.repositoryId && basis.revisionId === s.revisionId);
  assertUnique(c.codeNodes.map((n) => n.id));
  assertUnique(c.codeNodes.map((n) => n.factKey));
  for (const n of c.codeNodes)
    phase1Assert(n.repositoryId === s.repositoryId && n.revisionId === s.revisionId);
  if (c.sourceFiles) {
    assertUnique(c.sourceFiles.map((f) => f.id));
    assertUnique(c.sourceFiles.map((f) => f.path));
    for (const f of c.sourceFiles)
      phase1Assert(f.repositoryId === s.repositoryId && f.revisionId === s.revisionId);
  }
  const file = c.sourceFiles?.find((f) => f.id === s.sourceRange.sourceFileId);
  if (c.sourceFiles) phase1Assert(file && file.contentFingerprint === s.sourceFingerprint);
  phase1Assert(
    c.references.availableEntities.some(
      (r) =>
        r.scope === 'REPOSITORY' &&
        r.repositoryId === s.repositoryId &&
        r.entity.kind === 'SOURCE_FILE' &&
        r.entity.id === s.sourceRange.sourceFileId &&
        r.entity.revisionId === s.revisionId,
    ),
  );
  assertSupportRefs(s.supportRefs, c.references, basis);
  assertNestedScopedRefs(s, c.references);
  const supported = new Set(s.supportRefs.map((r) => entityRefKey(r.entity)));
  phase1Assert(
    supported.has(
      entityRefKey({
        kind: 'SOURCE_FILE',
        id: s.sourceRange.sourceFileId,
        revisionId: s.revisionId,
      }),
    ),
  );
  const belongs = (n: z.infer<typeof CanonicalNodeSchema>) =>
    n.sourceRange?.sourceFileId === s.sourceRange.sourceFileId ||
    (n.kind === 'MODULE' &&
      n.sourceRange === null &&
      file !== undefined &&
      String(n.qualifiedName) === String(file.path) &&
      file.contentFingerprint === s.sourceFingerprint);
  const scopeNode = (r: z.infer<typeof ScopedRefSchema>) => {
    const n = c.codeNodes.find((n) => String(n.id) === String(r.entity.id));
    phase1Assert(
      n &&
        belongs(n) &&
        (n.kind === 'MODULE' ||
          n.kind === 'TYPE' ||
          (n.kind === 'SYMBOL' && ['METHOD', 'CONSTRUCTOR', 'FUNCTION'].includes(n.symbolKind))),
    );
    return n!;
  };
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    const r = v as Record<string, unknown>;
    if (r.scope !== undefined) {
      const ref = ScopedRefSchema.parse(r);
      phase1Assert(
        ref.scope === 'REPOSITORY' &&
          ref.repositoryId === s.repositoryId &&
          ref.entity.revisionId === s.revisionId &&
          ref.entity.kind === 'CODE_NODE' &&
          supported.has(entityRefKey(ref.entity)),
      );
      return;
    }
    if ('sourceFileId' in r && 'startLine' in r)
      phase1Assert(SourceRangeSchema.parse(r).sourceFileId === s.sourceRange.sourceFileId);
    for (const x of Object.values(r)) visit(x);
  };
  visit(s);
  if (s.owner) {
    const owner = c.codeNodes.find((n) => String(n.id) === String(s.owner!.entity.id));
    phase1Assert(owner && belongs(owner));
  }
  if (s.lexicalScope) scopeNode(s.lexicalScope);
  if (s.syntaxKind === 'DECLARATION' && s.payload.declarationForm === 'TYPE') {
    const owner = c.codeNodes.find((n) => String(n.id) === String(s.owner?.entity.id));
    phase1Assert(owner?.kind === 'TYPE' && String(owner.name) === s.payload.declaredName);
  }
  if (s.syntaxKind === 'BINDING_SCOPE') {
    const p = s.payload,
      n = scopeNode(p.scopeRef);
    phase1Assert(
      s.lexicalScope && entityRefKey(s.lexicalScope.entity) === entityRefKey(p.scopeRef.entity),
    );
    if (s.owner) phase1Assert(entityRefKey(s.owner.entity) === entityRefKey(p.scopeRef.entity));
    if (p.parentScopeRef) scopeNode(p.parentScopeRef);
    if (n.kind === 'MODULE') phase1Assert(p.parentScopeRef === null);
    else if (p.parentScopeRef === null)
      phase1Assert(p.status === 'PARTIAL' && p.limitations.includes('PARENT_SCOPE_UNKNOWN'));
  }
  if (s.syntaxKind === 'BINDING_EFFECT' && s.payload.targetScopeRef)
    scopeNode(s.payload.targetScopeRef);
  if (s.syntaxKind === 'IMPORT_BINDING' && file?.languageHint)
    phase1Assert(s.payload.language === file.languageHint);
  return result;
}

type BindingScopeRecord = Extract<SyntaxEvidenceV3, { syntaxKind: 'BINDING_SCOPE' }>;
/** Collection closure for previously parsed Syntax3; no Source or Store authority. */
export function validateSyntaxBindingScopeClosure(
  syntaxEvidence: readonly SyntaxEvidenceV3[],
  context: unknown,
): void {
  const parsed = contextSchema.parse(context);
  const c = { syntaxEvidence, nodes: parsed.codeNodes };
  const scopes = new Map<string, BindingScopeRecord>(),
    key = (r: z.infer<typeof ScopedRefSchema>) => scopedRefKey(r);
  for (const s of c.syntaxEvidence) {
    if (s.syntaxKind === 'BINDING_SCOPE') {
      const k = key(s.payload.scopeRef);
      phase1Assert(!scopes.has(k));
      scopes.set(k, s);
    }
  }
  const get = (r: z.infer<typeof ScopedRefSchema>) => {
    const s = scopes.get(key(r));
    phase1Assert(s);
    return s!;
  };
  for (const s of scopes.values()) {
    const seen = new Set<string>([key(s.payload.scopeRef)]);
    let cursor = s;
    while (cursor.payload.parentScopeRef) {
      const p = cursor.payload.parentScopeRef,
        k = key(p);
      phase1Assert(!seen.has(k));
      seen.add(k);
      const parent = get(p);
      phase1Assert(syntaxRangeContains(parent.sourceRange, cursor.sourceRange));
      cursor = parent;
    }
  }
  for (const s of c.syntaxEvidence) {
    const ownerScope = s.lexicalScope ? get(s.lexicalScope) : null;
    if (ownerScope) phase1Assert(syntaxRangeContains(ownerScope.sourceRange, s.sourceRange));
    if (s.syntaxKind === 'IMPORT_BINDING' && s.payload.importKind === 'UNKNOWN')
      phase1Assert(ownerScope?.payload.status === 'PARTIAL');
    if (s.syntaxKind === 'BINDING_EFFECT') {
      const p = s.payload;
      if (p.effect === 'UNSUPPORTED_BINDING' || p.name === null || p.targetScopeRef === null)
        phase1Assert(ownerScope?.payload.status === 'PARTIAL');
      if (p.targetScopeRef) {
        const target = get(p.targetScopeRef),
          node = c.nodes.find((n) => String(n.id) === String(p.targetScopeRef!.entity.id));
        if (p.effect === 'GLOBAL') phase1Assert(node?.kind === 'MODULE');
        else if (p.effect === 'NONLOCAL') {
          phase1Assert(
            node?.kind === 'SYMBOL' &&
              ['METHOD', 'CONSTRUCTOR', 'FUNCTION'].includes(node.symbolKind),
          );
          let parent = ownerScope?.payload.parentScopeRef ?? null,
            found = false;
          while (parent) {
            if (key(parent) === key(p.targetScopeRef)) {
              found = true;
              break;
            }
            parent = get(parent).payload.parentScopeRef;
          }
          phase1Assert(found);
        } else phase1Assert(s.lexicalScope && key(p.targetScopeRef) === key(s.lexicalScope));
        phase1Assert(target.sourceRange.sourceFileId === s.sourceRange.sourceFileId);
      }
    }
  }
}
