import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceContext } from '../../plugins/test/fixtures/framework-surface-context.mjs';
import { compileFrameworkSurfaceCandidate } from '../../plugins/dist/framework-surface-compiler.js';
const control = () => ({
  maxItems: 10000,
  maxDepth: 10,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
});
async function input(id, framework) {
  const c = await surfaceContext(id),
    b = compileFrameworkSurfaceCandidate(c, framework, 'c'.repeat(64), 10000);
  return {
    basis: c.basis,
    nodes: c.nodes,
    edges: c.edges,
    sourceFiles: c.sourceFiles,
    supportInventory: c.supportInventory,
    entryFacts: b.facts,
    coverage: b.coverage,
    bindingFacts: b.bindings,
    sitePlan: b.sitePlan,
    syntaxMembershipDigest: 'c'.repeat(64),
    syntaxEvidence: c.syntaxEvidence,
  };
}
test('V2 graph/flow preserves exact Code input, local purpose and unknown external HTTP boundary', async () => {
  const a = await import('../dist/derive-execution.js'),
    f = await import('../dist/derive-runtime-flow.js');
  assert.equal(typeof a.deriveExecutionGraphV2, 'function');
  assert.equal(typeof f.deriveRuntimeFlowsV2, 'function');
  for (const [id, framework] of [
    ['P5', 'fastapi'],
    ['J7', 'spring'],
    ['J4', 'mongo'],
  ]) {
    const x = await input(id, framework),
      before = structuredClone(x),
      g = a.deriveExecutionGraphV2(x, control()),
      out = f.deriveRuntimeFlowsV2(g, control());
    assert.deepEqual(x, before);
    assert.equal(out.coverageScope, 'LOCAL_DECLARED_RUNTIME');
    assert.equal(out.coverage.status, 'COMPLETE', id + ':' + out.coverage.limitations.join(','));
    assert.equal(out.termination, 'COMPLETE');
    assert(out.facts.payload.flows.length);
    if (id === 'J7') {
      const boundary = out.facts.payload.edges.find((e) => e.transitionKind === 'HTTP');
      assert.equal(boundary.target.state, 'NON_RESOLVED');
      assert.equal(boundary.target.hint, 'CROSS_REPO_RESOLUTION_PENDING');
    }
    if (id === 'J4') {
      assert(
        out.facts.payload.entryPoints.some(
          (e) => e.triggerKind === 'DATA_CHANGE' && e.contextKind === 'EVENT',
        ),
      );
      assert(
        !out.facts.payload.edges.some(
          (e) =>
            e.transitionKind === 'CALL' &&
            e.target.state === 'RESOLVED' &&
            out.facts.payload.nodes.find((n) => n.id === e.target.target.entity.id)?.targetRef
              .entity.id === x.nodes.find((n) => n.name === 'handle')?.id,
        ),
      );
    }
  }
});
test('V2 graph rejects incomplete plan and leaves unpaired ordinary Code calls unresolved', async () => {
  const a = await import('../dist/derive-execution.js'),
    x = await input('J7', 'spring');
  const missing = structuredClone(x);
  missing.sitePlan.entries.pop();
  assert.throws(() => a.deriveExecutionGraphV2(missing, control()));
  assert.throws(() => a.deriveExecutionGraph(x, control()));
  const ordinary = structuredClone(x);
  for (const e of ordinary.sitePlan.entries) {
    e.role = 'ORDINARY_CALL';
    e.bindingIds = [];
  }
  const out = a.deriveExecutionGraphV2(ordinary, control());
  assert.equal(out.coverage.status, 'PARTIAL');
  assert(out.coverage.limitations.includes('UNRESOLVED_CALL'));
  const cancelled = control();
  cancelled.signal = AbortSignal.abort();
  const stopped = a.deriveExecutionGraphV2(x, cancelled);
  assert.equal(stopped.termination, 'CANCELLED');
  assert.equal(stopped.coverage.status, 'PARTIAL');
});
