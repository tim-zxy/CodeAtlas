import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import * as api from './mixed-native-bound-owner.mjs';
import { loadMixedNativeOwnerContext } from './mixed-native-owner-context.mjs';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
import { hashMixedNativeLaunch } from './mixed-native-launch-handshake.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const roles = ['OBSERVER', 'HOST', 'GIT', 'V2', 'V5'];
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
const invalid = (e) => e.code === 'INVALID_MIXED_NATIVE_BOUND_OWNER' && e.message === e.code;
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'codeatlas-bound-owner-'));
  const incoming = new PassThrough();
  const outgoing = new PassThrough({ highWaterMark: 1 });
  let owner;
  t.after(async () => {
    owner?.dispose();
    incoming.destroy();
    outgoing.destroy();
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('codeatlas-bound-owner-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const artifacts = [];
  for (const key of [...keys, 'environment']) {
    const bytes = Buffer.from('synthetic descriptor for ' + key + '\n');
    const file = key + '.txt';
    await fs.writeFile(path.join(root, file), bytes);
    artifacts.push({ id: key, path: file, sizeBytes: bytes.length, sha256: hash(bytes) });
  }
  const manifest = {
    kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
    schemaVersion: 1,
    status: 'PROPOSED',
    artifacts,
    bindings: Object.fromEntries(keys.map((k) => [k, k])),
    liveContext: null,
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'context.json'), bytes);
  const digest = (key) => artifacts.find((a) => a.id === key).sha256;
  const imageKey = { OBSERVER: 'observer', HOST: 'host', GIT: 'git', V2: 'native', V5: 'native' };
  const draft = {
    kind: 'MIXED_NATIVE_QUALIFICATION_DRAFT',
    schemaVersion: 1,
    scope: 'INSTRUMENTED_ONLY',
    productionAdmission: false,
    executionAuthorized: false,
    bindings: Object.fromEntries(
      ['owner', 'source', 'oracle', 'repository', 'workspace', 'environment'].map((k) => [
        k,
        digest(k),
      ]),
    ),
    roles: roles.map((role) => ({ role, imageSha256: digest(imageKey[role]) })),
    resource: {
      contractVersion: 1,
      metric: 'PROCESS_PEAK_WORKING_SET_BYTES',
      hostLogicalMetric: 'RETAINED_LOGICAL_BYTES',
      components: [...roles],
      formula: null,
      reservationBytes: null,
      hostAllowanceBytes: null,
    },
    runSpec: null,
  };
  const plans = ['GIT', 'V2', 'V5'].map((role) => ({
    executablePath: process.execPath,
    arguments: ['offline-' + role],
    environment: {},
    cwd: process.cwd(),
    stdinSha256: hash('synthetic stdin'),
  }));
  const request = {
    root,
    manifestPath: 'context.json',
    manifestSha256: hash(bytes),
    artifactLimits: {
      maxManifestBytes: 8192,
      maxArtifactBytes: 4096,
      maxTotalBytes: 65536,
      maxFiles: 16,
    },
    draft,
    environmentArtifactId: 'environment',
    launchBindings: ['GIT', 'V2', 'V5'].map((role, i) => ({
      launchId: 'launch-' + i,
      role,
      commandSha256: hashMixedNativeLaunch(plans[i]),
      imageSha256: digest(imageKey[role]),
    })),
    controlLimits: { maxFrameBytes: 1024, maxTotalBytes: 32768, maxFrames: 100 },
  };
  return {
    request,
    incoming,
    outgoing,
    plans,
    async bind() {
      assert.equal(typeof api.bindMixedNativeOwner, 'function');
      owner = await api.bindMixedNativeOwner(request, incoming, outgoing);
      return owner;
    },
  };
}
function noAuthority(s) {
  for (const k of [
    'executionAuthorized',
    'measurementEligible',
    'productionAdmission',
    'databaseStateVerified',
    'sourceHistoryAuthenticated',
    'toolImagesAuthenticated',
    'environmentAuthenticated',
  ])
    assert.equal(s[k], false, k);
  assert.ok(Object.isFrozen(s));
}
function unclaimed(f) {
  assert.equal(f.incoming.listenerCount('data'), 0);
  assert.equal(f.incoming.listenerCount('end'), 0);
  assert.equal(f.outgoing.listenerCount('drain'), 0);
}
test('real descriptor reads bind draft and same-context serial handshake without authority', async (t) => {
  const f = await fixture(t);
  const expected = await loadMixedNativeOwnerContext(
    f.request.root,
    f.request.manifestPath,
    f.request.manifestSha256,
    f.request.artifactLimits,
  );
  const owner = await f.bind();
  const initial = owner.status();
  assert.equal(initial.status, 'OFFLINE_BOUND');
  assert.equal(initial.contextSha256, expected.contextSha256);
  assert.match(initial.planDigest, /^[a-f0-9]{64}$/);
  noAuthority(initial);
  assert.ok(Object.isFrozen(owner));
  assert.deepEqual(Object.keys(owner).sort(), ['dispose', 'status', 'take']);
  const peer = createMixedNativeControlCodec(expected.contextSha256, f.request.controlLimits);
  const requests = [];
  f.outgoing.on('data', (bytes) => {
    for (const m of peer.push(bytes)) {
      requests.push(m);
      const i = Number(m.launchId.slice(-1));
      const b = f.request.launchBindings[i];
      let reply;
      if (m.type === 'INTENT')
        reply = {
          type: 'READY',
          launchId: m.launchId,
          role: b.role,
          commandSha256: b.commandSha256,
        };
      else if (m.type === 'SPAWNED')
        reply = {
          type: 'ACQUIRED',
          launchId: m.launchId,
          role: b.role,
          pid: m.pid,
          imageSha256: b.imageSha256,
          creationIdentity: 'instance-' + i,
          parentOwned: true,
        };
      else if (m.type === 'CLOSED')
        reply = {
          type: 'RELEASED',
          launchId: m.launchId,
          pid: m.pid,
          imageSha256: b.imageSha256,
          creationIdentity: m.creationIdentity,
          osExited: true,
          handleReleased: true,
          unknownDescendants: false,
          cleanupComplete: true,
          queryStatus: 'RECORDED',
          peakWorkingSetBytes: 1024,
        };
      else assert.fail('unexpected synthetic message');
      f.incoming.write(peer.encode(reply));
    }
  });
  const signal = new AbortController().signal;
  for (let i = 0; i < 3; i++) {
    const launch = owner.take(['GIT', 'V2', 'V5'][i]);
    await launch.beforeSpawn(f.plans[i], signal);
    await launch.beforeInput(
      { pid: 100 + i, executablePath: process.execPath, spawnStartedEpochMs: 1, spawnedEpochMs: 2 },
      signal,
    );
    await launch.afterClose({ exitCode: 0, signal: null }, signal);
    await launch.dispose(signal);
  }
  assert.deepEqual(
    requests.map((m) => m.type),
    Array(3).fill(['INTENT', 'SPAWNED', 'CLOSED']).flat(),
  );
  noAuthority(owner.status());
  assert.equal(initial.status, 'OFFLINE_BOUND');
  owner.dispose();
  assert.equal(owner.status().status, 'CLOSED');
  assert.equal(f.incoming.destroyed, false);
  assert.equal(f.outgoing.destroyed, false);
  assert.throws(() => owner.take('GIT'), invalid);
});
for (const key of ['owner', 'source', 'oracle', 'repository', 'workspace', 'environment']) {
  test('draft binding mismatch refuses before stream takeover: ' + key, async (t) => {
    const f = await fixture(t);
    f.request.draft.bindings[key] = 'f'.repeat(64);
    await assert.rejects(f.bind(), invalid);
    unclaimed(f);
  });
}
for (const role of roles) {
  test('role artifact mismatch refuses before stream takeover: ' + role, async (t) => {
    const f = await fixture(t);
    f.request.draft.roles.find((r) => r.role === role).imageSha256 = 'e'.repeat(64);
    await assert.rejects(f.bind(), invalid);
    unclaimed(f);
  });
}
for (const [name, mutate] of [
  [
    'missing explicit environment artifact',
    (r) => {
      delete r.environmentArtifactId;
    },
  ],
  [
    'unknown environment artifact',
    (r) => {
      r.environmentArtifactId = 'missing';
    },
  ],
  [
    'environment maps to wrong descriptor',
    (r) => {
      r.environmentArtifactId = 'owner';
    },
  ],
  [
    'launch image mismatch',
    (r) => {
      r.launchBindings[1].imageSha256 = 'a'.repeat(64);
    },
  ],
  [
    'launch unknown role',
    (r) => {
      r.launchBindings[0].role = 'HOST';
    },
  ],
  [
    'launch duplicate id',
    (r) => {
      r.launchBindings[1].launchId = r.launchBindings[0].launchId;
    },
  ],
  [
    'invalid control limits',
    (r) => {
      r.controlLimits.maxFrames = 0;
    },
  ],
  [
    'unknown request key',
    (r) => {
      r.executionAuthorized = true;
    },
  ],
]) {
  test(name + ' refuses without claiming streams', async (t) => {
    const f = await fixture(t);
    mutate(f.request);
    await assert.rejects(f.bind(), invalid);
    unclaimed(f);
  });
}
test('changed real descriptor fails rather than trusting caller digest', async (t) => {
  const f = await fixture(t);
  await fs.appendFile(path.join(f.request.root, 'source.txt'), 'changed');
  await assert.rejects(f.bind(), invalid);
  unclaimed(f);
});
test('wrong context poisons bound channel and prevents subsequent launch', async (t) => {
  const f = await fixture(t);
  const owner = await f.bind();
  const peer = createMixedNativeControlCodec('d'.repeat(64), f.request.controlLimits);
  f.outgoing.on('data', () => {});
  const signal = new AbortController().signal;
  const launch = owner.take('GIT');
  const pending = launch.beforeSpawn(f.plans[0], signal);
  const rejected = assert.rejects(pending, (e) => e.code === 'INVALID_MIXED_NATIVE_LAUNCH');
  await Promise.resolve();
  f.incoming.write(
    peer.encode({
      type: 'READY',
      launchId: 'launch-0',
      role: 'GIT',
      commandSha256: f.request.launchBindings[0].commandSha256,
    }),
  );
  await rejected;
  assert.equal(owner.status().status, 'FAILED');
  assert.throws(() => owner.take('V2'), invalid);
  noAuthority(owner.status());
});
test('request is snapshotted before filesystem awaits', async (t) => {
  const f = await fixture(t);
  const pending = f.bind();
  f.request.draft.bindings.owner = 'f'.repeat(64);
  f.request.launchBindings[0].role = 'V5';
  const owner = await pending;
  assert.equal(owner.status().status, 'OFFLINE_BOUND');
  assert.ok(owner.take('GIT'));
  owner.dispose();
  noAuthority(owner.status());
});
test('existing reader is refused without removing caller-owned stream listeners', async (t) => {
  const f = await fixture(t);
  const reader = () => {};
  f.incoming.on('data', reader);
  await assert.rejects(f.bind(), invalid);
  assert.deepEqual(f.incoming.listeners('data'), [reader]);
  assert.equal(f.incoming.listenerCount('end'), 0);
  assert.equal(f.outgoing.listenerCount('drain'), 0);
});
test('dispose rejects a pending handshake and never destroys supplied streams', async (t) => {
  const f = await fixture(t);
  const owner = await f.bind();
  f.outgoing.on('data', () => {});
  const launch = owner.take('GIT');
  const signal = new AbortController().signal;
  const pending = launch.beforeSpawn(f.plans[0], signal);
  const rejected = assert.rejects(pending, (e) => e.code === 'INVALID_MIXED_NATIVE_LAUNCH');
  await Promise.resolve();
  owner.dispose();
  owner.dispose();
  await rejected;
  assert.equal(owner.status().status, 'CLOSED');
  assert.equal(f.incoming.destroyed, false);
  assert.equal(f.outgoing.destroyed, false);
  assert.equal(f.incoming.listenerCount('data'), 0);
  assert.equal(f.outgoing.listenerCount('drain'), 0);
  assert.throws(() => owner.take('V2'), invalid);
  noAuthority(owner.status());
});
test('accessor-bearing request is refused without invoking getters or claiming streams', async (t) => {
  const f = await fixture(t);
  let called = false;
  Object.defineProperty(f.request, 'environmentArtifactId', {
    enumerable: true,
    get() {
      called = true;
      return 'environment';
    },
  });
  await assert.rejects(f.bind(), invalid);
  assert.equal(called, false);
  unclaimed(f);
});
