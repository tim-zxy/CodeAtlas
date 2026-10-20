import { types } from 'node:util';
import { ContentFingerprintSchema, EntityIdSchema, WorktreeRevisionSchema } from '@codeatlas/ir';
import type { ContentFingerprint, EntityId, WorktreeRevision } from '@codeatlas/ir';
import { compilePathPolicy } from '../../source/dist/path-policy.js';

export type IndexReadBudget = {
  maxMetadataRows: number;
  maxResultBytes: number;
  timeoutMs: number;
};
export type IndexConfigurationV1 = {
  configVersion: 1;
  source: { include: readonly string[]; exclude: readonly string[] };
  indexing: { nativeAnalyzer: { parseWorkers: 'AUTO' | number } };
  resourceBudget: { maxDurationMs: number; maxMemoryBytes: number; maxEvents: number };
  transportLimits: {
    maxStdinBytes: number;
    maxLineBytes: number;
    maxStdoutBytes: number;
    maxEvents: number;
    maxStderrBytes: number;
  };
};
export type IndexWriteRequest = {
  schemaVersion: 1;
  operation: 'FULL' | 'INCREMENTAL';
  databasePath: string;
  repositoryId: EntityId;
  repositoryRoot: string;
  nativeExecutablePath: string;
  initialize: boolean;
  configuration: IndexConfigurationV1;
};
export type IndexStatusRequest = {
  schemaVersion: 1;
  operation: 'STATUS';
  databasePath: string;
  repositoryId: EntityId;
  budget: IndexReadBudget;
};
export type IndexStatusView = {
  source: WorktreeRevision | null;
  indexed: { revisionId: EntityId | null; contentFingerprint: ContentFingerprint | null };
  freshness: {
    basis: 'PERSISTED_SOURCE';
    worktree: 'NOT_OBSERVED';
    state: 'NOT_INDEXED' | 'CURRENT' | 'STALE' | 'UNKNOWN';
  };
  baseline: { state: 'MISSING' | 'LEGACY' | 'PRESENT_UNVERIFIED' };
  coverage: {
    scope: 'PERSISTED_NATIVE_SNAPSHOT';
    snapshotId: EntityId | null;
    capabilities: readonly {
      name: string;
      complete: number;
      partial: number;
      none: number;
      unknown: number;
    }[];
  };
};
export type IndexStageTimings = {
  scanMs: number | null;
  transportMs: number | null;
  normalizeMs: number | null;
  mergeMs: number | null;
  dbApplyMs: number | null;
  dbLockMs: number | null;
  totalMs: number;
  unavailableReasons: Readonly<Record<string, string>>;
};
export type IndexWriteResult = {
  schemaVersion: 1;
  kind: 'INDEX_OPERATION';
  operation: 'FULL' | 'INCREMENTAL';
  outcome: 'SUCCEEDED';
  databaseInitialized: boolean;
  sourceReconciled: true;
  graphCommitted: true;
  status: IndexStatusView;
  timings: IndexStageTimings;
  workers: { requested: 'AUTO' | number; effectiveCount: number };
};
export type IndexStatusResult = { schemaVersion: 1; kind: 'INDEX_STATUS'; status: IndexStatusView };
export type IndexEffects = {
  databaseInitialized: boolean | null;
  sourceReconciled: boolean | null;
  graphCommit: 'NOT_ATTEMPTED' | 'NOT_COMMITTED' | 'COMMITTED' | 'UNKNOWN';
};
export type IndexCommandErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CONFIGURATION'
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_ALREADY_EXISTS'
  | 'DATABASE_KIND_MISMATCH'
  | 'DATABASE_UPGRADE_REQUIRED'
  | 'DATABASE_TOO_NEW'
  | 'REPOSITORY_MISMATCH'
  | 'SOURCE_FAILED'
  | 'FULL_ANALYSIS_REQUIRED'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_NATIVE'
  | 'ANALYSIS_FAILED'
  | 'CANCELLED'
  | 'INDEX_DATA_INVALID';

export class IndexCommandError extends Error {
  readonly effects: Readonly<IndexEffects>;
  constructor(
    readonly code: IndexCommandErrorCode,
    effects: IndexEffects = {
      databaseInitialized: null,
      sourceReconciled: null,
      graphCommit: 'UNKNOWN',
    },
  ) {
    super(
      'Index command did not complete; inspect its controlled code and persisted status before retrying.',
    );
    this.name = 'IndexCommandError';
    const row = keys(effects, ['databaseInitialized', 'sourceReconciled', 'graphCommit']);
    for (const field of ['databaseInitialized', 'sourceReconciled'])
      check(row[field] === null || typeof row[field] === 'boolean');
    choice(row.graphCommit, ['NOT_ATTEMPTED', 'NOT_COMMITTED', 'COMMITTED', 'UNKNOWN']);
    this.effects = Object.freeze({ ...effects });
  }
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid index data');
}
function record(value: unknown): Record<string, unknown> {
  check(
    value !== null && typeof value === 'object' && !types.isProxy(value) && !Array.isArray(value),
  );
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    check(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }
  return value as Record<string, unknown>;
}
function keys(value: unknown, expected: readonly string[]): Record<string, unknown> {
  const row = record(value);
  check(
    Reflect.ownKeys(row).length === expected.length &&
      expected.every((key) => Object.hasOwn(row, key)),
  );
  return row;
}
function text(value: unknown): string {
  check(
    typeof value === 'string' &&
      value.length > 0 &&
      value.trim() === value &&
      !value.includes('\0'),
  );
  return value;
}
function integer(value: unknown, minimum = 1): number {
  check(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      !Object.is(value, -0),
  );
  return value;
}
function duration(value: unknown): number {
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && !Object.is(value, -0));
  return value;
}
function choice(value: unknown, options: readonly string[]): void {
  check(typeof value === 'string' && options.includes(value));
}
function list(value: unknown): unknown[] {
  check(Array.isArray(value) && !types.isProxy(value));
  check(Object.getPrototypeOf(value) === Array.prototype);
  check(Reflect.ownKeys(value).length === value.length + 1);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }
  return value;
}
function boolean(value: unknown): boolean {
  check(typeof value === 'boolean');
  return value;
}
function worker(value: unknown): 'AUTO' | number {
  return value === 'AUTO' ? value : integer(value);
}
function nullableId(value: unknown): EntityId | null {
  return value === null ? null : EntityIdSchema.parse(text(value));
}

export function parseIndexConfiguration(value: unknown): IndexConfigurationV1 {
  try {
    const row = keys(value, [
      'configVersion',
      'source',
      'indexing',
      'resourceBudget',
      'transportLimits',
    ]);
    check(row.configVersion === 1);
    const source = keys(row.source, ['include', 'exclude']);
    const policy = {
      include: list(source.include).map(text),
      exclude: list(source.exclude).map(text),
    };
    compilePathPolicy(policy);
    const analyzer = keys(keys(row.indexing, ['nativeAnalyzer']).nativeAnalyzer, ['parseWorkers']);
    const budget = keys(row.resourceBudget, ['maxDurationMs', 'maxMemoryBytes', 'maxEvents']);
    const caps = {
      maxStdinBytes: 1_000_000,
      maxLineBytes: 1_000_000,
      maxStdoutBytes: 10_000_000,
      maxEvents: 10_000,
      maxStderrBytes: 1_000_000,
    };
    const limits = keys(row.transportLimits, Object.keys(caps));
    for (const key of Object.keys(caps) as (keyof typeof caps)[])
      check(integer(limits[key]) <= caps[key]);
    return {
      configVersion: 1,
      source: policy,
      indexing: { nativeAnalyzer: { parseWorkers: worker(analyzer.parseWorkers) } },
      resourceBudget: {
        maxDurationMs: integer(budget.maxDurationMs),
        maxMemoryBytes: integer(budget.maxMemoryBytes),
        maxEvents: integer(budget.maxEvents),
      },
      transportLimits: {
        maxStdinBytes: limits.maxStdinBytes as number,
        maxLineBytes: limits.maxLineBytes as number,
        maxStdoutBytes: limits.maxStdoutBytes as number,
        maxEvents: limits.maxEvents as number,
        maxStderrBytes: limits.maxStderrBytes as number,
      },
    };
  } catch {
    throw new IndexCommandError('INVALID_CONFIGURATION');
  }
}

export function parseIndexRequest(value: unknown): IndexWriteRequest | IndexStatusRequest {
  try {
    const row = record(value);
    const common = ['schemaVersion', 'operation', 'databasePath', 'repositoryId'];
    keys(row, [
      ...common,
      ...(row.operation === 'STATUS'
        ? ['budget']
        : ['repositoryRoot', 'nativeExecutablePath', 'initialize', 'configuration']),
    ]);
    check(row.schemaVersion === 1);
    const databasePath = text(row.databasePath);
    const repositoryId = EntityIdSchema.parse(text(row.repositoryId));
    if (row.operation === 'STATUS') {
      const budget = keys(row.budget, ['maxMetadataRows', 'maxResultBytes', 'timeoutMs']);
      return {
        schemaVersion: 1,
        operation: 'STATUS',
        databasePath,
        repositoryId,
        budget: {
          maxMetadataRows: integer(budget.maxMetadataRows),
          maxResultBytes: integer(budget.maxResultBytes),
          timeoutMs: integer(budget.timeoutMs),
        },
      };
    }
    choice(row.operation, ['FULL', 'INCREMENTAL']);
    const initialize = boolean(row.initialize);
    check(row.operation === 'FULL' || !initialize);
    return {
      schemaVersion: 1,
      operation: row.operation as 'FULL' | 'INCREMENTAL',
      databasePath,
      repositoryId,
      repositoryRoot: text(row.repositoryRoot),
      nativeExecutablePath: text(row.nativeExecutablePath),
      initialize,
      configuration: parseIndexConfiguration(row.configuration),
    };
  } catch {
    throw new IndexCommandError('INVALID_REQUEST');
  }
}

function status(value: unknown): IndexStatusView {
  const row = keys(value, ['source', 'indexed', 'freshness', 'baseline', 'coverage']);
  let source: WorktreeRevision | null = null;
  if (row.source !== null) {
    const s = keys(row.source, [
      'id',
      'repositoryId',
      'kind',
      'contentFingerprint',
      'baseRevisionId',
    ]);
    // All fields are scalars before invoking the existing IR decoder.
    for (const key of ['id', 'repositoryId', 'kind', 'contentFingerprint']) text(s[key]);
    if (s.baseRevisionId !== null) text(s.baseRevisionId);
    source = WorktreeRevisionSchema.parse(s);
  }
  const i = keys(row.indexed, ['revisionId', 'contentFingerprint']);
  const indexed = {
    revisionId: nullableId(i.revisionId),
    contentFingerprint:
      i.contentFingerprint === null
        ? null
        : ContentFingerprintSchema.parse(text(i.contentFingerprint)),
  };
  const f = keys(row.freshness, ['basis', 'worktree', 'state']);
  check(f.basis === 'PERSISTED_SOURCE' && f.worktree === 'NOT_OBSERVED');
  const state =
    indexed.revisionId === null && indexed.contentFingerprint === null
      ? 'NOT_INDEXED'
      : indexed.revisionId === null || indexed.contentFingerprint === null || source === null
        ? 'UNKNOWN'
        : indexed.revisionId === source.id &&
            indexed.contentFingerprint === source.contentFingerprint
          ? 'CURRENT'
          : 'STALE';
  check(f.state === state);
  const baseline = keys(row.baseline, ['state']);
  choice(baseline.state, ['MISSING', 'LEGACY', 'PRESENT_UNVERIFIED']);
  const coverage = keys(row.coverage, ['scope', 'snapshotId', 'capabilities']);
  check(coverage.scope === 'PERSISTED_NATIVE_SNAPSHOT');
  const snapshotId = nullableId(coverage.snapshotId);
  const names = new Set<string>();
  const capabilities = list(coverage.capabilities).map((value) => {
    const cap = keys(value, ['name', 'complete', 'partial', 'none', 'unknown']);
    const name = text(cap.name);
    check(!names.has(name));
    names.add(name);
    return {
      name,
      complete: integer(cap.complete, 0),
      partial: integer(cap.partial, 0),
      none: integer(cap.none, 0),
      unknown: integer(cap.unknown, 0),
    };
  });
  check(snapshotId !== null || capabilities.length === 0);
  return {
    source,
    indexed,
    freshness: { basis: 'PERSISTED_SOURCE', worktree: 'NOT_OBSERVED', state },
    baseline: { state: baseline.state as IndexStatusView['baseline']['state'] },
    coverage: { scope: 'PERSISTED_NATIVE_SNAPSHOT', snapshotId, capabilities },
  };
}

export function parseIndexResult(value: unknown): IndexWriteResult | IndexStatusResult {
  try {
    const row = record(value);
    check(row.schemaVersion === 1);
    if (row.kind === 'INDEX_STATUS') {
      keys(row, ['schemaVersion', 'kind', 'status']);
      return { schemaVersion: 1, kind: 'INDEX_STATUS', status: status(row.status) };
    }
    keys(row, [
      'schemaVersion',
      'kind',
      'operation',
      'outcome',
      'databaseInitialized',
      'sourceReconciled',
      'graphCommitted',
      'status',
      'timings',
      'workers',
    ]);
    check(
      row.kind === 'INDEX_OPERATION' &&
        row.outcome === 'SUCCEEDED' &&
        row.sourceReconciled === true &&
        row.graphCommitted === true,
    );
    choice(row.operation, ['FULL', 'INCREMENTAL']);
    const databaseInitialized = boolean(row.databaseInitialized);
    check(row.operation === 'FULL' || !databaseInitialized);
    const t = keys(row.timings, [
      'scanMs',
      'transportMs',
      'normalizeMs',
      'mergeMs',
      'dbApplyMs',
      'dbLockMs',
      'totalMs',
      'unavailableReasons',
    ]);
    const reasons = record(t.unavailableReasons);
    const timings = {} as IndexStageTimings;
    for (const key of [
      'scanMs',
      'transportMs',
      'normalizeMs',
      'mergeMs',
      'dbApplyMs',
      'dbLockMs',
    ] as const) {
      timings[key] = t[key] === null ? null : duration(t[key]);
      check(t[key] !== null || typeof reasons[key] === 'string');
    }
    timings.totalMs = duration(t.totalMs);
    const copiedReasons: Record<string, string> = Object.fromEntries(
      Object.keys(reasons).map((key) => [key, text(reasons[key])]),
    );
    timings.unavailableReasons = copiedReasons;
    const w = keys(row.workers, ['requested', 'effectiveCount']);
    const workers = { requested: worker(w.requested), effectiveCount: integer(w.effectiveCount) };
    check(workers.requested === 'AUTO' || workers.requested === workers.effectiveCount);
    const view = status(row.status);
    check(view.freshness.state === 'CURRENT');
    return {
      schemaVersion: 1,
      kind: 'INDEX_OPERATION',
      operation: row.operation as 'FULL' | 'INCREMENTAL',
      outcome: 'SUCCEEDED',
      databaseInitialized,
      sourceReconciled: true,
      graphCommitted: true,
      status: view,
      timings,
      workers,
    };
  } catch {
    throw new IndexCommandError('INDEX_DATA_INVALID');
  }
}
