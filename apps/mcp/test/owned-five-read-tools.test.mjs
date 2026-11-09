import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const argsByTool = {
  get_knowledge_status: {
    version: 1,
    mode: 'SELECTED_PUBLISHED',
    budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
  },
  understand_symbol: {
    version: 1,
    mode: 'STORED_CODE',
    symbolId: 'query-node-root',
    expectedRevisionId: 'query-revision',
    budget: {
      maxNodes: 50,
      maxEdges: 50,
      maxMetadataRows: 10000,
      maxOutputBytes: 1000000,
      maxTokens: 1000,
    },
  },
};
for (const mode of ['normal', 'mutate-scope'])
  test(
    'five genuine read tools retain single scope, strict status/symbol and closed update: ' + mode,
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          fileURLToPath(new URL('./owned-five-read-tools.fixture.mjs', import.meta.url)),
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
      let err = '';
      transport.stderr.on('data', (b) => {
        err += b;
        assert.ok(err.length < 30000);
      });
      const client = new Client({ name: 'owned-five-test', version: '1' });
      try {
        await client.connect(transport);
        const list = await client.listTools();
        assert.deepEqual(
          list.tools.map((t) => t.name),
          [
            'trace_flow',
            'search_knowledge',
            'get_project_context',
            'get_knowledge_status',
            'understand_symbol',
          ],
        );
        for (const [name, args] of Object.entries(argsByTool)) {
          const r = await client.callTool({ name, arguments: args });
          assert.equal(r.isError, false, JSON.stringify(r));
          assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
          assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
          if (name === 'get_knowledge_status') {
            assert.deepEqual(r.structuredContent.data.providerHealth, {
              availability: 'NOT_OBSERVED',
              value: null,
            });
            assert.deepEqual(r.structuredContent.data.compilationRuns, {
              availability: 'UNAVAILABLE',
              value: null,
            });
            assert.equal(r.structuredContent.data.wholeProjectStatus, 'NOT_ASSESSED');
            assert.equal(r.structuredContent.data.items[0].title, undefined);
          } else {
            assert.equal(
              r.structuredContent.data.engineeringResult.payload.symbol.id,
              args.symbolId,
            );
            assert.equal(
              r.structuredContent.data.engineeringResult.payload.freshness.state,
              'CURRENT',
            );
            assert.equal(r.structuredContent.meta.sourceFreshness, null);
            assert.deepEqual(r.structuredContent.data.entryRuntimeRelevance, {
              availability: 'NOT_EVALUATED',
              value: null,
            });
          }
          const small = await client.callTool({
            name,
            arguments: { ...args, budget: { ...args.budget, maxTokens: 36 } },
          });
          assert.equal(small.structuredContent.error.code, 'BUDGET_EXCEEDED');
          const bad = await client.callTool({
            name,
            arguments: { ...args, databasePath: 'forbidden' },
          });
          assert.equal(bad.structuredContent.error.code, 'INVALID_INPUT');
        }
        const mismatch = await client.callTool({
          name: 'understand_symbol',
          arguments: { ...argsByTool.understand_symbol, expectedRevisionId: 'other' },
        });
        assert.equal(mismatch.structuredContent.error.code, 'REVISION_MISMATCH');
        await assert.rejects(
          client.callTool({ name: 'update_knowledge', arguments: {} }),
          (e) => e.code === -32601,
        );
        assert.match(err, /OWNED_GROUP_NO_STARTUP_READ/);
      } finally {
        await client.close();
      }
    },
  );

test('SDK waits symbol invalidation and reports UNKNOWN on asynchronous cleanup failure', async () => {
  const { PassThrough } = await import('node:stream');
  const { createOwnedSymbolUnderstandingMcpServer } =
    await import('../dist/owned-business-stdio.js');
  let release;
  const gate = new Promise((r) => (release = r)),
    invalidation = gate.then(() => {
      throw Error('OWNED_CLEANUP_UNKNOWN');
    });
  void invalidation.catch(() => {});
  const input = new PassThrough(),
    output = new PassThrough();
  const app = createOwnedSymbolUnderstandingMcpServer(
    {
      session: {
        context: {},
        descriptor: {},
        execute: async () => ({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'unused' } }),
        close: () => invalidation,
      },
      limits: {
        maxMessageBytes: 4000000,
        maxConcurrentCalls: 2,
        maxItems: 100000,
        maxDepth: 100,
        requestTimeoutMs: 10000,
      },
    },
    { input, output },
  );
  let settled = false;
  const closing = app.close().then((r) => {
    settled = true;
    return r;
  });
  try {
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false);
    release();
    assert.deepEqual(await closing, { cleanupState: 'UNKNOWN' });
    assert.strictEqual(app.close(), app.close());
  } finally {
    release();
    await app.close();
    input.destroy();
    output.destroy();
  }
});
