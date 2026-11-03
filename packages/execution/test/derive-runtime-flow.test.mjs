import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRuntimeFactSet } from '../../ir/dist/index.js';
const v = JSON.parse(
  readFileSync(new URL('../../../fixtures/phase1/execution-flow/inputs.json', import.meta.url)),
).graph;
const control = () => ({
  maxItems: 10000,
  maxDepth: 10,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
});
test('formal Flow keeps boundary steps and does not invent branches/order', async () => {
  const graph = (await import('../dist/derive-execution.js')).deriveExecutionGraph(v, control());
  const run = (await import('../dist/derive-runtime-flow.js')).deriveRuntimeFlows,
    out = run(graph, control());
  const p = parseRuntimeFactSet(out.facts).payload;
  assert.equal(p.flows.length, 1);
  const f = p.flows[0];
  assert.equal(f.derivationVersion, 'runtime-flow-v2');
  assert.equal(f.branches.length, 0);
  assert.equal(f.steps.length, p.nodes.length);
  assert.equal(f.boundaries.length, 2);
  assert.deepEqual(
    f.steps.map((s) => s.ordinal),
    f.steps.map((_, i) => i),
  );
  assert(f.coverage.limitations.includes('NO_EXECUTION_ORDER_PROOF'));
  assert.deepEqual(run(graph, control()), out);
});
