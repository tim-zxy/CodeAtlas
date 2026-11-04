import {
  prepareDeclaredFrameworkSurfaceDeltaRawObservationWithBudget,
  type PreparedFrameworkSurfaceDeltaRawObservation,
} from './declared-delta-raw-observation.js';
import { composeFrameworkSurfaceProjectionForHistory } from './native-composition.js';
import { composeBindingAwareProjectionForHistory } from './native-composition.js';
import { prepareDeclaredBindingAwareDeltaRawObservationWithBudget } from './declared-delta-raw-observation.js';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import {
  composeNativeProjectionForHistory,
  composeBindingProjectionForHistory,
  type NativeProjectionCandidate,
} from './native-composition.js';
import collectMergeSupportsWithBudget from './fact-merger-input.js';
import { SyntaxTargetSourceSchema } from './native-syntax-owner-binding.js';
import composeDeclaredDeltaSupportCandidateWithBudget from './delta-support-candidate.js';
import {
  ProviderSnapshotSchema,
  SourceFileSchema,
  ProviderIdSchema,
  type ProviderNode,
  type ProviderEdge,
  type SourceFile,
} from '@codeatlas/ir';
import prepareDeclaredDeltaRawObservationWithBudget, {
  prepareDeclaredDeltaRawObservation,
  prepareDeclaredBindingDeltaRawObservationWithBudget,
  type PreparedBindingDeltaRawObservation,
  DeclaredDeltaRawAdmissionError,
  type PreparedDeclaredDeltaRawObservation,
  type DeclaredDeltaRawAdmissionErrorCode,
} from './declared-delta-raw-observation.js';
import {
  DeltaSupportCompositionError,
  type DeclaredDeltaSupportCandidate,
  type DeltaSupportCompositionErrorCode,
} from './delta-support-candidate.js';
import {
  HistoryTransitionError,
  historyCompare,
  historyRefKey,
  historyDraftDigest,
  historyInventory,
  historyProjected,
  historySupported,
  type HistoryTransitionPacket,
  type HistorySupport,
  type HistoryDependencyUnit,
  type DeclaredNativeObservation,
} from './history-transition-input.js';
import {
  chargeCompositionJSON,
  remainingCompositionLimits,
  chargeCompositionIdentityTuple,
  requireComposition,
  NativeCompositionError,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import { freezeComposition } from './native-composition-input.js';
import { digestIdentityTuple } from './identity-tuple.js';
import normalizeNativeAnalysisWithBudget from './canonical-normalizer.js';
import normalizePythonSourceObservationWithBudget from './python-normalizer.js';
import { CanonicalNormalizationError } from './java-node-normalizer.js';
import { NativeSyntaxContractError } from './native-syntax-ipc.js';

export type DeclaredDeltaRawSupportErrorCode =
  DeclaredDeltaRawAdmissionErrorCode | DeltaSupportCompositionErrorCode;
export class DeclaredDeltaRawSupportError extends Error {
  constructor(readonly code: DeclaredDeltaRawSupportErrorCode) {
    super(code);
    this.name = 'DeclaredDeltaRawSupportError';
  }
}
export interface DeclaredDeltaRawSupportCandidate {
  readonly kind: 'DECLARED_DELTA_RAW_SUPPORT_CANDIDATE';
  readonly candidate: DeclaredDeltaSupportCandidate;
  readonly raw: PreparedDeclaredDeltaRawObservation['raw'];
}
export type BindingDeltaRawSupportCandidate = Omit<DeclaredDeltaRawSupportCandidate, 'raw'> & {
  raw: PreparedBindingDeltaRawObservation['raw'];
};
export type FrameworkSurfaceDeltaRawSupportCandidate = Omit<
  DeclaredDeltaRawSupportCandidate,
  'raw'
> & { raw: PreparedFrameworkSurfaceDeltaRawObservation['raw'] };
function assembleObservation(
  prepared: {
    target: HistoryTransitionPacket['target'];
    existingUnits: readonly HistoryDependencyUnit[];
    requiredUnits: PreparedDeclaredDeltaRawObservation['scope']['requiredUnits'];
    raw:
      | Omit<PreparedBindingDeltaRawObservation['raw'], 'kind'>
      | Omit<PreparedFrameworkSurfaceDeltaRawObservation['raw'], 'kind'>;
    normalized?: NativeProjectionCandidate['normalized'];
  },
  context: CodeSyntaxCompositionBudget,
): DeclaredNativeObservation {
  const { target, raw, requiredUnits, existingUnits } = prepared;
  const q = <T>(v: T): T => {
    chargeCompositionJSON(v, context.limits, context.budget);
    return v;
  };
  q(existingUnits);
  const ids = new Set(existingUnits.map((u) => u.id)),
    allocated = new Set<string>();
  const units: HistoryDependencyUnit[] = [];
  for (const descriptor of requiredUnits) {
    q(descriptor);
    let id = descriptor.previousUnitId;
    if (id === null) {
      const fields = [
        target.source.repositoryId,
        target.source.revisionId,
        target.repositoryLocatorDigest,
        'native',
        descriptor.kind,
        ...(descriptor.kind === 'PYTHON_FILE' ? descriptor.sourceFileIds : []),
      ];
      q(fields);
      chargeCompositionIdentityTuple('history-native-unit-v1', fields, context);
      id = digestIdentityTuple('history-native-unit-v1', fields);
      requireComposition(!ids.has(id), 'INVALID_CONTEXT');
    }
    q(id);
    requireComposition(!allocated.has(id), 'INVALID_CONTEXT');
    allocated.add(id);
    const unit: HistoryDependencyUnit = {
      id,
      providerId: 'native',
      kind: descriptor.kind,
      sourceFileIds: descriptor.sourceFileIds,
    };
    q(unit);
    units.push(unit);
  }
  units.sort((a, b) => historyCompare(a.id, b.id));
  q(units);
  const c = raw.codeSyntax;
  let normalized: NativeProjectionCandidate['normalized'];
  if (prepared.normalized) normalized = prepared.normalized;
  else {
    const java = raw.java
      ? normalizeNativeAnalysisWithBudget({ ...raw.java, stderr: '' }, context)
      : null;
    const python = normalizePythonSourceObservationWithBudget(
      {
        targetSource: raw.metadata.targetSource,
        providerId: raw.metadata.snapshot.providerId,
        providerSnapshotId: raw.metadata.snapshot.id,
        sourceFiles: c.request.payload.sourceFiles,
        nodes: c.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: c.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
      },
      context,
    );
    normalized = {
      nodePairs: [...(java?.nodes ?? []), ...python.nodePairs],
      edgePairs: [...(java?.edges ?? []), ...python.edgePairs],
    };
  }
  q(normalized);
  for (const pairs of [normalized.nodePairs, normalized.edgePairs]) {
    const providerIds = new Set<string>(),
      canonicalIds = new Set<string>();
    for (const pair of pairs) {
      q(pair.provider.providerFactId);
      q(pair.canonical.id);
      requireComposition(
        !providerIds.has(pair.provider.providerFactId) && !canonicalIds.has(pair.canonical.id),
        'NORMALIZATION_FAILED',
      );
      providerIds.add(pair.provider.providerFactId);
      canonicalIds.add(pair.canonical.id);
    }
  }
  const capabilities = [
    ...(units.some((u) => u.kind === 'JAVA_GROUP') ? ['JAVA_CODE_V2'] : []),
    ...(units.some((u) => u.kind === 'PYTHON_FILE') ? ['PYTHON_SYNTAX_CODE_V1'] : []),
    'FRAMEWORK_SYNTAX_OBSERVATION_V1',
  ].map((name) => ({ name, support: 'SUPPORTED' as const, coverage: 'COMPLETE' as const }));
  const diagnostics = [...(raw.java?.events ?? []), ...c.events]
    .filter((e) => e.type === 'DIAGNOSTIC')
    .map((e) => e.payload);
  q(diagnostics);
  q(capabilities);
  const snapshotDraft = {
    ...raw.metadata.snapshot,
    repositoryId: target.source.repositoryId,
    requestedRevisionId: target.source.revisionId,
    requestedRevisionFingerprint: target.source.contentFingerprint,
    capabilities,
    diagnostics,
    outcome: 'SUCCEEDED' as const,
  };
  q(snapshotDraft);
  q(snapshotDraft);
  const snapshot = ProviderSnapshotSchema.parse(snapshotDraft);
  const sourceFiles = new Map<string, SourceFile>();
  for (const f of target.inventory) {
    q([f.id, f]);
    sourceFiles.set(f.id, f);
  }
  const seen = new Set<string>();
  for (const events of [raw.java?.events ?? [], c.events])
    for (const e of events) {
      if (e.type !== 'NODE' && e.type !== 'EDGE') continue;
      const n = e.payload,
        key = historyRefKey({
          factType: e.type,
          providerId: n.providerId,
          providerFactId: n.providerFactId,
        });
      q(key);
      q([key, n]);
      requireComposition(!seen.has(key), 'NORMALIZATION_FAILED');
      seen.add(key);
    }
  const dependencies: DeclaredNativeObservation['supportDependencies'][number][] = [];
  // ponytail: bounded original-reference scans are quadratic; use indexed lookup if qualification shows the ceiling matters.
  for (const pair of [...normalized.nodePairs, ...normalized.edgePairs]) {
    let original: ProviderNode | ProviderEdge | undefined;
    for (const events of [raw.java?.events ?? [], c.events])
      for (const e of events) {
        if (
          e.type === pair.provider.factType &&
          e.payload.providerId === pair.provider.providerId &&
          e.payload.providerFactId === pair.provider.providerFactId
        )
          original = e.payload;
      }
    requireComposition(original, 'INVALID_CONTEXT');
    let unit: HistoryDependencyUnit | undefined;
    if (original.providerKind.startsWith('java.'))
      unit = units.find((u) => u.kind === 'JAVA_GROUP');
    else {
      const sourceId = original.sourceRange?.sourceFileId;
      const file = sourceId === undefined ? undefined : sourceFiles.get(sourceId);
      requireComposition(file && file.languageHint === 'python', 'INVALID_CONTEXT');
      unit = units.find((u) => u.kind === 'PYTHON_FILE' && u.sourceFileIds[0] === file.id);
    }
    requireComposition(unit, 'INVALID_CONTEXT');
    const d = { providerFact: pair.provider, unitIds: [unit.id] };
    q(d);
    dependencies.push(d);
  }
  dependencies.sort(
    (a, b) =>
      historyCompare(a.providerFact.factType, b.providerFact.factType) ||
      historyCompare(a.providerFact.providerId, b.providerFact.providerId) ||
      historyCompare(a.providerFact.providerFactId, b.providerFact.providerFactId),
  );
  const coverage: DeclaredNativeObservation['coverage'][number][] = [];
  for (const u of units)
    for (const facet of [
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      u.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
    ]) {
      const row = {
        unitId: u.id,
        facet,
        originSnapshotId: String(snapshot.id),
        coverage: 'COMPLETE' as const,
      };
      q(row);
      coverage.push(row);
    }
  coverage.sort((a, b) => historyCompare(a.unitId, b.unitId) || historyCompare(a.facet, b.facet));
  const observation: DeclaredNativeObservation = {
    observation: { snapshot, nodes: normalized.nodePairs, edges: normalized.edgePairs },
    units,
    supportDependencies: dependencies,
    coverage,
    requestIdentity: raw.provenance.requestIdentity,
    outputIdentity: raw.provenance.outputIdentity,
    settlement: 'DECLARED_SUCCEEDED',
  };
  q(observation);
  return freezeComposition(observation);
}
/** Pure declared-input composition only; no Source/run/Stage/Store authority. */
function composeRawCandidate(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: unknown,
  continuation?: CodeSyntaxCompositionBudget,
  bindingV6: boolean | 7 | 8 = false,
):
  | DeclaredDeltaRawSupportCandidate
  | BindingDeltaRawSupportCandidate
  | FrameworkSurfaceDeltaRawSupportCandidate {
  try {
    const prepared =
      bindingV6 === 8
        ? prepareDeclaredFrameworkSurfaceDeltaRawObservationWithBudget(
            input,
            metadata,
            requestBytes,
            outputBytes,
            continuation!,
          )
        : bindingV6 === 7
          ? prepareDeclaredBindingAwareDeltaRawObservationWithBudget(
              input,
              metadata,
              requestBytes,
              outputBytes,
              continuation!,
            )
          : bindingV6
            ? prepareDeclaredBindingDeltaRawObservationWithBudget(
                input,
                metadata,
                requestBytes,
                outputBytes,
                continuation!,
              )
            : continuation
              ? prepareDeclaredDeltaRawObservationWithBudget(
                  input,
                  metadata,
                  requestBytes,
                  outputBytes,
                  continuation,
                )
              : prepareDeclaredDeltaRawObservation(
                  input,
                  metadata,
                  requestBytes,
                  outputBytes,
                  limits,
                );
    const context: CodeSyntaxCompositionBudget = continuation ?? {
      limits: prepared.limits,
      budget: prepared.budget,
    };
    const observation = assembleObservation(
        {
          target: prepared.packet.target,
          existingUnits: prepared.packet.history!.state.units,
          requiredUnits: prepared.scope.requiredUnits,
          raw: prepared.raw,
        },
        context,
      ),
      packet = { ...prepared.packet, observation };
    chargeCompositionJSON(packet, context.limits, context.budget);
    const candidate = composeDeclaredDeltaSupportCandidateWithBudget(packet, context);
    const result: BindingDeltaRawSupportCandidate | FrameworkSurfaceDeltaRawSupportCandidate = {
      kind: 'DECLARED_DELTA_RAW_SUPPORT_CANDIDATE',
      candidate,
      raw: prepared.raw,
    };
    chargeCompositionJSON(result, context.limits, context.budget);
    return freezeComposition(result);
  } catch (e) {
    if (e instanceof DeclaredDeltaRawSupportError) throw e;
    if (
      e instanceof DeclaredDeltaRawAdmissionError ||
      e instanceof DeltaSupportCompositionError ||
      e instanceof HistoryTransitionError ||
      e instanceof NativeCompositionError ||
      e instanceof NativeSyntaxContractError
    )
      throw new DeclaredDeltaRawSupportError(e.code);
    if (e instanceof CanonicalNormalizationError)
      throw new DeclaredDeltaRawSupportError('NORMALIZATION_FAILED');
    throw new DeclaredDeltaRawSupportError('INVALID_INPUT');
  }
}

export function composeDeclaredDeltaRawSupportCandidate(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  limits: unknown,
): DeclaredDeltaRawSupportCandidate {
  return composeRawCandidate(
    input,
    metadata,
    requestBytes,
    outputBytes,
    limits,
  ) as DeclaredDeltaRawSupportCandidate;
}
/** Private pure continuation; never grants Source, Stage or publication authority. */
export default function composeDeclaredDeltaRawSupportCandidateWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): DeclaredDeltaRawSupportCandidate {
  let limits;
  try {
    limits = remainingCompositionLimits(context);
  } catch (e) {
    throw new DeclaredDeltaRawSupportError(
      e instanceof NativeCompositionError ? e.code : 'INVALID_INPUT',
    );
  }
  return composeRawCandidate(
    input,
    metadata,
    requestBytes,
    outputBytes,
    limits,
    context,
  ) as DeclaredDeltaRawSupportCandidate;
}

const fullTargetSchema = z.strictObject({
  source: SyntaxTargetSourceSchema,
  repositoryLocatorDigest: z.string().regex(/^[a-f0-9]{64}$/),
  inventory: z.array(SourceFileSchema),
  contracts: z.array(
    z.strictObject({
      providerId: ProviderIdSchema,
      extractor: z.string().min(1),
      normalizer: z.string().min(1),
      contract: z.string().min(1),
      policy: z.string().min(1),
    }),
  ),
});
/** Private full declared bridge. No Source/run/Stage/publication authority. */
function composeFullRawSupportCandidate(
  target: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
  bindingV6: boolean | 7 | 8 = false,
) {
  try {
    remainingCompositionLimits(context);
    const q = <T>(v: T): T => {
      chargeCompositionJSON(v, context.limits, context.budget);
      return v;
    };
    const encoded = chargeCompositionJSON(target, context.limits, context.budget);
    q(target);
    q(target);
    const t = fullTargetSchema.parse(JSON.parse(encoded));
    historyInventory(t.inventory, t.source);
    requireComposition(t.inventory.every(historySupported), 'UNSUPPORTED_SCOPE');
    requireComposition(
      t.contracts.some((c) => c.providerId === 'native'),
      'INVALID_CONTEXT',
    );
    if (bindingV6)
      requireComposition(
        t.contracts.some(
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
    const parsed = (
        bindingV6 === 8
          ? composeFrameworkSurfaceProjectionForHistory
          : bindingV6 === 7
            ? composeBindingAwareProjectionForHistory
            : bindingV6
              ? composeBindingProjectionForHistory
              : composeNativeProjectionForHistory
      )(metadata, requestBytes, outputBytes, context),
      c = parsed.candidate;
    q([parsed.metadata.inventory, t.inventory]);
    requireComposition(
      isDeepStrictEqual(parsed.metadata.targetSource, t.source) &&
        isDeepStrictEqual(
          [...parsed.metadata.inventory].sort((a, b) => historyCompare(String(a.id), String(b.id))),
          [...t.inventory].sort((a, b) => historyCompare(String(a.id), String(b.id))),
        ),
      'INVALID_CONTEXT',
    );
    const raw = {
      kind: 'DECLARED_FULL_RAW_OBSERVATION' as const,
      metadata: parsed.metadata,
      java: parsed.java,
      codeSyntax: c.codeSyntax,
      provenance: {
        kind: 'DECLARED_INPUT' as const,
        requestIdentity: c.provenance.codeSyntax.requestChecksum,
        outputIdentity: c.provenance.codeSyntax.outputChecksum,
      },
    };
    q(raw);
    const projected = t.inventory.filter(historyProjected),
      java = projected.filter((f) => f.languageHint === 'java'),
      python = projected.filter((f) => f.languageHint === 'python');
    q([projected, java, python]);
    const requiredUnits: PreparedDeclaredDeltaRawObservation['scope']['requiredUnits'] = [
      ...(java.length
        ? [
            {
              kind: 'JAVA_GROUP' as const,
              sourceFileIds: java.map((f) => String(f.id)).sort(historyCompare),
              previousUnitId: null,
            },
          ]
        : []),
      ...python.map((f) => ({
        kind: 'PYTHON_FILE' as const,
        sourceFileIds: [String(f.id)],
        previousUnitId: null,
      })),
    ];
    q(requiredUnits);
    const observation = assembleObservation(
      { target: t, existingUnits: [], requiredUnits, raw, normalized: c.normalized },
      context,
    );
    requireComposition(
      isDeepStrictEqual(observation.observation.snapshot, c.snapshot),
      'INVALID_CONTEXT',
    );
    const collected = collectMergeSupportsWithBudget(
        {
          repositoryId: t.source.repositoryId,
          revisionId: t.source.revisionId,
          observations: [observation.observation],
        },
        context,
      ),
      activeSupports: HistorySupport[] = [];
    for (const support of collected) {
      const { inputPath, ...rest } = support;
      void inputPath;
      const key = historyRefKey(support.binding.providerFact),
        dependency = observation.supportDependencies.find(
          (d) => historyRefKey(d.providerFact) === key,
        );
      q([key, dependency ?? null]);
      requireComposition(dependency, 'INVALID_CONTEXT');
      const valueDigest = historyDraftDigest(
          { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: support.canonical },
          context.limits,
          context.budget,
        ),
        row = { ...rest, dependencyUnitIds: dependency.unitIds, valueDigest };
      q(row);
      activeSupports.push(row);
    }
    activeSupports.sort(
      (a, b) =>
        historyCompare(a.factType, b.factType) ||
        historyCompare(a.binding.providerFact.providerId, b.binding.providerFact.providerId) ||
        historyCompare(
          a.binding.providerFact.providerFactId,
          b.binding.providerFact.providerFactId,
        ) ||
        historyCompare(a.evidence.id, b.evidence.id),
    );
    const result = {
      kind: 'DECLARED_FULL_RAW_SUPPORT_CANDIDATE' as const,
      observation,
      activeSupports,
      merged: c.merged,
      raw,
    };
    q(result);
    return freezeComposition(result);
  } catch (e) {
    if (e instanceof DeclaredDeltaRawSupportError) throw e;
    if (e !== null && typeof e === 'object' && 'code' in e && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new DeclaredDeltaRawSupportError('RESOURCE_LIMIT_EXCEEDED');
    if (e instanceof NativeCompositionError || e instanceof HistoryTransitionError)
      throw new DeclaredDeltaRawSupportError(e.code);
    throw new DeclaredDeltaRawSupportError('INVALID_INPUT');
  }
}

export function composeDeclaredFullRawSupportCandidate(
  target: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  return composeFullRawSupportCandidate(
    target,
    metadata,
    requestBytes,
    outputBytes,
    context,
    false,
  );
}
export function composeDeclaredBindingFullRawSupportCandidate(
  target: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  return composeFullRawSupportCandidate(target, metadata, requestBytes, outputBytes, context, true);
}
export function composeDeclaredBindingDeltaRawSupportCandidateWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): BindingDeltaRawSupportCandidate {
  const limits = remainingCompositionLimits(context);
  return composeRawCandidate(
    input,
    metadata,
    requestBytes,
    outputBytes,
    limits,
    context,
    true,
  ) as BindingDeltaRawSupportCandidate;
}

export function composeDeclaredBindingAwareFullRawSupportCandidate(
  target: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  return composeFullRawSupportCandidate(target, metadata, requestBytes, outputBytes, context, 7);
}
export function composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): BindingDeltaRawSupportCandidate {
  const limits = remainingCompositionLimits(context);
  return composeRawCandidate(
    input,
    metadata,
    requestBytes,
    outputBytes,
    limits,
    context,
    7,
  ) as BindingDeltaRawSupportCandidate;
}

export function composeDeclaredFrameworkSurfaceFullRawSupportCandidate(
  target: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
) {
  return composeFullRawSupportCandidate(target, metadata, requestBytes, outputBytes, context, 8);
}

export function composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget(
  input: unknown,
  metadata: unknown,
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): FrameworkSurfaceDeltaRawSupportCandidate {
  const limits = remainingCompositionLimits(context);
  return composeRawCandidate(
    input,
    metadata,
    requestBytes,
    outputBytes,
    limits,
    context,
    8,
  ) as FrameworkSurfaceDeltaRawSupportCandidate;
}
