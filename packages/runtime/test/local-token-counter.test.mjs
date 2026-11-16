import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createCl100kTokenCounter } from '../dist/local-token-counter.js';
import {
  createOwnedBusinessTraceSession,
  serializeBusinessTraceResponse,
} from '../../agent-api/dist/index.js';
import { withOwnedBusinessPublication } from '../../application/test/helpers/owned-business-publication-fixture.mjs';

const control = (patch = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 10000,
  signal: new AbortController().signal,
  ...patch,
});
const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

test('fixed cl100k counter measures complete UTF-8 text and keeps exact digest', () => {
  const counter = createCl100kTokenCounter(1000);
  assert.ok(Object.isFrozen(counter));
  assert.equal(counter.kind, 'EXACT_LOCAL_COUNTER');
  for (const [text, tokens] of [
    ['hello world', 2],
    ['中文', 2],
    ['', 0],
  ]) {
    assert.deepEqual(counter.measure(text, control()), {
      policyRef: counter.policyRef,
      contentDigest: digest(text),
      outputTokens: tokens,
    });
  }
  assert.throws(() => counter.measure('<|endoftext|>', control()), /TOKEN_COUNTER_UNAVAILABLE/);
  assert.throws(() => counter.measure('\ud800', control()), /TOKEN_COUNTER_UNAVAILABLE/);
});

test('byte ceiling and cooperative controls refuse instead of estimating', () => {
  assert.throws(() => createCl100kTokenCounter(0), /INVALID_TOKEN_COUNTER_LIMIT/);
  const counter = createCl100kTokenCounter(2);
  assert.equal(counter.measure('hi', control()).outputTokens, 1);
  assert.throws(() => counter.measure('中文', control()), /BUDGET_EXCEEDED/);
  assert.throws(() => counter.measure('hi', control({ signal: AbortSignal.abort() })), /CANCELLED/);
  assert.throws(() => counter.measure('hi', control({ deadlineEpochMs: 0 })), /DEADLINE/);
  let touched = false;
  assert.throws(
    () =>
      counter.measure('hi', {
        ...control(),
        get signal() {
          touched = true;
          return AbortSignal.abort();
        },
      }),
    /INVALID_REQUEST_CONTROL/,
  );
  assert.equal(touched, false);
});

test('deadline is rechecked after synchronous counting', () => {
  const counter = createCl100kTokenCounter(1000),
    c = control({ deadlineEpochMs: 10 });
  const now = Date.now;
  let calls = 0;
  try {
    Date.now = () => (calls++ < 3 ? 0 : 20);
    assert.throws(() => counter.measure('hello world', c), /DEADLINE/);
  } finally {
    Date.now = now;
  }
});

test('real owned published Store reaches Agent API with full-response exact token boundary', async (t) => {
  await withOwnedBusinessPublication(t, async (f) => {
    const before = JSON.stringify(f.history());
    const limits = {
      maxDepth: 20,
      maxSteps: 20,
      maxEdges: 20,
      maxOutputBytes: 1000000,
      maxTokens: 50000,
    };
    const counter = createCl100kTokenCounter(limits.maxOutputBytes);
    let measured;
    const api = createOwnedBusinessTraceSession({
      workspaceId: f.workspaceId,
      repositoryIds: f.repositoryIds,
      limits,
      authorize() {},
      knowledgeQuery: f.readKnowledge,
      tokenCounter: {
        ...counter,
        measure(text, c) {
          const value = counter.measure(text, c);
          measured = { text, value };
          return value;
        },
      },
    });
    const request = {
      version: 1,
      kind: 'BUSINESS',
      startRef: {
        kind: 'KNOWLEDGE_ITEM',
        id: f.knowledgeRef.itemId,
        revisionId: f.knowledgeRef.revisionId,
      },
      startStepKey: f.startStepKey,
      direction: 'FORWARD',
      budget: { ...limits },
    };
    try {
      const result = await api.execute(request, api.context, f.control());
      assert.ok(result.data, JSON.stringify(result));
      assert.equal(result.data.productionQuery, 'NOT_AUTHORIZED');
      assert.equal(result.data.quality, 'NOT_EVALUABLE');
      assert.equal(measured.text, serializeBusinessTraceResponse(result, f.control()));
      const count = measured.value.outputTokens;
      assert.ok(count > 0);
      request.budget.maxTokens = count;
      assert.ok((await api.execute(request, api.context, f.control())).data);
      request.budget.maxTokens = count - 1;
      assert.equal(
        (await api.execute(request, api.context, f.control())).error.code,
        'BUDGET_EXCEEDED',
      );
      assert.equal(JSON.stringify(f.history()), before);
    } finally {
      api.close();
    }
  });
});
