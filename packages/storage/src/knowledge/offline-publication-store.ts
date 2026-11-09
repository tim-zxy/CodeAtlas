import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import {
  KnowledgeScopeSchema,
  Phase1KnowledgeTypeSchema,
  type SupportRef,
  type ScopedRef,
  EntityIdSchema,
  KnowledgeRevisionSchema,
  parseKnowledgeItem,
  parseKnowledgeRevision,
  parsePhase1ReferenceContext,
  ScopedRefSchema,
  SupportRefSchema,
  Phase1CoverageSchema,
  scopedRefKey,
  supportKey,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';
import {
  parseOfflinePublicationCommand,
  readOfflinePublicationCommand,
  parseOfflineHeadRecord,
  offlinePublicationState,
  publicationDigest,
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
export type OfflineSearchManifest = {
  workspaceId: string;
  heads: { itemId: string; revisionId: string }[];
  fields: readonly string[];
  evidenceKind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY';
};
export type OfflineSearchEvidence = {
  supportScopeRefs: ScopedRef[];
  coverage: {
    status: 'COMPLETE' | 'PARTIAL' | 'UNSUPPORTED';
    limitations: string[];
    unverifiedRefs: ScopedRef[];
  };
  supportRefs: SupportRef[];
  provenance: {
    attemptId: string;
    runId: string;
    snapshotId: string;
    revisionSetId: string;
    evaluationId: string;
  };
};
export type OfflineSearchRecord = {
  type: 'COMPONENT' | 'CAPABILITY' | 'RUNTIME_FLOW_REFERENCE' | 'BUSINESS_FLOW' | 'INTEGRATION';
  evidence?: OfflineSearchEvidence;
  itemId: string;
  revisionId: string;
  scopeJson: string;
  sourceFreshness: string;
  compilationCurrency: string;
  title: string;
  summary: string;
  goal: string;
};
export type OfflineSearchProjection = {
  kind: 'OWNED_TEST_PUBLICATION';
  manifest: OfflineSearchManifest;
  headDigest: string;
  records: OfflineSearchRecord[];
};
export type OfflineKnowledgeManifest = {
  workspaceId: string;
  heads: { itemId: string; revisionId: string }[];
  fields: readonly string[];
  evidenceKind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY';
};
export type OfflineKnowledgePermissions = {
  kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY';
  check(manifest: OfflineKnowledgeManifest): undefined;
};
export type OfflinePublishedKnowledge = {
  kind: 'OWNED_TEST_PUBLICATION';
  workspaceId: string;
  selectionDigest: string;
  records: {
    itemEnvelope: ReturnType<typeof parseKnowledgeItem>;
    revisionEnvelope: ReturnType<typeof parseKnowledgeRevision>;
    referenceContext: ReturnType<typeof parsePhase1ReferenceContext>;
    coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
    provenance: {
      attemptId: string;
      runId: string;
      snapshotId: string;
      revisionSetId: string;
      evaluationId: string;
    };
    currentHeadRevisionId: string;
    isCurrentHead: boolean;
    warnings: string[];
  }[];
  productionQuery: 'NOT_AUTHORIZED';
  quality: 'NOT_EVALUABLE';
};
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
  #knowledgeReadUnsettled = false;
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
  private sql(limits: HistoryReadLimits, c: RuntimeRequestControl, budget?: HistoryReadBudget) {
    this.live();
    check(this.#db.isTransaction);
    canonicalCompilationJson(null, c);
    const sql = runtimeSql(this.#db, budget ?? new HistoryReadBudget(checkedHistoryLimits(limits)));
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
  /** Field projection only: never loads command/snapshot/support/Claim bodies. */
  /** Exact selected current-published metadata only; no search, body or version substitution. */
  readProjectContextProjection(
    refs: unknown,
    permissionCheck: (manifest: OfflineSearchManifest) => undefined,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
  ): OfflineSearchProjection {
    const c = ownControl(control),
      l = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limits, c))),
      raw = JSON.parse(canonicalCompilationJson(refs, c));
    check(Array.isArray(raw) && raw.length <= l.maxRows);
    const selected = raw.map((v: Record<string, unknown>) => {
      check(v && typeof v === 'object' && Object.keys(v).sort().join(',') === 'itemId,revisionId');
      return {
        itemId: EntityIdSchema.parse(v.itemId),
        revisionId: EntityIdSchema.parse(v.revisionId),
      };
    });
    check(
      new Set(
        selected.map((v: { itemId: string; revisionId: string }) => canonicalCompilationJson(v, c)),
      ).size === selected.length,
    );
    const before = this.readSearchProjection(permissionCheck, l, c, false, true, selected);
    const after = this.readSearchProjection(permissionCheck, l, c, false, true, selected);
    check(canonicalCompilationJson(before, c) === canonicalCompilationJson(after, c));
    return before;
  }
  readSearchProjection(
    permissionCheck: (manifest: OfflineSearchManifest) => undefined,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    metadataOnly = false,
    withEvidence = false,
    selectedRefs?: readonly { itemId: string; revisionId: string }[],
  ): OfflineSearchProjection {
    const c = ownControl(control),
      ownedLimits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limits, c)));
    check(
      typeof permissionCheck === 'function' &&
        !types.isProxy(permissionCheck) &&
        !types.isAsyncFunction(permissionCheck),
    );
    this.live();
    check(!this.#db.isTransaction);
    const selectionJson =
      selectedRefs === undefined ? undefined : canonicalCompilationJson(selectedRefs, c);
    const projectionArgs =
      selectionJson === undefined ? [this.#workspaceId] : [this.#workspaceId, selectionJson];
    const headWhere =
      'workspace_id=?' +
      (selectionJson === undefined
        ? ''
        : " AND EXISTS(SELECT 1 FROM json_each(?) selection WHERE json_extract(selection.value,'$.itemId')=item_id AND json_extract(selection.value,'$.revisionId')=revision_id)");
    const token = 'search_' + randomUUID().replaceAll('-', '');
    let began = false,
      savepoint = false;
    try {
      this.#db.exec('BEGIN');
      began = true;
      this.#db.exec('SAVEPOINT ' + token);
      savepoint = true;
      const b = new HistoryReadBudget(ownedLimits),
        sql = this.sql(ownedLimits, c, b),
        readHeads = () =>
          sql
            .read('offline_heads', ['item_id', 'revision_id'], headWhere, projectionArgs)
            .map((r) => {
              check(typeof r.item_id === 'string' && typeof r.revision_id === 'string');
              return { itemId: r.item_id, revisionId: r.revision_id };
            })
            .sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
      const heads = readHeads(),
        fields = Object.freeze([
          'ITEM_SCOPE',
          'ITEM_TYPE',
          ...(withEvidence ? ['COVERAGE', 'SUPPORT_METADATA'] : []),
          'SOURCE_FRESHNESS',
          'COMPILATION_CURRENCY',
          'TITLE',
          'SUMMARY',
          'GOAL',
          'PROVENANCE_IDS',
        ]);
      const manifest: OfflineSearchManifest = Object.freeze({
        workspaceId: this.#workspaceId,
        heads: Object.freeze(
          heads.map((v) => Object.freeze(v)),
        ) as unknown as OfflineSearchManifest['heads'],
        fields,
        evidenceKind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
      });
      const guard = () => {
        canonicalCompilationJson(null, c);
        this.live();
        check(this.#db.isTransaction);
        let value: unknown;
        try {
          value = permissionCheck(manifest);
        } catch {
          throw new OfflinePublicationError('SEARCH_PERMISSION_DENIED');
        }
        if (types.isPromise(value)) {
          void Promise.prototype.then.call(value, undefined, () => {});
          throw new OfflinePublicationError('SEARCH_PERMISSION_DENIED', 'UNKNOWN');
        }
        if (value !== undefined) throw new OfflinePublicationError('SEARCH_PERMISSION_DENIED');
        canonicalCompilationJson(null, c);
        this.live();
        check(this.#db.isTransaction);
        this.#db.exec('RELEASE ' + token);
        this.#db.exec('SAVEPOINT ' + token);
        check(canonicalCompilationJson(readHeads(), c) === canonicalCompilationJson(heads, c));
        this.sql(ownedLimits, c, b);
      };
      guard();
      const records: OfflineSearchRecord[] = [];
      if (!metadataOnly) {
        const expr: Record<string, string> = {
          item_id: 'h.item_id',
          revision_id: 'h.revision_id',
          item_type: "json_extract(r.payload_json,'$.itemEnvelope.payload.type')",
          record_item: "json_extract(r.payload_json,'$.itemEnvelope.payload.id')",
          record_head: "json_extract(r.payload_json,'$.itemEnvelope.payload.publishedRevisionId')",
          record_revision: "json_extract(r.payload_json,'$.revisionEnvelope.payload.id')",
          revision_item: "json_extract(r.payload_json,'$.revisionEnvelope.payload.itemId')",
          scope_json: "json_extract(r.payload_json,'$.itemEnvelope.payload.scope')",
          source_freshness: "json_extract(r.payload_json,'$.itemEnvelope.payload.sourceFreshness')",
          compilation_currency:
            "json_extract(r.payload_json,'$.itemEnvelope.payload.compilationCurrency')",
          title:
            "json_extract(r.payload_json,'$.revisionEnvelope.payload.structuredContent.title')",
          summary:
            "json_extract(r.payload_json,'$.revisionEnvelope.payload.structuredContent.summary')",
          goal: "json_extract(r.payload_json,'$.revisionEnvelope.payload.structuredContent.goal')",
          title_type:
            "json_type(r.payload_json,'$.revisionEnvelope.payload.structuredContent.title')",
          summary_type:
            "json_type(r.payload_json,'$.revisionEnvelope.payload.structuredContent.summary')",
          goal_type:
            "json_type(r.payload_json,'$.revisionEnvelope.payload.structuredContent.goal')",
          valid:
            "(a.workspace_id=h.workspace_id AND json_extract(r.payload_json,'$.itemEnvelope.schema')='codeatlas.knowledge-item' AND json_extract(r.payload_json,'$.itemEnvelope.version')=1 AND json_extract(r.payload_json,'$.revisionEnvelope.schema')='codeatlas.knowledge-revision' AND json_extract(r.payload_json,'$.revisionEnvelope.version')=1 AND json_extract(r.payload_json,'$.itemEnvelope.payload.lifecycleState')='ACTIVE' AND json_extract(r.payload_json,'$.revisionEnvelope.payload.publicationState')='PUBLISHED' AND json_extract(r.payload_json,'$.itemEnvelope.payload.type')=json_extract(r.payload_json,'$.revisionEnvelope.payload.structuredContent.kind') AND json_extract(a.payload_json,'$.kind')='OWNED_TEST_PUBLICATION' AND json_extract(a.payload_json,'$.quality')='NOT_EVALUABLE' AND json_extract(a.payload_json,'$.productionPublication')='NOT_AUTHORIZED' AND EXISTS(SELECT 1 FROM json_each(p.payload_json,'$.heads') x WHERE json_extract(x.value,'$.itemId')=h.item_id AND json_extract(x.value,'$.revisionId')=h.revision_id) AND EXISTS(SELECT 1 FROM json_each(a.payload_json,'$.entries') e WHERE json_extract(e.value,'$.record.itemEnvelope.payload.id')=h.item_id AND json_extract(e.value,'$.record.revisionEnvelope.payload.id')=h.revision_id AND json_extract(e.value,'$.record')=r.payload_json))",
        };
        if (withEvidence) {
          const candidateId =
            "(SELECT json_extract(e.value,'$.candidateId') FROM json_each(a.payload_json,'$.entries') e WHERE json_extract(e.value,'$.record.itemEnvelope.payload.id')=h.item_id AND json_extract(e.value,'$.record.revisionEnvelope.payload.id')=h.revision_id)";
          expr.coverage_json =
            "(SELECT json_extract(c.value,'$.payload.coverage') FROM json_each(a.payload_json,'$.request.candidates') c WHERE json_extract(c.value,'$.payload.id')=" +
            candidateId +
            ')';
          expr.entities_json =
            "json_extract(r.payload_json,'$.referenceContext.availableEntities')";
          expr.support_json =
            "json_extract(r.payload_json,'$.revisionEnvelope.payload.supportRefs')";
          expr.attempt_id = 'a.id';
          for (const [key, p] of Object.entries({
            run_id: 'compilationRunId',
            snapshot_id: 'inputSnapshotRef.id',
            revision_set_id: 'revisionSetId',
            evaluation_id: 'evaluationRef.id',
          }))
            expr[key] = "json_extract(r.payload_json,'$.revisionEnvelope.payload." + p + "')";
          expr.valid =
            '(' +
            expr.valid +
            " AND json_extract(r.payload_json,'$.revisionEnvelope.payload.compilationRunId')=json_extract(a.payload_json,'$.request.runId') AND json_extract(r.payload_json,'$.revisionEnvelope.payload.inputSnapshotRef.id')=json_extract(a.payload_json,'$.request.snapshot.snapshotId') AND json_extract(r.payload_json,'$.revisionEnvelope.payload.revisionSetId')=json_extract(a.payload_json,'$.request.snapshot.revisionSetId') AND json_extract(r.payload_json,'$.revisionEnvelope.payload.evaluationRef.id')=json_extract(a.payload_json,'$.request.evaluation.evaluationId') AND json_extract(p.payload_json,'$.attemptId')=a.id AND json_extract(p.payload_json,'$.requestDigest')=a.request_digest AND json_extract(p.payload_json,'$.commandDigest')=a.command_digest AND (SELECT count(*) FROM json_each(a.payload_json,'$.request.candidates') c WHERE json_extract(c.value,'$.payload.id')=" +
            candidateId +
            " AND json_extract(c.value,'$.payload.type')=json_extract(r.payload_json,'$.itemEnvelope.payload.type') AND json_extract(c.value,'$.payload.scope')=json_extract(r.payload_json,'$.itemEnvelope.payload.scope') AND json_extract(c.value,'$.payload.structuredContent')=json_extract(r.payload_json,'$.revisionEnvelope.payload.structuredContent') AND json_extract(c.value,'$.payload.supportRefs')=json_extract(r.payload_json,'$.revisionEnvelope.payload.supportRefs') AND json_extract(c.value,'$.payload.inputSnapshotRef')=json_extract(r.payload_json,'$.revisionEnvelope.payload.inputSnapshotRef'))=1)";
        }
        const from =
          ' FROM offline_heads h LEFT JOIN offline_revisions r ON r.id=h.revision_id AND r.item_id=h.item_id LEFT JOIN offline_attempts a ON a.id=r.attempt_id LEFT JOIN offline_receipts p ON p.attempt_id=a.id WHERE h.workspace_id=?' +
          (selectionJson === undefined
            ? ''
            : " AND EXISTS(SELECT 1 FROM json_each(?) selection WHERE json_extract(selection.value,'$.itemId')=h.item_id AND json_extract(selection.value,'$.revisionId')=h.revision_id)");
        b.own(projectionArgs);
        b.add('rows', 1);
        const raw = this.#db
          .prepare(
            'SELECT count(*) n,coalesce(sum(coalesce(length(CAST(r.payload_json AS BLOB)),0)+coalesce(length(CAST(a.payload_json AS BLOB)),0)+coalesce(length(CAST(p.payload_json AS BLOB)),0)),0) bytes' +
              from,
          )
          .get(...projectionArgs)!;
        check(
          typeof raw.n === 'number' &&
            Number.isSafeInteger(raw.n) &&
            raw.n === heads.length &&
            typeof raw.bytes === 'number' &&
            Number.isSafeInteger(raw.bytes),
        );
        b.add('serializedBytes', raw.bytes);
        b.pin(raw.bytes);
        b.add('rows', 1);
        const n = this.#db
          .prepare(
            'SELECT count(*) n,coalesce(sum(' +
              Object.values(expr)
                .map((x) => 'coalesce(length(CAST(' + x + ' AS BLOB)),0)')
                .join('+') +
              '),0) bytes' +
              from,
          )
          .get(...projectionArgs)!;
        check(
          typeof n.n === 'number' &&
            Number.isSafeInteger(n.n) &&
            n.n === heads.length &&
            typeof n.bytes === 'number' &&
            Number.isSafeInteger(n.bytes),
        );
        b.add('rows', n.n);
        b.add('serializedBytes', n.bytes);
        b.pin(n.bytes);
        const rows = this.#db
          .prepare(
            'SELECT ' +
              Object.entries(expr)
                .map(([name, value]) => value + ' AS ' + name)
                .join(',') +
              from +
              ' ORDER BY h.item_id,h.revision_id',
          )
          .all(...projectionArgs);
        check(rows.length === heads.length);
        b.own(rows, false);
        for (const r of rows) {
          check(
            r.valid === 1 &&
              r.record_item === r.item_id &&
              r.record_head === r.revision_id &&
              r.record_revision === r.revision_id &&
              r.revision_item === r.item_id &&
              typeof r.scope_json === 'string',
          );
          KnowledgeScopeSchema.parse(JSON.parse(r.scope_json));
          check(
            ['FRESH', 'AFFECTED', 'STALE'].includes(String(r.source_freshness)) &&
              ['CURRENT', 'OUTDATED_WORKFLOW', 'OUTDATED_PROMPT', 'OUTDATED_MODEL_POLICY'].includes(
                String(r.compilation_currency),
              ),
          );
          for (const key of ['title', 'summary', 'goal'])
            check(r[key + '_type'] === null || r[key + '_type'] === 'text');
          let evidence: OfflineSearchEvidence | undefined;
          if (withEvidence) {
            check(typeof r.coverage_json === 'string' && typeof r.support_json === 'string');
            const coverage = Phase1CoverageSchema.parse(b.parse(String(r.coverage_json)));
            const refs = b.parse(String(r.support_json));
            check(Array.isArray(refs));
            check(typeof r.entities_json === 'string');
            const entities = b.parse(String(r.entities_json));
            check(Array.isArray(entities));
            evidence = {
              supportScopeRefs: (entities as unknown[]).map((v) => ScopedRefSchema.parse(v)),
              coverage,
              supportRefs: (refs as unknown[]).map((v) => SupportRefSchema.parse(v)),
              provenance: {
                attemptId: EntityIdSchema.parse(r.attempt_id),
                runId: EntityIdSchema.parse(r.run_id),
                snapshotId: EntityIdSchema.parse(r.snapshot_id),
                revisionSetId: EntityIdSchema.parse(r.revision_set_id),
                evaluationId: EntityIdSchema.parse(r.evaluation_id),
              },
            };
          }
          records.push({
            type: Phase1KnowledgeTypeSchema.parse(r.item_type),
            ...(evidence ? { evidence } : {}),
            itemId: String(r.item_id),
            revisionId: String(r.revision_id),
            scopeJson: r.scope_json,
            sourceFreshness: String(r.source_freshness),
            compilationCurrency: String(r.compilation_currency),
            title: r.title === null ? '' : String(r.title),
            summary: r.summary === null ? '' : String(r.summary),
            goal: r.goal === null ? '' : String(r.goal),
          });
        }
      }
      guard();
      const result: OfflineSearchProjection = {
        kind: 'OWNED_TEST_PUBLICATION',
        manifest,
        headDigest: publicationDigest(
          'codeatlas.offline-search.heads.v1',
          { workspaceId: this.#workspaceId, heads },
          c,
        ),
        records,
      };
      canonicalCompilationJson(result, c);
      const pending: unknown[] = [result];
      while (pending.length) {
        const value = pending.pop();
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
          pending.push(...Object.values(value));
          Object.freeze(value);
        }
      }
      this.#db.exec('RELEASE ' + token);
      savepoint = false;
      this.#db.exec('COMMIT');
      began = false;
      this.live();
      return result;
    } catch (error) {
      try {
        this.live();
        if (savepoint) {
          check(this.#db.isTransaction);
          this.#db.exec('ROLLBACK TO ' + token);
          this.#db.exec('ROLLBACK');
        } else if (began && this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        throw new OfflinePublicationError('SEARCH_SOURCE_UNAVAILABLE', 'UNKNOWN');
      }
      throw error;
    }
  }
  /** Exact published versions with selected-body/ref metadata grants only. */
  readPublishedKnowledge(
    references: unknown,
    permissions: OfflineKnowledgePermissions,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
  ): OfflinePublishedKnowledge {
    if (this.#knowledgeReadUnsettled)
      throw new OfflinePublicationError('KNOWLEDGE_SOURCE_UNAVAILABLE', 'UNKNOWN');
    const c = ownControl(control),
      ownedLimits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limits, c))),
      verify = (v: unknown, code = 'KNOWLEDGE_RECORD_INVALID') => {
        if (!v) throw new OfflinePublicationError(code);
      };
    let selected: { itemId: string; revisionId: string }[];
    try {
      const raw = JSON.parse(canonicalCompilationJson(references, c));
      verify(Array.isArray(raw) && raw.length > 0, 'KNOWLEDGE_QUERY_INVALID');
      selected = raw.map((r: Record<string, unknown>) => {
        verify(
          r &&
            typeof r === 'object' &&
            !Array.isArray(r) &&
            Object.keys(r).sort().join(',') === 'itemId,revisionId',
          'KNOWLEDGE_QUERY_INVALID',
        );
        return {
          itemId: EntityIdSchema.parse(r.itemId),
          revisionId: EntityIdSchema.parse(r.revisionId),
        };
      });
      verify(
        new Set(selected.map((r) => canonicalCompilationJson(r, c))).size === selected.length,
        'KNOWLEDGE_QUERY_INVALID',
      );
      selected.sort((a, b) =>
        a.itemId === b.itemId
          ? a.revisionId < b.revisionId
            ? -1
            : a.revisionId > b.revisionId
              ? 1
              : 0
          : a.itemId < b.itemId
            ? -1
            : 1,
      );
    } catch (error) {
      const code =
        error && typeof error === 'object' && !types.isProxy(error)
          ? Object.getOwnPropertyDescriptor(error, 'code')?.value
          : null;
      if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED'].includes(code))
        throw error;
      throw new OfflinePublicationError('KNOWLEDGE_QUERY_INVALID');
    }
    verify(
      permissions && typeof permissions === 'object' && !types.isProxy(permissions),
      'KNOWLEDGE_PERMISSION_DENIED',
    );
    const d = Object.getOwnPropertyDescriptors(permissions);
    verify(
      d.kind &&
        'value' in d.kind &&
        d.kind.value === 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY' &&
        d.check &&
        'value' in d.check &&
        typeof d.check.value === 'function' &&
        !types.isProxy(d.check.value) &&
        !types.isAsyncFunction(d.check.value),
      'KNOWLEDGE_PERMISSION_DENIED',
    );
    const permissionCheck = (d.check!.value as OfflineKnowledgePermissions['check']).bind(
      permissions,
    );
    this.live();
    verify(!this.#db.isTransaction, 'KNOWLEDGE_SOURCE_UNAVAILABLE');
    const token = 'knowledge_' + randomUUID().replaceAll('-', '');
    let began = false,
      savepoint = false;
    try {
      this.#db.exec('BEGIN');
      began = true;
      this.#db.exec('SAVEPOINT ' + token);
      savepoint = true;
      const b = new HistoryReadBudget(ownedLimits);
      this.sql(ownedLimits, c, b);
      const manifest: OfflineKnowledgeManifest = Object.freeze({
        workspaceId: this.#workspaceId,
        heads: Object.freeze(
          selected.map((r) => Object.freeze({ ...r })),
        ) as unknown as OfflineKnowledgeManifest['heads'],
        fields: Object.freeze([
          'PUBLISHED_ITEM',
          'PUBLISHED_REVISION',
          'REFERENCE_CONTEXT_METADATA',
          'COVERAGE',
          'PROVENANCE_IDS',
          'CURRENT_HEAD_ID',
        ]),
        evidenceKind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY',
      });
      const guard = () => {
        canonicalCompilationJson(null, c);
        this.live();
        verify(this.#db.isTransaction, 'KNOWLEDGE_SOURCE_UNAVAILABLE');
        let value: unknown;
        try {
          value = permissionCheck(manifest);
        } catch {
          throw new OfflinePublicationError('KNOWLEDGE_PERMISSION_DENIED');
        }
        if (types.isPromise(value)) {
          void Promise.prototype.then.call(value, undefined, () => {});
          this.#knowledgeReadUnsettled = true;
          throw new OfflinePublicationError('KNOWLEDGE_PERMISSION_DENIED', 'UNKNOWN');
        }
        verify(value === undefined, 'KNOWLEDGE_PERMISSION_DENIED');
        canonicalCompilationJson(null, c);
        this.live();
        verify(this.#db.isTransaction, 'KNOWLEDGE_SOURCE_UNAVAILABLE');
        this.#db.exec('RELEASE ' + token);
        this.#db.exec('SAVEPOINT ' + token);
        this.sql(ownedLimits, c, b);
      };
      guard();
      const query = (
        columns: Record<string, string>,
        from: string,
        args: import('node:sqlite').SQLInputValue[],
      ) => {
        canonicalCompilationJson(null, c);
        b.own(args);
        b.add('rows', 1);
        const size = this.#db
          .prepare(
            'SELECT count(*) n,coalesce(sum(' +
              Object.values(columns)
                .map((x) => 'coalesce(length(CAST(' + x + ' AS BLOB)),0)')
                .join('+') +
              '),0) bytes' +
              from,
          )
          .get(...args)!;
        verify(
          typeof size.n === 'number' &&
            Number.isSafeInteger(size.n) &&
            typeof size.bytes === 'number' &&
            Number.isSafeInteger(size.bytes),
        );
        b.add('rows', size.n as number);
        b.add('serializedBytes', size.bytes as number);
        b.pin(size.bytes as number);
        const rows = this.#db
          .prepare(
            'SELECT ' +
              Object.entries(columns)
                .map(([name, value]) => value + ' AS ' + name)
                .join(',') +
              from,
          )
          .all(...args);
        verify(rows.length === size.n);
        b.own(rows, false);
        return rows;
      };
      const wanted = canonicalCompilationJson(selected, c),
        args = [wanted, this.#workspaceId];
      const from =
        " FROM json_each(?) w LEFT JOIN offline_revisions r ON r.item_id=json_extract(w.value,'$.itemId') AND r.id=json_extract(w.value,'$.revisionId') AND EXISTS(SELECT 1 FROM offline_attempts scope_owner WHERE scope_owner.id=r.attempt_id AND scope_owner.workspace_id=?) LEFT JOIN offline_attempts a ON a.id=r.attempt_id LEFT JOIN offline_receipts p ON p.attempt_id=a.id LEFT JOIN offline_heads h ON h.item_id=r.item_id AND h.workspace_id=a.workspace_id";
      const metadata = query(
        {
          item_id: "json_extract(w.value,'$.itemId')",
          revision_id: "json_extract(w.value,'$.revisionId')",
          actual_item: 'r.item_id',
          actual_revision: 'r.id',
          attempt_id: 'a.id',
          receipt_id: 'p.attempt_id',
          current_head: 'h.revision_id',
          raw_bytes:
            'coalesce(length(CAST(r.payload_json AS BLOB)),0)+coalesce(length(CAST(a.payload_json AS BLOB)),0)+coalesce(length(CAST(p.payload_json AS BLOB)),0)',
          record_bytes: 'coalesce(length(CAST(r.payload_json AS BLOB)),0)',
        },
        from,
        args,
      );
      verify(metadata.length === selected.length);
      for (const row of metadata) {
        verify(
          row.actual_item === row.item_id &&
            row.actual_revision === row.revision_id &&
            row.attempt_id !== null &&
            row.receipt_id !== null,
          'KNOWLEDGE_REVISION_NOT_FOUND',
        );
        verify(
          typeof row.current_head === 'string' &&
            typeof row.raw_bytes === 'number' &&
            Number.isSafeInteger(row.raw_bytes) &&
            typeof row.record_bytes === 'number' &&
            Number.isSafeInteger(row.record_bytes),
        );
        b.add('serializedBytes', row.raw_bytes as number);
        b.pin(row.raw_bytes as number);
      }
      const candidateId =
        "(SELECT json_extract(e.value,'$.candidateId') FROM json_each(a.payload_json,'$.entries') e WHERE json_extract(e.value,'$.record.itemEnvelope.payload.id')=r.item_id AND json_extract(e.value,'$.record.revisionEnvelope.payload.id')=r.id)";
      const proof =
        "(json_extract(r.payload_json,'$.itemEnvelope.schema')='codeatlas.knowledge-item' AND json_extract(r.payload_json,'$.itemEnvelope.version')=1 AND json_extract(r.payload_json,'$.revisionEnvelope.schema')='codeatlas.knowledge-revision' AND json_extract(r.payload_json,'$.revisionEnvelope.version')=1 AND json_extract(r.payload_json,'$.itemEnvelope.payload.lifecycleState')='ACTIVE' AND json_extract(r.payload_json,'$.itemEnvelope.payload.publishedRevisionId')=r.id AND json_extract(r.payload_json,'$.revisionEnvelope.payload.publicationState')='PUBLISHED' AND json_extract(r.payload_json,'$.revisionEnvelope.payload.itemId')=r.item_id AND json_extract(r.payload_json,'$.revisionEnvelope.payload.id')=r.id AND json_extract(r.payload_json,'$.revisionEnvelope.payload.compilationRunId')=json_extract(a.payload_json,'$.request.runId') AND json_extract(r.payload_json,'$.revisionEnvelope.payload.inputSnapshotRef.id')=json_extract(a.payload_json,'$.request.snapshot.snapshotId') AND json_extract(r.payload_json,'$.revisionEnvelope.payload.revisionSetId')=json_extract(a.payload_json,'$.request.snapshot.revisionSetId') AND json_extract(r.payload_json,'$.revisionEnvelope.payload.evaluationRef.id')=json_extract(a.payload_json,'$.request.evaluation.evaluationId') AND json_extract(a.payload_json,'$.kind')='OWNED_TEST_PUBLICATION' AND json_extract(a.payload_json,'$.quality')='NOT_EVALUABLE' AND json_extract(a.payload_json,'$.productionPublication')='NOT_AUTHORIZED' AND json_extract(p.payload_json,'$.kind')='OWNED_TEST_PUBLICATION' AND json_extract(p.payload_json,'$.attemptId')=a.id AND json_extract(p.payload_json,'$.workspaceId')=a.workspace_id AND json_extract(p.payload_json,'$.requestDigest')=a.request_digest AND json_extract(p.payload_json,'$.commandDigest')=a.command_digest AND json_array_length(p.payload_json,'$.heads')=json_array_length(a.payload_json,'$.entries') AND json_array_length(p.payload_json,'$.heads')=(SELECT count(*) FROM offline_revisions all_rows WHERE all_rows.attempt_id=a.id) AND NOT EXISTS(SELECT 1 FROM json_each(p.payload_json,'$.heads') all_heads WHERE NOT EXISTS(SELECT 1 FROM offline_revisions member WHERE member.attempt_id=a.id AND member.item_id=json_extract(all_heads.value,'$.itemId') AND member.id=json_extract(all_heads.value,'$.revisionId'))) AND EXISTS(SELECT 1 FROM json_each(p.payload_json,'$.heads') rh WHERE json_extract(rh.value,'$.itemId')=r.item_id AND json_extract(rh.value,'$.revisionId')=r.id) AND (SELECT count(*) FROM json_each(a.payload_json,'$.entries') e WHERE json_extract(e.value,'$.record.itemEnvelope.payload.id')=r.item_id AND json_extract(e.value,'$.record.revisionEnvelope.payload.id')=r.id AND json_extract(e.value,'$.record')=r.payload_json)=1 AND (SELECT count(*) FROM json_each(a.payload_json,'$.request.candidates') c WHERE json_extract(c.value,'$.payload.id')=" +
        candidateId +
        ')=1)';
      const candidateBinding = [
        ...['type', 'scope', 'importance'].map(
          (field) =>
            "json_extract(c.value,'$.payload." +
            field +
            "')=json_extract(r.payload_json,'$.itemEnvelope.payload." +
            field +
            "')",
        ),
        ...['structuredContent', 'supportRefs', 'inputSnapshotRef'].map(
          (field) =>
            "json_extract(c.value,'$.payload." +
            field +
            "')=json_extract(r.payload_json,'$.revisionEnvelope.payload." +
            field +
            "')",
        ),
        "json_extract(c.value,'$.payload.type')=json_extract(r.payload_json,'$.revisionEnvelope.payload.structuredContent.kind')",
      ].join(' AND ');
      const lineage =
        "json_extract(r.payload_json,'$.revisionEnvelope.payload.previousRevisionId') IS r.previous_id AND (r.previous_id IS NULL OR EXISTS(SELECT 1 FROM offline_revisions prior WHERE prior.item_id=r.item_id AND prior.id=r.previous_id)) AND EXISTS(SELECT 1 FROM json_each(a.payload_json,'$.entries') e WHERE json_extract(e.value,'$.record.revisionEnvelope.payload.id')=r.id AND json_extract(e.value,'$.record.itemEnvelope.payload.id')=r.item_id AND json_extract(e.value,'$.record')=r.payload_json AND json_extract(e.value,'$.expectedHead') IS r.previous_id AND json_extract(e.value,'$.operation')=CASE WHEN r.previous_id IS NULL THEN 'NEW' ELSE 'UPDATE' END) AND EXISTS(SELECT 1 FROM json_each(p.payload_json,'$.heads') rh WHERE json_extract(rh.value,'$.itemId')=r.item_id AND json_extract(rh.value,'$.revisionId')=r.id AND json_extract(rh.value,'$.previousRevisionId') IS r.previous_id)";
      const boundProof =
        '(' +
        proof +
        ' AND ' +
        lineage +
        " AND EXISTS(SELECT 1 FROM json_each(a.payload_json,'$.request.candidates') c WHERE json_extract(c.value,'$.payload.id')=" +
        candidateId +
        ' AND ' +
        candidateBinding +
        '))';
      const body = query(
        {
          item_id: 'r.item_id',
          revision_id: 'r.id',
          item_json: "json_extract(r.payload_json,'$.itemEnvelope')",
          revision_json: "json_extract(r.payload_json,'$.revisionEnvelope')",
          coverage_json:
            "(SELECT json_extract(c.value,'$.payload.coverage') FROM json_each(a.payload_json,'$.request.candidates') c WHERE json_extract(c.value,'$.payload.id')=" +
            candidateId +
            ')',
          valid: boundProof,
        },
        from,
        args,
      );
      verify(body.length === selected.length);
      const records: OfflinePublishedKnowledge['records'] = [];
      for (const row of body) {
        verify(
          row.valid === 1 &&
            typeof row.item_json === 'string' &&
            typeof row.revision_json === 'string' &&
            typeof row.coverage_json === 'string',
        );
        const meta = metadata.find(
          (m) => m.item_id === row.item_id && m.revision_id === row.revision_id,
        )!;
        verify(meta);
        const itemEnvelope = parseKnowledgeItem(b.parse(String(row.item_json))),
          rawRevision = b.parse(String(row.revision_json)) as {
            schema: unknown;
            version: unknown;
            payload: unknown;
          };
        verify(rawRevision.schema === 'codeatlas.knowledge-revision' && rawRevision.version === 1);
        const payload = KnowledgeRevisionSchema.parse(rawRevision.payload);
        verify(
          itemEnvelope.payload.id === row.item_id &&
            itemEnvelope.payload.publishedRevisionId === row.revision_id &&
            itemEnvelope.payload.lifecycleState === 'ACTIVE' &&
            payload.id === row.revision_id &&
            payload.itemId === row.item_id &&
            payload.publicationState === 'PUBLISHED',
        );
        verify(
          canonicalCompilationJson(itemEnvelope, c) === row.item_json &&
            canonicalCompilationJson(
              { schema: rawRevision.schema, version: rawRevision.version, payload },
              c,
            ) === row.revision_json,
        );
        const entityRefs = new Map<string, ReturnType<typeof ScopedRefSchema.parse>>(),
          supportRefs = new Map<string, ReturnType<typeof SupportRefSchema.parse>>(),
          stack: unknown[] = [payload];
        while (stack.length) {
          canonicalCompilationJson(null, c);
          b.add('items', 1);
          const v = stack.pop();
          if (!v || typeof v !== 'object') continue;
          const o = v as Record<string, unknown>;
          if ((o.scope === 'REPOSITORY' || o.scope === 'WORKSPACE') && o.entity) {
            const ref = ScopedRefSchema.parse(v);
            entityRefs.set(scopedRefKey(ref), ref);
          }
          if (o.basis && o.entity && typeof o.valueDigest === 'string') {
            const ref = SupportRefSchema.parse(v);
            supportRefs.set(supportKey(ref), ref);
            const basis = ref.basis,
              entity = ScopedRefSchema.parse(
                'repositoryId' in basis
                  ? { scope: 'REPOSITORY', repositoryId: basis.repositoryId, entity: ref.entity }
                  : {
                      scope: 'WORKSPACE',
                      workspaceId: 'workspaceId' in basis ? basis.workspaceId : this.#workspaceId,
                      entity: ref.entity,
                    },
              );
            entityRefs.set(scopedRefKey(entity), entity);
          }
          stack.push(...Object.values(v));
        }
        const contextRows = (
          path: 'availableEntities' | 'availableSupports',
          values: unknown[],
        ) => {
          b.add('serializedBytes', meta.record_bytes as number);
          b.pin(meta.record_bytes as number);
          const wantedRefs = canonicalCompilationJson(values, c);
          return query(
            { ref_json: 'e.value' },
            " FROM offline_revisions r JOIN offline_attempts a ON a.id=r.attempt_id JOIN json_each(r.payload_json,'$.referenceContext." +
              path +
              "') e WHERE r.id=? AND r.item_id=? AND a.workspace_id=? AND EXISTS(SELECT 1 FROM json_each(?) wanted_ref WHERE wanted_ref.value=e.value)",
            [String(row.revision_id), String(row.item_id), this.#workspaceId, wantedRefs],
          ).map((v) => b.parse(String(v.ref_json)));
        };
        const availableEntities = contextRows('availableEntities', [...entityRefs.values()]),
          availableSupports = contextRows('availableSupports', [...supportRefs.values()]);
        verify(
          availableEntities.length === entityRefs.size &&
            availableSupports.length === supportRefs.size,
        );
        const referenceContext = parsePhase1ReferenceContext({
            availableEntities,
            availableSupports,
          }),
          revisionEnvelope = parseKnowledgeRevision(rawRevision, referenceContext),
          coverage = Phase1CoverageSchema.parse(b.parse(String(row.coverage_json)));
        verify(canonicalCompilationJson(coverage, c) === row.coverage_json);
        const currentHeadRevisionId = String(meta.current_head),
          isCurrentHead = currentHeadRevisionId === payload.id,
          warnings = ['LIVE_SOURCE_NOT_OBSERVED'];
        if (itemEnvelope.payload.sourceFreshness !== 'FRESH')
          warnings.push(itemEnvelope.payload.sourceFreshness);
        if (!isCurrentHead) warnings.push('HISTORICAL_PUBLISHED_REVISION');
        records.push({
          itemEnvelope,
          revisionEnvelope,
          referenceContext,
          coverage,
          provenance: {
            attemptId: String(meta.attempt_id),
            runId: payload.compilationRunId,
            snapshotId: payload.inputSnapshotRef.id,
            revisionSetId: payload.revisionSetId,
            evaluationId: payload.evaluationRef.id,
          },
          currentHeadRevisionId,
          isCurrentHead,
          warnings,
        });
      }
      guard();
      const result: OfflinePublishedKnowledge = {
        kind: 'OWNED_TEST_PUBLICATION',
        workspaceId: this.#workspaceId,
        selectionDigest: publicationDigest(
          'codeatlas.offline-knowledge.selection.v1',
          { workspaceId: this.#workspaceId, refs: selected },
          c,
        ),
        records,
        productionQuery: 'NOT_AUTHORIZED',
        quality: 'NOT_EVALUABLE',
      };
      canonicalCompilationJson(result, c);
      const pending: unknown[] = [result];
      while (pending.length) {
        const value = pending.pop();
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
          pending.push(...Object.values(value));
          Object.freeze(value);
        }
      }
      this.#db.exec('RELEASE ' + token);
      savepoint = false;
      this.#db.exec('COMMIT');
      began = false;
      this.live();
      return result;
    } catch (error) {
      try {
        this.live();
        if (savepoint) {
          verify(this.#db.isTransaction, 'KNOWLEDGE_SOURCE_UNAVAILABLE');
          this.#db.exec('ROLLBACK TO ' + token);
          this.#db.exec('ROLLBACK');
        } else if (began && this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#knowledgeReadUnsettled = true;
        throw new OfflinePublicationError('KNOWLEDGE_SOURCE_UNAVAILABLE', 'UNKNOWN');
      }
      if (error instanceof OfflinePublicationError) throw error;
      const code =
        error && typeof error === 'object' && !types.isProxy(error)
          ? Object.getOwnPropertyDescriptor(error, 'code')?.value
          : null;
      if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED'].includes(code))
        throw error;
      throw new OfflinePublicationError('KNOWLEDGE_RECORD_INVALID');
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
