import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as host from '../dist/owned-business-stdio.js';
const budget = {
  maxDepth: 4,
  maxNodes: 20,
  maxEdges: 20,
  maxMetadataRows: 1000000,
  maxOutputBytes: 1000000,
  maxTokens: 1000,
};
function request(seed) {
  return {
    version: 3,
    kind: 'EXECUTION',
    expectedActivationId: seed.activationId,
    expectedRevisionId: seed.revisionId,
    startRef: { kind: 'EXECUTION_NODE', id: seed.executionNodeId },
    direction: 'FORWARD',
    budget,
  };
}
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
  let text = '',
    seedResolve;
  const seedPromise = new Promise((r) => (seedResolve = r));
  transport.stderr.on('data', (b) => {
    text += b;
    assert.ok(text.length < 40000);
    const m = text.match(/STRUCTURE_SEED (\{[^\n]+\})/);
    if (m) seedResolve(JSON.parse(m[1]));
  });
  const client = new Client({ name: 'managed-owned-client', version: '1' });
  try {
    await client.connect(transport);
    await body({ client, seed: await seedPromise, text: () => text });
  } finally {
    await client.close();
  }
}
test('managed owned host constructor exists', () =>
  assert.equal(typeof host.createOwnedManagedReadToolsMcpServer, 'function'));
for (const mode of ['managed', 'managed-mutate-scope', 'managed-one-shot'])
  test('actual owned metadata reconciliation precedes SDK service: ' + mode, async () =>
    withClient(mode, async ({ client, seed, text }) => {
      assert.match(text(), /RECONCILE_DONE STARTUP/);
      if (mode === 'managed-one-shot') assert.doesNotMatch(text(), /OBSERVER_ATTACHED|POST_ATTACH/);
      else {
        assert.ok(text().indexOf('RECONCILE_DONE STARTUP') < text().indexOf('OBSERVER_ATTACHED'));
        assert.match(text(), /RECONCILE_DONE POST_ATTACH/);
      }
      assert.match(text(), /NO_STARTUP_TOOL_QUERY/);
      const list = await client.listTools();
      assert.equal(list.tools.length, 5);
      const r = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
      assert.equal(r.isError, false, JSON.stringify(r));
      assert.equal(r.structuredContent.data.engineeringResult.activationId, seed.activationId);
      assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
      assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
      await assert.rejects(
        client.callTool({ name: 'update_knowledge', arguments: {} }),
        (e) => e.code === -32601,
      );
    }),
  );
test('event during real query is rejected even after reconciliation already returned READY', async () =>
  withClient('managed-overflow', async ({ client, seed, text }) => {
    const r = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
    assert.equal(r.isError, true, JSON.stringify(r));
    assert.equal(r.structuredContent.error.code, 'CONTEXT_UNAVAILABLE');
    assert.match(text(), /RECONCILE_DONE OVERFLOW/);
    assert.match(text(), /POST_EVENT_STATE READY/);
    const current = await client.callTool({ name: 'trace_flow', arguments: request(seed) });
    assert.equal(current.isError, false, JSON.stringify(current));
    assert.equal(current.structuredContent.data.engineeringResult.activationId, seed.activationId);
  }));
function options(lifecycle) {
  const bytes = { maxOutputBytes: 1000000, maxTokens: 1000 },
    graph = { maxNodes: 20, maxEdges: 20, maxMetadataRows: 1000000, ...bytes },
    tokenCounter = {
      kind: 'EXACT_LOCAL_COUNTER',
      policyRef: 'fixture:managed:v1',
      measure: (text) => ({
        policyRef: 'fixture:managed:v1',
        contentDigest: createHash('sha256').update(text).digest('hex'),
        outputTokens: 37,
      }),
    },
    authorize = () => {},
    never = async () => {
      throw Error('UNEXPECTED_TOOL_READ');
    },
    search = {
      limits: { maxResults: 20, maxDepth: 0, ...bytes },
      authorize,
      knowledgeQuery: never,
      tokenCounter,
    },
    selected = {
      selectedRefs: [],
      limits: { maxItems: 20, maxDepth: 0, ...bytes },
      authorize,
      knowledgeQuery: never,
      tokenCounter,
    };
  return {
    scope: { workspaceId: 'w', repositoryIds: ['r'] },
    business: {
      limits: { maxDepth: 5, maxSteps: 20, maxEdges: 20, ...bytes },
      authorize,
      knowledgeQuery: never,
      tokenCounter,
    },
    search,
    projectContext: selected,
    status: selected,
    symbol: { repositoryId: 'r', limits: graph, authorize, openCodeQuery: never, tokenCounter },
    code: {
      repositoryId: 'r',
      limits: { maxDepth: 5, ...graph },
      authorize,
      openCodeQuery: never,
      tokenCounter,
    },
    l1: search,
    structure: {
      repositoryId: 'r',
      limits: { maxDepth: 5, ...graph },
      authorize,
      openRuntimeQuery: never,
      tokenCounter,
    },
    l2: {
      repositoryId: 'r',
      limits: { maxDepth: 5, ...graph },
      authorize,
      openRuntimeQuery: never,
      tokenCounter,
    },
    limits: {
      maxMessageBytes: 4000000,
      maxConcurrentCalls: 4,
      maxItems: 1000000,
      maxDepth: 100,
      requestTimeoutMs: 10000,
    },
    lifecycle,
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
test('managed close joins late observer ownership without start-close deadlock', async (t) => {
  const entered = deferred(),
    gate = deferred();
  let closes = 0;
  const input = new PassThrough(),
    output = new PassThrough();
  output.resume();
  t.after(() => {
    input.destroy();
    output.destroy();
  });
  const app = host.createOwnedManagedReadToolsMcpServer(
    options({
      mode: 'MCP_STDIO',
      reconcile: async () => {},
      watch: async () => {
        entered.resolve();
        await gate.promise;
        return {
          close() {
            closes++;
          },
        };
      },
    }),
    { input, output },
  );
  const starting = app.start();
  void starting.catch(() => {});
  await entered.promise;
  let settled = false;
  const closing = app.close().then((r) => {
    settled = true;
    return r;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  gate.resolve();
  await assert.rejects(starting);
  assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
  assert.equal(closes, 1);
  assert.strictEqual(app.close(), app.close());
  assert.deepEqual(await app.completion, { cleanupState: 'SETTLED' });
});
test('managed host propagates observer cleanup UNKNOWN and disables restart', async (t) => {
  const input = new PassThrough(),
    output = new PassThrough();
  output.resume();
  t.after(() => {
    input.destroy();
    output.destroy();
  });
  let closes = 0;
  const app = host.createOwnedManagedReadToolsMcpServer(
    options({
      mode: 'MCP_STDIO',
      reconcile: async () => {},
      watch: async () => ({
        close() {
          closes++;
          throw Error('private cleanup failure');
        },
      }),
    }),
    { input, output },
  );
  await app.start();
  assert.equal(app.getLifecycleState().phase, 'READY');
  assert.deepEqual(await app.close(), { cleanupState: 'UNKNOWN' });
  assert.deepEqual(await app.completion, { cleanupState: 'UNKNOWN' });
  assert.equal(closes, 1);
  await assert.rejects(app.start());
});
test('managed host rejects lifecycle accessors before any callback', () => {
  let calls = 0;
  const x = options({
    mode: 'MCP_STDIO',
    reconcile: async () => {
      calls++;
    },
    watch: async () => ({ close() {} }),
  });
  Object.defineProperty(x.lifecycle, 'watch', {
    get() {
      calls++;
      throw Error('getter');
    },
    enumerable: true,
  });
  assert.throws(() =>
    host.createOwnedManagedReadToolsMcpServer(x, {
      input: new PassThrough(),
      output: new PassThrough(),
    }),
  );
  assert.equal(calls, 0);
});
