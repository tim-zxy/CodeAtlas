import {
  FrameworkSurfaceObservationSchema,
  type FrameworkSurfaceObservation,
} from './native-framework-surface-contract.js';
import {
  BindingAwareSyntaxObservationSchema,
  type BindingAwareSyntaxObservation,
} from './native-binding-sufficiency-contract.js';
import {
  BindingSyntaxObservationSchema,
  type BindingSyntaxObservation,
} from './native-binding-contract.js';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import {
  RepoBasisSchema,
  SourceFileSchema,
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  EvidenceSchema,
  ProviderFactBindingSchema,
  FactEvidenceSchema,
  EntityIdSchema,
  SupportRefSchema,
  ensurePhase1Data,
  parseSyntaxEvidence,
  parseSyntaxEvidenceV2,
  parseSyntaxEvidenceV3,
  parseSyntaxEvidenceV4,
  type SyntaxEvidenceV4,
  type SyntaxEvidenceV3,
  type SyntaxEvidenceV2,
  scopedRefKey,
  supportKey,
  type SyntaxEvidence,
  type SyntaxValue,
  type ScopedRef,
  type SupportRef,
} from '@codeatlas/ir';
import { NativeSyntaxObservationSchema, NativeSyntaxValueSchema } from './native-syntax-ipc.js';
import {
  chargeCompositionJSON,
  chargeCompositionIdentityTuple,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import { historyDraftDigest } from './history-transition-input.js';
import { digestIdentityTuple } from './identity-tuple.js';
import { syntaxHistoryDigest } from './syntax-history-candidate.js';
import { freezeComposition } from './native-composition-input.js';
const POLICY = 'syntax-surface-support-v1',
  MAPPER = 'syntax-canonical-mapper-v1';
export class SyntaxNormalizationError extends Error {
  constructor(
    readonly code: 'INVALID_CANDIDATE' | 'INCOMPATIBLE_CONTRACT' | 'RESOURCE_LIMIT_EXCEEDED',
    readonly causeCode: string = code,
  ) {
    super(code);
    this.name = 'SyntaxNormalizationError';
  }
}
function check(
  value: unknown,
  code: 'INVALID_CANDIDATE' | 'INCOMPATIBLE_CONTRACT' = 'INVALID_CANDIDATE',
  causeCode: string = code,
): asserts value {
  if (!value) throw new SyntaxNormalizationError(code, causeCode);
}
const supportSchema = z.strictObject({
  factType: z.enum(['NODE', 'EDGE']),
  canonical: z.union([CanonicalNodeSchema, CanonicalEdgeSchema]),
  evidence: EvidenceSchema,
  binding: ProviderFactBindingSchema,
  factEvidence: FactEvidenceSchema,
  dependencyUnitIds: z.array(EntityIdSchema).min(1).nullable(),
  valueDigest: z.string().regex(/^[0-9a-f]{64}$/),
});
const schema = z.strictObject({
  basis: RepoBasisSchema,
  sourceFile: SourceFileSchema,
  raw: NativeSyntaxObservationSchema,
  selectedNodes: z.array(CanonicalNodeSchema),
  bindings: z.array(ProviderFactBindingSchema),
  supports: z.array(supportSchema),
  extractorVersion: z.literal('syntax-v1'),
});
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
type Value = z.infer<typeof NativeSyntaxValueSchema>;
/** Pure declared mapping. Only Storage-owned Stage/Store can publish this candidate. */
export default function normalizeSyntaxObservationCore(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
  bindingV2: boolean | 3 | 4 = false,
): SyntaxEvidence | SyntaxEvidenceV2 | SyntaxEvidenceV3 | SyntaxEvidenceV4 {
  const v4 = bindingV2 === 4;
  const v3 = bindingV2 === 3 || v4;
  const policy = v4 ? 'syntax-surface-support-v2' : POLICY;
  try {
    ensurePhase1Data(context);
    check(Object.keys(context).sort().join(',') === 'budget,limits');
    check(Object.keys(context.limits).sort().join(',') === 'maxDepth,maxItems,maxSerializedBytes');
    check(Object.values(context.limits).every((v) => Number.isSafeInteger(v) && v > 0));
    check(Object.keys(context.budget).sort().join(',') === 'items,serializedBytes');
    check(
      Object.entries(context.budget).every(
        ([k, v]) =>
          Number.isSafeInteger(v) &&
          v >= 0 &&
          v <= context.limits[k === 'items' ? 'maxItems' : 'maxSerializedBytes'],
      ),
    );
    const q = (value: unknown) => chargeCompositionJSON(value, context.limits, context.budget);
    const encoded = q(input);
    q(input);
    q(input); // Original,owned decode,and schema-owned copy.
    const owned: unknown = JSON.parse(encoded);
    check(owned !== null && typeof owned === 'object');
    const keys = Object.keys(owned).sort().join(',');
    check(
      keys ===
        (v4
          ? 'basis,bindings,extractorVersion,raw,selectedEdges,selectedNodes,sourceFile,supports'
          : 'basis,bindings,extractorVersion,raw,selectedNodes,sourceFile,supports'),
      'INCOMPATIBLE_CONTRACT',
    );
    check(
      (owned as Record<string, unknown>).extractorVersion === (v4 ? 'syntax-v2' : 'syntax-v1'),
      'INCOMPATIBLE_CONTRACT',
    );
    const p = (
        v4
          ? schema.extend({
              raw: FrameworkSurfaceObservationSchema,
              selectedEdges: z.array(CanonicalEdgeSchema),
              extractorVersion: z.literal('syntax-v2'),
            })
          : v3
            ? schema.extend({ raw: BindingAwareSyntaxObservationSchema })
            : bindingV2
              ? schema.extend({ raw: BindingSyntaxObservationSchema })
              : schema
      ).parse(owned),
      b = p.basis,
      f = p.sourceFile,
      r = p.raw;
    check(
      f.repositoryId === b.repositoryId &&
        f.revisionId === b.revisionId &&
        f.sensitivity !== 'SECRET',
    );
    check(
      r.sourceFileId === f.id &&
        r.sourceFingerprint === f.contentFingerprint &&
        r.sourceRange.sourceFileId === f.id,
    );
    const nodes = new Map<string, z.infer<typeof CanonicalNodeSchema>>();
    for (const n of p.selectedNodes) {
      check(n.repositoryId === b.repositoryId && n.revisionId === b.revisionId && !nodes.has(n.id));
      q([n.id, n]);
      nodes.set(n.id, n);
    }
    const selectedEdges = 'selectedEdges' in p ? p.selectedEdges : [];
    const facts = new Map<
      string,
      z.infer<typeof CanonicalNodeSchema> | z.infer<typeof CanonicalEdgeSchema>
    >(nodes);
    for (const edge of selectedEdges) {
      q(edge);
      check(
        edge.repositoryId === b.repositoryId &&
          edge.revisionId === b.revisionId &&
          !facts.has(edge.id),
      );
      facts.set(edge.id, edge);
    }
    const typed = new Map<string, z.infer<typeof ProviderFactBindingSchema>>();
    for (const bind of p.bindings) {
      const key = q(bind.providerFact);
      check(!typed.has(key));
      typed.set(key, bind);
    }
    const original = new Set<string>();
    for (const s of p.supports) {
      const key = q(s.binding.providerFact),
        bind = typed.get(key),
        e = s.evidence;
      check(bind && isDeepStrictEqual(bind, s.binding) && !original.has(key));
      original.add(key);
      check(
        s.canonical.repositoryId === b.repositoryId &&
          s.canonical.revisionId === b.revisionId &&
          e.repositoryId === b.repositoryId &&
          e.revisionId === b.revisionId &&
          e.status === 'ACTIVE',
      );
      check(
        isDeepStrictEqual(e.providerFact, bind.providerFact) &&
          e.providerSnapshotId === bind.providerSnapshotId &&
          e.id === bind.evidenceId &&
          s.factEvidence.evidenceId === e.id,
      );
      check(
        s.factType === bind.canonicalFact.factType &&
          s.canonical.id === bind.canonicalFact.id &&
          isDeepStrictEqual(s.factEvidence.fact, bind.canonicalFact),
      );
      check(
        e.providerFact.factType === s.factType &&
          (s.factType === 'NODE') === !('source' in s.canonical),
      );
      check(
        s.valueDigest ===
          historyDraftDigest(
            { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: s.canonical },
            context.limits,
            context.budget,
          ),
      );
      if (s.factType === 'NODE') {
        const n = nodes.get(s.canonical.id);
        check(n && n.factKey === s.canonical.factKey);
        if (v4) check(isDeepStrictEqual(n, s.canonical));
      }
      if (v4 && s.factType === 'EDGE')
        check(isDeepStrictEqual(facts.get(s.canonical.id), s.canonical));
    }
    check(original.size === typed.size);
    const needed = new Map<string, ScopedRef>();
    function ref(provider: unknown): ScopedRef {
      const key = q(provider),
        bind = typed.get(key);
      check(
        bind && bind.providerFact.factType === 'NODE' && original.has(key),
        'INVALID_CANDIDATE',
        'DANGLING_REFERENCE',
      );
      const n = nodes.get(bind.canonicalFact.id);
      check(n, 'INVALID_CANDIDATE', 'DANGLING_REFERENCE');
      if (v3) check(n.confidence.score >= 0.5);
      const value: ScopedRef = {
        scope: 'REPOSITORY',
        repositoryId: b.repositoryId,
        entity: { kind: 'CODE_NODE', id: EntityIdSchema.parse(n.id), revisionId: b.revisionId },
      };
      q(value);
      needed.set(n.id, value);
      return value;
    }
    const owner = r.owner === null ? null : ref(r.owner);
    if (owner) {
      const n = nodes.get(owner.entity.id)!;
      check(
        n.sourceRange?.sourceFileId === f.id ||
          (n.kind === 'MODULE' &&
            n.sourceRange === null &&
            n.qualifiedName !== null &&
            String(n.qualifiedName) === String(f.path)),
      );
    }
    const lexicalScope =
      bindingV2 && 'lexicalScope' in r && r.lexicalScope !== null ? ref(r.lexicalScope) : null;
    function unique(values: ScopedRef[]): ScopedRef[] {
      const map = new Map(values.map((v) => [scopedRefKey(v), v]));
      return [...map.entries()].sort((a, b) => compare(a[0], b[0])).map((x) => x[1]);
    }
    let nonExactValue = false,
      unknownValue = false;
    function value(v: Value): SyntaxValue {
      if (v.kind === 'REFERENCE') {
        if (v.target.resolution !== 'EXACT') nonExactValue = true;
        const candidates = unique(
          v.target.state === 'RESOLVED' ? [ref(v.target.target)] : v.target.candidates.map(ref),
        );
        check(
          v.target.resolution !== 'AMBIGUOUS' || candidates.length >= 2,
          'INCOMPATIBLE_CONTRACT',
        );
        return { kind: 'REFERENCE', name: v.name, resolution: v.target.resolution, candidates };
      }
      if (v.kind === 'ARRAY') return { kind: 'ARRAY', items: v.items.map(value) };
      if (v.kind === 'OBJECT')
        return {
          kind: 'OBJECT',
          entries: v.entries.map((e) => ({ name: e.name, value: value(e.value) })),
        };
      if (v.kind === 'UNKNOWN') unknownValue = true;
      return v;
    }
    const compactRef = (v: ScopedRef) => ({
      kind: v4 ? v.entity.kind : 'CODE_NODE',
      id: v.entity.id,
    });
    function compact(v: SyntaxValue): unknown {
      if (v.kind === 'REFERENCE') return { ...v, candidates: v.candidates.map(compactRef) };
      if (v.kind === 'ARRAY') return { kind: v.kind, items: v.items.map(compact) };
      if (v.kind === 'OBJECT')
        return {
          kind: v.kind,
          entries: v.entries.map((e) => ({ name: e.name, value: compact(e.value) })),
        };
      return v;
    }
    let payload:
        SyntaxEvidence['payload'] | SyntaxEvidenceV3['payload'] | SyntaxEvidenceV4['payload'],
      keyPayload: unknown;
    if (r.syntaxKind === 'DECORATION' || r.syntaxKind === 'INVOCATION') {
      const raw = r.payload.callee,
        t = raw.target,
        callee = {
          name: raw.name,
          ...(v3 ? { resolution: t.resolution } : {}),
          state: t.state === 'RESOLVED' ? ('RESOLVED' as const) : ('NON_RESOLVED' as const),
          target: t.state === 'RESOLVED' ? ref(t.target) : null,
          candidates: t.state === 'RESOLVED' ? [] : unique(t.candidates.map(ref)),
        };
      const arguments_ = r.payload.arguments.map((a) => ({
        name: a.name,
        value: value(a.value),
        sourceRange: a.sourceRange,
      }));
      const keyCallee = {
          ...callee,
          target: callee.target ? compactRef(callee.target) : null,
          candidates: callee.candidates.map(compactRef),
        },
        keyArgs = arguments_.map((a) => ({ ...a, value: compact(a.value) }));
      if (r.syntaxKind === 'INVOCATION') {
        const receiver = r.payload.receiver === null ? null : value(r.payload.receiver);
        payload = { callee, arguments: arguments_, receiver };
        keyPayload = {
          callee: keyCallee,
          arguments: keyArgs,
          receiver: receiver === null ? null : compact(receiver),
        };
      } else {
        payload = { callee, arguments: arguments_ };
        keyPayload = { callee: keyCallee, arguments: keyArgs };
      }
    } else if (r.syntaxKind === 'ASSIGNMENT') {
      const v = value(r.payload.value);
      payload = { targetName: r.payload.targetName, value: v };
      keyPayload = { targetName: r.payload.targetName, value: compact(v) };
    } else if (r.syntaxKind === 'ARTIFACT') {
      check(r.payload.logicalPath === f.path);
      const declaredValues = r.payload.declaredValues.map((v) => ({
        name: v.name,
        value: value(v.value),
      }));
      payload = { ...r.payload, declaredValues };
      keyPayload = {
        ...payload,
        declaredValues: declaredValues.map((v) => ({ ...v, value: compact(v.value) })),
      };
    } else if (r.syntaxKind === 'PARAMETER_BINDING') {
      payload = { ...r.payload, callableRef: ref(r.payload.callableRef) };
      keyPayload = payload;
    } else if (r.syntaxKind === 'CALLBACK_BINDING') {
      payload = { ...r.payload, parentScopeRef: ref(r.payload.parentScopeRef) };
      keyPayload = payload;
    } else if (r.syntaxKind === 'BINDING_SCOPE') {
      payload = {
        ...r.payload,
        scopeRef: ref(r.payload.scopeRef),
        parentScopeRef: r.payload.parentScopeRef ? ref(r.payload.parentScopeRef) : null,
      };
      keyPayload = payload;
    } else if (r.syntaxKind === 'BINDING_EFFECT') {
      payload = {
        ...r.payload,
        targetScopeRef: r.payload.targetScopeRef ? ref(r.payload.targetScopeRef) : null,
      };
      keyPayload = payload;
    } else {
      payload = r.payload;
      keyPayload = payload;
    }
    function compactNested(v: unknown): unknown {
      if (Array.isArray(v)) return v.map(compactNested);
      if (v !== null && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (o.scope === 'REPOSITORY') return compactRef(v as ScopedRef);
        return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, compactNested(x)]));
      }
      return v;
    }
    if (v4 && r.syntaxKind === 'INVOCATION') {
      const invocation = r as Extract<FrameworkSurfaceObservation, { syntaxKind: 'INVOCATION' }>;
      const matches = selectedEdges.filter((edge) => {
        q(edge.id);
        return (
          edge.kind === 'CALL' &&
          owner &&
          String(edge.source.id) === String(owner.entity.id) &&
          isDeepStrictEqual(edge.sourceRange, invocation.payload.calleeRange)
        );
      });
      let codeCallRef: ScopedRef | null = null;
      if (matches.length === 1) {
        const edge = matches[0]!;
        check(
          edge.confidence.score >= 0.5 &&
            p.supports.some((s) => s.factType === 'EDGE' && s.canonical.id === edge.id),
          'INVALID_CANDIDATE',
          'DANGLING_REFERENCE',
        );
        codeCallRef = {
          scope: 'REPOSITORY',
          repositoryId: b.repositoryId,
          entity: {
            kind: 'CODE_EDGE',
            id: EntityIdSchema.parse(edge.id),
            revisionId: b.revisionId,
          },
        };
        q(codeCallRef);
        needed.set(edge.id, codeCallRef);
      }
      payload = {
        ...payload,
        ...{
          invocationForm: invocation.payload.invocationForm,
          calleeRange: invocation.payload.calleeRange,
          codeCallRef,
        },
      };
    }
    if (v3) keyPayload = compactNested(payload);
    if (bindingV2 && r.syntaxKind === 'ASSIGNMENT' && 'assignmentForm' in r.payload) {
      const assignment = r as Extract<
        BindingSyntaxObservation | BindingAwareSyntaxObservation,
        { syntaxKind: 'ASSIGNMENT' }
      >;
      const extra = {
        assignmentForm: assignment.payload.assignmentForm,
        valueRange: assignment.payload.valueRange,
      };
      payload = { ...payload, ...extra };
      keyPayload = { ...(keyPayload as object), ...extra };
    }
    q(payload);
    const reasons = [
      'DECLARED_SOURCE_CONTEXT_MATCHED',
      'SYNTAX_PAYLOAD_VALIDATED',
      'REQUIRED_SUPPORTS_CLOSED',
    ];
    if (owner === null) reasons.push('OWNER_NULL_PRESERVED');
    if (bindingV2 && lexicalScope === null) reasons.push('LEXICAL_SCOPE_NULL_PRESERVED');
    if (
      (r.syntaxKind === 'DECORATION' || r.syntaxKind === 'INVOCATION') &&
      r.payload.callee.target.resolution !== 'EXACT'
    )
      reasons.push('NON_EXACT_CALLEE_RESOLUTION_PRESERVED');
    if (nonExactValue) reasons.push('NON_EXACT_VALUE_REFERENCE_PRESERVED');
    if (unknownValue) reasons.push('UNKNOWN_VALUE_PRESERVED');
    const supportRefs: SupportRef[] = [
      SupportRefSchema.parse({
        basis: b,
        entity: { kind: 'SOURCE_FILE', id: f.id, revisionId: b.revisionId },
        valueDigest: syntaxHistoryDigest('codeatlas-phase1-support-value-v1', f, context),
      }),
    ];
    for (const n of needed.values())
      supportRefs.push(
        SupportRefSchema.parse({
          basis: b,
          entity: n.entity,
          valueDigest: syntaxHistoryDigest(
            'codeatlas-phase1-support-value-v1',
            facts.get(n.entity.id)!,
            context,
          ),
        }),
      );
    supportRefs.sort((a, b) => compare(supportKey(a), supportKey(b)));
    const meaning = {
        owner: owner ? compactRef(owner) : null,
        ...(bindingV2 ? { lexicalScope: lexicalScope ? compactRef(lexicalScope) : null } : {}),
        ...(v3 ? { controlContext: (r as BindingAwareSyntaxObservation).controlContext } : {}),
        ...(v4 ? { callbackScope: (r as FrameworkSurfaceObservation).callbackScope } : {}),
        payload: keyPayload,
      },
      pd = historyDraftDigest(meaning, context.limits, context.budget),
      range = r.sourceRange,
      fields = [
        b.repositoryId,
        f.id,
        f.contentFingerprint,
        range.startLine,
        range.startColumn,
        range.endLine,
        range.endColumn,
        r.syntaxKind,
        pd,
      ];
    const keyDomain = v4
      ? 'syntax-key-v4'
      : v3
        ? 'syntax-key-v3'
        : bindingV2
          ? 'syntax-key-v2'
          : 'syntax-key-v1';
    const extractionDomain = v4
      ? 'syntax-extraction-v4'
      : v3
        ? 'syntax-extraction-v3'
        : bindingV2
          ? 'syntax-extraction-v2'
          : 'syntax-extraction-v1';
    chargeCompositionIdentityTuple(keyDomain, fields, context);
    const syntaxKey = digestIdentityTuple(keyDomain, fields),
      versions = v4
        ? ['syntax-v2', 'syntax-canonical-mapper-v4', policy, 'SYNTAX_BINDING_V4']
        : v3
          ? ['syntax-v1', 'syntax-canonical-mapper-v3', POLICY, 'SYNTAX_BINDING_V3']
          : bindingV2
            ? ['syntax-v1', 'syntax-canonical-mapper-v2', POLICY, 'SYNTAX_BINDING_V2']
            : ['syntax-v1', MAPPER, POLICY];
    chargeCompositionIdentityTuple(extractionDomain, versions, context);
    const extractionVersion = digestIdentityTuple(extractionDomain, versions);
    const initial = {
      syntaxKey,
      repositoryId: b.repositoryId,
      revisionId: b.revisionId,
      sourceFingerprint: r.sourceFingerprint,
      sourceRange: r.sourceRange,
      owner,
      ...(bindingV2 ? { lexicalScope } : {}),
      ...(v3 ? { controlContext: (r as BindingAwareSyntaxObservation).controlContext } : {}),
      supportRefs,
      ...(v4 ? { callbackScope: (r as FrameworkSurfaceObservation).callbackScope } : {}),
      confidence: { score: 0.5, method: policy, reasons },
      extractionVersion,
      syntaxKind: r.syntaxKind,
      payload,
    };
    const id =
        'syntax:' +
        syntaxHistoryDigest(
          v4
            ? 'codeatlas-syntax-initial-v4'
            : v3
              ? 'codeatlas-syntax-initial-v3'
              : bindingV2
                ? 'codeatlas-syntax-initial-v2'
                : 'codeatlas-syntax-initial-v1',
          initial,
          context,
        ),
      envelope = {
        schema: 'codeatlas.syntax-evidence',
        version: v4 ? 4 : v3 ? 3 : bindingV2 ? 2 : 1,
        payload: { id, ...initial },
      },
      referenceContext = {
        availableEntities: [
          {
            scope: 'REPOSITORY',
            repositoryId: b.repositoryId,
            entity: { kind: 'SOURCE_FILE', id: f.id, revisionId: b.revisionId },
          },
          ...(v4
            ? selectedEdges.map((e) => ({
                scope: 'REPOSITORY',
                repositoryId: b.repositoryId,
                entity: { kind: 'CODE_EDGE', id: e.id, revisionId: b.revisionId },
              }))
            : []),
          ...p.selectedNodes.map((n) => ({
            scope: 'REPOSITORY',
            repositoryId: b.repositoryId,
            entity: { kind: 'CODE_NODE', id: n.id, revisionId: b.revisionId },
          })),
        ],
        availableSupports: supportRefs,
      };
    q(envelope);
    q(envelope);
    q(referenceContext);
    q(referenceContext);
    if (bindingV2) {
      const bindingContext = {
        references: referenceContext,
        codeNodes: p.selectedNodes,
        ...(v4 ? { codeEdges: selectedEdges } : {}),
        sourceFiles: [f],
      };
      q(bindingContext);
      q(bindingContext);
      return freezeComposition(
        v4
          ? parseSyntaxEvidenceV4(envelope, bindingContext).payload
          : v3
            ? parseSyntaxEvidenceV3(envelope, bindingContext).payload
            : parseSyntaxEvidenceV2(envelope, bindingContext).payload,
      );
    }
    return freezeComposition(parseSyntaxEvidence(envelope, referenceContext).payload);
  } catch (e) {
    if (e instanceof SyntaxNormalizationError) throw e;
    if (e !== null && typeof e === 'object' && 'code' in e && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new SyntaxNormalizationError('RESOURCE_LIMIT_EXCEEDED');
    throw new SyntaxNormalizationError('INVALID_CANDIDATE');
  }
}
