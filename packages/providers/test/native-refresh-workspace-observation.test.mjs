import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as api from '../dist/index.js';
import { buildRefreshCase, chunkBytes } from './helpers/native-refresh-v3-corpus.mjs';

async function observation() {
  const module = await import('../dist/native-refresh-workspace-observation.js').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(
    typeof module.observeNativeRefreshWorkspace,
    'function',
    'Private decoder observer missing',
  );
  return module.observeNativeRefreshWorkspace;
}

test('D5 request observation distinguishes encoder records, joined input and prevalidation', async () => {
  const observe = await observation();
  for (const [mode, count, summaries] of [
    ['zero-target', 2, 0],
    [undefined, 4, 2],
  ]) {
    const c = buildRefreshCase(mode);
    const records = [];
    const result = await observe(
      () =>
        api.encodeNativeRefreshRequestV3(
          c.request,
          c.baseline,
          api.NATIVE_CLIENT_HARD_LIMITS,
          c.trustedMemoryBudgetBytes,
        ),
      () => {},
      (record) => records.push(record),
    );
    assert.equal(result.threw, false);
    assert.equal(result.captureFailed, false);
    assert.deepEqual(Buffer.from(result.value), c.requestBytes);
    assert.ok(records.length > 0, 'Request workspace checkpoints missing');
    const encoder = records.filter((r) => r.component === 'ENCODER');
    assert.equal(encoder[0].phase, 'BEGIN');
    assert.equal(encoder[0].recordCount, null);
    assert.equal(encoder.filter((r) => r.phase === 'RECORD_APPENDED').length, count);
    const joined = encoder.find((r) => r.phase === 'JOINED');
    assert.equal(joined.recordCount, count);
    assert.equal(joined.recordBytes, c.requestBytes.length);
    assert.equal(joined.joinedBytes, c.requestBytes.length);
    assert.ok(joined.joinedBackingBytes >= joined.joinedBytes);
    assert.equal(encoder.find((r) => r.phase === 'BASELINE_PARSED').baselineSummaries, summaries);
    const validation = records.filter((r) => r.component === 'PREVALIDATION');
    assert.equal(
      validation.find((r) => r.phase === 'TEXT_DECODED').textCodeUnits,
      c.requestBytes.toString('utf8').length,
    );
    assert.equal(validation.find((r) => r.phase === 'LINES_SPLIT').lineCount, count);
    assert.equal(validation.find((r) => r.phase === 'RECORDS_PARSED').parsedRecordCount, count);
    assert.equal(validation.find((r) => r.phase === 'VALIDATED').baselineSummaries, summaries);
    assert.equal(encoder.at(-1).phase, 'EXIT');
    assert.equal(validation.at(-1).phase, 'EXIT');
    assert.ok(
      records.every((r) => Object.isFrozen(r) && r.scope === 'REQUEST_WORKSPACE_STRUCTURE_ONLY'),
    );
  }
});

test('D5 request observation preserves refused prevalidation prefixes and original errors', async () => {
  const observe = await observation();
  const records = [];
  const result = await observe(
    () => api.decodeNativeRequestV3(Buffer.from('{\n')),
    () => {},
    (record) => records.push(record),
  );
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'PROTOCOL_CORRUPTION');
  assert.ok(records.length > 0, 'Request workspace checkpoints missing');
  assert.deepEqual(
    records.slice(-2).map((r) => r.phase),
    ['FAILED', 'EXIT'],
  );
  assert.equal(records.at(-1).textCodeUnits, 2);
  assert.equal(records.at(-1).lineCount, 1);
  assert.equal(records.at(-1).parsedRecordCount, null);
  assert.equal(
    records.some((r) => r.phase === 'VALIDATED'),
    false,
  );
  const c = buildRefreshCase('zero-target');
  const refused = [];
  const mismatch = await observe(
    () =>
      api.encodeNativeRefreshRequestV3(
        c.request,
        c.baseline,
        api.NATIVE_CLIENT_HARD_LIMITS,
        c.trustedMemoryBudgetBytes + 1,
      ),
    () => {},
    (record) => refused.push(record),
  );
  assert.equal(mismatch.error.code, 'INVALID_REQUEST');
  assert.equal(refused.at(-1).recordCount, 1);
  assert.equal(refused.at(-1).baselineSummaries, null);
  assert.equal(
    refused.some((r) => r.component === 'PREVALIDATION'),
    false,
  );
});

test('D5 request capture failures and nested scopes do not alter encoded values or decoder records', async () => {
  const observe = await observation();
  const c = buildRefreshCase('zero-target');
  const encode = () =>
    api.encodeNativeRefreshRequestV3(
      c.request,
      c.baseline,
      api.NATIVE_CLIENT_HARD_LIMITS,
      c.trustedMemoryBudgetBytes,
    );
  let callbacks = 0;
  const result = await observe(
    encode,
    () => {},
    () => {
      callbacks++;
      throw 0;
    },
  );
  assert.equal(result.threw, false);
  assert.deepEqual(Buffer.from(result.value), c.requestBytes);
  assert.equal(result.captureFailed, true, 'Request callback failure was not recorded');
  assert.equal(callbacks, 1);
  const outer = [],
    inner = [],
    concurrent = [],
    decoder = [];
  await Promise.all([
    observe(
      async () => {
        await observe(
          encode,
          () => {},
          (r) => inner.push(r),
        );
        encode();
        await decode(c);
      },
      (r) => decoder.push(r),
      (r) => outer.push(r),
    ),
    observe(
      encode,
      () => {},
      (r) => concurrent.push(r),
    ),
  ]);
  for (const records of [inner, concurrent]) {
    assert.equal(records.filter((r) => r.component === 'ENCODER' && r.phase === 'BEGIN').length, 1);
    assert.ok(records.every((r) => r.invocationId === (r.component === 'ENCODER' ? 1 : 2)));
  }
  assert.equal(outer.filter((r) => r.component === 'ENCODER' && r.phase === 'BEGIN').length, 1);
  assert.equal(
    outer.filter((r) => r.component === 'PREVALIDATION' && r.phase === 'BEGIN').length,
    2,
  );
  assert.ok(
    decoder.every((r) => r.scope === 'DECODER_WORKSPACE_STRUCTURE_ONLY' && r.decoderId === 1),
  );
  const count = outer.length;
  encode();
  assert.equal(outer.length, count);
});

test('D5 client request observation sees copied input and aliased record views before late exit refusal', async () => {
  const observe = await observation();
  const c = buildRefreshCase();
  const records = [];
  const result = await observe(
    () =>
      api.streamNativeRefreshV3(
        c.request,
        c.baseline,
        {
          executablePath: process.execPath,
          arguments: [
            fileURLToPath(new URL('./helpers/native-refresh-v3-process.mjs', import.meta.url)),
            'late-exit',
          ],
          timeoutMs: 4000,
          allowedEnvironment: Object.fromEntries(
            ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) =>
              process.env[key] ? [[key, process.env[key]]] : [],
            ),
          ),
        },
        { async accept() {} },
        c.trustedMemoryBudgetBytes,
      ),
    () => {},
    (record) => records.push(record),
  );
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'PROCESS_FAILED');
  assert.ok(records.length > 0, 'Request workspace checkpoints missing');
  const client = records.filter((r) => r.component === 'CLIENT');
  const copy = client.find((r) => r.phase === 'COPY');
  assert.equal(copy.clientBytes, c.requestBytes.length);
  assert.ok(copy.clientBackingBytes >= copy.clientBytes);
  assert.equal(client.find((r) => r.phase === 'RECORDS_READY').recordCount, 4);
  assert.deepEqual(
    client.slice(-2).map((r) => r.phase),
    ['FAILED', 'EXIT'],
  );
  assert.equal(
    records.filter((r) => r.component === 'PREVALIDATION' && r.phase === 'BEGIN').length,
    2,
  );
});

test('D5 request observation keeps UTF-16 units distinct from bytes and incomplete JSON maps unavailable', async () => {
  const observe = await observation();
  for (const [text, units, lines, parsed] of [
    ['"😀"\n', 5, 1, 1],
    ['{}\n{\n', 5, 2, null],
  ]) {
    const records = [];
    const result = await observe(
      () => api.decodeNativeRequestV3(Buffer.from(text)),
      () => {},
      (r) => records.push(r),
    );
    assert.equal(result.threw, true);
    assert.equal(result.captureFailed, false);
    assert.equal(records.at(-1).textCodeUnits, units);
    assert.equal(records.at(-1).lineCount, lines);
    assert.equal(records.at(-1).parsedRecordCount, parsed);
    assert.equal(records.at(-1).baselineSummaries, null);
    assert.equal(
      records.some((r) => r.phase === 'VALIDATED'),
      false,
    );
  }
});

test('D5 request observation closes detached descendants and records no arrays before trusted-budget refusal', async () => {
  const observe = await observation();
  const c = buildRefreshCase('zero-target');
  const records = [];
  const refused = await observe(
    () => api.encodeNativeRefreshRequestV3(c.request, c.baseline, api.NATIVE_CLIENT_HARD_LIMITS, 0),
    () => {},
    (r) => records.push(r),
  );
  assert.equal(refused.error.code, 'INVALID_CONFIGURATION');
  assert.deepEqual(
    records.map((r) => r.phase),
    ['BEGIN', 'FAILED', 'EXIT'],
  );
  assert.equal(records.at(-1).recordCount, null);
  let release, descendant;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await observe(
    () => {
      descendant = gate.then(() =>
        api.encodeNativeRefreshRequestV3(
          c.request,
          c.baseline,
          api.NATIVE_CLIENT_HARD_LIMITS,
          c.trustedMemoryBudgetBytes,
        ),
      );
    },
    () => {},
    (r) => records.push(r),
  );
  const count = records.length;
  release();
  await descendant;
  assert.equal(records.length, count, 'Settled request scope captured late work');
});

test('D5 request capture failure at FAILED preserves the original schema refusal', async () => {
  const observe = await observation();
  const phases = [];
  const result = await observe(
    () => api.decodeNativeRequestV3(Buffer.from('{\n')),
    () => {},
    (r) => {
      phases.push(r.phase);
      if (r.phase === 'FAILED') throw 0;
    },
  );
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'PROTOCOL_CORRUPTION');
  assert.equal(result.captureFailed, true);
  assert.equal(phases.at(-1), 'FAILED');
  assert.equal(phases.includes('EXIT'), false);
});
function decode(c = buildRefreshCase('zero-target'), sink = { async accept() {} }) {
  return api.decodeNativeRefreshV3(
    c.requestBytes,
    chunkBytes(c.eventBytes),
    sink,
    api.NATIVE_CLIENT_HARD_LIMITS,
    c.trustedMemoryBudgetBytes,
  );
}

test('D5 decoder observation records actual empty containers and fragment/sink boundaries', async () => {
  const observe = await observation();
  const records = [];
  const result = await observe(
    () => decode(),
    (record) => records.push(record),
  );
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, false);
  assert.equal(result.value.terminal.type, 'REFRESH_COMPLETED');
  const ready = records.find((record) => record.phase === 'STATE_READY');
  assert.ok(ready, 'Decoder never observed its constructed state');
  assert.equal(ready.scope, 'DECODER_WORKSPACE_STRUCTURE_ONLY');
  for (const key of [
    'baselineSummaries',
    'targetFiles',
    'changedFiles',
    'baselineLedger',
    'operations',
    'summaries',
    'coverage',
    'diagnostics',
  ])
    assert.equal(ready[key], 0, key);
  const copy = records.find((record) => record.phase === 'INPUT_COPY');
  assert.equal(copy.operations, null, 'Unconstructed maps are not measured zero');
  assert.ok(copy.ownedInputBytes > 0);
  assert.ok(copy.ownedInputBackingBytes >= copy.ownedInputBytes);
  assert.ok(
    records.some((record) => record.phase === 'FRAGMENT_BUFFERED' && record.pendingBytes > 0),
  );
  assert.equal(records.filter((record) => record.phase === 'SINK_BEGIN').length, 1);
  assert.equal(records.filter((record) => record.phase === 'SINK_SETTLED').length, 1);
  assert.equal(records.at(-1).phase, 'EXIT');
  assert.ok(records.every(Object.isFrozen));
  assert.equal(api.observeNativeRefreshWorkspace, undefined);
});

test('D5 decoder observation isolates nested and concurrent async scopes', async () => {
  const observe = await observation();
  const outer = [],
    inner = [],
    concurrent = [];
  const [a, b] = await Promise.all([
    observe(
      async () => {
        const nested = await observe(
          () => decode(),
          (record) => inner.push(record),
        );
        assert.equal(nested.threw, false);
        return decode();
      },
      (record) => outer.push(record),
    ),
    observe(
      () => decode(),
      (record) => concurrent.push(record),
    ),
  ]);
  assert.equal(a.threw, false);
  assert.equal(b.threw, false);
  for (const records of [outer, inner, concurrent]) {
    assert.equal(records.filter((record) => record.phase === 'INPUT_COPY').length, 1);
    assert.equal(records.filter((record) => record.phase === 'EXIT').length, 1);
    assert.ok(records.every((record) => record.decoderId === 1));
  }
  const count = outer.length;
  await decode();
  assert.equal(outer.length, count, 'Observer leaked beyond its scope');
});

test('D5 decoder observation counts nonempty retained and changed state without heap estimates', async () => {
  const observe = await observation();
  const records = [];
  const result = await observe(
    () => decode(buildRefreshCase()),
    (record) => records.push(record),
  );
  assert.equal(result.threw, false);
  const ready = records.find((record) => record.phase === 'STATE_READY');
  // Two files, two local facts each, one shared container and one call.
  assert.equal(ready.baselineSummaries, 2);
  assert.equal(ready.targetFiles, 2);
  assert.equal(ready.changedFiles, 1);
  assert.equal(ready.baselineLedger, 6);
  const target = records.find((record) => record.phase === 'TARGET_LEDGER');
  assert.equal(target.targetLedger, 6);
  assert.equal(target.operations, 1);
  assert.equal(target.summaries, 2);
  assert.equal(target.coverage, 4);
  assert.equal(target.diagnostics, 0);
});

test('D5 decoder observation has no settled sink or extra reads while a failing sink is blocked', async () => {
  const observe = await observation();
  const c = buildRefreshCase('zero-target');
  const records = [];
  let chunks = 0,
    enter,
    release;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const gate = new Promise((_, reject) => {
    release = reject;
  });
  const result = observe(
    () =>
      api.decodeNativeRefreshV3(
        c.requestBytes,
        (async function* () {
          for await (const chunk of chunkBytes(c.eventBytes)) {
            chunks++;
            yield chunk;
          }
        })(),
        {
          async accept() {
            enter();
            await gate;
          },
        },
        api.NATIVE_CLIENT_HARD_LIMITS,
        c.trustedMemoryBudgetBytes,
      ),
    (record) => records.push(record),
  );
  await entered;
  const before = chunks;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chunks, before);
  assert.equal(records.filter((record) => record.phase === 'SINK_BEGIN').length, 1);
  assert.equal(
    records.some((record) => record.phase === 'SINK_SETTLED'),
    false,
  );
  release(0);
  const failure = await result;
  assert.equal(failure.threw, true);
  assert.equal(failure.error, 0);
  assert.equal(
    records.some((record) => record.phase === 'SINK_SETTLED'),
    false,
  );
  assert.equal(records.at(-2).phase, 'FAILED');
  assert.equal(records.at(-1).phase, 'EXIT');
});

test('D5 decoder observation capture failure does not replace decoder success or original throws', async () => {
  const observe = await observation();
  const failCapture = () => {
    throw new Error('diagnostic failure');
  };
  const success = await observe(() => decode(), failCapture);
  assert.equal(success.threw, false);
  assert.equal(success.value.terminal.type, 'REFRESH_COMPLETED');
  assert.equal(success.captureFailed, true);
  const records = [];
  const c = buildRefreshCase('zero-target');
  c.requestBytes = Buffer.from('bad\n');
  const failure = await observe(
    () => decode(c),
    (record) => records.push(record),
  );
  assert.equal(failure.threw, true);
  assert.equal(failure.error.code, 'INVALID_REQUEST');
  assert.equal(records.at(-2).phase, 'FAILED');
  assert.equal(records.at(-1).phase, 'EXIT');
  assert.equal(
    records.some((record) => record.phase === 'STATE_READY'),
    false,
  );
  const primitive = await observe(() => {
    throw 0;
  }, failCapture);
  assert.equal(primitive.threw, true);
  assert.equal(primitive.error, 0);
});

test('D5 decoder observation stops detached descendants after the owning operation settles', async () => {
  const observe = await observation();
  const records = [];
  let release, descendant;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const result = await observe(
    () => {
      descendant = (async () => {
        await gate;
        await decode();
      })();
      return 0;
    },
    (record) => records.push(record),
  );
  assert.equal(result.threw, false);
  assert.equal(result.value, 0);
  release();
  await descendant;
  assert.deepEqual(records, [], 'A settled observation scope captured late work');
});

test('D5 decoder failure prefix retains an unparsed fragment when the iterator throws', async () => {
  const observe = await observation();
  const c = buildRefreshCase('zero-target');
  for (const thrown of [0, null, undefined, '', new Error('iterator failed')]) {
    const records = [];
    let sinkCalls = 0,
      closed = false;
    const result = await observe(
      () =>
        api.decodeNativeRefreshV3(
          c.requestBytes,
          (async function* () {
            try {
              yield Buffer.from('{');
              throw thrown;
            } finally {
              closed = true;
            }
          })(),
          {
            async accept() {
              sinkCalls++;
            },
          },
          api.NATIVE_CLIENT_HARD_LIMITS,
          c.trustedMemoryBudgetBytes,
        ),
      (record) => records.push(record),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, thrown);
    assert.equal(result.captureFailed, false);
    assert.equal(closed, true);
    assert.equal(sinkCalls, 0);
    assert.equal(records.filter((r) => r.phase === 'CHUNK').length, 1);
    assert.equal(records.filter((r) => r.phase === 'FRAGMENT_BUFFERED').length, 1);
    assert.equal(
      records.some((r) =>
        ['LINE_BEGIN', 'EVENT_PARSED', 'SINK_BEGIN', 'TARGET_LEDGER'].includes(r.phase),
      ),
      false,
    );
    assert.deepEqual(
      records.slice(-2).map((r) => r.phase),
      ['FAILED', 'EXIT'],
    );
    for (const record of records.slice(-2)) {
      assert.equal(record.pendingBytes, 1);
      assert.equal(record.lineBytes, null);
      assert.equal(record.operations, 0);
      assert.equal(record.targetLedger, null);
    }
  }
});

test('D5 decoder failure prefix does not parse or deliver truncated and malformed records', async () => {
  const observe = await observation();
  const c = buildRefreshCase('zero-target');
  for (const [bytes, lineBegins, pending] of [
    ['{', 0, 1],
    ['{\n', 1, 0],
  ]) {
    const records = [];
    let sinkCalls = 0;
    const result = await observe(
      () =>
        api.decodeNativeRefreshV3(
          c.requestBytes,
          (async function* () {
            yield Buffer.from(bytes);
          })(),
          {
            async accept() {
              sinkCalls++;
            },
          },
          api.NATIVE_CLIENT_HARD_LIMITS,
          c.trustedMemoryBudgetBytes,
        ),
      (record) => records.push(record),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error.code, 'PROTOCOL_VIOLATION');
    assert.equal(result.captureFailed, false);
    assert.equal(sinkCalls, 0);
    assert.equal(records.filter((r) => r.phase === 'LINE_BEGIN').length, lineBegins);
    assert.equal(
      records.some((r) =>
        ['EVENT_PARSED', 'SINK_BEGIN', 'SINK_SETTLED', 'TARGET_LEDGER'].includes(r.phase),
      ),
      false,
    );
    assert.deepEqual(
      records.slice(-2).map((r) => r.phase),
      ['FAILED', 'EXIT'],
    );
    assert.equal(records.at(-1).pendingBytes, pending);
    assert.equal(records.at(-1).lineBytes, lineBegins ? 1 : null);
    assert.equal(records.at(-1).targetLedger, null);
  }
});

test('D5 decoder failure capture cannot replace the iterator error or keep delivering snapshots', async () => {
  const observe = await observation();
  const c = buildRefreshCase('zero-target');
  const thrown = new Error('original iterator failure');
  const phases = [];
  const result = await observe(
    () =>
      api.decodeNativeRefreshV3(
        c.requestBytes,
        (async function* () {
          yield Buffer.from('{');
          throw thrown;
        })(),
        {
          async accept() {
            assert.fail('Fragment must never reach the sink');
          },
        },
        api.NATIVE_CLIENT_HARD_LIMITS,
        c.trustedMemoryBudgetBytes,
      ),
    (record) => {
      phases.push(record.phase);
      if (record.phase === 'FAILED') throw 0;
    },
  );
  assert.equal(result.threw, true);
  assert.equal(result.error, thrown);
  assert.equal(result.captureFailed, true);
  assert.equal(phases.at(-1), 'FAILED');
  assert.equal(phases.includes('EXIT'), false, 'Broken capture must not keep receiving snapshots');
});
