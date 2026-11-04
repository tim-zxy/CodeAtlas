import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, input, expected } from './declared-execution.test.mjs';
const api = () => import('../dist/declared-runtime-flow.js');
async function graph(item) {
  return (await import('../dist/declared-execution.js')).deriveDeclaredExecutionGraph(
    await prepare(item),
    10000,
  );
}
for (const item of input.cases)
  test('flow ' + item.name, async () => {
    const run = (await api()).deriveDeclaredRuntimeFlows,
      g = await graph(item),
      out = run(g, 10000),
      wants = expected.cases[item.name].entries;
    assert.equal(out.facts.payload.flows.length, wants.length);
    for (const w of wants) {
      const f = out.facts.payload.flows.find((f) => f.id === w.flow.id);
      assert(f);
      assert.equal(f.factKey, w.flow.factKey);
      assert.equal(f.derivationVersion, 'declared-runtime-flow-v1');
      assert.deepEqual(f.branches, []);
      assert.deepEqual(f.boundaries, []);
      assert.deepEqual(
        f.steps.map((s) => s.stepKey),
        w.steps.map((s) => s.stepKey),
      );
      assert.deepEqual(
        f.steps.map((s) => s.ordinal),
        w.steps.map((_, i) => i),
      );
      const reachable = new Set(w.steps.map((s) => s.code));
      for (const [i, s] of f.steps.entries()) {
        const want = w.steps[i];
        assert.equal(s.executionNodeRefs.length, 1);
        assert.equal(s.executionNodeRefs[0].entity.id, want.id);
        const es = w.edges.filter((e) => e.res === 'EXACT' && reachable.has(e.from));
        const incoming = es
          .filter((e) => e.to === want.code)
          .map((e) => e.id)
          .sort();
        assert.deepEqual(s.incomingEdgeRefs.map((r) => r.entity.id).sort(), incoming);
        assert.deepEqual(
          [...s.outgoingStepKeys].sort(),
          [
            ...new Set(
              es
                .filter((e) => e.from === want.code)
                .map((e) => w.steps.find((s) => s.code === e.to).stepKey),
            ),
          ].sort(),
        );
        assert(s.supportRefs.length > 0);
      }
      assert.equal(f.confidence.method, expected.policy.method);
      assert.equal(f.coverage.status, 'PARTIAL');
    }
    const p = structuredClone(g);
    for (const k of ['entryPoints', 'contexts', 'nodes', 'edges']) p.facts.payload[k].reverse();
    assert.deepEqual(run(p, 10000), out);
  });
test('Flow rejects unsupported graph meaning instead of dropping it', async () => {
  const run = (await api()).deriveDeclaredRuntimeFlows,
    g = await graph(input.cases.find((x) => x.name === 'chain'));
  for (const mutate of [
    (g) => {
      g.facts.payload.edges[0].transitionKind = 'PUBLISH';
    },
    (g) => {
      g.facts.payload.contexts[0].confidence.method = 'other';
    },
    (g) => {
      g.facts.payload.nodes[0].kind = 'DATA';
    },
    (g) => {
      g.facts.payload.contexts[0].parentContextRef = g.facts.payload.contexts[0].entryRef;
    },
  ]) {
    const x = structuredClone(g);
    mutate(x);
    assert.throws(() => run(x, 10000), { code: 'IR_VALIDATION_FAILED' });
  }
});
test('Flow output exact budget includes steps and repeated refs', async () => {
  const run = (await api()).deriveDeclaredRuntimeFlows,
    g = await graph(input.cases.find((x) => x.name === 'cycle')),
    out = run(g, 10000),
    p = out.facts.payload;
  const rs = [
    'entryPoints',
    'tasks',
    'dataResources',
    'triggers',
    'contracts',
    'contexts',
    'nodes',
    'edges',
    'flows',
  ].flatMap((k) => p[k]);
  let count =
    rs.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    p.externalRefs.length +
    p.supportInventory.length +
    out.coverage.limitations.length +
    out.coverage.unverifiedRefs.length;
  for (const f of p.flows) {
    count += f.contexts.length + f.coverage.limitations.length + f.coverage.unverifiedRefs.length;
    for (const s of f.steps)
      count +=
        1 +
        s.executionNodeRefs.length +
        s.incomingEdgeRefs.length +
        s.outgoingStepKeys.length +
        s.supportRefs.length;
  }
  assert.deepEqual(run(g, count), out);
  assert.throws(() => run(g, count - 1), { code: 'IR_VALIDATION_FAILED' });
});

test('Flow canonicalizes all retained collections and coverage', async () => {
  const run = (await api()).deriveDeclaredRuntimeFlows,
    g = await graph(input.cases.find((x) => x.name === 'two-events')),
    want = run(g, 10000),
    changed = structuredClone(g);
  for (const k of [
    'entryPoints',
    'contracts',
    'tasks',
    'dataResources',
    'contexts',
    'nodes',
    'edges',
  ]) {
    changed.facts.payload[k].reverse();
    for (const r of changed.facts.payload[k]) r.supportRefs.reverse();
  }
  changed.facts.payload.externalRefs.reverse();
  changed.facts.payload.supportInventory.reverse();
  changed.coverage.limitations.reverse();
  assert.deepEqual(run(changed, 10000), want);
});
