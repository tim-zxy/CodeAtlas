import { SourceFileSchema, type SourceFile } from '@codeatlas/ir';
import { z } from 'zod';
import { AnalyzeRequestPayloadSchema, RefreshRequestPayloadSchema } from './native-ipc.js';
import {
  NativeAnalysisStateHeaderV1Schema,
  NativeFileAnalysisSummaryV1Schema,
  NativeAnalysisStateBundleV1Schema,
} from './native-analysis-state.js';

export type NativeV3ContractErrorCode =
  | 'INVALID_REQUEST'
  | 'PROTOCOL_CORRUPTION'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'INCOMPATIBLE_PROTOCOL_VERSION';
export class NativeV3ContractError extends Error {
  constructor(public readonly code: NativeV3ContractErrorCode) {
    super(`Native v3 contract: ${code}`);
    this.name = 'NativeV3ContractError';
  }
}
const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((n) => !Object.is(n, -0));
const identity = z
  .string()
  .min(1)
  .max(128)
  .refine((s) => s === s.trim());
const stateFields = NativeAnalysisStateHeaderV1Schema.shape;
const context = z.strictObject({
  providerId: stateFields.providerId,
  providerVersion: stateFields.providerVersion,
  language: stateFields.language,
  resolverVersion: stateFields.resolverVersion,
  normalizerVersion: stateFields.normalizerVersion,
  policyFingerprint: stateFields.policyFingerprint,
});
const envelope = { protocolVersion: z.literal(3), requestId: identity, sequence: integer };
const analyze = z.strictObject({
  ...envelope,
  type: z.literal('ANALYZE'),
  payload: AnalyzeRequestPayloadSchema.safeExtend({
    analysisStateContext: context,
    baselineState: z.null(),
  }),
});
const refresh = z.strictObject({
  ...envelope,
  type: z.literal('REFRESH'),
  payload: RefreshRequestPayloadSchema.safeExtend({
    analysisStateContext: context,
    baselineState: NativeAnalysisStateHeaderV1Schema,
    targetSourceFiles: z.array(SourceFileSchema),
  }),
});
function scalarValuesValid(v: unknown): boolean {
  if (typeof v === 'string') return v.isWellFormed();
  if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0);
  if (Array.isArray(v)) return v.every(scalarValuesValid);
  if (v !== null && typeof v === 'object')
    return Object.entries(v).every(([k, n]) => k.isWellFormed() && scalarValuesValid(n));
  return true;
}
function uniqueFiles(files: readonly SourceFile[], repo: string, rev: string): boolean {
  return (
    new Set(files.map((f) => f.id)).size === files.length &&
    new Set(files.map((f) => f.path)).size === files.length &&
    files.every((f) => f.repositoryId === repo && f.revisionId === rev)
  );
}
const header = z.discriminatedUnion('type', [analyze, refresh]);
export const NativeRequestHeaderV3Schema = header.superRefine((h, ctx) => {
  const issue = () => ctx.addIssue({ code: 'custom', message: 'Invalid request context' });
  const p = h.payload;
  if (
    h.sequence !== 0 ||
    !scalarValuesValid(h) ||
    p.requestedCapabilities.some(
      (c) => !['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'].includes(c),
    )
  )
    issue();
  if (h.type === 'ANALYZE') {
    if (!uniqueFiles(h.payload.sourceFiles, p.repository.id, h.payload.revision.id)) issue();
  } else {
    const r = h.payload,
      b = r.baselineState;
    const c = r.analysisStateContext;
    if (
      !uniqueFiles(r.targetSourceFiles, r.repository.id, r.targetRevision.id) ||
      b.repositoryId !== r.repository.id ||
      b.revisionId !== r.baseRevisionId ||
      b.contentFingerprint !== r.baseRevisionFingerprint ||
      b.requestedCapabilities.length !== r.requestedCapabilities.length ||
      b.requestedCapabilities.some((cap) => !r.requestedCapabilities.includes(cap)) ||
      c.providerId !== b.providerId ||
      c.providerVersion !== b.providerVersion ||
      c.resolverVersion !== b.resolverVersion ||
      c.normalizerVersion !== b.normalizerVersion ||
      c.policyFingerprint !== b.policyFingerprint ||
      Object.keys(c.language).some(
        (k) =>
          c.language[k as keyof typeof c.language] !== b.language[k as keyof typeof c.language],
      )
    )
      issue();
  }
});
export type NativeRequestHeaderV3 = z.infer<typeof NativeRequestHeaderV3Schema>;
export const NativeRequestRecordV3Schema = z
  .union([
    NativeRequestHeaderV3Schema,
    z.strictObject({
      ...envelope,
      type: z.literal('BASELINE_SUMMARY'),
      payload: NativeFileAnalysisSummaryV1Schema,
    }),
    z.strictObject({
      ...envelope,
      type: z.literal('REQUEST_COMPLETED'),
      payload: z.strictObject({
        summaryRecords: integer,
        integrityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    }),
  ])
  .refine(scalarValuesValid);
export type NativeRequestRecordV3 = z.infer<typeof NativeRequestRecordV3Schema>;

function sameFile(a: SourceFile, b: SourceFile): boolean {
  return (
    a.id === b.id &&
    a.path === b.path &&
    a.repositoryId === b.repositoryId &&
    a.revisionId === b.revisionId &&
    a.contentFingerprint === b.contentFingerprint &&
    a.languageHint === b.languageHint &&
    a.sensitivity === b.sensitivity &&
    a.classification.role === b.classification.role &&
    a.classification.provenance === b.classification.provenance &&
    a.classification.contentKind === b.classification.contentKind
  );
}
function checkDelta(
  h: Extract<NativeRequestHeaderV3, { type: 'REFRESH' }>,
  files: readonly SourceFile[],
): void {
  const p = h.payload,
    prior = new Map(files.map((f) => [f.path, f])),
    target = new Map(p.targetSourceFiles.map((f) => [f.path, f]));
  const added: SourceFile[] = [],
    modified: SourceFile[] = [],
    deleted: { id: string; path: string; previousContentFingerprint: string }[] = [];
  for (const f of p.targetSourceFiles) {
    const old = prior.get(f.path);
    if (!old) added.push(f);
    else {
      if (old.id !== f.id) throw new NativeV3ContractError('INVALID_REQUEST');
      // Revision applicability is owned by Application. Never relabel the baseline here.
      const projected = { ...old, revisionId: f.revisionId };
      if (!sameFile(projected, f)) modified.push(f);
    }
  }
  for (const f of files)
    if (!target.has(f.path))
      deleted.push({ id: f.id, path: f.path, previousContentFingerprint: f.contentFingerprint });
  const matches = (expected: readonly SourceFile[], actual: readonly SourceFile[]) =>
    expected.length === actual.length &&
    new Set(actual.map((f) => f.path)).size === actual.length &&
    expected.every((f) => actual.some((a) => sameFile(f, a)));
  if (
    !matches(added, p.changes.added) ||
    !matches(modified, p.changes.modified) ||
    deleted.length !== p.changes.deleted.length ||
    new Set(p.changes.deleted.map((f) => f.path)).size !== p.changes.deleted.length ||
    deleted.some(
      (f) =>
        !p.changes.deleted.some(
          (a) =>
            a.id === f.id &&
            a.path === f.path &&
            a.previousContentFingerprint === f.previousContentFingerprint,
        ),
    )
  )
    throw new NativeV3ContractError('INVALID_REQUEST');
}

/** Object validation only: this does not prove the raw JSONL checksum. */
export function validateNativeRequestRecordsV3(
  records: readonly NativeRequestRecordV3[],
): NativeRequestHeaderV3 {
  const fail = (code: NativeV3ContractErrorCode): never => {
    throw new NativeV3ContractError(code);
  };
  if (records.length < 2) fail('PROTOCOL_CORRUPTION');
  for (const r of records) if (!r || r.protocolVersion !== 3) fail('INCOMPATIBLE_PROTOCOL_VERSION');
  const first = records[0]!;
  if (typeof first.requestId !== 'string' || !identity.safeParse(first.requestId).success)
    fail('INVALID_REQUEST');
  for (const [i, r] of records.entries())
    if (r.requestId !== first.requestId || r.sequence !== i || Object.is(r.sequence, -0))
      fail('PROTOCOL_CORRUPTION');
  if (
    !['ANALYZE', 'REFRESH'].includes(first.type) ||
    records.at(-1)?.type !== 'REQUEST_COMPLETED' ||
    records.slice(1, -1).some((r) => r.type !== 'BASELINE_SUMMARY')
  )
    fail('PROTOCOL_CORRUPTION');
  const parsed = z.array(NativeRequestRecordV3Schema).safeParse(records);
  if (!parsed.success) return fail('INVALID_REQUEST');
  const h = NativeRequestHeaderV3Schema.parse(parsed.data[0]);
  const summaries = parsed.data
    .slice(1, -1)
    .flatMap((r) => (r.type === 'BASELINE_SUMMARY' ? [r.payload] : []));
  if (h.type === 'ANALYZE') {
    if (summaries.length) fail('INVALID_REQUEST');
  } else {
    if (
      !NativeAnalysisStateBundleV1Schema.safeParse({ header: h.payload.baselineState, summaries })
        .success
    )
      fail('INVALID_REQUEST');
    checkDelta(
      h,
      summaries.map((s) => s.sourceFile),
    );
  }
  const last = parsed.data.at(-1)!;
  if (last.type !== 'REQUEST_COMPLETED' || last.payload.summaryRecords !== summaries.length)
    fail('INVALID_REQUEST');
  return h;
}
