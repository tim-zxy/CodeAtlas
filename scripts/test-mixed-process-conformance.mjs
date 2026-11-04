import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
let read;
try {
  read = (await import('./mixed-process-conformance.mjs')).readMixedProcessConformance;
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const root = new URL(
  '../fixtures/phase1/mixed-runtime-readiness/process-acquisition/',
  import.meta.url,
);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', root))),
  expected = JSON.parse(fs.readFileSync(new URL('expected.json', root)));
const limits = {
  maxRows: Number.MAX_SAFE_INTEGER,
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
};
for (const c of cases)
  test('A6 independent trace ' + c.id, () => {
    assert.equal(typeof read, 'function');
    if (expected[c.id] === 'INVALID_PROCESS_CONFORMANCE')
      assert.throws(
        () => read(c.value, limits),
        (e) => e.code === expected[c.id] && e.message === expected[c.id],
      );
    else {
      const r = read(c.value, limits);
      assert.equal(r.status, expected[c.id]);
      assert.equal(r.measurementEligible, false);
      assert.ok(Object.isFrozen(r));
    }
  });
