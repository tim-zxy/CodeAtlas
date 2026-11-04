import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const input = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/plugin-context/binding-sufficiency/inputs.json',
      import.meta.url,
    ),
  ),
);
const api = () => import('../dist/plugin-context-v4.js');
test('v4 context retains complete declarations and freezes input-owned values', async () => {
  const a = await api(),
    x = structuredClone(input.context),
    out = a.validatePluginV4Context(x);
  assert.deepEqual(out, x);
  assert(Object.isFrozen(out.syntaxEvidence[0].payload));
  assert.equal(Object.isFrozen(x), false);
});
test('v4 refuses missing/duplicate/cyclic/foreign scopes and false completeness', async () => {
  const a = await api();
  for (const [label, mutate] of [
    [
      'missing',
      (c) =>
        (c.syntaxEvidence = c.syntaxEvidence.filter(
          (s) =>
            !(s.syntaxKind === 'BINDING_SCOPE' && s.payload.scopeRef.entity.id === 'code:function'),
        )),
    ],
    [
      'duplicate',
      (c) => {
        const s = structuredClone(c.syntaxEvidence[0]);
        s.id += 'copy';
        s.syntaxKey += 'copy';
        c.syntaxEvidence.push(s);
      },
    ],
    [
      'cycle',
      (c) => {
        const t = c.syntaxEvidence.find(
          (s) => s.syntaxKind === 'BINDING_SCOPE' && s.payload.scopeRef.entity.id === 'code:type',
        );
        t.payload.parentScopeRef = {
          scope: 'REPOSITORY',
          repositoryId: c.basis.repositoryId,
          entity: { kind: 'CODE_NODE', id: 'code:function', revisionId: c.basis.revisionId },
        };
      },
    ],
    ['foreign', (c) => (c.syntaxEvidence[0].payload.scopeRef.repositoryId = 'other')],
    [
      'outside',
      (c) =>
        (c.syntaxEvidence.find((s) => s.syntaxKind === 'BINDING_EFFECT').sourceRange.endLine = 19),
    ],
    [
      'false complete',
      (c) => {
        const e = c.syntaxEvidence.find((s) => s.syntaxKind === 'BINDING_EFFECT');
        e.payload.effect = 'UNSUPPORTED_BINDING';
        e.payload.name = null;
        e.payload.targetScopeRef = null;
      },
    ],
    ['null parent', (c) => (c.syntaxEvidence[1].payload.parentScopeRef = null)],
  ]) {
    const x = structuredClone(input.context);
    mutate(x);
    assert.throws(() => a.validatePluginV4Context(x), label);
  }
});
test('v4 admits honest partial diagnostics and keeps old v3 strict', async () => {
  const a = await api(),
    x = structuredClone(input.context),
    s = x.syntaxEvidence.find(
      (s) => s.syntaxKind === 'BINDING_SCOPE' && s.payload.scopeRef.entity.id === 'code:function',
    ),
    e = x.syntaxEvidence.find((s) => s.syntaxKind === 'BINDING_EFFECT');
  s.payload.status = 'PARTIAL';
  s.payload.limitations = ['UNSUPPORTED_BINDING'];
  e.payload.effect = 'UNSUPPORTED_BINDING';
  e.payload.name = null;
  e.payload.targetScopeRef = null;
  assert.deepEqual(a.validatePluginV4Context(x), x);
  const old = await import('../dist/plugin-context-v3.js');
  assert.throws(() => old.validatePluginV3Context(x));
});
