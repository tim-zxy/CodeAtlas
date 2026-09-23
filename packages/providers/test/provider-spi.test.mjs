import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  FullAnalysisRequestSchema,
  RefreshAnalysisRequestSchema,
  validateProviderStream,
} from '../dist/index.js';

async function fixture(name) {
  const root = new URL(`../../../fixtures/ipc/protocol-v1/${name}/`, import.meta.url);
  const request = JSON.parse(await readFile(new URL('request.jsonl', root), 'utf8'));
  const events = (await readFile(new URL('events.jsonl', root), 'utf8'))
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { request, events };
}

async function* emit(events) {
  yield* events;
}

function input(request, signal = new AbortController().signal) {
  return { envelope: request, configuration: {}, signal };
}

test('Provider SPI accepts complete full and refresh streams from a fake provider', async () => {
  const analyze = await fixture('analyze-java-basic-v1');
  const refresh = await fixture('refresh-modified-file-v1');
  const fake = {
    describe: async () => ({ providerId: 'native' }),
    analyze: () => emit(analyze.events),
    refresh: () => emit(refresh.events),
  };
  assert.equal(FullAnalysisRequestSchema.safeParse(input(analyze.request)).success, true);
  assert.equal(RefreshAnalysisRequestSchema.safeParse(input(refresh.request)).success, true);
  const full = await validateProviderStream(input(analyze.request), fake.analyze());
  assert.equal(full.events.at(-1).type, 'ANALYSIS_COMPLETED');
  assert.equal(
    full.events.find((event) => event.type === 'EDGE').payload.target.state,
    'UNRESOLVED',
  );
  assert.equal(full.events.find((event) => event.type === 'COVERAGE').payload.coverage, 'COMPLETE');
  assert.equal(full.events.find((event) => event.type === 'DIAGNOSTIC').payload.code, 'PARTIAL');
  assert.deepEqual(full, await validateProviderStream(input(analyze.request), fake.analyze()));
  const patch = await validateProviderStream(input(refresh.request), fake.refresh());
  assert.equal(patch.events.at(-1).type, 'REFRESH_COMPLETED');
  assert.equal(
    patch.events.find((event) => event.type === 'UPSERT_EDGE').payload.target.state,
    'UNRESOLVED',
  );
});

test('Provider SPI rejects invalid requests and process-local configuration', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  assert.equal(
    FullAnalysisRequestSchema.safeParse({ ...input(request), extra: true }).success,
    false,
  );
  assert.equal(
    FullAnalysisRequestSchema.safeParse({ ...input(request), configuration: { value: undefined } })
      .success,
    false,
  );
  assert.equal(
    FullAnalysisRequestSchema.safeParse({ ...input(request), signal: {} }).success,
    false,
  );
  await assert.rejects(
    () => validateProviderStream({ ...input(request), signal: {} }, emit(events)),
    {
      code: 'IR_VALIDATION_FAILED',
    },
  );
});

test('Provider SPI withholds invalid or failed streams', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  const invalid = structuredClone(events);
  invalid[2].sequence = 8;
  await assert.rejects(() => validateProviderStream(input(request), emit(invalid)), {
    code: 'IR_VALIDATION_FAILED',
  });
  await assert.rejects(() => validateProviderStream(input(request), emit(events.slice(0, -1))), {
    code: 'IR_VALIDATION_FAILED',
  });
  const start = events[0];
  const failed = {
    protocolVersion: 1,
    requestId: request.requestId,
    sequence: 1,
    type: 'ANALYSIS_FAILED',
    payload: {
      ...start.payload,
      error: { code: 'INTERNAL_ANALYZER_FAILURE', message: 'Failed', retryable: false },
    },
  };
  await assert.rejects(() => validateProviderStream(input(request), emit([start, failed])), {
    code: 'PROVIDER_FAILED',
  });
});

test('Provider SPI cancels before and during an in-process stream', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  const before = new AbortController();
  before.abort();
  await assert.rejects(() => validateProviderStream(input(request, before.signal), emit(events)), {
    code: 'CANCELLED',
  });

  const during = new AbortController();
  let yielded = false;
  async function* slow() {
    yielded = true;
    yield events[0];
    await new Promise((resolve) => setTimeout(resolve, 300));
    yield events[1];
  }
  const result = validateProviderStream(input(request, during.signal), slow());
  while (!yielded) await new Promise((resolve) => setTimeout(resolve, 1));
  during.abort();
  await assert.rejects(() => result, { code: 'CANCELLED' });
});

test('Provider SPI enforces the event budget and closes a rejected iterator', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  const exact = {
    ...request,
    payload: {
      ...request.payload,
      resourceBudget: { ...request.payload.resourceBudget, maxEvents: events.length },
    },
  };
  assert.equal(
    (await validateProviderStream(input(exact), emit(events))).events.length,
    events.length,
  );

  let closed = false;
  async function* overflowing() {
    try {
      yield* events;
    } finally {
      closed = true;
    }
  }
  const limited = {
    ...request,
    payload: {
      ...request.payload,
      resourceBudget: { ...request.payload.resourceBudget, maxEvents: events.length - 1 },
    },
  };
  await assert.rejects(() => validateProviderStream(input(limited), overflowing()), {
    code: 'IR_VALIDATION_FAILED',
  });
  assert.equal(closed, true);
});

test('Provider SPI closes an iterator when cancellation races with a resolved event', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  const controller = new AbortController();
  let returns = 0;
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          queueMicrotask(() => queueMicrotask(() => controller.abort()));
          return Promise.resolve({ done: false, value: events[0] });
        },
        async return() {
          returns += 1;
          return { done: true };
        },
      };
    },
  };
  await assert.rejects(() => validateProviderStream(input(request, controller.signal), stream), {
    code: 'CANCELLED',
  });
  assert.equal(returns, 1);
});

test('Provider SPI preserves cancellation when iterator cleanup throws', async () => {
  const { request } = await fixture('analyze-java-basic-v1');
  const controller = new AbortController();
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise(() => undefined),
        return: () => {
          throw new Error('cleanup failed');
        },
      };
    },
  };
  const result = validateProviderStream(input(request, controller.signal), stream);
  queueMicrotask(() => controller.abort());
  await assert.rejects(() => result, { code: 'CANCELLED' });
});

test('Provider SPI snapshots the request envelope before an asynchronous stream', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  request.payload.resourceBudget.maxEvents = 1;
  const parsed = FullAnalysisRequestSchema.parse(input(request));
  assert.notEqual(parsed.envelope, request);
  async function* mutated() {
    request.payload.resourceBudget.maxEvents = events.length;
    yield* events;
  }
  await assert.rejects(() => validateProviderStream(input(request), mutated()), {
    code: 'IR_VALIDATION_FAILED',
  });
});

test('Provider SPI validates event context against the original repository', async () => {
  const { request, events } = await fixture('analyze-java-basic-v1');
  const repositoryId = request.payload.repository.id;
  async function* mutated() {
    request.payload.repository.id = 'mutated-repository';
    yield* events;
  }
  const result = await validateProviderStream(input(request), mutated());
  assert.equal(result.request.payload.repository.id, repositoryId);
  assert.equal(request.payload.repository.id, 'mutated-repository');
});

test('Provider SPI exposes a frozen configuration snapshot without freezing the signal', async () => {
  const { request } = await fixture('analyze-java-basic-v1');
  const original = { nested: { enabled: true } };
  const signal = new AbortController().signal;
  const parsed = FullAnalysisRequestSchema.parse({
    envelope: request,
    configuration: original,
    signal,
  });
  assert.notEqual(parsed.configuration, original);
  assert.equal(Object.isFrozen(parsed.configuration), true);
  assert.equal(Object.isFrozen(parsed.configuration.nested), true);
  assert.equal(Object.isFrozen(signal), false);
  assert.throws(() => {
    parsed.configuration.nested.enabled = false;
  }, TypeError);
});
