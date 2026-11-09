import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { input } from '../../../packages/agent-api/test/helpers/knowledge-search-fixture.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('official SDK discovers and calls actual SQLite owned first-page search without opening other tools', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./owned-knowledge-search.fixture.mjs', import.meta.url))],
    stderr: 'pipe',
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
    assert.ok(err.length < 20000);
  });
  const client = new Client({ name: 'owned-search-test', version: '1' });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.deepEqual(
      list.tools.map((t) => t.name),
      ['search_knowledge'],
    );
    assert.equal(list.tools[0].inputSchema.additionalProperties, false);
    const r = await client.callTool({ name: 'search_knowledge', arguments: input });
    assert.equal(r.isError, false, JSON.stringify(r));
    assert.equal(r.structuredContent.data.results.length, 1);
    assert.equal(r.structuredContent.data.results[0].type, 'INTEGRATION');
    assert.equal(r.structuredContent.data.page.hasMore, true);
    assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
    const denied = await client.callTool({
      name: 'search_knowledge',
      arguments: { ...input, scope: 'ALL' },
    });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error.code, 'INVALID_INPUT');
    await assert.rejects(
      client.callTool({ name: 'update_knowledge', arguments: {} }),
      (e) => e.code === -32601,
    );
  } finally {
    await client.close();
  }
});
