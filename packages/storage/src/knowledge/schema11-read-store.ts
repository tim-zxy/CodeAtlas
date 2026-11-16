import { consumeOwnedFreshnessCommand } from '../../../ir/dist/owned-freshness-contract.js';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import {
  parseKnowledgeItem,
  parseKnowledgeRevision,
  parseKnowledgeCandidate,
  supportKey,
  scopedRefKey,
  type Phase1ReferenceContext,
  type ScopedRef,
  type SupportRef,
  EntityIdSchema,
  type EntityId,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
} from '../../../ir/dist/compilation-input-contract.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';
import { prepareSchema11ReadReference, exactSchema11Read } from './schema11-reference.js';
import {
  publicationDigest,
  readOfflinePublicationCommand,
} from '../../../ir/dist/offline-publication-contract.js';
import {
  schema11PublicationReceipt,
  parseSchema11PublicationReceipt,
  schema11PublicationHeads,
} from './schema11-publication-receipt.js';

type Phase1Coverage = ReturnType<typeof parseKnowledgeCandidate>['payload']['coverage'];
type Ref = { itemId: string; revisionId: string };
export interface Schema11MetadataResponse {
  schema: 'codeatlas.published-knowledge-metadata';
  version: 2;
  mode: 'SCHEMA11_READ_CANDIDATE';
  workspaceId: string;
  records: {
    itemId: string;
    revisionId: string;
    type: string;
    runId: string;
    snapshotId: string;
    revisionSetId: string;
    evaluationId: string;
  }[];
  qualityAdmission: 'UNAVAILABLE';
  productionAccess: 'CLOSED';
}
export interface Schema11PublishedProjection {
  schema: 'codeatlas.published-knowledge-projection';
  version: 1;
  mode: 'SCHEMA11_READ_CANDIDATE';
  workspaceId: string;
  records: {
    itemEnvelope: ReturnType<typeof parseKnowledgeItem>;
    revisionEnvelope: ReturnType<typeof parseKnowledgeRevision>;
    referenceContext: Phase1ReferenceContext;
    provenance: { runId: string; snapshotId: string; revisionSetId: string; evaluationId: string };
    currentHeadRevisionId: string;
    evaluationStatus: 'NOT_EVALUABLE';
    knowledgeCoverage: null;
  }[];
  qualityAdmission: 'UNAVAILABLE';
  productionAccess: 'CLOSED';
}
export type Schema11CoveredProjection = Omit<Schema11PublishedProjection, 'version' | 'records'> & {
  version: 2;
  records: (Omit<Schema11PublishedProjection['records'][number], 'knowledgeCoverage'> & {
    knowledgeCoverage: Phase1Coverage;
    publicationId: string;
    candidateId: string;
  })[];
};
type ReadResult =
  Schema11MetadataResponse | Schema11PublishedProjection | Schema11CoveredProjection;
type AssertQuery = (
  manifest: Readonly<{
    workspaceId: string;
    selectedRefs: readonly Ref[];
    repositoryIds: readonly string[];
    fields: readonly string[];
  }>,
) => unknown;
function freezeData<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
/** Consume only references in already validated selected content/supports. */
function selectedContext(
  revision: ReturnType<typeof parseKnowledgeRevision>['payload'],
  context: Phase1ReferenceContext,
  workspaceId: EntityId,
): Phase1ReferenceContext {
  const entities = new Set<string>(),
    supports = new Set<string>();
  const pending: unknown[] = [revision.structuredContent, revision.supportRefs];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if ((v.scope === 'REPOSITORY' || v.scope === 'WORKSPACE') && v.entity)
      entities.add(scopedRefKey(value as ScopedRef));
    if (v.basis && v.entity && typeof v.valueDigest === 'string') {
      const ref = value as SupportRef;
      supports.add(supportKey(ref));
      entities.add(
        scopedRefKey(
          'repositoryId' in ref.basis
            ? { scope: 'REPOSITORY', repositoryId: ref.basis.repositoryId, entity: ref.entity }
            : { scope: 'WORKSPACE', workspaceId, entity: ref.entity },
        ),
      );
    }
    pending.push(...Object.values(value));
  }
  return {
    availableEntities: context.availableEntities.filter((r) => entities.has(scopedRefKey(r))),
    availableSupports: context.availableSupports.filter((r) => supports.has(supportKey(r))),
  };
}
export class Schema11ReadError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'Schema11ReadError';
  }
}
function need(v: unknown, code = 'READ11_INVALID'): asserts v {
  if (!v) throw new Schema11ReadError(code);
}
export function assertSchema11ItemScope(
  scope: {
    kind: string;
    workspaceId?: string;
    repositoryId?: string;
    repositoryIds?: readonly string[];
  },
  workspaceId: string,
  snapshotRepositoryIds: readonly string[],
): void {
  if (scope.kind === 'WORKSPACE') need(scope.workspaceId === workspaceId);
  else if (scope.kind === 'REPOSITORY')
    need(
      typeof scope.repositoryId === 'string' && snapshotRepositoryIds.includes(scope.repositoryId),
    );
  else
    need(
      scope.kind === 'CROSS_REPO' &&
        Array.isArray(scope.repositoryIds) &&
        scope.repositoryIds.every((id) => snapshotRepositoryIds.includes(id)),
    );
}
/** Private borrowed-connection self-owned reader; optional owned-test writer, no initializer or production issuer. */
export class Schema11ReadStore {
  #db: DatabaseSync;
  #workspace: EntityId;
  #marker;
  #blocked = false;
  constructor(
    db: DatabaseSync,
    workspaceId: string,
    private readonly ownedIssuer?: object,
  ) {
    need(db instanceof DatabaseSync && !types.isProxy(db) && db.isOpen);
    this.#db = db;
    this.#workspace = EntityIdSchema.parse(workspaceId);
    this.#marker = db.prepare('SELECT 1 WHERE 0');
  }
  readSelectedMetadata(
    selected: unknown,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ): Schema11MetadataResponse {
    return this.execute(selected, limits, control, assertQuery, false) as Schema11MetadataResponse;
  }
  /** Self-owned current-version projection only; no production or quality admission. */
  readSelectedProjection(
    selected: unknown,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ): Schema11PublishedProjection {
    return this.execute(
      selected,
      limits,
      control,
      assertQuery,
      true,
    ) as Schema11PublishedProjection;
  }
  /** Additive receipt-backed version; old metadata/projection responses stay unchanged. */
  readSelectedCoveredProjection(
    selected: unknown,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ): Schema11CoveredProjection {
    return this.execute(selected, limits, control, assertQuery, 2) as Schema11CoveredProjection;
  }
  /** Complete current workspace publication catalog; missing receipts refuse the entire read. */
  readCurrentCoveredProjection(
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ): Schema11CoveredProjection {
    return this.execute([], limits, control, assertQuery, 2, true) as Schema11CoveredProjection;
  }
  /** Exact selected publication and captured bases, from one SQLite view. */
  readOwnedFreshnessBasis(
    selected: unknown,
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ) {
    need(this.ownedIssuer, 'READ11_UNAVAILABLE');
    return this.readSelectedBasis(selected, limits, c, assertQuery, []);
  }
  /** Private self-owned Component input; original receipt IDs and captured digest, never an attempt ID. */
  readSelectedCapabilityInputs(
    selected: unknown,
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ): {
    knowledge: Schema11CoveredProjection;
    sourceInputs: { itemId: string; revisionId: string; capturedInputDigest: string }[];
  } {
    const { projection, snapshots } = this.readSelectedBasis(selected, limits, c, assertQuery, [
      'SNAPSHOT_INPUT_DIGEST',
    ]);
    need(
      projection.records.every(
        (r) =>
          r.itemEnvelope.payload.type === 'COMPONENT' &&
          r.itemEnvelope.payload.lifecycleState === 'ACTIVE',
      ),
      'READ11_COMPONENT_REQUIRED',
    );
    return freezeData({
      knowledge: projection,
      sourceInputs: projection.records.map((r) => ({
        itemId: r.itemEnvelope.payload.id,
        revisionId: r.revisionEnvelope.payload.id,
        capturedInputDigest: snapshots.find((s) => s.snapshotId === r.provenance.snapshotId)!
          .inputDigest,
      })),
    });
  }
  /** Exact selected publication and captured bases, from one SQLite view. */
  private readSelectedBasis(
    selected: unknown,
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    assertQuery: AssertQuery,
    extraFields: readonly string[],
  ) {
    need(!this.#blocked && this.#db.isOpen && !this.#db.isTransaction, 'READ11_UNAVAILABLE');
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    const sql = runtimeSql(this.#db, b);
    this.#db.exec('BEGIN');
    try {
      const projection = this.read(
        selected,
        limits,
        c,
        assertQuery,
        2,
        true,
        b,
        false,
        extraFields,
      ) as Schema11CoveredProjection;
      need(projection.records.length > 0, 'FRESHNESS_EMPTY_SELECTION');
      const snapshots = [...new Set(projection.records.map((r) => r.provenance.snapshotId))].map(
        (id) => {
          const rows = sql.read(
            'compilation_input_snapshots',
            ['payload_json'],
            'workspace_id=? AND id=?',
            [this.#workspace, id],
          );
          need(rows.length === 1);
          return parseCompilationInputSnapshot(JSON.parse(String(rows[0]!.payload_json)), c);
        },
      );
      const result = freezeData({ projection, snapshots });
      b.own(result);
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#blocked = true;
        throw new Schema11ReadError('FRESHNESS_CLEANUP_UNKNOWN', 'UNKNOWN');
      }
      throw error;
    }
  }
  /** Explicit owned-memory operation, never called by ordinary readonly tools. */
  reconcileOwnedFreshness(
    handle: object,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
  ) {
    need(
      this.ownedIssuer && !this.#blocked && this.#db.isOpen && !this.#db.isTransaction,
      'READ11_UNAVAILABLE',
    );
    const c = Object.freeze({ ...control });
    const command = consumeOwnedFreshnessCommand(this.ownedIssuer, handle, c);
    const json = (v: unknown) => canonicalCompilationJson(v, c);
    need(
      command.ruleVersion === 'owned-one-shot-freshness@1' &&
        command.workspaceId === this.#workspace &&
        command.selected.length > 0,
    );
    need(
      command.basisDigest ===
        publicationDigest('codeatlas.owned-freshness.basis.v1', command.snapshots, c),
      'FRESHNESS_BINDING_INVALID',
    );
    // Only anonymous in-memory main DB; no attached/persistent database is admitted.
    const databases = this.#db.prepare('PRAGMA database_list').all();
    need(
      databases.every((r) => r.file === '' && (r.name === 'main' || r.name === 'temp')),
      'FRESHNESS_MEMORY_ONLY',
    );
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    b.own(command);
    const sql = runtimeSql(this.#db, b);
    let committing = false;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.read(command.selected, limits, c, assertQuery, 2, true, b);
      need(json(current) === json(command.expectedProjection), 'FRESHNESS_CAS_CONFLICT');
      const projection = current as Schema11CoveredProjection;
      for (const record of projection.records) {
        const id = record.provenance.snapshotId;
        const rows = sql.read(
          'compilation_input_snapshots',
          ['payload_json'],
          'workspace_id=? AND id=?',
          [this.#workspace, id],
        );
        need(rows.length === 1);
        const expected = command.snapshots.find((v) => v.snapshotId === id);
        need(expected && rows[0]!.payload_json === json(expected), 'FRESHNESS_SNAPSHOT_CHANGED');
        const item = record.itemEnvelope.payload;
        need(item.lifecycleState === 'ACTIVE', 'FRESHNESS_NOT_ACTIVE');
        need(item.sourceFreshness === 'AFFECTED', 'FRESHNESS_NOT_AFFECTED');
        const updated = parseKnowledgeItem({
          ...record.itemEnvelope,
          payload: { ...item, sourceFreshness: 'FRESH' },
        });
        const effect = sql.run(
          'UPDATE knowledge_items SET source_freshness=?,payload_json=? WHERE workspace_id=? AND id=? AND published_revision_id=? AND source_freshness=? AND payload_json=?',
          [
            'FRESH',
            json(updated),
            this.#workspace,
            item.id,
            record.currentHeadRevisionId,
            'AFFECTED',
            json(record.itemEnvelope),
          ],
        );
        need(Number(effect.changes) === 1, 'FRESHNESS_CAS_CONFLICT');
      }
      const after = this.read(
        command.selected,
        limits,
        c,
        assertQuery,
        2,
        true,
        b,
      ) as Schema11CoveredProjection;
      need(after.records.every((r) => r.itemEnvelope.payload.sourceFreshness === 'FRESH'));
      json(after);
      committing = true;
      this.#db.exec('COMMIT');
      return Object.freeze({ commitState: 'COMMITTED' as const, cleanupState: 'SETTLED' as const });
    } catch (error) {
      if (committing && (!this.#db.isOpen || !this.#db.isTransaction)) {
        this.#blocked = true;
        throw new Schema11ReadError('FRESHNESS_COMMIT_UNKNOWN', 'UNKNOWN');
      }
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#blocked = true;
        throw new Schema11ReadError('FRESHNESS_CLEANUP_UNKNOWN', 'UNKNOWN');
      }
      throw error;
    }
  }
  /** Only an Application-issued owned-test command; never a production publication entry. */
  publishOwnedPrepared(handle: object, limits: HistoryReadLimits, control: RuntimeRequestControl) {
    need(
      this.ownedIssuer && !this.#blocked && this.#db.isOpen && !this.#db.isTransaction,
      'READ11_UNAVAILABLE',
    );
    const c = Object.freeze({ ...control });
    canonicalCompilationJson(null, c);
    this.#marker.setReadBigInts(false);
    const command = readOfflinePublicationCommand(this.ownedIssuer, handle);
    const receipt = schema11PublicationReceipt(command, c);
    need(receipt.workspaceId === this.#workspace);
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    b.own(receipt);
    const sql = runtimeSql(this.#db, b),
      json = (v: unknown) => canonicalCompilationJson(v, c);
    let committing = false;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      need(
        exactSchema11Read(sql) &&
          sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version === 11,
        'READ11_SCHEMA_UNSUPPORTED',
      );
      need(
        sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
        'READ11_FOREIGN_KEYS_REQUIRED',
      );
      const run = sql.read(
        'compilation_runs',
        ['state', 'snapshot_id', 'revision_set_id'],
        'workspace_id=? AND id=?',
        [this.#workspace, receipt.runId],
      );
      need(
        run.length === 1 &&
          run[0]!.state === 'READY' &&
          run[0]!.snapshot_id === receipt.snapshotId &&
          run[0]!.revision_set_id === receipt.revisionSetId,
        'READ11_RUN_NOT_READY',
      );
      need(
        sql.read('publication_runs', ['id'], 'workspace_id=? AND run_id=?', [
          this.#workspace,
          receipt.runId,
        ]).length === 0,
        'READ11_ALREADY_ATTEMPTED',
      );
      for (const entry of command.entries) {
        canonicalCompilationJson(null, c);
        const item = entry.record.itemEnvelope.payload,
          r = entry.record.revisionEnvelope.payload;
        const heads = sql.read(
          'knowledge_items',
          ['published_revision_id', 'type', 'scope_json'],
          'workspace_id=? AND id=?',
          [this.#workspace, item.id],
        );
        need(
          entry.operation === 'NEW'
            ? heads.length === 0
            : heads.length === 1 &&
                heads[0]!.published_revision_id === entry.expectedHead &&
                heads[0]!.type === item.type &&
                heads[0]!.scope_json === json(item.scope),
          'READ11_HEAD_CHANGED',
        );
        if (entry.operation === 'NEW')
          sql.insert('knowledge_items', {
            id: item.id,
            workspace_id: this.#workspace,
            type: item.type,
            scope_json: json(item.scope),
            importance: item.importance,
            lifecycle_state: 'DRAFT',
            published_revision_id: null,
            source_freshness: item.sourceFreshness,
            compilation_currency: item.compilationCurrency,
            payload_json: json({
              ...entry.record.itemEnvelope,
              payload: { ...item, lifecycleState: 'DRAFT', publishedRevisionId: null },
            }),
          });
        sql.insert('knowledge_revisions', {
          id: r.id,
          workspace_id: this.#workspace,
          item_id: item.id,
          previous_id: r.previousRevisionId,
          revision_set_id: r.revisionSetId,
          semantic_fingerprint: r.semanticFingerprint,
          presentation_fingerprint: r.presentationFingerprint,
          input_snapshot_id: r.inputSnapshotRef.id,
          compilation_run_id: r.compilationRunId,
          evaluation_id: r.evaluationRef.id,
          publication_state: r.publicationState,
          created_at_ms: Date.parse(r.createdAt),
          payload_json: json(entry.record.revisionEnvelope),
        });
        sql.insert('knowledge_revision_provenance', {
          workspace_id: this.#workspace,
          revision_id: r.id,
          run_id: receipt.runId,
          snapshot_id: receipt.snapshotId,
          evaluation_id: receipt.evaluationId,
          revision_set_id: receipt.revisionSetId,
        });
        need(
          sql.run(
            'UPDATE knowledge_items SET importance=?,lifecycle_state=?,published_revision_id=?,source_freshness=?,compilation_currency=?,payload_json=? WHERE workspace_id=? AND id=? AND published_revision_id IS ?',
            [
              item.importance,
              item.lifecycleState,
              r.id,
              item.sourceFreshness,
              item.compilationCurrency,
              json(entry.record.itemEnvelope),
              this.#workspace,
              item.id,
              entry.expectedHead,
            ],
          ).changes === 1,
          'READ11_HEAD_CHANGED',
        );
      }
      const heads = schema11PublicationHeads(command),
        committedAt = Date.now();
      sql.insert('publication_runs', {
        id: receipt.runId,
        workspace_id: this.#workspace,
        run_id: receipt.runId,
        snapshot_id: receipt.snapshotId,
        revision_set_id: receipt.revisionSetId,
        expected_heads_json: json(heads.expected),
        result_heads_json: json(heads.result),
        committed_at_ms: committedAt,
        receipt_json: json(receipt),
      });
      need(
        sql.run(
          "UPDATE compilation_runs SET state='PUBLISHED',finished_at_ms=? WHERE workspace_id=? AND id=? AND state='READY'",
          [committedAt, this.#workspace, receipt.runId],
        ).changes === 1,
      );
      // Reuse the full reader validation inside this same transaction before COMMIT.
      this.read(
        command.entries.map((e) => ({
          itemId: e.record.itemEnvelope.payload.id,
          revisionId: e.record.revisionEnvelope.payload.id,
        })),
        limits,
        c,
        () => {},
        2,
        true,
        b,
      );
      canonicalCompilationJson(null, c);
      this.#marker.setReadBigInts(false);
      committing = true;
      this.#db.exec('COMMIT');
      return Object.freeze({
        status: 'COMMITTED' as const,
        cleanupState: 'SETTLED' as const,
        publicationId: receipt.runId,
        qualityAdmission: 'UNAVAILABLE' as const,
        productionAccess: 'CLOSED' as const,
      });
    } catch (error) {
      if (committing && (!this.#db.isOpen || !this.#db.isTransaction)) {
        this.#blocked = true;
        throw new Schema11ReadError('READ11_COMMIT_OUTCOME_UNKNOWN', 'UNKNOWN');
      }
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#blocked = true;
        throw new Schema11ReadError('READ11_CLEANUP_UNKNOWN', 'UNKNOWN');
      }
      if (!this.#db.isOpen) {
        this.#blocked = true;
        throw new Schema11ReadError('READ11_OWNER_UNSETTLED', 'UNKNOWN');
      }
      if (error instanceof Schema11ReadError) throw error;
      throw new Schema11ReadError('READ11_PUBLICATION_REFUSED');
    }
  }
  private execute(
    selected: unknown,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
    project: boolean | 2,
    allCurrent = false,
  ): ReadResult {
    try {
      return this.read(
        selected,
        limits,
        control,
        assertQuery,
        project,
        false,
        undefined,
        allCurrent,
      );
    } catch (error) {
      if (error instanceof Schema11ReadError) throw error;
      const code =
        error && typeof error === 'object' && !types.isProxy(error)
          ? Object.getOwnPropertyDescriptor(error, 'code')?.value
          : null;
      throw new Schema11ReadError(
        ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED'].includes(code)
          ? code
          : 'READ11_UNAVAILABLE',
      );
    }
  }
  private read(
    selected: unknown,
    limits: HistoryReadLimits,
    control: RuntimeRequestControl,
    assertQuery: AssertQuery,
    project: boolean | 2,
    insideWrite = false,
    sharedBudget?: HistoryReadBudget,
    allCurrent = false,
    extraFields: readonly string[] = [],
  ): ReadResult {
    if (this.#blocked) throw new Schema11ReadError('READ11_OWNER_UNSETTLED', 'UNKNOWN');
    need(this.#db.isOpen && this.#db.isTransaction === insideWrite, 'READ11_UNAVAILABLE');
    canonicalCompilationJson(null, control);
    const c = Object.freeze({ ...control }),
      b = sharedBudget ?? new HistoryReadBudget(checkedHistoryLimits(limits)),
      sql = runtimeSql(this.#db, b);
    const json = (v: unknown) => canonicalCompilationJson(v, c);
    const copied = JSON.parse(json(selected));
    need(Array.isArray(copied) && (allCurrent || copied.length > 0) && copied.length <= c.maxItems);
    let refs: Ref[] = copied.map((r: Record<string, unknown>) => {
      need(r && Object.keys(r).sort().join(',') === 'itemId,revisionId');
      return Object.freeze({
        itemId: EntityIdSchema.parse(r.itemId),
        revisionId: EntityIdSchema.parse(r.revisionId),
      });
    });
    need(new Set(refs.map((r) => json(r))).size === refs.length);
    refs.sort((a, z) =>
      a.itemId < z.itemId
        ? -1
        : a.itemId > z.itemId
          ? 1
          : a.revisionId < z.revisionId
            ? -1
            : a.revisionId > z.revisionId
              ? 1
              : 0,
    );
    Object.freeze(refs);
    need(typeof assertQuery === 'function' && !types.isProxy(assertQuery));
    const repositories = new Set<string>();
    let transactionStarted = insideWrite;
    const checkpoint = () => {
      canonicalCompilationJson(null, c);
      this.#marker.setReadBigInts(false);
      const manifest = Object.freeze({
        workspaceId: this.#workspace,
        selectedRefs: refs,
        repositoryIds: Object.freeze([...repositories].sort()),
        fields: Object.freeze([
          'PUBLISHED_IDS',
          ...extraFields,
          ...(allCurrent ? ['CURRENT_PUBLISHED_CATALOG'] : []),
          'PROVENANCE_IDS',
          'KNOWLEDGE_PAYLOAD_VALIDATION',
          'SNAPSHOT_PAYLOAD_VALIDATION',
          'CAPTURED_SUPPORT_VALUES',
          'EVALUATION_REPORT',
          ...(project === 2
            ? ['PUBLICATION_RECEIPT_VALIDATION', 'KNOWLEDGE_COVERAGE_DELIVERY']
            : []),
          ...(project
            ? [
                'PUBLISHED_ITEM_DELIVERY',
                'PUBLISHED_REVISION_DELIVERY',
                'REFERENCE_METADATA_DELIVERY',
              ]
            : []),
        ]),
      });
      let accepted = false;
      try {
        const receipt = assertQuery(manifest);
        if (types.isPromise(receipt) && !types.isProxy(receipt))
          void Promise.prototype.then.call(receipt, undefined, () => undefined);
        accepted = receipt === undefined;
      } catch {
        accepted = false;
      } finally {
        if (!this.#db.isOpen || this.#db.isTransaction !== transactionStarted) {
          this.#blocked = true;
          throw new Schema11ReadError('READ11_OWNER_UNSETTLED', 'UNKNOWN');
        }
      }
      need(accepted, 'READ11_PERMISSION_DENIED');
      canonicalCompilationJson(null, c);
    };
    const one = (table: string, columns: string[], where: string, args: string[]) => {
      const rows = sql.read(table, columns, where, args);
      need(rows.length === 1, 'READ11_ASSOCIATION_MISSING');
      return rows[0]!;
    };
    const parsed = (raw: unknown) => {
      need(typeof raw === 'string');
      const value = JSON.parse(raw);
      need(json(value) === raw);
      b.own(value);
      return value;
    };
    checkpoint();
    if (!insideWrite) this.#db.exec('BEGIN');
    transactionStarted = true;
    try {
      need(
        sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version === 11 &&
          exactSchema11Read(sql),
        'READ11_SCHEMA_UNSUPPORTED',
      );
      need(
        sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
        'READ11_FOREIGN_KEYS_REQUIRED',
      );
      need(
        sql.read('pragma_foreign_key_check', ['table', 'rowid', 'parent', 'fkid'], '1', [])
          .length === 0,
        'READ11_BROKEN_ASSOCIATION',
      );
      one('workspace', ['id'], 'id=?', [this.#workspace]);
      if (allCurrent) {
        const heads = sql.read(
          'knowledge_items',
          ['id', 'published_revision_id'],
          'workspace_id=? AND published_revision_id IS NOT NULL',
          [this.#workspace],
        );
        need(heads.length <= c.maxItems);
        refs = heads
          .map((h) =>
            Object.freeze({
              itemId: EntityIdSchema.parse(h.id),
              revisionId: EntityIdSchema.parse(h.published_revision_id),
            }),
          )
          .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
        Object.freeze(refs);
        checkpoint();
      }
      const records: Schema11MetadataResponse['records'] = [];
      const projections: (
        | Schema11PublishedProjection['records'][number]
        | Schema11CoveredProjection['records'][number]
      )[] = [];
      for (const ref of refs) {
        checkpoint();
        const item = one(
          'knowledge_items',
          [
            'id',
            'type',
            'scope_json',
            'importance',
            'lifecycle_state',
            'published_revision_id',
            'source_freshness',
            'compilation_currency',
            'payload_json',
          ],
          'workspace_id=? AND id=?',
          [this.#workspace, ref.itemId],
        );
        need(item.published_revision_id === ref.revisionId, 'READ11_REVISION_MISMATCH');
        const r = one(
          'knowledge_revisions',
          [
            'id',
            'item_id',
            'previous_id',
            'revision_set_id',
            'semantic_fingerprint',
            'presentation_fingerprint',
            'input_snapshot_id',
            'compilation_run_id',
            'evaluation_id',
            'publication_state',
            'created_at_ms',
            'payload_json',
          ],
          'workspace_id=? AND id=?',
          [this.#workspace, ref.revisionId],
        );
        need(r.item_id === ref.itemId && r.publication_state === 'PUBLISHED');
        const ids = [this.#workspace, ref.revisionId] as string[];
        const provenance = one(
          'knowledge_revision_provenance',
          ['run_id', 'snapshot_id', 'revision_set_id', 'evaluation_id'],
          'workspace_id=? AND revision_id=?',
          ids,
        );
        need(
          provenance.run_id === r.compilation_run_id &&
            provenance.snapshot_id === r.input_snapshot_id &&
            provenance.revision_set_id === r.revision_set_id &&
            provenance.evaluation_id === r.evaluation_id,
        );
        const runId = String(r.compilation_run_id),
          snapshotId = String(r.input_snapshot_id),
          setId = String(r.revision_set_id),
          evaluationId = String(r.evaluation_id);
        const run = one(
          'compilation_runs',
          ['state', 'snapshot_id', 'revision_set_id'],
          'workspace_id=? AND id=?',
          [this.#workspace, runId],
        );
        need(
          run.state === 'PUBLISHED' &&
            run.snapshot_id === snapshotId &&
            run.revision_set_id === setId,
        );
        need(
          one('revision_sets', ['frozen'], 'workspace_id=? AND id=?', [this.#workspace, setId])
            .frozen === 1,
        );
        const pins = sql.read(
          'revision_set_items',
          ['repository_id', 'revision_id', 'revision_fingerprint'],
          'revision_set_id=?',
          [setId],
        );
        for (const pin of pins) {
          one('repositories', ['repository_id'], 'workspace_id=? AND repository_id=?', [
            this.#workspace,
            String(pin.repository_id),
          ]);
          repositories.add(String(pin.repository_id));
        }
        checkpoint();
        const sr = one(
          'compilation_input_snapshots',
          [
            'schema_version',
            'revision_set_id',
            'input_digest',
            'capture_started_at_ms',
            'capture_completed_at_ms',
            'payload_json',
          ],
          'workspace_id=? AND id=?',
          [this.#workspace, snapshotId],
        );
        const snapshot = parseCompilationInputSnapshot(parsed(sr.payload_json), c);
        b.own(snapshot);
        need(
          snapshot.snapshotId === snapshotId &&
            snapshot.workspaceId === this.#workspace &&
            snapshot.revisionSetId === setId &&
            sr.schema_version === 1 &&
            sr.revision_set_id === setId &&
            sr.input_digest === snapshot.inputDigest &&
            sr.capture_started_at_ms === Date.parse(snapshot.captureWindow.startedAt) &&
            sr.capture_completed_at_ms === Date.parse(snapshot.captureWindow.completedAt),
        );
        need(pins.length === snapshot.repositories.length);
        for (const repo of snapshot.repositories)
          need(
            pins.some(
              (pin) =>
                pin.repository_id === repo.repoBasis.repositoryId &&
                pin.revision_id === repo.repoBasis.revisionId &&
                pin.revision_fingerprint === repo.repoBasis.contentFingerprint,
            ),
          );
        const inventories = [
          ...snapshot.repositories,
          ...snapshot.documents,
          ...(snapshot.workspaceCapture ? [snapshot.workspaceCapture] : []),
        ];
        const supports = inventories.flatMap((i) => i.supports);
        const rows = sql.read(
          'snapshot_supports',
          [
            'support_key',
            'basis_key',
            'entity_key',
            'support_value_digest',
            'captured_value_digest',
            'value_schema_ref',
            'payload_json',
          ],
          'workspace_id=? AND snapshot_id=?',
          [this.#workspace, snapshotId],
        );
        need(rows.length === supports.length);
        for (const support of supports) {
          const row = rows.find((x) => x.support_key === supportKey(support.ref));
          need(
            row &&
              row.basis_key === json(support.ref.basis) &&
              row.entity_key === json(support.ref.entity) &&
              row.support_value_digest === support.ref.valueDigest &&
              row.captured_value_digest === support.capturedValueDigest &&
              row.value_schema_ref === support.valueSchemaRef &&
              row.payload_json === json(support),
          );
        }
        const context: Phase1ReferenceContext = {
          availableEntities: [
            ...new Map(
              [
                ...inventories.flatMap((i) => i.entities.map((e) => e.ref)),
                ...supports.map((s) =>
                  'repositoryId' in s.ref.basis
                    ? {
                        scope: 'REPOSITORY' as const,
                        repositoryId: s.ref.basis.repositoryId,
                        entity: s.ref.entity,
                      }
                    : {
                        scope: 'WORKSPACE' as const,
                        workspaceId: this.#workspace,
                        entity: s.ref.entity,
                      },
                ),
              ].map((ref) => [scopedRefKey(ref), ref]),
            ).values(),
          ],
          availableSupports: supports.map((s) => s.ref),
        };
        const itemEnvelope = parseKnowledgeItem(parsed(item.payload_json));
        const revisionEnvelope = parseKnowledgeRevision(parsed(r.payload_json), context);
        const itemPayload = itemEnvelope.payload,
          revision = revisionEnvelope.payload;
        need(
          itemPayload.id === ref.itemId &&
            itemPayload.publishedRevisionId === ref.revisionId &&
            itemPayload.type === item.type &&
            json(itemPayload.scope) === item.scope_json &&
            itemPayload.importance === item.importance &&
            itemPayload.lifecycleState === item.lifecycle_state &&
            itemPayload.sourceFreshness === item.source_freshness &&
            itemPayload.compilationCurrency === item.compilation_currency,
        );
        assertSchema11ItemScope(
          itemPayload.scope,
          this.#workspace,
          pins.map((pin) => String(pin.repository_id)),
        );
        need(
          revision.id === ref.revisionId &&
            revision.itemId === ref.itemId &&
            revision.previousRevisionId === r.previous_id &&
            revision.revisionSetId === setId &&
            revision.inputSnapshotRef.id === snapshotId &&
            revision.compilationRunId === runId &&
            revision.evaluationRef.id === evaluationId &&
            revision.publicationState === 'PUBLISHED' &&
            revision.structuredContent.kind === itemPayload.type &&
            revision.semanticFingerprint === r.semantic_fingerprint &&
            revision.presentationFingerprint === r.presentation_fingerprint &&
            Date.parse(revision.createdAt) === r.created_at_ms,
        );
        const evaluation = one(
          'evaluation_runs',
          [
            'run_id',
            'snapshot_id',
            'revision_set_id',
            'report_schema',
            'report_version',
            'basis_digest',
            'status',
            'report_json',
          ],
          'workspace_id=? AND id=?',
          [this.#workspace, evaluationId],
        );
        need(
          evaluation.run_id === runId &&
            evaluation.snapshot_id === snapshotId &&
            evaluation.revision_set_id === setId &&
            evaluation.basis_digest === snapshot.inputDigest,
        );
        const report = parsed(evaluation.report_json);
        need(
          evaluation.report_schema === 'codeatlas.offline-evaluation-record' &&
            evaluation.report_version === 1 &&
            evaluation.status === 'NOT_EVALUABLE',
          'READ11_QUALITY_FORMAT_UNAVAILABLE',
        );
        need(
          Object.keys(report).sort().join(',') ===
            [
              'schemaVersion',
              'evaluationId',
              'workspaceId',
              'runId',
              'snapshotId',
              'revisionSetId',
              'inputDigest',
              'snapshotDigest',
              'candidateDigest',
              'ruleRef',
              'executionKind',
              'structuralResult',
              'quality',
              'publication',
            ]
              .sort()
              .join(','),
        );
        need(
          report.snapshotDigest ===
            createHash('sha256')
              .update('codeatlas.offline-evaluation.snapshot.v1\0' + json(snapshot))
              .digest('hex') &&
            typeof report.candidateDigest === 'string' &&
            /^[0-9a-f]{64}$/.test(report.candidateDigest) &&
            report.ruleRef === 'offline-candidate-structure-v1' &&
            report.executionKind === 'PURE_CONTRACT' &&
            report.structuralResult === 'VALID',
        );
        need(
          report.schemaVersion === 1 &&
            report.evaluationId === evaluationId &&
            report.workspaceId === this.#workspace &&
            report.runId === runId &&
            report.snapshotId === snapshotId &&
            report.revisionSetId === setId &&
            report.inputDigest === snapshot.inputDigest &&
            report.quality === 'NOT_EVALUABLE' &&
            report.publication === 'NOT_AUTHORIZED',
        );
        let covered:
          | { knowledgeCoverage: Phase1Coverage; publicationId: string; candidateId: string }
          | undefined;
        if (project === 2) {
          const publication = one(
            'publication_runs',
            [
              'id',
              'snapshot_id',
              'revision_set_id',
              'expected_heads_json',
              'result_heads_json',
              'committed_at_ms',
              'receipt_json',
            ],
            'workspace_id=? AND run_id=?',
            [this.#workspace, runId],
          );
          const receipt = parseSchema11PublicationReceipt(parsed(publication.receipt_json), c);
          b.own(receipt);
          const command = receipt.command,
            heads = schema11PublicationHeads(command);
          need(
            receipt.workspaceId === this.#workspace &&
              receipt.runId === runId &&
              receipt.snapshotId === snapshotId &&
              receipt.revisionSetId === setId &&
              receipt.evaluationId === evaluationId &&
              receipt.inputDigest === snapshot.inputDigest &&
              receipt.candidateSetDigest === report.candidateDigest,
          );
          need(
            publication.snapshot_id === snapshotId &&
              publication.revision_set_id === setId &&
              publication.expected_heads_json === json(heads.expected) &&
              publication.result_heads_json === json(heads.result),
          );
          need(
            json(command.request.snapshot) === json(snapshot) &&
              json(command.request.evaluation) === json(report),
          );
          for (const entry of command.entries) {
            const mapped = entry.record.revisionEnvelope.payload;
            const actual = one(
              'knowledge_revisions',
              ['item_id', 'payload_json'],
              'workspace_id=? AND id=?',
              [this.#workspace, mapped.id],
            );
            need(
              actual.item_id === entry.record.itemEnvelope.payload.id &&
                actual.payload_json === json(entry.record.revisionEnvelope),
            );
            const association = one(
              'knowledge_revision_provenance',
              ['run_id', 'snapshot_id', 'revision_set_id', 'evaluation_id'],
              'workspace_id=? AND revision_id=?',
              [this.#workspace, mapped.id],
            );
            need(
              association.run_id === runId &&
                association.snapshot_id === snapshotId &&
                association.revision_set_id === setId &&
                association.evaluation_id === evaluationId,
            );
          }
          const entry = command.entries.find(
            (e) =>
              e.record.itemEnvelope.payload.id === ref.itemId &&
              e.record.revisionEnvelope.payload.id === ref.revisionId,
          );
          need(entry);
          const candidate = command.request.candidates.find(
            (v) => (v as { payload: { id: string } }).payload.id === entry.candidateId,
          ) as { payload: { coverage: Phase1Coverage } } | undefined;
          need(candidate);
          covered = {
            knowledgeCoverage: candidate.payload.coverage,
            publicationId: String(publication.id),
            candidateId: entry.candidateId,
          };
        }
        if (project) {
          const base = {
            itemEnvelope,
            revisionEnvelope,
            referenceContext: selectedContext(revision, context, this.#workspace),
            provenance: { runId, snapshotId, revisionSetId: setId, evaluationId },
            currentHeadRevisionId: ref.revisionId,
            evaluationStatus: 'NOT_EVALUABLE' as const,
          };
          projections.push(
            freezeData(covered ? { ...base, ...covered } : { ...base, knowledgeCoverage: null }),
          );
        } else
          records.push(
            Object.freeze({
              itemId: ref.itemId,
              revisionId: ref.revisionId,
              type: itemPayload.type,
              runId,
              snapshotId,
              revisionSetId: setId,
              evaluationId,
            }),
          );
      }
      checkpoint();
      const result = project
        ? freezeData({
            schema: 'codeatlas.published-knowledge-projection' as const,
            version: project === 2 ? (2 as const) : (1 as const),
            mode: 'SCHEMA11_READ_CANDIDATE' as const,
            workspaceId: this.#workspace,
            records: projections,
            qualityAdmission: 'UNAVAILABLE' as const,
            productionAccess: 'CLOSED' as const,
          })
        : Object.freeze({
            schema: 'codeatlas.published-knowledge-metadata',
            version: 2,
            mode: 'SCHEMA11_READ_CANDIDATE',
            workspaceId: this.#workspace,
            records: Object.freeze(records) as unknown as typeof records,
            qualityAdmission: 'UNAVAILABLE',
            productionAccess: 'CLOSED',
          });
      b.own(result);
      checkpoint();
      if (!insideWrite) this.#db.exec('COMMIT');
      return result as ReadResult;
    } catch (error) {
      try {
        if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      } catch {
        this.#blocked = true;
        throw new Schema11ReadError('READ11_CLEANUP_UNKNOWN', 'UNKNOWN');
      }
      if (error instanceof Schema11ReadError) throw error;
      throw new Schema11ReadError('READ11_UNAVAILABLE');
    }
  }
}
export async function openSchema11ReadStore(
  db: DatabaseSync,
  workspaceId: string,
): Promise<Schema11ReadStore> {
  await prepareSchema11ReadReference();
  return new Schema11ReadStore(db, workspaceId);
}

/** Private self-owned writer factory. No migrations or production authority are issued. */
export async function openSchema11OwnedPublicationStore(
  db: DatabaseSync,
  workspaceId: string,
  issuerIdentity: object,
): Promise<Schema11ReadStore> {
  await prepareSchema11ReadReference();
  return new Schema11ReadStore(db, workspaceId, issuerIdentity);
}
