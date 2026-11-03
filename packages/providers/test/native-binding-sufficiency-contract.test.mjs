import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const input = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-sufficiency/inputs.json',
      import.meta.url,
    ),
  ),
);
const api = () => import('../dist/native-binding-sufficiency-contract.js');
test('v7 raw/request contract accepts declared structures and old v6 refuses', async () => {
  const a = await api();
  assert.equal(a.BindingAwareCodeSyntaxRequestSchema.parse(input.request).protocolVersion, 7);
  for (const r of input.raw) assert.deepEqual(a.BindingAwareSyntaxObservationSchema.parse(r), r);
  const old = await import('../dist/native-binding-contract.js');
  assert.equal(old.BindingCodeSyntaxRequestSchema.safeParse(input.request).success, false);
});
test('v7 raw rejects missing metadata and inconsistent new payloads', async () => {
  const a = await api();
  for (const mutate of [
    (x) => delete x.controlContext,
    (x) => (x.lexicalScope = { scope: 'REPOSITORY' }),
    (x) => {
      delete x.payload.limitations;
    },
  ]) {
    const r = structuredClone(input.raw[0]);
    mutate(r);
    assert.equal(a.BindingAwareSyntaxObservationSchema.safeParse(r).success, false);
  }
  const req = structuredClone(input.request);
  req.protocolVersion = 6;
  assert.equal(a.BindingAwareCodeSyntaxRequestSchema.safeParse(req).success, false);
});
test('v7 import forms and effect/name constraints share canonical rules', async () => {
  const a = await api(),
    r = structuredClone(input.raw.find((r) => r.syntaxKind === 'IMPORT_BINDING'));
  for (const payload of [
    {
      language: 'java',
      importKind: 'JAVA_WILDCARD',
      qualifiedName: 'a.b',
      importedName: null,
      boundName: null,
    },
    {
      language: 'python',
      importKind: 'PYTHON_MODULE',
      qualifiedName: 'a.b',
      importedName: null,
      boundName: 'a',
    },
    {
      language: 'python',
      importKind: 'PYTHON_SYMBOL',
      qualifiedName: 'a.b.C',
      importedName: 'C',
      boundName: 'Alias',
    },
    {
      language: 'python',
      importKind: 'PYTHON_RELATIVE',
      qualifiedName: '.b.C',
      importedName: 'C',
      boundName: 'C',
    },
  ])
    assert.equal(a.BindingAwareSyntaxObservationSchema.safeParse({ ...r, payload }).success, true);
  r.payload.language = 'python';
  assert.equal(a.BindingAwareSyntaxObservationSchema.safeParse(r).success, false);
  const eff = structuredClone(input.raw.find((r) => r.syntaxKind === 'BINDING_EFFECT'));
  eff.payload.name = null;
  assert.equal(a.BindingAwareSyntaxObservationSchema.safeParse(eff).success, false);
});

test('author review: raw scope subject and TYPE owner cannot disagree', async () => {
  const a = await api();
  for (const mutate of [
    (r) => (r.lexicalScope = { ...r.payload.scopeRef, providerFactId: 'other' }),
    (r) => (r.owner = { ...r.payload.scopeRef, providerFactId: 'other' }),
  ]) {
    const r = structuredClone(input.raw[0]);
    mutate(r);
    assert.equal(a.BindingAwareSyntaxObservationSchema.safeParse(r).success, false);
  }
  const t = structuredClone(input.raw.find((r) => r.syntaxKind === 'DECLARATION'));
  t.owner = null;
  assert.equal(a.BindingAwareSyntaxObservationSchema.safeParse(t).success, false);
});
