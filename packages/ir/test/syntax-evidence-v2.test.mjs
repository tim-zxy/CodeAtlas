import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/syntax-contract/binding-contract/', import.meta.url);
const input = JSON.parse(await readFile(new URL('inputs.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected.json', root), 'utf8'));
test('v2 literal positive projections satisfy unchanged v1 invariants', () => {
  for (const c of input.canonical.filter((c) => expected.canonical[c.id])) {
    const { lexicalScope, ...payload } = structuredClone(c.envelope.payload);
    delete payload.payload.assignmentForm;
    delete payload.payload.valueRange;
    delete payload.payload.declarationForm;
    delete payload.payload.declaredName;
    api.parseSyntaxEvidence(
      { schema: c.envelope.schema, version: 1, payload },
      c.context.references,
    );
  }
});
for (const c of input.canonical)
  test('v2 ' + c.id, () => {
    assert.equal(typeof api.parseSyntaxEvidenceV2, 'function');
    if (expected.canonical[c.id]) {
      assert.deepEqual(api.parseSyntaxEvidenceV2(c.envelope, c.context), c.envelope);
    } else {
      assert.throws(
        () => api.parseSyntaxEvidenceV2(c.envelope, c.context),
        (e) => e.code === 'IR_VALIDATION_FAILED',
      );
    }
  });
test('v1 refuses v2 envelope and added fields', () => {
  const c = input.canonical[0];
  assert.throws(() => api.parseSyntaxEvidence(c.envelope, c.context.references));
  assert.throws(() => api.parseSyntaxEvidence({ ...c.envelope, version: 1 }, c.context.references));
});

const observationRoot = new URL(
  '../../../fixtures/phase1/syntax-contract/binding-observation/',
  import.meta.url,
);
const observationInputs = JSON.parse(
  await readFile(new URL('inputs.json', observationRoot), 'utf8'),
);
const observationExpected = JSON.parse(
  await readFile(new URL('expected.json', observationRoot), 'utf8'),
);
for (const c of observationInputs.modules)
  test('MODULE proof ' + c.id, () => {
    if (observationExpected.modules[c.id])
      assert.deepEqual(api.parseSyntaxEvidenceV2(c.envelope, c.context), c.envelope);
    else
      assert.throws(
        () => api.parseSyntaxEvidenceV2(c.envelope, c.context),
        (e) => e.code === 'IR_VALIDATION_FAILED',
      );
  });
