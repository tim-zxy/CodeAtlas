import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnedProjectL1Session, projectL1ResponseSchema } from '../dist/index.js';
import { setup, limits, meter, control } from './helpers/knowledge-search-fixture.mjs';
import { limits as readLimits } from '../../storage/test/helpers/offline-publication-fixture.mjs';
const input = {
  version: 2,
  depth: 'L1',
  query: { mode: 'LEXICAL_PHRASE', text: 'Matched contract', filters: { types: ['INTEGRATION'] } },
  budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
};
async function fixture(t, patch = {}) {
  const f = await setup();
  t.after(() => f.close());
  const seen = { query: 0, permission: [], measured: [] };
  const api = createOwnedProjectL1Session({
    workspaceId: 'w',
    repositoryIds: ['r'],
    limits,
    authorize(m) {
      seen.permission.push(m);
    },
    knowledgeQuery: async (req, c) => {
      seen.query++;
      return f.index.searchPage(req, readLimits, c);
    },
    tokenCounter: meter((text) => {
      seen.measured.push(text);
      return {
        policyRef: 'fixture:owned-search:v1',
        contentDigest: awaitSha(text),
        outputTokens: 37,
      };
    }),
    ...patch,
  });
  return { f, seen, api };
}
import { createHash } from 'node:crypto';
const awaitSha = (text) => createHash('sha256').update(text).digest('hex');
test('L1 explicitly retrieves published phrase/type first page and meters complete output once', async (t) => {
  const { api, seen } = await fixture(t);
  assert.equal(seen.query, 0);
  const r = await api.execute(input, api.context, control());
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.data.depth, 'L1');
  assert.equal(r.data.contextVersion, 2);
  assert.equal(r.data.selectionBasis, 'EXPLICIT_LEXICAL_QUERY');
  assert.equal(r.data.projectCompleteness, 'NOT_ASSESSED');
  assert.equal(r.data.results.length, 1);
  assert.equal(r.data.results[0].type, 'INTEGRATION');
  assert.equal(r.data.productionQuery, 'NOT_AUTHORIZED');
  assert.equal(seen.measured.length, 1);
  assert.deepEqual(JSON.parse(seen.measured[0]), r);
  assert.ok(seen.permission.length >= 2);
  assert.ok(seen.permission.every((m) => m.purpose === 'get_project_context/L1'));
  assert.equal(projectL1ResponseSchema.safeParse(r).success, true);
});
test('L1 no match preserves honest empty metadata', async (t) => {
  const { api } = await fixture(t);
  const r = await api.execute(
    { ...input, query: { ...input.query, text: 'NoSuchPublishedTextxyz' } },
    api.context,
    control(),
  );
  assert.ok(!r.error, JSON.stringify(r));
  assert.deepEqual(r.data.results, []);
  assert.equal(r.meta.sourceFreshness, null);
  assert.equal(r.data.page.nextCursor, null);
});
for (const patch of [
  { version: 1 },
  { depth: 'L2' },
  { task: 'infer' },
  { query: { ...input.query, path: 'secret' } },
  { query: { ...input.query, mode: 'VECTOR' } },
  { budget: { ...input.budget, maxDepth: 1 } },
])
  test('L1 rejects unsupported request ' + JSON.stringify(patch), async (t) => {
    const { api, seen } = await fixture(t);
    assert.equal(
      (await api.execute({ ...input, ...patch }, api.context, control())).error.code,
      'INVALID_INPUT',
    );
    assert.equal(seen.query, 0);
  });
test('L1 absent counter and denied permission perform no retrieval', async (t) => {
  for (const patch of [
    { tokenCounter: null },
    {
      authorize() {
        throw Error('deny');
      },
    },
  ]) {
    const { api, seen } = await fixture(t, patch);
    const r = await api.execute(input, api.context, control());
    assert.ok(['PERMISSION_DENIED', 'TOKEN_COUNTER_UNAVAILABLE'].includes(r.error.code));
    assert.equal(seen.query, 0);
  }
});
test('L1 dishonest counter, complete-envelope byte cap and closed context fail', async (t) => {
  const { api } = await fixture(t, {
    tokenCounter: meter(() => ({
      policyRef: 'fixture:owned-search:v1',
      contentDigest: '0'.repeat(64),
      outputTokens: 37,
    })),
  });
  assert.equal(
    (await api.execute(input, api.context, control())).error.code,
    'TOKEN_COUNTER_UNAVAILABLE',
  );
  const b = await fixture(t);
  assert.equal(
    (
      await b.api.execute(
        { ...input, budget: { ...input.budget, maxOutputBytes: 1 } },
        b.api.context,
        control(),
      )
    ).error.code,
    'BUDGET_EXCEEDED',
  );
  b.api.close();
  assert.equal(
    (await b.api.execute(input, b.api.context, control())).error.code,
    'CONTEXT_UNAVAILABLE',
  );
});
test('L1 clamps host result limit, preserves cancellation and delivery authorization', async (t) => {
  const a = await fixture(t, { limits: { ...limits, maxResults: 1 } });
  const r = await a.api.execute(
    { ...input, budget: { ...input.budget, maxItems: 10 } },
    a.api.context,
    control(),
  );
  assert.ok(!r.error, JSON.stringify(r));
  assert.ok(r.data.results.length <= 1);
  assert.equal(
    (await a.api.execute(input, a.api.context, control({ signal: AbortSignal.abort() }))).error
      .code,
    'CANCELLED',
  );
  let calls = 0;
  const b = await fixture(t, {
    authorize() {
      if (++calls > 1) throw Error('revoked');
    },
  });
  assert.equal(
    (await b.api.execute(input, b.api.context, control())).error.code,
    'PERMISSION_DENIED',
  );
  assert.equal(b.seen.query, 1);
});

test('L1 retains response metadata associations and does not reuse smaller search-envelope budget', async (t) => {
  const { api, f } = await fixture(t);
  const r = await api.execute(input, api.context, control());
  const changed = structuredClone(r);
  changed.meta.truncation.truncated = !changed.meta.truncation.truncated;
  assert.equal(projectL1ResponseSchema.safeParse(changed).success, false);
  const search = await f.api.execute(
    {
      version: 1,
      mode: input.query.mode,
      text: input.query.text,
      scope: 'WORKSPACE',
      filters: input.query.filters,
      page: { limit: 1, cursor: null },
      budget: { maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
    },
    f.api.context,
    control(),
  );
  const bytes = Buffer.byteLength(JSON.stringify(search));
  assert.ok(Buffer.byteLength(JSON.stringify(r)) > bytes);
  assert.equal(
    (
      await api.execute(
        { ...input, budget: { ...input.budget, maxOutputBytes: bytes } },
        api.context,
        control(),
      )
    ).error.code,
    'BUDGET_EXCEEDED',
  );
});
