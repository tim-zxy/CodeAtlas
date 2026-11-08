import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import { ensurePhase1Data, supportKey, type RuntimeRequestControl } from '@codeatlas/ir';
import {
  canonicalCompilationJson,
  parseCompilationCaptureRequest,
  parseCompilationInputSnapshot,
  type CompilationInputSnapshot,
} from '../../../ir/dist/compilation-input-contract.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  exact,
  text,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';
import { prepareSnapshotSchemas, exactCaptureSchema } from './snapshot-schema.js';

export class SnapshotStoreError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'SnapshotStoreError';
  }
}
function requireValue(v: unknown, code = 'SNAPSHOT_INVALID'): asserts v {
  if (!v) throw new SnapshotStoreError(code);
}
function safe(error: unknown, fallback: string) {
  if (error instanceof SnapshotStoreError) return error;
  const code =
    error && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptor(error, 'code')?.value
      : undefined;
  return new SnapshotStoreError(
    ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED'].includes(code)
      ? code
      : fallback,
  );
}
type Key = {
  runId: string;
  subject: { issuerNamespace: string; subjectId: string };
  requestKey: string;
  request: unknown;
};
type Session = ReturnType<CompilationInputStore['session']>;
const immutable = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) immutable(x);
    Object.freeze(v);
  }
  return v;
};
/** Private borrowed-connection Store wired only to owned tests. No DTO, subject
 * label, schema match or callback mints capture/permission/scan authority. */
export class CompilationInputStore {
  #blocked = false;
  #ownedRuns = new Set<string>();
  #attempts = new Map<string, { snapshotId: string; key: string; settled: boolean }>();
  #db: DatabaseSync;
  #workspaceId: string;
  constructor(db: DatabaseSync, workspaceId: string) {
    this.#db = db;
    this.#workspaceId = workspaceId;
    requireValue(!types.isProxy(db) && db instanceof DatabaseSync && db.isOpen);
    text(workspaceId);
  }
  session(
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    syncCheck: () => unknown,
    write = false,
  ) {
    requireValue(!write || !this.#blocked, 'SNAPSHOT_OWNER_UNSETTLED');
    requireValue(this.#db.isOpen && !this.#db.isTransaction, 'SNAPSHOT_TRANSACTION_ACTIVE');
    requireValue(
      typeof syncCheck === 'function' &&
        !types.isProxy(syncCheck) &&
        !types.isAsyncFunction(syncCheck),
    );
    canonicalCompilationJson(null, control);
    const descriptors = Object.getOwnPropertyDescriptors(control);
    const c = Object.freeze(
      Object.fromEntries(
        ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal'].map((key) => [
          key,
          descriptors[key]!.value,
        ]),
      ),
    ) as unknown as RuntimeRequestControl;
    const b = new HistoryReadBudget(checkedHistoryLimits(limits)),
      sql = runtimeSql(this.#db, b);
    const checkpoint = () => {
      canonicalCompilationJson(null, c);
      const result = syncCheck();
      if (types.isPromise(result)) void Promise.prototype.then.call(result, undefined, () => {});
      requireValue(result === undefined, 'SNAPSHOT_SYNC_CHECK_REQUIRED');
      canonicalCompilationJson(null, c);
    };
    const schema = () => {
      const version = sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version;
      requireValue(exactCaptureSchema(sql, version), 'SNAPSHOT_SCHEMA_UNSUPPORTED');
      requireValue(
        sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
        'SNAPSHOT_FOREIGN_KEYS_REQUIRED',
      );
      requireValue(
        sql.read('workspace', ['id'], 'id=?', [this.#workspaceId]).length === 1,
        'SNAPSHOT_SCOPE_MISMATCH',
      );
      return version;
    };
    schema();
    return { b, sql, c, checkpoint, schema, json: (v: unknown) => canonicalCompilationJson(v, c) };
  }
  private key(input: Key, s: Session) {
    s.b.own(input);
    ensurePhase1Data(input);
    const k = exact(input, ['runId', 'subject', 'requestKey', 'request']);
    const subject = exact(k.subject, ['issuerNamespace', 'subjectId']);
    const request = exact(k.request, [
      'schemaVersion',
      'captureRequest',
      'updateMode',
      'expectedHeads',
      'workflowRef',
      'modelPolicyRef',
    ]);
    requireValue(
      request.schemaVersion === 1 &&
        ['FULL', 'AFFECTED_ONLY'].includes(request.updateMode as string) &&
        request.modelPolicyRef === null,
    );
    const capture = parseCompilationCaptureRequest(request.captureRequest, s.c);
    requireValue(capture.workspaceId === this.#workspaceId, 'SNAPSHOT_SCOPE_MISMATCH');
    const heads = exact(request.expectedHeads, ['heads']);
    requireValue(Array.isArray(heads.heads));
    const ids = new Set<string>();
    const normalizedHeads = heads.heads
      .map((v) => {
        const h = exact(v, ['itemId', 'revisionId']),
          itemId = text(h.itemId);
        requireValue(!ids.has(itemId));
        ids.add(itemId);
        return { itemId, revisionId: h.revisionId === null ? null : text(h.revisionId) };
      })
      .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
    const normalized = {
      ...request,
      captureRequest: capture,
      expectedHeads: { heads: normalizedHeads },
      workflowRef: text(request.workflowRef),
    };
    return {
      runId: text(k.runId),
      subject: s.json([text(subject.issuerNamespace), text(subject.subjectId)]),
      requestKey: text(k.requestKey),
      request: normalized,
      capture,
      requestJson: s.json(normalized),
    };
  }
  private identity(k: ReturnType<CompilationInputStore['key']>, s: Session) {
    return s.json([k.runId, k.subject, k.requestKey, k.requestJson]);
  }
  private run(k: ReturnType<CompilationInputStore['key']>, s: Session) {
    requireValue(
      s.sql
        .read('revision_sets', ['frozen'], 'workspace_id=? AND id=?', [
          this.#workspaceId,
          k.capture.revisionSetId,
        ])
        .some((r) => r.frozen === 1),
      'SNAPSHOT_REVISION_SET_UNFROZEN',
    );
    const rows = s.sql.read(
      'compilation_runs',
      [
        'id',
        'workspace_id',
        'revision_set_id',
        'caller_subject_id',
        'request_key',
        'request_json',
        'state',
        'snapshot_id',
        'metadata_json',
        'created_at_ms',
        'finished_at_ms',
      ],
      'id=?',
      [k.runId],
    );
    requireValue(rows.length === 1, 'SNAPSHOT_RUN_UNAVAILABLE');
    const row = rows[0]!;
    requireValue(
      row.workspace_id === this.#workspaceId &&
        row.revision_set_id === k.capture.revisionSetId &&
        row.caller_subject_id === k.subject &&
        row.request_key === k.requestKey &&
        row.request_json === k.requestJson,
      'SNAPSHOT_REQUEST_CONFLICT',
    );
    requireValue(
      ['CREATED', 'CAPTURING', 'FAILED', 'CANCELLED'].includes(row.state as string),
      'SNAPSHOT_RUN_UNSUPPORTED',
    );
    const metadata = exact(JSON.parse(text(row.metadata_json)), [
      'schemaVersion',
      'workflowRef',
      'securityPolicyRef',
      'domainPolicyRef',
      'storageLimits',
      'taskVersionRefs',
      'promptVersionRefs',
      'modelPolicyRef',
      'modelVersionRefs',
      'invocationRefs',
      'validationRefs',
      'candidateRefs',
    ]);
    requireValue(
      metadata.schemaVersion === 1 &&
        metadata.workflowRef === k.request.workflowRef &&
        metadata.securityPolicyRef === k.capture.policyVersions.securityPolicyRef &&
        metadata.domainPolicyRef === k.capture.policyVersions.domainPolicyRef &&
        metadata.modelPolicyRef === null,
    );
    checkedHistoryLimits(metadata.storageLimits);
    for (const key of [
      'taskVersionRefs',
      'promptVersionRefs',
      'modelVersionRefs',
      'invocationRefs',
      'validationRefs',
      'candidateRefs',
    ])
      requireValue(Array.isArray(metadata[key]) && (metadata[key] as unknown[]).length === 0);
    requireValue(row.metadata_json === s.json(metadata));
    return row;
  }
  createRun(
    input: Key & { createdAtMs: number },
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    syncCheck: () => unknown,
  ) {
    const s = this.session(limits, control, syncCheck, true);
    s.b.own(input);
    ensurePhase1Data(input);
    exact(input, ['runId', 'subject', 'requestKey', 'request', 'createdAtMs']);
    const { createdAtMs, ...raw } = input,
      k = this.key(raw, s);
    requireValue(Number.isSafeInteger(createdAtMs) && createdAtMs >= 0);
    requireValue(s.schema() === 10, 'SNAPSHOT_SCHEMA_UNSUPPORTED');
    s.checkpoint();
    this.#db.exec('BEGIN IMMEDIATE');
    let committing = false;
    try {
      s.schema();
      requireValue(
        s.sql
          .read('revision_sets', ['id', 'frozen'], 'workspace_id=? AND id=?', [
            this.#workspaceId,
            k.capture.revisionSetId,
          ])
          .some((r) => r.frozen === 1),
        'SNAPSHOT_REVISION_SET_UNFROZEN',
      );
      requireValue(
        s.sql.read(
          'compilation_runs',
          ['id'],
          'workspace_id=? AND caller_subject_id=? AND request_key=?',
          [this.#workspaceId, k.subject, k.requestKey],
        ).length === 0,
        'SNAPSHOT_REQUEST_IN_PROGRESS',
      );
      s.sql.insert('compilation_runs', {
        id: k.runId,
        workspace_id: this.#workspaceId,
        revision_set_id: k.capture.revisionSetId,
        caller_subject_id: k.subject,
        request_key: k.requestKey,
        request_json: k.requestJson,
        state: 'CREATED',
        snapshot_id: null,
        metadata_json: s.json({
          schemaVersion: 1,
          workflowRef: k.request.workflowRef,
          ...k.capture.policyVersions,
          storageLimits: s.b.limits,
          taskVersionRefs: [],
          promptVersionRefs: [],
          modelPolicyRef: null,
          modelVersionRefs: [],
          invocationRefs: [],
          validationRefs: [],
          candidateRefs: [],
        }),
        created_at_ms: createdAtMs,
        finished_at_ms: null,
      });
      s.sql.run("UPDATE compilation_runs SET state='CAPTURING' WHERE id=?", [k.runId]);
      s.checkpoint();
      committing = true;
      this.#db.exec('COMMIT');
      this.#ownedRuns.add(k.runId);
      return immutable({ runId: k.runId, state: 'CAPTURING' as const });
    } catch (error) {
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#blocked = true;
        throw new SnapshotStoreError('RUN_CLEANUP_UNKNOWN', 'UNKNOWN');
      }
      if (committing) {
        this.#blocked = true;
        throw new SnapshotStoreError('RUN_COMMIT_OUTCOME_UNKNOWN');
      }
      throw safe(error, 'RUN_WRITE_FAILED');
    }
  }
  private bindSnapshot(
    k: ReturnType<CompilationInputStore['key']>,
    snapshot: CompilationInputSnapshot,
    s: Session,
  ) {
    const pins = s.sql.read(
      'revision_set_items',
      ['repository_id', 'revision_id', 'revision_fingerprint'],
      'revision_set_id=?',
      [snapshot.revisionSetId],
    );
    if (snapshot.scope.kind === 'WORKSPACE')
      requireValue(pins.length === snapshot.repositories.length, 'SNAPSHOT_SCOPE_MISMATCH');
    for (const repo of snapshot.repositories) {
      requireValue(
        s.sql.read('repositories', ['repository_id'], 'workspace_id=? AND repository_id=?', [
          this.#workspaceId,
          repo.repoBasis.repositoryId,
        ]).length === 1,
        'SNAPSHOT_SCOPE_MISMATCH',
      );
      requireValue(
        pins.some(
          (pin) =>
            pin.repository_id === repo.repoBasis.repositoryId &&
            pin.revision_id === repo.repoBasis.revisionId &&
            pin.revision_fingerprint === repo.repoBasis.contentFingerprint,
        ),
        'SNAPSHOT_REVISION_SET_MISMATCH',
      );
    }
    const { repositoryIds, selectedEntityRefs, selectedDocumentRevisions, ...request } = k.capture;
    requireValue(
      s.json({ ...request, ...snapshot.selection }) ===
        s.json({
          schemaVersion: snapshot.schemaVersion,
          workspaceId: snapshot.workspaceId,
          scope: snapshot.scope,
          revisionSetId: snapshot.revisionSetId,
          policyVersions: snapshot.policyVersions,
          ...snapshot.selection,
        }),
      'SNAPSHOT_SCOPE_MISMATCH',
    );
    requireValue(
      s.json(snapshot.selection) ===
        s.json({ repositoryIds, selectedEntityRefs, selectedDocumentRevisions }),
      'SNAPSHOT_SELECTION_MISMATCH',
    );
  }
  private supportRows(snapshot: CompilationInputSnapshot, s: Session) {
    return [
      ...snapshot.repositories,
      ...snapshot.documents,
      ...(snapshot.workspaceCapture ? [snapshot.workspaceCapture] : []),
    ].flatMap((capture) =>
      capture.supports.map((support) => ({
        workspace_id: this.#workspaceId,
        snapshot_id: snapshot.snapshotId,
        revision_set_id: snapshot.revisionSetId,
        support_key: supportKey(support.ref),
        basis_key: s.json(support.ref.basis),
        entity_key: s.json(support.ref.entity),
        support_value_digest: support.ref.valueDigest,
        captured_value_digest: support.capturedValueDigest,
        value_schema_ref: support.valueSchemaRef,
        payload_json: s.json(support),
      })),
    );
  }
  private loaded(
    k: ReturnType<CompilationInputStore['key']>,
    s: Session,
  ): CompilationInputSnapshot | null {
    const run = this.run(k, s);
    if (run.snapshot_id === null) return null;
    const rows = s.sql.read(
      'compilation_input_snapshots',
      [
        'id',
        'workspace_id',
        'revision_set_id',
        'schema_version',
        'input_digest',
        'capture_started_at_ms',
        'capture_completed_at_ms',
        'payload_json',
      ],
      'id=?',
      [text(run.snapshot_id)],
    );
    requireValue(rows.length === 1);
    const row = rows[0]!;
    const snapshot = parseCompilationInputSnapshot(JSON.parse(text(row.payload_json)), s.c);
    s.b.own(snapshot);
    requireValue(
      row.payload_json === s.json(snapshot) &&
        row.id === snapshot.snapshotId &&
        row.workspace_id === this.#workspaceId &&
        row.revision_set_id === snapshot.revisionSetId &&
        row.schema_version === 1 &&
        row.input_digest === snapshot.inputDigest &&
        row.capture_started_at_ms === Date.parse(snapshot.captureWindow.startedAt) &&
        row.capture_completed_at_ms === Date.parse(snapshot.captureWindow.completedAt),
    );
    this.bindSnapshot(k, snapshot, s);
    const expected = this.supportRows(snapshot, s).sort((a, b) =>
      a.support_key < b.support_key ? -1 : a.support_key > b.support_key ? 1 : 0,
    );
    const columns = [
      'workspace_id',
      'snapshot_id',
      'revision_set_id',
      'support_key',
      'basis_key',
      'entity_key',
      'support_value_digest',
      'captured_value_digest',
      'value_schema_ref',
      'payload_json',
    ];
    const actual = s.sql
      .read('snapshot_supports', columns, 'workspace_id=? AND snapshot_id=?', [
        this.#workspaceId,
        snapshot.snapshotId,
      ])
      .map((r) => ({ ...r }))
      .sort((a, b) =>
        String(a.support_key) < String(b.support_key)
          ? -1
          : String(a.support_key) > String(b.support_key)
            ? 1
            : 0,
      );
    requireValue(s.json(actual) === s.json(expected), 'SNAPSHOT_SUPPORT_MISMATCH');
    return snapshot;
  }
  putSnapshot(
    key: Key,
    input: unknown,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    syncCheck: () => unknown,
  ) {
    const s = this.session(limits, control, syncCheck, true),
      k = this.key(key, s);
    s.b.own(input);
    const snapshot = parseCompilationInputSnapshot(input, s.c);
    s.b.own(snapshot);
    this.bindSnapshot(k, snapshot, s);
    s.checkpoint();
    this.#db.exec('BEGIN IMMEDIATE');
    let committing = false,
      acknowledged = false,
      reused = false,
      actual = snapshot;
    try {
      s.schema();
      const existing = this.loaded(k, s);
      if (existing) {
        requireValue(existing.inputDigest === snapshot.inputDigest, 'SNAPSHOT_REQUEST_CONFLICT');
        actual = existing;
        reused = true;
      } else {
        requireValue(this.#ownedRuns.has(k.runId), 'SNAPSHOT_OWNER_UNSETTLED');
        this.#attempts.set(k.runId, {
          snapshotId: snapshot.snapshotId,
          key: this.identity(k, s),
          settled: false,
        });
        requireValue(this.run(k, s).state === 'CAPTURING');
        requireValue(
          s.sql
            .read('revision_sets', ['frozen'], 'workspace_id=? AND id=?', [
              this.#workspaceId,
              snapshot.revisionSetId,
            ])
            .some((r) => r.frozen === 1),
        );
        s.sql.insert('compilation_input_snapshots', {
          id: snapshot.snapshotId,
          workspace_id: this.#workspaceId,
          revision_set_id: snapshot.revisionSetId,
          schema_version: 1,
          input_digest: snapshot.inputDigest,
          capture_started_at_ms: Date.parse(snapshot.captureWindow.startedAt),
          capture_completed_at_ms: Date.parse(snapshot.captureWindow.completedAt),
          payload_json: s.json(snapshot),
        });
        for (const row of this.supportRows(snapshot, s)) s.sql.insert('snapshot_supports', row);
        s.sql.run('UPDATE compilation_runs SET snapshot_id=? WHERE id=?', [
          snapshot.snapshotId,
          k.runId,
        ]);
      }
      s.checkpoint();
      s.schema();
      committing = true;
      this.#db.exec('COMMIT');
      acknowledged = true;
      if (this.#attempts.has(k.runId)) this.#attempts.get(k.runId)!.settled = true;
      s.checkpoint();
      s.schema();
      return immutable({
        status: 'COMMITTED' as const,
        workspaceId: this.#workspaceId,
        runId: k.runId,
        snapshotId: actual.snapshotId,
        revisionSetId: actual.revisionSetId,
        inputDigest: actual.inputDigest,
        reused,
        cleanupState: 'SETTLED' as const,
      });
    } catch (error) {
      let settled = false;
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
        settled = !this.#db.isTransaction;
      } catch {
        this.#blocked = true;
      }
      if (this.#ownedRuns.has(k.runId) && this.#attempts.has(k.runId))
        this.#attempts.get(k.runId)!.settled = settled;
      if (acknowledged) {
        this.#blocked = true;
        return immutable({
          status: 'COMMITTED' as const,
          workspaceId: this.#workspaceId,
          runId: k.runId,
          snapshotId: actual.snapshotId,
          revisionSetId: actual.revisionSetId,
          inputDigest: actual.inputDigest,
          reused,
          cleanupState: 'UNKNOWN' as const,
        });
      }
      if (committing) {
        this.#blocked = true;
        return immutable({
          status: 'COMMIT_OUTCOME_UNKNOWN' as const,
          workspaceId: this.#workspaceId,
          runId: k.runId,
          attemptedSnapshotId: snapshot.snapshotId,
          diagnostic: 'SNAPSHOT_COMMIT_UNKNOWN' as const,
          cleanupState: settled ? ('SETTLED' as const) : ('UNKNOWN' as const),
        });
      }
      if (!settled) throw new SnapshotStoreError('SNAPSHOT_CLEANUP_UNKNOWN', 'UNKNOWN');
      throw safe(error, 'SNAPSHOT_WRITE_FAILED');
    }
  }
  private read<T>(
    key: Key,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    syncCheck: () => unknown,
    consume: (
      snapshot: CompilationInputSnapshot | null,
      s: Session,
      k: ReturnType<CompilationInputStore['key']>,
    ) => T,
  ): T {
    const s = this.session(limits, control, syncCheck),
      k = this.key(key, s);
    s.checkpoint();
    this.#db.exec('BEGIN');
    try {
      s.schema();
      const result = consume(this.loaded(k, s), s, k);
      s.checkpoint();
      s.schema();
      this.#db.exec('COMMIT');
      return immutable(result);
    } catch (error) {
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#blocked = true;
        throw new SnapshotStoreError('SNAPSHOT_READ_CLEANUP_UNKNOWN', 'UNKNOWN');
      }
      throw safe(error, 'SNAPSHOT_READ_FAILED');
    }
  }
  readSnapshot(
    key: Key,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    syncCheck: () => unknown,
  ) {
    return this.read(key, limits, control, syncCheck, (snapshot) => {
      requireValue(snapshot, 'SNAPSHOT_UNAVAILABLE');
      return snapshot;
    });
  }
  inspectCommit(
    key: Key,
    attemptedSnapshotId: string,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    syncCheck: () => unknown,
  ) {
    text(attemptedSnapshotId);
    return this.read(key, limits, control, syncCheck, (snapshot, s, k) => {
      if (snapshot)
        return {
          status: 'COMMITTED',
          workspaceId: this.#workspaceId,
          runId: k.runId,
          snapshotId: snapshot.snapshotId,
          revisionSetId: snapshot.revisionSetId,
          inputDigest: snapshot.inputDigest,
        };
      const attempt = this.#attempts.get(k.runId);
      if (
        attempt?.settled &&
        attempt.snapshotId === attemptedSnapshotId &&
        attempt.key === this.identity(k, s)
      )
        return {
          status: 'NOT_COMMITTED',
          workspaceId: this.#workspaceId,
          runId: k.runId,
          attemptedSnapshotId,
        };
      return {
        status: 'COMMIT_OUTCOME_UNKNOWN',
        workspaceId: this.#workspaceId,
        runId: k.runId,
        attemptedSnapshotId,
        diagnostic: 'OWNER_UNSETTLED',
      };
    });
  }
}
export async function openCompilationInputStore(
  db: DatabaseSync,
  workspaceId: string,
  limits: HistoryReadLimits,
) {
  await prepareSnapshotSchemas();
  const store = new CompilationInputStore(db, workspaceId);
  const b = new HistoryReadBudget(checkedHistoryLimits(limits)),
    sql = runtimeSql(db, b);
  const version = sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version;
  requireValue(exactCaptureSchema(sql, version), 'SNAPSHOT_SCHEMA_UNSUPPORTED');
  return store;
}
