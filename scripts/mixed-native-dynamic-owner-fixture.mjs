// Test-only independent artifact coordinator and memory peer; never a live observer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import nativeOwner from '../packages/providers/dist/native-client.js';
import { bindMixedNativeDynamicOwner } from './mixed-native-dynamic-owner.mjs';
import { createMixedNativeDynamicControlCodec } from './mixed-native-dynamic-control-codec.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export async function dynamicOwnerFixture(t, repositoryId) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'codeatlas-dynamic-owner-'));
  const incoming = new PassThrough(),
    outgoing = new PassThrough({ highWaterMark: 1 });
  let owner;
  const messages = [];
  t.after(async () => {
    owner?.dispose();
    incoming.destroy();
    outgoing.destroy();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('codeatlas-dynamic-owner-'));
    await fs.rm(root, { recursive: true, force: true });
  });
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
    'entry',
  ];
  const artifacts = [];
  for (const key of keys) {
    const bytes = Buffer.from(
        key === 'entry' ? 'export default false;\n' : 'fixed synthetic ' + key + '\n',
      ),
      file = key + (key === 'entry' ? '.mjs' : '.txt');
    await fs.writeFile(path.join(root, file), bytes);
    artifacts.push({ id: key, path: file, sizeBytes: bytes.length, sha256: sha(bytes) });
  }
  const manifest = {
    kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
    schemaVersion: 1,
    status: 'PROPOSED',
    artifacts,
    bindings: Object.fromEntries(keys.filter((k) => k !== 'entry').map((k) => [k, k])),
    liveContext: null,
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'context.json'), bytes);
  const command = {
    executablePath: process.execPath,
    arguments: [],
    environment: nativeOwner.buildOwnedNativeEnvironment(
      {},
      process.platform === 'win32' ? Object.keys(process.env) : [],
    ),
    cwd: process.cwd(),
  };
  const request = {
    root,
    manifestPath: 'context.json',
    manifestSha256: sha(bytes),
    artifactLimits: {
      maxManifestBytes: 8192,
      maxArtifactBytes: 4096,
      maxTotalBytes: 65536,
      maxFiles: 32,
    },
    hostEntryArtifactId: 'entry',
    hostModuleArtifactIds: ['entry'],
    workspaceId: 'workspace:owned',
    repositoryId,
    slots: [{ launchId: 'surface', role: 'SURFACE_V8', phase: 'ANALYSIS', command }],
    deadlineEpochMs: Date.now() + 60000,
    controlLimits: { maxFrameBytes: 1024, maxTotalBytes: 32768, maxFrames: 100 },
  };
  let peer, active;
  const control = { beforeReply: null };
  function send(message) {
    const pending = control.beforeReply?.(message);
    if (pending && typeof pending.then === 'function')
      pending.then(
        () => incoming.write(peer.encode(message)),
        (error) => incoming.destroy(error),
      );
    else incoming.write(peer.encode(message));
  }
  outgoing.on('data', (chunk) => {
    for (const m of peer.push(chunk)) {
      messages.push(m);
      if (m.type === 'REGISTER') {
        active = m;
        send({
          type: 'BOUND',
          launchId: m.launchId,
          role: m.role,
          phase: m.phase,
          contextDigest: m.contextDigest,
          commandSha256: m.commandSha256,
        });
      }
      if (m.type === 'INTENT') send({ ...m, type: 'READY' });
      if (m.type === 'SPAWNED')
        send({
          type: 'ACQUIRED',
          launchId: m.launchId,
          role: active.role,
          pid: m.pid,
          imageSha256: artifacts.find((a) => a.id === (active.role === 'GIT' ? 'git' : 'native'))
            .sha256,
          creationIdentity: 'memory-child',
          parentOwned: true,
        });
      if (m.type === 'CLOSED')
        send({
          type: 'RELEASED',
          launchId: m.launchId,
          pid: m.pid,
          imageSha256: artifacts.find((a) => a.id === (active.role === 'GIT' ? 'git' : 'native'))
            .sha256,
          creationIdentity: m.creationIdentity,
          osExited: true,
          handleReleased: true,
          unknownDescendants: false,
          cleanupComplete: true,
          queryStatus: 'RECORDED',
          peakWorkingSetBytes: 4096,
        });
      if (m.type === 'ABANDON')
        send({
          type: 'ABANDONED',
          launchId: m.launchId,
          unknownDescendants: false,
          cleanupComplete: true,
        });
    }
  });
  return {
    root,
    request,
    messages,
    control,
    incoming,
    outgoing,
    async bind() {
      owner = await bindMixedNativeDynamicOwner(request, incoming, outgoing);
      peer = createMixedNativeDynamicControlCodec(
        owner.bootstrap().contextSha256,
        request.controlLimits,
      );
      return owner;
    },
  };
}
