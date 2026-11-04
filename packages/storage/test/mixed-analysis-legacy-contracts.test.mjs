import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cases, loadCase } from '../../../fixtures/phase1/mixed-analysis-store/corpus.mjs';
const root = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  binding = JSON.parse(fs.readFileSync(new URL('legacy-execution-bindings.json', root)));
for (const b of binding.cases) {
  const c = cases.find((c) => c.id === b.id),
    { input, expected } = loadCase(c);
  assert.equal(input.scenario, b.id);
  assert.deepEqual(expected, {
    lastGoodPreservedOnRefusal: true,
    immutableHistory: true,
    noPartialVisibility: true,
  });
  assert.equal(b.selectors.length, 4);
  for (const k of ['input', 'expected'])
    assert.equal(
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(new URL(c[k], root)))
        .digest('hex'),
      b[k + 'Sha256'],
    );
}
await import('./activation-history.test.mjs');
