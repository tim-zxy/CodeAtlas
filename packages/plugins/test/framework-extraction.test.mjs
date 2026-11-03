import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeFactSet } from '@codeatlas/ir';
import { validatePluginV4Context } from '../dist/plugin-context-v4.js';
import {
  input,
  expected,
  contextFor,
  syntaxIds,
  expectedKey,
  canonical,
} from './helpers/framework-binding-fixture.mjs';
const api = () => import('../dist/framework-extraction.js');
for (const item of input.extraction)
  test('extraction: ' + item.name, async () => {
    const c = contextFor(item);
    validatePluginV4Context(c);
    const out = (await api()).extractFrameworkDrafts(c, item.framework),
      want = expected.extraction[item.name];
    assert.deepEqual(
      out.drafts
        .map((d) => d.value.payload.proposal)
        .sort((a, b) => canonical(a).localeCompare(canonical(b))),
      [...want.proposals].sort((a, b) => canonical(a).localeCompare(canonical(b))),
    );
    assert.equal(out.diagnostics.length > 0, want.diagnostic);
    for (const d of out.drafts) {
      assert.deepEqual(syntaxIds(d.support), want.support);
      assert.equal(
        d.value.payload.draftKey,
        expectedKey(c, d.value.payload.proposal, want.support, d.value.payload.sourceRange),
      );
      assert(Object.isFrozen(d.value.payload.proposal));
      assert.throws(() => parseRuntimeFactSet(d));
    }
    assert(Object.isFrozen(out));
    assert(Object.isFrozen(out.diagnostics));
    assert.deepEqual(
      (await api()).extractFrameworkDrafts(
        { ...c, syntaxEvidence: [...c.syntaxEvidence].reverse() },
        item.framework,
      ),
      out,
    );
  });
test('extraction rejects foreign basis, old contexts and unknown selector', async () => {
  const a = await api(),
    item = input.extraction[0],
    c = contextFor(item);
  assert.throws(() => a.extractFrameworkDrafts({ ...c, contextVersion: 3 }, 'spring'));
  assert.throws(() =>
    a.extractFrameworkDrafts(
      { ...c, basis: { ...c.basis, revisionId: 'revision:foreign' } },
      'spring',
    ),
  );
  assert.throws(() => a.extractFrameworkDrafts(c, 'other'));
});
test('extraction recomputes after removing import or declaration', async () => {
  const a = await api(),
    item = input.extraction.find((x) => x.name === 'fastapi-direct'),
    c = contextFor(item);
  assert.equal(a.extractFrameworkDrafts(c, 'fastapi').drafts.length, 1);
  for (const id of ['syntax:import', 'syntax:app-assign']) {
    const changed = { ...c, syntaxEvidence: c.syntaxEvidence.filter((s) => s.id !== id) };
    assert.equal(a.extractFrameworkDrafts(changed, 'fastapi').drafts.length, 0);
  }
});

test('extraction respects the existing combined output cap', async () => {
  const { MAX_PLUGIN_CONTEXT_FACTS } = await import('../dist/plugin-spi.js'),
    a = await api();
  const item = structuredClone(input.extraction.find((x) => x.name === 'kafka-listener'));
  item.records.at(-1).payload.arguments[0].value = {
    kind: 'ARRAY',
    items: Array.from({ length: MAX_PLUGIN_CONTEXT_FACTS + 1 }, (_, n) => ({
      kind: 'STRING',
      value: 'topic-' + n,
    })),
  };
  const expanded = contextFor(item);
  validatePluginV4Context(expanded);
  const allowed = structuredClone(item);
  allowed.records.at(-1).payload.arguments[0].value.items.pop();
  assert.equal(
    a.extractFrameworkDrafts(contextFor(allowed), 'kafka').drafts.length,
    MAX_PLUGIN_CONTEXT_FACTS,
  );
  assert.throws(() => a.extractFrameworkDrafts(contextFor(item), 'kafka'), {
    code: 'IR_VALIDATION_FAILED',
  });
});
test('creation shares old key validation and rejects unsupported fields/support', async () => {
  const { createFrameworkDraftFromValidatedContext } = await import('../dist/framework-draft.js');
  const c = validatePluginV4Context(
      contextFor(input.extraction.find((x) => x.name === 'spring-route')),
    ),
    want = expected.extraction['spring-route'];
  const fields = {
    framework: 'spring',
    ruleId: 'spring-http:v1',
    sourceRange: c.syntaxEvidence.find((s) => s.id === 'syntax:site').sourceRange,
    proposal: want.proposals[0],
    support: want.support.map((id) => ({ kind: 'SYNTAX', id: 'syntax:' + id })),
  };
  const first = createFrameworkDraftFromValidatedContext(c, fields),
    second = createFrameworkDraftFromValidatedContext(c, {
      ...fields,
      support: [...fields.support].reverse(),
    });
  assert.equal(first.value.payload.draftKey, second.value.payload.draftKey);
  assert.equal(
    first.value.payload.draftKey,
    expectedKey(c, fields.proposal, want.support, fields.sourceRange),
  );
  assert.throws(() =>
    createFrameworkDraftFromValidatedContext(c, { ...fields, confidence: { score: 1 } }),
  );
  assert.throws(() =>
    createFrameworkDraftFromValidatedContext(c, {
      ...fields,
      support: [{ kind: 'SYNTAX', id: 'syntax:missing' }],
    }),
  );
});
test('input support removal and name changes invalidate declarations', async () => {
  const item = input.extraction.find((x) => x.name === 'fastapi-direct'),
    c = contextFor(item),
    a = await api();
  const unsupported = structuredClone(c);
  unsupported.supportInventory = [];
  assert.throws(() => a.extractFrameworkDrafts(unsupported, 'fastapi'));
  const renamed = structuredClone(c);
  renamed.syntaxEvidence.find((s) => s.id === 'syntax:app-assign').payload.targetName = 'other';
  assert.equal(a.extractFrameworkDrafts(renamed, 'fastapi').drafts.length, 0);
  const redirected = structuredClone(c);
  redirected.syntaxEvidence.find((s) => s.id === 'syntax:import').payload.qualifiedName =
    'custom.FastAPI';
  assert.equal(a.extractFrameworkDrafts(redirected, 'fastapi').drafts.length, 0);
});

test('Java route/listener annotations require a method and Spring rejects interface mappings', async () => {
  const a = await api();
  for (const [name, framework] of [
    ['spring-route', 'spring'],
    ['spring-cron', 'spring'],
    ['kafka-listener', 'kafka'],
  ]) {
    const c = contextFor(input.extraction.find((x) => x.name === name));
    c.nodes.find((n) => n.id === 'code:function').symbolKind = 'FUNCTION';
    validatePluginV4Context(c);
    assert.equal(a.extractFrameworkDrafts(c, framework).drafts.length, 0, name);
  }
  const c = contextFor(input.extraction.find((x) => x.name === 'spring-route'));
  c.nodes.find((n) => n.id === 'code:type').typeKind = 'INTERFACE';
  assert.equal(a.extractFrameworkDrafts(c, 'spring').drafts.length, 0);
});
