import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { inspect } from 'node:util';
import { nativeMetadataEnvironment } from '../../dist/native-metadata-admission.js';
import {
  applyPreparedNativeRefreshAnalysisV3,
  observeNativeRefreshCompletionSql,
  observeNativeRefreshNormalizationSql,
} from '../../dist/native-refresh-workspace.js';
import { observeNativeRefreshWorkspace } from '../../../providers/dist/native-refresh-workspace-observation.js';
import {
  observeNativeApplySql,
  observeNativeStageAccounting,
  observeNativeSqlLifetime,
  withNativeSqlSourceRole,
  endNativeSqlSourceFor,
  proveNativeSqlDisposition,
  nativeSqlSourceRole,
  validateNativeStageBudgetComponents,
} from '../../../storage/dist/analysis/native-apply-sql-observation.js';
import { createNativeRefreshPreparation } from '../../dist/native-refresh-preparation.js';
import { applyNativeRefreshAnalysisV3 } from '../../dist/native-refresh-composition.js';
import { observeNativeRefreshComposition } from '../../dist/native-refresh-composition-observation.js';
import {
  readNativeAnalysisState,
  RepositoryPatchStage,
  RepositorySourceStateStore,
  RepositoryCanonicalFactStore,
} from '../../../storage/dist/index.js';
import { withNativeSourceStateReadLifetime } from '../../../storage/dist/source-state/repository.js';
import {
  streamNativeRefreshV3,
  validateNativeStateCandidate,
} from '../../../providers/dist/index.js';
import { observeNativeWire } from './native-refresh-wire-probe.mjs';
import {
  preparedSourceInputBoundary,
  preparedSharedOwnersBoundary,
  preparedCompleteCoverageBoundary,
} from './native-refresh-source-input-boundary.mjs';
import { preparedRetainedSitesBoundary } from './native-refresh-retained-sites-boundary.mjs';
import { preparedDenseRemoveBoundary } from './native-refresh-dense-remove-boundary.mjs';
import {
  prepareDenseUpsertBoundary,
  denseUpsertTransition,
} from './native-refresh-dense-upsert-boundary.mjs';
import {
  preparedSourceRefresh,
  sourceTransitions,
  assertSourceRelations,
  activationImage,
  observeRefreshBaselineRead,
} from './native-refresh-source-fixture.mjs';

// Preparation diagnostics only, not a complete22-class calibration worker.
// A process-local module marker survives repeated calls; OS PIDs may be reused.
// Private parent provenance only, never a FunctionalReplayReceipt/IPC field.
export const refreshReplayProcessIdentity = Object.freeze({
  pid: process.pid,
  nonce: randomUUID(),
});

export function captureRefreshSourceLifetime(operation, requirements) {
  return observeNativeSqlLifetime(operation, requirements);
}

let activeSnapshotCapture;
const snapshotActor = new AsyncLocalStorage();

// Actor provenance remains available in diagnostic mode even without an R1
// lifetime capture. Keep the existing SQL role scope and its behavior intact.
function withRefreshWorkerRole(role, operation) {
  return snapshotActor.run(role, () => withNativeSqlSourceRole(role, operation));
}

// Serial fixture instrumentation at the original Store boundary. Never read result
// SQL or retain snapshot objects; failed observations cannot replace an operation.
export async function captureRefreshSnapshotMetadata(operation, expectedSnapshots) {
  const expected = new Map();
  for (const { role, snapshotId } of expectedSnapshots) {
    assert.ok(['MAIN', 'COMPETITOR', 'RETRY'].includes(role));
    assert.ok(typeof snapshotId === 'string' && snapshotId.length > 0);
    assert.ok(!expected.has(snapshotId), 'Duplicate declared snapshot');
    expected.set(snapshotId, role);
  }
  const prototype = RepositoryCanonicalFactStore.prototype;
  const original = prototype.applyNativeAnalysisPatch;
  const parent = activeSnapshotCapture;
  const scope = {};
  const entries = [];
  let captureFailed = false;
  const data = (value, key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(property && Object.hasOwn(property, 'value'), 'Snapshot must contain data fields');
    return property.value;
  };
  const timestamp = (value) => {
    assert.equal(typeof value, 'string');
    const time = Date.parse(value);
    assert.ok(Number.isSafeInteger(time) && time >= 0);
    assert.equal(new Date(time).toISOString(), value);
    return time;
  };
  const invocationStartedAt = Date.now();
  const observed = function (...args) {
    if (activeSnapshotCapture !== scope) return original.apply(this, args);
    let candidate;
    try {
      const snapshot = data(args[1], 'snapshot');
      candidate = {
        role: snapshotActor.getStore() ?? nativeSqlSourceRole() ?? 'MAIN',
        snapshotId: data(snapshot, 'id'),
        startedAt: data(snapshot, 'startedAt'),
        completedAt: data(snapshot, 'completedAt'),
      };
    } catch {
      // Record incompleteness only if this Store call actually commits.
    }
    const result = original.apply(this, args);
    try {
      assert.ok(candidate);
      assert.equal(expected.get(candidate.snapshotId), candidate.role);
      assert.ok(!entries.some((entry) => entry.snapshotId === candidate.snapshotId));
      const entry = {
        role: candidate.role,
        snapshotId: candidate.snapshotId,
        startedAt: timestamp(candidate.startedAt),
        completedAt: timestamp(candidate.completedAt),
      };
      assert.ok(invocationStartedAt <= entry.startedAt && entry.startedAt <= entry.completedAt);
      entries.push(Object.freeze(entry));
    } catch {
      captureFailed = true;
    }
    return result;
  };
  let value, error;
  let threw = false;
  prototype.applyNativeAnalysisPatch = observed;
  activeSnapshotCapture = scope;
  try {
    value = await operation();
  } catch (failure) {
    threw = true;
    error = failure;
  } finally {
    captureFailed ||= prototype.applyNativeAnalysisPatch !== observed;
    prototype.applyNativeAnalysisPatch = original;
    activeSnapshotCapture = parent;
  }
  const invocationFinishedAt = Date.now();
  captureFailed ||=
    !Number.isSafeInteger(invocationStartedAt) ||
    !Number.isSafeInteger(invocationFinishedAt) ||
    invocationStartedAt < 0 ||
    invocationFinishedAt < invocationStartedAt ||
    entries.some((entry) => entry.completedAt > invocationFinishedAt);
  return {
    value,
    error,
    threw,
    captureFailed,
    metadata: captureFailed
      ? null
      : Object.freeze({
          invocationStartedAt,
          invocationFinishedAt,
          entries: Object.freeze(
            entries.sort((a, b) =>
              a.role < b.role
                ? -1
                : a.role > b.role
                  ? 1
                  : a.snapshotId < b.snapshotId
                    ? -1
                    : a.snapshotId > b.snapshotId
                      ? 1
                      : 0,
            ),
          ),
        }),
  };
}

// Serial, test-only entry counter: unlike SQL collectors, nested collectors cannot
// suppress this count. Only the supplied narrow operation is covered.
export async function observeRetryApplyCalls(operation) {
  const prototype = RepositoryCanonicalFactStore.prototype;
  const original = prototype.applyNativeAnalysisPatch;
  let applyCalls = 0;
  const counted = function (...args) {
    applyCalls++;
    return original.apply(this, args);
  };
  let value, error;
  let threw = false;
  let guarded = false;
  prototype.applyNativeAnalysisPatch = counted;
  try {
    value = await operation();
  } catch (failure) {
    threw = true;
    error = failure;
  } finally {
    guarded = prototype.applyNativeAnalysisPatch === counted && Number.isSafeInteger(applyCalls);
    prototype.applyNativeAnalysisPatch = original;
  }
  return { value, error, threw, guarded, applyCalls };
}

const recipes = {
  'd-preparation-input': ['source-empty-input-boundary', 'SUCCEEDED'],
  'd-retained-sites': ['source-field-sites-boundary', 'SUCCEEDED'],
  'd-shared-owners': ['source-shared-owners-boundary', 'SUCCEEDED'],
  'd-dense-upsert': ['source-dense-upsert-boundary', 'SUCCEEDED'],
  'd-dense-remove': ['source-dense-remove-boundary', 'SUCCEEDED'],
  'd-complete-coverage': ['source-complete-coverage-boundary', 'SUCCEEDED'],
  'd-overlay-retention': ['source-complete-coverage-boundary', 'SUCCEEDED'],
  'd-delete': ['shared-last-owner-deletion-zero-target', 'SUCCEEDED'],
  'd-empty': ['empty-file-noop', 'SUCCEEDED'],
  'd-zero-fact': ['zero-files-noop', 'SUCCEEDED'],
  'd-rollback': ['modify-call-target', 'ERR_SQLITE_ERROR'],
  'd-reopen': ['modify-call-target', 'SUCCEEDED'],
  'd-dependent-edge': ['add-method-unknown-to-resolved', 'SUCCEEDED'],
  'd-slow-sink': ['modify-call-target', 'SUCCEEDED'],
  'd-slow-stdin': ['source-empty-input-boundary', 'CANCELLED'],
  'd-cancel': ['modify-call-target', 'CANCELLED'],
  'd-sql-preflight': ['modify-call-target', 'RESOURCE_LIMIT_EXCEEDED'],
  'd-source-race': ['modify-call-target', 'WORKER_EXCEPTION'],
  'd-token-race': ['empty-file-noop', 'WORKER_EXCEPTION'],
  'd-partial': ['empty-file-noop', 'WORKER_EXCEPTION'],
  'd-corrupt': ['empty-file-noop', 'CHECKSUM_MISMATCH'],
  'd-late-exit': ['empty-file-noop', 'PROCESS_FAILED'],
};
// Shared private catalog, copied/frozen so record validation cannot mutate diagnostic recipes.
export const refreshTransportRecipes = Object.freeze(
  Object.fromEntries(
    Object.entries(recipes).map(([name, pair]) => [name, Object.freeze([...pair])]),
  ),
);
const failureDiagnostic = (error) =>
  String(error?.stack ?? error?.message ?? inspect(error)) || 'Empty error diagnostic';
async function recipeIdentity(name, transition) {
  const hash = createHash('sha256').update(name + '\0' + JSON.stringify(transition) + '\0');
  const artifacts = [
    ...new Set([...Object.values(transition.baseline), ...Object.values(transition.target)]),
  ].sort();
  for (const artifact of artifacts) {
    const raw =
      transition.generatedSources?.[artifact] === undefined
        ? await readFile(
            new URL(
              '../../../../fixtures/native/java-refresh-producer/source/' + artifact,
              import.meta.url,
            ),
          )
        : Buffer.from(transition.generatedSources[artifact]);
    assert.equal(raw.includes(13), false, 'Source recipe must use pinned LF bytes');
    hash.update(artifact + '\0').update(raw);
  }
  return { sourceTransition: transition.id, payloadDigest: hash.digest('hex') };
}
function assertClosed(db) {
  assert.equal(db.isTransaction, false);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%' OR type='trigger'",
      )
      .get().n,
    0,
  );
}

/** Exact original preparation retention, not a seal/Apply/lifetime SQL peak.
 * No SQL reread or second complete-result cache is introduced by this observer.
 */
export function refreshPreparationSqlDiagnostic(prepared) {
  const retainedSqlBytes = prepared.retainedSqlBytes;
  assert.ok(Number.isSafeInteger(retainedSqlBytes) && retainedSqlBytes >= 0);
  assert.ok(Number.isSafeInteger(2 * retainedSqlBytes));
  const baselineHeaderSqlBytes = Buffer.byteLength(prepared.baselineState.headerJson);
  const baselineSummarySqlBytes = prepared.baselineState.files.reduce(
    (bytes, file) => bytes + Buffer.byteLength(file.summaryJson),
    0,
  );
  assert.ok(
    retainedSqlBytes >= baselineHeaderSqlBytes + baselineSummarySqlBytes,
    'Incomplete preparation SQL retention',
  );
  return Object.freeze({
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes,
    retainedSqlStringChargeBytes: 2 * retainedSqlBytes,
    baselineHeaderSqlBytes,
    baselineSummarySqlBytes,
  });
}

/** The preparation owner is pinned throughout this kernel's Stage lifetime.
 * Add that constant to existing conservative Stage accounting, never a separate
 * read-phase peak. This remains partial accounting, not live allocation/RSS.
 */
export function refreshPreparedStageDiagnostic(prepared, stage) {
  const preparedSqlBytes = refreshPreparationSqlDiagnostic(prepared).retainedSqlBytes;
  assert.equal(stage?.scope, 'STAGE_SQL_ACCOUNTING_ONLY');
  for (const bytes of [
    stage.retainedSqlBytes,
    stage.retainedSqlStringChargeBytes,
    stage.retainedStringChargePeakBytes,
  ])
    assert.ok(Number.isSafeInteger(bytes) && bytes >= 0);
  assert.equal(stage.retainedSqlStringChargeBytes, 2 * stage.retainedSqlBytes);
  assert.ok(stage.retainedStringChargePeakBytes >= stage.retainedSqlStringChargeBytes);
  const retainedSqlBytes = preparedSqlBytes + stage.retainedSqlBytes;
  const retainedSqlStringChargeBytes = 2 * retainedSqlBytes;
  const retainedStringChargePeakBytes = 2 * preparedSqlBytes + stage.retainedStringChargePeakBytes;
  for (const bytes of [
    retainedSqlBytes,
    retainedSqlStringChargeBytes,
    retainedStringChargePeakBytes,
  ])
    assert.ok(Number.isSafeInteger(bytes) && bytes >= 0);
  return Object.freeze({
    scope: 'PREPARATION_STAGE_ACCOUNTING_ONLY',
    preparedSqlBytes,
    stageSqlBytes: stage.retainedSqlBytes,
    retainedSqlBytes,
    retainedSqlStringChargeBytes,
    retainedStringChargePeakBytes,
  });
}

/** Both preparations are pinned while the competitor owns this Stage.
 * This bound does not include a separate read-phase maximum or unknown owners.
 */
export function refreshCompetitorStageDiagnostic(original, competitor, stage) {
  const originalPreparedSqlBytes = refreshPreparationSqlDiagnostic(original).retainedSqlBytes;
  const overlap = refreshPreparedStageDiagnostic(competitor, stage);
  const retainedSqlBytes = originalPreparedSqlBytes + overlap.retainedSqlBytes;
  const retainedStringChargePeakBytes =
    2 * originalPreparedSqlBytes + overlap.retainedStringChargePeakBytes;
  assert.ok(Number.isSafeInteger(2 * retainedSqlBytes));
  assert.ok(Number.isSafeInteger(retainedStringChargePeakBytes));
  return Object.freeze({
    scope: 'PREPARATIONS_STAGE_ACCOUNTING_ONLY',
    originalPreparedSqlBytes,
    competitorPreparedSqlBytes: overlap.preparedSqlBytes,
    stageSqlBytes: overlap.stageSqlBytes,
    retainedSqlBytes,
    retainedSqlStringChargeBytes: 2 * retainedSqlBytes,
    retainedStringChargePeakBytes,
  });
}

/** Current synchronous SQL gauge plus preparations proven pinned by the caller.
 * Stage/read high-water records are not current gauges and cannot be joined here.
 */
export function refreshPreparedSqlCheckpoint(preparations, record) {
  const safe = (n) => assert.ok(Number.isSafeInteger(n) && n >= 0 && Number.isSafeInteger(2 * n));
  assert.ok(Array.isArray(preparations) && preparations.length >= 1 && preparations.length <= 2);
  assert.equal(new Set(preparations).size, preparations.length, 'Duplicate preparation alias');
  let preparedSqlBytes = 0;
  for (const preparation of preparations) {
    assert.equal(preparation?.scope, 'PREPARATION_RETENTION_ONLY');
    safe(preparation.retainedSqlBytes);
    assert.equal(preparation.retainedSqlStringChargeBytes, 2 * preparation.retainedSqlBytes);
    preparedSqlBytes += preparation.retainedSqlBytes;
    safe(preparedSqlBytes);
  }
  assert.equal(record?.scope, 'APPLY_RAW_SQL_OWNERSHIP_ONLY');
  assert.ok(record.boundary === 'ENTER' || record.boundary === 'EXIT');
  assert.ok(typeof record.phase === 'string' && record.phase.length > 0);
  safe(record.retainedSqlBytes);
  assert.equal(record.retainedSqlStringChargeBytes, 2 * record.retainedSqlBytes);
  const retainedSqlBytes = preparedSqlBytes + record.retainedSqlBytes;
  safe(retainedSqlBytes);
  return Object.freeze({
    scope: 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY',
    preparationCount: preparations.length,
    preparedSqlBytes,
    scopedSqlBytes: record.retainedSqlBytes,
    retainedSqlBytes,
    retainedSqlStringChargeBytes: 2 * retainedSqlBytes,
  });
}

/** Single offline competitor operation, never a product or concurrent hook.
 * Capture is separate from the original value/error, even when close fails.
 */
const activeSqlCaptures = { apply: undefined, seal: undefined };

/** Offline, serial worker only. The SQL owner exists solely during synchronous Store Apply.
 * Nested competitor wrappers bypass inherited collectors rather than charging both roles.
 */
export async function observeRefreshApplySql(operation, onRecord, preparations) {
  return observeRefreshSql(operation, onRecord, 'apply', preparations);
}

export async function observeRefreshSealSql(operation, onRecord, preparations) {
  return observeRefreshSql(operation, onRecord, 'seal', preparations);
}

export async function observeRefreshNormalizeSql(operation, onRecord, preparations) {
  return observeRefreshSql(operation, onRecord, 'normalize', preparations);
}

export async function observeRefreshCompletionSql(operation, onRecord, preparations) {
  return observeRefreshSql(operation, onRecord, 'completion', preparations);
}

/** Pinned preparations plus this accounting checkpoint only. Mixed charge includes
 * detached/workspace budget; neither that charge nor SQL bytes is physical liveness.
 */
export function refreshPreparedStageCheckpoint(preparations, record) {
  const safe = (n) => assert.ok(Number.isSafeInteger(n) && n >= 0 && Number.isSafeInteger(2 * n));
  assert.ok(Array.isArray(preparations) && preparations.length >= 1 && preparations.length <= 2);
  assert.equal(new Set(preparations).size, preparations.length, 'Duplicate preparation alias');
  let preparedSqlBytes = 0;
  for (const preparation of preparations) {
    assert.equal(preparation?.scope, 'PREPARATION_RETENTION_ONLY');
    safe(preparation.retainedSqlBytes);
    assert.equal(preparation.retainedSqlStringChargeBytes, 2 * preparation.retainedSqlBytes);
    preparedSqlBytes += preparation.retainedSqlBytes;
    safe(preparedSqlBytes);
  }
  assert.equal(record?.scope, 'STAGE_ACCOUNTING_CHECKPOINT_ONLY');
  assert.ok(Number.isSafeInteger(record.stageId) && record.stageId > 0);
  safe(record.retainedSqlBytes);
  assert.ok(Number.isSafeInteger(record.retainedStringChargeBytes));
  assert.ok(record.retainedStringChargeBytes >= 2 * record.retainedSqlBytes);
  const retainedSqlBytes = preparedSqlBytes + record.retainedSqlBytes;
  const retainedStringChargeBytes = 2 * preparedSqlBytes + record.retainedStringChargeBytes;
  safe(retainedSqlBytes);
  assert.ok(Number.isSafeInteger(retainedStringChargeBytes));
  return Object.freeze({
    scope: 'PREPARATIONS_STAGE_CHECKPOINT_ACCOUNTING_ONLY',
    stageId: record.stageId,
    preparationCount: preparations.length,
    preparedSqlBytes,
    stageSqlBytes: record.retainedSqlBytes,
    retainedSqlBytes,
    retainedSqlStringChargeBytes: 2 * retainedSqlBytes,
    retainedStringChargeBytes,
  });
}

export async function observeRefreshStageAccounting(operation, onRecord, preparations) {
  const stages = new Map();
  let pinned = null;
  const capture = await observeNativeStageAccounting(operation, (record) => {
    const overlap =
      preparations === undefined ? null : refreshPreparedStageCheckpoint(preparations, record);
    if (overlap !== null) {
      if (pinned !== null) {
        assert.equal(
          overlap.preparationCount,
          pinned.preparationCount,
          'Pinned preparation count changed',
        );
        assert.equal(
          overlap.preparedSqlBytes,
          pinned.preparedSqlBytes,
          'Pinned preparation accounting changed',
        );
      } else pinned = overlap;
    }
    const stage = stages.get(record.stageId) ?? {
      stageId: record.stageId,
      checkpoints: 0,
      maximumSqlBytes: 0,
      maximumStringChargeBytes: 0,
      lastSqlBytes: null,
      lastStringChargeBytes: null,
      preparationOverlap: null,
      rawSqlCheckpoints: 0,
      rawSqlAbsentCheckpoints: 0,
      lastRawSql: null,
      lastEnclosingRawSql: null,
      budgetComponentCheckpoints: 0,
      budgetComponentsAbsentCheckpoints: 0,
      lastBudgetComponents: null,
    };
    stage.checkpoints++;
    stage.maximumSqlBytes = Math.max(stage.maximumSqlBytes, record.retainedSqlBytes);
    stage.maximumStringChargeBytes = Math.max(
      stage.maximumStringChargeBytes,
      record.retainedStringChargeBytes,
    );
    stage.lastSqlBytes = record.retainedSqlBytes;
    stage.lastStringChargeBytes = record.retainedStringChargeBytes;
    // Bounded last-point evidence, not an additive owner union or a raw history.
    if (record.rawSql === null) stage.rawSqlAbsentCheckpoints++;
    else stage.rawSqlCheckpoints++;
    stage.lastRawSql = record.rawSql;
    stage.lastEnclosingRawSql = record.enclosingRawSql;
    if (record.budgetComponents === null) stage.budgetComponentsAbsentCheckpoints++;
    else stage.budgetComponentCheckpoints++;
    stage.lastBudgetComponents = record.budgetComponents;
    if (overlap !== null) {
      const previous = stage.preparationOverlap;
      stage.preparationOverlap = Object.freeze({
        scope: 'PREPARATIONS_STAGE_CHECKPOINT_AGGREGATE_ONLY',
        preparationCount: overlap.preparationCount,
        preparedSqlBytes: overlap.preparedSqlBytes,
        checkpoints: stage.checkpoints,
        maximumSqlBytes: Math.max(previous?.maximumSqlBytes ?? 0, overlap.retainedSqlBytes),
        maximumStringChargeBytes: Math.max(
          previous?.maximumStringChargeBytes ?? 0,
          overlap.retainedStringChargeBytes,
        ),
        lastSqlBytes: overlap.retainedSqlBytes,
        lastStringChargeBytes: overlap.retainedStringChargeBytes,
      });
    }
    stages.set(record.stageId, stage);
    onRecord?.(record);
  });
  return {
    ...capture,
    diagnostic: Object.freeze({
      scope: 'STAGE_ACCOUNTING_CHECKPOINT_AGGREGATE_ONLY',
      stages: Object.freeze([...stages.values()].map((stage) => Object.freeze(stage))),
    }),
  };
}

async function observeRefreshSql(operation, onRecord, role, preparations) {
  const seal = role === 'seal';
  const prototype = seal ? RepositoryPatchStage.prototype : RepositoryCanonicalFactStore.prototype;
  const method = seal ? 'sealNativePatchState' : 'applyNativeAnalysisPatch';
  const original = prototype[method];
  const parent = activeSqlCaptures[role];
  const scope = {};
  const phaseCounts = {};
  let calls = 0,
    checkpoints = 0,
    peak = 0,
    last = null;
  let value,
    error,
    threw = false,
    captureFailure = null;
  let overlap = null,
    overlapPeak = 0,
    overlapLast = null;
  const accept = (record) => {
    checkpoints++;
    const key = `${record.phase}_${record.boundary}`;
    phaseCounts[key] = (phaseCounts[key] ?? 0) + 1;
    peak = Math.max(peak, record.retainedSqlBytes);
    last = record.retainedSqlBytes;
    if (preparations !== undefined) {
      overlap = refreshPreparedSqlCheckpoint(preparations, record);
      overlapPeak = Math.max(overlapPeak, overlap.retainedSqlBytes);
      overlapLast = overlap.retainedSqlBytes;
    }
    onRecord?.(record);
  };
  if (role === 'normalize' || role === 'completion') {
    const capture = await (
      role === 'normalize'
        ? observeNativeRefreshNormalizationSql
        : observeNativeRefreshCompletionSql
    )(operation, accept);
    calls = role === 'normalize' ? capture.normalizationCalls : capture.completionCalls;
    value = capture.value;
    error = capture.error;
    threw = capture.threw;
    if (capture.captureFailed) captureFailure = failureDiagnostic(capture.captureFailure);
  } else {
    activeSqlCaptures[role] = scope;
    prototype[method] = function (...args) {
      if (activeSqlCaptures[role] !== scope) return original.apply(this, args);
      calls++;
      const capture = observeNativeApplySql(accept, () => original.apply(this, args));
      if (capture.captureFailed) captureFailure ??= failureDiagnostic(capture.captureFailure);
      if (capture.threw) throw capture.error;
      return capture.value;
    };
    try {
      value = await operation();
    } catch (failure) {
      threw = true;
      error = failure;
    } finally {
      prototype[method] = original;
      activeSqlCaptures[role] = parent;
    }
  }
  return {
    value,
    error,
    threw,
    [`${role}Calls`]: calls,
    captureFailure,
    preparedSql:
      overlap === null
        ? null
        : Object.freeze({
            scope: overlap.scope,
            preparationCount: overlap.preparationCount,
            preparedSqlBytes: overlap.preparedSqlBytes,
            checkpoints,
            scopedSqlHighWaterBytes: peak,
            retainedSqlBytes: overlapPeak,
            retainedSqlStringChargeBytes: 2 * overlapPeak,
            lastRetainedSqlBytes: overlapLast,
          }),
    sql:
      checkpoints === 0
        ? null
        : Object.freeze({
            scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
            checkpoints,
            phaseCounts: Object.freeze(phaseCounts),
            retainedSqlBytes: peak,
            retainedSqlStringChargeBytes: 2 * peak,
            lastRetainedSqlBytes: last,
          }),
  };
}

export async function observeCompetitorRefreshStage(operation) {
  const close = RepositoryPatchStage.prototype.close;
  let stage = null,
    captureFailure = null,
    value = null,
    error = null,
    threw = false;
  RepositoryPatchStage.prototype.close = function (...args) {
    try {
      return close.apply(this, args);
    } finally {
      try {
        assert.equal(stage, null, 'Only one competitor Stage may be observed');
        stage = this.readNativeRetentionMeasurement();
      } catch (failure) {
        captureFailure ??= failureDiagnostic(failure);
      }
    }
  };
  try {
    value = await operation();
  } catch (failure) {
    threw = true;
    error = failure;
  } finally {
    RepositoryPatchStage.prototype.close = close;
  }
  return { value, error, threw, stage, captureFailure };
}

/** This original preparation stays pinned throughout each additional read.
 * No disjoint read maxima are summed, and unavailable observations stay null.
 */
export function refreshAdditionalReadDiagnostic(
  preparation,
  readDiagnostic,
  nextPreparation = null,
) {
  assert.equal(preparation.scope, 'PREPARATION_RETENTION_ONLY');
  assert.equal(readDiagnostic.scope, 'REFRESH_READ_DIAGNOSTIC_ONLY');
  const bytes = (value) => {
    assert.ok(Number.isSafeInteger(value.retainedSqlBytes) && value.retainedSqlBytes >= 0);
    assert.ok(Number.isSafeInteger(2 * value.retainedSqlBytes));
    assert.equal(value.retainedSqlStringChargeBytes, 2 * value.retainedSqlBytes);
    return value.retainedSqlBytes;
  };
  const preparedSqlBytes = bytes(preparation);
  const read = readDiagnostic.sqlReadOwnership;
  if (read !== null) assert.equal(read.scope, 'REFRESH_READ_SQL_OWNERSHIP_ONLY');
  const readBytes = read === null ? null : bytes(read);
  const returned = read?.returnedSqlBytes ?? null;
  if (returned !== null) {
    assert.ok(Number.isSafeInteger(returned) && returned >= 0 && returned <= readBytes);
    assert.equal(readDiagnostic.status, 'AVAILABLE');
  }
  if (nextPreparation !== null) assert.equal(nextPreparation.scope, 'PREPARATION_RETENTION_ONLY');
  const additionalPreparationBytes = nextPreparation === null ? null : bytes(nextPreparation);
  if (additionalPreparationBytes !== null) {
    assert.notEqual(returned, null, 'Additional preparation requires a successful read handoff');
    assert.equal(returned, additionalPreparationBytes, 'Additional SQL read handoff differs');
  }
  const retainedSqlBytes = readBytes === null ? null : preparedSqlBytes + readBytes;
  if (retainedSqlBytes !== null) assert.ok(Number.isSafeInteger(2 * retainedSqlBytes));
  return Object.freeze({
    scope: 'PREPARATION_READ_ACCOUNTING_ONLY',
    preparedSqlBytes,
    readStatus: readDiagnostic.status,
    readReason: readDiagnostic.reason,
    readScopedHighWaterBytes: readBytes,
    readReturnedBytes: returned,
    additionalPreparationBytes,
    retainedSqlBytes,
    retainedSqlStringChargeBytes: retainedSqlBytes === null ? null : 2 * retainedSqlBytes,
    readToPreparationVerified: additionalPreparationBytes === null ? null : true,
  });
}

/** Join existing scoped evidence, not a new complete SQL/heap measurement. */
export function refreshTransportLifecycleDiagnostic(row, cleanup, workerFailed) {
  const safe = (value) => assert.ok(Number.isSafeInteger(value) && value >= 0);
  const sql = (value, scope) => {
    if (value === null) return null;
    assert.equal(value?.scope, scope);
    safe(value.retainedSqlBytes);
    safe(2 * value.retainedSqlBytes);
    assert.equal(value.retainedSqlStringChargeBytes, 2 * value.retainedSqlBytes);
    return value.retainedSqlBytes;
  };
  assert.ok([null, 'SELECTED_FIXTURE', 'GENERATOR_SEED'].includes(row.sqlReadFixtureRole));
  const read =
    row.sqlReadFixtureRole === 'SELECTED_FIXTURE'
      ? (row.sqlReadDiagnostic?.sqlReadOwnership ?? null)
      : null;
  const readBytes = sql(read, 'REFRESH_READ_SQL_OWNERSHIP_ONLY');
  const preparedBytes = sql(row.sqlPreparation, 'PREPARATION_RETENTION_ONLY');
  const stageBytes = sql(row.sqlStage, 'STAGE_SQL_ACCOUNTING_ONLY');
  const overlapBytes = sql(row.sqlPreparedStage, 'PREPARATION_STAGE_ACCOUNTING_ONLY');
  const returned = read?.returnedSqlBytes ?? null;
  if (returned !== null) {
    safe(returned);
    assert.ok(returned <= readBytes);
  }
  const readToPreparation = returned !== null && preparedBytes !== null;
  if (readToPreparation) assert.equal(returned, preparedBytes, 'SQL read handoff differs');
  if (stageBytes !== null) {
    safe(row.sqlStage.retainedStringChargePeakBytes);
    assert.ok(row.sqlStage.retainedStringChargePeakBytes >= 2 * stageBytes);
  }
  if (overlapBytes !== null) {
    assert.notEqual(preparedBytes, null);
    assert.notEqual(stageBytes, null);
    const expected = preparedBytes + stageBytes;
    const mixed = 2 * preparedBytes + row.sqlStage.retainedStringChargePeakBytes;
    safe(expected);
    safe(mixed);
    assert.equal(row.sqlPreparedStage.preparedSqlBytes, preparedBytes);
    assert.equal(row.sqlPreparedStage.stageSqlBytes, stageBytes);
    assert.equal(overlapBytes, expected);
    assert.equal(row.sqlPreparedStage.retainedStringChargePeakBytes, mixed);
  }
  assert.equal(row.peakMethod, 'resourceUsage.maxRSS');
  assert.equal(row.peakUnits, 'bytes');
  assert.equal(row.peakScope, 'NODE_PROCESS_LIFETIME_EXCLUDING_CHILD');
  assert.equal(row.samples[0]?.phase, 'startup');
  assert.equal(row.samples.at(-1)?.phase, 'finished');
  let peak = 0;
  for (const sample of row.samples) {
    safe(sample.peakKiB * 1024);
    assert.ok(sample.peakKiB > 0);
    peak = Math.max(peak, sample.peakKiB * 1024);
  }
  assert.equal(row.peakResidentBytes, peak);
  Object.values(cleanup).forEach(safe);
  assert.equal(cleanup.attempted, cleanup.registered);
  assert.equal(cleanup.succeeded + cleanup.failed, cleanup.attempted);
  assert.equal(typeof workerFailed, 'boolean');
  const verification = {};
  for (const key of ['persistentStateVerified', 'transactionClosed', 'tempClosed']) {
    assert.equal(typeof row[key], 'boolean');
    verification[key] = row[key];
  }
  const additionalReads = {};
  for (const role of ['competitor', 'retry']) {
    const record = row.sqlAdditionalReads?.[role] ?? null;
    additionalReads[role] = record === null ? null : Object.freeze({ ...record });
    if (record !== null) {
      assert.equal(record.scope, 'PREPARATION_READ_ACCOUNTING_ONLY');
      assert.equal(record.preparedSqlBytes, preparedBytes);
      if (record.readScopedHighWaterBytes !== null) safe(record.readScopedHighWaterBytes);
      if (record.readReturnedBytes !== null) {
        safe(record.readReturnedBytes);
        assert.notEqual(record.readScopedHighWaterBytes, null);
        assert.ok(record.readReturnedBytes <= record.readScopedHighWaterBytes);
        assert.equal(record.readStatus, 'AVAILABLE');
      }
      if (record.additionalPreparationBytes !== null) {
        safe(record.additionalPreparationBytes);
        assert.notEqual(record.readReturnedBytes, null);
        assert.equal(record.readReturnedBytes, record.additionalPreparationBytes);
        assert.equal(record.readToPreparationVerified, true);
      } else assert.equal(record.readToPreparationVerified, null);
      if (record.retainedSqlBytes !== null) {
        sql(record, record.scope);
        safe(record.readScopedHighWaterBytes);
        assert.equal(record.retainedSqlBytes, preparedBytes + record.readScopedHighWaterBytes);
      } else {
        assert.equal(record.readScopedHighWaterBytes, null);
        assert.equal(record.retainedSqlStringChargeBytes, null);
      }
    }
  }
  assert.equal(
    row.sqlCompetitorStageCaptureFailure ?? null,
    null,
    'Competitor Stage evidence capture failed',
  );
  const competitorStage = row.sqlCompetitorStage ?? null;
  if (competitorStage !== null) {
    sql(competitorStage, 'PREPARATIONS_STAGE_ACCOUNTING_ONLY');
    assert.equal(competitorStage.originalPreparedSqlBytes, preparedBytes);
    assert.notEqual(additionalReads.competitor, null);
    assert.equal(
      competitorStage.competitorPreparedSqlBytes,
      additionalReads.competitor.additionalPreparationBytes,
    );
    safe(competitorStage.stageSqlBytes);
    safe(competitorStage.retainedStringChargePeakBytes);
    assert.equal(
      competitorStage.retainedSqlBytes,
      preparedBytes + competitorStage.competitorPreparedSqlBytes + competitorStage.stageSqlBytes,
    );
    assert.ok(
      competitorStage.retainedStringChargePeakBytes >= 2 * competitorStage.retainedSqlBytes,
    );
  }
  const stageCheckpoints = {};
  for (const [role, prefix] of [
    ['main', 'stageAccounting'],
    ['competitor', 'competitorStageAccounting'],
  ]) {
    for (const suffix of ['', 'CaptureFailure'])
      assert.ok(
        Object.hasOwn(row, prefix + suffix) && row[prefix + suffix] !== undefined,
        `Stage accounting field missing: ${prefix + suffix}`,
      );
    assert.equal(row[prefix + 'CaptureFailure'], null, 'Stage accounting capture failed');
    const diagnostic = row[prefix];
    stageCheckpoints[role] = null;
    if (diagnostic === null) continue;
    assert.equal(diagnostic.scope, 'STAGE_ACCOUNTING_CHECKPOINT_AGGREGATE_ONLY');
    assert.ok(Array.isArray(diagnostic.stages));
    const ids = new Set();
    const stages = diagnostic.stages.map((stage) => {
      safe(stage.stageId);
      assert.ok(stage.stageId > 0 && !ids.has(stage.stageId));
      ids.add(stage.stageId);
      safe(stage.checkpoints);
      assert.ok(stage.checkpoints > 0);
      for (const key of [
        'maximumSqlBytes',
        'maximumStringChargeBytes',
        'lastSqlBytes',
        'lastStringChargeBytes',
      ])
        safe(stage[key]);
      safe(2 * stage.maximumSqlBytes);
      assert.ok(stage.maximumSqlBytes >= stage.lastSqlBytes);
      assert.ok(stage.maximumStringChargeBytes >= stage.lastStringChargeBytes);
      assert.ok(stage.maximumStringChargeBytes >= 2 * stage.maximumSqlBytes);
      assert.ok(stage.lastStringChargeBytes >= 2 * stage.lastSqlBytes);
      safe(stage.budgetComponentCheckpoints);
      safe(stage.budgetComponentsAbsentCheckpoints);
      safe(stage.budgetComponentCheckpoints + stage.budgetComponentsAbsentCheckpoints);
      assert.equal(
        stage.budgetComponentCheckpoints + stage.budgetComponentsAbsentCheckpoints,
        stage.checkpoints,
      );
      assert.notEqual(stage.lastBudgetComponents, undefined, 'Stage budget components missing');
      if (stage.lastBudgetComponents === null)
        assert.ok(stage.budgetComponentsAbsentCheckpoints > 0);
      else assert.ok(stage.budgetComponentCheckpoints > 0);
      const budgetComponents = validateNativeStageBudgetComponents(
        stage.lastBudgetComponents,
        stage.lastSqlBytes,
        stage.lastStringChargeBytes,
      );
      safe(stage.rawSqlCheckpoints);
      safe(stage.rawSqlAbsentCheckpoints);
      safe(stage.rawSqlCheckpoints + stage.rawSqlAbsentCheckpoints);
      assert.equal(stage.rawSqlCheckpoints + stage.rawSqlAbsentCheckpoints, stage.checkpoints);
      assert.notEqual(stage.lastRawSql, undefined, 'Current raw SQL evidence missing');
      if (stage.lastRawSql === null) {
        assert.ok(stage.rawSqlAbsentCheckpoints > 0);
        assert.equal(stage.lastEnclosingRawSql, null, 'Absent raw owner has enclosing evidence');
      } else {
        assert.ok(stage.rawSqlCheckpoints > 0);
        assert.equal(stage.lastRawSql.scope, 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY');
        safe(stage.lastRawSql.ownerId);
        assert.ok(stage.lastRawSql.ownerId > 0);
        safe(stage.lastRawSql.retainedSqlBytes);
        safe(2 * stage.lastRawSql.retainedSqlBytes);
        assert.equal(
          stage.lastRawSql.retainedSqlStringChargeBytes,
          2 * stage.lastRawSql.retainedSqlBytes,
        );
      }
      let enclosingRawSql = null;
      if (stage.lastRawSql !== null) {
        assert.ok(Array.isArray(stage.lastEnclosingRawSql), 'Enclosing raw SQL evidence missing');
        const ownerIds = new Set([stage.lastRawSql.ownerId]);
        enclosingRawSql = Object.freeze(
          stage.lastEnclosingRawSql.map((owner) => {
            assert.equal(owner.scope, 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY');
            safe(owner.ownerId);
            assert.ok(owner.ownerId > 0 && !ownerIds.has(owner.ownerId), 'Duplicate raw SQL owner');
            ownerIds.add(owner.ownerId);
            safe(owner.retainedSqlBytes);
            safe(2 * owner.retainedSqlBytes);
            assert.equal(owner.retainedSqlStringChargeBytes, 2 * owner.retainedSqlBytes);
            return Object.freeze({
              scope: owner.scope,
              ownerId: owner.ownerId,
              retainedSqlBytes: owner.retainedSqlBytes,
              retainedSqlStringChargeBytes: owner.retainedSqlStringChargeBytes,
            });
          }),
        );
        assert.equal(ownerIds.size, stage.lastEnclosingRawSql.length + 1, 'Sparse raw SQL owners');
      }
      const overlap = stage.preparationOverlap;
      assert.equal(overlap?.scope, 'PREPARATIONS_STAGE_CHECKPOINT_AGGREGATE_ONLY');
      assert.notEqual(preparedBytes, null);
      const competitor = role === 'competitor';
      if (competitor)
        assert.notEqual(additionalReads.competitor?.additionalPreparationBytes ?? null, null);
      const pinned =
        preparedBytes + (competitor ? additionalReads.competitor.additionalPreparationBytes : 0);
      safe(pinned);
      safe(2 * pinned);
      assert.equal(overlap.preparationCount, competitor ? 2 : 1);
      assert.equal(overlap.preparedSqlBytes, pinned);
      assert.equal(overlap.checkpoints, stage.checkpoints);
      for (const [key, expected] of [
        ['maximumSqlBytes', pinned + stage.maximumSqlBytes],
        ['lastSqlBytes', pinned + stage.lastSqlBytes],
        ['maximumStringChargeBytes', 2 * pinned + stage.maximumStringChargeBytes],
        ['lastStringChargeBytes', 2 * pinned + stage.lastStringChargeBytes],
      ]) {
        safe(expected);
        assert.equal(overlap[key], expected);
      }
      return Object.freeze({
        ...stage,
        lastBudgetComponents: budgetComponents,
        lastRawSql: stage.lastRawSql === null ? null : Object.freeze({ ...stage.lastRawSql }),
        lastEnclosingRawSql: enclosingRawSql,
        preparationOverlap: Object.freeze({ ...overlap }),
      });
    });
    stageCheckpoints[role] = Object.freeze({ ...diagnostic, stages: Object.freeze(stages) });
  }
  const applyRecords = {};
  for (const [role, prefix] of [
    ['apply', 'sqlApply'],
    ['competitorApply', 'sqlCompetitorApply'],
    ['seal', 'sqlSeal'],
    ['competitorSeal', 'sqlCompetitorSeal'],
    ['normalize', 'sqlNormalize'],
    ['competitorNormalize', 'sqlCompetitorNormalize'],
    ['completion', 'sqlCompletion'],
    ['competitorCompletion', 'sqlCompetitorCompletion'],
  ]) {
    for (const suffix of ['', 'Overlap', 'Calls', 'CaptureFailure']) {
      const key = `${prefix}${suffix}`;
      assert.ok(
        Object.hasOwn(row, key) && row[key] !== undefined,
        `Missing scoped SQL field: ${key}`,
      );
    }
    assert.equal(row[`${prefix}CaptureFailure`], null, 'Scoped SQL evidence capture failed');
    const calls = row[`${prefix}Calls`];
    safe(calls);
    const record = row[prefix];
    applyRecords[role] = record;
    if (record === null) continue;
    assert.ok(calls > 0);
    sql(record, 'APPLY_RAW_SQL_OWNERSHIP_ONLY');
    safe(record.checkpoints);
    assert.ok(record.checkpoints > 0);
    safe(record.lastRetainedSqlBytes);
    assert.equal(record.lastRetainedSqlBytes, 0, 'Unsettled scoped SQL ownership');
    let count = 0;
    for (const value of Object.values(record.phaseCounts)) {
      safe(value);
      assert.ok(value > 0);
      count += value;
      safe(count);
    }
    assert.equal(count, record.checkpoints);
    applyRecords[role] = Object.freeze({
      ...record,
      phaseCounts: Object.freeze({ ...record.phaseCounts }),
    });
  }
  const preparedOverlaps = {};
  for (const [role, prefix] of [
    ['completion', 'sqlCompletion'],
    ['normalize', 'sqlNormalize'],
    ['seal', 'sqlSeal'],
    ['apply', 'sqlApply'],
    ['competitorNormalize', 'sqlCompetitorNormalize'],
    ['competitorCompletion', 'sqlCompetitorCompletion'],
    ['competitorSeal', 'sqlCompetitorSeal'],
    ['competitorApply', 'sqlCompetitorApply'],
  ]) {
    const record = row[`${prefix}Overlap`];
    preparedOverlaps[role] = record === null ? null : Object.freeze({ ...record });
    if (record === null) continue;
    const raw = applyRecords[role];
    assert.notEqual(preparedBytes, null, 'Overlap without preparation evidence');
    assert.notEqual(raw, null, 'Overlap without current SQL evidence');
    sql(record, 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY');
    const competitor = role.startsWith('competitor');
    if (competitor)
      assert.notEqual(additionalReads.competitor?.additionalPreparationBytes ?? null, null);
    const pinned =
      preparedBytes + (competitor ? additionalReads.competitor.additionalPreparationBytes : 0);
    safe(pinned);
    safe(2 * pinned);
    assert.equal(record.preparationCount, competitor ? 2 : 1);
    assert.equal(record.preparedSqlBytes, pinned);
    assert.equal(record.scopedSqlHighWaterBytes, raw.retainedSqlBytes);
    assert.equal(record.checkpoints, raw.checkpoints);
    assert.equal(record.retainedSqlBytes, pinned + raw.retainedSqlBytes);
    assert.equal(record.lastRetainedSqlBytes, pinned);
  }
  const known = [
    readBytes,
    preparedBytes,
    stageBytes,
    overlapBytes,
    competitorStage?.retainedSqlBytes ?? null,
    ...Object.values(additionalReads).map((record) => record?.retainedSqlBytes ?? null),
    ...Object.values(applyRecords).map((record) => record?.retainedSqlBytes ?? null),
    ...Object.values(preparedOverlaps).map((record) => record?.retainedSqlBytes ?? null),
  ].filter((v) => v !== null);
  return Object.freeze({
    scope: 'WORKER_LIFECYCLE_EVIDENCE_ONLY',
    workerFailed,
    cleanup: Object.freeze({ ...cleanup }),
    verification: Object.freeze(verification),
    memory: Object.freeze({
      startupIncluded: true,
      finishedIncluded: true,
      peakResidentBytes: peak,
      peakScope: row.peakScope,
      method: row.peakMethod,
      units: row.peakUnits,
    }),
    sql: Object.freeze({
      readRole: row.sqlReadFixtureRole,
      readStatus: row.sqlReadDiagnostic?.status ?? null,
      readScopedHighWaterBytes: readBytes,
      readReturnedBytes: returned,
      preparationBytes: preparedBytes,
      stageScopedHighWaterBytes: stageBytes,
      preparedStageScopedHighWaterBytes: overlapBytes,
      additionalReads: Object.freeze(additionalReads),
      competitorStage: competitorStage === null ? null : Object.freeze({ ...competitorStage }),
      stageCheckpoints: Object.freeze(stageCheckpoints),
      apply: applyRecords.apply,
      competitorApply: applyRecords.competitorApply,
      seal: applyRecords.seal,
      competitorSeal: applyRecords.competitorSeal,
      normalize: applyRecords.normalize,
      competitorNormalize: applyRecords.competitorNormalize,
      completion: applyRecords.completion,
      competitorCompletion: applyRecords.competitorCompletion,
      preparedOverlaps: Object.freeze(preparedOverlaps),
      knownScopedHighWaterBytes: known.length ? Math.max(...known) : null,
      readToPreparationVerified: readToPreparation ? true : null,
      preparationToStageVerified: overlapBytes !== null ? true : null,
      completeRetainedSqlBytes: null,
      completeRetainedSqlStringChargeBytes: null,
    }),
    calibrationEligible: false,
    unavailableReasons: Object.freeze([
      'Complete failure-inclusive SQL ownership is unproved',
      'Fixture generation/discovery is included; final corpus replay is not frozen',
      'Guarded admitted-entry measurement is unavailable',
    ]),
  });
}

export async function closeRefreshTransportWorkerResources(cleanup, failure) {
  const counts = { registered: cleanup.length, attempted: 0, succeeded: 0, failed: 0 };
  for (const fn of cleanup.reverse()) {
    counts.attempted++;
    try {
      await fn();
      counts.succeeded++;
    } catch (error) {
      counts.failed++;
      failure ??= failureDiagnostic(error);
    }
  }
  return { cleanup: Object.freeze(counts), failure };
}
async function verifySqlPreflight(f, row, sample) {
  const before = activationImage(f.db);
  const fileId = f.db
    .prepare('SELECT source_file_id FROM native_analysis_file ORDER BY source_path LIMIT 1')
    .get().source_file_id;
  const enlargedBytes = f.prepared.limits.maxSerializedBytes + 1;
  // Construct corrupt TEXT inside SQLite, not a large JavaScript string.
  f.db
    .prepare(
      "UPDATE native_analysis_file SET summary_json=json_quote(printf('%.*c',?,'x')) WHERE source_file_id=?",
    )
    .run(enlargedBytes - 2, fileId);
  assert.equal(
    f.db
      .prepare(
        'SELECT length(CAST(summary_json AS BLOB)) AS n FROM native_analysis_file WHERE source_file_id=?',
      )
      .get(fileId).n,
    enlargedBytes,
  );
  row.preflight = {
    maxSerializedBytes: f.prepared.limits.maxSerializedBytes,
    enlargedBytes,
    nativeTextReads: 0,
    validationCalls: 0,
    injectedStatePreserved: false,
  };
  row.recipe.payloadDigest = createHash('sha256')
    .update(row.recipe.payloadDigest + '\0' + JSON.stringify({ fileId, enlargedBytes, fill: 'x' }))
    .digest('hex');
  const prepare = f.db.prepare;
  f.db.prepare = function (sql) {
    if (
      /FROM\s+native_analysis_(state|file)\b/i.test(sql) &&
      !/(sum|count|length)\s*\(/i.test(sql)
    ) {
      row.preflight.nativeTextReads++;
      assert.fail('Native TEXT must not be fetched or parsed before numeric preflight');
    }
    return prepare.call(this, sql);
  };
  let observed;
  try {
    observed = await observeNativeWire(() =>
      readNativeAnalysisState(
        f.db,
        f.prepared.trustedContext,
        (candidate) => {
          row.preflight.validationCalls++;
          return validateNativeStateCandidate(candidate);
        },
        f.prepared.limits,
      ),
    );
  } finally {
    f.db.prepare = prepare;
  }
  if (observed.threw) throw observed.error;
  assert.deepEqual(observed.value, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
  assert.deepEqual(observed.wire, []);
  assert.equal(row.preflight.nativeTextReads, 0);
  assert.equal(row.preflight.validationCalls, 0);
  row.observedOutcome = observed.value.reason;
  row.outputBytes = 0;
  row.eventCount = 0;
  assertClosed(f.db);
  row.transactionClosed = true;
  row.tempClosed = true;
  sample('sql-preflight-refused');
  // Verification deliberately reads the injected TEXT only AFTER refusal.
  // Its memory is included in the diagnostic lifetime peak, not calibration evidence.
  const injected = activationImage(f.db);
  const expected = {
    ...before,
    native_analysis_file: before.native_analysis_file
      .map((raw) => {
        const file = JSON.parse(raw);
        if (file.source_file_id === fileId)
          file.summary_json = JSON.stringify('x'.repeat(enlargedBytes - 2));
        return JSON.stringify(file);
      })
      .sort(),
  };
  assert.deepEqual(injected, expected, 'Refusal must leave the fault-injected image untouched');
  f.db.close();
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assertClosed(reopened);
    assert.deepEqual(activationImage(reopened), injected);
    row.persistedSnapshotCount = reopened
      .prepare('SELECT count(*) AS n FROM provider_snapshots')
      .get().n;
    assert.equal(row.persistedSnapshotCount, 1);
    row.preflight.injectedStatePreserved = true;
    row.persistentStateVerified = true;
    sample('reopened-verified');
  } finally {
    reopened.close();
  }
}
export async function runRefreshTransportWorker(mode, name, repetition) {
  const allowed =
    recipes[name]?.[1] === 'SUCCEEDED'
      ? [{ role: 'MAIN', snapshotId: 'snapshot-source-refresh' }]
      : name === 'd-token-race'
        ? [{ role: 'COMPETITOR', snapshotId: 'snapshot-d5-competitor' }]
        : [];
  const captured = await captureRefreshSnapshotMetadata(
    () => runRefreshTransportDiagnostic(mode, name, repetition),
    allowed,
  );
  if (captured.threw) throw captured.error;
  captured.value.row.snapshotMetadata = captured.metadata;
  captured.value.row.snapshotMetadataCaptureFailed = captured.captureFailed;
  return captured.value;
}

// Private functional replay only. The owning reader authenticates the immutable
// corpus; this entry independently reopens controls and reconstructs D1, never a
// cached preparation, generator, expected graph or calibration observation.
export async function executeRefreshTransportReplayCase(
  workloadCase,
  { mode = 'offline', sample = () => {}, settled, dContext } = {},
) {
  assert.ok(['offline', 'actual'].includes(mode));
  const { readRefreshReplayWorkloadControls } =
    await import('./native-refresh-transport-replay.mjs');
  const { invocation, options } = await readRefreshReplayWorkloadControls(workloadCase, dContext);
  const { name, workspacePath, databasePath } = workloadCase;
  const allowed =
    recipes[name][1] === 'SUCCEEDED'
      ? [{ role: 'MAIN', snapshotId: invocation.payload.providerSnapshotId }]
      : name === 'd-token-race'
        ? [{ role: 'COMPETITOR', snapshotId: 'snapshot-d5-competitor' }]
        : [];
  const captured = await captureRefreshSnapshotMetadata(async () => {
    const db = new DatabaseSync(databasePath);
    let prepared, f;
    let admitted = false;
    try {
      const checkRoot = () => {
        const repository = db.prepare('SELECT id,root_path FROM repository').get();
        assert.equal(repository.id, invocation.payload.repository.id);
        assert.equal(repository.root_path, workspacePath, 'Reopened seed root differs');
      };
      const budget = invocation.payload.resourceBudget.maxMemoryBytes;
      const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: budget };
      if (mode === 'offline') checkRoot();
      if (name === 'd-sql-preflight' && mode === 'offline') {
        const observed = await observeNativeWire(() =>
          readNativeAnalysisState(
            db,
            invocation.trustedContext,
            validateNativeStateCandidate,
            limits,
          ),
        );
        if (observed.threw) throw observed.error;
        assert.deepEqual(observed.value, {
          status: 'UNAVAILABLE',
          reason: 'RESOURCE_LIMIT_EXCEEDED',
        });
        assert.deepEqual(observed.wire, []);
        for (const family of ['PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY']) {
          const role = nativeSqlSourceRole();
          if (role !== null)
            proveNativeSqlDisposition(
              family,
              role,
              'PROVEN_NOT_REACHED',
              'Original standalone numeric preflight refused; this branch returns without preparation or Apply',
            );
        }
        assertClosed(db);
        const summaryBytes = db
          .prepare('SELECT sum(length(CAST(summary_json AS BLOB))) AS n FROM native_analysis_file')
          .get().n;
        assert.ok(Number.isSafeInteger(summaryBytes) && summaryBytes >= 0);
        return {
          observedOutcome: observed.value.reason,
          operationThrew: false,
          operationFailureText: null,
          transactionClosed: true,
          tempClosed: true,
          mainApplyCalls: 0,
          competitorCommits: 0,
          physical: {
            inputBytes: 0,
            largestLineBytes: 0,
            outputBytes: 0,
            eventCount: 0,
            summaryBytes,
          },
        };
      }
      if (name === 'd-sql-preflight' && mode === 'actual') {
        let compositionCalls = 0;
        const counted = await observeRetryApplyCalls(() =>
          observeNativeWire(() =>
            observeNativeRefreshComposition(
              () =>
                applyNativeRefreshAnalysisV3(
                  db,
                  budget,
                  () => {
                    admitted = true;
                    checkRoot();
                    return invocation;
                  },
                  options,
                ),
              async (_prepared, apply) => {
                compositionCalls++;
                return apply();
              },
            ),
          ),
        );
        if (counted.threw) throw counted.error;
        const observed = counted.value;
        // A missing profile is an unadmitted failure, never this admitted
        // baseline refusal. Require the original typed error and real no-calls.
        if (
          !admitted ||
          !observed.threw ||
          observed.error?.nativeStateReason !== 'RESOURCE_LIMIT_EXCEEDED' ||
          observed.error.message !== 'Native refresh baseline unavailable'
        ) {
          if (observed.threw) throw observed.error;
          assert.fail('Expected actual baseline preflight refusal');
        }
        assert.equal(counted.guarded, true);
        assert.equal(counted.applyCalls, 0);
        assert.equal(compositionCalls, 0);
        assert.deepEqual(observed.wire, []);
        for (const family of ['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY']) {
          const role = nativeSqlSourceRole();
          if (role !== null)
            proveNativeSqlDisposition(
              family,
              role,
              'PROVEN_NOT_REACHED',
              'Actual guarded preparation refused before the fixed Apply continuation; intact Store and process counters are zero',
            );
        }
        assertClosed(db);
        const summaryBytes = db
          .prepare('SELECT sum(length(CAST(summary_json AS BLOB))) AS n FROM native_analysis_file')
          .get().n;
        assert.ok(Number.isSafeInteger(summaryBytes) && summaryBytes >= 0);
        return {
          observedOutcome: 'RESOURCE_LIMIT_EXCEEDED',
          operationThrew: true,
          operationFailureText: failureDiagnostic(observed.error),
          transactionClosed: true,
          tempClosed: true,
          mainApplyCalls: counted.applyCalls,
          competitorCommits: 0,
          physical: {
            inputBytes: 0,
            largestLineBytes: 0,
            outputBytes: 0,
            eventCount: 0,
            summaryBytes,
          },
        };
      }
      let completed;
      const controller = new AbortController();
      const consume = async (originalApply) => {
        f = {
          db,
          databasePath,
          prepared,
          options,
          targetRevision: prepared.request.payload.targetRevision,
          targetFiles: prepared.request.payload.targetSourceFiles,
          controller,
        };
        const row = {
          name,
          sqlPreparation: refreshPreparationSqlDiagnostic(prepared),
          sqlAdditionalReads: { competitor: null, retry: null },
          inputBoundary: { accepted: { inputRecords: prepared.baseline.summaries.length + 2 } },
          transactionClosed: false,
          tempClosed: false,
        };
        const summaryBytes = row.sqlPreparation.baselineSummarySqlBytes;
        const operation = await executePreparedRefreshTransport(
          f,
          row,
          sample,
          false,
          originalApply,
        );
        if (name === 'd-reopen') {
          settled?.({
            transactionClosed: row.transactionClosed,
            tempClosed: row.tempClosed,
            admitted,
            cleanupFailureText: null,
          });
          db.close();
          const reopened = new DatabaseSync(databasePath);
          try {
            await prepareRefreshTransportRetry(reopened, f, row);
            assertClosed(reopened);
          } finally {
            reopened.close();
          }
        }
        completed = {
          ...(workloadCase.schemaVersion === 2
            ? {
                wireEvidence:
                  name === 'd-cancel'
                    ? {
                        inputSha256: row.wire[0].inputSha256,
                        outputSha256: row.wire[0].outputSha256,
                        outputBytes: row.wire[0].outputBytes,
                        eventCount: row.wire[0].outputRecords,
                        cancelGate: {
                          kind: 'FIRST_BLOCKED_STAGE_SINK',
                          accepted: row.sink.accepted,
                          maximumInFlight: row.sink.maximumInFlight,
                          blockedVerified: row.sink.blockedVerified,
                          abortCalls: row.sink.abortCalls,
                        },
                      }
                    : null,
              }
            : {}),
          observedOutcome: row.observedOutcome,
          operationThrew: operation.operationThrew,
          operationFailureText: operation.operationFailureText,
          transactionClosed: row.transactionClosed,
          tempClosed: row.tempClosed,
          mainApplyCalls: row.sqlApplyCalls,
          competitorCommits: row.race?.competitorCommits ?? 0,
          physical: {
            inputBytes: row.wire[0].inputBytes,
            largestLineBytes: row.wire[0].largestInputLineBytes,
            outputBytes: row.outputBytes,
            eventCount: row.eventCount,
            summaryBytes,
          },
        };
        return completed;
      };
      if (mode === 'offline') {
        const observed = observeRefreshBaselineRead(db, invocation.trustedContext, limits);
        if (observed.value === null) throw observed.error;
        assert.equal(observed.value.status, 'AVAILABLE', 'Replay baseline must be available');
        prepared = createNativeRefreshPreparation(invocation, observed.value, budget, options);
        return await consume();
      }
      try {
        await observeNativeRefreshComposition(
          () =>
            applyNativeRefreshAnalysisV3(
              db,
              budget,
              () => {
                admitted = true;
                checkRoot();
                return invocation;
              },
              { ...refreshReplayOptions(name, options), signal: controller.signal },
            ),
          async (value, originalApply) => {
            prepared = value;
            return consume(originalApply);
          },
        );
      } catch (error) {
        // The guarded entry preserves an original refusal even when the recipe
        // has already verified it. Never swallow a preparation/unexpected error.
        if (
          !completed?.operationThrew ||
          completed.operationFailureText !== failureDiagnostic(error)
        )
          throw error;
      }
      return completed;
    } finally {
      if (prepared && !f?.applicationStarted) endNativeSqlSourceFor(prepared);
      if (db.isOpen) {
        let closed = false;
        let cleanupError,
          cleanupThrew = false;
        const transactionClosed = !db.isTransaction;
        try {
          assertClosed(db);
          closed = true;
        } catch (error) {
          cleanupError = error;
          cleanupThrew = true;
        }
        try {
          db.close();
        } catch (error) {
          if (!cleanupThrew) cleanupError = error;
          cleanupThrew = true;
        }
        if (settled)
          settled({
            transactionClosed,
            tempClosed: closed,
            admitted,
            cleanupFailureText: cleanupThrew ? failureDiagnostic(cleanupError) : null,
          });
        else if (cleanupThrew) throw cleanupError;
      }
    }
  }, allowed);
  if (captured.threw) throw captured.error;
  // Preserve the actual outcome when observation fails. Null metadata is an
  // explicit qualification refusal for the parent, not a replacement exception.
  return {
    ...(workloadCase.schemaVersion === 2 ? { wireEvidence: null } : {}),
    ...captured.value,
    snapshotMetadata: captured.metadata,
  };
}

// Shared real recipe execution. Full-image diagnostics stay in the diagnostic
// parent; a fresh replay never builds expected state in its measured process.
function refreshReplayOptions(name, options) {
  const fault = {
    'd-partial': 'partial',
    'd-corrupt': 'bad-checksum',
    'd-late-exit': 'late-exit',
    'd-slow-stdin': 'blocked-stdin',
  }[name];
  return fault
    ? {
        ...options,
        executablePath: process.execPath,
        arguments: [
          fileURLToPath(new URL('./native-refresh-fault-process.mjs', import.meta.url)),
          fault,
        ],
      }
    : options;
}

async function executePreparedRefreshTransport(f, row, sample, diagnosticState, originalApply) {
  const name = row.name;
  const expectedOutcome = recipes[name][1];
  const refused = expectedOutcome !== 'SUCCEEDED';
  let before = diagnosticState ? activationImage(f.db) : null;
  let operationThrew = false;
  let operationFailureText = null;
  const checkState = (db, message) => {
    if (diagnosticState) assert.deepEqual(activationImage(db), before, message);
  };
  let competitorSource;
  if (['d-source-race', 'd-token-race'].includes(name)) {
    const second = new DatabaseSync(f.databasePath);
    row.race = { competitorCommits: 0, competitorStatePreserved: false, refusalMessage: null };
    try {
      await withRefreshWorkerRole('COMPETITOR', async () => {
        if (name === 'd-source-race') {
          const update = () => {
            const sourceStore = new RepositorySourceStateStore(second);
            const current = sourceStore.load(f.targetRevision.repositoryId);
            const files = current.files.map((file) => ({
              ...file,
              classification: { ...file.classification, role: 'TEST' },
            }));
            const contentFingerprint =
              'sha256:' + createHash('sha256').update(JSON.stringify(files)).digest('hex');
            sourceStore.replace(current, {
              revision: { ...current.revision, contentFingerprint },
              files,
            });
            if (diagnosticState) {
              competitorSource = sourceStore.load(f.targetRevision.repositoryId);
              assert.equal(competitorSource.files[0].classification.role, 'TEST');
            }
          };
          if (diagnosticState) update();
          else withNativeSourceStateReadLifetime(update);
          row.race.competitorRole = 'TEST';
        } else {
          const observed = observeRefreshBaselineRead(
            second,
            f.prepared.trustedContext,
            f.prepared.limits,
          );
          row.sqlAdditionalReads.competitor = refreshAdditionalReadDiagnostic(
            row.sqlPreparation,
            observed.diagnostic,
          );
          if (observed.value === null) throw observed.error;
          const baseline = observed.value;
          assert.equal(baseline.status, 'AVAILABLE');
          const {
            baseRevisionId: _baseId,
            baseRevisionFingerprint: _baseFp,
            baselineState: _state,
            targetSourceFiles: _files,
            changes: _changes,
            ...payload
          } = f.prepared.request.payload;
          const competitor = createNativeRefreshPreparation(
            {
              requestId: 'd5-competitor',
              descriptor: f.prepared.descriptor,
              trustedContext: f.prepared.trustedContext,
              payload: { ...payload, providerSnapshotId: 'snapshot-d5-competitor' },
            },
            baseline,
            f.prepared.limits.memoryBudgetBytes,
            f.options,
          );
          row.sqlAdditionalReads.competitor = refreshAdditionalReadDiagnostic(
            row.sqlPreparation,
            observed.diagnostic,
            refreshPreparationSqlDiagnostic(competitor),
          );
          const fingerprint = second
            .prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state')
            .get().fp;
          // Actual Application/Store coactivation, not a direct token/table mutation.
          const pinned = [row.sqlPreparation, refreshPreparationSqlDiagnostic(competitor)];
          const completionCapture = await observeRefreshCompletionSql(
            () =>
              observeRefreshNormalizeSql(
                () =>
                  observeRefreshSealSql(
                    () =>
                      observeRefreshApplySql(
                        () =>
                          observeCompetitorRefreshStage(() =>
                            observeRefreshStageAccounting(
                              () =>
                                applyPreparedNativeRefreshAnalysisV3(second, competitor, f.options),
                              undefined,
                              pinned,
                            ),
                          ),
                        undefined,
                        pinned,
                      ),
                    undefined,
                    pinned,
                  ),
                undefined,
                pinned,
              ),
            undefined,
            pinned,
          );
          row.sqlCompetitorCompletion = completionCapture.sql;
          row.sqlCompetitorCompletionOverlap = completionCapture.preparedSql;
          row.sqlCompetitorCompletionCalls = completionCapture.completionCalls;
          row.sqlCompetitorCompletionCaptureFailure = completionCapture.captureFailure;
          if (completionCapture.threw) throw completionCapture.error;
          const normalizeCapture = completionCapture.value;
          row.sqlCompetitorNormalize = normalizeCapture.sql;
          row.sqlCompetitorNormalizeOverlap = normalizeCapture.preparedSql;
          row.sqlCompetitorNormalizeCalls = normalizeCapture.normalizeCalls;
          row.sqlCompetitorNormalizeCaptureFailure = normalizeCapture.captureFailure;
          if (normalizeCapture.threw) throw normalizeCapture.error;
          const sealCapture = normalizeCapture.value;
          row.sqlCompetitorSeal = sealCapture.sql;
          row.sqlCompetitorSealOverlap = sealCapture.preparedSql;
          row.sqlCompetitorSealCalls = sealCapture.sealCalls;
          row.sqlCompetitorSealCaptureFailure = sealCapture.captureFailure;
          if (sealCapture.threw) throw sealCapture.error;
          const sqlCapture = sealCapture.value;
          row.sqlCompetitorApply = sqlCapture.sql;
          row.sqlCompetitorApplyOverlap = sqlCapture.preparedSql;
          row.sqlCompetitorApplyCalls = sqlCapture.applyCalls;
          row.sqlCompetitorApplyCaptureFailure = sqlCapture.captureFailure;
          if (sqlCapture.threw) throw sqlCapture.error;
          const observedApply = sqlCapture.value;
          row.sqlCompetitorStageCaptureFailure = observedApply.captureFailure;
          if (observedApply.stage !== null && observedApply.captureFailure === null) {
            try {
              row.sqlCompetitorStage = refreshCompetitorStageDiagnostic(
                f.prepared,
                competitor,
                observedApply.stage,
              );
            } catch (error) {
              row.sqlCompetitorStageCaptureFailure = failureDiagnostic(error);
            }
          }
          if (observedApply.threw) throw observedApply.error;
          const competitorAccounting = observedApply.value;
          row.competitorStageAccounting = competitorAccounting.diagnostic;
          row.competitorStageAccountingCaptureFailure = competitorAccounting.captureFailed
            ? failureDiagnostic(competitorAccounting.captureFailure)
            : null;
          if (competitorAccounting.threw) throw competitorAccounting.error;
          assert.equal(
            second.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get()
              .fp,
            fingerprint,
          );
          row.race.sameIndexedFingerprint = true;
          row.race.competitorSnapshotId = second
            .prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state')
            .get().id;
          assert.equal(row.race.competitorSnapshotId, 'snapshot-d5-competitor');
        }
        row.race.competitorCommits++;
        assertClosed(second);
        if (diagnosticState) before = activationImage(second);
      });
    } finally {
      second.close();
    }
    sample('competitor-committed');
  }
  if (name === 'd-dependent-edge') {
    assert.deepEqual(
      f.prepared.request.payload.changes.modified.map((file) => file.path),
      ['Target.java'],
    );
    assert.deepEqual(f.prepared.request.payload.changes.added, []);
    assert.deepEqual(f.prepared.request.payload.changes.deleted, []);
    const caller = f.prepared.baseline.summaries.find(
      (summary) => summary.sourceFile.path === 'Caller.java',
    ).sourceFile;
    assert.deepEqual(
      f.targetFiles.find((file) => file.path === 'Caller.java'),
      caller,
      'Dependent caller source stays unchanged',
    );
  }
  if (name === 'd-rollback')
    f.db.exec(
      "CREATE TRIGGER d5_summary_failure AFTER INSERT ON native_analysis_file BEGIN SELECT RAISE(ABORT,'D5_SUMMARY_INSERT_FAILED'); END",
    );
  const acceptNative = RepositoryPatchStage.prototype.acceptNativeEvent;
  const acceptSummary = RepositoryPatchStage.prototype.acceptNativeSummary;
  const applyNative = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const sealNative = RepositoryPatchStage.prototype.sealNativePatchState;
  const closeNative = RepositoryPatchStage.prototype.close;
  let options = f.options;
  if (['d-partial', 'd-corrupt', 'd-late-exit'].includes(name)) {
    const faultMode = {
      'd-partial': 'partial',
      'd-corrupt': 'bad-checksum',
      'd-late-exit': 'late-exit',
    }[name];
    const faultPath = fileURLToPath(new URL('./native-refresh-fault-process.mjs', import.meta.url));
    row.fault = {
      mode: faultMode,
      stagedEvents: [],
      stagedSummaries: 0,
      applyCalls: 0,
      refusalMessage: null,
    };
    if (row.recipe)
      row.recipe.payloadDigest = createHash('sha256')
        .update(row.recipe.payloadDigest + '\0' + faultMode + '\0')
        .update(await readFile(faultPath))
        .digest('hex');
    options = {
      ...f.options,
      executablePath: process.execPath,
      arguments: [faultPath, faultMode],
    };
    RepositoryPatchStage.prototype.acceptNativeEvent = async function (event) {
      row.fault.stagedEvents.push(event.type);
      return await acceptNative.call(this, event);
    };
    RepositoryPatchStage.prototype.acceptNativeSummary = async function (summary) {
      row.fault.stagedSummaries++;
      return await acceptSummary.call(this, summary);
    };
    RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch = function (...args) {
      row.fault.applyCalls++;
      return applyNative.apply(this, args);
    };
  }
  const controller = f.controller ?? new AbortController();
  let observeInputChild;
  if (name === 'd-slow-stdin') {
    const faultPath = fileURLToPath(new URL('./native-refresh-fault-process.mjs', import.meta.url));
    options = {
      ...f.options,
      executablePath: process.execPath,
      arguments: [faultPath, 'blocked-stdin'],
    };
    if (row.recipe)
      row.recipe.payloadDigest = createHash('sha256')
        .update(row.recipe.payloadDigest + '\0blocked-stdin\0')
        .update(await readFile(faultPath))
        .digest('hex');
    row.inputGate = {
      writeCalls: 0,
      blockedWriteCalls: null,
      backpressureWrites: 0,
      endCalls: 0,
      maximumPendingBytes: 0,
      applyCalls: 0,
      blockedVerified: false,
      childClosed: false,
    };
    RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch = function (...args) {
      row.inputGate.applyCalls++;
      return applyNative.apply(this, args);
    };
    observeInputChild = (child) => {
      child.once('close', () => {
        row.inputGate.childClosed = true;
      });
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (...args) => {
        row.inputGate.writeCalls++;
        const accepted = write(...args);
        if (!accepted) row.inputGate.backpressureWrites++;
        row.inputGate.maximumPendingBytes = Math.max(
          row.inputGate.maximumPendingBytes,
          child.stdin.writableLength,
        );
        return accepted;
      };
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (...args) => {
        row.inputGate.endCalls++;
        return end(...args);
      };
      // Tap the original stderr consumer, not a second listener/reader or relay.
      const iterate = child.stderr[Symbol.asyncIterator].bind(child.stderr);
      child.stderr[Symbol.asyncIterator] = async function* () {
        let marker = '';
        for await (const chunk of { [Symbol.asyncIterator]: iterate }) {
          marker += chunk.toString('utf8');
          assert.ok(Buffer.byteLength(marker) <= 1_000_000);
          if (!row.inputGate.blockedVerified && marker.includes('D5_INPUT_READER_GATED\n')) {
            assert.ok(row.inputGate.backpressureWrites > 0);
            assert.equal(child.stdin.writableNeedDrain, true);
            const writes = row.inputGate.writeCalls;
            const pending = child.stdin.writableLength;
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(
              row.inputGate.writeCalls,
              writes,
              'Writer must await drain, not queue more records',
            );
            assert.equal(row.inputGate.endCalls, 0, 'Completion/end cannot bypass blocked input');
            assert.equal(child.stdin.writableNeedDrain, true);
            assert.equal(child.stdin.writableLength, pending);
            assert.ok(writes < row.inputBoundary.accepted.inputRecords);
            checkState(f.db);
            row.inputGate.blockedWriteCalls = writes;
            row.inputGate.blockedVerified = true;
            sample('blocked-stdin');
            controller.abort();
          }
          yield chunk;
        }
      };
    };
  }
  if (['d-complete-coverage', 'd-overlay-retention'].includes(name)) {
    row.inputBoundary.parsedFiles = [];
    row.inputBoundary.coverageCount = 0;
    row.inputBoundary.summaryCount = 0;
    RepositoryPatchStage.prototype.acceptNativeEvent = async function (event) {
      if (event.type === 'SOURCE_FILE') row.inputBoundary.parsedFiles.push(event.payload.id);
      if (event.type === 'COVERAGE') row.inputBoundary.coverageCount++;
      return acceptNative.call(this, event);
    };
    RepositoryPatchStage.prototype.acceptNativeSummary = async function (summary) {
      row.inputBoundary.summaryCount++;
      return acceptSummary.call(this, summary);
    };
  }
  if (name === 'd-overlay-retention') {
    const activeSupportCount = diagnosticState
      ? null
      : f.db.prepare('SELECT count(*) AS n FROM provider_fact_bindings').get().n;
    row.overlay = {
      calls: 0,
      counts: {
        files: 0,
        activeSupports: 0,
        normalizedNodes: 0,
        normalizedEdges: 0,
        supports: 0,
        coverage: 0,
      },
      retainedModuleSupports: 0,
      untouchedDuringSeal: false,
      sealedFrozen: false,
    };
    // Observe the original single-pass iterators, without extra result arrays,
    // while the real Provider validator retains its summary/support/normalization maps.
    RepositoryPatchStage.prototype.sealNativePatchState = function (expected, token, validate) {
      row.overlay.calls++;
      const result = sealNative.call(this, expected, token, (input) => {
        checkState(f.db, 'Seal must not activate persistent state');
        const observed = (kind, values) => ({
          *[Symbol.iterator]() {
            for (const value of values) {
              row.overlay.counts[kind]++;
              if (kind === 'activeSupports') {
                assert.equal(value.evidence.status, 'ACTIVE');
                assert.equal(value.evidence.providerSnapshotId, 'snapshot-source-bootstrap');
                assert.equal(value.binding.providerSnapshotId, 'snapshot-source-bootstrap');
                if (
                  value.canonical.kind === 'MODULE' &&
                  value.canonical.qualifiedName.startsWith('File')
                )
                  row.overlay.retainedModuleSupports++;
              }
              if (kind === 'coverage' && row.overlay.counts.coverage === 1) {
                assert.equal(row.overlay.counts.files, f.targetFiles.length);
                assert.equal(
                  row.overlay.counts.activeSupports,
                  diagnosticState ? before.provider_fact_bindings.length : activeSupportCount,
                );
                assert.ok(row.overlay.counts.normalizedNodes > 0);
                assert.ok(row.overlay.counts.normalizedEdges > 0);
                assert.equal(
                  row.overlay.counts.supports,
                  row.overlay.counts.normalizedNodes + row.overlay.counts.normalizedEdges,
                );
                assert.equal(
                  f.db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get().n,
                  f.targetFiles.length,
                );
                assert.equal(
                  f.db.prepare('SELECT count(*) AS n FROM temp.patch_normalized').get().n,
                  row.overlay.counts.normalizedNodes + row.overlay.counts.normalizedEdges,
                );
                assert.equal(
                  f.db.prepare('SELECT count(*) AS n FROM temp.patch_support').get().n,
                  row.overlay.counts.supports,
                );
                assert.equal(input.baseline.files.length, f.targetFiles.length);
                sample('overlay-views-retained');
              }
              yield value;
            }
          },
        });
        const state = validate({
          ...input,
          ...Object.fromEntries(
            Object.keys(row.overlay.counts).map((kind) => [kind, observed(kind, input[kind])]),
          ),
        });
        assert.equal(row.overlay.counts.coverage, f.targetFiles.length * 5);
        assert.equal(row.overlay.retainedModuleSupports, f.targetFiles.length - 2);
        checkState(f.db);
        row.overlay.untouchedDuringSeal = diagnosticState ? true : null;
        return state;
      });
      const state = this.readSealedNativeState();
      assert.equal(state.files.length, f.targetFiles.length);
      assert.equal(Object.isFrozen(state), true);
      assert.equal(Object.isFrozen(state.files), true);
      assert.ok(state.files.every(Object.isFrozen));
      row.overlay.sealedFrozen = true;
      sample('overlay-seal-returned');
      return result;
    };
  }
  if (name === 'd-dense-remove') {
    row.inputBoundary.removals = 0;
    row.inputBoundary.upserts = 0;
    RepositoryPatchStage.prototype.acceptNativeEvent = async function (event) {
      if (event.type === 'REMOVE_NODE') row.inputBoundary.removals++;
      if (event.type.startsWith('UPSERT_')) row.inputBoundary.upserts++;
      return acceptNative.call(this, event);
    };
  }
  if (['d-slow-sink', 'd-cancel'].includes(name)) {
    let inFlight = 0;
    row.sink = { accepted: 0, maximumInFlight: 0, blockedVerified: false, abortCalls: 0 };
    // Fresh-worker seam only: preserve the actual Stage write and delay its awaited return.
    RepositoryPatchStage.prototype.acceptNativeEvent = async function (event) {
      row.sink.accepted++;
      inFlight++;
      row.sink.maximumInFlight = Math.max(row.sink.maximumInFlight, inFlight);
      assert.equal(inFlight, 1, 'Sink deliveries must be awaited');
      try {
        if (row.sink.accepted === 1) {
          sample('blocked-sink');
          await new Promise((resolve) => setImmediate(resolve));
          assert.equal(row.sink.accepted, 1, 'No new event may enter while the sink is blocked');
          row.sink.blockedVerified = true;
          if (name === 'd-cancel') {
            controller.abort();
            row.sink.abortCalls++;
            // No Stage write resumes after cancellation/Stage cleanup.
            await new Promise(() => {});
          }
        }
        return await acceptNative.call(this, event);
      } finally {
        inFlight--;
      }
    };
  }
  try {
    RepositoryPatchStage.prototype.close = function (...args) {
      const result = closeNative.apply(this, args);
      row.sqlStage = this.readNativeRetentionMeasurement();
      row.sqlPreparedStage = refreshPreparedStageDiagnostic(f.prepared, row.sqlStage);
      return result;
    };
    const observed = await observeNativeWire(
      async () => {
        const diagnostic = {
          scope: 'DECODER_WORKSPACE_STRUCTURE_ONLY',
          phaseCounts: {},
          maxima: {},
        };
        const requestDiagnostic = {
          scope: 'REQUEST_WORKSPACE_STRUCTURE_ONLY',
          components: {},
        };
        const pinned = [row.sqlPreparation];
        const completionCapture = await observeRefreshCompletionSql(
          () =>
            observeRefreshNormalizeSql(
              () =>
                observeRefreshSealSql(
                  () =>
                    observeRefreshApplySql(
                      () =>
                        observeNativeRefreshWorkspace(
                          () =>
                            observeRefreshStageAccounting(
                              async () => {
                                const operation = () => {
                                  f.applicationStarted = true;
                                  if (originalApply) return originalApply();
                                  return applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, {
                                    ...options,
                                    signal: controller.signal,
                                  });
                                };
                                const role = nativeSqlSourceRole();
                                if (
                                  !['d-source-race', 'd-token-race'].includes(name) ||
                                  role === null
                                )
                                  return operation();
                                const counted = await observeRetryApplyCalls(operation);
                                if (
                                  counted.guarded &&
                                  counted.applyCalls === 0 &&
                                  counted.threw &&
                                  counted.error?.message ===
                                    (name === 'd-source-race'
                                      ? 'Native target revision changed'
                                      : 'Native activation token changed')
                                )
                                  proveNativeSqlDisposition(
                                    'APPLY',
                                    role,
                                    'PROVEN_NOT_REACHED',
                                    'Original ' +
                                      name +
                                      ' Seal refusal under intact actual Store entry counter: zero Apply calls',
                                  );
                                if (counted.threw) throw counted.error;
                                return counted.value;
                              },
                              undefined,
                              pinned,
                            ),
                          (record) => {
                            diagnostic.phaseCounts[record.phase] =
                              (diagnostic.phaseCounts[record.phase] ?? 0) + 1;
                            for (const [key, value] of Object.entries(record)) {
                              if (key === 'decoderId' || typeof value === 'string') continue;
                              diagnostic.maxima[key] =
                                value === null
                                  ? (diagnostic.maxima[key] ?? null)
                                  : Math.max(diagnostic.maxima[key] ?? 0, value);
                            }
                          },
                          (record) => {
                            const component = (requestDiagnostic.components[record.component] ??= {
                              phaseCounts: {},
                              maxima: {},
                            });
                            component.phaseCounts[record.phase] =
                              (component.phaseCounts[record.phase] ?? 0) + 1;
                            for (const [key, value] of Object.entries(record)) {
                              if (key === 'invocationId' || typeof value === 'string') continue;
                              component.maxima[key] =
                                value === null
                                  ? (component.maxima[key] ?? null)
                                  : Math.max(component.maxima[key] ?? 0, value);
                            }
                          },
                        ),
                      undefined,
                      pinned,
                    ),
                  undefined,
                  pinned,
                ),
              undefined,
              pinned,
            ),
          undefined,
          pinned,
        );
        row.sqlCompletion = completionCapture.sql;
        row.sqlCompletionOverlap = completionCapture.preparedSql;
        row.sqlCompletionCalls = completionCapture.completionCalls;
        row.sqlCompletionCaptureFailure = completionCapture.captureFailure;
        if (completionCapture.threw) throw completionCapture.error;
        const normalizeCapture = completionCapture.value;
        row.sqlNormalize = normalizeCapture.sql;
        row.sqlNormalizeOverlap = normalizeCapture.preparedSql;
        row.sqlNormalizeCalls = normalizeCapture.normalizeCalls;
        row.sqlNormalizeCaptureFailure = normalizeCapture.captureFailure;
        if (normalizeCapture.threw) throw normalizeCapture.error;
        const sealCapture = normalizeCapture.value;
        row.sqlSeal = sealCapture.sql;
        row.sqlSealOverlap = sealCapture.preparedSql;
        row.sqlSealCalls = sealCapture.sealCalls;
        row.sqlSealCaptureFailure = sealCapture.captureFailure;
        if (sealCapture.threw) throw sealCapture.error;
        const sqlCapture = sealCapture.value;
        row.sqlApply = sqlCapture.sql;
        row.sqlApplyOverlap = sqlCapture.preparedSql;
        row.sqlApplyCalls = sqlCapture.applyCalls;
        row.sqlApplyCaptureFailure = sqlCapture.captureFailure;
        if (sqlCapture.threw) throw sqlCapture.error;
        const capture = sqlCapture.value;
        for (const component of Object.values(requestDiagnostic.components)) {
          Object.freeze(component.phaseCounts);
          Object.freeze(component.maxima);
          Object.freeze(component);
        }
        row.requestObservation = Object.freeze({
          ...requestDiagnostic,
          components: Object.freeze(requestDiagnostic.components),
        });
        row.requestObservationCaptureFailed = capture.captureFailed;
        row.decoderObservation = Object.freeze({
          ...diagnostic,
          phaseCounts: Object.freeze(diagnostic.phaseCounts),
          maxima: Object.freeze(diagnostic.maxima),
        });
        row.decoderObservationCaptureFailed = capture.captureFailed;
        if (capture.threw) throw capture.error;
        assert.equal(capture.captureFailed, false, 'Decoder evidence capture failed');
        const accounting = capture.value;
        row.stageAccounting = accounting.diagnostic;
        row.stageAccountingCaptureFailure = accounting.captureFailed
          ? failureDiagnostic(accounting.captureFailure)
          : null;
        if (accounting.threw) throw accounting.error;
        return accounting.value;
      },
      undefined,
      observeInputChild,
    );
    row.wire = observed.wire;
    assert.equal(row.wire.length, 1, 'Only the actual REFRESH process is measured');
    row.outputBytes = row.wire[0].outputBytes;
    row.eventCount = row.wire[0].outputRecords;
    if (observed.threw) throw observed.error;
    row.measurement = observed.value;
    row.observedOutcome = 'SUCCEEDED';
  } catch (error) {
    operationThrew = true;
    operationFailureText = failureDiagnostic(error);
    row.observedOutcome = error?.code ?? error?.nativeStateReason ?? 'WORKER_EXCEPTION';
    if (
      !refused ||
      row.observedOutcome !== expectedOutcome ||
      error === null ||
      typeof error !== 'object'
    )
      throw error;
    if (name === 'd-rollback') assert.match(error.message, /D5_SUMMARY_INSERT_FAILED/);
    if (row.fault) {
      row.fault.refusalMessage = error.message;
      assert.equal(row.fault.applyCalls, 0);
      if (name === 'd-partial') assert.match(error.message, /not eligible for publication/);
    }
    if (row.race) {
      assert.match(
        error.message,
        name === 'd-source-race'
          ? /Native target revision changed/
          : /Native activation token changed/,
      );
      row.race.refusalMessage = error.message;
    }
  } finally {
    RepositoryPatchStage.prototype.acceptNativeEvent = acceptNative;
    RepositoryPatchStage.prototype.acceptNativeSummary = acceptSummary;
    RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch = applyNative;
    RepositoryPatchStage.prototype.sealNativePatchState = sealNative;
    RepositoryPatchStage.prototype.close = closeNative;
  }
  assert.equal(row.observedOutcome, expectedOutcome);
  if (row.inputGate) {
    assert.equal(row.inputGate.blockedVerified, true);
    assert.equal(row.inputGate.childClosed, true);
    assert.equal(row.inputGate.applyCalls, 0);
    assert.equal(row.inputGate.endCalls, 0);
    assert.equal(
      row.inputGate.writeCalls,
      row.inputGate.blockedWriteCalls,
      'Cancellation must not schedule another input record',
    );
  }
  assertClosed(f.db);
  row.transactionClosed = true;
  row.tempClosed = true;
  sample('apply-or-rollback-settled');

  return { before, competitorSource, operationThrew, operationFailureText };
}

async function prepareRefreshTransportRetry(reopened, f, row, checkState) {
  await withRefreshWorkerRole('RETRY', async () => {
    const counted = await observeRetryApplyCalls(() => {
      const observed = observeRefreshBaselineRead(
        reopened,
        f.prepared.trustedContext,
        f.prepared.limits,
      );
      row.sqlAdditionalReads.retry = refreshAdditionalReadDiagnostic(
        row.sqlPreparation,
        observed.diagnostic,
      );
      if (observed.value === null) throw observed.error;
      const baseline = observed.value;
      assert.equal(baseline.status, 'AVAILABLE');
      const {
        baseRevisionId: _baseId,
        baseRevisionFingerprint: _baseFp,
        baselineState: _state,
        targetSourceFiles: _files,
        changes: _changes,
        ...payload
      } = f.prepared.request.payload;
      const retry = createNativeRefreshPreparation(
        {
          requestId: 'd5-indexed-retry',
          descriptor: f.prepared.descriptor,
          trustedContext: f.prepared.trustedContext,
          payload: { ...payload, providerSnapshotId: 'snapshot-d5-retry' },
        },
        baseline,
        f.prepared.limits.memoryBudgetBytes,
        f.options,
      );
      try {
        row.sqlAdditionalReads.retry = refreshAdditionalReadDiagnostic(
          row.sqlPreparation,
          observed.diagnostic,
          refreshPreparationSqlDiagnostic(retry),
        );
        row.retry = {
          baselineSnapshotId: retry.token.states.find((state) => state.providerId === 'native')
            ?.snapshotId,
          deltaCounts: Object.fromEntries(
            Object.entries(retry.request.payload.changes).map(([key, value]) => [
              key,
              value.length,
            ]),
          ),
        };
        assert.equal(row.retry.baselineSnapshotId, 'snapshot-source-refresh');
        assert.deepEqual(row.retry.deltaCounts, { added: 0, modified: 0, deleted: 0 });
        checkState?.(reopened);
      } finally {
        endNativeSqlSourceFor(retry);
      }
    });
    if (counted.threw) throw counted.error;
    assert.equal(counted.guarded, true, 'Retry Apply entry guard must survive');
    assert.equal(counted.applyCalls, 0, 'Retry must not enter Store Apply');
    proveNativeSqlDisposition(
      'APPLY',
      'RETRY',
      'PROVEN_NOT_REACHED',
      'Successful reopened retry read/preparation under an intact actual Store entry counter: zero Apply calls',
    );
  });
}

async function runRefreshTransportDiagnostic(mode, name, repetition) {
  assert.equal(
    mode,
    'offline',
    'Actual collection not implemented; reviewed admission remains mandatory',
  );
  assert.ok(Object.hasOwn(recipes, name), 'D5 recipe not materialized');
  assert.ok(Number.isSafeInteger(repetition) && repetition >= 0);
  const cleanup = [];
  const samples = [];
  const sample = (phase) =>
    samples.push({ phase, memory: process.memoryUsage(), peakKiB: process.resourceUsage().maxRSS });
  sample('startup');
  const [transitionId, expectedOutcome] = recipes[name];
  const refused = expectedOutcome !== 'SUCCEEDED';
  let transition = ['d-preparation-input', 'd-slow-stdin'].includes(name)
    ? {
        id: transitionId,
        baseline: { 'File000000.java': 'Empty.java' },
        target: { 'File000000.java': 'Empty.java' },
      }
    : [
          'd-retained-sites',
          'd-shared-owners',
          'd-dense-upsert',
          'd-dense-remove',
          'd-complete-coverage',
          'd-overlay-retention',
        ].includes(name)
      ? { id: transitionId, baseline: {}, target: {} }
      : sourceTransitions.find((r) => r.id === transitionId);
  assert.ok(transition);
  const row = {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    status: 'WORKER_PREPARATION_ONLY',
    name,
    repetition,
    environment: nativeMetadataEnvironment(),
    recipe: await recipeIdentity(name, transition),
    expectedOutcome,
    observedOutcome: null,
    calibrationEligible: false,
    outputBytes: null,
    eventCount: null,
    wire: [],
    wireScope: 'STDIN_WRITE_CALL_BYTES_AND_CONSUMED_STDOUT_BYTES',
    sink: null,
    decoderObservation: null,
    decoderObservationCaptureFailed: null,
    requestObservation: null,
    requestObservationCaptureFailed: null,
    lifecycle: null,
    lifecycleCaptureFailure: null,
    sqlPreparation: null,
    sqlReadOwnership: null,
    sqlReadDiagnostic: null,
    sqlReadFixtureRole: null,
    stageAccounting: null,
    stageAccountingCaptureFailure: null,
    competitorStageAccounting: null,
    competitorStageAccountingCaptureFailure: null,
    sqlStage: null,
    sqlPreparedStage: null,
    sqlAdditionalReads: { competitor: null, retry: null },
    sqlCompetitorStage: null,
    sqlCompetitorStageCaptureFailure: null,
    sqlApply: null,
    sqlApplyOverlap: null,
    sqlApplyCalls: 0,
    sqlApplyCaptureFailure: null,
    sqlCompetitorApply: null,
    sqlCompetitorApplyOverlap: null,
    sqlCompetitorApplyCalls: 0,
    sqlCompetitorApplyCaptureFailure: null,
    sqlSeal: null,
    sqlSealOverlap: null,
    sqlSealCalls: 0,
    sqlSealCaptureFailure: null,
    sqlCompetitorSeal: null,
    sqlCompetitorSealOverlap: null,
    sqlCompetitorSealCalls: 0,
    sqlCompetitorSealCaptureFailure: null,
    sqlNormalize: null,
    sqlNormalizeOverlap: null,
    sqlNormalizeCalls: 0,
    sqlNormalizeCaptureFailure: null,
    sqlCompetitorNormalize: null,
    sqlCompetitorNormalizeOverlap: null,
    sqlCompetitorNormalizeCalls: 0,
    sqlCompetitorNormalizeCaptureFailure: null,
    sqlCompletion: null,
    sqlCompletionOverlap: null,
    sqlCompletionCalls: 0,
    sqlCompletionCaptureFailure: null,
    sqlCompetitorCompletion: null,
    sqlCompetitorCompletionOverlap: null,
    sqlCompetitorCompletionCalls: 0,
    sqlCompetitorCompletionCaptureFailure: null,
    retainedSqlBytes: null,
    retainedSqlStringChargeBytes: null,
    unavailableReason:
      'Final corpus identity, complete-lifecycle SQL retention and admitted measurement remain incomplete',
    persistentStateVerified: false,
    transactionClosed: false,
    tempClosed: false,
    persistedSnapshotCount: null,
    retry: null,
    measurement: null,
    samples,
    peakResidentBytes: 0,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    peakScope: 'NODE_PROCESS_LIFETIME_EXCLUDING_CHILD',
  };
  let failure = null;
  const recordReadDiagnostic = (diagnostic, role = 'SELECTED_FIXTURE') => {
    row.sqlReadDiagnostic = diagnostic;
    row.sqlReadFixtureRole = role;
  };
  try {
    const lifetime = { after: (fn) => cleanup.push(fn) };
    let f;
    if (
      [
        'd-preparation-input',
        'd-slow-stdin',
        'd-retained-sites',
        'd-shared-owners',
        'd-dense-remove',
        'd-complete-coverage',
        'd-overlay-retention',
      ].includes(name)
    ) {
      const generated = await (['d-preparation-input', 'd-slow-stdin'].includes(name)
        ? preparedSourceInputBoundary(lifetime, recordReadDiagnostic)
        : name === 'd-shared-owners'
          ? preparedSharedOwnersBoundary(lifetime, recordReadDiagnostic)
          : ['d-complete-coverage', 'd-overlay-retention'].includes(name)
            ? preparedCompleteCoverageBoundary(lifetime, recordReadDiagnostic)
            : name === 'd-dense-remove'
              ? preparedDenseRemoveBoundary(lifetime, recordReadDiagnostic)
              : preparedRetainedSitesBoundary(lifetime, recordReadDiagnostic));
      f = generated.fixture;
      transition = generated.transition;
      row.recipe = await recipeIdentity(name, transition);
      row.inputBoundary = {
        accepted: generated.accepted.metrics,
        next: generated.next.metrics,
        sizingScope: 'REAL_RUST_PER_FILE_GENERATION_OUTSIDE_CALIBRATION',
        retainedModuleCount: null,
        retainedFieldCount: null,
        retainedSupportVerified: false,
        nextRefusedBeforeSpawn: false,
        nextRefusal: null,
      };
      const prior = activationImage(f.db);
      const overflow = await observeNativeWire(() =>
        streamNativeRefreshV3(
          generated.next.request,
          generated.next.baseline,
          f.options,
          {
            async accept() {
              assert.fail('Oversize input cannot reach a sink');
            },
          },
          f.prepared.limits.memoryBudgetBytes,
        ),
      );
      assert.equal(overflow.error?.code, 'OUTPUT_LIMIT_EXCEEDED');
      assert.deepEqual(overflow.wire, []);
      assert.deepEqual(activationImage(f.db), prior);
      row.inputBoundary.nextRefusedBeforeSpawn = true;
      row.inputBoundary.nextRefusal = overflow.error.code;
    } else if (name === 'd-dense-upsert') {
      row.denseBoundary = await prepareDenseUpsertBoundary(lifetime, recordReadDiagnostic);
      transition = denseUpsertTransition(row.denseBoundary.accepted.memberCount);
      row.recipe = await recipeIdentity(name, transition);
      f = await preparedSourceRefresh(lifetime, transition, 1, recordReadDiagnostic);
    } else f = await preparedSourceRefresh(lifetime, transition, 1, recordReadDiagnostic);
    row.sqlPreparation = refreshPreparationSqlDiagnostic(f.prepared);
    row.sqlReadOwnership = f.sqlReadOwnership;
    row.sqlReadDiagnostic = f.sqlReadDiagnostic;
    sample('bootstrap-reopen-prepared');
    if (name === 'd-sql-preflight') {
      await verifySqlPreflight(f, row, sample);
    } else {
      const { before, competitorSource } = await executePreparedRefreshTransport(
        f,
        row,
        sample,
        true,
      );
      const committed = activationImage(f.db);
      f.db.close();
      const reopened = new DatabaseSync(f.databasePath);
      try {
        assertClosed(reopened);
        assert.deepEqual(activationImage(reopened), refused ? before : committed);
        row.persistedSnapshotCount = reopened
          .prepare('SELECT count(*) AS n FROM provider_snapshots')
          .get().n;
        assert.equal(row.persistedSnapshotCount, name === 'd-token-race' ? 2 : refused ? 1 : 2);
        if (row.race) {
          if (competitorSource)
            assert.deepEqual(
              new RepositorySourceStateStore(reopened).load(f.targetRevision.repositoryId),
              competitorSource,
            );
          if (name === 'd-token-race')
            assert.equal(
              reopened.prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state').get()
                .id,
              'snapshot-d5-competitor',
            );
          row.race.competitorStatePreserved = true;
        }
        if (!refused) {
          assertSourceRelations(reopened, transition.relations);
          assert.equal(
            reopened.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
              .indexed_content_fingerprint,
            f.targetRevision.contentFingerprint,
          );
          assert.equal(
            reopened.prepare('SELECT provider_snapshot_id FROM native_analysis_state').get()
              .provider_snapshot_id,
            'snapshot-source-refresh',
          );
          assert.equal(
            reopened.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n,
            f.targetFiles.length,
          );
          for (const old of f.oldEvidence) {
            const current = reopened.prepare('SELECT * FROM evidence WHERE id=?').get(old.id);
            assert.ok(current, 'Historical evidence must survive');
            assert.deepEqual({ ...current, status: old.status }, { ...old });
            if (current.status === 'ACTIVE') assert.deepEqual(current, old);
          }
          if (['d-delete', 'd-zero-fact'].includes(name)) {
            assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
            assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
          }
          if (name === 'd-empty') {
            // An empty Java source has no declarations, but retains its compilation-unit MODULE.
            assert.deepEqual(
              reopened
                .prepare('SELECT kind,qualified_name,source_range_json FROM canonical_nodes')
                .all()
                .map((node) => ({ ...node })),
              [{ kind: 'MODULE', qualified_name: 'Empty.java', source_range_json: null }],
            );
            assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
          }
          if (['d-complete-coverage', 'd-overlay-retention'].includes(name)) {
            const files = f.targetFiles.filter((file) => file.path.startsWith('File'));
            const oldModules = f.prepared.baseline.summaries.filter((summary) =>
              summary.sourceFile.path.startsWith('File'),
            );
            assert.equal(oldModules.length, files.length);
            const retainedIds = new Set();
            const retainedEvidenceIds = new Set();
            for (const summary of oldModules) {
              assert.equal(summary.symbols.length, 0);
              assert.equal(summary.emittedFacts.length, 1);
              const binding = reopened
                .prepare('SELECT * FROM provider_fact_bindings WHERE provider_fact_id=?')
                .get(summary.emittedFacts[0].providerFactId);
              assert.ok(binding);
              assert.equal(binding.provider_snapshot_id, 'snapshot-source-bootstrap');
              retainedIds.add(binding.canonical_fact_id);
              retainedEvidenceIds.add(binding.evidence_id);
            }
            // Independent MODULE names/null ranges and every retained support row,
            // not merely equal summary digests or the selected representative.
            const image = activationImage(reopened);
            const evidenceRows = (rows) =>
              rows.filter((raw) => retainedEvidenceIds.has(JSON.parse(raw).id));
            assert.deepEqual(evidenceRows(image.evidence), evidenceRows(before.evidence));
            assert.equal(evidenceRows(image.evidence).length, files.length);
            assert.ok(
              evidenceRows(image.evidence).every((raw) => JSON.parse(raw).status === 'ACTIVE'),
            );
            for (const table of [
              'canonical_nodes',
              'fact_evidence',
              'provider_fact_bindings',
              'active_support_candidates',
            ]) {
              const kept = (rows) =>
                rows.filter((raw) => {
                  const value = JSON.parse(raw);
                  return retainedIds.has(value.canonical_fact_id ?? value.fact_id ?? value.id);
                });
              assert.deepEqual(kept(image[table]), kept(before[table]));
              assert.equal(kept(image[table]).length, files.length);
            }
            assert.deepEqual(
              reopened
                .prepare(
                  "SELECT kind,qualified_name,source_range_json FROM canonical_nodes WHERE kind='MODULE' AND qualified_name LIKE 'File%' ORDER BY qualified_name",
                )
                .all()
                .map((value) => ({ ...value })),
              files.map((file) => ({
                kind: 'MODULE',
                qualified_name: file.path,
                source_range_json: null,
              })),
            );
            const summaries = reopened
              .prepare('SELECT summary_json FROM native_analysis_file ORDER BY source_path')
              .all()
              .map((value) => JSON.parse(value.summary_json));
            assert.deepEqual(
              summaries.map((summary) => summary.sourceFile),
              f.targetFiles,
            );
            for (const summary of summaries) {
              assert.equal(summary.coverage.length, 5);
              assert.deepEqual(summary.coverage.map((coverage) => coverage.capability).sort(), [
                'CALL',
                'IMPORT',
                'INHERITANCE',
                'REFERENCE',
                'SYMBOL',
              ]);
              for (const coverage of summary.coverage) {
                assert.equal(coverage.sourceFileId, summary.sourceFile.id);
                assert.equal(coverage.coverage, 'COMPLETE');
                if (summary.sourceFile.path.startsWith('File')) {
                  assert.deepEqual(coverage.statistics, {
                    eligibleSites: 0,
                    coveredSites: 0,
                    unsupportedSites: 0,
                    partialSites: 0,
                    resolutionCounts: {
                      EXACT: 0,
                      HEURISTIC: 0,
                      AMBIGUOUS: 0,
                      UNRESOLVED: 0,
                      UNSUPPORTED: 0,
                    },
                  });
                } else if (
                  summary.sourceFile.id === 'Caller.java' &&
                  coverage.capability === 'CALL'
                ) {
                  assert.deepEqual(coverage.statistics, {
                    eligibleSites: 1,
                    coveredSites: 1,
                    unsupportedSites: 0,
                    partialSites: 0,
                    resolutionCounts: {
                      EXACT: 1,
                      HEURISTIC: 0,
                      AMBIGUOUS: 0,
                      UNRESOLVED: 0,
                      UNSUPPORTED: 0,
                    },
                  });
                }
              }
            }
            const expectedCoverage = f.targetFiles.flatMap((file) =>
              ['CALL', 'IMPORT', 'INHERITANCE', 'REFERENCE', 'SYMBOL'].map((capability) => ({
                source_file_id: file.id,
                capability_name: capability,
                status: 'COMPLETE',
              })),
            );
            assert.deepEqual(
              reopened
                .prepare(
                  "SELECT source_file_id,capability_name,status FROM analysis_coverage WHERE provider_snapshot_id='snapshot-source-refresh' ORDER BY source_file_id,capability_name",
                )
                .all()
                .map((value) => ({ ...value })),
              expectedCoverage,
            );
            assert.equal(
              reopened
                .prepare(
                  "SELECT count(*) AS n FROM canonical_nodes WHERE qualified_name='Target.go'",
                )
                .get().n,
              1,
            );
            assert.equal(
              reopened
                .prepare(
                  "SELECT count(*) AS n FROM canonical_nodes WHERE qualified_name='Target.gone'",
                )
                .get().n,
              0,
            );
            assert.equal(
              reopened
                .prepare(
                  "SELECT count(*) AS n FROM analysis_coverage WHERE provider_snapshot_id='snapshot-source-refresh'",
                )
                .get().n,
              f.targetFiles.length * 5,
            );
            assert.deepEqual(row.inputBoundary.parsedFiles, ['Target.java']);
            assert.equal(row.inputBoundary.summaryCount, f.targetFiles.length);
            assert.equal(row.inputBoundary.coverageCount, f.targetFiles.length * 5);
            row.inputBoundary.retainedModuleCount = files.length;
            row.inputBoundary.retainedSupportVerified = true;
          }
          if (['d-preparation-input', 'd-retained-sites', 'd-shared-owners'].includes(name)) {
            const modules = reopened
              .prepare(
                'SELECT kind,qualified_name,source_range_json FROM canonical_nodes ORDER BY qualified_name',
              )
              .all()
              .map((node) => ({ ...node }));
            if (name === 'd-preparation-input')
              assert.deepEqual(
                modules,
                f.targetFiles.map((file) => ({
                  kind: 'MODULE',
                  qualified_name: file.path,
                  source_range_json: null,
                })),
              );
            else if (name === 'd-shared-owners') {
              const count = f.targetFiles.length;
              assert.equal(modules.length, count * 2 + 1);
              assert.deepEqual(
                modules.filter((node) => node.kind === 'MODULE'),
                f.targetFiles.map((file) => ({
                  kind: 'MODULE',
                  qualified_name: file.path,
                  source_range_json: null,
                })),
              );
              assert.deepEqual(
                modules
                  .filter((node) => node.kind === 'TYPE')
                  .map((node) => ({
                    ...node,
                    source_range_json: JSON.parse(node.source_range_json),
                  }))
                  .sort((a, b) =>
                    a.source_range_json.sourceFileId.localeCompare(
                      b.source_range_json.sourceFileId,
                    ),
                  ),
                f.targetFiles.map((file) => ({
                  kind: 'TYPE',
                  qualified_name: 'p.A',
                  source_range_json: {
                    sourceFileId: file.id,
                    startLine: 2,
                    startColumn: 6,
                    endLine: 2,
                    endColumn: 7,
                  },
                })),
              );
              const packages = modules.filter((node) => node.kind === 'PACKAGE');
              assert.equal(packages.length, 1);
              assert.equal(packages[0].qualified_name, 'p');
              const summaries = reopened
                .prepare('SELECT summary_json FROM native_analysis_file ORDER BY source_path')
                .all()
                .map((file) => JSON.parse(file.summary_json));
              let shared;
              for (const [index, summary] of summaries.entries()) {
                assert.deepEqual(summary.sourceFile, f.targetFiles[index]);
                const owners = summary.emittedFacts.filter((fact) => fact.ownership === 'SHARED');
                assert.equal(owners.length, 1);
                assert.equal(owners[0].factType, 'NODE');
                if (shared) assert.deepEqual(owners[0], shared);
                else shared = owners[0];
                assert.equal(summary.coverage.length, 5);
                for (const coverage of summary.coverage) {
                  const sites =
                    coverage.capability === 'SYMBOL' ? 2 : coverage.capability === 'IMPORT' ? 1 : 0;
                  assert.equal(coverage.sourceFileId, summary.sourceFile.id);
                  assert.equal(coverage.coverage, 'COMPLETE');
                  assert.deepEqual(coverage.statistics, {
                    eligibleSites: sites,
                    coveredSites: sites,
                    unsupportedSites: 0,
                    partialSites: 0,
                    resolutionCounts: {
                      EXACT: coverage.capability === 'IMPORT' ? 1 : 0,
                      HEURISTIC: 0,
                      AMBIGUOUS: 0,
                      UNRESOLVED: 0,
                      UNSUPPORTED: 0,
                    },
                  });
                }
              }
              const supports = reopened
                .prepare('SELECT * FROM provider_fact_bindings WHERE provider_fact_id=?')
                .all(shared.providerFactId);
              assert.equal(supports.length, 1);
              assert.equal(supports[0].provider_snapshot_id, 'snapshot-source-bootstrap');
              const edges = reopened
                .prepare(
                  `SELECT e.kind,e.resolution,e.target_node_id,
                  json_extract(e.source_range_json,'$.sourceFileId') AS source_file_id
                  FROM canonical_edges e ORDER BY source_file_id`,
                )
                .all();
              assert.deepEqual(
                edges.map((edge) => ({ ...edge })),
                f.targetFiles.map((file) => ({
                  kind: 'IMPORT',
                  resolution: 'EXACT',
                  target_node_id: supports[0].canonical_fact_id,
                  source_file_id: file.id,
                })),
              );
              row.inputBoundary.sharedOwnerCount = summaries.length;
              row.inputBoundary.sharedSupportCount = supports.length;
            } else {
              const count = row.inputBoundary.accepted.memberCount;
              assert.deepEqual(
                modules.map(({ kind, qualified_name }) => ({ kind, qualified_name })),
                [
                  { kind: 'TYPE', qualified_name: 'Sites' },
                  { kind: 'MODULE', qualified_name: 'Sites.java' },
                  ...Array.from({ length: count }, (_, index) => ({
                    kind: 'SYMBOL',
                    qualified_name: `Sites.f${String(index).padStart(6, '0')}`,
                  })),
                ].sort((a, b) =>
                  a.qualified_name < b.qualified_name
                    ? -1
                    : a.qualified_name > b.qualified_name
                      ? 1
                      : 0,
                ),
              );
              const retained = JSON.parse(
                reopened.prepare('SELECT summary_json FROM native_analysis_file').get()
                  .summary_json,
              );
              const symbolCoverage = retained.coverage.find((item) => item.capability === 'SYMBOL');
              assert.equal(symbolCoverage.coverage, 'COMPLETE');
              assert.deepEqual(symbolCoverage.statistics, {
                eligibleSites: count + 1,
                coveredSites: count + 1,
                unsupportedSites: 0,
                partialSites: 0,
                resolutionCounts: {
                  EXACT: 0,
                  HEURISTIC: 0,
                  AMBIGUOUS: 0,
                  UNRESOLVED: 0,
                  UNSUPPORTED: 0,
                },
              });
              row.inputBoundary.retainedFieldCount = count;
            }
            if (name !== 'd-shared-owners')
              assert.equal(
                reopened.prepare('SELECT count(*) AS n FROM canonical_edges').get().n,
                0,
              );
            for (const table of [
              'canonical_nodes',
              'canonical_edges',
              'unresolved_targets',
              'evidence',
              'fact_evidence',
              'provider_fact_bindings',
              'active_support_candidates',
            ])
              assert.deepEqual(
                committed[table],
                before[table],
                `Retained ${table} must not be relabeled`,
              );
            assert.equal(
              reopened
                .prepare('SELECT count(*) AS n FROM analysis_coverage WHERE provider_snapshot_id=?')
                .get('snapshot-source-refresh').n,
              f.targetFiles.length * 5,
            );
            row.inputBoundary.retainedModuleCount = modules.filter(
              (node) => node.kind === 'MODULE',
            ).length;
            row.inputBoundary.retainedSupportVerified = true;
          }
          if (name === 'd-dense-remove') {
            const count = row.inputBoundary.accepted.memberCount;
            const oldNodes = before.canonical_nodes.map((raw) => JSON.parse(raw));
            const fields = oldNodes
              .filter((node) => node.kind === 'SYMBOL')
              .sort((a, b) => a.qualified_name.localeCompare(b.qualified_name));
            assert.deepEqual(
              fields.map((node) => node.qualified_name),
              Array.from(
                { length: count },
                (_, index) => `Sites.f${String(index).padStart(6, '0')}`,
              ),
            );
            assert.deepEqual(
              fields.map((node) => JSON.parse(node.source_range_json)),
              Array.from({ length: count }, (_, index) => ({
                sourceFileId: 'Sites.java',
                startLine: index + 1,
                startColumn: 6,
                endLine: index + 1,
                endColumn: 13,
              })),
            );
            assert.deepEqual(
              oldNodes
                .filter((node) => node.kind !== 'SYMBOL')
                .map((node) => ({ kind: node.kind, name: node.qualified_name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
              [
                { kind: 'TYPE', name: 'Sites' },
                { kind: 'MODULE', name: 'Sites.java' },
              ],
            );
            const removedIds = new Set(fields.map((node) => node.id));
            const retiredEvidence = new Set(
              before.provider_fact_bindings
                .map((raw) => JSON.parse(raw))
                .filter((binding) => removedIds.has(binding.canonical_fact_id))
                .map((binding) => binding.evidence_id),
            );
            assert.equal(retiredEvidence.size, count);
            assert.deepEqual(
              committed.canonical_nodes,
              before.canonical_nodes.filter((raw) => !removedIds.has(JSON.parse(raw).id)),
            );
            for (const table of [
              'fact_evidence',
              'provider_fact_bindings',
              'active_support_candidates',
            ]) {
              assert.deepEqual(
                committed[table],
                before[table].filter((raw) => !removedIds.has(JSON.parse(raw).canonical_fact_id)),
                `Only removed field support may retire from ${table}`,
              );
              assert.equal(committed[table].length, 2);
            }
            assert.deepEqual(
              committed.evidence,
              before.evidence
                .map((raw) => {
                  const evidence = JSON.parse(raw);
                  if (retiredEvidence.has(evidence.id)) evidence.status = 'INVALIDATED';
                  return JSON.stringify(evidence);
                })
                .sort(),
            );
            for (const table of ['canonical_edges', 'unresolved_targets'])
              assert.deepEqual(committed[table], []);
            assert.equal(row.inputBoundary.removals, count);
            assert.equal(row.inputBoundary.upserts, 0);
            const summary = JSON.parse(
              reopened.prepare('SELECT summary_json FROM native_analysis_file').get().summary_json,
            );
            assert.deepEqual(summary.sourceFile, f.targetFiles[0]);
            assert.equal(summary.symbols.length, 1);
            assert.equal(summary.symbols[0].name, 'Sites');
            assert.equal(summary.emittedFacts.length, 2);
            assert.equal(summary.coverage.length, 5);
            for (const item of summary.coverage) {
              assert.equal(item.sourceFileId, 'Sites.java');
              assert.equal(item.coverage, 'COMPLETE');
              const sites = item.capability === 'SYMBOL' ? 1 : 0;
              assert.deepEqual(item.statistics, {
                eligibleSites: sites,
                coveredSites: sites,
                unsupportedSites: 0,
                partialSites: 0,
                resolutionCounts: {
                  EXACT: 0,
                  HEURISTIC: 0,
                  AMBIGUOUS: 0,
                  UNRESOLVED: 0,
                  UNSUPPORTED: 0,
                },
              });
            }
            assert.equal(
              reopened
                .prepare('SELECT count(*) AS n FROM analysis_coverage WHERE provider_snapshot_id=?')
                .get('snapshot-source-refresh').n,
              5,
            );
            row.inputBoundary.removedFieldCount = count;
            row.inputBoundary.invalidatedEvidenceCount = reopened
              .prepare("SELECT count(*) AS n FROM evidence WHERE status='INVALIDATED'")
              .get().n;
            row.inputBoundary.activeSupportCount = reopened
              .prepare('SELECT count(*) AS n FROM provider_fact_bindings')
              .get().n;
            row.inputBoundary.retainedModuleCount = 1;
            row.inputBoundary.retainedFieldCount = 0;
            row.inputBoundary.retiredSupportVerified = true;
            row.inputBoundary.retainedSupportVerified = true;
          }
          if (name === 'd-dense-upsert') {
            const count = row.denseBoundary.accepted.memberCount;
            const nodes = reopened
              .prepare(
                'SELECT kind,qualified_name,source_range_json FROM canonical_nodes ORDER BY qualified_name',
              )
              .all();
            assert.equal(nodes.length, count + 2);
            assert.deepEqual(
              nodes
                .filter((node) => node.kind === 'SYMBOL')
                .map((node) => ({
                  kind: node.kind,
                  name: node.qualified_name,
                  range: JSON.parse(node.source_range_json),
                })),
              Array.from({ length: count }, (_, index) => ({
                kind: 'SYMBOL',
                name: `Sites.f${String(index).padStart(6, '0')}`,
                range: {
                  sourceFileId: 'Sites.java',
                  startLine: index + 1,
                  startColumn: 6,
                  endLine: index + 1,
                  endColumn: 13,
                },
              })),
            );
            assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
            for (const table of [
              'canonical_nodes',
              'evidence',
              'fact_evidence',
              'provider_fact_bindings',
              'active_support_candidates',
            ])
              for (const old of before[table])
                assert.ok(
                  committed[table].includes(old),
                  `Retained ${table} must not be relabeled`,
                );
            const bindings = reopened
              .prepare(
                `SELECT b.provider_snapshot_id,n.qualified_name FROM provider_fact_bindings b JOIN evidence e ON e.id=b.evidence_id AND e.status='ACTIVE' JOIN canonical_nodes n ON n.id=b.canonical_fact_id AND n.revision_id=e.revision_id JOIN fact_evidence f ON f.evidence_id=e.id AND f.canonical_fact_id=n.id AND f.fact_type='NODE' JOIN active_support_candidates c ON c.evidence_id=e.id AND c.canonical_fact_id=n.id WHERE n.kind='SYMBOL' ORDER BY n.qualified_name`,
              )
              .all();
            assert.deepEqual(
              bindings.map((binding) => ({ ...binding })),
              Array.from({ length: count }, (_, index) => ({
                provider_snapshot_id: 'snapshot-source-refresh',
                qualified_name: `Sites.f${String(index).padStart(6, '0')}`,
              })),
            );
            const summary = JSON.parse(
              reopened.prepare('SELECT summary_json FROM native_analysis_file').get().summary_json,
            );
            assert.deepEqual(summary.sourceFile, f.targetFiles[0]);
            assert.equal(summary.symbols.length, count + 1);
            assert.equal(summary.emittedFacts.length, count + 2);
            assert.equal(summary.coverage.length, 5);
            for (const item of summary.coverage) {
              assert.equal(item.coverage, 'COMPLETE');
              const sites = item.capability === 'SYMBOL' ? count + 1 : 0;
              assert.deepEqual(item.statistics, {
                eligibleSites: sites,
                coveredSites: sites,
                unsupportedSites: 0,
                partialSites: 0,
                resolutionCounts: {
                  EXACT: 0,
                  HEURISTIC: 0,
                  AMBIGUOUS: 0,
                  UNRESOLVED: 0,
                  UNSUPPORTED: 0,
                },
              });
            }
            row.denseBoundary.newFieldCount = count;
            row.denseBoundary.newSupportVerified = true;
            row.denseBoundary.retainedSupportVerified = true;
          }
          if (name === 'd-reopen') {
            await prepareRefreshTransportRetry(reopened, f, row, (db) =>
              assert.deepEqual(activationImage(db), committed, 'Preparing retry must not apply'),
            );
          }
        }
        row.persistentStateVerified = true;
        sample('reopened-verified');
      } finally {
        reopened.close();
      }
    }
  } catch (error) {
    failure = failureDiagnostic(error);
  } finally {
    Object.freeze(row.sqlAdditionalReads);
    const closed = await closeRefreshTransportWorkerResources(cleanup, failure);
    failure = closed.failure;
    sample('finished');
    row.peakResidentBytes = Math.max(...samples.map((s) => s.peakKiB * 1024));
    try {
      row.lifecycle = refreshTransportLifecycleDiagnostic(row, closed.cleanup, failure !== null);
    } catch (error) {
      // Evidence refusal must not mask the original operation/cleanup outcome.
      row.lifecycleCaptureFailure = failureDiagnostic(error);
    }
  }
  return { row, failure };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await runRefreshTransportWorker(
      process.argv[2],
      process.argv[3],
      Number(process.argv[4]),
    );
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.failure ? 1 : 0;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ workspace: 'REFRESH_TRANSPORT', failure: failureDiagnostic(error) }) + '\n',
    );
    process.exitCode = 1;
  }
}
