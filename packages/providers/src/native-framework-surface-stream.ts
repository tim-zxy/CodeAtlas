import type {
  FrameworkSurfaceRequest,
  FrameworkSurfaceObservation,
} from './native-framework-surface-contract.js';
import type { ValidatedCodeSyntaxObservation as SharedObservation } from './native-observation-codec.js';
type SharedEvent = SharedObservation['events'][number];
type V8Event<E = SharedEvent> = E extends { type: 'SYNTAX_OBSERVATION' }
  ? Omit<E, 'protocolVersion' | 'payload'> & {
      protocolVersion: 8;
      payload: FrameworkSurfaceObservation;
    }
  : E extends object
    ? Omit<E, 'protocolVersion'> & { protocolVersion: 8 }
    : never;
export type ValidatedFrameworkSurfaceObservation = Omit<SharedObservation, 'request' | 'events'> & {
  readonly request: FrameworkSurfaceRequest;
  readonly events: readonly V8Event[];
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
export function readFrameworkSurfaceRequestSnapshotWithBudget(
  bytes: Uint8Array,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  const result = readObservationRequest(bytes, composition, 8);
  return result as Omit<typeof result, 'request'> & {
    readonly request: FrameworkSurfaceRequest;
  };
}
export function validateFrameworkSurfaceStreamWithBudget(
  request: Uint8Array,
  output: Uint8Array,
  composition: CodeSyntaxCompositionBudget,
) {
  requireLedger(composition);
  const result = validateCodeSyntaxObservationStreamCore(request, output, composition, 8);
  return result as {
    readonly observation: ValidatedFrameworkSurfaceObservation;
    readonly outputIdentity: string;
  };
}
export default async function consumeFrameworkSurfaceObservation(
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
    8,
  )) as ValidatedFrameworkSurfaceObservation;
}
