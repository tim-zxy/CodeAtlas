import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRuntimeFactSet } from '../../ir/dist/index.js';
const root = new URL('../../../fixtures/phase1/execution-flow/', import.meta.url);
const v = JSON.parse(readFileSync(new URL('inputs.json', root))).graph;
const e = JSON.parse(readFileSync(new URL('expected.json', root)));
const api = () => import('../dist/derive-execution.js');
const control = (extra = {}) => ({
  maxItems: 10000,
  maxDepth: 10,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...extra,
});
test('formal graph keeps proved data and external publish boundary', async () => {
  const out = (await api()).deriveExecutionGraph(v, control()),
    p = parseRuntimeFactSet(out.facts).payload;
  assert.deepEqual(
    p.contexts.map((c) => c.kind),
    e.contexts,
  );
  assert.deepEqual(
    p.nodes
      .filter((n) => n.kind === 'ENTRY' || n.kind === 'CODE')
      .map((n) => n.targetRef.entity.id)
      .sort(),
    e.codeTargets,
  );
  assert.deepEqual(
    p.nodes.filter((n) => n.kind === 'DATA').map((n) => n.targetRef.entity.id),
    e.dataTargets,
  );
  for (const [kind, count] of Object.entries(e.transitions))
    assert.equal(p.edges.filter((x) => x.transitionKind === kind).length, count);
  assert.deepEqual(
    p.edges.filter((x) => x.target.state === 'NON_RESOLVED').map((x) => x.transitionKind),
    e.unresolved,
  );
  assert(p.edges.some((x) => x.boundaryRef?.entity.id === 'binding:read'));
  assert.equal(out.coverage.status, 'PARTIAL');
  assert.equal(out.termination, 'COMPLETE');
  const reverse = structuredClone(v);
  reverse.nodes.reverse();
  reverse.edges.reverse();
  reverse.bindingFacts.payload.bindings.reverse();
  assert.deepEqual((await api()).deriveExecutionGraph(reverse, control()), out);
});
test('formal traversal reports cancellation, deadline and depth frontier', async () => {
  const run = (await api()).deriveExecutionGraph,
    a = new AbortController();
  a.abort();
  for (const [c, why] of [
    [control({ signal: a.signal }), 'CANCELLED'],
    [control({ deadlineEpochMs: 0 }), 'DEADLINE'],
    [control({ maxDepth: 0 }), 'DEPTH'],
  ]) {
    const out = run(v, c);
    parseRuntimeFactSet(out.facts);
    assert.equal(out.termination, why);
    assert.equal(out.coverage.status, 'PARTIAL');
    assert(out.frontier.length);
  }
  assert.throws(() => run(v, control({ maxItems: 0 })));
  const x = structuredClone(v);
  x.bindingFacts.payload.bindings[0].ownerRef.repositoryId = 'foreign';
  assert.throws(() => run(x, control()));
});
test('formal graph budget stops expansion with supported frontier', async () => {
  const run = (await api()).deriveExecutionGraph,
    out = run(v, control());
  const partial = run(v, control({ maxItems: 120 }));
  assert.equal(partial.termination, 'BUDGET');
  assert(partial);
  assert(partial.frontier.length);
  assert(partial.facts.payload.edges.length < out.facts.payload.edges.length);
  parseRuntimeFactSet(partial.facts);
});

test('consumer boundary enters its EVENT context rather than being published by handler', async () => {
  const x = structuredClone(v),
    p = x.entryFacts.payload;
  p.contracts[0] = {
    ...p.contracts[0],
    protocol: 'MESSAGE',
    direction: 'CONSUMER',
    signature: {
      kind: 'MESSAGE',
      transport: 'KAFKA',
      namespace: 'fixture',
      channel: 'in',
      role: 'CONSUMER',
      payloadSchemaRef: null,
      keySchemaRef: null,
    },
  };
  p.entryPoints[0].triggerKind = 'MESSAGE';
  p.entryPoints[0].contextKind = 'EVENT';
  const b = x.bindingFacts.payload.bindings[1];
  b.kind = 'MESSAGE_CONSUME';
  b.contractRef.entity.id = 'contract:http';
  x.bindingFacts.payload.bindings = [b];
  const out = (await api()).deriveExecutionGraph(x, control()),
    g = out.facts.payload;
  assert.equal(g.contexts.length, 1);
  assert.equal(g.contexts[0].kind, 'EVENT');
  const e = g.edges.find((e) => e.transitionKind === 'CONSUME');
  assert(e);
  assert.equal(e.target.state, 'RESOLVED');
  const n = g.nodes.find((n) => n.id === e.sourceRef.entity.id);
  assert.equal(n.kind, 'BOUNDARY');
  assert.equal(g.nodes.find((n) => n.id === e.target.target.entity.id).kind, 'ENTRY');
  assert(!g.edges.some((e) => e.transitionKind === 'PUBLISH'));
  const f = (await import('../dist/derive-runtime-flow.js')).deriveRuntimeFlows(out, control())
    .facts.payload.flows[0];
  assert.equal(f.steps[0].executionNodeRefs[0].entity.id, n.id);
});
test('complete WATCH resource and handler establish separate data-change EVENT context', async () => {
  const x = structuredClone(v),
    b = x.bindingFacts.payload.bindings[0];
  b.kind = 'DATA_WATCH';
  b.handlerRef = {
    ...structuredClone(b.ownerRef),
    entity: { kind: 'CODE_NODE', id: 'code:b', revisionId: x.basis.revisionId },
  };
  x.bindingFacts.payload.bindings = [b];
  const out = (await api()).deriveExecutionGraph(x, control()),
    p = out.facts.payload;
  assert.equal(p.triggers.length, 1);
  assert.equal(p.entryPoints.length, 2);
  assert.deepEqual(p.contexts.map((c) => c.kind).sort(), ['EVENT', 'REQUEST']);
  const e = p.edges.find((e) => e.transitionKind === 'DATA_CHANGE');
  assert.equal(e.target.state, 'RESOLVED');
  const n = p.nodes.find((n) => n.id === e.target.target.entity.id);
  assert.notEqual(n.contextRef.entity.id, e.contextRef.entity.id);
  assert.equal(n.targetRef.entity.id, 'code:b');
  parseRuntimeFactSet(out.facts);
});

test('TASK and BATCH roots stay separate and exact task creation crosses a proved boundary', async () => {
  for (const taskKind of ['TASK', 'BATCH']) {
    const x = structuredClone(v),
      p = x.entryFacts.payload,
      b = structuredClone(x.bindingFacts.payload.bindings[0]);
    const targetNode = x.nodes.find((n) => n.id === 'code:b');
    const task = {
      ...structuredClone(p.dataResources[0]),
      id: 'task:declared',
      factKey: 'task:declared-key',
      taskKind,
      implementationRef: {
        scope: 'REPOSITORY',
        repositoryId: x.basis.repositoryId,
        entity: { kind: 'CODE_NODE', id: targetNode.id, revisionId: x.basis.revisionId },
      },
      triggerRef: null,
    };
    delete task.resourceKind;
    delete task.logicalName;
    delete task.namespace;
    delete task.schemaRef;
    p.tasks = [task];
    p.entryPoints.push({
      ...structuredClone(p.entryPoints[0]),
      id: 'entry:task',
      factKey: 'entry:task-key',
      triggerKind: taskKind,
      contextKind: taskKind,
      contractRef: null,
      taskRef: {
        scope: 'REPOSITORY',
        repositoryId: x.basis.repositoryId,
        entity: { kind: 'TASK_DEFINITION', id: task.id, revisionId: x.basis.revisionId },
      },
      ownerRef: task.implementationRef,
      sourceRange: targetNode.sourceRange,
    });
    b.kind = 'TASK_CREATE';
    delete b.resourceRef;
    b.taskRef = structuredClone(p.entryPoints[1].taskRef);
    x.bindingFacts.payload.bindings = [b];
    const out = (await api()).deriveExecutionGraph(x, control()),
      g = out.facts.payload;
    assert.deepEqual(g.contexts.map((c) => c.kind).sort(), ['REQUEST', taskKind].sort());
    const edge = g.edges.find((e) => e.transitionKind === 'CREATE_TASK');
    assert.equal(edge.target.state, 'RESOLVED');
    const target = g.nodes.find((n) => n.id === edge.target.target.entity.id);
    assert.notEqual(target.contextRef.entity.id, edge.contextRef.entity.id);
    assert.equal(g.contexts.find((c) => c.id === target.contextRef.entity.id).kind, taskKind);
    parseRuntimeFactSet(out.facts);
  }
});
