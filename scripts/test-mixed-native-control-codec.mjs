import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from './mixed-native-control-codec.mjs';
const context = 'a'.repeat(64),
  digest = 'b'.repeat(64),
  limits = { maxFrameBytes: 1024, maxTotalBytes: 16384, maxFrames: 100 };
const create = (ctx = context, l = limits) => {
  assert.equal(typeof api.createMixedNativeControlCodec, 'function');
  return api.createMixedNativeControlCodec(ctx, l);
};
const intent = () => ({ type: 'INTENT', launchId: 'launch-1', role: 'V2', commandSha256: digest });
const invalid = (fn) =>
  assert.throws(fn, (e) => e.code === 'INVALID_MIXED_NATIVE_CONTROL' && e.message === e.code);
const vectors = [
  intent(),
  { type: 'READY', launchId: 'launch-1', role: 'V2', commandSha256: digest },
  { type: 'SPAWNED', launchId: 'launch-1', pid: 123 },
  {
    type: 'ACQUIRED',
    launchId: 'launch-1',
    role: 'V2',
    pid: 123,
    imageSha256: digest,
    creationIdentity: 'created-1',
    parentOwned: true,
  },
  {
    type: 'CLOSED',
    launchId: 'launch-1',
    pid: 123,
    creationIdentity: 'created-1',
    exitCode: 0,
    signal: null,
  },
  {
    type: 'RELEASED',
    launchId: 'launch-1',
    pid: 123,
    imageSha256: digest,
    creationIdentity: 'created-1',
    osExited: true,
    handleReleased: true,
    unknownDescendants: false,
    cleanupComplete: true,
    queryStatus: 'RECORDED',
    peakWorkingSetBytes: 4096,
  },
  { type: 'ABANDON', launchId: 'launch-1' },
  { type: 'ABANDONED', launchId: 'launch-1', unknownDescendants: false, cleanupComplete: false },
];
test('wire1 literal is fixed ASCII/tab/LF with context and next sequence', () => {
  const c = create();
  assert.equal(
    c.encode(intent()).toString(),
    'CA_MIXED_NATIVE_CONTROL_V1\t' + context + '\t1\tINTENT\tlaunch-1\tV2\t' + digest + '\n',
  );
});
test('all message forms survive fragmented and coalesced bytes without authority', () => {
  const writer = create(),
    reader = create(),
    bytes = Buffer.concat(vectors.map((m) => writer.encode(m))),
    out = [];
  for (let i = 0; i < bytes.length; i += 7) out.push(...reader.push(bytes.subarray(i, i + 7)));
  reader.finish();
  assert.deepEqual(out, vectors);
  for (const m of out) assert.ok(Object.isFrozen(m));
});
for (const [name, change] of [
  ['unknown role', (m) => (m.role = 'CONHOST')],
  ['unknown field', (m) => (m.approval = true)],
  ['separator injection', (m) => (m.launchId = 'bad\tfield')],
  ['uppercase hash', (m) => (m.commandSha256 = 'A'.repeat(64))],
])
  test('encoder refuses ' + name, () => {
    const c = create(),
      m = intent();
    change(m);
    invalid(() => c.encode(m));
    invalid(() => c.encode(intent()));
  });
for (const [name, change] of [
  ['wrong context', (b) => b.toString().replace(context, 'c'.repeat(64))],
  ['gap sequence', (b) => b.toString().replace('\t1\tINTENT', '\t2\tINTENT')],
  ['CRLF', (b) => b.toString().replace('\n', '\r\n')],
  ['unknown type', (b) => b.toString().replace('INTENT', 'CREATE')],
  ['extra field', (b) => b.toString().replace('\n', '\textra\n')],
])
  test('decoder refuses ' + name + ' and is poisoned', () => {
    const b = create().encode(intent()),
      r = create();
    invalid(() => r.push(Buffer.from(change(b))));
    invalid(() => r.push(b));
  });
test('replayed sequence is not accepted twice', () => {
  const b = create().encode(intent()),
    r = create();
  r.push(b);
  invalid(() => r.push(b));
});
test('unterminated frame is refused at EOF', () => {
  const b = create().encode(intent()),
    r = create();
  r.push(b.subarray(0, -1));
  invalid(() => r.finish());
});
test('non ASCII byte is refused', () => {
  const b = create().encode(intent());
  b[0] = 255;
  invalid(() => create().push(b));
});
test('declared frame byte budget is enforced before buffering', () => {
  const r = create(context, { ...limits, maxFrameBytes: 16 });
  invalid(() => r.push(Buffer.alloc(17, 65)));
});
test('declared total bytes and frame counts are independent', () => {
  const b = create().encode(intent());
  const r = create(context, { ...limits, maxTotalBytes: b.length - 1 });
  invalid(() => r.push(b));
  const q = create(context, { ...limits, maxFrames: 1 });
  q.push(b);
  invalid(() => q.push(create().encode(intent())));
});
test('null and failed final query remain null instead of fake peak', () => {
  const m = { ...vectors[5], queryStatus: 'FAILED', peakWorkingSetBytes: null };
  assert.deepEqual(create().push(create().encode(m)), [m]);
  m.peakWorkingSetBytes = 0;
  invalid(() => create().encode(m));
});
test('canonical numeric fields reject negative zero and PID overflow', () => {
  invalid(() => create().encode({ ...vectors[4], exitCode: -0 }));
  invalid(() => create().encode({ ...vectors[2], pid: 4294967296 }));
});

test('encoder refuses trailing newline identity or context instead of frame injection', () => {
  invalid(() => create().encode({ ...intent(), launchId: 'launch-1' + String.fromCharCode(10) }));
  invalid(() => create(context + String.fromCharCode(10)));
});
