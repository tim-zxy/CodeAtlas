import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { input } from '../../../packages/agent-api/test/helpers/project-context-fixture.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('official SDK exposes only limited selected L0 context and refuses deeper/other tools', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./owned-project-context.fixture.mjs', import.meta.url))],
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
  const client = new Client({ name: 'owned-l0-test', version: '1' });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.deepEqual(
      list.tools.map((t) => t.name),
      ['get_project_context'],
    );
    assert.equal(list.tools[0].inputSchema.properties.depth.const, 'L0');
    const r = await client.callTool({
      name: 'get_project_context',
      arguments: { ...input, budget: { ...input.budget, maxItems: 1 } },
    });
    assert.equal(r.isError, false, JSON.stringify(r));
    assert.equal(r.structuredContent.data.status, 'PARTIAL');
    assert.equal(r.structuredContent.data.projectCompleteness, 'NOT_ASSESSED');
    assert.equal(r.structuredContent.data.coverageScope, 'EXPLICIT_SELECTION_ONLY');
    assert.equal(r.structuredContent.data.items.length, 1);
    assert.equal(r.structuredContent.data.omittedRefs.length, 1);
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
    const invalid = await client.callTool({
      name: 'get_project_context',
      arguments: { ...input, depth: 'L1' },
    });
    assert.equal(invalid.structuredContent.error.code, 'INVALID_INPUT');
    await assert.rejects(
      client.callTool({ name: 'search_knowledge', arguments: {} }),
      (e) => e.code === -32601,
    );
  } finally {
    await client.close();
  }
});
