import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const service = await import('../dist/owned-business-stdio.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
test('owned MCP server module exposes the bounded SDK integration', () =>
  assert.equal(typeof service.createOwnedBusinessTraceMcpServer, 'function'));
const expected = JSON.parse(
  readFileSync(
    new URL('../../../packages/agent-api/test/business-trace.expected.json', import.meta.url),
    'utf8',
  ),
);
const input = {
  version: 1,
  kind: 'BUSINESS',
  startRef: expected.data.startRef,
  startStepKey: 'accept',
  direction: 'FORWARD',
  budget: { maxDepth: 20, maxSteps: 20, maxEdges: 20, maxOutputBytes: 1000000, maxTokens: 1000 },
};
async function connect(mode = 'normal') {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./owned-business-stdio.fixture.mjs', import.meta.url)), mode],
    stderr: 'pipe',
    maxBufferSize: 2000000,
    env: {
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PATH: process.env.PATH,
    },
  });
  let stderr = '';
  transport.stderr.on('data', (b) => {
    stderr += b.toString();
    assert.ok(stderr.length < 20000);
  });
  const client = new Client({ name: 'owned-codeatlas-test', version: '1' });
  await client.connect(transport);
  return { client, transport, stderr: () => stderr };
}
async function close(x) {
  await x.client.close();
}
test('official SDK stdio preserves exact request/output union and published BUSINESS fixture', async () => {
  const x = await connect();
  try {
    const list = await x.client.listTools();
    assert.deepEqual(
      list.tools.map((t) => t.name),
      ['trace_flow'],
    );
    assert.equal(list.tools[0].inputSchema.type, 'object');
    assert.ok(list.tools[0].inputSchema.anyOf);
    assert.ok(list.tools[0].outputSchema.anyOf);
    const r = await x.client.callTool({ name: 'trace_flow', arguments: input });
    assert.equal(r.isError, false);
    assert.deepEqual(r.structuredContent, expected);
    assert.deepEqual(JSON.parse(r.content[0].text), expected);
  } finally {
    await close(x);
  }
});
test('unsupported kinds, unknown tools and caller authority do not become data', async () => {
  const x = await connect();
  try {
    for (const kind of ['CODE', 'EXECUTION', 'RUNTIME']) {
      const r = await x.client.callTool({ name: 'trace_flow', arguments: { version: 1, kind } });
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error.code, 'FEATURE_UNAVAILABLE');
    }
    const r = await x.client.callTool({
      name: 'trace_flow',
      arguments: { ...input, workspaceId: 'foreign', permissionContext: { approved: true } },
    });
    assert.equal(r.structuredContent.error.code, 'INVALID_INPUT');
    await assert.rejects(
      x.client.callTool({ name: 'update_knowledge', arguments: {} }),
      (e) => e.code === -32601,
    );
  } finally {
    await close(x);
  }
});
test('missing exact counter and denied authorization remain typed failures', async () => {
  for (const [mode, code] of [
    ['no-counter', 'TOKEN_COUNTER_UNAVAILABLE'],
    ['denied', 'PERMISSION_DENIED'],
  ]) {
    const x = await connect(mode);
    try {
      const r = await x.client.callTool({ name: 'trace_flow', arguments: input });
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error.code, code);
      assert.doesNotMatch(JSON.stringify(r), /SECRET|private-path/);
    } finally {
      await close(x);
    }
  }
});
test('deadline and complete output token budget survive SDK wrapping', async () => {
  for (const [mode, args, code] of [
    ['deadline', input, 'DEADLINE'],
    ['normal', { ...input, budget: { ...input.budget, maxTokens: 1 } }, 'BUDGET_EXCEEDED'],
  ]) {
    const x = await connect(mode);
    try {
      const r = await x.client.callTool({ name: 'trace_flow', arguments: args });
      assert.equal(r.structuredContent.error.code, code);
    } finally {
      await close(x);
    }
  }
});
test('in-flight limit refuses excess calls and cancellation cannot deliver success', async () => {
  const x = await connect('slow');
  try {
    const first = x.client.callTool({ name: 'trace_flow', arguments: input });
    const second = await x.client.callTool({ name: 'trace_flow', arguments: input });
    assert.equal(second.structuredContent.error.code, 'BUDGET_EXCEEDED');
    assert.equal((await first).isError, false);
    const controller = new AbortController();
    const pending = x.client.callTool({ name: 'trace_flow', arguments: input }, undefined, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending);
  } finally {
    await close(x);
  }
});
test('oversized inbound/outbound SDK messages close without partial successful data', async () => {
  for (const [mode, args] of [
    ['small-input', { ...input, extra: 'x'.repeat(5000) }],
    ['small-output', input],
  ]) {
    const x = await connect(mode);
    try {
      await assert.rejects(
        x.client.callTool({ name: 'trace_flow', arguments: args }, undefined, { timeout: 3000 }),
      );
    } finally {
      await close(x);
    }
  }
});

test('shutdown completion joins an ignoring query and invalidates the exact session', async () => {
  const { PassThrough } = await import('node:stream');
  const { createHash } = await import('node:crypto');
  const { createOwnedBusinessTraceSession } = await import('@codeatlas/agent-api');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const vector = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
      'utf8',
    ),
  ).subjects.find((x) => x.name === 'BUSINESS_FLOW');
  const existing = structuredClone(vector.existing),
    revision = existing.revisionEnvelope.payload,
    ref = { itemId: existing.itemEnvelope.payload.id, revisionId: revision.id };
  const canonical = (v) =>
    Array.isArray(v)
      ? '[' + v.map(canonical).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v);
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const data = {
    kind: 'OWNED_TEST_PUBLICATION',
    workspaceId: 'workspace:one',
    selectionDigest: sha(
      'codeatlas.offline-knowledge.selection.v1\0' +
        canonical({ workspaceId: 'workspace:one', refs: [ref] }),
    ),
    records: [
      {
        itemEnvelope: existing.itemEnvelope,
        revisionEnvelope: existing.revisionEnvelope,
        referenceContext: existing.referenceContext,
        coverage: vector.candidate.candidateEnvelope.payload.coverage,
        provenance: expected.data.provenance,
        currentHeadRevisionId: revision.id,
        isCurrentHead: true,
        warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
      },
    ],
    productionQuery: 'NOT_AUTHORIZED',
    quality: 'NOT_EVALUABLE',
  };
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    hold = new Promise((r) => (release = r));
  const session = createOwnedBusinessTraceSession({
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    limits: input.budget,
    authorize() {},
    knowledgeQuery: async () => {
      enter();
      await hold;
      return data;
    },
    tokenCounter: {
      kind: 'EXACT_LOCAL_COUNTER',
      policyRef: 'owned:test',
      measure: (s) => ({ policyRef: 'owned:test', contentDigest: sha(s), outputTokens: 37 }),
    },
  });
  const up = new PassThrough(),
    down = new PassThrough();
  const app = service.createOwnedBusinessTraceMcpServer(
    {
      session,
      limits: {
        maxMessageBytes: 2000000,
        maxConcurrentCalls: 1,
        maxItems: 1000000,
        maxDepth: 100,
        requestTimeoutMs: 10000,
      },
    },
    { input: up, output: down },
  );
  const client = new Client({ name: 'join-test', version: '1' });
  await app.start();
  try {
    await client.connect(new StdioServerTransport(down, up, { maxBufferSize: 2000000 }));
    const request = client.callTool({ name: 'trace_flow', arguments: input }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await entered;
    let completed = false;
    const closing = app.close().then((value) => {
      completed = true;
      return value;
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(completed, false);
    release();
    assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
    assert.deepEqual(await app.completion, { cleanupState: 'SETTLED' });
    await client.close();
    const outcome = await request;
    assert.ok(outcome.error || outcome.value?.isError);
    if (outcome.error) assert.equal(outcome.error.code, -32000); // SDK ConnectionClosed, never timeout.
    await assert.rejects(app.start(), /ALREADY_STARTED_OR_CLOSED/);
    assert.strictEqual(app.close(), app.close());
  } finally {
    release();
    await client.close();
    await app.close();
    up.destroy();
    down.destroy();
  }
});
test('invalid explicit host limits are rejected without opening stdio', async () => {
  const { PassThrough } = await import('node:stream');
  const streams = { input: new PassThrough(), output: new PassThrough() };
  const session = { context: {}, descriptor: {}, execute: async () => ({}), close() {} };
  const limits = {
    maxMessageBytes: 1000,
    maxConcurrentCalls: 1,
    maxItems: 100,
    maxDepth: 10,
    requestTimeoutMs: 1000,
  };
  try {
    for (const key of Object.keys(limits))
      for (const n of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
        assert.throws(
          () =>
            service.createOwnedBusinessTraceMcpServer(
              { session, limits: { ...limits, [key]: n } },
              streams,
            ),
          /INVALID_OWNED_STDIO_OPTIONS/,
        );
  } finally {
    streams.input.destroy();
    streams.output.destroy();
  }
});

test('shutdown does not claim settlement while an SDK output write remains backpressured', async () => {
  const { PassThrough, Writable } = await import('node:stream');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const up = new PassThrough(),
    down = new PassThrough();
  let release, enter;
  const entered = new Promise((r) => (enter = r));
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      let called = false;
      release = () => {
        if (called) return;
        called = true;
        down.write(chunk);
        callback();
      };
      enter();
    },
  });
  const session = {
    context: {},
    descriptor: {},
    execute: async () => ({
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'The required published read provider is unavailable.',
      },
    }),
    close() {},
  };
  const app = service.createOwnedBusinessTraceMcpServer(
    {
      session,
      limits: {
        maxMessageBytes: 2000000,
        maxConcurrentCalls: 1,
        maxItems: 100000,
        maxDepth: 100,
        requestTimeoutMs: 1000,
      },
    },
    { input: up, output },
  );
  const client = new Client({ name: 'backpressure', version: '1' });
  await app.start();
  const connected = client.connect(new StdioServerTransport(down, up), { timeout: 2000 }).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  try {
    await entered;
    let settled = false;
    const closing = app.close().then((v) => {
      settled = true;
      return v;
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(settled, false);
    release();
    assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
    await client.close();
    await connected;
  } finally {
    release?.();
    await client.close();
    await app.close();
    up.destroy();
    down.destroy();
    output.destroy();
  }
});

test('output failure settles UNKNOWN instead of waiting forever for SDK drain', async () => {
  const { PassThrough, Writable } = await import('node:stream');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const up = new PassThrough(),
    down = new PassThrough();
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      callback(Error('SECRET sink failed'));
    },
  });
  let invalidated = false;
  const session = {
    context: {},
    descriptor: {},
    execute: async () => ({}),
    close() {
      invalidated = true;
    },
  };
  const app = service.createOwnedBusinessTraceMcpServer(
    {
      session,
      limits: {
        maxMessageBytes: 2000000,
        maxConcurrentCalls: 1,
        maxItems: 100000,
        maxDepth: 100,
        requestTimeoutMs: 1000,
      },
    },
    { input: up, output },
  );
  const client = new Client({ name: 'failed-output', version: '1' });
  await app.start();
  const connected = client
    .connect(new StdioServerTransport(down, up), { timeout: 2000 })
    .catch(() => undefined);
  try {
    const state = await Promise.race([
      app.completion,
      new Promise((r) => setTimeout(() => r('PENDING'), 50)),
    ]);
    assert.deepEqual(state, { cleanupState: 'UNKNOWN' });
    assert.equal(invalidated, true);
    assert.equal(output.listenerCount('drain'), 0);
  } finally {
    output.emit('drain');
    await client.close();
    await connected;
    await app.close();
    up.destroy();
    down.destroy();
    output.destroy();
  }
});
