import {
  chargeCompositionJSON,
  NativeCompositionError,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import prepareHistoryTransitionDraftWithBudget from './history-transition.js';
import collectMergeSupportsWithBudget from './fact-merger-input.js';
import selectMergedFactsWithBudget from './fact-merger-selection.js';
import { isDeepStrictEqual } from 'node:util';
import type { SourceFile, ProviderSnapshot, CanonicalEdge } from '@codeatlas/ir';
import {
  prepareHistoryTransitionDraft,
  type PreparedHistoryTransitionDraft,
} from './history-transition.js';
import {
  HistoryTransitionError,
  historyCompare,
  historyRefKey,
  historyDraftDigest,
  chargeHistoryJSON,
  historyUnits,
  historyCoverage,
  historyDependencies,
  type HistoryTransitionPacket,
  type HistoryTransitionDraft,
  type HistoryTransitionErrorCode,
  type HistorySupport,
  type HistoryDependencyUnit,
} from './history-transition-input.js';
import { collectMergeSupports, FactMergeError } from './fact-merger-input.js';
import { selectMergedFacts } from './fact-merger-selection.js';
import type { MergedCanonicalAnalysis } from './fact-merger.js';
import { freezeComposition } from './native-composition-input.js';
export interface DeclaredDeltaSupportCandidate {
  readonly kind: 'DECLARED_DELTA_SUPPORT_CANDIDATE';
  readonly mode: 'NO_OP' | 'TRANSITION';
  readonly targetSource: HistoryTransitionPacket['target']['source'];
  readonly inventory: readonly SourceFile[];
  readonly transition: HistoryTransitionDraft;
  readonly activeSupports: readonly HistorySupport[];
  readonly dependencyUnits: readonly HistoryDependencyUnit[];
  readonly merged: MergedCanonicalAnalysis;
  readonly originSnapshotRegistry: readonly ProviderSnapshot[];
  readonly provenance: {
    readonly kind: 'DECLARED_INPUT';
    readonly historyDigest: string;
    readonly ledgerDigest: string;
    readonly observation: null | {
      readonly requestIdentity: string;
      readonly outputIdentity: string;
    };
  };
}
export type DeltaSupportCompositionErrorCode =
  HistoryTransitionErrorCode | 'INVALID_CANDIDATE' | 'FACT_CONFLICT' | 'DANGLING_REFERENCE';
export class DeltaSupportCompositionError extends Error {
  constructor(readonly code: DeltaSupportCompositionErrorCode) {
    super(code);
    this.name = 'DeltaSupportCompositionError';
  }
}
function requireCandidate(
  value: unknown,
  code: DeltaSupportCompositionErrorCode = 'INVALID_CANDIDATE',
): asserts value {
  if (!value) throw new DeltaSupportCompositionError(code);
}
const compareSupport = (a: HistorySupport, b: HistorySupport) =>
  historyCompare(a.factType, b.factType) ||
  historyCompare(a.binding.providerFact.providerId, b.binding.providerFact.providerId) ||
  historyCompare(a.binding.providerFact.providerFactId, b.binding.providerFact.providerFactId) ||
  historyCompare(a.evidence.id, b.evidence.id);
function refs(
  supports: readonly HistorySupport[],
  context: CodeSyntaxCompositionBudget | null,
): { factType: 'NODE' | 'EDGE'; id: string }[] {
  const map = new Map<string, { factType: 'NODE' | 'EDGE'; id: string }>();
  for (const support of supports) {
    const fact = { factType: support.factType, id: String(support.canonical.id) },
      key = JSON.stringify([fact.factType, fact.id]);
    if (context) chargeCompositionJSON([key, fact], context.limits, context.budget);
    map.set(key, fact);
  }
  return [...map.values()].sort(
    (a, b) => historyCompare(a.factType, b.factType) || historyCompare(a.id, b.id),
  );
}
export function composeDeclaredDeltaSupportCandidate(
  input: unknown,
  limits: unknown,
): DeclaredDeltaSupportCandidate {
  return composeDeclaredDeltaSupportCandidateCore(input, limits, null);
}
export default function composeDeclaredDeltaSupportCandidateWithBudget(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): DeclaredDeltaSupportCandidate {
  return composeDeclaredDeltaSupportCandidateCore(input, context.limits, context);
}
function composeDeclaredDeltaSupportCandidateCore(
  input: unknown,
  limits: unknown,
  context: CodeSyntaxCompositionBudget | null,
): DeclaredDeltaSupportCandidate {
  let prepared: PreparedHistoryTransitionDraft;
  try {
    prepared = context
      ? prepareHistoryTransitionDraftWithBudget(input, context)
      : prepareHistoryTransitionDraft(input, limits);
  } catch (e) {
    throw new DeltaSupportCompositionError(
      e instanceof HistoryTransitionError ? e.code : 'INVALID_HISTORY',
    );
  }
  try {
    const { packet: p, limits: l, budget: b, transition: t } = prepared,
      h = p.history;
    requireCandidate(h);
    const old = h.state;
    const q = (v: unknown) => {
      if (context) chargeCompositionJSON(v, l, b);
    };
    const charge = <T>(v: T): T => {
      chargeHistoryJSON(v, l, b);
      return v;
    };
    q(t.supportDecisions);
    const decisions = new Map(t.supportDecisions.map((d) => [d.evidenceId, d]));
    requireCandidate(
      decisions.size === old.supports.length && decisions.size === t.supportDecisions.length,
    );
    q(old.supports);
    const oldEvidence = new Map<string, HistorySupport>(
        old.supports.map((s) => [s.evidence.id, s]),
      ),
      active: HistorySupport[] = [];
    for (const s of old.supports) {
      const d = decisions.get(s.evidence.id);
      requireCandidate(d);
      if (d.action === 'RETAIN') active.push(charge(s));
    }
    const fresh: HistorySupport[] = [];
    if (p.observation) {
      const o = p.observation;
      q(o.supportDependencies);
      const dependencies = new Map(
        o.supportDependencies.map((d) => [historyRefKey(d.providerFact), d.unitIds]),
      );
      const mergeInput = {
        repositoryId: p.target.source.repositoryId,
        revisionId: p.target.source.revisionId,
        observations: [o.observation],
      };
      const collected = context
        ? collectMergeSupportsWithBudget(mergeInput, context)
        : collectMergeSupports(mergeInput);
      for (const support of collected) {
        const { inputPath: _, ...relation } = support,
          unitIds = dependencies.get(historyRefKey(support.binding.providerFact));
        requireCandidate(unitIds);
        const valueDigest = historyDraftDigest(
          { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: support.canonical },
          l,
          b,
        );
        const s: HistorySupport = { ...relation, dependencyUnitIds: unitIds, valueDigest };
        fresh.push(s);
        active.push(charge(s));
      }
    }
    active.sort(compareSupport);
    const evidence = new Set<string>(),
      typed = new Set<string>();
    for (const s of active) {
      const key = historyRefKey(s.binding.providerFact);
      requireCandidate(!evidence.has(s.evidence.id) && !typed.has(key));
      q(s.evidence.id);
      q(key);
      evidence.add(s.evidence.id);
      typed.add(key);
      requireCandidate(s.evidence.status === 'ACTIVE');
    }
    const freshByRef = new Map<string, HistorySupport>();
    for (const s of fresh) {
      const key = historyRefKey(s.binding.providerFact);
      q([key, s]);
      freshByRef.set(key, s);
    }
    requireCandidate(
      isDeepStrictEqual(
        fresh.map((s) => String(s.evidence.id)).sort(historyCompare),
        t.addedEvidenceIds,
      ),
    );
    for (const d of t.supportDecisions) {
      const s = oldEvidence.get(d.evidenceId);
      requireCandidate(s);
      const replacement = freshByRef.get(historyRefKey(s.binding.providerFact));
      if (d.action === 'RETAIN')
        requireCandidate(
          evidence.has(d.evidenceId) && !replacement && d.replacementEvidenceId === null,
        );
      else {
        requireCandidate(!evidence.has(d.evidenceId));
        if (d.action === 'SUPERSEDE')
          requireCandidate(replacement && replacement.evidence.id === d.replacementEvidenceId);
        else
          requireCandidate(
            d.action === 'INVALIDATE' && !replacement && d.replacementEvidenceId === null,
          );
      }
    }
    const actualRefs = refs(active, context);
    q(actualRefs);
    requireCandidate(isDeepStrictEqual(actualRefs, t.survivingFactKeys));
    if (context)
      for (const v of [
        p.target.inventory,
        old.inventory,
        old.contracts,
        p.target.contracts,
        p.observation?.units ?? [],
      ])
        q(v);
    const targetFiles = new Map(p.target.inventory.map((f) => [String(f.id), f])),
      oldFiles = new Map(old.inventory.map((f) => [String(f.id), f])),
      oldContracts = new Map(old.contracts.map((c) => [c.providerId, c])),
      newContracts = new Map(p.target.contracts.map((c) => [c.providerId, c])),
      observed = new Map((p.observation?.units ?? []).map((u) => [u.id, u])),
      units: HistoryDependencyUnit[] = [];
    for (const u of old.units) {
      if (observed.has(u.id)) continue;
      const allGone = u.sourceFileIds.every((id) => !targetFiles.has(id));
      if (allGone) {
        requireCandidate(u.providerId === 'native');
        continue;
      }
      requireCandidate(
        u.sourceFileIds.every(
          (id) => targetFiles.has(id) && isDeepStrictEqual(targetFiles.get(id), oldFiles.get(id)),
        ) && isDeepStrictEqual(oldContracts.get(u.providerId), newContracts.get(u.providerId)),
      );
      q(u);
      units.push(u);
    }
    for (const u of observed.values()) {
      q(u);
      units.push(u);
    }
    units.sort((a, b) => historyCompare(a.id, b.id));
    for (const u of units) charge(u);
    historyUnits(units, p.target.inventory, true);
    if (context)
      q([...old.snapshots, ...(p.observation ? [p.observation.observation.snapshot] : [])]);
    const registry = [
      ...old.snapshots,
      ...(p.observation ? [p.observation.observation.snapshot] : []),
    ].sort((a, b) => historyCompare(a.id, b.id));
    requireCandidate(new Set(registry.map((s) => s.id)).size === registry.length);
    for (const s of registry) charge(s);
    historyCoverage(t.coverageOrigins, units, registry);
    if (context) q(active.filter((s) => s.factType === 'NODE').map((s) => String(s.canonical.id)));
    const nodes = new Set(
      active.filter((s) => s.factType === 'NODE').map((s) => String(s.canonical.id)),
    );
    for (const s of active) {
      const f = s.canonical;
      requireCandidate(
        f.repositoryId === p.target.source.repositoryId &&
          f.revisionId === p.target.source.revisionId,
      );
      if (f.sourceRange) {
        charge({ evidenceId: s.evidence.id, role: 'SOURCE_RANGE', id: f.sourceRange.sourceFileId });
        requireCandidate(targetFiles.has(f.sourceRange.sourceFileId), 'DANGLING_REFERENCE');
      }
      q({
        canonical: s.canonical,
        binding: s.binding,
        dependencyUnitIds: s.dependencyUnitIds,
        units,
      });
      historyDependencies(s, units);
      if (s.factType === 'EDGE') {
        const e = f as CanonicalEdge;
        charge({ evidenceId: s.evidence.id, role: 'EDGE_SOURCE', id: e.source.id });
        requireCandidate(nodes.has(e.source.id), 'DANGLING_REFERENCE');
        if (e.target.state === 'RESOLVED') {
          charge({ evidenceId: s.evidence.id, role: 'EDGE_TARGET', id: e.target.target.id });
          requireCandidate(nodes.has(e.target.target.id), 'DANGLING_REFERENCE');
        } else
          for (const n of e.target.candidates) {
            charge({ evidenceId: s.evidence.id, role: 'EDGE_CANDIDATE', id: n.id });
            requireCandidate(nodes.has(n.id), 'DANGLING_REFERENCE');
          }
      }
    }
    const selectorInput = active.map((s, index) => ({
      ...s,
      inputPath: ['activeSupports', index],
    }));
    q(selectorInput);
    const selected = context
      ? selectMergedFactsWithBudget(selectorInput, context)
      : selectMergedFacts(selectorInput);
    q(active);
    const rows = [...active].sort((a, b) => historyCompare(a.evidence.id, b.evidence.id));
    const selectedRefs = [
      ...selected.nodes.map((n) => ({ factType: 'NODE' as const, id: String(n.id) })),
      ...selected.edges.map((e) => ({ factType: 'EDGE' as const, id: String(e.id) })),
    ].sort((a, b) => historyCompare(a.factType, b.factType) || historyCompare(a.id, b.id));
    q(selectedRefs);
    requireCandidate(isDeepStrictEqual(selectedRefs, actualRefs));
    requireCandidate(selected.explanations.length === selectedRefs.length);
    const explained = new Set<string>();
    for (const exp of selected.explanations) {
      const key = JSON.stringify([exp.fact.factType, exp.fact.id]);
      q(key);
      requireCandidate(!explained.has(key));
      explained.add(key);
      const group = rows.filter(
        (s) => s.factType === exp.fact.factType && s.canonical.id === exp.fact.id,
      );
      q(group);
      requireCandidate(group.some((s) => s.evidence.id === exp.selectedEvidenceId));
      const originalSummaries = group.map((s) => ({
        evidenceId: s.evidence.id,
        confidence: s.canonical.confidence,
        resolution: s.factType === 'EDGE' ? (s.canonical as CanonicalEdge).target.resolution : null,
      }));
      q(originalSummaries);
      requireCandidate(isDeepStrictEqual(exp.supports, originalSummaries));
    }
    const merged: MergedCanonicalAnalysis = {
      ...selected,
      evidence: rows.map((s) => s.evidence),
      factEvidence: rows.map((s) => s.factEvidence),
      bindings: rows.map((s) => s.binding),
    };
    charge(merged);
    const result: DeclaredDeltaSupportCandidate = {
      kind: 'DECLARED_DELTA_SUPPORT_CANDIDATE',
      mode: t.kind === 'NO_OP_DRAFT' ? 'NO_OP' : 'TRANSITION',
      targetSource: p.target.source,
      inventory: p.target.inventory,
      transition: t,
      activeSupports: active,
      dependencyUnits: units,
      merged,
      originSnapshotRegistry: registry,
      provenance: {
        kind: 'DECLARED_INPUT',
        historyDigest: t.historyDigest,
        ledgerDigest: t.ledgerDigest,
        observation: p.observation
          ? {
              requestIdentity: p.observation.requestIdentity,
              outputIdentity: p.observation.outputIdentity,
            }
          : null,
      },
    };
    charge(result);
    return freezeComposition(result);
  } catch (e) {
    if (context && e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new DeltaSupportCompositionError(e.code);
    if (e instanceof DeltaSupportCompositionError) throw e;
    if (e instanceof HistoryTransitionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new DeltaSupportCompositionError(e.code);
    if (
      e instanceof FactMergeError &&
      (e.code === 'FACT_CONFLICT' || e.code === 'DANGLING_REFERENCE')
    )
      throw new DeltaSupportCompositionError(e.code);
    throw new DeltaSupportCompositionError('INVALID_CANDIDATE');
  }
}
