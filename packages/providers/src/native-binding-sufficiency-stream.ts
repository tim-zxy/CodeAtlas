import type {
  BindingAwareCodeSyntaxRequest,
  BindingAwareSyntaxObservation,
} from './native-binding-sufficiency-contract.js';
import type { ValidatedCodeSyntaxObservation as SharedObservation } from './native-observation-codec.js';
type SharedEvent = SharedObservation['events'][number];
type V7Event<E = SharedEvent> = E extends { type: 'SYNTAX_OBSERVATION' }
  ? Omit<E, 'protocolVersion' | 'payload'> & {
      protocolVersion: 7;
      payload: BindingAwareSyntaxObservation;
    }
  : E extends object
    ? Omit<E, 'protocolVersion'> & { protocolVersion: 7 }
    : never;
export type ValidatedBindingAwareObservation = Omit<SharedObservation, 'request' | 'events'> & {
  readonly request: BindingAwareCodeSyntaxRequest;
  readonly events: readonly V7Event[];
};
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
export function readBindingAwareSyntaxRequestSnapshotWithBudget(
  bytes: Uint8Array,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  const result = readObservationRequest(bytes, composition, 7);
  return result as Omit<typeof result, 'request'> & {
    readonly request: BindingAwareCodeSyntaxRequest;
  };
}
export function validateBindingAwareSyntaxObservationStreamWithBudget(
  request: Uint8Array,
  output: Uint8Array,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  const result = validateCodeSyntaxObservationStreamCore(request, output, composition, 7);
  return result as {
    readonly observation: ValidatedBindingAwareObservation;
    readonly outputIdentity: string;
  };
}
export default async function consumeBindingAwareSyntaxObservation(
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
  return (await consumeCodeSyntaxCore(
    request,
    readable,
    signal,
    undefined,
    bounded,
    composition,
    7,
  )) as ValidatedBindingAwareObservation;
}
