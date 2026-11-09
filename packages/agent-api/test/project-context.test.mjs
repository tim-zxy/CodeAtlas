import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../dist/index.js';
test('owned L0 context contract/session available', () => {
  assert.equal(typeof api.createOwnedProjectContextSession, 'function');
  assert.equal(typeof api.projectContextRequestSchema?.safeParse, 'function');
});

import { setup, control, input, limits, meter, sha } from './helpers/project-context-fixture.mjs';
const run = (s, args = input, c = control(), h = s.context) => s.execute(args, h, c);
const failure = (r, code) =>
  assert.deepEqual(r, { error: { code, message: api.projectContextErrorMessages[code] } });
test('actual selected published L0 context is limited and deterministically truncated without FTS', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const r = await run(f.api, { ...input, budget: { ...limits, maxItems: 1 } });
  assert.ok(r.data, JSON.stringify(r));
  assert.equal(r.data.status, 'PARTIAL');
  assert.equal(r.data.projectCompleteness, 'NOT_ASSESSED');
  assert.equal(r.data.coverageScope, 'EXPLICIT_SELECTION_ONLY');
  assert.equal(r.data.productionQuery, 'NOT_AUTHORIZED');
  assert.deepEqual(r.data.selectedRefs, f.refs);
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.items[0].ref.id, f.refs[0].itemId);
  assert.deepEqual(r.data.omittedRefs, [f.refs[1]]);
  assert.deepEqual(r.data.missingRefs, []);
  assert.deepEqual(r.meta.truncation, { truncated: true, reasons: ['MAX_ITEMS'], frontier: [] });
  assert.equal(r.data.items[0].summarySource, 'SUMMARY');
  assert.equal(r.data.items[0].sourceFreshness, 'AFFECTED');
  assert.equal(r.data.items[0].provenance.runId, 'run:set');
  assert.ok(r.meta.basisRefs.length);
  assert.ok(r.data.items[0].supportRefs.length);
  assert.equal(f.seen.read, 1);
  assert.equal(f.seen.permission.length, 2);
});
test('empty selection reads no store and exact unavailable revision is explicitly missing, never substituted', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const empty = await run(f.make({ selectedRefs: [] }));
  assert.equal(empty.data.status, 'MISSING_DATA');
  assert.equal(empty.meta.coverage, null);
  assert.equal(empty.meta.sourceFreshness, null);
  assert.ok(empty.meta.warnings.includes('NO_SELECTED_KNOWLEDGE'));
  assert.equal(f.seen.read, 0);
  const ref = { ...f.refs[0], revisionId: 'historical:unavailable' };
  const missing = await run(f.make({ selectedRefs: [ref] }));
  assert.deepEqual(missing.data.missingRefs, [ref]);
  assert.deepEqual(missing.data.items, []);
  assert.equal(missing.data.status, 'MISSING_DATA');
  assert.ok(missing.meta.warnings.includes('SELECTED_CURRENT_REVISION_UNAVAILABLE'));
  assert.equal(missing.data.projectCompleteness, 'NOT_ASSESSED');
});
test('caller cannot change selection/workspace, request unsupported depth or use another/closed context', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  for (const patch of [
    { version: 2 },
    { depth: 'L1' },
    { depth: 'L2' },
    { selectedRefs: [] },
    { workspaceId: 'other' },
    { query: 'automatic' },
    { budget: { ...limits, maxDepth: 1 } },
    { budget: { ...limits, maxItems: 0 } },
  ])
    failure(await run(f.api, { ...input, ...patch }), 'INVALID_INPUT');
  assert.equal(f.seen.read, 0);
  failure(await run(f.api, input, control(), {}), 'CONTEXT_UNAVAILABLE');
  f.api.close();
  failure(await run(f.api), 'CONTEXT_UNAVAILABLE');
});
test('fixed selected scope is captured and malformed/duplicate constructor refs refuse', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const refs = structuredClone(f.refs),
    s = f.make({ selectedRefs: refs });
  refs.length = 0;
  assert.equal((await run(s)).data.items.length, 2);
  assert.throws(() => f.make({ selectedRefs: [f.refs[0], f.refs[0]] }));
});
test('no exact counter or failed/late revoked permission refuses without missing-data success', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  failure(await run(f.make({ tokenCounter: null })), 'TOKEN_COUNTER_UNAVAILABLE');
  failure(
    await run(
      f.make({
        authorize() {
          throw Error('SECRET permission');
        },
      }),
    ),
    'PERMISSION_DENIED',
  );
  assert.equal(f.seen.read, 0);
  let n = 0;
  failure(
    await run(
      f.make({
        authorize() {
          if (++n === 2) throw Error('SECRET revoked');
        },
      }),
    ),
    'PERMISSION_DENIED',
  );
  const s = f.make({ authorize: () => Promise.reject(Error('SECRET async')) });
  failure(await run(s), 'PERMISSION_DENIED');
  failure(await run(s), 'CONTEXT_UNAVAILABLE');
  await new Promise((r) => setImmediate(r));
});
test('complete canonical output budgets and digest policy include selected/missing/provenance metadata', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const r = await run(f.api);
  assert.ok(r.data, JSON.stringify(r));
  const n = Buffer.byteLength(api.serializeProjectContextResponse(r, control()));
  assert.ok((await run(f.make({ limits: { ...limits, maxOutputBytes: n, maxTokens: 37 } }))).data);
  failure(await run(f.make({ limits: { ...limits, maxOutputBytes: n - 1 } })), 'BUDGET_EXCEEDED');
  failure(await run(f.make({ limits: { ...limits, maxTokens: 36 } })), 'BUDGET_EXCEEDED');
  failure(
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
test('cancelled/deadline/provider failures refuse, including late cancellation', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const abort = new AbortController();
  abort.abort();
  failure(await run(f.api, input, control({ signal: abort.signal })), 'CANCELLED');
  failure(await run(f.api, input, control({ deadlineEpochMs: Date.now() - 1 })), 'DEADLINE');
  assert.equal(f.seen.read, 0);
  failure(
    await run(
      f.make({
        knowledgeQuery: async () => {
          throw Error('SECRET path');
        },
      }),
    ),
    'PROVIDER_UNAVAILABLE',
  );
  const late = new AbortController();
  failure(
    await run(
      f.make({
        knowledgeQuery: async (refs, c) => {
          const r = await f.query(refs, c);
          late.abort();
          return r;
        },
      }),
      input,
      control({ signal: late.signal }),
    ),
    'CANCELLED',
  );
});
test('unselected/corrupt source refs, heads and evidence refuse instead of widening context', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const raw = await f.query(f.refs, control());
  for (const mutate of [
    (r) => (r.manifest.workspaceId = 'foreign'),
    (r) => (r.records[0].itemId = 'unselected'),
    (r) => (r.headDigest = '0'.repeat(64)),
    (r) => (r.records[0].scopeJson = JSON.stringify({ kind: 'WORKSPACE', workspaceId: 'foreign' })),
    (r) => (r.records[0].evidence.provenance.runId = null),
  ]) {
    const bad = structuredClone(raw);
    mutate(bad);
    failure(await run(f.make({ knowledgeQuery: async () => bad })), 'DATA_INVALID');
  }
});
test('strict response refuses full-project claims and inconsistent missing/omitted/source metadata', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const good = await run(f.api);
  assert.ok(good.data);
  for (const mutate of [
    (r) => (r.data.projectCompleteness = 'COMPLETE'),
    (r) => (r.data.omittedRefs = [f.refs[0]]),
    (r) => (r.data.status = 'MISSING_DATA'),
    (r) => (r.meta.basisRefs = []),
    (r) => (r.meta.warnings = []),
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(api.projectContextResponseSchema.safeParse(bad).success, false);
  }
});

test('stored goal fallback and absent summaries are labelled, mixed metadata is not invented', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const raw = structuredClone(await f.query(f.refs, control()));
  raw.records[0].summary = '';
  raw.records[0].goal = 'Literal stored goal';
  raw.records[1].summary = '';
  raw.records[1].goal = '';
  raw.records[1].sourceFreshness = 'STALE';
  const r = await run(f.make({ knowledgeQuery: async () => raw }));
  assert.ok(r.data, JSON.stringify(r));
  assert.equal(r.data.items[0].summary, 'Literal stored goal');
  assert.equal(r.data.items[0].summarySource, 'GOAL');
  assert.equal(r.data.items[1].summary, '');
  assert.equal(r.data.items[1].summarySource, 'NONE');
  assert.equal(r.meta.sourceFreshness, null);
  assert.equal(r.data.status, 'AVAILABLE');
  assert.equal(r.data.projectCompleteness, 'NOT_ASSESSED');
});
