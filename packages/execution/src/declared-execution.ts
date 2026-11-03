import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  SourceFileSchema,
  RepoBasisSchema,
  SupportRefSchema,
  Phase1CoverageSchema,
  EntityIdSchema,
  RuntimeEntityIdSchema,
  parseRuntimeFactSet,
  parseIr,
  ensurePhase1Data,
  phase1Assert,
  entityRefKey,
  scopedRefKey,
  type RepoBasis,
  type SupportRef,
  type ScopedRef,
  type SourceRange,
  type RuntimeFactSet,
  type CanonicalNode,
} from '@codeatlas/ir';
export const executionPolicy = 'runtime-execution-declaration-v1';
export type DeclaredExecutionCandidate = {
  facts: ReturnType<typeof parseRuntimeFactSet>;
  coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
};
export const exactOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function frozen<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
export function scoped(b: RepoBasis, kind: string, id: string): ScopedRef {
  return {
    scope: 'REPOSITORY',
    repositoryId: b.repositoryId,
    entity: { kind, id: EntityIdSchema.parse(id), revisionId: b.revisionId },
  };
}
export function executionIdentity(b: RepoBasis, kind: string, meaning: unknown[]) {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const factKey =
    'execution-fact:' +
    sha('declared-execution-fact-v1\0' + JSON.stringify([b.repositoryId, kind, meaning]));
  return {
    factKey,
    id: RuntimeEntityIdSchema.parse(
      'execution:' +
        sha(
          'declared-execution-entity-v1\0' +
            JSON.stringify([b.repositoryId, b.revisionId, kind, factKey]),
        ),
    ),
  };
}
export function mergeSupports(...groups: SupportRef[][]): SupportRef[] {
  const map = new Map<string, SupportRef>();
  for (const group of groups)
    for (const s of group) {
      const key = entityRefKey(s.entity),
        old = map.get(key);
      phase1Assert(!old || isDeepStrictEqual(old, s));
      map.set(key, s);
    }
  return [...map].sort(([a], [b]) => exactOrder(a, b)).map(([, s]) => s);
}
export function executionCommon(
  b: RepoBasis,
  kind: string,
  meaning: unknown[],
  sourceRange: SourceRange | null,
  supportRefs: SupportRef[],
  reason: string,
) {
  return {
    ...executionIdentity(b, kind, meaning),
    repositoryId: b.repositoryId,
    revisionId: b.revisionId,
    basis: b,
    sourceRange,
    supportRefs,
    confidence: {
      score: 0.5,
      method: executionPolicy,
      reasons: ['CURRENT_INPUT_BASIS', 'DECLARATION_EXECUTION_DERIVED', reason],
    },
    resolution: 'HEURISTIC' as const,
  };
}
export function hasExecutionPolicy(
  r: {
    confidence: { method: string; score: number };
    resolution: string;
  },
  policy = executionPolicy,
): boolean {
  return (
    r.confidence.method === policy && r.confidence.score === 0.5 && r.resolution === 'HEURISTIC'
  );
}
export function executionBudget(maxItems: number, initial = 0) {
  phase1Assert(Number.isSafeInteger(maxItems) && maxItems > 0);
  let used = initial;
  phase1Assert(used <= maxItems);
  return (n: number) => {
    phase1Assert(Number.isSafeInteger(n) && n >= 0 && used + n <= maxItems);
    used += n;
  };
}
export function executionUnits(
  p: RuntimeFactSet,
  c: DeclaredExecutionCandidate['coverage'],
): number {
  const records = [
    ...p.entryPoints,
    ...p.tasks,
    ...p.dataResources,
    ...p.triggers,
    ...p.contracts,
    ...p.contexts,
    ...p.nodes,
    ...p.edges,
    ...p.flows,
  ];
  let n =
    records.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    p.externalRefs.length +
    p.supportInventory.length +
    c.limitations.length +
    c.unverifiedRefs.length;
  for (const f of p.flows) {
    n += f.contexts.length + f.coverage.limitations.length + f.coverage.unverifiedRefs.length;
    for (const s of f.steps)
      n +=
        1 +
        s.executionNodeRefs.length +
        s.incomingEdgeRefs.length +
        s.outgoingStepKeys.length +
        s.supportRefs.length;
  }
  return n;
}
const callable = (n: CanonicalNode | undefined) =>
  n?.kind === 'SYMBOL' && ['METHOD', 'FUNCTION', 'CONSTRUCTOR'].includes(n.symbolKind);
export function deriveDeclaredExecutionGraph(
  input: unknown,
  maxItems: number,
): DeclaredExecutionCandidate {
  const { c, facts, p, nodes, files, inventory, adjacency } = validateExecutionInput(
    input,
    maxItems,
  );
  phase1Assert(c.coverage.status === 'PARTIAL');
  const coverage = {
    status: 'PARTIAL' as const,
    limitations: [...c.coverage.limitations.filter((s) => s !== 'DECLARATION_ENTRIES_ONLY')],
    unverifiedRefs: [...c.coverage.unverifiedRefs],
  };
  const charge = executionBudget(maxItems, executionUnits(p, coverage));
  const limit = (text: string) => {
    if (!coverage.limitations.includes(text)) {
      charge(1);
      coverage.limitations.push(text);
    }
  };
  limit('DECLARATION_ONLY');
  limit('NO_EXECUTION_ORDER_PROOF');
  if (p.contracts.some((c) => c.protocol === 'MESSAGE')) limit('MESSAGE_BOUNDARIES_UNCONNECTED');
  if (p.dataResources.length) limit('DATA_OPERATIONS_UNASSEMBLED');
  const pool = new Map(p.supportInventory.map((s) => [entityRefKey(s.entity), s])),
    external = new Map<string, ScopedRef>(p.externalRefs.map((r) => [scopedRefKey(r), r]));
  const addExternal = (r: ScopedRef) => {
    const k = scopedRefKey(r);
    if (!external.has(k)) {
      charge(1);
      external.set(k, r);
    }
  };
  const retainSupport = (s: SupportRef) => {
    const key = entityRefKey(s.entity),
      old = pool.get(key);
    phase1Assert(!old || isDeepStrictEqual(old, s));
    if (!old) {
      charge(1);
      pool.set(key, s);
    }
    addExternal(scoped(c.basis, s.entity.kind, s.entity.id));
  };
  const retain = <T extends { supportRefs: SupportRef[] }>(r: T): T => {
    charge(1 + r.supportRefs.length);
    for (const s of r.supportRefs) retainSupport(s);
    return r;
  };
  const fromCode = (kind: string, id: string, range: SourceRange | null): SupportRef[] => {
    const s = inventory.get(entityRefKey(scoped(c.basis, kind, id).entity));
    phase1Assert(s);
    const refs = [s!];
    if (range) {
      const file = inventory.get(
        entityRefKey(scoped(c.basis, 'SOURCE_FILE', range.sourceFileId).entity),
      );
      phase1Assert(file);
      refs.push(file!);
    }
    return mergeSupports(refs);
  };
  const markUnverified = (id: string) => {
    const ref = scoped(c.basis, 'CODE_NODE', id);
    if (!coverage.unverifiedRefs.some((r) => scopedRefKey(r) === scopedRefKey(ref))) {
      charge(1);
      coverage.unverifiedRefs.push(ref);
    }
    addExternal(ref);
  };
  const outputContexts: RuntimeFactSet['contexts'] = [],
    outputNodes: RuntimeFactSet['nodes'] = [],
    outputEdges: RuntimeFactSet['edges'] = [];
  for (const entry of [...p.entryPoints].sort((a, b) => exactOrder(a.factKey, b.factKey))) {
    phase1Assert(hasExecutionPolicy(entry) && entry.ownerRef.scope === 'REPOSITORY');
    const owner = nodes.get(String(entry.ownerRef.entity.id));
    phase1Assert(
      owner?.kind === 'SYMBOL' &&
        ['METHOD', 'FUNCTION'].includes(owner.symbolKind) &&
        owner.confidence.score >= 0.5,
    );
    const contract = entry.contractRef
      ? p.contracts.find((r) => r.id === entry.contractRef!.entity.id)
      : undefined;
    const task = entry.taskRef ? p.tasks.find((r) => r.id === entry.taskRef!.entity.id) : undefined;
    phase1Assert(Boolean(contract) !== Boolean(task));
    const domain = contract ?? task;
    phase1Assert(
      domain &&
        domain.confidence.method === 'runtime-declaration-support-v1' &&
        domain.confidence.score === 0.5 &&
        domain.resolution === 'HEURISTIC',
    );
    phase1Assert(
      domain!.implementationRef && isDeepStrictEqual(entry.ownerRef, domain!.implementationRef),
    );
    phase1Assert(
      entry.triggerKind === 'HTTP'
        ? entry.contextKind === 'REQUEST' &&
            contract?.protocol === 'HTTP' &&
            contract.direction === 'PROVIDER'
        : entry.triggerKind === 'MESSAGE'
          ? entry.contextKind === 'EVENT' &&
            contract?.protocol === 'MESSAGE' &&
            contract.direction === 'CONSUMER'
          : entry.triggerKind === 'SCHEDULE' &&
            entry.contextKind === 'JOB' &&
            task?.taskKind === 'JOB',
    );
    const ctx = retain({
      ...executionCommon(
        c.basis,
        'EXECUTION_CONTEXT',
        [entry.factKey],
        entry.sourceRange,
        entry.supportRefs,
        'ENTRY_BINDING',
      ),
      kind: entry.contextKind,
      entryRef: scoped(c.basis, 'ENTRY_POINT', entry.id),
      parentContextRef: null,
    });
    outputContexts.push(ctx);
    const byCode = new Map<string, RuntimeFactSet['nodes'][number]>();
    const nodeFor = (code: CanonicalNode) => {
      const old = byCode.get(String(code.id));
      if (old) return old;
      const root = String(code.id) === String(owner!.id),
        kind = root ? ('ENTRY' as const) : ('CODE' as const);
      const n = retain({
        ...executionCommon(
          c.basis,
          'EXECUTION_NODE',
          [ctx.factKey, kind, code.factKey],
          root ? entry.sourceRange : code.sourceRange,
          root ? entry.supportRefs : fromCode('CODE_NODE', code.id, code.sourceRange),
          root ? 'ENTRY_BINDING' : 'CODE_CALL_SUPPORTED',
        ),
        kind,
        contextRef: scoped(c.basis, 'EXECUTION_CONTEXT', ctx.id),
        targetRef: scoped(c.basis, 'CODE_NODE', code.id),
      });
      byCode.set(String(code.id), n);
      outputNodes.push(n);
      return n;
    };
    nodeFor(owner!);
    const queue: CanonicalNode[] = [owner!],
      expanded = new Set<string>();
    for (let position = 0; position < queue.length; position++) {
      const source = queue[position]!;
      if (expanded.has(String(source.id))) continue;
      expanded.add(String(source.id));
      for (const edge of adjacency.get(String(source.id)) ?? []) {
        if (edge.confidence.score < 0.5) {
          limit('LOW_SUPPORT_CALL');
          continue;
        }
        const src = nodeFor(source);
        let target: RuntimeFactSet['edges'][number]['target'];
        const targetNodes: RuntimeFactSet['nodes'][number][] = [];
        const raw = edge.target;
        const allowed = (id: string) => {
          const n = nodes.get(id);
          return callable(n) && n!.confidence.score >= 0.5 ? n : undefined;
        };
        if (
          raw.state === 'RESOLVED' &&
          raw.resolution === 'EXACT' &&
          allowed(String(raw.target.id))
        ) {
          const code = nodes.get(String(raw.target.id))!;
          const n = nodeFor(code);
          targetNodes.push(n);
          queue.push(code);
          target = { state: 'RESOLVED', target: scoped(c.basis, 'EXECUTION_NODE', n.id) };
        } else {
          const refs = raw.state === 'RESOLVED' ? [raw.target] : raw.candidates;
          let resolution: 'UNRESOLVED' | 'AMBIGUOUS' | 'UNSUPPORTED' =
            raw.state === 'UNRESOLVED' ? raw.resolution : 'UNRESOLVED';
          let hint = raw.state === 'UNRESOLVED' ? raw.originalHint : 'HEURISTIC_CODE_TARGET';
          if (raw.state === 'RESOLVED' && raw.resolution === 'EXACT') {
            if (!callable(nodes.get(String(raw.target.id)))) {
              resolution = 'UNSUPPORTED';
              hint = 'NON_CALLABLE_CODE_TARGET';
            } else hint = 'LOW_SUPPORT_TARGET';
          }
          for (const r of refs) {
            markUnverified(r.id);
            const code = allowed(String(r.id));
            if (code) targetNodes.push(nodeFor(code));
          }
          target = {
            state: 'NON_RESOLVED',
            resolution,
            hint,
            candidates: targetNodes
              .map((n) => scoped(c.basis, 'EXECUTION_NODE', n.id))
              .sort((a, b) => exactOrder(String(a.entity.id), String(b.entity.id))),
          };
          limit('UNRESOLVED_CALL');
        }
        const supports = mergeSupports(
          fromCode('CODE_NODE', source.id, source.sourceRange),
          fromCode('CODE_EDGE', edge.id, edge.sourceRange),
          ...targetNodes.map((n) => n.supportRefs),
        );
        const out = retain({
          ...executionCommon(
            c.basis,
            'EXECUTION_EDGE',
            [ctx.factKey, src.factKey, edge.factKey],
            edge.sourceRange,
            supports,
            'CODE_CALL_SUPPORTED',
          ),
          contextRef: scoped(c.basis, 'EXECUTION_CONTEXT', ctx.id),
          sourceRef: scoped(c.basis, 'EXECUTION_NODE', src.id),
          target,
          transitionKind: 'CALL' as const,
          guard: null,
          boundaryRef: null,
        });
        outputEdges.push(out);
      }
    }
  }
  const sorted = <T extends { id: string }>(a: T[]) => a.sort((x, y) => exactOrder(x.id, y.id));
  const payload = {
    ...p,
    contexts: sorted(outputContexts),
    nodes: sorted(outputNodes),
    edges: sorted(outputEdges),
    externalRefs: [...external].sort(([a], [b]) => exactOrder(a, b)).map(([, r]) => r),
    supportInventory: [...pool].sort(([a], [b]) => exactOrder(a, b)).map(([, s]) => s),
  };
  coverage.limitations.sort();
  coverage.unverifiedRefs.sort((a, b) => exactOrder(scopedRefKey(a), scopedRefKey(b)));
  return frozen({
    facts: parseRuntimeFactSet({ ...facts, payload: orderedFacts(payload) }),
    coverage: parseIr(Phase1CoverageSchema, coverage),
  });
}

/** IR arrays here are sets, except ordered Flow steps and signature fields. */
export function orderedFacts(p: RuntimeFactSet): RuntimeFactSet {
  const records = <T extends { id: string; supportRefs: SupportRef[] }>(rs: T[]) =>
    rs
      .map((r) => ({ ...r, supportRefs: mergeSupports(r.supportRefs) }))
      .sort((a, b) => exactOrder(a.id, b.id));
  return {
    ...p,
    entryPoints: records(p.entryPoints),
    tasks: records(p.tasks),
    dataResources: records(p.dataResources),
    triggers: records(p.triggers),
    contracts: records(p.contracts),
    contexts: records(p.contexts),
    nodes: records(p.nodes),
    edges: records(p.edges),
    flows: records(p.flows),
    externalRefs: [...p.externalRefs].sort((a, b) => exactOrder(scopedRefKey(a), scopedRefKey(b))),
    supportInventory: mergeSupports(p.supportInventory),
  };
}
export function orderedCoverage(
  c: DeclaredExecutionCandidate['coverage'],
): DeclaredExecutionCandidate['coverage'] {
  return {
    ...c,
    limitations: [...c.limitations].sort(),
    unverifiedRefs: [...c.unverifiedRefs].sort((a, b) =>
      exactOrder(scopedRefKey(a), scopedRefKey(b)),
    ),
  };
}

/** Shared structural input checks; no graph expansion or publication. */
export function validateExecutionInput(input: unknown, maxItems: number) {
  executionBudget(maxItems);
  ensurePhase1Data(input);
  const schema = z.strictObject({
    basis: RepoBasisSchema,
    nodes: z.array(CanonicalNodeSchema).max(maxItems),
    edges: z.array(CanonicalEdgeSchema).max(maxItems),
    sourceFiles: z.array(SourceFileSchema).max(maxItems),
    supportInventory: z.array(SupportRefSchema).max(maxItems),
    entryFacts: z.unknown(),
    coverage: Phase1CoverageSchema,
  });
  const c = parseIr(schema, input),
    facts = parseRuntimeFactSet(c.entryFacts),
    p = facts.payload;
  phase1Assert(isDeepStrictEqual(c.basis, p.basis));
  phase1Assert(!p.contexts.length && !p.nodes.length && !p.edges.length && !p.flows.length);
  let inputCount =
    c.nodes.length + c.edges.length + c.sourceFiles.length + c.supportInventory.length;
  for (const e of c.edges)
    if (e.target.state === 'UNRESOLVED') inputCount += e.target.candidates.length;
  phase1Assert(inputCount <= maxItems);
  const unique = (xs: string[]) => phase1Assert(new Set(xs).size === xs.length);
  unique([...c.nodes, ...c.edges].map((r) => String(r.id)));
  unique(c.nodes.map((r) => String(r.factKey)));
  unique(c.edges.map((r) => String(r.factKey)));
  unique(c.sourceFiles.map((f) => String(f.id)));
  unique(c.sourceFiles.map((f) => f.path));
  unique(c.supportInventory.map((s) => entityRefKey(s.entity)));
  phase1Assert(p.externalRefs.every((r) => r.scope === 'REPOSITORY'));
  phase1Assert(p.supportInventory.every((r) => isDeepStrictEqual(r.basis, c.basis)));
  const nodes = new Map(c.nodes.map((n) => [String(n.id), n])),
    files = new Map(c.sourceFiles.map((f) => [String(f.id), f]));
  const inventory = new Map(c.supportInventory.map((s) => [entityRefKey(s.entity), s]));
  const known = new Set<string>();
  for (const [kind, records] of [
    ['CODE_NODE', c.nodes],
    ['CODE_EDGE', c.edges],
    ['SOURCE_FILE', c.sourceFiles],
  ] as const)
    for (const r of records) {
      phase1Assert(r.repositoryId === c.basis.repositoryId && r.revisionId === c.basis.revisionId);
      known.add(entityRefKey(scoped(c.basis, kind, r.id).entity));
      if ('sourceRange' in r && r.sourceRange)
        phase1Assert(files.has(String(r.sourceRange.sourceFileId)));
    }
  for (const s of c.supportInventory)
    phase1Assert(isDeepStrictEqual(s.basis, c.basis) && known.has(entityRefKey(s.entity)));
  for (const s of p.supportInventory) {
    if (
      s.entity.kind === 'CODE_NODE' ||
      s.entity.kind === 'CODE_EDGE' ||
      s.entity.kind === 'SOURCE_FILE'
    )
      phase1Assert(isDeepStrictEqual(inventory.get(entityRefKey(s.entity)), s));
  }
  const adjacency = new Map<string, typeof c.edges>();
  for (const e of c.edges) {
    phase1Assert(nodes.has(String(e.source.id)));
    const targets = e.target.state === 'RESOLVED' ? [e.target.target] : e.target.candidates;
    for (const t of targets) phase1Assert(nodes.has(String(t.id)));
    if (e.kind === 'CALL') {
      const key = String(e.source.id),
        out = adjacency.get(key) ?? [];
      out.push(e);
      adjacency.set(key, out);
    }
  }
  for (const values of adjacency.values()) values.sort((a, b) => exactOrder(a.factKey, b.factKey));
  return { c, facts, p, nodes, files, inventory, adjacency };
}
