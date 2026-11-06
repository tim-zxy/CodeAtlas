import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
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

// Synthetic declared facts, with a literal topology oracle independent of the derivation.
function branchCycleInput() {
  const input = structuredClone(v);
  for (const [id, source, target] of [
    ['branch', 'code:function', 'code:c'],
    ['cycle', 'code:c', 'code:function'],
  ]) {
    const edge = {
      ...structuredClone(input.edges[0]),
      id: 'edge:' + id,
      factKey: 'edge-key:' + id,
      source: { factType: 'NODE', id: source },
      target: { state: 'RESOLVED', resolution: 'EXACT', target: { factType: 'NODE', id: target } },
    };
    input.edges.push(edge);
    input.supportInventory.push({
      basis: structuredClone(input.basis),
      entity: { kind: 'CODE_EDGE', id: edge.id, revisionId: input.basis.revisionId },
      valueDigest: createHash('sha256').update(JSON.stringify(edge)).digest('hex'),
    });
  }
  return input;
}
function codeTopology(payload) {
  const nodeTargets = new Map(payload.nodes.map((n) => [n.id, n.targetRef.entity.id]));
  const steps = payload.flows[0].steps;
  const targets = new Map(
    steps.map((s) => [s.stepKey, nodeTargets.get(s.executionNodeRefs[0].entity.id)]),
  );
  return steps
    .flatMap((s) => s.outgoingStepKeys.map((k) => [targets.get(s.stepKey), targets.get(k)]))
    .filter(([from, to]) => from.startsWith('code:') && to.startsWith('code:'))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
const expectedCodeTopology = [
  ['code:b', 'code:c'],
  ['code:c', 'code:function'],
  ['code:function', 'code:b'],
  ['code:function', 'code:c'],
];

test('formal Flow preserves a supported fork and cycle as finite step back-references', async () => {
  const graph = (await import('../dist/derive-execution.js')).deriveExecutionGraph(
    branchCycleInput(),
    control(),
  );
  const out = (await import('../dist/derive-runtime-flow.js')).deriveRuntimeFlows(graph, control());
  const p = parseRuntimeFactSet(out.facts).payload;
  assert.equal(out.termination, 'COMPLETE');
  assert.deepEqual(codeTopology(p), expectedCodeTopology);
  assert.equal(new Set(p.flows[0].steps.map((s) => s.stepKey)).size, p.flows[0].steps.length);
  assert.equal(p.flows[0].steps.length, p.nodes.length);
  assert.equal(p.flows[0].branches.length, 0); // A call fork is not proved exclusive control flow.
  assert(p.flows[0].coverage.limitations.includes('NO_EXECUTION_ORDER_PROOF'));
  for (const step of p.flows[0].steps) {
    assert(step.supportRefs.length > 0);
    for (const ref of step.incomingEdgeRefs) {
      const edge = p.edges.find((e) => e.id === ref.entity.id);
      assert(edge);
      for (const support of edge.supportRefs)
        assert(step.supportRefs.some((s) => isDeepStrictEqual(s, support)));
    }
  }
  const flattened = structuredClone(p);
  flattened.flows[0].steps.forEach((s) => {
    s.outgoingStepKeys = [];
  });
  assert.notDeepEqual(codeTopology(flattened), expectedCodeTopology);
});

test('fork/cycle Flow semantics and stable IDs survive graph and source input permutation', async () => {
  const derive = (await import('../dist/derive-execution.js')).deriveExecutionGraph;
  const flows = (await import('../dist/derive-runtime-flow.js')).deriveRuntimeFlows;
  const input = branchCycleInput();
  const original = flows(derive(input, control()), control());
  input.nodes.reverse();
  input.edges.reverse();
  input.supportInventory.reverse();
  input.bindingFacts.payload.bindings.reverse();
  const graph = structuredClone(derive(input, control()));
  for (const field of ['nodes', 'edges', 'contexts', 'externalRefs', 'supportInventory'])
    graph.facts.payload[field].reverse();
  assert.deepEqual(flows(graph, control()), original);
});

test('Runtime IR refuses missing step support and Flow depth frontier does not emit a complete flow', async () => {
  const graph = (await import('../dist/derive-execution.js')).deriveExecutionGraph(
    branchCycleInput(),
    control(),
  );
  const run = (await import('../dist/derive-runtime-flow.js')).deriveRuntimeFlows;
  const out = structuredClone(run(graph, control()));
  out.facts.payload.flows[0].steps[0].supportRefs = [];
  assert.throws(() => parseRuntimeFactSet(out.facts));
  const limited = run(graph, { ...control(), maxDepth: 0 });
  parseRuntimeFactSet(limited.facts);
  assert.equal(limited.termination, 'DEPTH');
  assert.equal(limited.coverage.status, 'PARTIAL');
  assert(limited.frontier.length > 0);
  assert.equal(limited.facts.payload.flows.length, 0);
});

function taskBoundaryInput() {
  const input = structuredClone(v);
  const p = input.entryFacts.payload;
  const target = input.nodes.find((n) => n.id === 'code:b');
  const { resourceKind, logicalName, namespace, schemaRef, ...common } = p.dataResources[0];
  const task = {
    ...common,
    id: 'task:declared',
    factKey: 'task:declared-key',
    taskKind: 'TASK',
    implementationRef: {
      scope: 'REPOSITORY',
      repositoryId: input.basis.repositoryId,
      entity: { kind: 'CODE_NODE', id: target.id, revisionId: input.basis.revisionId },
    },
    triggerRef: null,
  };
  const taskRef = {
    scope: 'REPOSITORY',
    repositoryId: input.basis.repositoryId,
    entity: { kind: 'TASK_DEFINITION', id: task.id, revisionId: input.basis.revisionId },
  };
  p.tasks = [task];
  p.entryPoints.push({
    ...structuredClone(p.entryPoints[0]),
    id: 'entry:task',
    factKey: 'entry:task-key',
    triggerKind: 'TASK',
    contextKind: 'TASK',
    contractRef: null,
    taskRef,
    ownerRef: task.implementationRef,
    sourceRange: target.sourceRange,
  });
  const binding = structuredClone(input.bindingFacts.payload.bindings[0]);
  binding.kind = 'TASK_CREATE';
  delete binding.resourceRef;
  binding.taskRef = structuredClone(taskRef);
  input.bindingFacts.payload.bindings = [binding];
  return input;
}

test('task-boundary Flow preserves both contexts and is invariant under context permutation', async () => {
  const derive = (await import('../dist/derive-execution.js')).deriveExecutionGraph;
  const run = (await import('../dist/derive-runtime-flow.js')).deriveRuntimeFlows;
  const graph = derive(taskBoundaryInput(), control());
  assert.deepEqual(graph.facts.payload.contexts.map((c) => c.kind).sort(), ['REQUEST', 'TASK']);
  const out = run(graph, control());
  const request = graph.facts.payload.contexts.find((c) => c.kind === 'REQUEST');
  const flow = out.facts.payload.flows.find(
    (f) => f.entryRef.entity.id === request.entryRef.entity.id,
  );
  assert.equal(flow.contexts.length, 2);
  assert.equal(new Set(flow.steps.map((s) => s.contextRef.entity.id)).size, 2);
  const reversed = structuredClone(graph);
  reversed.facts.payload.contexts.reverse();
  assert.deepEqual(run(reversed, control()), out);
});
