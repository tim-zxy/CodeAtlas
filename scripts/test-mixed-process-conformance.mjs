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

for (const id of ['complete-short', 'cancelled'])
  for (const ordering of [
    'descendant-created-after-host-exit',
    'descendant-exited-after-host-exit',
  ])
    test('A6 rejects contradictory lifecycle order ' + id + ' ' + ordering, () => {
      const value = structuredClone(cases.find((c) => c.id === id).value);
      // HOST cannot finish its await-close report before the descendant exits.
      value.processes[0].exitSequence = 3;
      value.processes[1].exitSequence = 5;
      if (ordering === 'descendant-created-after-host-exit') value.processes[1].createSequence = 4;
      assert.throws(
        () => read(value, limits),
        (e) => e.code === 'INVALID_PROCESS_CONFORMANCE',
      );
    });

for (const [name, patch] of [
  ['closed missing child', { childClosed: true }],
  ['exit status for missing child', { childExitCode: 0 }],
  ['signal for missing child', { childSignal: 'SIGKILL' }],
  ['output for missing child', { childStdout: 'DONE' }],
])
  test('A6 final-query failure rejects ' + name, () => {
    const value = structuredClone(cases.find((c) => c.id === 'injected-final-failure').value);
    Object.assign(value.host, patch);
    assert.throws(
      () => read(value, limits),
      (e) => e.code === 'INVALID_PROCESS_CONFORMANCE',
    );
  });

test('A6 cancellation rejects output from the wrong fixed child mode', () => {
  const value = structuredClone(cases.find((c) => c.id === 'cancelled').value);
  value.host.childStdout = 'DONE';
  assert.throws(
    () => read(value, limits),
    (e) => e.code === 'INVALID_PROCESS_CONFORMANCE',
  );
});
