// Private offline adapter only. Exchange is supplied by a trusted owner; no I/O here.
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
const code = 'INVALID_MIXED_NATIVE_LAUNCH';
const bad = () => Object.assign(Error(code), { code });
const check = (v) => {
  if (!v) throw bad();
};
const exact = (v, keys) => {
  check(v && typeof v === 'object' && !Array.isArray(v));
  check(Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)));
};
const sha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
export function hashMixedNativeLaunch(plan) {
  try {
    validateOperationPolicyData(plan);
    exact(plan, ['executablePath', 'arguments', 'environment', 'cwd', 'stdinSha256']);
    check(
      typeof plan.executablePath === 'string' &&
        isAbsolute(plan.executablePath) &&
        !plan.executablePath.includes('\0') &&
        typeof plan.cwd === 'string' &&
        isAbsolute(plan.cwd) &&
        !plan.cwd.includes('\0') &&
        sha(plan.stdinSha256),
    );
    check(
      Array.isArray(plan.arguments) &&
        plan.arguments.every((x) => typeof x === 'string' && !x.includes('\0')),
    );
    check(
      plan.environment && typeof plan.environment === 'object' && !Array.isArray(plan.environment),
    );
    const names = new Set();
    for (const [k, v] of Object.entries(plan.environment)) {
      check(
        k.length > 0 &&
          !k.includes('=') &&
          !k.includes('\0') &&
          typeof v === 'string' &&
          !v.includes('\0') &&
          !names.has(k.toUpperCase()),
      );
      names.add(k.toUpperCase());
    }
    const normalized = {
      executablePath: plan.executablePath,
      arguments: [...plan.arguments],
      environment: Object.fromEntries(
        Object.entries(plan.environment).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      cwd: plan.cwd,
      stdinSha256: plan.stdinSha256,
    };
    return createHash('sha256')
      .update('codeatlas-mixed-native-launch-v1\0' + JSON.stringify(normalized))
      .digest('hex');
  } catch {
    throw bad();
  }
}
export function createMixedNativeLaunchSession(bindings, exchange) {
  try {
    validateOperationPolicyData(bindings);
    check(Array.isArray(bindings) && typeof exchange === 'function' && !types.isProxy(exchange));
    const seen = new Set(),
      fixed = bindings.map((b) => {
        exact(b, ['launchId', 'role', 'commandSha256', 'imageSha256']);
        check(
          id(b.launchId) &&
            !seen.has(b.launchId) &&
            ['GIT', 'V2', 'V5'].includes(b.role) &&
            sha(b.commandSha256) &&
            sha(b.imageSha256),
        );
        seen.add(b.launchId);
        return Object.freeze({ ...b });
      });
    let next = 0,
      active = null,
      faulted = false;
    const ask = async (message, signal, keys) => {
      let rejectStop;
      const stopped = new Promise((_resolve, reject) => {
        rejectStop = reject;
      });
      const abort = () => rejectStop(bad());
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      try {
        const pending = Promise.resolve().then(() => exchange(Object.freeze(message), signal));
        const reply = await (signal ? Promise.race([pending, stopped]) : pending);
        validateOperationPolicyData(reply);
        exact(reply, keys);
        return reply;
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    };
    return Object.freeze({
      take(role) {
        try {
          check(!faulted && active === null && next < fixed.length && fixed[next].role === role);
          const binding = fixed[next++];
          active = binding;
          let state = 'NEW',
            executablePath = null,
            pid = null,
            creationIdentity = null,
            released = false,
            disposed = false;
          const base = { launchId: binding.launchId };
          return Object.freeze({
            async beforeSpawn(plan, signal) {
              try {
                check(
                  !faulted &&
                    !disposed &&
                    state === 'NEW' &&
                    !signal.aborted &&
                    hashMixedNativeLaunch(plan) === binding.commandSha256,
                );
                executablePath = plan.executablePath;
                state = 'INTENT';
                const r = await ask(
                  { type: 'INTENT', ...base, role, commandSha256: binding.commandSha256 },
                  signal,
                  ['type', 'launchId', 'role', 'commandSha256'],
                );
                check(
                  !faulted &&
                    !disposed &&
                    state === 'INTENT' &&
                    !signal.aborted &&
                    r.type === 'READY' &&
                    r.launchId === binding.launchId &&
                    r.role === role &&
                    r.commandSha256 === binding.commandSha256,
                );
                state = 'READY';
              } catch {
                faulted = true;
                state = 'FAILED';
                throw bad();
              }
            },
            async beforeInput(child, signal) {
              try {
                check(!faulted && !disposed && state === 'READY' && !signal.aborted);
                validateOperationPolicyData(child);
                exact(child, ['pid', 'executablePath', 'spawnStartedEpochMs', 'spawnedEpochMs']);
                check(
                  positive(child.pid) &&
                    child.executablePath === executablePath &&
                    positive(child.spawnStartedEpochMs) &&
                    positive(child.spawnedEpochMs) &&
                    child.spawnedEpochMs >= child.spawnStartedEpochMs,
                );
                pid = child.pid;
                const r = await ask({ type: 'SPAWNED', ...base, pid }, signal, [
                  'type',
                  'launchId',
                  'role',
                  'pid',
                  'imageSha256',
                  'creationIdentity',
                  'parentOwned',
                ]);
                check(
                  !faulted &&
                    !disposed &&
                    state === 'READY' &&
                    !signal.aborted &&
                    r.type === 'ACQUIRED' &&
                    r.launchId === binding.launchId &&
                    r.role === role &&
                    r.pid === pid &&
                    r.imageSha256 === binding.imageSha256 &&
                    id(r.creationIdentity) &&
                    r.parentOwned === true,
                );
                creationIdentity = r.creationIdentity;
                state = 'ACQUIRED';
              } catch {
                faulted = true;
                state = 'FAILED';
                throw bad();
              }
            },
            async afterClose(close, signal) {
              try {
                check(!disposed && state === 'ACQUIRED');
                validateOperationPolicyData(close);
                exact(close, ['exitCode', 'signal']);
                check(
                  (close.exitCode === null || Number.isSafeInteger(close.exitCode)) &&
                    (close.signal === null || typeof close.signal === 'string'),
                );
                const r = await ask(
                  {
                    type: 'CLOSED',
                    ...base,
                    pid,
                    creationIdentity,
                    exitCode: close.exitCode,
                    signal: close.signal,
                  },
                  signal,
                  [
                    'type',
                    'launchId',
                    'pid',
                    'imageSha256',
                    'creationIdentity',
                    'osExited',
                    'handleReleased',
                    'unknownDescendants',
                    'cleanupComplete',
                    'queryStatus',
                    'peakWorkingSetBytes',
                  ],
                );
                check(
                  r.type === 'RELEASED' &&
                    r.launchId === binding.launchId &&
                    r.pid === pid &&
                    r.imageSha256 === binding.imageSha256 &&
                    r.creationIdentity === creationIdentity &&
                    r.osExited === true &&
                    r.handleReleased === true &&
                    r.unknownDescendants === false &&
                    r.cleanupComplete === true,
                );
                released = true;
                check(
                  r.queryStatus === 'RECORDED' &&
                    positive(r.peakWorkingSetBytes) &&
                    close.signal === null &&
                    (close.exitCode === 0 || (role === 'GIT' && close.exitCode === 1)),
                );
                state = 'SETTLED';
              } catch {
                faulted = true;
                state = 'FAILED';
                throw bad();
              }
            },
            async dispose(signal) {
              if (disposed) return;
              disposed = true;
              try {
                if (state !== 'SETTLED') faulted = true;
                if (state !== 'SETTLED' && !released) {
                  const r = await ask({ type: 'ABANDON', ...base }, signal, [
                    'type',
                    'launchId',
                    'unknownDescendants',
                    'cleanupComplete',
                  ]);
                  check(
                    r.type === 'ABANDONED' &&
                      r.launchId === binding.launchId &&
                      r.unknownDescendants === false &&
                      r.cleanupComplete === true,
                  );
                }
              } catch {
                faulted = true;
                throw bad();
              } finally {
                active = null;
                state = 'DISPOSED';
              }
            },
          });
        } catch {
          faulted = true;
          throw bad();
        }
      },
      status() {
        return Object.freeze({
          status: faulted ? 'FAILED' : active ? 'PENDING' : 'OFFLINE_IDLE',
          consumed: next,
          remaining: fixed.length - next,
          measurementEligible: false,
          productionAdmission: false,
          executionAuthorized: false,
        });
      },
    });
  } catch {
    throw bad();
  }
}
