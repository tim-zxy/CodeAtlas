import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as api from '../dist/code-trace-contract.js';
import {
  setup,
  withCodeQueryDatabase,
  control,
  limits,
  meter,
} from './helpers/code-trace-fixture.mjs';
const run = (f, s = f.api, input = f.input, c = control(), h = s.context) => s.execute(input, h, c);
const fail = (r, code) => assert.deepEqual(r, api.codeTraceFailure(code));
test('CODE v2 API and strict complete schemas exist', async () => {
  const tool = await import('../dist/code-trace-tool.js');
  assert.equal(typeof tool.createOwnedCodeTraceSession, 'function');
  assert.equal(api.codeTraceWireSchemas().input.type, 'object');
});
test('genuine stored CALL graph retains cycles, ambiguity, unresolved evidence and static disclaimer', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      r = await run(f);
    assert.ok(r.data, JSON.stringify(r));
    const d = r.data,
      p = d.engineeringResult.payload;
    assert.equal(d.kind, 'CODE');
    assert.equal(d.queryVersion, 2);
    assert.equal(d.direction, 'OUTGOING_CALLS');
    assert.equal(d.relationshipSemantics, 'STATIC_CALLS_NOT_RUNTIME');
    assert.equal(d.productionQuery, 'NOT_AUTHORIZED');
    assert.equal(p.operation, 'CODE_TRACE');
    assert.equal(p.nodes[0].node.id, seed.symbolIds.root);
    assert.deepEqual(
      p.nodes.map((n) => n.depth),
      [0, 1, 1, 2],
    );
    assert.equal(p.nodes.length, 4);
    assert.equal(p.edges.length, 8);
    assert.ok(p.edges.every((e) => e.kind === 'CALL'));
    assert.ok(
      p.edges.some(
        (e) =>
          e.target.state === 'UNRESOLVED' &&
          e.target.resolution === 'AMBIGUOUS' &&
          e.target.candidates.length === 2,
      ),
    );
    assert.ok(
      p.edges.some((e) => e.target.state === 'UNRESOLVED' && e.target.resolution === 'UNSUPPORTED'),
    );
    assert.ok(
      p.edges.some(
        (e) => e.target.state === 'RESOLVED' && e.target.target.id === seed.symbolIds.root,
      ),
    );
    assert.ok(p.refs.evidence.length);
    assert.ok(p.refs.sources.length);
    assert.ok(p.coverage.observations.length);
    assert.equal(p.nodes[0].node.confidence.score, 1);
    assert.equal(p.freshness.state, 'CURRENT');
    assert.equal(r.meta.basisRefs, null);
    assert.equal(r.meta.sourceFreshness, null);
    assert.equal(r.meta.compilationCurrency, null);
    assert.equal(r.meta.coverage, null);
    assert.deepEqual(r.meta.truncation, { truncated: false, reasons: [], frontier: null });
    assert.equal(f.seen.close, 1);
    assert.equal(f.seen.permission.length, 2);
    assert.equal(f.seen.permission[0].purpose, 'trace_flow/CODE');
    assert.deepEqual(f.seen.permission[0].fields, [
      'NODE_NAMES',
      'EDGE_NAMES',
      'SOURCE_LOCATION_METADATA',
      'EVIDENCE_IDS',
      'PROVIDER_COVERAGE',
    ]);
    assert.equal(
      api.codeTraceResponseSchema.safeParse({
        ...r,
        data: { ...d, relationshipSemantics: 'RUNTIME' },
      }).success,
      false,
    );
    assert.equal(
      api.codeTraceResponseSchema.safeParse({
        ...r,
        data: {
          ...d,
          engineeringResult: { ...d.engineeringResult, payload: { ...p, operation: 'UNDERSTAND' } },
        },
      }).success,
      false,
    );
  });
});
test('depth, node and edge ceilings retain exact engine truncation without a fabricated frontier', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    for (const [patch, reason] of [
      [{ maxDepth: 0 }, 'DEPTH_LIMIT'],
      [{ maxNodes: 1 }, 'NODE_LIMIT'],
      [{ maxEdges: 1 }, 'EDGE_LIMIT'],
    ]) {
      const r = await run(f, f.api, { ...f.input, budget: { ...limits, ...patch } });
      assert.ok(r.data, JSON.stringify(r));
      assert.ok(r.meta.truncation.reasons.includes(reason));
      assert.deepEqual(r.meta.truncation.reasons, r.data.engineeringResult.payload.truncation);
      assert.equal(r.meta.truncation.frontier, null);
      if (patch.maxDepth === 0) {
        assert.equal(r.data.engineeringResult.payload.nodes.length, 1);
        assert.equal(r.data.engineeringResult.payload.edges.length, 0);
      }
    }
    const capped = await run(f, f.make({ limits: { ...limits, maxDepth: 1 } }));
    assert.equal(capped.data.engineeringResult.payload.nodes.length, 3);
    assert.ok(capped.meta.truncation.reasons.includes('DEPTH_LIMIT'));
  });
});
test('original STALE and legacy UNKNOWN code state survive without knowledge freshness conversion', async (t) => {
  for (const scenario of ['stale', 'current'])
    await withCodeQueryDatabase(t, scenario, async (seed) => {
      if (scenario === 'current') {
        // Owned migrated legacy-state characterization only.
        const db = new DatabaseSync(seed.databasePath);
        db.exec('UPDATE repository_state SET indexed_content_fingerprint=NULL');
        db.close();
      }
      const f = setup(seed),
        r = await run(f);
      assert.ok(r.data, JSON.stringify(r));
      assert.equal(
        r.data.engineeringResult.payload.freshness.state,
        scenario === 'stale' ? 'STALE' : 'UNKNOWN',
      );
      assert.equal(r.data.engineeringResult.payload.freshness.worktreeObservation, 'NOT_OBSERVED');
      assert.equal(r.meta.sourceFreshness, null);
    });
});
test('exact active revision is checked before node read and no symbol/version fallback occurs', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    fail(
      await run(f, f.api, { ...f.input, expectedRevisionId: 'wrong-version' }),
      'REVISION_MISMATCH',
    );
    assert.equal(f.seen.node, 0);
    fail(await run(f, f.api, { ...f.input, symbolId: 'missing-exact-symbol' }), 'SYMBOL_NOT_FOUND');
    assert.equal(f.seen.close, 2);
  });
  await withCodeQueryDatabase(t, 'not-indexed', async (seed) => {
    const f = setup(seed);
    fail(await run(f), 'NOT_INDEXED');
    assert.equal(f.seen.node, 0);
  });
});
test('caller cannot request old version, other direction/runtime/name/path/position/repository or invalid bounds', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    for (const patch of [
      { version: 1 },
      { kind: 'RUNTIME' },
      { direction: 'INCOMING_CALLS' },
      { name: 'root' },
      { databasePath: 'private' },
      { position: { line: 1 } },
      { repositoryId: 'other' },
      { fallback: true },
      { budget: { ...limits, maxDepth: -1 } },
      { budget: { ...limits, maxDepth: -0 } },
      { budget: { ...limits, maxNodes: 0 } },
    ])
      fail(await run(f, f.api, { ...f.input, ...patch }), 'INVALID_INPUT');
    assert.equal(f.seen.open, 0);
    fail(await run(f, f.api, f.input, control(), {}), 'CONTEXT_UNAVAILABLE');
    await f.api.close();
    fail(await run(f), 'CONTEXT_UNAVAILABLE');
  });
});
test('host scope/ceilings are captured and authorization/revocation and unavailable counter refuse safely', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    f.ports.repositoryIds[0] = 'other';
    f.ports.repositoryId = 'other';
    f.ports.limits.maxDepth = 0;
    assert.equal((await run(f)).data.repositoryId, seed.repositoryId);
    assert.equal(f.seen.budget.maxNodes, limits.maxNodes);
    const g = setup(seed);
    fail(await run(g, g.make({ tokenCounter: null })), 'TOKEN_COUNTER_UNAVAILABLE');
    fail(
      await run(
        g,
        g.make({
          authorize() {
            throw Error('SECRET');
          },
        }),
      ),
      'PERMISSION_DENIED',
    );
    assert.equal(g.seen.open, 0);
    let n = 0;
    fail(
      await run(
        g,
        g.make({
          authorize() {
            if (++n === 2) throw Error('SECRET');
          },
        }),
      ),
      'PERMISSION_DENIED',
    );
    assert.equal(g.seen.close, 1);
  });
});
test('complete output byte/token limits and exact digest enforce whole wrapper; metadata exhaustion is explicit', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      r = await run(f);
    assert.ok(r.data, JSON.stringify(r));
    const size = Buffer.byteLength(api.serializeCodeTraceResponse(r, control()));
    assert.ok(size > Buffer.byteLength(JSON.stringify(r.data.engineeringResult)));
    fail(
      await run(f, f.make({ limits: { ...limits, maxOutputBytes: size - 100 } })),
      'BUDGET_EXCEEDED',
    );
    fail(await run(f, f.make({ limits: { ...limits, maxTokens: 36 } })), 'BUDGET_EXCEEDED');
    fail(
      await run(f, f.api, { ...f.input, budget: { ...limits, maxMetadataRows: 1 } }),
      'BUDGET_EXCEEDED',
    );
    fail(
      await run(
        f,
        f.make({
          tokenCounter: meter(() => ({
            policyRef: 'fixture:symbol:v1',
            contentDigest: '0'.repeat(64),
            outputTokens: 1,
          })),
        }),
      ),
      'TOKEN_COUNTER_UNAVAILABLE',
    );
  });
});
test('cancel/deadline/provider errors are safe and reads do not start without active control', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      abort = new AbortController();
    abort.abort();
    fail(await run(f, f.api, f.input, control({ signal: abort.signal })), 'CANCELLED');
    fail(await run(f, f.api, f.input, control({ deadlineEpochMs: Date.now() - 1 })), 'DEADLINE');
    assert.equal(f.seen.open, 0);
    fail(
      await run(
        f,
        f.make({
          openCodeQuery: async () => {
            throw Error('SECRET path');
          },
        }),
      ),
      'PROVIDER_UNAVAILABLE',
    );
  });
});
test('close joins real pending cleanup, poisons UNKNOWN and prevents reopen even under cancellation', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      abort = new AbortController();
    let entered, release;
    const ready = new Promise((r) => (entered = r));
    const s = f.make({
      openCodeQuery: async (b, c) => {
        const p = await f.open(b, c);
        return {
          ...p,
          close: async () => {
            await p.close();
            entered();
            await new Promise((r) => (release = r));
            throw Error('SECRET cleanup');
          },
        };
      },
    });
    const pending = run(f, s, f.input, control({ signal: abort.signal }));
    await ready;
    const closing = s.close();
    let settled = false;
    closing.then(
      () => (settled = true),
      () => (settled = true),
    );
    abort.abort();
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false);
    release();
    fail(await pending, 'PROVIDER_UNAVAILABLE');
    await assert.rejects(closing, { code: 'QUERY_CLEANUP_FAILED', cleanupState: 'UNKNOWN' });
    fail(await run(f, s), 'CONTEXT_UNAVAILABLE');
    assert.equal(f.seen.open, 1);
  });
});
test('reentrant opener close aborts before first node and joins source handle before settlement', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    let closing;
    const s = f.make({
      openCodeQuery: async (b, c) => {
        const p = await f.open(b, c);
        closing = s.close();
        return p;
      },
    });
    fail(await run(f, s), 'CONTEXT_UNAVAILABLE');
    await closing;
    assert.equal(f.seen.node, 0);
    assert.equal(f.seen.close, 1);
  });
});
