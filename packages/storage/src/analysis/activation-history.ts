import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { isDeepStrictEqual, types } from 'node:util';
import {
  EntityIdSchema,
  SourceFileSchema,
  type EntityId,
  type RepoBasis,
  type SourceFile,
} from '@codeatlas/ir';
import { readCodeContextSnapshot, databaseOpen, CaptureError } from './code-context-read.js';
import {
  HistoryCaptureError,
  HistoryReadBudget,
  checkedHistoryLimits,
  requireHistory,
  encodeHistoryValue,
  historyDigest,
  validateHistoryManifest,
  validateSyntaxPair,
  validateSyntaxProjectionClosure,
  historyCompare,
  record,
  text,
  type HistoryReadLimits,
  type HistoryManifest,
  type Row,
} from './activation-history-format.js';
export type { HistoryReadLimits, HistoryManifest } from './activation-history-format.js';
export interface CapturedActivationContext {
  readonly handle: object;
  readonly view: Readonly<{
    status: 'AVAILABLE' | 'UNAVAILABLE';
    history: Readonly<HistoryManifest> | null;
    targetSource: Readonly<{
      repositoryId: string;
      revisionId: string;
      contentFingerprint: string;
    }>;
    targetInventory: readonly SourceFile[];
    activeBasis: Readonly<RepoBasis> | null;
  }>;
}
const columns = {
  activation_history: [
    'id',
    'repository_id',
    'revision_id',
    'parent_id',
    'manifest_digest',
    'manifest_json',
  ],
  syntax_origins: [
    'id',
    'repository_id',
    'revision_id',
    'origin_snapshot_id',
    'origin_digest',
    'origin_json',
  ],
  syntax_projections: ['id', 'repository_id', 'origin_id', 'projection_digest', 'envelope_json'],
  activation_syntax_members: ['activation_id', 'repository_id', 'origin_id', 'projection_id'],
  active_history_pointer: ['repository_id', 'activation_id'],
} as const;
type Table = keyof typeof columns;
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
function readSnapshot(
  db: DatabaseSync,
  id: EntityId,
  limits: HistoryReadLimits,
  b = new HistoryReadBudget(limits),
  detailed = false,
  schemaVersion: 11 | 13 = 11,
) {
  const natural = (v: unknown) => {
    requireHistory(
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
      'HISTORY_LIMIT_EXCEEDED',
    );
    return v;
  };
  const numeric = (sql: string, args: SQLInputValue[] = []) => {
    requireHistory(b.rows < limits.maxRows, 'HISTORY_LIMIT_EXCEEDED');
    const row = db.prepare(sql).get(...args);
    if (row) b.add('rows', 1);
    return row;
  };
  const version = numeric('PRAGMA user_version')?.user_version,
    encoding = numeric('PRAGMA encoding')?.encoding;
  requireHistory(version === schemaVersion && encoding === 'UTF-8', 'CONTEXT_UNAVAILABLE');
  const size = (table: Table) =>
    columns[table].map((c) => `coalesce(length(CAST(${c} AS BLOB)),0)`).join('+');
  for (const table of Object.keys(columns) as Table[]) {
    const cols = columns[table];
    const n = numeric(
      `SELECT CASE WHEN(SELECT count(*)FROM sqlite_schema WHERE type='table'AND name=?)=1 AND(SELECT count(*)FROM pragma_table_info(?))=? THEN(SELECT count(*)FROM pragma_table_info(?)WHERE name IN(${cols.map(() => '?').join(',')})) ELSE 0 END AS n`,
      [table, table, cols.length, table, ...cols],
    )?.n;
    requireHistory(n === cols.length, 'CONTEXT_UNAVAILABLE');
    requireHistory(
      numeric('SELECT strict AS n FROM pragma_table_list WHERE name=?', [table])?.n === 1,
      'CONTEXT_UNAVAILABLE',
    );
    const r = numeric(`SELECT count(*)AS n,coalesce(max(${size(table)}),0)AS bytes FROM ${table}`)!;
    natural(r.n);
    const bytes = natural(r.bytes);
    requireHistory(
      bytes <= limits.maxSerializedBytes - b.serializedBytes,
      'HISTORY_LIMIT_EXCEEDED',
    );
    requireHistory(
      bytes <= Math.floor(limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes,
      'HISTORY_LIMIT_EXCEEDED',
    );
  }
  const read = (table: Table, where: string, args: SQLInputValue[]) => {
    const pre = numeric(
      `SELECT count(*)AS n,coalesce(sum(${size(table)}),0)AS bytes FROM ${table} WHERE ${where}`,
      args,
    )!;
    const n = natural(pre.n),
      bytes = natural(pre.bytes);
    requireHistory(
      n <= Math.floor((limits.maxRows - b.rows) / 2) &&
        bytes <= limits.maxSerializedBytes - b.serializedBytes &&
        bytes <= Math.floor(limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes,
      'HISTORY_LIMIT_EXCEEDED',
    );
    const rows: Row[] = [];
    const iterator = db
      .prepare(
        `SELECT rowid AS locator,${size(table)} AS bytes FROM ${table} WHERE ${where} ORDER BY rowid`,
      )
      .iterate(...args);
    try {
      for (const loc of iterator) {
        b.add('rows', 1);
        const count = natural(loc.bytes);
        b.add('serializedBytes', count);
        b.pin(count);
        const row = db
          .prepare(`SELECT ${columns[table].join(',')} FROM ${table} WHERE rowid=?`)
          .get(loc.locator as SQLInputValue);
        b.add('rows', 1);
        requireHistory(row);
        requireHistory(
          Object.values(row).reduce<number>(
            (n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 0),
            0,
          ) === count,
        );
        b.own(row, false);
        for (const [k, v] of Object.entries(row))
          requireHistory(
            typeof v === 'string' ||
              (table === 'activation_history' && k === 'parent_id' && v === null),
          );
        rows.push(row);
      }
    } finally {
      iterator.return?.();
    }
    return rows;
  };
  const rem = b.remaining();
  let code: ReturnType<typeof readCodeContextSnapshot>;
  try {
    code = readCodeContextSnapshot(
      db,
      id,
      {
        maxRows: rem.maxRows,
        maxSerializedBytes: rem.maxSerializedBytes,
        memoryBudgetBytes: rem.memoryBudgetBytes,
      },
      { schemaVersion, maxItems: rem.maxItems, maxDepth: rem.maxDepth },
    );
  } catch (e) {
    if (e instanceof CaptureError && e.code === 'CODE_CAPTURE_LIMIT_EXCEEDED')
      throw new HistoryCaptureError('HISTORY_LIMIT_EXCEEDED');
    throw new HistoryCaptureError('INVALID_HISTORY');
  }
  b.add('rows', code.consumed.rows);
  b.add('serializedBytes', code.consumed.serializedBytes);
  b.add('items', code.consumed.items);
  b.pin(code.retainedLogicalBytes);
  requireHistory(code.view.targetSource, 'CONTEXT_UNAVAILABLE');
  const entries = code.entries!;
  requireHistory(entries);
  const targetInventory = (entries.SOURCE_FILE ?? [])
    .map((v) => SourceFileSchema.parse(v))
    .sort((a, c) => historyCompare(a.path, c.path) || historyCompare(a.id, c.id));
  const pointer = read('active_history_pointer', 'repository_id=?', [id]);
  requireHistory(pointer.length <= 1);
  let manifest: HistoryManifest | null = null;
  const archive: HistoryManifest[] = [],
    originRows: Row[] = [],
    projectionRows: Row[] = [];
  if (pointer.length) {
    let activationId = text(pointer[0]!.activation_id);
    let parentRevision: string | undefined;
    const seen = new Set<string>();
    while (true) {
      requireHistory(!seen.has(activationId));
      seen.add(activationId);
      const rows = read('activation_history', 'repository_id=? AND id=?', [id, activationId]);
      requireHistory(rows.length === 1);
      const row = rows[0]!,
        parsed = b.parse(text(row.manifest_json));
      requireHistory(text(row.manifest_json) === encodeHistoryValue(parsed, b));
      const m = validateHistoryManifest(parsed, b),
        digest = historyDigest('codeatlas-activation-history-v1', m, b);
      requireHistory(
        row.manifest_digest === digest &&
          row.id === 'activation:' + digest &&
          row.id === activationId &&
          row.repository_id === id &&
          row.revision_id === m.state.basis.revisionId &&
          m.state.basis.repositoryId === id &&
          row.parent_id === (m.parent?.activationId ?? null),
      );
      if (parentRevision !== undefined) requireHistory(m.state.basis.revisionId === parentRevision);
      if (!manifest) manifest = m;
      archive.push(m);
      if (m.parent === null) break;
      requireHistory(m.parent.repositoryId === id);
      parentRevision = m.parent.revisionId;
      activationId = m.parent.activationId;
    }
    for (let i = 0; i < archive.length; i++) {
      const child = archive[i]!;
      if (child.transitions !== null) {
        const parent = archive[i + 1];
        requireHistory(
          parent && isDeepStrictEqual(record(child.transitions).oldBasis, parent.state.basis),
        );
      }
    }
    requireHistory(
      manifest &&
        isDeepStrictEqual(manifest.state.basis, code.view.activeBasis) &&
        manifest.state.repositoryLocatorDigest === code.view.repositoryLocatorDigest,
    );
    const s = manifest.state;
    const equal = (a: unknown, c: unknown) => requireHistory(isDeepStrictEqual(a, c));
    const byId = (rows: readonly unknown[], key: string) =>
      [...rows].sort((a, c) => historyCompare(text(record(a)[key]), text(record(c)[key])));
    equal(s.nodes, byId(entries.NODE ?? [], 'id'));
    equal(s.edges, byId(entries.EDGE ?? [], 'id'));
    equal(
      byId(
        s.supports.map((x) => x.evidence),
        'id',
      ),
      byId(entries.EVIDENCE ?? [], 'id'),
    );
    equal(
      byId(
        s.supports.map((x) => x.binding),
        'evidenceId',
      ),
      byId(entries.BINDING ?? [], 'evidenceId'),
    );
    equal(
      byId(
        s.supports.map((x) => x.factEvidence),
        'evidenceId',
      ),
      byId(entries.FACT_EVIDENCE ?? [], 'evidenceId'),
    );
    equal(
      byId(
        s.supports.map((x) => ({
          evidenceId: x.evidence.id,
          factType: x.factType,
          canonicalFactId: x.canonical.id,
          candidate: x.canonical,
        })),
        'evidenceId',
      ),
      byId(entries.SUPPORT_CANDIDATE ?? [], 'evidenceId'),
    );
    const normalizedSnapshot = (v: unknown) => {
      const r = record(v);
      return {
        id: r.id,
        repositoryId: r.repositoryId,
        providerId: r.providerId,
        providerVersion: r.providerVersion,
        runtimeVersion: r.runtimeVersion,
        requestedRevisionId: r.requestedRevisionId,
        requestedRevisionFingerprint: r.requestedRevisionFingerprint,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        outcome: r.outcome,
        capabilities: [...(r.capabilities as Row[])].sort((a, c) =>
          historyCompare(text(a.name), text(c.name)),
        ),
      };
    };
    equal(
      s.snapshots.map(normalizedSnapshot),
      byId(entries.PROVIDER_SNAPSHOT ?? [], 'id').map(normalizedSnapshot),
    );
    for (const c of s.coverage) {
      const unit = s.units.find((u) => u.id === c.unitId)!;
      requireHistory(unit);
      for (const fileId of unit.sourceFileIds)
        requireHistory(
          (entries.COVERAGE ?? []).some((v) => {
            const r = record(v);
            return (
              r.providerSnapshotId === c.originSnapshotId &&
              r.capabilityName === c.facet &&
              (r.sourceFileId === fileId || r.sourceFileId === null) &&
              r.status === 'COMPLETE'
            );
          }),
        );
    }
    const currentId = text(pointer[0]!.activation_id),
      members = read('activation_syntax_members', 'activation_id=?', [currentId]).sort((a, c) =>
        historyCompare(text(a.origin_id), text(c.origin_id)),
      );
    equal(
      members.map((r) => ({
        originId: r.origin_id,
        projectionId: r.projection_id,
        unitId: s.syntaxOrigins.find((o) => o.id === r.origin_id)?.unitId,
      })),
      manifest.syntaxMembers,
    );
    const syntaxEnvelopes: Row[] = [];
    for (const member of members) {
      requireHistory(member.repository_id === id);
      const origins = read('syntax_origins', 'repository_id=? AND id=?', [
          id,
          text(member.origin_id),
        ]),
        projections = read('syntax_projections', 'repository_id=? AND id=?', [
          id,
          text(member.projection_id),
        ]);
      requireHistory(origins.length === 1 && projections.length === 1);
      if (detailed) {
        originRows.push(origins[0]!);
        projectionRows.push(projections[0]!);
      }
      const metadata = s.syntaxOrigins.find((o) => o.id === member.origin_id)!;
      syntaxEnvelopes.push(
        validateSyntaxPair(
          origins[0]!,
          projections[0]!,
          metadata,
          text(metadata.unitId),
          manifest,
          archive,
          b,
        ),
      );
    }
    validateSyntaxProjectionClosure(syntaxEnvelopes, manifest.state, b);
  }
  const view: CapturedActivationContext['view'] = {
    status: manifest ? 'AVAILABLE' : 'UNAVAILABLE',
    history: manifest,
    targetSource: code.view.targetSource,
    targetInventory,
    activeBasis: code.view.activeBasis,
  };
  b.own(view, false);
  const identity = encodeHistoryValue(view, b);
  b.pin(Buffer.byteLength(identity));
  let details = null;
  if (detailed) {
    // Fixed existing SQL tables only. Preflight bytes/rows before materializing TEXT.
    const mixedRows = (table: string, cols: readonly string[], where: string) => {
      const size = cols.map((c) => 'coalesce(length(CAST(' + c + ' AS BLOB)),0)').join('+'),
        pre = numeric(
          'SELECT count(*) AS n,coalesce(sum(' +
            size +
            '),0) AS bytes FROM ' +
            table +
            ' WHERE ' +
            where,
          [id],
        )!,
        n = natural(pre.n),
        bytes = natural(pre.bytes);
      requireHistory(
        n <= Math.floor((limits.maxRows - b.rows) / 2) &&
          bytes <= limits.maxSerializedBytes - b.serializedBytes &&
          bytes <= Math.floor(limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes,
        'HISTORY_LIMIT_EXCEEDED',
      );
      const rows: Row[] = [],
        iterator = db
          .prepare(
            'SELECT rowid AS locator,' +
              size +
              ' AS bytes FROM ' +
              table +
              ' WHERE ' +
              where +
              ' ORDER BY rowid',
          )
          .iterate(id);
      try {
        for (const loc of iterator) {
          b.add('rows', 1);
          const count = natural(loc.bytes);
          b.add('serializedBytes', count);
          b.pin(count);
          const row = db
            .prepare('SELECT ' + cols.join(',') + ' FROM ' + table + ' WHERE rowid=?')
            .get(loc.locator as SQLInputValue);
          b.add('rows', 1);
          requireHistory(row);
          requireHistory(
            Object.values(row).every(
              (v) =>
                v === null ||
                typeof v === 'string' ||
                (typeof v === 'number' && Number.isSafeInteger(v)),
            ),
          );
          requireHistory(
            Object.values(row).reduce<number>(
              (n, v) => n + (v === null ? 0 : Buffer.byteLength(String(v))),
              0,
            ) === count,
          );
          b.own(row, false);
          rows.push(row);
        }
      } finally {
        iterator.return?.();
      }
      return rows;
    };
    const snapshotRows = mixedRows(
        'provider_snapshots',
        [
          'id',
          'repository_id',
          'provider_id',
          'provider_version',
          'runtime_version',
          'requested_revision_id',
          'requested_revision_fingerprint',
          'started_at',
          'completed_at',
          'outcome',
        ],
        'repository_id=?',
      ),
      capabilityRows = mixedRows(
        'provider_capabilities',
        ['snapshot_id', 'name', 'support', 'coverage'],
        'snapshot_id IN(SELECT id FROM provider_snapshots WHERE repository_id=?)',
      ),
      coverageRows = mixedRows(
        'analysis_coverage',
        ['id', 'provider_snapshot_id', 'capability_name', 'source_file_id', 'status'],
        'provider_snapshot_id IN(SELECT id FROM provider_snapshots WHERE repository_id=?)',
      ),
      historyRows = read('activation_history', 'repository_id=?', [id]),
      snapshotIds = snapshotRows
        .map((r) => String(EntityIdSchema.parse(r.id)))
        .sort(historyCompare);
    requireHistory(snapshotIds.length === code.view.committedSnapshotCount);
    details = {
      view,
      repositoryLocatorDigest: code.view.repositoryLocatorDigest,
      sourceInventoryDigest: code.view.sourceInventoryDigest,
      entries,
      archive,
      origins: originRows,
      projections: projectionRows,
      snapshotIds,
      snapshotRows,
      capabilityRows,
      coverageRows,
      historyRows,
    };
    b.own(details);
  }
  return {
    view: frozen(view),
    identity,
    committedSnapshotCount: code.view.committedSnapshotCount,
    details,
    budget: b,
  };
}
type UsedHistoryBudget = Pick<
  HistoryReadBudget,
  'rows' | 'serializedBytes' | 'items' | 'retainedLogicalBytes'
>;
const usedBudget = (b: HistoryReadBudget): UsedHistoryBudget => ({
  rows: b.rows,
  serializedBytes: b.serializedBytes,
  items: b.items,
  retainedLogicalBytes: b.retainedLogicalBytes,
});

interface Owner {
  db: DatabaseSync;
  marker: StatementSync | null;
  live: boolean;
  identity: string | null;
  committedSnapshotCount: number | null;
  repositoryId: EntityId;
  used: UsedHistoryBudget | null;
  schemaVersion: 11 | 13;
}
const owned = new WeakMap<object, Owner>();
function owner(db: DatabaseSync, handle: object) {
  requireHistory(handle !== null && typeof handle === 'object' && !types.isProxy(handle));
  const e = owned.get(handle);
  requireHistory(e && e.db === db);
  return e;
}
function invalidate(e: Owner) {
  e.live = false;
  e.marker = null;
  e.identity = null;
  e.committedSnapshotCount = null;
  e.used = null;
}
function incarnation(e: Owner) {
  try {
    requireHistory(databaseOpen(e.db), 'HISTORY_RELEASED');
    e.marker!.setReadBigInts(false);
  } catch {
    invalidate(e);
    throw new HistoryCaptureError('HISTORY_RELEASED');
  }
}
function failure(e: unknown): never {
  if (e instanceof HistoryCaptureError) throw e;
  throw new HistoryCaptureError('INVALID_HISTORY');
}
function captureContext(
  db: DatabaseSync,
  repositoryId: string,
  input: HistoryReadLimits,
  schemaVersion: 11 | 13,
): CapturedActivationContext {
  let transaction = false;
  try {
    requireHistory(databaseOpen(db) && !db.isTransaction);
    const limits = checkedHistoryLimits(input),
      id = EntityIdSchema.parse(repositoryId);
    db.exec('BEGIN');
    transaction = true;
    const result = readSnapshot(db, id, limits, undefined, false, schemaVersion);
    db.exec('COMMIT');
    transaction = false;
    const handle = Object.freeze({});
    owned.set(handle, {
      db,
      marker: db.prepare('SELECT 1 WHERE 0'),
      live: true,
      identity: result.identity,
      committedSnapshotCount: result.committedSnapshotCount,
      repositoryId: id,
      used: usedBudget(result.budget),
      schemaVersion,
    });
    return Object.freeze({ handle, view: result.view });
  } catch (e) {
    return failure(e);
  } finally {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Owned read transaction only. */
      }
  }
}
export function recheckActivationContext(
  db: DatabaseSync,
  handle: object,
  input: HistoryReadLimits,
): void {
  const e = owner(db, handle);
  requireHistory(e.live, 'HISTORY_RELEASED');
  let transaction = false;
  try {
    incarnation(e);
    requireHistory(!db.isTransaction);
    const limits = checkedHistoryLimits(input);
    db.exec('BEGIN');
    transaction = true;
    const fresh = readSnapshot(db, e.repositoryId, limits, undefined, false, e.schemaVersion);
    db.exec('COMMIT');
    transaction = false;
    requireHistory(
      fresh.identity === e.identity && fresh.committedSnapshotCount === e.committedSnapshotCount,
      'HISTORY_CHANGED',
    );
  } catch (error) {
    invalidate(e);
    failure(error);
  } finally {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Never disturb caller-owned transaction. */
      }
  }
}
export function releaseActivationContext(db: DatabaseSync, handle: object): void {
  const e = owner(db, handle);
  if (!e.live) return;
  try {
    incarnation(e);
  } finally {
    invalidate(e);
  }
}

/** Private Stage adapter: genuine same-connection handle; never a publication lease. */
function readMixedAnalysisCaptureCore(
  db: DatabaseSync,
  handle: object,
  input: HistoryReadLimits,
  locked: boolean,
) {
  const e = owner(db, handle);
  requireHistory(e.live, 'HISTORY_RELEASED');
  let transaction = false;
  try {
    incarnation(e);
    requireHistory(locked ? db.isTransaction : !db.isTransaction);
    const limits = checkedHistoryLimits(input),
      b = new HistoryReadBudget(limits);
    requireHistory(e.used);
    b.add('rows', e.used.rows);
    b.add('serializedBytes', e.used.serializedBytes);
    b.add('items', e.used.items);
    b.pin(e.used.retainedLogicalBytes);
    if (!locked) {
      db.exec('BEGIN');
      transaction = true;
    }
    const fresh = readSnapshot(db, e.repositoryId, limits, b, true, e.schemaVersion);
    requireHistory(
      fresh.identity === e.identity && fresh.committedSnapshotCount === e.committedSnapshotCount,
      'HISTORY_CHANGED',
    );
    requireHistory(fresh.details);
    const identity = encodeHistoryValue(fresh.details, b),
      usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
      result = {
        data: fresh.details,
        identity,
        committedSnapshotCount: fresh.committedSnapshotCount,
        usage,
      };
    b.own(result);
    Object.assign(usage, usedBudget(b));
    if (!locked) {
      db.exec('COMMIT');
      transaction = false;
    }
    e.used = usedBudget(b);
    return frozen(result);
  } catch (error) {
    invalidate(e);
    return failure(error);
  } finally {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Only our read transaction. */
      }
  }
}

/** Internal Store-only locked read; transaction ownership stays with the Store. */
export function recheckMixedAnalysisCaptureLocked(
  db: DatabaseSync,
  handle: object,
  input: HistoryReadLimits,
) {
  return readMixedAnalysisCaptureCore(db, handle, input, true);
}
export default function readMixedAnalysisCapture(
  db: DatabaseSync,
  handle: object,
  input: HistoryReadLimits,
) {
  return readMixedAnalysisCaptureCore(db, handle, input, false);
}

/** Internal R013 reader; all Code/history authentication and accounting are shared with R011. */
export function readRuntimeActivationInputs(
  db: DatabaseSync,
  repositoryId: string,
  budget: HistoryReadBudget,
) {
  requireHistory(db.isTransaction);
  return readSnapshot(db, EntityIdSchema.parse(repositoryId), budget.limits, budget, true, 13);
}

export function captureActivationContext(
  db: DatabaseSync,
  repositoryId: string,
  input: HistoryReadLimits,
): CapturedActivationContext {
  return captureContext(db, repositoryId, input, 11);
}
export function captureRuntimeActivationContext(
  db: DatabaseSync,
  repositoryId: string,
  input: HistoryReadLimits,
): CapturedActivationContext {
  return captureContext(db, repositoryId, input, 13);
}
