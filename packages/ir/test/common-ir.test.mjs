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
