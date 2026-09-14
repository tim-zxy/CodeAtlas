import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { z } from 'zod';

import * as ir from '../dist/index.js';

const {
  CanonicalIdSchema,
  ConfidenceSchema,
  EntityIdSchema,
  EntityRefSchema,
  EpochMillisecondsSchema,
  IrContractError,
  IrValidationError,
  parseIr,
  parseSchemaEnvelope,
  ResolutionLevelSchema,
  SourceRangeSchema,
  UtcInstantSchema,
  epochMillisecondsToUtcInstant,
  utcInstantToEpochMilliseconds,
} = ir;

const fixtureRoot = new URL('../../../fixtures/ir/common-v1/', import.meta.url);
const fixturePayloadSchema = z.strictObject({ value: z.string() });
const fixtureEnvelope = {
  schema: 'codeatlas.fixture.common',
  version: 1,
  payload: fixturePayloadSchema,
};

const parsers = {
  ENTITY_ID: (input) => parseIr(EntityIdSchema, input),
  CANONICAL_ID: (input) => parseIr(CanonicalIdSchema, input),
  ENTITY_REF: (input) => parseIr(EntityRefSchema, input),
  SOURCE_RANGE: (input) => parseIr(SourceRangeSchema, input),
  RESOLUTION_LEVEL: (input) => parseIr(ResolutionLevelSchema, input),
  CONFIDENCE: (input) => parseIr(ConfidenceSchema, input),
  UTC_INSTANT: (input) => parseIr(UtcInstantSchema, input),
  EPOCH_MILLISECONDS: (input) => parseIr(EpochMillisecondsSchema, input),
  FIXTURE_ENVELOPE: (input) => parseSchemaEnvelope(fixtureEnvelope, input),
};

const validCases = JSON.parse(await readFile(new URL('valid/cases.json', fixtureRoot), 'utf8'));
const invalidCases = JSON.parse(await readFile(new URL('invalid/cases.json', fixtureRoot), 'utf8'));

function parserFor(target) {
  const parser = parsers[target];
  assert.ok(parser, `fixture target ${target} must have an explicit parser`);
  return parser;
}

function assertIrError(callback, code, expectedPath) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof IrContractError);
    assert.equal(error.code, code);

    if (expectedPath !== undefined) {
      assert.ok(error instanceof IrValidationError);
      assert.ok(
        error.issues.some((issue) => JSON.stringify(issue.path) === JSON.stringify(expectedPath)),
      );
    }

    return true;
  });
}

function fixtureCategory(fixture) {
  switch (fixture.target) {
    case 'ENTITY_ID':
    case 'CANONICAL_ID':
      return 'identity';
    case 'ENTITY_REF':
      return fixture.id.includes('extra-key') ? 'entity ref unknown key' : 'entity ref';
    case 'SOURCE_RANGE':
      return 'range';
    case 'RESOLUTION_LEVEL':
      return 'resolution level';
    case 'CONFIDENCE':
      return 'confidence';
    case 'UTC_INSTANT':
    case 'EPOCH_MILLISECONDS':
      return 'time';
    case 'FIXTURE_ENVELOPE':
      return 'schema envelope';
    default:
      throw new Error(`fixture ${fixture.id} has an unknown target ${fixture.target}`);
  }
}

for (const fixture of validCases) {
  test(`valid ${fixtureCategory(fixture)} fixture ${fixture.id} preserves a JSON round-trip`, () => {
    const parser = parserFor(fixture.target);
    const first = parser(fixture.input);
    const second = parser(JSON.parse(JSON.stringify(first)));

    assert.deepEqual(second, first, fixture.id);
  });
}

for (const fixture of invalidCases) {
  test(`invalid ${fixtureCategory(fixture)} fixture ${fixture.id} exposes its typed code and path`, () => {
    assertIrError(() => parserFor(fixture.target)(fixture.input), fixture.errorCode, fixture.path);
  });
}

test('epoch milliseconds reject non-finite numbers', () => {
  for (const input of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assertIrError(() => parseIr(EpochMillisecondsSchema, input), 'IR_VALIDATION_FAILED');
  }
});

test('confidence scores reject non-finite numbers', () => {
  for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assertIrError(
      () => parseIr(ConfidenceSchema, { score, method: 'HEURISTIC', reasons: [] }),
      'IR_VALIDATION_FAILED',
      ['score'],
    );
  }
});

test('UTC instants and epoch milliseconds convert in both directions', () => {
  const instant = parseIr(UtcInstantSchema, '2026-09-10T12:34:56.789Z');
  const epochMilliseconds = parseIr(EpochMillisecondsSchema, 1789043696789);

  assert.equal(utcInstantToEpochMilliseconds(instant), epochMilliseconds);
  assert.equal(epochMillisecondsToUtcInstant(epochMilliseconds), instant);
});

test('schema envelopes retain JSON array and object payloads', () => {
  const jsonPayloadEnvelope = {
    schema: 'codeatlas.fixture.json',
    version: 1,
    payload: z.unknown(),
  };
  const arrayPayload = {
    schema: 'codeatlas.fixture.json',
    version: 1,
    payload: ['one', { two: 2 }],
  };
  const objectPayload = { schema: 'codeatlas.fixture.json', version: 1, payload: { one: [1, 2] } };

  assert.deepEqual(parseSchemaEnvelope(jsonPayloadEnvelope, arrayPayload), arrayPayload);
  assert.deepEqual(parseSchemaEnvelope(jsonPayloadEnvelope, objectPayload), objectPayload);
});

test('schema envelopes reject non-JSON payload values', () => {
  const jsonPayloadEnvelope = {
    schema: 'codeatlas.fixture.json',
    version: 1,
    payload: z.unknown(),
  };

  for (const payload of [undefined, BigInt(1), Number.NaN, Number.POSITIVE_INFINITY, () => {}]) {
    assertIrError(
      () =>
        parseSchemaEnvelope(jsonPayloadEnvelope, {
          schema: 'codeatlas.fixture.json',
          version: 1,
          payload,
        }),
      'IR_VALIDATION_FAILED',
      ['payload'],
    );
  }
});

test('schema envelopes validate outer shape before schema, version, and payload', () => {
  assertIrError(
    () =>
      parseSchemaEnvelope(fixtureEnvelope, {
        schema: 'provider.native',
        version: 1,
        payload: { value: 'ok' },
        extra: true,
      }),
    'IR_VALIDATION_FAILED',
    [],
  );
  assertIrError(
    () =>
      parseSchemaEnvelope(fixtureEnvelope, {
        schema: 'provider.native',
        version: 1,
        payload: () => {},
      }),
    'IR_VALIDATION_FAILED',
    ['payload'],
  );
  assertIrError(
    () =>
      parseSchemaEnvelope(fixtureEnvelope, { schema: 'provider.native', version: 2, payload: 42 }),
    'SCHEMA_MISMATCH',
  );
  assertIrError(
    () =>
      parseSchemaEnvelope(fixtureEnvelope, {
        schema: 'codeatlas.fixture.common',
        version: 2,
        payload: 42,
      }),
    'UNSUPPORTED_SCHEMA_VERSION',
  );
  assertIrError(
    () =>
      parseSchemaEnvelope(fixtureEnvelope, {
        schema: 'codeatlas.fixture.common',
        version: 1,
        payload: { value: 'ok' },
        extra: true,
      }),
    'IR_VALIDATION_FAILED',
    [],
  );
});

test('schema envelopes reject padded schema names without normalization', () => {
  assertIrError(
    () =>
      parseSchemaEnvelope(fixtureEnvelope, {
        schema: ' codeatlas.fixture.common',
        version: 1,
        payload: { value: 'ok' },
      }),
    'IR_VALIDATION_FAILED',
    ['schema'],
  );

  assertIrError(
    () =>
      parseSchemaEnvelope(
        {
          schema: ' codeatlas.fixture.common ',
          version: 1,
          payload: fixtureEnvelope.payload,
        },
        {
          schema: 'codeatlas.fixture.common',
          version: 1,
          payload: { value: 'ok' },
        },
      ),
    'IR_VALIDATION_FAILED',
    ['schema'],
  );
});

const jsonEnvelope = { schema: 'codeatlas.fixture.json', version: 1, payload: z.unknown() };
const envelopeReaders = {
  helper: (descriptor, input) => parseSchemaEnvelope(descriptor, input),
  schema: (descriptor, input) => parseIr(ir.createSchemaEnvelopeSchema(descriptor), input),
};

for (const [name, parse] of Object.entries({
  json: (payload) => parseIr(ir.JsonValueSchema, payload),
  raw: (payload) => parseIr(ir.SchemaEnvelopeSchema, { ...jsonEnvelope, payload }),
  ...Object.fromEntries(
    Object.entries(envelopeReaders).map(([name, read]) => [
      name,
      (payload) => read(jsonEnvelope, { ...jsonEnvelope, payload }),
    ]),
  ),
})) {
  test(`final review cycles: ${name} rejects a cycle at its field path`, () => {
    const circular = {};
    circular.self = circular;
    assertIrError(() => parse({ items: [circular] }), 'IR_VALIDATION_FAILED', [
      ...(name === 'json' ? [] : ['payload']),
      'items',
      0,
      'self',
    ]);
  });
}

test('final review cycles: malformed JSON precedes schema and version disagreement', () => {
  const circular = {};
  circular.self = circular;
  assertIrError(
    () => parseSchemaEnvelope(jsonEnvelope, { schema: 'wrong', version: 2, payload: circular }),
    'IR_VALIDATION_FAILED',
    ['payload', 'self'],
  );
});

test('final review cycles: shared acyclic children retain a JSON round-trip', () => {
  const child = { value: 'shared' };
  const input = { ...jsonEnvelope, payload: { left: child, right: child } };
  const first = parseSchemaEnvelope(jsonEnvelope, input);
  assert.deepEqual(first.payload, { left: { value: 'shared' }, right: { value: 'shared' } });
  assert.deepEqual(parseSchemaEnvelope(jsonEnvelope, JSON.parse(JSON.stringify(first))), first);
});

for (const [name, read] of Object.entries(envelopeReaders)) {
  test(`corrective output stability: ${name} returns plain JSON after a hidden toJSON transform`, () => {
    const descriptor = {
      ...jsonEnvelope,
      payload: z.strictObject({ value: z.string() }).transform((value) =>
        Object.defineProperty(value, 'toJSON', {
          value: () => ({ value: 'changed during serialization' }),
          enumerable: false,
        }),
      ),
    };
    const first = read(descriptor, { ...jsonEnvelope, payload: { value: 'original' } });
    const serialized = JSON.parse(JSON.stringify(first));

    assert.deepEqual(serialized.payload, { value: 'original' });
    assert.equal(Object.hasOwn(first.payload, 'toJSON'), false);
    assert.deepEqual(read(descriptor, serialized), first);
  });

  for (const { label, schema, input, path } of [
    { label: 'NaN output', schema: z.string().transform(Number), input: 'not-a-number', path: [] },
    { label: 'changed type', schema: z.string().transform(Number), input: '42', path: [] },
    {
      label: 'changed value',
      schema: z.number().transform((value) => value + 1),
      input: 1,
      path: [],
    },
    {
      label: 'mutated value',
      schema: z.unknown().transform((value) => {
        value.count += 1;
        return value;
      }),
      input: { count: 1 },
      path: [],
    },
    {
      label: 'stripped field',
      schema: z.object({ keep: z.string() }),
      input: { keep: 'value', extra: true },
      path: [],
    },
    {
      label: 'nested non-JSON output',
      schema: z.string().transform(() => ({ result: Number.NaN })),
      input: 'value',
      path: ['result'],
    },
    {
      label: 'circular output',
      schema: z.string().transform(() => {
        const circular = {};
        circular.self = circular;
        return circular;
      }),
      input: 'value',
      path: ['self'],
    },
  ]) {
    test(`final review output: ${name} rejects ${label}`, () => {
      assertIrError(
        () => read({ ...jsonEnvelope, payload: schema }, { ...jsonEnvelope, payload: input }),
        'IR_VALIDATION_FAILED',
        ['payload', ...path],
      );
    });
  }

  test(`final review output: ${name} accepts a representation-preserving transformation`, () => {
    const descriptor = {
      ...jsonEnvelope,
      payload: z.strictObject({ a: z.number(), b: z.string() }).transform(({ a, b }) => ({ b, a })),
    };
    const first = read(descriptor, { ...jsonEnvelope, payload: { a: 42, b: 'ok' } });
    assert.deepEqual(first.payload, { a: 42, b: 'ok' });
    assert.deepEqual(read(descriptor, JSON.parse(JSON.stringify(first))), first);
  });
}

test('final review diagnostics: unknown keys cannot expand validation prose', () => {
  const rejectedKey = `private-key-${'x'.repeat(5000)}`;
  assert.throws(
    () => parseIr(EntityRefSchema, { kind: 'SYMBOL', id: 'entity:01', [rejectedKey]: true }),
    (error) => {
      assert.ok(error instanceof IrValidationError);
      assert.deepEqual(error.issues[0].path, []);
      assert.ok(error.issues.every(({ message }) => message.length <= 128));
      assert.ok(!JSON.stringify(error).includes(rejectedKey));
      return true;
    },
  );
});

for (const [name, read] of Object.entries({
  primitive: (payload, input) => parseIr(payload, input),
  ...Object.fromEntries(
    Object.entries(envelopeReaders).map(([name, read]) => [
      name,
      (payload, input) => read({ ...jsonEnvelope, payload }, { ...jsonEnvelope, payload: input }),
    ]),
  ),
})) {
  test(`final review diagnostics: ${name} does not reflect custom rejected-input prose`, () => {
    const secret = 'private-rejected-value';
    const payload = z.strictObject({
      value: z.string().refine(() => false, { message: `${secret}-${'x'.repeat(5000)}` }),
    });
    assert.throws(
      () => read(payload, { value: secret }),
      (error) => {
        assert.ok(error instanceof IrValidationError);
        assert.deepEqual(error.issues[0].path, [
          ...(name === 'primitive' ? [] : ['payload']),
          'value',
        ]);
        assert.ok(error.issues.every(({ message }) => message.length <= 128));
        assert.ok(!JSON.stringify(error).includes(secret));
        assert.ok(!error.message.includes(secret));
        return true;
      },
    );
  });
}

test('final review primitives: an explicit undefined revision is rejected at its field path', () => {
  assertIrError(
    () => parseIr(EntityRefSchema, { kind: 'SYMBOL', id: 'entity:01', revisionId: undefined }),
    'IR_VALIDATION_FAILED',
    ['revisionId'],
  );
});

test('final review primitives: negative zero is rejected at the generic JSON boundary', () => {
  assertIrError(() => parseIr(ir.JsonValueSchema, { value: -0 }), 'IR_VALIDATION_FAILED', [
    'value',
  ]);
});

test('final review primitives: epoch conversion rejects negative zero before converting', () => {
  assertIrError(() => epochMillisecondsToUtcInstant(-0), 'IR_VALIDATION_FAILED', []);
});
