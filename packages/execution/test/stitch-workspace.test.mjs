import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../fixtures/phase1/cross-repo/', import.meta.url);
const v = JSON.parse(readFileSync(new URL('inputs.json', root))),
  e = JSON.parse(readFileSync(new URL('expected.json', root)));
const control = () => ({
  maxItems: 10000,
  maxDepth: 10,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
});
for (const c of v.cases)
  test('workspace ' + c.name, async () => {
    const { matchContracts } = await import('../../contracts/dist/match-contracts.js');
    const { stitchWorkspaceExecution } = await import('../dist/stitch-workspace.js');
    const matches = matchContracts(c.frozenBindings, control()).matches;
    assert.equal(matches[0].payload.status, 'MATCHED');
    const out = stitchWorkspaceExecution(
      { frozenBindings: c.frozenBindings, graphs: c.graphs, matches },
      control(),
    );
    const p = out.execution.payload,
      w = e.cases.find((x) => x.name === c.name);
    assert.equal(p.edges.length, w.edges);
    const edge = p.edges[0];
    const node = (ref) => p.nodes.find((n) => n.id === ref.entity.id).repositoryRuntimeRef;
    assert.equal(node(edge.sourceRef).repositoryId, w.sourceRepo);
    assert.equal(node(edge.targetRef).repositoryId, w.targetRepo);
    assert.equal(edge.transitionKind, w.transitionKind);
    assert.equal(edge.confidence.score, 0.5);
    assert.equal(p.coverage.status, 'PARTIAL');
    assert.equal(
      c.graphs[0].candidate.facts.payload.contexts[0].kind,
      c.name.startsWith('message') ? 'EVENT' : 'REQUEST',
    );
    const x = structuredClone(c);
    x.graphs.reverse();
    assert.deepEqual(
      stitchWorkspaceExecution(
        { frozenBindings: x.frozenBindings, graphs: x.graphs, matches },
        control(),
      ),
      out,
    );
    const stale = structuredClone(c.graphs);
    stale[0].candidate.facts.payload.nodes[0].factKey = 'changed';
    assert.throws(() =>
      stitchWorkspaceExecution(
        { frozenBindings: c.frozenBindings, graphs: stale, matches },
        control(),
      ),
    );
    const forged = structuredClone(matches);
    forged[0].payload.selectedProviderRef = forged[0].payload.consumerRef;
    assert.throws(() =>
      stitchWorkspaceExecution(
        { frozenBindings: c.frozenBindings, graphs: c.graphs, matches: forged },
        control(),
      ),
    );
  });

test('workspace cancellation returns partial empty projection without accepting unverified supplied matches', async () => {
  const { stitchWorkspaceExecution } = await import('../dist/stitch-workspace.js'),
    c = v.cases[0],
    a = new AbortController();
  a.abort();
  const out = stitchWorkspaceExecution(
    { frozenBindings: c.frozenBindings, graphs: c.graphs, matches: [] },
    { ...control(), signal: a.signal },
  );
  assert.equal(out.termination, 'CANCELLED');
  assert.equal(out.execution.payload.coverage.status, 'PARTIAL');
  assert.equal(out.execution.payload.edges.length, 0);
  assert.equal(out.matches.length, 0);
  assert(out.frontier.length);
});
