import {
  FrameworkSurfaceObservationSchema,
  validateFrameworkSurfaceRawClosure,
  type FrameworkSurfaceObservation,
} from './native-framework-surface-contract.js';
import {
  BindingAwareSyntaxObservationSchema,
  type BindingAwareSyntaxObservation,
} from './native-binding-sufficiency-contract.js';
import readObservationRequest from './native-code-syntax-request.js';
import { BindingSyntaxObservationSchema } from './native-binding-contract.js';
import {
  chargeCodeSyntaxJSON,
  spendCodeSyntaxBudget,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import {
  decodeCodeSyntaxLine as decode,
  CodeSyntaxRequestSchema as RequestSchema,
  copyCodeSyntaxBytes as copyBytes,
  assertCodeSyntaxData as data,
  copyCodeSyntaxBytesWithBudget,
  decodeCodeSyntaxLineWithBudget,
} from './native-code-syntax-request.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  ProviderNodeSchema,
  ProviderEdgeSchema,
  ProviderNodeRefSchema,
  ProviderSnapshotDiagnosticSchema,
  type SourceRange,
  type ProviderNodeRef,
} from '@codeatlas/ir';
import { NativeIpcErrorSchema, type NativeIpcErrorCode } from './native-ipc.js';
import { NativeCoverageStatisticsV2Schema } from './native-ipc-v2.js';
import {
  SyntaxObservationRequestSchema,
  NativeSyntaxObservationSchema,
  NativeSyntaxCoverageSchema,
  NativeSyntaxContractError,
} from './native-syntax-ipc.js';
import normalizePythonSourceObservationWithBudget, {
  normalizePythonSourceObservation,
} from './python-normalizer.js';
import { NATIVE_CLIENT_HARD_LIMITS } from './native-client.js';

type CodeSyntaxRequest = ReturnType<typeof readObservationRequest>['request'];
const facets = ['MODULE', 'FUNCTION', 'IMPORT', 'REFERENCE'] as const;
const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((v) => !Object.is(v, -0));
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const contract = z.literal('PYTHON_SYNTAX_CODE_V1');
const envelope = {
  protocolVersion: z.literal(5),
  requestId: SyntaxObservationRequestSchema.shape.requestId,
  sequence: integer,
};
const pshape = RequestSchema.shape.payload.shape;
const binding = {
  expectedActivationBasis: pshape.expectedActivationBasis,
  targetSource: pshape.targetSource,
  ownerBinding: pshape.ownerBinding,
  extractorVersion: pshape.extractorVersion,
  codeContract: contract,
  requestChecksum: digest,
};
const countShape = {
  nodes: integer,
  edges: integer,
  syntax: integer,
  codeCoverage: integer,
  syntaxCoverage: integer,
  diagnostics: integer,
};
const codeCoverage = NativeSyntaxCoverageSchema.safeExtend({
  codeContract: contract,
  facet: z.enum(facets),
  statistics: NativeCoverageStatisticsV2Schema,
});
function eventSchema(version: 5 | 6 | 7 | 8) {
  const bindingV6 = version !== 5;
  const selectedEnvelope = {
    ...envelope,
    protocolVersion: z.literal(version),
  };
  const selectedBinding = bindingV6
    ? {
        ...binding,
        syntaxContract: z.literal(
          version === 8
            ? 'SYNTAX_BINDING_V4'
            : version === 7
              ? 'SYNTAX_BINDING_V3'
              : 'SYNTAX_BINDING_V2',
        ),
      }
    : binding;
  return z.discriminatedUnion('type', [
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('OBSERVATION_STARTED'),
      payload: z.strictObject(selectedBinding),
    }),
    z.strictObject({ ...selectedEnvelope, type: z.literal('NODE'), payload: ProviderNodeSchema }),
    z.strictObject({ ...selectedEnvelope, type: z.literal('EDGE'), payload: ProviderEdgeSchema }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('SYNTAX_OBSERVATION'),
      payload:
        version === 8
          ? FrameworkSurfaceObservationSchema
          : version === 7
            ? BindingAwareSyntaxObservationSchema
            : bindingV6
              ? BindingSyntaxObservationSchema
              : NativeSyntaxObservationSchema,
    }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('CODE_COVERAGE'),
      payload: codeCoverage,
    }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('SYNTAX_COVERAGE'),
      payload: NativeSyntaxCoverageSchema,
    }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('DIAGNOSTIC'),
      payload: ProviderSnapshotDiagnosticSchema,
    }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('OBSERVATION_COMPLETED'),
      payload: z.strictObject({
        ...selectedBinding,
        codeOutcome: z.enum(['COMPLETE', 'PARTIAL', 'NOT_APPLICABLE']),
        syntaxOutcome: z.enum(['COMPLETE', 'PARTIAL']),
        outcome: z.enum(['SUCCEEDED', 'PARTIAL']),
        counts: z.strictObject(countShape),
        checksum: digest,
      }),
    }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('OBSERVATION_FAILED'),
      payload: NativeIpcErrorSchema,
    }),
    z.strictObject({
      ...selectedEnvelope,
      type: z.literal('REQUEST_FAILED'),
      payload: NativeIpcErrorSchema,
    }),
  ]);
}
type CodeSyntaxEvent = z.infer<ReturnType<typeof eventSchema>>;
type Completed = Extract<CodeSyntaxEvent, { type: 'OBSERVATION_COMPLETED' }>['payload'];
export interface ValidatedCodeSyntaxObservation {
  readonly request: CodeSyntaxRequest;
  readonly events: readonly CodeSyntaxEvent[];
  readonly codeOutcome: Completed['codeOutcome'];
  readonly syntaxOutcome: Completed['syntaxOutcome'];
  readonly outcome: Completed['outcome'];
  readonly counts: Completed['counts'];
  readonly checksum: string;
  readonly requestChecksum: string;
}
function check(value: unknown, code: NativeIpcErrorCode = 'PROTOCOL_CORRUPTION'): asserts value {
  if (!value) throw new NativeSyntaxContractError(code);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function readEvents(
  outputBytes: Uint8Array,
  request: CodeSyntaxRequest,
  requestChecksum: string,
  context: CodeSyntaxCompositionBudget | null,
): { events: readonly CodeSyntaxEvent[]; outputIdentity: string | null } {
  const p = request.payload,
    b = p.resourceBudget;
  const raw = context
    ? copyCodeSyntaxBytesWithBudget(
        outputBytes,
        Math.min(b.maxOutputBytes, NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes),
        'PROTOCOL_CORRUPTION',
        context,
      )
    : copyBytes(
        outputBytes,
        Math.min(b.maxOutputBytes, NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes),
        'PROTOCOL_CORRUPTION',
      );
  const events: CodeSyntaxEvent[] = [],
    hash = createHash('sha256');
  const actual = {
    nodes: 0,
    edges: 0,
    syntax: 0,
    codeCoverage: 0,
    syntaxCoverage: 0,
    diagnostics: 0,
  };
  const counters = {
    NODE: 'nodes',
    EDGE: 'edges',
    SYNTAX_OBSERVATION: 'syntax',
    CODE_COVERAGE: 'codeCoverage',
    SYNTAX_COVERAGE: 'syntaxCoverage',
    DIAGNOSTIC: 'diagnostics',
  } as const;
  const expected = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: p.ownerBinding,
    extractorVersion: p.extractorVersion,
    codeContract: p.codeContract,
    requestChecksum,
    ...(request.protocolVersion !== 5 ? { syntaxContract: p.syntaxContract } : {}),
  };
  const selectedSchema = eventSchema(request.protocolVersion);
  for (let start = 0; start < raw.length;) {
    const lf = raw.indexOf(10, start),
      end = lf < 0 ? raw.length : lf + 1;
    check(end - start <= NATIVE_CLIENT_HARD_LIMITS.maxLineBytes, 'RESOURCE_LIMIT_EXCEEDED');
    check(lf >= 0);
    check(
      events.length < Math.min(b.maxEvents, NATIVE_CLIENT_HARD_LIMITS.maxEvents),
      'RESOURCE_LIMIT_EXCEEDED',
    );
    const bytes = raw.subarray(start, end),
      value = context
        ? decodeCodeSyntaxLineWithBudget(bytes, 'PROTOCOL_CORRUPTION', context)
        : decode(bytes, 'PROTOCOL_CORRUPTION');
    data(
      value,
      Math.min(b.maxDepth, context?.limits.maxDepth ?? b.maxDepth),
      'PROTOCOL_CORRUPTION',
    );
    const e = selectedSchema.parse(value),
      i = events.length;
    if (context) chargeCodeSyntaxJSON(e, 'PROTOCOL_CORRUPTION', context);
    check(e.requestId === request.requestId && e.sequence === i);
    if (e.type === 'REQUEST_FAILED' || e.type === 'OBSERVATION_FAILED') {
      check(end === raw.length && (e.type === 'REQUEST_FAILED' ? i === 0 : i > 0));
      throw new NativeSyntaxContractError(e.payload.code);
    }
    if (i === 0) check(e.type === 'OBSERVATION_STARTED');
    else check(e.type !== 'OBSERVATION_STARTED');
    if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED') {
      const picked = Object.fromEntries(
        Object.keys(expected).map((k) => [k, (e.payload as Record<string, unknown>)[k]]),
      );
      check(isDeepStrictEqual(picked, expected));
    }
    if (e.type === 'OBSERVATION_COMPLETED') {
      check(end === raw.length && i > 0 && isDeepStrictEqual(actual, e.payload.counts));
      check(e.payload.checksum === hash.digest('hex'));
      events.push(e);
      if (context) chargeCodeSyntaxJSON(events, 'PROTOCOL_CORRUPTION', context);
      return {
        events,
        outputIdentity: context ? createHash('sha256').update(raw).digest('hex') : null,
      };
    }
    const key = counters[e.type as keyof typeof counters];
    if (key) actual[key]++;
    hash.update(bytes);
    events.push(e);
    start = end;
  }
  check(false);
}
const refKey = (r: ProviderNodeRef) => JSON.stringify([r.providerId, r.providerFactId]);
const point = (a: number, b: number, x: number, y: number) =>
  a < x ? -1 : a > x ? 1 : b < y ? -1 : b > y ? 1 : 0;
const contains = (outer: SourceRange, inner: SourceRange) =>
  outer.sourceFileId === inner.sourceFileId &&
  point(outer.startLine, outer.startColumn, inner.startLine, inner.startColumn) <= 0 &&
  point(outer.endLine, outer.endColumn, inner.endLine, inner.endColumn) >= 0;
function validateCorrespondence(
  request: CodeSyntaxRequest,
  events: readonly CodeSyntaxEvent[],
  context: CodeSyntaxCompositionBudget | null,
): void {
  if (context) chargeCodeSyntaxJSON({ request, events }, 'PROTOCOL_CORRUPTION', context);
  const keyFor = (ref: ProviderNodeRef) => {
    const key = refKey(ref);
    if (context) chargeCodeSyntaxJSON(key, 'PROTOCOL_CORRUPTION', context);
    return key;
  };
  const p = request.payload,
    files = new Map<string, (typeof p.sourceFiles)[number]>(p.sourceFiles.map((f) => [f.id, f]));
  const scalar = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
  const ordered = [...files.values()].sort((a, b) => scalar(a.path, b.path) || scalar(a.id, b.id));
  const order = new Map<string, number>(ordered.map((f, i) => [f.id, i]));
  const nodes = events.flatMap((e) => (e.type === 'NODE' ? [e.payload] : []));
  const edges = events.flatMap((e) => (e.type === 'EDGE' ? [e.payload] : []));
  const syntax = events.flatMap((e) => (e.type === 'SYNTAX_OBSERVATION' ? [e.payload] : []));
  const owners = new Map(p.owners.map((o) => [keyFor(o.providerNodeRef), o.sourceFileId]));
  const nodeMap = new Map(nodes.map((n) => [n.providerFactId, n]));
  check(
    nodeMap.size === nodes.length &&
      new Set(edges.map((e) => e.providerFactId)).size === edges.length,
  );
  for (const n of nodes)
    owners.set(
      keyFor({ factType: 'NODE', providerId: n.providerId, providerFactId: n.providerFactId }),
      n.sourceRange!.sourceFileId,
    );
  const coverages = new Map<string, z.infer<typeof codeCoverage>>(),
    syntaxCovered = new Set<string>(),
    syntaxIds = new Set<string>();
  let lastFile = -1,
    lastPhase = -1,
    lastFacet = -1,
    globalDiagnostic = false,
    partialSyntax = false;
  function refs(value: unknown, fileId: string): void {
    if (context) spendCodeSyntaxBudget(context, 'items', 1);
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((v) => refs(v, fileId));
      return;
    }
    const o = value as Record<string, unknown>;
    if (o.factType === 'NODE') {
      check(owners.get(keyFor(ProviderNodeRefSchema.parse(o))) === fileId);
      return;
    }
    if (Object.hasOwn(o, 'sourceFileId')) check(o.sourceFileId === fileId);
    if (o.kind === 'OBJECT' && Array.isArray(o.entries))
      check(new Set(o.entries.map((x) => (x as { name: string }).name)).size === o.entries.length);
    Object.values(o).forEach((v) => refs(v, fileId));
  }
  for (const e of events) {
    if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED') continue;
    check(e.type !== 'REQUEST_FAILED' && e.type !== 'OBSERVATION_FAILED');
    let fileId: string, phase: number;
    if (e.type === 'DIAGNOSTIC' && e.payload.sourceRange === null) {
      globalDiagnostic = true;
      continue;
    }
    check(!globalDiagnostic);
    if (e.type === 'NODE' || e.type === 'EDGE') {
      const f = e.payload;
      check(
        f.providerId === p.providerId &&
          f.providerSnapshotId === p.providerSnapshotId &&
          f.repositoryId === p.targetSource.repositoryId &&
          f.revisionId === p.targetSource.revisionId,
      );
      check(
        f.sourceRange !== null && files.get(f.sourceRange.sourceFileId)?.languageHint === 'python',
      );
      fileId = f.sourceRange.sourceFileId;
      phase = e.type === 'NODE' ? 0 : 1;
      if (e.type === 'EDGE') refs(e.payload, fileId);
    } else if (e.type === 'SYNTAX_OBSERVATION') {
      const s = e.payload;
      fileId = s.sourceFileId;
      phase = 2;
      check(
        !syntaxIds.has(s.providerSyntaxId) &&
          s.sourceRange.sourceFileId === fileId &&
          files.get(fileId)?.contentFingerprint === s.sourceFingerprint,
      );
      if (context) chargeCodeSyntaxJSON(s.providerSyntaxId, 'PROTOCOL_CORRUPTION', context);
      syntaxIds.add(s.providerSyntaxId);
      refs(s, fileId);
    } else if (e.type === 'CODE_COVERAGE') {
      const c = e.payload;
      fileId = c.sourceFileId;
      phase = 3;
      check(
        files.get(fileId)?.languageHint === 'python' &&
          files.get(fileId)?.contentFingerprint === c.sourceFingerprint,
      );
      const key = JSON.stringify([fileId, c.facet]);
      check(!coverages.has(key));
      if (context) chargeCodeSyntaxJSON({ key, coverage: c }, 'PROTOCOL_CORRUPTION', context);
      coverages.set(key, c);
      if (order.get(fileId) !== lastFile) lastFacet = -1;
      const next = facets.indexOf(c.facet);
      check(next > lastFacet);
      lastFacet = next;
    } else if (e.type === 'SYNTAX_COVERAGE') {
      const c = e.payload;
      fileId = c.sourceFileId;
      phase = 4;
      check(
        files.get(fileId)?.contentFingerprint === c.sourceFingerprint && !syntaxCovered.has(fileId),
      );
      if (context) chargeCodeSyntaxJSON(fileId, 'PROTOCOL_CORRUPTION', context);
      syntaxCovered.add(fileId);
      partialSyntax ||= c.status !== 'COMPLETE';
    } else {
      check(e.type === 'DIAGNOSTIC' && e.payload.sourceRange !== null);
      fileId = e.payload.sourceRange.sourceFileId;
      phase = 5;
    }
    const index = order.get(fileId);
    check(index !== undefined && index >= lastFile);
    if (index !== lastFile) {
      lastPhase = -1;
      if (phase !== 3) lastFacet = -1;
    }
    check(phase >= lastPhase);
    lastFile = index;
    lastPhase = phase;
  }
  if (request.protocolVersion === 7 || request.protocolVersion === 8) {
    const all = syntax as BindingAwareSyntaxObservation[];
    const scopes = new Map<
      string,
      Extract<BindingAwareSyntaxObservation, { syntaxKind: 'BINDING_SCOPE' }>
    >();
    for (const s of all)
      if (s.syntaxKind === 'BINDING_SCOPE') {
        const k = keyFor(s.payload.scopeRef);
        check(!scopes.has(k));
        scopes.set(k, s);
        if (s.payload.status === 'PARTIAL')
          check(
            events.some(
              (e) =>
                e.type === 'SYNTAX_COVERAGE' &&
                e.payload.sourceFileId === s.sourceFileId &&
                e.payload.status === 'PARTIAL',
            ),
          );
      }
    const get = (ref: ProviderNodeRef) => {
      const found = scopes.get(keyFor(ref));
      check(found);
      return found!;
    };
    for (const s of scopes.values()) {
      let cursor = s;
      const seen = new Set([keyFor(s.payload.scopeRef)]);
      while (cursor.payload.parentScopeRef) {
        const k = keyFor(cursor.payload.parentScopeRef);
        check(!seen.has(k));
        seen.add(k);
        const parent = get(cursor.payload.parentScopeRef);
        check(contains(parent.sourceRange, cursor.sourceRange));
        cursor = parent;
      }
    }
    for (const s of all) {
      const own = s.lexicalScope ? get(s.lexicalScope) : null;
      if (own) check(contains(own.sourceRange, s.sourceRange));
      if (s.syntaxKind === 'IMPORT_BINDING' && s.payload.importKind === 'UNKNOWN')
        check(own?.payload.status === 'PARTIAL');
      if (s.syntaxKind === 'BINDING_EFFECT') {
        if (s.payload.targetScopeRef) get(s.payload.targetScopeRef);
        if (s.payload.effect === 'UNSUPPORTED_BINDING' || s.payload.targetScopeRef === null)
          check(
            own?.payload.status === 'PARTIAL' ||
              events.some(
                (e) =>
                  e.type === 'SYNTAX_COVERAGE' &&
                  e.payload.sourceFileId === s.sourceFileId &&
                  e.payload.status === 'PARTIAL',
              ),
          );
      }
    }
  }
  if (request.protocolVersion === 8) {
    const all = syntax as FrameworkSurfaceObservation[];
    for (const record of all) {
      if (record.syntaxKind === 'PARAMETER_BINDING')
        check(files.get(record.sourceFileId)?.languageHint === record.payload.language);
      if (record.syntaxKind === 'CALLBACK_BINDING' && record.payload.status === 'PARTIAL')
        check(
          events.some(
            (e) =>
              e.type === 'SYNTAX_COVERAGE' &&
              e.payload.sourceFileId === record.sourceFileId &&
              e.payload.status === 'PARTIAL',
          ),
        );
    }
    validateFrameworkSurfaceRawClosure(all, () => {
      if (context) spendCodeSyntaxBudget(context, 'items', 1);
    });
  }
  // Existing fact grammar/identity/closure only; discard Canonical candidates, not an authority proof.
  const normalizationInput = {
    targetSource: p.targetSource,
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    nodes,
    edges,
  };
  if (context) normalizePythonSourceObservationWithBudget(normalizationInput, context);
  else normalizePythonSourceObservation(normalizationInput);
  check(syntaxCovered.size === files.size);
  let partialCode = false,
    pythonFiles = 0;
  for (const file of files.values()) {
    if (file.languageHint !== 'python') continue;
    pythonFiles++;
    if (context)
      for (const view of [nodes, edges, syntax])
        chargeCodeSyntaxJSON(view, 'PROTOCOL_CORRUPTION', context);
    const ns = nodes.filter((n) => n.sourceRange!.sourceFileId === file.id);
    const es = edges.filter((e) => e.sourceRange!.sourceFileId === file.id);
    const ss = syntax.filter((s) => s.sourceFileId === file.id);
    const modules = ns.filter((n) => n.providerKind === 'python.module');
    const functions = ns.filter((n) => n.providerKind === 'python.symbol');
    for (const facet of facets) {
      const c = coverages.get(JSON.stringify([file.id, facet]));
      check(c);
      partialCode ||= c.status !== 'COMPLETE';
      const stats = c.statistics;
      if (c.status === 'COMPLETE') check(stats.unsupportedSites === 0 && stats.partialSites === 0);
      const facts =
        facet === 'MODULE'
          ? modules
          : facet === 'FUNCTION'
            ? functions
            : es.filter(
                (e) =>
                  e.providerKind === (facet === 'IMPORT' ? 'python.import' : 'python.reference'),
              );
      check(stats.coveredSites === facts.length);
      if (facet === 'MODULE' || facet === 'FUNCTION') {
        check(Object.values(stats.resolutionCounts).every((n) => n === 0));
        if (facet === 'MODULE' && c.status === 'COMPLETE')
          check(modules.length === 1 && stats.eligibleSites === 1);
      } else {
        const distribution = {
          EXACT: 0,
          HEURISTIC: 0,
          AMBIGUOUS: 0,
          UNRESOLVED: 0,
          UNSUPPORTED: 0,
        };
        for (const e of es.filter(
          (e) => e.providerKind === (facet === 'IMPORT' ? 'python.import' : 'python.reference'),
        ))
          distribution[e.target.resolution]++;
        check(isDeepStrictEqual(distribution, stats.resolutionCounts));
      }
    }
    const declarations = ss.filter((s) => s.syntaxKind === 'DECLARATION');
    check(declarations.length === functions.length);
    for (const n of functions) {
      const ds = declarations.filter(
        (s) => s.owner?.providerId === n.providerId && s.owner.providerFactId === n.providerFactId,
      );
      check(ds.length === 1 && contains(ds[0]!.sourceRange, n.sourceRange!));
    }
    type Occurrence = {
      owner: ProviderNodeRef | null;
      name: string;
      target: unknown;
      range: SourceRange;
      assignment: boolean;
      index: number;
      path: string;
      used: boolean;
    };
    const occurrences: Occurrence[] = [];
    function collect(
      v: unknown,
      span: SourceRange,
      owner: ProviderNodeRef | null,
      index: number,
      path: string,
      assignment: boolean,
    ): void {
      if (context) spendCodeSyntaxBudget(context, 'items', 1);
      if (v === null || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        v.forEach((x, i) => collect(x, span, owner, index, path + '[' + i + ']', assignment));
        return;
      }
      const o = v as Record<string, unknown>;
      const inner = o.sourceRange ? (o.sourceRange as SourceRange) : span;
      if (o.kind === 'REFERENCE') {
        const occurrence: Occurrence = {
          owner,
          name: o.name as string,
          target: o.target,
          range: inner,
          assignment: assignment && path === 'value',
          index,
          path,
          used: false,
        };
        if (context) chargeCodeSyntaxJSON(occurrence, 'PROTOCOL_CORRUPTION', context);
        occurrences.push(occurrence);
        return;
      }
      for (const [key, child] of Object.entries(o))
        collect(child, inner, owner, index, path ? path + '.' + key : key, assignment);
    }
    ss.forEach((s, i) =>
      collect(s.payload, s.sourceRange, s.owner, i, '', s.syntaxKind === 'ASSIGNMENT'),
    );
    const compatible = (e: (typeof es)[number], o: Occurrence, exact: boolean) =>
      !o.used &&
      o.owner !== null &&
      keyFor(o.owner) === keyFor(e.source) &&
      isDeepStrictEqual(o.target, e.target) &&
      (e.target.state === 'RESOLVED' || o.name === e.target.originalHint) &&
      (exact
        ? o.assignment && isDeepStrictEqual(o.range, e.sourceRange)
        : contains(o.range, e.sourceRange!));
    for (const e of es.filter((e) => e.providerKind === 'python.import')) {
      const match = occurrences.find((o) => compatible(e, o, true));
      check(match);
      match.used = true;
    }
    const relations = es
      .filter((e) => e.providerKind === 'python.reference')
      .sort(
        (a, b) =>
          point(
            a.sourceRange!.startLine,
            a.sourceRange!.startColumn,
            b.sourceRange!.startLine,
            b.sourceRange!.startColumn,
          ) ||
          point(
            a.sourceRange!.endLine,
            a.sourceRange!.endColumn,
            b.sourceRange!.endLine,
            b.sourceRange!.endColumn,
          ) ||
          scalar(a.providerFactId, b.providerFactId),
      );
    // ponytail: bounded per-file occurrence scan, no quadratic adjacency allocation; profile before production admission.
    for (const e of relations) {
      let selected: Occurrence | undefined;
      for (const o of occurrences)
        if (
          compatible(e, o, false) &&
          (!selected ||
            point(
              o.range.endLine,
              o.range.endColumn,
              selected.range.endLine,
              selected.range.endColumn,
            ) < 0 ||
            (point(
              o.range.endLine,
              o.range.endColumn,
              selected.range.endLine,
              selected.range.endColumn,
            ) === 0 &&
              (o.index < selected.index ||
                (o.index === selected.index && scalar(o.path, selected.path) < 0))))
        )
          selected = o;
      check(selected);
      selected.used = true;
    }
    if (coverages.get(JSON.stringify([file.id, 'REFERENCE']))!.status === 'COMPLETE')
      check(occurrences.every((o) => o.used));
  }
  check(coverages.size === pythonFiles * facets.length);
  const terminal = events.at(-1);
  check(terminal?.type === 'OBSERVATION_COMPLETED');
  const codeOutcome = pythonFiles === 0 ? 'NOT_APPLICABLE' : partialCode ? 'PARTIAL' : 'COMPLETE';
  const syntaxOutcome = partialSyntax ? 'PARTIAL' : 'COMPLETE';
  const outcome = partialCode || partialSyntax ? 'PARTIAL' : 'SUCCEEDED';
  check(
    terminal.payload.codeOutcome === codeOutcome &&
      terminal.payload.syntaxOutcome === syntaxOutcome &&
      terminal.payload.outcome === outcome,
  );
}
/** Pure structural contract only; never Source authentication, qualification or publication. */
export function validateCodeSyntaxObservationStreamCore(
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget | null,
  bindingV6: boolean | 7 | 8 = false,
): { observation: ValidatedCodeSyntaxObservation; outputIdentity: string | null } {
  const { request, requestChecksum } = readObservationRequest(requestBytes, context, bindingV6);
  try {
    const decoded = readEvents(outputBytes, request, requestChecksum, context),
      events = decoded.events;
    validateCorrespondence(request, events, context);
    const terminal = events.at(-1);
    check(terminal?.type === 'OBSERVATION_COMPLETED');
    const { codeOutcome, syntaxOutcome, outcome, counts, checksum } = terminal.payload;
    const observation = freeze({
      request,
      events,
      codeOutcome,
      syntaxOutcome,
      outcome,
      counts,
      checksum,
      requestChecksum,
    });
    const result = { observation, outputIdentity: decoded.outputIdentity };
    if (context) chargeCodeSyntaxJSON(result, 'PROTOCOL_CORRUPTION', context);
    return result;
  } catch (error) {
    if (error instanceof NativeSyntaxContractError) throw error;
    throw new NativeSyntaxContractError('PROTOCOL_CORRUPTION');
  }
}
