import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const vector = JSON.parse(
  readFileSync(new URL('./fixtures/source-draft.json', import.meta.url), 'utf8'),
);
const bytes = () => Buffer.from(vector.source);
const bundle = () => structuredClone(vector.envelope);
function account() {
  return {
    invalid: false,
    reserved: 0,
    checkpoint() {
      if (this.invalid) throw Object.assign(new Error('released'), { code: 'STAGE_RELEASED' });
    },
    own() {
      this.checkpoint();
    },
    visitItem() {
      this.checkpoint();
    },
    reserveBuffer(n) {
      this.reserved += n;
    },
    invalidate() {
      this.invalid = true;
    },
  };
}
const api = () => import('../dist/document-draft.js');
const positions = () => import('../dist/source-positions.js');
test('literal raw UTF8 positions preserve BOM, CRLF, Chinese and emoji', async () => {
  const out = (await positions()).mapDocumentOffsets(bytes(), vector.offsets, account());
  assert.deepEqual(out, vector.positions);
  assert.ok(Object.isFrozen(out));
});
test('surrogate, CRLF-interior, out-of-range and invalid UTF8 positions refuse', async () => {
  const run = (await positions()).mapDocumentOffsets;
  for (const offset of [7, 9, 14, -1, 1.5]) assert.throws(() => run(bytes(), [offset], account()));
  assert.throws(() => run(Buffer.from([0xff]), [0], account()));
  assert.deepEqual(run(Buffer.alloc(0), [0], account()), [{ line: 0, column: 0 }]);
});
test('Draft composes strict existing IR with original digest, stable supplied IDs and no raw payload', async () => {
  const input = bundle(),
    before = structuredClone(input);
  const draft = (await api()).assembleDocumentDraft(bytes(), input, account());
  assert.deepEqual(draft, before);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(draft.payload.blocks[0]));
  assert.equal(draft.payload.revision.sourceFingerprint, vector.fingerprint);
  assert.equal(draft.payload.blocks[0].id, 'block:heading');
  assert.equal(JSON.stringify(draft).includes(vector.source), false);
  assert.equal(Object.hasOwn(draft, 'bytes'), false);
  assert.equal(Object.hasOwn(draft, 'sourceBytes'), false);
  assert.equal(Object.hasOwn(draft.payload, 'bytes'), false);
  assert.equal(draft.payload.blocks[1].payload.text, '\u6bb5\u843d');
});
test('Draft keeps PARTIAL and source fingerprint/range failures cannot produce a result', async () => {
  const run = (await api()).assembleDocumentDraft;
  const partial = bundle();
  partial.payload.revision.completeness = 'PARTIAL';
  assert.equal(run(bytes(), partial, account()).payload.revision.completeness, 'PARTIAL');
  assert.throws(() => run(Buffer.from('other'), bundle(), account()), {
    code: 'DOCUMENT_SOURCE_MISMATCH',
  });
  for (const change of [
    (b) => (b.payload.blocks[0].sourceRange.startColumn = 6),
    (b) => (b.payload.blocks[1].sourceRange.endColumn = 7),
    (b) => (b.payload.sections[0].sourceRange.endLine = 100),
  ]) {
    const b = bundle();
    change(b);
    assert.throws(() => run(bytes(), b, account()));
  }
});
test('control stops, accessors, mutable caller bytes and shared memory cannot bypass Draft validation', async () => {
  const run = (await api()).assembleDocumentDraft;
  const stopped = Object.assign(new Error('cancel'), { code: 'CANCELLED' });
  const a = account();
  a.reserveBuffer = () => {
    throw stopped;
  };
  assert.throws(
    () => run(bytes(), bundle(), a),
    (e) => e === stopped,
  );
  assert.equal(a.invalid, true);
  const b = bundle();
  let getters = 0;
  Object.defineProperty(b.payload.document, 'id', {
    get() {
      getters++;
      return 'doc:one';
    },
    enumerable: true,
  });
  assert.throws(() => run(bytes(), b, account()));
  assert.equal(getters, 0);
  assert.throws(() => run(new Uint8Array(new SharedArrayBuffer(25)), bundle(), account()));
  const source = bytes(),
    c = account();
  const check = c.checkpoint.bind(c);
  let copied = false;
  c.reserveBuffer = (n) => {
    c.reserved += n;
    copied = true;
  };
  c.checkpoint = () => {
    check();
    if (copied) source.fill(0);
  };
  // The account callback mutates the original only after the copy checkpoint.
  assert.equal(run(source, bundle(), c).payload.revision.sourceFingerprint, vector.fingerprint);
});

test('offset output preserves requested ordering and bare CR/LF line boundaries', async () => {
  const run = (await positions()).mapDocumentOffsets;
  assert.deepEqual(run(bytes(), [10, 0, 10], account()), [
    { line: 1, column: 0 },
    { line: 0, column: 0 },
    { line: 1, column: 0 },
  ]);
  assert.deepEqual(run(Buffer.from('a\rb\nc\r\n'), [0, 2, 4, 7], account()), [
    { line: 0, column: 0 },
    { line: 1, column: 0 },
    { line: 2, column: 0 },
    { line: 3, column: 0 },
  ]);
});
test('structural Draft refuses semantic Claims even when existing IR closure is valid', async () => {
  const { assembleDocumentDraft: run } = await api();
  const input = bundle();
  const support = {
    basis: {
      documentId: 'doc:one',
      documentRevisionId: 'doc-revision:one',
      contentFingerprint: vector.fingerprint,
    },
    entity: { kind: 'DOCUMENT_BLOCK', id: 'block:paragraph', revisionId: 'doc-revision:one' },
    valueDigest: 'a'.repeat(64),
  };
  input.payload.supportInventory.push(support);
  input.payload.claims.push({
    id: 'claim:one',
    subject: {
      scope: 'WORKSPACE',
      workspaceId: 'workspace:one',
      entity: { kind: 'DOCUMENT_BLOCK', id: 'block:paragraph', revisionId: 'doc-revision:one' },
    },
    predicate: 'declares-purpose',
    value: { kind: 'LITERAL', value: 'candidate only' },
    scope: { kind: 'WORKSPACE', workspaceId: 'workspace:one' },
    stateIntent: 'CURRENT',
    claimKind: 'DECLARED',
    evidenceRefs: [structuredClone(support)],
    confidence: { score: 1, method: 'SOURCE_LITERAL', reasons: ['EXPLICIT_SOURCE'] },
    authority: 'DECLARED',
  });
  assert.throws(() => run(bytes(), input, account()), { code: 'SEMANTIC_CLAIMS_REQUIRE_WORKFLOW' });
});

test('standalone geometry range failure invalidates the same owner account', async () => {
  const { documentSourceGeometry } = await positions();
  const a = account();
  const g = documentSourceGeometry(bytes(), a);
  assert.throws(() => g.assertRange({ startLine: 0, startColumn: 6, endLine: 0, endColumn: 8 }), {
    code: 'INVALID_DOCUMENT_RANGE',
  });
  assert.equal(a.invalid, true);
});
