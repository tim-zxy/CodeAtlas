import { matchContractsV2, type DeclaredContractControl } from '@codeatlas/contracts';
import { stitchWorkspaceExecutionV3 } from '@codeatlas/execution';
import type { FrozenContractSetV2 } from '@codeatlas/ir';
import type { WorkspaceRuntimeBatchV2 } from './refresh-workspace-runtime.js';
import { stitchWorkspaceExecutionV2 } from '@codeatlas/execution';
import {
  type FrozenContractSet,
  type RepositoryRuntimeBinding,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { matchContracts } from '@codeatlas/contracts';
import { stitchWorkspaceExecution, type FormalGraphCandidate } from '@codeatlas/execution';
import { type WorkspaceRuntimeBatch } from './refresh-workspace-runtime.js';
export interface WorkspacePreparationInputs {
  expectedOldActivationId: string | null;
  frozen: FrozenContractSet;
  graphs: {
    repositoryBinding: RepositoryRuntimeBinding;
    candidate: Pick<FormalGraphCandidate, 'facts' | 'bindings' | 'coverage' | 'termination'>;
  }[];
}
/** Domain composition only; Store authenticates currentness before and during publication. */
export function deriveWorkspaceRuntime(
  input: WorkspacePreparationInputs,
  control: RuntimeRequestControl,
): WorkspaceRuntimeBatch {
  return derive(input, control);
}
export function deriveWorkspaceRuntimeV2(
  input: WorkspacePreparationInputs,
  control: RuntimeRequestControl,
): WorkspaceRuntimeBatch {
  return derive(input, control, true);
}
function derive(
  input: WorkspacePreparationInputs,
  control: RuntimeRequestControl,
  surface = false,
): WorkspaceRuntimeBatch {
  const matched = matchContracts(input.frozen, control);
  const stitched = (surface ? stitchWorkspaceExecutionV2 : stitchWorkspaceExecution)(
    { frozenBindings: input.frozen, graphs: input.graphs, matches: matched.matches },
    control,
  );
  // Stitch uses canonical repository order; the existing input digest is set-order independent.
  const frozen = {
    ...input.frozen,
    repositoryBindings: stitched.execution.payload.repositoryBindings,
  };
  return {
    expectedOldActivationId: input.expectedOldActivationId,
    frozen,
    matches: stitched.matches,
    execution: stitched.execution,
  };
}

export type WorkspacePreparationInputsV2 = Omit<WorkspacePreparationInputs, 'frozen'> & {
  frozen: FrozenContractSetV2;
};
export function deriveWorkspaceRuntimeV3(
  input: WorkspacePreparationInputsV2,
  control: DeclaredContractControl,
): WorkspaceRuntimeBatchV2 {
  const matched = matchContractsV2(input.frozen, control);
  const stitched = stitchWorkspaceExecutionV3(
    { frozenBindings: input.frozen, graphs: input.graphs, matches: matched.matches },
    {
      ...control,
      maxItems: control.maxItems - matched.consumed.items,
      maxInputBytes: control.maxInputBytes - matched.consumed.inputBytes,
    },
  );
  return {
    expectedOldActivationId: input.expectedOldActivationId,
    frozen: { ...input.frozen, repositoryBindings: stitched.execution.payload.repositoryBindings },
    matches: stitched.matches,
    execution: stitched.execution,
  };
}
