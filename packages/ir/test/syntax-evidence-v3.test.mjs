import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../dist/index.js';
const input = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-sufficiency/inputs.json',
      import.meta.url,
    ),
  ),
);
const expected = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-sufficiency/expected.json',
      import.meta.url,
    ),
  ),
);
test('v3 contract entry and declared eight-kind positive context', () => {
  assert.equal(typeof api.parseSyntaxEvidenceV3, 'function');
  for (const e of input.envelopes) assert.deepEqual(api.parseSyntaxEvidenceV3(e, input.context), e);
  assert.deepEqual(
    [...new Set(input.envelopes.map((e) => e.payload.syntaxKind))].sort(),
    [...expected.acceptedKinds].sort(),
  );
});
test('v3 rejects precision, import, support, scope and source defects', () => {
  for (const [label, mutate] of [
    ['version', (e) => (e.version = 2)],
    ['field', (e) => delete e.payload.controlContext],
    ['missing support', (e) => (e.payload.supportRefs = [])],
    ['foreign scope', (e) => (e.payload.lexicalScope.repositoryId = 'other')],
    ['module file', (e, c) => (c.sourceFiles[0].path = 'other.java')],
    ['fingerprint', (e) => (e.payload.sourceFingerprint = 'wrong')],
    ['digest', (e) => (e.payload.supportRefs[0].valueDigest = 'b'.repeat(64))],
  ]) {
    const e = structuredClone(input.envelopes[0]),
      c = structuredClone(input.context);
    mutate(e, c);
    assert.throws(() => api.parseSyntaxEvidenceV3(e, c), label);
  }
  const deco = structuredClone(input.envelopes.find((e) => e.payload.syntaxKind === 'DECORATION'));
  deco.payload.payload.callee.resolution = 'UNRESOLVED';
  assert.throws(() => api.parseSyntaxEvidenceV3(deco, input.context));
  const imp = structuredClone(
    input.envelopes.find((e) => e.payload.syntaxKind === 'IMPORT_BINDING'),
  );
  imp.payload.payload.boundName = 'wrong';
  assert.throws(() => api.parseSyntaxEvidenceV3(imp, input.context));
  const scope = structuredClone(input.envelopes[0]);
  scope.payload.payload.limitations = ['incomplete'];
  assert.throws(() => api.parseSyntaxEvidenceV3(scope, input.context));
});
test('old Syntax parser keeps refusing v3', () => {
  for (const e of input.envelopes) assert.throws(() => api.parseSyntaxEvidenceV2(e, input.context));
});

test('author review: TYPE must prove its Code TYPE owner and declared name', () => {
  for (const mutate of [
    (e) => (e.payload.owner = e.payload.lexicalScope),
    (e) => (e.payload.payload.declaredName = 'Other'),
    (e) => (e.payload.owner = null),
  ]) {
    const e = structuredClone(input.envelopes.find((e) => e.payload.syntaxKind === 'DECLARATION'));
    mutate(e);
    assert.throws(() => api.parseSyntaxEvidenceV3(e, input.context));
  }
});
