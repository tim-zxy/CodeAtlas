import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseRuntimeFactSet } from '@codeatlas/ir';
const input = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/plugin-context/binding-sufficiency/inputs.json',
        import.meta.url,
      ),
    ),
  ),
  expected = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/plugin-context/binding-sufficiency/expected.json',
        import.meta.url,
      ),
    ),
  );
const api = () => import('../dist/framework-draft.js');
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
function seal(x) {
  const p = x.value.payload,
    syntaxKeys = x.support
      .filter((s) => s.kind === 'SYNTAX')
      .map((s) => input.context.syntaxEvidence.find((e) => e.id === s.id).syntaxKey)
      .sort();
  p.draftKey =
    'framework-draft:' +
    createHash('sha256')
      .update(
        'codeatlas-framework-draft-v1\0' +
          canonical({
            basis: p.basis,
            sourceRange: p.sourceRange,
            proposal: p.proposal,
            syntaxKeys,
          }),
      )
      .digest('hex');
  return x;
}
test('six strict domain drafts preserve independent keys without Canonical scores', async () => {
  const a = await api();
  for (const [i, d] of input.drafts.entries()) {
    const out = a.validateFrameworkDraft(input.context, d);
    assert.deepEqual(out, d);
    assert.equal(out.value.payload.draftKey, expected.draftKeys[i]);
    assert(Object.isFrozen(out.value.payload.proposal));
  }
});
test('draft support order and provenance labels do not change the declared key', async () => {
  const a = await api(),
    x = structuredClone(input.drafts[0]);
  x.support.reverse();
  x.value.payload.ruleId = 'another-rule-v1';
  x.value.payload.framework = 'fastapi';
  assert.equal(
    a.validateFrameworkDraft(input.context, x).value.payload.draftKey,
    expected.draftKeys[0],
  );
});
test('draft rejects foreign/unreachable refs, unsupported schema, wrong key/anchor and score fields', async () => {
  const a = await api();
  for (const [label, mutate] of [
    ['key', (d) => (d.value.payload.draftKey = 'framework-draft:wrong')],
    ['id', (d) => (d.value.payload.id = 'canonical:fake')],
    ['score', (d) => (d.value.payload.confidence = { score: 1, method: 'invented', reasons: [] })],
    ['ref', (d) => (d.value.payload.proposal.implementationRef.entity.id = 'code:missing')],
    ['no anchor', (d) => (d.support = d.support.filter((s) => s.kind !== 'SYNTAX'))],
    ['source', (d) => (d.value.payload.sourceRange.startLine = 0)],
    [
      'schema',
      (d) =>
        (d.value.payload.proposal.signature.requestSchemaRef =
          d.value.payload.proposal.implementationRef),
    ],
  ]) {
    const x = structuredClone(input.drafts[0]);
    mutate(x);
    if (!['key', 'id', 'score', 'no anchor'].includes(label)) seal(x);
    assert.throws(() => a.validateFrameworkDraft(input.context, x), label);
  }
  const x = structuredClone(input.drafts[3]);
  x.value.payload.proposal.handlerRef = null;
  seal(x);
  assert.throws(() => a.validateFrameworkDraft(input.context, x));
});
test('Runtime parser refuses every draft envelope', () => {
  for (const d of input.drafts) assert.throws(() => parseRuntimeFactSet(d.value));
});
