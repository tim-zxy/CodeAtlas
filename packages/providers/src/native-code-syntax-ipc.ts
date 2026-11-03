import { validateCodeSyntaxObservationStreamCore } from './native-observation-codec.js';
import type { ValidatedCodeSyntaxObservation as SharedObservation } from './native-observation-codec.js';
import type { CodeSyntaxRequest } from './native-code-syntax-request.js';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
import { NativeSyntaxObservationSchema } from './native-syntax-ipc.js';
import type { z } from 'zod';
type NativeSyntaxObservation = z.infer<typeof NativeSyntaxObservationSchema>;
export type ValidatedCodeSyntaxObservation = Omit<SharedObservation, 'request' | 'events'> & {
  readonly request: CodeSyntaxRequest;
  readonly events: readonly LegacyEvent[];
};
type SharedEvent = SharedObservation['events'][number];
type LegacyEvent = SharedEvent extends infer E
  ? E extends { type: 'SYNTAX_OBSERVATION' }
    ? Omit<E, 'protocolVersion' | 'payload'> & {
        protocolVersion: 5;
        payload: NativeSyntaxObservation;
      }
    : E extends object
      ? Omit<E, 'protocolVersion'> & { protocolVersion: 5 }
      : never
  : never;
export function validateCodeSyntaxObservationStream(
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
): ValidatedCodeSyntaxObservation {
  return validateCodeSyntaxObservationStreamCore(requestBytes, outputBytes, null)
    .observation as ValidatedCodeSyntaxObservation;
}
export function validateCodeSyntaxObservationStreamWithBudget(
  requestBytes: Uint8Array,
  outputBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): { readonly observation: ValidatedCodeSyntaxObservation; readonly outputIdentity: string } {
  const result = validateCodeSyntaxObservationStreamCore(requestBytes, outputBytes, context);
  return {
    observation: result.observation as ValidatedCodeSyntaxObservation,
    outputIdentity: result.outputIdentity!,
  };
}
