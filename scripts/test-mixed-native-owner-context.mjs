import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import * as api from './mixed-native-owner-context.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex'),
  caps = { maxManifestBytes: 4096, maxArtifactBytes: 4096, maxTotalBytes: 32768, maxFiles: 16 };
const keys = [
  'owner',
  'host',
  'observer',
  'git',
  'native',
  'oracle',
  'repository',
  'workspace',
  'source',
];
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'codeatlas-owner-context-'));
  t.after(async () => {
    const p = path.resolve(root);
    assert.equal(path.dirname(p), path.resolve(tmpdir()));
    assert.ok(path.basename(p).startsWith('codeatlas-owner-context-'));
    await fs.rm(p, { recursive: true, force: true });
  });
  const blobs = {
    'owner.mjs': Buffer.from('export default false;'),
    'oracle.json': Buffer.from('{}'),
  };
  for (const [p, b] of Object.entries(blobs)) await fs.writeFile(path.join(root, p), b);
  const manifest = {
    kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
    schemaVersion: 1,
    status: 'PROPOSED',
    artifacts: Object.entries(blobs).map(([p, b], i) => ({
      id: 'artifact-' + i,
      path: p,
      sizeBytes: b.length,
      sha256: hash(b),
    })),
    bindings: Object.fromEntries(
      keys.map((k) => [k, k === 'oracle' ? 'artifact-1' : 'artifact-0']),
    ),
    liveContext: null,
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
  };
  const f = { root, manifest, sha: null };
  f.save = async (raw) => {
    const bytes = Buffer.from(raw ?? JSON.stringify(manifest, null, 2) + String.fromCharCode(10));
    await fs.writeFile(path.join(root, 'context.json'), bytes);
    f.sha = hash(bytes);
  };
  await f.save();
  f.load = (l = caps) => {
    assert.equal(typeof api.loadMixedNativeOwnerContext, 'function');
    return api.loadMixedNativeOwnerContext(root, 'context.json', f.sha, l);
  };
  return f;
}
const invalid = (p) =>
  assert.rejects(p, (e) => e.code === 'INVALID_MIXED_NATIVE_OWNER_CONTEXT' && e.message === e.code);
test('same-read manifest and artifacts bind a detached unprivileged context', async (t) => {
  const f = await fixture(t),
    before = await fs.readdir(f.root),
    v = await f.load();
  assert.match(v.contextSha256, /^[a-f0-9]{64}$/);
  assert.equal(v.manifestSha256, f.sha);
  assert.equal(v.artifacts.length, 2);
  assert.equal(v.executionAuthorized, false);
  assert.equal(v.databaseStateVerified, false);
  assert.equal(v.sourceHistoryAuthenticated, false);
  assert.equal(v.toolImagesAuthenticated, false);
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.artifacts));
  f.manifest.bindings.owner = 'changed';
  assert.equal(v.bindings.owner, 'artifact-0');
  assert.deepEqual(await fs.readdir(f.root), before);
});
test('changed artifact bytes cannot inherit the reviewed digest', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'owner.mjs'), 'export default true; ');
  await invalid(f.load());
});
test('manifest changed after expected hash was frozen is rejected', async (t) => {
  const f = await fixture(t);
  await fs.appendFile(path.join(f.root, 'context.json'), ' ');
  await invalid(f.load());
});
for (const [name, change] of [
  ['traversal', (m) => (m.artifacts[0].path = '../owner.mjs')],
  ['alternate data stream', (m) => (m.artifacts[0].path = 'owner.mjs:secret')],
  ['unknown binding', (m) => (m.bindings.source = 'missing')],
  ['approval promotion', (m) => (m.executionAuthorized = true)],
  ['fake live context', (m) => (m.liveContext = { authenticated: true })],
  ['duplicate id', (m) => (m.artifacts[1].id = m.artifacts[0].id)],
])
  test('context refuses ' + name, async (t) => {
    const f = await fixture(t);
    change(f.manifest);
    await f.save();
    await invalid(f.load());
  });
test('hardlinked artifacts are refused', async (t) => {
  const f = await fixture(t);
  await fs.link(path.join(f.root, 'owner.mjs'), path.join(f.root, 'alias.mjs'));
  await invalid(f.load());
});
test('manifest and file budgets stop before oversized reads', async (t) => {
  const f = await fixture(t);
  await invalid(f.load({ ...caps, maxManifestBytes: 1 }));
  await invalid(f.load({ ...caps, maxArtifactBytes: 1 }));
  await invalid(f.load({ ...caps, maxFiles: 1 }));
  await invalid(f.load({ ...caps, maxTotalBytes: 2 }));
});
test('noncanonical JSON cannot hide duplicate fields or a BOM', async (t) => {
  const f = await fixture(t);
  await f.save(JSON.stringify(f.manifest));
  await invalid(f.load());
  await f.save(
    String.fromCharCode(65279) + JSON.stringify(f.manifest, null, 2) + String.fromCharCode(10),
  );
  await invalid(f.load());
});
