import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setImmediate as turn } from 'node:timers/promises';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
import { createMixedNativeControlExchange } from './mixed-native-control-exchange.mjs';
import {
  createMixedNativeLaunchSession,
  hashMixedNativeLaunch,
} from './mixed-native-launch-handshake.mjs';

// Pure in-memory composition. Synthetic identities do not authenticate an OS process.
const context = 'c'.repeat(64);
const limits = { maxFrameBytes: 1024, maxTotalBytes: 65536, maxFrames: 100 };
const sha = (n) => n.toString(16).padStart(64, '0');
const invalid = (e) => e.code === 'INVALID_MIXED_NATIVE_LAUNCH' && e.message === e.code;
function fixture(t, { roles = ['GIT', 'V2', 'V5'], fragmented = false, stalled = false } = {}) {
  const incoming = new PassThrough();
  const outgoing = new PassThrough({ highWaterMark: 1 });
  const peer = createMixedNativeControlCodec(context, limits);
  const channel = createMixedNativeControlExchange(incoming, outgoing, context, limits);
  const plans = roles.map((role) => ({
    executablePath: process.execPath,
    arguments: ['synthetic-' + role],
    environment: { FIXED: 'synthetic' },
    cwd: process.cwd(),
    stdinSha256: sha(1),
  }));
  const bindings = roles.map((role, i) => ({
    launchId: 'composition-' + i,
    role,
    commandSha256: hashMixedNativeLaunch(plans[i]),
    imageSha256: sha(i + 2),
  }));
  const session = createMixedNativeLaunchSession(bindings, channel.exchange);
  const signal = new AbortController().signal;
  const requests = [];
  const bindingFor = (message) => bindings.find((b) => b.launchId === message.launchId);
  function acquired(b) {
    const i = bindings.indexOf(b);
    return {
      type: 'ACQUIRED',
      launchId: b.launchId,
      role: b.role,
      pid: 100 + i,
      imageSha256: b.imageSha256,
      creationIdentity: 'instance-' + i,
      parentOwned: true,
    };
  }
  function ready(b) {
    return { type: 'READY', launchId: b.launchId, role: b.role, commandSha256: b.commandSha256 };
  }
  function send(messages) {
    const bytes = Buffer.concat(messages.map((m) => peer.encode(m)));
    if (fragmented) {
      for (let i = 0; i < bytes.length; i++) incoming.write(bytes.subarray(i, i + 1));
    } else incoming.write(bytes);
  }
  outgoing.on('data', (bytes) => {
    for (const m of peer.push(bytes)) {
      requests.push(m);
      const b = bindingFor(m);
      assert.ok(b);
      if (m.type === 'INTENT') send([ready(b), acquired(b)]);
      else if (m.type === 'SPAWNED') {
        // ACQUIRED was already in the same peer write as READY; never replay it.
        assert.equal(m.pid, acquired(b).pid);
      } else if (m.type === 'CLOSED') {
        send([
          {
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
            peakWorkingSetBytes: 4096,
          },
        ]);
      } else if (m.type === 'ABANDON') {
        send([
          {
            type: 'ABANDONED',
            launchId: m.launchId,
            unknownDescendants: false,
            cleanupComplete: true,
          },
        ]);
      } else assert.fail('Unexpected control request');
    }
  });
  if (stalled) outgoing.pause();
  t.after(() => {
    channel.dispose();
    incoming.destroy();
    outgoing.destroy();
  });
  const child = (i) => ({
    pid: 100 + i,
    executablePath: process.execPath,
    spawnStartedEpochMs: 1,
    spawnedEpochMs: 2,
  });
  return {
    incoming,
    outgoing,
    channel,
    session,
    signal,
    plans,
    bindings,
    requests,
    child,
    ready,
    acquired,
    send,
  };
}
function assertNoAuthority(f) {
  for (const status of [f.session.status(), f.channel.status()]) {
    assert.equal(status.measurementEligible, false);
    assert.equal(status.executionAuthorized, false);
    assert.equal(status.productionAdmission, false);
  }
}
for (const fragmented of [false, true]) {
  test(
    'serial GIT/V2/V5 with coalesced READY and early ACQUIRED' +
      (fragmented ? ', byte fragments' : ''),
    async (t) => {
      const f = fixture(t, { fragmented });
      for (let i = 0; i < f.bindings.length; i++) {
        const launch = f.session.take(f.bindings[i].role);
        await launch.beforeSpawn(f.plans[i], f.signal);
        assert.deepEqual(
          f.requests.slice(-1).map((m) => m.type),
          ['INTENT'],
        );
        await launch.beforeInput(f.child(i), f.signal);
        await launch.afterClose({ exitCode: i === 0 ? 1 : 0, signal: null }, f.signal);
        assert.equal(f.session.status().status, 'PENDING');
        await launch.dispose(f.signal);
        assert.equal(f.session.status().remaining, f.bindings.length - i - 1);
      }
      assert.deepEqual(
        f.requests.map((m) => m.type),
        Array(3).fill(['INTENT', 'SPAWNED', 'CLOSED']).flat(),
      );
      assert.equal(f.channel.status().status, 'OPEN');
      assert.equal(f.session.status().status, 'OFFLINE_IDLE');
      assertNoAuthority(f);
    },
  );
}
for (const event of ['abort', 'incoming-close', 'outgoing-close']) {
  test('READY and early ACQUIRED cannot bypass stalled write before ' + event, async (t) => {
    const f = fixture(t, { stalled: true });
    const controller = new AbortController();
    const launch = f.session.take('GIT');
    let settled = false;
    const pending = launch.beforeSpawn(f.plans[0], controller.signal);
    const rejected = assert.rejects(pending, invalid);
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await turn();
    assert.equal(f.outgoing.writableNeedDrain, true);
    f.send([f.ready(f.bindings[0]), f.acquired(f.bindings[0])]);
    await turn();
    assert.equal(settled, false, 'peer reply must still wait for write callback and drain');
    if (event === 'abort') controller.abort();
    else if (event === 'incoming-close') f.incoming.destroy();
    else f.outgoing.destroy();
    await rejected;
    assert.equal(f.channel.status().status, 'FAILED');
    assert.equal(f.session.status().status, 'FAILED');
    await assert.rejects(launch.beforeInput(f.child(0), f.signal), invalid);
    assert.throws(() => f.session.take('V2'), invalid);
    f.outgoing.resume();
    await turn();
    assertNoAuthority(f);
  });
}
for (const first of ['abort', 'close']) {
  test(
    'backpressure cancellation/close race is sticky when ' + first + ' occurs first',
    async (t) => {
      const f = fixture(t, { stalled: true });
      const controller = new AbortController();
      const launch = f.session.take('GIT');
      const pending = launch.beforeSpawn(f.plans[0], controller.signal);
      const rejected = assert.rejects(pending, invalid);
      await turn();
      f.send([f.ready(f.bindings[0]), f.acquired(f.bindings[0])]);
      if (first === 'abort') {
        controller.abort();
        f.incoming.destroy();
      } else {
        f.incoming.destroy();
        await turn();
        controller.abort();
      }
      f.outgoing.destroy();
      await rejected;
      await turn();
      assert.equal(f.channel.status().status, 'FAILED');
      assert.throws(() => f.session.take('V2'), invalid);
      assertNoAuthority(f);
    },
  );
}
test('backpressure drains before early ACQUIRED can authorize input', async (t) => {
  const f = fixture(t, { stalled: true, roles: ['V2'] });
  const launch = f.session.take('V2');
  let settled = false;
  const pending = launch.beforeSpawn(f.plans[0], f.signal).then(() => {
    settled = true;
  });
  await turn();
  assert.equal(f.outgoing.writableNeedDrain, true);
  // Resuming lets the peer produce READY+ACQUIRED while this write is still completing.
  f.outgoing.resume();
  await pending;
  assert.equal(settled, true);
  await launch.beforeInput(f.child(0), f.signal);
  await launch.afterClose({ exitCode: 0, signal: null }, f.signal);
  await launch.dispose(f.signal);
  assert.equal(f.session.status().status, 'OFFLINE_IDLE');
  assertNoAuthority(f);
});
test('settled launch retains serial slot until dispose and cannot skip a role', async (t) => {
  const f = fixture(t);
  const launch = f.session.take('GIT');
  await launch.beforeSpawn(f.plans[0], f.signal);
  await launch.beforeInput(f.child(0), f.signal);
  await launch.afterClose({ exitCode: 0, signal: null }, f.signal);
  assert.throws(() => f.session.take('V2'), invalid);
  await launch.dispose(f.signal);
  assert.throws(() => f.session.take('V5'), invalid);
  assert.equal(f.session.status().status, 'FAILED');
  assertNoAuthority(f);
});
test('early ACQUIRED from another instance poisons all subsequent roles', async (t) => {
  const f = fixture(t, { stalled: true });
  const launch = f.session.take('GIT');
  const pending = launch.beforeSpawn(f.plans[0], f.signal);
  await turn();
  f.send([f.ready(f.bindings[0]), { ...f.acquired(f.bindings[0]), pid: 999 }]);
  // Do not read the outgoing bytes through the synthetic peer a second time.
  f.outgoing.removeAllListeners('data');
  f.outgoing.resume();
  await pending;
  await assert.rejects(launch.beforeInput(f.child(0), f.signal), invalid);
  assert.equal(f.channel.status().status, 'FAILED');
  assert.throws(() => f.session.take('V2'), invalid);
  assertNoAuthority(f);
});
test('fully released GIT cannot skip the fixed V2 role', async (t) => {
  const f = fixture(t);
  const launch = f.session.take('GIT');
  await launch.beforeSpawn(f.plans[0], f.signal);
  await launch.beforeInput(f.child(0), f.signal);
  await launch.afterClose({ exitCode: 0, signal: null }, f.signal);
  await launch.dispose(f.signal);
  assert.equal(f.session.status().status, 'OFFLINE_IDLE');
  assert.throws(() => f.session.take('V5'), invalid);
  assert.equal(f.session.status().status, 'FAILED');
  assert.deepEqual(
    f.requests.map((m) => m.type),
    ['INTENT', 'SPAWNED', 'CLOSED'],
  );
  assertNoAuthority(f);
});
