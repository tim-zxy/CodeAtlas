import assert from 'node:assert/strict';
import test from 'node:test';

import { PluginRegistrationSchema, selectPluginCandidates } from '../dist/index.js';

const descriptor = {
  pluginId: 'plugin-a',
  pluginVersion: '1.0.0',
  languages: ['java'],
  frameworks: ['spring'],
  requiredProviderCapabilities: ['symbol', 'call'],
  producedSemanticCapabilities: ['entry-point'],
  configurationSchema: { schema: 'plugin-config', version: 1 },
  trustClass: 'BUILT_IN',
};
const request = {
  languageId: 'java',
  frameworkId: 'spring',
  providerCapabilities: ['symbol', 'call'],
};

test('plugin registration rejects unsafe priority and unknown fields', () => {
  assert.equal(PluginRegistrationSchema.safeParse({ descriptor, priority: 0 }).success, true);
  for (const invalid of [
    { descriptor, priority: Number.MAX_SAFE_INTEGER + 1 },
    { descriptor, priority: 0.5 },
    { descriptor, priority: 0, extra: true },
  ]) {
    assert.equal(PluginRegistrationSchema.safeParse(invalid).success, false);
  }
});

test('plugin route filters language, framework, and every required provider capability', () => {
  const entries = [{ descriptor, priority: 0 }];
  assert.equal(selectPluginCandidates(entries, request).length, 1);
  assert.deepEqual(selectPluginCandidates(entries, { ...request, languageId: 'python' }), []);
  assert.deepEqual(selectPluginCandidates(entries, { ...request, frameworkId: 'kafka' }), []);
  assert.deepEqual(
    selectPluginCandidates(entries, { ...request, providerCapabilities: ['symbol'] }),
    [],
  );
});

test('plugin route sorts priority then exact ID, independent of input order', () => {
  const entries = [
    { descriptor: { ...descriptor, pluginId: 'plugin-c' }, priority: -1 },
    { descriptor: { ...descriptor, pluginId: 'plugin-b' }, priority: 5 },
    { descriptor, priority: 5 },
  ];
  const ids = (items) =>
    selectPluginCandidates(items, request).map((entry) => entry.descriptor.pluginId);
  assert.deepEqual(ids(entries), ['plugin-a', 'plugin-b', 'plugin-c']);
  assert.deepEqual(ids([...entries].reverse()), ids(entries));
  assert.deepEqual(
    entries.map((entry) => entry.descriptor.pluginId),
    ['plugin-c', 'plugin-b', 'plugin-a'],
  );
});

test('plugin route rejects duplicate IDs before filtering', () => {
  const entry = { descriptor, priority: 0 };
  assert.throws(
    () =>
      selectPluginCandidates([entry, { ...entry, priority: 1 }], {
        ...request,
        languageId: 'python',
      }),
    { code: 'IR_VALIDATION_FAILED' },
  );
});
