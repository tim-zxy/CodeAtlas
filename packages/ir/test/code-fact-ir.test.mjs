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
const parsers = {
  PROVIDER_NODE: (input) => ir.parseIr(ir.ProviderNodeSchema, input),
  PROVIDER_EDGE: (input) => ir.parseIr(ir.ProviderEdgeSchema, input),
};

function parserFor(target) {
  const parser = parsers[target];
  assert.ok(parser, 'fixture target ' + target + ' must have an explicit parser');
  return parser;
}

function assertIrError(callback, code, expectedPath) {
  let captured;
  assert.throws(callback, (error) => {
    captured = error;
    assert.ok(error instanceof ir.IrContractError);
    assert.equal(error.code, code);
    assert.ok(error instanceof ir.IrValidationError);
    assert.deepEqual(error.issues[0].path, expectedPath);
    return true;
  });
  return captured;
}

function sensitiveFixtureValues(input) {
  const sensitiveKeys = new Set([
    'providerId',
    'providerFactId',
    'providerKind',
    'name',
    'qualifiedName',
    'originalHint',
  ]);
  const values = [];

  function visit(value, key) {
    if (typeof value === 'string' && sensitiveKeys.has(key) && value.length > 0) {
      values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey);
    }
  }

  visit(input);
  return [...new Set(values)];
}

test('p0-code-fact-ir-v1 Fixture index is authoritative', () => {
  assertFixtureIndex(fixtureIndex);
  assert.ok(Array.isArray(validCases));
  assert.ok(Array.isArray(invalidCases));
});

test('Provider fact valid Fixtures parse, JSON-round-trip, and preserve exact values', () => {
  assert.equal(validCases.length, 8);
  for (const fixture of validCases) {
    const parser = parserFor(fixture.target);
    const first = parser(fixture.input);
    const second = parser(JSON.parse(JSON.stringify(first)));
    assert.deepEqual(first, fixture.input, fixture.id);
    assert.deepEqual(second, first, fixture.id + ' second parse');
  }
});

test('Provider fact invalid Fixtures expose the declared first issue path without rejected values', () => {
  assert.equal(invalidCases.length, 23);
  for (const fixture of invalidCases) {
    const error = assertIrError(
      () => parserFor(fixture.target)(fixture.input),
      fixture.errorCode,
      fixture.path,
    );
    const messages = error.issues.map(({ message }) => message).join(' ');
    for (const rejectedValue of sensitiveFixtureValues(fixture.input)) {
      assert.equal(
        messages.includes(rejectedValue),
        false,
        fixture.id + ' exposed ' + rejectedValue,
      );
    }
  }
});

test('ProviderNode rejects explicit undefined for required nullable fields', () => {
  const base = validCases.find(({ id }) => id === 'provider-node-typescript-class')?.input;
  assert.ok(base);
  assertIrError(
    () => parserFor('PROVIDER_NODE')({ ...base, qualifiedName: undefined }),
    'IR_VALIDATION_FAILED',
    ['qualifiedName'],
  );
  assertIrError(
    () => parserFor('PROVIDER_NODE')({ ...base, sourceRange: undefined }),
    'IR_VALIDATION_FAILED',
    ['sourceRange'],
  );
});

test('ProviderEdge same Provider validation checks source then resolved target then candidates', () => {
  const resolved = validCases.find(({ id }) => id === 'provider-edge-call-exact')?.input;
  const ambiguous = validCases.find(({ id }) => id === 'provider-edge-call-ambiguous')?.input;
  assert.ok(resolved);
  assert.ok(ambiguous);

  assertIrError(
    () =>
      parserFor('PROVIDER_EDGE')({
        ...resolved,
        source: { ...resolved.source, providerId: 'provider:jvm' },
        target: {
          ...resolved.target,
          target: { ...resolved.target.target, providerId: 'provider:jvm' },
        },
      }),
    'IR_VALIDATION_FAILED',
    ['source', 'providerId'],
  );
  assertIrError(
    () =>
      parserFor('PROVIDER_EDGE')({
        ...ambiguous,
        target: {
          ...ambiguous.target,
          candidates: ambiguous.target.candidates.map((candidate) => ({
            ...candidate,
            providerId: 'provider:jvm',
          })),
        },
      }),
    'IR_VALIDATION_FAILED',
    ['target', 'candidates', 0, 'providerId'],
  );
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

test('provider target candidate identity remains tuple-aware when IDs contain delimiters', () => {
  const first = { factType: 'NODE', providerId: 'a', providerFactId: 'b\u0000c' };
  const second = { factType: 'NODE', providerId: 'a\u0000b', providerFactId: 'c' };
  const value = {
    state: 'UNRESOLVED',
    resolution: 'AMBIGUOUS',
    originalHint: 'Widget.run',
    candidates: [first, second],
  };

  assert.deepEqual(ir.parseIr(ir.ProviderTargetSchema, value), value);
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
