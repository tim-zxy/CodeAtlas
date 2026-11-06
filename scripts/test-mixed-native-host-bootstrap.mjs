import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';
let api = {};
try {
  api = await import('./mixed-native-host-bootstrap.mjs');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
async function setup(t, mode = 'success') {
  const f = await dynamicOwnerFixture(t, 'repo:owned');
  let entry =
    "export async function runMixedNativeHostOperation(input, channels) { const value = await import('./answer.mjs'); if (!channels.incoming || input.ownerInput.repositoryId !== 'repo:owned') throw Error('scope'); return value.default; }\n";
  if (mode === 'entry-throws')
    entry =
      "export async function runMixedNativeHostOperation() { await import('./answer.mjs'); throw Error('synthetic-entry-failed'); }\n";
  if (mode === 'missing-export') entry = "import './answer.mjs'; export default false;\n";
  const descriptor = {
    kind: 'MIXED_NATIVE_HOST_BOOTSTRAP_DESCRIPTOR',
    schemaVersion: 1,
    artifactLimits: f.request.artifactLimits,
    deadlineEpochMs: f.request.deadlineEpochMs,
    hostEntryArtifactId: 'entry',
    hostModuleArtifactIds: ['entry', 'answer'],
    workspaceId: f.request.workspaceId,
    repositoryId: f.request.repositoryId,
    slots: f.request.slots,
    controlLimits: f.request.controlLimits,
    edges: [{ from: 'entry', specifier: './answer.mjs', to: 'answer' }],
  };
  const manifest = JSON.parse(await fs.readFile(path.join(f.root, 'context.json'), 'utf8'));
  for (const [id, file, bytes] of [
    ['entry', 'entry.mjs', Buffer.from(entry)],
    ['answer', 'answer.mjs', Buffer.from('export default 42;\n')],
    ['bootstrap', 'bootstrap.json', Buffer.from(JSON.stringify(descriptor, null, 2) + '\n')],
  ]) {
    await fs.writeFile(path.join(f.root, file), bytes);
    const artifact = { id, path: file, sizeBytes: bytes.length, sha256: sha(bytes) },
      i = manifest.artifacts.findIndex((a) => a.id === id);
    if (i < 0) manifest.artifacts.push(artifact);
    else manifest.artifacts[i] = artifact;
  }
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(f.root, 'context.json'), bytes);
  const envelope = {
    CODEATLAS_HOST_MAX_MANIFEST_BYTES: String(f.request.artifactLimits.maxManifestBytes),
    CODEATLAS_HOST_MAX_ARTIFACT_BYTES: String(f.request.artifactLimits.maxArtifactBytes),
    CODEATLAS_HOST_MAX_TOTAL_BYTES: String(f.request.artifactLimits.maxTotalBytes),
    CODEATLAS_HOST_MAX_FILES: String(f.request.artifactLimits.maxFiles),
    CODEATLAS_HOST_DEADLINE_EPOCH_MS: String(f.request.deadlineEpochMs),
  };
  return { ...f, descriptor, argv: [path.join(f.root, 'context.json'), sha(bytes)], envelope };
}
test('fixed argv -> bounded descriptor -> verified module graph -> async synthetic entry -> unregister', async (t) => {
  const f = await setup(t);
  assert.equal(typeof api.runFixedMixedNativeHostBootstrap, 'function');
  const input = await api.prepareFixedMixedNativeHostBootstrap(f.argv, f.envelope);
  assert.equal(input.ownerInput.manifestSha256, f.argv[1]);
  assert.equal(input.ownerInput.root, f.root);
  assert.equal(input.ownerInput.deadlineEpochMs, f.request.deadlineEpochMs);
  assert.equal(Object.hasOwn(f.descriptor, 'manifestSha256'), false); // no digest cycle
  const incoming = new PassThrough(),
    outgoing = new PassThrough();
  try {
    const result = await api.runFixedMixedNativeHostBootstrap(f.argv, f.envelope, {
      incoming,
      outgoing,
    });
    assert.equal(result.value, 42);
    assert.equal(result.executionAuthorized, false);
    assert.equal(result.moduleClosureAuthenticated, false);
    assert.equal(result.liveTransportConnected, false);
    // Ordinary import works afterwards; temporary global hooks were removed.
    assert.equal(typeof (await import('node:util')).isDeepStrictEqual, 'function');
  } finally {
    incoming.destroy();
    outgoing.destroy();
  }
});
for (const mode of [
  'missing-cap',
  'extra-field',
  'expired',
  'preload',
  'preload-case',
  'wrong-sha',
  'extra-argv',
  'relative-path',
  'descriptor-drift',
])
  test('bootstrap refuses ' + mode, async (t) => {
    const f = await setup(t);
    if (mode === 'missing-cap') delete f.envelope.CODEATLAS_HOST_MAX_FILES;
    if (mode === 'extra-field') f.envelope.CODEATLAS_HOST_UNKNOWN = '1';
    if (mode === 'expired') f.envelope.CODEATLAS_HOST_DEADLINE_EPOCH_MS = '1';
    if (mode === 'preload') f.envelope.NODE_OPTIONS = '--import=anything';
    if (mode === 'preload-case') f.envelope.node_options = '--import=anything';
    if (mode === 'wrong-sha') f.argv[1] = '0'.repeat(64);
    if (mode === 'extra-argv') f.argv.push('extra');
    if (mode === 'relative-path') f.argv[0] = 'context.json';
    if (mode === 'descriptor-drift') await fs.appendFile(path.join(f.root, 'bootstrap.json'), ' ');
    await assert.rejects(api.prepareFixedMixedNativeHostBootstrap(f.argv, f.envelope));
  });

for (const mode of ['entry-throws', 'missing-export'])
  test('bootstrap unregisters hooks after ' + mode, async (t) => {
    const f = await setup(t, mode),
      incoming = new PassThrough(),
      outgoing = new PassThrough();
    try {
      await assert.rejects(
        api.runFixedMixedNativeHostBootstrap(f.argv, f.envelope, { incoming, outgoing }),
      );
      assert.equal(typeof (await import('node:util')).isDeepStrictEqual, 'function');
    } finally {
      incoming.destroy();
      outgoing.destroy();
    }
  });

test('bootstrap snapshots argv and channel identities before asynchronous reads', async (t) => {
  const f = await setup(t),
    original = f.argv[1],
    pending = api.prepareFixedMixedNativeHostBootstrap(f.argv, f.envelope);
  f.argv[1] = '0'.repeat(64);
  const prepared = await pending;
  assert.equal(prepared.ownerInput.manifestSha256, original);
  prepared.hooks.dispose();
  f.argv[1] = original;
  const incoming = new PassThrough(),
    outgoing = new PassThrough(),
    channels = { incoming, outgoing };
  try {
    const result = api.runFixedMixedNativeHostBootstrap(f.argv, f.envelope, channels);
    channels.incoming = null;
    channels.outgoing = null;
    assert.equal((await result).value, 42);
  } finally {
    incoming.destroy();
    outgoing.destroy();
  }
});
