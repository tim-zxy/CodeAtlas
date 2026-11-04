import { composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget } from '../../providers/dist/declared-delta-raw-support-candidate.js';
import normalizeFrameworkSurfaceObservation from '../../providers/dist/syntax-framework-surface-normalizer.js';
import { composeDeclaredFrameworkSurfaceFullRawSupportCandidate } from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { createFrameworkSurfaceSyntaxHistoryManifest } from '../../providers/dist/syntax-history-candidate.js';
import { validateFrameworkSurfaceObservation } from './mixed-analysis-validation.js';
import normalizeBindingAwareSyntaxObservation from '../../providers/dist/syntax-binding-sufficiency-normalizer.js';
import {
  composeDeclaredBindingAwareFullRawSupportCandidate,
  composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget,
} from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { validateBindingAwareObservation } from './mixed-analysis-validation.js';
import normalizeBindingSyntaxObservation from '../../providers/dist/syntax-binding-normalizer.js';
import { rememberMixedAnalysisFailure } from '../../storage/dist/analysis/mixed-analysis-state.js';
import {
  prepareJavaOwner,
  validateObservation,
  validateBindingObservation,
} from './mixed-analysis-validation.js';
import { types, isDeepStrictEqual } from 'node:util';
import composeDeclaredDeltaRawSupportCandidate, {
  composeDeclaredFullRawSupportCandidate,
  composeDeclaredBindingFullRawSupportCandidate,
  composeDeclaredBindingDeltaRawSupportCandidateWithBudget,
} from '../../providers/dist/declared-delta-raw-support-candidate.js';
import composeDeclaredDeltaSupportCandidate from '../../providers/dist/delta-support-candidate.js';
import { prepareDeclaredNativeObservationScopeWithBudget } from '../../providers/dist/history-transition.js';
import type {
  DeclaredNativeObservation,
  HistorySupport as ProviderHistorySupport,
} from '../../providers/dist/history-transition-input.js';
import type { MergedCanonicalAnalysis } from '../../providers/dist/fact-merger.js';
import normalizeSyntaxObservation from '../../providers/dist/syntax-normalizer.js';
import {
  createSyntaxHistoryManifest,
  createVersionedSyntaxHistoryManifest,
} from '../../providers/dist/syntax-history-candidate.js';
import { freezeComposition } from '../../providers/dist/native-composition-input.js';
import {
  remainingCompositionLimits,
  type CodeSyntaxCompositionBudget,
} from '../../providers/dist/native-code-syntax-budget.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  encodeHistoryValue,
  historyDigest,
  record,
  requireHistory,
  exact,
  array,
  text,
  historyCompare,
  validateHistoryManifest,
  validateSyntaxPair,
  type HistoryReadLimits,
  type HistoryManifest,
} from '../../storage/dist/analysis/activation-history-format.js';
import { predictCodeActivation } from '../../storage/dist/analysis/code-identity.js';
import type { MixedAnalysisRulesPort } from '../../storage/dist/analysis/mixed-analysis-state.js';
type Raw =
  | ReturnType<typeof composeDeclaredFullRawSupportCandidate>['raw']
  | ReturnType<typeof composeDeclaredDeltaRawSupportCandidate>['raw']
  | ReturnType<typeof composeDeclaredBindingDeltaRawSupportCandidateWithBudget>['raw'];
type Observation = Pick<
  DeclaredNativeObservation,
  'units' | 'coverage' | 'requestIdentity' | 'outputIdentity'
> & { snapshot: DeclaredNativeObservation['observation']['snapshot'] };
/** Pure computation only. Storage authenticates the readset; production routing stays disabled. */
export function createMixedAnalysisRules(): MixedAnalysisRulesPort {
  return Object.freeze({ prepareJavaOwner, validateObservation, compose });
}
export function createBindingMixedAnalysisRules(): MixedAnalysisRulesPort {
  return Object.freeze({
    prepareJavaOwner,
    validateObservation: validateBindingObservation,
    compose: (input: unknown, limits: HistoryReadLimits) => compose(input, limits, true),
  });
}
function compose(
  input: unknown,
  limits: HistoryReadLimits,
  bindingV6: boolean | 7 | 8 = false,
): unknown {
  const b = new HistoryReadBudget(checkedHistoryLimits(limits));
  try {
    return composeBudgeted(input, b, bindingV6);
  } catch (error) {
    if (error !== null && (typeof error === 'object' || typeof error === 'function'))
      rememberMixedAnalysisFailure(error, {
        rows: b.rows,
        serializedBytes: b.serializedBytes,
        items: b.items,
        retainedLogicalBytes: b.retainedLogicalBytes,
      });
    throw error;
  }
}
function composeBudgeted(
  input: unknown,
  b: HistoryReadBudget,
  bindingV6: boolean | 7 | 8 = false,
): unknown {
  const r = exact(input, ['mode', 'target', 'capture', 'rawBundle', 'qualificationRef']);
  requireHistory(r.mode === 'FULL' || r.mode === 'DELTA');
  const raw =
    r.rawBundle === null ? null : exact(r.rawBundle, ['metadata', 'requestBytes', 'outputBytes']);
  requireHistory(r.mode !== 'FULL' || raw);
  const declarations = {
    mode: r.mode,
    target: r.target,
    capture: r.capture,
    metadata: raw?.metadata ?? null,
    qualificationRef: r.qualificationRef,
  };
  b.own(declarations);
  const owned = record(b.parse(encodeHistoryValue(declarations, b))),
    target = exact(owned.target, ['source', 'repositoryLocatorDigest', 'inventory', 'contracts']),
    capture = exact(
      owned.capture,
      r.mode === 'FULL'
        ? ['parent', 'snapshotIds', 'snapshots', 'coverage', 'activeProviderIds']
        : [
            'parent',
            'snapshotIds',
            'snapshots',
            'coverage',
            'activeProviderIds',
            'history',
            'ancestors',
            'origins',
            'projections',
          ],
    ),
    qualificationRef = text(owned.qualificationRef);
  if (bindingV6)
    requireHistory(
      array(target.contracts).some((value) => {
        const c = record(value);
        return (
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
          c.policy === (bindingV6 === 8 ? 'syntax-surface-support-v2' : 'syntax-surface-support-v1')
        );
      }),
    );
  const snapshotIds = array(capture.snapshotIds).map(text),
    activeProviderIds = array(capture.activeProviderIds).map(text);
  for (const values of [snapshotIds, activeProviderIds])
    for (let i = 1; i < values.length; i++)
      requireHistory(historyCompare(values[i - 1]!, values[i]!) < 0);
  const parent =
    capture.parent === null
      ? null
      : exact(capture.parent, ['activationId', 'repositoryId', 'revisionId']);
  if (parent) for (const v of Object.values(parent)) text(v);
  const copyBytes = (value: unknown): Uint8Array => {
    requireHistory(
      value !== null &&
        typeof value === 'object' &&
        !types.isProxy(value) &&
        types.isUint8Array(value) &&
        (Object.getPrototypeOf(value) === Buffer.prototype ||
          Object.getPrototypeOf(value) === Uint8Array.prototype),
    );
    const bytes = value as Uint8Array,
      n = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(Uint8Array.prototype),
        'byteLength',
      )!.get!.call(bytes) as number;
    b.add('serializedBytes', n);
    b.pin(n);
    b.add('serializedBytes', n);
    b.pin(n);
    requireHistory(Reflect.ownKeys(bytes).length === n);
    return Buffer.from(bytes);
  };
  // Provider phases receive TOTAL consumption; memory bounds are reserved before entry.
  const provider = <T>(fn: (context: CodeSyntaxCompositionBudget) => T): T => {
    const rem = b.remaining(),
      cap = Math.min(rem.maxSerializedBytes, Math.floor(rem.memoryBudgetBytes / 2));
    requireHistory(cap > 0, 'HISTORY_LIMIT_EXCEEDED');
    const bytes = b.serializedBytes,
      items = b.items,
      c: CodeSyntaxCompositionBudget = {
        limits: {
          maxSerializedBytes: bytes + cap,
          maxItems: b.limits.maxItems,
          maxDepth: b.limits.maxDepth,
        },
        budget: { serializedBytes: bytes, items },
      };
    try {
      return fn(c);
    } finally {
      const delta = c.budget.serializedBytes - bytes;
      b.add('serializedBytes', delta);
      b.add('items', c.budget.items - items);
      b.pin(delta);
    }
  };
  const finish = <T extends object>(value: T) => {
    const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
      result = { ...value, usage };
    b.own(result);
    Object.assign(usage, {
      rows: b.rows,
      serializedBytes: b.serializedBytes,
      items: b.items,
      retainedLogicalBytes: b.retainedLogicalBytes,
    });
    return freezeComposition(result);
  };
  const oldSnapshots = array(capture.snapshots);
  for (const s of oldSnapshots) {
    const row = exact(s, [
      'id',
      'repositoryId',
      'providerId',
      'providerVersion',
      'runtimeVersion',
      'requestedRevisionId',
      'requestedRevisionFingerprint',
      'startedAt',
      'completedAt',
      'capabilities',
      'diagnostics',
      'outcome',
    ]);
    requireHistory(snapshotIds.includes(text(row.id)));
  }
  let merged: MergedCanonicalAnalysis,
    activeSupports: readonly ProviderHistorySupport[],
    units: DeclaredNativeObservation['units'],
    coverage: DeclaredNativeObservation['coverage'],
    snapshots: readonly unknown[],
    observation: Observation | null = null,
    nativeRaw: Raw | null = null,
    transitions: unknown = null;
  const syntax: unknown[] = [],
    ancestorManifests: HistoryManifest[] = [];
  if (r.mode === 'FULL') {
    requireHistory(activeProviderIds.every((id) => id === 'native'));
    requireHistory(raw);
    const request = copyBytes(raw.requestBytes),
      output = copyBytes(raw.outputBytes),
      full = provider((c) =>
        (bindingV6 === 8
          ? composeDeclaredFrameworkSurfaceFullRawSupportCandidate
          : bindingV6 === 7
            ? composeDeclaredBindingAwareFullRawSupportCandidate
            : bindingV6
              ? composeDeclaredBindingFullRawSupportCandidate
              : composeDeclaredFullRawSupportCandidate)(target, owned.metadata, request, output, c),
      );
    const o = full.observation;
    observation = {
      snapshot: o.observation.snapshot,
      units: o.units,
      coverage: o.coverage,
      requestIdentity: o.requestIdentity,
      outputIdentity: o.outputIdentity,
    };
    nativeRaw = full.raw;
    merged = full.merged;
    activeSupports = full.activeSupports;
    units = o.units;
    coverage = o.coverage;
    snapshots = [...oldSnapshots, observation.snapshot];
  } else {
    requireHistory(parent);
    const current = validateHistoryManifest(capture.history, b),
      currentId = 'activation:' + historyDigest('codeatlas-activation-history-v1', current, b);
    requireHistory(
      parent.activationId === currentId &&
        parent.repositoryId === current.state.basis.repositoryId &&
        parent.revisionId === current.state.basis.revisionId,
    );
    let child = current;
    ancestorManifests.push(current);
    for (const value of array(capture.ancestors)) {
      requireHistory(child.parent);
      const m = validateHistoryManifest(value, b),
        id = 'activation:' + historyDigest('codeatlas-activation-history-v1', m, b);
      requireHistory(
        child.parent.activationId === id &&
          child.parent.repositoryId === m.state.basis.repositoryId &&
          child.parent.revisionId === m.state.basis.revisionId,
      );
      if (child.transitions !== null)
        requireHistory(isDeepStrictEqual(record(child.transitions).oldBasis, m.state.basis));
      ancestorManifests.push(m);
      child = m;
    }
    requireHistory(child.parent === null);
    const s = current.state;
    requireHistory(isDeepStrictEqual(s.snapshots, oldSnapshots));
    requireHistory(
      isDeepStrictEqual(
        [...new Set(s.supports.map((v) => String(v.binding.providerFact.providerId)))].sort(
          historyCompare,
        ),
        activeProviderIds,
      ),
    );
    const oldBasis = predictCodeActivation(
      {
        targetSource: {
          repositoryId: s.basis.repositoryId,
          revisionId: s.basis.revisionId,
          contentFingerprint: s.basis.contentFingerprint,
        },
        committedSnapshotCount: snapshotIds.length,
        nodes: s.nodes,
        edges: s.edges,
        evidence: s.supports.map((v) => v.evidence),
        bindings: s.supports.map((v) => v.binding),
        factEvidence: s.supports.map((v) => v.factEvidence),
        candidates: s.supports.map((v) => ({
          evidenceId: v.evidence.id,
          factType: v.factType,
          canonicalFactId: v.canonical.id,
          candidate: v.canonical,
        })),
        snapshots: s.snapshots,
        coverage: capture.coverage,
      },
      b,
    );
    requireHistory(isDeepStrictEqual(oldBasis, s.basis));
    const origins = array(capture.origins).map(record),
      projections = array(capture.projections).map(record);
    requireHistory(
      origins.length === current.syntaxMembers.length &&
        projections.length === current.syntaxMembers.length &&
        new Set(origins.map((v) => v.id)).size === origins.length &&
        new Set(projections.map((v) => v.id)).size === projections.length,
    );
    for (const member of current.syntaxMembers) {
      const origin = origins.find((o) => o.id === member.originId),
        projection = projections.find((p) => p.id === member.projectionId),
        metadata = s.syntaxOrigins.find((o) => o.id === member.originId);
      requireHistory(origin && projection && metadata);
      validateSyntaxPair(
        origin,
        projection,
        metadata,
        member.unitId,
        current,
        ancestorManifests,
        b,
      );
    }
    const state = {
        ...s,
        supports: s.supports.map((v) => ({ ...v, snapshotId: v.evidence.providerSnapshotId })),
      },
      packet = {
        history: { activationId: currentId, parent: current.parent, state },
        current: state,
        expectedActivationId: currentId,
        expectedOldBasis: s.basis,
        target,
        observation: null,
      };
    b.own(packet);
    const scope = provider((c) => {
      const prepared = prepareDeclaredNativeObservationScopeWithBudget(packet, c);
      return prepared.scope;
    });
    let candidate: ReturnType<typeof composeDeclaredDeltaSupportCandidate>;
    if (scope.mode === 'OBSERVATION_REQUIRED') {
      requireHistory(raw);
      const request = copyBytes(raw.requestBytes),
        output = copyBytes(raw.outputBytes),
        result = provider((c) =>
          (bindingV6 === 8
            ? composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget
            : bindingV6 === 7
              ? composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget
              : bindingV6
                ? composeDeclaredBindingDeltaRawSupportCandidateWithBudget
                : composeDeclaredDeltaRawSupportCandidate)(
            packet,
            owned.metadata,
            request,
            output,
            c,
          ),
        );
      candidate = result.candidate;
      nativeRaw = result.raw;
      const fresh = candidate.originSnapshotRegistry.filter(
        (v) => !s.snapshots.some((old) => old.id === v.id),
      );
      requireHistory(fresh.length === 1);
      const observedUnits = candidate.dependencyUnits.filter((u) =>
        scope.requiredUnits.some(
          (w) => w.kind === u.kind && isDeepStrictEqual(w.sourceFileIds, u.sourceFileIds),
        ),
      );
      observation = {
        snapshot: fresh[0]!,
        units: observedUnits,
        coverage: candidate.transition.coverageOrigins.filter(
          (v) => v.originSnapshotId === fresh[0]!.id,
        ),
        requestIdentity: result.raw.provenance.requestIdentity,
        outputIdentity: result.raw.provenance.outputIdentity,
      };
    } else {
      requireHistory(raw === null);
      candidate = provider((c) => composeDeclaredDeltaSupportCandidate(packet, c));
    }
    if (candidate.mode === 'NO_OP') {
      requireHistory(scope.mode === 'NO_OP');
      return finish({ kind: 'NO_OP', activationId: currentId, basis: s.basis });
    }
    requireHistory(candidate.transition.kind === 'TRANSITION_DRAFT');
    transitions = candidate.transition;
    merged = candidate.merged;
    activeSupports = candidate.activeSupports;
    units = candidate.dependencyUnits;
    coverage = candidate.transition.coverageOrigins;
    snapshots = candidate.originSnapshotRegistry;
    for (const requirement of candidate.transition.syntaxRequirements) {
      if (requirement.action === 'RETIRE_ORIGIN') continue;
      const origin = origins.find((o) => o.id === requirement.originId);
      requireHistory(origin);
      const body = record(b.parse(text(origin.origin_json))),
        envelope = record(body.envelope),
        payload = record(envelope.payload),
        refs = array(payload.supportRefs);
      requireHistory(refs.length > 0);
      const originalBasis = record(refs[0]).basis,
        context = ancestorManifests.find((m) => isDeepStrictEqual(m.state.basis, originalBasis));
      requireHistory(context);
      const retained = {
        kind: 'RETAINED',
        body,
        originNodes: context.state.nodes,
        ...(bindingV6 === 8 ? { originEdges: context.state.edges } : {}),
      };
      b.own(retained);
      syntax.push(retained);
    }
  }
  if (observation) requireHistory(!snapshotIds.includes(observation.snapshot.id));
  const ordered = <T>(values: readonly T[], key: (v: T) => readonly string[]) => {
    b.own(values);
    const rows = values.map((value) => ({ value, key: key(value) }));
    b.own(rows);
    const encoded = rows.map((row) => ({
      ...row,
      key: row.key.map((k) => {
        const n = Buffer.byteLength(k);
        b.add('serializedBytes', n);
        b.pin(n);
        return Buffer.from(k);
      }),
    }));
    encoded.sort((a, c) => {
      for (let i = 0; i < a.key.length; i++) {
        const n = Buffer.compare(a.key[i]!, c.key[i]!);
        if (n) return n;
      }
      return 0;
    });
    return encoded.map((row) => row.value);
  };
  const supports = activeSupports.map(({ snapshotId, ...v }) => {
      void snapshotId;
      return v;
    }),
    sortedSnapshots = [...snapshots].sort((a, c) =>
      historyCompare(text(record(a).id), text(record(c).id)),
    ),
    code = {
      targetSource: target.source,
      committedSnapshotCount: snapshotIds.length + (observation ? 1 : 0),
      nodes: ordered(merged.nodes, (v) => [v.id]),
      edges: ordered(merged.edges, (v) => [v.id]),
      evidence: ordered(merged.evidence, (v) => [v.id]),
      bindings: ordered(merged.bindings, (v) => [
        v.evidenceId,
        v.providerFact.factType,
        v.canonicalFact.id,
      ]),
      factEvidence: ordered(merged.factEvidence, (v) => [v.evidenceId, v.fact.factType, v.fact.id]),
      candidates: ordered(
        supports.map((v) => ({
          evidenceId: v.evidence.id,
          factType: v.factType,
          canonicalFactId: v.canonical.id,
          candidate: v.canonical,
        })),
        (v) => [v.evidenceId, v.factType, v.canonicalFactId],
      ),
      snapshots: sortedSnapshots,
      coverage: [
        ...array(capture.coverage),
        ...(observation
          ? observation.coverage.flatMap((row) => {
              const unit = observation!.units.find((u) => u.id === row.unitId);
              requireHistory(unit);
              return unit.sourceFileIds.map((sourceFileId) => ({
                providerSnapshotId: row.originSnapshotId,
                capabilityName: row.facet,
                sourceFileId,
                status: row.coverage,
              }));
            })
          : []),
      ],
    };
  b.own(code);
  const basis = predictCodeActivation(code, b),
    state = {
      basis,
      repositoryLocatorDigest: target.repositoryLocatorDigest,
      inventory: target.inventory,
      contracts: target.contracts,
      units,
      snapshots: sortedSnapshots,
      nodes: [...merged.nodes].sort((a, c) => historyCompare(a.id, c.id)),
      edges: [...merged.edges].sort((a, c) => historyCompare(a.id, c.id)),
      supports,
      coverage,
    };
  b.own(state);
  if (nativeRaw && observation)
    for (const event of nativeRaw.codeSyntax.events) {
      if (event.type !== 'SYNTAX_OBSERVATION') continue;
      const sourceFile = array(target.inventory).find(
          (f) => record(f).id === event.payload.sourceFileId,
        ),
        unit = observation.units.find((u) => u.sourceFileIds.includes(event.payload.sourceFileId));
      requireHistory(sourceFile && unit);
      const payload = provider((c) =>
          (bindingV6 === 8
            ? normalizeFrameworkSurfaceObservation
            : bindingV6 === 7
              ? normalizeBindingAwareSyntaxObservation
              : bindingV6
                ? normalizeBindingSyntaxObservation
                : normalizeSyntaxObservation)(
            {
              basis,
              sourceFile,
              raw: event.payload,
              selectedNodes: state.nodes,
              ...(bindingV6 === 8 ? { selectedEdges: state.edges } : {}),
              bindings: merged.bindings,
              supports,
              extractorVersion: bindingV6 === 8 ? 'syntax-v2' : 'syntax-v1',
            },
            c,
          ),
        ),
        item = {
          kind: 'NEW',
          body: {
            schemaVersion: 1,
            providerSyntaxId: event.payload.providerSyntaxId,
            originSnapshot: observation.snapshot,
            sourceFile,
            unitId: unit.id,
            envelope: {
              schema: 'codeatlas.syntax-evidence',
              version: bindingV6 === 8 ? 4 : bindingV6 === 7 ? 3 : bindingV6 ? 2 : 1,
              payload,
            },
          },
        };
      b.own(item);
      syntax.push(item);
    }
  const observed = observation
    ? {
        snapshotId: observation.snapshot.id,
        requestIdentity: observation.requestIdentity,
        outputIdentity: observation.outputIdentity,
        javaProvenance: nativeRaw?.java
          ? {
              kind: 'PARSED_V2',
              requestId: nativeRaw.java.request.requestId,
              startedAt: nativeRaw.java.startedAt,
              settledAt: nativeRaw.java.settledAt,
            }
          : null,
        scope: {
          unitIds: observation.units.map((u) => u.id).sort(historyCompare),
          removedSourceFileIds:
            transitions === null
              ? []
              : array(record(transitions).diff)
                  .map(record)
                  .filter((d) => d.kind === 'REMOVED')
                  .map((d) => text(record(d.before).id))
                  .sort(historyCompare),
        },
        qualificationRef,
      }
    : null;
  const assembled = provider((c) =>
      (bindingV6 === 8
        ? createFrameworkSurfaceSyntaxHistoryManifest
        : bindingV6
          ? createVersionedSyntaxHistoryManifest
          : createSyntaxHistoryManifest)(
        { mode: r.mode, state, parent, observation: observed, transitions, syntax },
        c,
      ),
    ),
    manifest = validateHistoryManifest(assembled.manifest, b);
  for (const origin of assembled.origins) {
    const member = assembled.members.find((m) => m.originId === origin.id),
      projection = assembled.projections.find((p) => p.origin_id === origin.id),
      metadata = manifest.state.syntaxOrigins.find((m) => m.id === origin.id);
    requireHistory(member && projection && metadata);
    validateSyntaxPair(
      origin,
      projection,
      metadata,
      member.unitId,
      manifest,
      [manifest, ...ancestorManifests],
      b,
    );
  }
  return finish({ ...assembled, manifest, basis, code });
}

export function createBindingAwareMixedAnalysisRules(): MixedAnalysisRulesPort {
  return Object.freeze({
    prepareJavaOwner,
    validateObservation: validateBindingAwareObservation,
    compose: (input: unknown, limits: HistoryReadLimits) => compose(input, limits, 7),
  });
}

export function createFrameworkSurfaceMixedAnalysisRules(): MixedAnalysisRulesPort {
  return Object.freeze({
    prepareJavaOwner,
    validateObservation: validateFrameworkSurfaceObservation,
    compose: (input: unknown, limits: HistoryReadLimits) => compose(input, limits, 8),
  });
}
