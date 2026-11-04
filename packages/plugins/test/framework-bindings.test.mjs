import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePluginV4Context } from '../dist/plugin-context-v4.js';
import { input, expected, contextFor, syntaxIds } from './helpers/framework-binding-fixture.mjs';
for (const item of input.binding)
  test('binding: ' + item.name, async () => {
    const c = validatePluginV4Context(contextFor(item));
    const api = await import('../dist/framework-bindings.js');
    const site = c.syntaxEvidence.find((s) => s.id === 'syntax:site');
    const index = api.createFrameworkBindingIndex(c);
    const out = item.query.receiver
      ? api.bindDeclaredReceiver(index, site)
      : api.bindImportedName(index, site, item.query.name);
    const want = expected.binding[item.name];
    assert.equal(out.state, want.state);
    if (want.state === 'BOUND') {
      assert.equal(out.qualifiedName, want.qualifiedName);
      assert.deepEqual(syntaxIds(out.support), want.support);
    } else assert.match(out.code, /^FRAMEWORK_/);
    assert.deepEqual(c, validatePluginV4Context(contextFor(item)));
  });
