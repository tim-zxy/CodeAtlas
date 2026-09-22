import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const fixtureRoot = new URL('../../../fixtures/ipc/client-v1/', import.meta.url);

test('p0-native-client-v1 declares the P0-W3-004 acceptance surface', async () => {
  const manifest = JSON.parse(await readFile(new URL('cases.json', fixtureRoot), 'utf8'));
  assert.equal(manifest.id, 'p0-native-client-v1');
  assert.equal(manifest.task, 'P0-W3-004');
  assert.equal(manifest.governingSpec, 'docs/handoff/specs/NATIVE_IPC.md');
  assert.equal(new Set(manifest.cases).size, 30);
  assert.ok(manifest.cases.includes('malformed-json'));
  assert.ok(manifest.cases.includes('out-of-order'));
  assert.ok(manifest.cases.includes('total-oversize'));
  assert.ok(manifest.cases.includes('hang'));
  assert.ok(manifest.cases.includes('abort-close-race'));
});
