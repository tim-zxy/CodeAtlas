import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { nativeSyntaxObservationProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import { parseFixtureManifest, discoverFixtures } from '../packages/evaluation/dist/index.js';
import {
  fixtureJSON,
  cases,
  sha,
  loadHistoryCase,
  limits,
} from '../packages/providers/test/fixtures/history-transition-helpers.mjs';
test('independent18 families, strict manifest and literal expectations', () => {
  assert.equal(new Set(cases.map((c) => c.family)).size, 18);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  assert.equal(
    parseFixtureManifest(fixtureJSON('fixture.json'), 'history-transition/fixture.json').id,
    'p1-history-transition-draft-v1',
  );
  for (const c of cases) {
    const { expected } = loadHistoryCase(c.id);
    assert.ok(expected.error || expected.ledgerDigest);
  }
});
test('all independent original Fixture bytes preserved', () => {
  for (const [p, h] of Object.entries(fixtureJSON('provenance.json')))
    assert.equal(sha(readFileSync(p)), h, p);
});
for (const c of cases)
  test('literal independent result ' + c.id, async () => {
    const { planHistoryTransition } =
        await import('../packages/providers/dist/history-transition.js'),
      { input, expected } = loadHistoryCase(c.id);
    if (expected.error)
      assert.throws(
        () => planHistoryTransition(input, limits),
        (e) => e.code === expected.error,
      );
    else assert.deepEqual(planHistoryTransition(input, limits), expected);
  });
test('three root registrations exactly once', () => {
  const p = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const f of [
    'packages/providers/test/history-transition-input.test.mjs',
    'packages/providers/test/history-transition.test.mjs',
    'scripts/test-history-transition.mjs',
  ])
    assert.equal(p.scripts.test.split(/\s+/).filter((x) => x === f).length, 1);
});
test('local Fixture registration Phase1 one history fixture; catalog remains empty', async () => {
  const r = await discoverFixtures('fixtures');
  assert.equal(nativeSyntaxObservationProfiles.length, 0);
  assert.equal(r.filter((x) => x.manifest.id === 'p1-history-transition-draft-v1').length, 1);
});
