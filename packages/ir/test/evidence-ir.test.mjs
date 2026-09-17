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

  assert.deepEqual(
    parsers.FACT_EVIDENCE({ fact: canonicalFact, evidenceId: 'evidence:edge-a' }),
    { fact: canonicalFact, evidenceId: 'evidence:edge-a' },
  );
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
