import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderFactRefSchema,
  ProviderNodeSchema,
  ProviderEdgeSchema,
  ProviderSnapshotSchema,
  ProviderSnapshotDiagnosticSchema,
  SourceFileSchema,
  type CanonicalNode,
  type CanonicalEdge,
  type Evidence,
  type FactEvidence,
  type ProviderFactBinding,
  type ProviderFactRef,
  type ProviderNode,
  type ProviderEdge,
  type ProviderSnapshot,
  type SourceFile,
} from '@codeatlas/ir';
import { z } from 'zod';
import {
  NativeAnalysisStateBundleV1Schema,
  computeNativeFactContentDigest,
  type NativeAnalysisStateBundleV1,
  type NativeFileAnalysisSummaryV1,
} from './native-analysis-state.js';
import {
  NativeStateValidationError,
  validateNativeStateCandidate,
} from './native-analysis-validation.js';
import { NativeCapabilityCoverageV2Schema } from './native-ipc-v2.js';
import { boundedJson } from './native-request-json.js';
import { normalizeJavaNode } from './java-node-normalizer.js';
import {
  normalizeJavaEdge,
  type NormalizedNodePair,
  type NormalizedEdgePair,
} from './canonical-normalizer.js';
import { collectMergeSupports, type MergeSupport } from './fact-merger-input.js';
import { selectMergedFacts } from './fact-merger-selection.js';
import { providerEvidenceId } from './provider-evidence-identity.js';

type State = ReturnType<typeof validateNativeStateCandidate>;
type StateInput = Parameters<typeof validateNativeStateCandidate>[0];
type Pair<T> = { readonly provider: ProviderFactRef; readonly canonical: T };
interface ActiveSupport {
  readonly canonical: CanonicalNode | CanonicalEdge;
  readonly evidence: Evidence;
  readonly binding: ProviderFactBinding;
  readonly factEvidence: FactEvidence;
  readonly snapshot: Pick<
    ProviderSnapshot,
    | 'id'
    | 'repositoryId'
    | 'providerId'
    | 'providerVersion'
    | 'requestedRevisionId'
    | 'requestedRevisionFingerprint'
    | 'outcome'
  >;
}
/** Structural injection contract; Providers deliberately do not import Storage.
 * Wire checksum/process completion and Rust semantic reconstruction remain
 * mandatory Runtime predecessors. This port attests database applicability,
 * not an independent transport success or permission to publish.
 */
export interface NativeRefreshOverlayInput {
  readonly maxSerializedBytes: number;
  readonly memoryBudgetBytes: number;
  readonly expected: State['expected'];
  readonly baseline: State;
  readonly baselineToken: {
    readonly committedSnapshotCount: number;
    readonly indexedRevisionId: string | null;
    readonly indexedContentFingerprint: string | null;
    readonly states: readonly {
      readonly providerId: string;
      readonly snapshotId: string;
      readonly summaryDigest: string;
    }[];
  };
  readonly snapshot: ProviderSnapshot;
  readonly headerJson: string;
  readonly files: StateInput['files'];
  readonly targetSourceFiles: Iterable<SourceFile>;
  readonly changedSourceFiles: Iterable<SourceFile>;
  readonly activeSupports: Iterable<ActiveSupport>;
  readonly upsertNodes: Iterable<ProviderNode>;
  readonly upsertEdges: Iterable<ProviderEdge>;
  readonly removeNodes: Iterable<ProviderFactRef>;
  readonly removeEdges: Iterable<ProviderFactRef>;
  readonly normalizedNodes: Iterable<Pair<CanonicalNode>>;
  readonly normalizedEdges: Iterable<Pair<CanonicalEdge>>;
  readonly supports: Iterable<MergeSupport>;
  readonly coverage: Iterable<unknown>;
  readonly diagnostics: Iterable<unknown>;
}
const key = (type: string, id: string) => `${type}\0${id}`;
function invalid(message: string): never {
  throw new NativeStateValidationError('INVALID', message);
}
function resource(): never {
  throw new NativeStateValidationError(
    'RESOURCE_LIMIT_EXCEEDED',
    'Native overlay workspace exceeds budget',
  );
}
type Ledger = Map<
  string,
  {
    readonly digest: string;
    readonly ownership: 'FILE' | 'SHARED';
    readonly owners: NativeFileAnalysisSummaryV1[];
  }
>;
function ledger(bundle: NativeAnalysisStateBundleV1): Ledger {
  const rows: Ledger = new Map();
  for (const summary of bundle.summaries)
    for (const fact of summary.emittedFacts) {
      const id = key(fact.factType, fact.providerFactId),
        old = rows.get(id);
      if (old) old.owners.push(summary);
      else
        rows.set(id, { digest: fact.contentDigest, ownership: fact.ownership, owners: [summary] });
    }
  return rows;
}
function synthetic(prefix: string, text: string): string {
  return `${prefix}:${createHash('sha256')
    .update(`${prefix}\0${Buffer.byteLength(text)}:${text}`)
    .digest('hex')}`;
}

export function validateNativeRefreshOverlay(input: NativeRefreshOverlayInput): State {
  if (
    !Number.isSafeInteger(input.memoryBudgetBytes) ||
    input.memoryBudgetBytes <= 0 ||
    !Number.isSafeInteger(input.maxSerializedBytes) ||
    input.maxSerializedBytes <= 0 ||
    input.maxSerializedBytes > 1_000_000
  )
    resource();
  let charged = 0,
    wireEvents = 2;
  const records = new Map<string, number>();
  const charge = (bytes: number) => {
    charged += bytes;
    if (!Number.isSafeInteger(charged) || charged >= input.memoryBudgetBytes) resource();
  };
  const own = <T>(value: unknown, schema: { parse(v: unknown): T }, group = 'metadata'): T => {
    const count = (records.get(group) ?? 0) + 1;
    if (count > 10_000) resource();
    records.set(group, count);
    // Copies are bounded independently; raw observations alone consume the
    // unchanged wire-event ceiling. Every copy still consumes the byte budget.
    if (['operations', 'changed-source', 'observations'].includes(group) && ++wireEvents > 10_000)
      resource();
    let json: string;
    try {
      json = boundedJson(
        value,
        Math.min(1_000_000, Math.floor((input.memoryBudgetBytes - charged - 1) / 2)),
      );
    } catch (error) {
      if (error instanceof Error && /resource limit/.test(error.message)) resource();
      invalid('Non-JSON overlay record');
    }
    charge(2 * Buffer.byteLength(json!));
    return schema.parse(JSON.parse(json!));
  };
  const readState = (
    headerJson: string,
    files: StateInput['files'],
    expected: State['expected'],
  ) => {
    charge(2 * Buffer.byteLength(headerJson));
    function* boundedFiles() {
      for (const row of files) {
        charge(2 * Buffer.byteLength(row.summaryJson));
        yield row;
      }
    }
    const state = validateNativeStateCandidate({
      headerJson,
      files: boundedFiles(),
      expected,
      maxSerializedBytes: input.maxSerializedBytes,
      memoryBudgetBytes: input.memoryBudgetBytes - charged,
    });
    const bundle = NativeAnalysisStateBundleV1Schema.parse({
      header: JSON.parse(state.headerJson),
      summaries: state.files.map((f) => JSON.parse(f.summaryJson)),
    });
    return { state, bundle };
  };
  try {
    const baseline = readState(
      input.baseline.headerJson,
      input.baseline.files,
      input.baseline.expected,
    );
    const target = readState(input.headerJson, input.files, input.expected);
    wireEvents += target.state.files.length;
    if (wireEvents > 10_000) resource();
    const before = ledger(baseline.bundle),
      after = ledger(target.bundle);
    const oldContext = {
      ...baseline.state.expected,
      contentFingerprint: input.expected.contentFingerprint,
    };
    if (
      !isDeepStrictEqual(oldContext, input.expected) ||
      input.baseline.summaryDigest !== baseline.state.summaryDigest
    )
      invalid('Baseline compatibility differs');
    const token = own(
      input.baselineToken,
      z.strictObject({
        committedSnapshotCount: z.number().int().safe().positive(),
        indexedRevisionId: z.string(),
        indexedContentFingerprint: z.string(),
        states: z.array(
          z.strictObject({
            providerId: z.string(),
            snapshotId: z.string(),
            summaryDigest: z.string(),
          }),
        ),
      }),
    );
    const nativeState = token.states.filter((s) => s.providerId === input.expected.providerId);
    if (
      token.indexedRevisionId !== input.expected.revisionId ||
      token.indexedContentFingerprint !== baseline.state.expected.contentFingerprint ||
      nativeState.length !== 1 ||
      nativeState[0]!.summaryDigest !== baseline.state.summaryDigest ||
      new Set(token.states.map((s) => s.providerId)).size !== token.states.length
    )
      invalid('Baseline token differs');
    const snapshot = own(input.snapshot, ProviderSnapshotSchema);
    if (
      snapshot.outcome !== 'SUCCEEDED' ||
      snapshot.repositoryId !== input.expected.repositoryId ||
      snapshot.requestedRevisionId !== input.expected.revisionId ||
      snapshot.requestedRevisionFingerprint !== input.expected.contentFingerprint ||
      snapshot.providerId !== input.expected.providerId ||
      snapshot.providerVersion !== input.expected.providerVersion ||
      token.states.some((s) => s.snapshotId === snapshot.id)
    )
      invalid('Target snapshot differs');
    const files = new Map<string, SourceFile>(),
      paths = new Set<string>();
    for (const value of input.targetSourceFiles) {
      const file = own(value, SourceFileSchema, 'inventory');
      if (
        files.has(file.id) ||
        paths.has(file.path) ||
        file.repositoryId !== input.expected.repositoryId ||
        file.revisionId !== input.expected.revisionId
      )
        invalid('Target inventory differs');
      files.set(file.id, file);
      paths.add(file.path);
    }
    if (
      target.bundle.summaries.length !== files.size ||
      target.bundle.summaries.some(
        (s) => !isDeepStrictEqual(s.sourceFile, files.get(s.sourceFile.id)),
      )
    )
      invalid('Target summaries differ from inventory');
    const expectedChanged = new Map(
      target.bundle.summaries
        .filter((s) => {
          const old = baseline.bundle.summaries.find((b) => b.sourceFile.id === s.sourceFile.id);
          return !old || !isDeepStrictEqual(old.sourceFile, s.sourceFile);
        })
        .map((s) => [s.sourceFile.id, s.sourceFile]),
    );
    const changed = new Set<string>();
    for (const value of input.changedSourceFiles) {
      const f = own(value, SourceFileSchema, 'changed-source');
      if (changed.has(f.id) || !isDeepStrictEqual(expectedChanged.get(f.id), f))
        invalid('Changed source differs');
      changed.add(f.id);
    }
    if (changed.size !== expectedChanged.size) invalid('Missing changed source');

    const native = new Map<string, MergeSupport>(),
      active: MergeSupport[] = [],
      seenEvidence = new Set<string>(),
      seenIdentity = new Set<string>();
    for (const raw of input.activeSupports) {
      const value = own(raw, z.unknown(), 'active-support') as ActiveSupport;
      const evidence = EvidenceSchema.parse(value.evidence),
        binding = ProviderFactBindingSchema.parse(value.binding),
        link = FactEvidenceSchema.parse(value.factEvidence),
        ref = evidence.providerFact;
      const canonical = (ref.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
        value.canonical,
      );
      const s = value.snapshot,
        schema = ProviderSnapshotSchema.shape;
      schema.id.parse(s.id);
      schema.providerVersion.parse(s.providerVersion);
      schema.requestedRevisionFingerprint.parse(s.requestedRevisionFingerprint);
      if (
        evidence.status !== 'ACTIVE' ||
        evidence.repositoryId !== input.expected.repositoryId ||
        evidence.revisionId !== input.expected.revisionId ||
        canonical.repositoryId !== input.expected.repositoryId ||
        canonical.revisionId !== input.expected.revisionId ||
        !isDeepStrictEqual(binding.providerFact, ref) ||
        binding.evidenceId !== evidence.id ||
        link.evidenceId !== evidence.id ||
        binding.providerSnapshotId !== evidence.providerSnapshotId ||
        binding.canonicalFact.id !== canonical.id ||
        binding.canonicalFact.factType !== ref.factType ||
        !isDeepStrictEqual(link.fact, binding.canonicalFact) ||
        s.id !== evidence.providerSnapshotId ||
        s.repositoryId !== evidence.repositoryId ||
        s.requestedRevisionId !== evidence.revisionId ||
        s.providerId !== ref.providerId ||
        s.outcome !== 'SUCCEEDED' ||
        s.id === snapshot.id ||
        evidence.id !==
          providerEvidenceId(
            evidence.repositoryId,
            evidence.revisionId,
            s.id,
            ref.factType,
            ref.providerId,
            ref.providerFactId,
          )
      )
        invalid('Active support provenance differs');
      const identity = JSON.stringify(ref);
      if (seenEvidence.has(evidence.id) || seenIdentity.has(identity))
        invalid('Duplicate active support');
      seenEvidence.add(evidence.id);
      seenIdentity.add(identity);
      const support: MergeSupport = {
        factType: ref.factType,
        canonical,
        evidence,
        binding,
        factEvidence: link,
        snapshotId: s.id,
        inputPath: [],
      };
      active.push(support);
      if (ref.providerId === input.expected.providerId) {
        if (s.providerVersion !== input.expected.providerVersion)
          invalid('Native snapshot version differs');
        native.set(key(ref.factType, ref.providerFactId), support);
      }
    }
    if (native.size !== before.size || [...before.keys()].some((id) => !native.has(id)))
      invalid('Baseline ledger differs from ACTIVE Native support');
    const operations = new Map<
      string,
      { removed: boolean; digest?: string; support?: MergeSupport }
    >();
    for (const [type, values] of [
      ['NODE', input.removeNodes],
      ['EDGE', input.removeEdges],
    ] as const)
      for (const value of values) {
        const ref = own(value, ProviderFactRefSchema, 'operations'),
          id = key(type, ref.providerFactId);
        if (
          ref.factType !== type ||
          ref.providerId !== input.expected.providerId ||
          !before.has(id) ||
          operations.has(id)
        )
          invalid('Invalid removal');
        operations.set(id, { removed: true });
      }
    const rawNodes = new Map<string, ProviderNode>(),
      rawEdges = new Map<string, ProviderEdge>();
    for (const [type, values] of [
      ['NODE', input.upsertNodes],
      ['EDGE', input.upsertEdges],
    ] as const)
      for (const value of values) {
        const fact = own<ProviderNode | ProviderEdge>(
            value,
            type === 'NODE' ? ProviderNodeSchema : ProviderEdgeSchema,
            'operations',
          ),
          id = key(type, fact.providerFactId);
        if (
          operations.has(id) ||
          fact.providerId !== snapshot.providerId ||
          fact.providerSnapshotId !== snapshot.id ||
          fact.repositoryId !== snapshot.repositoryId ||
          fact.revisionId !== snapshot.requestedRevisionId
        )
          invalid('Invalid upsert context');
        operations.set(id, { removed: false, digest: computeNativeFactContentDigest(fact) });
        if (type === 'NODE') rawNodes.set(fact.providerFactId, fact as ProviderNode);
        else rawEdges.set(fact.providerFactId, fact as ProviderEdge);
      }
    const nodePairs: NormalizedNodePair[] = [],
      edgePairs: NormalizedEdgePair[] = [];
    const targetNodes = new Map<string, CanonicalNode>();
    for (const [id, support] of native)
      if (id.startsWith('NODE\0') && after.has(id) && !operations.has(id))
        targetNodes.set(
          support.binding.providerFact.providerFactId,
          support.canonical as CanonicalNode,
        );
    const lookup = {
      get: (id: string) => files.get(id),
      getByPath: (path: string) => [...files.values()].find((f) => f.path === path),
    };
    for (const value of input.normalizedNodes) {
      const pair = own(
          value,
          z.strictObject({ provider: ProviderFactRefSchema, canonical: CanonicalNodeSchema }),
          'normalized',
        ),
        raw = rawNodes.get(pair.provider.providerFactId);
      if (
        !raw ||
        pair.provider.factType !== 'NODE' ||
        pair.provider.providerId !== snapshot.providerId ||
        targetNodes.has(raw.providerFactId) ||
        !isDeepStrictEqual(pair.canonical, normalizeJavaNode(raw, lookup))
      )
        invalid('Normalized node differs');
      targetNodes.set(raw.providerFactId, pair.canonical);
      nodePairs.push({ ...pair, provider: { ...pair.provider, factType: 'NODE' } });
    }
    if (nodePairs.length !== rawNodes.size) invalid('Missing normalized node');
    for (const value of input.normalizedEdges) {
      const pair = own(
          value,
          z.strictObject({ provider: ProviderFactRefSchema, canonical: CanonicalEdgeSchema }),
          'normalized',
        ),
        raw = rawEdges.get(pair.provider.providerFactId);
      if (
        !raw ||
        pair.provider.factType !== 'EDGE' ||
        pair.provider.providerId !== snapshot.providerId ||
        edgePairs.some((p) => p.provider.providerFactId === raw.providerFactId) ||
        !isDeepStrictEqual(pair.canonical, normalizeJavaEdge(raw, targetNodes, lookup))
      )
        invalid('Normalized edge differs');
      edgePairs.push({ ...pair, provider: { ...pair.provider, factType: 'EDGE' } });
    }
    if (edgePairs.length !== rawEdges.size) invalid('Missing normalized edge');
    const expectedSupports = collectMergeSupports({
      repositoryId: snapshot.repositoryId,
      revisionId: snapshot.requestedRevisionId,
      observations: [{ snapshot, nodes: nodePairs, edges: edgePairs }],
    });
    const supplied = new Map<string, MergeSupport>();
    for (const value of input.supports) {
      const support = own(value, z.unknown(), 'upsert-support') as MergeSupport,
        ref = support.binding.providerFact,
        id = key(ref.factType, ref.providerFactId);
      const expected = expectedSupports.find(
        (s) => key(s.factType, s.binding.providerFact.providerFactId) === id,
      );
      if (
        !expected ||
        supplied.has(id) ||
        !isDeepStrictEqual({ ...support, inputPath: [] }, { ...expected, inputPath: [] })
      )
        invalid('Upsert support differs');
      supplied.set(id, support);
      operations.get(id)!.support = support;
    }
    if (supplied.size !== expectedSupports.length) invalid('Missing upsert support');
    for (const id of new Set([...before.keys(), ...after.keys(), ...operations.keys()])) {
      const old = before.get(id),
        next = after.get(id),
        op = operations.get(id);
      if (!next) {
        if (!old || !op?.removed) invalid('Missing removal');
      } else if (!old || old.digest !== next.digest) {
        if (!op || op.removed || op.digest !== next.digest) invalid('Missing or forged upsert');
      } else if (op) invalid('Redundant operation');
      if (
        next &&
        old &&
        !op &&
        (old.ownership !== next.ownership ||
          (next.ownership === 'FILE' &&
            !isDeepStrictEqual(
              old.owners.map((s) => s.sourceFile.id),
              next.owners.map((s) => s.sourceFile.id),
            )))
      )
        invalid('Retained ownership differs');
    }
    const project = (
      rows: Ledger,
      supports: Map<string, MergeSupport>,
      bundle: NativeAnalysisStateBundleV1,
    ) => {
      const source = new Map<string, SourceFile>(
        bundle.summaries.map((s) => [s.sourceFile.id, s.sourceFile]),
      );
      const lookup = {
        get: (id: string) => source.get(id),
        getByPath: (path: string) => [...source.values()].find((f) => f.path === path),
      };
      for (const [id, row] of rows) {
        const support = supports.get(id);
        if (!support) invalid('Unattested ledger identity');
        const fact = support!.canonical;
        if (row.ownership === 'FILE') {
          if (row.owners.length !== 1) invalid('FILE owner differs');
          const owner = row.owners[0]!,
            ref = support!.binding.providerFact;
          if (ref.factType === 'NODE') {
            const symbol = owner.symbols.find((s) => s.providerFactId === ref.providerFactId);
            const unit =
              ref.providerFactId === synthetic('java-compilation-unit-v1', owner.sourceFile.path);
            if (!symbol && !unit) invalid('Missing summary symbol');
            // Projection from summary fields, never raw-fact recovery/digest
            // inversion from the selected Canonical representative.
            const projected = normalizeJavaNode(
              ProviderNodeSchema.parse({
                providerId: input.expected.providerId,
                providerFactId: ref.providerFactId,
                providerSnapshotId: support!.snapshotId,
                repositoryId: input.expected.repositoryId,
                revisionId: input.expected.revisionId,
                providerKind: symbol?.providerKind ?? 'java.compilation_unit',
                name: symbol?.name ?? owner.sourceFile.path,
                qualifiedName: symbol?.qualifiedName ?? owner.sourceFile.path,
                sourceRange: symbol ? { sourceFileId: owner.sourceFile.id, ...symbol.span } : null,
                confidence: { score: 1, method: 'parser', reasons: [] },
              }),
              lookup,
            );
            if (!isDeepStrictEqual(projected, fact)) invalid('Summary symbol projection differs');
          } else if (fact.sourceRange?.sourceFileId !== owner.sourceFile.id)
            invalid('EDGE owner differs');
        } else {
          const symbol = row.owners[0]!.symbols.find(
            (s) =>
              s.providerKind === 'java.package' &&
              id === key('NODE', synthetic('java-package-container-v1', s.name)),
          );
          if (
            !symbol ||
            fact.kind !== 'PACKAGE' ||
            fact.sourceRange !== null ||
            fact.name !== symbol.name ||
            fact.qualifiedName !== symbol.qualifiedName
          )
            invalid('Illegal SHARED support');
          const projected = normalizeJavaNode(
            ProviderNodeSchema.parse({
              providerId: input.expected.providerId,
              providerFactId: support.binding.providerFact.providerFactId,
              providerSnapshotId: support.snapshotId,
              repositoryId: input.expected.repositoryId,
              revisionId: input.expected.revisionId,
              providerKind: 'java.package_container',
              name: symbol.name,
              qualifiedName: symbol.qualifiedName,
              sourceRange: null,
              confidence: { score: 1, method: 'parser', reasons: [] },
            }),
            lookup,
          );
          if (!isDeepStrictEqual(projected, fact)) invalid('SHARED projection differs');
          const declaring = bundle.summaries.filter((s) =>
            s.symbols.some(
              (n) =>
                n.providerKind === 'java.package' &&
                n.name === symbol.name &&
                n.qualifiedName === symbol.qualifiedName,
            ),
          );
          if (
            !isDeepStrictEqual(
              new Set(declaring.map((s) => s.sourceFile.id)),
              new Set(row.owners.map((s) => s.sourceFile.id)),
            )
          )
            invalid('Incomplete SHARED owners');
        }
      }
      for (const s of bundle.summaries)
        for (const symbol of s.symbols)
          if (!rows.has(key('NODE', symbol.providerFactId))) invalid('Unemitted symbol');
    };
    project(before, native, baseline.bundle);
    const targetNative = new Map(native);
    for (const [id, op] of operations) {
      targetNative.delete(id);
      if (!op.removed) targetNative.set(id, op.support!);
    }
    project(after, targetNative, target.bundle);
    const finalSupports = active.filter(
      (s) =>
        s.binding.providerFact.providerId !== snapshot.providerId ||
        !operations.has(key(s.factType, s.binding.providerFact.providerFactId)),
    );
    finalSupports.push(...supplied.values());
    for (const s of finalSupports)
      if (s.canonical.sourceRange !== null && !files.has(s.canonical.sourceRange.sourceFileId))
        invalid('Dangling retained source');
    selectMergedFacts(finalSupports);
    const observedCoverage = new Map<string, unknown>();
    for (const raw of input.coverage) {
      const value = own(raw, NativeCapabilityCoverageV2Schema, 'observations'),
        id = key(value.sourceFileId ?? '', value.capability);
      if (observedCoverage.has(id) || value.coverage === 'PARTIAL')
        invalid('Invalid target coverage');
      observedCoverage.set(id, value);
    }
    const expectedCoverage = target.bundle.summaries.flatMap((s) => s.coverage);
    if (
      observedCoverage.size !== expectedCoverage.length ||
      expectedCoverage.some(
        (c) => !isDeepStrictEqual(c, observedCoverage.get(key(c.sourceFileId ?? '', c.capability))),
      )
    )
      invalid('Coverage differs');
    const diagnostics = new Map<string, number>();
    for (const s of target.bundle.summaries)
      for (const d of s.diagnostics) {
        const id = JSON.stringify(d);
        if (d.sourceRange === null && diagnostics.has(id)) invalid('Duplicate diagnostic origin');
        diagnostics.set(id, (diagnostics.get(id) ?? 0) + 1);
      }
    for (const raw of input.diagnostics) {
      const d = own(raw, ProviderSnapshotDiagnosticSchema, 'observations'),
        id = JSON.stringify(d),
        n = diagnostics.get(id) ?? 0;
      if (d.sourceRange === null && !diagnostics.has(id)) continue;
      if (n === 0) invalid('Unexpected diagnostic');
      diagnostics.set(id, n - 1);
    }
    if ([...diagnostics.values()].some((n) => n !== 0)) invalid('Missing diagnostic');
    return target.state;
  } catch (error) {
    if (error instanceof NativeStateValidationError) throw error;
    invalid('Malformed native overlay');
  }
}
