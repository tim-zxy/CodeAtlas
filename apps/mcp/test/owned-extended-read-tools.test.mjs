import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const code = {
  version: 2,
  kind: 'CODE',
  direction: 'OUTGOING_CALLS',
  symbolId: 'query-node-root',
  expectedRevisionId: 'query-revision',
  budget: {
    maxDepth: 3,
    maxNodes: 50,
    maxEdges: 50,
    maxMetadataRows: 10000,
    maxOutputBytes: 1000000,
    maxTokens: 1000,
  },
};
const l1 = {
  version: 2,
  depth: 'L1',
  query: { mode: 'LEXICAL_PHRASE', text: 'Matched contract', filters: { types: ['INTEGRATION'] } },
  budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
};
for (const mode of ['extended', 'extended-mutate-scope'])
  test('versioned five-tool SDK retains both new and old routes ' + mode, async () => {
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
    let stderr = '';
    transport.stderr.on('data', (b) => {
      stderr += b;
      assert.ok(stderr.length < 30000);
    });
    const client = new Client({ name: 'extended-read-test', version: '1' });
    try {
      await client.connect(transport);
      const list = await client.listTools();
      assert.equal(list.tools.length, 5);
      for (const name of ['trace_flow', 'get_project_context'])
        assert.equal(list.tools.find((t) => t.name === name).inputSchema.anyOf.length, 2);
      for (const [name, args] of [
        ['trace_flow', code],
        ['get_project_context', l1],
      ]) {
        const r = await client.callTool({ name, arguments: args });
        assert.equal(r.isError, false, JSON.stringify(r));
        assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
        assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
        if (name === 'trace_flow') {
          assert.equal(r.structuredContent.data.relationshipSemantics, 'STATIC_CALLS_NOT_RUNTIME');
          assert.equal(r.structuredContent.data.engineeringResult.payload.operation, 'CODE_TRACE');
          assert.ok(r.structuredContent.data.engineeringResult.payload.edges.length > 0);
        } else {
          assert.equal(r.structuredContent.data.projectCompleteness, 'NOT_ASSESSED');
          assert.equal(r.structuredContent.data.selectionBasis, 'EXPLICIT_LEXICAL_QUERY');
          assert.equal(r.structuredContent.data.results.length, 1);
        }
        const tiny = await client.callTool({
          name,
          arguments: { ...args, budget: { ...args.budget, maxTokens: 36 } },
        });
        assert.equal(tiny.structuredContent.error.code, 'BUDGET_EXCEEDED');
        const invalid = await client.callTool({
          name,
          arguments: { ...args, databasePath: 'foreign' },
        });
        assert.equal(invalid.structuredContent.error.code, 'INVALID_INPUT');
      }
      const old = await client.callTool({
        name: 'get_project_context',
        arguments: { version: 1, depth: 'L0', budget: l1.budget },
      });
      assert.equal(old.isError, false, JSON.stringify(old));
      assert.equal(old.structuredContent.data.depth, 'L0');
      const unsupported = await client.callTool({
        name: 'trace_flow',
        arguments: { version: 1, kind: 'CODE' },
      });
      assert.equal(unsupported.structuredContent.error.code, 'FEATURE_UNAVAILABLE');
      const mismatch = await client.callTool({
        name: 'trace_flow',
        arguments: { ...code, expectedRevisionId: 'other' },
      });
      assert.equal(mismatch.structuredContent.error.code, 'REVISION_MISMATCH');
      const symbol = await client.callTool({
        name: 'understand_symbol',
        arguments: {
          version: 1,
          mode: 'STORED_CODE',
          symbolId: code.symbolId,
          expectedRevisionId: code.expectedRevisionId,
          budget: {
            maxNodes: 50,
            maxEdges: 50,
            maxMetadataRows: 10000,
            maxOutputBytes: 1000000,
            maxTokens: 1000,
          },
        },
      });
      assert.equal(symbol.isError, false, JSON.stringify(symbol));
      await assert.rejects(
        client.callTool({ name: 'update_knowledge', arguments: {} }),
        (e) => e.code === -32601,
      );
      assert.match(stderr, /NO_STARTUP_READ/);
    } finally {
      await client.close();
    }
  });

for (const hold of ['l1', 'code'])
  test('SDK concurrency refusal uses requested v2 failure contract: ' + hold, async () => {
    const { codeTraceResponseSchema, projectL1ResponseSchema } =
      await import('../../../packages/agent-api/dist/index.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(new URL('./owned-five-read-tools.fixture.mjs', import.meta.url)),
        'extended-hold-' + hold,
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
    let mark;
    const started = new Promise((r) => (mark = r));
    let text = '';
    transport.stderr.on('data', (b) => {
      text += b;
      if (text.includes('HELD_QUERY_STARTED')) mark();
    });
    const client = new Client({ name: 'v2-errors', version: '1' });
    try {
      await client.connect(transport);
      const held = client.callTool({
        name: hold === 'l1' ? 'get_project_context' : 'trace_flow',
        arguments: hold === 'l1' ? l1 : code,
      });
      void held.catch(() => {});
      await started;
      const blocked = await client.callTool({
        name: hold === 'l1' ? 'trace_flow' : 'get_project_context',
        arguments: hold === 'l1' ? code : l1,
      });
      assert.equal(blocked.structuredContent.error.code, 'BUDGET_EXCEEDED');
      assert.equal(
        (hold === 'l1' ? codeTraceResponseSchema : projectL1ResponseSchema).safeParse(
          blocked.structuredContent,
        ).success,
        true,
        JSON.stringify(blocked),
      );
      assert.equal((await held).isError, false);
    } finally {
      await client.close();
    }
  });
