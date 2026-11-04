import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  parseRuntimeSitePlan,
  ensurePhase1Data,
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  phase1Assert,
  scopedRefKey,
  entityRefKey,
  RuntimeEntityIdSchema,
  assertRuntimeRequestControl,
  runtimeStopReason,
  type RuntimeRequestControl,
  type RuntimeFactSet,
  type SupportRef,
  type SourceRange,
} from '@codeatlas/ir';
import {
  validateExecutionInput,
  mergeSupports,
  scoped,
  frozen,
  orderedFacts,
  orderedCoverage,
  exactOrder,
  executionUnits,
  hasExecutionPolicy,
} from './declared-execution.js';
export type FormalGraphCandidate = {
  facts: ReturnType<typeof parseRuntimeFactSet>;
  bindings: ReturnType<typeof parseFrameworkBindingSet>;
  coverage: ReturnType<typeof orderedCoverage>;
  frontier: ReturnType<typeof scoped>[];
  termination: 'COMPLETE' | 'BUDGET' | 'DEPTH' | 'CANCELLED' | 'DEADLINE';
};
export function formalCommon(
  basis: RuntimeFactSet['basis'],
  domain: string,
  kind: string,
  meaning: unknown[],
  sourceRange: SourceRange | null,
  supportRefs: SupportRef[],
  reason: string,
  policy = 'runtime-execution-declaration-v1',
) {
  const H = (d: string, t: unknown[]) =>
    createHash('sha256')
      .update(d + '\0' + JSON.stringify(t))
      .digest('hex');
  const factKey = 'execution-fact:' + H(domain + '-fact', [basis.repositoryId, kind, meaning]);
  return {
    id: RuntimeEntityIdSchema.parse(
      'execution:' + H(domain + '-entity', [basis.repositoryId, basis.revisionId, kind, factKey]),
    ),
    factKey,
    repositoryId: basis.repositoryId,
    revisionId: basis.revisionId,
    basis,
    sourceRange,
    supportRefs,
    confidence: {
      score: 0.5,
      method: policy,
      reasons: ['CURRENT_INPUT_BASIS', 'DECLARATION_EXECUTION_DERIVED', reason],
    },
    resolution: 'HEURISTIC' as const,
  };
}
/** Structural candidates only; Store must authenticate current membership before publishing. */
export function deriveExecutionGraph(
  input: unknown,
  control: RuntimeRequestControl,
): FormalGraphCandidate {
  return deriveGraph(input, control);
}
/** Private fixed Runtime V2 continuation; roles must come from the trusted V5 compiler. */
export function deriveExecutionGraphV2(input: unknown, control: RuntimeRequestControl) {
  ensurePhase1Data(input);
  phase1Assert(input !== null && typeof input === 'object' && !Array.isArray(input));
  const { sitePlan, syntaxEvidence, syntaxMembershipDigest, ...legacy } = input as Record<
    string,
    unknown
  >;
  return frozen({
    ...deriveGraph(legacy, control, { sitePlan, syntaxEvidence, syntaxMembershipDigest }),
    coverageScope: 'LOCAL_DECLARED_RUNTIME' as const,
  });
}
function deriveGraph(
  input: unknown,
  control: RuntimeRequestControl,
  surface?: { sitePlan: unknown; syntaxEvidence: unknown; syntaxMembershipDigest: unknown },
): FormalGraphCandidate {
  assertRuntimeRequestControl(control);
  phase1Assert(input !== null && typeof input === 'object' && !Array.isArray(input));
  const { bindingFacts, ...legacy } = input as Record<string, unknown>;
  const {
    c,
    facts,
    p: initial,
    nodes,
    inventory,
    adjacency,
  } = validateExecutionInput(legacy, control.maxItems);
  const executionPolicy = surface
      ? 'runtime-execution-declaration-v2'
      : 'runtime-execution-declaration-v1',
    domainPolicy = surface ? 'runtime-declaration-support-v2' : 'runtime-declaration-support-v1';
  const p = { ...initial, entryPoints: [...initial.entryPoints], triggers: [...initial.triggers] };
  const bindings = parseFrameworkBindingSet(bindingFacts, facts);
  for (const b of bindings.payload.bindings)
    phase1Assert(
      b.confidence.method === domainPolicy &&
        b.confidence.score === 0.5 &&
        b.resolution === 'HEURISTIC',
    );
  let suppressed = new Set<string>(),
    surfaceCost = 0;
  if (surface) {
    phase1Assert(
      Array.isArray(surface.syntaxEvidence) && surface.syntaxEvidence.length <= control.maxItems,
    );
    const availableEntities = c.supportInventory.map((s) => ({
        scope: 'REPOSITORY',
        repositoryId: c.basis.repositoryId,
        entity: s.entity,
      })),
      plan = parseRuntimeSitePlan(surface.sitePlan, {
        basis: c.basis,
        syntaxMembershipDigest: surface.syntaxMembershipDigest,
        syntaxEvidence: surface.syntaxEvidence,
        syntaxContext: {
          references: { availableEntities, availableSupports: c.supportInventory },
          codeNodes: c.nodes,
          codeEdges: c.edges,
          sourceFiles: c.sourceFiles,
        },
        bindings: bindings.payload.bindings,
      });
    suppressed = new Set(
      plan.entries
        .filter(
          (e) =>
            e.codeCallRef &&
            ['FRAMEWORK_BOUNDARY', 'FRAMEWORK_ORIGIN', 'CALLBACK_BODY'].includes(e.role),
        )
        .map((e) => String(e.codeCallRef!.entity.id)),
    );
    surfaceCost = plan.entries.reduce(
      (n, e) => n + 1 + e.proofSyntaxKeys.length + e.bindingIds.length,
      0,
    );
  }
  bindings.payload.bindings.sort((a, b) => exactOrder(a.id, b.id));
  bindings.payload.externalRefs.sort((a, b) => exactOrder(scopedRefKey(a), scopedRefKey(b)));
  bindings.payload.supportInventory = mergeSupports(bindings.payload.supportInventory);
  const watchEntries = new Map<string, string>(),
    entryTriggers = new Map<string, RuntimeFactSet['triggers'][number]>();
  for (const b of bindings.payload.bindings)
    if (b.kind === 'DATA_WATCH') {
      const handler = nodes.get(String(b.handlerRef.entity.id)),
        resource = p.dataResources.find((r) => r.id === b.resourceRef.entity.id);
      if (
        !handler ||
        handler.kind !== 'SYMBOL' ||
        !['METHOD', 'FUNCTION'].includes(handler.symbolKind) ||
        handler.confidence.score < 0.5 ||
        !resource
      )
        continue;
      const refs = [inventory.get(entityRefKey(b.handlerRef.entity))];
      if (handler.sourceRange)
        refs.push(
          inventory.get(
            entityRefKey(scoped(c.basis, 'SOURCE_FILE', handler.sourceRange.sourceFileId).entity),
          ),
        );
      phase1Assert(refs.every(Boolean));
      const supports = mergeSupports(b.supportRefs, refs as SupportRef[]);
      const trigger = {
        ...formalCommon(
          c.basis,
          'execution-graph-v2',
          'DATA_CHANGE_TRIGGER',
          [b.factKey, resource.factKey, handler.factKey],
          b.sourceRange,
          supports,
          'WATCH_BINDING',
          executionPolicy,
        ),
        confidence: {
          score: 0.5,
          method: domainPolicy,
          reasons: ['CURRENT_INPUT_BASIS', 'WATCH_BINDING'],
        },
        resourceRef: b.resourceRef,
        operation: 'UNKNOWN' as const,
        handlerRef: b.handlerRef,
      };
      const entry = {
        ...formalCommon(
          c.basis,
          'execution-graph-v2',
          'ENTRY_POINT',
          ['DATA_CHANGE', trigger.factKey, handler.factKey],
          handler.sourceRange,
          supports,
          'WATCH_BINDING',
          executionPolicy,
        ),
        triggerKind: 'DATA_CHANGE' as const,
        ownerRef: b.handlerRef,
        contextKind: 'EVENT' as const,
        contractRef: null,
        taskRef: null,
      };
      p.triggers.push(trigger);
      p.entryPoints.push(entry);
      watchEntries.set(b.id, entry.id);
      entryTriggers.set(entry.id, trigger);
      p.supportInventory = mergeSupports(p.supportInventory, supports);
      const ext = new Map(p.externalRefs.map((r) => [scopedRefKey(r), r]));
      for (const support of supports) {
        const r = scoped(c.basis, support.entity.kind, support.entity.id);
        ext.set(scopedRefKey(r), r);
      }
      p.externalRefs = [...ext.values()];
    }

  const coverage = orderedCoverage(c.coverage);
  coverage.limitations = coverage.limitations.filter(
    (s) => !['DECLARATION_ENTRIES_ONLY', 'DOMAIN_RECORDS_ONLY'].includes(s),
  );
  if (!surface) {
    if (!coverage.limitations.includes('NO_EXECUTION_ORDER_PROOF'))
      coverage.limitations.push('NO_EXECUTION_ORDER_PROOF');
    if (!coverage.limitations.includes('DECLARATION_ONLY'))
      coverage.limitations.push('DECLARATION_ONLY');
    coverage.status = 'PARTIAL';
  }
  const pool = new Map(p.supportInventory.map((s) => [entityRefKey(s.entity), s]));
  const external = new Map(p.externalRefs.map((r) => [scopedRefKey(r), r]));
  const contexts: RuntimeFactSet['contexts'] = [],
    outNodes: RuntimeFactSet['nodes'] = [],
    edges: RuntimeFactSet['edges'] = [];
  let used = executionUnits(p, coverage) + bindingSetUnits(bindings.payload) + surfaceCost,
    termination: FormalGraphCandidate['termination'] = 'COMPLETE';
  const frontier: ReturnType<typeof scoped>[] = [];
  // Reserve the two actual metadata items needed to report the first stopped expansion.
  phase1Assert(used + 2 <= control.maxItems);
  const stop = (why: FormalGraphCandidate['termination'], anchor: ReturnType<typeof scoped>) => {
    if (termination === 'COMPLETE') {
      termination = why;
      frontier.push(anchor);
      coverage.limitations.push('TERMINATED_' + why);
    }
  };
  const limit = (text: string, anchor: ReturnType<typeof scoped>) => {
    if (coverage.limitations.includes(text)) return true;
    if (used + 1 + 2 > control.maxItems) {
      stop('BUDGET', anchor);
      return false;
    }
    used++;
    coverage.limitations.push(text);
    return true;
  };
  const retain = (
    records: { supportRefs: SupportRef[] }[],
    refs: ReturnType<typeof scoped>[] = [],
  ): boolean => {
    const supports = mergeSupports(...records.map((r) => r.supportRefs));
    const nextPool = new Map(pool),
      nextExternal = new Map(external);
    for (const s of supports) {
      const key = entityRefKey(s.entity),
        old = nextPool.get(key);
      phase1Assert(!old || isDeepStrictEqual(old, s));
      nextPool.set(key, s);
      const r = scoped(c.basis, s.entity.kind, s.entity.id);
      nextExternal.set(scopedRefKey(r), r);
    }
    for (const r of refs) nextExternal.set(scopedRefKey(r), r);
    const cost =
      records.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
      (nextPool.size - pool.size) +
      (nextExternal.size - external.size);
    if (used + cost + 2 > control.maxItems) return false;
    used += cost;
    for (const [k, v] of nextPool) pool.set(k, v);
    for (const [k, v] of nextExternal) external.set(k, v);
    return true;
  };
  const fromCode = (kind: string, id: string, range: SourceRange | null) => {
    const refs = [inventory.get(entityRefKey(scoped(c.basis, kind, id).entity))];
    if (range)
      refs.push(
        inventory.get(entityRefKey(scoped(c.basis, 'SOURCE_FILE', range.sourceFileId).entity)),
      );
    phase1Assert(refs.every(Boolean));
    return mergeSupports(refs as SupportRef[]);
  };
  const common = (
    kind: string,
    meaning: unknown[],
    range: SourceRange | null,
    supports: SupportRef[],
    reason: string,
  ) =>
    formalCommon(
      c.basis,
      'execution-graph-v2',
      kind,
      meaning,
      range,
      supports,
      reason,
      executionPolicy,
    );
  type Work = { ctx: RuntimeFactSet['contexts'][number]; codeId: string; depth: number };
  const queue: Work[] = [],
    byCode = new Map<string, RuntimeFactSet['nodes'][number]>();
  const key = (ctx: string, code: string) => JSON.stringify([ctx, code]);
  const check = (anchor: ReturnType<typeof scoped>) => {
    const why = runtimeStopReason(control);
    if (why) stop(why, anchor);
    return termination === 'COMPLETE';
  };
  for (const entry of [...p.entryPoints].sort((a, b) => exactOrder(a.factKey, b.factKey))) {
    if (!check(entry.ownerRef)) break;
    const owner = nodes.get(String(entry.ownerRef.entity.id));
    phase1Assert(
      hasExecutionPolicy(entry, executionPolicy) &&
        owner?.kind === 'SYMBOL' &&
        ['FUNCTION', 'METHOD'].includes(owner.symbolKind) &&
        owner.confidence.score >= 0.5,
    );
    const trigger =
      entryTriggers.get(entry.id) ??
      (entry.triggerKind === 'DATA_CHANGE' &&
      p.triggers.filter((t) => t.handlerRef.entity.id === entry.ownerRef.entity.id).length === 1
        ? p.triggers.find((t) => t.handlerRef.entity.id === entry.ownerRef.entity.id)
        : undefined);
    const domain = entry.contractRef
      ? p.contracts.find((r) => r.id === entry.contractRef!.entity.id)
      : entry.taskRef
        ? p.tasks.find((r) => r.id === entry.taskRef!.entity.id)
        : trigger;
    const implementation =
      domain && ('handlerRef' in domain ? domain.handlerRef : domain.implementationRef);
    phase1Assert(
      domain &&
        implementation &&
        isDeepStrictEqual(implementation, entry.ownerRef) &&
        domain.confidence.method === domainPolicy &&
        domain.confidence.score === 0.5 &&
        domain.resolution === 'HEURISTIC',
    );
    phase1Assert(
      'protocol' in domain
        ? (entry.triggerKind === 'HTTP' &&
            entry.contextKind === 'REQUEST' &&
            domain.protocol === 'HTTP' &&
            domain.direction === 'PROVIDER') ||
            (entry.triggerKind === 'MESSAGE' &&
              entry.contextKind === 'EVENT' &&
              domain.protocol === 'MESSAGE' &&
              domain.direction === 'CONSUMER')
        : 'taskKind' in domain
          ? entry.contextKind === domain.taskKind &&
            (domain.taskKind === 'JOB'
              ? entry.triggerKind === 'SCHEDULE'
              : domain.taskKind === 'TASK'
                ? entry.triggerKind === 'TASK'
                : entry.triggerKind === 'BATCH')
          : entry.triggerKind === 'DATA_CHANGE' &&
            entry.contextKind === 'EVENT' &&
            Boolean(trigger),
    );
    const ctx = {
      ...common(
        'EXECUTION_CONTEXT',
        [entry.factKey],
        entry.sourceRange,
        entry.supportRefs,
        'ENTRY_BINDING',
      ),
      kind: entry.contextKind,
      entryRef: scoped(c.basis, 'ENTRY_POINT', entry.id),
      parentContextRef: null,
    };
    const n = {
      ...common(
        'EXECUTION_NODE',
        [ctx.factKey, 'ENTRY', owner.factKey],
        entry.sourceRange,
        entry.supportRefs,
        'ENTRY_BINDING',
      ),
      kind: 'ENTRY' as const,
      contextRef: scoped(c.basis, 'EXECUTION_CONTEXT', ctx.id),
      targetRef: entry.ownerRef,
    };
    if (!retain([ctx, n])) {
      stop('BUDGET', entry.ownerRef);
      break;
    }
    contexts.push(ctx);
    outNodes.push(n);
    byCode.set(key(ctx.id, String(owner.id)), n);
    queue.push({ ctx, codeId: String(owner.id), depth: 0 });
  }
  const seen = new Set<string>();
  for (let i = 0; i < queue.length && termination === 'COMPLETE'; i++) {
    const { ctx, codeId, depth } = queue[i]!,
      anchor = scoped(c.basis, 'CODE_NODE', codeId);
    if (!check(anchor)) break;
    const k = key(ctx.id, codeId);
    if (seen.has(k)) continue;
    seen.add(k);
    const src = byCode.get(k)!;
    for (const edge of adjacency.get(codeId) ?? []) {
      if (suppressed.has(String(edge.id))) continue;
      if (!check(anchor)) break;
      if (depth >= control.maxDepth) {
        stop('DEPTH', anchor);
        break;
      }
      if (edge.confidence.score < 0.5) {
        if (!limit('LOW_SUPPORT_CALL', anchor)) break;
        continue;
      }
      const raw = edge.target,
        refs = raw.state === 'RESOLVED' ? [raw.target] : raw.candidates;
      const fresh: RuntimeFactSet['nodes'] = [],
        targets: RuntimeFactSet['nodes'] = [];
      for (const r of refs) {
        const code = nodes.get(String(r.id));
        if (
          !code ||
          code.kind !== 'SYMBOL' ||
          !['METHOD', 'FUNCTION', 'CONSTRUCTOR'].includes(code.symbolKind) ||
          code.confidence.score < 0.5
        )
          continue;
        let n = byCode.get(key(ctx.id, String(code.id)));
        if (!n) {
          n = {
            ...common(
              'EXECUTION_NODE',
              [ctx.factKey, 'CODE', code.factKey],
              code.sourceRange,
              fromCode('CODE_NODE', code.id, code.sourceRange),
              'CODE_CALL_SUPPORTED',
            ),
            kind: 'CODE',
            contextRef: scoped(c.basis, 'EXECUTION_CONTEXT', ctx.id),
            targetRef: scoped(c.basis, 'CODE_NODE', code.id),
          };
          fresh.push(n);
        }
        targets.push(n);
      }
      const resolved =
        raw.state === 'RESOLVED' && raw.resolution === 'EXACT' && targets.length === 1;
      const target: RuntimeFactSet['edges'][number]['target'] = resolved
        ? { state: 'RESOLVED', target: scoped(c.basis, 'EXECUTION_NODE', targets[0]!.id) }
        : {
            state: 'NON_RESOLVED',
            resolution: raw.state === 'UNRESOLVED' ? raw.resolution : 'UNRESOLVED',
            hint: raw.state === 'UNRESOLVED' ? raw.originalHint : 'CODE_TARGET_NOT_EXACT',
            candidates: targets.map((n) => scoped(c.basis, 'EXECUTION_NODE', n.id)),
          };
      const out = {
        ...common(
          'EXECUTION_EDGE',
          [
            ctx.factKey,
            'CALL',
            null,
            src.factKey,
            resolved ? targets[0]!.factKey : null,
            edge.factKey,
          ],
          edge.sourceRange,
          mergeSupports(
            fromCode('CODE_NODE', codeId, nodes.get(codeId)!.sourceRange),
            fromCode('CODE_EDGE', edge.id, edge.sourceRange),
            ...targets.map((n) => n.supportRefs),
          ),
          'CODE_CALL_SUPPORTED',
        ),
        contextRef: src.contextRef,
        sourceRef: scoped(c.basis, 'EXECUTION_NODE', src.id),
        target,
        transitionKind: 'CALL' as const,
        guard: null,
        boundaryRef: null,
      };
      if (!resolved && !limit('UNRESOLVED_CALL', anchor)) break;
      if (!retain([...fresh, out])) {
        stop('BUDGET', anchor);
        break;
      }
      for (const n of fresh) {
        outNodes.push(n);
        byCode.set(key(ctx.id, String(n.targetRef.entity.id)), n);
      }
      edges.push(out);
      if (resolved)
        queue.push({ ctx, codeId: String(targets[0]!.targetRef.entity.id), depth: depth + 1 });
    }
    if (termination !== 'COMPLETE') break;
    for (const b of [...bindings.payload.bindings].sort((a, b) =>
      exactOrder(a.factKey, b.factKey),
    )) {
      if (b.ownerRef.entity.id !== anchor.entity.id || b.kind === 'DEPENDENCY') continue;
      if (
        b.kind === 'MESSAGE_CONSUME' &&
        (ctx.kind !== 'EVENT' ||
          src.kind !== 'ENTRY' ||
          p.entryPoints.find((e) => e.id === ctx.entryRef.entity.id)?.contractRef?.entity.id !==
            b.contractRef.entity.id)
      )
        continue;
      if (!check(anchor)) break;
      phase1Assert(
        b.confidence.method === domainPolicy &&
          b.confidence.score === 0.5 &&
          b.resolution === 'HEURISTIC',
      );
      const targetRef =
        'resourceRef' in b ? b.resourceRef : 'contractRef' in b ? b.contractRef : b.taskRef;
      const target = [...p.dataResources, ...p.contracts, ...p.tasks].find(
        (r) => r.id === targetRef.entity.id,
      );
      phase1Assert(target);
      const bindingRef = scoped(c.basis, 'FRAMEWORK_BINDING', b.id);
      const data = b.kind === 'DATA_READ' || b.kind === 'DATA_WRITE';
      const n = {
        ...common(
          'EXECUTION_NODE',
          [ctx.factKey, data ? 'DATA' : 'BOUNDARY', b.factKey, target.factKey],
          b.sourceRange,
          b.supportRefs,
          'BOUNDARY_BINDING',
        ),
        kind: data ? ('DATA' as const) : ('BOUNDARY' as const),
        contextRef: src.contextRef,
        targetRef,
      };
      const call = {
        ...common(
          'EXECUTION_EDGE',
          [ctx.factKey, 'CALL', b.factKey, src.factKey, n.factKey],
          b.sourceRange,
          b.supportRefs,
          'BOUNDARY_BINDING',
        ),
        contextRef: src.contextRef,
        sourceRef: scoped(c.basis, 'EXECUTION_NODE', src.id),
        target: { state: 'RESOLVED' as const, target: scoped(c.basis, 'EXECUTION_NODE', n.id) },
        transitionKind: 'CALL' as const,
        guard: null,
        boundaryRef: bindingRef,
      };
      const records: (RuntimeFactSet['nodes'][number] | RuntimeFactSet['edges'][number])[] = [n];
      if (b.kind !== 'MESSAGE_CONSUME') records.push(call);
      let boundaryEdge: RuntimeFactSet['edges'][number] | null = null;
      if (b.kind !== 'DATA_READ' && b.kind !== 'DATA_WRITE') {
        const transition = (
          {
            HTTP_CALL: 'HTTP',
            MESSAGE_PUBLISH: 'PUBLISH',
            MESSAGE_CONSUME: 'CONSUME',
            TASK_CREATE: 'CREATE_TASK',
            TASK_EXECUTE: 'EXECUTE_TASK',
            DATA_WATCH: 'DATA_CHANGE',
          } as const
        )[b.kind];
        let destinations: RuntimeFactSet['nodes'] = [];
        if (b.kind === 'MESSAGE_CONSUME') destinations = [src];
        else if (b.kind === 'DATA_WATCH') {
          const entryId = watchEntries.get(b.id),
            targetCtx = contexts.find((c) => c.entryRef.entity.id === entryId);
          if (targetCtx)
            destinations = outNodes.filter(
              (n) => n.contextRef.entity.id === targetCtx.id && n.kind === 'ENTRY',
            );
        } else if (b.kind === 'TASK_CREATE' || b.kind === 'TASK_EXECUTE') {
          const entries = new Set(
            p.entryPoints
              .filter((e) => e.taskRef?.entity.id === b.taskRef.entity.id)
              .map((e) => String(e.id)),
          );
          const cs = new Set(
            contexts
              .filter((c) => entries.has(String(c.entryRef.entity.id)))
              .map((c) => String(c.id)),
          );
          destinations = outNodes.filter(
            (n) => cs.has(String(n.contextRef.entity.id)) && n.kind === 'ENTRY',
          );
        }
        const boundaryTarget: RuntimeFactSet['edges'][number]['target'] =
          destinations.length === 1
            ? { state: 'RESOLVED', target: scoped(c.basis, 'EXECUTION_NODE', destinations[0]!.id) }
            : {
                state: 'NON_RESOLVED',
                resolution: destinations.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED',
                hint:
                  surface &&
                  destinations.length === 0 &&
                  (b.kind === 'HTTP_CALL' || b.kind === 'MESSAGE_PUBLISH')
                    ? 'CROSS_REPO_RESOLUTION_PENDING'
                    : 'NO_UNIQUE_PROVED_BOUNDARY_TARGET',
                candidates: destinations.map((n) => scoped(c.basis, 'EXECUTION_NODE', n.id)),
              };
        const boundary = {
          ...common(
            'EXECUTION_EDGE',
            [
              ctx.factKey,
              transition,
              b.factKey,
              n.factKey,
              destinations.length === 1 ? destinations[0]!.factKey : null,
            ],
            b.sourceRange,
            mergeSupports(b.supportRefs, ...destinations.map((n) => n.supportRefs)),
            'BOUNDARY_BINDING',
          ),
          contextRef: src.contextRef,
          sourceRef: scoped(c.basis, 'EXECUTION_NODE', n.id),
          target: boundaryTarget,
          transitionKind: transition,
          guard: null,
          boundaryRef: bindingRef,
        };
        boundaryEdge = boundary;
        records.push(boundary);
      }
      if (
        boundaryEdge?.target.state === 'NON_RESOLVED' &&
        !(surface && boundaryEdge.target.hint === 'CROSS_REPO_RESOLUTION_PENDING') &&
        !limit('BOUNDARY_TARGET_UNRESOLVED', anchor)
      )
        break;
      if (!retain(records, [bindingRef])) {
        stop('BUDGET', anchor);
        break;
      }
      outNodes.push(n);
      if (b.kind !== 'MESSAGE_CONSUME') edges.push(call);
      if (boundaryEdge) edges.push(boundaryEdge);
    }
  }
  if (surface)
    coverage.status =
      termination === 'COMPLETE' &&
      coverage.limitations.length === 0 &&
      coverage.unverifiedRefs.length === 0
        ? 'COMPLETE'
        : 'PARTIAL';
  const payload = orderedFacts({
    ...p,
    contexts,
    nodes: outNodes,
    edges,
    externalRefs: [...external.values()],
    supportInventory: [...pool.values()],
  });
  return frozen({
    facts: parseRuntimeFactSet({ ...facts, payload }),
    bindings,
    coverage: orderedCoverage(coverage),
    frontier,
    termination,
  });
}

/** Retained references in the separate binding envelope count against the same output budget. */
export function bindingSetUnits(p: ReturnType<typeof parseFrameworkBindingSet>['payload']) {
  return (
    p.externalRefs.length +
    p.supportInventory.length +
    p.bindings.reduce((n, b) => n + 1 + b.supportRefs.length, 0)
  );
}
