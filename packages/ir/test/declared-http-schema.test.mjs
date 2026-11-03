import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as ir from '../dist/index.js';
const seed = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/contract-matching/declared-schema-inputs.json',
      import.meta.url,
    ),
  ),
).input;
const limits = { maxInputBytes: 100000, maxItems: 10000, maxDepth: 64 };
function context(x) {
  const all = [
    ...x.contractRefs.flatMap((r) => r.contract.supportRefs),
    ...x.catalog.services.flatMap((r) => r.supportRefs),
    ...x.catalog.entries.flatMap((r) => r.supportRefs),
    ...x.catalog.contractBindings.flatMap((r) => r.supportRefs),
    ...x.schemaDocuments.map((d) => d.sourceSupport),
  ];
  const supports = [...new Map(all.map((s) => [ir.supportKey(s), s])).values()];
  const refs = supports.map((s) =>
    'repositoryId' in s.basis
      ? { scope: 'REPOSITORY', repositoryId: s.basis.repositoryId, entity: s.entity }
      : { scope: 'WORKSPACE', workspaceId: s.basis.workspaceId, entity: s.entity },
  );
  refs.push(
    ...x.contractRefs.map((r) => r.ref),
    ...x.catalog.services.flatMap((s) => (s.repositoryRef ? [s.repositoryRef] : [])),
  );
  return {
    availableEntities: [...new Map(refs.map((r) => [ir.scopedRefKey(r), r])).values()],
    availableSupports: supports,
  };
}
function seal(x) {
  x.workspaceBasis.workspaceActivationDigest = ir.workspaceRuntimeInputDigestV2(x);
  x.catalog.workspaceBasis = structuredClone(x.workspaceBasis);
  return x;
}
test('declared HTTP IR authenticates exact Source bytes and all three explicit contract attachments', () => {
  assert.equal(typeof ir.parseFrozenContractSetV2, 'function');
  const x = seal(structuredClone(seed));
  const out = ir.parseFrozenContractSetV2(x, context(x), limits);
  assert.equal(out.declarations.length, 3);
  assert(out.declarations.every((d) => d.response.kind === 'JSON_STRING'));
  assert.equal(
    out.consumed.inputBytes,
    x.schemaDocuments.reduce((n, d) => n + Buffer.byteLength(d.contentUtf8), 0),
  );
  assert(out.consumed.items > 0);
  assert.throws(() => ir.parseFrozenContractSet(x, context(x)));
  const reordered = structuredClone(x);
  reordered.schemaDocuments.reverse();
  reordered.repositoryBindings.reverse();
  assert.equal(
    ir.workspaceRuntimeInputDigestV2(reordered),
    x.workspaceBasis.workspaceActivationDigest,
  );
});
test('declared HTTP IR rejects substituted bytes, metadata, duplicate/foreign or unknown attachments and ref overrides', () => {
  for (const change of [
    (x) => (x.schemaDocuments[0].contentUtf8 += ' '),
    (x) => (x.schemaDocuments[0].sourceSupport.valueDigest = '9'.repeat(64)),
    (x) => x.schemaDocuments.push(structuredClone(x.schemaDocuments[0])),
    (x) => (x.schemaDocuments[0].sourceFile.repositoryId = 'repo:foreign'),
    (x) =>
      (x.contractRefs[0].contract.signature.querySchemaRef = {
        scope: 'REPOSITORY',
        repositoryId: 'repo:a',
        entity: { kind: 'SCHEMA', id: 'schema:fake', revisionId: 'rev:a' },
      }),
  ]) {
    const x = seal(structuredClone(seed));
    change(x);
    assert.throws(() => ir.parseFrozenContractSetV2(seal(x), context(x), limits));
  }
  for (const change of [
    (v) => (v.version = 2),
    (v) => v.bindings.push(structuredClone(v.bindings[0])),
    (v) => (v.bindings[0].contractFactKey = 'missing'),
    (v) => (v.bindings[0].response.mediaType = 'text/plain'),
  ]) {
    const x = structuredClone(seed),
      d = x.schemaDocuments[0],
      v = JSON.parse(d.contentUtf8);
    change(v);
    d.contentUtf8 = JSON.stringify(v) + '\n';
    d.sourceFile.contentFingerprint =
      'sha256:' + createHash('sha256').update(d.contentUtf8).digest('hex');
    d.sourceSupport.valueDigest = createHash('sha256')
      .update('codeatlas-phase1-support-value-v1\0' + ir.canonicalRuntimeJson(d.sourceFile))
      .digest('hex');
    assert.throws(() => ir.parseFrozenContractSetV2(seal(x), context(x), limits));
  }
});
test('declared HTTP IR shares byte/item caps across documents and retains original newline bytes', () => {
  const x = seal(structuredClone(seed)),
    bytes = x.schemaDocuments.reduce((n, d) => n + Buffer.byteLength(d.contentUtf8), 0);
  assert(x.schemaDocuments[0].contentUtf8.endsWith('\n'));
  assert.throws(() =>
    ir.parseFrozenContractSetV2(x, context(x), { ...limits, maxInputBytes: bytes - 1 }),
  );
  assert.throws(() => ir.parseFrozenContractSetV2(x, context(x), { ...limits, maxItems: 1 }));
  assert.equal(
    ir.parseFrozenContractSetV2(x, context(x), { ...limits, maxInputBytes: bytes }).declarations
      .length,
    3,
  );
});

test('declared HTTP total Source byte admission precedes JSON parsing of any document', () => {
  const x = structuredClone(seed),
    d = x.schemaDocuments[0];
  d.contentUtf8 = '{not-json';
  d.sourceFile.contentFingerprint =
    'sha256:' + createHash('sha256').update(d.contentUtf8).digest('hex');
  d.sourceSupport.valueDigest = createHash('sha256')
    .update('codeatlas-phase1-support-value-v1\0' + ir.canonicalRuntimeJson(d.sourceFile))
    .digest('hex');
  const bytes = x.schemaDocuments.reduce((n, d) => n + Buffer.byteLength(d.contentUtf8), 0);
  assert.throws(
    () => ir.parseFrozenContractSetV2(seal(x), context(x), { ...limits, maxInputBytes: bytes - 1 }),
    { name: 'IrValidationError' },
  );
});
