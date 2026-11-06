import test from 'node:test';
import assert from 'node:assert/strict';
import { createMixedNativeDynamicControlCodec as createCodec } from './mixed-native-dynamic-control-codec.mjs';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
const context = 'a'.repeat(64),
  digest = 'b'.repeat(64),
  source = 'c'.repeat(64),
  input = 'd'.repeat(64);
const limits = { maxFrameBytes: 1024, maxTotalBytes: 16384, maxFrames: 100 };
const create = (ctx = context, caps = limits) => createCodec(ctx, caps);
const binding = (type) => ({
  type,
  launchId: 'launch-1',
  role: 'SURFACE_V8',
  phase: 'ANALYSIS',
  contextDigest: source,
  commandSha256: digest,
});
const register = () => ({
  ...binding('REGISTER'),
  staticCommandSha256: source,
  stdinSha256: input,
});
const invalid = (fn) =>
  assert.throws(fn, (e) => e.code === 'INVALID_MIXED_NATIVE_CONTROL' && e.message === e.code);
const closed = {
  type: 'CLOSED',
  launchId: 'launch-1',
  pid: 123,
  creationIdentity: 'created-1',
  exitCode: 0,
  signal: null,
};
const released = {
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
};
const vectors = [
  register(),
  ...['BOUND', 'INTENT', 'READY'].map(binding),
  { type: 'SPAWNED', launchId: 'launch-1', pid: 123 },
  {
    type: 'ACQUIRED',
    launchId: 'launch-1',
    role: 'SURFACE_V8',
    pid: 123,
    imageSha256: digest,
    creationIdentity: 'created-1',
    parentOwned: true,
  },
  closed,
  released,
  { type: 'ABANDON', launchId: 'launch-1' },
  { type: 'ABANDONED', launchId: 'launch-1', unknownDescendants: false, cleanupComplete: false },
];

test('wire2 REGISTER literal pins prefix, envelope and seven-field order', () => {
  assert.equal(
    create().encode(register()).toString(),
    [
      'CA_MIXED_NATIVE_CONTROL_V2',
      context,
      '1',
      'REGISTER',
      'launch-1',
      'SURFACE_V8',
      'ANALYSIS',
      source,
      source,
      input,
      digest,
    ].join('\t') + '\n',
  );
});
for (const type of ['BOUND', 'INTENT', 'READY'])
  test(type + ' has exact five-field body', () => {
    assert.equal(
      create().encode(binding(type)).toString(),
      [
        'CA_MIXED_NATIVE_CONTROL_V2',
        context,
        '1',
        type,
        'launch-1',
        'SURFACE_V8',
        'ANALYSIS',
        source,
        digest,
      ].join('\t') + '\n',
    );
  });
for (const chunkSize of [1, 7, 100000])
  test('all message schemas round trip at chunk size ' + chunkSize, () => {
    const writer = create(),
      reader = create(),
      bytes = Buffer.concat(vectors.map((m) => writer.encode(m))),
      output = [];
    for (let i = 0; i < bytes.length; i += chunkSize)
      output.push(...reader.push(bytes.subarray(i, i + chunkSize)));
    reader.finish();
    assert.deepEqual(output, vectors);
    output.forEach((m) => assert.ok(Object.isFrozen(m)));
  });
for (const role of ['GIT', 'V2', 'SURFACE_V8'])
  test('strict role token ' + role, () => {
    const m = { ...register(), role, phase: role === 'GIT' ? 'SOURCE' : 'ANALYSIS' };
    assert.deepEqual(create().push(create().encode(m)), [m]);
  });
for (const [name, change] of [
  ['old V5 role', (m) => (m.role = 'V5')],
  ['unknown phase', (m) => (m.phase = 'CAPTURE')],
  ['missing phase', (m) => delete m.phase],
  ['missing context digest', (m) => delete m.contextDigest],
  ['extra authority', (m) => (m.executionAuthorized = true)],
  ['uppercase SHA', (m) => (m.commandSha256 = 'A'.repeat(64))],
  ['separator injection', (m) => (m.launchId = 'x\ty')],
  ['newline injection', (m) => (m.launchId = 'x\n')],
  ['missing stdin hash', (m) => delete m.stdinSha256],
  ['malformed static hash', (m) => (m.staticCommandSha256 = 'b'.repeat(63))],
])
  test('encoder rejects ' + name + ' with sticky failure', () => {
    const codec = create(),
      m = register();
    change(m);
    invalid(() => codec.encode(m));
    invalid(() => codec.encode(register()));
    invalid(() => codec.push(Buffer.alloc(0)));
  });
for (const [name, change] of [
  ['V1 prefix', (s) => s.replace('CONTROL_V2', 'CONTROL_V1')],
  ['wrong context', (s) => s.replace(context, 'e'.repeat(64))],
  ['sequence gap', (s) => s.replace('\t1\tREGISTER', '\t2\tREGISTER')],
  ['zero-padded sequence', (s) => s.replace('\t1\tREGISTER', '\t01\tREGISTER')],
  ['extra field', (s) => s.replace('\n', '\textra\n')],
  ['missing field', (s) => s.replace('\t' + input, '')],
  ['CRLF', (s) => s.replace('\n', '\r\n')],
  ['old role', (s) => s.replace('SURFACE_V8', 'V5')],
  ['invalid phase', (s) => s.replace('ANALYSIS', 'analysis')],
  ['unknown type', (s) => s.replace('REGISTER', 'register')],
])
  test('decoder rejects ' + name + ' permanently', () => {
    const reader = create(),
      bytes = create().encode(register());
    invalid(() => reader.push(Buffer.from(change(bytes.toString()))));
    invalid(() => reader.push(bytes));
  });
test('V1 reader refuses V2 and V2 reader refuses exact old INTENT shape', () => {
  invalid(() => createMixedNativeControlCodec(context, limits).push(create().encode(register())));
  const old = { type: 'INTENT', launchId: 'launch-1', role: 'V2', commandSha256: digest };
  invalid(() => create().push(createMixedNativeControlCodec(context, limits).encode(old)));
  invalid(() => create().encode(old));
});
test('replay and truncation fail sticky', () => {
  const bytes = create().encode(register()),
    reader = create();
  reader.push(bytes);
  invalid(() => reader.push(bytes));
  const partial = create();
  partial.push(bytes.subarray(0, -1));
  invalid(() => partial.finish());
  invalid(() => partial.encode(register()));
});
test('nonASCII and BOM fail', () => {
  const bytes = create().encode(register());
  bytes[0] = 255;
  invalid(() => create().push(bytes));
  invalid(() =>
    create().push(Buffer.concat([Buffer.from([239, 187, 191]), create().encode(register())])),
  );
});
test('per-direction totals and counts are independent', () => {
  const bytes = create().encode(register()),
    caps = { ...limits, maxTotalBytes: bytes.length, maxFrames: 1 },
    codec = create(context, caps);
  assert.deepEqual(codec.push(bytes), [register()]);
  assert.deepEqual(codec.encode(register()), bytes);
  invalid(() => codec.encode(register()));
  const reader = create(context, caps);
  reader.push(bytes);
  invalid(() => reader.push(bytes));
});
test('exact frame limit succeeds; one fewer refuses encode/decode and partial overflow', () => {
  const bytes = create().encode(register());
  assert.deepEqual(
    create(context, { ...limits, maxFrameBytes: bytes.length }).encode(register()),
    bytes,
  );
  invalid(() => create(context, { ...limits, maxFrameBytes: bytes.length - 1 }).encode(register()));
  invalid(() => create(context, { ...limits, maxFrameBytes: bytes.length - 1 }).push(bytes));
  const partial = create(context, { ...limits, maxFrameBytes: 10 });
  partial.push(Buffer.alloc(10, 65));
  invalid(() => partial.push(Buffer.from('a')));
});
test('finish rejects further input and stop blocks both directions', () => {
  const codec = create();
  codec.finish();
  invalid(() => codec.push(Buffer.alloc(0)));
  const stopped = create();
  stopped.stop();
  stopped.stop();
  invalid(() => stopped.encode(register()));
  invalid(() => stopped.push(Buffer.alloc(0)));
});
test('inherited/accessor/proxy records and cap mutation do not relax validation', () => {
  let getters = 0;
  const m = register();
  Object.defineProperty(m, 'phase', {
    enumerable: true,
    get() {
      getters++;
      return 'ANALYSIS';
    },
  });
  invalid(() => create().encode(m));
  assert.equal(getters, 0);
  invalid(() => create().encode(new Proxy(register(), {})));
  const caps = { ...limits, maxFrames: 1 },
    codec = create(context, caps);
  caps.maxFrames = 100;
  codec.encode(register());
  invalid(() => codec.encode(register()));
});
test('nullable final query and canonical numerics retain V1 pins', () => {
  const m = { ...released, queryStatus: 'FAILED', peakWorkingSetBytes: null };
  assert.deepEqual(create().push(create().encode(m)), [m]);
  invalid(() => create().encode({ ...m, peakWorkingSetBytes: 1 }));
  invalid(() => create().encode({ ...closed, exitCode: -0 }));
  invalid(() => create().encode({ type: 'SPAWNED', launchId: 'x', pid: 4294967296 }));
});

test('constructor validates explicit safe caps and exact plain shape', () => {
  invalid(() => create(context + '\n'));
  invalid(() => create('A'.repeat(64)));
  for (const caps of [
    { ...limits, maxFrameBytes: 2147483648 },
    { ...limits, maxTotalBytes: 0 },
    { ...limits, maxFrames: 1.5 },
    { ...limits, maxTotalBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...limits, extra: 1 },
  ])
    invalid(() => create(context, caps));
  invalid(() => create().encode(Object.assign(Object.create({ inherited: true }), register())));
});
test('total byte cap and frame count each independently poison', () => {
  const bytes = create().encode(register());
  const byteLimited = create(context, { ...limits, maxTotalBytes: bytes.length - 1 });
  invalid(() => byteLimited.push(bytes));
  invalid(() => create(context, { ...limits, maxTotalBytes: bytes.length - 1 }).encode(register()));
  const frameLimited = create(context, { ...limits, maxFrames: 1 });
  frameLimited.encode(register());
  invalid(() => frameLimited.encode(register()));
  const reader = create(context, { ...limits, maxFrames: 1 }),
    writer = create();
  reader.push(writer.encode(register()));
  invalid(() => reader.push(writer.encode(register())));
});
test('partial input is copied and decoded output is detached from caller mutation', () => {
  const bytes = create().encode(register()),
    reader = create(),
    part = Buffer.from(bytes.subarray(0, 12));
  reader.push(part);
  part.fill(0);
  const decoded = reader.push(bytes.subarray(12));
  bytes.fill(0);
  assert.deepEqual(decoded, [register()]);
});
