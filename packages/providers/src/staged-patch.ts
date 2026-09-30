import { isDeepStrictEqual } from 'node:util';
import {
  ProviderSnapshotSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type ProviderEdge,
  type ProviderFactRef,
  type ProviderNode,
  type ProviderSnapshot,
  type SourceFile,
} from '@codeatlas/ir';

import { normalizeJavaEdge } from './canonical-normalizer.js';
import { collectMergeSupports, type MergeSupport } from './fact-merger-input.js';
import { CanonicalNormalizationError, normalizeJavaNode } from './java-node-normalizer.js';
import type { NativeRequestEnvelope } from './native-ipc.js';

export interface PatchNormalizationStage {
  assertContext(expected: {
    repositoryId: string;
    revisionId: string;
    contentFingerprint: string;
    snapshotId: string;
  }): void;
  readSourceFiles(): Iterable<SourceFile>;
  readUpsertNodes(): Iterable<ProviderNode>;
  readUpsertEdges(): Iterable<ProviderEdge>;
  readRemoveNodes(): Iterable<ProviderFactRef>;
  readRemoveEdges(): Iterable<ProviderFactRef>;
  getSourceFile(id: string): SourceFile | null;
  getChangedSourceFile(id: string): SourceFile | null;
  getSourceFileByPath(path: string): SourceFile | null;
  getNormalizedNode(id: string): { readonly canonical: CanonicalNode } | null;
  getRetainedCanonicalNode(providerId: string, providerFactId: string): CanonicalNode | null;
  putNormalizedNode(pair: {
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalNode;
  }): void;
  putNormalizedEdge(pair: {
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalEdge;
  }): void;
  appendSupport(support: MergeSupport): void;
}

/** Turns changed Provider facts into original per-support Canonical candidates. */
export function normalizeStagedPatch(
  stage: PatchNormalizationStage,
  request: NativeRequestEnvelope,
  snapshotValue: ProviderSnapshot,
): void {
  if (request.type !== 'REFRESH') {
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['request', 'type'],
      'Expected REFRESH',
    );
  }
  const snapshot = ProviderSnapshotSchema.parse(snapshotValue);
  const target = request.payload.targetRevision;
  if (
    snapshot.id !== request.payload.providerSnapshotId ||
    snapshot.repositoryId !== request.payload.repository.id ||
    snapshot.requestedRevisionId !== target.id ||
    snapshot.requestedRevisionFingerprint !== target.contentFingerprint ||
    snapshot.outcome !== 'SUCCEEDED'
  )
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['snapshot'],
      'Snapshot differs from REFRESH',
    );
  stage.assertContext({
    repositoryId: request.payload.repository.id,
    revisionId: target.id,
    contentFingerprint: target.contentFingerprint,
    snapshotId: snapshot.id,
  });
  const changed = [...request.payload.changes.added, ...request.payload.changes.modified];
  for (const file of changed) {
    if (!isDeepStrictEqual(stage.getChangedSourceFile(file.id), file)) {
      throw new CanonicalNormalizationError(
        'INVALID_CONTEXT',
        ['changes', file.id],
        'Changed source is absent or differs',
      );
    }
  }
  let stagedCount = 0;
  for (const _file of stage.readSourceFiles()) stagedCount++;
  if (stagedCount !== changed.length) {
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['changes'],
      'Unexpected changed source',
    );
  }
  for (const removal of [...stage.readRemoveNodes(), ...stage.readRemoveEdges()]) {
    if (removal.providerId !== snapshot.providerId) {
      throw new CanonicalNormalizationError('INVALID_CONTEXT', ['providerId'], 'Mixed Providers');
    }
  }
  const files = {
    get: (id: string) => stage.getSourceFile(id) ?? undefined,
    getByPath: (path: string) => stage.getSourceFileByPath(path) ?? undefined,
  };
  for (const node of stage.readUpsertNodes()) {
    if (node.providerId !== snapshot.providerId) {
      throw new CanonicalNormalizationError('INVALID_CONTEXT', ['providerId'], 'Mixed Providers');
    }
    const pair = {
      provider: {
        factType: 'NODE' as const,
        providerId: node.providerId,
        providerFactId: node.providerFactId,
      },
      canonical: normalizeJavaNode(node, files),
    };
    stage.putNormalizedNode(pair);
    const [support] = collectMergeSupports({
      repositoryId: snapshot.repositoryId,
      revisionId: target.id,
      observations: [{ snapshot, nodes: [pair], edges: [] }],
    });
    stage.appendSupport(support!);
  }
  const nodes = {
    get: (id: string) =>
      stage.getNormalizedNode(id)?.canonical ??
      stage.getRetainedCanonicalNode(snapshot.providerId, id) ??
      undefined,
  };
  for (const edge of stage.readUpsertEdges()) {
    if (edge.providerId !== snapshot.providerId) {
      throw new CanonicalNormalizationError('INVALID_CONTEXT', ['providerId'], 'Mixed Providers');
    }
    const pair = {
      provider: {
        factType: 'EDGE' as const,
        providerId: edge.providerId,
        providerFactId: edge.providerFactId,
      },
      canonical: normalizeJavaEdge(edge, nodes, files),
    };
    stage.putNormalizedEdge(pair);
    const [support] = collectMergeSupports({
      repositoryId: snapshot.repositoryId,
      revisionId: target.id,
      observations: [{ snapshot, nodes: [], edges: [pair] }],
    });
    stage.appendSupport(support!);
  }
}
