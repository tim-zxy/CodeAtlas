import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  storedStructureResponseSchema,
  projectL2ResponseSchema,
} from '../../../packages/agent-api/dist/index.js';
const budget = {
  maxDepth: 5,
  maxNodes: 20,
  maxEdges: 20,
  maxMetadataRows: 1000000,
  maxOutputBytes: 1000000,
  maxTokens: 1000,
};
const request = (seed, kind = 'EXECUTION') => ({
  version: 3,
  kind,
  expectedActivationId: seed.activationId,
  expectedRevisionId: seed.revisionId,
  startRef:
    kind === 'EXECUTION'
      ? { kind: 'EXECUTION_NODE', id: seed.executionNodeId }
      : { kind: 'RUNTIME_FLOW', id: seed.flowId, stepKey: seed.stepKey },
  direction: 'FORWARD',
  budget,
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
  let text = '',
    seedResolve,
    holdResolve;
  const seedPromise = new Promise((r) => (seedResolve = r)),
    held = new Promise((r) => (holdResolve = r));
  transport.stderr.on('data', (b) => {
    text += b;
    assert.ok(text.length < 40000);
    const match = text.match(/STRUCTURE_SEED (\{[^\n]+\})/);
    if (match) seedResolve(JSON.parse(match[1]));
    if (text.includes('HELD_QUERY_STARTED')) holdResolve();
  });
  const client = new Client({ name: 'owned-structure-client', version: '1' });
  try {
    await client.connect(transport);
    await body({ client, seed: await seedPromise, held, text: () => text });
  } finally {
    await client.close();
  }
}
for (const mode of ['structure', 'structure-mutate-scope'])
  test(
    'genuine SDK stored EXECUTION/RUNTIME + L2 retains old versions and captured scope: ' + mode,
    async () =>
      withClient(mode, async ({ client, seed, text }) => {
        const tools = await client.listTools();
        assert.equal(tools.tools.length, 5);
        assert.equal(tools.tools.find((t) => t.name === 'trace_flow').inputSchema.anyOf.length, 2);
        for (const kind of ['EXECUTION', 'RUNTIME']) {
          const req = request(seed, kind);
          for (const name of ['trace_flow', 'get_project_context']) {
            const { version, budget, ...selection } = req;
            const args =
              name === 'trace_flow' ? req : { version: 3, depth: 'L2', selection, budget };
            const r = await client.callTool({ name, arguments: args });
            assert.equal(r.isError, false, JSON.stringify(r));
            assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
            assert.equal(
              r.structuredContent.data.engineeringResult.relationshipSemantics,
              'STORED_DERIVED_NOT_OBSERVED_EXECUTION',
            );
            assert.equal(
              r.structuredContent.data.engineeringResult.activationId,
              seed.activationId,
            );
            assert.equal(r.structuredContent.data.productionQuery, 'NOT_AUTHORIZED');
            if (name === 'get_project_context')
              assert.equal(r.structuredContent.data.projectCompleteness, 'NOT_ASSESSED');
            const small = await client.callTool({
              name,
              arguments: { ...args, budget: { ...budget, maxTokens: 36 } },
            });
            assert.equal(small.structuredContent.error.code, 'BUDGET_EXCEEDED');
            assert.equal(
              (name === 'trace_flow'
                ? storedStructureResponseSchema
                : projectL2ResponseSchema
              ).safeParse(small.structuredContent).success,
              true,
            );
          }
        }
        const bad = await client.callTool({
          name: 'trace_flow',
          arguments: { ...request(seed), expectedActivationId: 'wrong' },
        });
        assert.equal(bad.structuredContent.error.code, 'ACTIVATION_MISMATCH');
        const unknown = await client.callTool({
          name: 'trace_flow',
          arguments: { ...request(seed), databasePath: 'forbidden' },
        });
        assert.equal(unknown.structuredContent.error.code, 'INVALID_INPUT');
        for (const kind of ['EXECUTION', 'RUNTIME'])
          assert.equal(
            (await client.callTool({ name: 'trace_flow', arguments: { version: 1, kind } }))
              .structuredContent.error.code,
            'FEATURE_UNAVAILABLE',
          );
        const oldCode = await client.callTool({
          name: 'trace_flow',
          arguments: {
            version: 2,
            kind: 'CODE',
            symbolId: 'query-node-root',
            expectedRevisionId: 'query-revision',
            direction: 'OUTGOING_CALLS',
            budget: {
              maxDepth: 3,
              maxNodes: 50,
              maxEdges: 50,
              maxMetadataRows: 10000,
              maxOutputBytes: 1000000,
              maxTokens: 1000,
            },
          },
        });
        assert.equal(oldCode.isError, false, JSON.stringify(oldCode));
        assert.equal(
          oldCode.structuredContent.data.relationshipSemantics,
          'STATIC_CALLS_NOT_RUNTIME',
        );
        const oldL1 = await client.callTool({
          name: 'get_project_context',
          arguments: {
            version: 2,
            depth: 'L1',
            query: {
              mode: 'LEXICAL_PHRASE',
              text: 'Matched contract',
              filters: { types: ['INTEGRATION'] },
            },
            budget: { maxItems: 1, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
          },
        });
        assert.equal(oldL1.isError, false, JSON.stringify(oldL1));
        assert.equal(oldL1.structuredContent.data.depth, 'L1');
        await assert.rejects(
          client.callTool({ name: 'update_knowledge', arguments: {} }),
          (e) => e.code === -32601,
        );
        assert.match(text(), /NO_STARTUP_READ/);
      }),
  );
test('v3 host concurrency refusal uses its exact shared error contract', async () =>
  withClient('structure-hold', async ({ client, seed, held }) => {
    const running = client.callTool({ name: 'trace_flow', arguments: request(seed) });
    void running.catch(() => {});
    await held;
    const { version, budget, ...selection } = request(seed, 'RUNTIME');
    const denied = await client.callTool({
      name: 'get_project_context',
      arguments: { version: 3, depth: 'L2', selection, budget },
    });
    assert.equal(denied.structuredContent.error.code, 'BUDGET_EXCEEDED');
    assert.equal(projectL2ResponseSchema.safeParse(denied.structuredContent).success, true);
    assert.equal((await running).isError, false);
  }));
