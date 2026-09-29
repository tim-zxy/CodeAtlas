import type { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

import { applyFullAnalysis, parseFullAnalysisSnapshot } from '../../application/dist/index.js';
import {
  NativeAnalyzerDescriptorSchema,
  streamNativeAnalysis,
  mergeStagedAnalysis,
  normalizeStagedAnalysis,
  type NativeAnalyzerDescriptor,
  type NativeAnalyzeRequestV2,
  type NativeClientOptions,
  type NativeRequestEnvelope,
} from '../../providers/dist/index.js';
import { RepositoryAnalysisStage, RepositoryCanonicalFactStore } from '../../storage/dist/index.js';

type AnalyzeRequest = Extract<NativeRequestEnvelope, { type: 'ANALYZE' }> | NativeAnalyzeRequestV2;

export interface FullAnalysisMeasurement {
  readonly transportMs: number;
  readonly normalizeMs: number;
  readonly mergeMs: number;
  readonly dbApplyMs: number;
  readonly dbLockMs: number;
  readonly totalMs: number;
  readonly stageBytes: number;
}

/** One owned connection and one provisional stage for a complete Native ANALYZE. */
export async function applyNativeFullAnalysis(
  database: DatabaseSync,
  request: AnalyzeRequest,
  options: NativeClientOptions,
  descriptorValue: NativeAnalyzerDescriptor,
): Promise<FullAnalysisMeasurement> {
  const descriptor = NativeAnalyzerDescriptorSchema.parse(descriptorValue);
  if (
    !descriptor.protocolVersions.includes(request.protocolVersion) ||
    !descriptor.irSchemaVersions.includes(request.payload.irSchemaVersion)
  ) {
    throw new Error('Native descriptor does not support the requested protocol or IR');
  }
  const stage = new RepositoryAnalysisStage(database);
  const totalStarted = performance.now();
  let transportMs = 0;
  let normalizeMs = 0;
  let mergeMs = 0;
  let dbApplyMs = 0;
  let dbLockMs = 0;
  let stageBytes = 0;
  try {
    const factStore = new RepositoryCanonicalFactStore(database);
    await applyFullAnalysis(
      {
        repositoryId: request.payload.repository.id,
        revisionId: request.payload.revision.id,
        contentFingerprint: request.payload.revision.contentFingerprint,
      },
      {
        observeAndStage: async () => {
          const startedAt = new Date().toISOString();
          const transportStarted = performance.now();
          const { terminal } = await streamNativeAnalysis(request, options, stage);
          transportMs = performance.now() - transportStarted;
          const completedAt = new Date().toISOString();
          if (terminal.type !== 'ANALYSIS_COMPLETED') {
            throw new Error('Native analysis did not complete');
          }
          const snapshot = parseFullAnalysisSnapshot({
            id: request.payload.providerSnapshotId,
            repositoryId: request.payload.repository.id,
            providerId: descriptor.providerId,
            providerVersion: descriptor.providerVersion,
            runtimeVersion: descriptor.runtimeVersion,
            requestedRevisionId: request.payload.revision.id,
            requestedRevisionFingerprint: request.payload.revision.contentFingerprint,
            startedAt,
            completedAt,
            capabilities: terminal.payload.capabilities,
            diagnostics: [...stage.readDiagnostics()],
            outcome: terminal.payload.outcome,
          });
          if (terminal.payload.outcome === 'SUCCEEDED') {
            const normalizeStarted = performance.now();
            normalizeStagedAnalysis(stage, request);
            normalizeMs = performance.now() - normalizeStarted;
            const mergeStarted = performance.now();
            mergeStagedAnalysis(stage, snapshot);
            mergeMs = performance.now() - mergeStarted;
            stage.confirmSucceeded(terminal);
            stageBytes = stage.estimatedTempBytes();
          }
          return { outcome: terminal.payload.outcome, snapshot, stage };
        },
        factStore: {
          applyAnalysisBatch(candidate, expected) {
            const applyStarted = performance.now();
            dbLockMs = factStore.applyAnalysisBatch(candidate, expected);
            dbApplyMs = performance.now() - applyStarted;
          },
        },
      },
    );
    return {
      transportMs,
      normalizeMs,
      mergeMs,
      dbApplyMs,
      dbLockMs,
      totalMs: performance.now() - totalStarted,
      stageBytes,
    };
  } finally {
    stage.close();
  }
}
