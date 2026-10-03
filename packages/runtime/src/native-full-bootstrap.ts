import type { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { applyFullAnalysis, parseFullAnalysisSnapshot } from '../../application/dist/index.js';
import {
  preflightNativeFullAnalysisV3,
  NativeAnalyzerDescriptorSchema,
  JAVA_NORMALIZER_VERSION,
  streamNativeFullAnalysisV3,
  normalizeStagedAnalysis,
  mergeStagedAnalysis,
  type NativeFullAnalyzeRequestV3,
  type NativeClientOptions,
  type NativeAnalyzerDescriptor,
} from '../../providers/dist/index.js';
import {
  RepositoryAnalysisStage,
  RepositoryCanonicalFactStore,
  captureNativeActivationToken,
  readNativeAnalysisState,
  type NativeStateExpectation,
  type NativeStateLimits,
  type NativeBaselineResult,
} from '../../storage/dist/index.js';
import { assertNativeMetadataAdmission } from './native-metadata-admission.js';
import { createNativeStateValidationPort } from './native-analysis-validation.js';
import type { FullAnalysisMeasurement } from './full-analysis.js';

export function readNativeFullBaseline(
  database: DatabaseSync,
  expected: NativeStateExpectation,
  limits: NativeStateLimits,
): NativeBaselineResult {
  return readNativeAnalysisState(database, expected, createNativeStateValidationPort(), limits);
}

/** Explicit full-only composition. Reads never initiate this publication path. */
export async function applyNativeFullBootstrap(
  database: DatabaseSync,
  requestValue: NativeFullAnalyzeRequestV3,
  options: NativeClientOptions,
  descriptorValue: NativeAnalyzerDescriptor,
  trustedContext: NativeStateExpectation,
): Promise<FullAnalysisMeasurement> {
  // Before request parsing/copying, serialization, stage allocation or spawn.
  assertNativeMetadataAdmission(
    requestValue.payload.resourceBudget.maxMemoryBytes,
    'FULL_TRANSPORT',
  );
  const request = preflightNativeFullAnalysisV3(requestValue, options);
  if (request.type !== 'ANALYZE') throw new Error('Expected full v3 ANALYZE');
  const descriptor = NativeAnalyzerDescriptorSchema.parse(descriptorValue);
  const p = request.payload;
  const expected = {
    ...p.analysisStateContext,
    repositoryId: p.repository.id,
    revisionId: p.revision.id,
    contentFingerprint: p.revision.contentFingerprint,
    requestedCapabilities: p.requestedCapabilities,
  };
  const ordered = (value: NativeStateExpectation) => ({
    ...value,
    requestedCapabilities: [...value.requestedCapabilities].sort(),
  });
  if (
    !isDeepStrictEqual(ordered(expected), ordered(trustedContext)) ||
    expected.normalizerVersion !== JAVA_NORMALIZER_VERSION ||
    descriptor.providerId !== expected.providerId ||
    descriptor.providerVersion !== expected.providerVersion ||
    !descriptor.languages.some((language) => isDeepStrictEqual(language, expected.language)) ||
    !descriptor.protocolVersions.includes(3) ||
    !descriptor.irSchemaVersions.includes(p.irSchemaVersion)
  )
    throw new Error('Native full trusted context or descriptor differs');
  if ((database.prepare('PRAGMA user_version').get()?.user_version as number) < 10)
    throw new Error('Native bootstrap requires R010');
  const checkSources = () => {
    const revision = database
      .prepare('SELECT content_fingerprint FROM revisions WHERE repository_id=? AND id=?')
      .get(expected.repositoryId, expected.revisionId);
    if (revision?.content_fingerprint !== expected.contentFingerprint)
      throw new Error('Native target revision changed');
    const count = database
      .prepare('SELECT count(*) AS n FROM source_files WHERE repository_id=? AND revision_id=?')
      .get(expected.repositoryId, expected.revisionId)?.n;
    if (count !== p.sourceFiles.length) throw new Error('Native target inventory differs');
    const read = database.prepare(
      'SELECT * FROM source_files WHERE repository_id=? AND revision_id=? AND id=?',
    );
    for (const file of p.sourceFiles) {
      const row = read.get(expected.repositoryId, expected.revisionId, file.id);
      if (
        !row ||
        row.path !== file.path ||
        row.content_fingerprint !== file.contentFingerprint ||
        row.role !== file.classification.role ||
        row.provenance !== file.classification.provenance ||
        row.content_kind !== file.classification.contentKind ||
        row.language_hint !== file.languageHint ||
        row.sensitivity !== file.sensitivity
      )
        throw new Error('Native target source differs');
    }
  };
  checkSources();
  const baseline = captureNativeActivationToken(database, expected.repositoryId);
  const limits = {
    maxSerializedBytes: Math.min(1_000_000, options.limits?.maxStdinBytes ?? 1_000_000),
    memoryBudgetBytes: p.resourceBudget.maxMemoryBytes,
  };
  const store = new RepositoryCanonicalFactStore(database);
  const stage = new RepositoryAnalysisStage(database, limits);
  const totalStarted = performance.now();
  let transportMs = 0,
    normalizeMs = 0,
    mergeMs = 0,
    dbApplyMs = 0,
    dbLockMs = 0,
    stageBytes = 0;
  try {
    await applyFullAnalysis(
      {
        repositoryId: expected.repositoryId,
        revisionId: expected.revisionId,
        contentFingerprint: expected.contentFingerprint,
      },
      {
        observeAndStage: async () => {
          const startedAt = new Date().toISOString();
          const transportStart = performance.now();
          const { terminal } = await streamNativeFullAnalysisV3(request, options, {
            async accept(event) {
              if (event.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(event.payload);
              else await stage.accept(event);
            },
          });
          transportMs = performance.now() - transportStart;
          if (terminal.type !== 'ANALYSIS_COMPLETED')
            throw new Error('Native full analysis did not complete');
          const snapshot = parseFullAnalysisSnapshot({
            id: p.providerSnapshotId,
            repositoryId: expected.repositoryId,
            providerId: descriptor.providerId,
            providerVersion: descriptor.providerVersion,
            runtimeVersion: descriptor.runtimeVersion,
            requestedRevisionId: expected.revisionId,
            requestedRevisionFingerprint: expected.contentFingerprint,
            startedAt,
            completedAt: new Date().toISOString(),
            capabilities: terminal.payload.capabilities,
            diagnostics: [...stage.readDiagnostics()],
            outcome: terminal.payload.outcome,
          });
          if (snapshot.outcome === 'SUCCEEDED') {
            stage.confirmSucceeded(terminal);
            // Normalizer's legacy envelope is an internal context adapter only;
            // full-v3 stream validation and mandatory seal remain authoritative.
            const { analysisStateContext: _context, baselineState: _state, ...payload } = p;
            const normalizerRequest = {
              protocolVersion: 2 as const,
              requestId: request.requestId,
              type: 'ANALYZE' as const,
              payload,
            };
            const normalizeStart = performance.now();
            normalizeStagedAnalysis(stage, normalizerRequest);
            normalizeMs = performance.now() - normalizeStart;
            const mergeStart = performance.now();
            mergeStagedAnalysis(stage, snapshot);
            mergeMs = performance.now() - mergeStart;
            stage.sealNativeState(
              JSON.stringify(terminal.payload.analysisState),
              expected,
              createNativeStateValidationPort(),
              limits,
            );
            stageBytes = stage.estimatedTempBytes();
          }
          return { outcome: snapshot.outcome as 'SUCCEEDED' | 'PARTIAL', snapshot, stage };
        },
        factStore: {
          applyAnalysisBatch(candidate, expectedAnalysis) {
            checkSources();
            const applyStart = performance.now();
            dbLockMs = store.applyNativeAnalysisBatch(candidate, expectedAnalysis, baseline);
            dbApplyMs = performance.now() - applyStart;
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
      stageBytes,
      totalMs: performance.now() - totalStarted,
    };
  } finally {
    stage.close();
  }
}
