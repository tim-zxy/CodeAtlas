import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../dist/index.js';
test('owned search contract and session are available', () => {
  assert.equal(typeof api.createOwnedKnowledgeSearchSession, 'function');
  assert.equal(typeof api.knowledgeSearchRequestSchema?.safeParse, 'function');
});

import { setup, input, control, meter, limits, sha } from './helpers/knowledge-search-fixture.mjs';
const run = (s, args = input, c = control(), handle = s.context) => s.execute(args, handle, c);
const failed = (r, code) =>
  assert.deepEqual(r, { error: { code, message: api.knowledgeSearchErrorMessages[code] } });
test('actual SQLite first page passes Application with precise metadata and no count/score', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const r = await run(f.api);
  assert.ok(r.data, JSON.stringify(r));
  assert.equal(r.data.results.length, 1);
  assert.equal(r.data.page.hasMore, true);
  assert.equal(r.data.page.nextCursor, null);
  assert.deepEqual(r.meta.truncation, { truncated: true, reasons: ['MAX_RESULTS'], frontier: [] });
  const h = r.data.results[0];
  assert.equal(h.type, 'INTEGRATION');
  assert.equal(h.provenance.runId, 'run:set');
  assert.equal(h.sourceFreshness, 'AFFECTED');
  assert.equal(h.compilationCurrency, 'CURRENT');
  assert.ok(h.supportRefs.length);
  assert.ok(r.meta.basisRefs.length);
  assert.equal(r.data.productionQuery, 'NOT_AUTHORIZED');
  assert.equal(h.rank, undefined);
  assert.equal(r.data.totalMatches, undefined);
  assert.deepEqual(h.coverage, f.input.candidates[0].payload.coverage);
  assert.ok(f.seen.projection.some((m) => m.fields.includes('SUPPORT_METADATA')));
  assert.equal(f.seen.permission.length, 2);
});
test('no hits has null aggregate metadata and phrase syntax does not execute operators', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  for (const text of ['unmatched words', '" OR *']) {
    const r = await run(f.api, { ...input, text });
    assert.ok(r.data, JSON.stringify(r));
    assert.deepEqual(r.data.results, []);
    assert.equal(r.meta.sourceFreshness, null);
    assert.equal(r.meta.compilationCurrency, null);
    assert.equal(r.meta.coverage, null);
    assert.equal(r.data.page.hasMore, false);
  }
});
test('strict first-page filters and modes refuse widening before read', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  for (const patch of [
    { version: 2 },
    { mode: 'BOOLEAN' },
    { scope: 'ALL' },
    { workspaceId: 'other' },
    { filters: { types: [] } },
    { filters: { types: ['INTEGRATION', 'INTEGRATION'] } },
    { filters: { types: ['OTHER'] } },
    { page: { limit: 1, cursor: 'next' } },
    { budget: { ...input.budget, maxDepth: 1 } },
    { text: '   ' },
    { permissionContext: { allowed: true } },
  ])
    failed(await run(f.api, { ...input, ...patch }), 'INVALID_INPUT');
  assert.equal(f.seen.query, 0);
  const r = await run(f.api, { ...input, filters: { types: ['COMPONENT'] } });
  assert.deepEqual(r.data.results, []);
});
test('missing counter/denied/revoked/foreign or closed context refuses with no authority DTO', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  failed(await run(f.make({ tokenCounter: null })), 'TOKEN_COUNTER_UNAVAILABLE');
  assert.equal(f.seen.query, 0);
  f.setDeny(true);
  failed(await run(f.api), 'PERMISSION_DENIED');
  f.setDeny(false);
  failed(await run(f.api, input, control(), {}), 'CONTEXT_UNAVAILABLE');
  let checks = 0;
  const late = f.make({
    authorize() {
      if (++checks === 2) throw Error('SECRET revoke');
    },
  });
  failed(await run(late), 'PERMISSION_DENIED');
  f.api.close();
  failed(await run(f.api), 'CONTEXT_UNAVAILABLE');
});
test('full response bytes and exact token policy digest ceilings refuse and do not strip metadata', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const good = await run(f.api);
  assert.ok(good.data, JSON.stringify(good));
  const text = api.serializeKnowledgeSearchResponse(good, control()),
    n = Buffer.byteLength(text);
  assert.ok((await run(f.make({ limits: { ...limits, maxOutputBytes: n, maxTokens: 37 } }))).data);
  failed(await run(f.make({ limits: { ...limits, maxOutputBytes: n - 1 } })), 'BUDGET_EXCEEDED');
  failed(await run(f.make({ limits: { ...limits, maxTokens: 36 } })), 'BUDGET_EXCEEDED');
  failed(
    await run(
      f.make({
        tokenCounter: meter(() => ({
          policyRef: 'fixture:owned-search:v1',
          contentDigest: '0'.repeat(64),
          outputTokens: 1,
        })),
      }),
    ),
    'TOKEN_COUNTER_UNAVAILABLE',
  );
});
test('controls, provider/index failures and illegal async authority retain safe errors', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const abort = new AbortController();
  abort.abort();
  failed(await run(f.api, input, control({ signal: abort.signal })), 'CANCELLED');
  failed(await run(f.api, input, control({ deadlineEpochMs: Date.now() - 1 })), 'DEADLINE');
  failed(
    await run(
      f.make({
        knowledgeQuery: async () => {
          throw Object.assign(Error('SECRET path'), { code: 'INDEX_UNAVAILABLE' });
        },
      }),
    ),
    'INDEX_UNAVAILABLE',
  );
  const s = f.make({ authorize: () => Promise.reject(Error('SECRET async')) });
  failed(await run(s), 'PERMISSION_DENIED');
  failed(await run(s), 'CONTEXT_UNAVAILABLE');
  await new Promise((r) => setImmediate(r));
});
test('late cancellation and malicious projected metadata cannot become results', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const abort = new AbortController();
  const s = f.make({
    knowledgeQuery: async (req, c) => {
      const r = f.index.searchPage(
        req,
        {
          maxRows: 10000,
          maxSerializedBytes: 4000000,
          maxItems: 400000,
          maxDepth: 100,
          memoryBudgetBytes: 40000000,
        },
        c,
      );
      abort.abort();
      return r;
    },
  });
  failed(await run(s, input, control({ signal: abort.signal })), 'CANCELLED');
  const base = await f.index.searchPage(
    { text: input.text, maxResults: 1, types: ['INTEGRATION'] },
    {
      maxRows: 10000,
      maxSerializedBytes: 4000000,
      maxItems: 400000,
      maxDepth: 100,
      memoryBudgetBytes: 40000000,
    },
    control(),
  );
  for (const mutate of [
    (r) => (r.workspaceId = 'foreign'),
    (r) => (r.results[0].scope = { kind: 'WORKSPACE', workspaceId: 'foreign' }),
    (r) => (r.results[0].type = 'COMPONENT'),
    (r) => (r.results[0].provenance.runId = null),
    (r) => (r.truncated = false),
  ]) {
    const bad = structuredClone(base);
    mutate(bad);
    failed(await run(f.make({ knowledgeQuery: async () => bad })), 'DATA_INVALID');
  }
});

test('response parser rejects inconsistent provenance metadata or first-page flags', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const good = await run(f.api);
  assert.ok(good.data);
  for (const mutate of [
    (r) => (r.meta.basisRefs = []),
    (r) => (r.meta.truncation.truncated = false),
    (r) => (r.meta.coverage = null),
    (r) => (r.meta.warnings = []),
    (r) => (r.meta.sourceFreshness = 'FRESH'),
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(api.knowledgeSearchResponseSchema.safeParse(bad).success, false);
  }
});
