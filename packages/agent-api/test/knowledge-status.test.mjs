import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../dist/knowledge-status-tool.js').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
test('owned selected knowledge status session available', () =>
  assert.equal(typeof api.createOwnedKnowledgeStatusSession, 'function'));

import * as contract from '../dist/knowledge-status-contract.js';
import { setup, input, control, limits, meter } from './helpers/knowledge-status-fixture.mjs';
const run = (s, args = input, c = control(), h = s.context) => s.execute(args, h, c);
const fail = (r, code) =>
  assert.deepEqual(r, { error: { code, message: contract.knowledgeStatusErrorMessages[code] } });
test('selected metadata status returns no display fields, scoped counts and explicit unobserved health/runs', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const r = await run(f.api, { ...input, budget: { ...limits, maxItems: 1 } });
  assert.ok(r.data, JSON.stringify(r));
  assert.equal(r.data.selectionState, 'PARTIAL');
  assert.equal(r.data.wholeProjectStatus, 'NOT_ASSESSED');
  assert.equal(r.data.coverageScope, 'EXPLICIT_SELECTION_ONLY');
  assert.deepEqual(r.data.providerHealth, { availability: 'NOT_OBSERVED', value: null });
  assert.deepEqual(r.data.compilationRuns, { availability: 'UNAVAILABLE', value: null });
  assert.deepEqual(r.data.counts, { selected: 2, returned: 1, missing: 0, omitted: 1 });
  assert.equal(r.data.items.length, 1);
  for (const k of ['title', 'summary', 'goal']) assert.equal(r.data.items[0][k], undefined);
  assert.equal(r.data.items[0].sourceFreshness, 'AFFECTED');
  assert.equal(r.data.items[0].provenance.runId, 'run:set');
  assert.ok(r.meta.basisRefs.length);
  assert.deepEqual(r.meta.truncation, { truncated: true, reasons: ['MAX_ITEMS'], frontier: [] });
  assert.ok(
    f.seen.permissions.every(
      (m) => m.purpose === 'get_knowledge_status/SELECTED_PUBLISHED' && !m.fields.includes('TITLE'),
    ),
  );
});
test('empty/no-current selection is not global healthy or no-activity and does not substitute versions', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const empty = await run(f.make({ selectedRefs: [] }));
  assert.equal(f.seen.reads, 0);
  assert.equal(empty.data.selectionState, 'MISSING_DATA');
  assert.equal(empty.meta.sourceFreshness, null);
  assert.equal(empty.meta.coverage, null);
  const ref = { ...f.refs[0], revisionId: 'not-current' };
  const missing = await run(f.make({ selectedRefs: [ref] }));
  assert.deepEqual(missing.data.missingRefs, [ref]);
  assert.deepEqual(missing.data.items, []);
  assert.deepEqual(missing.data.counts, { selected: 1, returned: 0, missing: 1, omitted: 0 });
  assert.equal(missing.data.wholeProjectStatus, 'NOT_ASSESSED');
});
test('strict args/context deny broader status and no authority/counter failures become missing', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  for (const patch of [
    { mode: 'GLOBAL' },
    { scope: 'ALL' },
    { workspaceId: 'foreign' },
    { selectedRefs: [] },
    { probeProvider: true },
    { budget: { ...limits, maxDepth: 1 } },
  ])
    fail(await run(f.api, { ...input, ...patch }), 'INVALID_INPUT');
  assert.equal(f.seen.reads, 0);
  fail(await run(f.make({ tokenCounter: null })), 'TOKEN_COUNTER_UNAVAILABLE');
  fail(
    await run(
      f.make({
        authorize() {
          throw Error('SECRET denied');
        },
      }),
    ),
    'PERMISSION_DENIED',
  );
  assert.equal(f.seen.reads, 0);
  fail(await run(f.api, input, control(), {}), 'CONTEXT_UNAVAILABLE');
  let n = 0;
  fail(
    await run(
      f.make({
        authorize() {
          if (++n === 2) throw Error('SECRET revoke');
        },
      }),
    ),
    'PERMISSION_DENIED',
  );
  f.api.close();
  fail(await run(f.api), 'CONTEXT_UNAVAILABLE');
});
test('full status envelope budget and counter digest bind all refs/counts/unknown flags', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const r = await run(f.api);
  assert.ok(r.data);
  const bytes = Buffer.byteLength(contract.serializeKnowledgeStatusResponse(r, control()));
  assert.ok(
    (await run(f.make({ limits: { ...limits, maxOutputBytes: bytes, maxTokens: 37 } }))).data,
  );
  fail(await run(f.make({ limits: { ...limits, maxOutputBytes: bytes - 1 } })), 'BUDGET_EXCEEDED');
  fail(await run(f.make({ limits: { ...limits, maxTokens: 36 } })), 'BUDGET_EXCEEDED');
  fail(
    await run(
      f.make({
        tokenCounter: meter(() => ({
          policyRef: 'fixture:owned-search:v1',
          contentDigest: '0'.repeat(64),
          outputTokens: 37,
        })),
      }),
    ),
    'TOKEN_COUNTER_UNAVAILABLE',
  );
});
test('source scope/identity corruption, controls and async authority safely refuse', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const abort = new AbortController();
  abort.abort();
  fail(await run(f.api, input, control({ signal: abort.signal })), 'CANCELLED');
  fail(await run(f.api, input, control({ deadlineEpochMs: Date.now() - 1 })), 'DEADLINE');
  const raw = await f.query(f.refs, control());
  for (const change of [
    (r) => (r.records[0].itemId = 'foreign'),
    (r) => (r.manifest.workspaceId = 'foreign'),
    (r) => (r.headDigest = '0'.repeat(64)),
    (r) => (r.records[0].sourceFreshness = 'UNKNOWN'),
  ]) {
    const bad = structuredClone(raw);
    change(bad);
    fail(await run(f.make({ knowledgeQuery: async () => bad })), 'DATA_INVALID');
  }
  const s = f.make({ authorize: () => Promise.reject(Error('SECRET async')) });
  fail(await run(s), 'PERMISSION_DENIED');
  fail(await run(s), 'CONTEXT_UNAVAILABLE');
  await new Promise((r) => setImmediate(r));
});
test('status schema rejects healthy/global counts and missing partition corruption', async (t) => {
  const f = await setup();
  t.after(() => f.close());
  const good = await run(f.api);
  assert.ok(good.data);
  for (const mutate of [
    (r) => (r.data.providerHealth = { availability: 'HEALTHY', value: true }),
    (r) => (r.data.compilationRuns = { availability: 'AVAILABLE', value: [] }),
    (r) => (r.data.wholeProjectStatus = 'HEALTHY'),
    (r) => r.data.counts.selected++,
    (r) => (r.data.missingRefs = [f.refs[0]]),
    (r) => (r.meta.basisRefs = []),
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(contract.knowledgeStatusResponseSchema.safeParse(bad).success, false);
  }
});
