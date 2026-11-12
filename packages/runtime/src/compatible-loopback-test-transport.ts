// Private P1-11 mock HTTP transport, not production model access or an authority.
import assert from 'node:assert/strict';
import { request, type IncomingMessage } from 'node:http';
import { types } from 'node:util';
import type { RuntimeWorkflowRequest } from '@codeatlas/application';

const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
type Control = RuntimeWorkflowRequest['control'];
type Options = { endpoint: string; maxRequestBytes: number; maxResponseBytes: number };
/** Explicit literal IPv4 loopback only: no DNS, TLS, credential, proxy, redirect,
 * retry, decompression, remote fallback or production registration. The host owns
 * its synthetic server. Client stream/socket closure is joined before settlement. */
export function createCompatibleLoopbackTestTransport(options: Options) {
  assert(options && typeof options === 'object' && !types.isProxy(options));
  assert([Object.prototype, null].includes(Object.getPrototypeOf(options)));
  for (const key of Reflect.ownKeys(options)) {
    assert(typeof key === 'string');
    const descriptor = Object.getOwnPropertyDescriptor(options, key)!;
    assert(descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }
  assert.deepEqual(Object.keys(options).sort(), [
    'endpoint',
    'maxRequestBytes',
    'maxResponseBytes',
  ]);
  const { endpoint, maxRequestBytes, maxResponseBytes } = options;
  for (const value of [maxRequestBytes, maxResponseBytes])
    assert(Number.isSafeInteger(value) && value > 0, 'INVALID_LOOPBACK_TEST_LIMIT');
  assert(typeof endpoint === 'string', 'INVALID_LOOPBACK_TEST_ENDPOINT');
  const url = new URL(endpoint);
  assert(
    endpoint === url.href &&
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port !== '' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === '/v1/chat/completions',
    'INVALID_LOOPBACK_TEST_ENDPOINT',
  );
  return (body: string, control: Control): Promise<{ status: number; body: string }> => {
    assert(typeof body === 'string' && body.isWellFormed(), 'INVALID_LOOPBACK_TEST_BODY');
    const bytes = Buffer.from(body, 'utf8');
    assert(bytes.length <= maxRequestBytes, 'COMPATIBLE_REQUEST_TOO_LARGE');
    const signal = control.signal;
    nativeAborted.call(signal); // Brand-check before any client resources exist.
    const remaining = control.deadlineEpochMs - Date.now();
    assert(
      Number.isSafeInteger(remaining) && remaining > 0 && remaining <= 2147483647,
      'INVALID_LOOPBACK_TEST_DEADLINE',
    );
    return new Promise((resolve, reject) => {
      let response: IncomingMessage | undefined;
      let requestClosed = false,
        responseClosed = true,
        socketClosed = true;
      let failure: Error | undefined, result: { status: number; body: string } | undefined;
      const chunks: Buffer[] = [];
      let count = 0;
      const finish = () => {
        if (!requestClosed || !responseClosed || !socketClosed) return;
        clearTimeout(timer);
        nativeRemove.call(signal, 'abort', abort);
        if (failure) reject(failure);
        else if (result) resolve(result);
        else reject(Error('COMPATIBLE_LOOPBACK_TRANSPORT_FAILED'));
      };
      const stop = (code = 'COMPATIBLE_LOOPBACK_TRANSPORT_FAILED') => {
        failure ??= Object.assign(Error(code), { code });
        response?.destroy();
        client.destroy();
      };
      const abort = () => stop('CANCELLED');
      const client = request(url, {
        method: 'POST',
        agent: false,
        headers: {
          'content-type': 'application/json',
          'content-length': bytes.length,
          connection: 'close',
        },
      });
      client.on('socket', (socket) => {
        socketClosed = false;
        socket.once('close', () => {
          socketClosed = true;
          finish();
        });
      });
      client.on('error', () => stop());
      client.once('close', () => {
        requestClosed = true;
        finish();
      });
      client.once('response', (incoming) => {
        response = incoming;
        responseClosed = false;
        incoming.on('error', () => stop());
        incoming.once('aborted', () => stop());
        incoming.once('close', () => {
          responseClosed = true;
          finish();
        });
        if (
          incoming.statusCode !== 200 ||
          (incoming.headers['content-encoding'] !== undefined &&
            incoming.headers['content-encoding'] !== 'identity')
        ) {
          stop();
          return;
        }
        incoming.on('data', (chunk: Buffer) => {
          count += chunk.length;
          if (count > maxResponseBytes) {
            stop('COMPATIBLE_RESPONSE_TOO_LARGE');
            return;
          }
          chunks.push(chunk);
        });
        incoming.once('end', () => {
          if (failure) return;
          try {
            assert(incoming.complete);
            result = {
              status: 200,
              body: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, count)),
            };
          } catch {
            stop();
          }
        });
      });
      const timer = setTimeout(() => stop('DEADLINE'), remaining);
      try {
        nativeAdd.call(signal, 'abort', abort, { once: true });
        if (nativeAborted.call(signal)) abort();
        else client.end(bytes);
      } catch {
        // Never abandon acquired request/socket work on synchronous setup failure.
        stop();
      }
    });
  };
}
