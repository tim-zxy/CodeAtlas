import { types } from 'node:util';
import {
  ContentFingerprintSchema,
  EntityIdSchema,
  UtcInstantSchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import {
  canonicalCompilationJson,
  CompilationInputContractError,
  parseCompilationCaptureRequest,
  parseCompilationInputSnapshot,
  selectCompilationCaptureClosure,
  type CompilationCaptureRequest,
  type CompilationInputSnapshot,
  type DocumentCapture,
  type RepositoryCapture,
  type WorkspaceCapture,
} from './compilation-input-contract.js';

type MaybePromise<T> = T | Promise<T>;
export type CompilationSelectionView = {
  workspaceId: string;
  revisionSetId: string;
  registeredRepositories: { repositoryId: string; rootPath: string }[];
  revisionSetEntries: {
    repositoryId: string;
    revisionId: string;
    revisionFingerprint: string;
  }[];
};
export type RepositoryCaptureFrame = { handle: object; capture: RepositoryCapture };
export type WorkspaceCaptureFrame = {
  handle: object;
  selection: CompilationSelectionView;
  workspaceCapture: WorkspaceCapture | null;
  documents: DocumentCapture[];
};
/** Internal owner ports, never a serialized authority or a public entry point.
 * Authorization must cover the complete materialized inventory, including text in
 * transitive supports. A scan result, caller boolean or DTO is not such authority. */
export interface CompilationCapturePorts {
  account: { checkpoint(): void; own(value: unknown): void; invalidate(): void };
  allocateSnapshotId(): string;
  now(): string;
  currentPolicyVersions(): MaybePromise<CompilationCaptureRequest['policyVersions']>;
  authorizeSelection(request: CompilationCaptureRequest): MaybePromise<void>;
  authorizeRepositoryRead(
    request: CompilationCaptureRequest,
    repositoryId: string,
  ): MaybePromise<void>;
  authorizeWorkspaceRead(
    request: CompilationCaptureRequest,
    includeRuntime: boolean,
  ): MaybePromise<void>;
  readSelection(request: CompilationCaptureRequest): MaybePromise<CompilationSelectionView>;
  acquireRepository(repositoryId: string): MaybePromise<RepositoryCaptureFrame>;
  acquireWorkspace(
    request: CompilationCaptureRequest,
    repositories: readonly RepositoryCaptureFrame[],
    includeRuntime: boolean,
  ): MaybePromise<WorkspaceCaptureFrame>;
  verifySource(
    frame: RepositoryCaptureFrame,
    request: CompilationCaptureRequest,
  ): MaybePromise<void>;
  recheckRepository(frame: RepositoryCaptureFrame): MaybePromise<void>;
  recheckWorkspace(frame: WorkspaceCaptureFrame): MaybePromise<void>;
  releaseRepository(frame: RepositoryCaptureFrame): MaybePromise<void>;
  releaseWorkspace(frame: WorkspaceCaptureFrame): MaybePromise<void>;
}
export class CompilationCaptureError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN',
  ) {
    super(code);
    this.name = 'CompilationCaptureError';
  }
}
function requireValue(value: unknown, code = 'CAPTURE_FAILED'): asserts value {
  if (!value) throw new CompilationCaptureError(code, 'SETTLED');
}
const safeCodes = new Set([
  'CAPTURE_FAILED',
  'CAPTURE_SCOPE_MISMATCH',
  'CAPTURE_POLICY_CHANGED',
  'CAPTURE_SCAN_UNAVAILABLE',
  'PERMISSION_DENIED',
  'SECURITY_POLICY_BLOCKED',
  'SOURCE_CHANGED',
  'SOURCE_STATE_CONFLICT',
  'HISTORY_CHANGED',
  'CONTEXT_UNAVAILABLE',
  'HISTORY_LIMIT_EXCEEDED',
  'BUDGET_EXCEEDED',
  'CANCELLED',
  'DEADLINE',
  'DEADLINE_EXCEEDED',
  'SUPPORT_RECIPE_UNAVAILABLE',
]);
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function errorField(error: unknown, key: string): unknown {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return undefined;
  return Object.getOwnPropertyDescriptor(error, key)?.value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const codeKinds = new Set(['SOURCE_FILE', 'CODE_NODE', 'CODE_EDGE', 'EVIDENCE', 'SYNTAX_EVIDENCE']);
/** Snapshot trusted owner frames without invoking accessors. Cleanup must already
 * be registered against the acquired frame before any inspection can refuse. */
function captureFrame<T extends { handle: object }>(
  value: T,
  keys: readonly (keyof T)[],
): Readonly<T> {
  requireValue(value && typeof value === 'object' && !types.isProxy(value));
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireValue(Reflect.ownKeys(descriptors).length === keys.length);
  for (const key of keys) {
    const descriptor = descriptors[key];
    requireValue(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }
  const handle: unknown = descriptors.handle!.value;
  requireValue(handle && typeof handle === 'object' && !types.isProxy(handle));
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])),
  ) as Readonly<T>;
}

/** Capture window only: each DB owns its own view, not a shared cross-DB instant.
 * No document body scan authority exists on this route yet: deny before reads.
 * Nothing here writes a snapshot record, calls a model, or publishes knowledge. */
export async function captureCompilationInput(
  requestValue: unknown,
  requestControl: RuntimeRequestControl,
  ports: CompilationCapturePorts,
): Promise<CompilationInputSnapshot> {
  const releases: (() => MaybePromise<void>)[] = [];
  let unknownCleanup = false;
  let failure: unknown;
  let failed = false;
  let prepared: CompilationInputSnapshot | undefined;
  let finalAuthorization: (() => Promise<void>) | undefined;
  let startedAt = '';
  let control: RuntimeRequestControl;
  const account = ports.account;
  try {
    account.checkpoint();
    account.own(requestValue);
    // Parser verifies control descriptors/intrinsic AbortSignal before callbacks.
    const request = parseCompilationCaptureRequest(requestValue, requestControl);
    const descriptors = Object.getOwnPropertyDescriptors(requestControl);
    control = Object.freeze({
      maxItems: descriptors.maxItems!.value,
      maxDepth: descriptors.maxDepth!.value,
      deadlineEpochMs: descriptors.deadlineEpochMs!.value,
      signal: descriptors.signal!.value,
    }) as RuntimeRequestControl;
    function checkpoint() {
      account.checkpoint();
      requireValue(!aborted.call(control.signal), 'CANCELLED');
      requireValue(Date.now() < control.deadlineEpochMs, 'DEADLINE');
    }
    function owned<T>(value: T): T {
      checkpoint();
      account.own(value);
      const result = JSON.parse(canonicalCompilationJson(value, control)) as T;
      account.own(result);
      return freeze(result);
    }
    async function checked(action: () => MaybePromise<void>) {
      checkpoint();
      requireValue((await action()) === undefined);
      checkpoint();
    }
    async function policies() {
      checkpoint();
      const actual = owned(await ports.currentPolicyVersions());
      requireValue(
        canonicalCompilationJson(actual, control) ===
          canonicalCompilationJson(request.policyVersions, control),
        'CAPTURE_POLICY_CHANGED',
      );
    }
    startedAt = UtcInstantSchema.parse(ports.now());
    const snapshotId = EntityIdSchema.parse(ports.allocateSnapshotId());
    await policies();
    await checked(() => ports.authorizeSelection(request));
    // Until a genuine versioned scan permission is installed, never read bodies.
    requireValue(
      request.selectedDocumentRevisions.length === 0 &&
        !request.selectedEntityRefs.some((ref) => ref.entity.kind.startsWith('DOCUMENT')),
      'CAPTURE_SCAN_UNAVAILABLE',
    );
    const selection = owned(await ports.readSelection(request));
    function validateSelection(view: CompilationSelectionView) {
      requireValue(
        view.workspaceId === request.workspaceId && view.revisionSetId === request.revisionSetId,
        'CAPTURE_SCOPE_MISMATCH',
      );
      requireValue(
        Object.keys(view).length === 4 &&
          Array.isArray(view.registeredRepositories) &&
          Array.isArray(view.revisionSetEntries),
        'CAPTURE_SCOPE_MISMATCH',
      );
      const registered = new Set<string>(),
        pins = new Map<string, CompilationSelectionView['revisionSetEntries'][number]>();
      for (const row of view.registeredRepositories) {
        const id = EntityIdSchema.parse(row.repositoryId);
        requireValue(
          Object.keys(row).length === 2 &&
            typeof row.rootPath === 'string' &&
            row.rootPath.length &&
            !registered.has(id),
          'CAPTURE_SCOPE_MISMATCH',
        );
        registered.add(id);
      }
      for (const row of view.revisionSetEntries) {
        const id = EntityIdSchema.parse(row.repositoryId);
        EntityIdSchema.parse(row.revisionId);
        ContentFingerprintSchema.parse(row.revisionFingerprint);
        requireValue(
          Object.keys(row).length === 3 && registered.has(id) && !pins.has(id),
          'CAPTURE_SCOPE_MISMATCH',
        );
        pins.set(id, row);
      }
      requireValue(
        request.repositoryIds.every((id) => registered.has(id) && pins.has(id)),
        'CAPTURE_SCOPE_MISMATCH',
      );
      if (request.scope.kind === 'WORKSPACE')
        requireValue(pins.size === request.repositoryIds.length, 'CAPTURE_SCOPE_MISMATCH');
      return pins;
    }
    const pins = validateSelection(selection);
    const frames: RepositoryCaptureFrame[] = [];
    for (const repositoryId of request.repositoryIds) {
      await checked(() => ports.authorizeRepositoryRead(request, repositoryId));
      const pending = ports.acquireRepository(repositoryId);
      // Do not await a synchronous frame: Promise assimilation would invoke an
      // unknown `then` getter before its acquired owner enters cleanup.
      const acquired: RepositoryCaptureFrame = types.isPromise(pending) ? await pending : pending;
      // Register before inspecting the returned frame; a malformed data field must
      // not hide an acquired owner's release or falsely report settled cleanup.
      let cleanupFrame = acquired;
      releases.push(() => ports.releaseRepository(cleanupFrame));
      const frame = captureFrame(acquired, ['handle', 'capture']);
      cleanupFrame = frame;
      const capture = owned(frame.capture),
        pin = pins.get(repositoryId)!;
      requireValue(
        capture.repoBasis.repositoryId === repositoryId &&
          capture.repoBasis.revisionId === pin.revisionId &&
          capture.repoBasis.contentFingerprint === pin.revisionFingerprint,
        'CAPTURE_SCOPE_MISMATCH',
      );
      frames.push(Object.freeze({ handle: frame.handle, capture }));
    }
    const includeRuntime = request.selectedEntityRefs.some(
      (ref) => !codeKinds.has(ref.entity.kind),
    );
    await checked(() => ports.authorizeWorkspaceRead(request, includeRuntime));
    const pendingWorkspace = ports.acquireWorkspace(request, frames, includeRuntime);
    const acquiredWorkspace: WorkspaceCaptureFrame = types.isPromise(pendingWorkspace)
      ? await pendingWorkspace
      : pendingWorkspace;
    let workspaceCleanupFrame = acquiredWorkspace;
    releases.push(() => ports.releaseWorkspace(workspaceCleanupFrame));
    const workspace = captureFrame(acquiredWorkspace, [
      'handle',
      'selection',
      'workspaceCapture',
      'documents',
    ]);
    workspaceCleanupFrame = workspace;
    const workspaceData = owned({
      selection: workspace.selection,
      workspaceCapture: workspace.workspaceCapture,
      documents: workspace.documents,
    });
    validateSelection(workspaceData.selection);
    requireValue(
      canonicalCompilationJson(workspaceData.selection, control) ===
        canonicalCompilationJson(selection, control),
      'HISTORY_CHANGED',
    );
    requireValue(workspaceData.documents.length === 0, 'CAPTURE_SCAN_UNAVAILABLE');
    const inventories = [
      ...frames.map((f) => f.capture),
      ...(workspaceData.workspaceCapture ? [workspaceData.workspaceCapture] : []),
    ];
    const limitations = [...new Set(inventories.flatMap((v) => v.coverage.limitations))];
    const unverified = new Map(
      inventories
        .flatMap((v) => v.coverage.unverifiedRefs)
        .map((ref) => [canonicalCompilationJson(ref, control), ref]),
    );
    const status = inventories.some((v) => v.coverage.status === 'UNSUPPORTED')
      ? 'UNSUPPORTED'
      : inventories.some((v) => v.coverage.status === 'PARTIAL')
        ? 'PARTIAL'
        : 'COMPLETE';
    const candidate = {
      schemaVersion: 1 as const,
      snapshotId,
      workspaceId: request.workspaceId,
      scope: request.scope,
      revisionSetId: request.revisionSetId,
      selection: {
        repositoryIds: request.repositoryIds,
        selectedEntityRefs: request.selectedEntityRefs,
        selectedDocumentRevisions: request.selectedDocumentRevisions,
      },
      workspaceCapture: workspaceData.workspaceCapture,
      repositories: frames.map((f) => f.capture),
      documents: [],
      policyVersions: request.policyVersions,
      captureWindow: { startedAt, completedAt: startedAt },
      coverage: { status, limitations, unverifiedRefs: [...unverified.values()] },
    };
    account.own(candidate);
    prepared = selectCompilationCaptureClosure(candidate, control);
    account.own(prepared);
    for (const frame of frames) await checked(() => ports.verifySource(frame, request));
    for (const frame of frames) await checked(() => ports.recheckRepository(frame));
    await checked(() => ports.recheckWorkspace(workspace));
    // Owned cleanup can await and observe revocation; authorize only after it settles.
    finalAuthorization = async () => {
      await checked(() => ports.authorizeSelection(request));
      for (const frame of frames)
        await checked(() =>
          ports.authorizeRepositoryRead(request, frame.capture.repoBasis.repositoryId),
        );
      await checked(() => ports.authorizeWorkspaceRead(request, includeRuntime));
      await policies();
      checkpoint();
    };
  } catch (error) {
    failed = true;
    failure = error;
    unknownCleanup = errorField(error, 'cleanupState') === 'UNKNOWN';
  }
  // Always settle every acquired handle, even after cancellation or a prior release failure.
  for (const release of releases.reverse()) {
    try {
      requireValue((await release()) === undefined);
    } catch (error) {
      unknownCleanup = true;
      if (!failed) failure = error;
      failed = true;
    }
  }
  try {
    if (failed || unknownCleanup || !prepared || !finalAuthorization) throw failure ?? new Error();
    await finalAuthorization();
    account.checkpoint();
    requireValue(!aborted.call(control!.signal), 'CANCELLED');
    requireValue(Date.now() < control!.deadlineEpochMs, 'DEADLINE');
    const completedAt = UtcInstantSchema.parse(ports.now());
    requireValue(startedAt <= completedAt);
    // Revalidate/recompute after settlement, with the completed audit window.
    const finalized = { ...prepared, captureWindow: { startedAt, completedAt } };
    account.own(finalized);
    const result = parseCompilationInputSnapshot(finalized, control!);
    account.own(result);
    return result;
  } catch (error) {
    unknownCleanup ||= errorField(error, 'cleanupState') === 'UNKNOWN';
    try {
      account.invalidate();
    } catch {
      unknownCleanup = true;
    }
    const code = errorField(error, 'code');
    throw new CompilationCaptureError(
      typeof code === 'string' && safeCodes.has(code)
        ? code
        : error instanceof CompilationInputContractError && error.code === 'CANCELLED'
          ? 'CANCELLED'
          : 'CAPTURE_FAILED',
      unknownCleanup ? 'UNKNOWN' : 'SETTLED',
    );
  }
}
