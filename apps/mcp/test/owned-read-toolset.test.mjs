import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../dist/owned-business-stdio.js';
test('owned three-tool stdio composition factory is available', () =>
  assert.equal(typeof service.createOwnedReadToolsMcpServer, 'function'));

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const flow = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
).subjects.find((x) => x.name === 'BUSINESS_FLOW').existing;
const argumentsByName = {
  trace_flow: {
    version: 1,
    kind: 'BUSINESS',
    startRef: {
      kind: 'KNOWLEDGE_ITEM',
      id: flow.itemEnvelope.payload.id,
      revisionId: flow.revisionEnvelope.payload.id,
    },
    startStepKey: 'accept',
    direction: 'FORWARD',
    budget: { maxDepth: 20, maxSteps: 20, maxEdges: 20, maxOutputBytes: 1000000, maxTokens: 1000 },
  },
  search_knowledge: {
    version: 1,
    mode: 'LEXICAL_PHRASE',
    text: 'Matched contract',
    scope: 'WORKSPACE',
    filters: { types: ['INTEGRATION'] },
    page: { limit: 1, cursor: null },
    budget: { maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
  },
  get_project_context: {
    version: 1,
    depth: 'L0',
    budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
  },
};
for (const mode of ['normal', 'mutate-scope'])
  test(
    'one official SDK process executes all three unchanged contracts with no startup read: ' + mode,
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('./owned-read-toolset.fixture.mjs', import.meta.url)), mode],
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
      const client = new Client({ name: 'owned-three-tools-test', version: '1' });
      try {
        await client.connect(transport);
        const list = await client.listTools();
        assert.deepEqual(
          list.tools.map((t) => t.name),
          ['trace_flow', 'search_knowledge', 'get_project_context'],
        );
        assert.ok(list.tools[0].inputSchema.anyOf);
        assert.equal(list.tools[1].inputSchema.properties.mode.const, 'LEXICAL_PHRASE');
        assert.equal(list.tools[2].inputSchema.properties.depth.const, 'L0');
        for (const [name, args] of Object.entries(argumentsByName)) {
          const r = await client.callTool({ name, arguments: args });
          assert.equal(r.isError, false, JSON.stringify(r));
          assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
          assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
          if (name === 'trace_flow') assert.equal(r.structuredContent.data.kind, 'BUSINESS');
          if (name === 'search_knowledge') assert.equal(r.structuredContent.data.results.length, 1);
          if (name === 'get_project_context') {
            assert.equal(r.structuredContent.data.projectCompleteness, 'NOT_ASSESSED');
            assert.equal(r.structuredContent.data.status, 'PARTIAL');
          }
          const bad = await client.callTool({
            name,
            arguments: { ...args, workspaceId: 'foreign' },
          });
          assert.equal(bad.structuredContent.error.code, 'INVALID_INPUT');
          const small = await client.callTool({
            name,
            arguments: { ...args, budget: { ...args.budget, maxTokens: 36 } },
          });
          assert.equal(small.structuredContent.error.code, 'BUDGET_EXCEEDED');
        }
        for (const name of ['get_knowledge_status', 'understand_symbol', 'update_knowledge'])
          await assert.rejects(client.callTool({ name, arguments: {} }), (e) => e.code === -32601);
        assert.match(stderr, /OWNED_GROUP_NO_STARTUP_READ/);
      } finally {
        await client.close();
      }
    },
  );
test('single scope constructor rejects per-tool scope override and accessor ports before any read', async () => {
  let reads = 0;
  const author = () => {};
  const query = async () => {
    reads++;
    return null;
  };
  const base = {
    scope: { workspaceId: 'w', repositoryIds: ['r'] },
    business: {
      limits: argumentsByName.trace_flow.budget,
      authorize: author,
      knowledgeQuery: query,
    },
    search: {
      limits: { ...argumentsByName.search_knowledge.budget, maxResults: 10 },
      authorize: author,
      knowledgeQuery: query,
    },
    projectContext: {
      limits: argumentsByName.get_project_context.budget,
      selectedRefs: [],
      authorize: author,
      knowledgeQuery: query,
    },
    limits: {
      maxMessageBytes: 4000000,
      maxConcurrentCalls: 4,
      maxItems: 10000,
      maxDepth: 100,
      requestTimeoutMs: 1000,
    },
  };
  for (const tool of ['business', 'search', 'projectContext']) {
    assert.throws(
      () =>
        service.createOwnedReadToolsMcpServer(
          { ...base, [tool]: { ...base[tool], workspaceId: 'foreign' } },
          { input: new PassThrough(), output: new PassThrough() },
        ),
      /INVALID_OWNED_STDIO_OPTIONS/,
    );
    assert.throws(
      () =>
        service.createOwnedReadToolsMcpServer(
          { ...base, [tool]: { ...base[tool], repositoryIds: ['other'] } },
          { input: new PassThrough(), output: new PassThrough() },
        ),
      /INVALID_OWNED_STDIO_OPTIONS/,
    );
  }
  const ports = { ...base.search };
  Object.defineProperty(ports, 'authorize', {
    enumerable: true,
    get() {
      throw Error('GETTER_EXECUTED');
    },
  });
  assert.throws(
    () =>
      service.createOwnedReadToolsMcpServer(
        { ...base, search: ports },
        { input: new PassThrough(), output: new PassThrough() },
      ),
    /INVALID_OWNED_STDIO_OPTIONS/,
  );
  const server = service.createOwnedReadToolsMcpServer(base, {
    input: new PassThrough(),
    output: new PassThrough(),
  });
  assert.equal(reads, 0);
  assert.equal((await server.close()).cleanupState, 'SETTLED');
  assert.equal(reads, 0);
});

test('group shutdown joins ignoring pending reads from different tools before settling', async () => {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  let entered = 0,
    enter;
  const both = new Promise((r) => (enter = r)),
    releases = [];
  const query = () => async () => {
    if (++entered === 2) enter();
    await new Promise((r) => releases.push(r));
    return null;
  };
  const counter = {
    kind: 'EXACT_LOCAL_COUNTER',
    policyRef: 'fixture:group-only',
    measure: () => {
      throw Error('NOT_REACHED');
    },
  };
  const up = new PassThrough(),
    down = new PassThrough();
  const app = service.createOwnedReadToolsMcpServer(
    {
      scope: { workspaceId: 'w', repositoryIds: ['r'] },
      business: {
        limits: argumentsByName.trace_flow.budget,
        authorize() {},
        knowledgeQuery: query(),
        tokenCounter: counter,
      },
      search: {
        limits: { ...argumentsByName.search_knowledge.budget, maxResults: 10 },
        authorize() {},
        knowledgeQuery: query(),
        tokenCounter: counter,
      },
      projectContext: {
        limits: argumentsByName.get_project_context.budget,
        selectedRefs: [],
        authorize() {},
        knowledgeQuery: async () => null,
        tokenCounter: counter,
      },
      limits: {
        maxMessageBytes: 4000000,
        maxConcurrentCalls: 4,
        maxItems: 1000000,
        maxDepth: 100,
        requestTimeoutMs: 10000,
      },
    },
    { input: up, output: down },
  );
  const client = new Client({ name: 'owned-group-join', version: '1' });
  await app.start();
  try {
    await client.connect(new StdioServerTransport(down, up, { maxBufferSize: 4000000 }));
    const requests = ['trace_flow', 'search_knowledge'].map((name) =>
      client.callTool({ name, arguments: argumentsByName[name] }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      ),
    );
    await both;
    let completed = false;
    const closing = app.close().then((r) => {
      completed = true;
      return r;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(completed, false);
    releases[0]();
    await new Promise((r) => setImmediate(r));
    assert.equal(completed, false);
    releases[1]();
    assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
    assert.strictEqual(app.close(), app.close());
    await client.close();
    for (const result of await Promise.all(requests)) {
      assert.ok(result.error || result.value?.isError);
      if (result.error) assert.equal(result.error.code, -32000);
    }
  } finally {
    for (const r of releases) r();
    await client.close();
    await app.close();
    up.destroy();
    down.destroy();
  }
});
