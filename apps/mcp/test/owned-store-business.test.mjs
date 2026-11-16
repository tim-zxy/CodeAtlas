import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const request = (seed) => ({
  version: 1,
  kind: 'BUSINESS',
  startRef: {
    kind: 'KNOWLEDGE_ITEM',
    id: seed.knowledgeRef.itemId,
    revisionId: seed.knowledgeRef.revisionId,
  },
  startStepKey: seed.startStepKey,
  direction: 'FORWARD',
  budget: { maxDepth: 20, maxSteps: 20, maxEdges: 20, maxOutputBytes: 1000000, maxTokens: 1000 },
});
async function withClient(mode, body) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./owned-five-read-tools.fixture.mjs', import.meta.url)), mode],
    stderr: 'pipe',
    maxBufferSize: 4000000,
    env: {
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PATH: process.env.PATH,
    },
  });
  let stderr = '',
    timer;
  let resolveSeed;
  const seedPromise = new Promise((resolve) => {
    resolveSeed = resolve;
  });
  const seedTimeout = () =>
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('STORE_BUSINESS_SEED_NOT_EMITTED')), 10000);
    });
  transport.stderr.on('data', (bytes) => {
    stderr += bytes;
    assert.ok(stderr.length < 40000);
    const match = stderr.match(/STORE_BUSINESS_SEED (\{[^\n]+\})/);
    if (match) resolveSeed(JSON.parse(match[1]));
  });
  const client = new Client({ name: 'owned-store-business-client', version: '1' });
  try {
    await client.connect(transport);
    await body({
      client,
      seed: await Promise.race([seedPromise, seedTimeout()]),
      stderr: () => stderr,
    });
  } finally {
    clearTimeout(timer);
    await client.close();
  }
  assert.match(stderr, /OWNED_GROUP_SETTLED/);
  assert.ok(stderr.indexOf('OWNED_REGISTERED_STORE_CLOSED') >= 0);
  assert.ok(
    stderr.indexOf('OWNED_REGISTERED_STORE_CLOSED') < stderr.indexOf('OWNED_GROUP_SETTLED'),
  );
  assert.match(stderr, /OWNED_BUSINESS_HISTORY_UNCHANGED/);
  assert.match(stderr, /OWNED_BUSINESS_ALL_CLEANED/);
  return stderr;
}

test(
  'actual Store-published BusinessFlow reaches managed stdio with exact published and captured Runtime refs',
  { timeout: 30000 },
  async () => {
    const text = await withClient('managed-store-business', async ({ client, seed }) => {
      const result = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
      assert.equal(result.isError, false, JSON.stringify(result));
      const value = result.structuredContent;
      assert.deepEqual(JSON.parse(result.content[0].text), value);
      assert.equal(value.data.startRef.id, seed.knowledgeRef.itemId);
      assert.equal(value.data.startRef.revisionId, seed.knowledgeRef.revisionId);
      assert.equal(value.data.isCurrentHead, true);
      assert.equal(value.data.participants[0].entity.kind, 'SERVICE');
      assert.equal(value.data.runtimeFlowRefs[0].entity.id, seed.runtimeFlowId);
      assert.equal(value.data.productionQuery, 'NOT_AUTHORIZED');
      assert.equal(value.data.quality, 'NOT_EVALUABLE');
      assert.deepEqual(
        value.data.steps.map((s) => s.stepKey),
        seed.expectedStepKeys,
      );
      assert.ok(value.data.supportRefs.length > 0);
      await assert.rejects(
        client.callTool({ name: 'update_knowledge', arguments: {} }),
        (e) => e.code === -32601,
      );
    });
    assert.match(text, /OWNED_BUSINESS_READS 1/);
  },
);
test(
  'managed BUSINESS authorization refusal prevents Store read and retains settled cleanup',
  { timeout: 30000 },
  async () => {
    const text = await withClient('managed-store-business-deny', async ({ client, seed }) => {
      const result = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, 'PERMISSION_DENIED');
      assert.doesNotMatch(JSON.stringify(result), /OWNED_TEST_BUSINESS_DENIED/);
    });
    assert.match(text, /OWNED_BUSINESS_READS 0/);
  },
);

test('SDK construction refusal after Store acquisition closes registered resources and never starts stdio', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./owned-five-read-tools.fixture.mjs', import.meta.url)),
      'managed-store-business-construction-fail',
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      env: {
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATH: process.env.PATH,
      },
    },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /OWNED_REGISTERED_STORE_CLOSED/);
  assert.match(result.stderr, /OWNED_EMBEDDING_HOST_FAILED/);
  assert.doesNotMatch(
    result.stderr,
    /OWNED_GROUP_SETTLED|OWNED_BUSINESS_ALL_CLEANED|NO_STARTUP_TOOL_QUERY/,
  );
});

test(
  'published-only local session advertises four readonly tools and reads genuine publication',
  { timeout: 30000 },
  async () => {
    const text = await withClient('managed-store-business-published', async ({ client, seed }) => {
      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
        'get_knowledge_status',
        'get_project_context',
        'search_knowledge',
        'trace_flow',
      ]);
      const result = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
      assert.equal(result.isError, false, JSON.stringify(result));
      assert.equal(result.structuredContent.data.startRef.revisionId, seed.knowledgeRef.revisionId);
      for (const [name, args] of [
        [
          'search_knowledge',
          {
            version: 1,
            mode: 'LEXICAL_PHRASE',
            text: 'Owned',
            scope: 'WORKSPACE',
            filters: { types: ['BUSINESS_FLOW'] },
            page: { limit: 1, cursor: null },
            budget: { maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
          },
        ],
        [
          'get_project_context',
          {
            version: 1,
            depth: 'L0',
            budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
          },
        ],
        [
          'get_knowledge_status',
          {
            version: 1,
            mode: 'SELECTED_PUBLISHED',
            budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
          },
        ],
      ]) {
        const value = await client.callTool({ name, arguments: args });
        assert.equal(value.isError, false, JSON.stringify(value));
        assert.ok(
          JSON.stringify(value.structuredContent).includes(seed.knowledgeRef.revisionId),
          name,
        );
        assert.equal(value.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
      }

      await assert.rejects(client.callTool({ name: 'update_knowledge', arguments: {} }));
      await assert.rejects(client.callTool({ name: 'understand_symbol', arguments: {} }));
    });
    assert.match(text, /OWNED_BUSINESS_READS 1/);
  },
);
test(
  'binding invalidation during Store query discards result and latches further delivery refusal',
  { timeout: 30000 },
  async () => {
    const text = await withClient(
      'managed-store-business-published-invalidated',
      async ({ client, seed }) => {
        for (let i = 0; i < 2; i++) {
          const result = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
          assert.equal(result.isError, true);
          assert.equal(result.structuredContent.error.code, 'CONTEXT_UNAVAILABLE');
          assert.doesNotMatch(JSON.stringify(result), /BINDING_CHANGED/);
        }
      },
    );
    assert.match(text, /OWNED_BUSINESS_READS 1/);
  },
);

test('unconfirmed binding receipts refuse startup and settle without reads', async () => {
  const { PassThrough } = await import('node:stream');
  const { createLocalPublishedReadMcpServer } = await import('../dist/owned-business-stdio.js');
  let reads = 0,
    thenRead = false;
  const thenable = Object.defineProperty({}, 'then', {
    get() {
      thenRead = true;
      throw Error('PRIVATE');
    },
  });
  const budget = { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 };
  const port = {
    authorize() {},
    knowledgeQuery: async () => {
      reads++;
      throw Error('MUST_NOT_QUERY');
    },
  };
  const options = {
    scope: { workspaceId: 'w', repositoryIds: ['r'] },
    limits: {
      maxMessageBytes: 4000000,
      maxConcurrentCalls: 1,
      maxItems: 1000,
      maxDepth: 20,
      requestTimeoutMs: 10000,
    },
    business: {
      ...port,
      limits: {
        maxDepth: 20,
        maxSteps: 20,
        maxEdges: 20,
        maxOutputBytes: 1000000,
        maxTokens: 1000,
      },
    },
    search: {
      ...port,
      limits: { maxResults: 20, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
    },
    projectContext: {
      ...port,
      limits: budget,
      selectedRefs: [{ itemId: 'item:one', revisionId: 'revision:one' }],
    },
    status: {
      ...port,
      limits: budget,
      selectedRefs: [{ itemId: 'item:one', revisionId: 'revision:one' }],
    },
  };
  for (const check of [
    () => true,
    () => Promise.resolve(),
    () => Promise.reject(Error('PRIVATE')),
    () => thenable,
    () => {
      throw Error('PRIVATE');
    },
  ]) {
    const input = new PassThrough(),
      output = new PassThrough();
    let bytes = 0;
    output.on('data', (b) => (bytes += b.length));
    const app = createLocalPublishedReadMcpServer(
      options,
      { signal: new AbortController().signal, check },
      { input, output },
    );
    await assert.rejects(app.start(), /LOCAL_PUBLISHED_BINDING_UNAVAILABLE/);
    assert.equal((await app.close()).cleanupState, 'SETTLED');
    assert.equal(bytes, 0);
    input.destroy();
    output.destroy();
  }
  const input = new PassThrough(),
    output = new PassThrough();
  let checks = 0;
  const mutable = { ...options, limits: { ...options.limits } };
  const app = createLocalPublishedReadMcpServer(
    mutable,
    {
      signal: new AbortController().signal,
      check(scope) {
        checks++;
        assert.ok(Object.isFrozen(scope) && Object.isFrozen(scope.repositoryIds));
        mutable.limits.maxMessageBytes = 0; // Old factory has already captured the valid ceiling.
      },
    },
    { input, output },
  );
  assert.equal(checks, 0);
  await app.start();
  assert.equal(checks, 1);
  assert.equal((await app.close()).cleanupState, 'SETTLED');
  input.destroy();
  output.destroy();
  assert.equal(reads, 0);
  assert.equal(thenRead, false);
});

test('opaque Runtime binding rejects forged/cross-owner handles and scope/version substitution permanently', async () => {
  const { setup, control } =
    await import('../../../packages/agent-api/test/helpers/knowledge-search-fixture.mjs');
  const { limits } =
    await import('../../../packages/storage/test/helpers/offline-publication-fixture.mjs');
  const { createOwnedPublishedReadBinding: create } =
    await import('../../../packages/runtime/dist/owned-published-read-binding.js');
  const f = await setup();
  const scope = { workspaceId: 'w', repositoryIds: ['r'] };
  const make = (store = f.store, c = control()) => create({ store, scope, limits, control: c });
  try {
    assert.throws(
      () =>
        make({
          readState() {
            return Promise.reject(Error('PRIVATE'));
          },
        }),
      /OWNED_BINDING_UNAVAILABLE/,
    );
    let thenRead = false;
    assert.throws(() =>
      make({
        readState() {
          return Object.defineProperty({}, 'then', {
            get() {
              thenRead = true;
              throw Error('MUST_NOT_READ');
            },
          });
        },
      }),
    );
    assert.equal(thenRead, false);
    const storePort = { readState: (...args) => f.store.readState(...args) };
    const capturedStore = make(storePort);
    storePort.readState = () => ({ workspaceId: 'foreign' });
    capturedStore.check(capturedStore.handle, scope);
    capturedStore.revoke();
    assert.throws(
      () =>
        create({
          store: f.store,
          scope: { workspaceId: 'foreign', repositoryIds: ['r'] },
          limits,
          control: control(),
        }),
      /OWNED_BINDING_UNAVAILABLE/,
    );
    const otherOwner = make();
    for (const candidate of [{}, Object.freeze({}), otherOwner.handle]) {
      const b = make();
      assert.throws(() => b.check(candidate, scope), /OWNED_BINDING_UNAVAILABLE/);
      assert.throws(() => b.check(b.handle, scope), /OWNED_BINDING_UNAVAILABLE/);
      b.revoke();
    }
    otherOwner.revoke();
    for (const other of [
      { ...scope, workspaceId: 'foreign' },
      { ...scope, repositoryIds: ['foreign'] },
    ]) {
      const b = make();
      assert.throws(() => b.check(b.handle, other));
      assert.throws(() => b.check(b.handle, scope));
      b.revoke();
    }
    let changed = false;
    const b = make({
      readState(...args) {
        const value = f.store.readState(...args);
        return changed ? { ...value, substitutedVersion: true } : value;
      },
    });
    b.check(b.handle, scope);
    changed = true;
    assert.throws(() => b.check(b.handle, scope));
    changed = false;
    assert.throws(() => b.check(b.handle, scope));
    b.revoke();
    const cancellation = new AbortController(),
      c = control({ signal: cancellation.signal }),
      cancelled = make(f.store, c);
    cancellation.abort();
    assert.equal(cancelled.signal.aborted, true);
    assert.throws(() => cancelled.check(cancelled.handle, scope));
    cancelled.revoke();
    const closed = make();
    closed.revoke();
    assert.throws(() => closed.check(closed.handle, scope));
  } finally {
    f.close();
  }
});

test(
  'revoking the concrete Runtime binding during SDK query prevents successful delivery and joins cleanup',
  { timeout: 30000 },
  async () => {
    const text = await withClient(
      'managed-store-business-published-revoked',
      async ({ client, seed }) => {
        let result;
        try {
          result = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
        } catch (error) {
          assert.ok(error instanceof Error);
        }
        if (result) {
          assert.equal(result.isError, true);
          assert.equal(result.structuredContent?.data, undefined);
        }
      },
    );
    assert.match(text, /OWNED_BUSINESS_READS 1/);
  },
);

for (const mode of ['normal', 'deny', 'unknown-cleanup', 'revoke-on-query'])
  test(
    'schema11 receipt v2 real stdio status/L0 owns exact lineage and cleanup: ' + mode,
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          fileURLToPath(new URL('./receipt-selected-read.fixture.mjs', import.meta.url)),
          mode,
        ],
        stderr: 'pipe',
        maxBufferSize: 4000000,
        env: {
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          PATH: process.env.PATH,
        },
      });
      let stderr = '';
      transport.stderr.on('data', (bytes) => {
        stderr += bytes;
        assert.ok(stderr.length < 20000);
      });
      const client = new Client({ name: 'owned-schema11-client', version: '2' });
      try {
        await client.connect(transport);
        const list = await client.listTools();
        assert.deepEqual(
          list.tools.map((t) => t.name),
          ['get_knowledge_status', 'get_project_context'],
        );
        const match = stderr.match(/SCHEMA11_SEED (\{[^\n]+\})/);
        assert.ok(match, stderr);
        const seed = JSON.parse(match[1]);
        for (const name of ['get_knowledge_status', 'get_project_context']) {
          const args = {
            version: 2,
            ...(name === 'get_knowledge_status' ? { mode: 'SELECTED_PUBLISHED' } : { depth: 'L0' }),
            budget: { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 50000 },
          };
          if (mode === 'revoke-on-query') {
            let result;
            try {
              result = await client.callTool({ name, arguments: args });
            } catch (error) {
              assert.ok(error instanceof Error);
            }
            if (result) {
              assert.equal(result.isError, true);
              assert.equal(result.structuredContent?.data, undefined);
            }
            break;
          }
          const result = await client.callTool({ name, arguments: args });
          assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
          assert.equal(result.structuredContent.version, 2);
          if (mode === 'deny') {
            assert.equal(result.isError, true);
            assert.equal(result.structuredContent.error.code, 'PERMISSION_DENIED');
            continue;
          }
          assert.equal(result.isError, false, JSON.stringify(result));
          const item = result.structuredContent.data.items[0];
          assert.deepEqual(item.ref, {
            kind: 'KNOWLEDGE_ITEM',
            id: seed.ref.itemId,
            revisionId: seed.ref.revisionId,
          });
          assert.deepEqual(item.provenance, {
            kind: 'SCHEMA11_RECEIPT',
            version: 1,
            publicationId: seed.publicationId,
            candidateId: seed.candidateId,
            ...seed.provenance,
          });
          assert.equal(item.provenance.attemptId, undefined);
          assert.deepEqual(item.coverage, seed.coverage);
          assert.equal(result.structuredContent.data.quality, 'NOT_EVALUABLE');
          assert.equal(result.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
          if (name === 'get_project_context') {
            assert.equal(item.title, seed.title);
            assert.equal(item.summary, seed.goal);
            assert.equal(result.structuredContent.data.projectCompleteness, 'NOT_ASSESSED');
          } else {
            assert.equal(item.title, undefined);
            assert.equal(result.structuredContent.data.wholeProjectStatus, 'NOT_ASSESSED');
          }
          const bad = await client.callTool({ name, arguments: { ...args, version: 1 } });
          assert.equal(bad.structuredContent.error.code, 'INVALID_INPUT');
          const tiny = await client.callTool({
            name,
            arguments: { ...args, budget: { ...args.budget, maxTokens: 1 } },
          });
          assert.equal(tiny.structuredContent.error.code, 'BUDGET_EXCEEDED');
        }
        if (mode !== 'revoke-on-query')
          await assert.rejects(
            client.callTool({ name: 'update_knowledge', arguments: {} }),
            (e) => e.code === -32601,
          );
      } finally {
        await client.close();
      }
      assert.match(stderr, /SCHEMA11_RELEASED/);
      if (mode === 'revoke-on-query') assert.match(stderr, /SCHEMA11_REVOKED/);
      const receipt = stderr.match(/SCHEMA11_HOST (\{[^\n]+\})/);
      assert.ok(receipt, stderr);
      assert.deepEqual(
        JSON.parse(receipt[1]),
        mode === 'unknown-cleanup'
          ? { cleanupState: 'UNKNOWN', exitCode: 2 }
          : { cleanupState: 'SETTLED', exitCode: 0 },
      );
      assert.ok(stderr.indexOf('SCHEMA11_RELEASED') < stderr.indexOf('SCHEMA11_HOST'));
    },
  );

test(
  'receipt four-tool stdio serves actual derived FTS and declared BUSINESS with settled release',
  { timeout: 30000 },
  async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(new URL('./receipt-selected-read.fixture.mjs', import.meta.url)),
        'extended',
      ],
      stderr: 'pipe',
      maxBufferSize: 4000000,
      env: {
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATH: process.env.PATH,
      },
    });
    let stderr = '';
    transport.stderr.on('data', (b) => {
      stderr += b;
      assert.ok(stderr.length < 20000);
    });
    const client = new Client({ name: 'receipt-four-test', version: '2' });
    try {
      await client.connect(transport);
      const list = await client.listTools();
      assert.deepEqual(
        list.tools.map((t) => t.name),
        ['get_knowledge_status', 'get_project_context', 'search_knowledge', 'trace_flow'],
      );
      const seed = JSON.parse(stderr.match(/SCHEMA11_SEED (\{[^\n]+\})/)[1]);
      const queries = {
        search_knowledge: {
          version: 2,
          mode: 'LEXICAL_PHRASE',
          scope: 'WORKSPACE',
          text: 'Owned declared',
          filters: { types: null },
          page: { limit: 1, cursor: null },
          budget: { maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 50000 },
        },
        trace_flow: {
          version: 2,
          kind: 'BUSINESS',
          startRef: {
            kind: 'KNOWLEDGE_ITEM',
            id: seed.ref.itemId,
            revisionId: seed.ref.revisionId,
          },
          startStepKey: seed.startStepKey,
          direction: 'FORWARD',
          budget: {
            maxDepth: 10,
            maxSteps: 20,
            maxEdges: 20,
            maxOutputBytes: 1000000,
            maxTokens: 50000,
          },
        },
      };
      for (const [name, args] of Object.entries(queries)) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, false, JSON.stringify(result));
        assert.equal(result.structuredContent.version, 2);
        assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
        const value = result.structuredContent.data,
          provenance = name === 'trace_flow' ? value.provenance : value.results[0].provenance;
        assert.deepEqual(provenance, {
          kind: 'SCHEMA11_RECEIPT',
          version: 1,
          publicationId: seed.publicationId,
          candidateId: seed.candidateId,
          ...seed.provenance,
        });
        assert.equal(provenance.attemptId, undefined);
        assert.equal(value.quality, 'NOT_EVALUABLE');
        assert.equal(value.productionQuery, 'NOT_AUTHORIZED');
        if (name === 'trace_flow') {
          assert.deepEqual(value.steps.map((s) => s.stepKey).sort(), seed.expectedStepKeys);
          assert.ok(
            result.structuredContent.meta.warnings.includes('DECLARED_BUSINESS_STEPS_ONLY'),
          );
        } else {
          assert.equal(value.page.nextCursor, null);
          assert.deepEqual(value.results[0].coverage, seed.coverage);
        }
        assert.equal(
          (await client.callTool({ name, arguments: { ...args, version: 1 } })).structuredContent
            .error.code,
          'INVALID_INPUT',
        );
        assert.equal(
          (
            await client.callTool({
              name,
              arguments: { ...args, budget: { ...args.budget, maxTokens: 1 } },
            })
          ).structuredContent.error.code,
          'BUDGET_EXCEEDED',
        );
      }
      await assert.rejects(
        client.callTool({ name: 'update_knowledge', arguments: {} }),
        (e) => e.code === -32601,
      );
    } finally {
      await client.close();
    }
    assert.match(stderr, /SCHEMA11_RELEASED/);
    const receipt = JSON.parse(stderr.match(/SCHEMA11_HOST (\{[^\n]+\})/)[1]);
    assert.deepEqual(receipt, { cleanupState: 'SETTLED', exitCode: 0 });
  },
);
