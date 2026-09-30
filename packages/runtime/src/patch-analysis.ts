import type { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

import { applyAnalysisPatch, parseFullAnalysisSnapshot } from '../../application/dist/index.js';
import {
  NativeAnalyzerDescriptorSchema,
  normalizeStagedPatch,
  selectMergedGroup,
  streamNativeRefresh,
  type NativeAnalyzerDescriptor,
  type NativeClientOptions,
  type NativeRequestEnvelope,
} from '../../providers/dist/index.js';
import { RepositoryCanonicalFactStore, RepositoryPatchStage } from '../../storage/dist/index.js';

type RefreshRequest = Extract<NativeRequestEnvelope, { type: 'REFRESH' }>;

export interface PatchAnalysisMeasurement {
  readonly transportMs: number;
  readonly normalizeMs: number;
  readonly dbApplyMs: number;
  readonly dbLockMs: number;
  readonly totalMs: number;
}

/** Owns the one provisional SQLite stage; only Application may request activation. */
export async function applyNativePatchAnalysis(
  database: DatabaseSync,
  request: RefreshRequest,
  options: NativeClientOptions,
  descriptorValue: NativeAnalyzerDescriptor,
): Promise<PatchAnalysisMeasurement> {
  const descriptor = NativeAnalyzerDescriptorSchema.parse(descriptorValue);
  if (
    !descriptor.protocolVersions.includes(request.protocolVersion) ||
    !descriptor.irSchemaVersions.includes(request.payload.irSchemaVersion)
  )
    throw new Error('Native descriptor does not support the requested protocol or IR');
  const stage = new RepositoryPatchStage(database, (group) => selectMergedGroup(group).fact);
  const started = performance.now();
  let transportMs = 0;
  let normalizeMs = 0;
  let dbApplyMs = 0;
  let dbLockMs = 0;
  try {
    const factStore = new RepositoryCanonicalFactStore(database);
    await applyAnalysisPatch(
      {
        repositoryId: request.payload.repository.id,
        baseRevisionId: request.payload.baseRevisionId,
        baseContentFingerprint: request.payload.baseRevisionFingerprint,
        targetRevisionId: request.payload.targetRevision.id,
        targetContentFingerprint: request.payload.targetRevision.contentFingerprint,
      },
      {
        observeAndStage: async () => {
          const startedAt = new Date().toISOString();
          const transportStarted = performance.now();
          const { terminal } = await streamNativeRefresh(request, options, {
            accept: async (event) => {
              if (event.type !== 'REFRESH_STARTED') await stage.accept(event);
            },
          });
          transportMs = performance.now() - transportStarted;
          if (terminal.type !== 'REFRESH_COMPLETED')
            throw new Error('Native refresh did not complete');
          const snapshot = parseFullAnalysisSnapshot({
            id: request.payload.providerSnapshotId,
            repositoryId: request.payload.repository.id,
            providerId: descriptor.providerId,
            providerVersion: descriptor.providerVersion,
            runtimeVersion: descriptor.runtimeVersion,
            requestedRevisionId: request.payload.targetRevision.id,
            requestedRevisionFingerprint: request.payload.targetRevision.contentFingerprint,
            startedAt,
            completedAt: new Date().toISOString(),
            capabilities: terminal.payload.capabilities,
            diagnostics: [...stage.readDiagnostics()],
            outcome: terminal.payload.outcome,
          });
          if (terminal.payload.outcome === 'SUCCEEDED') {
            stage.confirmSucceeded(terminal);
            const normalizeStarted = performance.now();
            normalizeStagedPatch(stage, request, snapshot);
            normalizeMs = performance.now() - normalizeStarted;
          }
          return { outcome: terminal.payload.outcome, snapshot, stage };
        },
        factStore: {
          applyAnalysisPatch(candidate, expected) {
            const applyStarted = performance.now();
            dbLockMs = factStore.applyAnalysisPatch(candidate, expected);
            dbApplyMs = performance.now() - applyStarted;
          },
        },
      },
    );
    return { transportMs, normalizeMs, dbApplyMs, dbLockMs, totalMs: performance.now() - started };
  } finally {
    stage.close();
  }
}
