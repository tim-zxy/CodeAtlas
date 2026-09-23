import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DetectionContextSchema,
  DetectionResultSchema,
  PluginDescriptorSchema,
  SemanticExtractionContextSchema,
  SemanticFactSchema,
  validateDetectionResult,
  validateSemanticFact,
} from '../dist/index.js';

const node = {
  id: 'node-a',
  factKey: 'node-key-a',
  repositoryId: 'repo-a',
  revisionId: 'rev-a',
  kind: 'SYMBOL',
  symbolKind: 'METHOD',
  name: 'run',
  qualifiedName: 'example.A.run',
  sourceRange: null,
  confidence: { score: 1, method: 'parser', reasons: [] },
};
const support = { factType: 'NODE', id: node.id };
const context = {
  repositoryId: 'repo-a',
  revisionId: 'rev-a',
  nodes: [node],
  edges: [],
  sourceFiles: [],
  configuration: {},
};
const descriptor = {
  pluginId: 'spring',
  pluginVersion: '1.0.0',
  languages: ['java'],
  frameworks: ['spring'],
  requiredProviderCapabilities: ['symbol'],
  producedSemanticCapabilities: ['entry-point'],
  configurationSchema: { schema: 'spring-config', version: 1 },
  trustClass: 'BUILT_IN',
};
const detection = { matched: true, support: [support], diagnostics: [] };
const candidate = {
  capability: 'entry-point',
  value: { schema: 'entry-point-candidate', version: 1, payload: { path: '/health' } },
  support: [support],
};

test('P0-W4-001 fixture declares the fake Provider and Plugin contract cases', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('../../../fixtures/spi/provider-plugin-v1/cases.json', import.meta.url)),
  );
  assert.equal(fixture.fixtureId, 'p0-provider-plugin-spi-v1');
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.task, 'P0-W4-001');
  assert.deepEqual(fixture.governingSpecs, ['Provider SPI', 'Plugin SPI']);
  assert.equal(
    fixture.acceptance,
    'Descriptors, capabilities, analysis contracts, plugin detection/extraction, and deterministic routing metadata',
  );
  assert.deepEqual(fixture.cases, [
    'descriptor',
    'analyze',
    'refresh',
    'cancellation',
    'failed-terminal',
    'invalid-event',
    'coverage-diagnostic',
    'unresolved-target',
    'plugin-detection',
    'plugin-extraction',
    'provider-routing',
    'plugin-routing',
  ]);
});

test('plugin descriptor and bounded context accept canonical input', () => {
  assert.deepEqual(PluginDescriptorSchema.parse(descriptor), descriptor);
  assert.deepEqual(DetectionContextSchema.parse(context), context);
  assert.equal(DetectionResultSchema.safeParse(detection).success, true);
  assert.equal(SemanticFactSchema.safeParse(candidate).success, true);
});

test('plugin descriptor rejects duplicate, malformed, and unauthorized declarations', () => {
  for (const invalid of [
    { ...descriptor, frameworks: ['spring', 'spring'] },
    { ...descriptor, producedSemanticCapabilities: [] },
    { ...descriptor, trustClass: 'THIRD_PARTY' },
    { ...descriptor, configurationSchema: { schema: 'spring-config', version: 0 } },
    { ...descriptor, extra: true },
  ]) {
    assert.equal(PluginDescriptorSchema.safeParse(invalid).success, false);
  }
});

test('plugin detection requires evidence from the supplied canonical facts', () => {
  assert.deepEqual(validateDetectionResult(context, detection), detection);
  assert.deepEqual(
    validateDetectionResult(context, { matched: false, support: [], diagnostics: [] }),
    { matched: false, support: [], diagnostics: [] },
  );
  assert.throws(() =>
    validateDetectionResult(context, {
      ...detection,
      support: [{ factType: 'NODE', id: 'missing' }],
    }),
  );
  assert.throws(() => validateDetectionResult(context, { ...detection, support: [] }));
  assert.throws(() => validateDetectionResult(context, { ...detection, matched: false }));
  assert.equal(SemanticExtractionContextSchema.safeParse({ ...context, detection }).success, true);
  assert.equal(
    SemanticExtractionContextSchema.safeParse({
      ...context,
      detection: { matched: false, support: [], diagnostics: [] },
    }).success,
    false,
  );
  assert.equal(
    SemanticExtractionContextSchema.safeParse({
      ...context,
      detection: { ...detection, support: [{ factType: 'NODE', id: 'missing' }] },
    }).success,
    false,
  );
});

test('plugin candidates retain declared semantic capability and canonical support', async () => {
  const fake = {
    describe: () => descriptor,
    detect: async () => detection,
    extract: async function* () {
      yield candidate;
    },
  };
  const result = validateDetectionResult(context, await fake.detect(context));
  const facts = [];
  for await (const fact of fake.extract({ ...context, detection: result })) {
    facts.push(validateSemanticFact(context, fake.describe(), fact));
  }
  assert.deepEqual(facts, [candidate]);
  assert.throws(() =>
    validateSemanticFact(context, descriptor, { ...candidate, capability: 'business-flow' }),
  );
  assert.throws(() =>
    validateSemanticFact(context, descriptor, {
      ...candidate,
      support: [{ factType: 'NODE', id: 'missing' }],
    }),
  );
  assert.throws(() =>
    validateSemanticFact(context, descriptor, { ...candidate, support: [support, support] }),
  );
});

test('plugin context and candidate reject foreign revisions and non-JSON data', () => {
  assert.equal(
    DetectionContextSchema.safeParse({ ...context, nodes: [{ ...node, revisionId: 'rev-b' }] })
      .success,
    false,
  );
  assert.equal(
    DetectionContextSchema.safeParse({ ...context, configuration: { value: undefined } }).success,
    false,
  );
  assert.equal(
    SemanticFactSchema.safeParse({
      ...candidate,
      value: { ...candidate.value, payload: { value: Number.NaN } },
    }).success,
    false,
  );
});

test('validated plugin contexts are deeply immutable', () => {
  const input = DetectionContextSchema.parse(context);
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.nodes), true);
  assert.equal(Object.isFrozen(input.nodes[0]), true);
  assert.equal(Object.isFrozen(input.configuration), true);
  assert.throws(() => {
    input.nodes[0].name = 'changed';
  }, TypeError);

  const extraction = SemanticExtractionContextSchema.parse({ ...context, detection });
  assert.equal(Object.isFrozen(extraction.detection.support[0]), true);
});
