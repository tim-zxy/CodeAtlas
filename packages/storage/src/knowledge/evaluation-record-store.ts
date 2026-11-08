import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import { type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';
import {
  parseOfflineEvaluationRecord,
  type OfflineEvaluationRecord,
} from '../../../ir/dist/evaluation-record-contract.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';
import { CompilationInputStore } from './compilation-input-store.js';
export class EvaluationRecordStoreError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN',
  ) {
    super(code);
    this.name = 'EvaluationRecordStoreError';
  }
}
const definitions = [
  [
    'evaluation_records',
    'CREATE TABLE evaluation_records (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, run_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json))) STRICT',
  ],
  [
    'evaluation_records_update',
    "CREATE TRIGGER evaluation_records_update BEFORE UPDATE ON evaluation_records BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVALUATION'); END",
  ],
  [
    'evaluation_records_delete',
    "CREATE TRIGGER evaluation_records_delete BEFORE DELETE ON evaluation_records BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVALUATION'); END",
  ],
  [
    'evaluation_records_duplicate',
    "CREATE TRIGGER evaluation_records_duplicate BEFORE INSERT ON evaluation_records WHEN EXISTS(SELECT 1 FROM evaluation_records WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVALUATION'); END",
  ],
] as const;
function check(v: unknown): asserts v {
  if (!v) throw new Error('EVALUATION_STORE_INVALID');
}
function ownControl(c: RuntimeRequestControl): RuntimeRequestControl {
  canonicalCompilationJson(null, c);
  const d = Object.getOwnPropertyDescriptors(c);
  return Object.freeze({
    maxItems: d.maxItems!.value!,
    maxDepth: d.maxDepth!.value!,
    deadlineEpochMs: d.deadlineEpochMs!.value!,
    signal: d.signal!.value!,
  });
}
type Key = Parameters<CompilationInputStore['readSnapshot']>[0];
/** Separate self-owned record experiment. Not W011 or a production layout/authority. */
export class OfflineEvaluationRecordStore {
  #blocked = false;
  constructor(
    private db: DatabaseSync,
    private workspaceId: string,
  ) {
    check(db instanceof DatabaseSync && !types.isProxy(db) && db.isOpen);
  }
  private session(limits: HistoryReadLimits, c: RuntimeRequestControl) {
    canonicalCompilationJson(null, c);
    check(this.db.isOpen && this.db.isTransaction);
    const sql = runtimeSql(this.db, new HistoryReadBudget(checkedHistoryLimits(limits)));
    const schema = sql
      .read('sqlite_schema', ['name', 'sql'], "name NOT LIKE 'sqlite_%'", [])
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const expected = definitions
      .map(([name, sql]) => ({ name, sql }))
      .sort((a, b) => a.name.localeCompare(b.name));
    check(canonicalCompilationJson(schema, c) === canonicalCompilationJson(expected, c));
    return sql;
  }
  private binding(
    store: CompilationInputStore,
    key: Key,
    candidates: unknown,
    record: unknown,
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    syncCheck: () => undefined,
  ): OfflineEvaluationRecord {
    check(
      Object.getPrototypeOf(store) === CompilationInputStore.prototype &&
        Object.getOwnPropertyNames(store).length === 0,
    );
    const ownedKey = JSON.parse(canonicalCompilationJson(key, c)),
      ownedCandidates = JSON.parse(canonicalCompilationJson(candidates, c)),
      ownedRecord = JSON.parse(canonicalCompilationJson(record, c));
    const snapshot = CompilationInputStore.prototype.readSnapshot.call(
      store,
      ownedKey,
      limits,
      c,
      syncCheck,
    );
    check(snapshot.workspaceId === this.workspaceId);
    const data = ownedRecord;
    return parseOfflineEvaluationRecord(
      data,
      {
        evaluationId: data.evaluationId,
        runId: ownedKey.runId,
        snapshot,
        candidates: ownedCandidates,
      },
      c,
    );
  }
  put(
    store: CompilationInputStore,
    key: Key,
    candidates: unknown,
    record: unknown,
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    syncCheck: () => undefined,
  ) {
    c = ownControl(c);
    limits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limits, c)));
    check(!this.#blocked);
    const value = this.binding(store, key, candidates, record, limits, c, syncCheck),
      json = canonicalCompilationJson(value, c);
    check(this.db.isOpen && !this.db.isTransaction);
    this.db.exec('BEGIN IMMEDIATE');
    let committing = false;
    try {
      const sql = this.session(limits, c);
      sql.insert('evaluation_records', {
        id: value.evaluationId,
        workspace_id: value.workspaceId,
        run_id: value.runId,
        snapshot_id: value.snapshotId,
        payload_json: json,
      });
      canonicalCompilationJson(null, c);
      committing = true;
      this.db.exec('COMMIT');
      return Object.freeze({
        status: 'COMMITTED' as const,
        evaluationId: value.evaluationId,
        publication: 'NOT_AUTHORIZED' as const,
      });
    } catch (error) {
      this.#blocked = true;
      let cleanup: 'SETTLED' | 'UNKNOWN' = 'SETTLED';
      try {
        check(this.db.isOpen);
        if (this.db.isTransaction) this.db.exec('ROLLBACK');
      } catch {
        cleanup = 'UNKNOWN';
      }
      if (committing || cleanup === 'UNKNOWN')
        throw new EvaluationRecordStoreError('COMMIT_OUTCOME_UNKNOWN', cleanup);
      throw error;
    }
  }
  read(
    store: CompilationInputStore,
    key: Key,
    candidates: unknown,
    evaluationId: string,
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    syncCheck: () => undefined,
  ): OfflineEvaluationRecord {
    c = ownControl(c);
    limits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limits, c)));
    check(this.db.isOpen && !this.db.isTransaction);
    let row: Record<string, import('node:sqlite').SQLOutputValue>;
    this.db.exec('BEGIN');
    try {
      const sql = this.session(limits, c),
        rows = sql.read(
          'evaluation_records',
          ['id', 'workspace_id', 'run_id', 'snapshot_id', 'payload_json'],
          'id=?',
          [evaluationId],
        );
      check(rows.length === 1);
      row = rows[0]!;
      canonicalCompilationJson(null, c);
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        check(this.db.isOpen);
        if (this.db.isTransaction) this.db.exec('ROLLBACK');
      } catch {
        throw new EvaluationRecordStoreError('EVALUATION_READ_UNAVAILABLE', 'UNKNOWN');
      }
      throw error;
    }
    const value = this.binding(
      store,
      key,
      candidates,
      JSON.parse(String(row.payload_json)),
      limits,
      c,
      syncCheck,
    );
    check(
      row.id === value.evaluationId &&
        row.workspace_id === value.workspaceId &&
        row.run_id === value.runId &&
        row.snapshot_id === value.snapshotId,
    );
    canonicalCompilationJson(null, c);
    return value;
  }
}
export function initializeOfflineEvaluationRecords(
  db: DatabaseSync,
  workspaceId: string,
  limits: HistoryReadLimits,
  c: RuntimeRequestControl,
) {
  canonicalCompilationJson(null, c);
  check(db instanceof DatabaseSync && !types.isProxy(db) && db.isOpen && !db.isTransaction);
  const sql = runtimeSql(db, new HistoryReadBudget(checkedHistoryLimits(limits)));
  db.exec('BEGIN IMMEDIATE');
  try {
    check(sql.read('sqlite_schema', ['name'], '1', []).length === 0);
    for (const [, ddl] of definitions) db.exec(ddl);
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
  return new OfflineEvaluationRecordStore(db, workspaceId);
}
