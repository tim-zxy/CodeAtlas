import {
  SyntaxTargetSourceSchema,
  SyntaxOwnerSchema,
  SyntaxOwnerBindingSchema,
  SyntaxOwnerMapInputSchema,
  computeSyntaxOwnerMapDigest,
  type SyntaxOwnerMapInput,
} from './native-syntax-owner-binding.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { z } from 'zod';
import {
  EntityIdSchema,
  RepoBasisSchema,
  ScopedRefSchema,
  ProviderIdSchema,
  ProviderVersionSchema,
  RepositorySchema,
  SourceFileSchema,
  ContentFingerprintSchema,
  RepositoryRelativePathSchema,
  ProviderNodeRefSchema,
  ProviderTargetSchema,
  ProviderNodeSchema,
  ProviderEdgeSchema,
  SourceRangeSchema,
  ProviderSnapshotDiagnosticSchema,
  EpochMillisecondsSchema,
  ensurePhase1Data,
  type ProviderNodeRef,
  type ProviderNode,
  type ProviderEdge,
} from '@codeatlas/ir';
import {
  NativeAnalyzerLanguageSchema,
  NativeIpcErrorSchema,
  type NativeIpcErrorCode,
} from './native-ipc.js';
import { NATIVE_CLIENT_HARD_LIMITS } from './native-client.js';

export const NATIVE_SYNTAX_PROTOCOL_VERSION = 4 as const;
export class NativeSyntaxContractError extends Error {
  constructor(readonly code: NativeIpcErrorCode) {
    super('Native syntax contract: ' + code);
    this.name = 'NativeSyntaxContractError';
  }
}
const fail = (code: NativeIpcErrorCode = 'PROTOCOL_CORRUPTION'): never => {
  throw new NativeSyntaxContractError(code);
};
const check = (value: unknown, code: NativeIpcErrorCode = 'PROTOCOL_CORRUPTION'): void => {
  if (!value) fail(code);
};
const text = z
  .string()
  .min(1)
  .refine((v) => v.trim() === v);
const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((v) => !Object.is(v, -0));
const positive = integer.refine((v) => v > 0);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const envelope = { protocolVersion: z.literal(4), requestId: text, sequence: integer };
const removed = z.strictObject({
  id: EntityIdSchema,
  path: RepositoryRelativePathSchema,
  previousContentFingerprint: ContentFingerprintSchema,
});
export const SyntaxObservationRequestSchema = z.strictObject({
  ...envelope,
  sequence: z.literal(0),
  type: z.literal('OBSERVE_SYNTAX'),
  payload: z.strictObject({
    irSchemaVersion: z.literal(1),
    repository: RepositorySchema,
    expectedActivationBasis: RepoBasisSchema.nullable(),
    targetSource: SyntaxTargetSourceSchema,
    ownerBinding: SyntaxOwnerBindingSchema,
    providerId: ProviderIdSchema,
    providerVersion: ProviderVersionSchema,
    providerSnapshotId: EntityIdSchema,
    extractorVersion: text,
    languages: z.array(NativeAnalyzerLanguageSchema),
    sourceFiles: z.array(SourceFileSchema),
    removedSourceFiles: z.array(removed),
    owners: z.array(SyntaxOwnerSchema),
    deadlineEpochMs: EpochMillisecondsSchema.nullable(),
    resourceBudget: z.strictObject({
      maxDurationMs: positive,
      maxMemoryBytes: positive,
      maxEvents: positive,
      maxItems: positive,
      maxInputBytes: positive,
      maxOutputBytes: positive,
      maxDepth: positive,
    }),
  }),
});
export type SyntaxObservationRequest = z.infer<typeof SyntaxObservationRequestSchema>;
function unique(values: readonly string[], code: NativeIpcErrorCode = 'PROTOCOL_CORRUPTION'): void {
  check(new Set(values).size === values.length, code);
}
function freezeDeep<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const child of Object.values(v)) freezeDeep(child);
    Object.freeze(v);
  }
  return v;
}
function scalarDepth(v: unknown, maxDepth: number, depth = 0): void {
  check(depth <= maxDepth, 'RESOURCE_LIMIT_EXCEEDED');
  if (typeof v === 'string') check(v.isWellFormed());
  if (v !== null && typeof v === 'object')
    for (const [k, child] of Object.entries(v)) {
      check(k.isWellFormed());
      scalarDepth(child, maxDepth, depth + 1);
    }
}
export function parseSyntaxObservationRequest(value: unknown): SyntaxObservationRequest {
  try {
    ensurePhase1Data(value);
    if (
      value !== null &&
      typeof value === 'object' &&
      'protocolVersion' in value &&
      value.protocolVersion !== 4
    )
      fail('INCOMPATIBLE_PROTOCOL_VERSION');
    const r = SyntaxObservationRequestSchema.parse(value),
      p = r.payload,
      b = p.targetSource;
    check(p.repository.id === b.repositoryId, 'INVALID_REQUEST');
    check(
      p.expectedActivationBasis === null ||
        p.expectedActivationBasis.repositoryId === b.repositoryId,
      'INVALID_REQUEST',
    );
    if (p.ownerBinding.kind === 'ACTIVE_CODE') {
      const expected = p.expectedActivationBasis;
      check(
        expected !== null &&
          expected.repositoryId === b.repositoryId &&
          expected.revisionId === b.revisionId &&
          expected.contentFingerprint === b.contentFingerprint &&
          expected.codeActivationDigest === p.ownerBinding.codeActivationDigest,
        'INVALID_REQUEST',
      );
    }
    check(
      p.ownerBinding.ownerMapDigest === computeSyntaxOwnerMapDigest(ownerMapInput(r)),
      'INVALID_REQUEST',
    );
    unique(
      p.languages.map((x) => x.languageId),
      'INVALID_REQUEST',
    );
    check(
      p.languages.length > 0 && p.languages.every((x) => ['java', 'python'].includes(x.languageId)),
      'INVALID_REQUEST',
    );
    unique(
      [...p.sourceFiles, ...p.removedSourceFiles].map((f) => f.id),
      'INVALID_REQUEST',
    );
    unique(
      [...p.sourceFiles, ...p.removedSourceFiles].map((f) => f.path),
      'INVALID_REQUEST',
    );
    const files = new Map(p.sourceFiles.map((f) => [f.id, f]));
    for (const f of p.sourceFiles)
      check(
        f.repositoryId === b.repositoryId &&
          f.revisionId === b.revisionId &&
          f.classification.contentKind === 'TEXT' &&
          ['SOURCE', 'TEST'].includes(f.classification.role) &&
          f.sensitivity !== 'SECRET' &&
          p.languages.some((l) => l.languageId === f.languageHint),
        'INVALID_REQUEST',
      );
    unique(
      p.owners.map((o) => JSON.stringify(o.providerNodeRef)),
      'INVALID_REQUEST',
    );
    unique(
      p.owners.map((o) => o.canonicalRef.entity.id),
      'INVALID_REQUEST',
    );
    for (const o of p.owners)
      check(
        files.get(o.sourceFileId)?.languageHint === 'java' &&
          o.providerNodeRef.providerId === p.providerId &&
          o.canonicalRef.scope === 'REPOSITORY' &&
          o.canonicalRef.repositoryId === b.repositoryId &&
          o.canonicalRef.entity.kind === 'CODE_NODE' &&
          o.canonicalRef.entity.revisionId === b.revisionId,
        'INVALID_REQUEST',
      );
    scalarDepth(r, p.resourceBudget.maxDepth);
    check(
      Buffer.byteLength(JSON.stringify(r) + '\n') <=
        Math.min(p.resourceBudget.maxInputBytes, NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes),
      'RESOURCE_LIMIT_EXCEEDED',
    );
    return freezeDeep(r);
  } catch (e) {
    if (e instanceof NativeSyntaxContractError) throw e;
    return fail('INVALID_REQUEST');
  }
}
type NativeSyntaxValue =
  | { kind: 'STRING'; value: string }
  | { kind: 'NUMBER'; value: number }
  | { kind: 'BOOLEAN'; value: boolean }
  | { kind: 'NULL' }
  | { kind: 'REFERENCE'; name: string; target: z.infer<typeof ProviderTargetSchema> }
  | { kind: 'ARRAY'; items: NativeSyntaxValue[] }
  | { kind: 'OBJECT'; entries: { name: string; value: NativeSyntaxValue }[] }
  | { kind: 'UNKNOWN'; reason: string };
export const NativeSyntaxValueSchema: z.ZodType<NativeSyntaxValue> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('STRING'), value: z.string() }),
    z.strictObject({
      kind: z.literal('NUMBER'),
      value: z
        .number()
        .finite()
        .refine((v) => !Object.is(v, -0)),
    }),
    z.strictObject({ kind: z.literal('BOOLEAN'), value: z.boolean() }),
    z.strictObject({ kind: z.literal('NULL') }),
    z.strictObject({ kind: z.literal('REFERENCE'), name: text, target: ProviderTargetSchema }),
    z.strictObject({ kind: z.literal('ARRAY'), items: z.array(NativeSyntaxValueSchema) }),
    z.strictObject({
      kind: z.literal('OBJECT'),
      entries: z.array(z.strictObject({ name: text, value: NativeSyntaxValueSchema })),
    }),
    z.strictObject({ kind: z.literal('UNKNOWN'), reason: text }),
  ]),
);
const callee = z.strictObject({ name: text, target: ProviderTargetSchema });
const argument = z.strictObject({
  name: text.nullable(),
  value: NativeSyntaxValueSchema,
  sourceRange: SourceRangeSchema,
});
const common = {
  providerSyntaxId: EntityIdSchema,
  sourceFileId: EntityIdSchema,
  sourceFingerprint: ContentFingerprintSchema,
  sourceRange: SourceRangeSchema,
  owner: ProviderNodeRefSchema.nullable(),
};
export const NativeSyntaxObservationSchema = z.discriminatedUnion('syntaxKind', [
  z.strictObject({
    ...common,
    syntaxKind: z.literal('DECORATION'),
    payload: z.strictObject({ callee, arguments: z.array(argument) }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('INVOCATION'),
    payload: z.strictObject({
      callee,
      receiver: NativeSyntaxValueSchema.nullable(),
      arguments: z.array(argument),
    }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('DECLARATION'),
    payload: z.strictObject({
      declaredType: text.nullable(),
      parameterNames: z.array(text),
      modifiers: z.array(text),
    }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('ASSIGNMENT'),
    payload: z.strictObject({ targetName: text, value: NativeSyntaxValueSchema }),
  }),
  z.strictObject({
    ...common,
    syntaxKind: z.literal('ARTIFACT'),
    payload: z.strictObject({
      mediaType: text,
      logicalPath: RepositoryRelativePathSchema,
      contentDigest: digest,
      declaredValues: z.array(z.strictObject({ name: text, value: NativeSyntaxValueSchema })),
    }),
  }),
]);
export const NativeSyntaxCoverageSchema = z
  .strictObject({
    sourceFileId: EntityIdSchema,
    sourceFingerprint: ContentFingerprintSchema,
    status: z.enum(['COMPLETE', 'PARTIAL', 'UNSUPPORTED']),
    limitations: z.array(text),
  })
  .superRefine((v, c) => {
    if ((v.status === 'COMPLETE') !== (v.limitations.length === 0))
      c.addIssue({ code: 'custom', message: 'Coverage limitations disagree with status' });
  });
const binding = {
  expectedActivationBasis: RepoBasisSchema.nullable(),
  targetSource: SyntaxTargetSourceSchema,
  ownerBinding: SyntaxOwnerBindingSchema,
  extractorVersion: text,
};
const counts = z.strictObject({
  nodes: integer,
  edges: integer,
  syntax: integer,
  coverage: integer,
  diagnostics: integer,
});
export const NativeSyntaxEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('SYNTAX_STARTED'),
    payload: z.strictObject(binding),
  }),
  z.strictObject({ ...envelope, type: z.literal('NODE'), payload: ProviderNodeSchema }),
  z.strictObject({ ...envelope, type: z.literal('EDGE'), payload: ProviderEdgeSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('SYNTAX_OBSERVATION'),
    payload: NativeSyntaxObservationSchema,
  }),
  z.strictObject({ ...envelope, type: z.literal('COVERAGE'), payload: NativeSyntaxCoverageSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('DIAGNOSTIC'),
    payload: ProviderSnapshotDiagnosticSchema,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('SYNTAX_COMPLETED'),
    payload: z.strictObject({
      ...binding,
      outcome: z.enum(['SUCCEEDED', 'PARTIAL']),
      counts,
      checksum: digest,
    }),
  }),
  z.strictObject({
    ...envelope,
    type: z.enum(['SYNTAX_FAILED', 'REQUEST_FAILED']),
    payload: NativeIpcErrorSchema,
  }),
]);
export type NativeSyntaxEvent = z.infer<typeof NativeSyntaxEventSchema>;
export interface ValidatedSyntaxObservation {
  readonly request: SyntaxObservationRequest;
  readonly events: readonly NativeSyntaxEvent[];
  readonly outcome: 'SUCCEEDED' | 'PARTIAL';
  readonly counts: z.infer<typeof counts>;
  readonly checksum: string;
}

/** Complete raw-byte contract validation only; no process dispatch or state publication. */
export function validateSyntaxObservationStream(
  requestInput: unknown,
  lines: readonly Uint8Array[],
): ValidatedSyntaxObservation {
  const request = parseSyntaxObservationRequest(requestInput),
    p = request.payload,
    budget = p.resourceBudget;
  try {
    check(
      Array.isArray(lines) &&
        !types.isProxy(lines) &&
        Object.getPrototypeOf(lines) === Array.prototype,
    );
    const descriptors = Object.getOwnPropertyDescriptors(lines);
    check(Reflect.ownKeys(descriptors).length === lines.length + 1);
    for (let i = 0; i < lines.length; i++)
      check(
        Object.hasOwn(descriptors, String(i)) && Object.hasOwn(descriptors[String(i)]!, 'value'),
      );
    check(lines.length > 0);
    check(
      lines.length <= Math.min(budget.maxEvents, NATIVE_CLIENT_HARD_LIMITS.maxEvents),
      'RESOURCE_LIMIT_EXCEEDED',
    );
    let total = 0;
    for (const line of lines) {
      check(
        !types.isProxy(line) &&
          (Object.getPrototypeOf(line) === Buffer.prototype ||
            Object.getPrototypeOf(line) === Uint8Array.prototype),
      );
      total += line.byteLength;
      check(
        line.byteLength <= NATIVE_CLIENT_HARD_LIMITS.maxLineBytes &&
          total <= Math.min(budget.maxOutputBytes, NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes),
        'RESOURCE_LIMIT_EXCEEDED',
      );
    }
    const events: NativeSyntaxEvent[] = [],
      hash = createHash('sha256');
    const files = new Map(p.sourceFiles.map((f) => [f.id, f]));
    const owners = new Map<string, string>(
      p.owners.map((o) => [JSON.stringify(o.providerNodeRef), o.sourceFileId]),
    );
    const nodeIds = new Set<string>(),
      edgeIds = new Set<string>(),
      syntaxIds = new Set<string>(),
      coverageIds = new Set<string>();
    const actual = { nodes: 0, edges: 0, syntax: 0, coverage: 0, diagnostics: 0 };
    let partial = false;
    const sameBinding = (value: z.infer<typeof bindingSchema>) =>
      check(
        isDeepStrictEqual(value.expectedActivationBasis, p.expectedActivationBasis) &&
          isDeepStrictEqual(value.targetSource, p.targetSource) &&
          isDeepStrictEqual(value.ownerBinding, p.ownerBinding) &&
          value.extractorVersion === p.extractorVersion,
      );
    function nodeRef(ref: ProviderNodeRef): void {
      check(ref.providerId === p.providerId && owners.has(JSON.stringify(ref)));
    }
    function refs(value: unknown, fileId: string): void {
      if (value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const child of value) refs(child, fileId);
        return;
      }
      const o = value as Record<string, unknown>;
      if (o.factType === 'NODE') {
        nodeRef(ProviderNodeRefSchema.parse(o));
        return;
      }
      if (Object.hasOwn(o, 'sourceFileId')) check(o.sourceFileId === fileId);
      if (o.kind === 'OBJECT' && Array.isArray(o.entries))
        unique(o.entries.map((x) => (x as { name: string }).name));
      for (const child of Object.values(o)) refs(child, fileId);
    }
    function factIdentity(f: ProviderNode | ProviderEdge): string {
      check(
        f.providerId === p.providerId &&
          f.providerSnapshotId === p.providerSnapshotId &&
          f.repositoryId === p.targetSource.repositoryId &&
          f.revisionId === p.targetSource.revisionId,
      );
      const id = f.sourceRange?.sourceFileId;
      check(id !== undefined && files.get(id)?.languageHint === 'python');
      return id!;
    }
    for (let i = 0; i < lines.length; i++) {
      const raw = Buffer.from(lines[i]!);
      check(
        raw.length > 0 &&
          raw.at(-1) === 10 &&
          !raw.subarray(0, -1).includes(10) &&
          !raw.includes(13) &&
          !(raw[0] === 239 && raw[1] === 187 && raw[2] === 191),
      );
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      ensurePhase1Data(value);
      scalarDepth(value, budget.maxDepth);
      const e = NativeSyntaxEventSchema.parse(value);
      check(e.requestId === request.requestId && e.sequence === i);
      if (e.type === 'REQUEST_FAILED' || e.type === 'SYNTAX_FAILED') {
        check(i === lines.length - 1 && (e.type === 'REQUEST_FAILED' ? i === 0 : i > 0));
        fail(e.payload.code);
      }
      if (i === 0) check(e.type === 'SYNTAX_STARTED');
      else check(e.type !== 'SYNTAX_STARTED');
      if (e.type === 'SYNTAX_COMPLETED') {
        check(i === lines.length - 1 && i > 0);
        sameBinding(e.payload);
        check(isDeepStrictEqual(actual, e.payload.counts));
        check(coverageIds.size === p.sourceFiles.length);
        check((e.payload.outcome === 'PARTIAL') === partial);
        const checksum = hash.digest('hex');
        check(checksum === e.payload.checksum);
        events.push(e);
        return freezeDeep({
          request,
          events,
          outcome: e.payload.outcome,
          counts: actual,
          checksum,
        });
      }
      check(i < lines.length - 1);
      switch (e.type) {
        case 'SYNTAX_STARTED':
          sameBinding(e.payload);
          break;
        case 'NODE': {
          const f = e.payload,
            fileId = factIdentity(f);
          check(['python.module', 'python.symbol'].includes(f.providerKind));
          const key = JSON.stringify({
            factType: 'NODE',
            providerId: f.providerId,
            providerFactId: f.providerFactId,
          });
          check(!owners.has(key) && !nodeIds.has(f.providerFactId));
          owners.set(key, fileId);
          nodeIds.add(f.providerFactId);
          actual.nodes++;
          break;
        }
        case 'EDGE': {
          const f = e.payload,
            fileId = factIdentity(f);
          check(
            ['python.import', 'python.reference'].includes(f.providerKind) &&
              !edgeIds.has(f.providerFactId),
          );
          refs(f, fileId);
          edgeIds.add(f.providerFactId);
          actual.edges++;
          break;
        }
        case 'SYNTAX_OBSERVATION': {
          const s = e.payload;
          check(
            !syntaxIds.has(s.providerSyntaxId) && s.sourceRange.sourceFileId === s.sourceFileId,
          );
          check(files.get(s.sourceFileId)?.contentFingerprint === s.sourceFingerprint);
          if (s.owner) {
            nodeRef(s.owner);
            check(owners.get(JSON.stringify(s.owner)) === s.sourceFileId);
          }
          if (s.syntaxKind === 'ARTIFACT')
            check(s.payload.logicalPath === files.get(s.sourceFileId)?.path);
          refs(s.payload, s.sourceFileId);
          syntaxIds.add(s.providerSyntaxId);
          actual.syntax++;
          break;
        }
        case 'COVERAGE': {
          const c = e.payload;
          check(
            files.get(c.sourceFileId)?.contentFingerprint === c.sourceFingerprint &&
              !coverageIds.has(c.sourceFileId),
          );
          coverageIds.add(c.sourceFileId);
          partial ||= c.status !== 'COMPLETE';
          actual.coverage++;
          break;
        }
        case 'DIAGNOSTIC':
          if (e.payload.sourceRange) check(files.has(e.payload.sourceRange.sourceFileId));
          actual.diagnostics++;
          break;
      }
      events.push(e);
      hash.update(raw);
    }
    return fail();
  } catch (e) {
    if (e instanceof NativeSyntaxContractError) throw e;
    return fail();
  }
}
const bindingSchema = z.strictObject(binding);

function ownerMapInput(request: SyntaxObservationRequest): SyntaxOwnerMapInput {
  const p = request.payload;
  const { ownerMapDigest: _, ...ownerBinding } = p.ownerBinding;
  return {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding,
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  };
}
/** Crosscheck only: capturedContext must come from Runtime/Application's trusted snapshot. */
export function validateSyntaxOwnerContext(
  requestInput: unknown,
  capturedContext: unknown,
): SyntaxObservationRequest {
  const request = parseSyntaxObservationRequest(requestInput);
  try {
    ensurePhase1Data(capturedContext);
    const context = SyntaxOwnerMapInputSchema.parse(capturedContext),
      p = request.payload;
    check(
      isDeepStrictEqual(p.expectedActivationBasis, context.expectedActivationBasis),
      'BASE_REVISION_MISMATCH',
    );
    check(
      p.ownerBinding.ownerMapDigest === computeSyntaxOwnerMapDigest(context),
      'INVALID_REQUEST',
    );
    check(
      isDeepStrictEqual(p.targetSource, context.targetSource) &&
        isDeepStrictEqual(ownerMapInput(request).ownerBinding, context.ownerBinding),
      'INVALID_REQUEST',
    );
    return request;
  } catch (e) {
    if (e instanceof NativeSyntaxContractError) throw e;
    return fail('INVALID_REQUEST');
  }
}
