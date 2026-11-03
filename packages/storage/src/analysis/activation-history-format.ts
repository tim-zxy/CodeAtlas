import { createHash } from 'node:crypto';
import { types, isDeepStrictEqual } from 'node:util';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  SourceFileSchema,
  ProviderSnapshotSchema,
  RepoBasisSchema,
  EvidenceSchema,
  ProviderFactBindingSchema,
  FactEvidenceSchema,
  parseSyntaxEvidence,
  parseSyntaxEvidenceV2,
  parseSyntaxEvidenceV3,
  parseSyntaxEvidenceV4,
  validateSyntaxSurfaceClosure,
  supportKey,
  type SyntaxEvidenceV4,
  validateSyntaxBindingScopeClosure,
  type SyntaxEvidenceV3,
  type SourceFile,
  type CanonicalNode,
  type CanonicalEdge,
  type ProviderSnapshot,
  type RepoBasis,
  type Evidence,
  type ProviderFactBinding,
  type FactEvidence,
} from '@codeatlas/ir';
import { boundedJson } from './bounded-json.js';
export type HistoryErrorCode =
  | 'INVALID_HISTORY'
  | 'HISTORY_UNAVAILABLE'
  | 'HISTORY_CHANGED'
  | 'HISTORY_LIMIT_EXCEEDED'
  | 'HISTORY_RELEASED'
  | 'CONTEXT_UNAVAILABLE';
export class HistoryCaptureError extends Error {
  constructor(readonly code: HistoryErrorCode) {
    super(code);
    this.name = 'HistoryCaptureError';
  }
}
export function requireHistory(
  value: unknown,
  code: HistoryErrorCode = 'INVALID_HISTORY',
): asserts value {
  if (!value) throw new HistoryCaptureError(code);
}
export interface HistoryReadLimits {
  readonly maxRows: number;
  readonly maxSerializedBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
  readonly memoryBudgetBytes: number;
}
export type Row = Record<string, unknown>;
export const historyCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const record = (v: unknown): Row => {
  requireHistory(v !== null && typeof v === 'object' && !types.isProxy(v) && !Array.isArray(v));
  const proto = Object.getPrototypeOf(v);
  requireHistory(proto === Object.prototype || proto === null);
  for (const k of Reflect.ownKeys(v)) {
    requireHistory(typeof k === 'string');
    const d = Object.getOwnPropertyDescriptor(v, k)!;
    requireHistory(d.enumerable && Object.hasOwn(d, 'value'));
  }
  return v as Row;
};
export function exact(v: unknown, keys: readonly string[]): Row {
  const r = record(v);
  requireHistory(isDeepStrictEqual(Object.keys(r).sort(), [...keys].sort()));
  return r;
}
export function text(v: unknown): string {
  requireHistory(typeof v === 'string' && v.length > 0 && v.trim() === v && v.isWellFormed());
  return v;
}
export function array(v: unknown): unknown[] {
  requireHistory(Array.isArray(v) && !types.isProxy(v));
  return v;
}
export function checkedHistoryLimits(value: unknown): HistoryReadLimits {
  const r = exact(value, [
    'maxRows',
    'maxSerializedBytes',
    'maxItems',
    'maxDepth',
    'memoryBudgetBytes',
  ]);
  for (const v of Object.values(r))
    requireHistory(typeof v === 'number' && Number.isSafeInteger(v) && v > 0);
  return Object.freeze({ ...r }) as unknown as HistoryReadLimits;
}
export function historyWeight(v: unknown): number {
  let n = 0;
  const stack: unknown[] = [v];
  while (stack.length) {
    const x = stack.pop();
    if (typeof x === 'string') n += Buffer.byteLength(x);
    else if (x !== null && typeof x === 'object') {
      if (!Array.isArray(x)) n += Object.keys(x).reduce((a, k) => a + Buffer.byteLength(k), 0);
      for (const value of Object.values(x)) stack.push(value);
    }
    requireHistory(Number.isSafeInteger(n), 'HISTORY_LIMIT_EXCEEDED');
  }
  return n;
}
export class HistoryReadBudget {
  rows = 0;
  serializedBytes = 0;
  items = 0;
  retainedLogicalBytes = 0;
  constructor(readonly limits: HistoryReadLimits) {}
  add(key: 'rows' | 'serializedBytes' | 'items', n: number) {
    const max =
      key === 'rows'
        ? this.limits.maxRows
        : key === 'items'
          ? this.limits.maxItems
          : this.limits.maxSerializedBytes;
    requireHistory(
      Number.isSafeInteger(n) && n >= 0 && n <= max - this[key],
      'HISTORY_LIMIT_EXCEEDED',
    );
    this[key] += n;
  }
  pin(n: number) {
    requireHistory(
      Number.isSafeInteger(n) &&
        n >= 0 &&
        n <= Math.floor(this.limits.memoryBudgetBytes / 2) - this.retainedLogicalBytes,
      'HISTORY_LIMIT_EXCEEDED',
    );
    this.retainedLogicalBytes += n;
  }
  own(value: unknown, pin = true) {
    const ancestors = new Set<object>();
    function* children(v: object): Generator<unknown> {
      requireHistory(!types.isProxy(v));
      const isArray = Array.isArray(v),
        proto = Object.getPrototypeOf(v);
      requireHistory(
        isArray ? proto === Array.prototype : proto === Object.prototype || proto === null,
      );
      let count = 0;
      for (const k in v) {
        if (!Object.hasOwn(v, k)) continue;
        requireHistory(k.isWellFormed());
        const d = Object.getOwnPropertyDescriptor(v, k)!;
        requireHistory(d.enumerable && Object.hasOwn(d, 'value'));
        if (isArray) requireHistory(String(count) === k);
        count++;
        yield d.value;
      }
      requireHistory(Reflect.ownKeys(v).length === count + (isArray ? 1 : 0));
      if (isArray) requireHistory(count === (v as unknown[]).length);
    }
    const frames: { v: object; depth: number; iterator: Generator<unknown> }[] = [];
    let next = value,
      depth = 0;
    while (true) {
      requireHistory(depth <= this.limits.maxDepth, 'HISTORY_LIMIT_EXCEEDED');
      this.add('items', 1);
      if (next !== null && typeof next === 'object') {
        requireHistory(!ancestors.has(next));
        ancestors.add(next);
        frames.push({ v: next, depth, iterator: children(next) });
      } else
        requireHistory(
          next === null ||
            typeof next === 'boolean' ||
            (typeof next === 'string' && next.isWellFormed()) ||
            (typeof next === 'number' && Number.isFinite(next) && !Object.is(next, -0)),
        );
      let found = false;
      while (frames.length) {
        const f = frames.at(-1)!,
          n = f.iterator.next();
        if (!n.done) {
          next = n.value;
          depth = f.depth + 1;
          found = true;
          break;
        }
        ancestors.delete(f.v);
        frames.pop();
      }
      if (!found) break;
    }
    if (pin) this.pin(historyWeight(value));
  }
  parse(value: string): unknown {
    let quoted = false,
      escape = false,
      depth = 0;
    for (const c of value) {
      if (quoted) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '[' || c === '{') {
        depth++;
        requireHistory(depth - 1 <= this.limits.maxDepth, 'HISTORY_LIMIT_EXCEEDED');
      } else if (c === ']' || c === '}') depth--;
    }
    const result: unknown = JSON.parse(value);
    this.own(result);
    return result;
  }
  remaining() {
    const maxRows = this.limits.maxRows - this.rows,
      maxSerializedBytes = this.limits.maxSerializedBytes - this.serializedBytes,
      memoryBudgetBytes = this.limits.memoryBudgetBytes - 2 * this.retainedLogicalBytes,
      maxItems = this.limits.maxItems - this.items;
    requireHistory(
      maxRows > 0 && maxSerializedBytes > 0 && memoryBudgetBytes > 0 && maxItems > 0,
      'HISTORY_LIMIT_EXCEEDED',
    );
    return {
      maxRows,
      maxSerializedBytes,
      memoryBudgetBytes,
      maxItems,
      maxDepth: this.limits.maxDepth,
    };
  }
}
export function encodeHistoryValue(value: unknown, b: HistoryReadBudget): string {
  b.own(value, false);
  const fragments: string[] = [];
  const append = (s: string) => {
    const n = Buffer.byteLength(s);
    b.add('serializedBytes', n);
    b.pin(n);
    fragments.push(s);
  };
  const scalar = (v: unknown) => {
    let s: string;
    try {
      s = boundedJson(v, b.limits.maxSerializedBytes - b.serializedBytes);
    } catch {
      return requireHistory(false, 'HISTORY_LIMIT_EXCEEDED');
    }
    append(s);
  };
  function* children(v: object): Generator<unknown> {
    if (Array.isArray(v)) {
      append('[');
      for (let i = 0; i < v.length; i++) {
        if (i) append(',');
        yield v[i];
      }
      append(']');
    } else {
      append('{');
      let first = true;
      for (const k of Object.keys(v).sort(historyCompare)) {
        if (!first) append(',');
        first = false;
        scalar(k);
        append(':');
        yield (v as Row)[k];
      }
      append('}');
    }
  }
  const frames: Generator<unknown>[] = [];
  let next = value;
  while (true) {
    if (next !== null && typeof next === 'object') frames.push(children(next));
    else scalar(next);
    let found = false;
    while (frames.length) {
      const n = frames.at(-1)!.next();
      if (!n.done) {
        next = n.value;
        found = true;
        break;
      }
      frames.pop();
    }
    if (!found) break;
  }
  const n = fragments.reduce((a, s) => a + Buffer.byteLength(s), 0);
  b.add('serializedBytes', n);
  b.pin(n);
  return fragments.join('');
}
export function historyDigest(domain: string, value: unknown, b: HistoryReadBudget): string {
  const raw = encodeHistoryValue(value, b);
  b.add('serializedBytes', Buffer.byteLength(domain) + 1);
  b.pin(64);
  return createHash('sha256')
    .update(domain + '\0')
    .update(raw)
    .digest('hex');
}
const digestText = (v: unknown) => {
  const s = text(v);
  requireHistory(/^[0-9a-f]{64}$/.test(s));
  return s;
};
const same = (a: unknown, b: unknown) => requireHistory(isDeepStrictEqual(a, b));
export interface HistoryUnit {
  readonly id: string;
  readonly providerId: string;
  readonly kind: string;
  readonly sourceFileIds: readonly string[];
}
export interface HistorySupport {
  readonly factType: 'NODE' | 'EDGE';
  readonly canonical: CanonicalNode | CanonicalEdge;
  readonly evidence: Evidence;
  readonly binding: ProviderFactBinding;
  readonly factEvidence: FactEvidence;
  readonly dependencyUnitIds: readonly string[] | null;
  readonly valueDigest: string;
}
export interface HistoryState {
  readonly basis: RepoBasis;
  readonly repositoryLocatorDigest: string;
  readonly inventory: readonly SourceFile[];
  readonly contracts: readonly Row[];
  readonly units: readonly HistoryUnit[];
  readonly snapshots: readonly ProviderSnapshot[];
  readonly nodes: readonly CanonicalNode[];
  readonly edges: readonly CanonicalEdge[];
  readonly supports: readonly HistorySupport[];
  readonly coverage: readonly Row[];
  readonly syntaxOrigins: readonly Row[];
}
export interface HistoryManifest {
  readonly schemaVersion: 1;
  readonly parent: null | {
    readonly activationId: string;
    readonly repositoryId: string;
    readonly revisionId: string;
  };
  readonly state: HistoryState;
  readonly observation: unknown;
  readonly transitions: unknown;
  readonly syntaxMembers: readonly {
    readonly originId: string;
    readonly projectionId: string;
    readonly unitId: string;
  }[];
  readonly codeIdentity: string;
  readonly sourceIdentity: string;
  readonly originRegistryDigest: string;
}
function ordered<T>(values: readonly T[], key: (v: T) => readonly string[]) {
  let prev: readonly string[] | undefined;
  for (const v of values) {
    const k = key(v);
    if (prev) {
      let c = 0;
      for (let i = 0; i < k.length && !c; i++) c = historyCompare(prev[i]!, k[i]!);
      requireHistory(c < 0);
    }
    prev = k;
  }
}
export function validateHistoryManifest(input: unknown, b: HistoryReadBudget): HistoryManifest {
  const m = exact(input, [
    'schemaVersion',
    'parent',
    'state',
    'observation',
    'transitions',
    'syntaxMembers',
    'codeIdentity',
    'sourceIdentity',
    'originRegistryDigest',
  ]);
  requireHistory(m.schemaVersion === 1);
  if (m.parent !== null) {
    const p = exact(m.parent, ['activationId', 'repositoryId', 'revisionId']);
    Object.values(p).forEach(text);
  }
  const s = exact(m.state, [
    'basis',
    'repositoryLocatorDigest',
    'inventory',
    'contracts',
    'units',
    'snapshots',
    'nodes',
    'edges',
    'supports',
    'coverage',
    'syntaxOrigins',
  ]);
  const basis = RepoBasisSchema.parse(s.basis);
  digestText(s.repositoryLocatorDigest);
  const files = array(s.inventory).map((v) => SourceFileSchema.parse(v));
  ordered(files, (f) => [f.path, f.id]);
  requireHistory(new Set(files.map((f) => f.id)).size === files.length);
  requireHistory(new Set(files.map((f) => f.path)).size === files.length);
  const fileMap = new Map(files.map((f) => [String(f.id), f]));
  for (const f of files)
    requireHistory(f.repositoryId === basis.repositoryId && f.revisionId === basis.revisionId);
  const contracts = array(s.contracts).map((v) =>
    exact(v, ['providerId', 'extractor', 'normalizer', 'contract', 'policy']),
  );
  for (const c of contracts) Object.values(c).forEach(text);
  ordered(contracts, (c) => [text(c.providerId)]);
  const providers = new Set(contracts.map((c) => text(c.providerId)));
  const units = array(s.units).map((v) => {
    const u = exact(v, ['id', 'providerId', 'kind', 'sourceFileIds']);
    text(u.id);
    requireHistory(providers.has(text(u.providerId)));
    const ids = array(u.sourceFileIds).map(text);
    ordered(ids, (v) => [v]);
    requireHistory(ids.length > 0 && ids.every((id) => fileMap.has(id)));
    requireHistory(['PYTHON_FILE', 'JAVA_GROUP', 'PROVIDER_SCOPE'].includes(text(u.kind)));
    if (u.kind === 'PYTHON_FILE')
      requireHistory(
        u.providerId === 'native' &&
          ids.length === 1 &&
          fileMap.get(ids[0]!)!.languageHint === 'python',
      );
    if (u.kind === 'JAVA_GROUP')
      requireHistory(
        u.providerId === 'native' && ids.every((id) => fileMap.get(id)!.languageHint === 'java'),
      );
    if (u.kind === 'PROVIDER_SCOPE') requireHistory(u.providerId !== 'native');
    return u as unknown as HistoryUnit;
  });
  ordered(units, (u) => [u.id]);
  const unitMap = new Map(units.map((u) => [u.id, u]));
  if (providers.has('native')) {
    const projected = files.filter(
      (f) => f.classification.role === 'SOURCE' || f.classification.role === 'TEST',
    );
    const java = projected
        .filter((f) => f.languageHint === 'java')
        .map((f) => String(f.id))
        .sort(historyCompare),
      python = projected
        .filter((f) => f.languageHint === 'python')
        .map((f) => String(f.id))
        .sort(historyCompare);
    const native = units.filter((u) => u.providerId === 'native'),
      groups = native.filter((u) => u.kind === 'JAVA_GROUP'),
      py = native
        .filter((u) => u.kind === 'PYTHON_FILE')
        .flatMap((u) => u.sourceFileIds)
        .sort(historyCompare);
    requireHistory(groups.length === (java.length ? 1 : 0));
    if (groups.length) same(groups[0]!.sourceFileIds, java);
    same(py, python);
    for (const u of native)
      for (const id of u.sourceFileIds) {
        const f = fileMap.get(id)!;
        requireHistory(
          (f.classification.role === 'SOURCE' || f.classification.role === 'TEST') &&
            f.classification.contentKind === 'TEXT' &&
            f.sensitivity !== 'SECRET',
        );
      }
  }
  const snapshots = array(s.snapshots).map((v) => ProviderSnapshotSchema.parse(v));
  ordered(snapshots, (x) => [x.id]);
  const snapMap = new Map(snapshots.map((x) => [String(x.id), x]));
  for (const x of snapshots)
    requireHistory(
      x.repositoryId === basis.repositoryId &&
        x.requestedRevisionId === basis.revisionId &&
        x.outcome === 'SUCCEEDED' &&
        providers.has(x.providerId),
    );
  const nodes = array(s.nodes).map((v) => CanonicalNodeSchema.parse(v)),
    edges = array(s.edges).map((v) => CanonicalEdgeSchema.parse(v));
  ordered(nodes, (x) => [x.id]);
  ordered(edges, (x) => [x.id]);
  requireHistory(new Set(nodes.map((n) => n.factKey)).size === nodes.length);
  requireHistory(new Set(edges.map((e) => e.factKey)).size === edges.length);
  const nodeIds = new Set(nodes.map((n) => String(n.id)));
  const fact = (f: CanonicalNode | CanonicalEdge) => {
    requireHistory(f.repositoryId === basis.repositoryId && f.revisionId === basis.revisionId);
    if (f.sourceRange) requireHistory(fileMap.has(f.sourceRange.sourceFileId));
    if ('source' in f) {
      requireHistory(nodeIds.has(f.source.id));
      if (f.target.state === 'RESOLVED') requireHistory(nodeIds.has(f.target.target.id));
      else for (const c of f.target.candidates) requireHistory(nodeIds.has(c.id));
    }
  };
  for (const f of [...nodes, ...edges]) fact(f);
  const supports = array(s.supports).map((v) => {
    const x = exact(v, [
      'factType',
      'canonical',
      'evidence',
      'binding',
      'factEvidence',
      'dependencyUnitIds',
      'valueDigest',
    ]);
    requireHistory(x.factType === 'NODE' || x.factType === 'EDGE');
    const c = (x.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
        x.canonical,
      ),
      e = EvidenceSchema.parse(x.evidence),
      binding = ProviderFactBindingSchema.parse(x.binding),
      link = FactEvidenceSchema.parse(x.factEvidence),
      snap = snapMap.get(e.providerSnapshotId);
    fact(c);
    requireHistory(
      snap &&
        e.status === 'ACTIVE' &&
        e.repositoryId === basis.repositoryId &&
        e.revisionId === basis.revisionId &&
        e.providerFact.providerId === snap.providerId &&
        e.providerFact.factType === x.factType,
    );
    same(binding.providerFact, e.providerFact);
    same(binding.canonicalFact, { factType: x.factType, id: c.id });
    same(link.fact, binding.canonicalFact);
    requireHistory(
      binding.providerSnapshotId === snap.id &&
        binding.evidenceId === e.id &&
        link.evidenceId === e.id &&
        (x.factType === 'NODE' ? nodeIds.has(c.id) : edges.some((v) => v.id === c.id)),
    );
    if (x.dependencyUnitIds === null) requireHistory(e.providerFact.providerId !== 'native');
    else {
      const ids = array(x.dependencyUnitIds).map(text);
      ordered(ids, (v) => [v]);
      requireHistory(
        ids.length > 0 && ids.every((id) => unitMap.get(id)?.providerId === snap.providerId),
      );
      if (snap.providerId === 'native') requireHistory(ids.length === 1);
      if (c.sourceRange)
        requireHistory(
          ids.some((id) => unitMap.get(id)!.sourceFileIds.includes(c.sourceRange!.sourceFileId)),
        );
    }
    digestText(x.valueDigest);
    const encoded = encodeHistoryValue({ kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: c }, b);
    requireHistory(createHash('sha256').update(encoded).digest('hex') === x.valueDigest);
    return x as unknown as HistorySupport;
  });
  ordered(supports, (x) => [
    x.factType,
    x.binding.providerFact.providerId,
    x.binding.providerFact.providerFactId,
    x.evidence.id,
  ]);
  requireHistory(
    new Set(supports.map((x) => x.evidence.id)).size === supports.length &&
      new Set(supports.map((x) => JSON.stringify(x.binding.providerFact))).size === supports.length,
  );
  for (const f of [...nodes, ...edges])
    requireHistory(
      supports.some(
        (x) => x.factType === ('source' in f ? 'EDGE' : 'NODE') && x.canonical.id === f.id,
      ),
    );
  const coverage = array(s.coverage).map((v) =>
    exact(v, ['unitId', 'facet', 'originSnapshotId', 'coverage']),
  );
  ordered(coverage, (x) => [text(x.unitId), text(x.facet)]);
  for (const c of coverage) {
    const u = unitMap.get(text(c.unitId)),
      snap = snapMap.get(text(c.originSnapshotId));
    requireHistory(
      u &&
        snap &&
        u.providerId === snap.providerId &&
        c.coverage === 'COMPLETE' &&
        snap.capabilities.some(
          (cap) =>
            cap.name === c.facet && cap.coverage === 'COMPLETE' && cap.support === 'SUPPORTED',
        ),
    );
  }
  for (const u of units) {
    const facets = coverage.filter((c) => c.unitId === u.id).map((c) => text(c.facet));
    requireHistory(facets.length > 0);
    if (u.providerId === 'native')
      same(facets, [
        'FRAMEWORK_SYNTAX_OBSERVATION_V1',
        u.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
      ]);
  }
  const origins = array(s.syntaxOrigins).map((v) => {
    const x = exact(v, ['id', 'unitId', 'originSnapshotId', 'valueDigest', 'basis']);
    text(x.id);
    requireHistory(unitMap.has(text(x.unitId)) && snapMap.has(text(x.originSnapshotId)));
    digestText(x.valueDigest);
    const old = RepoBasisSchema.parse(x.basis);
    requireHistory(old.repositoryId === basis.repositoryId && old.revisionId === basis.revisionId);
    return x;
  });
  ordered(origins, (x) => [text(x.id)]);
  const members = array(m.syntaxMembers).map((v) =>
    exact(v, ['originId', 'projectionId', 'unitId']),
  );
  ordered(members, (x) => [text(x.originId)]);
  requireHistory(
    members.length === origins.length &&
      new Set(members.map((x) => text(x.projectionId))).size === members.length,
  );
  for (const x of members)
    requireHistory(origins.some((o) => o.id === x.originId && o.unitId === x.unitId));
  requireHistory(
    m.codeIdentity === basis.codeActivationDigest &&
      m.sourceIdentity === historyDigest('codeatlas-activation-source-v1', s.inventory, b) &&
      m.originRegistryDigest === historyDigest('codeatlas-activation-origins-v1', s.snapshots, b),
  );
  if (m.observation !== null) {
    const o = exact(m.observation, [
      'snapshotId',
      'requestIdentity',
      'outputIdentity',
      'javaProvenance',
      'scope',
      'qualificationRef',
    ]);
    requireHistory(snapMap.has(text(o.snapshotId)));
    digestText(o.requestIdentity);
    digestText(o.outputIdentity);
    text(o.qualificationRef);
    const scope = exact(o.scope, ['unitIds', 'removedSourceFileIds']);
    for (const v of Object.values(scope)) {
      const ids = array(v).map(text);
      ordered(ids, (x) => [x]);
    }
    if (o.javaProvenance !== null) {
      const p = exact(o.javaProvenance, ['kind', 'requestId', 'startedAt', 'settledAt']);
      requireHistory(p.kind === 'PARSED_V2');
      text(p.requestId);
      text(p.startedAt);
      text(p.settledAt);
    }
  }
  if (m.transitions !== null) {
    const t = exact(m.transitions, [
      'kind',
      'activationId',
      'oldBasis',
      'targetSource',
      'historyDigest',
      'ledgerDigest',
      'diff',
      'supportDecisions',
      'addedEvidenceIds',
      'survivingFactKeys',
      'coverageOrigins',
      'syntaxRequirements',
    ]);
    requireHistory(t.kind === 'TRANSITION_DRAFT' && m.parent !== null);
    text(t.activationId);
    const oldBasis = RepoBasisSchema.parse(t.oldBasis),
      parent = record(m.parent);
    requireHistory(
      t.activationId === parent.activationId &&
        oldBasis.repositoryId === parent.repositoryId &&
        oldBasis.revisionId === parent.revisionId,
    );
    requireHistory(
      oldBasis.repositoryId === basis.repositoryId && oldBasis.revisionId === basis.revisionId,
    );
    digestText(t.historyDigest);
    digestText(t.ledgerDigest);
    const target = exact(t.targetSource, ['repositoryId', 'revisionId', 'contentFingerprint']);
    Object.values(target).forEach(text);
    same(target, {
      repositoryId: basis.repositoryId,
      revisionId: basis.revisionId,
      contentFingerprint: basis.contentFingerprint,
    });
    const diffs = array(t.diff).map((v) => {
      const d = exact(v, ['kind', 'before', 'after']);
      requireHistory(['UNCHANGED', 'ADDED', 'MODIFIED', 'REMOVED'].includes(text(d.kind)));
      const before = d.before === null ? null : SourceFileSchema.parse(d.before),
        after = d.after === null ? null : SourceFileSchema.parse(d.after);
      requireHistory(before || after);
      if (d.kind === 'ADDED') requireHistory(before === null && after);
      else if (d.kind === 'REMOVED') requireHistory(before && after === null);
      else {
        requireHistory(before && after && before.id === after.id);
        requireHistory((d.kind === 'UNCHANGED') === isDeepStrictEqual(before, after));
      }
      return { before, after };
    });
    ordered(diffs, (d) => [String((d.before ?? d.after)!.id)]);
    const decisions = array(t.supportDecisions).map((v) => {
      const d = exact(v, ['evidenceId', 'action', 'replacementEvidenceId']);
      text(d.evidenceId);
      requireHistory(['RETAIN', 'SUPERSEDE', 'INVALIDATE'].includes(text(d.action)));
      if (d.replacementEvidenceId !== null) text(d.replacementEvidenceId);
      requireHistory((d.action === 'SUPERSEDE') === (d.replacementEvidenceId !== null));
      return d;
    });
    ordered(decisions, (d) => [text(d.evidenceId)]);
    const added = array(t.addedEvidenceIds).map(text);
    ordered(added, (x) => [x]);
    const surviving = array(t.survivingFactKeys).map((v) => {
      const f = exact(v, ['factType', 'id']);
      requireHistory(f.factType === 'NODE' || f.factType === 'EDGE');
      text(f.id);
      return f;
    });
    ordered(surviving, (f) => [text(f.factType), text(f.id)]);
    const origins = array(t.coverageOrigins).map((v) => {
      const c = exact(v, ['unitId', 'facet', 'originSnapshotId', 'coverage']);
      text(c.unitId);
      text(c.facet);
      text(c.originSnapshotId);
      requireHistory(c.coverage === 'COMPLETE');
      return c;
    });
    ordered(origins, (c) => [text(c.unitId), text(c.facet)]);
    const requirements = array(t.syntaxRequirements).map((v) => {
      const r = exact(v, ['originId', 'action']);
      text(r.originId);
      requireHistory(r.action === 'REVALIDATE_FINAL_BASIS' || r.action === 'RETIRE_ORIGIN');
      return r;
    });
    ordered(requirements, (r) => [text(r.originId)]);
  }
  return m as unknown as HistoryManifest;
}
export function validateSyntaxEnvelope(
  envelope: unknown,
  state: HistoryState,
  b: HistoryReadBudget,
): void {
  const e = exact(envelope, ['schema', 'version', 'payload']);
  requireHistory(
    e.schema === 'codeatlas.syntax-evidence' &&
      (e.version === 1 || e.version === 2 || e.version === 3 || e.version === 4),
  );
  const p = record(e.payload),
    supports = array(p.supportRefs);
  requireHistory(supports.length > 0);
  const values = new Map<string, unknown>();
  const availableEntities = [];
  for (const f of state.inventory) {
    const entity = { kind: 'SOURCE_FILE', id: f.id, revisionId: state.basis.revisionId };
    values.set('SOURCE_FILE:' + f.id, f);
    availableEntities.push({ scope: 'REPOSITORY', repositoryId: state.basis.repositoryId, entity });
  }
  for (const n of state.nodes) {
    const entity = { kind: 'CODE_NODE', id: n.id, revisionId: state.basis.revisionId };
    values.set('CODE_NODE:' + n.id, n);
    availableEntities.push({ scope: 'REPOSITORY', repositoryId: state.basis.repositoryId, entity });
  }
  if (e.version === 4)
    for (const edge of state.edges) {
      const entity = { kind: 'CODE_EDGE', id: edge.id, revisionId: state.basis.revisionId };
      values.set('CODE_EDGE:' + edge.id, edge);
      availableEntities.push({
        scope: 'REPOSITORY',
        repositoryId: state.basis.repositoryId,
        entity,
      });
    }
  const availableSupports = [];
  const supported = new Set<string>();
  for (const item of supports) {
    const r = exact(item, ['basis', 'entity', 'valueDigest']),
      entity = record(r.entity);
    same(r.basis, state.basis);
    const key = text(entity.kind) + ':' + text(entity.id),
      v = values.get(key);
    requireHistory(v && entity.revisionId === state.basis.revisionId);
    const expected = {
      basis: state.basis,
      entity: r.entity,
      valueDigest: historyDigest('codeatlas-phase1-support-value-v1', v, b),
    };
    same(r, expected);
    requireHistory(!supported.has(key));
    supported.add(key);
    availableSupports.push(expected);
  }
  const range = record(p.sourceRange);
  requireHistory(supported.has('SOURCE_FILE:' + text(range.sourceFileId)));
  const required = new Set<string>();
  const pending: unknown[] = [p];
  while (pending.length) {
    const v = pending.pop();
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      pending.push(...v);
      continue;
    }
    const r = v as Row;
    if (r.scope !== undefined) {
      const entity = record(r.entity);
      requireHistory(
        r.scope === 'REPOSITORY' &&
          r.repositoryId === state.basis.repositoryId &&
          (entity.kind === 'CODE_NODE' || (e.version === 4 && entity.kind === 'CODE_EDGE')),
      );
      required.add(text(entity.kind) + ':' + text(entity.id));
    }
    for (const c of Object.values(r)) pending.push(c);
  }
  for (const key of required) requireHistory(supported.has(key));
  const references = { availableEntities, availableSupports };
  if (e.version === 2 || e.version === 3 || e.version === 4) {
    const context = {
      references,
      codeNodes: state.nodes,
      sourceFiles: state.inventory,
      ...(e.version === 4 ? { codeEdges: state.edges } : {}),
    };
    b.own(context);
    b.own(context);
    if (e.version === 4) parseSyntaxEvidenceV4(e, context);
    else if (e.version === 3) parseSyntaxEvidenceV3(e, context);
    else parseSyntaxEvidenceV2(e, context);
  } else parseSyntaxEvidence(e, references);
}
export function validateSyntaxPair(
  originRow: Row,
  projectionRow: Row,
  metadata: Row,
  unitId: string,
  current: HistoryManifest,
  ancestors: readonly HistoryManifest[],
  b: HistoryReadBudget,
): Row {
  const o = exact(b.parse(text(originRow.origin_json)), [
    'schemaVersion',
    'providerSyntaxId',
    'originSnapshot',
    'sourceFile',
    'unitId',
    'envelope',
  ]);
  requireHistory(o.schemaVersion === 1);
  text(o.providerSyntaxId);
  same(text(originRow.origin_json), encodeHistoryValue(o, b));
  const originEnvelope = exact(o.envelope, ['schema', 'version', 'payload']);
  requireHistory(
    originEnvelope.version === 1 ||
      originEnvelope.version === 2 ||
      originEnvelope.version === 3 ||
      originEnvelope.version === 4,
  );
  const version = originEnvelope.version;
  const od = historyDigest(`codeatlas-syntax-origin-v${version}`, o, b);
  requireHistory(
    originRow.origin_digest === od &&
      originRow.id === 'syntax-origin:' + od &&
      originRow.id === metadata.id &&
      metadata.valueDigest === od &&
      o.unitId === unitId &&
      metadata.unitId === unitId,
  );
  const snap = ProviderSnapshotSchema.parse(o.originSnapshot),
    file = SourceFileSchema.parse(o.sourceFile);
  requireHistory(
    snap.id === originRow.origin_snapshot_id &&
      metadata.originSnapshotId === snap.id &&
      originRow.repository_id === current.state.basis.repositoryId &&
      originRow.revision_id === current.state.basis.revisionId,
  );
  const initial = exact(o.envelope, ['schema', 'version', 'payload']),
    initialPayload = record(initial.payload),
    { id: initialId, ...withoutId } = initialPayload;
  requireHistory(
    initialId === 'syntax:' + historyDigest(`codeatlas-syntax-initial-v${version}`, withoutId, b),
  );
  const refs = array(initialPayload.supportRefs);
  requireHistory(refs.length > 0);
  const oldBasis = record(refs[0]).basis;
  same(oldBasis, metadata.basis);
  let originContext = false;
  for (const m of ancestors) {
    if (
      !isDeepStrictEqual(m.state.basis, oldBasis) ||
      !m.state.inventory.some((f) => isDeepStrictEqual(f, file))
    )
      continue;
    try {
      validateSyntaxEnvelope(initial, m.state, b);
      originContext = true;
      break;
    } catch (e) {
      if (e instanceof HistoryCaptureError && e.code === 'HISTORY_LIMIT_EXCEEDED') throw e;
    }
  }
  requireHistory(originContext);
  const originSnap = current.state.snapshots.find((s) => s.id === snap.id);
  requireHistory(originSnap);
  same(originSnap, snap);
  const unit = current.state.units.find((u) => u.id === unitId);
  requireHistory(
    unit &&
      unit.providerId === snap.providerId &&
      unit.sourceFileIds.includes(file.id) &&
      current.state.inventory.some((f) => isDeepStrictEqual(f, file)),
  );
  const ep = exact(b.parse(text(projectionRow.envelope_json)), ['schema', 'version', 'payload']);
  same(text(projectionRow.envelope_json), encodeHistoryValue(ep, b));
  requireHistory(ep.version === version);
  const projected = record(ep.payload),
    { id, ...payload } = projected,
    pd = historyDigest(
      `codeatlas-syntax-projection-v${version}`,
      { originId: originRow.id, payload },
      b,
    );
  requireHistory(
    projectionRow.projection_digest === pd &&
      projectionRow.id === 'syntax:' + pd &&
      id === projectionRow.id &&
      projectionRow.origin_id === originRow.id &&
      projectionRow.repository_id === current.state.basis.repositoryId,
  );
  const { supportRefs: ignoredOld, ...oldMeaning } = withoutId,
    { supportRefs: ignoredNew, ...newMeaning } = payload;
  void ignoredOld;
  void ignoredNew;
  same(oldMeaning, newMeaning);
  requireHistory(projected.sourceFingerprint === file.contentFingerprint);
  validateSyntaxEnvelope(ep, current.state, b);
  return ep;
}

/** Whole current collection, after each pair was validated; no extra SQL or legacy cost. */
export function validateSyntaxProjectionClosure(
  envelopes: readonly Row[],
  state: HistoryState,
  b: HistoryReadBudget,
): void {
  if (envelopes.some((e) => e.version === 4)) {
    requireHistory(envelopes.every((e) => e.version === 4));
    b.own(envelopes);
    const syntax = envelopes.map((e) => e.payload as SyntaxEvidenceV4);
    b.own(syntax);
    const availableEntities = [
      ...state.nodes.map((n) => ({ kind: 'CODE_NODE', id: n.id })),
      ...state.edges.map((e) => ({ kind: 'CODE_EDGE', id: e.id })),
      ...state.inventory.map((f) => ({ kind: 'SOURCE_FILE', id: f.id })),
    ].map((entity) => ({
      scope: 'REPOSITORY',
      repositoryId: state.basis.repositoryId,
      entity: { ...entity, revisionId: state.basis.revisionId },
    }));
    const supports = syntax.flatMap((s) => s.supportRefs);
    b.own(supports);
    const availableSupports = [...new Map(supports.map((s) => [supportKey(s), s])).values()];
    const context = {
      references: { availableEntities, availableSupports },
      codeNodes: state.nodes,
      codeEdges: state.edges,
      sourceFiles: state.inventory,
    };
    b.own(context);
    b.own(context);
    validateSyntaxSurfaceClosure(syntax, context);
    return;
  }
  if (!envelopes.some((e) => e.version === 3)) return;
  requireHistory(envelopes.every((e) => e.version === 3));
  b.own(envelopes);
  const syntax = envelopes.map((e) => e.payload as SyntaxEvidenceV3);
  b.own(syntax);
  const context = {
    references: { availableEntities: [], availableSupports: [] },
    codeNodes: state.nodes,
    sourceFiles: state.inventory,
  };
  b.own(context);
  b.own(context);
  validateSyntaxBindingScopeClosure(syntax, context);
}
