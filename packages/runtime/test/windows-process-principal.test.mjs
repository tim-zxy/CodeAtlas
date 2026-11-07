import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWindowsProcessPrincipalReply } from '../dist/windows-process-principal.js';

// Synthetic helper replies only. Parsing never authenticates an OS subject.
const expected = { pid: 1234, challenge: '6ac5ade8-a0c9-4820-8adc-27ca4de544e1' };
const reply = {
  schema: 'codeatlas.windows-process-principal',
  version: 1,
  pid: expected.pid,
  creationTimeFileTime: '134000000000000000',
  sid: 'S-1-5-21-1-2-3-1001',
  challenge: expected.challenge,
};
const encode = (value) => Buffer.from(JSON.stringify(value));
const rejected = (error) =>
  error.code === 'WINDOWS_PRINCIPAL_UNAVAILABLE' &&
  error.message === 'Windows process principal unavailable';

test('fixed helper data decodes without becoming an authorization handle', () => {
  const bytes = encode(reply),
    result = decodeWindowsProcessPrincipalReply(bytes, expected, bytes.length);
  assert.deepEqual(result, reply);
  assert.ok(Object.isFrozen(result));
  bytes.fill(0);
  assert.deepEqual(result, reply);
  assert.deepEqual(
    decodeWindowsProcessPrincipalReply(Buffer.from(JSON.stringify(reply) + '\r\n'), expected, 4096),
    reply,
  );
});
for (const [name, mutate] of [
  ['wrong PID', (x) => x.pid++],
  ['wrong challenge', (x) => (x.challenge = '7ac5ade8-a0c9-4820-8adc-27ca4de544e1')],
  ['unknown version', (x) => (x.version = 2)],
  ['unknown schema', (x) => (x.schema = 'other')],
  ['extra field', (x) => (x.allowed = true)],
  ['string PID', (x) => (x.pid = '1234')],
  ['zero process', (x) => (x.pid = 0)],
  ['FILETIME number', (x) => (x.creationTimeFileTime = 134)],
  ['zero FILETIME', (x) => (x.creationTimeFileTime = '0')],
  ['FILETIME leading zero', (x) => (x.creationTimeFileTime = '01')],
  ['FILETIME overflow', (x) => (x.creationTimeFileTime = '18446744073709551616')],
  ['SID label', (x) => (x.sid = 'operator')],
  ['SID subauthority overflow', (x) => (x.sid = 'S-1-5-4294967296')],
  ['SID authority overflow', (x) => (x.sid = 'S-1-281474976710656-1')],
  ['SID leading zeros', (x) => (x.sid = 'S-1-05-1')],
])
  test('helper data rejects ' + name, () => {
    const value = structuredClone(reply);
    mutate(value);
    assert.throws(
      () => decodeWindowsProcessPrincipalReply(encode(value), expected, 4096),
      rejected,
    );
  });
for (const [name, bytes] of [
  [
    'duplicate field',
    Buffer.from(JSON.stringify(reply).replace('"version":1', '"version":1,"version":1')),
  ],
  ['noncanonical whitespace', Buffer.from(JSON.stringify(reply, null, 2))],
  ['trailing output', Buffer.from(JSON.stringify(reply) + '\nother')],
  ['multiple trailing lines', Buffer.from(JSON.stringify(reply) + '\n\n')],
  ['BOM', Buffer.concat([Buffer.from([239, 187, 191]), encode(reply)])],
  ['invalid UTF8', Buffer.concat([encode(reply), Buffer.from([255])])],
])
  test('helper stream rejects ' + name, () =>
    assert.throws(() => decodeWindowsProcessPrincipalReply(bytes, expected, 4096), rejected),
  );

test('explicit byte ceiling and expected context are required, never defaults', () => {
  const bytes = encode(reply);
  assert.throws(
    () => decodeWindowsProcessPrincipalReply(bytes, expected, bytes.length - 1),
    rejected,
  );
  for (const cap of [undefined, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => decodeWindowsProcessPrincipalReply(bytes, expected, cap), rejected);
  for (const context of [
    { ...expected, extra: true },
    { ...expected, pid: 0 },
    { ...expected, challenge: expected.challenge.toUpperCase() },
    new Proxy(expected, {}),
  ])
    assert.throws(() => decodeWindowsProcessPrincipalReply(bytes, context, 4096), rejected);
  let getters = 0;
  const context = {
    get pid() {
      getters++;
      return expected.pid;
    },
    challenge: expected.challenge,
  };
  assert.throws(() => decodeWindowsProcessPrincipalReply(bytes, context, 4096), rejected);
  assert.equal(getters, 0);
});

test('shared or proxied reply bytes never enter parsing', () => {
  const bytes = encode(reply);
  assert.throws(
    () => decodeWindowsProcessPrincipalReply(new Proxy(bytes, {}), expected, 4096),
    rejected,
  );
  const shared = new Uint8Array(new SharedArrayBuffer(bytes.length));
  shared.set(bytes);
  assert.throws(() => decodeWindowsProcessPrincipalReply(shared, expected, 4096), rejected);
});

for (const [name, fields] of [
  [
    'UInt64 time and UInt32 PID maximum',
    { pid: 4294967295, creationTimeFileTime: '18446744073709551615' },
  ],
  ['48-bit decimal SID authority', { sid: 'S-1-281474976710655-4294967295' }],
  ['hex SID authority', { sid: 'S-1-0xABCDEF123456-1' }],
  [
    'fifteen subauthorities',
    { sid: 'S-1-5' + Array.from({ length: 15 }, () => '-4294967295').join('') },
  ],
])
  test('helper protocol preserves ' + name, () => {
    const value = { ...reply, ...fields };
    assert.deepEqual(
      decodeWindowsProcessPrincipalReply(
        encode(value),
        { pid: value.pid, challenge: value.challenge },
        4096,
      ),
      value,
    );
  });

test('raw byte hooks cannot run or substitute a reply beyond the charged ceiling', () => {
  let invoked = 0;
  const tiny = new Uint8Array(1);
  Object.defineProperty(tiny, 'valueOf', {
    value() {
      invoked++;
      return encode(reply);
    },
  });
  assert.throws(() => decodeWindowsProcessPrincipalReply(tiny, expected, 1), rejected);
  assert.equal(invoked, 0);
  const valid = encode(reply);
  for (const key of ['valueOf', 'length', Symbol.iterator]) {
    Object.defineProperty(valid, key, {
      get() {
        invoked++;
        throw Error('must not inspect own byte hooks');
      },
      configurable: true,
    });
  }
  assert.deepEqual(decodeWindowsProcessPrincipalReply(valid, expected, 4096), reply);
  assert.equal(invoked, 0);
});

for (const tail of ['\n', '\r', '\u2028', '\u2029'])
  test(
    'escaped trailing line characters are not canonical protocol scalars ' + JSON.stringify(tail),
    () => {
      for (const fields of [
        { creationTimeFileTime: '1' + tail },
        { sid: 'S-1-5-1' + tail },
        { sid: 'S-1-0xABCDEF123456' + tail + '-1' },
      ])
        assert.throws(
          () => decodeWindowsProcessPrincipalReply(encode({ ...reply, ...fields }), expected, 4096),
          rejected,
        );
      const value = { ...reply, challenge: reply.challenge + tail };
      assert.throws(
        () =>
          decodeWindowsProcessPrincipalReply(
            encode(value),
            { ...expected, challenge: value.challenge },
            4096,
          ),
        rejected,
      );
    },
  );
