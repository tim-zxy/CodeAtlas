import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as runtime from '../../../packages/runtime/dist/index.js';
test('owned-only OS observer adapter exists', () =>
  assert.equal(typeof runtime.createOwnedDirectoryObserver, 'function'));
for (const mode of ['managed-os', 'managed-os-event'])
  test('actual fresh-owned OS observer feeds managed SDK ' + mode, { timeout: 30000 }, async () => {
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
    const client = new Client({ name: 'owned-os-observer-client', version: '1' });
    try {
      await client.connect(transport);
      const seed = await seedPromise;
      assert.match(text, /OWNED_OS_OBSERVER_ATTACHED/);
      assert.match(text, /RECONCILE_DONE POST_ATTACH/);
      const r = await client.callTool({
        name: 'trace_flow',
        arguments: {
          version: 3,
          kind: 'EXECUTION',
          expectedActivationId: seed.activationId,
          expectedRevisionId: seed.revisionId,
          startRef: { kind: 'EXECUTION_NODE', id: seed.executionNodeId },
          direction: 'FORWARD',
          budget: {
            maxDepth: 4,
            maxNodes: 20,
            maxEdges: 20,
            maxMetadataRows: 1000000,
            maxOutputBytes: 1000000,
            maxTokens: 1000,
          },
        },
      });
      if (mode === 'managed-os-event') {
        assert.equal(r.isError, true, JSON.stringify(r));
        assert.equal(r.structuredContent.error.code, 'CONTEXT_UNAVAILABLE');
        assert.match(text, /OWNED_OS_EVENT_SEEN/);
        assert.match(text, /RECONCILE_DONE (CHANGE|OVERFLOW)/);
      } else {
        assert.equal(r.isError, false, JSON.stringify(r));
        assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
        assert.equal(r.structuredContent.data.engineeringResult.activationId, seed.activationId);
      }
      assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
    } finally {
      await client.close();
    }
  });
