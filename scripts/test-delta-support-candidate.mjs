import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseFixtureManifest, discoverFixtures } from '../packages/evaluation/dist/index.js';
import { nativeSyntaxObservationProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import {
  cases,
  fixtureJSON,
  loadDeltaCase,
  limits,
  sha,
} from '../packages/providers/test/fixtures/delta-support-helpers.mjs';
test('independent12 families/35 cases and strict candidate manifest', () => {
  assert.equal(new Set(cases.map((c) => c.family)).size, 12);
  assert.equal(cases.length, 35);
  assert.equal(new Set(cases.map((c) => c.id)).size, 35);
  assert.equal(
    parseFixtureManifest(fixtureJSON('fixture.json'), 'delta-support/fixture.json').id,
    'p1-delta-support-candidate-v1',
  );
});
test('new independent literal bytes match provenance', () => {
  for (const [p, h] of Object.entries(fixtureJSON('provenance.json')))
    assert.equal(sha(readFileSync(p)), h, p);
});
for (const c of cases)
  test('independent complete candidate ' + c.id, async () => {
    const { composeDeclaredDeltaSupportCandidate } =
        await import('../packages/providers/dist/delta-support-candidate.js'),
      { input, expected } = loadDeltaCase(c.id);
    if (expected.error)
      assert.throws(
        () => composeDeclaredDeltaSupportCandidate(input, limits),
        (e) => e.code === expected.error,
      );
    else assert.deepEqual(composeDeclaredDeltaSupportCandidate(input, limits), expected);
  });
test('three candidate registrations exactly once', () => {
  const p = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const f of [
    'packages/providers/test/history-transition-pipeline.test.mjs',
    'packages/providers/test/delta-support-candidate.test.mjs',
    'scripts/test-delta-support-candidate.mjs',
  ])
    assert.equal(p.scripts.test.split(/\s+/).filter((x) => x === f).length, 1);
});
test('local Fixture registration one delta fixture, old fixture retained and catalog0', async () => {
  const r = await discoverFixtures('fixtures');
  for (const id of ['p1-delta-support-candidate-v1', 'p1-history-transition-draft-v1'])
    assert.equal(r.filter((x) => x.manifest.id === id).length, 1);
  assert.equal(nativeSyntaxObservationProfiles.length, 0);
});
