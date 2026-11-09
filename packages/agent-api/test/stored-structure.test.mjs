import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as api from '../dist/index.js';
import {
  withOwnedStructureFixture,
  structureLimits,
  structureControl,
} from '../../application/test/helpers/owned-structure-fixture.mjs';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const meter = (
  measure = (text) => ({
    policyRef: 'fixture:stored-structure:v1',
    contentDigest: sha(text),
    outputTokens: 37,
  }),
) => ({ kind: 'EXACT_LOCAL_COUNTER', policyRef: 'fixture:stored-structure:v1', measure });
function build(f, l2 = false, patch = {}) {
  const seen = { authorize: [], measured: [] };
  const create = l2 ? api.createOwnedProjectL2Session : api.createOwnedStoredStructureTraceSession;
  const session = create({
    workspaceId: 'workspace:owned',
    repositoryIds: [f.repositoryId],
    repositoryId: f.repositoryId,
    limits: { ...structureLimits, maxTokens: 1000 },
    authorize(m) {
      seen.authorize.push(m);
    },
    openRuntimeQuery: f.open,
    tokenCounter: meter((text) => {
      seen.measured.push(text);
      return {
        policyRef: 'fixture:stored-structure:v1',
        contentDigest: sha(text),
        outputTokens: 37,
      };
    }),
    ...patch,
  });
  return { session, seen };
}
function input(f, kind = 'EXECUTION', l2 = false) {
  const { repositoryId, budget, ...selection } = f.request(kind);
  return l2
    ? { version: 3, depth: 'L2', selection, budget: { ...budget, maxTokens: 1000 } }
    : { ...selection, version: 3, budget: { ...budget, maxTokens: 1000 } };
}
test('stored structure trace and L2 constructors are available', () => {
  assert.equal(typeof api.createOwnedStoredStructureTraceSession, 'function');
  assert.equal(typeof api.createOwnedProjectL2Session, 'function');
});
for (const kind of ['EXECUTION', 'RUNTIME'])
  for (const l2 of [false, true])
    test(
      'actual Store ' +
        kind +
        ' ' +
        (l2 ? 'L2' : 'trace') +
        ' preserves original evidence and full exact envelope',
      async (t) =>
        withOwnedStructureFixture(t, async (f) => {
          const { session, seen } = build(f, l2);
          assert.equal(f.seen.read, 0);
          const r = await session.execute(input(f, kind, l2), session.context, structureControl());
          assert.ok(!r.error, JSON.stringify(r));
          const v = r.data.engineeringResult;
          assert.equal(v.kind, kind);
          assert.equal(v.activationId, f.activationId);
          assert.equal(v.relationshipSemantics, 'STORED_DERIVED_NOT_OBSERVED_EXECUTION');
          assert.equal(v.coverageScope, 'LOCAL_DECLARED_RUNTIME');
          assert.deepEqual(v.coverage, f.snapshot.candidate.coverage);
          assert.equal(r.data.productionQuery, 'NOT_AUTHORIZED');
          assert.equal(r.meta.sourceFreshness, null);
          if (l2) {
            assert.equal(r.data.depth, 'L2');
            assert.equal(r.data.projectCompleteness, 'NOT_ASSESSED');
          }
          if (kind === 'EXECUTION') {
            assert.deepEqual(
              v.nodes.map((x) => x.node.id),
              ['node:one', 'node:two', 'node:three'],
            );
            assert.deepEqual(
              v.edges.map((e) => e.id),
              ['edge:01', 'edge:02', 'edge:04', 'edge:03'],
            );
            for (const edge of v.edges)
              assert.deepEqual(
                edge,
                f.candidate.facts.payload.edges.find((e) => e.id === edge.id),
              );
            assert.equal(v.edges.find((e) => e.id === 'edge:04').target.state, 'NON_RESOLVED');
            assert.deepEqual(v.nodes[0].node, f.candidate.facts.payload.nodes[0]);
          } else {
            assert.equal(v.flowHeader.id, f.flowId);
            assert.equal(v.flowHeader.steps, undefined);
            assert.deepEqual(v.branches, f.candidate.facts.payload.flows[0].branches);
            assert.deepEqual(v.steps[0].step, f.candidate.facts.payload.flows[0].steps[0]);
            assert.equal(v.links.length, 3);
          }
          assert.equal(seen.measured.length, 1);
          assert.deepEqual(JSON.parse(seen.measured[0]), r);
          assert.ok(seen.authorize.length >= 2);
          assert.ok(
            seen.authorize.every(
              (m) => m.purpose === (l2 ? 'get_project_context/L2' : 'trace_flow/STORED_STRUCTURE'),
            ),
          );
          assert.equal(f.seen.close, 1);
          assert.equal(
            (l2 ? api.projectL2ResponseSchema : api.storedStructureResponseSchema).safeParse(r)
              .success,
            true,
          );
          await session.close();
        }),
    );
test('actual V2 derived Store and affected state retain exact stored provenance', async (t) => {
  for (const options of [{ version: 2 }, { affected: true }])
    await withOwnedStructureFixture(
      t,
      async (f) => {
        const { session } = build(f);
        const r = await session.execute(input(f), session.context, structureControl());
        assert.ok(!r.error, JSON.stringify(r));
        assert.equal(r.data.engineeringResult.viewVersion, options.version ?? 1);
        assert.equal(r.data.engineeringResult.status, options.affected ? 'AFFECTED' : 'CURRENT');
        await session.close();
      },
      options,
    );
});
test('activation, revision and missing starts refuse without replacement', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    const { session } = build(f);
    for (const [patch, expected] of [
      [{ expectedActivationId: 'other' }, 'ACTIVATION_MISMATCH'],
      [{ expectedRevisionId: 'other' }, 'REVISION_MISMATCH'],
      [{ startRef: { kind: 'EXECUTION_NODE', id: 'other' } }, 'STRUCTURE_NOT_FOUND'],
    ])
      assert.equal(
        (await session.execute({ ...input(f), ...patch }, session.context, structureControl()))
          .error.code,
        expected,
      );
    assert.equal(f.seen.close, 3);
    await session.close();
  }));
test('strict v3 scope/kind/direction/bounds and opaque context reject before open', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    const { session } = build(f);
    for (const patch of [
      { version: 1 },
      { kind: 'CODE' },
      { direction: 'BACKWARD' },
      { repositoryId: 'foreign' },
      { databasePath: 'secret' },
      { startRef: { kind: 'RUNTIME_FLOW', id: f.flowId, stepKey: f.stepKey } },
      { budget: { ...input(f).budget, maxDepth: -1 } },
    ])
      assert.equal(
        (await session.execute({ ...input(f), ...patch }, session.context, structureControl()))
          .error.code,
        'INVALID_INPUT',
      );
    assert.equal(
      (await session.execute(input(f), {}, structureControl())).error.code,
      'CONTEXT_UNAVAILABLE',
    );
    assert.equal(f.seen.open, 0);
    await session.close();
  }));
test('no counter or permission refuses before Store and revocation prevents delivery', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    for (const patch of [
      { tokenCounter: null },
      {
        authorize() {
          throw Error('private denial');
        },
      },
    ]) {
      const { session } = build(f, false, patch);
      assert.ok(
        ['TOKEN_COUNTER_UNAVAILABLE', 'PERMISSION_DENIED'].includes(
          (await session.execute(input(f), session.context, structureControl())).error.code,
        ),
      );
      await session.close();
    }
    assert.equal(f.seen.open, 0);
    let calls = 0;
    const { session } = build(f, false, {
      authorize() {
        if (++calls > 1) throw Error('revoked');
      },
    });
    assert.equal(
      (await session.execute(input(f), session.context, structureControl())).error.code,
      'PERMISSION_DENIED',
    );
    assert.equal(f.seen.close, 1);
    await session.close();
  }));
test('host ceilings, complete Trace/L2 byte/token budgets and metadata frontier remain exact', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    const a = build(f, false, { limits: { ...structureLimits, maxNodes: 1, maxTokens: 1000 } });
    const r = await a.session.execute(input(f), a.session.context, structureControl());
    assert.ok(!r.error, JSON.stringify(r));
    assert.equal(r.data.engineeringResult.nodes.length, 1);
    assert.equal(r.meta.truncation.truncated, true);
    assert.ok(r.meta.truncation.frontier.length > 0);
    const forged = structuredClone(r);
    forged.meta.truncation.frontier = [];
    assert.equal(api.storedStructureResponseSchema.safeParse(forged).success, false);
    const b = build(f, true);
    for (const budget of [{ maxOutputBytes: 1 }, { maxTokens: 36 }, { maxMetadataRows: 1 }]) {
      const req = input(f, 'RUNTIME', true);
      req.budget = { ...req.budget, ...budget };
      assert.equal(
        (await b.session.execute(req, b.session.context, structureControl())).error.code,
        'BUDGET_EXCEEDED',
      );
    }
    await a.session.close();
    await b.session.close();
  }));
test('dishonest measurement and async authority poison the context', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    const a = build(f, false, {
      tokenCounter: meter(() => ({
        policyRef: 'fixture:stored-structure:v1',
        contentDigest: '0'.repeat(64),
        outputTokens: 37,
      })),
    });
    assert.equal(
      (await a.session.execute(input(f), a.session.context, structureControl())).error.code,
      'TOKEN_COUNTER_UNAVAILABLE',
    );
    await a.session.close();
    const b = build(f, false, {
      authorize: async () => {
        throw Error('untrusted promise');
      },
    });
    assert.equal(
      (await b.session.execute(input(f), b.session.context, structureControl())).error.code,
      'PERMISSION_DENIED',
    );
    assert.equal(
      (await b.session.execute(input(f), b.session.context, structureControl())).error.code,
      'CONTEXT_UNAVAILABLE',
    );
    await b.session.close();
  }));
test('cancel/deadline, closed scope and constructor mutation do not open a Store', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    const { session } = build(f);
    for (const [c, code] of [
      [structureControl({ signal: AbortSignal.abort() }), 'CANCELLED'],
      [structureControl({ deadlineEpochMs: Date.now() - 1 }), 'DEADLINE'],
    ])
      assert.equal((await session.execute(input(f), session.context, c)).error.code, code);
    assert.equal(f.seen.open, 0);
    await session.close();
    assert.equal(
      (await session.execute(input(f), session.context, structureControl())).error.code,
      'CONTEXT_UNAVAILABLE',
    );
    assert.throws(() => build(f, false, { repositoryIds: ['foreign'] }));
  }));
test('actual source cleanup failure poisons UNKNOWN and close joins without reopen', async (t) =>
  withOwnedStructureFixture(t, async (f) => {
    let release;
    const gate = new Promise((r) => (release = r));
    let entered;
    const closing = new Promise((r) => (entered = r));
    const { session } = build(f, false, {
      openRuntimeQuery: async (b, c) => {
        const s = await f.open(b, c);
        return {
          ...s,
          close: async () => {
            s.close();
            entered();
            await gate;
            throw Error('lost close acknowledgement');
          },
        };
      },
    });
    const running = session.execute(input(f), session.context, structureControl());
    await closing;
    let settled = false;
    const task = session.close().then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false);
    release();
    assert.equal((await running).error.code, 'PROVIDER_UNAVAILABLE');
    await task;
    await assert.rejects(session.close(), (e) => e.cleanupState === 'UNKNOWN');
    assert.equal(
      (await session.execute(input(f), session.context, structureControl())).error.code,
      'CONTEXT_UNAVAILABLE',
    );
    assert.equal(f.seen.open, 1);
  }));
