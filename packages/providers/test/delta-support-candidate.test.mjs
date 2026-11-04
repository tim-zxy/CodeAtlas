import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeDeclaredDeltaSupportCandidate,
  DeltaSupportCompositionError,
} from '../dist/delta-support-candidate.js';
import {
  prepareHistoryTransitionDraft,
  planHistoryTransition,
} from '../dist/history-transition.js';
import { assertDeepFrozen } from './fixtures/history-transition-helpers.mjs';
import { cases, loadDeltaCase, limits } from './fixtures/delta-support-helpers.mjs';
for (const c of cases)
  test('delta whole literal ' + c.id, () => {
    const { input, expected } = loadDeltaCase(c.id);
    if (expected.error)
      assert.throws(
        () => composeDeclaredDeltaSupportCandidate(input, limits),
        (e) =>
          e instanceof DeltaSupportCompositionError &&
          e.code === expected.error &&
          e.message === expected.error,
      );
    else {
      const r = composeDeclaredDeltaSupportCandidate(input, limits);
      assert.deepEqual(r, expected);
      assert.equal(Object.keys(r).length, 10);
      assertDeepFrozen(assert, r);
    }
  });
test('D08 new boundary rejects hidden nonwinner; old public keeps original behavior', () => {
  const p = loadDeltaCase('D08-hidden-unresolved').input;
  assert.doesNotThrow(() => planHistoryTransition(p, limits));
  assert.throws(
    () => composeDeclaredDeltaSupportCandidate(p, limits),
    (e) => e.code === 'DANGLING_REFERENCE',
  );
});
test('D03 retained originals and foreign survivor are not relabelled to newest snapshot', () => {
  const p = loadDeltaCase('D03-survivor').input,
    r = composeDeclaredDeltaSupportCandidate(p, limits),
    old = p.history.state.supports.find((s) => s.binding.providerFact.providerId === 'external');
  assert.deepEqual(
    r.activeSupports.find((s) => s.evidence.id === old.evidence.id),
    old,
  );
  assert.equal(r.merged.nodes.find((n) => n.id === 'node:a').confidence.method, 'fixture-parser');
  assert.equal(
    r.activeSupports.filter(
      (s) => s.binding.providerFact.providerId === 'native' && s.canonical.id === 'node:a',
    ).length,
    0,
  );
  assert.equal(r.originSnapshotRegistry.length, 3);
});
test('D10 no authority/basis/budget fields and caller mutation is isolated', () => {
  const p = loadDeltaCase('D02-python').input,
    r = composeDeclaredDeltaSupportCandidate(p, limits),
    copy = structuredClone(r);
  p.target.inventory.length = 0;
  p.history.state.supports[0].canonical.name = 'mutated';
  assert.deepEqual(r, copy);
  for (const k of [
    'authenticated',
    'ready',
    'applicable',
    'budget',
    'basis',
    'codeActivationDigest',
    'syntaxEvidence',
  ])
    assert.equal(Object.hasOwn(r, k), false);
  assert.equal(r.provenance.kind, 'DECLARED_INPUT');
  assert.throws(
    () =>
      composeDeclaredDeltaSupportCandidate(
        prepareHistoryTransitionDraft(loadDeltaCase('D01-no-op').input, limits),
        limits,
      ),
    (e) => e.code === 'INVALID_HISTORY',
  );
});
test('D10 unsafe objects fail without callbacks', () => {
  let calls = 0;
  for (const change of [
    (p) =>
      Object.defineProperty(p, 'observation', {
        enumerable: true,
        get() {
          calls++;
          return null;
        },
      }),
    (p) => {
      p.observation = new Proxy(
        {},
        {
          ownKeys() {
            calls++;
            return [];
          },
        },
      );
    },
    (p) => {
      p.observation = p;
    },
  ]) {
    const p = loadDeltaCase('D01-no-op').input;
    change(p);
    assert.throws(
      () => composeDeclaredDeltaSupportCandidate(p, limits),
      (e) => e.code === 'INVALID_HISTORY',
    );
  }
  assert.equal(calls, 0);
});
// Independent mechanical accounting over FROZEN expected data, no product
// serializer/candidate/selector computes expected counters or graph goldens.
const cost = (v) => {
  let items = 0;
  const stack = [v];
  while (stack.length) {
    const x = stack.pop();
    items++;
    if (x !== null && typeof x === 'object') stack.push(...Object.values(x));
  }
  return { items, serializedBytes: Buffer.byteLength(JSON.stringify(v)) };
};
function expectedSpent(p, expected) {
  const b = { ...prepareHistoryTransitionDraft(p, limits).budget };
  const add = (v) => {
    const c = cost(v);
    b.items += c.items;
    b.serializedBytes += c.serializedBytes;
  };
  if (p.observation)
    for (const pair of [...p.observation.observation.nodes, ...p.observation.observation.edges]) {
      const data = { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: pair.canonical };
      add(data);
      add(data);
    }
  for (const s of expected.activeSupports) add(s);
  for (const u of expected.dependencyUnits) add(u);
  for (const s of expected.originSnapshotRegistry) add(s);
  for (const s of expected.activeSupports) {
    const f = s.canonical;
    if (f.sourceRange)
      add({ evidenceId: s.evidence.id, role: 'SOURCE_RANGE', id: f.sourceRange.sourceFileId });
    if (s.factType === 'EDGE') {
      add({ evidenceId: s.evidence.id, role: 'EDGE_SOURCE', id: f.source.id });
      if (f.target.state === 'RESOLVED')
        add({ evidenceId: s.evidence.id, role: 'EDGE_TARGET', id: f.target.target.id });
      else
        for (const n of f.target.candidates)
          add({ evidenceId: s.evidence.id, role: 'EDGE_CANDIDATE', id: n.id });
    }
  }
  add(expected.merged);
  add(expected);
  return b;
}
for (const id of ['D11-budget-base', 'D02-python', 'D09-unresolved'])
  test('D11 independent cumulative accounting ' + id, () => {
    const { input, expected } = loadDeltaCase(id),
      b = expectedSpent(input, expected),
      phase1 = prepareHistoryTransitionDraft(input, limits).budget;
    for (const [prop, counter] of [
      ['maxSerializedBytes', 'serializedBytes'],
      ['maxItems', 'items'],
    ]) {
      const n = b[counter];
      assert.ok(n > phase1[counter]);
      assert.deepEqual(
        composeDeclaredDeltaSupportCandidate(input, { ...limits, [prop]: n }),
        expected,
      );
      assert.throws(
        () => composeDeclaredDeltaSupportCandidate(input, { ...limits, [prop]: n - 1 }),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
      );
      const separate = Math.max(phase1[counter], n - phase1[counter]);
      assert.ok(separate < n);
      assert.throws(
        () => composeDeclaredDeltaSupportCandidate(input, { ...limits, [prop]: separate }),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
      );
    }
  });

import { historyDraftDigest } from '../dist/history-transition-input.js';
import { collectMergeSupports } from '../dist/fact-merger-input.js';
const valueDigest = (candidate) =>
  historyDraftDigest({ kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate }, limits, {
    items: 0,
    serializedBytes: 0,
  });
test('D09 source-backed package support wins while minimum confidence and originals remain', () => {
  const p = loadDeltaCase('D01-no-op').input,
    old = p.history.state,
    packageCandidate = structuredClone(
      old.supports.find((s) => s.canonical.id === 'node:java').canonical,
    );
  packageCandidate.confidence = { score: 0.4, method: 'fixture-parser', reasons: [] };
  const snapshot = old.snapshots.find((s) => s.providerId === 'external');
  const [support] = collectMergeSupports({
    repositoryId: p.target.source.repositoryId,
    revisionId: p.target.source.revisionId,
    observations: [
      {
        snapshot,
        nodes: [
          {
            provider: {
              factType: 'NODE',
              providerId: 'external',
              providerFactId: 'opaque:package',
            },
            canonical: packageCandidate,
          },
        ],
        edges: [],
      },
    ],
  });
  const { inputPath: _, ...base } = support;
  const external = {
      ...base,
      dependencyUnitIds: ['external:b'],
      valueDigest: valueDigest(packageCandidate),
    },
    range = { sourceFileId: 'j', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 };
  for (const state of [p.history.state, p.current]) {
    const native = state.supports.find(
      (s) => s.binding.providerFact.providerId === 'native' && s.canonical.id === 'node:java',
    );
    native.canonical.sourceRange = structuredClone(range);
    native.valueDigest = valueDigest(native.canonical);
    state.supports.push(structuredClone(external));
    state.supports.sort((a, b) => {
      for (const key of ['factType', 'providerId', 'providerFactId']) {
        const aa = key === 'factType' ? a.factType : a.binding.providerFact[key],
          bb = key === 'factType' ? b.factType : b.binding.providerFact[key];
        if (aa !== bb) return aa < bb ? -1 : 1;
      }
      return a.evidence.id < b.evidence.id ? -1 : 1;
    });
    const selected = state.nodes.find((n) => n.id === 'node:java');
    selected.sourceRange = structuredClone(range);
    selected.confidence = {
      score: 0.4,
      method: 'fact-merger-min-v1',
      reasons: ['minimum active support score'],
    };
  }
  const r = composeDeclaredDeltaSupportCandidate(p, limits),
    node = r.merged.nodes.find((n) => n.id === 'node:java'),
    exp = r.merged.explanations.find((e) => e.fact.id === 'node:java');
  assert.deepEqual(node.sourceRange, range);
  assert.equal(node.confidence.score, 0.4);
  assert.equal(exp.selectionRule, 'SOURCE_BACKED');
  assert.deepEqual(exp.conflicts, ['CONFIDENCE_VARIANT', 'DISPLAY_VARIANT']);
  assert.equal(
    r.activeSupports.find((s) => s.evidence.id === external.evidence.id).canonical.sourceRange,
    null,
  );
  const b = expectedSpent(p, r);
  for (const [prop, counter] of [
    ['maxSerializedBytes', 'serializedBytes'],
    ['maxItems', 'items'],
  ]) {
    assert.deepEqual(composeDeclaredDeltaSupportCandidate(p, { ...limits, [prop]: b[counter] }), r);
    assert.throws(
      () => composeDeclaredDeltaSupportCandidate(p, { ...limits, [prop]: b[counter] - 1 }),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
});
test('D02 removed Java member keeps one complete remaining group', () => {
  const p = loadDeltaCase('D02-java').input;
  p.target.inventory = p.target.inventory.filter((f) => f.id !== 'k');
  p.observation.units[0].sourceFileIds = ['j'];
  const r = composeDeclaredDeltaSupportCandidate(p, limits);
  assert.deepEqual(r.dependencyUnits.find((u) => u.id === 'java').sourceFileIds, ['j']);
  assert.equal(r.transition.supportDecisions.filter((d) => d.action === 'SUPERSEDE').length, 1);
  assert.equal(r.transition.diff.find((d) => d.before?.id === 'k').kind, 'REMOVED');
});
test('D09 escaped ProviderFactRef is ordered by raw tuple, never JSON spelling', () => {
  const p = loadDeltaCase('D02-python').input,
    o = p.observation,
    a = structuredClone(o.observation.nodes[0]),
    b = structuredClone(a);
  a.provider.providerFactId = 'opaque:\nx';
  b.provider.providerFactId = 'opaque:Ax';
  Object.assign(a.canonical, { id: 'node:escaped', factKey: 'fact:escaped' });
  Object.assign(b.canonical, { id: 'node:letter', factKey: 'fact:letter' });
  o.observation.nodes = [a, b];
  o.supportDependencies = [a, b].map((x) => ({ providerFact: x.provider, unitIds: ['py:a'] }));
  const r = composeDeclaredDeltaSupportCandidate(p, limits);
  assert.deepEqual(
    r.activeSupports
      .filter((s) => ['opaque:\nx', 'opaque:Ax'].includes(s.binding.providerFact.providerFactId))
      .map((s) => s.binding.providerFact.providerFactId),
    ['opaque:\nx', 'opaque:Ax'],
  );
});

test('D02 added Python Source has its own complete unit and active support', () => {
  const p = loadDeltaCase('D02-python').input,
    o = p.observation,
    file = structuredClone(p.target.inventory.find((f) => f.id === 'a'));
  file.id = 'c';
  file.path = 'c.py';
  p.target.inventory.push(file);
  p.target.inventory.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  o.units.push({ id: 'py:c', providerId: 'native', kind: 'PYTHON_FILE', sourceFileIds: ['c'] });
  const pair = structuredClone(o.observation.nodes[0]);
  pair.provider.providerFactId = 'opaque:c';
  Object.assign(pair.canonical, { id: 'node:c', factKey: 'fact:c', name: 'c', qualifiedName: 'c' });
  o.observation.nodes.push(pair);
  o.supportDependencies.push({ providerFact: pair.provider, unitIds: ['py:c'] });
  o.coverage.push(...structuredClone(o.coverage).map((c) => ({ ...c, unitId: 'py:c' })));
  const r = composeDeclaredDeltaSupportCandidate(p, limits);
  assert.deepEqual(r.dependencyUnits.find((u) => u.id === 'py:c').sourceFileIds, ['c']);
  assert.equal(r.transition.coverageOrigins.filter((c) => c.unitId === 'py:c').length, 2);
  assert.equal(r.activeSupports.filter((s) => s.canonical.id === 'node:c').length, 1);
  assert.equal(r.merged.nodes.filter((n) => n.id === 'node:c').length, 1);
});
test('D01 origin registry preserves unused history without calling it a fresh observation', () => {
  const p = loadDeltaCase('D01-no-op').input,
    unused = {
      ...structuredClone(p.history.state.snapshots[0]),
      id: 'snapshot:unused',
      requestedRevisionFingerprint: 'content:older',
    };
  for (const s of [p.history.state, p.current]) s.snapshots.push(structuredClone(unused));
  const r = composeDeclaredDeltaSupportCandidate(p, limits);
  assert.equal(r.mode, 'NO_OP');
  assert.deepEqual(
    r.originSnapshotRegistry.find((s) => s.id === unused.id),
    unused,
  );
  assert.equal(
    r.merged.evidence.some((e) => e.providerSnapshotId === unused.id),
    false,
  );
  assert.equal(r.provenance.observation, null);
});
