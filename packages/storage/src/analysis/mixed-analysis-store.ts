import {
  writeMixedRuntimeBatchLocked,
  type RuntimeBatchCandidate,
  type RuntimeBatchCandidateV2,
} from '../runtime/runtime-fact-store.js';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { types, isDeepStrictEqual } from 'node:util';
import { RepoBasisSchema } from '@codeatlas/ir';
import { acquireMixedAnalysisLease } from './mixed-analysis-stage.js';
import { readCodeContextSnapshot, CaptureError } from './code-context-read.js';
import {
  captureActivationContext,
  captureRuntimeActivationContext,
  releaseActivationContext,
  recheckMixedAnalysisCaptureLocked,
} from './activation-history.js';
import { MixedAnalysisError, requireMixedAnalysis as check } from './mixed-analysis-state.js';
import {
  HistoryCaptureError,
  checkedHistoryLimits,
  HistoryReadBudget,
  encodeHistoryValue,
  record,
  array,
  text,
  type HistoryReadLimits,
} from './activation-history-format.js';

type SqlRow = Record<string, SQLInputValue>;
const connections = new WeakMap<object, DatabaseSync>();
function safeFailure(error: unknown): never {
  if (error instanceof MixedAnalysisError) throw error;
  if (error instanceof CaptureError && error.code === 'CODE_CAPTURE_LIMIT_EXCEEDED')
    throw new MixedAnalysisError('STAGE_LIMIT_EXCEEDED');
  if (error instanceof HistoryCaptureError && error.code === 'HISTORY_LIMIT_EXCEEDED')
    throw new MixedAnalysisError('STAGE_LIMIT_EXCEEDED');
  throw new MixedAnalysisError('INVALID_CANDIDATE');
}
type Outcome = {
  path: string | null;
  repositoryId: string;
  activationId: string;
  manifest: unknown;
  previousIdentity: string;
  before: string | null;
  after: string | null;
  status: 'NOT_COMMITTED' | 'COMMITTED' | 'COMMIT_OUTCOME_UNKNOWN';
  cleanupFailed: boolean;
  schemaVersion?: 13;
  runtimeActivationId?: string;
};
const outcomes = new WeakMap<object, Outcome>();
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';
/** Complete persistent row image, with numeric preflight before every TEXT row allocation. */
function persistentImage(db: DatabaseSync, b: HistoryReadBudget): string {
  function rows(table: string, columns: string[], where = ''): Record<string, unknown>[] {
    const from = ' FROM ' + identifier(table) + where;
    b.own(columns);
    b.add('rows', 1);
    const pre = db
      .prepare(
        'SELECT count(*) AS n,coalesce(sum(' +
          columns.map((c) => 'coalesce(length(CAST(' + identifier(c) + ' AS BLOB)),0)').join('+') +
          '),0) AS bytes' +
          from,
      )
      .get();
    check(
      pre &&
        typeof pre.n === 'number' &&
        Number.isSafeInteger(pre.n) &&
        pre.n >= 0 &&
        typeof pre.bytes === 'number' &&
        Number.isSafeInteger(pre.bytes) &&
        pre.bytes >= 0,
    );
    check(
      pre.n <= Math.floor((b.limits.maxRows - b.rows) / 2) &&
        pre.bytes <= b.limits.maxSerializedBytes - b.serializedBytes &&
        pre.bytes <= Math.floor(b.limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes,
      'STAGE_LIMIT_EXCEEDED',
    );
    const out: Record<string, unknown>[] = [];
    const locations = db
      .prepare(
        'SELECT rowid AS locator,' +
          columns.map((c) => 'coalesce(length(CAST(' + identifier(c) + ' AS BLOB)),0)').join('+') +
          ' AS bytes' +
          from +
          ' ORDER BY rowid',
      )
      .iterate();
    try {
      for (const loc of locations) {
        b.add('rows', 1);
        check(typeof loc.bytes === 'number' && Number.isSafeInteger(loc.bytes) && loc.bytes >= 0);
        b.add('serializedBytes', loc.bytes);
        b.pin(loc.bytes);
        b.add('rows', 1);
        const row = db
          .prepare(
            'SELECT ' +
              columns.map(identifier).join(',') +
              ' FROM ' +
              identifier(table) +
              ' WHERE rowid=?',
          )
          .get(loc.locator as number);
        check(row);
        b.own(row, false);
        out.push(row);
      }
    } finally {
      locations.return?.();
    }
    return out;
  }
  const tables = rows(
    'sqlite_schema',
    ['name'],
    " WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const image: Record<string, string[]> = {};
  for (const value of tables) {
    const name = text(value.name),
      columns = db
        .prepare('SELECT * FROM ' + identifier(name))
        .columns()
        .map((c) => c.name);
    const values = rows(name, columns)
      .map((v) => encodeHistoryValue(v, b))
      .sort();
    b.own(values);
    image[name] = values;
  }
  return encodeHistoryValue(image, b);
}

/** Internal fresh readonly recovery; never repairs, retries, or accepts caller-supplied expectations. */
export function inspectMixedAnalysisOutcome(
  store: MixedAnalysisStore,
  input: HistoryReadLimits,
): Readonly<{
  status: 'COMMITTED' | 'NOT_COMMITTED' | 'INCONSISTENT';
  activationId: string;
  cleanupFailed: boolean;
}> {
  const receipt = outcomes.get(store);
  check(receipt);
  const limits = checkedHistoryLimits(input),
    b = new HistoryReadBudget(limits);
  let db: DatabaseSync | undefined;
  try {
    b.own(receipt);
    check(receipt.path && !connections.get(store)?.isTransaction);
    db = new DatabaseSync(receipt.path, { readOnly: true, enableForeignKeyConstraints: true });
    const h = (
      receipt.schemaVersion === 13 ? captureRuntimeActivationContext : captureActivationContext
    )(
      db,
      RepoBasisSchema.parse(
        record(receipt.manifest).state && record(record(receipt.manifest).state).basis,
      ).repositoryId,
      b.remaining(),
    );
    db.exec('BEGIN');
    const fresh = recheckMixedAnalysisCaptureLocked(db, h.handle, b.remaining());
    b.add('rows', fresh.usage.rows);
    b.add('serializedBytes', fresh.usage.serializedBytes);
    b.add('items', fresh.usage.items);
    b.pin(fresh.usage.retainedLogicalBytes);
    // History and complete image share this fresh readonly transaction.
    const image = persistentImage(db, b);
    const status =
      fresh.data.view.history &&
      isDeepStrictEqual(fresh.data.view.history, receipt.manifest) &&
      receipt.after === image
        ? 'COMMITTED'
        : fresh.identity === receipt.previousIdentity &&
            ((receipt.before === null && receipt.status === 'NOT_COMMITTED') ||
              receipt.before === image)
          ? 'NOT_COMMITTED'
          : 'INCONSISTENT';
    db.exec('COMMIT');
    releaseActivationContext(db, h.handle);
    return Object.freeze({
      status,
      activationId: receipt.activationId,
      cleanupFailed: receipt.cleanupFailed,
    });
  } catch (error) {
    if (error instanceof HistoryCaptureError && error.code === 'HISTORY_LIMIT_EXCEEDED')
      return safeFailure(error);
    if (error instanceof MixedAnalysisError && error.code === 'STAGE_LIMIT_EXCEEDED') throw error;
    return Object.freeze({
      status: 'INCONSISTENT',
      activationId: receipt.activationId,
      cleanupFailed: receipt.cleanupFailed,
    });
  } finally {
    if (db?.isOpen) db.close();
  }
}
/** Fixed internal SQL adapters; table and column identifiers are program-owned only. */
function writer(db: DatabaseSync, b: HistoryReadBudget) {
  const json = (v: unknown) => (v === null ? null : encodeHistoryValue(v, b));
  const run = (sql: string, params: SQLInputValue[]) => {
    b.own(params);
    b.add('rows', 1);
    b.add(
      'serializedBytes',
      params.reduce<number>((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 0), 0),
    );
    return db.prepare(sql).run(...params);
  };
  const insert = (table: string, row: SqlRow) => {
    b.own(row);
    const columns = Object.keys(row);
    return run(
      'INSERT INTO ' +
        table +
        '(' +
        columns.join(',') +
        ') VALUES(' +
        columns.map(() => '?').join(',') +
        ')',
      Object.values(row),
    );
  };
  const immutable = (table: string, row: SqlRow, keys: string[]) => {
    const columns = Object.keys(row),
      where = keys.map((k) => k + '=?').join(' AND '),
      params = keys.map((k) => row[k]!);
    b.own(row);
    b.own(params);
    b.add('rows', 1);
    const pre = db
      .prepare(
        'SELECT count(*) AS n,coalesce(sum(' +
          columns.map((k) => 'coalesce(length(CAST(' + k + ' AS BLOB)),0)').join('+') +
          '),0) AS bytes FROM ' +
          table +
          ' WHERE ' +
          where,
      )
      .get(...params);
    check(
      pre &&
        typeof pre.n === 'number' &&
        pre.n <= 1 &&
        typeof pre.bytes === 'number' &&
        Number.isSafeInteger(pre.bytes) &&
        pre.bytes >= 0,
      'INVALID_CANDIDATE',
    );
    if (pre.n === 0) {
      insert(table, row);
      return;
    }
    b.add('rows', 1);
    b.add('serializedBytes', pre.bytes);
    b.pin(pre.bytes);
    const existing = db
      .prepare('SELECT ' + columns.join(',') + ' FROM ' + table + ' WHERE ' + where)
      .get(...params);
    b.own(existing, false);
    check(existing && columns.every((k) => existing[k] === row[k]), 'INVALID_CANDIDATE');
  };
  return { json, run, insert, immutable };
}

/** Internal R011 writer. Only a genuine same-connection frozen Stage lease can publish. */
export class MixedAnalysisStore {
  constructor(db: DatabaseSync) {
    check(!types.isProxy(db) && db instanceof DatabaseSync && db.isOpen);
    connections.set(this, db);
  }
  apply(lease: object, limits: HistoryReadLimits): string {
    return this.applyCore(lease, limits).syntaxActivationId;
  }
  applyWithRuntime(
    lease: object,
    limits: HistoryReadLimits,
    candidate: RuntimeBatchCandidate,
    expectedOldRuntime: string | null,
  ) {
    return this.applyCore(lease, limits, { candidate, expectedOldRuntime, version: 1 });
  }
  applyWithRuntimeV2(
    lease: object,
    limits: HistoryReadLimits,
    candidate: RuntimeBatchCandidateV2,
    expectedOldRuntime: string | null,
  ) {
    return this.applyCore(lease, limits, { candidate, expectedOldRuntime, version: 2 });
  }
  private applyCore(
    lease: object,
    limits: HistoryReadLimits,
    runtime?: {
      candidate: RuntimeBatchCandidate | RuntimeBatchCandidateV2;
      expectedOldRuntime: string | null;
      version: 1 | 2;
    },
  ) {
    const db = connections.get(this);
    check(db);
    const owned = acquireMixedAnalysisLease(db, lease, limits);
    const receipt: Outcome = {
      path: db.location('main'),
      repositoryId: text(record(owned.result.basis).repositoryId),
      activationId: text(owned.result.activationId),
      manifest: owned.result.manifest,
      previousIdentity: owned.expectedIdentity,
      before: null,
      after: null,
      status: 'NOT_COMMITTED',
      cleanupFailed: false,
      ...(runtime ? { schemaVersion: 13 as const } : {}),
    };
    outcomes.set(this, receipt);
    let transaction = false,
      committing = false,
      committed = false;
    try {
      transaction = true;
      db.exec('BEGIN IMMEDIATE');
      owned.recheck();
      receipt.before = persistentImage(db, owned.budget);
      const b = owned.budget,
        result = owned.result,
        code = record(result.code),
        manifest = record(result.manifest),
        state = record(manifest.state),
        basis = record(result.basis),
        repo = RepoBasisSchema.parse(basis).repositoryId,
        rev = text(basis.revisionId),
        activationId = text(result.activationId),
        w = writer(db, b);
      b.add('rows', 1);
      check(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys === 1);
      const oldSnapshots = new Set(owned.capture.snapshotIds);
      for (const value of array(code.snapshots)) {
        const s = record(value);
        if (oldSnapshots.has(text(s.id))) continue;
        w.immutable(
          'provider_snapshots',
          {
            id: text(s.id),
            repository_id: repo,
            provider_id: text(s.providerId),
            provider_version: text(s.providerVersion),
            runtime_version: text(s.runtimeVersion),
            requested_revision_id: text(s.requestedRevisionId),
            requested_revision_fingerprint: text(s.requestedRevisionFingerprint),
            started_at: Date.parse(text(s.startedAt)),
            completed_at: Date.parse(text(s.completedAt)),
            outcome: text(s.outcome),
          },
          ['id'],
        );
        for (const value of array(s.capabilities)) {
          const c = record(value);
          w.insert('provider_capabilities', {
            snapshot_id: text(s.id),
            name: text(c.name),
            support: text(c.support),
            coverage: text(c.coverage),
          });
        }
      }
      const evidence = array(code.evidence).map(record),
        finalIds = new Set(evidence.map((v) => text(v.id))),
        retainedIds = new Set<string>();
      for (const value of owned.capture.entries.EVIDENCE ?? []) {
        const e = record(value),
          id = text(e.id);
        if (finalIds.has(id)) {
          retainedIds.add(id);
          continue;
        }
        const transition = manifest.transitions === null ? null : record(manifest.transitions),
          decision = transition
            ? array(transition.supportDecisions)
                .map(record)
                .find((d) => d.evidenceId === id)
            : null;
        check(
          !transition || (decision && ['SUPERSEDE', 'INVALIDATE'].includes(text(decision.action))),
          'INVALID_CANDIDATE',
        );
        w.run('DELETE FROM provider_fact_bindings WHERE evidence_id=?', [id]);
        w.run('DELETE FROM fact_evidence WHERE evidence_id=?', [id]);
        const update = w.run("UPDATE evidence SET status=? WHERE id=? AND status='ACTIVE'", [
          decision?.action === 'INVALIDATE' ? 'INVALIDATED' : 'SUPERSEDED',
          id,
        ]);
        check(update.changes === 1);
      }
      // Facts are rebuilt from the independently checked selected target, never from winners alone.
      w.run('DELETE FROM unresolved_targets WHERE revision_id=?', [rev]);
      w.run('DELETE FROM canonical_edges WHERE revision_id=?', [rev]);
      w.run('DELETE FROM canonical_nodes WHERE revision_id=?', [rev]);
      for (const value of array(code.nodes)) {
        const n = record(value),
          c = record(n.confidence);
        w.insert('canonical_nodes', {
          revision_id: rev,
          id: text(n.id),
          repository_id: repo,
          fact_key: text(n.factKey),
          kind: text(n.kind),
          type_kind: n.kind === 'TYPE' ? text(n.typeKind) : null,
          symbol_kind: n.kind === 'SYMBOL' ? text(n.symbolKind) : null,
          name: text(n.name),
          qualified_name: n.qualifiedName === null ? null : text(n.qualifiedName),
          source_range_json: w.json(n.sourceRange),
          confidence_score: c.score as number,
          confidence_method: text(c.method),
          confidence_reasons_json: w.json(c.reasons),
        });
      }
      for (const value of array(code.edges)) {
        const e = record(value),
          c = record(e.confidence),
          target = record(e.target);
        w.insert('canonical_edges', {
          revision_id: rev,
          id: text(e.id),
          repository_id: repo,
          fact_key: text(e.factKey),
          kind: text(e.kind),
          source_node_id: text(record(e.source).id),
          target_state: text(target.state),
          resolution: text(target.resolution),
          target_node_id: target.state === 'RESOLVED' ? text(record(target.target).id) : null,
          source_range_json: w.json(e.sourceRange),
          confidence_score: c.score as number,
          confidence_method: text(c.method),
          confidence_reasons_json: w.json(c.reasons),
        });
        if (target.state === 'UNRESOLVED')
          w.insert('unresolved_targets', {
            revision_id: rev,
            edge_id: text(e.id),
            original_hint: text(target.originalHint),
            candidates_json: w.json(target.candidates),
          });
      }
      for (const e of evidence) {
        if (retainedIds.has(text(e.id))) continue;
        const p = record(e.providerFact);
        w.immutable(
          'evidence',
          {
            id: text(e.id),
            repository_id: repo,
            revision_id: rev,
            provider_snapshot_id: text(e.providerSnapshotId),
            fact_type: text(p.factType),
            provider_id: text(p.providerId),
            provider_fact_id: text(p.providerFactId),
            status: text(e.status),
          },
          ['id'],
        );
      }
      for (const value of array(code.factEvidence)) {
        const v = record(value),
          f = record(v.fact);
        if (!retainedIds.has(text(v.evidenceId)))
          w.insert('fact_evidence', {
            fact_type: text(f.factType),
            canonical_fact_id: text(f.id),
            evidence_id: text(v.evidenceId),
          });
      }
      for (const value of array(code.bindings)) {
        const v = record(value),
          p = record(v.providerFact),
          f = record(v.canonicalFact);
        if (!retainedIds.has(text(v.evidenceId)))
          w.insert('provider_fact_bindings', {
            fact_type: text(p.factType),
            provider_id: text(p.providerId),
            provider_fact_id: text(p.providerFactId),
            provider_snapshot_id: text(v.providerSnapshotId),
            canonical_fact_id: text(f.id),
            evidence_id: text(v.evidenceId),
          });
      }
      for (const value of array(code.candidates)) {
        const v = record(value);
        if (!retainedIds.has(text(v.evidenceId)))
          w.insert('active_support_candidates', {
            evidence_id: text(v.evidenceId),
            fact_type: text(v.factType),
            canonical_fact_id: text(v.canonicalFactId),
            candidate_json: w.json(v.candidate),
          });
      }
      for (const value of array(code.coverage)) {
        const v = record(value);
        if (!oldSnapshots.has(text(v.providerSnapshotId)))
          w.insert('analysis_coverage', {
            provider_snapshot_id: text(v.providerSnapshotId),
            capability_name: text(v.capabilityName),
            source_file_id: v.sourceFileId === null ? null : text(v.sourceFileId),
            status: text(v.status),
          });
      }
      for (const value of array(code.snapshots)) {
        const s = record(value);
        if (oldSnapshots.has(text(s.id))) continue;
        for (const [ordinal, value] of array(s.diagnostics).entries()) {
          const d = record(value);
          w.insert('analysis_diagnostics', {
            provider_snapshot_id: text(s.id),
            ordinal,
            code: text(d.code),
            severity: text(d.severity),
            message: text(d.message),
            source_range_json: w.json(d.sourceRange),
          });
        }
      }
      check(
        w.run(
          'UPDATE repository_state SET indexed_revision_id=?,indexed_content_fingerprint=? WHERE repository_id=?',
          [rev, text(basis.contentFingerprint), repo],
        ).changes === 1,
      );
      const rem = b.remaining(),
        actual = readCodeContextSnapshot(db, repo, rem, {
          schemaVersion: runtime ? 13 : 11,
          maxItems: rem.maxItems,
          maxDepth: rem.maxDepth,
        });
      b.add('rows', actual.consumed.rows);
      b.add('serializedBytes', actual.consumed.serializedBytes);
      b.add('items', actual.consumed.items);
      b.pin(actual.retainedLogicalBytes);
      check(isDeepStrictEqual(actual.view.activeBasis, basis), 'INVALID_CANDIDATE');
      w.run('DELETE FROM native_analysis_state WHERE repository_id=?', [repo]);
      for (const value of array(result.origins)) {
        const o = record(value);
        w.immutable(
          'syntax_origins',
          {
            id: text(o.id),
            repository_id: text(o.repository_id),
            revision_id: text(o.revision_id),
            origin_snapshot_id: text(o.origin_snapshot_id),
            origin_digest: text(o.origin_digest),
            origin_json: text(o.origin_json),
          },
          ['id'],
        );
      }
      for (const value of array(result.projections)) {
        const p = record(value);
        w.immutable(
          'syntax_projections',
          {
            id: text(p.id),
            repository_id: text(p.repository_id),
            origin_id: text(p.origin_id),
            projection_digest: text(p.projection_digest),
            envelope_json: text(p.envelope_json),
          },
          ['id'],
        );
      }
      w.immutable(
        'activation_history',
        {
          id: activationId,
          repository_id: repo,
          revision_id: rev,
          parent_id: manifest.parent === null ? null : text(record(manifest.parent).activationId),
          manifest_digest: activationId.slice('activation:'.length),
          manifest_json: w.json(manifest),
        },
        ['id'],
      );
      for (const value of array(result.members)) {
        const m = record(value);
        w.immutable(
          'activation_syntax_members',
          {
            activation_id: activationId,
            repository_id: repo,
            origin_id: text(m.originId),
            projection_id: text(m.projectionId),
          },
          ['activation_id', 'origin_id', 'projection_id'],
        );
      }
      w.run('DELETE FROM active_history_pointer WHERE repository_id=?', [repo]);
      w.insert('active_history_pointer', { repository_id: repo, activation_id: activationId });
      if (runtime) {
        receipt.runtimeActivationId = writeMixedRuntimeBatchLocked(
          db,
          repo,
          runtime.candidate,
          RepoBasisSchema.parse(basis),
          activationId,
          runtime.expectedOldRuntime,
          b,
          runtime.version,
        );
      }
      receipt.after = persistentImage(db, b);
      committing = true;
      receipt.status = 'COMMIT_OUTCOME_UNKNOWN';
      db.exec('COMMIT');
      transaction = false;
      committed = true;
      receipt.status = 'COMMITTED';
      owned.settle(true);
      try {
        owned.close();
      } catch {
        receipt.cleanupFailed = true;
      }
      return {
        syntaxActivationId: activationId,
        runtimeActivationId: receipt.runtimeActivationId ?? null,
      };
    } catch (error) {
      if (!committed && transaction && db.isOpen && db.isTransaction) {
        try {
          db.exec('ROLLBACK');
        } catch {
          committing = true;
          receipt.status = 'COMMIT_OUTCOME_UNKNOWN';
        }
      }
      if (!committed) {
        try {
          owned.settle(false);
        } catch {
          /* Qualification is already revoked. */
        }
      }
      if (committing && !committed) throw new MixedAnalysisError('COMMIT_OUTCOME_UNKNOWN');
      if (committed) {
        receipt.cleanupFailed = true;
        return {
          syntaxActivationId: text(owned.result.activationId),
          runtimeActivationId: receipt.runtimeActivationId ?? null,
        };
      }
      return safeFailure(error);
    }
  }
}

/** Local settlement observed by this Store only; never a fresh database recovery proof. */
export function readMixedAnalysisSettlement(store: MixedAnalysisStore) {
  const r = outcomes.get(store);
  return r
    ? Object.freeze({
        activationId: r.activationId,
        status: r.status,
        cleanupFailed: r.cleanupFailed,
      })
    : null;
}
