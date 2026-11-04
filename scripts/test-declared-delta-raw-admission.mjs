import {
  assertHistoricalFixturePin,
  readHistoricalInput,
  applyPortableSourceMigration,
} from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  cases,
  loadRawCase,
  sha,
} from '../fixtures/phase1/declared-delta-raw-admission/corpus.mjs';
// Deliberately load the normalizer first: budget/schema cycles must not depend on index import order.
const python = await import('../packages/providers/dist/python-normalizer.js');
const publicAPI = await import('../packages/providers/dist/index.js');
const requestAPI = await import('../packages/providers/dist/native-code-syntax-request.js');
const wireAPI = await import('../packages/providers/dist/native-code-syntax-ipc.js');
const composition = await import('../packages/providers/dist/native-composition-input.js');
const { composeNativeProjection } =
  await import('../packages/providers/dist/native-composition.js');
const historyAPI = await import('../packages/providers/dist/history-transition.js');
const { composeDeclaredDeltaSupportCandidate } =
  await import('../packages/providers/dist/delta-support-candidate.js');
const { discoverFixtures, parseFixtureManifest } =
  await import('../packages/evaluation/dist/index.js');
let admission = {},
  budgetAPI = {};
for (const [name, set] of [
  ['declared-delta-raw-observation', (v) => (admission = v)],
  ['native-code-syntax-budget', (v) => (budgetAPI = v)],
])
  try {
    set(await import('../packages/providers/dist/' + name + '.js'));
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
const { load, json: rawJSON } =
  await import('../packages/providers/test/fixtures/code-syntax-contract-helpers.mjs');
const { instantiateProducerCase } =
  await import('../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs');
const { loadCompositionCase, limits } =
  await import('../packages/providers/test/fixtures/native-composition-helpers.mjs');
const { loadHistoryCase } =
  await import('../packages/providers/test/fixtures/history-transition-helpers.mjs');
const { loadScopeCase } = await import('../fixtures/phase1/declared-observation-scope/corpus.mjs');
const w = '.superpowers/sdd/2026-10-26-phase1-declared-delta-raw-admission',
  root = 'fixtures/phase1/declared-delta-raw-admission';
const json = (p) =>
  JSON.parse(p.startsWith('.superpowers/') ? readHistoricalInput(p) : fs.readFileSync(p));
const old = json(w + '/old-behavior.json');
const context = () => ({ limits: { ...limits }, budget: { serializedBytes: 0, items: 0 } });
const encode = (v) =>
  JSON.parse(JSON.stringify(v, (_, x) => (x instanceof Map ? { map: [...x] } : x)));
const outcome = (f) => {
  try {
    return { value: encode(f()) };
  } catch (e) {
    return { error: { name: e.name, code: e.code, message: e.message } };
  }
};
const run = (x, l = limits) => {
  assert.equal(typeof admission.prepareDeclaredDeltaRawObservation, 'function');
  return admission.prepareDeclaredDeltaRawObservation(
    x.input,
    x.metadata,
    x.requestBytes,
    x.outputBytes,
    l,
  );
};
const rejects = (f, code) =>
  assert.throws(
    f,
    (e) =>
      e instanceof admission.DeclaredDeltaRawAdmissionError &&
      e.code === code &&
      e.message === code,
  );
const resource = (f) => assert.throws(f, (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED');
const frozen = (v) => {
  if (v && typeof v === 'object') {
    assert.equal(Object.isFrozen(v), true);
    for (const x of Object.values(v)) frozen(x);
  }
};
for (const c of cases)
  test('literal raw admission ' + c.id, () => {
    const x = loadRawCase(c.id);
    if (x.expected.error) {
      assert.equal(typeof admission.DeclaredDeltaRawAdmissionError, 'function');
      rejects(() => run(x), x.expected.error);
    } else {
      const r = run(x);
      assert.deepEqual({ scope: r.scope, raw: r.raw }, x.expected);
      frozen(r.raw);
      assert.equal(r.scope.mode, 'OBSERVATION_REQUIRED');
    }
  });
test('G01-independent-freeze', () => {
  assert.equal(cases.length, 48);
  assert.equal(new Set(cases.map((c) => c.id)).size, 48);
  assert.equal(new Set(cases.map((c) => c.family)).size, 9);
  assert.equal(cases.filter((c) => !loadRawCase(c.id).expected.error).length, 12);
  assert.equal(
    parseFixtureManifest(json(root + '/fixture.json')).id,
    'p1-declared-delta-raw-admission-v1',
  );
  for (const [p, h] of Object.entries(json(w + '/semantic-freeze-final.json').sha256))
    assert.equal(sha(fs.readFileSync(p)), h, p);
  for (const [p, h] of Object.entries(json(w + '/semantic-freeze.json').sha256))
    assert.equal(sha(readHistoricalInput(w + '/first-freeze-raw/' + p)), h, p);
  const provenance = json(root + '/provenance.json');
  assert.equal(provenance.sourceOrHistoryAuthenticated, false);
  assert.equal(provenance.numericalPolicy, null);
  for (const [p, h] of Object.entries(provenance.inputOrigins))
    assert.equal(sha(fs.readFileSync(p)), h, p);
});
test('G02-old-wrapper-parity', async () => {
  for (const r of old.raw) {
    const x = await load(r.id);
    assert.deepEqual(
      outcome(() => publicAPI.validateCodeSyntaxObservationStream(x.requestBytes, x.outputBytes)),
      { value: r.value },
    );
  }
  for (const r of old.producer) {
    const x = await instantiateProducerCase(r.id, '/fixture/code-syntax-producer');
    const actual = publicAPI.validateCodeSyntaxObservationStream(
      x.requestBytes,
      x.expectedOutputBytes,
    );
    assert.deepEqual(encode(actual), r.value);
    const p = actual.request.payload;
    assert.deepEqual(
      python.normalizePythonSourceObservation({
        targetSource: p.targetSource,
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        nodes: actual.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: actual.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
      }),
      r.normalized,
    );
  }
  for (const r of old.full) {
    const x = await loadCompositionCase(r.id);
    assert.deepEqual(
      outcome(() =>
        composition.readNativeCompositionInputs(x.metadata, x.requestBytes, x.outputBytes, limits),
      ),
      r.reader,
    );
    assert.deepEqual(
      outcome(() => composeNativeProjection(x.metadata, x.requestBytes, x.outputBytes, limits)),
      r.candidate,
    );
  }
  for (const r of old.history) {
    const x = loadHistoryCase(r.id);
    assert.deepEqual(
      outcome(() => historyAPI.prepareHistoryTransitionDraft(x.input, limits)),
      r.error ? { error: r.error } : { value: r.value },
    );
  }
  const dc = json('fixtures/phase1/delta-support-candidate/cases.json');
  for (const r of old.delta) {
    const c = dc.find((c) => c.id === r.id),
      input = json('fixtures/phase1/delta-support-candidate/' + c.input);
    assert.deepEqual(
      outcome(() => composeDeclaredDeltaSupportCandidate(input, limits)),
      r.error ? { error: r.error } : { value: r.value },
    );
  }
  for (const r of old.scope) {
    const x = loadScopeCase(r.id);
    assert.deepEqual(
      outcome(() => historyAPI.prepareDeclaredNativeObservationScope(x.input, limits)),
      r.error ? { error: r.error } : { value: r.value },
    );
  }
});
test('G03-preflight-not-decoder', () => {
  assert.equal(typeof budgetAPI.preflightCodeSyntaxJSON, 'function');
  const values = [
    null,
    true,
    3,
    1e20,
    'quoted : { \\" 😀',
    [],
    {},
    [{ key: [null, { x: '\\\\' }] }],
  ];
  const count = (v, d = 0) => {
    let items = 1,
      depth = d;
    if (v && typeof v === 'object')
      for (const x of Object.values(v)) {
        const c = count(x, d + 1);
        items += c.items;
        depth = Math.max(depth, c.depth);
      }
    return { items, depth };
  };
  for (const v of values) {
    const c = context(),
      raw = Buffer.from(JSON.stringify(v) + '\n'),
      n = count(v);
    budgetAPI.preflightCodeSyntaxJSON(raw, c);
    assert.equal(c.budget.items, n.items);
    if (n.items > 1)
      resource(() =>
        budgetAPI.preflightCodeSyntaxJSON(raw, {
          limits: { ...limits, maxItems: n.items - 1 },
          budget: { serializedBytes: 0, items: 0 },
        }),
      );
    if (n.depth > 1)
      resource(() =>
        budgetAPI.preflightCodeSyntaxJSON(raw, {
          limits: { ...limits, maxDepth: n.depth - 1 },
          budget: { serializedBytes: 0, items: 0 },
        }),
      );
  }
  const c = context();
  budgetAPI.preflightCodeSyntaxJSON(Buffer.from('{"x":0,"x":1}\n'), c);
  assert.equal(c.budget.items, 3);
  budgetAPI.preflightCodeSyntaxJSON(Buffer.from('{invalid\n'), context());
  assert.throws(() =>
    requestAPI.decodeCodeSyntaxLineWithBudget(
      Buffer.from('{invalid\n'),
      'INVALID_REQUEST',
      context(),
    ),
  );
});
test('G04-one-s0-ledger', async () => {
  const x = loadRawCase(cases[0].id);
  const prepared = historyAPI.prepareDeclaredNativeObservationScope(x.input, limits);
  const c = { limits: prepared.limits, budget: prepared.budget },
    originalLedger = c.budget,
    before = { ...c.budget };
  assert.equal(typeof wireAPI.validateCodeSyntaxObservationStreamWithBudget, 'function');
  const r = wireAPI.validateCodeSyntaxObservationStreamWithBudget(x.requestBytes, x.outputBytes, c);
  assert.equal(c.budget, originalLedger);
  assert.ok(c.budget.items > before.items);
  assert.ok(c.budget.serializedBytes > before.serializedBytes);
  assert.deepEqual(r.observation, x.expected.raw.codeSyntax);
  const inputBefore = JSON.stringify(x.input);
  rejects(() => run(x, { ...limits, maxItems: before.items + 1 }), 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(JSON.stringify(x.input), inputBefore);
  for (const row of old.raw) {
    const seed = await load(row.id),
      before = c.budget.items;
    const decoded = wireAPI.validateCodeSyntaxObservationStreamWithBudget(
      seed.requestBytes,
      seed.outputBytes,
      c,
    );
    assert.deepEqual(decoded.observation, row.value, row.id);
    assert.equal(decoded.outputIdentity, sha(seed.outputBytes));
    assert.equal(c.budget, originalLedger);
    assert.ok(c.budget.items > before);
  }
  for (const row of old.producer) {
    const seed = await instantiateProducerCase(row.id, '/fixture/code-syntax-producer'),
      before = c.budget.items;
    const decoded = wireAPI.validateCodeSyntaxObservationStreamWithBudget(
      seed.requestBytes,
      seed.expectedOutputBytes,
      c,
    );
    assert.deepEqual(decoded.observation, row.value, row.id);
    assert.equal(decoded.outputIdentity, sha(seed.expectedOutputBytes));
    assert.equal(c.budget, originalLedger);
    assert.ok(c.budget.items > before);
  }
});
test('G05-event-early-exhaustion', () => {
  const x = loadRawCase(cases[0].id),
    c = context();
  assert.equal(typeof requestAPI.readCodeSyntaxRequestSnapshotWithBudget, 'function');
  requestAPI.readCodeSyntaxRequestSnapshotWithBudget(x.requestBytes, c);
  const bad = Buffer.from(x.outputBytes.toString().split('\n')[0] + '\n{broken\n');
  const low = {
    limits: { ...limits, maxItems: c.budget.items },
    budget: { serializedBytes: 0, items: 0 },
  };
  resource(() => wireAPI.validateCodeSyntaxObservationStreamWithBudget(x.requestBytes, bad, low));
  assert.throws(
    () => wireAPI.validateCodeSyntaxObservationStreamWithBudget(x.requestBytes, bad, context()),
    (e) => e.code === 'PROTOCOL_CORRUPTION',
  );
});
test('G06-copy-and-request-budget', () => {
  const x = loadRawCase(cases[0].id),
    c = context();
  assert.equal(typeof requestAPI.copyCodeSyntaxBytesWithBudget, 'function');
  resource(() =>
    requestAPI.copyCodeSyntaxBytesWithBudget(
      x.requestBytes,
      x.requestBytes.length,
      'INVALID_REQUEST',
      { limits: { ...limits, maxSerializedBytes: x.requestBytes.length - 1 }, budget: c.budget },
    ),
  );
  assert.deepEqual(c.budget, { serializedBytes: 0, items: 0 });
  const result = wireAPI.validateCodeSyntaxObservationStreamWithBudget(
    x.requestBytes,
    x.outputBytes,
    context(),
  );
  assert.equal(result.outputIdentity, sha(x.outputBytes));
  assert.equal(result.observation.requestChecksum, sha(x.requestBytes));
  assert.deepEqual(
    result.observation.request.payload.resourceBudget,
    JSON.parse(x.requestBytes).payload.resourceBudget,
  );
});
test('G07-temporary-normalization-budget', async () => {
  assert.equal(typeof python.default, 'function');
  assert.equal(python.default.name, 'normalizePythonSourceObservationWithBudget');
  const x = await load('alias-reference-python'),
    r = publicAPI.validateCodeSyntaxObservationStream(x.requestBytes, x.outputBytes),
    p = r.request.payload,
    input = {
      targetSource: p.targetSource,
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: p.sourceFiles,
      nodes: r.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      edges: r.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
    },
    c = context();
  const actual = python.default(input, c);
  assert.deepEqual(actual, python.normalizePythonSourceObservation(input));
  const inputCost = context();
  composition.chargeCompositionJSON(input, inputCost.limits, inputCost.budget);
  assert.ok(c.budget.items > inputCost.budget.items * 2);
  resource(() =>
    python.default(input, {
      limits: { ...limits, maxItems: c.budget.items - 1 },
      budget: { serializedBytes: 0, items: 0 },
    }),
  );
  const javaCase = loadRawCase(cases[10].id),
    prepared = historyAPI.prepareDeclaredNativeObservationScope(javaCase.input, limits);
  const admitted = run(javaCase);
  assert.ok(admitted.budget.items > prepared.budget.items);
  rejects(
    () => run(javaCase, { ...limits, maxItems: admitted.budget.items - 1 }),
    'RESOURCE_LIMIT_EXCEEDED',
  );
});
test('G08-safe-unknown-input', () => {
  const x = loadRawCase(cases[0].id);
  let called = 0;
  const bad = [
    Object.defineProperty({ ...x.metadata }, 'java', {
      enumerable: true,
      get() {
        called++;
        throw Error('getter');
      },
    }),
    new Proxy(x.metadata, {
      get() {
        called++;
        throw Error('proxy');
      },
    }),
    {
      ...x.metadata,
      toJSON() {
        called++;
        throw Error('toJSON');
      },
    },
  ];
  const cycle = {};
  cycle.x = cycle;
  bad.push(cycle, Object.create({ bad: true }));
  for (const metadata of bad) rejects(() => run({ ...x, metadata }), 'INVALID_INPUT');
  assert.equal(called, 0);
  const shared = new Uint8Array(new SharedArrayBuffer(x.requestBytes.length));
  assert.throws(
    () => run({ ...x, requestBytes: shared }),
    (e) => e instanceof admission.DeclaredDeltaRawAdmissionError,
  );
  const sub = new (class extends Uint8Array {})(x.requestBytes);
  assert.throws(
    () => run({ ...x, requestBytes: sub }),
    (e) => e instanceof admission.DeclaredDeltaRawAdmissionError,
  );
  const detached = new Uint8Array(x.requestBytes);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.throws(
    () => run({ ...x, requestBytes: detached }),
    (e) => e instanceof admission.DeclaredDeltaRawAdmissionError,
  );
  const raw = Buffer.from(x.requestBytes);
  Object.defineProperty(raw, 'byteLength', {
    get() {
      called++;
      throw Error('shadow');
    },
  });
  assert.deepEqual(run({ ...x, requestBytes: raw }).raw, x.expected.raw);
  assert.equal(called, 0);
});
test('G09-owned-frozen-result', () => {
  const x = loadRawCase(cases[0].id),
    r = run(x),
    before = encode(r.raw);
  x.metadata.snapshot.id = 'snapshot:mutated';
  x.requestBytes.fill(32);
  x.outputBytes.fill(32);
  assert.deepEqual(r.raw, before);
  for (const v of [r.packet, r.limits, r.scope, r.raw]) frozen(v);
  assert.equal(Object.isFrozen(r.budget), false);
  const noBuffer = (v) => {
    assert.equal(Buffer.isBuffer(v), false);
    if (v && typeof v === 'object') Object.values(v).forEach(noBuffer);
  };
  noBuffer(r.raw);
});
test('G10-original-owner-ref', () => {
  const x = loadRawCase(cases[10].id),
    classes = x.metadata.java.events.filter(
      (e) => e.type === 'NODE' && e.payload.providerKind === 'java.class',
    );
  assert.equal(new Set(classes.map((e) => e.payload.name)).size, 1);
  assert.equal(new Set(classes.map((e) => e.payload.providerFactId)).size, 2);
  assert.deepEqual(run(x).raw, x.expected.raw);
  const wrong = loadRawCase(cases[28].id);
  rejects(() => run(wrong), 'INVALID_CONTEXT');
});
test('G11-full-remains-full', () => {
  for (const index of [0, 4, 6]) {
    const x = loadRawCase(cases[index].id);
    run(x);
    assert.throws(
      () =>
        composition.readNativeCompositionInputs(x.metadata, x.requestBytes, x.outputBytes, limits),
      (e) => ['INVALID_CONTEXT', 'INCOMPLETE_OBSERVATION', 'UNSUPPORTED_SCOPE'].includes(e.code),
    );
  }
});
test('G12-no-authority-or-index', async () => {
  assert.equal(typeof admission.prepareDeclaredDeltaRawObservation, 'function');
  for (const name of [
    'prepareDeclaredDeltaRawObservation',
    'validateCodeSyntaxObservationStreamWithBudget',
    'normalizePythonSourceObservationWithBudget',
    'preflightCodeSyntaxJSON',
    'default',
  ])
    assert.equal(Object.hasOwn(publicAPI, name), false, name);
  const r = run(loadRawCase(cases[0].id));
  assert.equal(r.raw.provenance.kind, 'DECLARED_INPUT');
  for (const key of [
    'ownerHandle',
    'lease',
    'authenticated',
    'measurementEligible',
    'runQualified',
    'basis',
  ])
    assert.equal(Object.hasOwn(r.raw, key), false);
  const profiles = await import('../packages/runtime/dist/native-metadata-profiles.js');
  assert.equal(profiles.nativeSyntaxObservationProfiles.length, 0);
  assert.equal(typeof python.default, 'function');
});
test('G13-no-raw-path-early-refusal', () => {
  let called = 0;
  const forbidden = new Proxy(
    {},
    {
      get() {
        called++;
        throw Error('read');
      },
      getPrototypeOf() {
        called++;
        throw Error('prototype');
      },
    },
  );
  for (const i of [40, 41]) {
    const x = loadRawCase(cases[i].id);
    rejects(
      () => run({ ...x, metadata: forbidden, requestBytes: forbidden, outputBytes: forbidden }),
      'UNSUPPORTED_SCOPE',
    );
  }
  assert.equal(called, 0);
});
test('G14-exact-registration-diff', async () => {
  const pkg = json('package.json');
  assert.equal(
    pkg.scripts.test
      .split(/\s+/)
      .filter((x) => x === 'scripts/test-declared-delta-raw-admission.mjs').length,
    1,
  );
  const r = await discoverFixtures('fixtures');
  assert.equal(r.filter((x) => x.manifest.id === 'p1-declared-delta-raw-admission-v1').length, 1);
  let total = 0;
  for (const p of [
    'scripts/test-history-transition.mjs',
    'scripts/test-delta-support-candidate.mjs',
    'scripts/test-r011-history-capture.mjs',
    'scripts/test-syntax-mapping-preparation.mjs',
    'scripts/test-syntax-evidence-reuse.mjs',
    'scripts/test-declared-observation-scope.mjs',
  ]) {
    let before = readHistoricalInput(w + '/before-execution/' + p, 'utf8');
    const variable =
      p.includes('syntax-mapping-preparation') || p.includes('declared-observation-scope')
        ? 'fixtures'
        : 'r';
    const pairs = [
      [`assert.equal(${variable}.length, 55);`, `assert.equal(${variable}.length, 62);`],
      [
        `assert.equal(${variable}.filter((x) => x.manifest.phase === '1').length, 29);`,
        `assert.equal(${variable}.filter((x) => x.manifest.phase === '1').length, 36);`,
      ],
    ];
    if (!p.includes('syntax-')) pairs.unshift(['registry55 exact29', 'registry62 exact36']);
    for (const [a, b] of pairs) {
      assert.equal(before.split(a).length, 2);
      before = before.replace(a, b);
      total++;
    }
    assert.equal(fs.readFileSync(p, 'utf8'), applyPortableSourceMigration(p, before), p);
  }
  assert.equal(total, 16);
  const old = json(w + '/plan-review.json');
  for (const [p, h] of Object.entries(old.sha256))
    if (p.startsWith('fixtures/')) assertHistoricalFixturePin(p, h);
});
