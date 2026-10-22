import { isDeepStrictEqual } from 'node:util';
import {
  ProviderSnapshotSchema,
  SourceFileSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type ProviderEdge,
  type ProviderFactRef,
  type ProviderNode,
  type ProviderSnapshot,
  type SourceFile,
} from '@codeatlas/ir';
import { z } from 'zod';

import { normalizeJavaEdge } from './canonical-normalizer.js';
import { collectMergeSupports, type MergeSupport } from './fact-merger-input.js';
import { CanonicalNormalizationError, normalizeJavaNode } from './java-node-normalizer.js';
import type { NativeRequestEnvelope } from './native-ipc.js';
import { boundedJson } from './native-request-json.js';

const PatchContextSchema = z
  .object({
    repositoryId: z.string().min(1),
    revisionId: z.string().min(1),
    contentFingerprint: z.string().min(1),
    snapshotId: z.string().min(1),
    changedSourceFiles: z.array(SourceFileSchema).max(10_000),
  })
  .strict();

/** Internal normalization context, not an IPC envelope or package-index API. */
export type NativePatchNormalizationContext = z.infer<typeof PatchContextSchema>;

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
  const target = request.payload.targetRevision;
  normalizePatchContext(
    stage,
    {
      repositoryId: request.payload.repository.id,
      revisionId: target.id,
      contentFingerprint: target.contentFingerprint,
      snapshotId: request.payload.providerSnapshotId,
      changedSourceFiles: [...request.payload.changes.added, ...request.payload.changes.modified],
    },
    snapshotValue,
  );
}

/** Reuses the legacy normalization core without casting a v3 request to v1.
 * Owned bounded context comes from trusted Runtime preparation; complete wire,
 * ledger and ACTIVE support validation still precede any applicable seal.
 */
export function normalizeNativeStagedPatch(
  stage: PatchNormalizationStage,
  contextValue: NativePatchNormalizationContext,
  snapshotValue: ProviderSnapshot,
): void {
  const owned = JSON.parse(
    boundedJson({ context: contextValue, snapshot: snapshotValue }, 1_000_000),
  );
  const context = PatchContextSchema.safeParse(owned.context);
  if (!context.success)
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['context'],
      'Invalid Native patch context',
    );
  normalizePatchContext(stage, context.data, owned.snapshot, true);
}

function normalizePatchContext(
  stage: PatchNormalizationStage,
  context: NativePatchNormalizationContext,
  snapshotValue: ProviderSnapshot,
  reuseOwnedSources = false,
): void {
  const snapshot = ProviderSnapshotSchema.parse(snapshotValue);
  if (
    snapshot.id !== context.snapshotId ||
    snapshot.repositoryId !== context.repositoryId ||
    snapshot.requestedRevisionId !== context.revisionId ||
    snapshot.requestedRevisionFingerprint !== context.contentFingerprint ||
    snapshot.outcome !== 'SUCCEEDED'
  )
    throw new CanonicalNormalizationError(
      'INVALID_CONTEXT',
      ['snapshot'],
      'Snapshot differs from REFRESH',
    );
  stage.assertContext({
    repositoryId: context.repositoryId,
    revisionId: context.revisionId,
    contentFingerprint: context.contentFingerprint,
    snapshotId: snapshot.id,
  });
  const changed = context.changedSourceFiles;
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
    // Native context is already bounded, detached and checked against Stage.
    // Reuse those objects, not a cache of SQL preflight results or raw TEXT.
    get: (id: string) =>
      (reuseOwnedSources ? changed.find((file) => file.id === id) : undefined) ??
      stage.getSourceFile(id) ??
      undefined,
    getByPath: (path: string) =>
      (reuseOwnedSources ? changed.find((file) => file.path === path) : undefined) ??
      stage.getSourceFileByPath(path) ??
      undefined,
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
      revisionId: context.revisionId,
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
      revisionId: context.revisionId,
      observations: [{ snapshot, nodes: [], edges: [pair] }],
    });
    stage.appendSupport(support!);
  }
}
