import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRuntimeFactSet } from '../../ir/dist/index.js';
const root = new URL('../../../fixtures/phase1/ir-contract/declared-execution/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('inputs.json', root))),
  expected = JSON.parse(readFileSync(new URL('expected.json', root)));
async function prepare(item) {
  const { compileFrameworkEntryCandidate } =
    await import('../../plugins/dist/framework-entry-candidate.js');
  const context = structuredClone(item.context);
  const result = compileFrameworkEntryCandidate(context, item.framework, item.maxItems);
  const { basis, nodes, edges, sourceFiles, supportInventory } = context;
  return {
    basis,
    nodes,
    edges,
    sourceFiles,
    supportInventory,
    entryFacts: result.facts,
    coverage: result.coverage,
  };
}
export { prepare, input, expected };
const api = () => import('../dist/declared-execution.js');
const independentlyMerged = (...groups) => {
  const key = (s) => JSON.stringify([s.entity.kind, s.entity.id, s.entity.revisionId ?? null]);
  return [...new Map(groups.flat().map((s) => [key(s), s])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, s]) => s);
};
function literalCodeSupport(c, kind, id, range) {
  const refs = c.supportInventory.filter(
    (s) =>
      (s.entity.kind === kind && s.entity.id === id) ||
      (range && s.entity.kind === 'SOURCE_FILE' && s.entity.id === range.sourceFileId),
  );
  return independentlyMerged(refs);
}

for (const item of input.cases)
  test('graph ' + item.name, async () => {
    const run = (await api()).deriveDeclaredExecutionGraph,
      ctx = await prepare(item),
      out = run(ctx, item.maxItems),
      p = out.facts.payload,
      wants = expected.cases[item.name].entries;
    parseRuntimeFactSet(out.facts);
    assert.equal(p.contexts.length, wants.length);
    for (const w of wants) {
      const context = p.contexts.find((x) => x.id === w.context.id);
      assert(context);
      assert.equal(context.factKey, w.context.factKey);
      const entry = ctx.entryFacts.payload.entryPoints.find((e) => e.id === w.id);
      assert.deepEqual(context.supportRefs, independentlyMerged(entry.supportRefs));
      assert.deepEqual(context.sourceRange, entry.sourceRange);
      assert.equal(context.parentContextRef, null);
      assert.equal(context.entryRef.entity.id, w.id);
      const seen = w.steps.map((x) => x.code),
        edges = w.edges.filter((e) => seen.includes(e.from)),
        names = new Set(seen);
      for (const e of edges) for (const n of Array.isArray(e.to) ? e.to : [e.to]) names.add(n);
      const actual = p.nodes.filter((n) => n.contextRef.entity.id === context.id);
      assert.equal(actual.length, names.size);
      for (const name of names) {
        const n = actual.find((n) => n.id === w.nodes[name].id);
        assert(n);
        assert.equal(n.factKey, w.nodes[name].factKey);
        assert.equal(n.targetRef.entity.id, 'code:' + name);
        assert.equal(n.kind, name === 'function' ? 'ENTRY' : 'CODE');
        const code = ctx.nodes.find((n) => n.id === 'code:' + name);
        assert.deepEqual(
          n.supportRefs,
          name === 'function'
            ? independentlyMerged(entry.supportRefs)
            : literalCodeSupport(ctx, 'CODE_NODE', code.id, code.sourceRange),
        );
      }
      const actualEdges = p.edges.filter((e) => e.contextRef.entity.id === context.id);
      assert.equal(actualEdges.length, edges.length);
      for (const e of edges) {
        const got = actualEdges.find((x) => x.id === e.id);
        assert(got);
        assert.equal(got.factKey, e.factKey);
        const raw = ctx.edges[w.edges.indexOf(e)],
          src = ctx.nodes.find((n) => n.id === 'code:' + e.from);
        const targets = (Array.isArray(e.to) ? e.to : [e.to]).map((name) =>
          name === 'function'
            ? entry.supportRefs
            : literalCodeSupport(
                ctx,
                'CODE_NODE',
                'code:' + name,
                ctx.nodes.find((n) => n.id === 'code:' + name).sourceRange,
              ),
        );
        assert.deepEqual(
          got.supportRefs,
          independentlyMerged(
            literalCodeSupport(ctx, 'CODE_NODE', src.id, src.sourceRange),
            literalCodeSupport(ctx, 'CODE_EDGE', raw.id, raw.sourceRange),
            ...targets,
          ),
        );
        assert.deepEqual(got.sourceRange, raw.sourceRange);
        assert.equal(got.transitionKind, 'CALL');
        assert.equal(got.boundaryRef, null);
        assert.equal(got.sourceRef.entity.id, w.nodes[e.from].id);
        if (e.res === 'EXACT') assert.equal(got.target.target.entity.id, w.nodes[e.to].id);
        else {
          assert.equal(got.target.state, 'NON_RESOLVED');
          assert.equal(got.target.resolution, e.res === 'HEURISTIC' ? 'UNRESOLVED' : e.res);
          assert.equal(got.target.candidates.length, Array.isArray(e.to) ? e.to.length : 1);
        }
        assert(got.supportRefs.some((s) => s.entity.kind === 'CODE_EDGE'));
        assert.equal(got.confidence.method, expected.policy.method);
      }
    }
    assert.equal(out.coverage.status, 'PARTIAL');
    assert(out.coverage.limitations.includes('NO_EXECUTION_ORDER_PROOF'));
    const rev = {
      ...ctx,
      nodes: [...ctx.nodes].reverse(),
      edges: [...ctx.edges].reverse(),
      supportInventory: [...ctx.supportInventory].reverse(),
    };
    assert.deepEqual(run(rev, item.maxItems), out);
    assert(Object.isFrozen(out));
  });
test('graph rejects foreign basis, digest conflicts and forged entry roots', async () => {
  const run = (await api()).deriveDeclaredExecutionGraph,
    c = await prepare(input.cases[0]);
  for (const mutate of [
    (c) => {
      c.basis.revisionId = 'foreign';
    },
    (c) => {
      c.supportInventory[0].valueDigest = 'f'.repeat(64);
    },
    (c) => {
      c.entryFacts.payload.entryPoints[0].confidence.method = 'caller';
    },
    (c) => {
      c.entryFacts.payload.entryPoints[0].ownerRef.entity.id = 'code:type';
    },
    (c) => {
      c.entryFacts.payload.entryPoints[0].contractRef = null;
    },
    (c) => {
      c.extra = true;
    },
  ]) {
    const bad = structuredClone(c);
    mutate(bad);
    assert.throws(() => run(bad, 10000), { code: 'IR_VALIDATION_FAILED' });
  }
});
test('graph budget counts repeated retained supports at exact boundary', async () => {
  const { deriveDeclaredExecutionGraph: run } = await api(),
    c = await prepare(input.cases.find((x) => x.name === 'diamond')),
    out = run(c, 10000);
  // Independent responsibility count; no use of implementation budget helper.
  const p = out.facts.payload,
    rs = [
      ...p.entryPoints,
      ...p.tasks,
      ...p.dataResources,
      ...p.triggers,
      ...p.contracts,
      ...p.contexts,
      ...p.nodes,
      ...p.edges,
    ];
  const count =
    rs.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    p.externalRefs.length +
    p.supportInventory.length +
    out.coverage.limitations.length +
    out.coverage.unverifiedRefs.length;
  assert.deepEqual(run(c, count), out);
  assert.throws(() => run(c, count - 1), { code: 'IR_VALIDATION_FAILED' });
});
test('low target support stays unresolved; non-callable targets are unsupported', async () => {
  const run = (await api()).deriveDeclaredExecutionGraph,
    item = input.cases.find((x) => x.name === 'chain');
  for (const [kind, hint] of [
    ['low', 'LOW_SUPPORT_TARGET'],
    ['type', 'NON_CALLABLE_CODE_TARGET'],
  ]) {
    const c = await prepare(item),
      n = c.nodes.find((n) => n.id === 'code:b');
    if (kind === 'low') n.confidence.score = 0.4;
    else {
      n.kind = 'TYPE';
      n.typeKind = 'CLASS';
      delete n.symbolKind;
    }
    const out = run(c, 10000);
    assert.equal(out.facts.payload.edges.length, 1);
    assert.equal(out.facts.payload.edges[0].target.state, 'NON_RESOLVED');
    assert.equal(out.facts.payload.edges[0].target.hint, hint);
  }
});

test('graph rejects workspace references in this repository-only boundary', async () => {
  const run = (await api()).deriveDeclaredExecutionGraph,
    c = await prepare(input.cases[0]),
    bad = structuredClone(c);
  bad.entryFacts.payload.externalRefs.push({
    scope: 'WORKSPACE',
    workspaceId: 'workspace:foreign',
    entity: { kind: 'CODE_NODE', id: 'code:external', revisionId: 'revision:set' },
  });
  assert.throws(() => run(bad, 10000), { code: 'IR_VALIDATION_FAILED' });
});

test('graph canonicalizes retained fact and support sets', async () => {
  const run = (await api()).deriveDeclaredExecutionGraph,
    c = await prepare(input.cases.find((x) => x.name === 'two-events')),
    a = run(c, 10000),
    bad = structuredClone(c);
  for (const k of ['entryPoints', 'contracts', 'tasks', 'dataResources']) {
    bad.entryFacts.payload[k].reverse();
    for (const r of bad.entryFacts.payload[k]) r.supportRefs.reverse();
  }
  bad.coverage.limitations.reverse();
  bad.entryFacts.payload.externalRefs.reverse();
  bad.entryFacts.payload.supportInventory.reverse();
  assert.deepEqual(run(bad, 10000), a);
});
