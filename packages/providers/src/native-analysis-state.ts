import { createHash } from 'node:crypto';
import {
  CodeFactNameSchema,
  ContentFingerprintSchema,
  EntityIdSchema,
  ProviderEdgeSchema,
  ProviderFactIdSchema,
  ProviderFactKindSchema,
  ProviderIdSchema,
  ProviderNodeSchema,
  ProviderSnapshotDiagnosticSchema,
  ProviderVersionSchema,
  QualifiedCodeFactNameSchema,
  SourceFileSchema,
  type ProviderNode,
  type ProviderEdge,
} from '@codeatlas/ir';
import { z } from 'zod';
import { NativeAnalyzerLanguageSchema } from './native-ipc.js';
import { NativeCapabilityCoverageV2Schema } from './native-ipc-v2.js';

const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((n) => !Object.is(n, -0));
const exact = z
  .string()
  .min(1)
  .max(128)
  .refine((s) => s.trim() === s);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const capabilities = z
  .array(z.enum(['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE']))
  .min(1)
  .refine((a) => new Set(a).size === a.length);
const span = z
  .strictObject({ startLine: integer, startColumn: integer, endLine: integer, endColumn: integer })
  .refine(
    (s) => s.endLine > s.startLine || (s.endLine === s.startLine && s.endColumn >= s.startColumn),
  );
const symbol = z.strictObject({
  providerFactId: ProviderFactIdSchema,
  providerKind: ProviderFactKindSchema,
  name: CodeFactNameSchema,
  qualifiedName: QualifiedCodeFactNameSchema.nullable(),
  signature: z.string(),
  isStatic: z.boolean(),
  span,
});
const site = z.strictObject({
  kind: z.enum(['IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE']),
  variant: z.string().min(1),
  sourceFactId: ProviderFactIdSchema,
  targetHint: z.string().min(1),
  arity: integer.nullable(),
  span,
});
const emitted = z.strictObject({
  factType: z.enum(['NODE', 'EDGE']),
  providerFactId: ProviderFactIdSchema,
  contentDigest: digest,
  ownership: z.enum(['FILE', 'SHARED']),
});

function validUnicode(value: unknown): boolean {
  if (typeof value === 'string') return value.isWellFormed();
  if (Array.isArray(value)) return value.every(validUnicode);
  if (value !== null && typeof value === 'object')
    return Object.entries(value).every(
      ([key, nested]) => key.isWellFormed() && validUnicode(nested),
    );
  return true;
}
function unicodeOrder(a: string, b: string): number {
  const left = Array.from(a, (s) => s.codePointAt(0)!);
  const right = Array.from(b, (s) => s.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++)
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}
function canonical(value: unknown): string {
  if (typeof value === 'number') {
    const bits = Buffer.alloc(8);
    bits.writeDoubleBE(value);
    return `{"$nativeNumber":"${bits.toString('hex')}"}`;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort(unicodeOrder)
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function compilationUnit(path: string): string {
  return `java-compilation-unit-v1:${sha(`java-compilation-unit-v1\0${Buffer.byteLength(path)}:${path}`)}`;
}

export const NativeFileAnalysisSummaryV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    sourceFile: SourceFileSchema,
    symbols: z.array(symbol),
    relationSites: z.array(site),
    diagnostics: z.array(ProviderSnapshotDiagnosticSchema),
    coverage: z.array(NativeCapabilityCoverageV2Schema),
    emittedFacts: z.array(emitted),
  })
  .superRefine((s, ctx) => {
    const issue = (path: PropertyKey[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (!validUnicode(s)) issue([], 'Invalid Unicode scalar value');
    const ids = new Set(s.symbols.map((n) => n.providerFactId));
    if (ids.size !== s.symbols.length) issue(['symbols'], 'Duplicate symbol identity');
    const keys = s.emittedFacts.map((f) => `${f.factType}\0${f.providerFactId}`);
    if (new Set(keys).size !== keys.length) issue(['emittedFacts'], 'Duplicate emitted identity');
    const sites = new Set<string>();
    for (const [i, r] of s.relationSites.entries()) {
      if (!ids.has(r.sourceFactId) && r.sourceFactId !== compilationUnit(s.sourceFile.path))
        issue(['relationSites', i, 'sourceFactId'], 'Unknown site source');
      const key = canonical(r);
      if (sites.has(key)) issue(['relationSites', i], 'Duplicate relation site');
      sites.add(key);
    }
    for (const [i, d] of s.diagnostics.entries())
      if (d.sourceRange !== null && d.sourceRange.sourceFileId !== s.sourceFile.id)
        issue(['diagnostics', i], 'Diagnostic source differs');
    const seen = new Set<string>();
    for (const [i, c] of s.coverage.entries()) {
      const stats = c.statistics,
        sum = Object.values(stats.resolutionCounts).reduce((a, b) => a + b, 0);
      if (seen.has(c.capability) || c.sourceFileId !== s.sourceFile.id)
        issue(['coverage', i], 'Coverage file or capability differs');
      seen.add(c.capability);
      if (
        !['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'].includes(c.capability) ||
        !Number.isSafeInteger(sum) ||
        (c.capability === 'SYMBOL' ? sum !== 0 : sum !== stats.coveredSites)
      )
        issue(['coverage', i], 'Resolution statistics differ');
      if (
        [
          stats.eligibleSites,
          stats.coveredSites,
          stats.unsupportedSites,
          stats.partialSites,
          ...Object.values(stats.resolutionCounts),
        ].some((n) => Object.is(n, -0))
      )
        issue(['coverage', i], 'Negative zero is invalid');
    }
  });
export type NativeFileAnalysisSummaryV1 = z.infer<typeof NativeFileAnalysisSummaryV1Schema>;

export const NativeAnalysisStateHeaderV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    repositoryId: EntityIdSchema,
    revisionId: EntityIdSchema,
    contentFingerprint: ContentFingerprintSchema,
    providerId: ProviderIdSchema,
    providerVersion: ProviderVersionSchema,
    language: NativeAnalyzerLanguageSchema.refine((l) => l.languageId === 'java'),
    resolverVersion: exact,
    normalizerVersion: exact,
    policyFingerprint: ContentFingerprintSchema,
    requestedCapabilities: capabilities,
    sourceFileCount: integer,
    summaryDigest: digest,
  })
  .refine(validUnicode, 'Invalid Unicode scalar value');
export type NativeAnalysisStateHeaderV1 = z.infer<typeof NativeAnalysisStateHeaderV1Schema>;

function siteOrder(
  a: NativeFileAnalysisSummaryV1['relationSites'][number],
  b: NativeFileAnalysisSummaryV1['relationSites'][number],
): number {
  return (
    unicodeOrder(a.kind, b.kind) ||
    unicodeOrder(a.sourceFactId, b.sourceFactId) ||
    a.span.startLine - b.span.startLine ||
    a.span.startColumn - b.span.startColumn ||
    a.span.endLine - b.span.endLine ||
    a.span.endColumn - b.span.endColumn ||
    unicodeOrder(a.variant, b.variant) ||
    unicodeOrder(a.targetHint, b.targetHint) ||
    (a.arity === b.arity ? 0 : a.arity === null ? -1 : b.arity === null ? 1 : a.arity - b.arity)
  );
}
function summaryDigest(summaries: readonly NativeFileAnalysisSummaryV1[]): string {
  const ordered = [...summaries]
    .sort((a, b) => unicodeOrder(a.sourceFile.path, b.sourceFile.path))
    .map((s) => ({
      ...s,
      symbols: [...s.symbols].sort((a, b) => unicodeOrder(a.providerFactId, b.providerFactId)),
      relationSites: [...s.relationSites].sort(siteOrder),
      diagnostics: [...s.diagnostics].sort((a, b) =>
        Buffer.compare(Buffer.from(canonical(a)), Buffer.from(canonical(b))),
      ),
      coverage: [...s.coverage].sort((a, b) => unicodeOrder(a.capability, b.capability)),
      emittedFacts: [...s.emittedFacts].sort(
        (a, b) =>
          unicodeOrder(a.factType, b.factType) || unicodeOrder(a.providerFactId, b.providerFactId),
      ),
    }));
  return sha(canonical(ordered));
}
export function computeNativeSummaryDigest(
  summaries: readonly NativeFileAnalysisSummaryV1[],
): string {
  return summaryDigest(z.array(NativeFileAnalysisSummaryV1Schema).parse(summaries));
}
export function computeNativeFactContentDigest(fact: ProviderNode | ProviderEdge): string {
  const parsed = z
    .union([ProviderNodeSchema, ProviderEdgeSchema])
    .refine(validUnicode, 'Invalid Unicode scalar value')
    .parse(fact);
  const { providerSnapshotId: _snapshot, ...semantic } = parsed;
  return sha(canonical(semantic));
}

export const NativeAnalysisStateBundleV1Schema = z
  .strictObject({
    header: NativeAnalysisStateHeaderV1Schema,
    summaries: z.array(NativeFileAnalysisSummaryV1Schema),
  })
  .superRefine(({ header, summaries }, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      summaries.length !== header.sourceFileCount ||
      summaryDigest(summaries) !== header.summaryDigest
    )
      issue('Summary count or digest differs');
    const ids = new Set<string>(),
      paths = new Set<string>(),
      owners = new Map<string, { ownership: string; contentDigest: string }>();
    for (const s of summaries) {
      const f = s.sourceFile;
      if (
        f.repositoryId !== header.repositoryId ||
        f.revisionId !== header.revisionId ||
        ids.has(f.id) ||
        paths.has(f.path)
      )
        issue('Source context or identity differs');
      ids.add(f.id);
      paths.add(f.path);
      if (
        s.coverage.length !== header.requestedCapabilities.length ||
        s.coverage.some(
          (c) =>
            !header.requestedCapabilities.includes(
              c.capability as (typeof header.requestedCapabilities)[number],
            ),
        )
      )
        issue('Coverage capability set differs');
      for (const fact of s.emittedFacts) {
        const key = `${fact.factType}\0${fact.providerFactId}`,
          old = owners.get(key);
        if (
          old &&
          (old.ownership !== 'SHARED' ||
            fact.ownership !== 'SHARED' ||
            old.contentDigest !== fact.contentDigest)
        )
          issue('Fact ownership differs');
        owners.set(key, fact);
      }
    }
  });
export type NativeAnalysisStateBundleV1 = z.infer<typeof NativeAnalysisStateBundleV1Schema>;
