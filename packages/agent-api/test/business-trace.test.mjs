import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  businessTraceRequestSchema,
  businessTraceResponseSchema,
  createOwnedBusinessTraceSession,
  serializeBusinessTraceResponse,
  businessTraceResponseDigest,
} from '../dist/index.js';

test('public BUSINESS contract exports are available', () => {
  assert.equal(typeof businessTraceRequestSchema.safeParse, 'function');
  assert.equal(typeof businessTraceResponseSchema.safeParse, 'function');
  assert.equal(typeof createOwnedBusinessTraceSession, 'function');
  assert.equal(typeof serializeBusinessTraceResponse, 'function');
  assert.equal(typeof businessTraceResponseDigest, 'function');
});

// Literal fixture policy and fixed positive counts test budget enforcement only.
// This counter is deliberately not a production tokenizer or authority proof.
const POLICY = 'fixture:business-trace:OWNED_TEST_ONLY:v1';
const TOKENS = 37;
const vectors = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
);
const expected = JSON.parse(
  readFileSync(new URL('./business-trace.expected.json', import.meta.url), 'utf8'),
);
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
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const control = (patch = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...patch,
});
const limits = {
  maxDepth: 20,
  maxSteps: 20,
  maxEdges: 20,
  maxOutputBytes: 1000000,
  maxTokens: 1000,
};
function fixture() {
  const v = vectors.subjects.find((s) => s.name === 'BUSINESS_FLOW');
  const existing = structuredClone(v.existing),
    revision = existing.revisionEnvelope.payload;
  const ref = { itemId: existing.itemEnvelope.payload.id, revisionId: revision.id };
  const input = {
    version: 1,
    kind: 'BUSINESS',
    startRef: { kind: 'KNOWLEDGE_ITEM', id: ref.itemId, revisionId: ref.revisionId },
    startStepKey: 'accept',
    direction: 'FORWARD',
    budget: { ...limits },
  };
  const row = {
    itemEnvelope: existing.itemEnvelope,
    revisionEnvelope: existing.revisionEnvelope,
    referenceContext: existing.referenceContext,
    coverage: structuredClone(v.candidate.candidateEnvelope.payload.coverage),
    provenance: {
      attemptId: 'owned-public-business:synthetic',
      runId: revision.compilationRunId,
      snapshotId: revision.inputSnapshotRef.id,
      revisionSetId: revision.revisionSetId,
      evaluationId: revision.evaluationRef.id,
    },
    currentHeadRevisionId: revision.id,
    isCurrentHead: true,
    warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
  };
  const scope = {
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    selectedPublishedRevisionRefs: [ref],
  };
  const knowledge = {
    kind: 'OWNED_TEST_PUBLICATION',
    workspaceId: scope.workspaceId,
    selectionDigest: sha(
      'codeatlas.offline-knowledge.selection.v1\0' +
        canonical({ workspaceId: scope.workspaceId, refs: [ref] }),
    ),
    records: [row],
    productionQuery: 'NOT_AUTHORIZED',
    quality: 'NOT_EVALUABLE',
  };
  return { input, row, revision, scope, knowledge, c: control() };
}
function meter(
  measure = (serialized) => ({
    policyRef: POLICY,
    contentDigest: sha(serialized),
    outputTokens: TOKENS,
  }),
) {
  return { kind: 'EXACT_LOCAL_COUNTER', policyRef: POLICY, measure };
}
function session(f, overrides = {}) {
  const seen = { query: 0, authorization: [], measurements: [] };
  const ports = {
    workspaceId: f.scope.workspaceId,
    repositoryIds: [...f.scope.repositoryIds],
    limits: { ...limits },
    authorize(manifest, c) {
      seen.authorization.push(manifest);
      assert.ok(c.signal instanceof AbortSignal);
    },
    knowledgeQuery: async (scope, c) => {
      seen.query++;
      assert.deepEqual(scope, f.scope);
      assert.ok(Object.isFrozen(scope));
      assert.ok(c.signal instanceof AbortSignal);
      return f.knowledge;
    },
    tokenCounter: meter((serialized, c) => {
      seen.measurements.push(serialized);
      assert.ok(c.signal instanceof AbortSignal);
      return { policyRef: POLICY, contentDigest: sha(serialized), outputTokens: TOKENS };
    }),
    ...overrides,
  };
  return { api: createOwnedBusinessTraceSession(ports), seen, ports };
}
const run = (s, f, input = f.input, context = s.api.context, c = f.c) =>
  s.api.execute(input, context, c);
function failure(result, code) {
  assert.deepEqual(Object.keys(result), ['error']);
  assert.deepEqual(Object.keys(result.error).sort(), ['code', 'message']);
  assert.equal(result.error.code, code);
  assert.equal(typeof result.error.message, 'string');
  assert.ok(result.error.message.length > 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private-path|stack|password/);
  assert.equal(businessTraceResponseSchema.safeParse(result).success, true);
  return result.error.message;
}
function success(result) {
  assert.deepEqual(Object.keys(result).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(result.meta).sort(), [
    'basisRefs',
    'compilationCurrency',
    'coverage',
    'sourceFreshness',
    'truncation',
    'warnings',
  ]);
  assert.deepEqual(Object.keys(result.meta.truncation).sort(), [
    'frontier',
    'reasons',
    'truncated',
  ]);
  assert.equal(businessTraceResponseSchema.safeParse(result).success, true);
  assert.equal(result.data.quality, 'NOT_EVALUABLE');
  assert.equal(result.data.productionQuery, 'NOT_AUTHORIZED');
  assert.ok(result.meta.warnings.includes('OWNED_TEST_ONLY'));
  assert.ok(result.meta.warnings.includes('NO_PRODUCTION_AUTHORITY'));
  return result;
}
function diamond(f) {
  const supports = f.revision.structuredContent.steps[0].supportRefs;
  f.revision.structuredContent.steps = [
    ['d', ['e', 'a']],
    ['c', ['d']],
    ['a', ['c', 'b']],
    ['e', []],
    ['b', ['d']],
  ].map(([stepKey, nextStepKeys]) => ({
    stepKey,
    action: 'Literal action ' + stepKey,
    supportRefs: structuredClone(supports),
    nextStepKeys,
  }));
  f.input.startStepKey = 'a';
  return f;
}
function frozenTree(v) {
  if (!v || typeof v !== 'object') return;
  assert.ok(Object.isFrozen(v));
  for (const child of Object.values(v)) frozenTree(child);
}

test('strict versioned request union rejects caller authority, missing revision, extra nested fields and invalid budgets before query', async () => {
  const f = fixture(),
    s = session(f);
  assert.equal(businessTraceRequestSchema.safeParse(f.input).success, true);
  const mutations = [
    (x) => {
      x.version = 2;
    },
    (x) => {
      delete x.version;
    },
    (x) => {
      x.kind = 'UNKNOWN';
    },
    (x) => {
      delete x.startRef.revisionId;
    },
    (x) => {
      x.startRef.kind = 'CODE_NODE';
    },
    (x) => {
      x.startRef.extra = true;
    },
    (x) => {
      x.direction = 'BOTH';
    },
    (x) => {
      x.workspaceId = 'foreign';
    },
    (x) => {
      x.permissions = ['QUERY'];
    },
    (x) => {
      x.budget.outputTokens = 1;
    },
    (x) => {
      delete x.budget.maxTokens;
    },
    ...['maxDepth', 'maxSteps', 'maxEdges', 'maxOutputBytes', 'maxTokens'].flatMap((k) =>
      [-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((n) => (x) => {
        x.budget[k] = n;
      }),
    ),
    ...['maxSteps', 'maxEdges', 'maxOutputBytes', 'maxTokens'].map((k) => (x) => {
      x.budget[k] = 0;
    }),
  ];
  for (const mutate of mutations) {
    const input = structuredClone(f.input);
    mutate(input);
    assert.equal(businessTraceRequestSchema.safeParse(input).success, false);
    failure(await run(s, f, input), 'INVALID_INPUT');
  }
  assert.equal(s.seen.query, 0);
});

test('only exact known unavailable selectors return FEATURE_UNAVAILABLE without querying', async () => {
  const f = fixture(),
    s = session(f);
  for (const kind of ['CODE', 'EXECUTION', 'RUNTIME']) {
    const input = { version: 1, kind };
    assert.equal(businessTraceRequestSchema.safeParse(input).success, true);
    failure(await run(s, f, input), 'FEATURE_UNAVAILABLE');
    failure(await run(s, f, { ...input, startRef: f.input.startRef }), 'INVALID_INPUT');
  }
  assert.equal(s.seen.query, 0);
  assert.deepEqual(s.api.descriptor, {
    version: 1,
    supportedKinds: ['BUSINESS'],
    mode: 'OWNED_TEST_ONLY',
    tokenPolicyRef: POLICY,
  });
});

test('literal exact published revision response matches independently frozen expected JSON and changes no input', async () => {
  const f = fixture(),
    before = structuredClone(f.knowledge),
    db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE owned_fixture (body TEXT NOT NULL)');
  db.prepare('INSERT INTO owned_fixture VALUES (?)').run(JSON.stringify(f.knowledge));
  const snapshot = () => ({
    rows: db.prepare('SELECT * FROM owned_fixture').all(),
    changes: db.prepare('SELECT total_changes() AS n').get().n,
  });
  const databaseBefore = snapshot();
  const s = session(f, {
    knowledgeQuery: async (scope) => {
      assert.deepEqual(scope, f.scope);
      return JSON.parse(db.prepare('SELECT body FROM owned_fixture').get().body);
    },
  });
  let result;
  try {
    result = success(await run(s, f));
    assert.deepEqual(snapshot(), databaseBefore);
  } finally {
    db.close();
  }
  assert.deepEqual(result, expected);
  assert.deepEqual(f.knowledge, before);
  assert.deepEqual(result.data.startRef, f.input.startRef);
  assert.deepEqual(result.data.supportRefs, f.revision.supportRefs);
  assert.deepEqual(result.data.participants, f.revision.structuredContent.participants);
  assert.deepEqual(result.data.runtimeFlowRefs, f.revision.structuredContent.runtimeFlowRefs);
  assert.deepEqual(result.meta.coverage, f.row.coverage);
});

test('authority receives frozen exact selection and every delivered field before query and delivery', async () => {
  const f = fixture(),
    events = [],
    manifests = [];
  const s = session(f, {
    authorize(manifest) {
      frozenTree(manifest);
      manifests.push(manifest);
      events.push('authorize');
    },
    knowledgeQuery: async (scope) => {
      events.push('query');
      assert.deepEqual(scope, f.scope);
      return f.knowledge;
    },
    tokenCounter: meter((serialized) => {
      events.push('measure');
      return { policyRef: POLICY, contentDigest: sha(serialized), outputTokens: TOKENS };
    }),
  });
  const result = success(await run(s, f));
  assert.equal(events[0], 'authorize');
  assert.equal(events.at(-1), 'authorize');
  assert.equal(manifests.length, 2);
  assert.deepEqual(manifests[0], manifests[1]);
  assert.deepEqual(manifests[0], {
    operation: 'QUERY',
    purpose: 'trace_flow/BUSINESS',
    ...f.scope,
    fields: [
      'PUBLISHED_BUSINESS_FLOW',
      'SUPPORT_METADATA',
      'COVERAGE',
      'PROVENANCE',
      'FRESHNESS',
      'CURRENCY',
    ],
  });
});

test('authorization denial before query and late revocation refuse all result fields with fixed safe messages', async () => {
  const f = fixture();
  for (const denyAt of [1, 2]) {
    let authCalls = 0,
      queries = 0;
    const s = session(f, {
      authorize() {
        if (++authCalls === denyAt) throw Error('SECRET private-path password');
      },
      knowledgeQuery: async () => {
        queries++;
        return f.knowledge;
      },
    });
    const message = failure(await run(s, f), 'PERMISSION_DENIED');
    assert.equal(queries, denyAt - 1);
    const other = session(f, {
      authorize() {
        throw Error('different SECRET');
      },
    });
    assert.equal(failure(await run(other, f), 'PERMISSION_DENIED'), message);
  }
});

test('context identity is session local, rejects JSON/lookalikes/foreign handles and closes permanently', async () => {
  const f = fixture(),
    a = session(f),
    b = session(f);
  assert.equal(typeof a.api.context, 'object');
  for (const context of [
    null,
    {},
    JSON.parse(JSON.stringify(a.api.context)),
    { ...a.api.context },
    b.api.context,
  ])
    failure(await run(a, f, f.input, context), 'CONTEXT_UNAVAILABLE');
  assert.equal(a.seen.query, 0);
  a.api.close();
  a.api.close();
  failure(await run(a, f), 'CONTEXT_UNAVAILABLE');
  assert.equal(a.seen.query, 0);
  success(await run(b, f));
});

test('missing and estimated counters refuse before query; caller cannot install a token count', async () => {
  const f = fixture();
  for (const tokenCounter of [
    null,
    {
      kind: 'ESTIMATED',
      policyRef: POLICY,
      measure() {
        throw Error('must not run');
      },
    },
  ]) {
    const s = session(f, { tokenCounter });
    failure(await run(s, f), 'TOKEN_COUNTER_UNAVAILABLE');
    assert.equal(s.seen.query, 0);
  }
  const s = session(f);
  failure(await run(s, f, { ...f.input, outputTokens: 1 }), 'INVALID_INPUT');
  assert.equal(s.seen.query, 0);
});

test('counter response must bind exact policy/full serialized body and a positive safe integer', async () => {
  const f = fixture();
  const bad = [
    () => null,
    () => ({}),
    (text) => ({ policyRef: 'fixture:wrong', contentDigest: sha(text), outputTokens: TOKENS }),
    () => ({ policyRef: POLICY, contentDigest: '0'.repeat(64), outputTokens: TOKENS }),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN].map((outputTokens) => (text) => ({
      policyRef: POLICY,
      contentDigest: sha(text),
      outputTokens,
    })),
    (text) => ({
      policyRef: POLICY,
      contentDigest: sha(text),
      outputTokens: TOKENS,
      estimate: true,
    }),
    () => {
      throw Error('SECRET counter private-path');
    },
  ];
  for (const measure of bad) {
    const s = session(f, { tokenCounter: meter(measure) });
    failure(await run(s, f), 'TOKEN_COUNTER_UNAVAILABLE');
    assert.equal(s.seen.query, 1);
  }
});

test('canonical complete UTF8 response and SHA256 bind metadata as well as graph content', async () => {
  const f = fixture(),
    s = session(f),
    result = success(await run(s, f));
  const serialized = serializeBusinessTraceResponse(result, f.c);
  assert.equal(serialized, canonical(expected));
  assert.equal(s.seen.measurements[0], serialized);
  assert.equal(businessTraceResponseDigest(serialized), sha(serialized));
  const changed = structuredClone(result);
  changed.meta.coverage.status = 'PARTIAL';
  changed.meta.coverage.limitations.push('different metadata');
  assert.notEqual(
    businessTraceResponseDigest(serializeBusinessTraceResponse(changed, f.c)),
    sha(serialized),
  );
  const bytes = Buffer.byteLength(serialized, 'utf8');
  success(
    await run(session(f), f, {
      ...f.input,
      budget: { ...limits, maxOutputBytes: bytes, maxTokens: TOKENS },
    }),
  );
  failure(
    await run(session(f), f, { ...f.input, budget: { ...limits, maxOutputBytes: bytes - 1 } }),
    'BUDGET_EXCEEDED',
  );
  failure(
    await run(session(f), f, { ...f.input, budget: { ...limits, maxTokens: TOKENS - 1 } }),
    'BUDGET_EXCEEDED',
  );
  const unicode = fixture();
  unicode.revision.structuredContent.limitations = ['合成限定🙂'];
  const unicodeResult = success(await run(session(unicode), unicode));
  const unicodeText = serializeBusinessTraceResponse(unicodeResult, unicode.c);
  assert.ok(Buffer.byteLength(unicodeText, 'utf8') > unicodeText.length);
  failure(
    await run(session(unicode), unicode, {
      ...unicode.input,
      budget: { ...limits, maxOutputBytes: Buffer.byteLength(unicodeText, 'utf8') - 1 },
    }),
    'BUDGET_EXCEEDED',
  );
  const graphOnlyBytes = Buffer.byteLength(
    canonical({ steps: result.data.steps, edges: result.data.edges }),
  );
  assert.ok(graphOnlyBytes < bytes);
  failure(
    await run(session(f), f, { ...f.input, budget: { ...limits, maxOutputBytes: graphOnlyBytes } }),
    'BUDGET_EXCEEDED',
  );
});

test('fixed server ceilings clamp traversal and complete output limits despite larger caller budgets', async () => {
  for (const [patch, reason] of [
    [{ maxDepth: 0 }, 'MAX_DEPTH'],
    [{ maxSteps: 1 }, 'MAX_STEPS'],
    [{ maxEdges: 1 }, 'MAX_EDGES'],
  ]) {
    const f = diamond(fixture()),
      s = session(f, { limits: { ...limits, ...patch } });
    const result = success(await run(s, f));
    assert.equal(result.meta.truncation.truncated, true);
    assert.ok(result.meta.truncation.reasons.includes(reason));
    assert.ok(result.meta.truncation.frontier.some((x) => x.reason === reason));
    assert.ok(result.data.steps.length <= (patch.maxSteps ?? limits.maxSteps));
    assert.ok(result.data.edges.length <= (patch.maxEdges ?? limits.maxEdges));
  }
  const f = fixture();
  for (const patch of [{ maxTokens: TOKENS - 1 }, { maxOutputBytes: 1 }])
    failure(await run(session(f, { limits: { ...limits, ...patch } }), f), 'BUDGET_EXCEEDED');
});

test('diamond/cycle ordering and backward edges are literal; caller depth truncation retains revision-local frontier', async () => {
  const f = diamond(fixture());
  const result = success(await run(session(f), f));
  assert.deepEqual(
    result.data.steps.map((s) => [s.stepKey, s.depth]),
    [
      ['a', 0],
      ['b', 1],
      ['c', 1],
      ['d', 2],
      ['e', 3],
    ],
  );
  assert.deepEqual(result.data.edges.map((e) => e.fromStepKey + '>' + e.toStepKey).sort(), [
    'a>b',
    'a>c',
    'b>d',
    'c>d',
    'd>a',
    'd>e',
  ]);
  const back = success(
    await run(session(f), f, { ...f.input, startStepKey: 'e', direction: 'BACKWARD' }),
  );
  assert.deepEqual(
    back.data.steps.map((s) => [s.stepKey, s.depth]),
    [
      ['e', 0],
      ['d', 1],
      ['b', 2],
      ['c', 2],
      ['a', 3],
    ],
  );
  const cut = success(await run(session(f), f, { ...f.input, budget: { ...limits, maxDepth: 0 } }));
  assert.deepEqual(cut.data.startRef, f.input.startRef);
  assert.deepEqual(cut.meta.truncation.frontier, [
    { fromStepKey: 'a', toStepKey: 'b', depth: 1, reason: 'MAX_DEPTH' },
    { fromStepKey: 'a', toStepKey: 'c', depth: 1, reason: 'MAX_DEPTH' },
  ]);
});

test('all flow and returned-step bases deduplicate while historical AFFECTED partial coverage remains explicit', async () => {
  const f = fixture();
  const doc = f.row.referenceContext.availableSupports.find((s) => 'documentId' in s.basis);
  // The flow-only document basis and step-only repository basis must both survive.
  const stepBasis = structuredClone(f.revision.structuredContent.steps[0].supportRefs[0].basis);
  f.revision.supportRefs = [structuredClone(doc)];
  f.row.itemEnvelope.payload.sourceFreshness = 'AFFECTED';
  f.row.currentHeadRevisionId = 'knowledge-revision:new-head';
  f.row.isCurrentHead = false;
  f.row.coverage = {
    status: 'PARTIAL',
    limitations: ['Synthetic missing support'],
    unverifiedRefs: [],
  };
  f.row.warnings.push('SECRET private-path warning');
  const result = success(await run(session(f), f));
  assert.deepEqual(
    result.meta.basisRefs.map(canonical).sort(),
    [canonical(doc.basis), canonical(stepBasis)].sort(),
  );
  assert.equal(result.meta.sourceFreshness, 'AFFECTED');
  assert.equal(result.meta.compilationCurrency, 'CURRENT');
  assert.equal(result.data.currentHeadRevisionId, 'knowledge-revision:new-head');
  assert.equal(result.data.isCurrentHead, false);
  assert.deepEqual(result.data.startRef, f.input.startRef);
  assert.deepEqual(result.meta.coverage, f.row.coverage);
  for (const warning of ['AFFECTED', 'HISTORICAL_PUBLISHED_REVISION', 'UNCLASSIFIED_WARNING'])
    assert.ok(result.meta.warnings.includes(warning));
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private-path/);
});

test('response schema is strict at each public envelope and failure errors cannot hide partial data', async () => {
  const f = fixture(),
    good = success(await run(session(f), f));
  for (const path of [
    [],
    ['data'],
    ['meta'],
    ['meta', 'truncation'],
    ['data', 'startRef'],
    ['data', 'steps', 0],
    ['meta', 'basisRefs', 0],
  ]) {
    const bad = structuredClone(good);
    let cursor = bad;
    for (const key of path) cursor = cursor[key];
    cursor.extra = true;
    assert.equal(
      businessTraceResponseSchema.safeParse(bad).success,
      false,
      'reject extra at ' + path.join('.'),
    );
  }
  for (const bad of [
    { error: { code: 'INVALID_INPUT', message: 'Invalid input', extra: true } },
    { error: { code: 'UNKNOWN', message: 'Unknown' } },
    { error: { code: 'INVALID_INPUT', message: 'Invalid input' }, data: good.data },
    { ...good, meta: { ...good.meta, sourceFreshness: 'INVENTED' } },
  ])
    assert.equal(businessTraceResponseSchema.safeParse(bad).success, false);
});

test('unavailable/corrupt exact selection, provider errors and cooperative controls fail safely without successful emptiness', async () => {
  for (const mutate of [
    (f) => {
      f.knowledge.records = [];
    },
    (f) => {
      f.knowledge.selectionDigest = '0'.repeat(64);
    },
    (f) => {
      f.revision.id = 'wrong:revision';
    },
    (f) => {
      f.revision.publicationState = 'CANDIDATE';
    },
  ]) {
    const f = fixture();
    mutate(f);
    const result = await run(session(f), f);
    assert.ok(['NOT_FOUND', 'DATA_INVALID'].includes(result.error?.code));
    failure(result, result.error.code);
  }
  const f = fixture(),
    s = session(f, {
      knowledgeQuery: async () => {
        throw Error('SECRET provider private-path');
      },
    });
  failure(await run(s, f), 'PROVIDER_UNAVAILABLE');
  const abort = new AbortController();
  abort.abort();
  const cancelled = session(f);
  failure(
    await run(cancelled, f, f.input, cancelled.api.context, control({ signal: abort.signal })),
    'CANCELLED',
  );
  assert.equal(cancelled.seen.query, 0);
  const lateAbort = new AbortController();
  const late = session(f, {
    knowledgeQuery: async () => {
      lateAbort.abort();
      return f.knowledge;
    },
  });
  failure(
    await run(late, f, f.input, late.api.context, control({ signal: lateAbort.signal })),
    'CANCELLED',
  );
  const expired = session(f);
  failure(
    await run(
      expired,
      f,
      f.input,
      expired.api.context,
      control({ deadlineEpochMs: Date.now() - 1 }),
    ),
    'DEADLINE',
  );
  assert.equal(expired.seen.query, 0);
});

test('Promise-returning synchronous authority or counter is caught and permanently invalidates the session', async () => {
  const f = fixture();
  for (const port of ['authorize', 'tokenCounter']) {
    const unhandled = [],
      onRejection = (error) => unhandled.push(error);
    process.on('unhandledRejection', onRejection);
    try {
      const reject = () => Promise.reject(Error('SECRET asynchronous private-path'));
      const s = session(
        f,
        port === 'authorize' ? { authorize: reject } : { tokenCounter: meter(reject) },
      );
      failure(
        await run(s, f),
        port === 'authorize' ? 'PERMISSION_DENIED' : 'TOKEN_COUNTER_UNAVAILABLE',
      );
      failure(await run(s, f), 'CONTEXT_UNAVAILABLE');
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandled, []);
      assert.equal(s.seen.query, port === 'authorize' ? 0 : 1);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  }
});

test('query rejection after cancellation or deadline retains the control outcome', async () => {
  for (const code of ['CANCELLED', 'DEADLINE']) {
    const f = fixture(),
      abort = new AbortController();
    const c = control({ signal: abort.signal, deadlineEpochMs: Date.now() + 60000 });
    const originalNow = Date.now;
    const s = session(f, {
      knowledgeQuery: async () => {
        if (code === 'CANCELLED') abort.abort();
        else Date.now = () => c.deadlineEpochMs + 1;
        throw Error('SECRET provider interruption');
      },
    });
    try {
      failure(await run(s, f, f.input, s.api.context, c), code);
    } finally {
      Date.now = originalNow;
    }
  }
});

test('exotic host Promise observation failure still invalidates authority before returning safe error', async () => {
  class UnsupportedPromise extends Promise {
    static get [Symbol.species]() {
      throw Error('SECRET unsupported species');
    }
  }
  for (const port of ['authorize', 'tokenCounter']) {
    const f = fixture(),
      exotic = Object.freeze(UnsupportedPromise.resolve(undefined));
    const s = session(
      f,
      port === 'authorize' ? { authorize: () => exotic } : { tokenCounter: meter(() => exotic) },
    );
    failure(
      await run(s, f),
      port === 'authorize' ? 'PERMISSION_DENIED' : 'TOKEN_COUNTER_UNAVAILABLE',
    );
    failure(await run(s, f), 'CONTEXT_UNAVAILABLE');
  }
});
