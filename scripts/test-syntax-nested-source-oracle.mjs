import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  validateSyntaxOwnerContext,
  validateSyntaxObservationStream,
  normalizePythonObservation,
} from '../packages/providers/dist/index.js';
import { compareSyntaxObservationOutput } from './syntax-observation-evidence.mjs';
const root = new URL('../fixtures/phase1/syntax-nested-source-oracle/', import.meta.url),
  bytes = (p) => fs.readFileSync(new URL(p, root)),
  json = (p) => JSON.parse(bytes(p)),
  sha = (b) => createHash('sha256').update(b).digest('hex');
const lines = (b) =>
  b
    .toString()
    .split(/(?<=\n)/)
    .filter(Boolean)
    .map((s) => Buffer.from(s));
function reseal(rows) {
  const prefix = rows
    .slice(0, -1)
    .map((e) => JSON.stringify(e) + '\n')
    .join('');
  rows.at(-1).payload.checksum = sha(Buffer.from(prefix));
  return Buffer.from(prefix + JSON.stringify(rows.at(-1)) + '\n');
}
for (const [mode, suffix] of [
  ['calibration', 'fixture'],
  ['holdout', 'holdout'],
]) {
  test(mode + ' full nested Source provenance,wire and exact lexical owners', () => {
    const r = json(mode + '/request.json'),
      source = bytes(mode + '/app.py'),
      raw = bytes(mode + '/events.jsonl');
    assert.deepEqual(
      source,
      fs.readFileSync(
        new URL(
          '../fixtures/phase1/syntax-observation-corpus/' + mode + '/nested-source/app.py',
          import.meta.url,
        ),
      ),
    );
    assert.equal(source.length, 91);
    assert.equal(r.payload.sourceFiles[0].contentFingerprint, 'sha256:' + sha(source));
    validateSyntaxOwnerContext(r, json(mode + '/context.json'));
    const out = validateSyntaxObservationStream(r, lines(raw));
    assert.equal(out.events.length, 8);
    assert.equal(out.outcome, 'SUCCEEDED');
    assert.deepEqual(out.counts, { nodes: 3, edges: 0, syntax: 2, coverage: 1, diagnostics: 0 });
    const n = out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      s = out.events.filter((e) => e.type === 'SYNTAX_OBSERVATION').map((e) => e.payload);
    assert.deepEqual(
      n.map((n) => n.qualifiedName),
      ['app.py', 'app.py::outer_' + suffix, 'app.py::outer_' + suffix + '.inner_' + suffix],
    );
    assert.deepEqual(
      s.map((s) => s.owner.providerFactId),
      [n[1].providerFactId, n[2].providerFactId],
    );
    assert.deepEqual(
      s.map((s) => s.syntaxKind),
      ['DECLARATION', 'DECLARATION'],
    );
    assert.deepEqual(out.events.find((e) => e.type === 'COVERAGE').payload.limitations, []);
    compareSyntaxObservationOutput(r, raw, raw);
  });
  test(mode + ' complete nested Canonical identities are provider-independent', () => {
    const r = json(mode + '/request.json'),
      out = validateSyntaxObservationStream(r, lines(bytes(mode + '/events.jsonl'))),
      p = r.payload;
    const input = {
      basis: json(mode + '/basis.json'),
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: p.sourceFiles,
      nodes: out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      edges: [],
    };
    const normalized = normalizePythonObservation(input);
    assert.deepEqual(normalized, json(mode + '/normalized.json'));
    assert.equal(new Set(normalized.nodePairs.map((p) => p.canonical.id)).size, 3);
    assert.equal(normalized.edgePairs.length, 0);
    const changed = structuredClone(input);
    changed.nodes.forEach((n) => (n.providerFactId += ':alternative'));
    assert.deepEqual(
      normalizePythonObservation(changed).nodePairs.map((p) => p.canonical),
      normalized.nodePairs.map((p) => p.canonical),
    );
  });
  test(mode + ' resealed nested declaration rebound to existing outer owner mismatches', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      rows = raw.toString().trim().split('\n').map(JSON.parse);
    compareSyntaxObservationOutput(r, raw, raw);
    const s = rows.filter((e) => e.type === 'SYNTAX_OBSERVATION');
    s[1].payload.owner = structuredClone(s[0].payload.owner);
    const altered = reseal(rows);
    validateSyntaxObservationStream(r, lines(altered));
    assert.throws(
      () => compareSyntaxObservationOutput(r, altered, raw),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
  test(mode + ' resealed flattened nested qualification mismatches', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      rows = raw.toString().trim().split('\n').map(JSON.parse);
    compareSyntaxObservationOutput(r, raw, raw);
    rows.filter((e) => e.type === 'NODE')[2].payload.qualifiedName = 'app.py::inner_' + suffix;
    const altered = reseal(rows);
    validateSyntaxObservationStream(r, lines(altered));
    assert.throws(
      () => compareSyntaxObservationOutput(r, altered, raw),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
}
test('distinct holdout Source and complete normalized references', () => {
  assert.notDeepEqual(bytes('calibration/app.py'), bytes('holdout/app.py'));
  assert.notDeepEqual(json('calibration/normalized.json'), json('holdout/normalized.json'));
});
