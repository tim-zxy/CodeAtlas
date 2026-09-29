import {
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderFactBinding,
} from '@codeatlas/ir';

import { collectMergeSupports, type MergeInput } from './fact-merger-input.js';
import { selectMergedFacts, type MergeExplanation } from './fact-merger-selection.js';

export interface MergedCanonicalAnalysis {
  readonly nodes: readonly CanonicalNode[];
  readonly edges: readonly CanonicalEdge[];
  readonly evidence: readonly Evidence[];
  readonly factEvidence: readonly FactEvidence[];
  readonly bindings: readonly ProviderFactBinding[];
  readonly explanations: readonly MergeExplanation[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function mergeCanonicalObservations(input: MergeInput): MergedCanonicalAnalysis {
  const supports = collectMergeSupports(input);
  const selected = selectMergedFacts(supports);
  const ordered = [...supports].sort((a, b) => compare(a.evidence.id, b.evidence.id));
  return {
    ...selected,
    evidence: ordered.map((s) => s.evidence),
    factEvidence: ordered.map((s) => s.factEvidence),
    bindings: ordered.map((s) => s.binding),
  };
}
