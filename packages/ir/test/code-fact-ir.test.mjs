import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import * as ir from '../dist/index.js';

const fixtureRoot = new URL('../../../fixtures/ir/code-fact-v1/', import.meta.url);
const expectedFixtureIndex = {
  schemaVersion: 1,
  id: 'p0-code-fact-ir-v1',
  task: 'P0-W1-003',
  governingSpec: 'docs/handoff/specs/CANONICAL_IR.md',
  acceptance: 'Provider/canonical identity remains separate',
  validCases: 'valid/cases.json',
  invalidCases: 'invalid/cases.json',
};

function assertFixtureIndex(index) {
  assert.deepEqual(index, expectedFixtureIndex);
}

const fixtureIndex = JSON.parse(await readFile(new URL('cases.json', fixtureRoot), 'utf8'));
assertFixtureIndex(fixtureIndex);
const validCases = JSON.parse(
  await readFile(new URL(fixtureIndex.validCases, fixtureRoot), 'utf8'),
);
const invalidCases = JSON.parse(
  await readFile(new URL(fixtureIndex.invalidCases, fixtureRoot), 'utf8'),
);
const parsers = {};

test('p0-code-fact-ir-v1 Fixture index is authoritative', () => {
  assertFixtureIndex(fixtureIndex);
  assert.ok(Array.isArray(validCases));
  assert.ok(Array.isArray(invalidCases));
});

test('Fixture index rejects a redirected child path before use', () => {
  assert.throws(
    () => assertFixtureIndex({ ...fixtureIndex, validCases: 'redirected/cases.json' }),
    assert.AssertionError,
  );
});

test('Code Fact scalar schemas preserve exact values and reject blank or padded values', () => {
  const schemas = [
    ir.ProviderFactIdSchema,
    ir.NodeFactKeySchema,
    ir.EdgeFactKeySchema,
    ir.CodeFactNameSchema,
    ir.QualifiedCodeFactNameSchema,
    ir.ProviderFactKindSchema,
    ir.UnresolvedTargetHintSchema,
  ];
  for (const schema of schemas) {
    assert.equal(ir.parseIr(schema, 'value:01'), 'value:01');
    assert.throws(() => ir.parseIr(schema, ''), { code: 'IR_VALIDATION_FAILED' });
    assert.throws(() => ir.parseIr(schema, ' value:01'), { code: 'IR_VALIDATION_FAILED' });
    assert.throws(() => ir.parseIr(schema, 'value:01 '), { code: 'IR_VALIDATION_FAILED' });
  }
});

test('node references reject EDGE while general fact references accept it', () => {
  assert.equal(
    ir.parseIr(ir.ProviderFactRefSchema, {
      factType: 'EDGE',
      providerId: 'provider:typescript',
      providerFactId: 'provider-fact:edge-01',
    }).factType,
    'EDGE',
  );
  assert.throws(
    () =>
      ir.parseIr(ir.ProviderNodeRefSchema, {
        factType: 'EDGE',
        providerId: 'provider:typescript',
        providerFactId: 'provider-fact:edge-01',
      }),
    { code: 'IR_VALIDATION_FAILED' },
  );
  assert.throws(
    () =>
      ir.parseIr(ir.CanonicalNodeRefSchema, {
        factType: 'EDGE',
        id: 'canonical:edge-01',
      }),
    { code: 'IR_VALIDATION_FAILED' },
  );
});
