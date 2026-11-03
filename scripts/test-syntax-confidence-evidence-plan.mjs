import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  cases,
  loadMappingCase,
  sha,
} from '../fixtures/phase1/syntax-mapping-preparation/corpus.mjs';
const fixture = new URL('../fixtures/phase1/syntax-mapping-preparation/', import.meta.url);
const path = new URL(
  '../docs/superpowers/specs/2026-10-25-phase1-syntax-confidence-evidence-plan.json',
  import.meta.url,
);
const read = () => JSON.parse(readFileSync(path, 'utf8'));
const included = cases.filter((c) => c.provenanceClass !== 'IDENTITY_ENCODING_ONLY');
function keys(v, expected) {
  assert.deepEqual(Object.keys(v).sort(), expected.split(' ').sort());
}
function features(i) {
  const resolutions = new Set();
  let hasUnknown = false;
  function scan(v) {
    if (!v || typeof v !== 'object') return;
    if (v.kind === 'UNKNOWN') hasUnknown = true;
    if (v.state === 'RESOLVED' || v.state === 'UNRESOLVED') resolutions.add(v.resolution);
    for (const x of Object.values(v))
      if (Array.isArray(x)) x.forEach(scan);
      else scan(x);
  }
  scan(i.raw.payload);
  return {
    syntaxKind: i.raw.syntaxKind,
    ownerState: i.raw.owner ? 'PRESENT' : 'NULL',
    resolutionClasses: resolutions.size ? [...resolutions].sort() : ['NO_REFERENCE'],
    hasUnknown,
    dynamicGrounding: i.annotation.dynamicGrounding,
  };
}
function validate(p) {
  keys(p, 'schemaVersion status basis rows numericalPolicy thresholds measurements nextDecision');
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.status, 'EVIDENCE_PLAN_ONLY');
  assert.equal(p.nextDecision, 'REVIEW_EVIDENCE_PROTOCOL_BEFORE_ANY_EXECUTION');
  for (const f of ['numericalPolicy', 'thresholds', 'measurements']) assert.equal(p[f], null);
  keys(p.basis, 'fixtureId provenanceSha256 mappingContract');
  assert.equal(p.basis.fixtureId, 'p1-syntax-mapping-preparation-v1');
  assert.equal(p.basis.provenanceSha256, sha(readFileSync(new URL('provenance.json', fixture))));
  assert.equal(
    p.basis.mappingContract,
    'docs/superpowers/specs/2026-10-25-phase1-syntax-mapping-confidence-design.md',
  );
  assert.deepEqual(
    p.rows.map((r) => r.caseId),
    included.map((c) => c.id),
  );
  p.rows.forEach((r, n) => {
    keys(
      r,
      'caseId provenanceClass sourceRefs sourceHashes syntaxKind ownerState resolutionClasses hasUnknown dynamicGrounding expectedSemanticDisposition observedSemanticDisposition',
    );
    const c = included[n],
      { input: i, expected: e } = loadMappingCase(c.id);
    assert.equal(r.provenanceClass, c.provenanceClass);
    assert.deepEqual(r.sourceRefs, c.sourceRefs);
    assert.deepEqual(Object.keys(r.sourceHashes).sort(), [...c.sourceRefs].sort());
    for (const source of c.sourceRefs)
      assert.equal(r.sourceHashes[source], sha(readFileSync(new URL(source, fixture))));
    const f = features(i);
    for (const k of Object.keys(f)) assert.deepEqual(r[k], f[k]);
    assert.ok(
      ['SOURCE_ANNOTATED_DYNAMIC', 'STATIC_SYNTAX_ONLY', 'UNDETERMINED'].includes(
        r.dynamicGrounding,
      ),
    );
    assert.equal(r.expectedSemanticDisposition, e.semanticDisposition);
    assert.equal(r.observedSemanticDisposition, null);
  });
  return p;
}
test('evidence plan covers all declared mapping cases but no encoding probes', () => {
  const p = validate(read());
  assert.equal(p.rows.length, 31);
  assert.equal(
    p.rows.some((r) =>
      ['unicode-key-order', 'integer-key-order', 'extraction-version-encoding'].includes(r.caseId),
    ),
    false,
  );
  for (const change of [(p) => p.rows.pop(), (p) => (p.rows[0].caseId = 'foreign')]) {
    const p = read();
    change(p);
    assert.throws(() => validate(p));
  }
});
test('features and source hashes match frozen corpus', () => {
  validate(read());
  for (const change of [
    (p) => (p.rows[0].sourceHashes[p.rows[0].sourceRefs[0]] = 'a'.repeat(64)),
    (p) => (p.rows[0].ownerState = 'NULL'),
  ]) {
    const p = read();
    change(p);
    assert.throws(() => validate(p));
  }
});
test('unknown is not implicitly dynamic', () => {
  const p = validate(read()),
    r = p.rows.find((r) => r.caseId === 'value-unknown');
  assert.equal(r.hasUnknown, true);
  assert.equal(r.dynamicGrounding, 'UNDETERMINED');
  r.dynamicGrounding = 'SOURCE_ANNOTATED_DYNAMIC';
  assert.throws(() => validate(p));
});
test('numeric or observed result is never manufactured', () => {
  validate(read());
  for (const change of [
    (p) => (p.numericalPolicy = {}),
    (p) => (p.measurements = {}),
    (p) => (p.thresholds = {}),
    (p) => (p.rows[0].runtimeAdmission = true),
    (p) => (p.rows[0].observedSemanticDisposition = 'PASS'),
  ]) {
    const p = read();
    change(p);
    assert.throws(() => validate(p));
  }
});
test('new test registers exactly once', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(
    pkg.scripts.test
      .split(/\s+/)
      .filter((p) => p === 'scripts/test-syntax-confidence-evidence-plan.mjs').length,
    1,
  );
});
