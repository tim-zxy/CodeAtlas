import { refreshWorkspaceRuntimeV2, deriveWorkspaceRuntimeV3 } from '@codeatlas/application';
import {
  refreshRuntimeFacts,
  refreshWorkspaceRuntime,
  deriveWorkspaceRuntime,
  traceRuntime,
  type RuntimeWorkflowRequest,
  type RuntimeRefreshPorts,
  type WorkspaceRuntimeRefreshPorts,
} from '@codeatlas/application';
import {
  RuntimeFactStore,
  ContractStore,
  type HistoryReadLimits,
  type RuntimeCommitOutcome,
  type WorkspaceRuntimeOutcome,
} from '@codeatlas/storage';
type Request = Pick<RuntimeWorkflowRequest, 'policy' | 'control'>;
interface RepositoryRuntimeComposition {
  refresh(request: Request): ReturnType<typeof refreshRuntimeFacts<RuntimeCommitOutcome>>;
  trace(request: Request): ReturnType<RuntimeFactStore['traceRuntime']>;
}
interface WorkspaceRuntimeComposition {
  refresh(request: Request): ReturnType<typeof refreshWorkspaceRuntime<WorkspaceRuntimeOutcome>>;
  trace(request: Request): ReturnType<ContractStore['traceWorkspaceRuntime']>;
}
/** Private stored-input composition. No Source scan, process launch, implicit migration or config default. */
export function composeRuntimeFacts(input: {
  workspaceId: string;
  repositoryId: string;
  store: RuntimeFactStore;
  limits: HistoryReadLimits;
  derive: RuntimeRefreshPorts<RuntimeCommitOutcome>['derive'];
}): RepositoryRuntimeComposition {
  const scope = { workspaceId: input.workspaceId, repositoryId: input.repositoryId };
  return Object.freeze({
    refresh: (request: Request) =>
      refreshRuntimeFacts(
        { ...request, ...scope },
        {
          capture: () => input.store.readRuntimeBasis(input.limits),
          derive: input.derive,
          apply: (value) => input.store.applyRuntimeBatch(value, input.limits),
        },
      ),
    trace: (request: Request) =>
      traceRuntime(
        { ...request, ...scope },
        { read: () => input.store.traceRuntime(input.limits) },
      ),
  });
}
export function composeWorkspaceRuntime(input: {
  workspaceId: string;
  store: ContractStore;
  limits: HistoryReadLimits;
  prepare: WorkspaceRuntimeRefreshPorts<WorkspaceRuntimeOutcome>['prepare'];
}): WorkspaceRuntimeComposition {
  const scope = { workspaceId: input.workspaceId, repositoryId: null };
  return Object.freeze({
    refresh: (request: Request) =>
      refreshWorkspaceRuntime(
        { ...request, ...scope },
        {
          prepare: input.prepare,
          apply: (value) => input.store.applyWorkspaceBatch(value, input.limits),
        },
      ),
    trace: (request: Request) =>
      traceRuntime(
        { ...request, ...scope },
        { read: () => input.store.traceWorkspaceRuntime(input.limits) },
      ),
  });
}
/** Fixed authorized workspace route, consuming explicit frozen input plus actual stored graphs. */
export function composeMatchedWorkspaceRuntime(input: {
  workspaceId: string;
  store: ContractStore;
  limits: HistoryReadLimits;
  frozen: Parameters<ContractStore['readWorkspaceInputs']>[0];
}): WorkspaceRuntimeComposition {
  const composition = (request: Request) =>
    composeWorkspaceRuntime({
      ...input,
      prepare: async () =>
        deriveWorkspaceRuntime(
          input.store.readWorkspaceInputs(input.frozen, input.limits),
          request.control,
        ),
    });
  return Object.freeze({
    refresh: (request: Request) => composition(request).refresh(request),
    trace: (request: Request) => composition(request).trace(request),
  });
}
/** A6 is NOT_QUALIFIED and the Syntax profile catalog is empty. Stored SQLite tests do not authorize observation. */
export function requirePhysicalRuntimeObservation(): never {
  throw Error('RUNTIME_OBSERVATION_NOT_READY');
}

interface WorkspaceRuntimeCompositionV2 {
  refresh(request: Request): ReturnType<typeof refreshWorkspaceRuntimeV2<WorkspaceRuntimeOutcome>>;
  trace(request: Request): ReturnType<ContractStore['traceWorkspaceRuntimeV2']>;
}
export function composeMatchedWorkspaceRuntimeV2(input: {
  workspaceId: string;
  store: ContractStore;
  limits: HistoryReadLimits;
  frozen: Parameters<ContractStore['readWorkspaceInputsV2']>[0];
  maxInputBytes: number;
}): WorkspaceRuntimeCompositionV2 {
  const scope = { workspaceId: input.workspaceId, repositoryId: null };
  return Object.freeze({
    refresh: (request: Request) =>
      refreshWorkspaceRuntimeV2(
        { ...request, ...scope },
        {
          prepare: async () =>
            deriveWorkspaceRuntimeV3(
              input.store.readWorkspaceInputsV2(input.frozen, input.limits, input.maxInputBytes),
              { ...request.control, maxInputBytes: input.maxInputBytes },
            ),
          apply: (value) =>
            input.store.applyWorkspaceBatchV2(value, input.limits, input.maxInputBytes),
        },
      ),
    trace: (request: Request) =>
      traceRuntime(
        { ...request, ...scope },
        { read: () => input.store.traceWorkspaceRuntimeV2(input.limits) },
      ),
  });
}
