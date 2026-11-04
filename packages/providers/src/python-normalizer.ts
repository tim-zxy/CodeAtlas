import {
  chargeCodeSyntaxJSON,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import { NativeSyntaxContractError } from './native-syntax-ipc.js';
import { z } from 'zod';
import {
  CanonicalNodeSchema,
  ProviderNodeSchema,
  ProviderEdgeSchema,
  SourceFileSchema,
  RepoBasisSchema,
  ProviderIdSchema,
  EntityIdSchema,
  ensurePhase1Data,
  type CanonicalNode,
  type ProviderFactId,
} from '@codeatlas/ir';
import { nodeFactKey, canonicalFactId } from './canonical-fact-identity.js';
import {
  CanonicalNormalizationError,
  type CanonicalNormalizationErrorCode,
} from './java-node-normalizer.js';
import {
  normalizeCanonicalCodeEdge,
  type NormalizedNodePair,
  type NormalizedEdgePair,
} from './canonical-normalizer.js';
import { NATIVE_CLIENT_HARD_LIMITS } from './native-client.js';
import { SyntaxTargetSourceSchema } from './native-syntax-owner-binding.js';

export const PYTHON_NORMALIZER_VERSION = '1';
const InputSchema = z.strictObject({
  basis: RepoBasisSchema,
  providerId: ProviderIdSchema,
  providerSnapshotId: EntityIdSchema,
  sourceFiles: z.array(SourceFileSchema),
  nodes: z.array(ProviderNodeSchema),
  edges: z.array(ProviderEdgeSchema),
});
const SourceInputSchema = InputSchema.omit({ basis: true }).extend({
  targetSource: SyntaxTargetSourceSchema,
});
type PythonSourceInput = z.infer<typeof SourceInputSchema>;
export interface NormalizedPythonObservation {
  readonly nodePairs: readonly NormalizedNodePair[];
  readonly edgePairs: readonly NormalizedEdgePair[];
}
function check(
  value: unknown,
  code: CanonicalNormalizationErrorCode = 'INVALID_FACT',
): asserts value {
  if (!value) throw new CanonicalNormalizationError(code, [], 'Invalid Python observation');
}
function unique(values: readonly string[]): void {
  check(new Set(values).size === values.length);
}
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
function checkScalarUnicode(value: unknown): void {
  if (typeof value === 'string') check(value.isWellFormed());
  if (value !== null && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      check(key.isWellFormed());
      checkScalarUnicode(child);
    }
}
/** Pure provider-to-Canonical mapping; trusted workflows still authenticate basis and publish. */
export function normalizePythonObservation(value: unknown): NormalizedPythonObservation {
  try {
    ensurePhase1Data(value);
    const input = InputSchema.parse(value);
    return normalizePythonSourceInput({
      targetSource: {
        repositoryId: input.basis.repositoryId,
        revisionId: input.basis.revisionId,
        contentFingerprint: input.basis.contentFingerprint,
      },
      providerId: input.providerId,
      providerSnapshotId: input.providerSnapshotId,
      sourceFiles: input.sourceFiles,
      nodes: input.nodes,
      edges: input.edges,
    });
  } catch (error) {
    if (error instanceof CanonicalNormalizationError) throw error;
    throw new CanonicalNormalizationError('INVALID_FACT', [], 'Invalid Python observation');
  }
}
/** Provisional mapping only; does not authenticate Source, completeness or publication. */
export function normalizePythonSourceObservation(value: unknown): NormalizedPythonObservation {
  try {
    ensurePhase1Data(value);
    const input = SourceInputSchema.parse(value);
    checkScalarUnicode(input);
    return normalizePythonSourceInput(input);
  } catch (error) {
    if (error instanceof CanonicalNormalizationError) throw error;
    throw new CanonicalNormalizationError('INVALID_FACT', [], 'Invalid Python observation');
  }
}
function normalizePythonSourceInput(
  input: PythonSourceInput,
  context: CodeSyntaxCompositionBudget | null = null,
): NormalizedPythonObservation {
  const b = input.targetSource;
  if (context) {
    for (const v of [input.sourceFiles, input.nodes, input.edges])
      chargeCodeSyntaxJSON(v, 'PROTOCOL_CORRUPTION', context);
  }
  check(
    input.nodes.length + input.edges.length <= NATIVE_CLIENT_HARD_LIMITS.maxEvents &&
      input.sourceFiles.length <= NATIVE_CLIENT_HARD_LIMITS.maxEvents,
  );
  unique(input.nodes.map((n) => n.providerFactId));
  unique(input.edges.map((e) => e.providerFactId));
  unique(input.sourceFiles.map((f) => f.id));
  unique(input.sourceFiles.map((f) => f.path));
  const files = new Map(input.sourceFiles.map((f) => [f.id, f]));
  for (const f of input.sourceFiles)
    check(f.repositoryId === b.repositoryId && f.revisionId === b.revisionId, 'INVALID_CONTEXT');
  function factContext(f: (typeof input.nodes)[number] | (typeof input.edges)[number]) {
    check(
      f.repositoryId === b.repositoryId &&
        f.revisionId === b.revisionId &&
        f.providerId === input.providerId &&
        f.providerSnapshotId === input.providerSnapshotId,
      'INVALID_CONTEXT',
    );
    check(f.sourceRange !== null);
    const file = files.get(f.sourceRange.sourceFileId);
    check(file, 'MISSING_REFERENCE');
    check(
      file.languageHint === 'python' &&
        file.classification.contentKind === 'TEXT' &&
        ['SOURCE', 'TEST'].includes(file.classification.role),
      'INVALID_CONTEXT',
    );
    return file;
  }
  const nodePairs: NormalizedNodePair[] = [],
    nodes = new Map<ProviderFactId, CanonicalNode>();
  for (const n of input.nodes) {
    const file = factContext(n);
    check(n.qualifiedName !== null);
    let kind: 'MODULE' | 'SYMBOL';
    let fields: (string | number)[];
    if (n.providerKind === 'python.module') {
      check(String(n.name) === String(file.path) && String(n.qualifiedName) === String(file.path));
      kind = 'MODULE';
      fields = [b.repositoryId, b.revisionId, kind, file.path];
    } else if (n.providerKind === 'python.symbol') {
      check(
        n.qualifiedName.startsWith(file.path + '::') &&
          (n.qualifiedName === file.path + '::' + n.name || n.qualifiedName.endsWith('.' + n.name)),
      );
      kind = 'SYMBOL';
      const r = n.sourceRange!;
      fields = [
        b.repositoryId,
        b.revisionId,
        kind,
        'FUNCTION',
        n.qualifiedName,
        r.sourceFileId,
        r.startLine,
        r.startColumn,
        r.endLine,
        r.endColumn,
      ];
    } else {
      check(false, 'UNSUPPORTED_KIND');
    }
    if (context) chargeCodeSyntaxJSON(fields, 'PROTOCOL_CORRUPTION', context);
    const factKey = nodeFactKey(fields);
    const canonicalId = canonicalFactId('NODE', factKey);
    if (context) {
      chargeCodeSyntaxJSON(factKey, 'PROTOCOL_CORRUPTION', context);
      chargeCodeSyntaxJSON(canonicalId, 'PROTOCOL_CORRUPTION', context);
    }
    const canonical = CanonicalNodeSchema.parse({
      id: canonicalId,
      factKey,
      repositoryId: b.repositoryId,
      revisionId: b.revisionId,
      name: n.name,
      qualifiedName: n.qualifiedName,
      sourceRange: kind === 'MODULE' ? null : n.sourceRange,
      confidence: n.confidence,
      kind,
      ...(kind === 'SYMBOL' ? { symbolKind: 'FUNCTION' } : {}),
    });
    const pair: NormalizedNodePair = {
      provider: { factType: 'NODE', providerId: n.providerId, providerFactId: n.providerFactId },
      canonical,
    };
    if (context) chargeCodeSyntaxJSON(pair, 'PROTOCOL_CORRUPTION', context);
    nodes.set(n.providerFactId, canonical);
    nodePairs.push(pair);
  }
  const edgePairs: NormalizedEdgePair[] = [];
  for (const e of input.edges) {
    factContext(e);
    check(['python.import', 'python.reference'].includes(e.providerKind), 'UNSUPPORTED_KIND');
    if (context) chargeCodeSyntaxJSON(e, 'PROTOCOL_CORRUPTION', context);
    const canonical = normalizeCanonicalCodeEdge(
      e.providerKind === 'python.import' ? 'IMPORT' : 'REFERENCE',
      e,
      nodes,
      files,
    );
    const pair: NormalizedEdgePair = {
      provider: { factType: 'EDGE', providerId: e.providerId, providerFactId: e.providerFactId },
      canonical,
    };
    if (context) chargeCodeSyntaxJSON(pair, 'PROTOCOL_CORRUPTION', context);
    edgePairs.push(pair);
  }
  unique(nodePairs.map((p) => p.canonical.id));
  unique(edgePairs.map((p) => p.canonical.id));
  const order = (
    a: NormalizedNodePair | NormalizedEdgePair,
    b: NormalizedNodePair | NormalizedEdgePair,
  ) =>
    a.canonical.factKey < b.canonical.factKey
      ? -1
      : a.canonical.factKey > b.canonical.factKey
        ? 1
        : 0;
  const result = { nodePairs: nodePairs.sort(order), edgePairs: edgePairs.sort(order) };
  if (context) chargeCodeSyntaxJSON(result, 'PROTOCOL_CORRUPTION', context);
  return freezeDeep(result);
}

/** Module-private budgeted path; export-star deliberately does not forward a default export. */
export default function normalizePythonSourceObservationWithBudget(
  value: unknown,
  context: CodeSyntaxCompositionBudget,
): NormalizedPythonObservation {
  try {
    chargeCodeSyntaxJSON(value, 'PROTOCOL_CORRUPTION', context);
    ensurePhase1Data(value);
    const input = SourceInputSchema.parse(value);
    chargeCodeSyntaxJSON(input, 'PROTOCOL_CORRUPTION', context);
    checkScalarUnicode(input);
    return normalizePythonSourceInput(input, context);
  } catch (error) {
    if (error instanceof NativeSyntaxContractError && error.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw error;
    if (error instanceof CanonicalNormalizationError) throw error;
    throw new CanonicalNormalizationError('INVALID_FACT', [], 'Invalid Python observation');
  }
}
