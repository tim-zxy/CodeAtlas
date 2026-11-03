import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/python-normalization/', import.meta.url);
const input = JSON.parse(await readFile(new URL('inputs/observation.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected/normalized.json', root), 'utf8'));
const fresh = () => structuredClone(input);
function run(x = fresh()) {
  assert.equal(typeof api.normalizePythonObservation, 'function');
  return api.normalizePythonObservation(x);
}
function bad(fn, code) {
  const x = fresh();
  assert.doesNotThrow(() => run(x));
  fn(x);
  assert.throws(
    () => run(x),
    (e) => e.code === code,
  );
}
test('independent literal module function import reference golden', () =>
  assert.deepEqual(run(), expected));
test('input ordering does not affect canonical result', () => {
  const x = fresh();
  x.nodes.reverse();
  x.edges.reverse();
  assert.deepEqual(run(x), expected);
});
test('provider IDs do not define canonical identities', () => {
  const x = fresh();
  x.providerId = 'other';
  for (const n of x.nodes) n.providerId = 'other';
  for (const e of x.edges) {
    e.providerId = 'other';
    e.source.providerId = 'other';
    if (e.target.state === 'RESOLVED') e.target.target.providerId = 'other';
  }
  const out = run(x);
  assert.deepEqual(
    out.nodePairs.map((p) => p.canonical),
    expected.nodePairs.map((p) => p.canonical),
  );
  assert.deepEqual(
    out.edgePairs.map((p) => p.canonical),
    expected.edgePairs.map((p) => p.canonical),
  );
});
for (const [name, change, code] of [
  ['duplicate nodes', (x) => x.nodes.push(structuredClone(x.nodes[0])), 'INVALID_FACT'],
  ['duplicate edges', (x) => x.edges.push(structuredClone(x.edges[0])), 'INVALID_FACT'],
  ['foreign revision', (x) => (x.nodes[0].revisionId = 'other'), 'INVALID_CONTEXT'],
  ['foreign snapshot', (x) => (x.edges[0].providerSnapshotId = 'other'), 'INVALID_CONTEXT'],
  ['foreign provider', (x) => (x.nodes[0].providerId = 'other'), 'INVALID_CONTEXT'],
  ['missing source', (x) => (x.sourceFiles = []), 'MISSING_REFERENCE'],
  ['non Python source', (x) => (x.sourceFiles[0].languageHint = 'java'), 'INVALID_CONTEXT'],
  [
    'unknown source classification',
    (x) => (x.sourceFiles[0].classification.role = 'OTHER'),
    'INVALID_CONTEXT',
  ],
  [
    'duplicate source identity',
    (x) => x.sourceFiles.push(structuredClone(x.sourceFiles[0])),
    'INVALID_FACT',
  ],
  [
    'unsupported class declaration',
    (x) => (x.nodes[1].providerKind = 'python.class'),
    'UNSUPPORTED_KIND',
  ],
  [
    'unsupported call relation',
    (x) => (x.edges[1].providerKind = 'python.call'),
    'UNSUPPORTED_KIND',
  ],
  ['unqualified module', (x) => (x.nodes[0].qualifiedName = 'module'), 'INVALID_FACT'],
  ['unqualified function', (x) => (x.nodes[1].qualifiedName = 'endpoint'), 'INVALID_FACT'],
  ['function without source span', (x) => (x.nodes[1].sourceRange = null), 'INVALID_FACT'],
  [
    'dangling source endpoint',
    (x) => (x.edges[0].source.providerFactId = 'missing'),
    'MISSING_REFERENCE',
  ],
  [
    'dangling target endpoint',
    (x) => (x.edges[1].target.target.providerFactId = 'missing'),
    'MISSING_REFERENCE',
  ],
  [
    'foreign relation target provider',
    (x) => (x.edges[1].target.target.providerId = 'other'),
    'INVALID_FACT',
  ],
  ['unknown authority field', (x) => (x.publish = true), 'INVALID_FACT'],
])
  test('refuses ' + name, () => bad(change, code));
test('module canonical span remains null and function is FUNCTION', () => {
  const out = run();
  assert.equal(
    out.nodePairs.find((p) => p.canonical.kind === 'MODULE').canonical.sourceRange,
    null,
  );
  assert.equal(
    out.nodePairs.find((p) => p.canonical.kind === 'SYMBOL').canonical.symbolKind,
    'FUNCTION',
  );
  assert.equal(
    out.edgePairs.find((p) => p.canonical.kind === 'IMPORT').canonical.target.state,
    'UNRESOLVED',
  );
});
test('hostile accessors are not invoked', () => {
  let seen = false;
  const x = fresh();
  Object.defineProperty(x, 'nodes', {
    enumerable: true,
    get() {
      seen = true;
      throw Error('raw');
    },
  });
  assert.throws(
    () => run(x),
    (e) => e.code === 'INVALID_FACT',
  );
  assert.equal(seen, false);
});

test('provider fact IDs do not define canonical identities', () => {
  const x = fresh();
  for (const n of x.nodes) n.providerFactId = 'renamed:' + n.providerFactId;
  for (const e of x.edges) {
    e.providerFactId = 'renamed:' + e.providerFactId;
    e.source.providerFactId = 'renamed:' + e.source.providerFactId;
    if (e.target.state === 'RESOLVED')
      e.target.target.providerFactId = 'renamed:' + e.target.target.providerFactId;
  }
  const out = run(x);
  assert.deepEqual(
    out.nodePairs.map((p) => p.canonical),
    expected.nodePairs.map((p) => p.canonical),
  );
  assert.deepEqual(
    out.edgePairs.map((p) => p.canonical),
    expected.edgePairs.map((p) => p.canonical),
  );
});
test('normalization does not mutate input and freezes returned candidates', () => {
  const x = fresh(),
    before = structuredClone(x);
  const out = run(x);
  assert.deepEqual(x, before);
  assert.equal(Object.isFrozen(x), false);
  assert.equal(Object.isFrozen(out.nodePairs[0].canonical.confidence), true);
});
