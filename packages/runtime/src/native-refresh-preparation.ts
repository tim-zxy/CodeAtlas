import type { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import {
  NativeAnalyzerDescriptorSchema,
  NativeAnalysisStateBundleV1Schema,
  NativeRequestHeaderV3Schema,
  NativeClientError,
  NativeStateValidationError,
  JAVA_NORMALIZER_VERSION,
  validateNativeStateCandidate,
  validateNativeRequestRecordsV3,
  NATIVE_CLIENT_HARD_LIMITS,
  type NativeAnalyzerDescriptor,
  type NativeClientOptions,
  type NativeRefreshRequestV3,
} from '../../providers/dist/index.js';
import { boundedJson } from '../../providers/dist/native-request-json.js';
import {
  readNativeRefreshBaseline,
  AnalysisPatchError,
  type NativeStateExpectation,
  type NativeRefreshReadResult,
} from '../../storage/dist/index.js';
import { assertNativeRefreshTransportAdmission } from './native-metadata-admission.js';

export interface NativeRefreshInvocationV3 {
  readonly requestId: string;
  readonly descriptor: NativeAnalyzerDescriptor;
  readonly trustedContext: NativeStateExpectation;
  readonly payload: Omit<
    NativeRefreshRequestV3['payload'],
    'baseRevisionId' | 'baseRevisionFingerprint' | 'baselineState' | 'changes' | 'targetSourceFiles'
  >;
}

type SourceFile = NativeRefreshRequestV3['payload']['targetSourceFiles'][number];

function invalid(): never {
  throw new NativeClientError('INVALID_REQUEST', 'Native refresh preparation context differs');
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
function metadataLimits(memoryBudgetBytes: number, options: NativeClientOptions) {
  const maxSerializedBytes =
    options.limits?.maxStdinBytes ?? NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes;
  if (
    !Number.isSafeInteger(maxSerializedBytes) ||
    maxSerializedBytes <= 0 ||
    maxSerializedBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes
  )
    throw new NativeClientError(
      'INVALID_CONFIGURATION',
      'Native refresh metadata limit is invalid',
    );
  return { maxSerializedBytes, memoryBudgetBytes };
}
function snapshotContext(
  value: NativeRefreshInvocationV3,
  memoryBudgetBytes: number,
  maxBytes: number,
) {
  if (!Number.isSafeInteger(memoryBudgetBytes) || memoryBudgetBytes <= 0)
    throw new NativeClientError(
      'INVALID_CONFIGURATION',
      'Native refresh trusted budget must be positive and safe',
    );
  let serialized: string;
  try {
    serialized = boundedJson(value, maxBytes);
  } catch (error) {
    if (error instanceof Error && error.message === 'Native metadata resource limit exceeded')
      throw new NativeStateValidationError(
        'RESOURCE_LIMIT_EXCEEDED',
        'Native refresh preparation exceeds metadata limit',
      );
    invalid();
  }
  const owned = JSON.parse(serialized) as NativeRefreshInvocationV3;
  if (
    !owned ||
    typeof owned !== 'object' ||
    Object.keys(owned).some(
      (key) => !['requestId', 'descriptor', 'trustedContext', 'payload'].includes(key),
    ) ||
    !owned.payload ||
    !owned.trustedContext ||
    !Array.isArray(owned.trustedContext.requestedCapabilities)
  )
    invalid();
  const parsedDescriptor = NativeAnalyzerDescriptorSchema.safeParse(owned.descriptor);
  if (!parsedDescriptor.success) invalid();
  const descriptor = parsedDescriptor.data;
  const p = owned.payload;
  // Validate the shared execution fields before SQL reads. This is a schema-only
  // context adapter, never an ANALYZE observation or a full-analysis fallback.
  const { targetRevision, ...execution } = p;
  const checked = NativeRequestHeaderV3Schema.safeParse({
    protocolVersion: 3,
    requestId: owned.requestId,
    sequence: 0,
    type: 'ANALYZE',
    payload: { ...execution, revision: targetRevision, sourceFiles: [], baselineState: null },
  });
  if (!checked.success) invalid();
  if (targetRevision.kind !== 'WORKTREE') throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
  const expected = {
    ...p.analysisStateContext,
    repositoryId: p.repository.id,
    revisionId: p.targetRevision.id,
    contentFingerprint: p.targetRevision.contentFingerprint,
    requestedCapabilities: [...p.requestedCapabilities].sort(),
  };
  if (
    !isDeepStrictEqual(expected, {
      ...owned.trustedContext,
      requestedCapabilities: [...owned.trustedContext.requestedCapabilities].sort(),
    }) ||
    expected.normalizerVersion !== JAVA_NORMALIZER_VERSION ||
    expected.language.languageId !== 'java' ||
    descriptor.providerId !== expected.providerId ||
    descriptor.providerVersion !== expected.providerVersion ||
    !descriptor.languages.some((language) => isDeepStrictEqual(language, expected.language)) ||
    !descriptor.protocolVersions.includes(3) ||
    !descriptor.irSchemaVersions.includes(p.irSchemaVersion) ||
    p.requestedCapabilities.some((capability) => !descriptor.capabilities.includes(capability)) ||
    p.resourceBudget.maxMemoryBytes !== memoryBudgetBytes
  )
    invalid();
  return freeze({ ...owned, descriptor });
}

/** Pure owned preparation for admitted composition and explicitly offline calibration.
 * Not exported through Runtime's public index; no flag disables the guarded entry.
 */
export function createNativeRefreshPreparation(
  invocation: NativeRefreshInvocationV3,
  baseline: NativeRefreshReadResult,
  memoryBudgetBytes: number,
  options: NativeClientOptions,
) {
  const limits = metadataLimits(memoryBudgetBytes, options);
  const context = snapshotContext(invocation, memoryBudgetBytes, limits.maxSerializedBytes);
  if (baseline.status === 'UNAVAILABLE') {
    if (['MISSING', 'INCOMPATIBLE', 'NOT_APPLICABLE'].includes(baseline.reason))
      throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
    throw new NativeStateValidationError(
      baseline.reason === 'RESOURCE_LIMIT_EXCEEDED' ? baseline.reason : 'INVALID',
      'Native refresh baseline unavailable',
    );
  }
  const bundle = NativeAnalysisStateBundleV1Schema.parse({
    header: JSON.parse(baseline.state.headerJson),
    summaries: baseline.state.files.map((file) => JSON.parse(file.summaryJson)),
  });
  const target = baseline.targetSourceFiles;
  const prior = new Map(
    bundle.summaries.map((summary) => [summary.sourceFile.path, summary.sourceFile]),
  );
  const paths = new Set(target.map((file) => file.path));
  const added: SourceFile[] = [],
    modified: SourceFile[] = [];
  for (const file of target) {
    const old = prior.get(file.path);
    if (!old) added.push(file);
    else {
      if (old.id !== file.id) invalid();
      if (!isDeepStrictEqual(old, file)) modified.push(file);
    }
  }
  const deleted = bundle.summaries
    .filter((summary) => !paths.has(summary.sourceFile.path))
    .map(({ sourceFile: file }) => ({
      id: file.id,
      path: file.path,
      previousContentFingerprint: file.contentFingerprint,
    }));
  const parsedRequest = NativeRequestHeaderV3Schema.safeParse({
    protocolVersion: 3,
    sequence: 0,
    requestId: context.requestId,
    type: 'REFRESH',
    payload: {
      ...context.payload,
      baseRevisionId: bundle.header.revisionId,
      baseRevisionFingerprint: bundle.header.contentFingerprint,
      baselineState: bundle.header,
      targetSourceFiles: target,
      changes: { added, modified, deleted },
    },
  });
  if (!parsedRequest.success) invalid();
  const request = parsedRequest.data;
  if (
    request.type !== 'REFRESH' ||
    request.payload.baseRevisionId !== request.payload.targetRevision.id ||
    request.payload.targetRevision.kind !== 'WORKTREE'
  )
    throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
  // Packet A checks the exact baseline-to-target delta. D2 owns raw checksum proof.
  validateNativeRequestRecordsV3([
    request,
    ...bundle.summaries.map((payload, i) => ({
      protocolVersion: 3 as const,
      requestId: request.requestId,
      sequence: i + 1,
      type: 'BASELINE_SUMMARY' as const,
      payload,
    })),
    {
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: bundle.summaries.length + 1,
      type: 'REQUEST_COMPLETED',
      payload: { summaryRecords: bundle.summaries.length, integrityChecksum: '0'.repeat(64) },
    },
  ]);
  return freeze({
    request,
    baseline: bundle,
    token: baseline.token,
    targetSourceFiles: structuredClone(target),
    descriptor: context.descriptor,
    trustedContext: context.trustedContext,
    limits,
  });
}

export function prepareNativeRefreshAnalysisV3(
  database: DatabaseSync,
  memoryBudgetBytes: number,
  openContext: () => NativeRefreshInvocationV3,
  options: NativeClientOptions,
) {
  assertNativeRefreshTransportAdmission(memoryBudgetBytes);
  const limits = metadataLimits(memoryBudgetBytes, options);
  const context = snapshotContext(openContext(), memoryBudgetBytes, limits.maxSerializedBytes);
  const baseline = readNativeRefreshBaseline(
    database,
    context.trustedContext,
    validateNativeStateCandidate,
    limits,
  );
  return createNativeRefreshPreparation(context, baseline, memoryBudgetBytes, options);
}
