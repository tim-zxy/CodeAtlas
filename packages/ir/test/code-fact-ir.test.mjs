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

const providerA = {
  factType: 'NODE',
  providerId: 'provider:typescript',
  providerFactId: 'provider-fact:node-a',
};
const providerB = { ...providerA, providerFactId: 'provider-fact:node-b' };
const canonicalA = { factType: 'NODE', id: 'canonical:node-a' };
const canonicalB = { factType: 'NODE', id: 'canonical:node-b' };
const targetCases = [
  [
    'provider exact',
    () => ir.ProviderTargetSchema,
    { state: 'RESOLVED', resolution: 'EXACT', target: providerA },
  ],
  [
    'provider heuristic',
    () => ir.ProviderTargetSchema,
    { state: 'RESOLVED', resolution: 'HEURISTIC', target: providerA },
  ],
  [
    'provider ambiguous',
    () => ir.ProviderTargetSchema,
    {
      state: 'UNRESOLVED',
      resolution: 'AMBIGUOUS',
      originalHint: 'Widget.run',
      candidates: [providerA, providerB],
    },
  ],
  [
    'provider unresolved empty',
    () => ir.ProviderTargetSchema,
    { state: 'UNRESOLVED', resolution: 'UNRESOLVED', originalHint: 'Widget.run', candidates: [] },
  ],
  [
    'provider unresolved retained',
    () => ir.ProviderTargetSchema,
    {
      state: 'UNRESOLVED',
      resolution: 'UNRESOLVED',
      originalHint: 'Widget.run',
      candidates: [providerA],
    },
  ],
  [
    'provider unsupported',
    () => ir.ProviderTargetSchema,
    {
      state: 'UNRESOLVED',
      resolution: 'UNSUPPORTED',
      originalHint: 'dynamic dispatch',
      candidates: [],
    },
  ],
  [
    'canonical exact',
    () => ir.CanonicalTargetSchema,
    { state: 'RESOLVED', resolution: 'EXACT', target: canonicalA },
  ],
  [
    'canonical heuristic',
    () => ir.CanonicalTargetSchema,
    { state: 'RESOLVED', resolution: 'HEURISTIC', target: canonicalA },
  ],
  [
    'canonical ambiguous',
    () => ir.CanonicalTargetSchema,
    {
      state: 'UNRESOLVED',
      resolution: 'AMBIGUOUS',
      originalHint: 'Widget.run',
      candidates: [canonicalA, canonicalB],
    },
  ],
  [
    'canonical unresolved empty',
    () => ir.CanonicalTargetSchema,
    { state: 'UNRESOLVED', resolution: 'UNRESOLVED', originalHint: 'Widget.run', candidates: [] },
  ],
  [
    'canonical unresolved retained',
    () => ir.CanonicalTargetSchema,
    {
      state: 'UNRESOLVED',
      resolution: 'UNRESOLVED',
      originalHint: 'Widget.run',
      candidates: [canonicalA],
    },
  ],
  [
    'canonical unsupported',
    () => ir.CanonicalTargetSchema,
    {
      state: 'UNRESOLVED',
      resolution: 'UNSUPPORTED',
      originalHint: 'dynamic dispatch',
      candidates: [],
    },
  ],
];

test('target resolution matrix parses, round-trips, and preserves candidate order', () => {
  for (const [name, schemaFor, value] of targetCases) {
    const parsed = ir.parseIr(schemaFor(), value);
    assert.deepEqual(parsed, value, name);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), value, `${name} JSON round-trip`);
    if ('candidates' in value)
      assert.deepEqual(parsed.candidates, value.candidates, `${name} candidate order`);
  }
});

function assertTargetIssue(schema, value, expectedPath, expectedMessage) {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path),
    [expectedPath],
  );
  assert.equal(result.error.issues[0].message, expectedMessage);
}

test('target resolution rejects incompatible state and resolution pairs', () => {
  for (const schema of [ir.ProviderTargetSchema, ir.CanonicalTargetSchema]) {
    const target = schema === ir.ProviderTargetSchema ? providerA : canonicalA;
    for (const value of [
      { state: 'RESOLVED', resolution: 'AMBIGUOUS', target },
      { state: 'UNRESOLVED', resolution: 'EXACT', originalHint: 'Widget.run', candidates: [] },
    ])
      assert.throws(() => ir.parseIr(schema, value), { code: 'IR_VALIDATION_FAILED' });
  }
});

test('target resolution rejects unknown states, resolutions, resolved metadata, and unknown keys', () => {
  for (const schema of [ir.ProviderTargetSchema, ir.CanonicalTargetSchema]) {
    const target = schema === ir.ProviderTargetSchema ? providerA : canonicalA;
    for (const value of [
      { state: 'PENDING', resolution: 'EXACT', target },
      { state: 'RESOLVED', resolution: 'PREDICTED', target },
      {
        state: 'RESOLVED',
        resolution: 'EXACT',
        target,
        originalHint: 'Widget.run',
        candidates: [],
      },
    ])
      assert.throws(() => ir.parseIr(schema, value), { code: 'IR_VALIDATION_FAILED' });
    assertTargetIssue(
      schema,
      { state: 'RESOLVED', resolution: 'EXACT', target, unexpected: true },
      [],
      'Unrecognized key: "unexpected"',
    );
  }
});

test('target resolution rejects edge references at the resolved target path', () => {
  for (const [schema, edgeTarget] of [
    [
      ir.ProviderTargetSchema,
      { ...providerA, factType: 'EDGE', providerFactId: 'provider-fact:edge-a' },
    ],
    [ir.CanonicalTargetSchema, { ...canonicalA, factType: 'EDGE', id: 'canonical:edge-a' }],
  ])
    assertTargetIssue(
      schema,
      { state: 'RESOLVED', resolution: 'EXACT', target: edgeTarget },
      ['target', 'factType'],
      'Invalid input: expected "NODE"',
    );
});

test('target candidate invariants use deterministic cardinality and duplicate issue paths', () => {
  for (const [schema, first, second] of [
    [ir.ProviderTargetSchema, providerA, providerB],
    [ir.CanonicalTargetSchema, canonicalA, canonicalB],
  ]) {
    assertTargetIssue(
      schema,
      {
        state: 'UNRESOLVED',
        resolution: 'AMBIGUOUS',
        originalHint: 'Widget.run',
        candidates: [first],
      },
      ['candidates'],
      'Ambiguous targets require at least two candidates',
    );
    assertTargetIssue(
      schema,
      {
        state: 'UNRESOLVED',
        resolution: 'AMBIGUOUS',
        originalHint: 'Widget.run',
        candidates: [first, first],
      },
      ['candidates', 1],
      'Target candidates must be unique',
    );
    assertTargetIssue(
      schema,
      {
        state: 'UNRESOLVED',
        resolution: 'UNRESOLVED',
        originalHint: 'Widget.run',
        candidates: [first, first],
      },
      ['candidates', 1],
      'Target candidates must be unique',
    );
    assertTargetIssue(
      schema,
      {
        state: 'UNRESOLVED',
        resolution: 'UNSUPPORTED',
        originalHint: 'dynamic dispatch',
        candidates: [first, second],
      },
      ['candidates'],
      'Unsupported targets cannot contain candidates',
    );
  }
});

test('target resolution rejects blank and padded unresolved hints', () => {
  for (const schema of [ir.ProviderTargetSchema, ir.CanonicalTargetSchema]) {
    for (const originalHint of ['', ' Widget.run', 'Widget.run ']) {
      assert.throws(
        () =>
          ir.parseIr(schema, {
            state: 'UNRESOLVED',
            resolution: 'UNRESOLVED',
            originalHint,
            candidates: [],
          }),
        { code: 'IR_VALIDATION_FAILED' },
      );
    }
  }
});
