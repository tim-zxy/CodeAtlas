import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  ensurePhase1Data,
  parseIr,
  phase1Assert,
  Phase1CoverageSchema,
  ScopedRefSchema,
  assertRuntimeRequestControl,
  runtimeStopReason,
  type RuntimeRequestControl,
  type RuntimeFactSet,
} from '@codeatlas/ir';
import {
  mergeSupports,
  scoped,
  orderedFacts,
  orderedCoverage,
  frozen,
  exactOrder,
  executionUnits,
  hasExecutionPolicy,
} from './declared-execution.js';
import { formalCommon, bindingSetUnits, type FormalGraphCandidate } from './derive-execution.js';
/** Uncompressed stable graph projection; ordinal is traversal position, not runtime time. */
export function deriveRuntimeFlows(
  input: unknown,
  control: RuntimeRequestControl,
): FormalGraphCandidate {
  return deriveFlows(input, control);
}
export function deriveRuntimeFlowsV2(input: unknown, control: RuntimeRequestControl) {
  ensurePhase1Data(input);
  phase1Assert(input !== null && typeof input === 'object' && !Array.isArray(input));
  const { coverageScope, ...legacy } = input as Record<string, unknown>;
  phase1Assert(coverageScope === 'LOCAL_DECLARED_RUNTIME');
  return frozen({
    ...deriveFlows(legacy, control, true),
    coverageScope: 'LOCAL_DECLARED_RUNTIME' as const,
  });
}
function deriveFlows(
  input: unknown,
  control: RuntimeRequestControl,
  surface = false,
): FormalGraphCandidate {
  const policy = surface ? 'runtime-execution-declaration-v2' : 'runtime-execution-declaration-v1';
  assertRuntimeRequestControl(control);
  ensurePhase1Data(input);
  const c = parseIr(
    z.strictObject({
      facts: z.unknown(),
      bindings: z.unknown(),
      coverage: Phase1CoverageSchema,
      frontier: z.array(ScopedRefSchema),
      termination: z.enum(['COMPLETE', 'BUDGET', 'DEPTH', 'CANCELLED', 'DEADLINE']),
    }),
    input,
  );
  const facts = parseRuntimeFactSet(c.facts),
    p = facts.payload,
    bindings = parseFrameworkBindingSet(c.bindings, facts);
  phase1Assert(!p.flows.length);
  for (const r of [...p.entryPoints, ...p.contexts, ...p.nodes, ...p.edges])
    phase1Assert(hasExecutionPolicy(r, policy));
  const coverage = orderedCoverage(c.coverage),
    frontier = [...c.frontier];
  if (c.termination !== 'COMPLETE')
    return frozen({ facts, bindings, coverage, frontier, termination: c.termination });
  let termination: FormalGraphCandidate['termination'] = c.termination,
    used = executionUnits(p, coverage) + bindingSetUnits(bindings.payload) + frontier.length;
  phase1Assert(used + 2 <= control.maxItems);
  const nodes = new Map(p.nodes.map((n) => [String(n.id), n]));
  const adjacency = new Map<string, RuntimeFactSet['edges']>(),
    incoming = new Map<string, RuntimeFactSet['edges']>();
  for (const e of p.edges) {
    const list = adjacency.get(String(e.sourceRef.entity.id)) ?? [];
    list.push(e);
    adjacency.set(String(e.sourceRef.entity.id), list);
    if (e.target.state === 'RESOLVED') {
      const id = String(e.target.target.entity.id),
        list = incoming.get(id) ?? [];
      list.push(e);
      incoming.set(id, list);
    }
  }
  for (const list of [...adjacency.values(), ...incoming.values()])
    list.sort((a, b) => exactOrder(a.factKey, b.factKey));
  const flows: RuntimeFactSet['flows'] = [];
  const stop = (why: FormalGraphCandidate['termination'], anchor: ReturnType<typeof scoped>) => {
    termination = why;
    coverage.status = 'PARTIAL';
    coverage.limitations.push('FLOW_TERMINATED_' + why);
    frontier.push(anchor);
  };
  for (const entry of [...p.entryPoints].sort((a, b) => exactOrder(a.factKey, b.factKey))) {
    const ctx = p.contexts.find((ctx) => ctx.entryRef.entity.id === entry.id);
    if (!ctx) continue;
    const root = p.nodes.find((n) => n.contextRef.entity.id === ctx.id && n.kind === 'ENTRY');
    phase1Assert(root);
    const why = runtimeStopReason(control);
    if (why) {
      stop(why, entry.ownerRef);
      break;
    }
    const incomingConsume = (incoming.get(root.id) ?? []).filter(
      (e) =>
        e.transitionKind === 'CONSUME' &&
        nodes.get(String(e.sourceRef.entity.id))?.contextRef.entity.id === ctx.id,
    );
    phase1Assert(incomingConsume.length <= 1);
    const first = incomingConsume.length
      ? nodes.get(String(incomingConsume[0]!.sourceRef.entity.id))!
      : root;
    const queue = [{ n: first, depth: 0 }],
      seen = new Set<string>(),
      ordered: RuntimeFactSet['nodes'] = [];
    let incomplete = false;
    for (let i = 0; i < queue.length; i++) {
      const { n, depth } = queue[i]!;
      if (seen.has(n.id)) continue;
      const why = runtimeStopReason(control);
      if (why) {
        stop(why, n.targetRef);
        incomplete = true;
        break;
      }
      seen.add(n.id);
      ordered.push(n);
      for (const e of adjacency.get(n.id) ?? [])
        if (e.target.state === 'RESOLVED') {
          if (depth >= control.maxDepth && !seen.has(String(e.target.target.entity.id))) {
            stop('DEPTH', n.targetRef);
            incomplete = true;
            break;
          }
          queue.push({ n: nodes.get(String(e.target.target.entity.id))!, depth: depth + 1 });
        }
      if (incomplete) break;
    }
    if (incomplete) break;
    const visitedEdges = p.edges.filter((e) => seen.has(String(e.sourceRef.entity.id)));
    const supportRefs = mergeSupports(
      entry.supportRefs,
      ...ordered.map((n) => n.supportRefs),
      ...visitedEdges.map((e) => e.supportRefs),
    );
    const common = formalCommon(
      p.basis,
      'runtime-flow-v2',
      'RUNTIME_FLOW',
      [entry.factKey, 'runtime-flow-v2'],
      entry.sourceRange,
      supportRefs,
      'GRAPH_PROJECTION',
      policy,
    );
    const keys = new Map(
      ordered.map((n) => [
        String(n.id),
        'step:' +
          createHash('sha256')
            .update('runtime-flow-v2-step\0' + JSON.stringify([common.factKey, n.factKey]))
            .digest('hex'),
      ]),
    );
    const steps = ordered.map((n, ordinal) => {
      const ins = (incoming.get(n.id) ?? []).filter((e) => seen.has(String(e.sourceRef.entity.id))),
        outs = adjacency.get(n.id) ?? [];
      return {
        stepKey: keys.get(n.id)!,
        ordinal,
        contextRef: n.contextRef,
        executionNodeRefs: [scoped(p.basis, 'EXECUTION_NODE', n.id)],
        incomingEdgeRefs: ins.map((e) => scoped(p.basis, 'EXECUTION_EDGE', e.id)),
        outgoingStepKeys: [
          ...new Set(
            outs.flatMap((e) =>
              e.target.state === 'RESOLVED' ? [keys.get(String(e.target.target.entity.id))!] : [],
            ),
          ),
        ].sort(),
        supportRefs: mergeSupports(
          n.supportRefs,
          ...ins.map((e) => e.supportRefs),
          ...outs.map((e) => e.supportRefs),
        ),
      };
    });
    const contextIds = new Set(ordered.map((n) => String(n.contextRef.entity.id)));
    const boundaries = [
      ...new Map(
        visitedEdges
          .filter((e) => e.boundaryRef)
          .map((e) => [e.boundaryRef!.entity.id, e.boundaryRef!]),
      ).values(),
    ].sort((a, b) => exactOrder(a.entity.id, b.entity.id));
    const contexts = p.contexts
      .filter((c) => contextIds.has(c.id))
      .sort((a, b) => exactOrder(a.id, b.id))
      .map((c) => scoped(p.basis, 'EXECUTION_CONTEXT', c.id));
    const cost =
      1 +
      supportRefs.length +
      contexts.length +
      boundaries.length +
      coverage.limitations.length +
      coverage.unverifiedRefs.length +
      steps.reduce(
        (n, s) =>
          n +
          1 +
          s.executionNodeRefs.length +
          s.incomingEdgeRefs.length +
          s.outgoingStepKeys.length +
          s.supportRefs.length,
        0,
      );
    if (used + cost + 2 > control.maxItems) {
      stop('BUDGET', entry.ownerRef);
      break;
    }
    used += cost;
    flows.push({
      ...common,
      entryRef: scoped(p.basis, 'ENTRY_POINT', entry.id),
      derivationVersion: 'runtime-flow-v2',
      contexts,
      steps,
      branches: [],
      boundaries,
      coverage,
    });
  }
  return frozen({
    facts: parseRuntimeFactSet({ ...facts, payload: orderedFacts({ ...p, flows }) }),
    bindings,
    coverage: orderedCoverage(coverage),
    frontier,
    termination,
  });
}
