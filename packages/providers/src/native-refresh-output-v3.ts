import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  ProviderNodeSchema,
  ProviderEdgeSchema,
  ProviderFactRefSchema,
  SourceFileSchema,
  ProviderSnapshotDiagnosticSchema,
} from '@codeatlas/ir';
import {
  StreamContextSchema,
  FailedPayloadSchema,
  RequestFailedPayloadSchema,
  AnalyzeCompletedPayloadSchema,
} from './native-ipc.js';
import { NativeCapabilityCoverageV2Schema } from './native-ipc-v2.js';
import { decodeNativeRequestV3 } from './native-ipc-v3-bytes.js';
import type { NativeRequestHeaderV3 } from './native-ipc-v3.js';
import {
  NativeFileAnalysisSummaryV1Schema,
  NativeAnalysisStateHeaderV1Schema,
  NativeAnalysisStateBundleV1Schema,
  computeNativeFactContentDigest,
  type NativeFileAnalysisSummaryV1,
} from './native-analysis-state.js';
import {
  NativeClientError,
  NATIVE_CLIENT_HARD_LIMITS,
  type NativeClientLimits,
} from './native-client.js';

export type NativeRefreshRequestV3 = Extract<NativeRequestHeaderV3, { type: 'REFRESH' }>;
const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((n) => !Object.is(n, -0));
const counts = z.strictObject({
  sourceFiles: integer,
  upsertedNodes: integer,
  removedNodes: integer,
  upsertedEdges: integer,
  removedEdges: integer,
  coverage: integer,
  diagnostics: integer,
});
const completion = AnalyzeCompletedPayloadSchema.omit({ counts: true }).extend({
  counts,
  analysisState: NativeAnalysisStateHeaderV1Schema,
  summaryRecords: integer,
});
function event<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({
    protocolVersion: z.literal(3),
    requestId: z
      .string()
      .min(1)
      .max(128)
      .refine((s) => s === s.trim()),
    sequence: integer,
    type: z.literal(type),
    payload,
  });
}
function scalars(v: unknown): boolean {
  if (typeof v === 'string') return v.isWellFormed();
  if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0);
  return (
    v === null ||
    typeof v !== 'object' ||
    Object.entries(v).every(([k, x]) => k.isWellFormed() && scalars(x))
  );
}
export const NativeRefreshEventV3Schema = z
  .discriminatedUnion('type', [
    event('REFRESH_STARTED', StreamContextSchema),
    event('SOURCE_FILE', SourceFileSchema),
    event('UPSERT_NODE', ProviderNodeSchema),
    event('UPSERT_EDGE', ProviderEdgeSchema),
    event('REMOVE_NODE', ProviderFactRefSchema.extend({ factType: z.literal('NODE') })),
    event('REMOVE_EDGE', ProviderFactRefSchema.extend({ factType: z.literal('EDGE') })),
    event('COVERAGE', NativeCapabilityCoverageV2Schema),
    event('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema),
    event('ANALYSIS_SUMMARY', NativeFileAnalysisSummaryV1Schema),
    event('REFRESH_COMPLETED', completion),
    event('REFRESH_FAILED', FailedPayloadSchema),
    event('REQUEST_FAILED', RequestFailedPayloadSchema),
  ])
  .refine(scalars);
export type NativeRefreshEventV3 = z.infer<typeof NativeRefreshEventV3Schema>;
export type NativeRefreshTerminalV3 = Extract<
  NativeRefreshEventV3,
  { type: 'REFRESH_COMPLETED' | 'REFRESH_FAILED' | 'REQUEST_FAILED' }
>;
type Summary = NativeFileAnalysisSummaryV1;
type LedgerRow = { digest: string; ownership: 'FILE' | 'SHARED'; files: Set<string> };
type Operation = {
  removed: boolean;
  digest?: string;
  file: string | null;
  kind: string;
  name?: string;
  qualifiedName?: string | null;
  references: string[];
};
function key(kind: string, id: string) {
  return `${kind}\0${id}`;
}
function ledger(summaries: readonly Summary[]): Map<string, LedgerRow> {
  const rows = new Map<string, LedgerRow>();
  for (const s of summaries)
    for (const f of s.emittedFacts) {
      const k = key(f.factType, f.providerFactId),
        old = rows.get(k);
      if (old) old.files.add(s.sourceFile.id);
      else
        rows.set(k, {
          digest: f.contentDigest,
          ownership: f.ownership,
          files: new Set([s.sourceFile.id]),
        });
    }
  return rows;
}
function synthetic(prefix: string, text: string): string {
  return `${prefix}:${createHash('sha256')
    .update(`${prefix}\0${Buffer.byteLength(text)}:${text}`)
    .digest('hex')}`;
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    Object.values(v).forEach(freeze);
  }
  return v;
}

/** Provisional observation only; no process, database or applicable-candidate authority. */
export async function decodeNativeRefreshV3(
  requestBytes: Uint8Array,
  lines: AsyncIterable<Uint8Array>,
  sink: { accept(event: NativeRefreshEventV3): Promise<void> },
  limits: NativeClientLimits,
  expectedMemoryBudgetBytes: number,
): Promise<{ terminal: Extract<NativeRefreshTerminalV3, { type: 'REFRESH_COMPLETED' }> }> {
  const fail = (
    code: ConstructorParameters<typeof NativeClientError>[0],
    message: string,
  ): never => {
    throw new NativeClientError(code, message);
  };
  const invalid = (): never => fail('PROTOCOL_VIOLATION', 'Native refresh observation differs');
  if (!Number.isSafeInteger(expectedMemoryBudgetBytes) || expectedMemoryBudgetBytes <= 0)
    fail('INVALID_CONFIGURATION', 'Native refresh trusted budget must be positive and safe');
  for (const k of Object.keys(NATIVE_CLIENT_HARD_LIMITS) as (keyof NativeClientLimits)[])
    if (
      !Number.isSafeInteger(limits[k]) ||
      limits[k] <= 0 ||
      limits[k] > NATIVE_CLIENT_HARD_LIMITS[k]
    )
      fail('INVALID_CONFIGURATION', 'Native refresh limits must lower ceilings');
  if (!(requestBytes instanceof Uint8Array))
    fail('INVALID_REQUEST', 'Native refresh bytes required');
  if (requestBytes.byteLength > limits.maxStdinBytes)
    fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh input exceeds limit');
  // One bounded owned copy removes mutable caller bytes/methods from decoding.
  const owned = Buffer.from(requestBytes);
  let lineStart = 0;
  for (let at = 0; at < owned.length; at++)
    if (owned[at] === 10) {
      if (at - lineStart > limits.maxLineBytes)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh input line exceeds limit');
      lineStart = at + 1;
    }
  if (owned.length - lineStart > limits.maxLineBytes)
    fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh input line exceeds limit');
  let input: ReturnType<typeof decodeNativeRequestV3>;
  try {
    input = decodeNativeRequestV3(owned);
  } catch {
    return fail('INVALID_REQUEST', 'Invalid native refresh input');
  }
  if (input.header.type !== 'REFRESH' || !input.baseline)
    fail('INVALID_REQUEST', 'Expected native v3 REFRESH');
  const request = input.header as NativeRefreshRequestV3,
    p = request.payload,
    baseline = input.baseline!;
  if (p.resourceBudget.maxMemoryBytes !== expectedMemoryBudgetBytes)
    fail('INVALID_REQUEST', 'Native refresh wire budget differs from trusted budget');
  if (!sink || typeof sink.accept !== 'function')
    fail('INVALID_CONFIGURATION', 'Native refresh sink required');
  // This byte/work ledger is not an RSS reservation or Runtime admission profile.
  // Runtime verification admission precedes this primitive; D transport remains separate.
  let charged = owned.byteLength;
  const charge = (n: number) => {
    charged += n;
    if (charged > p.resourceBudget.maxMemoryBytes)
      fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh workspace exceeds budget');
  };
  charge(0);
  const ctx = {
    providerSnapshotId: p.providerSnapshotId,
    repositoryId: p.repository.id,
    revisionId: p.targetRevision.id,
    revisionFingerprint: p.targetRevision.contentFingerprint,
  };
  const files = new Map<string, (typeof p.targetSourceFiles)[number]>(
    p.targetSourceFiles.map((f) => [f.id, f]),
  );
  const changed = new Map([...p.changes.added, ...p.changes.modified].map((f) => [f.id, f]));
  const seenSources = new Set<string>(),
    coverage = new Map<string, unknown>();
  const summaries: Summary[] = [],
    operations = new Map<string, Operation>();
  const before = ledger(baseline.summaries);
  const observedCounts = {
    sourceFiles: 0,
    upsertedNodes: 0,
    removedNodes: 0,
    upsertedEdges: 0,
    removedEdges: 0,
    coverage: 0,
    diagnostics: 0,
  };
  const diagnostics: unknown[] = [];
  const hash = createHash('sha256'),
    utf8 = new TextDecoder('utf-8', { fatal: true });
  let pending = Buffer.alloc(0),
    total = 0,
    sequence = 0,
    metadataBytes = 0;
  let terminal: NativeRefreshTerminalV3 | undefined;
  const consume = async (raw: Uint8Array) => {
    if (
      raw.byteLength > limits.maxLineBytes ||
      sequence >= Math.min(limits.maxEvents, p.resourceBudget.maxEvents)
    )
      fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh output exceeds limit');
    if (
      terminal ||
      !raw.length ||
      raw.includes(13) ||
      (raw[0] === 239 && raw[1] === 187 && raw[2] === 191)
    )
      invalid();
    charge(raw.byteLength + 1);
    let e: NativeRefreshEventV3;
    try {
      e = NativeRefreshEventV3Schema.parse(JSON.parse(utf8.decode(raw)));
    } catch {
      return invalid();
    }
    if (
      e.requestId !== request.requestId ||
      e.sequence !== sequence ||
      (sequence === 0
        ? !['REFRESH_STARTED', 'REQUEST_FAILED'].includes(e.type)
        : ['REFRESH_STARTED', 'REQUEST_FAILED'].includes(e.type))
    )
      invalid();
    sequence++;
    if (e.type === 'REFRESH_STARTED' || e.type === 'REFRESH_FAILED') {
      const { error: _error, ...actual } =
        e.type === 'REFRESH_FAILED' ? e.payload : { ...e.payload, error: undefined };
      if (!isDeepStrictEqual(actual, ctx)) invalid();
    } else if (e.type === 'SOURCE_FILE') {
      if (seenSources.has(e.payload.id) || !isDeepStrictEqual(changed.get(e.payload.id), e.payload))
        invalid();
      seenSources.add(e.payload.id);
      observedCounts.sourceFiles++;
    } else if (e.type === 'UPSERT_NODE' || e.type === 'UPSERT_EDGE') {
      const f = e.payload,
        kind = e.type === 'UPSERT_NODE' ? 'NODE' : 'EDGE',
        k = key(kind, f.providerFactId);
      if (
        operations.has(k) ||
        f.providerId !== p.analysisStateContext.providerId ||
        f.providerSnapshotId !== ctx.providerSnapshotId ||
        f.repositoryId !== ctx.repositoryId ||
        f.revisionId !== ctx.revisionId ||
        (f.sourceRange !== null && !files.has(f.sourceRange.sourceFileId))
      )
        invalid();
      const refs: string[] = [];
      if (e.type === 'UPSERT_EDGE') {
        refs.push(key('NODE', e.payload.source.providerFactId));
        const t = e.payload.target;
        if (t.state === 'RESOLVED') refs.push(key('NODE', t.target.providerFactId));
        else refs.push(...t.candidates.map((r) => key('NODE', r.providerFactId)));
      }
      operations.set(k, {
        removed: false,
        digest: computeNativeFactContentDigest(f),
        file: f.sourceRange?.sourceFileId ?? null,
        kind: f.providerKind,
        references: refs,
        ...(e.type === 'UPSERT_NODE'
          ? { name: e.payload.name, qualifiedName: e.payload.qualifiedName }
          : {}),
      });
      observedCounts[kind === 'NODE' ? 'upsertedNodes' : 'upsertedEdges']++;
    } else if (e.type === 'REMOVE_NODE' || e.type === 'REMOVE_EDGE') {
      const k = key(e.payload.factType, e.payload.providerFactId);
      if (
        operations.has(k) ||
        !before.has(k) ||
        e.payload.providerId !== p.analysisStateContext.providerId
      )
        invalid();
      operations.set(k, { removed: true, file: null, kind: '', references: [] });
      observedCounts[e.type === 'REMOVE_NODE' ? 'removedNodes' : 'removedEdges']++;
    } else if (e.type === 'COVERAGE') {
      const c = e.payload,
        k = key(c.sourceFileId ?? '', c.capability);
      if (
        c.sourceFileId === null ||
        !files.has(c.sourceFileId) ||
        !p.requestedCapabilities.includes(c.capability) ||
        coverage.has(k) ||
        Object.values(c.statistics.resolutionCounts).reduce((a, b) => a + b, 0) !==
          (c.capability === 'SYMBOL' ? 0 : c.statistics.coveredSites)
      )
        invalid();
      coverage.set(k, c);
      observedCounts.coverage++;
    } else if (e.type === 'DIAGNOSTIC') {
      if (e.payload.sourceRange !== null && !files.has(e.payload.sourceRange.sourceFileId))
        invalid();
      diagnostics.push(e.payload);
      observedCounts.diagnostics++;
    } else if (e.type === 'ANALYSIS_SUMMARY') {
      if (
        summaries.some((s) => s.sourceFile.id === e.payload.sourceFile.id) ||
        !isDeepStrictEqual(files.get(e.payload.sourceFile.id), e.payload.sourceFile)
      )
        invalid();
      metadataBytes += raw.byteLength;
      if (metadataBytes > 1_000_000)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh metadata exceeds limit');
      summaries.push(e.payload);
    }
    if (e.type === 'REFRESH_COMPLETED') {
      const c = e.payload,
        h = c.analysisState;
      if (
        !isDeepStrictEqual(
          {
            providerSnapshotId: c.providerSnapshotId,
            repositoryId: c.repositoryId,
            revisionId: c.revisionId,
            revisionFingerprint: c.revisionFingerprint,
          },
          ctx,
        ) ||
        !isDeepStrictEqual(c.counts, observedCounts) ||
        c.contentFingerprint !== ctx.revisionFingerprint ||
        c.summaryRecords !== files.size ||
        summaries.length !== files.size ||
        seenSources.size !== changed.size ||
        coverage.size !== files.size * p.requestedCapabilities.length
      )
        invalid();
      const { schemaVersion: _v, sourceFileCount: _n, summaryDigest: _d, ...actual } = h;
      const expected = {
        ...p.analysisStateContext,
        repositoryId: ctx.repositoryId,
        revisionId: ctx.revisionId,
        contentFingerprint: ctx.revisionFingerprint,
        requestedCapabilities: h.requestedCapabilities,
      };
      if (
        !isDeepStrictEqual(actual, expected) ||
        !isDeepStrictEqual(
          [...h.requestedCapabilities].sort(),
          [...p.requestedCapabilities].sort(),
        ) ||
        !NativeAnalysisStateBundleV1Schema.safeParse({ header: h, summaries }).success
      )
        invalid();
      if (metadataBytes + Buffer.byteLength(JSON.stringify(h)) > 1_000_000)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh metadata exceeds limit');
      const after = ledger(summaries);
      for (const k of new Set([...before.keys(), ...after.keys(), ...operations.keys()])) {
        const old = before.get(k),
          next = after.get(k),
          op = operations.get(k);
        if (!next) {
          if (!old || !op?.removed) invalid();
        } else if (!old || old.digest !== next.digest) {
          if (!op || op.removed || op.digest !== next.digest) invalid();
        } else if (op) invalid();
        if (next && old && !op && old.ownership !== next.ownership) invalid();
        if (next && op?.references.some((r) => !after.has(r))) invalid();
        if (next?.ownership === 'FILE') {
          if (
            next.files.size !== 1 ||
            (old?.ownership === 'FILE' && !op && !isDeepStrictEqual(next.files, old.files))
          )
            invalid();
          if (
            op &&
            !op.removed &&
            op.file !== [...next.files][0] &&
            !(
              k.startsWith('NODE\0') &&
              op.kind === 'java.compilation_unit' &&
              op.file === null &&
              k ===
                key(
                  'NODE',
                  synthetic('java-compilation-unit-v1', files.get([...next.files][0]!)!.path),
                )
            )
          )
            invalid();
        } else if (next) {
          const owning = summaries.filter((s) =>
            s.emittedFacts.some((f) => key(f.factType, f.providerFactId) === k),
          );
          const packageSymbol = owning[0]?.symbols.find(
            (s) =>
              s.providerKind === 'java.package' &&
              k === key('NODE', synthetic('java-package-container-v1', s.name)),
          );
          if (
            !packageSymbol ||
            (op &&
              (op.kind !== 'java.package_container' ||
                op.file !== null ||
                op.name !== packageSymbol.name ||
                op.qualifiedName !== packageSymbol.qualifiedName))
          )
            invalid();
          const declaring = summaries.filter((s) =>
            s.symbols.some(
              (n) =>
                n.providerKind === 'java.package' &&
                n.name === packageSymbol!.name &&
                n.qualifiedName === packageSymbol!.qualifiedName,
            ),
          );
          if (!isDeepStrictEqual(new Set(declaring.map((s) => s.sourceFile.id)), next.files))
            invalid();
        }
      }
      for (const s of summaries) {
        for (const n of s.symbols) {
          const declared = s.emittedFacts.find(
            (f) => f.factType === 'NODE' && f.providerFactId === n.providerFactId,
          );
          const fact = {
            providerId: p.analysisStateContext.providerId,
            providerFactId: n.providerFactId,
            providerSnapshotId: ctx.providerSnapshotId,
            repositoryId: ctx.repositoryId,
            revisionId: ctx.revisionId,
            providerKind: n.providerKind,
            name: n.name,
            qualifiedName: n.qualifiedName,
            sourceRange: { sourceFileId: s.sourceFile.id, ...n.span },
            confidence: { score: 1, method: 'parser' as const, reasons: [] },
          };
          if (
            !declared ||
            declared.ownership !== 'FILE' ||
            declared.contentDigest !== computeNativeFactContentDigest(fact)
          )
            invalid();
        }
        for (const c of s.coverage)
          if (!isDeepStrictEqual(c, coverage.get(key(s.sourceFile.id, c.capability)))) invalid();
      }
      const expectedDiagnostics = summaries.flatMap((s) => s.diagnostics);
      if (diagnostics.length !== expectedDiagnostics.length) invalid();
      const diagnosticCounts = new Map<string, number>();
      for (const d of expectedDiagnostics) {
        const k = JSON.stringify(d);
        diagnosticCounts.set(k, (diagnosticCounts.get(k) ?? 0) + 1);
      }
      for (const d of diagnostics) {
        const k = JSON.stringify(d),
          n = diagnosticCounts.get(k) ?? 0;
        if (n === 0) invalid();
        diagnosticCounts.set(k, n - 1);
      }
      if (c.integrityChecksum !== `sha256:${hash.digest('hex')}`)
        fail('CHECKSUM_MISMATCH', 'Native refresh checksum differs');
      terminal = freeze(e);
    } else if (e.type === 'REFRESH_FAILED' || e.type === 'REQUEST_FAILED') terminal = freeze(e);
    else {
      hash.update(raw);
      hash.update('\n');
      await sink.accept(freeze(e));
    }
  };
  for await (const chunk of lines) {
    total += chunk.byteLength;
    if (total > limits.maxStdoutBytes)
      fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh stdout exceeds limit');
    if (terminal && chunk.byteLength) invalid();
    let at = 0;
    while (at < chunk.byteLength) {
      const lf = chunk.indexOf(10, at),
        end = lf < 0 ? chunk.byteLength : lf;
      const part = chunk.subarray(at, end);
      if (pending.length + part.length > limits.maxLineBytes)
        fail('OUTPUT_LIMIT_EXCEEDED', 'Native refresh line exceeds limit');
      if (lf < 0) {
        pending = Buffer.concat([pending, part]);
        break;
      }
      await consume(pending.length ? Buffer.concat([pending, part]) : part);
      pending = Buffer.alloc(0);
      at = lf + 1;
    }
  }
  if (pending.length || !terminal) invalid();
  if (terminal!.type !== 'REFRESH_COMPLETED') fail('ANALYZER_FAILED', 'Native refresh failed');
  return Object.freeze({
    terminal: terminal as Extract<NativeRefreshTerminalV3, { type: 'REFRESH_COMPLETED' }>,
  });
}
