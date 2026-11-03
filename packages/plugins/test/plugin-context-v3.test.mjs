import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePluginV2Context, MAX_PLUGIN_CONTEXT_FACTS } from '../dist/index.js';
import { parseSyntaxEvidenceV2 } from '@codeatlas/ir';
const root = new URL('../../../fixtures/phase1/syntax-contract/binding-contract/', import.meta.url);
const input = JSON.parse(await readFile(new URL('inputs.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected.json', root), 'utf8'));
test('v3 context is preserved, frozen and not accepted as v2', async () => {
  const { validatePluginV3Context } = await import('../dist/plugin-context-v3.js');
  const value = structuredClone(input.pluginContext);
  const result = validatePluginV3Context(value);
  assert.deepEqual(result, value);
  assert.equal(Object.isFrozen(result.syntaxEvidence[0].payload.valueRange), true);
  assert.equal(Object.isFrozen(value), false);
  assert.throws(() => validatePluginV2Context(value));
});
for (const [id, mutate] of [
  ['wrong schema version', (c) => (c.syntaxSchemaVersion = 1)],
  ['foreign basis', (c) => (c.basis.revisionId = 'revision:foreign')],
  ['foreign fingerprint', (c) => (c.syntaxEvidence[0].sourceFingerprint = 'source:foreign')],
  ['duplicate syntax', (c) => c.syntaxEvidence.push(structuredClone(c.syntaxEvidence[0]))],
  ['scope missing from nodes', (c) => c.nodes.pop()],
  ['unknown field', (c) => (c.extra = true)],
])
  test('v3 refuses ' + id, async () => {
    const { validatePluginV3Context } = await import('../dist/plugin-context-v3.js');
    const c = structuredClone(input.pluginContext);
    mutate(c);
    assert.throws(
      () => validatePluginV3Context(c),
      (e) => e.code === 'IR_VALIDATION_FAILED',
    );
  });
test('v3 preserves combined fact cap', async () => {
  const { validatePluginV3Context } = await import('../dist/plugin-context-v3.js');
  const c = structuredClone(input.pluginContext);
  while (c.nodes.length < MAX_PLUGIN_CONTEXT_FACTS) {
    const id = c.nodes.length;
    c.nodes.push({ ...c.nodes[0], id: 'code:cap' + id, factKey: 'node-key:cap' + id });
  }
  assert.throws(
    () => validatePluginV3Context(c),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
});
for (const c of input.relations)
  test('direct relation ' + c.id, async () => {
    const { isDirectAssignmentCall } = await import('../dist/plugin-context-v3.js');
    const assignment = parseSyntaxEvidenceV2(
      { schema: 'codeatlas.syntax-evidence', version: 2, payload: c.assignment },
      input.context,
    ).payload;
    const invocation = parseSyntaxEvidenceV2(
      { schema: 'codeatlas.syntax-evidence', version: 2, payload: c.invocation },
      input.context,
    ).payload;
    assert.equal(isDirectAssignmentCall(assignment, invocation), expected.relations[c.id]);
  });

test('v3 authenticates null-range MODULE against its own source metadata', async () => {
  const { validatePluginV3Context } = await import('../dist/plugin-context-v3.js');
  const value = structuredClone(input.pluginContext);
  value.nodes[1].sourceRange = null;
  value.nodes[1].qualifiedName = value.sourceFiles[0].path;
  assert.deepEqual(validatePluginV3Context(value), value);
});

test('v3 MODULE owner requires exact own-file proof and keeps v2 strict', async () => {
  const { validatePluginV3Context } = await import('../dist/plugin-context-v3.js');
  const c = structuredClone(input.pluginContext);
  c.nodes[1].sourceRange = null;
  c.nodes[1].qualifiedName = c.sourceFiles[0].path;
  c.syntaxEvidence[0].owner = c.syntaxEvidence[0].lexicalScope;
  assert.deepEqual(validatePluginV3Context(c), c);
  const wrong = structuredClone(c);
  wrong.nodes[1].qualifiedName = 'wrong.py';
  assert.throws(() => validatePluginV3Context(wrong));
});
