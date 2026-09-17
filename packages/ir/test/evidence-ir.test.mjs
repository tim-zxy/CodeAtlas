import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as ir from '../dist/index.js';

const root = new URL('../../../fixtures/ir/evidence-v1/', import.meta.url);
const expectedIndex = {
  schemaVersion: 1,
  id: 'p0-evidence-ir-v1',
  task: 'P0-W1-004',
  governingSpec: 'docs/handoff/specs/CANONICAL_IR.md',
  acceptance: 'One canonical fact retains independent supports',
  validCases: 'valid/cases.json',
  invalidCases: 'invalid/cases.json',
};
const index = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));
assert.deepEqual(index, expectedIndex);
const validCases = JSON.parse(await readFile(new URL(index.validCases, root), 'utf8'));
const invalidCases = JSON.parse(await readFile(new URL(index.invalidCases, root), 'utf8'));
const parsers = {
  EVIDENCE: (input) => ir.parseIr(ir.EvidenceSchema, input),
  FACT_EVIDENCE: (input) => ir.parseIr(ir.FactEvidenceSchema, input),
  PROVIDER_FACT_BINDING: (input) => ir.parseIr(ir.ProviderFactBindingSchema, input),
};
const envelopeCases = [
  {
    label: 'Evidence',
    descriptor: {
      schema: 'codeatlas.fixture.evidence.evidence',
      version: 1,
      payload: ir.EvidenceSchema,
    },
    validFixtureId: 'evidence-active-node-a',
    invalidFixtureId: 'evidence-unknown-key',
  },
  {
    label: 'FactEvidence',
    descriptor: {
      schema: 'codeatlas.fixture.evidence.fact-evidence',
      version: 1,
      payload: ir.FactEvidenceSchema,
    },
    validFixtureId: 'fact-evidence-node-a',
    invalidFixtureId: 'fact-evidence-unknown-key',
  },
  {
    label: 'ProviderFactBinding',
    descriptor: {
      schema: 'codeatlas.fixture.evidence.provider-fact-binding',
      version: 1,
      payload: ir.ProviderFactBindingSchema,
    },
    validFixtureId: 'provider-binding-node-a',
    invalidFixtureId: 'provider-binding-unknown-key',
  },
];
const envelopeParsers = [
  {
    label: 'parseSchemaEnvelope',
    parse: (descriptor, input) => ir.parseSchemaEnvelope(descriptor, input),
  },
  {
    label: 'createSchemaEnvelopeSchema',
    parse: (descriptor, input) => ir.parseIr(ir.createSchemaEnvelopeSchema(descriptor), input),
  },
];

function validInput(id) {
  const fixture = validCases.find((entry) => entry.id === id);
  assert.ok(fixture, 'Fixture must exist: ' + id);
  return fixture.input;
}

function invalidInput(id) {
  const fixture = invalidCases.find((entry) => entry.id === id);
  assert.ok(fixture, 'Invalid Fixture must exist: ' + id);
  return fixture.input;
}

function assertIrError(callback, code, expectedPath) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ir.IrContractError);
    assert.equal(error.code, code);
    if (expectedPath !== undefined) {
      assert.ok(error instanceof ir.IrValidationError);
      assert.deepEqual(error.issues[0].path, expectedPath);
    }
    return true;
  });
}

for (const fixture of validCases) {
  test('valid Evidence Fixture ' + fixture.id + ' round-trips', () => {
    const parsed = parsers[fixture.target](fixture.input);
    assert.deepEqual(parsed, fixture.input);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), fixture.input);
  });
}
for (const fixture of invalidCases) {
  test('invalid Evidence Fixture ' + fixture.id + ' reports its first path', () => {
    assert.throws(
      () => parsers[fixture.target](fixture.input),
      (error) => {
        assert.ok(error instanceof ir.IrValidationError);
        assert.equal(error.code, fixture.errorCode);
        assert.deepEqual(error.issues[0].path, fixture.path);
        return true;
      },
    );
  });
}

test('Evidence rejects exact identity, status, strict-object, missing-field, and undefined boundaries', () => {
  const input = validCases[0].input;
  const cases = [
    { label: 'blank ID', input: { ...input, id: '' }, path: ['id'] },
    { label: 'padded ID', input: { ...input, id: ' evidence:node-a' }, path: ['id'] },
    { label: 'unknown status', input: { ...input, status: 'UNKNOWN' }, path: ['status'] },
    { label: 'unknown key', input: { ...input, extra: true }, path: [] },
    {
      label: 'missing required field',
      input: (({ revisionId: _revisionId, ...withoutRevisionId }) => withoutRevisionId)(input),
      path: ['revisionId'],
    },
    {
      label: 'explicit undefined',
      input: { ...input, providerSnapshotId: undefined },
      path: ['providerSnapshotId'],
    },
  ];

  for (const boundaryCase of cases) {
    assert.throws(
      () => parsers.EVIDENCE(boundaryCase.input),
      (error) => {
        assert.ok(error instanceof ir.IrValidationError, boundaryCase.label);
        assert.equal(error.code, 'IR_VALIDATION_FAILED', boundaryCase.label);
        assert.deepEqual(error.issues[0].path, boundaryCase.path, boundaryCase.label);
        return true;
      },
    );
  }
});

test('Evidence relations reject blank Evidence IDs, unknown fields, and swapped reference shapes', () => {
  const factEvidence = validCases.find((fixture) => fixture.target === 'FACT_EVIDENCE').input;
  const providerFactBinding = validCases.find(
    (fixture) => fixture.target === 'PROVIDER_FACT_BINDING',
  ).input;
  const cases = [
    {
      label: 'FactEvidence blank Evidence ID',
      parser: parsers.FACT_EVIDENCE,
      input: { ...factEvidence, evidenceId: '' },
      path: ['evidenceId'],
    },
    {
      label: 'FactEvidence unknown key',
      parser: parsers.FACT_EVIDENCE,
      input: { ...factEvidence, extra: true },
      path: [],
    },
    {
      label: 'ProviderFactBinding blank Evidence ID',
      parser: parsers.PROVIDER_FACT_BINDING,
      input: { ...providerFactBinding, evidenceId: '' },
      path: ['evidenceId'],
    },
    {
      label: 'ProviderFactBinding unknown key',
      parser: parsers.PROVIDER_FACT_BINDING,
      input: { ...providerFactBinding, extra: true },
      path: [],
    },
    {
      label: 'ProviderFactBinding rejects Provider reference as Canonical reference',
      parser: parsers.PROVIDER_FACT_BINDING,
      input: { ...providerFactBinding, canonicalFact: providerFactBinding.providerFact },
      path: ['canonicalFact', 'id'],
    },
  ];

  for (const boundaryCase of cases) {
    assert.throws(
      () => boundaryCase.parser(boundaryCase.input),
      (error) => {
        assert.ok(error instanceof ir.IrValidationError, boundaryCase.label);
        assert.equal(error.code, 'IR_VALIDATION_FAILED', boundaryCase.label);
        assert.deepEqual(error.issues[0].path, boundaryCase.path, boundaryCase.label);
        return true;
      },
    );
  }
});

test('Evidence relations accept matching EDGE references', () => {
  const providerFact = {
    factType: 'EDGE',
    providerId: 'provider:a',
    providerFactId: 'provider-fact:edge-a',
  };
  const canonicalFact = { factType: 'EDGE', id: 'canonical:edge-01' };

  assert.deepEqual(parsers.FACT_EVIDENCE({ fact: canonicalFact, evidenceId: 'evidence:edge-a' }), {
    fact: canonicalFact,
    evidenceId: 'evidence:edge-a',
  });
  assert.deepEqual(
    parsers.PROVIDER_FACT_BINDING({
      providerFact,
      providerSnapshotId: 'entity:snapshot-a',
      canonicalFact,
      evidenceId: 'evidence:edge-a',
    }),
    {
      providerFact,
      providerSnapshotId: 'entity:snapshot-a',
      canonicalFact,
      evidenceId: 'evidence:edge-a',
    },
  );
});

test('one Canonical Fact retains two independent Provider supports', () => {
  const evidence = ['evidence-active-node-a', 'evidence-active-node-b'].map((id) =>
    ir.parseIr(ir.EvidenceSchema, validInput(id)),
  );
  const links = ['fact-evidence-node-a', 'fact-evidence-node-b'].map((id) =>
    ir.parseIr(ir.FactEvidenceSchema, validInput(id)),
  );
  const bindings = ['provider-binding-node-a', 'provider-binding-node-b'].map((id) =>
    ir.parseIr(ir.ProviderFactBindingSchema, validInput(id)),
  );
  assert.notEqual(evidence[0].id, evidence[1].id);
  assert.notEqual(evidence[0].providerFact.providerId, evidence[1].providerFact.providerId);
  assert.notEqual(evidence[0].providerSnapshotId, evidence[1].providerSnapshotId);
  assert.deepEqual(
    links.map((row) => row.fact),
    [
      { factType: 'NODE', id: 'canonical:node-01' },
      { factType: 'NODE', id: 'canonical:node-01' },
    ],
  );
  assert.deepEqual(
    bindings.map((row) => row.evidenceId),
    evidence.map((row) => row.id),
  );
  assert.deepEqual(
    links.map((row) => row.evidenceId),
    evidence.map((row) => row.id),
  );
  assert.deepEqual(
    evidence.map((row) => row.status),
    ['ACTIVE', 'ACTIVE'],
  );
  for (const [index, binding] of bindings.entries()) {
    assert.deepEqual(binding.providerFact, evidence[index].providerFact);
    assert.equal(binding.providerSnapshotId, evidence[index].providerSnapshotId);
    assert.deepEqual(binding.canonicalFact, links[index].fact);
  }
  const superseded = ir.validateEvidenceTransition(evidence[0], {
    ...evidence[0],
    status: 'SUPERSEDED',
  });
  assert.deepEqual([superseded.status, evidence[1].status], ['SUPERSEDED', 'ACTIVE']);
});

test('Evidence transitions preserve identity and only terminalize active evidence', () => {
  const active = validCases.find((fixture) => fixture.id === 'evidence-active-node-a').input;
  const superseded = { ...active, status: 'SUPERSEDED' };
  const invalidated = { ...active, status: 'INVALIDATED' };

  assert.deepEqual(ir.validateEvidenceTransition(active, active), active);
  assert.deepEqual(ir.validateEvidenceTransition(active, superseded), superseded);
  assert.deepEqual(ir.validateEvidenceTransition(active, invalidated), invalidated);
  assert.deepEqual(ir.validateEvidenceTransition(superseded, superseded), superseded);
  assert.deepEqual(ir.validateEvidenceTransition(invalidated, invalidated), invalidated);

  const immutableCases = [
    { field: 'id', next: { ...active, id: 'evidence:node-b' }, path: ['next', 'id'] },
    {
      field: 'repositoryId',
      next: { ...active, repositoryId: 'entity:repository-b' },
      path: ['next', 'repositoryId'],
    },
    {
      field: 'revisionId',
      next: { ...active, revisionId: 'entity:revision-b' },
      path: ['next', 'revisionId'],
    },
    {
      field: 'providerSnapshotId',
      next: { ...active, providerSnapshotId: 'entity:snapshot-b' },
      path: ['next', 'providerSnapshotId'],
    },
    {
      field: 'providerFact.factType',
      next: { ...active, providerFact: { ...active.providerFact, factType: 'EDGE' } },
      path: ['next', 'providerFact', 'factType'],
    },
    {
      field: 'providerFact.providerId',
      next: { ...active, providerFact: { ...active.providerFact, providerId: 'provider:b' } },
      path: ['next', 'providerFact', 'providerId'],
    },
    {
      field: 'providerFact.providerFactId',
      next: {
        ...active,
        providerFact: { ...active.providerFact, providerFactId: 'provider-fact:node-b' },
      },
      path: ['next', 'providerFact', 'providerFactId'],
    },
  ];

  for (const immutableCase of immutableCases) {
    assert.throws(
      () => ir.validateEvidenceTransition(active, immutableCase.next),
      (error) => {
        assert.ok(error instanceof ir.IrValidationError, immutableCase.field);
        assert.equal(error.code, 'IR_VALIDATION_FAILED', immutableCase.field);
        assert.deepEqual(error.issues[0].path, immutableCase.path, immutableCase.field);
        return true;
      },
    );
  }

  const forbiddenStatusCases = [
    { previous: superseded, next: active, label: 'SUPERSEDED -> ACTIVE' },
    { previous: invalidated, next: active, label: 'INVALIDATED -> ACTIVE' },
    { previous: superseded, next: invalidated, label: 'SUPERSEDED -> INVALIDATED' },
    { previous: invalidated, next: superseded, label: 'INVALIDATED -> SUPERSEDED' },
  ];

  for (const statusCase of forbiddenStatusCases) {
    assert.throws(
      () => ir.validateEvidenceTransition(statusCase.previous, statusCase.next),
      (error) => {
        assert.ok(error instanceof ir.IrValidationError, statusCase.label);
        assert.equal(error.code, 'IR_VALIDATION_FAILED', statusCase.label);
        assert.deepEqual(error.issues[0].path, ['next', 'status'], statusCase.label);
        return true;
      },
    );
  }
});

for (const envelopeCase of envelopeCases) {
  test(`${envelopeCase.label} version-1 envelope JSON-round-trips through both public APIs`, () => {
    const input = {
      schema: envelopeCase.descriptor.schema,
      version: 1,
      payload: validInput(envelopeCase.validFixtureId),
    };
    for (const envelopeParser of envelopeParsers) {
      const first = envelopeParser.parse(envelopeCase.descriptor, input);
      const second = envelopeParser.parse(
        envelopeCase.descriptor,
        JSON.parse(JSON.stringify(first)),
      );
      assert.deepEqual(first, input, envelopeParser.label);
      assert.deepEqual(second, first, envelopeParser.label);
    }
  });

  test(`${envelopeCase.label} version-1 envelope rejects a structured Fixture payload through both public APIs`, () => {
    const input = {
      schema: envelopeCase.descriptor.schema,
      version: 1,
      payload: invalidInput(envelopeCase.invalidFixtureId),
    };
    for (const envelopeParser of envelopeParsers) {
      assertIrError(
        () => envelopeParser.parse(envelopeCase.descriptor, input),
        'IR_VALIDATION_FAILED',
        ['payload'],
      );
    }
  });

  test(`${envelopeCase.label} parseSchemaEnvelope orders schema, version, then payload failures`, () => {
    const payload = invalidInput(envelopeCase.invalidFixtureId);
    assertIrError(
      () =>
        ir.parseSchemaEnvelope(envelopeCase.descriptor, {
          schema: 'codeatlas.fixture.evidence.wrong',
          version: 2,
          payload,
        }),
      'SCHEMA_MISMATCH',
    );
    assertIrError(
      () =>
        ir.parseSchemaEnvelope(envelopeCase.descriptor, {
          schema: envelopeCase.descriptor.schema,
          version: 2,
          payload,
        }),
      'UNSUPPORTED_SCHEMA_VERSION',
    );
    assertIrError(
      () =>
        ir.parseSchemaEnvelope(envelopeCase.descriptor, {
          schema: envelopeCase.descriptor.schema,
          version: 1,
          payload,
        }),
      'IR_VALIDATION_FAILED',
      ['payload'],
    );
  });

  test(`${envelopeCase.label} createSchemaEnvelopeSchema reports schema, version, and payload paths`, () => {
    const parser = ir.createSchemaEnvelopeSchema(envelopeCase.descriptor);
    const payload = invalidInput(envelopeCase.invalidFixtureId);
    assertIrError(
      () => ir.parseIr(parser, { schema: 'codeatlas.fixture.evidence.wrong', version: 2, payload }),
      'IR_VALIDATION_FAILED',
      ['schema'],
    );
    assertIrError(
      () => ir.parseIr(parser, { schema: envelopeCase.descriptor.schema, version: 2, payload }),
      'IR_VALIDATION_FAILED',
      ['version'],
    );
    assertIrError(
      () => ir.parseIr(parser, { schema: envelopeCase.descriptor.schema, version: 1, payload }),
      'IR_VALIDATION_FAILED',
      ['payload'],
    );
  });
}

test('Evidence transition parses both inputs before enforcing lifecycle policy', () => {
  const active = validCases.find((fixture) => fixture.id === 'evidence-active-node-a').input;
  const superseded = { ...active, status: 'SUPERSEDED' };

  const cases = [
    { label: 'invalid previous', previous: { ...superseded, status: 'UNKNOWN' }, next: active },
    { label: 'invalid next', previous: superseded, next: { ...active, status: 'UNKNOWN' } },
  ];

  for (const transitionCase of cases) {
    assert.throws(
      () => ir.validateEvidenceTransition(transitionCase.previous, transitionCase.next),
      (error) => {
        assert.equal(error.code, 'IR_VALIDATION_FAILED', transitionCase.label);
        assert.deepEqual(error.issues[0].path, ['status'], transitionCase.label);
        return true;
      },
    );
  }
});
