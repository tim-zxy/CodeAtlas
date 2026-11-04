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
const root = new URL('../fixtures/phase1/syntax-dynamic-malformed-oracle/', import.meta.url);
const bytes = (p) => fs.readFileSync(new URL(p, root)),
  json = (p) => JSON.parse(bytes(p));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lines = (b) =>
  b
    .toString()
    .split(/(?<=\n)/)
    .filter(Boolean)
    .map((s) => Buffer.from(s));
function reseal(rows) {
  rows.forEach((e, i) => (e.sequence = i));
  const prefix = rows
    .slice(0, -1)
    .map((e) => JSON.stringify(e) + '\n')
    .join('');
  rows.at(-1).payload.checksum = sha(Buffer.from(prefix));
  return Buffer.from(prefix + JSON.stringify(rows.at(-1)) + '\n');
}
for (const mode of ['calibration', 'holdout']) {
  test(mode + ' complete dynamic/malformed wire and original Source provenance', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      source = bytes(mode + '/app.py');
    assert.deepEqual(
      source,
      fs.readFileSync(
        new URL(
          '../fixtures/phase1/syntax-observation-corpus/' + mode + '/dynamic-malformed/app.py',
          import.meta.url,
        ),
      ),
    );
    assert.equal(source.length, 79);
    assert.equal(r.payload.sourceFiles[0].contentFingerprint, 'sha256:' + sha(source));
    validateSyntaxOwnerContext(r, json(mode + '/context.json'));
    const out = validateSyntaxObservationStream(r, lines(raw));
    assert.equal(out.events.length, 9);
    assert.equal(out.outcome, 'PARTIAL');
    assert.deepEqual(out.counts, { nodes: 2, edges: 0, syntax: 3, coverage: 1, diagnostics: 1 });
    const syntax = out.events.filter((e) => e.type === 'SYNTAX_OBSERVATION');
    assert.deepEqual(
      syntax.map((e) => e.payload.syntaxKind),
      ['DECORATION', 'DECLARATION', 'INVOCATION'],
    );
    assert.deepEqual(syntax[0].payload.payload.arguments[0].value, {
      kind: 'UNKNOWN',
      reason: 'DYNAMIC_EXPRESSION',
    });
    assert.equal(syntax[0].payload.payload.callee.target.state, 'UNRESOLVED');
    assert.equal(out.events.find((e) => e.type === 'DIAGNOSTIC').payload.code, 'SYNTAX_ERROR');
    compareSyntaxObservationOutput(r, raw, raw);
  });
  test(mode + ' full Canonical references and Provider-ID independence', () => {
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
    assert.equal(normalized.nodePairs.length, 2);
    assert.equal(normalized.edgePairs.length, 0);
    const changed = structuredClone(input);
    changed.nodes.forEach((n) => (n.providerFactId += ':alternative'));
    assert.deepEqual(
      normalizePythonObservation(changed).nodePairs.map((p) => p.canonical),
      normalized.nodePairs.map((p) => p.canonical),
    );
  });
  test(mode + ' resealed fabricated route literal cannot match complete reference', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      rows = raw.toString().trim().split('\n').map(JSON.parse);
    compareSyntaxObservationOutput(r, raw, raw);
    rows.find((e) => e.type === 'SYNTAX_OBSERVATION').payload.payload.arguments[0].value = {
      kind: 'STRING',
      value: '/dynamic',
    };
    const altered = reseal(rows);
    validateSyntaxObservationStream(r, lines(altered));
    assert.throws(
      () => compareSyntaxObservationOutput(r, altered, raw),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
  test(mode + ' resealed omitted syntax warning cannot match full reference', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      rows = raw
        .toString()
        .trim()
        .split('\n')
        .map(JSON.parse)
        .filter((e) => e.type !== 'DIAGNOSTIC');
    compareSyntaxObservationOutput(r, raw, raw);
    rows.at(-1).payload.counts.diagnostics = 0;
    const altered = reseal(rows);
    validateSyntaxObservationStream(r, lines(altered));
    assert.throws(
      () => compareSyntaxObservationOutput(r, altered, raw),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
}
test('calibration and holdout have distinct Source,wire and recovered symbol references', () => {
  assert.notDeepEqual(bytes('calibration/app.py'), bytes('holdout/app.py'));
  assert.notDeepEqual(bytes('calibration/events.jsonl'), bytes('holdout/events.jsonl'));
  assert.notDeepEqual(json('calibration/normalized.json'), json('holdout/normalized.json'));
});
