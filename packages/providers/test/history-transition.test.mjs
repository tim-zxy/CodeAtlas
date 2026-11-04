import assert from 'node:assert/strict';
import test from 'node:test';
import { planHistoryTransition } from '../dist/history-transition.js';
import { prepareHistoryTransition } from '../dist/history-transition-input.js';
import {
  cases,
  loadHistoryCase,
  limits,
  assertDeepFrozen,
} from './fixtures/history-transition-helpers.mjs';
for (const c of cases)
  test('transition ' + c.id, () => {
    const { input, expected } = loadHistoryCase(c.id);
    if (expected.error)
      assert.throws(
        () => planHistoryTransition(input, limits),
        (e) => e.code === expected.error && e.message === expected.error,
      );
    else {
      const result = planHistoryTransition(input, limits);
      assert.deepEqual(result, expected);
      assertDeepFrozen(assert, result);
      assert.equal(Object.hasOwn(result, 'authenticated'), false);
      assert.equal(Object.hasOwn(result, 'ready'), false);
      assert.equal(Object.hasOwn(result, 'applicable'), false);
    }
  });
test('H10 valid other-provider origin survives Native withdrawal; H11 expired dependency refuses', () => {
  const c = loadHistoryCase('H10-survivor'),
    r = planHistoryTransition(c.input, limits);
  const external = c.input.history.state.supports.find(
    (x) => x.binding.providerFact.providerId === 'external',
  );
  assert.deepEqual(
    r.supportDecisions.find((x) => x.evidenceId === external.evidence.id),
    { evidenceId: external.evidence.id, action: 'RETAIN', replacementEvidenceId: null },
  );
  const expired = loadHistoryCase('H11-removed').input;
  assert.throws(
    () => planHistoryTransition(expired, limits),
    (e) => e.code === 'OTHER_PROVIDER_REVALIDATION_REQUIRED',
  );
});
test('H16 caller mutation cannot alter frozen result or reuse old history', () => {
  const p = loadHistoryCase('H07-python').input,
    r = planHistoryTransition(p, limits),
    saved = structuredClone(r);
  p.target.inventory[0].contentFingerprint = 'mutation';
  p.history.state.supports[0].canonical.name = 'rewrite';
  assert.deepEqual(r, saved);
  assert.throws(() => {
    r.diff[0].kind = 'MODIFIED';
  }, TypeError);
});
test('H18 derived ledger and final serialization are charged cumulatively', () => {
  const p = loadHistoryCase('H07-python').input,
    prepared = prepareHistoryTransition(p, limits);
  for (const [key, counter] of [
    ['maxSerializedBytes', 'serializedBytes'],
    ['maxItems', 'items'],
  ]) {
    let lo = prepared.budget[counter],
      hi = Number.MAX_SAFE_INTEGER;
    assert.throws(
      () => planHistoryTransition(p, { ...limits, [key]: lo }),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
    while (lo + 1 < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      try {
        planHistoryTransition(p, { ...limits, [key]: mid });
        hi = mid;
      } catch (e) {
        assert.equal(e.code, 'RESOURCE_LIMIT_EXCEEDED');
        lo = mid;
      }
    }
    assert.deepEqual(
      planHistoryTransition(p, { ...limits, [key]: hi }),
      loadHistoryCase('H07-python').expected,
    );
    assert.throws(
      () => planHistoryTransition(p, { ...limits, [key]: hi - 1 }),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
});
test('H15 old Syntax basis is never copied into a new canonical projection', () => {
  const p = loadHistoryCase('H15-old-basis').input,
    r = planHistoryTransition(p, limits);
  assert.notEqual(
    p.history.state.syntaxOrigins[0].basis.codeActivationDigest,
    p.history.state.basis.codeActivationDigest,
  );
  assert.deepEqual(r.syntaxRequirements, [
    { originId: 'syntax:a', action: 'REVALIDATE_FINAL_BASIS' },
  ]);
  assert.equal(Object.hasOwn(r, 'syntaxEvidence'), false);
});

test('H08 Java member removal reobserves the entire remaining group', () => {
  const p = loadHistoryCase('H08-java').input;
  p.target.inventory = p.target.inventory.filter((f) => f.id !== 'k');
  p.observation.units[0].sourceFileIds = ['j'];
  const r = planHistoryTransition(p, limits);
  assert.equal(r.diff.find((d) => d.before?.id === 'k').kind, 'REMOVED');
  assert.equal(r.supportDecisions.filter((d) => d.action === 'SUPERSEDE').length, 1);
  assert.equal(r.supportDecisions.filter((d) => d.action === 'RETAIN').length, 3);
  const missing = structuredClone(p);
  missing.observation = null;
  assert.throws(
    () => planHistoryTransition(missing, limits),
    (e) => e.code === 'FULL_ANALYSIS_REQUIRED',
  );
});
test('H05 added Python unit is observed; removal/add path reuse requires full analysis', () => {
  const p = loadHistoryCase('H07-python').input,
    f = structuredClone(p.target.inventory.find((f) => f.id === 'a'));
  f.id = 'c';
  f.path = 'c.py';
  p.target.inventory.push(f);
  p.target.inventory.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const o = p.observation;
  o.units.push({ id: 'py:c', providerId: 'native', kind: 'PYTHON_FILE', sourceFileIds: ['c'] });
  const pair = structuredClone(o.observation.nodes[0]);
  pair.provider.providerFactId = 'opaque:c';
  Object.assign(pair.canonical, { id: 'node:c', factKey: 'fact:c', name: 'c', qualifiedName: 'c' });
  o.observation.nodes.push(pair);
  o.supportDependencies.push({ providerFact: pair.provider, unitIds: ['py:c'] });
  o.coverage.push(...structuredClone(o.coverage).map((c) => ({ ...c, unitId: 'py:c' })));
  const r = planHistoryTransition(p, limits);
  assert.equal(r.diff.find((d) => d.after?.id === 'c').kind, 'ADDED');
  assert.equal(r.addedEvidenceIds.length, 2);
  const bad = loadHistoryCase('H09-removal').input;
  const reuse = structuredClone(f);
  reuse.path = 'a.py';
  bad.target.inventory.splice(2, 0, reuse);
  assert.throws(
    () => planHistoryTransition(bad, limits),
    (e) => e.code === 'FULL_ANALYSIS_REQUIRED',
  );
});
test('H09 a fully removed Java group needs no fake new snapshot', () => {
  const p = loadHistoryCase('H02-present').input;
  p.target.inventory = p.target.inventory.filter((f) => !['j', 'k'].includes(f.id));
  p.target.source.contentFingerprint = 'content:removed-java';
  const r = planHistoryTransition(p, limits);
  assert.equal(r.supportDecisions.filter((s) => s.action === 'INVALIDATE').length, 1);
  assert.equal(r.addedEvidenceIds.length, 0);
  assert.equal(
    r.coverageOrigins.some((c) => c.unitId === 'java'),
    false,
  );
});
test('H14 complete empty census is distinct from absent Code/history', () => {
  const p = loadHistoryCase('H02-present').input;
  for (const s of [p.history.state, p.current])
    for (const k of [
      'inventory',
      'contracts',
      'units',
      'snapshots',
      'nodes',
      'edges',
      'supports',
      'coverage',
      'syntaxOrigins',
    ])
      s[k] = [];
  p.target.inventory = [];
  p.target.contracts = [];
  const r = planHistoryTransition(p, limits);
  assert.equal(r.kind, 'NO_OP_DRAFT');
  assert.deepEqual(r.diff, []);
  assert.deepEqual(r.coverageOrigins, []);
  assert.deepEqual(r.survivingFactKeys, []);
});
test('H12 late settlement declaration and missing observation cannot activate', () => {
  const p = loadHistoryCase('H07-python').input;
  p.observation.settlement = 'LATE_SUCCEEDED';
  assert.throws(
    () => planHistoryTransition(p, limits),
    (e) => e.code === 'INVALID_HISTORY',
  );
  p.observation = null;
  assert.throws(
    () => planHistoryTransition(p, limits),
    (e) => e.code === 'FULL_ANALYSIS_REQUIRED',
  );
});
test('H12 cannot redefine an existing dependency unit ID to bypass old Source', () => {
  const p = loadHistoryCase('H07-python').input;
  p.observation.units[0].id = 'java';
  p.observation.supportDependencies[0].unitIds = ['java'];
  for (const c of p.observation.coverage) c.unitId = 'java';
  assert.throws(
    () => planHistoryTransition(p, limits),
    (e) => e.code === 'INVALID_HISTORY',
  );
});

test('H12 typed ProviderFactRef ordering compares data, not JSON escape spelling', () => {
  const p = loadHistoryCase('H07-python').input,
    o = p.observation;
  const first = structuredClone(o.observation.nodes[0]),
    second = structuredClone(first);
  first.provider.providerFactId = 'opaque:\nx';
  second.provider.providerFactId = 'opaque:Ax';
  Object.assign(first.canonical, { id: 'node:new-1', factKey: 'fact:new-1' });
  Object.assign(second.canonical, { id: 'node:new-2', factKey: 'fact:new-2' });
  o.observation.nodes = [first, second];
  o.supportDependencies = [first, second].map((x) => ({
    providerFact: x.provider,
    unitIds: ['py:a'],
  }));
  assert.equal(planHistoryTransition(p, limits).addedEvidenceIds.length, 2);
});

test('H12 added Python Source cannot reuse an untouched Python unit identity', () => {
  const p = loadHistoryCase('H02-present').input,
    c = structuredClone(p.target.inventory.find((f) => f.id === 'a'));
  c.id = 'c';
  c.path = 'c.py';
  p.target.inventory.push(c);
  p.target.inventory.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  p.target.source.contentFingerprint = 'content:new';
  p.observation = loadHistoryCase('H07-python').input.observation;
  p.observation.units[0].sourceFileIds = ['c'];
  const pair = p.observation.observation.nodes[0];
  pair.provider.providerFactId = 'opaque:c';
  Object.assign(pair.canonical, { id: 'node:c', factKey: 'fact:c', name: 'c', qualifiedName: 'c' });
  p.observation.supportDependencies[0].providerFact = pair.provider;
  assert.throws(
    () => planHistoryTransition(p, limits),
    (e) => e.code === 'INVALID_HISTORY',
  );
});
