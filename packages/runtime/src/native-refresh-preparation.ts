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
  assertNativeStringBudget,
  AnalysisPatchError,
  type NativeStateLimits,
  type NativeStateExpectation,
  type NativeRefreshReadResult,
} from '../../storage/dist/index.js';
import { assertNativeRefreshTransportAdmission } from './native-metadata-admission.js';
import {
  nativeSqlSourceRole,
  nativeSqlSourceDomainFor,
  bindNativeSqlSourceDomain,
  beginNativeSqlSourceDomain,
  replaceNativeSqlSourceDomain,
  transferNativeSqlSourceDomain,
  endNativeSqlSourceDomain,
  proveNativeSqlDisposition,
} from '../../storage/dist/analysis/native-apply-sql-observation.js';

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
function metadataLimits(
  memoryBudgetBytes: number,
  options: NativeClientOptions,
  workspaceReservationBytes = 0,
): NativeStateLimits {
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
  return { maxSerializedBytes, memoryBudgetBytes, workspaceReservationBytes };
}

/** Private shared mapping for preparation and the common kernel, not admission. */
export function assertNativeRefreshSqlBudget(bytes: number, limits: NativeStateLimits): void {
  try {
    assertNativeStringBudget(bytes, limits);
  } catch (error) {
    if (error instanceof Error && error.message === 'Native metadata resource limit exceeded')
      throw new NativeStateValidationError(
        'RESOURCE_LIMIT_EXCEEDED',
        'Native refresh retained SQL exceeds memory budget',
      );
    throw error;
  }
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
  workspaceReservationBytes = 0,
) {
  const role = nativeSqlSourceRole();
  let handle = nativeSqlSourceDomainFor(baseline);
  let handedOff = false;
  try {
    // Parameter handoff retains the selected baseline even if context validation fails.
    if (handle !== null && role !== null)
      transferNativeSqlSourceDomain(handle, 'PREPARATION', role);
    const prepared = createNativeRefreshPreparationOwned(
      invocation,
      baseline,
      memoryBudgetBytes,
      options,
      workspaceReservationBytes,
      (bytes) => {
        if (role === null) return;
        if (handle === null) handle = beginNativeSqlSourceDomain('PREPARATION', role, bytes);
        else replaceNativeSqlSourceDomain(handle, bytes);
      },
    );
    bindNativeSqlSourceDomain(prepared, handle);
    handedOff = true;
    return prepared;
  } finally {
    if (!handedOff && handle !== null) endNativeSqlSourceDomain(handle);
  }
}

function createNativeRefreshPreparationOwned(
  invocation: NativeRefreshInvocationV3,
  baseline: NativeRefreshReadResult,
  memoryBudgetBytes: number,
  options: NativeClientOptions,
  workspaceReservationBytes = 0,
  onSourceCensus?: (bytes: number) => void,
) {
  const limits = metadataLimits(memoryBudgetBytes, options, workspaceReservationBytes);
  const context = snapshotContext(invocation, memoryBudgetBytes, limits.maxSerializedBytes);
  if (baseline.status === 'UNAVAILABLE') {
    const role = nativeSqlSourceRole();
    if (role !== null)
      proveNativeSqlDisposition(
        'PREPARATION',
        role,
        'PROVEN_NO_TEXT',
        'Unavailable baseline has no SQL TEXT carrier; preparation refuses before source acquisition',
      );
    if (['MISSING', 'INCOMPATIBLE', 'NOT_APPLICABLE'].includes(baseline.reason))
      throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
    throw new NativeStateValidationError(
      baseline.reason === 'RESOURCE_LIMIT_EXCEEDED' ? baseline.reason : 'INVALID',
      'Native refresh baseline unavailable',
    );
  }
  // Only original SQL-derived fields retained through seal. Parsed bundle and
  // request copies are workspace allocations, not repeated SQL representation
  // charges. Stage separately owns/charges its detached Native context copy.
  let retainedSqlBytes = 0;
  const charge = (...values: (string | null | undefined)[]) => {
    for (const value of values) if (value != null) retainedSqlBytes += Buffer.byteLength(value);
  };
  charge(baseline.state.headerJson, baseline.state.summaryDigest);
  for (const file of baseline.state.files)
    charge(file.sourceFileId, file.sourcePath, file.contentFingerprint, file.summaryJson);
  for (const file of baseline.targetSourceFiles)
    charge(
      file.id,
      file.repositoryId,
      file.revisionId,
      file.path,
      file.contentFingerprint,
      file.classification.role,
      file.classification.provenance,
      file.classification.contentKind,
      file.languageHint,
      file.sensitivity,
    );
  charge(baseline.token.indexedRevisionId, baseline.token.indexedContentFingerprint);
  for (const state of baseline.token.states)
    charge(state.providerId, state.snapshotId, state.summaryDigest);
  onSourceCensus?.(retainedSqlBytes);
  assertNativeRefreshSqlBudget(retainedSqlBytes, limits);
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
    baselineState: baseline.state,
    token: baseline.token,
    targetSourceFiles: structuredClone(target),
    descriptor: context.descriptor,
    trustedContext: context.trustedContext,
    retainedSqlBytes,
    limits,
  });
}

export function prepareNativeRefreshAnalysisV3(
  database: DatabaseSync,
  memoryBudgetBytes: number,
  openContext: () => NativeRefreshInvocationV3,
  options: NativeClientOptions,
) {
  const reservation = assertNativeRefreshTransportAdmission(memoryBudgetBytes);
  const limits = metadataLimits(memoryBudgetBytes, options, reservation);
  const context = snapshotContext(openContext(), memoryBudgetBytes, limits.maxSerializedBytes);
  const baseline = readNativeRefreshBaseline(
    database,
    context.trustedContext,
    validateNativeStateCandidate,
    limits,
  );
  return createNativeRefreshPreparation(context, baseline, memoryBudgetBytes, options, reservation);
}
