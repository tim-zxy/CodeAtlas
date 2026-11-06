// Separate private V2 control wire only; role/phase lifecycle belongs to policy. Never reads child protocol streams or grants authority.
import { types } from 'node:util';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
const code = 'INVALID_MIXED_NATIVE_CONTROL';
const bad = () => Object.assign(Error(code), { code });
const check = (v) => {
  if (!v) throw bad();
};
const schemas = {
  REGISTER: [
    ['launchId', 'id'],
    ['role', 'role'],
    ['phase', 'phase'],
    ['contextDigest', 'sha'],
    ['staticCommandSha256', 'sha'],
    ['stdinSha256', 'sha'],
    ['commandSha256', 'sha'],
  ],
  BOUND: [
    ['launchId', 'id'],
    ['role', 'role'],
    ['phase', 'phase'],
    ['contextDigest', 'sha'],
    ['commandSha256', 'sha'],
  ],
  INTENT: [
    ['launchId', 'id'],
    ['role', 'role'],
    ['phase', 'phase'],
    ['contextDigest', 'sha'],
    ['commandSha256', 'sha'],
  ],
  READY: [
    ['launchId', 'id'],
    ['role', 'role'],
    ['phase', 'phase'],
    ['contextDigest', 'sha'],
    ['commandSha256', 'sha'],
  ],
  SPAWNED: [
    ['launchId', 'id'],
    ['pid', 'pid'],
  ],
  ACQUIRED: [
    ['launchId', 'id'],
    ['role', 'role'],
    ['pid', 'pid'],
    ['imageSha256', 'sha'],
    ['creationIdentity', 'id'],
    ['parentOwned', 'bool'],
  ],
  CLOSED: [
    ['launchId', 'id'],
    ['pid', 'pid'],
    ['creationIdentity', 'id'],
    ['exitCode', 'integer?'],
    ['signal', 'signal?'],
  ],
  RELEASED: [
    ['launchId', 'id'],
    ['pid', 'pid'],
    ['imageSha256', 'sha'],
    ['creationIdentity', 'id'],
    ['osExited', 'bool'],
    ['handleReleased', 'bool'],
    ['unknownDescendants', 'bool'],
    ['cleanupComplete', 'bool'],
    ['queryStatus', 'query'],
    ['peakWorkingSetBytes', 'positive?'],
  ],
  ABANDON: [['launchId', 'id']],
  ABANDONED: [
    ['launchId', 'id'],
    ['unknownDescendants', 'bool'],
    ['cleanupComplete', 'bool'],
  ],
};
const exact = (v, keys) => {
  check(v && typeof v === 'object' && !Array.isArray(v));
  check(Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)));
};
const positive = (v) => Number.isSafeInteger(v) && v > 0;
function token(v, type) {
  if (type.endsWith('?') && v === null) return '~';
  switch (type) {
    case 'id':
      check(typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v));
      break;
    case 'sha':
      check(typeof v === 'string' && /^[a-f0-9]{64}$/.test(v));
      break;
    case 'role':
      check(['GIT', 'V2', 'SURFACE_V8'].includes(v));
      break;
    case 'phase':
      check(['SOURCE', 'ANALYSIS'].includes(v));
      break;
    case 'query':
      check(['RECORDED', 'FAILED'].includes(v));
      break;
    case 'bool':
      check(typeof v === 'boolean');
      return v ? '1' : '0';
    case 'pid':
      check(positive(v) && v <= 4294967295);
      break;
    case 'integer?':
      check(Number.isSafeInteger(v) && !Object.is(v, -0));
      break;
    case 'positive?':
      check(positive(v));
      break;
    case 'signal?':
      check(typeof v === 'string' && /^SIG[A-Z0-9]+$/.test(v));
      break;
    default:
      throw bad();
  }
  return String(v);
}
function value(t, type) {
  let v = t;
  if (type.endsWith('?') && t === '~') v = null;
  else if (type === 'bool') {
    check(t === '0' || t === '1');
    v = t === '1';
  } else if (['pid', 'integer?', 'positive?'].includes(type)) {
    check(/^-?(?:0|[1-9][0-9]*)$/.test(t));
    v = Number(t);
    check(String(v) === t);
  }
  check(token(v, type) === t);
  return v;
}
function fields(message) {
  validateOperationPolicyData(message);
  check(typeof message.type === 'string' && Object.hasOwn(schemas, message.type));
  const schema = schemas[message.type];
  exact(message, ['type', ...schema.map(([k]) => k)]);
  if (message.type === 'RELEASED')
    check(
      message.queryStatus === 'RECORDED'
        ? positive(message.peakWorkingSetBytes)
        : message.peakWorkingSetBytes === null,
    );
  return schema.map(([k, t]) => token(message[k], t));
}
export function createMixedNativeDynamicControlCodec(contextSha256, limits) {
  try {
    check(typeof contextSha256 === 'string' && /^[a-f0-9]{64}$/.test(contextSha256));
    validateOperationPolicyData(limits);
    exact(limits, ['maxFrameBytes', 'maxTotalBytes', 'maxFrames']);
    check(Object.values(limits).every(positive) && limits.maxFrameBytes <= 2147483647);
    const cap = Object.freeze({ ...limits });
    let tx = 0,
      rx = 0,
      txBytes = 0,
      rxBytes = 0,
      pending = Buffer.alloc(0),
      failed = false,
      ended = false;
    const fail = () => {
      failed = true;
      pending = Buffer.alloc(0);
      return bad();
    };
    return Object.freeze({
      encode(message) {
        try {
          check(!failed && tx < cap.maxFrames);
          const body = fields(message);
          const length =
            'CA_MIXED_NATIVE_CONTROL_V2'.length +
            contextSha256.length +
            String(tx + 1).length +
            message.type.length +
            4 +
            body.reduce((n, v) => n + v.length + 1, 0);
          check(length <= cap.maxFrameBytes && length <= cap.maxTotalBytes - txBytes);
          const line =
              [
                'CA_MIXED_NATIVE_CONTROL_V2',
                contextSha256,
                String(tx + 1),
                message.type,
                ...body,
              ].join('\t') + '\n',
            bytes = Buffer.from(line, 'ascii');
          check(bytes.length <= cap.maxFrameBytes && bytes.length <= cap.maxTotalBytes - txBytes);
          tx++;
          txBytes += bytes.length;
          return bytes;
        } catch {
          throw fail();
        }
      },
      push(chunk) {
        try {
          check(
            !failed &&
              !ended &&
              Buffer.isBuffer(chunk) &&
              !types.isProxy(chunk) &&
              chunk.length <= cap.maxTotalBytes - rxBytes,
          );
          rxBytes += chunk.length;
          const out = [];
          let start = 0;
          while (start < chunk.length) {
            const newline = chunk.indexOf(10, start),
              end = newline < 0 ? chunk.length : newline + 1,
              part = chunk.subarray(start, end);
            check(part.length <= cap.maxFrameBytes - pending.length);
            pending = Buffer.concat([pending, part]);
            start = end;
            if (newline < 0) break;
            check(
              pending.length > 0 &&
                pending.every(
                  (b, i) =>
                    b === 9 || (b === 10 && i === pending.length - 1) || (b >= 32 && b <= 126),
                ),
            );
            const parts = pending.subarray(0, -1).toString('ascii').split('\t');
            pending = Buffer.alloc(0);
            check(
              parts.length >= 4 &&
                parts[0] === 'CA_MIXED_NATIVE_CONTROL_V2' &&
                parts[1] === contextSha256 &&
                parts[2] === String(rx + 1) &&
                rx < cap.maxFrames &&
                Object.hasOwn(schemas, parts[3]),
            );
            const schema = schemas[parts[3]];
            check(parts.length === schema.length + 4);
            const message = { type: parts[3] };
            schema.forEach(([k, t], i) => (message[k] = value(parts[i + 4], t)));
            fields(message);
            rx++;
            out.push(Object.freeze(message));
          }
          return out;
        } catch {
          throw fail();
        }
      },
      finish() {
        try {
          check(!failed && pending.length === 0);
          ended = true;
        } catch {
          throw fail();
        }
      },
      stop() {
        failed = true;
        pending = Buffer.alloc(0);
      },
    });
  } catch {
    throw bad();
  }
}
