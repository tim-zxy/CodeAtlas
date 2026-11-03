import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  validateSyntaxObservationStream,
  normalizePythonObservation,
  validateSyntaxOwnerContext,
} from '../packages/providers/dist/index.js';
import { compareSyntaxObservationOutput } from './syntax-observation-evidence.mjs';
const root = new URL('../fixtures/phase1/syntax-initial-absence-oracle/', import.meta.url);
const bytes = (p) => readFile(new URL(p, root));
const json = async (p) => JSON.parse(await bytes(p));
const hash = (b) => createHash('sha256').update(b).digest('hex');
for (const mode of ['calibration', 'holdout']) {
  test(mode + ' independently frozen full wire oracle and exact source provenance', async () => {
    const request = await json(mode + '/request.json');
    const raw = await bytes(mode + '/events.jsonl');
    const source = await bytes(mode + '/app.py');
    const original = await readFile(
      new URL(
        '../fixtures/phase1/syntax-observation-corpus/' + mode + '/initial-absent/app.py',
        import.meta.url,
      ),
    );
    assert.deepEqual(source, original);
    assert.equal(request.payload.sourceFiles[0].contentFingerprint, 'sha256:' + hash(source));
    assert.equal(request.payload.expectedActivationBasis, null);
    const context = await json(mode + '/context.json');
    assert.deepEqual(validateSyntaxOwnerContext(request, context), request);
    const lines = raw
      .toString('utf8')
      .split(/(?<=\n)/)
      .filter(Boolean)
      .map((s) => Buffer.from(s));
    const actual = validateSyntaxObservationStream(request, lines);
    assert.equal(actual.outcome, 'PARTIAL');
    assert.deepEqual(actual.counts, { nodes: 2, edges: 1, syntax: 5, coverage: 1, diagnostics: 0 });
    assert.equal(actual.events.length, 11);
    assert.equal(
      compareSyntaxObservationOutput(request, raw, raw).kind,
      'CONTRACT_ORACLE_MATCH_ONLY',
    );
  });
  test(mode + ' complete Canonical Code oracle and provider-independent identity', async () => {
    const request = await json(mode + '/request.json');
    const events = (await bytes(mode + '/events.jsonl'))
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map(JSON.parse);
    const input = {
      basis: await json(mode + '/basis.json'),
      providerId: 'native',
      providerSnapshotId: request.payload.providerSnapshotId,
      sourceFiles: request.payload.sourceFiles,
      nodes: events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      edges: events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
    };
    const expected = await json(mode + '/normalized.json');
    assert.deepEqual(normalizePythonObservation(input), expected);
    const renamed = structuredClone(input);
    renamed.providerId = 'alternate';
    renamed.nodes.forEach((n) => {
      n.providerId = 'alternate';
    });
    renamed.edges.forEach((e) => {
      e.providerId = 'alternate';
      e.source.providerId = 'alternate';
    });
    const out = normalizePythonObservation(renamed);
    assert.deepEqual(
      out.nodePairs.map((p) => p.canonical),
      expected.nodePairs.map((p) => p.canonical),
    );
    assert.deepEqual(
      out.edgePairs.map((p) => p.canonical),
      expected.edgePairs.map((p) => p.canonical),
    );
  });
}
test('initial oracle pair has independent source and result identities', async () => {
  assert.notEqual(hash(await bytes('calibration/app.py')), hash(await bytes('holdout/app.py')));
  assert.notEqual(
    hash(await bytes('calibration/events.jsonl')),
    hash(await bytes('holdout/events.jsonl')),
  );
});

const presentRoot = new URL(
  '../fixtures/phase1/syntax-present-activation-oracle/',
  import.meta.url,
);
const presentBytes = (p) => readFile(new URL(p, presentRoot));
const presentJson = async (p) => JSON.parse(await presentBytes(p));
for (const mode of ['calibration', 'holdout']) {
  test(
    mode + ' present activation full wire/Code oracle reuses independent Source literals',
    async () => {
      const request = await presentJson(mode + '/request.json');
      const context = await presentJson(mode + '/context.json');
      assert.deepEqual(request.payload.expectedActivationBasis, {
        repositoryId: 'repo:one',
        revisionId: 'revision:worktree',
        contentFingerprint: 'content:previous',
        codeActivationDigest: 'a'.repeat(64),
      });
      assert.equal(request.payload.targetSource.contentFingerprint, 'content:first');
      assert.equal(request.payload.ownerBinding.kind, 'PROVISIONAL_CODE');
      assert.equal(request.payload.ownerBinding.stageDigest, 'c'.repeat(64));
      assert.deepEqual(validateSyntaxOwnerContext(request, context), request);
      const source = await presentBytes(mode + '/app.py');
      assert.deepEqual(
        source,
        await readFile(
          new URL(
            '../fixtures/phase1/syntax-observation-corpus/' + mode + '/python-static/app.py',
            import.meta.url,
          ),
        ),
      );
      assert.equal(request.payload.sourceFiles[0].contentFingerprint, 'sha256:' + hash(source));
      const raw = await presentBytes(mode + '/events.jsonl');
      const lines = raw
        .toString('utf8')
        .split(/(?<=\n)/)
        .filter(Boolean)
        .map((s) => Buffer.from(s));
      const output = validateSyntaxObservationStream(request, lines);
      assert.equal(output.outcome, 'PARTIAL');
      assert.deepEqual(output.counts, {
        nodes: 2,
        edges: 1,
        syntax: 5,
        coverage: 1,
        diagnostics: 0,
      });
      assert.equal(output.events.length, 11);
      compareSyntaxObservationOutput(request, raw, raw);
      const input = {
        basis: await presentJson(mode + '/basis.json'),
        providerId: 'native',
        providerSnapshotId: request.payload.providerSnapshotId,
        sourceFiles: request.payload.sourceFiles,
        nodes: output.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: output.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
      };
      const expected = await presentJson(mode + '/normalized.json');
      assert.deepEqual(normalizePythonObservation(input), expected);
      assert.deepEqual(expected, await json(mode + '/normalized.json'));
      const renamed = structuredClone(input);
      renamed.providerId = 'alternate';
      renamed.nodes.forEach((n) => {
        n.providerId = 'alternate';
      });
      renamed.edges.forEach((e) => {
        e.providerId = 'alternate';
        e.source.providerId = 'alternate';
      });
      const independent = normalizePythonObservation(renamed);
      assert.deepEqual(
        independent.nodePairs.map((p) => p.canonical),
        expected.nodePairs.map((p) => p.canonical),
      );
      assert.deepEqual(
        independent.edgePairs.map((p) => p.canonical),
        expected.edgePairs.map((p) => p.canonical),
      );
      assert.notEqual(
        request.payload.ownerBinding.ownerMapDigest,
        (await json(mode + '/request.json')).payload.ownerBinding.ownerMapDigest,
      );
    },
  );
}
for (const [name, change, code] of [
  [
    'lost active basis',
    (c) => {
      c.expectedActivationBasis = null;
    },
    'BASE_REVISION_MISMATCH',
  ],
  [
    'foreign active digest',
    (c) => {
      c.expectedActivationBasis.codeActivationDigest = 'b'.repeat(64);
    },
    'BASE_REVISION_MISMATCH',
  ],
  [
    'foreign provisional stage',
    (c) => {
      c.ownerBinding.stageDigest = 'e'.repeat(64);
    },
    'INVALID_REQUEST',
  ],
])
  test('present capture refuses ' + name, async () => {
    const request = await presentJson('calibration/request.json');
    const c = await presentJson('calibration/context.json');
    assert.doesNotThrow(() => validateSyntaxOwnerContext(request, c));
    change(c);
    assert.throws(
      () => validateSyntaxOwnerContext(request, c),
      (e) => e.code === code,
    );
  });
for (const [name, change] of [
  [
    'ACTIVE_CODE against changed Source',
    (r) => {
      r.payload.ownerBinding = {
        kind: 'ACTIVE_CODE',
        codeActivationDigest: 'a'.repeat(64),
        ownerMapDigest: r.payload.ownerBinding.ownerMapDigest,
      };
    },
  ],
  [
    'early final candidate',
    (r) => {
      r.payload.finalCandidateCodeBasis = {
        ...r.payload.targetSource,
        codeActivationDigest: 'd'.repeat(64),
      };
    },
  ],
])
  test('present request refuses ' + name, async () => {
    const request = await presentJson('calibration/request.json');
    const context = await presentJson('calibration/context.json');
    assert.doesNotThrow(() => validateSyntaxOwnerContext(request, context));
    change(request);
    assert.throws(
      () => validateSyntaxOwnerContext(request, context),
      (e) => e.code === 'INVALID_REQUEST',
    );
  });
test('present request cannot accept absent-basis stream or resealed wrong active echo', async () => {
  const request = await presentJson('calibration/request.json');
  const oracle = await presentBytes('calibration/events.jsonl');
  const absent = await bytes('calibration/events.jsonl');
  assert.throws(
    () => compareSyntaxObservationOutput(request, absent, oracle),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT',
  );
  const rows = oracle.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  rows[0].payload.expectedActivationBasis.codeActivationDigest = 'b'.repeat(64);
  const prefix = rows
    .slice(0, -1)
    .map((r) => JSON.stringify(r) + '\n')
    .join('');
  rows.at(-1).payload.checksum = hash(Buffer.from(prefix));
  const wrong = Buffer.from(prefix + JSON.stringify(rows.at(-1)) + '\n');
  assert.throws(
    () => compareSyntaxObservationOutput(request, wrong, oracle),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT',
  );
});
