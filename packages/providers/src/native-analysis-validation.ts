import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  ProviderNodeSchema,
  ProviderEdgeSchema,
  SourceFileSchema,
  ProviderSnapshotDiagnosticSchema,
  type ProviderNode,
  type ProviderEdge,
  type SourceFile,
  type ProviderSnapshotDiagnostic,
} from '@codeatlas/ir';
import { ZodError } from 'zod';
import {
  NativeAnalysisStateBundleV1Schema,
  computeNativeFactContentDigest,
  type NativeFileAnalysisSummaryV1,
} from './native-analysis-state.js';
import { NativeCapabilityCoverageV2Schema } from './native-ipc-v2.js';

// Provider-owned structural contracts. Deliberately no Storage dependency.
interface JsonFile {
  readonly sourceFileId: string;
  readonly sourcePath: string;
  readonly contentFingerprint: string;
  readonly summaryJson: string;
}
interface Expectation {
  readonly repositoryId: string;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly revisionId: string;
  readonly contentFingerprint: string;
  readonly language: {
    readonly languageId: string;
    readonly grammarVersion: string;
    readonly analyzerVersion: string;
    readonly compatibilityVersion: string;
  };
  readonly resolverVersion: string;
  readonly normalizerVersion: string;
  readonly policyFingerprint: string;
  readonly requestedCapabilities: readonly string[];
}
interface ValidationInput {
  readonly headerJson: string;
  readonly files: Iterable<JsonFile>;
  readonly expected: Expectation;
  readonly maxSerializedBytes: number;
  readonly memoryBudgetBytes: number;
  readonly fullStage?: {
    readSourceFiles(): Iterable<SourceFile>;
    readProviderNodes(): Iterable<ProviderNode>;
    readProviderEdges(): Iterable<ProviderEdge>;
    readCoverage(): Iterable<unknown>;
    readDiagnostics(): Iterable<ProviderSnapshotDiagnostic>;
  };
}

export class NativeStateValidationError extends Error {
  constructor(
    readonly nativeStateReason: 'INVALID' | 'INCOMPATIBLE' | 'RESOURCE_LIMIT_EXCEEDED',
    message: string,
  ) {
    super(message);
    this.name = 'NativeStateValidationError';
  }
}
function invalid(message: string): never {
  throw new NativeStateValidationError('INVALID', message);
}
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && isDeepStrictEqual([...a].sort(), [...b].sort());
}
function syntheticId(prefix: string, value: string): string {
  return `${prefix}:${createHash('sha256')
    .update(`${prefix}\0${Buffer.byteLength(value)}:${value}`)
    .digest('hex')}`;
}
function multisetEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  // Strict schemas fix field ordering before comparison; object key order is
  // not used as a semantic discriminator. Multiplicity must still be retained.
  const consumed = new Set<number>();
  for (const item of left) {
    const index = right.findIndex(
      (candidate, i) => !consumed.has(i) && isDeepStrictEqual(item, candidate),
    );
    if (index < 0) return false;
    consumed.add(index);
  }
  return left.length === right.length;
}

function checkStage(
  input: ValidationInput,
  summaries: readonly NativeFileAnalysisSummaryV1[],
): void {
  const stage = input.fullStage!;
  const files = new Map(summaries.map((s) => [s.sourceFile.id, s]));
  const observedFiles = new Set<string>();
  for (const raw of stage.readSourceFiles()) {
    const file = SourceFileSchema.parse(raw);
    if (observedFiles.has(file.id) || !isDeepStrictEqual(files.get(file.id)?.sourceFile, file))
      invalid('Summary source differs from staged source');
    observedFiles.add(file.id);
  }
  if (observedFiles.size !== files.size) invalid('Missing staged source');

  const owners = new Map<
    string,
    {
      summary: NativeFileAnalysisSummaryV1;
      fact: NativeFileAnalysisSummaryV1['emittedFacts'][number];
    }[]
  >();
  for (const summary of summaries)
    for (const fact of summary.emittedFacts) {
      const key = `${fact.factType}\0${fact.providerFactId}`;
      const group = owners.get(key) ?? [];
      group.push({ summary, fact });
      owners.set(key, group);
    }
  const observed = new Map<string, ProviderNode | ProviderEdge>();
  let snapshotId: string | undefined;
  const inspect = (factType: 'NODE' | 'EDGE', fact: ProviderNode | ProviderEdge) => {
    const key = `${factType}\0${fact.providerFactId}`;
    if (observed.has(key)) invalid('Duplicate staged identity');
    observed.set(key, fact);
    snapshotId ??= fact.providerSnapshotId;
    if (
      fact.repositoryId !== input.expected.repositoryId ||
      fact.revisionId !== input.expected.revisionId ||
      fact.providerId !== input.expected.providerId ||
      fact.providerSnapshotId !== snapshotId
    )
      invalid('Staged fact context differs');
    const group = owners.get(key);
    const digest = computeNativeFactContentDigest(fact);
    if (!group || group.some((owner) => owner.fact.contentDigest !== digest))
      invalid('Emitted fact digest differs');
    for (const owner of group) {
      if (owner.fact.ownership === 'FILE') {
        if (fact.sourceRange?.sourceFileId === owner.summary.sourceFile.id) continue;
        if (
          factType === 'NODE' &&
          fact.providerKind === 'java.compilation_unit' &&
          fact.sourceRange === null &&
          fact.providerFactId ===
            syntheticId('java-compilation-unit-v1', owner.summary.sourceFile.path)
        )
          continue;
        invalid('FILE ownership differs');
      } else {
        if (
          factType !== 'NODE' ||
          fact.providerKind !== 'java.package_container' ||
          fact.sourceRange !== null ||
          fact.providerFactId !==
            syntheticId('java-package-container-v1', (fact as ProviderNode).name)
        )
          invalid('Illegal SHARED fact');
        const node = fact as ProviderNode;
        const declaring = summaries.filter((s) =>
          s.symbols.some(
            (symbol) =>
              symbol.providerKind === 'java.package' &&
              symbol.name === node.name &&
              symbol.qualifiedName === node.qualifiedName,
          ),
        );
        if (
          !declaring.includes(owner.summary) ||
          declaring.length !== group.length ||
          declaring.some((s) => !group.some((o) => o.summary === s))
        )
          invalid('SHARED owners are not complete');
      }
    }
  };
  for (const raw of stage.readProviderNodes()) inspect('NODE', ProviderNodeSchema.parse(raw));
  for (const raw of stage.readProviderEdges()) inspect('EDGE', ProviderEdgeSchema.parse(raw));
  if (observed.size !== owners.size) invalid('Missing emitted fact');
  for (const summary of summaries)
    for (const symbol of summary.symbols) {
      const node = observed.get(`NODE\0${symbol.providerFactId}`) as ProviderNode | undefined;
      const { sourceFileId: _file, ...span } = node?.sourceRange ?? {};
      if (
        !node ||
        node.sourceRange?.sourceFileId !== summary.sourceFile.id ||
        node.providerKind !== symbol.providerKind ||
        node.name !== symbol.name ||
        node.qualifiedName !== symbol.qualifiedName ||
        !isDeepStrictEqual(span, symbol.span)
      )
        invalid('Symbol is not grounded in staged facts');
    }
  const coverage = [...stage.readCoverage()].map((v) => NativeCapabilityCoverageV2Schema.parse(v));
  if (
    !multisetEqual(
      summaries.flatMap((s) => s.coverage),
      coverage,
    )
  )
    invalid('Coverage multiset differs');
  const diagnostics = [...stage.readDiagnostics()].map((v) =>
    ProviderSnapshotDiagnosticSchema.parse(v),
  );
  const local = diagnostics.filter((d) => d.sourceRange !== null);
  const declared = summaries.flatMap((s) => s.diagnostics);
  if (
    !multisetEqual(
      declared.filter((d) => d.sourceRange !== null),
      local,
    )
  )
    invalid('Diagnostic multiset differs');
  const sourceLess = declared.filter((d) => d.sourceRange === null);
  if (
    sourceLess.some((d, i) => sourceLess.slice(0, i).some((prior) => isDeepStrictEqual(prior, d)))
  )
    invalid('Source-less diagnostic has duplicate originating files');
  // Truly run-global diagnostics can remain stream-only; every file-owned
  // source-less diagnostic must occur in that same stream.
  for (const d of sourceLess)
    if (!diagnostics.some((v) => isDeepStrictEqual(v, d)))
      invalid('Unobserved source-less diagnostic');
}

export function validateNativeStateCandidate(input: ValidationInput): {
  readonly expected: Expectation;
  readonly headerJson: string;
  readonly summaryDigest: string;
  readonly files: readonly JsonFile[];
} {
  if (
    !Number.isSafeInteger(input.maxSerializedBytes) ||
    input.maxSerializedBytes <= 0 ||
    input.maxSerializedBytes > 1_000_000 ||
    !Number.isSafeInteger(input.memoryBudgetBytes) ||
    input.memoryBudgetBytes <= 0
  )
    throw new NativeStateValidationError('RESOURCE_LIMIT_EXCEEDED', 'Invalid metadata budget');
  let bytes = Buffer.byteLength(input.headerJson);
  const rows: JsonFile[] = [];
  const decoded: unknown[] = [];
  try {
    if (bytes > input.maxSerializedBytes)
      throw new NativeStateValidationError(
        'RESOURCE_LIMIT_EXCEEDED',
        'Metadata envelope too large',
      );
    for (const row of input.files) {
      bytes += Buffer.byteLength(row.summaryJson);
      if (bytes > input.maxSerializedBytes)
        throw new NativeStateValidationError(
          'RESOURCE_LIMIT_EXCEEDED',
          'Metadata envelope too large',
        );
      rows.push({ ...row });
      decoded.push(JSON.parse(row.summaryJson));
    }
    const bundle = NativeAnalysisStateBundleV1Schema.parse({
      header: JSON.parse(input.headerJson),
      summaries: decoded,
    });
    for (const [i, summary] of bundle.summaries.entries()) {
      const row = rows[i]!;
      if (
        row.sourceFileId !== summary.sourceFile.id ||
        row.sourcePath !== summary.sourceFile.path ||
        row.contentFingerprint !== summary.sourceFile.contentFingerprint
      )
        invalid('Summary columns differ');
    }
    const {
      schemaVersion: _version,
      sourceFileCount: _count,
      summaryDigest: _digest,
      ...context
    } = bundle.header;
    const { requestedCapabilities: actualCaps, ...actual } = context;
    const { requestedCapabilities: expectedCaps, ...expected } = input.expected;
    if (!isDeepStrictEqual(actual, expected) || !sameSet(actualCaps, expectedCaps))
      throw new NativeStateValidationError('INCOMPATIBLE', 'Native state compatibility differs');
    if (input.fullStage) checkStage(input, bundle.summaries);
    return {
      expected: input.expected,
      headerJson: input.headerJson,
      summaryDigest: bundle.header.summaryDigest,
      files: rows,
    };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError)
      invalid('Malformed native state');
    throw error;
  }
}
