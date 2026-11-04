import {
  remainingCompositionLimits,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import collectMergeSupportsWithBudget from './fact-merger-input.js';
import selectMergedFactsWithBudget from './fact-merger-selection.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import { z } from 'zod';
import {
  SourceFileSchema,
  ProviderSnapshotSchema,
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  RepoBasisSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderFactRefSchema,
  EntityIdSchema,
  type SourceFile,
  type ProviderSnapshot,
  type CanonicalNode,
  type CanonicalEdge,
  type RepoBasis,
  type ProviderFactRef,
} from '@codeatlas/ir';
import { SyntaxTargetSourceSchema } from './native-syntax-owner-binding.js';
import {
  collectMergeSupports,
  type MergeObservation,
  type MergeSupport,
} from './fact-merger-input.js';
import { selectMergedFacts } from './fact-merger-selection.js';
import {
  chargeCompositionJSON,
  freezeComposition,
  NativeCompositionError,
  type CompositionBudget,
} from './native-composition-input.js';
type TargetSource = z.infer<typeof SyntaxTargetSourceSchema>;
type Digest = string;
export interface HistoryTransitionLimits {
  readonly maxSerializedBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
}
export interface HistoryContractIdentity {
  readonly providerId: string;
  readonly extractor: string;
  readonly normalizer: string;
  readonly contract: string;
  readonly policy: string;
}
export interface HistoryDependencyUnit {
  readonly id: string;
  readonly providerId: string;
  readonly kind: 'PYTHON_FILE' | 'JAVA_GROUP' | 'PROVIDER_SCOPE';
  readonly sourceFileIds: readonly string[];
}
export type HistorySupport = Omit<MergeSupport, 'inputPath'> & {
  readonly dependencyUnitIds: readonly string[] | null;
  readonly valueDigest: Digest;
};
export interface HistoryCoverage {
  readonly unitId: string;
  readonly facet: string;
  readonly originSnapshotId: string;
  readonly coverage: 'COMPLETE';
}
export interface HistorySyntaxOrigin {
  readonly id: string;
  readonly unitId: string;
  readonly originSnapshotId: string;
  readonly valueDigest: Digest;
  readonly basis: RepoBasis;
}
export interface DeclaredActivationState {
  readonly basis: RepoBasis;
  readonly repositoryLocatorDigest: Digest;
  readonly inventory: readonly SourceFile[];
  readonly contracts: readonly HistoryContractIdentity[];
  readonly units: readonly HistoryDependencyUnit[];
  readonly snapshots: readonly ProviderSnapshot[];
  readonly nodes: readonly CanonicalNode[];
  readonly edges: readonly CanonicalEdge[];
  readonly supports: readonly HistorySupport[];
  readonly coverage: readonly HistoryCoverage[];
  readonly syntaxOrigins: readonly HistorySyntaxOrigin[];
}
export interface DeclaredHistoryRecord {
  readonly activationId: string;
  readonly parent: null | {
    readonly activationId: string;
    readonly repositoryId: string;
    readonly revisionId: string;
  };
  readonly state: DeclaredActivationState;
}
export interface DeclaredNativeObservation {
  readonly observation: MergeObservation;
  readonly units: readonly HistoryDependencyUnit[];
  readonly supportDependencies: readonly {
    readonly providerFact: ProviderFactRef;
    readonly unitIds: readonly string[];
  }[];
  readonly coverage: readonly HistoryCoverage[];
  readonly requestIdentity: Digest;
  readonly outputIdentity: Digest;
  readonly settlement: 'DECLARED_SUCCEEDED';
}
export interface HistoryTransitionPacket {
  readonly history: DeclaredHistoryRecord | null;
  readonly current: DeclaredActivationState | null;
  readonly expectedActivationId: string | null;
  readonly expectedOldBasis: RepoBasis | null;
  readonly target: {
    readonly source: TargetSource;
    readonly repositoryLocatorDigest: Digest;
    readonly inventory: readonly SourceFile[];
    readonly contracts: readonly HistoryContractIdentity[];
  };
  readonly observation: DeclaredNativeObservation | null;
}

export interface HistoryTransitionDraft {
  readonly kind: 'TRANSITION_DRAFT' | 'NO_OP_DRAFT';
  readonly activationId: string;
  readonly oldBasis: RepoBasis;
  readonly targetSource: TargetSource;
  readonly historyDigest: Digest;
  readonly ledgerDigest: Digest;
  readonly diff: readonly {
    readonly kind: 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'REMOVED';
    readonly before: SourceFile | null;
    readonly after: SourceFile | null;
  }[];
  readonly supportDecisions: readonly {
    readonly evidenceId: string;
    readonly action: 'RETAIN' | 'SUPERSEDE' | 'INVALIDATE';
    readonly replacementEvidenceId: string | null;
  }[];
  readonly addedEvidenceIds: readonly string[];
  readonly survivingFactKeys: readonly {
    readonly factType: 'NODE' | 'EDGE';
    readonly id: string;
  }[];
  readonly coverageOrigins: readonly HistoryCoverage[];
  readonly syntaxRequirements: readonly {
    readonly originId: string;
    readonly action: 'REVALIDATE_FINAL_BASIS' | 'RETIRE_ORIGIN';
  }[];
}

export type HistoryTransitionErrorCode =
  | 'INVALID_HISTORY'
  | 'HISTORY_UNAVAILABLE'
  | 'HISTORY_CHANGED'
  | 'FULL_ANALYSIS_REQUIRED'
  | 'OTHER_PROVIDER_REVALIDATION_REQUIRED'
  | 'RESOURCE_LIMIT_EXCEEDED';
export class HistoryTransitionError extends Error {
  constructor(readonly code: HistoryTransitionErrorCode) {
    super(code);
    this.name = 'HistoryTransitionError';
  }
}
export interface PreparedHistoryTransition {
  readonly packet: HistoryTransitionPacket;
  readonly limits: HistoryTransitionLimits;
  readonly budget: CompositionBudget;
}
export function historyRequire(
  value: unknown,
  code: HistoryTransitionErrorCode = 'INVALID_HISTORY',
): asserts value {
  if (!value) throw new HistoryTransitionError(code);
}
export function chargeHistoryJSON(
  value: unknown,
  limits: HistoryTransitionLimits,
  budget: CompositionBudget,
): string {
  try {
    return chargeCompositionJSON(value, limits, budget);
  } catch (e) {
    throw new HistoryTransitionError(
      e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED'
        ? 'RESOURCE_LIMIT_EXCEEDED'
        : 'INVALID_HISTORY',
    );
  }
}
export function historyDraftDigest(
  value: unknown,
  limits: HistoryTransitionLimits,
  budget: CompositionBudget,
): string {
  const owned = JSON.parse(chargeHistoryJSON(value, limits, budget)) as unknown;
  // Reserve the equally sized ordered representation before constructing it.
  chargeHistoryJSON(owned, limits, budget);
  const fragments: string[] = [];
  function* entries(v: object): Generator<unknown> {
    if (Array.isArray(v)) {
      fragments.push('[');
      for (let i = 0; i < v.length; i++) {
        if (i) fragments.push(',');
        yield v[i];
      }
      fragments.push(']');
    } else {
      fragments.push('{');
      let first = true;
      for (const key of Object.keys(v).sort(historyCompare)) {
        if (!first) fragments.push(',');
        first = false;
        fragments.push(JSON.stringify(key), ':');
        yield (v as Record<string, unknown>)[key];
      }
      fragments.push('}');
    }
  }
  const stack: Generator<unknown>[] = [];
  let next = owned;
  while (true) {
    if (next !== null && typeof next === 'object') stack.push(entries(next));
    else fragments.push(JSON.stringify(next));
    let found = false;
    while (stack.length) {
      const item = stack.at(-1)!.next();
      if (!item.done) {
        next = item.value;
        found = true;
        break;
      }
      stack.pop();
    }
    if (!found) break;
  }
  return createHash('sha256').update(fragments.join('')).digest('hex');
}
export function historyCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function historyRefKey(r: ProviderFactRef): string {
  return JSON.stringify([r.factType, r.providerId, r.providerFactId]);
}
const text = z
    .string()
    .min(1)
    .refine((x) => x.trim() === x),
  digest = z.string().regex(/^[0-9a-f]{64}$/),
  id = EntityIdSchema;
const Contract = z.strictObject({
  providerId: id,
  extractor: text,
  normalizer: text,
  contract: text,
  policy: text,
});
const Unit = z.strictObject({
  id,
  providerId: id,
  kind: z.enum(['PYTHON_FILE', 'JAVA_GROUP', 'PROVIDER_SCOPE']),
  sourceFileIds: z.array(id),
});
const Coverage = z.strictObject({
  unitId: id,
  facet: text,
  originSnapshotId: id,
  coverage: z.literal('COMPLETE'),
});
const Support = z.strictObject({
  factType: z.enum(['NODE', 'EDGE']),
  canonical: z.union([CanonicalNodeSchema, CanonicalEdgeSchema]),
  snapshotId: id,
  evidence: EvidenceSchema,
  factEvidence: FactEvidenceSchema,
  binding: ProviderFactBindingSchema,
  dependencyUnitIds: z.array(id).nullable(),
  valueDigest: digest,
});
const State = z.strictObject({
  basis: RepoBasisSchema,
  repositoryLocatorDigest: digest,
  inventory: z.array(SourceFileSchema),
  contracts: z.array(Contract),
  units: z.array(Unit),
  snapshots: z.array(ProviderSnapshotSchema),
  nodes: z.array(CanonicalNodeSchema),
  edges: z.array(CanonicalEdgeSchema),
  supports: z.array(Support),
  coverage: z.array(Coverage),
  syntaxOrigins: z.array(
    z.strictObject({
      id,
      unitId: id,
      originSnapshotId: id,
      valueDigest: digest,
      basis: RepoBasisSchema,
    }),
  ),
});
const Observation = z.strictObject({
  observation: z.strictObject({
    snapshot: ProviderSnapshotSchema,
    nodes: z.array(
      z.strictObject({ provider: ProviderFactRefSchema, canonical: CanonicalNodeSchema }),
    ),
    edges: z.array(
      z.strictObject({ provider: ProviderFactRefSchema, canonical: CanonicalEdgeSchema }),
    ),
  }),
  units: z.array(Unit),
  supportDependencies: z.array(
    z.strictObject({ providerFact: ProviderFactRefSchema, unitIds: z.array(id) }),
  ),
  coverage: z.array(Coverage),
  requestIdentity: digest,
  outputIdentity: digest,
  settlement: z.literal('DECLARED_SUCCEEDED'),
});
const Packet = z.strictObject({
  history: z
    .strictObject({
      activationId: id,
      parent: z.strictObject({ activationId: id, repositoryId: id, revisionId: id }).nullable(),
      state: State,
    })
    .nullable(),
  current: State.nullable(),
  expectedActivationId: id.nullable(),
  expectedOldBasis: RepoBasisSchema.nullable(),
  target: z.strictObject({
    source: SyntaxTargetSourceSchema,
    repositoryLocatorDigest: digest,
    inventory: z.array(SourceFileSchema),
    contracts: z.array(Contract),
  }),
  observation: Observation.nullable(),
});
function sorted<T>(values: readonly T[], key: (v: T) => readonly string[]): void {
  let previous: readonly string[] | null = null;
  for (const value of values) {
    const current = key(value);
    if (previous) {
      let c = 0;
      for (let i = 0; i < current.length && !c; i++) c = historyCompare(previous[i]!, current[i]!);
      historyRequire(c < 0);
    }
    previous = current;
  }
}
export function historyInventory(inventory: readonly SourceFile[], context: TargetSource): void {
  sorted(inventory, (f) => [f.path, f.id]);
  historyRequire(new Set(inventory.map((f) => f.id)).size === inventory.length);
  historyRequire(new Set(inventory.map((f) => f.path)).size === inventory.length);
  for (const f of inventory)
    historyRequire(f.repositoryId === context.repositoryId && f.revisionId === context.revisionId);
}
export function historyProjected(f: SourceFile): boolean {
  return f.classification.role === 'SOURCE' || f.classification.role === 'TEST';
}
export function historySupported(f: SourceFile): boolean {
  return (
    !historyProjected(f) ||
    (f.classification.contentKind === 'TEXT' &&
      f.sensitivity !== 'SECRET' &&
      ['java', 'python'].includes(f.languageHint ?? ''))
  );
}
function contractsValid(contracts: readonly HistoryContractIdentity[]): void {
  sorted(contracts, (c) => [c.providerId]);
}
export function historyUnits(
  units: readonly HistoryDependencyUnit[],
  inventory: readonly SourceFile[],
  complete: boolean,
): void {
  sorted(units, (u) => [u.id]);
  const byId = new Map(inventory.map((f) => [String(f.id), f])),
    java = inventory
      .filter((f) => historyProjected(f) && f.languageHint === 'java')
      .map((f) => String(f.id))
      .sort(historyCompare),
    python = inventory
      .filter((f) => historyProjected(f) && f.languageHint === 'python')
      .map((f) => String(f.id))
      .sort(historyCompare);
  let javaGroups = 0;
  const py: string[] = [];
  for (const u of units) {
    sorted(u.sourceFileIds, (x) => [x]);
    historyRequire(u.sourceFileIds.length > 0);
    for (const x of u.sourceFileIds) historyRequire(byId.has(x));
    if (u.providerId === 'native') {
      historyRequire(u.kind !== 'PROVIDER_SCOPE');
      for (const x of u.sourceFileIds) historyRequire(historySupported(byId.get(x)!));
      if (u.kind === 'JAVA_GROUP') {
        javaGroups++;
        historyRequire(isDeepStrictEqual(u.sourceFileIds, java));
      } else {
        historyRequire(u.sourceFileIds.length === 1 && python.includes(u.sourceFileIds[0]!));
        py.push(u.sourceFileIds[0]!);
      }
    } else historyRequire(u.kind === 'PROVIDER_SCOPE');
  }
  historyRequire(javaGroups <= 1 && new Set(py).size === py.length);
  if (complete)
    historyRequire(
      javaGroups === (java.length ? 1 : 0) && isDeepStrictEqual(py.sort(historyCompare), python),
    );
}
export function historyCoverage(
  coverage: readonly HistoryCoverage[],
  units: readonly HistoryDependencyUnit[],
  snapshots: readonly ProviderSnapshot[],
): void {
  sorted(coverage, (c) => [c.unitId, c.facet]);
  const us = new Map(units.map((u) => [u.id, u])),
    ss = new Map(snapshots.map((s) => [String(s.id), s]));
  for (const c of coverage) {
    const u = us.get(c.unitId),
      s = ss.get(c.originSnapshotId);
    historyRequire(u && s && s.providerId === u.providerId);
    historyRequire(
      s.capabilities.some(
        (cap) => cap.name === c.facet && cap.support === 'SUPPORTED' && cap.coverage === 'COMPLETE',
      ),
    );
  }
  for (const u of units)
    if (u.providerId === 'native') {
      const expected = [
        'FRAMEWORK_SYNTAX_OBSERVATION_V1',
        u.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
      ];
      historyRequire(
        isDeepStrictEqual(
          coverage.filter((c) => c.unitId === u.id).map((c) => c.facet),
          expected,
        ),
      );
    }
}
function contextFact(f: CanonicalNode | CanonicalEdge, context: TargetSource): void {
  historyRequire(f.repositoryId === context.repositoryId && f.revisionId === context.revisionId);
}
function snapshotValid(s: ProviderSnapshot, context: TargetSource): void {
  historyRequire(
    s.repositoryId === context.repositoryId &&
      s.requestedRevisionId === context.revisionId &&
      s.outcome === 'SUCCEEDED' &&
      s.startedAt <= s.completedAt,
  );
}
export function historyDependencies(
  s: Pick<HistorySupport, 'canonical' | 'binding' | 'dependencyUnitIds'>,
  units: readonly HistoryDependencyUnit[],
): void {
  if (s.dependencyUnitIds === null) {
    historyRequire(s.binding.providerFact.providerId !== 'native');
    return;
  }
  sorted(s.dependencyUnitIds, (x) => [x]);
  historyRequire(s.dependencyUnitIds.length > 0);
  if (s.binding.providerFact.providerId === 'native')
    historyRequire(s.dependencyUnitIds.length === 1);
  const source = new Set<string>();
  for (const id of s.dependencyUnitIds) {
    const u = units.find((x) => x.id === id);
    historyRequire(u && u.providerId === s.binding.providerFact.providerId);
    for (const f of u.sourceFileIds) source.add(f);
  }
  if (s.canonical.sourceRange) historyRequire(source.has(s.canonical.sourceRange.sourceFileId));
}
function validateState(
  s: DeclaredActivationState,
  l: HistoryTransitionLimits,
  b: CompositionBudget,
  context: CodeSyntaxCompositionBudget | null,
): void {
  const q = (v: unknown) => {
    if (context) chargeCompositionJSON(v, l, b);
  };
  q({ units: s.units, inventory: s.inventory });
  historyInventory(s.inventory, s.basis);
  contractsValid(s.contracts);
  historyUnits(s.units, s.inventory, true);
  sorted(s.snapshots, (x) => [x.id]);
  sorted(s.nodes, (x) => [x.id]);
  sorted(s.edges, (x) => [x.id]);
  sorted(s.supports, (x) => [
    x.factType,
    x.binding.providerFact.providerId,
    x.binding.providerFact.providerFactId,
    x.evidence.id,
  ]);
  sorted(s.syntaxOrigins, (x) => [x.id]);
  q(s.contracts);
  q(s.snapshots);
  const contracts = new Set(s.contracts.map((c) => c.providerId)),
    seen = new Set<string>(),
    evidence = new Set<string>(),
    snapshots = new Map(s.snapshots.map((x) => [String(x.id), x]));
  for (const u of s.units) historyRequire(contracts.has(u.providerId));
  for (const snap of s.snapshots) {
    snapshotValid(snap, s.basis);
    historyRequire(contracts.has(snap.providerId));
  }
  const collected: MergeSupport[] = [];
  for (const snap of s.snapshots) {
    const group = s.supports.filter((x) => x.snapshotId === snap.id);
    const obs: MergeObservation = {
      snapshot: snap,
      nodes: group
        .filter((x) => x.factType === 'NODE')
        .map((x) => ({
          provider: { ...x.binding.providerFact, factType: 'NODE' as const },
          canonical: x.canonical as CanonicalNode,
        })),
      edges: group
        .filter((x) => x.factType === 'EDGE')
        .map((x) => ({
          provider: { ...x.binding.providerFact, factType: 'EDGE' as const },
          canonical: x.canonical as CanonicalEdge,
        })),
    };
    q(obs);
    const mergeInput = {
      repositoryId: s.basis.repositoryId,
      revisionId: s.basis.revisionId,
      observations: [obs],
    };
    const rebuilt = context
      ? collectMergeSupportsWithBudget(mergeInput, context)
      : collectMergeSupports(mergeInput);
    for (const x of group) {
      contextFact(x.canonical, s.basis);
      historyRequire(x.factType === x.binding.providerFact.factType);
      const key = historyRefKey(x.binding.providerFact);
      historyRequire(!seen.has(key) && !evidence.has(x.evidence.id));
      seen.add(key);
      evidence.add(x.evidence.id);
      const { dependencyUnitIds: _, valueDigest: __, ...base } = x;
      const actual = rebuilt.find((y) => y.evidence.id === x.evidence.id);
      historyRequire(actual);
      const { inputPath: ___, ...relation } = actual;
      historyRequire(isDeepStrictEqual(relation, base));
      historyRequire(
        x.valueDigest ===
          historyDraftDigest(
            { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: x.canonical },
            l,
            b,
          ),
      );
      q({
        canonical: x.canonical,
        binding: x.binding,
        dependencyUnitIds: x.dependencyUnitIds,
        units: s.units,
      });
      historyDependencies(x, s.units);
      collected.push(actual);
    }
  }
  historyRequire(collected.length === s.supports.length);
  for (const f of [...s.nodes, ...s.edges]) contextFact(f, s.basis);
  const selected = context
    ? selectMergedFactsWithBudget(collected, context)
    : selectMergedFacts(collected);
  historyRequire(
    isDeepStrictEqual(
      [...selected.nodes].sort((a, b) => historyCompare(a.id, b.id)),
      s.nodes,
    ) &&
      isDeepStrictEqual(
        [...selected.edges].sort((a, b) => historyCompare(a.id, b.id)),
        s.edges,
      ),
  );
  q({ coverage: s.coverage, units: s.units, snapshots: s.snapshots });
  historyCoverage(s.coverage, s.units, s.snapshots);
  for (const x of s.syntaxOrigins) {
    const u = s.units.find((u) => u.id === x.unitId),
      snap = snapshots.get(x.originSnapshotId);
    historyRequire(
      u &&
        snap &&
        u.providerId === snap.providerId &&
        x.basis.repositoryId === s.basis.repositoryId &&
        x.basis.revisionId === s.basis.revisionId,
    );
  }
}
export function prepareHistoryTransition(
  input: unknown,
  limits: unknown,
): PreparedHistoryTransition {
  return prepareHistoryTransitionCore(input, limits, null);
}
export default function prepareHistoryTransitionWithBudget(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): PreparedHistoryTransition {
  return prepareHistoryTransitionCore(input, context.limits, context);
}
/** Private scope continuation with the legacy single-input ownership schedule. */
export function prepareHistoryScopeInputWithBudget(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): PreparedHistoryTransition {
  remainingCompositionLimits(context);
  return prepareHistoryTransitionCore(input, context.limits, null, context.budget);
}
function prepareHistoryTransitionCore(
  input: unknown,
  limits: unknown,
  context: CodeSyntaxCompositionBudget | null,
  scopeBudget?: CompositionBudget,
): PreparedHistoryTransition {
  try {
    historyRequire(
      limits &&
        typeof limits === 'object' &&
        !types.isProxy(limits) &&
        Object.getPrototypeOf(limits) === Object.prototype,
    );
    const descriptors = Object.getOwnPropertyDescriptors(limits);
    historyRequire(Reflect.ownKeys(limits).length === 3);
    for (const k of ['maxSerializedBytes', 'maxItems', 'maxDepth']) {
      const d = descriptors[k];
      historyRequire(
        d &&
          Object.hasOwn(d, 'value') &&
          d.enumerable &&
          Number.isSafeInteger(d.value) &&
          d.value > 0,
      );
    }
    const l = limits as HistoryTransitionLimits,
      b: CompositionBudget = context
        ? context.budget
        : (scopeBudget ?? { serializedBytes: 0, items: 0 }),
      text = chargeHistoryJSON(input, l, b);
    if (context) chargeHistoryJSON(input, l, b);
    const parsed = Packet.safeParse(JSON.parse(text));
    historyRequire(parsed.success);
    const packet = parsed.data as HistoryTransitionPacket;
    historyInventory(packet.target.inventory, packet.target.source);
    contractsValid(packet.target.contracts);
    for (const state of [packet.history?.state, packet.current])
      if (state) validateState(state, l, b, context);
    const h = packet.history,
      current = packet.current;
    if (h) {
      historyRequire(packet.expectedActivationId !== null && packet.expectedOldBasis !== null);
      if (h.parent)
        historyRequire(
          h.parent.activationId !== h.activationId &&
            h.parent.repositoryId === h.state.basis.repositoryId,
        );
    }
    if (!h && !current) {
      historyRequire(packet.expectedActivationId === null && packet.expectedOldBasis === null);
      throw new HistoryTransitionError('HISTORY_UNAVAILABLE');
    }
    if (!h) throw new HistoryTransitionError('FULL_ANALYSIS_REQUIRED');
    historyRequire(
      current &&
        packet.expectedActivationId === h.activationId &&
        isDeepStrictEqual(packet.expectedOldBasis, h.state.basis) &&
        isDeepStrictEqual(current, h.state),
      'HISTORY_CHANGED',
    );
    return { packet: freezeComposition(packet), limits: freezeComposition({ ...l }), budget: b };
  } catch (e) {
    if (context && e instanceof NativeCompositionError && e.code === 'RESOURCE_LIMIT_EXCEEDED')
      throw new HistoryTransitionError(e.code);
    if (e instanceof HistoryTransitionError) throw e;
    throw new HistoryTransitionError('INVALID_HISTORY');
  }
}
