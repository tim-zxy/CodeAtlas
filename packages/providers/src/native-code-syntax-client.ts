import { types } from 'node:util';
import nativeOwner, { NativeClientError, type NativeClientOptions } from './native-client.js';
type OwnedNativeLifecycle = NonNullable<
  Parameters<(typeof nativeOwner)['runOwnedNativeProcess']>[5]
>;
import { readCodeSyntaxRequestSnapshot } from './native-code-syntax-request.js';
import { consumeCodeSyntaxObservationBytes } from './native-code-syntax-stream.js';
function invalid(): never {
  throw new NativeClientError(
    'INVALID_CONFIGURATION',
    'Invalid private Native lifecycle configuration',
  );
}
function plain(
  value: unknown,
  keys: readonly string[],
  required: boolean,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((k) => typeof k !== 'string' || !keys.includes(k)))
    invalid();
  for (const d of Object.values(descriptors))
    if (!d.enumerable || !Object.hasOwn(d, 'value')) invalid();
  if (required && keys.some((k) => !Object.hasOwn(descriptors, k))) invalid();
  return value as Record<string, unknown>;
}
/** Trusted private transport only; no Runtime profile bypass or publication authority. */
export default async function observeOwnedCodeSyntax(
  requestBytes: Uint8Array,
  optionsValue: NativeClientOptions,
  lifecycleValue: OwnedNativeLifecycle | null,
) {
  const source = plain(
    optionsValue,
    ['executablePath', 'arguments', 'timeoutMs', 'signal', 'allowedEnvironment', 'limits'],
    false,
  );
  for (const key of ['allowedEnvironment', 'limits'])
    if (source[key] !== undefined) {
      const v = source[key];
      if (
        !v ||
        typeof v !== 'object' ||
        types.isProxy(v) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(v))
      )
        invalid();
      for (const k of Reflect.ownKeys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, k)!;
        if (typeof k !== 'string' || !d.enumerable || !Object.hasOwn(d, 'value')) invalid();
      }
    }
  if (source.arguments !== undefined) {
    const a = source.arguments;
    if (!Array.isArray(a) || types.isProxy(a) || Object.getPrototypeOf(a) !== Array.prototype)
      invalid();
    for (let i = 0; i < a.length; i++) {
      const d = Object.getOwnPropertyDescriptor(a, String(i));
      if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'string') invalid();
    }
    if (Reflect.ownKeys(a).length !== a.length + 1) invalid();
  }
  const lifecycle = nativeOwner.validateOwnedNativeLifecycle(lifecycleValue);
  const options = nativeOwner.validateOwnedNativeOptions(source as unknown as NativeClientOptions);
  if (options.signal?.aborted)
    throw new NativeClientError('CANCELLED', 'Native request was cancelled');
  if (types.isProxy(requestBytes) || !types.isUint8Array(requestBytes))
    throw new NativeClientError('INVALID_REQUEST', 'Invalid Native request bytes');
  const size = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    'byteLength',
  )!.get!.call(requestBytes) as number;
  if (size > options.limits.maxStdinBytes || size > options.limits.maxLineBytes)
    throw new NativeClientError('OUTPUT_LIMIT_EXCEEDED', 'Native request exceeds the byte limit');
  const snapshot = readCodeSyntaxRequestSnapshot(requestBytes);
  if (
    snapshot.bytes.length > options.limits.maxStdinBytes ||
    snapshot.bytes.length > options.limits.maxLineBytes
  )
    throw new NativeClientError('OUTPUT_LIMIT_EXCEEDED', 'Native request exceeds the byte limit');
  const timeout = nativeOwner.ownedNativeTimeout(snapshot.request, options.timeoutMs);
  if (timeout <= 0) throw new NativeClientError('TIMEOUT', 'Native request timed out');
  const result = await nativeOwner.runOwnedNativeProcess(
    snapshot.bytes,
    options,
    snapshot.request,
    timeout,
    (stdout, _request, limits, signal) =>
      consumeCodeSyntaxObservationBytes(snapshot.bytes, stdout, signal, limits),
    lifecycle,
  );
  return Object.freeze({
    observation: result.output.observation,
    requestBytes: snapshot.bytes,
    outputBytes: result.output.outputBytes,
    stderr: result.stderr,
  });
}
