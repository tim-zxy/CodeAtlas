import { readHistoricalInput } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  cases,
  loadScopeCase,
  sha,
} from '../fixtures/phase1/declared-observation-scope/corpus.mjs';
import {
  prepareHistoryTransition,
  chargeHistoryJSON,
  HistoryTransitionError,
} from '../packages/providers/dist/history-transition-input.js';
import { prepareHistoryTransitionDraft } from '../packages/providers/dist/history-transition.js';
import { composeDeclaredDeltaSupportCandidate } from '../packages/providers/dist/delta-support-candidate.js';
import {
  limits,
  loadHistoryCase,
  assertDeepFrozen,
} from '../packages/providers/test/fixtures/history-transition-helpers.mjs';
import {
  loadCompositionCase,
  reseal,
  limits as compositionLimits,
} from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
import { readNativeCompositionInputs } from '../packages/providers/dist/native-composition-input.js';
import { discoverFixtures, parseFixtureManifest } from '../packages/evaluation/dist/index.js';
const { prepareDeclaredNativeObservationScope: prepareScope } =
  await import('../packages/providers/dist/history-transition.js');
const root = new URL('../fixtures/phase1/declared-observation-scope/', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const old = JSON.parse(
  readHistoricalInput(
    '.superpowers/sdd/2026-10-26-phase1-declared-observation-scope/old-behavior.json',
    'utf8',
  ),
);
const reject = (f, code) =>
  assert.throws(
    f,
    (e) => e instanceof HistoryTransitionError && e.code === code && e.message === code,
  );
const compareOutcome = (fn, r, key) => {
  let value, error;
  try {
    value = fn();
  } catch (e) {
    error = e;
  }
  if (r.error) {
    assert.ok(error);
    assert.equal(error.code, r.error, r.caseId);
    assert.equal(error.message, r.error);
  } else {
    if (error) throw error;
    assert.deepEqual(value[key], r[key], r.caseId);
    if (key === 'transition') assert.deepEqual(value.budget, r.budget, r.caseId);
  }
};
test('strict manifest and frozen literal scope corpus', () => {
  assert.equal(cases.length, 28);
  assert.equal(new Set(cases.map((c) => c.id)).size, 28);
  assert.equal(new Set(cases.map((c) => c.family)).size, 7);
  assert.equal(
    parseFixtureManifest(json('fixture.json'), 'fixture.json').id,
    'p1-declared-observation-scope-v1',
  );
  const p = json('provenance.json');
  for (const [path, h] of Object.entries(p.sha256))
    assert.equal(sha(readFileSync(new URL(path, root))), h, path);
  for (const [path, h] of Object.entries(p.inputOrigins))
    assert.equal(sha(readFileSync(new URL('../' + path, import.meta.url))), h, path);
});
for (const c of cases)
  test('pre-observation scope matches independent literals ' + c.id, () => {
    assert.equal(typeof prepareScope, 'function');
    const { input, expected } = loadScopeCase(c.id),
      before = structuredClone(input);
    if (expected.error) reject(() => prepareScope(input, limits), expected.error);
    else {
      const p = prepareScope(input, limits);
      assert.deepEqual(p.scope, expected.scope, c.id);
      assert.deepEqual(Object.keys(p).sort(), ['packet', 'limits', 'budget', 'scope'].sort());
      assertDeepFrozen(assert, p.scope);
      assertDeepFrozen(assert, p.packet);
      assertDeepFrozen(assert, p.limits);
    }
    assert.deepEqual(input, before, c.id);
  });
test('old46 transition results errors and budgets are unchanged', () => {
  assert.equal(old.history.length, 46);
  for (const r of old.history)
    compareOutcome(
      () => prepareHistoryTransitionDraft(loadHistoryCase(r.caseId).input, limits),
      r,
      'transition',
    );
});
test('old35 delta candidates remain exact', () => {
  assert.equal(old.delta.length, 35);
  for (const r of old.delta) {
    const input = JSON.parse(
      readFileSync(
        new URL(
          '../fixtures/phase1/delta-support-candidate/cases/' + r.caseId + '/input.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    compareOutcome(
      () => ({ candidate: composeDeclaredDeltaSupportCandidate(input, limits) }),
      r,
      'candidate',
    );
  }
});
test('scope stays declared private owned and non-authorizing', async () => {
  const { input, expected } = loadScopeCase('S01-no-op'),
    p = prepareScope(input, limits);
  assert.notStrictEqual(p.packet, input);
  assert.notStrictEqual(p.limits, limits);
  input.target.inventory[0].path = 'changed';
  input.target.source.contentFingerprint = 'changed';
  assert.deepEqual(p.scope, expected.scope);
  assert.equal(p.scope.provenance.kind, 'DECLARED_INPUT');
  for (const word of [
    'ready',
    'authenticated',
    'applicable',
    'settled',
    'basis',
    'ownerHandle',
    'lease',
    'token',
    'confidence',
    'syntax',
  ])
    assert.equal(Object.hasOwn(p.scope, word), false, word);
  const api = await import('../packages/providers/dist/index.js');
  assert.equal(Object.hasOwn(api, 'prepareDeclaredNativeObservationScope'), false);
  for (const key of ['scope', 'stageDigest', 'ownerHandle', 'lease', 'authenticated']) {
    const x = loadScopeCase('S01-no-op').input;
    x[key] = { ready: true };
    reject(() => prepareScope(x, limits), 'INVALID_HISTORY');
  }
  const external = p.packet.history.state.supports.find(
    (s) => s.binding.providerFact.providerId === 'external',
  );
  assert.ok(external);
  assert.notDeepEqual(
    external.canonical,
    p.packet.history.state.nodes.find((n) => n.id === external.canonical.id),
  );
});
test('one shared budget covers scope output and rejects unsafe inputs', () => {
  const input = loadScopeCase('S01-no-op').input,
    p = prepareScope(input, limits),
    parsed = prepareHistoryTransition(input, limits),
    output = { items: 0, serializedBytes: 0 };
  chargeHistoryJSON(p.scope, limits, output);
  assert.ok(p.budget.items >= parsed.budget.items + output.items);
  assert.ok(p.budget.serializedBytes >= parsed.budget.serializedBytes + output.serializedBytes);
  for (const key of ['maxItems', 'maxSerializedBytes']) {
    const spent = key === 'maxItems' ? p.budget.items : p.budget.serializedBytes;
    reject(() => prepareScope(input, { ...limits, [key]: spent - 1 }), 'RESOURCE_LIMIT_EXCEEDED');
  }
  let calls = 0;
  const getter = loadScopeCase('S01-no-op').input;
  Object.defineProperty(getter, 'target', {
    enumerable: true,
    get() {
      calls++;
      throw Error('private');
    },
  });
  reject(() => prepareScope(getter, limits), 'INVALID_HISTORY');
  const proxy = new Proxy(input, {
    ownKeys() {
      calls++;
      throw Error('private');
    },
  });
  reject(() => prepareScope(proxy, limits), 'INVALID_HISTORY');
  const cycle = loadScopeCase('S01-no-op').input;
  cycle.extra = cycle;
  reject(() => prepareScope(cycle, limits), 'INVALID_HISTORY');
  const nonplain = loadScopeCase('S01-no-op').input;
  Object.setPrototypeOf(nonplain, new Date());
  reject(() => prepareScope(nonplain, limits), 'INVALID_HISTORY');
  assert.equal(calls, 0);
});
test('full-only composition still refuses partial and removed scope', async () => {
  const partial = await loadCompositionCase('inventory-omission');
  assert.throws(
    () =>
      readNativeCompositionInputs(
        partial.metadata,
        partial.requestBytes,
        partial.outputBytes,
        compositionLimits,
      ),
    (e) => e.code === 'INVALID_CONTEXT',
  );
  const c = await loadCompositionCase('mixed'),
    r = JSON.parse(c.requestBytes);
  r.payload.removedSourceFiles.push({
    id: 'gone',
    path: 'gone.py',
    previousContentFingerprint: 'sha256:' + 'a'.repeat(64),
  });
  Object.assign(c, reseal(r, c.outputBytes.toString().trimEnd().split('\n').map(JSON.parse)));
  assert.throws(
    () => readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, compositionLimits),
    (e) => e.code === 'UNSUPPORTED_SCOPE',
  );
});
test('one root registration and prospective local Fixture registration catalog0', async () => {
  const command = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url)),
  ).scripts.test.split(/\s+/);
  assert.equal(
    command.filter((x) => x === 'scripts/test-declared-observation-scope.mjs').length,
    1,
  );
  const fixtures = await discoverFixtures('fixtures');
  assert.equal(
    fixtures.filter((x) => x.manifest.id === 'p1-declared-observation-scope-v1').length,
    1,
  );
  const { nativeSyntaxObservationProfiles } =
    await import('../packages/runtime/dist/native-metadata-profiles.js');
  assert.equal(nativeSyntaxObservationProfiles.length, 0);
});
