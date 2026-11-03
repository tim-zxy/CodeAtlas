import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { load, line, sha, rawSeal } from './fixtures/code-syntax-contract-helpers.mjs';
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
async function sample() {
  const x = await load('alias-reference-python');
  x.request.protocolVersion = 6;
  x.request.payload.syntaxContract = 'SYNTAX_BINDING_V2';
  x.requestBytes = Buffer.from(line(x.request));
  for (const e of x.events) {
    e.protocolVersion = 6;
    if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(e.type)) {
      e.payload.syntaxContract = 'SYNTAX_BINDING_V2';
      e.payload.requestChecksum = sha(x.requestBytes);
    }
    if (e.type === 'SYNTAX_OBSERVATION') {
      const s = e.payload;
      s.lexicalScope = s.owner;
      if (s.syntaxKind === 'ASSIGNMENT') {
        s.payload.assignmentForm = 'IMPORT_ALIAS';
        s.payload.valueRange = null;
      }
      if (s.syntaxKind === 'DECLARATION') {
        s.payload.declarationForm = 'CALLABLE';
        s.payload.declaredName = 'fn';
      }
    }
  }
  x.outputBytes = rawSeal(x.events.map(line));
  return x;
}
test('v6 actual bytes, strict versions, checksum and complete correspondence', async () => {
  const api = await import('../dist/native-binding-stream.js'),
    x = await sample(),
    b = budget();
  const result = api.validateBindingSyntaxObservationStreamWithBudget(
    x.requestBytes,
    x.outputBytes,
    b,
  );
  assert.equal(result.observation.request.protocolVersion, 6);
  assert.equal(result.observation.requestChecksum, sha(x.requestBytes));
  assert.ok(b.budget.items > 0);
  const old = await import('../dist/native-code-syntax-ipc.js');
  assert.throws(() => old.validateCodeSyntaxObservationStream(x.requestBytes, x.outputBytes));
  for (const alter of [
    (o) => o.subarray(0, o.lastIndexOf(10, o.length - 2) + 1),
    (o) => Buffer.from(o.toString().replace('SYNTAX_BINDING_V2', 'WRONG_CONTRACT')),
  ])
    assert.throws(() =>
      api.validateBindingSyntaxObservationStreamWithBudget(
        x.requestBytes,
        alter(x.outputBytes),
        budget(),
      ),
    );
  const es = structuredClone(x.events);
  const s = es.find((e) => e.type === 'SYNTAX_OBSERVATION').payload;
  s.lexicalScope = { factType: 'NODE', providerId: 'native', providerFactId: 'missing' };
  assert.throws(() =>
    api.validateBindingSyntaxObservationStreamWithBudget(
      x.requestBytes,
      rawSeal(es.map(line)),
      budget(),
    ),
  );
  const tiny = budget();
  tiny.limits.maxItems = 1;
  assert.throws(
    () => api.validateBindingSyntaxObservationStreamWithBudget(x.requestBytes, x.outputBytes, tiny),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});
test('v6 Readable owns cancellation and chunked byte consumption only', async () => {
  const api = await import('../dist/native-binding-stream.js'),
    x = await sample();
  const out = await api.default(
    x.requestBytes,
    Readable.from([x.outputBytes.subarray(0, 7), x.outputBytes.subarray(7)]),
    new AbortController().signal,
    undefined,
    budget(),
  );
  assert.equal(out.request.protocolVersion, 6);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    api.default(
      x.requestBytes,
      Readable.from([x.outputBytes]),
      controller.signal,
      undefined,
      budget(),
    ),
    (e) => e.code === 'CANCELLED',
  );
});

test('v6 entry cannot omit the cumulative ledger or fall back to v5', async () => {
  const api = await import('../dist/native-binding-stream.js'),
    x = await load();
  await assert.rejects(
    api.default(
      x.requestBytes,
      Readable.from([x.outputBytes]),
      new AbortController().signal,
      undefined,
      undefined,
    ),
  );
  const y = await sample();
  assert.throws(() =>
    api.validateBindingSyntaxObservationStreamWithBudget(y.requestBytes, y.outputBytes, undefined),
  );
});
test('v6 raw capacity is reserved before allocating it', async () => {
  const api = await import('../dist/native-binding-stream.js'),
    x = await sample(),
    snapshotBudget = budget();
  const { request } = api.readBindingSyntaxRequestSnapshotWithBudget(
    x.requestBytes,
    snapshotBudget,
  );
  const capacity = request.payload.resourceBudget.maxOutputBytes;
  const b = budget();
  b.limits.maxSerializedBytes = snapshotBudget.budget.serializedBytes + capacity - 1;
  let allocations = 0;
  const original = Buffer.alloc;
  Buffer.alloc = function (size, ...rest) {
    if (size === capacity) allocations++;
    return original(size, ...rest);
  };
  try {
    await assert.rejects(
      api.default(
        x.requestBytes,
        Readable.from([x.outputBytes]),
        new AbortController().signal,
        undefined,
        b,
      ),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
    assert.equal(allocations, 0);
  } finally {
    Buffer.alloc = original;
  }
});
