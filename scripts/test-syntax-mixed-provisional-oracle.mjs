import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  validateSyntaxOwnerContext,
  validateSyntaxObservationStream,
  normalizePythonObservation,
  computeSyntaxOwnerMapDigest,
} from '../packages/providers/dist/index.js';
import { normalizeJavaNode } from '../packages/providers/dist/java-node-normalizer.js';
import { compareSyntaxObservationOutput } from './syntax-observation-evidence.mjs';
const root = new URL('../fixtures/phase1/syntax-mixed-provisional-oracle/', import.meta.url);
const bytes = (p) => readFile(new URL(p, root)),
  json = async (p) => JSON.parse(await bytes(p));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lines = (b) =>
  b
    .toString('utf8')
    .split(/(?<=\n)/)
    .filter(Boolean)
    .map((s) => Buffer.from(s));
function reseal(rows) {
  const prefix = rows
    .slice(0, -1)
    .map((r) => JSON.stringify(r) + '\n')
    .join('');
  rows.at(-1).payload.checksum = sha(Buffer.from(prefix));
  return Buffer.from(prefix + JSON.stringify(rows.at(-1)) + '\n');
}
for (const mode of ['calibration', 'holdout']) {
  test(mode + ' full mixed wire,Source and independent Code/owner references', async () => {
    const request = await json(mode + '/request.json'),
      p = request.payload;
    validateSyntaxOwnerContext(request, await json(mode + '/context.json'));
    assert.equal(p.sourceFiles[0].languageHint, 'python');
    assert.equal(p.sourceFiles[0].id, 'file:two');
    assert.equal(p.sourceFiles[1].id, 'file:one');
    for (const file of p.sourceFiles) {
      const source = await bytes(mode + '/' + file.path);
      assert.deepEqual(
        source,
        await readFile(
          new URL(
            '../fixtures/phase1/syntax-observation-corpus/' +
              mode +
              '/mixed-provisional/' +
              file.path,
            import.meta.url,
          ),
        ),
      );
      assert.equal(file.contentFingerprint, 'sha256:' + sha(source));
    }
    const raw = await bytes(mode + '/events.jsonl'),
      out = validateSyntaxObservationStream(request, lines(raw));
    assert.equal(out.events.length, 14);
    assert.equal(out.outcome, 'PARTIAL');
    assert.deepEqual(out.counts, { nodes: 2, edges: 1, syntax: 7, coverage: 2, diagnostics: 0 });
    assert.equal(out.events[1].payload.sourceFileId, 'file:one');
    assert.equal(out.events[3].type, 'COVERAGE');
    assert.equal(out.events[4].type, 'NODE');
    compareSyntaxObservationOutput(request, raw, raw);
    const python = normalizePythonObservation({
      basis: await json(mode + '/basis.json'),
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: p.sourceFiles.filter((f) => f.languageHint === 'python'),
      nodes: out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      edges: out.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
    });
    assert.deepEqual(python, await json(mode + '/python-normalized.json'));
    const providers = await json(mode + '/java-provider-nodes.json'),
      canonical = await json(mode + '/java-canonical-nodes.json');
    const files = new Map(p.sourceFiles.map((f) => [f.id, f]));
    assert.deepEqual(
      providers.map((n) => normalizeJavaNode(n, files)),
      canonical,
    );
    for (const owner of p.owners) {
      const i = providers.findIndex(
        (n) => n.providerFactId === owner.providerNodeRef.providerFactId,
      );
      assert.ok(i >= 0);
      assert.equal(owner.canonicalRef.entity.id, canonical[i].id);
      assert.equal(owner.sourceFileId, 'file:one');
    }
  });
  test(
    mode + ' Source inventory order does not change semantic owner identity or stream',
    async () => {
      const request = await json(mode + '/request.json');
      const context = await json(mode + '/context.json');
      request.payload.sourceFiles.reverse();
      validateSyntaxOwnerContext(request, context);
      const raw = await bytes(mode + '/events.jsonl');
      compareSyntaxObservationOutput(request, raw, raw);
    },
  );
  test(mode + ' rebound Java owner assigned to Python file refuses', async () => {
    const request = await json(mode + '/request.json');
    const context = await json(mode + '/context.json');
    validateSyntaxOwnerContext(request, context);
    request.payload.owners[0].sourceFileId = 'file:two';
    const captured = structuredClone(context);
    captured.owners = request.payload.owners;
    request.payload.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest(captured);
    assert.throws(
      () => validateSyntaxOwnerContext(request, captured),
      (e) => e.code === 'INVALID_REQUEST',
    );
  });
  test(mode + ' resealed Python Syntax with Java owner is rejected across files', async () => {
    const request = await json(mode + '/request.json'),
      raw = await bytes(mode + '/events.jsonl');
    const rows = raw.toString('utf8').trimEnd().split('\n').map(JSON.parse);
    const target = rows.find(
      (e) => e.type === 'SYNTAX_OBSERVATION' && e.payload.sourceFileId === 'file:two',
    );
    target.payload.owner = request.payload.owners[0].providerNodeRef;
    assert.throws(
      () => compareSyntaxObservationOutput(request, reseal(rows), raw),
      (e) => e.code === 'INVALID_SYNTAX_OUTPUT',
    );
  });
}
test('mixed calibration/holdout stay independent and second-file failure is not applicable', async () => {
  assert.notEqual(
    sha(await bytes('calibration/events.jsonl')),
    sha(await bytes('holdout/events.jsonl')),
  );
  const request = await json('calibration/request.json'),
    raw = await bytes('calibration/events-changed-python.jsonl');
  const rows = lines(raw).map((b) => JSON.parse(b));
  assert.equal(rows.at(-1).type, 'SYNTAX_FAILED');
  assert.equal(rows.at(-1).payload.code, 'SOURCE_CHANGED');
  assert.ok(rows.some((e) => e.type === 'COVERAGE' && e.payload.sourceFileId === 'file:one'));
  assert.ok(!rows.some((e) => e.type === 'SYNTAX_COMPLETED'));
  assert.throws(
    () => validateSyntaxObservationStream(request, lines(raw)),
    (e) => e.code === 'SOURCE_CHANGED',
  );
});
