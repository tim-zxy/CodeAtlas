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
const root = new URL('../fixtures/phase1/syntax-bounded-output-oracle/', import.meta.url),
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
  test(mode + ' full bounded Source and complete68-record reference', () => {
    const r = json(mode + '/request.json'),
      source = bytes(mode + '/app.py'),
      raw = bytes(mode + '/events.jsonl');
    assert.deepEqual(
      source,
      fs.readFileSync(
        new URL(
          '../fixtures/phase1/syntax-observation-corpus/' + mode + '/bounded-output/app.py',
          import.meta.url,
        ),
      ),
    );
    assert.equal(r.payload.sourceFiles[0].contentFingerprint, 'sha256:' + sha(source));
    assert.equal(r.payload.resourceBudget.maxEvents, 1000);
    validateSyntaxOwnerContext(r, json(mode + '/context.json'));
    const out = validateSyntaxObservationStream(r, lines(raw));
    assert.equal(out.events.length, 68);
    assert.equal(out.outcome, 'SUCCEEDED');
    assert.deepEqual(out.counts, { nodes: 33, edges: 0, syntax: 32, coverage: 1, diagnostics: 0 });
    const nodes = out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      syntax = out.events.filter((e) => e.type === 'SYNTAX_OBSERVATION').map((e) => e.payload);
    assert.deepEqual(
      nodes.slice(1).map((n) => n.name),
      Array.from({ length: 32 }, (_, i) => 'item_' + suffix + '_' + i),
    );
    assert.deepEqual(
      syntax.map((s) => s.owner.providerFactId),
      nodes.slice(1).map((n) => n.providerFactId),
    );
    compareSyntaxObservationOutput(r, raw, raw);
  });
  test(mode + ' full33-node Canonical reference is Provider-ID independent', () => {
    const r = json(mode + '/request.json'),
      out = validateSyntaxObservationStream(r, lines(bytes(mode + '/events.jsonl'))),
      p = r.payload,
      input = {
        basis: json(mode + '/basis.json'),
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        nodes: out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: [],
      };
    const normalized = normalizePythonObservation(input);
    assert.deepEqual(normalized, json(mode + '/normalized.json'));
    assert.equal(new Set(normalized.nodePairs.map((p) => p.canonical.id)).size, 33);
    const changed = structuredClone(input);
    changed.nodes.forEach((n) => (n.providerFactId += ':alternative'));
    assert.deepEqual(
      normalizePythonObservation(changed).nodePairs.map((p) => p.canonical),
      normalized.nodePairs.map((p) => p.canonical),
    );
  });
  test(mode + ' same-count resealed last declaration rebound to first owner mismatches', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl'),
      rows = raw.toString().trim().split('\n').map(JSON.parse);
    compareSyntaxObservationOutput(r, raw, raw);
    const syntax = rows.filter((e) => e.type === 'SYNTAX_OBSERVATION');
    syntax.at(-1).payload.owner = structuredClone(syntax[0].payload.owner);
    const altered = reseal(rows);
    validateSyntaxObservationStream(r, lines(altered));
    assert.throws(
      () => compareSyntaxObservationOutput(r, altered, raw),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
  test(mode + ' exact derived event/byte allowance and full one-below refusals', () => {
    const r = json(mode + '/request.json'),
      raw = bytes(mode + '/events.jsonl');
    compareSyntaxObservationOutput(r, raw, raw);
    const events = structuredClone(r);
    events.payload.resourceBudget.maxEvents = 68;
    compareSyntaxObservationOutput(events, raw, raw);
    const exactBytes = structuredClone(r);
    exactBytes.payload.resourceBudget.maxOutputBytes = raw.length;
    compareSyntaxObservationOutput(exactBytes, raw, raw);
    for (const [name, field, limit, code] of [
      ['events-short', 'maxEvents', 67, 'RESOURCE_LIMIT_EXCEEDED'],
      ['bytes-short', 'maxOutputBytes', raw.length - 1, 'RESOURCE_LIMIT_EXCEEDED'],
      ['changed-source', null, null, 'SOURCE_CHANGED'],
    ]) {
      const request = structuredClone(r);
      if (field) request.payload.resourceBudget[field] = limit;
      const failed = bytes(mode + '/events-' + name + '.jsonl'),
        rows = failed.toString().trim().split('\n').map(JSON.parse);
      assert.ok(!rows.some((e) => e.type === 'SYNTAX_COMPLETED'));
      assert.equal(rows.at(-1).payload.code, code);
      assert.throws(
        () => validateSyntaxObservationStream(request, lines(failed)),
        (e) => e.code === code,
      );
    }
  });
}
test('bounded calibration/holdout Source and full references are distinct', () => {
  assert.notDeepEqual(bytes('calibration/app.py'), bytes('holdout/app.py'));
  assert.notDeepEqual(json('calibration/normalized.json'), json('holdout/normalized.json'));
});
