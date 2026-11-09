import test from 'node:test';
import assert from 'node:assert/strict';
import { readOwnedStructureTrace as read } from '../dist/owned-structure-trace.js';
import {
  withOwnedStructureFixture as fixture,
  structureControl as control,
  structureLimits,
} from './helpers/owned-structure-fixture.mjs';
const rejects = (promise, code) => assert.rejects(promise, { code });
test('stored structure Application API exists', () => assert.equal(typeof read, 'function'));
test('genuine readonly execution graph keeps deterministic cycles, unresolved targets and exact stored evidence', async (t) => {
  await fixture(t, async (f) => {
    const r = await read(f.request(), f.open, control());
    assert.equal(r.kind, 'EXECUTION');
    assert.equal(r.status, 'CURRENT');
    assert.equal(r.viewVersion, 1);
    assert.equal(r.relationshipSemantics, 'STORED_DERIVED_NOT_OBSERVED_EXECUTION');
    assert.equal(r.coverageScope, 'LOCAL_DECLARED_RUNTIME');
    assert.equal(r.activationId, f.activationId);
    assert.deepEqual(r.codeBasis, f.snapshot.identity.codeBasis);
    assert.deepEqual(
      r.nodes.map((n) => [n.node.id, n.depth]),
      [
        ['node:one', 0],
        ['node:two', 1],
        ['node:three', 1],
      ],
    );
    assert.deepEqual(
      r.edges.map((e) => e.id),
      ['edge:01', 'edge:02', 'edge:04', 'edge:03'],
    );
    assert.deepEqual(r.edges.find((e) => e.id === 'edge:04').target, {
      state: 'NON_RESOLVED',
      resolution: 'AMBIGUOUS',
      hint: 'owned unresolved declaration',
      candidates: [f.candidate.facts.payload.edges[3].target.candidates[0]],
    });
    assert.deepEqual(r.nodes[0].node, f.candidate.facts.payload.nodes[0]);
    assert.equal(r.nodes[0].node.supportRefs.length, 2);
    assert.ok(r.nodes[0].node.sourceRange);
    assert.equal(r.nodes[0].node.confidence.score, 0.5);
    assert.deepEqual(r.coverage, f.candidate.coverage);
    assert.deepEqual(r.truncation, { truncated: false, reasons: [], frontier: [] });
    assert.deepEqual([f.seen.open, f.seen.read, f.seen.close], [1, 1, 1]);
  });
});
test('Runtime traverses literal outgoingStepKeys and preserves selected branch evidence with bounded header', async (t) => {
  await fixture(t, async (f) => {
    const r = await read(f.request('RUNTIME'), f.open, control());
    assert.equal(r.kind, 'RUNTIME');
    assert.deepEqual(
      r.steps.map((x) => [x.step.stepKey, x.depth]),
      [
        ['step:one', 0],
        ['step:three', 1],
        ['step:two', 1],
      ],
    );
    assert.deepEqual(r.links, [
      { fromStepKey: 'step:one', toStepKey: 'step:three' },
      { fromStepKey: 'step:one', toStepKey: 'step:two' },
      { fromStepKey: 'step:two', toStepKey: 'step:one' },
    ]);
    assert.deepEqual(r.steps[0].step, f.candidate.facts.payload.flows[0].steps[0]);
    assert.deepEqual(r.branches, f.candidate.facts.payload.flows[0].branches);
    assert.equal('steps' in r.flowHeader, false);
    assert.equal('branches' in r.flowHeader, false);
    assert.deepEqual(r.flowHeader.supportRefs, f.candidate.facts.payload.flows[0].supportRefs);
    assert.equal(r.truncation.truncated, false);
  });
});
test('depth/node/edge truncation returns exact omitted links and never invents unresolved targets', async (t) => {
  await fixture(t, async (f) => {
    const depth = await read(f.request('EXECUTION', { maxDepth: 0 }), f.open, control());
    assert.equal(depth.nodes.length, 1);
    assert.equal(depth.edges.length, 0);
    assert.equal(depth.truncation.frontier.length, 3);
    assert.deepEqual(depth.truncation.reasons, ['MAX_DEPTH']);
    const unresolved = depth.truncation.frontier.find((x) => x.edgeRef.entity.id === 'edge:04');
    assert.equal(unresolved.targetRef, null);
    const nodes = await read(f.request('EXECUTION', { maxNodes: 1 }), f.open, control());
    assert.equal(nodes.nodes.length, 1);
    assert.deepEqual(
      nodes.edges.map((e) => e.id),
      ['edge:04'],
    );
    assert.deepEqual(
      nodes.truncation.frontier.map((x) => x.targetRef.id),
      ['node:two', 'node:three'],
    );
    assert.deepEqual(nodes.truncation.reasons, ['MAX_NODES']);
    const edges = await read(f.request('EXECUTION', { maxEdges: 1 }), f.open, control());
    assert.equal(edges.edges.length, 1);
    assert.equal(edges.nodes.length, 2);
    assert.equal(edges.truncation.frontier.length, 3);
    assert.deepEqual(edges.truncation.reasons, ['MAX_EDGES']);
    const flow = await read(f.request('RUNTIME', { maxDepth: 0 }), f.open, control());
    assert.equal(flow.steps.length, 1);
    assert.equal(flow.links.length, 0);
    assert.deepEqual(
      flow.truncation.frontier.map((x) => x.targetRef.stepKey),
      ['step:three', 'step:two'],
    );
    assert.deepEqual(flow.branches, f.candidate.facts.payload.flows[0].branches);
    for (const patch of [{ maxNodes: 1 }, { maxEdges: 1 }]) {
      const r = await read(f.request('RUNTIME', patch), f.open, control());
      assert.equal(r.truncation.truncated, true);
      assert.ok(r.truncation.frontier.length);
      assert.ok(r.steps.length <= patch.maxNodes || patch.maxNodes === undefined);
      assert.ok(r.links.length <= patch.maxEdges || patch.maxEdges === undefined);
    }
  });
});
test('genuine last-good AFFECTED state remains affected', async (t) => {
  await fixture(
    t,
    async (f) => {
      const r = await read(f.request(), f.open, control());
      assert.equal(r.status, 'AFFECTED');
      assert.equal(r.activationId, f.activationId);
      assert.deepEqual(r.nodes[0].node, f.candidate.facts.payload.nodes[0]);
    },
    { affected: true },
  );
});
test('genuine fixed V2 readonly Store snapshot validates nonempty graph and flow without downgrade', async (t) => {
  await fixture(
    t,
    async (f) => {
      for (const kind of ['EXECUTION', 'RUNTIME']) {
        const r = await read(f.request(kind), f.open, control());
        assert.equal(r.viewVersion, 2);
        assert.equal(r.status, 'CURRENT');
        assert.equal(r.coverageScope, 'LOCAL_DECLARED_RUNTIME');
        assert.ok(kind === 'EXECUTION' ? r.nodes.length : r.steps.length);
      }
      assert.equal(f.seen.close, 2);
      const malformed = async () => ({
        read() {
          const v = structuredClone(f.snapshot);
          delete v.coverageScope;
          return v;
        },
        close() {},
      });
      await rejects(read(f.request(), malformed, control()), 'DATA_INVALID');
    },
    { version: 2 },
  );
});
test('exact activation/revision/repository/start selection rejects without fallback and always closes', async (t) => {
  await fixture(t, async (f) => {
    for (const [patch, code] of [
      [{ expectedActivationId: 'wrong-activation' }, 'ACTIVATION_MISMATCH'],
      [{ expectedRevisionId: 'wrong-revision' }, 'REVISION_MISMATCH'],
      [{ repositoryId: 'other' }, 'DATA_INVALID'],
      [{ startRef: { kind: 'EXECUTION_NODE', id: 'missing-node' } }, 'STRUCTURE_NOT_FOUND'],
    ])
      await rejects(read({ ...f.request(), ...patch }, f.open, control()), code);
    await rejects(
      read(
        {
          ...f.request('RUNTIME'),
          startRef: { kind: 'RUNTIME_FLOW', id: f.flowId, stepKey: 'missing-step' },
        },
        f.open,
        control(),
      ),
      'STRUCTURE_NOT_FOUND',
    );
    assert.equal(f.seen.close, 5);
    const unavailable = async () => ({
      read: () => ({ status: 'NOT_AVAILABLE', activationId: null, candidate: null }),
      close() {},
    });
    await rejects(read(f.request(), unavailable, control()), 'NOT_AVAILABLE');
  });
});
test('full view parser rejects malformed closure/extra fields and caller paths/directions/bounds', async (t) => {
  await fixture(t, async (f) => {
    for (const mutate of [
      (v) => (v.candidate.facts.payload.edges[0].sourceRef.entity.id = 'missing-node'),
      (v) => (v.candidate.facts.version = 2),
      (v) => (v.candidate.unexpected = true),
      (v) => (v.identity.revisionId = 'other'),
      (v) => (v.candidate.facts.payload.nodes[0].confidence.score = 1),
    ]) {
      const open = async () => ({
        read() {
          const v = structuredClone(f.snapshot);
          mutate(v);
          return v;
        },
        close() {},
      });
      await rejects(read(f.request(), open, control()), 'DATA_INVALID');
    }
    for (const patch of [
      { direction: 'BACKWARD' },
      { databasePath: 'private' },
      { kind: 'CODE' },
      { startRef: { kind: 'RUNTIME_FLOW', id: f.flowId, stepKey: f.stepKey } },
      { budget: { ...structureLimits, maxNodes: 0 } },
      { budget: { ...structureLimits, maxDepth: -1 } },
    ])
      await rejects(read({ ...f.request(), ...patch }, f.open, control()), 'INVALID_INPUT');
    assert.equal(f.seen.open, 0);
  });
});
test('metadata and complete result byte exhaustion refuses evidence stripping', async (t) => {
  await fixture(t, async (f) => {
    await rejects(
      read(f.request('EXECUTION', { maxMetadataRows: 1 }), f.open, control()),
      'BUDGET_EXCEEDED',
    );
    await rejects(
      read(f.request('EXECUTION', { maxOutputBytes: 1 }), f.open, control()),
      'BUDGET_EXCEEDED',
    );
    const open = async () => ({ read: () => f.snapshot, close() {} });
    await rejects(
      read(f.request('RUNTIME', { maxMetadataRows: 1 }), open, control()),
      'BUDGET_EXCEEDED',
    );
    assert.equal(f.seen.close, 2);
  });
});
test('abort/deadline refuses before open and cancellation after open closes the real handle', async (t) => {
  await fixture(t, async (f) => {
    const abort = new AbortController();
    abort.abort();
    await rejects(read(f.request(), f.open, control({ signal: abort.signal })), 'CANCELLED');
    await rejects(
      read(f.request(), f.open, control({ deadlineEpochMs: Date.now() - 1 })),
      'DEADLINE',
    );
    assert.equal(f.seen.open, 0);
    const during = new AbortController();
    await rejects(
      read(
        f.request(),
        async (b, c) => {
          const p = await f.open(b, c);
          during.abort();
          return p;
        },
        control({ signal: during.signal }),
      ),
      'CANCELLED',
    );
    assert.equal(f.seen.read, 0);
    assert.equal(f.seen.close, 1);
  });
});
test('readonly owner joins cleanup and cleanup loss reports UNKNOWN even after cancellation', async (t) => {
  await fixture(t, async (f) => {
    let enter, release;
    const ready = new Promise((r) => (enter = r)),
      abort = new AbortController();
    const pending = read(
      f.request(),
      async (b, c) => {
        const p = await f.open(b, c);
        return {
          ...p,
          close: async () => {
            p.close();
            enter();
            await new Promise((r) => (release = r));
            throw Error('SECRET cleanup');
          },
        };
      },
      control({ signal: abort.signal }),
    );
    let settled = false;
    pending.then(
      () => (settled = true),
      () => (settled = true),
    );
    await ready;
    abort.abort();
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false);
    release();
    await assert.rejects(pending, { code: 'QUERY_CLEANUP_FAILED', cleanupState: 'UNKNOWN' });
    assert.equal(f.seen.close, 1);
    await rejects(
      read(
        f.request(),
        async () => {
          throw Error('SECRET path');
        },
        control(),
      ),
      'PROVIDER_UNAVAILABLE',
    );
  });
});
