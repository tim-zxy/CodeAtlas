import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import * as api from './mixed-native-control-exchange.mjs';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
import {
  createMixedNativeLaunchSession,
  hashMixedNativeLaunch,
} from './mixed-native-launch-handshake.mjs';
const ctx = 'a'.repeat(64),
  sha = 'b'.repeat(64),
  caps = { maxFrameBytes: 1024, maxTotalBytes: 16384, maxFrames: 100 };
const error = (e) => e.code === 'MIXED_NATIVE_CONTROL_FAILED' && e.message === e.code;
function fixture(t, automatic = true) {
  const incoming = new PassThrough(),
    outgoing = new PassThrough({ highWaterMark: 1 }),
    peer = createMixedNativeControlCodec(ctx, caps),
    requests = [];
  assert.equal(typeof api.createMixedNativeControlExchange, 'function');
  const channel = api.createMixedNativeControlExchange(incoming, outgoing, ctx, caps);
  t.after(() => {
    channel.dispose();
    incoming.destroy();
    outgoing.destroy();
  });
  const send = (m) => incoming.write(peer.encode(m)),
    signal = new AbortController().signal;
  outgoing.on('data', (bytes) => {
    for (const m of peer.push(bytes)) {
      requests.push(m);
      if (!automatic) continue;
      if (m.type === 'INTENT')
        send({ type: 'READY', launchId: m.launchId, role: m.role, commandSha256: m.commandSha256 });
      else if (m.type === 'SPAWNED')
        send({
          type: 'ACQUIRED',
          launchId: m.launchId,
          role: 'V2',
          pid: m.pid,
          imageSha256: sha,
          creationIdentity: 'created',
          parentOwned: true,
        });
      else if (m.type === 'CLOSED')
        send({
          type: 'RELEASED',
          launchId: m.launchId,
          pid: m.pid,
          imageSha256: sha,
          creationIdentity: m.creationIdentity,
          osExited: true,
          handleReleased: true,
          unknownDescendants: false,
          cleanupComplete: true,
          queryStatus: 'RECORDED',
          peakWorkingSetBytes: 4096,
        });
      else if (m.type === 'ABANDON')
        send({
          type: 'ABANDONED',
          launchId: m.launchId,
          unknownDescendants: false,
          cleanupComplete: false,
        });
    }
  });
  return { incoming, outgoing, peer, requests, channel, send, signal };
}
const intent = { type: 'INTENT', launchId: 'launch-1', role: 'V2', commandSha256: sha };
test('fixed handshake uses only control streams and respects backpressure', async (t) => {
  const f = fixture(t),
    plan = {
      executablePath: process.execPath,
      arguments: [],
      environment: {},
      cwd: process.cwd(),
      stdinSha256: sha,
    };
  const session = createMixedNativeLaunchSession(
      [
        {
          launchId: 'launch-1',
          role: 'V2',
          commandSha256: hashMixedNativeLaunch(plan),
          imageSha256: sha,
        },
      ],
      f.channel.exchange,
    ),
    l = session.take('V2');
  await l.beforeSpawn(plan, f.signal);
  await l.beforeInput(
    { pid: 123, executablePath: process.execPath, spawnStartedEpochMs: 1, spawnedEpochMs: 2 },
    f.signal,
  );
  await l.afterClose({ exitCode: 0, signal: null }, f.signal);
  await l.dispose(f.signal);
  assert.deepEqual(
    f.requests.map((m) => m.type),
    ['INTENT', 'SPAWNED', 'CLOSED'],
  );
  assert.equal(session.status().measurementEligible, false);
  assert.equal(f.channel.status().executionAuthorized, false);
});
test('ACQUIRED queued before SPAWNED is matched once', async (t) => {
  const f = fixture(t, false),
    pending = f.channel.exchange(intent, f.signal);
  f.send({ type: 'READY', launchId: 'launch-1', role: 'V2', commandSha256: sha });
  await pending;
  f.send({
    type: 'ACQUIRED',
    launchId: 'launch-1',
    role: 'V2',
    pid: 123,
    imageSha256: sha,
    creationIdentity: 'created',
    parentOwned: true,
  });
  const m = await f.channel.exchange({ type: 'SPAWNED', launchId: 'launch-1', pid: 123 }, f.signal);
  assert.equal(m.pid, 123);
  assert.equal(f.requests.length, 2);
});
test('overlapping exchange poisons both calls instead of sharing a reply', async (t) => {
  const f = fixture(t, false),
    first = f.channel.exchange(intent, f.signal);
  const a = assert.rejects(first, error),
    b = assert.rejects(f.channel.exchange(intent, f.signal), error);
  await Promise.all([a, b]);
  assert.equal(f.channel.status().status, 'FAILED');
});
test('abort cannot later consume READY or start another exchange', async (t) => {
  const f = fixture(t, false),
    c = new AbortController(),
    p = f.channel.exchange(intent, c.signal);
  c.abort();
  await assert.rejects(p, error);
  f.send({ type: 'READY', launchId: 'launch-1', role: 'V2', commandSha256: sha });
  await assert.rejects(f.channel.exchange(intent, f.signal), error);
});
test('unsolicited or mismatched reply is not a permit', async (t) => {
  const f = fixture(t, false),
    p = f.channel.exchange(intent, f.signal);
  f.send({ type: 'READY', launchId: 'other', role: 'V2', commandSha256: sha });
  await assert.rejects(p, error);
});
test('EOF fragment fails a pending request', async (t) => {
  const f = fixture(t, false),
    p = f.channel.exchange(intent, f.signal);
  f.incoming.end(Buffer.from('partial'));
  await assert.rejects(p, error);
});
test('stream error remains observed until physical close', async (t) => {
  const f = fixture(t, false),
    p = f.channel.exchange(intent, f.signal);
  f.incoming.emit('error', Error('private'));
  await assert.rejects(p, error);
  f.outgoing.emit('error', Error('late private'));
  assert.equal(f.channel.status().status, 'FAILED');
});
test('preexisting reader ownership is rejected', () => {
  const incoming = new PassThrough(),
    outgoing = new PassThrough();
  incoming.on('data', () => {});
  assert.throws(() => api.createMixedNativeControlExchange(incoming, outgoing, ctx, caps), error);
  incoming.destroy();
  outgoing.destroy();
});
