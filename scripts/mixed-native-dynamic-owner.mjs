import { runtimeStopReason } from '../packages/ir/dist/runtime-request-control.js';
// Private offline coordinator and original-issuer lifecycle. No live bootstrap or run authority.
import { createHash } from 'node:crypto';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
import { authorizeRuntimeWorkflow } from '../packages/application/dist/refresh-runtime-facts.js';
import readCapture, {
  recheckActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import nativeOwner from '../packages/providers/dist/native-client.js';
import gitOwner from '../packages/source/dist/git.js';
import { loadMixedNativeOwnerContext } from './mixed-native-owner-context.mjs';
import { createMixedNativeDynamicControlExchange } from './mixed-native-control-exchange.mjs';
import { hashMixedNativeLaunch } from './mixed-native-launch-handshake.mjs';
const code = 'INVALID_MIXED_NATIVE_DYNAMIC_OWNER';
const bad = () => Object.assign(Error(code), { code });
const check = (v) => {
  if (!v) throw bad();
};
const exact = (v, keys) =>
  check(
    v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === keys.length &&
      keys.every((k) => Object.hasOwn(v, k)),
  );
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const hash = (v) => createHash('sha256').update(v).digest('hex');
const freeze = (v) => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
};
const flags = Object.freeze({
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
  contextAuthenticated: false,
  toolImagesAuthenticated: false,
  moduleClosureAuthenticated: false,
  liveTransportConnected: false,
});
function origin(plan, claim = false) {
  for (const [owner, read, take] of [
    [nativeOwner, 'readOwnedNativeLaunchPlan', 'claimOwnedNativeLaunchPlan'],
    [gitOwner, 'readOwnedGitLaunchPlan', 'claimOwnedGitLaunchPlan'],
  ]) {
    let proof;
    try {
      proof = owner[read](plan);
    } catch {
      continue;
    }
    check(proof.plan === plan && ['GIT', 'V2', 'SURFACE_V8'].includes(proof.role));
    if (claim) {
      const consumed = owner[take](plan);
      check(consumed.plan === plan && consumed.role === proof.role);
    }
    return proof;
  }
  throw bad();
}
function staticPlan(command) {
  exact(command, ['executablePath', 'arguments', 'environment', 'cwd']);
  const plan = { ...command, stdinSha256: '0'.repeat(64) },
    staticCommandSha256 = hashMixedNativeLaunch(plan);
  const text = JSON.stringify({
    executablePath: plan.executablePath,
    arguments: [...plan.arguments],
    environment: Object.fromEntries(
      Object.entries(plan.environment).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    cwd: plan.cwd,
    stdinSha256: plan.stdinSha256,
  });
  check(text.endsWith('0'.repeat(64) + '"}'));
  return { staticCommandSha256, canonicalPrefix: text.slice(0, -66) };
}
/** Expected manifest/slots are coordinator inputs, never supplied over the HOST wire.
 * Independent byte checking is exercised offline; it does not prove immutable live loading.
 */
export async function bindMixedNativeDynamicOwner(value, incoming, outgoing) {
  let channel;
  try {
    validateOperationPolicyData(value);
    exact(value, [
      'root',
      'manifestPath',
      'manifestSha256',
      'artifactLimits',
      'hostEntryArtifactId',
      'hostModuleArtifactIds',
      'workspaceId',
      'repositoryId',
      'slots',
      'deadlineEpochMs',
      'controlLimits',
    ]);
    const input = freeze(structuredClone(value));
    check(
      positive(input.deadlineEpochMs) &&
        Date.now() < input.deadlineEpochMs &&
        typeof input.workspaceId === 'string' &&
        typeof input.repositoryId === 'string',
    );
    const context = await loadMixedNativeOwnerContext(
      input.root,
      input.manifestPath,
      input.manifestSha256,
      input.artifactLimits,
    );
    const artifacts = new Map(context.artifacts.map((a) => [a.id, a]));
    const entry = artifacts.get(input.hostEntryArtifactId);
    check(
      entry &&
        entry.path.endsWith('.mjs') &&
        Array.isArray(input.hostModuleArtifactIds) &&
        input.hostModuleArtifactIds.length > 0 &&
        new Set(input.hostModuleArtifactIds).size === input.hostModuleArtifactIds.length &&
        input.hostModuleArtifactIds.includes(entry.id) &&
        input.hostModuleArtifactIds.every((v) => id(v) && artifacts.has(v)),
    );
    const sourceContextDigest = artifacts.get(context.bindings.source).sha256;
    check(Array.isArray(input.slots));
    const ids = new Set();
    let seenAnalysis = false,
      seenVerification = false;
    const slots = input.slots.map((slot) => {
      exact(slot, ['launchId', 'role', 'phase', 'command']);
      check(id(slot.launchId) && !ids.has(slot.launchId));
      ids.add(slot.launchId);
      if (slot.role === 'GIT') {
        check(
          (slot.phase === 'SOURCE' && !seenAnalysis && !seenVerification) ||
            (slot.phase === 'ANALYSIS' && seenAnalysis),
        );
        if (slot.phase === 'ANALYSIS') seenVerification = true;
      } else {
        check(
          ['V2', 'SURFACE_V8'].includes(slot.role) &&
            slot.phase === 'ANALYSIS' &&
            !seenVerification,
        );
        seenAnalysis = true;
      }
      const digest = staticPlan(slot.command),
        image = artifacts.get(context.bindings[slot.role === 'GIT' ? 'git' : 'native']);
      return freeze({
        ...slot,
        ...digest,
        imagePath: slot.command.executablePath,
        imageSha256: image.sha256,
      });
    });
    let disposed = false,
      failed = false,
      analysis = null;
    const live = () => {
      check(!disposed && !failed && Date.now() < input.deadlineEpochMs);
      analysis?.checkControl();
    };
    const recheck = async (slot, signal) => {
      live();
      check(!signal.aborted);
      const fresh = await loadMixedNativeOwnerContext(
        input.root,
        input.manifestPath,
        input.manifestSha256,
        input.artifactLimits,
      );
      check(fresh.contextSha256 === context.contextSha256);
      live();
      check(!signal.aborted);
      if (slot.phase === 'ANALYSIS') {
        check(analysis);
        analysis.recheck();
        return analysis.digest;
      }
      return sourceContextDigest;
    };
    const prepare = async (slot, plan, signal, claim = true) => {
      try {
        live();
        check(!signal.aborted);
        const proof = origin(plan);
        check(proof.role === slot.role);
        const { stdinSha256, ...command } = proof.plan;
        check(staticPlan(command).staticCommandSha256 === slot.staticCommandSha256);
        const digest = await recheck(slot, signal);
        const final = origin(plan, claim);
        check(
          final.role === slot.role &&
            hashMixedNativeLaunch(final.plan) === hashMixedNativeLaunch(plan),
        );
        return digest;
      } catch (error) {
        failed = true;
        throw error;
      }
    };
    channel = createMixedNativeDynamicControlExchange(
      incoming,
      outgoing,
      context.contextSha256,
      input.controlLimits,
    );
    const session = createDynamicSession(
      slots,
      (m, s) => channel.exchange(m, s),
      prepare,
      recheck,
      live,
    );
    return Object.freeze({
      take(role) {
        try {
          live();
          return session.take(role);
        } catch (error) {
          failed = true;
          throw error;
        }
      },
      bindAnalysis(database, handle, limits, request) {
        try {
          live();
          check(
            analysis === null &&
              session.status().status === 'OFFLINE_IDLE' &&
              session.status().consumed === slots.filter((s) => s.phase === 'SOURCE').length,
          );
          // Actual Application authorizer, not an injected verifier or caller boolean.
          validateOperationPolicyData(request.policy);
          const fixedRequest = Object.freeze({
            policy: freeze(structuredClone(request.policy)),
            control: Object.freeze({ ...request.control }),
            workspaceId: input.workspaceId,
            repositoryId: input.repositoryId,
          });
          authorizeRuntimeWorkflow(fixedRequest, 'INDEX');
          const checkControl = () => {
            const reason = runtimeStopReason(fixedRequest.control);
            if (reason) throw Object.assign(Error(reason), { code: reason });
          };
          checkControl();
          const readset = readCapture(database, handle, limits);
          check(readset.data.view.targetSource.repositoryId === input.repositoryId);
          checkControl();
          analysis = {
            checkControl,
            digest: hash('codeatlas-mixed-native-analysis-context-v1\0' + readset.identity),
            recheck: () => {
              authorizeRuntimeWorkflow(fixedRequest, 'INDEX');
              checkControl();
              recheckActivationContext(database, handle, limits);
              checkControl();
            },
          };
          return analysis.digest;
        } catch (error) {
          failed = true;
          throw error;
        }
      },
      bootstrap() {
        return freeze({
          contextSha256: context.contextSha256,
          sourceContextDigest,
          deadlineEpochMs: input.deadlineEpochMs,
          hostEntryArtifact: entry,
          hostModules: input.hostModuleArtifactIds.map((id) => artifacts.get(id)),
          slots,
          ...flags,
        });
      },
      status() {
        const state = session.status();
        return Object.freeze({
          ...state,
          status: disposed
            ? 'CLOSED'
            : failed || channel.status().status !== 'OPEN'
              ? 'FAILED'
              : state.status,
          independentArtifactBytesVerified: true,
          ...flags,
        });
      },
      dispose() {
        disposed = true;
        failed = true;
        analysis = null;
        channel.dispose();
      },
    });
  } catch (error) {
    channel?.dispose();
    throw error?.code ? error : bad();
  }
}
function createDynamicSession(bindings, exchange, prepare, recheck, live) {
  try {
    const fixed = bindings;
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
          let commandSha256 = null,
            contextDigest = null,
            registered = false;
          const phase = binding.phase;
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
                check(!faulted && !disposed && state === 'NEW' && !signal.aborted);
                contextDigest = await prepare(binding, plan, signal);
                check(!faulted && !disposed && state === 'NEW' && !signal.aborted);
                commandSha256 = hashMixedNativeLaunch(plan);
                executablePath = plan.executablePath;
                const identity = { ...base, role, phase, contextDigest, commandSha256 };
                state = 'REGISTER';
                registered = true;
                const bound = await ask(
                  {
                    type: 'REGISTER',
                    ...identity,
                    staticCommandSha256: binding.staticCommandSha256,
                    stdinSha256: plan.stdinSha256,
                  },
                  signal,
                  ['type', 'launchId', 'role', 'phase', 'contextDigest', 'commandSha256'],
                );
                check(
                  !faulted &&
                    !disposed &&
                    state === 'REGISTER' &&
                    !signal.aborted &&
                    bound.type === 'BOUND' &&
                    bound.launchId === binding.launchId &&
                    bound.role === role &&
                    bound.phase === phase &&
                    bound.contextDigest === contextDigest &&
                    bound.commandSha256 === commandSha256,
                );
                check((await prepare(binding, plan, signal, false)) === contextDigest);
                state = 'INTENT';
                const ready = await ask({ type: 'INTENT', ...identity }, signal, [
                  'type',
                  'launchId',
                  'role',
                  'phase',
                  'contextDigest',
                  'commandSha256',
                ]);
                check(
                  !faulted &&
                    !disposed &&
                    state === 'INTENT' &&
                    !signal.aborted &&
                    ready.type === 'READY' &&
                    ready.launchId === binding.launchId &&
                    ready.role === role &&
                    ready.phase === phase &&
                    ready.contextDigest === contextDigest &&
                    ready.commandSha256 === commandSha256,
                );
                check((await prepare(binding, plan, signal, false)) === contextDigest);
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
                check((await recheck(binding, signal)) === contextDigest);
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
                check((await recheck(binding, signal)) === contextDigest);
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
                let startedLive = true;
                try {
                  live();
                } catch {
                  startedLive = false;
                }
                // Finish honest cleanup exchange even if the coordinator deadline has expired.
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
                check(startedLive);
                live();
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
                if (state !== 'SETTLED' && !released && registered) {
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
