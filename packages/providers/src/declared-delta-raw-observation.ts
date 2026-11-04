import { validateFrameworkSurfaceStreamWithBudget } from './native-framework-surface-stream.js';
import { validateBindingAwareSyntaxObservationStreamWithBudget } from './native-binding-sufficiency-stream.js';
import { validateBindingSyntaxObservationStreamWithBudget } from './native-binding-stream.js';
import { isDeepStrictEqual } from 'node:util';
import {
  prepareDeclaredNativeObservationScope,
  prepareDeclaredNativeObservationScopeWithBudget,
  type PreparedDeclaredNativeObservationScope,
} from './history-transition.js';
import {
  HistoryTransitionError,
  historyProjected,
  type HistoryTransitionErrorCode,
} from './history-transition-input.js';
import {
  CompositionMetadataSchema,
  NativeCompositionError,
  requireComposition,
  chargeCompositionJSON,
  freezeComposition,
  validateCompositionComponents,
  validateParsedCompositionJava,
  type NativeCompositionErrorCode,
  type CompositionMetadata,
} from './native-composition-input.js';
import {
  validateCodeSyntaxObservationStreamWithBudget,
  type ValidatedCodeSyntaxObservation,
} from './native-code-syntax-ipc.js';
import { NativeSyntaxContractError } from './native-syntax-ipc.js';
import { normalizeJavaNode } from './java-node-normalizer.js';
import type { NativeIpcErrorCode } from './native-ipc.js';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
import type { SourceFile, CanonicalNode } from '@codeatlas/ir';
export type DeclaredDeltaRawAdmissionErrorCode =
  HistoryTransitionErrorCode | NativeCompositionErrorCode | NativeIpcErrorCode;
export class DeclaredDeltaRawAdmissionError extends Error {
  constructor(readonly code: DeclaredDeltaRawAdmissionErrorCode) {
    super(code);
    this.name = 'DeclaredDeltaRawAdmissionError';
  }
}
export interface PreparedDeclaredDeltaRawObservation extends PreparedDeclaredNativeObservationScope {
  readonly raw: {
    readonly kind: 'DECLARED_DELTA_RAW_OBSERVATION';
    readonly metadata: CompositionMetadata;
    readonly java: CompositionMetadata['java'];
    readonly codeSyntax: ValidatedCodeSyntaxObservation;
    readonly provenance: {
      readonly kind: 'DECLARED_INPUT';
      readonly requestIdentity: string;
      readonly outputIdentity: string;
    };
  };
}
export type PreparedBindingDeltaRawObservation = Omit<
  PreparedDeclaredDeltaRawObservation,
  'raw'
> & {
  raw: Omit<PreparedDeclaredDeltaRawObservation['raw'], 'codeSyntax'> & {
    codeSyntax: ReturnType<typeof validateBindingSyntaxObservationStreamWithBudget>['observation'];
  };
};
export type PreparedFrameworkSurfaceDeltaRawObservation = Omit<
  PreparedBindingDeltaRawObservation,
  'raw'
> & {
  raw: Omit<PreparedBindingDeltaRawObservation['raw'], 'codeSyntax'> & {
    codeSyntax: ReturnType<typeof validateFrameworkSurfaceStreamWithBudget>['observation'];
  };
};
type AnyPreparedRaw =
  | PreparedDeclaredDeltaRawObservation
  | PreparedBindingDeltaRawObservation
  | PreparedFrameworkSurfaceDeltaRawObservation;
const order = (a: { path: string; id: string }, b: { path: string; id: string }) =>
  Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
  Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
/** Pure declared admission only. No Source, owner, Stage, settlement or publication authority. */
export function prepareDeclaredDeltaRawObservation(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: unknown,
): PreparedDeclaredDeltaRawObservation {
  return prepareRawObservation(
    input,
    metadata,
    requestBytes,
    outputBytes,
    limits,
  ) as PreparedDeclaredDeltaRawObservation;
}
/** Private continuation; shares the ledger before preparation or decoding can fail. */
export default function prepareDeclaredDeltaRawObservationWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedDeclaredDeltaRawObservation {
  return prepareRawObservation(
    input,
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
  ) as PreparedDeclaredDeltaRawObservation;
}
function prepareRawObservation(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: unknown,
  continuation?: CodeSyntaxCompositionBudget,
  bindingV6: boolean | 7 | 8 = false,
): AnyPreparedRaw {
  try {
    const prepared = continuation
        ? prepareDeclaredNativeObservationScopeWithBudget(input, continuation)
        : prepareDeclaredNativeObservationScope(input, limits),
      { packet, scope, limits: l, budget: b } = prepared;
    requireComposition(scope.mode === 'OBSERVATION_REQUIRED', 'UNSUPPORTED_SCOPE');
    const charge = <T>(v: T): T => {
      chargeCompositionJSON(v, l, b);
      return v;
    };
    const owned: unknown = JSON.parse(chargeCompositionJSON(metadata, l, b));
    charge(owned);
    const m = CompositionMetadataSchema.parse(owned);
    charge(m);
    requireComposition(
      // Legacy R0 keeps H1-ordered metadata; only the private Runtime bridge uses Native order.
      (continuation
        ? m.inventory.length === packet.target.inventory.length &&
          m.inventory.every(
            (f, i) =>
              (i === 0 || order(m.inventory[i - 1]!, f) < 0) &&
              packet.target.inventory.some((g) => g.id === f.id && isDeepStrictEqual(f, g)),
          )
        : isDeepStrictEqual(m.inventory, packet.target.inventory)) &&
        isDeepStrictEqual(m.targetSource, packet.target.source) &&
        packet.target.contracts.some((c) => c.providerId === 'native'),
      'INVALID_CONTEXT',
    );
    if (bindingV6)
      requireComposition(
        packet.target.contracts.some(
          (c) =>
            c.providerId === 'native' &&
            c.extractor === (bindingV6 === 8 ? 'syntax-v2' : 'syntax-v1') &&
            c.normalizer ===
              (bindingV6 === 8
                ? 'syntax-canonical-mapper-v4'
                : bindingV6 === 7
                  ? 'syntax-canonical-mapper-v3'
                  : 'syntax-canonical-mapper-v2') &&
            c.contract ===
              (bindingV6 === 8
                ? 'SYNTAX_BINDING_V4'
                : bindingV6 === 7
                  ? 'SYNTAX_BINDING_V3'
                  : 'SYNTAX_BINDING_V2') &&
            c.policy ===
              (bindingV6 === 8 ? 'syntax-surface-support-v2' : 'syntax-surface-support-v1'),
        ),
        'INVALID_CONTEXT',
      );
    validateCompositionComponents(m);
    requireComposition(
      !packet.history!.state.snapshots.some((s) => s.id === m.snapshot.id),
      'INVALID_CONTEXT',
    );
    const ids = new Set<string>(),
      javaIds = new Set<string>();
    for (const unit of scope.requiredUnits) {
      charge(unit);
      for (const id of unit.sourceFileIds) {
        charge(id);
        ids.add(id);
        if (unit.kind === 'JAVA_GROUP') javaIds.add(id);
      }
    }
    const files: SourceFile[] = [],
      javaFiles: SourceFile[] = [];
    for (const f of packet.target.inventory)
      if (ids.has(f.id)) {
        charge(f);
        files.push(f);
        if (javaIds.has(f.id)) {
          charge(f);
          javaFiles.push(f);
        }
      }
    files.sort(order);
    javaFiles.sort(order);
    requireComposition(
      javaFiles.length ? m.java !== null : m.java === null,
      javaFiles.length ? 'INCOMPLETE_OBSERVATION' : 'INVALID_CONTEXT',
    );
    const removed: { id: string; path: string; previousContentFingerprint: string }[] = [];
    for (const d of scope.diff)
      if (
        d.kind === 'REMOVED' &&
        d.before &&
        historyProjected(d.before) &&
        ['java', 'python'].includes(d.before.languageHint ?? '')
      ) {
        const r = {
          id: d.before.id,
          path: d.before.path,
          previousContentFingerprint: d.before.contentFingerprint,
        };
        charge(r);
        removed.push(r);
      }
    removed.sort(order);
    const context: CodeSyntaxCompositionBudget = { limits: l, budget: b };
    const decoded = (
        bindingV6 === 8
          ? validateFrameworkSurfaceStreamWithBudget
          : bindingV6 === 7
            ? validateBindingAwareSyntaxObservationStreamWithBudget
            : bindingV6
              ? validateBindingSyntaxObservationStreamWithBudget
              : validateCodeSyntaxObservationStreamWithBudget
      )(requestBytes, outputBytes, context),
      c = decoded.observation,
      p = c.request.payload;
    requireComposition(
      isDeepStrictEqual(p.expectedActivationBasis, packet.expectedOldBasis) &&
        isDeepStrictEqual(p.targetSource, packet.target.source) &&
        p.providerId === m.snapshot.providerId &&
        p.providerSnapshotId === m.snapshot.id &&
        p.providerVersion === m.snapshot.providerVersion &&
        p.ownerBinding.kind === 'PROVISIONAL_CODE' &&
        isDeepStrictEqual(p.sourceFiles, files) &&
        isDeepStrictEqual(p.removedSourceFiles, removed),
      'INVALID_CONTEXT',
    );
    requireComposition(
      c.outcome === 'SUCCEEDED' &&
        c.syntaxOutcome === 'COMPLETE' &&
        c.codeOutcome ===
          (files.some((f) => f.languageHint === 'python') ? 'COMPLETE' : 'NOT_APPLICABLE'),
      'INCOMPLETE_OBSERVATION',
    );
    if (m.java) {
      charge(m.java);
      const parsed = validateParsedCompositionJava(m, javaFiles, p.repository, l, b);
      charge(parsed);
      charge(javaFiles);
      const source = new Map(javaFiles.map((f) => [f.id, f]));
      const nodes = new Map<string, { canonical: CanonicalNode; sourceFileId: string | null }>();
      for (const e of m.java.events) {
        if (e.type !== 'NODE') continue;
        const n = e.payload;
        charge(n);
        let canonical: CanonicalNode;
        try {
          canonical = normalizeJavaNode(n, source);
        } catch {
          throw new NativeCompositionError('NORMALIZATION_FAILED');
        }
        const key = JSON.stringify(['NODE', n.providerId, n.providerFactId]);
        charge(key);
        requireComposition(!nodes.has(key), 'INVALID_CONTEXT');
        const entry = {
          canonical,
          sourceFileId:
            n.sourceRange?.sourceFileId ??
            javaFiles.find((f) => String(f.path) === String(n.qualifiedName))?.id ??
            null,
        };
        charge(entry);
        nodes.set(key, entry);
      }
      for (const owner of p.owners) {
        charge(owner);
        const key = JSON.stringify([
          owner.providerNodeRef.factType,
          owner.providerNodeRef.providerId,
          owner.providerNodeRef.providerFactId,
        ]);
        charge(key);
        const node = nodes.get(key);
        requireComposition(
          node &&
            node.sourceFileId === owner.sourceFileId &&
            owner.canonicalRef.scope === 'REPOSITORY' &&
            owner.canonicalRef.repositoryId === packet.target.source.repositoryId &&
            owner.canonicalRef.entity.kind === 'CODE_NODE' &&
            owner.canonicalRef.entity.revisionId === packet.target.source.revisionId &&
            String(owner.canonicalRef.entity.id) === String(node.canonical.id),
          'INVALID_CONTEXT',
        );
      }
    } else requireComposition(p.owners.length === 0, 'INVALID_CONTEXT');
    const raw: AnyPreparedRaw['raw'] = {
      kind: 'DECLARED_DELTA_RAW_OBSERVATION',
      metadata: m,
      java: m.java,
      codeSyntax: c,
      provenance: {
        kind: 'DECLARED_INPUT',
        requestIdentity: c.requestChecksum,
        outputIdentity: decoded.outputIdentity,
      },
    };
    charge(raw);
    return { ...prepared, raw: freezeComposition(raw) };
  } catch (e) {
    if (
      e instanceof HistoryTransitionError ||
      e instanceof NativeCompositionError ||
      e instanceof NativeSyntaxContractError
    )
      throw new DeclaredDeltaRawAdmissionError(e.code);
    throw new DeclaredDeltaRawAdmissionError('INVALID_INPUT');
  }
}

export function prepareDeclaredBindingDeltaRawObservationWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedBindingDeltaRawObservation {
  return prepareRawObservation(
    input,
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
    true,
  ) as PreparedBindingDeltaRawObservation;
}

export function prepareDeclaredBindingAwareDeltaRawObservationWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedBindingDeltaRawObservation {
  return prepareRawObservation(
    input,
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
    7,
  ) as PreparedBindingDeltaRawObservation;
}

export function prepareDeclaredFrameworkSurfaceDeltaRawObservationWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): PreparedFrameworkSurfaceDeltaRawObservation {
  return prepareRawObservation(
    input,
    metadata,
    requestBytes,
    outputBytes,
    context.limits,
    context,
    8,
  ) as PreparedFrameworkSurfaceDeltaRawObservation;
}
