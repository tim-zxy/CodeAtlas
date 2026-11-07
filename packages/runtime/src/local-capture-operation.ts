import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual, types } from 'node:util';
import {
  authorizeOperation,
  POLICY_OPERATIONS,
  type OperationPolicyInput,
  type PolicyOperation,
} from '@codeatlas/application';
import {
  canonicalCompilationJson,
  parseCompilationCaptureRequest,
  type CompilationCaptureRequest,
} from '../../application/dist/compilation-input-contract.js';
import type { CompilationSelectionView } from '../../application/dist/capture-compilation-input.js';
import {
  readWorkspaceCompilationSelection,
  type ContractStore,
} from '../../storage/dist/runtime/contract-store.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
} from '../../storage/dist/analysis/activation-history-format.js';
import { assertCurrentWindowsPrincipal } from './windows-principal-owner.js';
import type { EffectiveConfig } from './effective-config.js';

type Control = Parameters<typeof canonicalCompilationJson>[1];
type Security = EffectiveConfig['security'];
type Versions = CompilationCaptureRequest['policyVersions'];
type Failure =
  | 'LOCAL_CAPTURE_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'SECURITY_POLICY_BLOCKED'
  | 'SECRET_DETECTED'
  | 'CAPTURE_SCOPE_MISMATCH'
  | 'CAPTURE_POLICY_CHANGED'
  | 'CANCELLED'
  | 'DEADLINE';
export class LocalCaptureOperationError extends Error {
  constructor(readonly code: Failure) {
    super(code);
    this.name = 'LocalCaptureOperationError';
  }
}
const fail = (code: Failure = 'LOCAL_CAPTURE_UNAVAILABLE'): never => {
  throw new LocalCaptureOperationError(code);
};
function check(value: unknown, code?: Failure): asserts value {
  if (!value) fail(code);
}
function fields(value: unknown, keys: readonly string[]) {
  check(value && typeof value === 'object' && !types.isProxy(value));
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(descriptors).length === keys.length);
  for (const key of keys)
    check(
      descriptors[key] && descriptors[key]!.enumerable && Object.hasOwn(descriptors[key]!, 'value'),
    );
  return descriptors;
}
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function ownControl(input: Control): Control {
  const d = fields(input, ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal']);
  const result = {
    maxItems: d.maxItems!.value as number,
    maxDepth: d.maxDepth!.value as number,
    deadlineEpochMs: d.deadlineEpochMs!.value as number,
    signal: d.signal!.value as AbortSignal,
  };
  check(
    Number.isSafeInteger(result.maxItems) &&
      result.maxItems > 0 &&
      Number.isSafeInteger(result.maxDepth) &&
      result.maxDepth >= 0 &&
      Number.isFinite(result.deadlineEpochMs),
  );
  check(result.signal && !types.isProxy(result.signal));
  try {
    check(typeof aborted.call(result.signal) === 'boolean');
  } catch {
    return fail();
  }
  return Object.freeze(result);
}
function ownSecurity(input: Security): Security {
  const keys = [
    'localOnly',
    'remoteLlmEnabled',
    'remoteEmbeddingEnabled',
    'allowSensitiveRemote',
    'allowRawSourceRemote',
  ] as const;
  const descriptors = fields(input, keys);
  const result = Object.fromEntries(
    keys.map((key) => {
      check(typeof descriptors[key]!.value === 'boolean');
      return [key, descriptors[key]!.value];
    }),
  ) as unknown as Security;
  return Object.freeze(result);
}
/** Pure data identity only. These refs never authenticate a principal or grant. */
export function localCapturePolicyVersions(security: Security, control: Control): Versions {
  const owned = ownSecurity(security),
    ownedControl = ownControl(control);
  return Object.freeze({
    securityPolicyRef:
      'local-capture-security-v1:sha256:' +
      createHash('sha256').update(canonicalCompilationJson(owned, ownedControl)).digest('hex'),
    domainPolicyRef: 'local-capture-domain-v1',
  });
}
type Owner = {
  principal: object;
  store: ContractStore;
  budget: HistoryReadBudget;
  control: Control;
  limits: ReturnType<typeof checkedHistoryLimits>;
  monotonicDeadline: number;
  security: Security;
  policyVersions: Versions;
  request: CompilationCaptureRequest;
  selection: CompilationSelectionView;
  capabilities: PolicyOperation[];
  reason: Failure | null;
  revocationGeneration: number;
  abortListener: () => void;
};
const owners = new WeakMap<object, Owner>();
const closed = new WeakSet<object>();
function ownerFor(handle: object): Owner {
  check(handle && typeof handle === 'object' && !types.isProxy(handle));
  const owner = owners.get(handle);
  check(owner);
  return owner;
}
function stop(owner: Owner, reason: Failure) {
  if (owner.reason === null) {
    owner.reason = reason;
    owner.revocationGeneration++;
  }
}
function assertMemory(owner: Owner): undefined {
  try {
    if (owner.reason) fail(owner.reason);
    const limitFields = fields(owner.budget.limits, [
      'maxRows',
      'maxSerializedBytes',
      'maxItems',
      'maxDepth',
      'memoryBudgetBytes',
    ]);
    for (const key of Object.keys(owner.limits) as (keyof typeof owner.limits)[])
      if (limitFields[key]!.value !== owner.limits[key]) {
        stop(owner, 'LOCAL_CAPTURE_UNAVAILABLE');
        fail();
      }
    try {
      const result: unknown = assertCurrentWindowsPrincipal(owner.principal);
      if (types.isPromise(result))
        void Promise.prototype.then.call(result, undefined, () => undefined);
      check(result === undefined);
    } catch {
      stop(owner, 'LOCAL_CAPTURE_UNAVAILABLE');
      fail();
    }
    if (aborted.call(owner.control.signal)) stop(owner, 'CANCELLED');
    else if (
      Date.now() >= owner.control.deadlineEpochMs ||
      performance.now() >= owner.monotonicDeadline
    )
      stop(owner, 'DEADLINE');
    if (owner.reason) fail(owner.reason);
    return undefined;
  } catch (error) {
    stop(
      owner,
      error instanceof LocalCaptureOperationError ? error.code : 'LOCAL_CAPTURE_UNAVAILABLE',
    );
    throw error;
  }
}

function validateScope(request: CompilationCaptureRequest, selection: CompilationSelectionView) {
  check(
    selection.workspaceId === request.workspaceId &&
      selection.revisionSetId === request.revisionSetId,
    'CAPTURE_SCOPE_MISMATCH',
  );
  const ids = request.repositoryIds;
  check(ids.length > 0);
  if (request.scope.kind === 'REPOSITORY')
    check(ids.length === 1 && ids[0] === request.scope.repositoryId, 'CAPTURE_SCOPE_MISMATCH');
  else if (request.scope.kind === 'CROSS_REPO')
    check(isDeepStrictEqual(ids, request.scope.repositoryIds), 'CAPTURE_SCOPE_MISMATCH');
  else
    check(
      request.scope.workspaceId === request.workspaceId &&
        isDeepStrictEqual(
          ids,
          selection.revisionSetEntries.map((entry) => entry.repositoryId).sort(),
        ),
      'CAPTURE_SCOPE_MISMATCH',
    );
  for (const id of ids)
    check(
      selection.registeredRepositories.some((repo) => repo.repositoryId === id) &&
        selection.revisionSetEntries.some((entry) => entry.repositoryId === id),
      'CAPTURE_SCOPE_MISMATCH',
    );
  for (const ref of request.selectedEntityRefs)
    if (ref.scope === 'REPOSITORY') {
      const entry = selection.revisionSetEntries.find(
        (entry) => entry.repositoryId === ref.repositoryId,
      );
      check(
        ids.includes(ref.repositoryId) && entry?.revisionId === ref.entity.revisionId,
        'CAPTURE_SCOPE_MISMATCH',
      );
    } else check(ref.workspaceId === request.workspaceId, 'CAPTURE_SCOPE_MISMATCH');
}
function assertBoundary(owner: Owner) {
  try {
    assertMemory(owner);
    const selection = readWorkspaceCompilationSelection(
      owner.store,
      owner.request.revisionSetId,
      owner.budget,
      () => assertMemory(owner),
    );
    validateScope(owner.request, selection);
    if (!isDeepStrictEqual(selection, owner.selection)) {
      stop(owner, 'CAPTURE_SCOPE_MISMATCH');
      fail('CAPTURE_SCOPE_MISMATCH');
    }
    const versions = localCapturePolicyVersions(owner.security, owner.control);
    owner.budget.own(versions);
    if (
      !isDeepStrictEqual(versions, owner.policyVersions) ||
      !isDeepStrictEqual(versions, owner.request.policyVersions)
    ) {
      stop(owner, 'CAPTURE_POLICY_CHANGED');
      fail('CAPTURE_POLICY_CHANGED');
    }
    assertMemory(owner);
  } catch (error) {
    stop(
      owner,
      error instanceof LocalCaptureOperationError ? error.code : 'LOCAL_CAPTURE_UNAVAILABLE',
    );
    throw error;
  }
}

/** Trusted Runtime bootstrap only. No SID/identity DTO, caller-selected command,
 * remote/model grant, scan clearance, publication, migration or durable authority. */
export function createLocalCaptureOperation(input: {
  principalHandle: object;
  workspaceStore: ContractStore;
  security: Security;
  callerCapabilities: readonly PolicyOperation[];
  request: CompilationCaptureRequest;
  budget: HistoryReadBudget;
  control: Control;
}): { readonly handle: object; readonly policyVersions: Versions } {
  fields(input, [
    'principalHandle',
    'workspaceStore',
    'security',
    'callerCapabilities',
    'request',
    'budget',
    'control',
  ]);
  const control = ownControl(input.control),
    security = ownSecurity(input.security);
  const monotonicDeadline = performance.now() + Math.max(0, control.deadlineEpochMs - Date.now());
  const budget = input.budget;
  check(
    budget instanceof HistoryReadBudget &&
      !types.isProxy(budget) &&
      Object.getPrototypeOf(budget) === HistoryReadBudget.prototype,
  );
  const limits = checkedHistoryLimits(budget.limits);
  budget.own(input.callerCapabilities);
  check(Array.isArray(input.callerCapabilities));
  const capabilities = [...input.callerCapabilities];
  check(
    capabilities.every((value) => POLICY_OPERATIONS.includes(value)) &&
      new Set(capabilities).size === capabilities.length,
  );
  check(
    capabilities.includes('QUERY') && capabilities.includes('READ_SOURCE'),
    'PERMISSION_DENIED',
  );
  budget.own(input.request);
  const request = parseCompilationCaptureRequest(input.request, control);
  budget.own(request);
  const policyVersions = localCapturePolicyVersions(security, control);
  check(isDeepStrictEqual(request.policyVersions, policyVersions), 'CAPTURE_POLICY_CHANGED');
  const handle = Object.freeze({});
  const owner: Owner = {
    principal: input.principalHandle,
    store: input.workspaceStore,
    budget,
    control,
    limits,
    monotonicDeadline,
    security,
    policyVersions,
    request,
    selection: undefined as unknown as CompilationSelectionView,
    capabilities: ['QUERY', 'READ_SOURCE'],
    reason: null,
    revocationGeneration: 0,
    abortListener: () => stop(owner, 'CANCELLED'),
  };
  assertMemory(owner);
  owner.selection = readWorkspaceCompilationSelection(
    owner.store,
    request.revisionSetId,
    budget,
    () => assertMemory(owner),
  );
  validateScope(request, owner.selection);
  budget.own({ security, policyVersions });
  assertMemory(owner);
  EventTarget.prototype.addEventListener.call(control.signal, 'abort', owner.abortListener, {
    once: true,
  });
  owners.set(handle, owner);
  return Object.freeze({ handle, policyVersions });
}
/** Checkpoint only: no SQL, Source or OS query is performed here. */
export function assertLocalCaptureOperation(handle: object): void {
  assertMemory(ownerFor(handle));
}
export function authorizeLocalCaptureRead(
  handle: object,
  input: {
    operation: 'QUERY' | 'READ_SOURCE';
    repositoryId: string | null;
    source: OperationPolicyInput['source'];
  },
): void {
  const owner = ownerFor(handle);
  assertBoundary(owner);
  fields(input, ['operation', 'repositoryId', 'source']);
  owner.budget.own(input);
  const owned = JSON.parse(canonicalCompilationJson(input, owner.control)) as typeof input;
  owner.budget.own(owned);
  check(owned.operation === 'QUERY' || owned.operation === 'READ_SOURCE', 'PERMISSION_DENIED');
  const ids = owned.repositoryId === null ? owner.request.repositoryIds : [owned.repositoryId];
  for (const repositoryId of ids) {
    check(owner.request.repositoryIds.includes(repositoryId), 'PERMISSION_DENIED');
    const decision = authorizeOperation({
      operation: owned.operation,
      phase: 'PRIMARY',
      scope: { workspaceId: owner.request.workspaceId, repositoryId },
      callerCapabilities: owner.capabilities,
      permissionContext: {
        workspaceId: owner.request.workspaceId,
        repositoryIds: owner.request.repositoryIds,
        allowedOperations: owner.capabilities,
      },
      source: owned.source,
      destination: 'LOCAL',
      settings: { ...owner.security, allowRemoteFallback: false },
    });
    if (!decision.allowed)
      fail(
        decision.code === 'PERMISSION_DENIED' || decision.code === 'SECRET_DETECTED'
          ? decision.code
          : 'SECURITY_POLICY_BLOCKED',
      );
  }
  assertMemory(owner);
}
export function revokeLocalCaptureOperation(handle: object): void {
  stop(ownerFor(handle), 'PERMISSION_DENIED');
}
export function closeLocalCaptureOperation(handle: object): void {
  check(handle && typeof handle === 'object' && !types.isProxy(handle));
  if (closed.has(handle)) return;
  const owner = ownerFor(handle);
  stop(owner, 'LOCAL_CAPTURE_UNAVAILABLE');
  EventTarget.prototype.removeEventListener.call(
    owner.control.signal,
    'abort',
    owner.abortListener,
  );
  owners.delete(handle);
  closed.add(handle);
}
/** Final scope/policy check followed by synchronous close; no await gap. */
export function finishLocalCaptureOperation(handle: object): void {
  const owner = ownerFor(handle);
  try {
    assertBoundary(owner);
  } finally {
    closeLocalCaptureOperation(handle);
  }
}
