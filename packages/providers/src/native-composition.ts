import {
  readFrameworkSurfaceCompositionInputsWithBudget,
  type PreparedFrameworkSurfaceComposition,
} from './native-composition-input.js';
import { readBindingAwareCompositionInputsWithBudget } from './native-composition-input.js';
import readNativeCompositionInputsWithBudget from './native-composition-input.js';
import normalizeNativeAnalysisWithBudget from './canonical-normalizer.js';
import normalizePythonSourceObservationWithBudget from './python-normalizer.js';
import collectMergeSupportsWithBudget from './fact-merger-input.js';
import selectMergedFactsWithBudget from './fact-merger-selection.js';
import {
  remainingCompositionLimits,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import { createHash } from 'node:crypto';
import type { SourceFile, ProviderSnapshot } from '@codeatlas/ir';
import {
  normalizeNativeAnalysis,
  type NormalizedNodePair,
  type NormalizedEdgePair,
} from './canonical-normalizer.js';
import { normalizePythonSourceObservation } from './python-normalizer.js';
import { mergeCanonicalObservations, type MergedCanonicalAnalysis } from './fact-merger.js';
import {
  readNativeCompositionInputs,
  readBindingCompositionInputsWithBudget,
  type PreparedBindingComposition,
  NativeCompositionError,
  requireComposition,
  chargeCompositionJSON,
  freezeComposition,
  type NativeCompositionLimits,
  type PreparedNativeComposition,
} from './native-composition-input.js';
import type { ValidatedCodeSyntaxObservation } from './native-code-syntax-ipc.js';
export interface NativeProjectionCandidate {
  readonly kind: 'NATIVE_PROJECTION_CANDIDATE';
  readonly snapshot: ProviderSnapshot;
  readonly normalized: {
    readonly nodePairs: readonly NormalizedNodePair[];
    readonly edgePairs: readonly NormalizedEdgePair[];
  };
  readonly merged: MergedCanonicalAnalysis;
  readonly codeSyntax: ValidatedCodeSyntaxObservation;
  readonly scope: {
    readonly inventory: readonly SourceFile[];
    readonly nativeSourceFileIds: readonly string[];
    readonly capabilities: readonly string[];
  };
  readonly provenance: {
    readonly tool: { readonly target: string; readonly profile: string };
    readonly java: {
      readonly kind: 'PARSED_V2';
      readonly requestId: string;
      readonly startedAt: string;
      readonly settledAt: string;
    } | null;
    readonly codeSyntax: {
      readonly kind: 'RAW_V5';
      readonly requestId: string;
      readonly startedAt: string;
      readonly settledAt: string;
      readonly requestChecksum: string;
      readonly outputChecksum: string;
      readonly terminalChecksum: string;
    };
  };
}
export type BindingProjectionCandidate = Omit<
  NativeProjectionCandidate,
  'codeSyntax' | 'provenance'
> & {
  codeSyntax: PreparedBindingComposition['codeSyntax'];
  provenance: Omit<NativeProjectionCandidate['provenance'], 'codeSyntax'> & {
    codeSyntax: Omit<NativeProjectionCandidate['provenance']['codeSyntax'], 'kind'> & {
      kind: 'RAW_V6';
    };
  };
};
type AnyProjectionCandidate = Omit<NativeProjectionCandidate, 'codeSyntax' | 'provenance'> & {
  codeSyntax:
    | NativeProjectionCandidate['codeSyntax']
    | BindingProjectionCandidate['codeSyntax']
    | PreparedFrameworkSurfaceComposition['codeSyntax'];
  provenance: Omit<NativeProjectionCandidate['provenance'], 'codeSyntax'> & {
    codeSyntax: Omit<NativeProjectionCandidate['provenance']['codeSyntax'], 'kind'> & {
      kind: 'RAW_V5' | 'RAW_V6' | 'RAW_V7' | 'RAW_V8';
    };
  };
};
function composeNativeProjectionCore(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: NativeCompositionLimits,
  continuation?: CodeSyntaxCompositionBudget,
  details?: {
    prepared?:
      PreparedNativeComposition | PreparedBindingComposition | PreparedFrameworkSurfaceComposition;
  },
  bindingV6: boolean | 7 | 8 = false,
): AnyProjectionCandidate {
  const p =
    bindingV6 === 8
      ? readFrameworkSurfaceCompositionInputsWithBudget(
          metadata,
          requestBytes,
          outputBytes,
          continuation!,
        )
      : bindingV6 === 7
        ? readBindingAwareCompositionInputsWithBudget(
            metadata,
            requestBytes,
            outputBytes,
            continuation!,
          )
        : bindingV6
          ? readBindingCompositionInputsWithBudget(
              metadata,
              requestBytes,
              outputBytes,
              continuation!,
            )
          : continuation
            ? readNativeCompositionInputsWithBudget(
                metadata,
                requestBytes,
                outputBytes,
                continuation,
              )
            : readNativeCompositionInputs(metadata, requestBytes, outputBytes, limits);
  if (details) details.prepared = p;
  const m = p.metadata,
    c = p.codeSyntax,
    source = c.request.payload;
  let normalized: NativeProjectionCandidate['normalized'];
  try {
    const java = p.java
      ? continuation
        ? normalizeNativeAnalysisWithBudget({ ...p.java, stderr: '' }, continuation)
        : normalizeNativeAnalysis({ ...p.java, stderr: '' })
      : null;
    const pythonInput = {
      targetSource: m.targetSource,
      providerId: p.snapshot.providerId,
      providerSnapshotId: p.snapshot.id,
      sourceFiles: source.sourceFiles,
      nodes: c.events.flatMap((e) => (e.type === 'NODE' ? [e.payload] : [])),
      edges: c.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
    };
    const python = continuation
      ? normalizePythonSourceObservationWithBudget(pythonInput, continuation)
      : normalizePythonSourceObservation(pythonInput);
    normalized = {
      nodePairs: [...(java?.nodes ?? []), ...python.nodePairs],
      edgePairs: [...(java?.edges ?? []), ...python.edgePairs],
    };
    for (const pairs of [normalized.nodePairs, normalized.edgePairs]) {
      requireComposition(
        new Set(pairs.map((x) => x.provider.providerFactId)).size === pairs.length,
        'NORMALIZATION_FAILED',
      );
      requireComposition(
        new Set(pairs.map((x) => x.canonical.id)).size === pairs.length,
        'NORMALIZATION_FAILED',
      );
    }
  } catch (e) {
    if (e instanceof NativeCompositionError) throw e;
    if (
      continuation &&
      e !== null &&
      typeof e === 'object' &&
      'code' in e &&
      e.code === 'RESOURCE_LIMIT_EXCEEDED'
    )
      throw new NativeCompositionError('RESOURCE_LIMIT_EXCEEDED');
    throw new NativeCompositionError('NORMALIZATION_FAILED');
  }
  chargeCompositionJSON(normalized, p.limits, p.budget);
  const rawNodes = [
    ...(p.java?.events.filter((e) => e.type === 'NODE').map((e) => e.payload) ?? []),
    ...c.events.flatMap((e) => (e.type === 'NODE' ? [e.payload] : [])),
  ];
  // ponytail: bounded owner scans are quadratic; use maps if qualification shows this exceeds practical limits.
  for (const owner of source.owners) {
    const pair = normalized.nodePairs.find(
        (n) =>
          n.provider.providerId === owner.providerNodeRef.providerId &&
          n.provider.providerFactId === owner.providerNodeRef.providerFactId,
      ),
      node = rawNodes.find((n) => n.providerFactId === owner.providerNodeRef.providerFactId);
    requireComposition(pair && node, 'INVALID_CONTEXT');
    const fileId =
      node.sourceRange?.sourceFileId ??
      m.inventory.find((f) => String(f.path) === String(node.qualifiedName))?.id;
    requireComposition(
      fileId === owner.sourceFileId &&
        owner.canonicalRef.scope === 'REPOSITORY' &&
        owner.canonicalRef.repositoryId === m.targetSource.repositoryId &&
        owner.canonicalRef.entity.kind === 'CODE_NODE' &&
        String(owner.canonicalRef.entity.id) === String(pair.canonical.id) &&
        owner.canonicalRef.entity.revisionId === m.targetSource.revisionId,
      'INVALID_CONTEXT',
    );
  }
  let merged: MergedCanonicalAnalysis;
  try {
    const mergeInput = {
      repositoryId: m.targetSource.repositoryId,
      revisionId: m.targetSource.revisionId,
      observations: [
        { snapshot: p.snapshot, nodes: normalized.nodePairs, edges: normalized.edgePairs },
      ],
    };
    if (continuation) {
      const supports = collectMergeSupportsWithBudget(mergeInput, continuation),
        selected = selectMergedFactsWithBudget(supports, continuation);
      chargeCompositionJSON(supports, p.limits, p.budget);
      const ordered = [...supports].sort((a, b) =>
        a.evidence.id < b.evidence.id ? -1 : a.evidence.id > b.evidence.id ? 1 : 0,
      );
      merged = {
        ...selected,
        evidence: ordered.map((s) => s.evidence),
        factEvidence: ordered.map((s) => s.factEvidence),
        bindings: ordered.map((s) => s.binding),
      };
    } else merged = mergeCanonicalObservations(mergeInput);
  } catch (e) {
    if (
      continuation &&
      e !== null &&
      typeof e === 'object' &&
      'code' in e &&
      e.code === 'RESOURCE_LIMIT_EXCEEDED'
    )
      throw new NativeCompositionError('RESOURCE_LIMIT_EXCEEDED');
    throw new NativeCompositionError('MERGE_FAILED');
  }
  chargeCompositionJSON(merged, p.limits, p.budget);
  const result: AnyProjectionCandidate = {
    kind: 'NATIVE_PROJECTION_CANDIDATE',
    snapshot: p.snapshot,
    normalized,
    merged,
    codeSyntax: c,
    scope: {
      inventory: m.inventory,
      nativeSourceFileIds: source.sourceFiles.map((f) => f.id),
      capabilities: p.snapshot.capabilities.map((x) => x.name),
    },
    provenance: {
      tool: m.tool,
      java: p.java
        ? {
            kind: 'PARSED_V2',
            requestId: p.java.request.requestId,
            startedAt: p.java.startedAt,
            settledAt: p.java.settledAt,
          }
        : null,
      codeSyntax: {
        kind:
          bindingV6 === 8 ? 'RAW_V8' : bindingV6 === 7 ? 'RAW_V7' : bindingV6 ? 'RAW_V6' : 'RAW_V5',
        requestId: c.request.requestId,
        startedAt: m.codeSyntax.startedAt,
        settledAt: m.codeSyntax.settledAt,
        requestChecksum: c.requestChecksum,
        outputChecksum: createHash('sha256').update(p.outputBytes).digest('hex'),
        terminalChecksum: c.checksum,
      },
    },
  };
  chargeCompositionJSON(result, p.limits, p.budget);
  return freezeComposition(result);
}

export function composeNativeProjection(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: NativeCompositionLimits,
): NativeProjectionCandidate {
  return composeNativeProjectionCore(
    metadata,
    requestBytes,
    outputBytes,
    limits,
  ) as NativeProjectionCandidate;
}
/** Private full pure continuation; old public normalization and accounting remain unchanged. */
export default function composeNativeProjectionWithBudget(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): NativeProjectionCandidate {
  return composeNativeProjectionCore(
    metadata,
    requestBytes,
    outputBytes,
    remainingCompositionLimits(context),
    context,
  ) as NativeProjectionCandidate;
}

/** Internal history bridge retains the actual admitted originals, never caller Prepared data. */
export function composeNativeProjectionForHistory(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  const details: { prepared?: PreparedNativeComposition } = {},
    candidate = composeNativeProjectionCore(
      metadata,
      requestBytes,
      outputBytes,
      remainingCompositionLimits(context),
      context,
      details,
    );
  requireComposition(details.prepared, 'INVALID_CONTEXT');
  const result = {
    candidate: candidate as NativeProjectionCandidate,
    metadata: details.prepared.metadata,
    java: details.prepared.java,
  };
  chargeCompositionJSON(result, context.limits, context.budget);
  return freezeComposition(result);
}

export function composeBindingProjectionForHistory(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  const details: {
    prepared?:
      PreparedNativeComposition | PreparedBindingComposition | PreparedFrameworkSurfaceComposition;
  } = {};
  const candidate = composeNativeProjectionCore(
    metadata,
    requestBytes,
    outputBytes,
    remainingCompositionLimits(context),
    context,
    details,
    true,
  ) as BindingProjectionCandidate;
  requireComposition(details.prepared, 'INVALID_CONTEXT');
  const result = { candidate, metadata: details.prepared.metadata, java: details.prepared.java };
  chargeCompositionJSON(result, context.limits, context.budget);
  return freezeComposition(result);
}

export type BindingAwareProjectionCandidate = Omit<
  BindingProjectionCandidate,
  'provenance' | 'codeSyntax'
> & {
  codeSyntax: import('./native-composition-input.js').PreparedBindingAwareComposition['codeSyntax'];
  provenance: Omit<BindingProjectionCandidate['provenance'], 'codeSyntax'> & {
    codeSyntax: Omit<BindingProjectionCandidate['provenance']['codeSyntax'], 'kind'> & {
      kind: 'RAW_V7';
    };
  };
};
export function composeBindingAwareProjectionForHistory(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  const details: {
    prepared?:
      PreparedNativeComposition | PreparedBindingComposition | PreparedFrameworkSurfaceComposition;
  } = {};
  const candidate = composeNativeProjectionCore(
    metadata,
    requestBytes,
    outputBytes,
    remainingCompositionLimits(context),
    context,
    details,
    7,
  ) as BindingAwareProjectionCandidate;
  requireComposition(details.prepared, 'INVALID_CONTEXT');
  const result = { candidate, metadata: details.prepared.metadata, java: details.prepared.java };
  chargeCompositionJSON(result, context.limits, context.budget);
  return freezeComposition(result);
}

export type FrameworkSurfaceProjectionCandidate = Omit<
  BindingAwareProjectionCandidate,
  'provenance' | 'codeSyntax'
> & {
  codeSyntax: PreparedFrameworkSurfaceComposition['codeSyntax'];
  provenance: Omit<BindingAwareProjectionCandidate['provenance'], 'codeSyntax'> & {
    codeSyntax: Omit<BindingAwareProjectionCandidate['provenance']['codeSyntax'], 'kind'> & {
      kind: 'RAW_V8';
    };
  };
};
export function composeFrameworkSurfaceProjectionForHistory(
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  const details: {
    prepared?:
      PreparedNativeComposition | PreparedBindingComposition | PreparedFrameworkSurfaceComposition;
  } = {};
  const candidate = composeNativeProjectionCore(
    metadata,
    requestBytes,
    outputBytes,
    remainingCompositionLimits(context),
    context,
    details,
    8,
  ) as FrameworkSurfaceProjectionCandidate;
  requireComposition(details.prepared, 'INVALID_CONTEXT');
  const result = { candidate, metadata: details.prepared.metadata, java: details.prepared.java };
  chargeCompositionJSON(result, context.limits, context.budget);
  return freezeComposition(result);
}
