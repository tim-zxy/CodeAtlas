import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseFixtureManifest } from '../packages/evaluation/dist/index.js';
import {
  fixtureJSON,
  sha,
} from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
test('fixture independent exact12 seeds and strict manifest', async () => {
  const c = await fixtureJSON('cases.json');
  assert.equal(c.length, 12);
  assert.equal(new Set(c.map((x) => x.id)).size, 12);
  assert.equal(
    parseFixtureManifest(await fixtureJSON('fixture.json'), 'native-composition/fixture.json').id,
    'p1-native-composition-candidate-v1',
  );
  for (const x of c) {
    const expected = await fixtureJSON(x.expected);
    assert.ok(expected.error || expected.merged.evidence);
  }
});
test('fixture provenance raw bytes unchanged', async () => {
  for (const [p, h] of Object.entries(await fixtureJSON('provenance.json')))
    assert.equal(sha(await readFile(new URL('../' + p, import.meta.url))), h);
});
import {
  loadCompositionCase,
  limits,
} from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
for (const { id } of await fixtureJSON('cases.json'))
  test('independent entire composition ' + id, async () => {
    const { composeNativeProjection } =
        await import('../packages/providers/dist/native-composition.js'),
      c = await loadCompositionCase(id);
    if (c.expected.error)
      assert.throws(
        () => composeNativeProjection(c.metadata, c.requestBytes, c.outputBytes, limits),
        (e) => e.code === c.expected.error,
      );
    else
      assert.deepEqual(
        composeNativeProjection(c.metadata, c.requestBytes, c.outputBytes, limits),
        c.expected,
      );
  });
test('composition three registrations exactly once', async () => {
  const p = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const f of [
    'packages/providers/test/native-composition-input.test.mjs',
    'packages/providers/test/native-composition.test.mjs',
    'scripts/test-native-composition-candidate.mjs',
  ])
    assert.equal(p.scripts.test.split(/\s+/).filter((x) => x === f).length, 1);
});
