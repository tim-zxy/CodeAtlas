import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as api from '../dist/index.js';
import {
  buildRefreshCase,
  chunkBytes,
  finish,
  requestBytes,
  loadRefreshCase,
} from './helpers/native-refresh-v3-corpus.mjs';
import { stateDigest, factDigest } from './helpers/native-full-v3-corpus.mjs';
async function decode(c, overrides = {}, sink = { async accept() {} }) {
  assert.equal(typeof api.decodeNativeRefreshV3, 'function');
  return api.decodeNativeRefreshV3(
    c.requestBytes,
    chunkBytes(c.eventBytes),
    sink,
    { ...api.NATIVE_CLIENT_HARD_LIMITS, ...overrides },
    c.trustedMemoryBudgetBytes,
  );
}
const corpus = JSON.parse(
  await readFile(new URL('../../../fixtures/ipc/refresh-v3/cases.json', import.meta.url), 'utf8'),
);
const vectors = JSON.parse(
  await readFile(
    new URL('../../../fixtures/ipc/refresh-v3/payload-vectors.json', import.meta.url),
    'utf8',
  ),
);
for (const vector of vectors.vectors)
  test(`refresh payload vector ${vector.id}`, () => {
    assert.equal(
      api.NativeRefreshEventV3Schema.safeParse(JSON.parse(vector.json)).success,
      vector.valid,
    );
  });
for (const row of corpus.cases)
  test(`raw refresh corpus ${row.id}`, async () => {
    const c = await loadRefreshCase(row.id);
    if (!row.valid) {
      await assert.rejects(decode(c), (e) => e.code === row.expectedCode);
      return;
    }
    const events = [];
    const result = await decode(
      c,
      {},
      {
        async accept(e) {
          events.push(e);
        },
      },
    );
    assert.deepEqual(result.terminal.payload.counts, row.expectedCounts);
    assert.equal(result.terminal.payload.summaryRecords, row.summaryRecords);
    assert.equal(
      events.filter((e) => e.type === 'COVERAGE').length,
      c.targetFileCount * c.requestedCapabilityCount,
    );
    assert.equal(
      events.filter((e) => e.type === 'SOURCE_FILE').length,
      row.expectedCounts.sourceFiles,
    );
  });
test('refresh coverage includes retained file without SOURCE_FILE', async () => {
  const c = buildRefreshCase(),
    events = [];
  api.decodeNativeRequestV3(c.requestBytes);
  const result = await decode(
    c,
    {},
    {
      async accept(e) {
        events.push(e);
      },
    },
  );
  assert.equal(result.terminal.type, 'REFRESH_COMPLETED');
  assert.equal(events.filter((e) => e.type === 'SOURCE_FILE').length, 1);
  assert.equal(events.filter((e) => e.type === 'COVERAGE').length, 4);
  assert.equal(
    events.find((e) => e.type === 'UPSERT_EDGE').payload.sourceRange.sourceFileId,
    'f-0',
  );
  assert.ok(events.every(Object.isFrozen));
});
for (const mode of ['noop', 'delete', 'shared-owner-transfer', 'partial', 'zero-target'])
  test(`refresh contract accepts ${mode}`, async () => {
    const c = buildRefreshCase(mode);
    api.decodeNativeRequestV3(c.requestBytes);
    const r = await decode(c);
    assert.equal(r.terminal.payload.summaryRecords, c.targetFileCount);
    assert.equal(r.terminal.payload.outcome, mode === 'partial' ? 'PARTIAL' : 'SUCCEEDED');
  });
for (const [name, mutate] of [
  [
    'wrong-context',
    (c) => {
      c.records[0].payload.revisionId = 'other';
    },
  ],
  [
    'count',
    (c) => {
      c.records.at(-1).payload.counts.upsertedEdges = 2;
    },
  ],
  [
    'forged-retained-digest',
    (c) => {
      c.records.find((e) => e.type === 'ANALYSIS_SUMMARY').payload.emittedFacts[0].contentDigest =
        'f'.repeat(64);
    },
  ],
  [
    'missing-source',
    (c) => {
      c.records.splice(1, 1);
    },
  ],
  [
    'duplicate-operation',
    (c) => {
      c.records.splice(3, 0, structuredClone(c.records[2]));
    },
  ],
  [
    'foreign-target',
    (c) => {
      c.records[2].payload.target.target.providerFactId = 'missing';
    },
  ],
  [
    'mixed-full-event',
    (c) => {
      c.records[2].type = 'EDGE';
    },
  ],
  [
    'summary-header',
    (c) => {
      c.records.at(-1).payload.analysisState.summaryDigest = '0'.repeat(64);
    },
  ],
])
  test(`refresh rejects ${name}`, async () => {
    const c = buildRefreshCase();
    mutate(c);
    c.eventBytes = finish(c.records);
    await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
  });
test('empty scanner delta differs from inventory', async () => {
  const c = buildRefreshCase();
  c.request.payload.changes.modified = [];
  c.requestBytes = requestBytes(c.request, c.baseline);
  await assert.rejects(decode(c), (e) => e.code === 'INVALID_REQUEST');
});
for (const [name, mutate] of [
  ['BOM', (b) => Buffer.concat([Buffer.from([239, 187, 191]), b])],
  ['CRLF', (b) => Buffer.from(b.toString().replaceAll('\n', '\r\n'))],
  ['EOF', (b) => b.subarray(0, b.length - 1)],
  ['post-terminal', (b) => Buffer.concat([b, Buffer.from('{}\n')])],
  ['invalid-UTF8', (b) => Buffer.concat([Buffer.from([255, 10]), b])],
])
  test(`refresh rejects framing ${name}`, async () => {
    const c = buildRefreshCase();
    c.eventBytes = mutate(c.eventBytes);
    await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
  });
test('checksum is verified independently of valid schemas', async () => {
  const c = buildRefreshCase();
  c.records.at(-1).payload.integrityChecksum = 'sha256:' + '0'.repeat(64);
  c.eventBytes = Buffer.from(c.records.map((e) => JSON.stringify(e) + '\n').join(''));
  await assert.rejects(decode(c), (e) => e.code === 'CHECKSUM_MISMATCH');
});
for (const limit of ['maxStdinBytes', 'maxLineBytes', 'maxStdoutBytes', 'maxEvents'])
  test(`refresh enforces ${limit}`, async () => {
    await assert.rejects(
      decode(buildRefreshCase(), { [limit]: 1 }),
      (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED',
    );
  });
test('forged owner survives union but fails correspondence', async () => {
  const c = buildRefreshCase('noop');
  const summaries = c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload);
  const left = summaries[0].emittedFacts.shift(),
    right = summaries[1].emittedFacts.shift();
  summaries[0].emittedFacts.push(right);
  summaries[1].emittedFacts.push(left);
  c.records.at(-1).payload.analysisState.summaryDigest = stateDigest(summaries);
  c.eventBytes = finish(c.records);
  await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
});
test('slow sink is awaited before the next input chunk', async () => {
  const c = buildRefreshCase();
  let reads = 0,
    unblock,
    started;
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  async function* lines() {
    for await (const b of chunkBytes(c.eventBytes)) {
      reads++;
      yield b;
    }
  }
  assert.equal(typeof api.decodeNativeRefreshV3, 'function');
  const pending = api.decodeNativeRefreshV3(
    c.requestBytes,
    lines(),
    {
      async accept() {
        started();
        await blocked;
      },
    },
    api.NATIVE_CLIENT_HARD_LIMITS,
    c.trustedMemoryBudgetBytes,
  );
  await ready;
  const before = reads;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, before);
  unblock();
  assert.equal((await pending).terminal.type, 'REFRESH_COMPLETED');
});
test('requested workspace budget cannot be bypassed by a small valid stream', async () => {
  const c = buildRefreshCase();
  c.request.payload.resourceBudget.maxMemoryBytes = 1;
  c.trustedMemoryBudgetBytes = 1;
  c.requestBytes = requestBytes(c.request, c.baseline);
  await assert.rejects(decode(c), (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED');
});
test('retained symbol metadata must match its semantic fact digest', async () => {
  const c = buildRefreshCase('noop');
  const summaries = c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload);
  summaries[0].symbols[0].span.endColumn = 2;
  c.records.at(-1).payload.analysisState.summaryDigest = stateDigest(summaries);
  c.eventBytes = finish(c.records);
  await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
});
test('unchanged shared node cannot be downgraded to file ownership', async () => {
  const c = buildRefreshCase('noop');
  const summaries = c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload);
  const shared = summaries[0].emittedFacts.find((f) => f.ownership === 'SHARED');
  shared.ownership = 'FILE';
  summaries[1].emittedFacts = summaries[1].emittedFacts.filter(
    (f) => f.providerFactId !== shared.providerFactId,
  );
  c.records.at(-1).payload.analysisState.summaryDigest = stateDigest(summaries);
  c.eventBytes = finish(c.records);
  await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
});
test('edge references cannot borrow another provider identity', async () => {
  const c = buildRefreshCase();
  const edge = c.records.find((e) => e.type === 'UPSERT_EDGE').payload;
  edge.target.target.providerId = 'foreign';
  const summaries = c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload);
  summaries[0].emittedFacts.find((f) => f.factType === 'EDGE').contentDigest = factDigest(edge);
  c.records.at(-1).payload.analysisState.summaryDigest = stateDigest(summaries);
  c.eventBytes = finish(c.records);
  await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
});
test('source diagnostics absent from summary are rejected', async () => {
  const c = buildRefreshCase();
  c.records.splice(2, 0, {
    protocolVersion: 3,
    requestId: 'refresh',
    sequence: 2,
    type: 'DIAGNOSTIC',
    payload: {
      code: 'SYNTAX_ERROR',
      severity: 'ERROR',
      message: 'syntax',
      sourceRange: { sourceFileId: 'f-0', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
    },
  });
  c.records.at(-1).payload.counts.diagnostics = 1;
  c.eventBytes = finish(c.records);
  await assert.rejects(decode(c), (e) => e.code === 'PROTOCOL_VIOLATION');
});
test('refresh accepts exact byte and event ceilings and rejects one below', async () => {
  const c = buildRefreshCase();
  const exact = {
    maxStdinBytes: c.requestBytes.length,
    maxStdoutBytes: c.eventBytes.length,
    maxLineBytes: Math.max(
      ...c.eventBytes
        .toString()
        .trimEnd()
        .split('\n')
        .map((s) => Buffer.byteLength(s)),
    ),
    maxEvents: c.records.length,
  };
  assert.equal((await decode(c, exact)).terminal.type, 'REFRESH_COMPLETED');
  for (const k of Object.keys(exact))
    await assert.rejects(
      decode(c, { ...exact, [k]: exact[k] - 1 }),
      (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED',
    );
});
test('refresh refuses limit overrides above hard ceilings', async () => {
  for (const [k, n] of Object.entries(api.NATIVE_CLIENT_HARD_LIMITS))
    await assert.rejects(
      decode(buildRefreshCase(), { [k]: n + 1 }),
      (e) => e.code === 'INVALID_CONFIGURATION',
    );
});
test('failed observation never returns a successful terminal', async () => {
  const c = buildRefreshCase('zero-target');
  c.records.splice(0, c.records.length, {
    protocolVersion: 3,
    requestId: 'refresh',
    sequence: 0,
    type: 'REQUEST_FAILED',
    payload: { error: { code: 'INVALID_REQUEST', message: 'invalid', retryable: false } },
  });
  c.eventBytes = finish(c.records);
  await assert.rejects(decode(c), (e) => e.code === 'ANALYZER_FAILED');
});

// Removing the mandatory scalar/equality guard must fail before output access.
for (const budget of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  test(`refresh trusted scalar rejects ${String(budget)} before byte access`, async () => {
    let reads = 0;
    const bytes = {
      get byteLength() {
        reads++;
        throw Error('must not access bytes');
      },
    };
    await assert.rejects(
      api.decodeNativeRefreshV3(
        bytes,
        null,
        { async accept() {} },
        api.NATIVE_CLIENT_HARD_LIMITS,
        budget,
      ),
      (e) => e.code === 'INVALID_CONFIGURATION',
    );
    assert.equal(reads, 0);
  });

for (const offset of [-1, 1])
  test(`refresh wire budget mismatch ${offset} refuses before output or sink access`, async () => {
    const c = buildRefreshCase();
    let accesses = 0;
    const lines = {
      get [Symbol.asyncIterator]() {
        accesses++;
        throw Error('must not iterate');
      },
    };
    const sink = {
      get accept() {
        accesses++;
        throw Error('must not access sink');
      },
    };
    await assert.rejects(
      api.decodeNativeRefreshV3(
        c.requestBytes,
        lines,
        sink,
        api.NATIVE_CLIENT_HARD_LIMITS,
        c.trustedMemoryBudgetBytes + offset,
      ),
      (e) => e.code === 'INVALID_REQUEST',
    );
    assert.equal(accesses, 0);
  });

test('refresh input is copied before caller methods can mutate decoding', async () => {
  const c = buildRefreshCase();
  let reads = 0;
  class CallerBytes extends Uint8Array {
    includes() {
      reads++;
      this.fill(0);
      throw Error('caller mutation');
    }
  }
  c.requestBytes = new CallerBytes(c.requestBytes);
  assert.equal((await decode(c)).terminal.type, 'REFRESH_COMPLETED');
  assert.equal(reads, 0);
});

test('refresh oversized input refuses before copying or accessing output', async () => {
  const c = buildRefreshCase();
  c.requestBytes = new Uint8Array(1_000_001);
  let reads = 0;
  c.requestBytes.includes = () => {
    reads++;
    throw Error('must not decode');
  };
  await assert.rejects(decode(c), (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED');
  assert.equal(reads, 0);
});

test('refresh lowered input line ceiling refuses before output iteration', async () => {
  const c = buildRefreshCase();
  let reads = 0;
  const lines = {
    [Symbol.asyncIterator]() {
      reads++;
      throw Error('must not iterate');
    },
  };
  const firstLineBytes = c.requestBytes.indexOf(10);
  await assert.rejects(
    api.decodeNativeRefreshV3(
      c.requestBytes,
      lines,
      { async accept() {} },
      { ...api.NATIVE_CLIENT_HARD_LIMITS, maxLineBytes: firstLineBytes - 1 },
      c.trustedMemoryBudgetBytes,
    ),
    (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
  assert.equal(reads, 0);
});

test('refresh caller byte mutation during sink delivery cannot change validated input', async () => {
  const c = buildRefreshCase();
  const r = await decode(
    c,
    {},
    {
      async accept() {
        c.requestBytes.fill(0);
      },
    },
  );
  assert.equal(r.terminal.type, 'REFRESH_COMPLETED');
  assert.equal(r.terminal.payload.counts.upsertedEdges, 1);
});

test('refresh rejecting sink never returns success or advances the next chunk', async () => {
  const c = buildRefreshCase();
  let reads = 0;
  async function* lines() {
    const firstLF = c.eventBytes.indexOf(10) + 1;
    reads++;
    yield c.eventBytes.subarray(0, firstLF);
    reads++;
    yield c.eventBytes.subarray(firstLF);
  }
  const refused = new Error('sink refused');
  await assert.rejects(
    api.decodeNativeRefreshV3(
      c.requestBytes,
      lines(),
      {
        async accept() {
          throw refused;
        },
      },
      api.NATIVE_CLIENT_HARD_LIMITS,
      c.trustedMemoryBudgetBytes,
    ),
    (e) => e === refused,
  );
  assert.equal(reads, 1);
});
