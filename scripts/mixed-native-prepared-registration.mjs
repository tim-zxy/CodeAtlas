// Offline dynamic preparation only. These receipts cannot authorize an observer or process.
import { types } from 'node:util';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
import nativeOwner from '../packages/providers/dist/native-client.js';
import gitOwner from '../packages/source/dist/git.js';
import { hashMixedNativeLaunch } from './mixed-native-launch-handshake.mjs';
const code = 'INVALID_MIXED_NATIVE_PREPARED_REGISTRATION';
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
const sha = (s) => typeof s === 'string' && s.length === 64 && /^[a-f0-9]{64}$/.test(s);
const id = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]+$/.test(s);
const freeze = (v) => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
};
const closedFlags = Object.freeze({
  registrationAuthority: false,
  contextAuthenticated: false,
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
  liveTransportConnected: false,
});
const staticHash = (command) => hashMixedNativeLaunch({ ...command, stdinSha256: '0'.repeat(64) });
function origin(plan, claim = false) {
  for (const owner of [nativeOwner, gitOwner]) {
    const read = owner === nativeOwner ? 'readOwnedNativeLaunchPlan' : 'readOwnedGitLaunchPlan';
    let proof;
    try {
      proof = owner[read](plan);
    } catch {
      continue;
    }
    check(proof.plan === plan && ['GIT', 'V2', 'V5'].includes(proof.role));
    if (claim) {
      const claimed =
        owner[owner === nativeOwner ? 'claimOwnedNativeLaunchPlan' : 'claimOwnedGitLaunchPlan'](
          plan,
        );
      check(claimed.plan === plan && claimed.role === proof.role);
    }
    return proof;
  }
  throw bad();
}
export function createMixedNativePreparedRegistration(value) {
  try {
    validateOperationPolicyData(value);
    exact(value, ['contextSha256', 'slots']);
    check(sha(value.contextSha256) && Array.isArray(value.slots));
    const input = structuredClone(value),
      ids = new Set();
    const slots = input.slots.map((slot) => {
      exact(slot, ['launchId', 'role', 'imageSha256', 'command']);
      check(
        id(slot.launchId) &&
          !ids.has(slot.launchId) &&
          ['GIT', 'V2', 'V5'].includes(slot.role) &&
          sha(slot.imageSha256),
      );
      ids.add(slot.launchId);
      exact(slot.command, ['executablePath', 'arguments', 'environment', 'cwd']);
      const command = freeze(slot.command),
        staticCommandSha256 = staticHash(command);
      return freeze({
        launchId: slot.launchId,
        role: slot.role,
        imageSha256: slot.imageSha256,
        command,
        staticCommandSha256,
      });
    });
    const tickets = new WeakMap();
    let next = 0,
      pending = null,
      failed = false;
    const poison = () => {
      failed = true;
      if (pending) tickets.delete(pending);
      pending = null;
      return bad();
    };
    return Object.freeze({
      prepare(plan) {
        try {
          check(!failed && pending === null && next < slots.length);
          const proof = origin(plan),
            slot = slots[next];
          check(proof.role === slot.role);
          const { stdinSha256, ...command } = proof.plan;
          check(sha(stdinSha256) && staticHash(command) === slot.staticCommandSha256);
          const binding = Object.freeze({
            launchId: slot.launchId,
            role: slot.role,
            commandSha256: hashMixedNativeLaunch(proof.plan),
            imageSha256: slot.imageSha256,
          });
          const ticket = Object.freeze(Object.create(null));
          tickets.set(ticket, { plan: proof.plan, binding, index: next });
          pending = ticket;
          return ticket;
        } catch {
          throw poison();
        }
      },
      consume(ticket) {
        try {
          check(
            !failed &&
              ticket !== null &&
              typeof ticket === 'object' &&
              !types.isProxy(ticket) &&
              pending === ticket,
          );
          const entry = tickets.get(ticket);
          check(entry && entry.index === next);
          const proof = origin(entry.plan);
          check(
            proof.role === entry.binding.role &&
              hashMixedNativeLaunch(proof.plan) === entry.binding.commandSha256,
          );
          // Claim at the original owner, not just in this registry: no cross-registry replay.
          origin(entry.plan, true);
          tickets.delete(ticket);
          pending = null;
          next++;
          return freeze({
            kind: 'OFFLINE_PREPARED_BINDING',
            contextSha256: input.contextSha256,
            binding: entry.binding,
            ...closedFlags,
          });
        } catch {
          throw poison();
        }
      },
      status() {
        return Object.freeze({
          status: failed ? 'FAILED' : pending ? 'PREPARED' : 'OFFLINE_IDLE',
          consumed: next,
          remaining: slots.length - next,
          contextSha256: input.contextSha256,
          ...closedFlags,
        });
      },
    });
  } catch {
    throw bad();
  }
}
