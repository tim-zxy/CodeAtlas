import type { RuntimeRequestControl } from '@codeatlas/ir';
import { types } from 'node:util';
import { inspectDocumentSecretCandidate } from '../../documents/dist/secret-candidate.js';
import type { DocumentAccount } from '../../documents/dist/source-positions.js';
import {
  CompilationInputContractError,
  parseCompilationInputSnapshot,
} from './compilation-input-contract.js';

const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;

/** Private offline evaluation of exact typed captured values/support closure.
 * Schema/digest validity is not provenance or authorization. This does not read
 * original Source, own capture/permission handles, or permit consumption/writes.
 */
export function inspectCapturedCompilationValues(
  input: unknown,
  control: RuntimeRequestControl,
  account: DocumentAccount,
) {
  try {
    account.checkpoint();
    if (!control || types.isProxy(control))
      throw new CompilationInputContractError('INVALID_COMPILATION_INPUT');
    const fields = Object.getOwnPropertyDescriptors(control);
    const data = (key: keyof RuntimeRequestControl) => {
      const descriptor = fields[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value'))
        throw new CompilationInputContractError('INVALID_COMPILATION_INPUT');
      return descriptor.value;
    };
    const fixedControl = Object.freeze({
      signal: data('signal'),
      deadlineEpochMs: data('deadlineEpochMs'),
      maxItems: data('maxItems'),
      maxDepth: data('maxDepth'),
    }) as RuntimeRequestControl;
    account.own(input);
    const snapshot = parseCompilationInputSnapshot(input, fixedControl);
    const checkpoint = () => {
      account.checkpoint();
      if (aborted.call(fixedControl.signal)) throw new CompilationInputContractError('CANCELLED');
      if (Date.now() >= fixedControl.deadlineEpochMs)
        throw new CompilationInputContractError('DEADLINE');
    };
    account.own(snapshot);
    checkpoint();
    const scan = inspectDocumentSecretCandidate(Buffer.alloc(0), snapshot, {
      checkpoint,
      own: (value) => account.own(value),
      reserveBuffer: (size) => account.reserveBuffer(size),
      visitItem: () => account.visitItem(),
      invalidate: () => account.invalidate(),
    });
    checkpoint();
    return Object.freeze({
      inputKind: 'CAPTURED_VALUES_ONLY' as const,
      originalSource: 'NOT_INSPECTED' as const,
      scan,
    });
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
