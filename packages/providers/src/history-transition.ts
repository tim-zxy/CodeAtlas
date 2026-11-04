import {
  chargeCompositionJSON,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import collectMergeSupportsWithBudget from './fact-merger-input.js';
import prepareHistoryTransitionWithBudget from './history-transition-input.js';
import { NativeCompositionError } from './native-code-syntax-budget.js';
import type { ProviderFactRef } from '@codeatlas/ir';
import { isDeepStrictEqual } from 'node:util';
import { collectMergeSupports, type MergeSupport } from './fact-merger-input.js';
import { freezeComposition } from './native-composition-input.js';
import {
  prepareHistoryTransition,
  prepareHistoryScopeInputWithBudget,
  HistoryTransitionError,
  historyRequire,
  historyCompare,
  historyRefKey,
  historyDraftDigest,
  chargeHistoryJSON,
  historyUnits,
  historyCoverage,
  historyDependencies,
  historyProjected,
  historySupported,
  type PreparedHistoryTransition,
  type HistoryTransitionDraft,
  type HistoryDependencyUnit,
  type HistoryCoverage,
  type HistorySupport,
} from './history-transition-input.js';
export interface PreparedHistoryTransitionDraft extends PreparedHistoryTransition {
  readonly transition: HistoryTransitionDraft;
}
function deriveHistoryObservationScope(
  prepared: PreparedHistoryTransition,
  context: CodeSyntaxCompositionBudget | null = null,
) {
  const q = (v: unknown) => {
    if (context) chargeCompositionJSON(v, context.limits, context.budget);
  };
  const { packet: p, limits: l, budget: b } = prepared,
    h = p.history;
  historyRequire(h);
  if (context)
    for (const v of [
      h.state.inventory,
      p.target.inventory,
      p.target.inventory,
      h.state.contracts,
      p.target.contracts,
      h.state.units,
    ])
      q(v);
  const old = h.state,
    target = p.target,
    oldFiles = new Map(old.inventory.map((f) => [String(f.id), f])),
    targetFiles = new Map(target.inventory.map((f) => [String(f.id), f])),
    targetPaths = new Map(target.inventory.map((f) => [String(f.path), f]));
  const add = <T>(v: T): T => {
    chargeHistoryJSON(v, l, b);
    return v;
  };
  historyRequire(target.source.repositoryId === old.basis.repositoryId);
  historyRequire(
    target.source.revisionId === old.basis.revisionId &&
      target.repositoryLocatorDigest === old.repositoryLocatorDigest,
    'FULL_ANALYSIS_REQUIRED',
  );
  for (const f of target.inventory) historyRequire(historySupported(f), 'FULL_ANALYSIS_REQUIRED');
  const diff: HistoryTransitionDraft['diff'][number][] = [];
  for (const id of [...new Set([...oldFiles.keys(), ...targetFiles.keys()])].sort(historyCompare)) {
    const before = oldFiles.get(id) ?? null,
      after = targetFiles.get(id) ?? null;
    const kind =
      before === null
        ? 'ADDED'
        : after === null
          ? 'REMOVED'
          : isDeepStrictEqual(before, after)
            ? 'UNCHANGED'
            : 'MODIFIED';
    if (before && after)
      historyRequire(
        isDeepStrictEqual(before.classification, after.classification) &&
          before.languageHint === after.languageHint,
        'FULL_ANALYSIS_REQUIRED',
      );
    if (before) {
      const owner = targetPaths.get(before.path);
      historyRequire(!owner || owner.id === before.id, 'FULL_ANALYSIS_REQUIRED');
    }
    diff.push(add({ kind, before, after }));
  }
  const changedIds = diff
    .filter((d) => d.kind !== 'UNCHANGED')
    .map((d) => String((d.before ?? d.after)!.id));
  q(changedIds);
  const changed = new Set(changedIds);
  const oldContracts = new Map(old.contracts.map((c) => [c.providerId, c])),
    newContracts = new Map(target.contracts.map((c) => [c.providerId, c]));
  const contractChanged = (provider: string) =>
    !isDeepStrictEqual(oldContracts.get(provider), newContracts.get(provider));
  const oldUnit = new Map(old.units.map((u) => [u.id, u]));
  const unitChanged = (u: HistoryDependencyUnit) =>
    contractChanged(u.providerId) ||
    u.sourceFileIds.some((id) => changed.has(id)) ||
    (u.kind === 'JAVA_GROUP' &&
      diff.some(
        (d) => d.kind === 'ADDED' && d.after?.languageHint === 'java' && historyProjected(d.after),
      ));
  for (const s of old.supports)
    if (s.binding.providerFact.providerId !== 'native')
      historyRequire(
        s.dependencyUnitIds !== null &&
          s.dependencyUnitIds.every((id) => !unitChanged(oldUnit.get(id)!)) &&
          !contractChanged(s.binding.providerFact.providerId),
        'OTHER_PROVIDER_REVALIDATION_REQUIRED',
      );
  for (const u of old.units)
    if (u.providerId !== 'native')
      historyRequire(!unitChanged(u), 'OTHER_PROVIDER_REVALIDATION_REQUIRED');
  const javaIds = target.inventory
      .filter((f) => historyProjected(f) && f.languageHint === 'java')
      .map((f) => String(f.id))
      .sort(historyCompare),
    pyIds = target.inventory
      .filter((f) => historyProjected(f) && f.languageHint === 'python')
      .map((f) => String(f.id))
      .sort(historyCompare);
  q(javaIds);
  q(pyIds);
  const javaOld = old.units.find((u) => u.providerId === 'native' && u.kind === 'JAVA_GROUP');
  const javaChanged =
    contractChanged('native') ||
    !isDeepStrictEqual(javaOld?.sourceFileIds ?? [], javaIds) ||
    Boolean(javaOld && unitChanged(javaOld));
  const required: {
    kind: 'JAVA_GROUP' | 'PYTHON_FILE';
    ids: readonly string[];
    oldId: string | null;
  }[] = [];
  if (javaChanged && javaIds.length)
    required.push({ kind: 'JAVA_GROUP', ids: javaIds, oldId: javaOld?.id ?? null });
  for (const id of pyIds) {
    const u = old.units.find(
      (u) => u.providerId === 'native' && u.kind === 'PYTHON_FILE' && u.sourceFileIds[0] === id,
    );
    if (!u || unitChanged(u))
      required.push({ kind: 'PYTHON_FILE', ids: [id], oldId: u?.id ?? null });
  }
  const unchanged =
    diff.every((d) => d.kind === 'UNCHANGED') &&
    isDeepStrictEqual(target.contracts, old.contracts) &&
    target.source.contentFingerprint === old.basis.contentFingerprint;
  q(required);
  return { diff, required, unchanged, targetFiles, oldUnit, newContracts, unitChanged };
}

export function prepareHistoryTransitionDraft(
  input: unknown,
  limits: unknown,
): PreparedHistoryTransitionDraft {
  return prepareHistoryTransitionDraftCore(input, limits, null);
}
export default function prepareHistoryTransitionDraftWithBudget(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): PreparedHistoryTransitionDraft {
  return prepareHistoryTransitionDraftCore(input, context.limits, context);
}
function prepareHistoryTransitionDraftCore(
  input: unknown,
  limits: unknown,
  context: CodeSyntaxCompositionBudget | null,
): PreparedHistoryTransitionDraft {
  try {
    const prepared = context
        ? prepareHistoryTransitionWithBudget(input, context)
        : prepareHistoryTransition(input, limits),
      { packet: p, limits: l, budget: b } = prepared,
      h = p.history;
    historyRequire(h);
    const old = h.state,
      target = p.target;
    const q = (v: unknown) => {
      if (context) chargeCompositionJSON(v, l, b);
    };
    const { diff, required, unchanged, targetFiles, oldUnit, newContracts, unitChanged } =
      deriveHistoryObservationScope(prepared, context);
    const add = <T>(v: T): T => {
      chargeHistoryJSON(v, l, b);
      return v;
    };
    if (!p.observation) {
      historyRequire(required.length === 0, 'FULL_ANALYSIS_REQUIRED');
      historyRequire(unchanged || diff.some((d) => d.kind === 'REMOVED'), 'FULL_ANALYSIS_REQUIRED');
    }
    const observedUnits = p.observation?.units ?? [];
    const observedIds = new Set(observedUnits.map((u) => u.id));
    let fresh: readonly MergeSupport[] = [];
    if (p.observation) {
      const o = p.observation,
        s = o.observation.snapshot;
      historyRequire(required.length > 0 && o.units.length === required.length);
      q({ units: o.units, inventory: target.inventory });
      historyUnits(o.units, target.inventory, false);
      for (const u of o.units) {
        historyRequire(u.providerId === 'native');
        const match = required.find(
          (r) => r.kind === u.kind && isDeepStrictEqual(r.ids, u.sourceFileIds),
        );
        historyRequire(match && (!match.oldId || match.oldId === u.id));
        const sameId = oldUnit.get(u.id);
        historyRequire(
          !sameId ||
            (sameId.providerId === u.providerId &&
              sameId.kind === u.kind &&
              (u.kind === 'JAVA_GROUP' ||
                isDeepStrictEqual(sameId.sourceFileIds, u.sourceFileIds))),
        );
      }
      historyRequire(
        new Set(o.units.map((u) => JSON.stringify([u.kind, u.sourceFileIds]))).size ===
          required.length,
      );
      historyRequire(
        newContracts.has('native') &&
          s.providerId === 'native' &&
          s.outcome === 'SUCCEEDED' &&
          s.repositoryId === target.source.repositoryId &&
          s.requestedRevisionId === target.source.revisionId &&
          s.requestedRevisionFingerprint === target.source.contentFingerprint &&
          s.startedAt <= s.completedAt &&
          !old.snapshots.some((x) => x.id === s.id),
      );
      const mergeInput = {
        repositoryId: target.source.repositoryId,
        revisionId: target.source.revisionId,
        observations: [o.observation],
      };
      fresh = context
        ? collectMergeSupportsWithBudget(mergeInput, context)
        : collectMergeSupports(mergeInput);
      q({ coverage: o.coverage, units: o.units, snapshots: [s] });
      historyCoverage(o.coverage, o.units, [s]);
      historyRequire(o.supportDependencies.length === fresh.length);
      q(o.supportDependencies);
      const keys = new Set<string>();
      let previous: ProviderFactRef | null = null;
      for (const d of o.supportDependencies) {
        const key = historyRefKey(d.providerFact);
        historyRequire(
          !keys.has(key) &&
            (!previous ||
              (historyCompare(previous.factType, d.providerFact.factType) ||
                historyCompare(previous.providerId, d.providerFact.providerId) ||
                historyCompare(previous.providerFactId, d.providerFact.providerFactId)) < 0),
        );
        keys.add(key);
        previous = d.providerFact;
        const support = fresh.find((x) => historyRefKey(x.binding.providerFact) === key);
        historyRequire(support);
        q({
          canonical: support.canonical,
          binding: support.binding,
          dependencyUnitIds: d.unitIds,
          units: o.units,
        });
        historyDependencies({ ...support, dependencyUnitIds: d.unitIds }, o.units);
      }
      historyRequire(
        fresh.every(
          (x) =>
            keys.has(historyRefKey(x.binding.providerFact)) &&
            !old.supports.some((y) => y.evidence.id === x.evidence.id),
        ),
      );
    }
    const byRef = new Map<string, MergeSupport>();
    for (const x of fresh) {
      const key = historyRefKey(x.binding.providerFact);
      q([key, x]);
      byRef.set(key, x);
    }
    const supportDecisions: HistoryTransitionDraft['supportDecisions'][number][] = [],
      survivors: (MergeSupport | HistorySupport)[] = [];
    for (const s of old.supports) {
      let action: 'RETAIN' | 'SUPERSEDE' | 'INVALIDATE' = 'RETAIN',
        replacementEvidenceId: string | null = null;
      if (s.binding.providerFact.providerId === 'native') {
        historyRequire(s.dependencyUnitIds !== null);
        const dependencies = s.dependencyUnitIds.map((id) => oldUnit.get(id)!);
        if (dependencies.some(unitChanged)) {
          for (const u of dependencies)
            if (unitChanged(u)) {
              const remaining = u.sourceFileIds.filter((id) => targetFiles.has(id));
              historyRequire(remaining.length === 0 || observedIds.has(u.id));
            }
          const replacement = byRef.get(historyRefKey(s.binding.providerFact));
          action = replacement ? 'SUPERSEDE' : 'INVALIDATE';
          replacementEvidenceId = replacement?.evidence.id ?? null;
        } else historyRequire(!byRef.has(historyRefKey(s.binding.providerFact)));
      }
      if (action === 'RETAIN') survivors.push(s);
      supportDecisions.push(add({ evidenceId: s.evidence.id, action, replacementEvidenceId }));
    }
    supportDecisions.sort((a, b) => historyCompare(a.evidenceId, b.evidenceId));
    const addedEvidenceIds = fresh.map((s) => add(String(s.evidence.id))).sort(historyCompare),
      facts = new Map<string, { factType: 'NODE' | 'EDGE'; id: string }>();
    for (const s of [...survivors, ...fresh]) {
      const fact = { factType: s.factType, id: String(s.canonical.id) },
        key = JSON.stringify([fact.factType, fact.id]);
      if (!facts.has(key)) facts.set(key, add(fact));
    }
    const survivingFactKeys = [...facts.values()].sort(
      (a, b) => historyCompare(a.factType, b.factType) || historyCompare(a.id, b.id),
    );
    const coverageOrigins: HistoryCoverage[] = [];
    for (const c of old.coverage) {
      const u = oldUnit.get(c.unitId)!;
      if (!unitChanged(u)) coverageOrigins.push(add(c));
    }
    for (const c of p.observation?.coverage ?? []) coverageOrigins.push(add(c));
    coverageOrigins.sort(
      (a, b) => historyCompare(a.unitId, b.unitId) || historyCompare(a.facet, b.facet),
    );
    const syntaxRequirements = old.syntaxOrigins
      .map((s) =>
        add({
          originId: s.id,
          action: unitChanged(oldUnit.get(s.unitId)!)
            ? ('RETIRE_ORIGIN' as const)
            : ('REVALIDATE_FINAL_BASIS' as const),
        }),
      )
      .sort((a, b) => historyCompare(a.originId, b.originId));
    const historyDigest = historyDraftDigest(h, l, b),
      ledger = {
        historyDigest,
        expectedActivationId: p.expectedActivationId,
        expectedOldBasis: p.expectedOldBasis,
        target,
        observation: p.observation,
        diff,
        supportDecisions,
        addedEvidenceIds,
        survivingFactKeys,
        coverageOrigins,
        syntaxRequirements,
      };
    const result: HistoryTransitionDraft = {
      kind: unchanged && !p.observation ? 'NO_OP_DRAFT' : 'TRANSITION_DRAFT',
      activationId: h.activationId,
      oldBasis: old.basis,
      targetSource: target.source,
      historyDigest,
      ledgerDigest: historyDraftDigest(ledger, l, b),
      diff,
      supportDecisions,
      addedEvidenceIds,
      survivingFactKeys,
      coverageOrigins,
      syntaxRequirements,
    };
    chargeHistoryJSON(result, l, b);
    return { packet: p, limits: l, budget: b, transition: freezeComposition(result) };
  } catch (e) {
    if (context && e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new HistoryTransitionError(e.code);
    if (e instanceof HistoryTransitionError) throw e;
    throw new HistoryTransitionError('INVALID_HISTORY');
  }
}

export function planHistoryTransition(input: unknown, limits: unknown): HistoryTransitionDraft {
  return prepareHistoryTransitionDraft(input, limits).transition;
}

export interface DeclaredNativeObservationScope {
  readonly kind: 'DECLARED_NATIVE_OBSERVATION_SCOPE';
  readonly mode: 'NO_OP' | 'NO_OBSERVATION' | 'OBSERVATION_REQUIRED';
  readonly targetSource: PreparedHistoryTransition['packet']['target']['source'];
  readonly diff: HistoryTransitionDraft['diff'];
  readonly requiredUnits: readonly {
    readonly kind: 'JAVA_GROUP' | 'PYTHON_FILE';
    readonly sourceFileIds: readonly string[];
    readonly previousUnitId: string | null;
  }[];
  readonly removedSourceFileIds: readonly string[];
  readonly provenance: {
    readonly kind: 'DECLARED_INPUT';
    readonly historyActivationId: string;
  };
}
export interface PreparedDeclaredNativeObservationScope extends PreparedHistoryTransition {
  readonly scope: DeclaredNativeObservationScope;
}

export function prepareDeclaredNativeObservationScope(
  input: unknown,
  limits: unknown,
): PreparedDeclaredNativeObservationScope {
  return prepareDeclaredScope(input, limits);
}
/** Private same-operation continuation; failures retain their consumed prefix. */
export function prepareDeclaredNativeObservationScopeWithBudget(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): PreparedDeclaredNativeObservationScope {
  return prepareDeclaredScope(input, context.limits, context);
}
function prepareDeclaredScope(
  input: unknown,
  limits: unknown,
  context?: CodeSyntaxCompositionBudget,
): PreparedDeclaredNativeObservationScope {
  try {
    const prepared = context
        ? prepareHistoryScopeInputWithBudget(input, context)
        : prepareHistoryTransition(input, limits),
      { packet: p, limits: l, budget: b } = prepared,
      h = p.history;
    historyRequire(h);
    historyRequire(p.observation === null);
    const { diff, required, unchanged } = deriveHistoryObservationScope(prepared);
    if (required.length === 0)
      historyRequire(unchanged || diff.some((d) => d.kind === 'REMOVED'), 'FULL_ANALYSIS_REQUIRED');
    const requiredUnits = required.map((r) => {
      const value = {
        kind: r.kind,
        sourceFileIds: [...r.ids],
        previousUnitId: r.oldId,
      };
      chargeHistoryJSON(value, l, b);
      return value;
    });
    const removedSourceFileIds = diff
      .filter((d) => d.kind === 'REMOVED')
      .map((d) => String(d.before!.id))
      .sort(historyCompare);
    chargeHistoryJSON(removedSourceFileIds, l, b);
    const scope: DeclaredNativeObservationScope = {
      kind: 'DECLARED_NATIVE_OBSERVATION_SCOPE',
      mode: required.length ? 'OBSERVATION_REQUIRED' : unchanged ? 'NO_OP' : 'NO_OBSERVATION',
      targetSource: p.target.source,
      diff,
      requiredUnits,
      removedSourceFileIds,
      provenance: { kind: 'DECLARED_INPUT', historyActivationId: h.activationId },
    };
    chargeHistoryJSON(scope, l, b);
    return { ...prepared, scope: freezeComposition(scope) };
  } catch (e) {
    if (e instanceof HistoryTransitionError) throw e;
    throw new HistoryTransitionError('INVALID_HISTORY');
  }
}
