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
const root = new URL('../fixtures/phase1/syntax-changed-only-oracle/', import.meta.url),
  bytes = (p) => fs.readFileSync(new URL(p, root)),
  json = (p) => JSON.parse(bytes(p)),
  sha = (b) => createHash('sha256').update(b).digest('hex'),
  lines = (b) =>
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
  test(mode + ' complete changed-only Source,removed inventory and full wire', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      source = bytes(mode + '/app.py');
    assert.deepEqual(
      source,
      fs.readFileSync(
        new URL(
          '../fixtures/phase1/syntax-observation-corpus/' + mode + '/changed-only-restart/app.py',
          import.meta.url,
        ),
      ),
    );
    assert.equal(source.length, 39);
    assert.equal(r.payload.sourceFiles[0].contentFingerprint, 'sha256:' + sha(source));
    assert.deepEqual(
      r.payload.sourceFiles.map((f) => f.path),
      ['app.py'],
    );
    assert.deepEqual(r.payload.removedSourceFiles, [
      {
        id: 'file:removed',
        path: 'removed.py',
        previousContentFingerprint: 'content:removed-previous',
      },
    ]);
    assert.notEqual(
      r.payload.expectedActivationBasis.contentFingerprint,
      r.payload.targetSource.contentFingerprint,
    );
    validateSyntaxOwnerContext(r, json(mode + '/context.json'));
    const out = validateSyntaxObservationStream(r, lines(raw));
    assert.equal(out.events.length, 6);
    assert.equal(out.outcome, 'SUCCEEDED');
    assert.deepEqual(out.counts, { nodes: 2, edges: 0, syntax: 1, coverage: 1, diagnostics: 0 });
    const nodes = out.events.filter((e) => e.type === 'NODE').map((e) => e.payload);
    assert.deepEqual(
      nodes.map((n) => n.name),
      ['app.py', 'changed_' + suffix],
    );
    assert.ok(nodes.every((n) => n.sourceRange.sourceFileId === 'file:one'));
    assert.equal(
      out.events.find((e) => e.type === 'SYNTAX_OBSERVATION').payload.owner.providerFactId,
      nodes[1].providerFactId,
    );
    compareSyntaxObservationOutput(r, raw, raw);
    const failed = bytes(mode + '/events-changed-source.jsonl');
    assert.throws(
      () => validateSyntaxObservationStream(r, lines(failed)),
      (e) => e.code === 'SOURCE_CHANGED',
    );
  });
  test(mode + ' complete pure Canonical Code references are provider-independent', () => {
    const r = json(mode + '/request.json'),
      p = r.payload,
      out = validateSyntaxObservationStream(r, lines(bytes(mode + '/events.jsonl'))),
      input = {
        basis: json(mode + '/basis.json'),
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        nodes: out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: [],
      };
    const result = normalizePythonObservation(input);
    assert.deepEqual(result, json(mode + '/normalized.json'));
    assert.equal(result.nodePairs.length, 2);
    const changed = structuredClone(input);
    changed.nodes.forEach((n) => (n.providerFactId += ':alternative'));
    assert.deepEqual(
      normalizePythonObservation(changed).nodePairs.map((p) => p.canonical),
      result.nodePairs.map((p) => p.canonical),
    );
  });
  test(mode + ' changed/removed identity or path overlap rejects before observation', () => {
    const r = json(mode + '/request.json'),
      context = json(mode + '/context.json');
    validateSyntaxOwnerContext(r, context);
    for (const [key, value] of [
      ['id', 'file:one'],
      ['path', 'app.py'],
    ]) {
      const changed = structuredClone(r);
      changed.payload.removedSourceFiles[0][key] = value;
      assert.throws(() => validateSyntaxOwnerContext(changed, context));
    }
  });
  test(mode + ' same-count resealed invented retained symbol name mismatches', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      rows = raw.toString().trim().split('\n').map(JSON.parse);
    compareSyntaxObservationOutput(r, raw, raw);
    rows.filter((e) => e.type === 'NODE')[1].payload.name = 'retained_' + suffix;
    const altered = reseal(rows);
    validateSyntaxObservationStream(r, lines(altered));
    assert.throws(
      () => compareSyntaxObservationOutput(r, altered, raw),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
}
test('changed-only calibration/holdout original Sources and Code references differ', () => {
  assert.notDeepEqual(bytes('calibration/app.py'), bytes('holdout/app.py'));
  assert.notDeepEqual(json('calibration/normalized.json'), json('holdout/normalized.json'));
});
