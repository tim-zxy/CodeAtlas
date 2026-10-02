import type { RepositoryAnalysisStage } from './temp-stage.js';
import type { DatabaseSync } from 'node:sqlite';

export interface NativeStateLimits {
  readonly maxSerializedBytes: number;
  readonly memoryBudgetBytes: number;
}
export interface NativeActivationToken {
  readonly committedSnapshotCount: number;
  readonly indexedRevisionId: string | null;
  readonly indexedContentFingerprint: string | null;
  readonly states: readonly {
    readonly providerId: string;
    readonly snapshotId: string;
    readonly summaryDigest: string;
  }[];
}
export interface NativeStateExpectation {
  readonly repositoryId: string;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly revisionId: string;
  readonly contentFingerprint: string;
  readonly language: {
    readonly languageId: string;
    readonly grammarVersion: string;
    readonly analyzerVersion: string;
    readonly compatibilityVersion: string;
  };
  readonly resolverVersion: string;
  readonly normalizerVersion: string;
  readonly policyFingerprint: string;
  readonly requestedCapabilities: readonly string[];
}
export interface NativeStateJsonFile {
  readonly sourceFileId: string;
  readonly sourcePath: string;
  readonly contentFingerprint: string;
  readonly summaryJson: string;
}
export interface ValidatedNativeState {
  readonly expected: NativeStateExpectation;
  readonly headerJson: string;
  readonly summaryDigest: string;
  readonly files: readonly NativeStateJsonFile[];
}
export interface NativeStateValidationInput extends NativeStateLimits {
  readonly headerJson: string;
  readonly files: Iterable<NativeStateJsonFile>;
  readonly expected: NativeStateExpectation;
  readonly fullStage?: Pick<
    RepositoryAnalysisStage,
    | 'readSourceFiles'
    | 'readProviderNodes'
    | 'readProviderEdges'
    | 'readCoverage'
    | 'readDiagnostics'
  >;
}
export type NativeStateValidationPort = (input: NativeStateValidationInput) => ValidatedNativeState;
export type NativeBaselineResult =
  | {
      readonly status: 'AVAILABLE';
      readonly state: ValidatedNativeState;
      readonly token: NativeActivationToken;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason:
        'MISSING' | 'INCOMPATIBLE' | 'INVALID' | 'RESOURCE_LIMIT_EXCEEDED' | 'NOT_APPLICABLE';
    };

export function assertNativeStateLimits(limits: NativeStateLimits): void {
  if (
    !limits ||
    !Number.isSafeInteger(limits.maxSerializedBytes) ||
    limits.maxSerializedBytes <= 0 ||
    limits.maxSerializedBytes > 1_000_000 ||
    !Number.isSafeInteger(limits.memoryBudgetBytes) ||
    limits.memoryBudgetBytes <= 0
  )
    throw new TypeError('Invalid native metadata limits');
}

/** Representation charge only; Runtime admission covers the measured working set. */
export function assertNativeStringBudget(bytes: number, limits: NativeStateLimits): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || 2 * bytes > limits.memoryBudgetBytes)
    throw new Error('Native metadata resource limit exceeded');
}

export function immutableNativeState(value: ValidatedNativeState): ValidatedNativeState {
  const copy = structuredClone(value);
  const pending: object[] = [copy];
  while (pending.length) {
    const next = pending.pop()!;
    if (Object.isFrozen(next)) continue;
    Object.freeze(next);
    for (const nested of Object.values(next))
      if (nested !== null && typeof nested === 'object') pending.push(nested);
  }
  return copy;
}

type StateRow = {
  repository_id: string;
  provider_id: string;
  provider_snapshot_id: string;
  revision_id: string;
  content_fingerprint: string;
  header_json: string;
};
type PointerRow = {
  indexed_revision_id: string | null;
  indexed_content_fingerprint: string | null;
};
type SnapshotRow = {
  id: string;
  repository_id: string;
  provider_id: string;
  provider_version: string;
  requested_revision_id: string;
  requested_revision_fingerprint: string;
  outcome: string;
};

function transaction<T>(db: DatabaseSync, run: () => T): T {
  const own = !db.isTransaction;
  if (own) db.exec('BEGIN');
  try {
    const result = run();
    if (own) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (own && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
function size(db: DatabaseSync, sql: string, ...args: string[]): number {
  const row = db.prepare(sql).get(...args) as { bytes: number };
  if (!Number.isSafeInteger(row.bytes) || row.bytes < 0) throw new Error('Invalid native SQL size');
  return row.bytes;
}
function sqlLengths(columns: readonly string[]): string {
  return columns.map((column) => `coalesce(length(CAST(${column} AS BLOB)), 0)`).join(' + ');
}
function pointer(db: DatabaseSync, repositoryId: string): PointerRow | undefined {
  return db
    .prepare(
      'SELECT indexed_revision_id, indexed_content_fingerprint FROM repository_state WHERE repository_id=?',
    )
    .get(repositoryId) as PointerRow | undefined;
}
function token(
  db: DatabaseSync,
  repositoryId: string,
  active: PointerRow | undefined,
): NativeActivationToken {
  // Validated full/patch Apply appends one snapshot inside its activation
  // transaction. Count also detects legacy activations when no derived header
  // exists and the indexed fingerprint is unchanged; no rowid/time ordering.
  const committedSnapshotCount = db
    .prepare('SELECT count(*) AS n FROM provider_snapshots WHERE repository_id=?')
    .get(repositoryId)?.n;
  if (!Number.isSafeInteger(committedSnapshotCount) || (committedSnapshotCount as number) < 0)
    throw new Error('Invalid native activation snapshot count');
  const states = db
    .prepare('SELECT * FROM native_analysis_state WHERE repository_id=? ORDER BY provider_id')
    .iterate(repositoryId) as IterableIterator<StateRow>;
  const result: { providerId: string; snapshotId: string; summaryDigest: string }[] = [];
  for (const row of states) {
    let header: Record<string, unknown>;
    try {
      header = JSON.parse(row.header_json);
    } catch {
      throw new Error('Invalid native activation token header');
    }
    if (
      !header ||
      typeof header !== 'object' ||
      header.repositoryId !== row.repository_id ||
      header.providerId !== row.provider_id ||
      header.revisionId !== row.revision_id ||
      header.contentFingerprint !== row.content_fingerprint ||
      typeof header.summaryDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(header.summaryDigest)
    )
      throw new Error('Invalid native activation token header');
    result.push(
      Object.freeze({
        providerId: row.provider_id,
        snapshotId: row.provider_snapshot_id,
        summaryDigest: header.summaryDigest,
      }),
    );
  }
  return Object.freeze({
    committedSnapshotCount: committedSnapshotCount as number,
    indexedRevisionId: active?.indexed_revision_id ?? null,
    indexedContentFingerprint: active?.indexed_content_fingerprint ?? null,
    states: Object.freeze(result),
  });
}

export function captureNativeActivationToken(
  db: DatabaseSync,
  repositoryId: string,
): NativeActivationToken {
  return transaction(db, () => {
    // The token is itself retained metadata. Bound it by the unchanged native
    // envelope ceiling before fetching any of its SQL strings.
    const bytes =
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['repository_id', 'provider_id', 'provider_snapshot_id', 'revision_id', 'content_fingerprint', 'header_json'])}), 0) AS bytes FROM native_analysis_state WHERE repository_id=?`,
        repositoryId,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['indexed_revision_id', 'indexed_content_fingerprint'])}), 0) AS bytes FROM repository_state WHERE repository_id=?`,
        repositoryId,
      );
    if (bytes > 1_000_000) throw new Error('Native activation token resource limit exceeded');
    return token(db, repositoryId, pointer(db, repositoryId));
  });
}

export function readNativeAnalysisState(
  db: DatabaseSync,
  expected: NativeStateExpectation,
  validate: NativeStateValidationPort,
  limits: NativeStateLimits,
): NativeBaselineResult {
  if (typeof validate !== 'function') throw new TypeError('Native validation port is required');
  assertNativeStateLimits(limits);
  const unavailable = (
    reason: Extract<NativeBaselineResult, { status: 'UNAVAILABLE' }>['reason'],
  ): NativeBaselineResult => ({ status: 'UNAVAILABLE', reason });
  return transaction(db, () => {
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version < 10) return unavailable('MISSING');
    const repo = expected.repositoryId;
    const provider = expected.providerId;
    // SQLite computes numeric lengths and row counts without materializing
    // possibly corrupt TEXT columns in Node. Everything stays in this snapshot.
    const headers = size(
      db,
      'SELECT coalesce(sum(length(CAST(header_json AS BLOB))),0) AS bytes FROM native_analysis_state WHERE repository_id=?',
      repo,
    );
    const filesJson = size(
      db,
      'SELECT coalesce(sum(length(CAST(summary_json AS BLOB))),0) AS bytes FROM native_analysis_file WHERE repository_id=? AND provider_id=?',
      repo,
      provider,
    );
    const strings =
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['repository_id', 'provider_id', 'provider_snapshot_id', 'revision_id', 'content_fingerprint', 'header_json'])}),0) AS bytes FROM native_analysis_state WHERE repository_id=?`,
        repo,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['source_file_id', 'source_path', 'content_fingerprint', 'summary_json'])}),0) AS bytes FROM native_analysis_file WHERE repository_id=? AND provider_id=?`,
        repo,
        provider,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['indexed_revision_id', 'indexed_content_fingerprint'])}),0) AS bytes FROM repository_state WHERE repository_id=?`,
        repo,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['p.id', 'p.repository_id', 'p.provider_id', 'p.provider_version', 'p.requested_revision_id', 'p.requested_revision_fingerprint', 'p.outcome'])}),0) AS bytes FROM provider_snapshots p JOIN native_analysis_state s ON s.provider_snapshot_id=p.id WHERE s.repository_id=? AND s.provider_id=?`,
        repo,
        provider,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['id', 'repository_id', 'kind'])}),0) AS bytes FROM revisions WHERE repository_id=? AND id=?`,
        repo,
        expected.revisionId,
      );
    if (
      headers + filesJson > limits.maxSerializedBytes ||
      !Number.isSafeInteger(strings) ||
      2 * strings >= limits.memoryBudgetBytes
    )
      return unavailable('RESOURCE_LIMIT_EXCEEDED');
    const count = db
      .prepare(
        'SELECT count(*) AS n FROM native_analysis_file WHERE repository_id=? AND provider_id=?',
      )
      .get(repo, provider) as { n: number };
    if (!Number.isSafeInteger(count.n) || count.n > filesJson) return unavailable('INVALID');
    const active = pointer(db, repo);
    if (!active?.indexed_revision_id || !active.indexed_content_fingerprint)
      return unavailable('MISSING');
    const row = db
      .prepare('SELECT * FROM native_analysis_state WHERE repository_id=? AND provider_id=?')
      .get(repo, provider) as StateRow | undefined;
    if (!row) return unavailable('MISSING');
    if (active.indexed_revision_id !== expected.revisionId) return unavailable('NOT_APPLICABLE');
    const revision = db
      .prepare('SELECT kind FROM revisions WHERE repository_id=? AND id=?')
      .get(repo, expected.revisionId) as { kind: string } | undefined;
    if (!revision || revision.kind !== 'WORKTREE') return unavailable('NOT_APPLICABLE');
    const snapshot = db
      .prepare(
        'SELECT id,repository_id,provider_id,provider_version,requested_revision_id,requested_revision_fingerprint,outcome FROM provider_snapshots WHERE id=?',
      )
      .get(row.provider_snapshot_id) as SnapshotRow | undefined;
    // Column/provenance checks stay in SQLite. Node must not decode the
    // candidate before the Runtime port admits its measured working set.
    const columns = db
      .prepare(
        `SELECT CASE WHEN json_valid(header_json) THEN (
      json_extract(header_json, '$.repositoryId') IS repository_id AND
      json_extract(header_json, '$.providerId') IS provider_id AND
      json_extract(header_json, '$.revisionId') IS revision_id AND
      json_extract(header_json, '$.contentFingerprint') IS content_fingerprint AND
      json_extract(header_json, '$.providerVersion') IS ?
    ) ELSE 0 END AS valid FROM native_analysis_state WHERE repository_id=? AND provider_id=?`,
      )
      .get(snapshot?.provider_version ?? null, repo, provider) as { valid: number };
    if (
      columns.valid !== 1 ||
      row.revision_id !== active.indexed_revision_id ||
      row.content_fingerprint !== active.indexed_content_fingerprint ||
      !snapshot ||
      snapshot.outcome !== 'SUCCEEDED' ||
      snapshot.repository_id !== repo ||
      snapshot.provider_id !== provider ||
      snapshot.requested_revision_id !== row.revision_id ||
      snapshot.requested_revision_fingerprint !== row.content_fingerprint
    )
      return unavailable('INVALID');
    const rows = db
      .prepare(
        'SELECT source_file_id,source_path,content_fingerprint,summary_json FROM native_analysis_file WHERE repository_id=? AND provider_id=? ORDER BY source_path',
      )
      .iterate(repo, provider) as IterableIterator<{
      source_file_id: string;
      source_path: string;
      content_fingerprint: string;
      summary_json: string;
    }>;
    function* files(): IterableIterator<NativeStateJsonFile> {
      for (const f of rows)
        yield {
          sourceFileId: f.source_file_id,
          sourcePath: f.source_path,
          contentFingerprint: f.content_fingerprint,
          summaryJson: f.summary_json,
        };
    }
    let state: ValidatedNativeState;
    try {
      state = validate({
        headerJson: row.header_json,
        files: files(),
        expected,
        maxSerializedBytes: limits.maxSerializedBytes,
        memoryBudgetBytes: limits.memoryBudgetBytes - 2 * strings,
      });
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'nativeStateReason' in error &&
        (error.nativeStateReason === 'INVALID' ||
          error.nativeStateReason === 'INCOMPATIBLE' ||
          error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED')
      )
        return unavailable(error.nativeStateReason);
      throw error;
    }
    let activation: NativeActivationToken;
    try {
      activation = token(db, repo, active);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid native activation token header')
        return unavailable('INVALID');
      throw error;
    }
    return { status: 'AVAILABLE', state: immutableNativeState(state), token: activation };
  });
}
