import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { CanonicalNodeSchema, CanonicalEdgeSchema } from './canonical-code-fact.js';
import { SourceFileSchema } from './source-file.js';
import { SourceRangeSchema } from './references.js';
import { parseIr } from './validation.js';
import {
  SyntaxEvidenceV3Schema,
  parseSyntaxEvidenceV3,
  validateSyntaxBindingScopeClosure,
  syntaxRangeContains,
} from './syntax-evidence-v3.js';
import {
  ensurePhase1Data,
  Phase1ExactStringSchema as Text,
  Phase1OrdinalSchema,
  ScopedRefSchema,
  Phase1ReferenceContextSchema,
  RepoBasisSchema,
  phase1Assert,
  assertSupportRefs,
  assertNestedScopedRefs,
  assertUnique,
  entityRefKey,
  scopedRefKey,
} from './phase1-support.js';

const nodeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_NODE',
);
const edgeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_EDGE',
);
const site = z.strictObject({
  syntaxKind: z.literal('INVOCATION'),
  sourceRange: SourceRangeSchema,
});
const extra = { callbackScope: SourceRangeSchema.nullable() };
const [decoration, invocation, declaration, assignment, artifact, imported, effect, scope] =
  SyntaxEvidenceV3Schema.options;
const common = decoration.omit({ syntaxKind: true, payload: true }).extend(extra);
export const SyntaxEvidenceV4Schema = z.discriminatedUnion('syntaxKind', [
  decoration.safeExtend(extra),
  invocation.safeExtend({
    ...extra,
    payload: invocation.shape.payload.safeExtend({
      invocationForm: z.enum(['CALL', 'CONSTRUCT']),
      calleeRange: SourceRangeSchema,
      codeCallRef: edgeRef.nullable(),
    }),
  }),
  declaration.safeExtend(extra),
  assignment.safeExtend(extra),
  artifact.safeExtend(extra),
  imported.safeExtend(extra),
  effect.safeExtend(extra),
  scope.safeExtend(extra),
  common.extend({
    syntaxKind: z.literal('PARAMETER_BINDING'),
    payload: z.strictObject({
      callableRef: nodeRef,
      language: z.enum(['java', 'python']),
      name: Text,
      ordinal: Phase1OrdinalSchema,
      parameterForm: z.enum(['POSITIONAL', 'KEYWORD_ONLY']),
      declaredType: Text.nullable(),
      typeRange: SourceRangeSchema.nullable(),
      defaultValueRange: SourceRangeSchema.nullable(),
    }),
  }),
  common.extend({
    syntaxKind: z.literal('VALUE_LINK'),
    payload: z.strictObject({
      relation: z.enum(['RECEIVER_RESULT', 'ARGUMENT_RESULT']),
      producer: site,
      consumer: site,
      argumentIndex: Phase1OrdinalSchema.nullable(),
    }),
  }),
  common.extend({
    syntaxKind: z.literal('CALLBACK_BINDING'),
    payload: z.strictObject({
      consumer: site,
      argumentIndex: Phase1OrdinalSchema,
      callbackForm: z.enum(['JAVA_LAMBDA_DIRECT_CALL', 'JAVA_METHOD_REFERENCE']),
      parentScopeRef: nodeRef,
      parameterNames: z.array(Text),
      body: site.nullable(),
      reference: z.strictObject({ qualifier: z.literal('THIS'), memberName: Text }).nullable(),
      status: z.enum(['COMPLETE', 'PARTIAL']),
      limitations: z.array(Text),
    }),
  }),
]);
export type SyntaxEvidenceV4 = z.infer<typeof SyntaxEvidenceV4Schema>;
const envelope = z.strictObject({
  schema: z.literal('codeatlas.syntax-evidence'),
  version: z.literal(4),
  payload: SyntaxEvidenceV4Schema,
});
const contextSchema = z.strictObject({
  references: Phase1ReferenceContextSchema,
  codeNodes: z.array(CanonicalNodeSchema),
  codeEdges: z.array(CanonicalEdgeSchema),
  sourceFiles: z.array(SourceFileSchema),
});
const oldKinds = new Set<string>(
  SyntaxEvidenceV3Schema.options.map((o) => o.shape.syntaxKind.value),
);
function legacy(s: SyntaxEvidenceV4) {
  const { callbackScope: _, ...r } = s;
  if (r.syntaxKind === 'INVOCATION') {
    const { invocationForm: __, calleeRange: ___, codeCallRef: ____, ...payload } = r.payload;
    return { ...r, payload };
  }
  return r;
}
const sameRef = (
  a: z.infer<typeof ScopedRefSchema> | null,
  b: z.infer<typeof ScopedRefSchema> | null,
) => a !== null && b !== null && scopedRefKey(a) === scopedRefKey(b);
const callable = (n: z.infer<typeof CanonicalNodeSchema> | undefined) =>
  n?.kind === 'SYMBOL' && ['METHOD', 'CONSTRUCTOR', 'FUNCTION'].includes(n.symbolKind);
const rangeKey = (r: z.infer<typeof SourceRangeSchema>) =>
  JSON.stringify([r.sourceFileId, r.startLine, r.startColumn, r.endLine, r.endColumn]);
/** Strict single-record validation; collection closure is additionally required before use. */
export function parseSyntaxEvidenceV4(input: unknown, contextInput: unknown) {
  ensurePhase1Data(input);
  ensurePhase1Data(contextInput);
  const result = parseIr(envelope, input),
    c = parseIr(contextSchema, contextInput),
    s = result.payload;
  const basis = RepoBasisSchema.parse(s.supportRefs[0]!.basis);
  phase1Assert(basis.repositoryId === s.repositoryId && basis.revisionId === s.revisionId);
  assertUnique(c.codeNodes.map((n) => n.id));
  assertUnique(c.codeNodes.map((n) => n.factKey));
  assertUnique(c.codeEdges.map((n) => n.id));
  assertUnique(c.codeEdges.map((n) => n.factKey));
  assertUnique(c.sourceFiles.map((f) => f.id));
  assertUnique(c.sourceFiles.map((f) => f.path));
  for (const n of [...c.codeNodes, ...c.codeEdges, ...c.sourceFiles])
    phase1Assert(n.repositoryId === s.repositoryId && n.revisionId === s.revisionId);
  const file = c.sourceFiles.find((f) => f.id === s.sourceRange.sourceFileId);
  phase1Assert(file && file.contentFingerprint === s.sourceFingerprint);
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
      String(n.qualifiedName) === String(file.path));
  const getNode = (r: z.infer<typeof ScopedRefSchema>) => {
    const n = c.codeNodes.find((n) => String(n.id) === String(r.entity.id));
    phase1Assert(n && belongs(n));
    return n;
  };
  const getScope = (r: z.infer<typeof ScopedRefSchema>) => {
    const n = getNode(r);
    phase1Assert(n.kind === 'MODULE' || n.kind === 'TYPE' || callable(n));
    return n;
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
          ['CODE_NODE', 'CODE_EDGE'].includes(ref.entity.kind) &&
          supported.has(entityRefKey(ref.entity)),
      );
      if (ref.entity.kind === 'CODE_NODE') getNode(ref);
      return;
    }
    if ('sourceFileId' in r && 'startLine' in r)
      phase1Assert(SourceRangeSchema.parse(r).sourceFileId === s.sourceRange.sourceFileId);
    for (const x of Object.values(r)) visit(x);
  };
  visit(s);
  if (s.owner) getNode(s.owner);
  if (s.lexicalScope) getScope(s.lexicalScope);
  if (oldKinds.has(s.syntaxKind))
    parseSyntaxEvidenceV3(
      { schema: result.schema, version: 3, payload: legacy(s) },
      { references: c.references, codeNodes: c.codeNodes, sourceFiles: c.sourceFiles },
    );
  if (s.callbackScope)
    phase1Assert(
      s.syntaxKind === 'INVOCATION' &&
        s.lexicalScope === null &&
        s.controlContext === 'UNKNOWN' &&
        syntaxRangeContains(s.callbackScope, s.sourceRange),
    );
  if (s.syntaxKind === 'INVOCATION') {
    phase1Assert(syntaxRangeContains(s.sourceRange, s.payload.calleeRange));
    for (const a of s.payload.arguments)
      phase1Assert(syntaxRangeContains(s.sourceRange, a.sourceRange));
    if (s.payload.codeCallRef) {
      const e = c.codeEdges.find((e) => String(e.id) === String(s.payload.codeCallRef!.entity.id));
      phase1Assert(
        e &&
          e.kind === 'CALL' &&
          e.sourceRange &&
          isDeepStrictEqual(e.sourceRange, s.payload.calleeRange) &&
          s.owner &&
          String(e.source.id) === String(s.owner.entity.id),
      );
    }
  }
  if (s.syntaxKind === 'PARAMETER_BINDING') {
    const p = s.payload;
    phase1Assert(
      callable(getScope(p.callableRef)) &&
        sameRef(s.owner, p.callableRef) &&
        sameRef(s.lexicalScope, p.callableRef) &&
        s.callbackScope === null,
    );
    if (file.languageHint) phase1Assert(p.language === file.languageHint);
    phase1Assert((p.typeRange === null) === (p.declaredType === null));
    for (const r of [p.typeRange, p.defaultValueRange])
      if (r) phase1Assert(syntaxRangeContains(s.sourceRange, r));
    if (p.language === 'java')
      phase1Assert(p.defaultValueRange === null && p.parameterForm === 'POSITIONAL');
  }
  if (s.syntaxKind === 'VALUE_LINK')
    phase1Assert(
      s.callbackScope === null &&
        (s.payload.relation === 'RECEIVER_RESULT'
          ? s.payload.argumentIndex === null
          : s.payload.argumentIndex !== null),
    );
  if (s.syntaxKind === 'CALLBACK_BINDING') {
    const p = s.payload;
    phase1Assert(
      callable(getScope(p.parentScopeRef)) &&
        sameRef(s.owner, p.parentScopeRef) &&
        sameRef(s.lexicalScope, p.parentScopeRef) &&
        s.callbackScope === null,
    );
    phase1Assert((p.status === 'COMPLETE') === (p.limitations.length === 0));
    assertUnique(p.limitations);
    assertUnique(p.parameterNames);
    if (p.callbackForm === 'JAVA_METHOD_REFERENCE')
      phase1Assert(p.body === null && p.reference !== null && p.parameterNames.length === 0);
    else phase1Assert(p.body !== null && p.reference === null && p.parameterNames.length === 1);
  }
  return result;
}
/** Validate parsed records together; no authority to publish or prove framework semantics. */
export function validateSyntaxSurfaceClosure(
  syntaxEvidence: readonly SyntaxEvidenceV4[],
  contextInput: unknown,
): void {
  ensurePhase1Data(syntaxEvidence);
  const c = parseIr(contextSchema, contextInput);
  // Revalidate at the trust boundary: callers cannot label unchecked structures as parsed.
  const records = syntaxEvidence.map(
    (payload) =>
      parseSyntaxEvidenceV4({ schema: 'codeatlas.syntax-evidence', version: 4, payload }, c)
        .payload,
  );
  assertUnique(records.map((s) => s.id));
  assertUnique(records.map((s) => s.syntaxKey));
  const old = records
    .filter((s) => oldKinds.has(s.syntaxKind))
    .map((s) => SyntaxEvidenceV3Schema.parse(legacy(s)));
  validateSyntaxBindingScopeClosure(old, {
    references: c.references,
    codeNodes: c.codeNodes,
    sourceFiles: c.sourceFiles,
  });
  const scopes = new Map(
    records
      .filter((s) => s.syntaxKind === 'BINDING_SCOPE')
      .map((s) => [scopedRefKey(s.payload.scopeRef), s]),
  );
  const invocations = new Map<string, Extract<SyntaxEvidenceV4, { syntaxKind: 'INVOCATION' }>>();
  for (const s of records) {
    if (s.lexicalScope) {
      const scope = scopes.get(scopedRefKey(s.lexicalScope));
      phase1Assert(scope && syntaxRangeContains(scope.sourceRange, s.sourceRange));
    }
    if (s.syntaxKind === 'INVOCATION') {
      const k = rangeKey(s.sourceRange);
      phase1Assert(!invocations.has(k));
      invocations.set(k, s);
    }
  }
  const getSite = (location: z.infer<typeof site>, record: SyntaxEvidenceV4) => {
    const v = invocations.get(rangeKey(location.sourceRange));
    phase1Assert(
      v &&
        v.sourceFingerprint === record.sourceFingerprint &&
        v.repositoryId === record.repositoryId &&
        v.revisionId === record.revisionId,
    );
    return v;
  };
  for (const s of records) {
    if (s.syntaxKind === 'DECLARATION' && s.payload.declarationForm === 'CALLABLE') {
      phase1Assert(
        s.owner && callable(c.codeNodes.find((n) => String(n.id) === String(s.owner!.entity.id))),
      );
      const ps = records
        .filter(
          (r): r is Extract<SyntaxEvidenceV4, { syntaxKind: 'PARAMETER_BINDING' }> =>
            r.syntaxKind === 'PARAMETER_BINDING' && sameRef(r.payload.callableRef, s.owner),
        )
        .sort((a, b) => a.payload.ordinal - b.payload.ordinal);
      phase1Assert(ps.length === s.payload.parameterNames.length);
      assertUnique(s.payload.parameterNames);
      for (let i = 0; i < ps.length; i++)
        phase1Assert(
          ps[i]!.payload.ordinal === i &&
            ps[i]!.payload.name === s.payload.parameterNames[i] &&
            syntaxRangeContains(s.sourceRange, ps[i]!.sourceRange),
        );
    }
    if (s.syntaxKind === 'PARAMETER_BINDING')
      phase1Assert(
        records.filter(
          (r) =>
            r.syntaxKind === 'DECLARATION' &&
            r.payload.declarationForm === 'CALLABLE' &&
            sameRef(r.owner, s.payload.callableRef),
        ).length === 1,
      );
    if (s.syntaxKind === 'VALUE_LINK') {
      const p = s.payload,
        a = getSite(p.producer, s),
        b = getSite(p.consumer, s);
      phase1Assert(
        a !== b &&
          syntaxRangeContains(b.sourceRange, a.sourceRange) &&
          !isDeepStrictEqual(a.sourceRange, b.sourceRange) &&
          syntaxRangeContains(s.sourceRange, a.sourceRange) &&
          syntaxRangeContains(s.sourceRange, b.sourceRange),
      );
      phase1Assert(
        sameRef(a.owner, b.owner) &&
          sameRef(s.owner, b.owner) &&
          isDeepStrictEqual(a.callbackScope, b.callbackScope),
      );
      if (p.relation === 'ARGUMENT_RESULT') {
        const arg = b.payload.arguments[p.argumentIndex!];
        phase1Assert(arg && syntaxRangeContains(arg.sourceRange, a.sourceRange));
      } else {
        phase1Assert(b.payload.receiver !== null);
        phase1Assert(!syntaxRangeContains(a.sourceRange, b.payload.calleeRange));
        for (const arg of b.payload.arguments)
          phase1Assert(!syntaxRangeContains(arg.sourceRange, a.sourceRange));
      }
    }
    if (s.syntaxKind === 'CALLBACK_BINDING') {
      const p = s.payload,
        consumer = getSite(p.consumer, s),
        arg = consumer.payload.arguments[p.argumentIndex];
      phase1Assert(
        arg &&
          isDeepStrictEqual(arg.sourceRange, s.sourceRange) &&
          sameRef(consumer.owner, p.parentScopeRef) &&
          consumer.callbackScope === null,
      );
      if (p.body) {
        const body = getSite(p.body, s);
        phase1Assert(
          isDeepStrictEqual(body.callbackScope, s.sourceRange) &&
            body.lexicalScope === null &&
            body.controlContext === 'UNKNOWN' &&
            sameRef(body.owner, p.parentScopeRef),
        );
        phase1Assert(body.payload.invocationForm === 'CALL' && body.payload.arguments.length === 1);
        const value = body.payload.arguments[0]!.value;
        phase1Assert(value.kind === 'REFERENCE' && value.name === p.parameterNames[0]);
        phase1Assert(
          records.filter(
            (r) =>
              r.syntaxKind === 'INVOCATION' &&
              r.callbackScope &&
              isDeepStrictEqual(r.callbackScope, s.sourceRange),
          ).length === 1,
        );
      }
    }
    if (s.callbackScope)
      phase1Assert(
        records.filter(
          (r) =>
            r.syntaxKind === 'CALLBACK_BINDING' &&
            r.payload.body &&
            isDeepStrictEqual(r.sourceRange, s.callbackScope) &&
            isDeepStrictEqual(r.payload.body.sourceRange, s.sourceRange),
        ).length === 1,
      );
  }
}
