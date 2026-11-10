import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
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
