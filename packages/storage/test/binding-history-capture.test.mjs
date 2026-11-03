import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const input = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-history/inputs.json',
      import.meta.url,
    ),
  ),
);
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const digest = (d, v) =>
  createHash('sha256')
    .update(d + '\0')
    .update(canonical(v))
    .digest('hex');
const limits = {
  maxRows: Number.MAX_SAFE_INTEGER,
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
};
test('H1 validates independent complete v2 origin and projection without changing SQL', async () => {
  const { HistoryReadBudget, validateSyntaxEnvelope, validateSyntaxPair } =
    await import('../dist/analysis/activation-history-format.js');
  validateSyntaxEnvelope(input.body.envelope, input.state, new HistoryReadBudget(limits));
  const body = input.body,
    { id, ...payload } = body.envelope.payload,
    od = digest('codeatlas-syntax-origin-v2', body),
    originId = 'syntax-origin:' + od,
    pd = digest('codeatlas-syntax-projection-v2', { originId, payload }),
    projectionId = 'syntax:' + pd;
  const origin = {
    id: originId,
    repository_id: input.state.basis.repositoryId,
    revision_id: input.state.basis.revisionId,
    origin_snapshot_id: body.originSnapshot.id,
    origin_digest: od,
    origin_json: canonical(body),
  };
  const projection = {
    id: projectionId,
    repository_id: origin.repository_id,
    origin_id: originId,
    projection_digest: pd,
    envelope_json: canonical({
      schema: body.envelope.schema,
      version: 2,
      payload: { ...payload, id: projectionId },
    }),
  };
  const metadata = {
    id: originId,
    unitId: body.unitId,
    originSnapshotId: body.originSnapshot.id,
    valueDigest: od,
    basis: input.state.basis,
  };
  const manifest = { state: input.state };
  validateSyntaxPair(
    origin,
    projection,
    metadata,
    body.unitId,
    manifest,
    [manifest],
    new HistoryReadBudget(limits),
  );
  const bad = structuredClone(projection),
    envelope = JSON.parse(bad.envelope_json);
  envelope.version = 1;
  bad.envelope_json = canonical(envelope);
  assert.throws(() =>
    validateSyntaxPair(
      origin,
      bad,
      metadata,
      body.unitId,
      manifest,
      [manifest],
      new HistoryReadBudget(limits),
    ),
  );
});
test('H1 v2 rejects unknown version and ungrounded scope', async () => {
  const { HistoryReadBudget, validateSyntaxEnvelope } =
    await import('../dist/analysis/activation-history-format.js');
  for (const change of [
    (x) => (x.version = 3),
    (x) => (x.payload.lexicalScope.entity.id = 'code:missing'),
  ]) {
    const x = structuredClone(input.body.envelope);
    change(x);
    assert.throws(() => validateSyntaxEnvelope(x, input.state, new HistoryReadBudget(limits)));
  }
});
