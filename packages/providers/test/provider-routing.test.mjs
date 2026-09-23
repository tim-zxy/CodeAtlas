import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProviderDescriptorSchema,
  ProviderRegistrationSchema,
  selectProviderCandidates,
} from '../dist/index.js';

const descriptor = {
  providerId: 'provider-a',
  providerVersion: '1.0.0',
  protocolVersions: [1],
  irSchemaVersions: [1],
  languages: ['java'],
  capabilities: ['symbol', 'call'],
};

test('provider descriptor accepts exact language-neutral metadata', () => {
  assert.deepEqual(ProviderDescriptorSchema.parse(descriptor), descriptor);
});

test('provider descriptor rejects duplicate and unknown metadata', () => {
  for (const invalid of [
    { ...descriptor, capabilities: ['call', 'call'] },
    { ...descriptor, languages: ['java', 'java'] },
    { ...descriptor, protocolVersions: [1, 1] },
    { ...descriptor, irSchemaVersions: [] },
    { ...descriptor, extra: true },
  ]) {
    assert.equal(ProviderDescriptorSchema.safeParse(invalid).success, false);
  }
});

test('provider registration rejects unsafe priority and unknown fields', () => {
  assert.equal(
    ProviderRegistrationSchema.safeParse({ descriptor, role: 'PRIMARY', priority: 1 }).success,
    true,
  );
  for (const invalid of [
    { descriptor, role: 'PRIMARY', priority: Number.MAX_SAFE_INTEGER + 1 },
    { descriptor, role: 'PRIMARY', priority: Number.NaN },
    { descriptor, role: 'PRIMARY', priority: 1, extra: true },
  ]) {
    assert.equal(ProviderRegistrationSchema.safeParse(invalid).success, false);
  }
});

test('provider route filters capabilities and orders role, priority, then stable ID', () => {
  const entries = [
    { descriptor, role: 'SECONDARY', priority: 100 },
    { descriptor: { ...descriptor, providerId: 'provider-c' }, role: 'PRIMARY', priority: 0 },
    { descriptor: { ...descriptor, providerId: 'provider-b' }, role: 'PRIMARY', priority: 0 },
    { descriptor: { ...descriptor, providerId: 'provider-d' }, role: 'SHADOW', priority: 200 },
  ];
  const request = { languageId: 'java', requiredCapabilities: ['call'] };
  const ids = (items) =>
    selectProviderCandidates(items, request).map((entry) => entry.descriptor.providerId);
  assert.deepEqual(ids(entries), ['provider-b', 'provider-c', 'provider-a', 'provider-d']);
  assert.deepEqual(ids([...entries].reverse()), ids(entries));
  assert.deepEqual(
    entries.map((entry) => entry.descriptor.providerId),
    ['provider-a', 'provider-c', 'provider-b', 'provider-d'],
  );
  assert.deepEqual(
    selectProviderCandidates(entries, { ...request, requiredCapabilities: ['override'] }),
    [],
  );
  assert.deepEqual(selectProviderCandidates(entries, { ...request, languageId: 'python' }), []);
});

test('provider route rejects duplicate IDs before filtering', () => {
  const entry = { descriptor, role: 'PRIMARY', priority: 0 };
  assert.throws(
    () =>
      selectProviderCandidates([entry, { ...entry, role: 'SHADOW' }], {
        languageId: 'python',
        requiredCapabilities: [],
      }),
    { code: 'IR_VALIDATION_FAILED' },
  );
});
