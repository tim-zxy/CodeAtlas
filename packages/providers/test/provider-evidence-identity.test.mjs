import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EvidenceIdSchema } from '../../ir/dist/index.js';
import { providerEvidenceId } from '../dist/provider-evidence-identity.js';

const tuple = ['repo-fixture', 'rev-fixture', 'snapshot-primary', 'EDGE', 'primary', 'call-1'];

test('provider evidence identity has a pinned, versioned observation digest', () => {
  const id = providerEvidenceId(...tuple);
  assert.equal(
    id,
    'provider-evidence-v1:3914f3974aa0bb5b705ccca4854c37bb6905b0c72b84c3a356c70f0a3d4bc6a5',
  );
  assert.equal(EvidenceIdSchema.parse(id), id);
  for (const [index, replacement] of [
    [2, 'snapshot-other'],
    [3, 'NODE'],
    [4, 'secondary'],
  ]) {
    const changed = [...tuple];
    changed[index] = replacement;
    assert.notEqual(providerEvidenceId(...changed), id);
  }
});

test('ill-formed Provider identity Unicode is rejected without replacement aliasing', () => {
  for (const invalid of ['primary-\ud800', 'primary-\udc00']) {
    const changed = [...tuple];
    changed[4] = invalid;
    assert.throws(() => providerEvidenceId(...changed), TypeError);
  }
  const changed = [...tuple];
  changed[4] = 'primary-😀';
  assert.ok(providerEvidenceId(...changed).startsWith('provider-evidence-v1:'));
});
