import { validateNativeStateCandidate } from '../../providers/dist/index.js';
import type { NativeStateValidationPort } from '../../storage/dist/index.js';
import { assertNativeMetadataAdmission } from './native-metadata-admission.js';

export function createNativeStateValidationPort(): NativeStateValidationPort {
  return (input) => {
    assertNativeMetadataAdmission(input.memoryBudgetBytes);
    return validateNativeStateCandidate(input);
  };
}
