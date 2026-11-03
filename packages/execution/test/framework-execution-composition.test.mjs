import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, input } from './declared-execution.test.mjs';
test('actual private chain recomputes after removing Code and framework supports', async () => {
  const { deriveDeclaredExecutionGraph: graph } = await import('../dist/declared-execution.js'),
    { deriveDeclaredRuntimeFlows: flows } = await import('../dist/declared-runtime-flow.js');
  const item = input.cases.find((x) => x.name === 'chain'),
    c = await prepare(item);
  assert.equal(flows(graph(c, 10000), 10000).facts.payload.flows[0].steps.length, 3);
  const x = structuredClone(c);
  x.edges = [];
  x.supportInventory = x.supportInventory.filter((s) => s.entity.kind !== 'CODE_EDGE');
  const g = flows(graph(x, 10000), 10000);
  assert.equal(g.facts.payload.flows[0].steps.length, 1);
  assert.equal(g.facts.payload.edges.length, 0);
  const noImport = structuredClone(item);
  noImport.context.syntaxEvidence = noImport.context.syntaxEvidence.filter(
    (s) => s.id !== 'syntax:import',
  );
  const empty = flows(graph(await prepare(noImport), 10000), 10000);
  for (const k of ['entryPoints', 'contexts', 'nodes', 'edges', 'flows'])
    assert.equal(empty.facts.payload[k].length, 0);
});
