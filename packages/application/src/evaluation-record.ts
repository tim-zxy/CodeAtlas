import { type RuntimeRequestControl } from '@codeatlas/ir';
import {
  deriveOfflineEvaluationRecord,
  type OfflineEvaluationRecord,
} from '../../ir/dist/evaluation-record-contract.js';
/** Private self-owned structural evaluation; no caller-supplied PASS or quality admission. */
export function evaluateCandidateRecord(
  input: unknown,
  control: RuntimeRequestControl,
): OfflineEvaluationRecord {
  return deriveOfflineEvaluationRecord(input, control);
}
