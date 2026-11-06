import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createMixedNativeDynamicControlExchange } from './mixed-native-control-exchange.mjs';
import { createMixedNativeDynamicControlCodec } from './mixed-native-dynamic-control-codec.mjs';
const context = 'a'.repeat(64),
  sha = 'b'.repeat(64),
  limits = { maxFrameBytes: 1024, maxTotalBytes: 16384, maxFrames: 100 };
const registration = {
  type: 'REGISTER',
  launchId: 'one',
  role: 'SURFACE_V8',
  phase: 'ANALYSIS',
  contextDigest: sha,
  staticCommandSha256: sha,
  stdinSha256: sha,
  commandSha256: sha,
};
function fixture(t, change = (x) => x) {
  const incoming = new PassThrough(),
    outgoing = new PassThrough({ highWaterMark: 1 }),
    peer = createMixedNativeDynamicControlCodec(context, limits),
    messages = [];
  const channel = createMixedNativeDynamicControlExchange(incoming, outgoing, context, limits);
  t.after(() => {
    channel.dispose();
    incoming.destroy();
    outgoing.destroy();
  });
  outgoing.on('data', (b) => {
    for (const m of peer.push(b)) {
      messages.push(m);
      if (m.type === 'REGISTER') {
        const { type, staticCommandSha256, stdinSha256, ...fields } = m;
        const response = change({ ...fields, type: 'BOUND' });
        if (response) incoming.write(peer.encode(response));
      } else if (m.type === 'INTENT') incoming.write(peer.encode({ ...m, type: 'READY' }));
    }
  });
  return { channel, messages, incoming, peer };
}
test('V2 stream settles bounded registration before the exact intent', async (t) => {
  const f = fixture(t),
    signal = new AbortController().signal;
  const bound = await f.channel.exchange(registration, signal);
  assert.equal(bound.type, 'BOUND');
  const { staticCommandSha256, stdinSha256, ...intent } = registration;
  assert.equal((await f.channel.exchange({ ...intent, type: 'INTENT' }, signal)).type, 'READY');
  assert.deepEqual(
    f.messages.map((m) => m.type),
    ['REGISTER', 'INTENT'],
  );
});
for (const field of ['phase', 'contextDigest', 'commandSha256'])
  test('V2 stream rejects mismatched BOUND ' + field, async (t) => {
    const f = fixture(t, (x) => ({ ...x, [field]: field === 'phase' ? 'SOURCE' : 'c'.repeat(64) }));
    await assert.rejects(f.channel.exchange(registration, new AbortController().signal));
    assert.equal(f.channel.status().status, 'FAILED');
  });
test('V2 INTENT without bound binding sends no bytes', async (t) => {
  const f = fixture(t),
    { staticCommandSha256, stdinSha256, ...intent } = registration;
  await assert.rejects(
    f.channel.exchange({ ...intent, type: 'INTENT' }, new AbortController().signal),
  );
  assert.deepEqual(f.messages, []);
});
test('V2 pending registration cancellation cannot send later INTENT', async (t) => {
  const f = fixture(t, () => null),
    controller = new AbortController();
  const pending = f.channel.exchange(registration, controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(f.channel.status().status, 'FAILED');
});
