import {
  decodeNativeRefreshV3,
  type NativeClientLimits,
  type NativeRefreshEventV3,
  type NativeRefreshTerminalV3,
} from '../../providers/dist/index.js';
import { assertNativeRefreshVerificationAdmission } from './native-metadata-admission.js';

export type NativeRefreshVerificationInput = {
  requestBytes: Uint8Array;
  lines: AsyncIterable<Uint8Array>;
  sink: { accept(event: NativeRefreshEventV3): Promise<void> };
  limits: NativeClientLimits;
};

/** Private observation verifier only: no Native spawn, Store seal or graph activation. */
export async function verifyNativeRefreshObservation(
  memoryBudgetBytes: number,
  openObservation: () => NativeRefreshVerificationInput,
): Promise<{ terminal: Extract<NativeRefreshTerminalV3, { type: 'REFRESH_COMPLETED' }> }> {
  assertNativeRefreshVerificationAdmission(memoryBudgetBytes);
  const input = openObservation();
  return decodeNativeRefreshV3(
    input.requestBytes,
    input.lines,
    input.sink,
    input.limits,
    memoryBudgetBytes,
  );
}
