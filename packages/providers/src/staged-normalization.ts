import { isDeepStrictEqual } from 'node:util';
import type {
  CanonicalEdge,
  CanonicalNode,
  ProviderEdge,
  ProviderFactId,
  ProviderNode,
  SourceFile,
} from '@codeatlas/ir';

import { normalizeJavaEdge } from './canonical-normalizer.js';
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
  putNormalizedNode(pair: {
    readonly provider: {
      readonly factType: 'NODE';
      readonly providerId: string;
      readonly providerFactId: string;
    };
    readonly canonical: CanonicalNode;
  }): void;
  putNormalizedEdge(pair: {
    readonly provider: {
      readonly factType: 'EDGE';
      readonly providerId: string;
      readonly providerFactId: string;
    };
    readonly canonical: CanonicalEdge;
  }): void;
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
  const declared = new Map<string, SourceFile>(
    request.payload.sourceFiles.map((file) => [file.id, file]),
  );
  for (const file of stage.readSourceFiles()) {
    if (!isDeepStrictEqual(file, declared.get(file.id))) {
      throw new CanonicalNormalizationError(
        'INVALID_CONTEXT',
        ['sourceFiles', file.id],
        'Source file differs from request',
      );
    }
  }
  const files = {
    get: (id: string) => stage.getSourceFile(id) ?? declared.get(id),
    getByPath: (path: string) =>
      stage.getSourceFileByPath(path) ??
      request.payload.sourceFiles.find((file) => file.path === path),
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
