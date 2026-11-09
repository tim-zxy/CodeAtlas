import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as contract from '../dist/symbol-understanding-contract.js';
import {
  setup,
  withCodeQueryDatabase,
  control,
  limits,
  meter,
} from './helpers/symbol-understanding-fixture.mjs';
const run = (f, s = f.api, input = f.input, c = control(), h = s.context) => s.execute(input, h, c);
const failure = (r, code) => assert.deepEqual(r, contract.symbolUnderstandingFailure(code));
test('owned symbol session API exists', async () => {
  const api = await import('../dist/symbol-understanding-tool.js');
  assert.equal(typeof api.createOwnedSymbolUnderstandingSession, 'function');
  assert.equal(contract.symbolUnderstandingWireSchemas().input.type, 'object');
});
for (const scenario of ['current', 'stale'])
  test(`genuine ${scenario} readonly code result preserves engineering evidence and no runtime claims`, async (t) => {
    await withCodeQueryDatabase(t, scenario, async (seed) => {
      const f = setup(seed),
        r = await run(f);
      assert.ok(r.data, JSON.stringify(r));
      const p = r.data.engineeringResult.payload;
      assert.equal(p.operation, 'UNDERSTAND');
      assert.equal(p.symbol.id, seed.symbolIds.root);
      assert.equal(p.freshness.state, scenario === 'current' ? 'CURRENT' : 'STALE');
      assert.equal(p.freshness.basis, 'PERSISTED_SOURCE');
      assert.equal(p.freshness.worktreeObservation, 'NOT_OBSERVED');
      assert.ok(p.refs.evidence.length);
      assert.ok(p.coverage.observations.length);
      assert.deepEqual(r.data.entryRuntimeRelevance, {
        availability: 'NOT_EVALUATED',
        value: null,
      });
      assert.equal(r.meta.basisRefs, null);
      assert.equal(r.meta.sourceFreshness, null);
      assert.equal(r.meta.coverage, null);
      assert.equal(f.seen.close, 1);
      assert.equal(f.seen.permission.length, 2);
      assert.ok(f.seen.permission[0].fields.includes('SOURCE_LOCATION_METADATA'));
      assert.equal(r.data.productionQuery, 'NOT_AUTHORIZED');
    });
  });
test('legacy owned fixture null fingerprint remains UNKNOWN without knowledge freshness conversion', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    // Explicit migrated legacy-state characterization, never a publication workflow.
    const db = new DatabaseSync(seed.databasePath);
    db.exec('UPDATE repository_state SET indexed_content_fingerprint=NULL');
    db.close();
    const f = setup(seed),
      r = await run(f);
    assert.ok(r.data, JSON.stringify(r));
    assert.equal(r.data.engineeringResult.payload.freshness.state, 'UNKNOWN');
    assert.equal(r.meta.sourceFreshness, null);
  });
});
test('exact revision precedes node lookup, exact missing symbol and not-indexed are separate errors', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    failure(
      await run(f, f.api, { ...f.input, expectedRevisionId: 'other-revision' }),
      'REVISION_MISMATCH',
    );
    assert.equal(f.seen.node, 0);
    assert.equal(f.seen.close, 1);
    failure(
      await run(f, f.api, { ...f.input, symbolId: 'exact-missing-symbol' }),
      'SYMBOL_NOT_FOUND',
    );
    assert.equal(f.seen.close, 2);
  });
  await withCodeQueryDatabase(t, 'not-indexed', async (seed) => {
    const f = setup(seed);
    failure(await run(f), 'NOT_INDEXED');
    assert.equal(f.seen.node, 0);
  });
});
test('strict inputs cannot switch repository, path, name, position, revision strategy or runtime mode', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    for (const patch of [
      { version: 2 },
      { mode: 'RUNTIME' },
      { repositoryId: 'other' },
      { databasePath: 'secret' },
      { name: 'root' },
      { position: { line: 1 } },
      { expectedRevisionId: null },
      { fallback: true },
      { budget: { ...limits, maxEdges: 0 } },
    ])
      failure(await run(f, f.api, { ...f.input, ...patch }), 'INVALID_INPUT');
    assert.equal(f.seen.open, 0);
    failure(await run(f, f.api, f.input, control(), {}), 'CONTEXT_UNAVAILABLE');
    f.api.close();
    failure(await run(f), 'CONTEXT_UNAVAILABLE');
  });
});
test('fixed host scope and ceilings are captured; duplicate and nonmember repository constructors reject', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    f.ports.repositoryIds[0] = 'other';
    f.ports.repositoryId = 'other';
    f.ports.limits.maxEdges = 1;
    const r = await run(f);
    assert.ok(r.data, JSON.stringify(r));
    assert.equal(r.data.repositoryId, seed.repositoryId);
    assert.equal(f.seen.budget.maxEdges, limits.maxEdges);
    assert.throws(() => f.make({ repositoryIds: [seed.repositoryId, seed.repositoryId] }));
    assert.throws(() => f.make({ repositoryIds: [seed.repositoryId], repositoryId: 'other' }));
  });
});
test('permission and exact counter failures refuse before reads and revocation refuses delivery', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    failure(await run(f, f.make({ tokenCounter: null })), 'TOKEN_COUNTER_UNAVAILABLE');
    failure(
      await run(
        f,
        f.make({
          authorize() {
            throw Error('SECRET');
          },
        }),
      ),
      'PERMISSION_DENIED',
    );
    assert.equal(f.seen.open, 0);
    let n = 0;
    failure(
      await run(
        f,
        f.make({
          authorize() {
            if (++n === 2) throw Error('SECRET');
          },
        }),
      ),
      'PERMISSION_DENIED',
    );
    assert.equal(f.seen.close, 1);
    const s = f.make({ authorize: () => Promise.reject(Error('SECRET')) });
    failure(await run(f, s), 'PERMISSION_DENIED');
    failure(await run(f, s), 'CONTEXT_UNAVAILABLE');
  });
});
test('complete response byte/token budgets, exact digest and host clamping apply beyond inner envelope', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      r = await run(f);
    assert.ok(r.data, JSON.stringify(r));
    const bytes = Buffer.byteLength(contract.serializeSymbolUnderstandingResponse(r, control()));
    assert.ok(bytes > Buffer.byteLength(JSON.stringify(r.data.engineeringResult)));
    failure(
      await run(f, f.make({ limits: { ...limits, maxOutputBytes: bytes - 100 } })),
      'BUDGET_EXCEEDED',
    );
    failure(await run(f, f.make({ limits: { ...limits, maxTokens: 36 } })), 'BUDGET_EXCEEDED');
    failure(
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
    const limited = await run(f, f.api, { ...f.input, budget: { ...limits, maxEdges: 1 } });
    assert.ok(limited.data, JSON.stringify(limited));
    assert.equal(limited.meta.truncation.truncated, true);
    assert.deepEqual(
      limited.meta.truncation.reasons,
      limited.data.engineeringResult.payload.truncation,
    );
    assert.equal(limited.meta.truncation.frontier, null);
  });
});
test('abort/deadline, provider errors and failed/joined close never deliver success or private details', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      abort = new AbortController();
    abort.abort();
    failure(await run(f, f.api, f.input, control({ signal: abort.signal })), 'CANCELLED');
    failure(await run(f, f.api, f.input, control({ deadlineEpochMs: Date.now() - 1 })), 'DEADLINE');
    assert.equal(f.seen.open, 0);
    failure(
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
    let release, entered;
    const waiting = new Promise((r) => (entered = r));
    const s = f.make({
      openCodeQuery: async (b, c) => {
        const p = await f.open(b, c);
        return {
          ...p,
          close: async () => {
            await p.close();
            entered();
            await new Promise((r) => (release = r));
          },
        };
      },
    });
    let done = false;
    const pending = run(f, s).then((r) => {
      done = true;
      return r;
    });
    await waiting;
    assert.equal(done, false);
    release();
    assert.ok((await pending).data);
    failure(
      await run(
        f,
        f.make({
          openCodeQuery: async (b, c) => {
            const p = await f.open(b, c);
            return {
              ...p,
              close: async () => {
                await p.close();
                throw Error('SECRET cleanup');
              },
            };
          },
        }),
      ),
      'PROVIDER_UNAVAILABLE',
    );
  });
});
test('host getter/proxy and dishonest async/thenable counters refuse safely', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    let touched = 0;
    const hostile = { ...f.ports };
    Object.defineProperty(hostile, 'repositoryId', {
      enumerable: true,
      get() {
        touched++;
        return seed.repositoryId;
      },
    });
    const { createOwnedSymbolUnderstandingSession: create } =
      await import('../dist/symbol-understanding-tool.js');
    assert.throws(() => create(hostile));
    assert.throws(() => create(new Proxy(f.ports, {})));
    assert.equal(touched, 0);
    for (const bad of [
      meter(() => Promise.reject(Error('SECRET'))),
      meter(() => ({
        then() {
          throw Error('SECRET');
        },
      })),
      meter(
        () =>
          new Proxy(
            {},
            {
              get() {
                throw Error('SECRET');
              },
            },
          ),
      ),
    ])
      failure(await run(f, f.make({ tokenCounter: bad })), 'TOKEN_COUNTER_UNAVAILABLE');
  });
});
test('in-flight cancellation and session closure join cleanup and refuse delivery', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    let resume, opened;
    const ready = new Promise((r) => (opened = r));
    const abort = new AbortController();
    const s = f.make({
      openCodeQuery: async (b, c) => {
        const p = await f.open(b, c);
        opened();
        await new Promise((r) => (resume = r));
        return p;
      },
    });
    const pending = run(f, s, f.input, control({ signal: abort.signal }));
    await ready;
    abort.abort();
    resume();
    failure(await pending, 'CANCELLED');
    assert.equal(f.seen.close, 1);
    let release, closing;
    const atClose = new Promise((r) => (closing = r));
    const x = f.make({
      openCodeQuery: async (b, c) => {
        const p = await f.open(b, c);
        return {
          ...p,
          close: async () => {
            await p.close();
            closing();
            await new Promise((r) => (release = r));
          },
        };
      },
    });
    const pending2 = run(f, x);
    await atClose;
    x.close();
    release();
    failure(await pending2, 'CONTEXT_UNAVAILABLE');
    assert.equal(f.seen.close, 2);
  });
});
test('Application independently clamps explicit query timeout to remaining request deadline', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const { readOwnedSymbolUnderstanding } =
      await import('../../application/dist/owned-symbol-query.js');
    const f = setup(seed);
    const c = control({ deadlineEpochMs: Date.now() + 5000 });
    const result = await readOwnedSymbolUnderstanding(
      {
        repositoryId: seed.repositoryId,
        symbolId: seed.symbolIds.root,
        expectedRevisionId: 'query-revision',
        budget: {
          maxNodes: 50,
          maxEdges: 50,
          maxMetadataRows: 10000,
          maxResultBytes: 1000000,
          timeoutMs: 60000,
        },
      },
      f.open,
      c,
    );
    assert.ok(f.seen.budget.timeoutMs <= 5000);
    assert.equal(result.payload.budget.timeoutMs, f.seen.budget.timeoutMs);
    assert.equal(f.seen.close, 1);
  });
});
test('failed source cleanup poisons session and close reports UNKNOWN without reopening', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed);
    const s = f.make({
      openCodeQuery: async (b, c) => {
        const p = await f.open(b, c);
        return {
          ...p,
          close: async () => {
            await p.close();
            throw Error('SECRET cleanup');
          },
        };
      },
    });
    failure(await run(f, s), 'PROVIDER_UNAVAILABLE');
    failure(await run(f, s), 'CONTEXT_UNAVAILABLE');
    assert.equal(f.seen.open, 1);
    const ignoredClose = s.close();
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(ignoredClose, { code: 'QUERY_CLEANUP_FAILED', cleanupState: 'UNKNOWN' });
  });
});
test('close joins a pending source query and preserves cleanup UNKNOWN after cancellation', async (t) => {
  await withCodeQueryDatabase(t, 'current', async (seed) => {
    const f = setup(seed),
      abort = new AbortController();
    let release, entered;
    const waiting = new Promise((r) => (entered = r));
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
    await waiting;
    let settled = false;
    const closing = s.close();
    assert.ok(closing instanceof Promise);
    closing.then(
      () => (settled = true),
      () => (settled = true),
    );
    abort.abort();
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false);
    release();
    failure(await pending, 'PROVIDER_UNAVAILABLE');
    await assert.rejects(closing, { code: 'QUERY_CLEANUP_FAILED', cleanupState: 'UNKNOWN' });
    failure(await run(f, s), 'CONTEXT_UNAVAILABLE');
    assert.equal(f.seen.open, 1);
  });
});
for (const cleanupFails of [false, true])
  test(`reentrant close joins actual opened handle without node reads; cleanup failure=${cleanupFails}`, async (t) => {
    await withCodeQueryDatabase(t, 'current', async (seed) => {
      const f = setup(seed);
      let closing,
        sourceClosed = false;
      const s = f.make({
        openCodeQuery: async (b, c) => {
          const p = await f.open(b, c);
          closing = s.close();
          return {
            ...p,
            close: async () => {
              await p.close();
              sourceClosed = true;
              if (cleanupFails) throw Error('SECRET cleanup');
            },
          };
        },
      });
      const result = await run(f, s);
      failure(result, cleanupFails ? 'PROVIDER_UNAVAILABLE' : 'CONTEXT_UNAVAILABLE');
      assert.ok(closing instanceof Promise);
      if (cleanupFails)
        await assert.rejects(closing, { code: 'QUERY_CLEANUP_FAILED', cleanupState: 'UNKNOWN' });
      else await closing;
      assert.equal(sourceClosed, true);
      assert.equal(f.seen.node, 0);
      assert.equal(f.seen.close, 1);
      assert.equal(f.seen.open, 1);
      failure(await run(f, s), 'CONTEXT_UNAVAILABLE');
      assert.equal(f.seen.open, 1);
    });
  });
