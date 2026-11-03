import { FrozenContractSetV2Schema, type FrozenContractSetV2 } from '@codeatlas/ir';
import {
  FrozenContractSetSchema,
  Phase1CoverageSchema,
  ensurePhase1Data,
  runtimeStopReason,
  type FrozenContractSet,
  type parseContractMatch,
  type parseWorkspaceExecution,
} from '@codeatlas/ir';
import { authorizeRuntimeWorkflow, type RuntimeWorkflowRequest } from './refresh-runtime-facts.js';
export type WorkspaceRuntimeBatch = {
  expectedOldActivationId: string | null;
  frozen: FrozenContractSet;
  matches: ReturnType<typeof parseContractMatch>[];
  execution: ReturnType<typeof parseWorkspaceExecution>;
};
export interface WorkspaceRuntimeRefreshPorts<TResult> {
  prepare(): Promise<WorkspaceRuntimeBatch>;
  apply(batch: WorkspaceRuntimeBatch): TResult;
}
/** No cross-database atomic moment is promised; the Store freezes and rechecks actual repository bindings. */
export async function refreshWorkspaceRuntime<TResult>(
  request: RuntimeWorkflowRequest,
  ports: WorkspaceRuntimeRefreshPorts<TResult>,
) {
  authorizeRuntimeWorkflow(request, 'INDEX');
  if (request.repositoryId !== null) throw Error('PERMISSION_DENIED');
  let reason = runtimeStopReason(request.control);
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  const prepared = await ports.prepare();
  ensurePhase1Data(prepared);
  const batch = structuredClone(prepared),
    frozen = FrozenContractSetSchema.parse(batch.frozen);
  if (frozen.workspaceBasis.workspaceId !== request.workspaceId) throw Error('PERMISSION_DENIED');
  reason = runtimeStopReason(request.control);
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  if (Phase1CoverageSchema.parse(batch.execution.payload.coverage).status !== 'COMPLETE')
    return { status: 'NOT_PUBLISHED' as const, reason: 'PARTIAL' as const };
  return ports.apply({ ...batch, frozen });
}

export type WorkspaceRuntimeBatchV2 = Omit<WorkspaceRuntimeBatch, 'frozen'> & {
  frozen: FrozenContractSetV2;
};
export interface WorkspaceRuntimeRefreshPortsV2<TResult> {
  prepare(): Promise<WorkspaceRuntimeBatchV2>;
  apply(batch: WorkspaceRuntimeBatchV2): TResult;
}
export async function refreshWorkspaceRuntimeV2<TResult>(
  request: RuntimeWorkflowRequest,
  ports: WorkspaceRuntimeRefreshPortsV2<TResult>,
) {
  authorizeRuntimeWorkflow(request, 'INDEX');
  if (request.repositoryId !== null) throw Error('PERMISSION_DENIED');
  let reason = runtimeStopReason(request.control);
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  const prepared = await ports.prepare();
  ensurePhase1Data(prepared);
  const batch = structuredClone(prepared),
    frozen = FrozenContractSetV2Schema.parse(batch.frozen);
  if (frozen.workspaceBasis.workspaceId !== request.workspaceId) throw Error('PERMISSION_DENIED');
  reason = runtimeStopReason(request.control);
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  if (Phase1CoverageSchema.parse(batch.execution.payload.coverage).status !== 'COMPLETE')
    return { status: 'NOT_PUBLISHED' as const, reason: 'PARTIAL' as const };
  return ports.apply({ ...batch, frozen });
}
