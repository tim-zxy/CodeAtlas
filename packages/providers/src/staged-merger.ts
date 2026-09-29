import {
  ProviderSnapshotSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderFactBinding,
  type ProviderSnapshot,
} from '@codeatlas/ir';

import type { NormalizedEdgePair, NormalizedNodePair } from './canonical-normalizer.js';
import { collectMergeSupports, FactMergeError, type MergeSupport } from './fact-merger-input.js';
import { selectMergedGroup } from './fact-merger-selection.js';

export interface AnalysisMergeStage {
  readNormalizedNodes(): Iterable<NormalizedNodePair>;
  readNormalizedEdges(): Iterable<NormalizedEdgePair>;
  appendSupport(support: MergeSupport): void;
  readSupportGroups<T>(): Iterable<T[]>;
  appendMergedRow(
    row:
      | { readonly kind: 'NODE'; readonly value: CanonicalNode }
      | { readonly kind: 'EDGE'; readonly value: CanonicalEdge }
      | { readonly kind: 'EVIDENCE'; readonly value: Evidence }
      | { readonly kind: 'FACT_EVIDENCE'; readonly value: FactEvidence }
      | { readonly kind: 'BINDING'; readonly value: ProviderFactBinding },
  ): void;
  hasMergedNode(id: string): boolean;
}

/** Uses existing support construction and selection, with SQLite owning grouping. */
export function mergeStagedAnalysis(
  stage: AnalysisMergeStage,
  snapshotValue: ProviderSnapshot,
): void {
  const snapshot = ProviderSnapshotSchema.parse(snapshotValue);
  const context = { repositoryId: snapshot.repositoryId, revisionId: snapshot.requestedRevisionId };
  // Validate even a zero-fact run before it can be treated as an empty successful graph.
  collectMergeSupports({ ...context, observations: [{ snapshot, nodes: [], edges: [] }] });
  for (const pair of stage.readNormalizedNodes()) {
    const [support] = collectMergeSupports({
      ...context,
      observations: [{ snapshot, nodes: [pair], edges: [] }],
    });
    stage.appendSupport(support!);
  }
  for (const pair of stage.readNormalizedEdges()) {
    const [support] = collectMergeSupports({
      ...context,
      observations: [{ snapshot, nodes: [], edges: [pair] }],
    });
    stage.appendSupport(support!);
  }
  finalizeStagedSupports(stage);
}

/** Shared grouping/selection path also accepts independently staged Provider supports. */
export function finalizeStagedSupports(
  stage: Pick<AnalysisMergeStage, 'readSupportGroups' | 'appendMergedRow' | 'hasMergedNode'>,
): void {
  for (const group of stage.readSupportGroups<MergeSupport>()) {
    const { fact } = selectMergedGroup(group);
    const first = group[0]!;
    if (first.factType === 'NODE') {
      stage.appendMergedRow({ kind: 'NODE', value: fact as CanonicalNode });
    } else {
      const edge = fact as CanonicalEdge;
      if (!stage.hasMergedNode(edge.source.id)) {
        throw new FactMergeError('DANGLING_REFERENCE', [...first.inputPath, 'canonical', 'source']);
      }
      if (edge.target.state === 'RESOLVED' && !stage.hasMergedNode(edge.target.target.id)) {
        throw new FactMergeError('DANGLING_REFERENCE', [
          ...first.inputPath,
          'canonical',
          'target',
          'target',
        ]);
      }
      if (edge.target.state === 'UNRESOLVED') {
        edge.target.candidates.forEach((candidate, index) => {
          if (!stage.hasMergedNode(candidate.id)) {
            throw new FactMergeError('DANGLING_REFERENCE', [
              ...first.inputPath,
              'canonical',
              'target',
              'candidates',
              index,
            ]);
          }
        });
      }
      stage.appendMergedRow({ kind: 'EDGE', value: edge });
    }
    for (const support of group) {
      stage.appendMergedRow({ kind: 'EVIDENCE', value: support.evidence });
      stage.appendMergedRow({ kind: 'FACT_EVIDENCE', value: support.factEvidence });
      stage.appendMergedRow({ kind: 'BINDING', value: support.binding });
    }
  }
}
