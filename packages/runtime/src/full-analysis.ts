import type { DatabaseSync } from 'node:sqlite';

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

/** One owned connection and one provisional stage for a complete Native ANALYZE. */
export async function applyNativeFullAnalysis(
  database: DatabaseSync,
  request: AnalyzeRequest,
  options: NativeClientOptions,
  descriptorValue: NativeAnalyzerDescriptor,
): Promise<void> {
  const descriptor = NativeAnalyzerDescriptorSchema.parse(descriptorValue);
  if (
    !descriptor.protocolVersions.includes(request.protocolVersion) ||
    !descriptor.irSchemaVersions.includes(request.payload.irSchemaVersion)
  ) {
    throw new Error('Native descriptor does not support the requested protocol or IR');
  }
  const stage = new RepositoryAnalysisStage(database);
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
          const { terminal } = await streamNativeAnalysis(request, options, stage);
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
            normalizeStagedAnalysis(stage, request);
            mergeStagedAnalysis(stage, snapshot);
            stage.confirmSucceeded(terminal);
          }
          return { outcome: terminal.payload.outcome, snapshot, stage };
        },
        factStore,
      },
    );
  } finally {
    stage.close();
  }
}
