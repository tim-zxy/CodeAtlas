import { validateFrameworkSurfaceStreamWithBudget } from './native-framework-surface-stream.js';
import { validateBindingAwareSyntaxObservationStreamWithBudget } from './native-binding-sufficiency-stream.js';
import { validateBindingSyntaxObservationStreamWithBudget } from './native-binding-stream.js';
import {
  NativeCompositionError,
  remainingCompositionLimits,
  type CodeSyntaxCompositionBudget,
  requireComposition,
  chargeCompositionJSON,
  spendComposition,
  requirePlainCompositionData as plain,
  type NativeCompositionLimits,
  type NativeCompositionErrorCode,
  type CompositionBudget,
} from './native-code-syntax-budget.js';
export {
  NativeCompositionError,
  requireComposition,
  chargeCompositionJSON,
  spendComposition,
} from './native-code-syntax-budget.js';
export type {
  NativeCompositionLimits,
  NativeCompositionErrorCode,
  CompositionBudget,
} from './native-code-syntax-budget.js';
import { types, isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  SourceFileSchema,
  EntityIdSchema,
  ProviderVersionSchema,
  RuntimeVersionSchema,
  UtcInstantSchema,
  ProviderSnapshotSchema,
  type ProviderSnapshot,
  type SourceFile,
  type Repository,
} from '@codeatlas/ir';
import { SyntaxTargetSourceSchema } from './native-syntax-owner-binding.js';
import {
  NativeAnalyzeRequestV2Schema,
  NativeAnalyzeEventEnvelopeV2Schema,
  NativeAnalyzeEventStreamV2Schema,
} from './native-ipc-v2.js';
import { NativeAnalyzerDescriptorSchema, NATIVE_IPC_IR_SCHEMA_VERSION } from './native-ipc.js';
import { NATIVE_CLIENT_HARD_LIMITS as hard } from './native-client.js';
import { copyCodeSyntaxBytes } from './native-code-syntax-request.js';
import {
  validateCodeSyntaxObservationStream,
  validateCodeSyntaxObservationStreamWithBudget,
  type ValidatedCodeSyntaxObservation,
} from './native-code-syntax-ipc.js';
import { boundedJson } from './native-request-json.js';
const tool = NativeAnalyzerDescriptorSchema.shape.build;
const component = {
  providerVersion: ProviderVersionSchema,
  runtimeVersion: RuntimeVersionSchema,
  tool,
  startedAt: UtcInstantSchema,
  settledAt: UtcInstantSchema,
};
const Meta = z.strictObject({
  targetSource: SyntaxTargetSourceSchema,
  inventory: z.array(SourceFileSchema),
  snapshot: z.strictObject({
    id: EntityIdSchema,
    providerId: z.literal('native'),
    providerVersion: ProviderVersionSchema,
    runtimeVersion: RuntimeVersionSchema,
    startedAt: UtcInstantSchema,
    completedAt: UtcInstantSchema,
  }),
  tool,
  java: z
    .strictObject({
      ...component,
      request: NativeAnalyzeRequestV2Schema,
      events: z.array(NativeAnalyzeEventEnvelopeV2Schema),
      terminal: NativeAnalyzeEventEnvelopeV2Schema,
    })
    .nullable(),
  codeSyntax: z.strictObject(component),
});
export { Meta as CompositionMetadataSchema };
export type CompositionMetadata = z.infer<typeof Meta>;

const SettledJavaOwner = z
  .strictObject({
    kind: z.literal('SETTLED_JAVA_OWNER'),
    schemaVersion: z.literal(1),
    targetSource: Meta.shape.targetSource,
    inventory: Meta.shape.inventory,
    snapshot: Meta.shape.snapshot.omit({ completedAt: true }),
    tool,
    java: Meta.shape.java.unwrap(),
  })
  .superRefine((m, ctx) => {
    const j = m.java,
      s = m.snapshot;
    if (
      !(s.startedAt <= j.startedAt && j.startedAt <= j.settledAt) ||
      j.providerVersion !== s.providerVersion ||
      j.runtimeVersion !== s.runtimeVersion ||
      !isDeepStrictEqual(j.tool, m.tool)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid settled Java identity or timing' });
  });
export { SettledJavaOwner as SettledJavaOwnerPreparationSchema };
export type SettledJavaOwnerPreparation = z.infer<typeof SettledJavaOwner>;
/** Known facts only; neither a completed snapshot nor run/publication authority. */
export function projectSettledJavaOwner(m: CompositionMetadata): SettledJavaOwnerPreparation {
  const java = m.java;
  requireComposition(java, 'INVALID_CONTEXT');
  const { id, providerId, providerVersion, runtimeVersion, startedAt } = m.snapshot;
  return {
    kind: 'SETTLED_JAVA_OWNER',
    schemaVersion: 1,
    targetSource: m.targetSource,
    inventory: m.inventory,
    snapshot: { id, providerId, providerVersion, runtimeVersion, startedAt },
    tool: m.tool,
    java,
  };
}

export type ParsedCompositionJavaStream = z.infer<typeof NativeAnalyzeEventStreamV2Schema>;
export interface PreparedNativeComposition {
  readonly metadata: CompositionMetadata;
  readonly requestBytes: Buffer;
  readonly outputBytes: Buffer;
  readonly java: CompositionMetadata['java'];
  readonly codeSyntax: ValidatedCodeSyntaxObservation;
  readonly snapshot: ProviderSnapshot;
  readonly budget: CompositionBudget;
  readonly limits: NativeCompositionLimits;
}
export type PreparedBindingComposition = Omit<PreparedNativeComposition, 'codeSyntax'> & {
  readonly codeSyntax: ReturnType<
    typeof validateBindingSyntaxObservationStreamWithBudget
  >['observation'];
};
type PreparedAnyComposition =
  PreparedNativeComposition | PreparedBindingComposition | PreparedFrameworkSurfaceComposition;
export function freezeComposition<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const child of Object.values(v)) freezeComposition(child);
    Object.freeze(v);
  }
  return v;
}
function limitsOf(value: NativeCompositionLimits): NativeCompositionLimits {
  requireComposition(value !== null && typeof value === 'object' && !types.isProxy(value));
  plain(value);
  const keys = Reflect.ownKeys(value);
  requireComposition(
    keys.length === 3 &&
      ['maxSerializedBytes', 'maxItems', 'maxDepth'].every((k) => keys.includes(k)),
  );
  const out: Record<string, number> = {};
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(value, k)!;
    requireComposition(typeof k === 'string' && d.enumerable && Object.hasOwn(d, 'value'));
    requireComposition(Number.isSafeInteger(d.value) && d.value > 0);
    out[k] = d.value;
  }
  return out as unknown as NativeCompositionLimits;
}
const typed = Object.getPrototypeOf(Uint8Array.prototype) as object,
  lengthOf = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const legacyCapabilities = ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'];
const order = (a: { path: string; id: string }, b: { path: string; id: string }) =>
  Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
  Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
function readNativeCompositionInputsCore(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: NativeCompositionLimits,
  continuation?: CodeSyntaxCompositionBudget,
  bindingV6: boolean | 7 | 8 = false,
): PreparedAnyComposition {
  try {
    const l = limitsOf(limits),
      budget = continuation?.budget ?? { serializedBytes: 0, items: 0 };
    const bytes = (v: Uint8Array, max: number) => {
      requireComposition(
        v !== null && typeof v === 'object' && !types.isProxy(v) && types.isUint8Array(v),
      );
      const n = lengthOf.call(v) as number;
      spendComposition(budget, l, 'serializedBytes', n);
      spendComposition(budget, l, 'serializedBytes', n);
      return copyCodeSyntaxBytes(v, Math.min(max, n), 'INVALID_REQUEST');
    };
    const rb = bytes(requestBytes, hard.maxStdinBytes),
      ob = bytes(outputBytes, hard.maxStdoutBytes);
    const json = chargeCompositionJSON(metadata, l, budget),
      owned: unknown = JSON.parse(json);
    chargeCompositionJSON(owned, l, budget);
    const m = Meta.parse(owned);
    chargeCompositionJSON(m, l, budget);
    const s = m.snapshot,
      t = m.targetSource;
    const seenIds = new Set<string>(),
      seenPaths = new Set<string>();
    for (const [f, file] of m.inventory.entries()) {
      requireComposition(!seenIds.has(file.id) && !seenPaths.has(file.path), 'INVALID_CONTEXT');
      seenIds.add(file.id);
      seenPaths.add(file.path);
      requireComposition(
        file.repositoryId === t.repositoryId && file.revisionId === t.revisionId,
        'INVALID_CONTEXT',
      );
      if (f) requireComposition(order(m.inventory[f - 1]!, file) < 0, 'INVALID_CONTEXT');
    }
    const projected = m.inventory.filter(
      (f) => f.classification.role === 'SOURCE' || f.classification.role === 'TEST',
    );
    for (const f of projected)
      requireComposition(
        f.classification.contentKind === 'TEXT' &&
          f.sensitivity !== 'SECRET' &&
          ['java', 'python'].includes(f.languageHint ?? ''),
        'UNSUPPORTED_SCOPE',
      );
    const javaFiles = projected.filter((f) => f.languageHint === 'java'),
      pythonFiles = projected.filter((f) => f.languageHint === 'python');
    if (javaFiles.length) requireComposition(m.java !== null, 'INCOMPLETE_OBSERVATION');
    else requireComposition(m.java === null, 'INVALID_CONTEXT');
    validateCompositionComponents(m);
    let c: PreparedAnyComposition['codeSyntax'];
    try {
      c =
        bindingV6 === 8
          ? validateFrameworkSurfaceStreamWithBudget(rb, ob, continuation!).observation
          : bindingV6 === 7
            ? validateBindingAwareSyntaxObservationStreamWithBudget(rb, ob, continuation!)
                .observation
            : bindingV6
              ? validateBindingSyntaxObservationStreamWithBudget(rb, ob, continuation!).observation
              : continuation
                ? validateCodeSyntaxObservationStreamWithBudget(rb, ob, continuation).observation
                : validateCodeSyntaxObservationStream(rb, ob);
    } catch (e) {
      if (
        e !== null &&
        typeof e === 'object' &&
        'code' in e &&
        e.code === 'RESOURCE_LIMIT_EXCEEDED'
      )
        throw new NativeCompositionError('RESOURCE_LIMIT_EXCEEDED');
      throw new NativeCompositionError('INVALID_INPUT');
    }
    chargeCompositionJSON(c, l, budget);
    const p = c.request.payload;
    requireComposition(
      isDeepStrictEqual(p.targetSource, t) &&
        p.providerId === s.providerId &&
        p.providerSnapshotId === s.id &&
        p.providerVersion === s.providerVersion &&
        isDeepStrictEqual(p.sourceFiles, projected),
      'INVALID_CONTEXT',
    );
    requireComposition(p.removedSourceFiles.length === 0, 'UNSUPPORTED_SCOPE');
    requireComposition(
      c.outcome === 'SUCCEEDED' &&
        c.syntaxOutcome === 'COMPLETE' &&
        c.codeOutcome === (pythonFiles.length ? 'COMPLETE' : 'NOT_APPLICABLE'),
      'INCOMPLETE_OBSERVATION',
    );
    const j = m.java;
    validateParsedCompositionJava(m, javaFiles, p.repository, l, budget);
    const names = [
      ...(j ? ['JAVA_CODE_V2'] : []),
      ...(pythonFiles.length ? ['PYTHON_SYNTAX_CODE_V1'] : []),
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
    ];
    const diagnostics = [
      ...(j?.events.filter((e) => e.type === 'DIAGNOSTIC').map((e) => e.payload) ?? []),
      ...c.events.filter((e) => e.type === 'DIAGNOSTIC').map((e) => e.payload),
    ];
    const snapshot = ProviderSnapshotSchema.parse({
      ...s,
      repositoryId: t.repositoryId,
      requestedRevisionId: t.revisionId,
      requestedRevisionFingerprint: t.contentFingerprint,
      capabilities: names.map((name) => ({ name, support: 'SUPPORTED', coverage: 'COMPLETE' })),
      diagnostics,
      outcome: 'SUCCEEDED',
    });
    chargeCompositionJSON(snapshot, l, budget);
    return {
      metadata: freezeComposition(m),
      requestBytes: rb,
      outputBytes: ob,
      java: j,
      codeSyntax: c,
      snapshot: freezeComposition(snapshot),
      budget,
      limits: l,
    };
  } catch (e) {
    if (e instanceof NativeCompositionError) throw e;
    if (e !== null && typeof e === 'object' && 'code' in e && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new NativeCompositionError('RESOURCE_LIMIT_EXCEEDED');
    throw new NativeCompositionError('INVALID_INPUT');
  }
}

export function validateCompositionComponents(m: CompositionMetadata): void {
  const s = m.snapshot;
  for (const child of [m.java, m.codeSyntax]) {
    if (!child) continue;
    requireComposition(
      child.providerVersion === s.providerVersion &&
        child.runtimeVersion === s.runtimeVersion &&
        isDeepStrictEqual(child.tool, m.tool),
      'INVALID_CONTEXT',
    );
    requireComposition(
      s.startedAt <= child.startedAt &&
        child.startedAt <= child.settledAt &&
        child.settledAt <= s.completedAt,
      'INVALID_CONTEXT',
    );
  }
}
export function validateParsedCompositionJava(
  m: Pick<CompositionMetadata, 'targetSource' | 'java'> & {
    snapshot: Pick<CompositionMetadata['snapshot'], 'id' | 'providerId'>;
  },
  javaFiles: readonly SourceFile[],
  repository: Repository,
  l: NativeCompositionLimits,
  budget: CompositionBudget,
): ParsedCompositionJavaStream | null {
  const s = m.snapshot,
    t = m.targetSource,
    j = m.java;
  const hardJSON = (value: unknown, max: number) => {
    let text: string;
    try {
      text = boundedJson(value, max);
    } catch {
      throw new NativeCompositionError('RESOURCE_LIMIT_EXCEEDED');
    }
    spendComposition(budget, l, 'serializedBytes', Buffer.byteLength(text));
    return text;
  };
  if (j) {
    const req = j.request.payload;
    requireComposition(
      req.requestedCapabilities.length === legacyCapabilities.length &&
        legacyCapabilities.every((x) => req.requestedCapabilities.includes(x)),
      'UNSUPPORTED_SCOPE',
    );
    requireComposition(
      req.irSchemaVersion === NATIVE_IPC_IR_SCHEMA_VERSION &&
        req.providerSnapshotId === s.id &&
        req.repository.id === t.repositoryId &&
        req.revision.id === t.revisionId &&
        req.revision.contentFingerprint === t.contentFingerprint &&
        isDeepStrictEqual(req.repository, repository) &&
        isDeepStrictEqual(req.sourceFiles, javaFiles),
      'INVALID_CONTEXT',
    );
    requireComposition(j.events.length <= hard.maxEvents, 'RESOURCE_LIMIT_EXCEEDED');
    requireComposition(
      Buffer.byteLength(hardJSON(j.request, hard.maxStdinBytes - 1)) <= hard.maxStdinBytes,
      'RESOURCE_LIMIT_EXCEEDED',
    );
    let eventBytes = 0;
    for (const e of j.events)
      eventBytes += Buffer.byteLength(hardJSON(e, hard.maxLineBytes - 1)) + 1;
    requireComposition(eventBytes <= hard.maxStdoutBytes, 'RESOURCE_LIMIT_EXCEEDED');
    const parsedStream = NativeAnalyzeEventStreamV2Schema.parse({
      request: j.request,
      events: j.events,
    });
    requireComposition(isDeepStrictEqual(j.terminal, j.events.at(-1)), 'INVALID_INPUT');
    const terminal = j.terminal;
    requireComposition(
      terminal.type === 'ANALYSIS_COMPLETED' && terminal.payload.outcome === 'SUCCEEDED',
      'INCOMPLETE_OBSERVATION',
    );
    requireComposition(
      terminal.payload.capabilities.length === legacyCapabilities.length &&
        legacyCapabilities.every((name) =>
          terminal.payload.capabilities.some(
            (x) => x.name === name && x.support === 'SUPPORTED' && x.coverage === 'COMPLETE',
          ),
        ),
      'INCOMPLETE_OBSERVATION',
    );
    for (const e of j.events) {
      if (e.type === 'NODE' || e.type === 'EDGE')
        requireComposition(
          e.payload.providerId === s.providerId &&
            e.payload.providerSnapshotId === s.id &&
            e.payload.repositoryId === t.repositoryId &&
            e.payload.revisionId === t.revisionId,
          'INVALID_CONTEXT',
        );
      if (e.type === 'COVERAGE')
        requireComposition(
          e.payload.support === 'SUPPORTED' &&
            e.payload.coverage === 'COMPLETE' &&
            e.payload.statistics.unsupportedSites === 0 &&
            e.payload.statistics.partialSites === 0,
          'INCOMPLETE_OBSERVATION',
        );
    }
    return parsedStream;
  }
  return null;
}

export function readNativeCompositionInputs(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: NativeCompositionLimits,
): PreparedNativeComposition {
  return readNativeCompositionInputsCore(
    metadata,
    requestBytes,
    outputBytes,
    limits,
  ) as PreparedNativeComposition;
}
/** Private continuation includes strict decoder preflight and all decoder-owned representations. */
export default function readNativeCompositionInputsWithBudget(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedNativeComposition {
  remainingCompositionLimits(context);
  return readNativeCompositionInputsCore(
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
  ) as PreparedNativeComposition;
}

export function readBindingCompositionInputsWithBudget(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedBindingComposition {
  remainingCompositionLimits(context);
  return readNativeCompositionInputsCore(
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
    true,
  ) as PreparedBindingComposition;
}

export type PreparedBindingAwareComposition = Omit<PreparedNativeComposition, 'codeSyntax'> & {
  codeSyntax: ReturnType<
    typeof validateBindingAwareSyntaxObservationStreamWithBudget
  >['observation'];
};
export function readBindingAwareCompositionInputsWithBudget(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedBindingAwareComposition {
  remainingCompositionLimits(context);
  return readNativeCompositionInputsCore(
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
    7,
  ) as PreparedBindingAwareComposition;
}

export type PreparedFrameworkSurfaceComposition = Omit<PreparedNativeComposition, 'codeSyntax'> & {
  codeSyntax: ReturnType<typeof validateFrameworkSurfaceStreamWithBudget>['observation'];
};
export function readFrameworkSurfaceCompositionInputsWithBudget(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedFrameworkSurfaceComposition {
  remainingCompositionLimits(context);
  return readNativeCompositionInputsCore(
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
    8,
  ) as PreparedFrameworkSurfaceComposition;
}
