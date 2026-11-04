import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  parseRuntimeFactSet,
  Phase1CoverageSchema,
  parseIr,
  ensurePhase1Data,
  phase1Assert,
  type RuntimeFactSet,
} from '@codeatlas/ir';
import {
  executionCommon,
  executionBudget,
  executionUnits,
  exactOrder,
  scoped,
  mergeSupports,
  hasExecutionPolicy,
  frozen,
  orderedFacts,
  orderedCoverage,
  type DeclaredExecutionCandidate,
} from './declared-execution.js';
const version = 'declared-runtime-flow-v1';
export function deriveDeclaredRuntimeFlows(
  input: unknown,
  maxItems: number,
): DeclaredExecutionCandidate {
  executionBudget(maxItems);
  ensurePhase1Data(input);
  const c = parseIr(z.strictObject({ facts: z.unknown(), coverage: Phase1CoverageSchema }), input),
    facts = parseRuntimeFactSet(c.facts),
    p = facts.payload;
  phase1Assert(!p.flows.length && c.coverage.status === 'PARTIAL');
  phase1Assert(p.externalRefs.every((r) => r.scope === 'REPOSITORY'));
  c.coverage = orderedCoverage(c.coverage);
  const charge = executionBudget(maxItems, executionUnits(p, c.coverage));
  const contexts = new Map(p.contexts.map((r) => [String(r.id), r])),
    nodes = new Map(p.nodes.map((r) => [String(r.id), r]));
  phase1Assert(p.contexts.length === p.entryPoints.length);
  for (const r of [...p.entryPoints, ...p.contexts, ...p.nodes, ...p.edges])
    phase1Assert(hasExecutionPolicy(r));
  for (const ctx of p.contexts)
    phase1Assert(
      ctx.parentContextRef === null &&
        p.entryPoints.some((e) => e.id === ctx.entryRef.entity.id && e.contextKind === ctx.kind),
    );
  const codePerContext = new Set<string>();
  for (const n of p.nodes) {
    phase1Assert(
      (n.kind === 'ENTRY' || n.kind === 'CODE') &&
        n.targetRef.entity.kind === 'CODE_NODE' &&
        contexts.has(String(n.contextRef.entity.id)),
    );
    const key = JSON.stringify([n.contextRef.entity.id, n.targetRef]);
    phase1Assert(!codePerContext.has(key));
    codePerContext.add(key);
  }
  const adjacency = new Map<string, RuntimeFactSet['edges']>();
  for (const e of p.edges) {
    phase1Assert(
      e.transitionKind === 'CALL' &&
        e.boundaryRef === null &&
        e.guard === null &&
        contexts.has(String(e.contextRef.entity.id)),
    );
    const ts = e.target.state === 'RESOLVED' ? [e.target.target] : e.target.candidates;
    for (const ref of ts)
      phase1Assert(
        nodes.get(String(ref.entity.id))?.contextRef.entity.id === e.contextRef.entity.id,
      );
    const key = String(e.sourceRef.entity.id),
      values = adjacency.get(key) ?? [];
    values.push(e);
    adjacency.set(key, values);
  }
  for (const edges of adjacency.values())
    edges.sort((a, b) => {
      const key = (e: typeof a) => [
        e.transitionKind,
        e.target.state === 'RESOLVED' ? nodes.get(String(e.target.target.entity.id))!.factKey : '',
        e.factKey,
      ];
      const aa = key(a),
        bb = key(b);
      for (let i = 0; i < aa.length; i++) {
        const v = exactOrder(aa[i]!, bb[i]!);
        if (v) return v;
      }
      return 0;
    });
  const output: RuntimeFactSet['flows'] = [];
  for (const entry of [...p.entryPoints].sort((a, b) => exactOrder(a.factKey, b.factKey))) {
    const cs = p.contexts.filter((c) => c.entryRef.entity.id === entry.id);
    phase1Assert(cs.length === 1);
    const ctx = cs[0]!;
    const roots = p.nodes.filter((n) => n.contextRef.entity.id === ctx.id && n.kind === 'ENTRY');
    phase1Assert(roots.length === 1 && isDeepStrictEqual(roots[0]!.targetRef, entry.ownerRef));
    const queue = [roots[0]!],
      seen = new Set<string>(),
      ordered: RuntimeFactSet['nodes'] = [];
    for (let pos = 0; pos < queue.length; pos++) {
      const n = queue[pos]!;
      if (seen.has(String(n.id))) continue;
      seen.add(String(n.id));
      ordered.push(n);
      for (const e of adjacency.get(String(n.id)) ?? [])
        if (e.target.state === 'RESOLVED')
          queue.push(nodes.get(String(e.target.target.entity.id))!);
    }
    const edges = p.edges.filter((e) => e.contextRef.entity.id === ctx.id);
    phase1Assert(edges.every((e) => seen.has(String(e.sourceRef.entity.id))));
    const candidates = new Set(
      edges.flatMap((e) =>
        e.target.state === 'NON_RESOLVED'
          ? e.target.candidates.map((r) => String(r.entity.id))
          : [],
      ),
    );
    for (const n of p.nodes.filter((n) => n.contextRef.entity.id === ctx.id))
      phase1Assert(seen.has(String(n.id)) || candidates.has(String(n.id)));
    const supports = mergeSupports(
      entry.supportRefs,
      ...ordered.map((n) => n.supportRefs),
      ...edges.map((e) => e.supportRefs),
    );
    const common = executionCommon(
      p.basis,
      'RUNTIME_FLOW',
      [entry.factKey, version],
      entry.sourceRange,
      supports,
      'GRAPH_PROJECTION',
    );
    charge(
      1 + supports.length + 1 + c.coverage.limitations.length + c.coverage.unverifiedRefs.length,
    ); // Flow, its repeated supports and one context reference.
    const stepKeys = new Map(
      ordered.map((n) => [
        String(n.id),
        'step:' +
          createHash('sha256')
            .update('declared-runtime-step-v1\0' + JSON.stringify([common.factKey, n.factKey]))
            .digest('hex'),
      ]),
    );
    const steps: RuntimeFactSet['flows'][number]['steps'] = [];
    for (const [ordinal, n] of ordered.entries()) {
      const incoming = edges
        .filter((e) => e.target.state === 'RESOLVED' && e.target.target.entity.id === n.id)
        .sort((a, b) => exactOrder(a.id, b.id));
      const outgoing = adjacency.get(String(n.id)) ?? [];
      const outgoingStepKeys = [
        ...new Set(
          outgoing.flatMap((e) =>
            e.target.state === 'RESOLVED' ? [stepKeys.get(String(e.target.target.entity.id))!] : [],
          ),
        ),
      ].sort();
      const refs = mergeSupports(
        n.supportRefs,
        ...incoming.map((e) => e.supportRefs),
        ...outgoing.map((e) => e.supportRefs),
      );
      charge(1 + 1 + incoming.length + outgoingStepKeys.length + refs.length);
      steps.push({
        stepKey: stepKeys.get(String(n.id))!,
        ordinal,
        contextRef: scoped(p.basis, 'EXECUTION_CONTEXT', ctx.id),
        executionNodeRefs: [scoped(p.basis, 'EXECUTION_NODE', n.id)],
        incomingEdgeRefs: incoming.map((e) => scoped(p.basis, 'EXECUTION_EDGE', e.id)),
        outgoingStepKeys,
        supportRefs: refs,
      });
    }
    output.push({
      ...common,
      entryRef: scoped(p.basis, 'ENTRY_POINT', entry.id),
      derivationVersion: version,
      contexts: [scoped(p.basis, 'EXECUTION_CONTEXT', ctx.id)],
      steps,
      branches: [],
      boundaries: [],
      coverage: c.coverage,
    });
  }

  return frozen({
    facts: parseRuntimeFactSet({ ...facts, payload: orderedFacts({ ...p, flows: output }) }),
    coverage: c.coverage,
  });
}
