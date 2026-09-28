import { isDeepStrictEqual } from 'node:util';

import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Confidence,
  type EvidenceId,
} from '@codeatlas/ir';

import { FactMergeError, type MergeSupport } from './fact-merger-input.js';

export interface MergeSupportSummary {
  readonly evidenceId: EvidenceId;
  readonly confidence: Confidence;
  readonly resolution: CanonicalEdge['target']['resolution'] | null;
}

export interface MergeExplanation {
  readonly fact: { readonly factType: 'NODE' | 'EDGE'; readonly id: CanonicalNode['id'] };
  readonly selectedEvidenceId: EvidenceId;
  readonly supports: readonly MergeSupportSummary[];
  readonly selectionRule:
    'SINGLE_SUPPORT' | 'RESOLUTION_PRIORITY' | 'SOURCE_BACKED' | 'STABLE_TIE_BREAK';
  readonly conflicts: readonly (
    'DISPLAY_VARIANT' | 'CANDIDATE_VARIANT' | 'RESOLUTION_VARIANT' | 'CONFIDENCE_VARIANT'
  )[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSupport(a: MergeSupport, b: MergeSupport): number {
  const left = a.binding.providerFact;
  const right = b.binding.providerFact;
  return (
    compare(left.providerId, right.providerId) ||
    compare(a.snapshotId, b.snapshotId) ||
    compare(left.providerFactId, right.providerFactId)
  );
}

function rank(s: MergeSupport): number {
  if (s.factType === 'NODE') return s.canonical.sourceRange === null ? 0 : 1;
  const edge = s.canonical as CanonicalEdge;
  return { EXACT: 5, HEURISTIC: 4, AMBIGUOUS: 3, UNRESOLVED: 2, UNSUPPORTED: 1 }[
    edge.target.resolution
  ];
}

function identityShape(s: MergeSupport): unknown {
  const fact = s.canonical;
  if (s.factType === 'NODE') {
    const node = fact as CanonicalNode;
    return {
      id: node.id,
      kind: node.kind,
      subkind:
        node.kind === 'TYPE' ? node.typeKind : node.kind === 'SYMBOL' ? node.symbolKind : null,
      qualifiedName: node.qualifiedName,
      sourceRange: node.kind === 'PACKAGE' ? null : node.sourceRange,
    };
  }
  const edge = fact as CanonicalEdge;
  return {
    id: edge.id,
    kind: edge.kind,
    source: edge.source,
    sourceRange: edge.sourceRange,
    state: edge.target.state,
    target: edge.target.state === 'RESOLVED' ? edge.target.target : edge.target.originalHint,
  };
}

function conflictCategories(
  group: readonly MergeSupport[],
  selected: MergeSupport,
): MergeExplanation['conflicts'] {
  const categories = new Set<MergeExplanation['conflicts'][number]>();
  for (const item of group) {
    if (!isDeepStrictEqual(item.canonical.confidence, selected.canonical.confidence))
      categories.add('CONFIDENCE_VARIANT');
    if (item.factType === 'NODE' && selected.factType === 'NODE') {
      const a = item.canonical as CanonicalNode;
      const b = selected.canonical as CanonicalNode;
      if (a.name !== b.name || !isDeepStrictEqual(a.sourceRange, b.sourceRange))
        categories.add('DISPLAY_VARIANT');
    } else if (item.factType === 'EDGE' && selected.factType === 'EDGE') {
      const a = (item.canonical as CanonicalEdge).target;
      const b = (selected.canonical as CanonicalEdge).target;
      if (a.resolution !== b.resolution) categories.add('RESOLUTION_VARIANT');
      if (
        a.state === 'UNRESOLVED' &&
        b.state === 'UNRESOLVED' &&
        !isDeepStrictEqual(a.candidates, b.candidates)
      )
        categories.add('CANDIDATE_VARIANT');
    }
  }
  return [...categories].sort();
}

export function selectMergedFacts(supports: readonly MergeSupport[]): {
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  explanations: MergeExplanation[];
} {
  const groups = new Map<string, MergeSupport[]>();
  const keysById = new Map<string, string>();
  for (const support of supports) {
    const fact = support.canonical;
    const key = JSON.stringify([
      fact.repositoryId,
      fact.revisionId,
      support.factType,
      fact.factKey,
    ]);
    const idKey = `${support.factType}:${fact.id}`;
    const existing = keysById.get(idKey);
    if (existing !== undefined && existing !== key)
      throw new FactMergeError('FACT_CONFLICT', [...support.inputPath, 'canonical', 'factKey']);
    keysById.set(idKey, key);
    const group = groups.get(key) ?? [];
    group.push(support);
    groups.set(key, group);
  }
  const nodes: CanonicalNode[] = [];
  const edges: CanonicalEdge[] = [];
  const explanations: MergeExplanation[] = [];
  const selectedPaths = new Map<string, readonly (string | number)[]>();
  for (const group of groups.values()) {
    const identity = identityShape(group[0]!);
    const conflict = group.find((s) => !isDeepStrictEqual(identityShape(s), identity));
    if (conflict) throw new FactMergeError('FACT_CONFLICT', [...conflict.inputPath, 'canonical']);
    const ordered = [...group].sort((a, b) => rank(b) - rank(a) || compareSupport(a, b));
    const selected = ordered[0]!;
    selectedPaths.set(selected.canonical.id, selected.inputPath);
    const min = Math.min(...group.map((s) => s.canonical.confidence.score));
    const confidence =
      group.length === 1
        ? selected.canonical.confidence
        : {
            score: min,
            method: 'fact-merger-min-v1',
            reasons: ['minimum active support score'],
          };
    const fact = { ...selected.canonical, confidence };
    if (selected.factType === 'NODE') nodes.push(CanonicalNodeSchema.parse(fact));
    else edges.push(CanonicalEdgeSchema.parse(fact));
    const byEvidence = [...group].sort((a, b) => compare(a.evidence.id, b.evidence.id));
    explanations.push({
      fact: { factType: selected.factType, id: selected.canonical.id },
      selectedEvidenceId: selected.evidence.id,
      supports: byEvidence.map((s) => ({
        evidenceId: s.evidence.id,
        confidence: s.canonical.confidence,
        resolution: s.factType === 'EDGE' ? (s.canonical as CanonicalEdge).target.resolution : null,
      })),
      selectionRule:
        group.length === 1
          ? 'SINGLE_SUPPORT'
          : rank(ordered[0]!) !== rank(ordered[1]!)
            ? selected.factType === 'NODE'
              ? 'SOURCE_BACKED'
              : 'RESOLUTION_PRIORITY'
            : 'STABLE_TIE_BREAK',
      conflicts: conflictCategories(group, selected),
    });
  }
  nodes.sort((a, b) => compare(a.factKey, b.factKey));
  edges.sort((a, b) => compare(a.factKey, b.factKey));
  explanations.sort((a, b) =>
    compare(`${a.fact.factType}:${a.fact.id}`, `${b.fact.factType}:${b.fact.id}`),
  );
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    const path = selectedPaths.get(edge.id) ?? [];
    if (!nodeIds.has(edge.source.id))
      throw new FactMergeError('DANGLING_REFERENCE', [...path, 'canonical', 'source']);
    if (edge.target.state === 'RESOLVED' && !nodeIds.has(edge.target.target.id))
      throw new FactMergeError('DANGLING_REFERENCE', [...path, 'canonical', 'target', 'target']);
    if (edge.target.state === 'UNRESOLVED') {
      for (const [candidateIndex, candidate] of edge.target.candidates.entries()) {
        if (!nodeIds.has(candidate.id))
          throw new FactMergeError('DANGLING_REFERENCE', [
            ...path,
            'canonical',
            'target',
            'candidates',
            candidateIndex,
          ]);
      }
    }
  }
  return { nodes, edges, explanations };
}
