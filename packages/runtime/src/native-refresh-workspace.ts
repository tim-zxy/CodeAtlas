import type { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { applyAnalysisPatch, parseFullAnalysisSnapshot } from '../../application/dist/index.js';
import {
  selectMergedGroup,
  streamNativeRefreshV3,
  validateNativeRefreshOverlay,
  type NativeClientOptions,
} from '../../providers/dist/index.js';
import { normalizeNativeStagedPatch } from '../../providers/dist/staged-patch.js';
import { RepositoryCanonicalFactStore, RepositoryPatchStage } from '../../storage/dist/index.js';
import {
  observeNativeApplySql,
  endNativeSqlSourceFor,
  nativeSqlSourceRole,
  proveNativeSqlDisposition,
  nativeSqlPartialCompletion,
  withNativeSqlSourceFamily,
  type NativeApplySqlObservation,
} from '../../storage/dist/analysis/native-apply-sql-observation.js';
import {
  assertNativeRefreshSqlBudget,
  type createNativeRefreshPreparation,
} from './native-refresh-preparation.js';
import type { PatchAnalysisMeasurement } from './patch-analysis.js';

interface SqlOwner {
  accept: (record: NativeApplySqlObservation) => void;
  active: boolean;
  calls: number;
  captureFailed: boolean;
  captureFailure: unknown;
}
const normalizationSqlContext = new AsyncLocalStorage<SqlOwner>();
const completionSqlContext = new AsyncLocalStorage<SqlOwner>();

/** Private offline diagnostic bridge; absent from Runtime's package index. */
export async function observeNativeRefreshNormalizationSql<T>(
  operation: () => T | Promise<T>,
  accept: (record: NativeApplySqlObservation) => void,
) {
  const { calls, ...capture } = await observeSql(normalizationSqlContext, operation, accept);
  return Object.freeze({ ...capture, normalizationCalls: calls });
}

/** Completion is a separate private role, including PARTIAL snapshot construction. */
export async function observeNativeRefreshCompletionSql<T>(
  operation: () => T | Promise<T>,
  accept: (record: NativeApplySqlObservation) => void,
) {
  const { calls, ...capture } = await observeSql(completionSqlContext, operation, accept);
  return Object.freeze({ ...capture, completionCalls: calls });
}

async function observeSql<T>(
  context: AsyncLocalStorage<SqlOwner>,
  operation: () => T | Promise<T>,
  accept: (record: NativeApplySqlObservation) => void,
) {
  const owner = {
    accept,
    active: true,
    calls: 0,
    captureFailed: false,
    captureFailure: undefined as unknown,
  };
  return context.run(owner, async () => {
    let value: T | undefined;
    let error: unknown;
    let threw = false;
    try {
      value = await operation();
    } catch (failure) {
      threw = true;
      error = failure;
    } finally {
      owner.active = false;
    }
    return Object.freeze({
      value,
      error,
      threw,
      calls: owner.calls,
      captureFailed: owner.captureFailed,
      captureFailure: owner.captureFailure,
    });
  });
}

/** Only this synchronous invocation owns raw SQL frames, never the async scope. */
function withSql<T>(
  context: AsyncLocalStorage<SqlOwner>,
  family: 'COMPLETION' | 'NORMALIZE',
  operation: () => T,
): T {
  return withNativeSqlSourceFamily(family, () => withObservedSql(context, operation));
}

function withObservedSql<T>(context: AsyncLocalStorage<SqlOwner>, operation: () => T): T {
  const owner = context.getStore();
  if (!owner?.active) return operation();
  owner.calls++;
  const capture = observeNativeApplySql((record) => {
    if (!owner.captureFailed) owner.accept(record);
  }, operation);
  if (capture.captureFailed && !owner.captureFailed) {
    owner.captureFailed = true;
    owner.captureFailure = capture.captureFailure;
  }
  if (capture.threw) throw capture.error;
  return capture.value as T;
}

export interface NativeRefreshMeasurement extends PatchAnalysisMeasurement {
  readonly stageBytes: number;
  readonly stageRetention: ReturnType<RepositoryPatchStage['readNativeRetentionMeasurement']>;
  readonly effectiveWorkers: number | null;
  /** Explicit launch request only; unknown original AUTO/configuration mode is not inferred. */
  readonly requestedWorkers: number | null;
  readonly nodePeakBytes: number;
  readonly nodePeakMethod: 'resourceUsage.maxRSS';
  readonly nodePeakUnits: 'bytes';
  readonly nodePeakScope: 'PROCESS_LIFETIME_HIGH_WATER';
  readonly nativeParseMs: null;
  readonly nativeResolveMs: null;
  readonly childPeakBytes: null;
  readonly unavailableReason: string;
}

/** Private common kernel: admitted production and explicit offline calibration only.
 * Not exported through Runtime's package index and has no product bypass option.
 */
export async function applyPreparedNativeRefreshAnalysisV3(
  database: DatabaseSync,
  prepared: ReturnType<typeof createNativeRefreshPreparation>,
  options: NativeClientOptions,
): Promise<NativeRefreshMeasurement> {
  try {
    return await applyPreparedNativeRefreshAnalysisOwned(database, prepared, options);
  } finally {
    // Includes budget/constructor failures before the Stage's own try/finally.
    endNativeSqlSourceFor(prepared);
  }
}

async function applyPreparedNativeRefreshAnalysisOwned(
  database: DatabaseSync,
  prepared: ReturnType<typeof createNativeRefreshPreparation>,
  options: NativeClientOptions,
): Promise<NativeRefreshMeasurement> {
  const { request, descriptor, trustedContext, token, limits } = prepared;
  const p = request.payload;
  const started = performance.now();
  assertNativeRefreshSqlBudget(prepared.retainedSqlBytes, limits);
  const stage = new RepositoryPatchStage(
    database,
    (group) => selectMergedGroup(group).fact,
    { ...limits, memoryBudgetBytes: limits.memoryBudgetBytes - 2 * prepared.retainedSqlBytes },
    { baseline: prepared.baselineState, targetSourceFiles: prepared.targetSourceFiles },
  );
  let transportMs = 0,
    normalizeMs = 0,
    dbApplyMs = 0,
    dbLockMs = 0,
    stageBytes = 0;
  let partialObservation = false,
    applyInvoked = false,
    transportReturned = false;
  try {
    const store = new RepositoryCanonicalFactStore(database);
    await applyAnalysisPatch(
      {
        repositoryId: p.repository.id,
        baseRevisionId: p.baseRevisionId,
        baseContentFingerprint: p.baseRevisionFingerprint,
        targetRevisionId: p.targetRevision.id,
        targetContentFingerprint: p.targetRevision.contentFingerprint,
      },
      {
        observeAndStage: async () => {
          const startedAt = new Date().toISOString();
          const transportStarted = performance.now();
          const { terminal } = await streamNativeRefreshV3(
            request,
            prepared.baseline,
            options,
            {
              async accept(event) {
                if (event.type === 'ANALYSIS_SUMMARY')
                  await stage.acceptNativeSummary(event.payload);
                else if (event.type !== 'REFRESH_STARTED') await stage.acceptNativeEvent(event);
              },
            },
            limits.memoryBudgetBytes,
          );
          transportReturned = true;
          transportMs = performance.now() - transportStarted;
          const snapshot = withSql(completionSqlContext, 'COMPLETION', () => {
            const snapshot = parseFullAnalysisSnapshot({
              id: p.providerSnapshotId,
              repositoryId: p.repository.id,
              providerId: descriptor.providerId,
              providerVersion: descriptor.providerVersion,
              runtimeVersion: descriptor.runtimeVersion,
              requestedRevisionId: p.targetRevision.id,
              requestedRevisionFingerprint: p.targetRevision.contentFingerprint,
              startedAt,
              completedAt: new Date().toISOString(),
              capabilities: terminal.payload.capabilities,
              diagnostics: [...stage.readDiagnostics()],
              outcome: terminal.payload.outcome,
            });
            if (snapshot.outcome === 'SUCCEEDED') stage.confirmNativeSucceeded(terminal, snapshot);
            else if (snapshot.outcome === 'PARTIAL') nativeSqlPartialCompletion();
            return snapshot;
          });
          if (snapshot.outcome === 'SUCCEEDED') {
            const normalizeStarted = performance.now();
            withSql(normalizationSqlContext, 'NORMALIZE', () =>
              normalizeNativeStagedPatch(
                stage,
                {
                  repositoryId: p.repository.id,
                  revisionId: p.targetRevision.id,
                  contentFingerprint: p.targetRevision.contentFingerprint,
                  snapshotId: p.providerSnapshotId,
                  changedSourceFiles: [...p.changes.added, ...p.changes.modified],
                },
                snapshot,
              ),
            );
            normalizeMs = performance.now() - normalizeStarted;
            withNativeSqlSourceFamily('SEAL', () =>
              stage.sealNativePatchState(trustedContext, token, validateNativeRefreshOverlay),
            );
            stageBytes = stage.estimatedTempBytes();
          } else if (snapshot.outcome === 'PARTIAL') {
            const role = nativeSqlSourceRole();
            if (role !== null) {
              proveNativeSqlDisposition(
                'NORMALIZE',
                role,
                'PROVEN_NOT_REACHED',
                'PARTIAL snapshot skips normalization',
              );
              proveNativeSqlDisposition(
                'SEAL',
                role,
                'PROVEN_NOT_REACHED',
                'PARTIAL snapshot skips overlay seal',
              );
            }
            partialObservation = terminal.payload.outcome === 'PARTIAL';
          }
          return { outcome: terminal.payload.outcome, snapshot, stage };
        },
        factStore: {
          applyAnalysisPatch(candidate, expected) {
            applyInvoked = true;
            const applyStarted = performance.now();
            dbLockMs = withNativeSqlSourceFamily('APPLY', () =>
              store.applyNativeAnalysisPatch(candidate, expected, token),
            );
            dbApplyMs = performance.now() - applyStarted;
          },
        },
      },
    );
    const args = options.arguments ?? [];
    const effectiveWorkers =
      args.length === 2 &&
      args[0] === '--parse-workers' &&
      Number.isSafeInteger(Number(args[1])) &&
      Number(args[1]) > 0
        ? Number(args[1])
        : null;
    return {
      transportMs,
      normalizeMs,
      dbApplyMs,
      dbLockMs,
      stageBytes,
      stageRetention: stage.readNativeRetentionMeasurement(),
      totalMs: performance.now() - started,
      effectiveWorkers,
      requestedWorkers: effectiveWorkers,
      nodePeakBytes: process.resourceUsage().maxRSS * 1024,
      nodePeakMethod: 'resourceUsage.maxRSS',
      nodePeakUnits: 'bytes',
      nodePeakScope: 'PROCESS_LIFETIME_HIGH_WATER',
      nativeParseMs: null,
      nativeResolveMs: null,
      childPeakBytes: null,
      unavailableReason:
        'Combined transport timing; native phase timing and child peak are not observed',
    };
  } catch (failure) {
    const role = nativeSqlSourceRole();
    // These synchronous source phases occur only after the awaited transport
    // returns successfully. A terminal frame alone does not establish that return.
    if (role !== null && !transportReturned)
      for (const family of ['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'] as const)
        proveNativeSqlDisposition(
          family,
          role,
          'PROVEN_NOT_REACHED',
          'Transport failed before returning to the downstream source phases',
        );
    if (role !== null && partialObservation && !applyInvoked)
      proveNativeSqlDisposition(
        'APPLY',
        role,
        'PROVEN_NOT_REACHED',
        'Application refused PARTIAL before the Store port',
      );
    throw failure;
  } finally {
    stage.close();
  }
}
