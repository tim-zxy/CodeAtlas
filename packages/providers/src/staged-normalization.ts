import { isDeepStrictEqual } from 'node:util';
import type {
  CanonicalEdge,
  CanonicalNode,
  ProviderEdge,
  ProviderFactId,
  ProviderNode,
  SourceFile,
} from '@codeatlas/ir';

import {
  normalizeJavaEdge,
  type NormalizedEdgePair,
  type NormalizedNodePair,
} from './canonical-normalizer.js';
import { CanonicalNormalizationError, normalizeJavaNode } from './java-node-normalizer.js';
import type { NativeRequestEnvelope } from './native-ipc.js';
import type { NativeAnalyzeRequestV2 } from './native-ipc-v2.js';

export interface AnalysisNormalizationStage {
  readSourceFiles(): Iterable<SourceFile>;
  readProviderNodes(): Iterable<ProviderNode>;
  readProviderEdges(): Iterable<ProviderEdge>;
  getSourceFile(id: string): SourceFile | null;
  getSourceFileByPath(path: string): SourceFile | null;
  getNormalizedNode(id: string): { readonly canonical: CanonicalNode } | null;
  putNormalizedNode(pair: NormalizedNodePair): void;
  putNormalizedEdge(pair: NormalizedEdgePair): void;
}

/** Normalizes one staged row at a time; the stage owns indexed cross-row lookups. */
export function normalizeStagedAnalysis(
  stage: AnalysisNormalizationStage,
  request: NativeRequestEnvelope | NativeAnalyzeRequestV2,
): void {
  if (request.type !== 'ANALYZE') {
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['request', 'type'],
      'Expected ANALYZE',
    );
  }
  for (const file of request.payload.sourceFiles) {
    if (!isDeepStrictEqual(stage.getSourceFile(file.id), file)) {
      throw new CanonicalNormalizationError(
        'INVALID_CONTEXT',
        ['sourceFiles', file.id],
        'Source file is absent or differs from request',
      );
    }
  }
  let stagedFileCount = 0;
  for (const _file of stage.readSourceFiles()) stagedFileCount++;
  if (stagedFileCount !== request.payload.sourceFiles.length) {
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['sourceFiles'],
      'Staged source file count differs from request',
    );
  }
  const files = {
    get: (id: string) => stage.getSourceFile(id) ?? undefined,
    getByPath: (path: string) => stage.getSourceFileByPath(path) ?? undefined,
  };
  let providerId: string | undefined;
  for (const node of stage.readProviderNodes()) {
    if (providerId !== undefined && providerId !== node.providerId) {
      throw new CanonicalNormalizationError('INVALID_CONTEXT', ['providerId'], 'Mixed Providers');
    }
    providerId = node.providerId;
    const canonical = normalizeJavaNode(node, files);
    stage.putNormalizedNode({
      provider: {
        factType: 'NODE',
        providerId: node.providerId,
        providerFactId: node.providerFactId,
      },
      canonical,
    });
  }
  const nodes = {
    get: (id: ProviderFactId) => stage.getNormalizedNode(id)?.canonical,
  };
  for (const edge of stage.readProviderEdges()) {
    if (providerId !== undefined && providerId !== edge.providerId) {
      throw new CanonicalNormalizationError('INVALID_CONTEXT', ['providerId'], 'Mixed Providers');
    }
    providerId = edge.providerId;
    const canonical = normalizeJavaEdge(edge, nodes, files);
    stage.putNormalizedEdge({
      provider: {
        factType: 'EDGE',
        providerId: edge.providerId,
        providerFactId: edge.providerFactId,
      },
      canonical,
    });
  }
}
