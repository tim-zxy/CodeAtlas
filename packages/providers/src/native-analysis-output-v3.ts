import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  ProviderNodeSchema,
  ProviderEdgeSchema,
  SourceFileSchema,
  ProviderSnapshotDiagnosticSchema,
} from '@codeatlas/ir';
import { z } from 'zod';
import {
  AnalyzeCompletedPayloadSchema,
  StreamContextSchema,
  FailedPayloadSchema,
  RequestFailedPayloadSchema,
} from './native-ipc.js';
import { NativeCapabilityCoverageV2Schema } from './native-ipc-v2.js';
import { NativeRequestHeaderV3Schema, type NativeRequestHeaderV3 } from './native-ipc-v3.js';
import {
  NativeFileAnalysisSummaryV1Schema,
  NativeAnalysisStateHeaderV1Schema,
} from './native-analysis-state.js';
import {
  NativeClientError,
  NATIVE_CLIENT_HARD_LIMITS,
  type NativeClientLimits,
} from './native-client.js';

export type NativeFullAnalyzeRequestV3 = Extract<NativeRequestHeaderV3, { type: 'ANALYZE' }>;
const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((n) => !Object.is(n, -0));
const base = {
  protocolVersion: z.literal(3),
  requestId: z
    .string()
    .min(1)
    .max(128)
    .refine((s) => s === s.trim()),
  sequence: integer,
};
function event<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({ ...base, type: z.literal(type), payload });
}
export const NativeFullAnalysisEventV3Schema = z
  .discriminatedUnion('type', [
    event('ANALYSIS_STARTED', StreamContextSchema),
    event('SOURCE_FILE', SourceFileSchema),
    event('NODE', ProviderNodeSchema),
    event('EDGE', ProviderEdgeSchema),
    event('COVERAGE', NativeCapabilityCoverageV2Schema),
    event('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema),
    event('ANALYSIS_SUMMARY', NativeFileAnalysisSummaryV1Schema),
    event(
      'ANALYSIS_COMPLETED',
      AnalyzeCompletedPayloadSchema.extend({
        analysisState: NativeAnalysisStateHeaderV1Schema,
        summaryRecords: integer,
      }),
    ),
    event('ANALYSIS_FAILED', FailedPayloadSchema),
    event('REQUEST_FAILED', RequestFailedPayloadSchema),
  ])
  .refine(scalarsValid);
export type NativeFullAnalysisEventV3 = z.infer<typeof NativeFullAnalysisEventV3Schema>;
export type NativeFullAnalysisTerminalV3 = Extract<
  NativeFullAnalysisEventV3,
  { type: 'ANALYSIS_COMPLETED' | 'ANALYSIS_FAILED' | 'REQUEST_FAILED' }
>;

function scalarsValid(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length) {
    const v = pending.pop();
    if (typeof v === 'string' && !v.isWellFormed()) return false;
    if (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))) return false;
    if (v !== null && typeof v === 'object')
      for (const [key, item] of Object.entries(v)) {
        if (!key.isWellFormed()) return false;
        pending.push(item);
      }
  }
  return true;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

/** Delivers provisional events only. A completed terminal proves framing, not
 * applicability: callers must seal actual staged facts through the mandatory
 * NativeStateValidationPort before any publication. No graph buffer is kept here. */
export async function decodeNativeFullAnalysisV3(
  request: NativeFullAnalyzeRequestV3,
  lines: AsyncIterable<Uint8Array>,
  sink: { accept(event: NativeFullAnalysisEventV3): Promise<void> },
  limits: NativeClientLimits,
): Promise<{ terminal: NativeFullAnalysisTerminalV3 }> {
  const fail = (
    code: ConstructorParameters<typeof NativeClientError>[0],
    message: string,
  ): never => {
    throw new NativeClientError(code, message, { requestId: request.requestId });
  };
  for (const key of Object.keys(NATIVE_CLIENT_HARD_LIMITS) as (keyof NativeClientLimits)[])
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] <= 0 ||
      limits[key] > NATIVE_CLIENT_HARD_LIMITS[key]
    )
      fail('INVALID_CONFIGURATION', 'Native v3 limits must lower existing ceilings');
  const parsedRequest = NativeRequestHeaderV3Schema.safeParse(request);
  if (!parsedRequest.success || parsedRequest.data.type !== 'ANALYZE')
    fail('INVALID_REQUEST', 'Expected full v3 ANALYZE');
  if (!sink || typeof sink.accept !== 'function')
    fail('INVALID_CONFIGURATION', 'Native v3 sink is required');
  const p = request.payload;
  const context = {
    providerSnapshotId: p.providerSnapshotId,
    repositoryId: p.repository.id,
    revisionId: p.revision.id,
    revisionFingerprint: p.revision.contentFingerprint,
  };
  const sources = new Map(p.sourceFiles.map((f) => [f.id, f]));
  const seenSources = new Set<string>(),
    seenSummaries = new Set<string>(),
    seenFacts = new Set<string>(),
    seenCoverage = new Set<string>();
  const counts = { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 };
  const eventLimit = Math.min(limits.maxEvents, p.resourceBudget.maxEvents);
  const hash = createHash('sha256');
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let pending = Buffer.alloc(0),
    total = 0,
    sequence = 0,
    metadataBytes = 0;
  let terminal: NativeFullAnalysisTerminalV3 | undefined;
  const contextMatches = (value: typeof context) => isDeepStrictEqual(value, context);
  const consume = async (raw: Uint8Array) => {
    if (raw.byteLength > limits.maxLineBytes)
      fail('OUTPUT_LIMIT_EXCEEDED', 'Native v3 line exceeds limit');
    if (sequence >= eventLimit)
      fail('OUTPUT_LIMIT_EXCEEDED', 'Native v3 event count exceeds limit');
    if (
      terminal ||
      !raw.length ||
      raw.includes(13) ||
      (raw[0] === 239 && raw[1] === 187 && raw[2] === 191)
    )
      fail('PROTOCOL_VIOLATION', 'Native v3 framing is invalid');
    let e: NativeFullAnalysisEventV3;
    try {
      const value: unknown = JSON.parse(utf8.decode(raw));
      e = NativeFullAnalysisEventV3Schema.parse(value);
    } catch {
      return fail('PROTOCOL_VIOLATION', 'Native v3 event is invalid');
    }
    if (
      e.requestId !== request.requestId ||
      e.sequence !== sequence ||
      (sequence === 0
        ? !['ANALYSIS_STARTED', 'REQUEST_FAILED'].includes(e.type)
        : ['ANALYSIS_STARTED', 'REQUEST_FAILED'].includes(e.type))
    )
      fail('PROTOCOL_VIOLATION', 'Native v3 order or request differs');
    sequence++;
    if (e.type === 'ANALYSIS_STARTED' || e.type === 'ANALYSIS_FAILED') {
      const { error: _error, ...actual } =
        e.type === 'ANALYSIS_FAILED' ? e.payload : { ...e.payload, error: undefined };
      if (!contextMatches(actual)) fail('PROTOCOL_VIOLATION', 'Native v3 context differs');
    } else if (e.type === 'SOURCE_FILE') {
      if (seenSources.has(e.payload.id) || !isDeepStrictEqual(e.payload, sources.get(e.payload.id)))
        fail('PROTOCOL_VIOLATION', 'Native v3 source differs');
      seenSources.add(e.payload.id);
      counts.sourceFiles++;
    } else if (e.type === 'NODE' || e.type === 'EDGE') {
      const fact = e.payload,
        key = `${e.type}\0${fact.providerFactId}`;
      if (
        seenFacts.has(key) ||
        fact.providerSnapshotId !== p.providerSnapshotId ||
        fact.providerId !== p.analysisStateContext.providerId ||
        fact.repositoryId !== p.repository.id ||
        fact.revisionId !== p.revision.id ||
        (fact.sourceRange !== null && !sources.has(fact.sourceRange.sourceFileId))
      )
        fail('PROTOCOL_VIOLATION', 'Native v3 fact identity or context differs');
      seenFacts.add(key);
      if (e.type === 'NODE') counts.nodes++;
      else counts.edges++;
    } else if (e.type === 'COVERAGE') {
      const c = e.payload,
        key = `${c.sourceFileId}\0${c.capability}`;
      const sum = Object.values(c.statistics.resolutionCounts).reduce((a, b) => a + b, 0);
      if (
        c.sourceFileId === null ||
        !sources.has(c.sourceFileId) ||
        !p.requestedCapabilities.includes(c.capability) ||
        seenCoverage.has(key) ||
        sum !== (c.capability === 'SYMBOL' ? 0 : c.statistics.coveredSites)
      )
        fail('PROTOCOL_VIOLATION', 'Native v3 coverage differs');
      seenCoverage.add(key);
      counts.coverage++;
    } else if (e.type === 'DIAGNOSTIC') {
      if (e.payload.sourceRange !== null && !sources.has(e.payload.sourceRange.sourceFileId))
        fail('PROTOCOL_VIOLATION', 'Native v3 diagnostic source differs');
      counts.diagnostics++;
    } else if (e.type === 'ANALYSIS_SUMMARY') {
      const s = e.payload;
      if (
        seenSummaries.has(s.sourceFile.id) ||
        !isDeepStrictEqual(s.sourceFile, sources.get(s.sourceFile.id))
      )
        fail('PROTOCOL_VIOLATION', 'Native v3 summary source differs');
      metadataBytes += Buffer.byteLength(JSON.stringify(s));
      if (metadataBytes > 1_000_000)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native v3 metadata exceeds envelope');
      seenSummaries.add(s.sourceFile.id);
    }
    if (e.type === 'ANALYSIS_COMPLETED') {
      const c = e.payload,
        h = c.analysisState;
      const { providerSnapshotId, repositoryId, revisionId, revisionFingerprint } = c;
      const { schemaVersion: _v, sourceFileCount, summaryDigest: _d, ...headerContext } = h;
      if (
        !contextMatches({ providerSnapshotId, repositoryId, revisionId, revisionFingerprint }) ||
        c.contentFingerprint !== p.revision.contentFingerprint ||
        !isDeepStrictEqual(c.counts, counts) ||
        c.summaryRecords !== seenSummaries.size ||
        seenSummaries.size !== sources.size ||
        seenSources.size !== sources.size ||
        seenCoverage.size !== sources.size * p.requestedCapabilities.length ||
        sourceFileCount !== sources.size ||
        !isDeepStrictEqual(
          {
            ...headerContext,
            requestedCapabilities: [...headerContext.requestedCapabilities].sort(),
          },
          {
            ...p.analysisStateContext,
            repositoryId: p.repository.id,
            revisionId: p.revision.id,
            contentFingerprint: p.revision.contentFingerprint,
            requestedCapabilities: [...p.requestedCapabilities].sort(),
          },
        )
      )
        fail('PROTOCOL_VIOLATION', 'Native v3 completion differs');
      if (metadataBytes + Buffer.byteLength(JSON.stringify(h)) > 1_000_000)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native v3 metadata exceeds envelope');
      if (c.integrityChecksum !== `sha256:${hash.digest('hex')}`)
        fail('CHECKSUM_MISMATCH', 'Native v3 checksum differs');
      terminal = freeze(e);
    } else if (e.type === 'REQUEST_FAILED' || e.type === 'ANALYSIS_FAILED') terminal = freeze(e);
    else {
      hash.update(raw);
      hash.update('\n');
      await sink.accept(freeze(e));
    }
  };
  for await (const chunk of lines) {
    total += chunk.byteLength;
    if (total > limits.maxStdoutBytes)
      fail('OUTPUT_LIMIT_EXCEEDED', 'Native v3 stdout exceeds limit');
    if (terminal && chunk.byteLength) fail('PROTOCOL_VIOLATION', 'Native v3 output after terminal');
    let offset = 0;
    while (offset < chunk.byteLength) {
      const lf = chunk.indexOf(10, offset),
        end = lf < 0 ? chunk.byteLength : lf;
      const part = chunk.subarray(offset, end);
      if (pending.length + part.length > limits.maxLineBytes)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native v3 line exceeds limit');
      if (lf < 0) {
        pending = Buffer.concat([pending, part]);
        break;
      }
      await consume(pending.length ? Buffer.concat([pending, part]) : part);
      pending = Buffer.alloc(0);
      offset = lf + 1;
    }
  }
  if (pending.length || !terminal)
    return fail('PROTOCOL_VIOLATION', 'Native v3 output is incomplete');
  if (terminal.type !== 'ANALYSIS_COMPLETED') fail('ANALYZER_FAILED', 'Native v3 analysis failed');
  return Object.freeze({ terminal });
}
