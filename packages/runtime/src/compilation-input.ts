import { types, isDeepStrictEqual } from 'node:util';

import {
  compilationCaptureValueDigest,
  type CompilationCaptureRequest,
  type CapturedEntity,
  type CapturedSupport,
  type CaptureValueSchemaRef,
  type RepositoryCapture,
  type WorkspaceCapture,
  type DocumentCapture,
} from '../../application/dist/compilation-input-contract.js';
import {
  captureRepositoryCompilationInputs,
  recheckRepositoryCompilationInputs,
  releaseRepositoryCompilationInputs,
  type RuntimeFactStore,
  type RepositoryCompilationInputsView,
} from '../../storage/dist/runtime/runtime-fact-store.js';
import {
  readWorkspaceCompilationSelection,
  captureWorkspaceCompilationInputs,
  recheckWorkspaceCompilationInputs,
  releaseWorkspaceCompilationInputs,
  type ContractStore,
} from '../../storage/dist/runtime/contract-store.js';
import type { CompilationSelectionView } from '../../application/dist/capture-compilation-input.js';
import { HistoryReadBudget } from '../../storage/dist/analysis/activation-history-format.js';

/** Private Storage composition only. Application must authorize the full datasets,
 * recheck policies and authenticate Source through its required trusted ports. */
export class OwnedCompilationInputError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'OwnedCompilationInputError';
  }
}
const fail = (code = 'COMPILATION_ADAPTER_UNAVAILABLE'): never => {
  throw new OwnedCompilationInputError(code);
};
function check(value: unknown, code?: string): asserts value {
  if (!value) fail(code);
}
type Request = CompilationCaptureRequest;
type RuntimeRequestControl = Parameters<typeof compilationCaptureValueDigest>[2];
type ScopedRef = CapturedEntity['ref'];
type SupportRef = CapturedSupport['ref'];
type Phase1Coverage = RepositoryCapture['coverage'];
export interface OwnedRepositorySourceIdentity {
  readonly rootPath: string;
  readonly repoBasis: RepositoryCompilationInputsView['identity']['codeBasis'];
  readonly targetSource: RepositoryCompilationInputsView['targetSource'];
  readonly targetInventory: RepositoryCompilationInputsView['targetInventory'];
}
export type OwnedRepositoryCompilationFrame = { handle: object; capture: RepositoryCapture };
export type OwnedWorkspaceCompilationFrame = {
  handle: object;
  selection: CompilationSelectionView;
  workspaceCapture: WorkspaceCapture | null;
  documents: DocumentCapture[];
};
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function coverage(original?: Phase1Coverage): Phase1Coverage {
  return {
    status: original?.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'PARTIAL',
    limitations: [...new Set([...(original?.limitations ?? []), 'OWNED_STORAGE_CAPTURE_ONLY'])],
    unverifiedRefs: [...(original?.unverifiedRefs ?? [])],
  };
}
function entity(
  kind: string,
  schema: CaptureValueSchemaRef,
  value: unknown,
  scope: Omit<ScopedRef, 'entity'>,
  revisionId: string,
): CapturedEntity {
  const id = (value as { id: string }).id;
  return {
    ref: { ...scope, entity: { kind, id, revisionId } },
    valueSchemaRef: schema,
    value,
  } as CapturedEntity;
}
function repositoryInventory(
  view: RepositoryCompilationInputsView,
  control: RuntimeRequestControl,
  sync: () => undefined,
): RepositoryCapture {
  const basis = view.identity.codeBasis;
  const scope = { scope: 'REPOSITORY' as const, repositoryId: basis.repositoryId };
  const entities: CapturedEntity[] = [];
  const add = (kind: string, schema: CaptureValueSchemaRef, values: readonly unknown[]) => {
    for (const value of values) {
      sync();
      entities.push(entity(kind, schema, value, scope, basis.revisionId));
    }
  };
  add('CODE_NODE', 'CanonicalNode@1', view.nodes);
  add('CODE_EDGE', 'CanonicalEdge@1', view.edges);
  add('SOURCE_FILE', 'SourceFile@1', view.sourceFiles);
  add('EVIDENCE', 'Evidence@1', view.evidence);
  for (const envelope of view.syntaxEvidence) {
    check(
      envelope.schema === 'codeatlas.syntax-evidence' &&
        [1, 2, 3, 4].includes(envelope.version as number),
    );
    const value = envelope.payload as { id: string };
    sync();
    entities.push({
      ref: {
        ...scope,
        entity: { kind: 'SYNTAX_EVIDENCE', id: value.id, revisionId: basis.revisionId },
      },
      valueSchemaRef: ('SyntaxEvidence@' + String(envelope.version)) as CaptureValueSchemaRef,
      value: envelope,
    } as CapturedEntity);
  }
  const candidate = view.runtimeActivation?.candidate;
  if (candidate) {
    const f = candidate.facts.payload;
    add('ENTRY_POINT', 'EntryPoint@1', f.entryPoints);
    add('TASK_DEFINITION', 'TaskDefinition@1', f.tasks);
    add('DATA_RESOURCE', 'DataResource@1', f.dataResources);
    add('DATA_CHANGE_TRIGGER', 'DataChangeTrigger@1', f.triggers);
    add('CONTRACT', 'Contract@1', f.contracts);
    add('EXECUTION_CONTEXT', 'ExecutionContext@1', f.contexts);
    add('EXECUTION_NODE', 'ExecutionNode@1', f.nodes);
    add('EXECUTION_EDGE', 'ExecutionEdge@1', f.edges);
    add('RUNTIME_FLOW', 'RuntimeFlow@1', f.flows);
    add('FRAMEWORK_BINDING', 'FrameworkBinding@1', candidate.bindings.payload.bindings);
  }

  const supports: CapturedSupport[] = view.values.map(({ support, value }) => {
    sync();
    const e = entities.find((e) => isDeepStrictEqual(e.ref.entity, support.entity));
    check(
      e &&
        !['Evidence@1', 'Document@1', 'DocumentRevision@1'].includes(e.valueSchemaRef) &&
        isDeepStrictEqual(e.value, value),
    );
    return {
      ref: support,
      valueSchemaRef: e.valueSchemaRef,
      value,
      capturedValueDigest: compilationCaptureValueDigest(e.valueSchemaRef, value, control),
    } as CapturedSupport;
  });
  const known = supports.map((s) => s.ref);
  if (candidate)
    for (const ref of [
      ...candidate.facts.payload.supportInventory,
      ...candidate.bindings.payload.supportInventory,
    ])
      check(
        known.some((s) => isDeepStrictEqual(s, ref)),
        'COMPILATION_SUPPORT_ADAPTER_UNAVAILABLE',
      );
  return {
    repoBasis: basis,
    runtimeActivationDigest: view.runtimeActivation?.valueDigest ?? null,
    entities,
    supports,
    coverage: coverage(candidate?.coverage),
  };
}
function workspaceInventory(
  view: ReturnType<typeof captureWorkspaceCompilationInputs>['view'],
  repositories: readonly OwnedRepositoryCompilationFrame[],
  sync: () => undefined,
): WorkspaceCapture | null {
  const runtime = view.workspaceRuntime;
  if (!runtime) return null;
  const basis = runtime.frozen.workspaceBasis;
  const scope = { scope: 'WORKSPACE' as const, workspaceId: basis.workspaceId };
  const entities: CapturedEntity[] = [];
  const add = (kind: string, schema: CaptureValueSchemaRef, values: readonly unknown[]) => {
    for (const value of values) {
      sync();
      entities.push(entity(kind, schema, value, scope, basis.revisionSetId));
    }
  };
  add('SERVICE', 'Service@1', runtime.frozen.catalog.services);
  add('SERVICE_IDENTITY', 'ServiceIdentity@1', runtime.frozen.catalog.entries);
  add(
    'CONTRACT_MATCH',
    'ContractMatch@1',
    runtime.matches.map((m) => m.payload),
  );
  add('WORKSPACE_EXECUTION_NODE', 'WorkspaceExecutionNode@1', runtime.execution.payload.nodes);
  add('WORKSPACE_EXECUTION_EDGE', 'WorkspaceExecutionEdge@1', runtime.execution.payload.edges);
  const known = repositories.flatMap((r) => r.capture.supports.map((s) => s.ref));
  const requireSupports = (refs: readonly SupportRef[]) => {
    for (const ref of refs) {
      sync();
      check(
        known.some((s) => isDeepStrictEqual(s, ref)),
        'COMPILATION_SUPPORT_ADAPTER_UNAVAILABLE',
      );
    }
  };
  for (const item of [
    ...runtime.frozen.catalog.services,
    ...runtime.frozen.catalog.entries,
    ...runtime.frozen.catalog.contractBindings,
    ...runtime.matches.map((m) => m.payload),
    ...runtime.execution.payload.edges,
  ])
    requireSupports(item.supportRefs);
  requireSupports(runtime.execution.payload.supportInventory);
  // Existing workspace producers expose repository supports only. No invented
  // workspace-value support recipe; a required workspace-owned support refuses.
  return {
    workspaceBasis: basis,
    entities,
    supports: [],
    coverage: coverage(runtime.execution.payload.coverage),
  };
}
export function createOwnedCompilationInputPorts(options: {
  workspaceStore: ContractStore;
  repositories: ReadonlyMap<string, RuntimeFactStore>;
  budget: HistoryReadBudget;
  control: RuntimeRequestControl;
  syncCheck: () => undefined;
}) {
  const { workspaceStore, budget, syncCheck } = options;
  const inputControl = options.control;
  check(budget instanceof HistoryReadBudget && !types.isProxy(budget));
  check(
    typeof syncCheck === 'function' &&
      !types.isProxy(syncCheck) &&
      !types.isAsyncFunction(syncCheck),
  );
  check(inputControl && !types.isProxy(inputControl));
  const descriptors = Object.getOwnPropertyDescriptors(inputControl);
  for (const key of ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal'])
    check(
      descriptors[key] && descriptors[key]!.enumerable && Object.hasOwn(descriptors[key]!, 'value'),
    );
  const control: RuntimeRequestControl = Object.freeze({
    maxItems: descriptors.maxItems!.value as number,
    maxDepth: descriptors.maxDepth!.value as number,
    deadlineEpochMs: descriptors.deadlineEpochMs!.value as number,
    signal: descriptors.signal!.value as AbortSignal,
  });
  check(
    Number.isSafeInteger(control.maxItems) &&
      control.maxItems > 0 &&
      Number.isSafeInteger(control.maxDepth) &&
      control.maxDepth >= 0 &&
      Number.isFinite(control.deadlineEpochMs),
  );
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
  check(typeof aborted.call(control.signal) === 'boolean');
  const repositories = new Map(options.repositories);
  const repos = new WeakMap<
    object,
    {
      store: RuntimeFactStore;
      capture: RepositoryCapture;
      sourceIdentity: OwnedRepositorySourceIdentity;
    }
  >();
  const workspaces = new WeakMap<
    object,
    { repositories: { store: RuntimeFactStore; handle: object }[] }
  >();
  const sync = (): undefined => {
    const result: unknown = syncCheck();
    if (types.isPromise(result))
      void Promise.prototype.then.call(result, undefined, () => undefined);
    check(result === undefined, 'INVALID_COMPILATION_CONTROL');
    if (aborted.call(control.signal)) fail('CANCELLED');
    if (Date.now() >= control.deadlineEpochMs) fail('DEADLINE');
    return undefined;
  };
  const frameHandle = (frame: { handle: object }) => {
    check(frame && typeof frame === 'object' && !types.isProxy(frame));
    const descriptor = Object.getOwnPropertyDescriptor(frame, 'handle');
    check(descriptor && Object.hasOwn(descriptor, 'value'));
    const handle: unknown = descriptor.value;
    check(handle && typeof handle === 'object' && !types.isProxy(handle));
    return handle;
  };
  const repoOwner = (frame: Pick<OwnedRepositoryCompilationFrame, 'handle'>) => {
    const handle = frameHandle(frame);
    const owner = repos.get(handle);
    check(owner, 'COMPILATION_HANDLE_UNAVAILABLE');
    return { ...owner, handle };
  };
  function cleanup(operation: () => void): never {
    try {
      operation();
    } catch {
      throw new OwnedCompilationInputError('COMPILATION_CAPTURE_FAILED', 'UNKNOWN');
    }
    return fail('COMPILATION_CAPTURE_FAILED');
  }
  sync();
  return Object.freeze({
    readSelection(request: Request): CompilationSelectionView {
      sync();
      budget.own(request);
      return readWorkspaceCompilationSelection(workspaceStore, request.revisionSetId, budget, sync);
    },
    acquireRepository(repositoryId: string): OwnedRepositoryCompilationFrame {
      sync();
      const store = repositories.get(repositoryId);
      check(store, 'COMPILATION_REPOSITORY_UNAVAILABLE');
      const captured = captureRepositoryCompilationInputs(store, budget, sync);
      try {
        const capture = freeze(repositoryInventory(captured.view, control, sync));
        budget.own(capture);
        sync();
        const sourceIdentity: OwnedRepositorySourceIdentity = freeze({
          rootPath: captured.view.rootPath,
          repoBasis: captured.view.identity.codeBasis,
          targetSource: captured.view.targetSource,
          targetInventory: captured.view.targetInventory,
        });
        budget.own(sourceIdentity);
        repos.set(captured.handle, { store, capture, sourceIdentity });
        return Object.freeze({ handle: captured.handle, capture });
      } catch {
        return cleanup(() => releaseRepositoryCompilationInputs(store, captured.handle));
      }
    },
    acquireWorkspace(
      request: Request,
      frames: readonly OwnedRepositoryCompilationFrame[],
      includeWorkspaceRuntime: boolean,
    ): OwnedWorkspaceCompilationFrame {
      sync();
      budget.own(request);
      check(request.selectedDocumentRevisions.length === 0, 'DOCUMENT_SCAN_ADAPTER_UNAVAILABLE');
      check(Array.isArray(frames) && !types.isProxy(frames));
      const owners = frames.map(repoOwner);
      const handles = owners.map(({ store, handle }) => ({ store, handle }));
      const captured = captureWorkspaceCompilationInputs(
        workspaceStore,
        request.revisionSetId,
        [],
        handles,
        includeWorkspaceRuntime,
        budget,
        sync,
      );
      try {
        const trusted = owners.map((owner) => ({ handle: owner.handle, capture: owner.capture }));
        const workspaceCapture = workspaceInventory(captured.view, trusted, sync);
        const { workspaceId, revisionSetId, registeredRepositories, revisionSetEntries } =
          captured.view;
        const selection = {
          workspaceId,
          revisionSetId,
          registeredRepositories,
          revisionSetEntries,
        };
        budget.own(workspaceCapture);
        sync();
        workspaces.set(captured.handle, { repositories: handles });
        return freeze({ handle: captured.handle, selection, workspaceCapture, documents: [] });
      } catch {
        return cleanup(() => releaseWorkspaceCompilationInputs(workspaceStore, captured.handle));
      }
    },
    /** Original owned DB identity only. This performs no Source work or authorization. */
    repositorySourceIdentity(
      frame: Pick<OwnedRepositoryCompilationFrame, 'handle'>,
    ): OwnedRepositorySourceIdentity {
      sync();
      return repoOwner(frame).sourceIdentity;
    },
    recheckRepository(frame: Pick<OwnedRepositoryCompilationFrame, 'handle'>) {
      sync();
      const owner = repoOwner(frame);
      recheckRepositoryCompilationInputs(owner.store, owner.handle, budget, sync);
    },
    recheckWorkspace(frame: Pick<OwnedWorkspaceCompilationFrame, 'handle'>) {
      sync();
      const handle = frameHandle(frame);
      const owner = workspaces.get(handle);
      check(owner, 'COMPILATION_HANDLE_UNAVAILABLE');
      recheckWorkspaceCompilationInputs(workspaceStore, handle, owner.repositories, budget, sync);
    },
    releaseRepository(frame: Pick<OwnedRepositoryCompilationFrame, 'handle'>) {
      const owner = repoOwner(frame);
      releaseRepositoryCompilationInputs(owner.store, owner.handle);
      repos.delete(owner.handle);
    },
    releaseWorkspace(frame: Pick<OwnedWorkspaceCompilationFrame, 'handle'>) {
      const handle = frameHandle(frame);
      const owner = workspaces.get(handle);
      check(owner, 'COMPILATION_HANDLE_UNAVAILABLE');
      releaseWorkspaceCompilationInputs(workspaceStore, handle);
      workspaces.delete(handle);
    },
  });
}
