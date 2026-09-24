import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FixtureRegistryError, parseFixtureManifest } from '../dist/index.js';

const valid = {
  schemaVersion: 1,
  id: 'java-call-basic',
  category: 'code-intelligence',
  phase: '0.5',
  languages: ['java'],
  frameworks: [],
  capabilities: ['SYMBOL', 'CALL'],
  inputs: { source: 'source/' },
  expected: { nodes: 'expected/nodes.json' },
  criticalFacts: [{ id: 'call-a-b', type: 'EDGE', importance: 'CRITICAL' }],
  qualityGates: { callRecall: { operator: '>=', threshold: 0.9 } },
};

function expectField(value, fieldPath) {
  assert.throws(
    () => parseFixtureManifest(value, 'sample/fixture.json'),
    (error) => {
      assert.ok(error instanceof FixtureRegistryError);
      assert.equal(error.code, 'MANIFEST_INVALID');
      assert.equal(error.manifestPath, 'sample/fixture.json');
      assert.equal(error.fieldPath, fieldPath);
      return true;
    },
  );
}

test('v1 manifest preserves all declared metadata without mutating the input', () => {
  const parsed = parseFixtureManifest(valid, 'sample/fixture.json');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), valid);
  assert.notStrictEqual(parsed, valid);
  assert.notStrictEqual(parsed.languages, valid.languages);
  assert.notStrictEqual(parsed.inputs, valid.inputs);
});

test('all Evaluation categories and phases are accepted', () => {
  for (const category of ['code-intelligence', 'runtime-graph', 'knowledge', 'agent-utility']) {
    for (const phase of ['0', '0.5', '1', '2', '3']) {
      assert.equal(parseFixtureManifest({ ...valid, category, phase }, 'm').phase, phase);
    }
  }
});

test('empty dimensions and empty fact/gate collections are valid', () => {
  const input = {
    ...valid,
    languages: [],
    frameworks: [],
    capabilities: [],
    criticalFacts: [],
    qualityGates: {},
  };
  assert.deepEqual(JSON.parse(JSON.stringify(parseFixtureManifest(input, 'm'))), input);
});

test('critical NODE and EDGE may share one FactKey while same-type duplicates remain invalid', () => {
  const input = {
    ...valid,
    criticalFacts: [
      { id: 'shared-key', type: 'NODE', importance: 'CRITICAL' },
      { id: 'shared-key', type: 'EDGE', importance: 'CRITICAL' },
    ],
  };
  assert.deepEqual(
    parseFixtureManifest(input, 'sample/fixture.json').criticalFacts,
    input.criticalFacts,
  );
  expectField(
    { ...input, criticalFacts: [input.criticalFacts[0], input.criticalFacts[0]] },
    'criticalFacts.1.id',
  );
});

for (const [name, value, field] of [
  ['unsupported schema version', { ...valid, schemaVersion: 2 }, 'schemaVersion'],
  ['missing field', { ...valid, frameworks: undefined }, 'frameworks'],
  ['unknown field', { ...valid, surprise: 1 }, 'surprise'],
  ['blank ID', { ...valid, id: ' ' }, 'id'],
  ['invalid category', { ...valid, category: 'graph' }, 'category'],
  ['invalid phase', { ...valid, phase: 0 }, 'phase'],
  ['duplicate language', { ...valid, languages: ['java', 'java'] }, 'languages.1'],
  ['blank capability', { ...valid, capabilities: [''] }, 'capabilities.0'],
  ['empty inputs', { ...valid, inputs: {} }, 'inputs'],
  ['empty expected', { ...valid, expected: {} }, 'expected'],
  [
    'unknown critical fact field',
    { ...valid, criticalFacts: [{ ...valid.criticalFacts[0], extra: true }] },
    'criticalFacts.0.extra',
  ],
  [
    'duplicate critical fact ID',
    { ...valid, criticalFacts: [valid.criticalFacts[0], valid.criticalFacts[0]] },
    'criticalFacts.1.id',
  ],
  [
    'bad gate operator',
    { ...valid, qualityGates: { callRecall: { operator: '=', threshold: 0.9 } } },
    'qualityGates.callRecall.operator',
  ],
  [
    'bad gate threshold',
    { ...valid, qualityGates: { callRecall: { operator: '>=', threshold: '0.9' } } },
    'qualityGates.callRecall.threshold',
  ],
  [
    'unknown gate field',
    { ...valid, qualityGates: { callRecall: { operator: '>=', threshold: 0.9, unit: 'ratio' } } },
    'qualityGates.callRecall.unit',
  ],
  ['parent traversal', { ...valid, expected: { nodes: '../nodes.json' } }, 'expected.nodes'],
  ['absolute path', { ...valid, expected: { nodes: '/tmp/nodes.json' } }, 'expected.nodes'],
  ['drive path', { ...valid, expected: { nodes: 'C:/nodes.json' } }, 'expected.nodes'],
  ['backslash path', { ...valid, expected: { nodes: 'expected\\nodes.json' } }, 'expected.nodes'],
  [
    'empty path segment',
    { ...valid, expected: { nodes: 'expected//nodes.json' } },
    'expected.nodes',
  ],
]) {
  test(`rejects ${name} at ${field}`, () => expectField(value, field));
}
