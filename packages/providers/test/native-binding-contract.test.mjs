import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NativeSyntaxObservationSchema } from '../dist/native-syntax-ipc.js';
import { CodeSyntaxRequestSchema } from '../dist/native-code-syntax-request.js';
const root = new URL('../../../fixtures/phase1/syntax-contract/binding-contract/', import.meta.url);
const input = JSON.parse(await readFile(new URL('inputs.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected.json', root), 'utf8'));
test('raw/request positive common projections satisfy old structural schemas', () => {
  for (const c of input.raw.filter((c) => expected.raw[c.id])) {
    const { lexicalScope, ...value } = structuredClone(c.value);
    delete value.payload.assignmentForm;
    delete value.payload.valueRange;
    delete value.payload.declarationForm;
    delete value.payload.declaredName;
    assert.equal(NativeSyntaxObservationSchema.safeParse(value).success, true, c.id);
  }
  const request = structuredClone(input.requests[0].value);
  request.protocolVersion = 5;
  delete request.payload.syntaxContract;
  assert.equal(CodeSyntaxRequestSchema.safeParse(request).success, true);
});
for (const c of input.raw)
  test('raw binding ' + c.id, async () => {
    const { BindingSyntaxObservationSchema } = await import('../dist/native-binding-contract.js');
    assert.equal(BindingSyntaxObservationSchema.safeParse(c.value).success, expected.raw[c.id]);
  });
for (const c of input.requests)
  test('binding request ' + c.id, async () => {
    const { BindingCodeSyntaxRequestSchema } = await import('../dist/native-binding-contract.js');
    assert.equal(
      BindingCodeSyntaxRequestSchema.safeParse(c.value).success,
      expected.requests[c.id],
    );
  });
test('old schemas refuse new fields and protocol version', () => {
  assert.equal(NativeSyntaxObservationSchema.safeParse(input.raw[0].value).success, false);
  assert.equal(CodeSyntaxRequestSchema.safeParse(input.requests[0].value).success, false);
});
