// Owns only supplied control stream consumption. No process creation or child pipes.
import { Readable, Writable } from 'node:stream';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
import { createMixedNativeDynamicControlCodec } from './mixed-native-dynamic-control-codec.mjs';
const code = 'MIXED_NATIVE_CONTROL_FAILED';
const bad = () => Object.assign(Error(code), { code });
const check = (v) => {
  if (!v) throw bad();
};
export function createMixedNativeControlExchange(incoming, outgoing, context, limits) {
  return createExchange(incoming, outgoing, context, limits, false);
}
export function createMixedNativeDynamicControlExchange(incoming, outgoing, context, limits) {
  return createExchange(incoming, outgoing, context, limits, true);
}
function createExchange(incoming, outgoing, context, limits, dynamic) {
  try {
    check(
      incoming instanceof Readable &&
        outgoing instanceof Writable &&
        incoming !== outgoing &&
        !incoming.destroyed &&
        !outgoing.destroyed &&
        !incoming.readableEnded &&
        !outgoing.writableEnded &&
        incoming.listenerCount('data') === 0 &&
        incoming.listenerCount('readable') === 0 &&
        incoming.readableFlowing !== true &&
        incoming.readableLength === 0,
    );
    const codec = (dynamic ? createMixedNativeDynamicControlCodec : createMixedNativeControlCodec)(
      context,
      limits,
    );
    let failed = false,
      disposed = false,
      pending = null,
      bound = null,
      ready = null,
      acquired = null,
      early = null;
    const fail = () => {
      if (failed) return;
      failed = true;
      codec.stop();
      bound = null;
      ready = null;
      acquired = null;
      early = null;
      incoming.removeListener('data', data);
      incoming.removeListener('end', end);
      incoming.pause();
      outgoing.removeListener('drain', drain);
      if (pending) {
        const p = pending;
        pending = null;
        p.signal.removeEventListener('abort', p.abort);
        p.reject(bad());
      }
    };
    const matches = (reply, m) => {
      const expected = {
        ...(dynamic ? { REGISTER: 'BOUND' } : {}),
        INTENT: 'READY',
        SPAWNED: 'ACQUIRED',
        CLOSED: 'RELEASED',
        ABANDON: 'ABANDONED',
      }[m.type];
      check(reply.type === expected && reply.launchId === m.launchId);
      if (m.type === 'INTENT' || m.type === 'REGISTER') {
        check(reply.role === m.role && reply.commandSha256 === m.commandSha256);
        if (dynamic) check(reply.phase === m.phase && reply.contextDigest === m.contextDigest);
      }
      if (m.type === 'SPAWNED') check(reply.pid === m.pid && ready && reply.role === ready.role);
      if (m.type === 'CLOSED')
        check(
          acquired &&
            reply.pid === m.pid &&
            reply.creationIdentity === m.creationIdentity &&
            reply.imageSha256 === acquired.imageSha256,
        );
    };
    const settle = () => {
      const p = pending;
      if (!p || !p.reply || !p.returned || !p.callback || !p.drained) return;
      pending = null;
      p.signal.removeEventListener('abort', p.abort);
      if (p.message.type === 'REGISTER') bound = p.reply;
      if (p.message.type === 'SPAWNED') acquired = p.reply;
      if (p.message.type === 'CLOSED' || p.message.type === 'ABANDON') {
        bound = null;
        ready = null;
        acquired = null;
        early = null;
      }
      p.resolve(p.reply);
    };
    const accept = (reply) => {
      if (pending && !pending.reply) {
        matches(reply, pending.message);
        pending.reply = reply;
        if (reply.type === 'READY') ready = reply;
        settle();
        return;
      }
      check(
        reply.type === 'ACQUIRED' &&
          ready &&
          reply.launchId === ready.launchId &&
          reply.role === ready.role &&
          !early &&
          !acquired &&
          (!pending || pending.message.type === 'INTENT'),
      );
      early = reply;
    };
    function data(bytes) {
      if (failed) return;
      try {
        for (const reply of codec.push(bytes)) accept(reply);
      } catch {
        fail();
      }
    }
    function end() {
      if (failed) return;
      try {
        codec.finish();
      } catch {}
      fail();
    }
    function drain() {
      if (pending) {
        pending.drained = true;
        settle();
      }
    }
    const inputError = () => fail(),
      outputError = () => fail();
    incoming.on('data', data);
    incoming.on('end', end);
    outgoing.on('drain', drain);
    incoming.on('error', inputError);
    outgoing.on('error', outputError);
    incoming.once('close', () => {
      fail();
      incoming.removeListener('error', inputError);
    });
    outgoing.once('close', () => {
      fail();
      outgoing.removeListener('error', outputError);
    });
    return Object.freeze({
      exchange(message, signal) {
        return new Promise((resolve, reject) => {
          try {
            check(!failed && !disposed && !pending);
            Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(signal);
            check(!signal.aborted);
            const bytes = codec.encode(message),
              m = Object.freeze({ ...message });
            check(
              Object.hasOwn(
                {
                  ...(dynamic ? { REGISTER: 1 } : {}),
                  INTENT: 1,
                  SPAWNED: 1,
                  CLOSED: 1,
                  ABANDON: 1,
                },
                m.type,
              ),
            );
            if (m.type === 'REGISTER') check(dynamic && !bound && !ready && !acquired && !early);
            if (dynamic && m.type === 'INTENT')
              check(
                bound &&
                  bound.launchId === m.launchId &&
                  bound.role === m.role &&
                  bound.phase === m.phase &&
                  bound.contextDigest === m.contextDigest &&
                  bound.commandSha256 === m.commandSha256,
              );
            if (m.type === 'INTENT') check(!ready && !acquired && !early);
            if (m.type === 'SPAWNED') check(ready && ready.launchId === m.launchId && !acquired);
            if (m.type === 'CLOSED')
              check(
                acquired &&
                  m.pid === acquired.pid &&
                  m.creationIdentity === acquired.creationIdentity,
              );
            if (m.type === 'ABANDON') check(!ready || ready.launchId === m.launchId);
            const p = {
              message: m,
              signal,
              resolve,
              reject,
              returned: false,
              callback: false,
              drained: false,
              reply: null,
              abort: () => fail(),
            };
            pending = p;
            signal.addEventListener('abort', p.abort, { once: true });
            if (signal.aborted) {
              fail();
              return;
            }
            if (m.type === 'SPAWNED' && early) {
              matches(early, m);
              p.reply = early;
              early = null;
            }
            const accepted = outgoing.write(bytes, (error) => {
              if (error) {
                fail();
                return;
              }
              if (pending === p) {
                p.callback = true;
                settle();
              }
            });
            p.returned = true;
            if (accepted) p.drained = true;
            settle();
          } catch {
            fail();
            reject(bad());
          }
        });
      },
      dispose() {
        disposed = true;
        fail();
      },
      status() {
        return Object.freeze({
          status: disposed ? 'CLOSED' : failed ? 'FAILED' : 'OPEN',
          measurementEligible: false,
          executionAuthorized: false,
          productionAdmission: false,
        });
      },
    });
  } catch {
    throw bad();
  }
}
