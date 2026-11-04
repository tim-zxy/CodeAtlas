import { remainingCompositionLimits } from './native-code-syntax-budget.js';
import { NativeSyntaxContractError } from './native-syntax-ipc.js';
import { NATIVE_CLIENT_HARD_LIMITS } from './native-client.js';
import { ensurePhase1Data } from '@codeatlas/ir';
import readObservationRequest from './native-code-syntax-request.js';
import consumeCodeSyntaxCore from './native-code-syntax-stream.js';
import { validateCodeSyntaxObservationStreamCore } from './native-observation-codec.js';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
import type { Readable } from 'node:stream';
import type { NativeClientLimits } from './native-client.js';
function requireLedger(composition: CodeSyntaxCompositionBudget): void {
  try {
    remainingCompositionLimits(composition);
  } catch (error) {
    throw new NativeSyntaxContractError(
      error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'RESOURCE_LIMIT_EXCEEDED'
        ? 'RESOURCE_LIMIT_EXCEEDED'
        : 'INVALID_REQUEST',
    );
  }
}
export function readBindingSyntaxRequestSnapshotWithBudget(
  bytes: Uint8Array,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  return readObservationRequest(bytes, composition, true);
}
export function validateBindingSyntaxObservationStreamWithBudget(
  request: Uint8Array,
  output: Uint8Array,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  const result = validateCodeSyntaxObservationStreamCore(request, output, composition, true);
  return result as typeof result & { readonly outputIdentity: string };
}
export default async function consumeBindingSyntaxObservation(
  request: Uint8Array,
  readable: Readable,
  signal: AbortSignal,
  limits: NativeClientLimits | undefined,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  const selected = limits ?? NATIVE_CLIENT_HARD_LIMITS;
  ensurePhase1Data(selected);
  if (
    Object.keys(selected).sort().join(',') !==
      Object.keys(NATIVE_CLIENT_HARD_LIMITS).sort().join(',') ||
    !Object.values(selected).every((v) => Number.isSafeInteger(v) && v > 0)
  )
    throw new NativeSyntaxContractError('INVALID_REQUEST');
  const bounded = Object.fromEntries(
    Object.entries(NATIVE_CLIENT_HARD_LIMITS).map(([key, max]) => [
      key,
      Math.min(max, selected[key as keyof NativeClientLimits]),
    ]),
  ) as unknown as NativeClientLimits;
  return consumeCodeSyntaxCore(request, readable, signal, undefined, bounded, composition);
}
