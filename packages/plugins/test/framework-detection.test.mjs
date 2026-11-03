import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePluginV2Context } from '../dist/plugin-spi-v2.js';

const root = new URL('../../../fixtures/phase1/plugin-context/', import.meta.url);
const inputs = JSON.parse(await readFile(new URL('inputs/framework-detection.json', root), 'utf8'));
const expected = JSON.parse(
  await readFile(new URL('expected/framework-detection.json', root), 'utf8'),
);
const context = (item) => structuredClone({ ...inputs.baseContext, ...item.context });
const load = async () => (await import('../dist/framework-detection.js')).default;

test('F0 independent positive and unknown contexts satisfy existing V2 contract', () => {
  for (const item of inputs.cases) validatePluginV2Context(context(item));
});
for (const item of inputs.cases) {
  test('F0 ' + item.id, async () => {
    const detect = await load();
    const input = context(item);
    const original = structuredClone(input);
    const result = detect(input, item.framework);
    assert.deepEqual(result, expected[item.id]);
    assert.deepEqual(input, original);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.support), true);
  });
}
for (const item of inputs.invalidCases) {
  test('F0 refuses ' + item.id, async () => {
    const detect = await load();
    assert.throws(
      () => detect(context(item), item.framework),
      (e) => e.code === 'IR_VALIDATION_FAILED',
    );
  });
}
test('F0 input order does not alter sorted support and current context has no cache', async () => {
  const detect = await load();
  const item = inputs.cases.find((c) => c.id === 'supports-sort-by-fact-key');
  const reversed = context(item);
  reversed.edges.reverse();
  reversed.nodes.reverse();
  reversed.sourceFiles.reverse();
  assert.deepEqual(detect(reversed, 'spring'), expected[item.id]);
  reversed.edges = [];
  assert.deepEqual(detect(reversed, 'spring'), expected['missing-import-no-stale-result']);
});
