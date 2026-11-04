import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  validateSyntaxOwnerContext,
  validateSyntaxObservationStream,
} from '../packages/providers/dist/index.js';
import { normalizeJavaNode } from '../packages/providers/dist/java-node-normalizer.js';
import { compareSyntaxObservationOutput } from './syntax-observation-evidence.mjs';
const root = new URL('../fixtures/phase1/syntax-java-owner-oracle/', import.meta.url);
const bytes = (p) => readFile(new URL(p, root));
const json = async (p) => JSON.parse(await bytes(p));
const sha = (b) => createHash('sha256').update(b).digest('hex');
for (const mode of ['calibration', 'holdout']) {
  test(mode + ' exact Java symbol/Canonical mapping and full Syntax stream', async () => {
    const request = await json(mode + '/request.json'),
      context = await json(mode + '/context.json');
    assert.deepEqual(validateSyntaxOwnerContext(request, context), request);
    const source = await bytes(mode + '/Endpoint.java');
    assert.deepEqual(
      source,
      await readFile(
        new URL(
          '../fixtures/phase1/syntax-observation-corpus/' + mode + '/java-owner/Endpoint.java',
          import.meta.url,
        ),
      ),
    );
    assert.equal(request.payload.sourceFiles[0].contentFingerprint, 'sha256:' + sha(source));
    const raw = await bytes(mode + '/events.jsonl');
    const output = validateSyntaxObservationStream(
      request,
      raw
        .toString('utf8')
        .split(/(?<=\n)/)
        .filter(Boolean)
        .map((s) => Buffer.from(s)),
    );
    assert.deepEqual(output.counts, { nodes: 0, edges: 0, syntax: 2, coverage: 1, diagnostics: 0 });
    assert.equal(output.outcome, 'SUCCEEDED');
    assert.equal(output.events.length, 5);
    const providerNodes = await json(mode + '/provider-nodes.json'),
      expected = await json(mode + '/canonical-nodes.json');
    const files = new Map(request.payload.sourceFiles.map((f) => [f.id, f]));
    assert.deepEqual(
      providerNodes.map((n) => normalizeJavaNode(n, files)),
      expected,
    );
    assert.deepEqual(
      providerNodes.map((n) => normalizeJavaNode({ ...n, providerId: 'alternate' }, files)),
      expected,
    );
    for (const owner of request.payload.owners) {
      const i = providerNodes.findIndex(
        (n) => n.providerFactId === owner.providerNodeRef.providerFactId,
      );
      assert.ok(i >= 0);
      assert.equal(owner.canonicalRef.entity.id, expected[i].id);
    }
    const method = providerNodes.find((n) => n.providerKind === 'java.method');
    assert.ok(method);
    for (const event of output.events.filter((e) => e.type === 'SYNTAX_OBSERVATION'))
      assert.equal(event.payload.owner.providerFactId, method.providerFactId);
    compareSyntaxObservationOutput(request, raw, raw);
  });
  test(mode + ' missing method owner stays PARTIAL without class fallback', async () => {
    const request = await json(mode + '/request-no-method.json'),
      context = await json(mode + '/context-no-method.json');
    validateSyntaxOwnerContext(request, context);
    assert.equal(request.payload.owners.length, 1);
    const raw = await bytes(mode + '/events-no-method.jsonl');
    const out = validateSyntaxObservationStream(
      request,
      raw
        .toString('utf8')
        .split(/(?<=\n)/)
        .filter(Boolean)
        .map((s) => Buffer.from(s)),
    );
    assert.equal(out.outcome, 'PARTIAL');
    assert.deepEqual(out.counts, { nodes: 0, edges: 0, syntax: 2, coverage: 1, diagnostics: 0 });
    for (const e of out.events.filter((e) => e.type === 'SYNTAX_OBSERVATION'))
      assert.equal(e.payload.owner, null);
    compareSyntaxObservationOutput(request, raw, raw);
  });
  test(mode + ' foreign declaration ID is structurally bound before Native rejection', async () => {
    const request = await json(mode + '/request-foreign-owner.json');
    const context = await json(mode + '/context-foreign-owner.json');
    assert.doesNotThrow(() => validateSyntaxOwnerContext(request, context));
  });
}
test('Java calibration and holdout Source/owner IDs are distinct', async () => {
  assert.notEqual(
    sha(await bytes('calibration/Endpoint.java')),
    sha(await bytes('holdout/Endpoint.java')),
  );
  assert.notDeepEqual(
    (await json('calibration/request.json')).payload.owners,
    (await json('holdout/request.json')).payload.owners,
  );
});
