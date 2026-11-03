import {
  assertHistoricalFixturePin,
  readHistoricalInput,
  applyPortableSourceMigration,
} from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cases,
  loadRawHistoryCase,
} from '../fixtures/phase1/declared-raw-history-candidate/corpus.mjs';
import {
  reference,
  span,
  sumOperations,
  visitJSON,
  tupleReference,
  budgetLimits,
} from '../fixtures/phase1/declared-raw-history-candidate/reference-ledger.mjs';
const w = '.superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate',
  root = 'fixtures/phase1/declared-raw-history-candidate',
  json = (p) =>
    JSON.parse(p.startsWith('.superpowers/') ? readHistoricalInput(p) : fs.readFileSync(p)),
  sha = (b) => createHash('sha256').update(b).digest('hex'),
  limits = {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  };
const python = await import('../packages/providers/dist/python-normalizer.js');
const publicAPI = await import('../packages/providers/dist/index.js');
const java = await import('../packages/providers/dist/canonical-normalizer.js');
const javaNode = await import('../packages/providers/dist/java-node-normalizer.js');
const collector = await import('../packages/providers/dist/fact-merger-input.js');
const selector = await import('../packages/providers/dist/fact-merger-selection.js');
const historyInput = await import('../packages/providers/dist/history-transition-input.js');
const historyAPI = await import('../packages/providers/dist/history-transition.js');
const delta = await import('../packages/providers/dist/delta-support-candidate.js');
const budgetAPI = await import('../packages/providers/dist/native-code-syntax-budget.js');
const requestAPI = await import('../packages/providers/dist/native-code-syntax-request.js');
const wireAPI = await import('../packages/providers/dist/native-code-syntax-ipc.js');
const composition = await import('../packages/providers/dist/native-composition-input.js');
const { composeNativeProjection } =
  await import('../packages/providers/dist/native-composition.js');
const { prepareDeclaredDeltaRawObservation } =
  await import('../packages/providers/dist/declared-delta-raw-observation.js');
const { discoverFixtures, parseFixtureManifest } =
  await import('../packages/evaluation/dist/index.js');
const { load, json: rawJSON } =
  await import('../packages/providers/test/fixtures/code-syntax-contract-helpers.mjs');
const { instantiateProducerCase } =
  await import('../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs');
const { loadCompositionCase, reseal } =
  await import('../packages/providers/test/fixtures/native-composition-helpers.mjs');
const { loadHistoryCase } =
  await import('../packages/providers/test/fixtures/history-transition-helpers.mjs');
const { loadRawCase: loadRawCaseForParity } =
  await import('../fixtures/phase1/declared-delta-raw-admission/corpus.mjs');
const { loadScopeCase } = await import('../fixtures/phase1/declared-observation-scope/corpus.mjs');
const { composeDeclaredDeltaSupportCandidate } = delta;
let api = {};
try {
  api = await import('../packages/providers/dist/declared-delta-raw-support-candidate.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const old = json(w + '/old-behavior.json'),
  encode = (v) => JSON.parse(JSON.stringify(v, (_, x) => (x instanceof Map ? { map: [...x] } : x))),
  outcome = (f) => {
    try {
      return { value: encode(f()) };
    } catch (e) {
      return { error: { name: e.name, code: e.code, message: e.message } };
    }
  };
const context = (l = limits) => ({
  limits: { ...l },
  budget: { serializedBytes: 0, items: 0 },
});
function run(x, l = limits) {
  assert.equal(typeof api.composeDeclaredDeltaRawSupportCandidate, 'function');
  return api.composeDeclaredDeltaRawSupportCandidate(
    x.input,
    x.metadata,
    x.requestBytes,
    x.outputBytes,
    l,
  );
}
function rejection(f, code) {
  assert.equal(typeof api.DeclaredDeltaRawSupportError, 'function');
  assert.throws(
    f,
    (e) => e instanceof api.DeclaredDeltaRawSupportError && e.code === code && e.message === code,
  );
}
function resource(f) {
  assert.throws(f, (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED');
}
function deepFrozen(v) {
  if (v !== null && typeof v === 'object') {
    assert.ok(Object.isFrozen(v));
    assert.ok(!ArrayBuffer.isView(v));
    for (const x of Object.values(v)) deepFrozen(x);
  }
}
function controls(x) {
  const m = x.expected.mutation;
  if (m === 'getter-metadata')
    x.metadata = Object.defineProperty({}, 'snapshot', {
      enumerable: true,
      get() {
        throw Error('must not call getter');
      },
    });
  if (m === 'proxy-packet') x.input = new Proxy(x.input, {});
  if (m === 'cycle-packet') x.input.cycle = x.input;
  if (m === 'shared-request') {
    const a = new Uint8Array(new SharedArrayBuffer(x.requestBytes.length));
    a.set(x.requestBytes);
    x.requestBytes = a;
  }
  if (m === 'detached-request') {
    const a = new Uint8Array(x.requestBytes);
    structuredClone(a, { transfer: [a.buffer] });
    x.requestBytes = a;
  }
  if (m === 'subclass-request') {
    class Bytes extends Uint8Array {}
    x.requestBytes = new Bytes(x.requestBytes);
  }
  return x;
}
for (const c of cases)
  test('literal raw history ' + c.id, () => {
    const x = controls(loadRawHistoryCase(c.id)),
      e = x.expected,
      l = e.budgetRecipe ? budgetLimits(e.budgetRecipe) : limits;
    if (e.error) rejection(() => run(x, l), e.error);
    else {
      const r = run(x);
      assert.deepEqual(r, {
        kind: 'DECLARED_DELTA_RAW_SUPPORT_CANDIDATE',
        candidate: e.candidate,
        raw: e.raw,
      });
      deepFrozen(r);
    }
  });
test('G01 independent semantic and consumer freezes', () => {
  assert.equal(cases.length, 64);
  assert.equal(new Set(cases.map((c) => c.family)).size, 10);
  assert.equal(cases.filter((c) => !loadRawHistoryCase(c.id).expected.error).length, 16);
  assert.equal(
    parseFixtureManifest(json(root + '/fixture.json')).id,
    'p1-declared-raw-history-candidate-v1',
  );
  for (const [p, h] of Object.entries(json(w + '/semantic-freeze-final-format.json').sha256))
    assert.equal(sha(fs.readFileSync(p)), h, p);
  for (const [p, h] of Object.entries(json(w + '/semantic-freeze.json').sha256))
    assert.equal(sha(readHistoricalInput(w + '/first-freeze-raw/' + p)), h, p);
  for (const [p, h] of Object.entries(json(w + '/consumer-freeze-final-format.json').sha256)) {
    if (p === 'scripts/test-declared-raw-history-candidate.mjs') {
      const successorRoot =
        '.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure';
      const successor = json(successorRoot + '/registration-successor.json');
      let expected = readHistoricalInput(successorRoot + '/originals/' + p, 'utf8');
      assert.equal(sha(Buffer.from(expected)), h, p);
      for (const patch of successor.selfPatches) {
        assert.equal(expected.split(patch.old).length, 2);
        expected = expected.replace(patch.old, patch.new);
      }
      const runtime = json(
        '.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness/registration-self-successor.json',
      );
      assert.equal(runtime.selfPatches.length, 6);
      for (const patch of runtime.selfPatches) {
        assert.equal(expected.split(patch.old).length, 2);
        expected = expected.replace(patch.old, patch.new);
      }
      assert.equal(fs.readFileSync(p, 'utf8'), applyPortableSourceMigration(p, expected), p);
    } else assert.equal(sha(fs.readFileSync(p)), h, p);
  }
  const p = json(root + '/provenance.json');
  assert.equal(p.numericalPolicy, null);
  assert.equal(p.sourceOrHistoryAuthenticated, false);
  for (const id of Object.keys(p.budgetReference)) reference(id);
});
test('G02 old199 exact parity', async () => {
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
  for (const r of old.rawAdmission) {
    const x = loadRawCaseForParity(r.id);
    assert.deepEqual(
      outcome(() =>
        prepareDeclaredDeltaRawObservation(
          x.input,
          x.metadata,
          x.requestBytes,
          x.outputBytes,
          limits,
        ),
      ),
      r.error ? { error: r.error } : { value: r.value },
    );
  }
});

test('G03 independent unit tuple and legacy identity', () => {
  for (const id of ['I01', 'I02', 'I03', 'I04']) {
    const x = loadRawHistoryCase(id),
      r = run(x);
    assert.deepEqual(r.candidate.dependencyUnits, x.expected.candidate.dependencyUnits);
  }
  const x = loadRawHistoryCase('I03'),
    t = x.input.target,
    fields = [
      t.source.repositoryId,
      t.source.revisionId,
      t.repositoryLocatorDigest,
      'native',
      'PYTHON_FILE',
      '新:c',
    ];
  assert.ok(
    x.expected.observation.units.some(
      (u) => u.id === tupleReference('history-native-unit-v1', fields).id,
    ),
  );
  rejection(() => run(loadRawHistoryCase('I05')), 'INVALID_CONTEXT');
  rejection(() => run(loadRawHistoryCase('I06')), 'INVALID_CONTEXT');
});
test('G04 same ledger through self-validating defaults', () => {
  const x = loadRawHistoryCase('I01'),
    input = { ...x.input, observation: x.expected.observation },
    c = context(),
    identity = c.budget;
  for (const mod of [historyInput, historyAPI, delta]) {
    assert.equal(typeof mod.default, 'function');
    const before = { ...identity };
    mod.default(input, c);
    assert.strictEqual(c.budget, identity);
    assert.ok(identity.items > before.items);
    assert.ok(identity.serializedBytes > before.serializedBytes);
  }
  assert.throws(
    () => historyInput.default({ packet: input, limits, budget: identity }, c),
    (e) => e.code === 'INVALID_HISTORY',
  );
});
test('G05 complete independent totals exact and one below', () => {
  for (const c of cases.filter((c) => !loadRawHistoryCase(c.id).expected.error)) {
    const x = loadRawHistoryCase(c.id),
      r = reference(c.id),
      l = { ...limits, ...r.total };
    delete l.serializedBytes;
    delete l.items;
    l.maxSerializedBytes = r.total.serializedBytes;
    l.maxItems = r.total.items;
    assert.deepEqual(run(x, l).candidate, x.expected.candidate, c.id);
    resource(() => run(x, { ...l, maxItems: l.maxItems - 1 }));
    resource(() => run(x, { ...l, maxSerializedBytes: l.maxSerializedBytes - 1 }));
  }
});
test('G06 bounded prefix refuses before later bad data', () => {
  const x = loadRawHistoryCase('I01'),
    c = context();
  requestAPI.readCodeSyntaxRequestSnapshotWithBudget(x.requestBytes, c);
  const bad = Buffer.from(x.outputBytes.toString().split('\n')[0] + '\n{bad\n');
  resource(() =>
    wireAPI.validateCodeSyntaxObservationStreamWithBudget(
      x.requestBytes,
      bad,
      context({ ...limits, maxItems: c.budget.items }),
    ),
  );
  assert.throws(
    () => wireAPI.validateCodeSyntaxObservationStreamWithBudget(x.requestBytes, bad, context()),
    (e) => e.code === 'PROTOCOL_CORRUPTION',
  );
  assert.equal(typeof collector.default, 'function');
  const input = structuredClone(old.merger[0].input);
  input.observations[0].nodes[0].provider.factType = 'EDGE';
  resource(() =>
    collector.default(input, context({ ...limits, maxItems: visitJSON(input).items })),
  );
  assert.throws(
    () => collector.default(input, context()),
    (e) => e.code === 'INVALID_CONTEXT',
  );
});
test('G07 safe descriptors reject without executing getters', () => {
  let calls = 0;
  const x = loadRawHistoryCase('I01');
  x.metadata = Object.defineProperty({}, 'snapshot', {
    enumerable: true,
    get() {
      calls++;
      throw Error('getter called');
    },
  });
  rejection(() => run(x), 'INVALID_INPUT');
  assert.equal(calls, 0);
  for (const id of ['O02', 'O03', 'O04', 'O05', 'O06']) {
    const y = controls(loadRawHistoryCase(id));
    rejection(() => run(y), y.expected.error);
  }
});
test('G08 all original losing and same-name references close', () => {
  const x = loadRawHistoryCase('R01'),
    r = run(x);
  assert.deepEqual(r.candidate.activeSupports, x.expected.candidate.activeSupports);
  const ids = new Set(
    r.raw.codeSyntax.request.payload.owners.map((o) => o.providerNodeRef.providerFactId),
  );
  assert.ok(ids.size > 1);
  for (const id of ['R02', 'R03', 'R04'])
    rejection(() => run(loadRawHistoryCase(id)), 'DANGLING_REFERENCE');
});
test('G09 empty Python keeps MODULE and zero-Code Java keeps coverage', () => {
  for (const id of ['C01', 'C02', 'C03']) {
    const x = loadRawHistoryCase(id),
      r = run(x);
    assert.deepEqual(
      r.candidate.transition.coverageOrigins,
      x.expected.candidate.transition.coverageOrigins,
    );
    if (id !== 'C01')
      assert.equal(
        x.expected.observation.observation.nodes.filter((p) =>
          p.provider.providerFactId.startsWith('java:'),
        ).length,
        0,
      );
  }
  const x = loadRawHistoryCase('C01'),
    request = JSON.parse(x.requestBytes),
    events = x.rawEvents ?? x.outputBytes.toString().trim().split('\n').map(JSON.parse);
  const without = events.filter((e) => e.type !== 'NODE');
  for (const e of without)
    if (e.type === 'CODE_COVERAGE' && e.payload.facet === 'MODULE') {
      e.payload.statistics.coveredSites = 0;
      e.payload.statistics.eligibleSites = 0;
    }
  without.at(-1).payload.counts.nodes = 0;
  Object.assign(x, reseal(request, without));
  rejection(() => run(x), 'PROTOCOL_CORRUPTION');
});
test('G10 one scoped snapshot with existing capabilities and diagnostics', () => {
  const x = loadRawHistoryCase('S01'),
    r = run(x),
    snap = r.candidate.originSnapshotRegistry.find((s) => s.id === x.metadata.snapshot.id);
  assert.deepEqual(snap, x.expected.observation.observation.snapshot);
  assert.equal(r.candidate.originSnapshotRegistry.filter((s) => s.id === snap.id).length, 1);
  const py = run(loadRawHistoryCase('I01'));
  const s = py.candidate.originSnapshotRegistry.find((s) => s.id === py.raw.metadata.snapshot.id);
  assert.deepEqual(
    s.capabilities.map((c) => c.name),
    ['PYTHON_SYNTAX_CODE_V1', 'FRAMEWORK_SYNTAX_OBSERVATION_V1'],
  );
});
test('G11 owned frozen atomic output has no caller aliases', () => {
  const x = loadRawHistoryCase('I01'),
    before = encode(x),
    r = run(x),
    result = encode(r);
  assert.deepEqual(encode(x), before);
  deepFrozen(r);
  x.metadata.snapshot.id = 'mutated';
  x.input.target.inventory[0].path = 'mutated';
  x.requestBytes.fill(0);
  x.outputBytes.fill(0);
  assert.deepEqual(encode(r), result);
  const bad = loadRawHistoryCase('R02'),
    snapshot = encode(bad);
  rejection(() => run(bad), 'DANGLING_REFERENCE');
  assert.deepEqual(encode(bad), snapshot);
});
test('G12 no public exports or authority leak', () => {
  assert.deepEqual(Object.keys(publicAPI).sort(), old.publicExportNames);
  assert.equal(publicAPI.composeDeclaredDeltaRawSupportCandidate, undefined);
  assert.deepEqual(Object.keys(api).sort(), [
    'DeclaredDeltaRawSupportError',
    'composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget',
    'composeDeclaredBindingAwareFullRawSupportCandidate',
    'composeDeclaredBindingDeltaRawSupportCandidateWithBudget',
    'composeDeclaredBindingFullRawSupportCandidate',
    'composeDeclaredDeltaRawSupportCandidate',
    'composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget',
    'composeDeclaredFrameworkSurfaceFullRawSupportCandidate',
    'composeDeclaredFullRawSupportCandidate',
    'default',
  ]);
  const r = run(loadRawHistoryCase('I01'));
  assert.deepEqual(Object.keys(r).sort(), ['candidate', 'kind', 'raw']);
  assert.equal(r.candidate.provenance.kind, 'DECLARED_INPUT');
  for (const k of [
    'budget',
    'limits',
    'packet',
    'scope',
    'ownerHandle',
    'lease',
    'ready',
    'applicable',
    'runSucceeded',
  ])
    assert.equal(Object.hasOwn(r, k), false);
  deepFrozen(r);
});
test('G13 internal import order is independent of index', () => {
  assert.equal(typeof api.composeDeclaredDeltaRawSupportCandidate, 'function');
  const names = [
    'java-node-normalizer',
    'fact-merger-selection',
    'history-transition',
    'declared-delta-raw-support-candidate',
  ];
  for (const first of names) {
    const order = [first, ...names.filter((n) => n !== first), 'index'];
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        order
          .map(
            (n) =>
              'await import(' + JSON.stringify('./packages/providers/dist/' + n + '.js') + ');',
          )
          .join('\n'),
      ],
      { stdio: 'pipe', timeout: 30000 },
    );
  }
});
test('G14 exact registration replacements and old Fixture preservation', async () => {
  const m = json(w + '/local-command-manifest.json');
  assert.equal(
    json('package.json')
      .scripts.test.split(/\s+/)
      .filter((x) => x === m.newRoot).length,
    1,
  );
  let n = 0;
  for (const row of m.registrationReplacements) {
    let before = readHistoricalInput(w + '/before-execution/' + row.path, 'utf8');
    for (const [a, b] of row.pairs) {
      assert.equal(before.split(a).length, 2);
      const currentTarget = b
        .replace('registry57 exact31', 'registry62 exact36')
        .replace(', 57);', ', 62);')
        .replace(', 31);', ', 36);');
      before = before.replace(a, currentTarget);
      n++;
    }
    assert.equal(
      fs.readFileSync(row.path, 'utf8'),
      applyPortableSourceMigration(row.path, before),
      row.path,
    );
  }
  assert.equal(n, 21);
  const r = await discoverFixtures('fixtures');
  assert.equal(r.filter((x) => x.manifest.id === 'p1-declared-raw-history-candidate-v1').length, 1);
  for (const [p, h] of Object.entries(json(w + '/planning-start.json').fixtureSha256))
    assertHistoricalFixturePin(p, h);
});
test('G15 old Java and Python normalization stays exact', async () => {
  assert.equal(typeof java.default, 'function');
  const normalizationRoot = 'fixtures/normalization/canonical-normalization';
  const literalInput = json(normalizationRoot + '/inputs/result.json');
  const complete = java.default(literalInput, context());
  assert.deepEqual(complete.nodes, json(normalizationRoot + '/expected/nodes.json'));
  assert.deepEqual(complete.edges, json(normalizationRoot + '/expected/edges.json'));
  for (const bound of [
    {
      ...limits,
      maxSerializedBytes:
        visitJSON({ request: literalInput.request, events: literalInput.events }).serializedBytes -
        1,
    },
    {
      ...limits,
      maxItems: visitJSON({ request: literalInput.request, events: literalInput.events }).items - 1,
    },
  ])
    resource(() => java.default(literalInput, context(bound)));
  for (const c of old.full) {
    if (!c.candidate.value) continue;
    const x = await loadCompositionCase(c.id);
    if (!x.metadata.java) continue;
    const ids = new Set(
      x.metadata.java.events
        .filter((e) => e.type === 'NODE' || e.type === 'EDGE')
        .map((e) => e.payload.providerFactId),
    );
    const result = java.default({ ...x.metadata.java, stderr: '' }, context());
    assert.deepEqual(
      result.nodes,
      c.candidate.value.normalized.nodePairs.filter((p) => ids.has(p.provider.providerFactId)),
    );
    assert.deepEqual(
      result.edges,
      c.candidate.value.normalized.edgePairs.filter((p) => ids.has(p.provider.providerFactId)),
    );
  }
  for (const p of old.producer) {
    const x = await instantiateProducerCase(p.id, '/fixture/code-syntax-producer'),
      v = publicAPI.validateCodeSyntaxObservationStream(x.requestBytes, x.expectedOutputBytes),
      r = v.request.payload;
    assert.deepEqual(
      python.default(
        {
          targetSource: r.targetSource,
          providerId: r.providerId,
          providerSnapshotId: r.providerSnapshotId,
          sourceFiles: r.sourceFiles,
          nodes: v.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
          edges: v.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
        },
        context(),
      ),
      p.normalized,
    );
  }
});
test('G16 budgeted collector and selector preserve original semantics and counts', () => {
  assert.equal(typeof collector.default, 'function');
  assert.equal(typeof selector.default, 'function');
  for (const x of old.merger) assert.deepEqual(collector.default(x.input, context()), x.result);
  assert.deepEqual(selector.default(old.selection.input, context()), old.selection.result);
  const c = context();
  collector.default(old.merger[0].input, c);
  assert.deepEqual(c.budget, span('I01', 'support-input', 'support-result'));
  const d = context();
  selector.default(old.selection.input, d);
  assert.deepEqual(d.budget, span('I01', 'selector-input', 'selector-result'));
});
test('G17 exact tuple representation and arithmetic refusals', () => {
  assert.equal(typeof budgetAPI.chargeCompositionIdentityTuple, 'function');
  for (const fields of [
    ['repo', 'rev', '', ':', '新😀'],
    [0, 1, Number.MAX_SAFE_INTEGER],
  ]) {
    const domain = 'history-native-unit-v1',
      r = tupleReference(domain, fields),
      c = context();
    budgetAPI.chargeCompositionIdentityTuple(domain, fields, c);
    assert.deepEqual(c.budget, {
      serializedBytes: r.serializedBytes,
      items: r.items,
    });
    resource(() =>
      budgetAPI.chargeCompositionIdentityTuple(
        domain,
        fields,
        context({ ...limits, maxSerializedBytes: r.serializedBytes - 1 }),
      ),
    );
    resource(() =>
      budgetAPI.chargeCompositionIdentityTuple(
        domain,
        fields,
        context({ ...limits, maxItems: r.items - 1 }),
      ),
    );
  }
  for (const v of [-0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '\ud800'])
    assert.throws(
      () => budgetAPI.chargeCompositionIdentityTuple('history-native-unit-v1', [v], context()),
      (e) => e.code === 'INVALID_INPUT',
    );
  const bad = context();
  bad.budget.items = Number.MAX_SAFE_INTEGER;
  resource(() => budgetAPI.chargeCompositionIdentityTuple('history-native-unit-v1', ['x'], bad));
});
test('G18 no-observation mode rejects before raw properties', () => {
  let calls = 0;
  const forbidden = new Proxy(
    {},
    {
      getPrototypeOf() {
        calls++;
        throw Error('touched raw');
      },
      ownKeys() {
        calls++;
        throw Error('touched raw');
      },
    },
  );
  for (const id of ['E01', 'E02']) {
    const x = loadRawHistoryCase(id);
    x.metadata = forbidden;
    x.requestBytes = forbidden;
    x.outputBytes = forbidden;
    rejection(() => run(x), 'UNSUPPORTED_SCOPE');
  }
  assert.equal(calls, 0);
});
