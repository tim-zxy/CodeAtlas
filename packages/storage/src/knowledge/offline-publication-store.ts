import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';
import {
  parseOfflinePublicationCommand,
  readOfflinePublicationCommand,
  parseOfflineHeadRecord,
  offlinePublicationState,
  publicationCheck as check,
  type OfflinePublicationCommand,
  type OfflinePublicationState,
} from '../../../ir/dist/offline-publication-contract.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';
const base = [
  [
    'offline_attempts',
    'CREATE TABLE offline_attempts (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, subject_key TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL, command_digest TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), UNIQUE(workspace_id,subject_key,request_key)) STRICT',
  ],
  [
    'offline_revisions',
    'CREATE TABLE offline_revisions (id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, attempt_id TEXT NOT NULL, previous_id TEXT, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), UNIQUE(item_id,id), FOREIGN KEY(attempt_id) REFERENCES offline_attempts(id), FOREIGN KEY(item_id,previous_id) REFERENCES offline_revisions(item_id,id)) STRICT',
  ],
  [
    'offline_receipts',
    'CREATE TABLE offline_receipts (attempt_id TEXT PRIMARY KEY NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), FOREIGN KEY(attempt_id) REFERENCES offline_attempts(id)) STRICT',
  ],
  [
    'offline_heads',
    'CREATE TABLE offline_heads (item_id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, revision_id TEXT NOT NULL, FOREIGN KEY(item_id,revision_id) REFERENCES offline_revisions(item_id,id)) STRICT',
  ],
] as const;
const definitions: (readonly [string, string])[] = [...base];
for (const table of ['offline_attempts', 'offline_revisions', 'offline_receipts']) {
  for (const action of ['UPDATE', 'DELETE']) {
    const name = table + '_' + action.toLowerCase();
    definitions.push([
      name,
      `CREATE TRIGGER ${name} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable experiment history'); END`,
    ]);
  }
  const key = table === 'offline_receipts' ? 'attempt_id' : 'id',
    name = table + '_duplicate';
  definitions.push([
    name,
    `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${key}=NEW.${key}) BEGIN SELECT RAISE(ABORT,'duplicate experiment history'); END`,
  ]);
}
for (const action of ['INSERT', 'UPDATE']) {
  const name = 'offline_heads_' + action.toLowerCase();
  definitions.push([
    name,
    `CREATE TRIGGER ${name} BEFORE ${action} ON offline_heads WHEN NOT EXISTS(SELECT 1 FROM offline_revisions r JOIN offline_receipts p ON p.attempt_id=r.attempt_id JOIN offline_attempts a ON a.id=r.attempt_id WHERE r.id=NEW.revision_id AND r.item_id=NEW.item_id AND a.workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'complete experiment receipt required'); END`,
  ]);
}
definitions.push([
  'offline_heads_identity',
  "CREATE TRIGGER offline_heads_identity BEFORE UPDATE ON offline_heads WHEN NEW.item_id IS NOT OLD.item_id OR NEW.workspace_id IS NOT OLD.workspace_id BEGIN SELECT RAISE(ABORT,'immutable experiment identity'); END",
]);
definitions.push([
  'offline_heads_delete',
  "CREATE TRIGGER offline_heads_delete BEFORE DELETE ON offline_heads BEGIN SELECT RAISE(ABORT,'experiment history retained'); END",
]);
type Sql = ReturnType<typeof runtimeSql>;
type Row = Record<string, SQLOutputValue>;
type Owner = {
  id: string;
  command: OfflinePublicationCommand;
  state: 'READY' | 'RUNNING' | 'FAILED' | 'COMMITTED';
  settled: boolean;
};
export class OfflinePublicationError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'OfflinePublicationError';
  }
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
function receipt(id: string, command: OfflinePublicationCommand) {
  return {
    kind: 'OWNED_TEST_PUBLICATION' as const,
    attemptId: id,
    workspaceId: command.request.workspaceId,
    requestDigest: command.requestDigest,
    commandDigest: command.commandDigest,
    heads: command.entries.map((e) => ({
      itemId: e.record.itemEnvelope.payload.id,
      revisionId: e.record.revisionEnvelope.payload.id,
      previousRevisionId: e.expectedHead,
    })),
    quality: 'NOT_EVALUABLE' as const,
    productionPublication: 'NOT_AUTHORIZED' as const,
  };
}
/** Private mechanical experiment, never a production publication/quality authority. */
export class OfflinePublicationStore {
  #owners = new WeakMap<object, Owner>();
  #byId = new Map<string, Owner>();
  #blocked = false;
  #marker;
  #db: DatabaseSync;
  #workspaceId: string;
  #issuerIdentity: object | null;
  constructor(db: DatabaseSync, workspaceId: string, issuerIdentity: object | null = null) {
    this.#db = db;
    this.#workspaceId = workspaceId;
    this.#issuerIdentity = issuerIdentity;
    check(db instanceof DatabaseSync && !types.isProxy(db) && db.isOpen);
    this.#marker = db.prepare('SELECT 1 WHERE 0');
  }
  private live() {
    check(this.#db.isOpen);
    try {
      this.#marker.setReadBigInts(false);
    } catch {
      throw new OfflinePublicationError('OFFLINE_CONNECTION_CHANGED', 'UNKNOWN');
    }
  }
  private sql(limits: HistoryReadLimits, c: RuntimeRequestControl) {
    this.live();
    check(this.#db.isTransaction);
    canonicalCompilationJson(null, c);
    const sql = runtimeSql(this.#db, new HistoryReadBudget(checkedHistoryLimits(limits)));
    const actual = sql
        .read('sqlite_schema', ['name', 'sql'], "name NOT LIKE 'sqlite_%'", [])
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
      expected = definitions
        .map(([name, sql]) => ({ name, sql }))
        .sort((a, b) => a.name.localeCompare(b.name));
    check(canonicalCompilationJson(actual, c) === canonicalCompilationJson(expected, c));
    check(sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1);
    return sql;
  }
  private rollback() {
    try {
      this.live();
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      return 'SETTLED' as const;
    } catch {
      this.#blocked = true;
      return 'UNKNOWN' as const;
    }
  }
  private command(row: Row, c: RuntimeRequestControl) {
    const command = parseOfflinePublicationCommand(JSON.parse(String(row.payload_json)), c);
    check(
      row.workspace_id === this.#workspaceId &&
        command.request.workspaceId === this.#workspaceId &&
        row.subject_key === canonicalCompilationJson(command.request.subject, c) &&
        row.request_key === command.request.requestKey &&
        row.request_digest === command.requestDigest &&
        row.command_digest === command.commandDigest,
    );
    return command;
  }
  private committed(sql: Sql, row: Row, c: RuntimeRequestControl) {
    const command = this.command(row, c),
      rows = sql.read('offline_receipts', ['attempt_id', 'payload_json'], 'attempt_id=?', [
        row.id!,
      ]);
    if (!rows.length) return null;
    check(rows.length === 1);
    const value = receipt(String(row.id), command);
    check(String(rows[0]!.payload_json) === canonicalCompilationJson(value, c));
    const revisions = sql.read(
      'offline_revisions',
      ['id', 'item_id', 'attempt_id', 'previous_id', 'payload_json'],
      'attempt_id=?',
      [row.id!],
    );
    check(revisions.length === command.entries.length);
    for (const e of command.entries) {
      const r = revisions.find((r) => r.id === e.record.revisionEnvelope.payload.id);
      check(
        r &&
          r.item_id === e.record.itemEnvelope.payload.id &&
          r.previous_id === e.expectedHead &&
          String(r.payload_json) === canonicalCompilationJson(e.record, c),
      );
      if (r.previous_id !== null)
        check(
          sql.read('offline_revisions', ['id'], 'item_id=? AND id=?', [r.item_id!, r.previous_id!])
            .length === 1,
        );
    }
    return value;
  }
  private state(sql: Sql, c: RuntimeRequestControl): OfflinePublicationState {
    const heads = sql.read(
        'offline_heads',
        ['item_id', 'workspace_id', 'revision_id'],
        'workspace_id=?',
        [this.#workspaceId],
      ),
      records = [],
      verified = new Set<string>();
    for (const head of heads) {
      const rows = sql.read(
        'offline_revisions',
        ['id', 'item_id', 'attempt_id', 'payload_json'],
        'id=? AND item_id=?',
        [head.revision_id!, head.item_id!],
      );
      check(rows.length === 1);
      const r = rows[0]!,
        record = parseOfflineHeadRecord(JSON.parse(String(r.payload_json)), c);
      check(
        record.itemEnvelope.payload.id === head.item_id &&
          record.revisionEnvelope.payload.id === head.revision_id,
      );
      if (!verified.has(String(r.attempt_id))) {
        const a = sql.read(
          'offline_attempts',
          [
            'id',
            'workspace_id',
            'subject_key',
            'request_key',
            'request_digest',
            'command_digest',
            'payload_json',
          ],
          'id=?',
          [r.attempt_id!],
        );
        check(a.length === 1 && this.committed(sql, a[0]!, c));
        verified.add(String(r.attempt_id));
      }
      records.push(record);
    }
    return offlinePublicationState(this.#workspaceId, records, c);
  }
  readState(limits: HistoryReadLimits, control: RuntimeRequestControl): OfflinePublicationState {
    const c = ownControl(control);
    this.live();
    check(!this.#db.isTransaction);
    this.#db.exec('BEGIN');
    try {
      const value = this.state(this.sql(limits, c), c);
      canonicalCompilationJson(null, c);
      this.#db.exec('COMMIT');
      return value;
    } catch (error) {
      const cleanup = this.rollback();
      if (cleanup === 'UNKNOWN')
        throw new OfflinePublicationError('OFFLINE_READ_UNAVAILABLE', cleanup);
      throw error;
    }
  }
  private expected(sql: Sql, command: OfflinePublicationCommand, c: RuntimeRequestControl) {
    check(this.state(sql, c).stateDigest === command.request.priorStateDigest);
    for (const e of command.entries) {
      const item = e.record.itemEnvelope.payload,
        head = sql.read(
          'offline_heads',
          ['item_id', 'revision_id'],
          'item_id=? AND workspace_id=?',
          [item.id, this.#workspaceId],
        );
      if (e.operation === 'NEW') check(head.length === 0);
      else {
        check(head.length === 1 && head[0]!.revision_id === e.expectedHead);
        const old = sql.read('offline_revisions', ['payload_json'], 'id=? AND item_id=?', [
          e.expectedHead!,
          item.id,
        ]);
        check(old.length === 1);
        const prior = parseOfflineHeadRecord(JSON.parse(String(old[0]!.payload_json)), c)
          .itemEnvelope.payload;
        check(
          prior.type === item.type &&
            canonicalCompilationJson(prior.scope, c) === canonicalCompilationJson(item.scope, c),
        );
      }
    }
  }
  begin(input: unknown, limits: HistoryReadLimits, control: RuntimeRequestControl) {
    check(this.#issuerIdentity);
    const c = ownControl(control),
      command = readOfflinePublicationCommand(this.#issuerIdentity!, input as object);
    check(!this.#blocked && command.request.workspaceId === this.#workspaceId);
    this.live();
    check(!this.#db.isTransaction);
    const id = 'attempt:' + randomUUID();
    let committing = false;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const sql = this.sql(limits, c),
        r = command.request,
        old = sql.read(
          'offline_attempts',
          [
            'id',
            'workspace_id',
            'subject_key',
            'request_key',
            'request_digest',
            'command_digest',
            'payload_json',
          ],
          'workspace_id=? AND subject_key=? AND request_key=?',
          [this.#workspaceId, canonicalCompilationJson(r.subject, c), r.requestKey],
        );
      check(old.length <= 1);
      if (old.length) {
        const previous = this.command(old[0]!, c);
        check(
          previous.requestDigest === command.requestDigest &&
            canonicalCompilationJson(previous.request, c) ===
              canonicalCompilationJson(command.request, c),
        );
        const done = this.committed(sql, old[0]!, c);
        if (done) {
          this.#db.exec('COMMIT');
          return { status: 'COMMITTED' as const, receipt: done, reused: true };
        }
        const owner = this.#byId.get(String(old[0]!.id));
        if (!owner || owner.state !== 'READY')
          throw new OfflinePublicationError('OFFLINE_ATTEMPT_UNSETTLED');
        this.#db.exec('COMMIT');
        const handle = Object.freeze({});
        this.#owners.set(handle, owner);
        return { status: 'PREPARED' as const, handle, attemptId: owner.id };
      }
      this.expected(sql, command, c);
      sql.insert('offline_attempts', {
        id,
        workspace_id: this.#workspaceId,
        subject_key: canonicalCompilationJson(r.subject, c),
        request_key: r.requestKey,
        request_digest: command.requestDigest,
        command_digest: command.commandDigest,
        payload_json: canonicalCompilationJson(command, c),
      });
      canonicalCompilationJson(null, c);
      committing = true;
      this.#db.exec('COMMIT');
      const owner: Owner = { id, command, state: 'READY', settled: false },
        handle = Object.freeze({});
      this.#owners.set(handle, owner);
      this.#byId.set(id, owner);
      return { status: 'PREPARED' as const, handle, attemptId: id };
    } catch (error) {
      const cleanup = this.rollback();
      if (committing || cleanup === 'UNKNOWN') {
        this.#blocked = true;
        throw new OfflinePublicationError('COMMIT_OUTCOME_UNKNOWN', cleanup);
      }
      throw error;
    }
  }
  publish(handle: object, limits: HistoryReadLimits, control: RuntimeRequestControl) {
    const c = ownControl(control),
      owner = this.#owners.get(handle);
    check(owner && owner.state === 'READY' && !this.#blocked);
    this.live();
    check(!this.#db.isTransaction);
    owner.state = 'RUNNING';
    let committing = false;
    try {
      this.#db.exec('BEGIN IMMEDIATE');
      const sql = this.sql(limits, c),
        command = owner.command,
        attempt = sql.read(
          'offline_attempts',
          [
            'id',
            'workspace_id',
            'subject_key',
            'request_key',
            'request_digest',
            'command_digest',
            'payload_json',
          ],
          'id=?',
          [owner.id],
        );
      check(
        attempt.length === 1 &&
          canonicalCompilationJson(this.command(attempt[0]!, c), c) ===
            canonicalCompilationJson(command, c),
      );
      check(!this.committed(sql, attempt[0]!, c));
      this.expected(sql, command, c);
      for (const e of command.entries) {
        sql.insert('offline_revisions', {
          id: e.record.revisionEnvelope.payload.id,
          item_id: e.record.itemEnvelope.payload.id,
          attempt_id: owner.id,
          previous_id: e.expectedHead,
          payload_json: canonicalCompilationJson(e.record, c),
        });
      }
      const value = receipt(owner.id, command);
      sql.insert('offline_receipts', {
        attempt_id: owner.id,
        payload_json: canonicalCompilationJson(value, c),
      });
      for (const e of command.entries) {
        const item = e.record.itemEnvelope.payload;
        if (e.operation === 'NEW')
          sql.insert('offline_heads', {
            item_id: item.id,
            workspace_id: this.#workspaceId,
            revision_id: e.record.revisionEnvelope.payload.id,
          });
        else
          check(
            sql.run(
              'UPDATE offline_heads SET revision_id=? WHERE item_id=? AND workspace_id=? AND revision_id=?',
              [e.record.revisionEnvelope.payload.id, item.id, this.#workspaceId, e.expectedHead],
            ).changes === 1,
          );
      }
      canonicalCompilationJson(null, c);
      committing = true;
      this.#db.exec('COMMIT');
      owner.state = 'COMMITTED';
      owner.settled = true;
      let cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED';
      try {
        this.live();
        check(!this.#db.isTransaction);
      } catch {
        cleanupState = 'UNKNOWN';
        this.#blocked = true;
      }
      return { status: 'COMMITTED' as const, receipt: value, reused: false, cleanupState };
    } catch (error) {
      owner.state = 'FAILED';
      const cleanup = this.rollback();
      owner.settled = cleanup === 'SETTLED';
      if (committing || cleanup === 'UNKNOWN') {
        this.#blocked = true;
        owner.settled = false;
        throw new OfflinePublicationError('COMMIT_OUTCOME_UNKNOWN', cleanup);
      }
      throw error;
    }
  }
  lookup(
    subject: unknown,
    requestKey: string,
    requestDigest: string,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
  ) {
    const c = ownControl(control);
    this.live();
    check(!this.#db.isTransaction);
    this.#db.exec('BEGIN');
    try {
      const sql = this.sql(limits, c),
        rows = sql.read(
          'offline_attempts',
          [
            'id',
            'workspace_id',
            'subject_key',
            'request_key',
            'request_digest',
            'command_digest',
            'payload_json',
          ],
          'workspace_id=? AND subject_key=? AND request_key=?',
          [this.#workspaceId, canonicalCompilationJson(subject, c), requestKey],
        );
      check(rows.length <= 1);
      if (!rows.length) {
        this.#db.exec('COMMIT');
        return { status: 'ABSENT' as const };
      }
      check(rows[0]!.request_digest === requestDigest);
      const done = this.committed(sql, rows[0]!, c);
      const result = done
        ? { status: 'COMMITTED' as const, receipt: done }
        : { status: 'COMMIT_OUTCOME_UNKNOWN' as const };
      canonicalCompilationJson(null, c);
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      const cleanup = this.rollback();
      if (cleanup === 'UNKNOWN')
        throw new OfflinePublicationError('OFFLINE_READ_UNAVAILABLE', cleanup);
      throw error;
    }
  }
  inspect(
    subject: unknown,
    requestKey: string,
    requestDigest: string,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
  ) {
    const c = ownControl(control);
    this.live();
    check(!this.#db.isTransaction);
    this.#db.exec('BEGIN');
    try {
      const sql = this.sql(limits, c),
        rows = sql.read(
          'offline_attempts',
          [
            'id',
            'workspace_id',
            'subject_key',
            'request_key',
            'request_digest',
            'command_digest',
            'payload_json',
          ],
          'workspace_id=? AND subject_key=? AND request_key=?',
          [this.#workspaceId, canonicalCompilationJson(subject, c), requestKey],
        );
      check(rows.length <= 1);
      let result:
        | { status: 'COMMITTED'; receipt: ReturnType<typeof receipt> }
        | { status: 'NOT_COMMITTED' | 'COMMIT_OUTCOME_UNKNOWN' } = {
        status: 'COMMIT_OUTCOME_UNKNOWN',
      };
      if (rows.length) {
        check(rows[0]!.request_digest === requestDigest);
        const done = this.committed(sql, rows[0]!, c);
        if (done) result = { status: 'COMMITTED', receipt: done };
        else {
          const o = this.#byId.get(String(rows[0]!.id));
          if (o?.state === 'FAILED' && o.settled) result = { status: 'NOT_COMMITTED' };
        }
      }
      canonicalCompilationJson(null, c);
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      const cleanup = this.rollback();
      if (cleanup === 'UNKNOWN')
        throw new OfflinePublicationError('OFFLINE_READ_UNAVAILABLE', cleanup);
      throw error;
    }
  }
}
export function initializeOfflinePublicationStore(
  db: DatabaseSync,
  workspaceId: string,
  limits: HistoryReadLimits,
  control: RuntimeRequestControl,
  issuerIdentity: object,
) {
  const c = ownControl(control);
  check(db instanceof DatabaseSync && !types.isProxy(db) && db.isOpen && !db.isTransaction);
  db.exec('BEGIN IMMEDIATE');
  try {
    const sql = runtimeSql(db, new HistoryReadBudget(checkedHistoryLimits(limits)));
    check(sql.read('sqlite_schema', ['name'], '1', []).length === 0);
    check(sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1);
    for (const [, ddl] of definitions) db.exec(ddl);
    canonicalCompilationJson(null, c);
    db.exec('COMMIT');
    return new OfflinePublicationStore(db, workspaceId, issuerIdentity);
  } catch (error) {
    if (db.isOpen && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
