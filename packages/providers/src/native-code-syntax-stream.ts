import readObservationRequest from './native-code-syntax-request.js';
import { validateCodeSyntaxObservationStreamCore } from './native-observation-codec.js';
import { spendCodeSyntaxBudget } from './native-code-syntax-budget.js';
import { copyCodeSyntaxBytesWithBudget } from './native-code-syntax-request.js';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
import type { Readable } from 'node:stream';
import {
  readCodeSyntaxRequestSnapshot,
  copyCodeSyntaxBytes,
} from './native-code-syntax-request.js';
import {
  validateCodeSyntaxObservationStream,
  type ValidatedCodeSyntaxObservation,
} from './native-code-syntax-ipc.js';
import { NativeSyntaxContractError } from './native-syntax-ipc.js';
import { NativeClientError, NATIVE_CLIENT_HARD_LIMITS } from './native-client.js';
function corrupt(): never {
  throw new NativeSyntaxContractError('PROTOCOL_CORRUPTION');
}
function exceeded(): never {
  throw new NativeSyntaxContractError('RESOURCE_LIMIT_EXCEEDED');
}
function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new NativeSyntaxContractError('CANCELLED');
}
/** Owns this Readable consumption only;never child-process or production-admission authority. */
export default async function consumeCodeSyntaxCore(
  requestBytes: Uint8Array,
  stdout: Readable,
  signal: AbortSignal,
  captureBytes?: (bytes: Buffer) => void,
  limits: import('./native-client.js').NativeClientLimits = NATIVE_CLIENT_HARD_LIMITS,
  composition?: CodeSyntaxCompositionBudget,
  mode: boolean | 7 | 8 = true,
) {
  const snapshot = composition
    ? readObservationRequest(requestBytes, composition, mode)
    : readCodeSyntaxRequestSnapshot(requestBytes);
  cancelled(signal);
  const b = snapshot.request.payload.resourceBudget;
  // Bounded raw storage,not a constant-memory or measured HOST reservation claim.
  const capacity = Math.min(b.maxOutputBytes, limits.maxStdoutBytes);
  if (composition) spendCodeSyntaxBudget(composition, 'serializedBytes', capacity);
  const raw = Buffer.alloc(capacity);
  const maxEvents = Math.min(b.maxEvents, limits.maxEvents);
  let offset = 0,
    lineBytes = 0,
    events = 0;
  const abort = () => {
    if (!stdout.destroyed) stdout.destroy(new NativeSyntaxContractError('CANCELLED'));
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    cancelled(signal);
    for await (const chunk of stdout) {
      cancelled(signal);
      const bytes = composition
        ? copyCodeSyntaxBytesWithBudget(
            chunk as Uint8Array,
            raw.length - offset,
            'PROTOCOL_CORRUPTION',
            composition,
          )
        : copyCodeSyntaxBytes(chunk as Uint8Array, raw.length - offset, 'PROTOCOL_CORRUPTION');
      for (const byte of bytes) {
        lineBytes++;
        if (lineBytes > limits.maxLineBytes) exceeded();
        if (byte === 13) corrupt();
        if (byte === 10) {
          if (++events > maxEvents) exceeded();
          lineBytes = 0;
        }
      }
      raw.set(bytes, offset);
      offset += bytes.length;
    }
    cancelled(signal);
    if (lineBytes !== 0) corrupt();
    const result = composition
      ? validateCodeSyntaxObservationStreamCore(
          snapshot.bytes,
          raw.subarray(0, offset),
          composition,
          mode,
        ).observation
      : validateCodeSyntaxObservationStream(snapshot.bytes, raw.subarray(0, offset));
    cancelled(signal);
    captureBytes?.(raw.subarray(0, offset));
    return result;
  } catch (error) {
    cancelled(signal);
    if (error instanceof NativeSyntaxContractError) throw error;
    throw new NativeClientError('PROCESS_FAILED', 'Code/Syntax stream could not be read', {
      requestId: snapshot.request.requestId,
    });
  } finally {
    signal.removeEventListener('abort', abort);
    if (!stdout.readableEnded && !stdout.destroyed) stdout.destroy();
  }
}

/** Original API: retains its exact validated-result shape. */
export function consumeCodeSyntaxObservationStream(
  requestBytes: Uint8Array,
  stdout: Readable,
  signal: AbortSignal,
) {
  return consumeCodeSyntaxCore(
    requestBytes,
    stdout,
    signal,
  ) as Promise<ValidatedCodeSyntaxObservation>;
}
/** Private owned raw view. Its backing allocation is retained and must be accounted for by its owner. */
export async function consumeCodeSyntaxObservationBytes(
  requestBytes: Uint8Array,
  stdout: Readable,
  signal: AbortSignal,
  limits: import('./native-client.js').NativeClientLimits = NATIVE_CLIENT_HARD_LIMITS,
) {
  let outputBytes: Buffer | undefined;
  const observation = await consumeCodeSyntaxCore(
    requestBytes,
    stdout,
    signal,
    (bytes) => {
      outputBytes = bytes;
    },
    limits,
  );
  return { observation: observation as ValidatedCodeSyntaxObservation, outputBytes: outputBytes! };
}
