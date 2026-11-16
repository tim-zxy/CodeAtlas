import { Schema11ReadStore } from './schema11-read-store.js';
import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import { Phase1KnowledgeTypeSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';
import { publicationDigest } from '../../../ir/dist/offline-publication-contract.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';
import {
  OfflinePublicationStore,
  type OfflineSearchManifest,
  type OfflineSearchRecord,
  type OfflineSearchEvidence,
} from './offline-publication-store.js';
export class OfflineKnowledgeSearchError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'OfflineKnowledgeSearchError';
  }
}
const fail = (code = 'INDEX_UNAVAILABLE'): never => {
  throw new OfflineKnowledgeSearchError(code);
};
function check(v: unknown, code?: string): asserts v {
  if (!v) fail(code);
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
function safe(error: unknown): never {
  const code =
    error && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptor(error, 'code')?.value
      : null;
  if (code === 'SEARCH_PERMISSION_DENIED' || code === 'READ11_PERMISSION_DENIED') {
    const unknown =
      error &&
      typeof error === 'object' &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN';
    throw new OfflineKnowledgeSearchError('PERMISSION_DENIED', unknown ? 'UNKNOWN' : 'SETTLED');
  }
  if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED'].includes(code))
    fail(code);
  if (error instanceof OfflineKnowledgeSearchError) throw error;
  const cleanup =
    error && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value
      : null;
  if (cleanup === 'UNKNOWN') throw new OfflineKnowledgeSearchError('INDEX_UNAVAILABLE', 'UNKNOWN');
  return fail();
}
export type OfflineSearchPermissions = {
  kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY';
  check(manifest: OfflineSearchManifest): undefined;
};
export type ReceiptSearchManifest = Omit<OfflineSearchManifest, 'evidenceKind'> & {
  evidenceKind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY';
};
export type ReceiptSearchPermissions = {
  kind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY';
  check: (manifest: ReceiptSearchManifest) => undefined;
};
type ReceiptSearchRecord = Omit<OfflineSearchRecord, 'evidence'> & {
  evidence: Omit<OfflineSearchEvidence, 'provenance'> & {
    provenance: {
      kind: 'SCHEMA11_RECEIPT';
      version: 1;
      publicationId: string;
      candidateId: string;
      runId: string;
      snapshotId: string;
      revisionSetId: string;
      evaluationId: string;
    };
  };
};
type SearchRecord = OfflineSearchRecord | ReceiptSearchRecord;
type IndexState = {
  db: DatabaseSync;
  workspaceId: string;
  headDigest: string;
  contentDigest: string;
  records: Map<string, SearchRecord>;
};
/** Derived private lexical experiment; not production Query, authority or secret clearance. */
export class OfflineKnowledgeSearchIndex {
  #state: IndexState | null = null;
  #unsettled = false;
  #source: OfflinePublicationStore | Schema11ReadStore;
  #receipt: boolean;
  #check: (manifest: OfflineSearchManifest | ReceiptSearchManifest) => undefined;
  constructor(
    source: OfflinePublicationStore | Schema11ReadStore,
    permissions: OfflineSearchPermissions | ReceiptSearchPermissions,
  ) {
    check(
      (source instanceof OfflinePublicationStore || source instanceof Schema11ReadStore) &&
        !types.isProxy(source),
    );
    this.#receipt = source instanceof Schema11ReadStore;
    check(permissions && typeof permissions === 'object' && !types.isProxy(permissions));
    const d = Object.getOwnPropertyDescriptors(permissions);
    check(
      d.kind &&
        'value' in d.kind &&
        d.kind.value ===
          (this.#receipt
            ? 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY'
            : 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY') &&
        d.check &&
        'value' in d.check &&
        typeof d.check.value === 'function' &&
        !types.isProxy(d.check.value) &&
        !types.isAsyncFunction(d.check.value),
    );
    this.#source = source;
    this.#check = d.check.value.bind(permissions) as (
      manifest: OfflineSearchManifest | ReceiptSearchManifest,
    ) => undefined;
  }
  private failed(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      !types.isProxy(error) &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN'
    )
      this.#unsettled = true;
    return safe(error);
  }
  private projection(
    limits: HistoryReadLimits,
    c: RuntimeRequestControl,
    metadataOnly = false,
    withEvidence = false,
  ) {
    if (this.#source instanceof Schema11ReadStore) {
      const value = Schema11ReadStore.prototype.readCurrentCoveredProjection.call(
        this.#source,
        limits,
        c,
        (m) =>
          this.#check({
            workspaceId: m.workspaceId,
            heads: m.selectedRefs.map((r) => ({ ...r })),
            fields: m.fields,
            evidenceKind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY',
          }),
      );
      const records: ReceiptSearchRecord[] = value.records.map((r) => {
        const item = r.itemEnvelope.payload,
          rev = r.revisionEnvelope.payload,
          content = rev.structuredContent as { title?: unknown; summary?: unknown; goal?: unknown };
        check(item.lifecycleState === 'ACTIVE');
        return {
          type: item.type,
          itemId: item.id,
          revisionId: rev.id,
          scopeJson: canonicalCompilationJson(item.scope, c),
          sourceFreshness: item.sourceFreshness,
          compilationCurrency: item.compilationCurrency,
          title: typeof content.title === 'string' ? content.title : '',
          summary: typeof content.summary === 'string' ? content.summary : '',
          goal: typeof content.goal === 'string' ? content.goal : '',
          evidence: {
            supportScopeRefs: r.referenceContext.availableEntities,
            coverage: r.knowledgeCoverage,
            supportRefs: rev.supportRefs,
            provenance: {
              kind: 'SCHEMA11_RECEIPT',
              version: 1,
              publicationId: r.publicationId,
              candidateId: r.candidateId,
              ...r.provenance,
            },
          },
        };
      });
      const heads = records.map((r) => ({ itemId: r.itemId, revisionId: r.revisionId }));
      return {
        kind: 'SCHEMA11_RECEIPT' as const,
        manifest: {
          workspaceId: value.workspaceId,
          heads,
          fields: ['CURRENT_PUBLISHED_CATALOG', 'PUBLICATION_RECEIPT_VALIDATION'],
          evidenceKind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY' as const,
        },
        headDigest: publicationDigest(
          'codeatlas.offline-search.heads.v1',
          { workspaceId: value.workspaceId, heads },
          c,
        ),
        records,
      };
    }
    return OfflinePublicationStore.prototype.readSearchProjection.call(
      this.#source,
      this.#check,
      limits,
      c,
      metadataOnly,
      withEvidence,
    );
  }
  rebuild(limitsValue: HistoryReadLimits, control: RuntimeRequestControl) {
    if (this.#unsettled) throw new OfflineKnowledgeSearchError('INDEX_UNAVAILABLE', 'UNKNOWN');
    const c = ownControl(control),
      limits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limitsValue, c)));
    let fresh: DatabaseSync | null = null;
    try {
      const projection = this.projection(limits, c);
      fresh = new DatabaseSync(':memory:');
      fresh.exec(
        "CREATE VIRTUAL TABLE lexical USING fts5(item_id UNINDEXED,revision_id UNINDEXED,item_type UNINDEXED,title,summary,goal,tokenize='unicode61')",
      );
      const b = new HistoryReadBudget(limits),
        sql = runtimeSql(fresh, b);
      fresh.exec('BEGIN');
      for (const row of projection.records) {
        canonicalCompilationJson(row, c);
        sql.insert('lexical', {
          item_type: row.type,
          item_id: row.itemId,
          revision_id: row.revisionId,
          title: row.title,
          summary: row.summary,
          goal: row.goal,
        });
      }
      fresh.exec('COMMIT');
      fresh.exec('PRAGMA query_only=ON');
      const after = this.projection(limits, c);
      check(
        after.headDigest === projection.headDigest &&
          canonicalCompilationJson(after.records, c) ===
            canonicalCompilationJson(projection.records, c),
      );
      const contentDigest = publicationDigest(
          'codeatlas.offline-search.text.v2',
          projection.records.map((r) => ({
            type: r.type,
            itemId: r.itemId,
            revisionId: r.revisionId,
            title: r.title,
            summary: r.summary,
            goal: r.goal,
          })),
          c,
        ),
        value: IndexState = {
          db: fresh,
          workspaceId: projection.manifest.workspaceId,
          headDigest: projection.headDigest,
          contentDigest,
          records: new Map(projection.records.map((r) => [r.itemId, r])),
        };
      if (this.#state) this.#state.db.close();
      this.#state = value;
      fresh = null;
      return Object.freeze({
        kind: this.#receipt ? ('SCHEMA11_RECEIPT' as const) : ('OWNED_TEST_PUBLICATION' as const),
        workspaceId: value.workspaceId,
        headDigest: value.headDigest,
        contentDigest,
        items: value.records.size,
        productionQuery: 'NOT_AUTHORIZED' as const,
      });
    } catch (error) {
      if (fresh?.isOpen) fresh.close();
      return this.failed(error);
    }
  }
  search(input: unknown, limitsValue: HistoryReadLimits, control: RuntimeRequestControl) {
    return this.searchInternal(input, limitsValue, control, false);
  }
  searchPage(input: unknown, limitsValue: HistoryReadLimits, control: RuntimeRequestControl) {
    return this.searchInternal(input, limitsValue, control, true);
  }
  private searchInternal(
    input: unknown,
    limitsValue: HistoryReadLimits,
    control: RuntimeRequestControl,
    page: boolean,
  ) {
    if (this.#unsettled) throw new OfflineKnowledgeSearchError('INDEX_UNAVAILABLE', 'UNKNOWN');
    const c = ownControl(control),
      limits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limitsValue, c)));
    try {
      const request = JSON.parse(canonicalCompilationJson(input, c));
      check(
        request &&
          Object.keys(request).sort().join(',') ===
            (page ? 'maxResults,text,types' : 'maxResults,text') &&
          typeof request.text === 'string' &&
          request.text.trim().length > 0 &&
          Number.isSafeInteger(request.maxResults) &&
          request.maxResults > 0 &&
          request.maxResults <= limits.maxRows,
        'QUERY_INVALID',
      );
      let filterTypes: string[] = [];
      if (page && request.types !== null) {
        check(Array.isArray(request.types) && request.types.length > 0, 'QUERY_INVALID');
        filterTypes = request.types.map((v: unknown) => {
          const p = Phase1KnowledgeTypeSchema.safeParse(v);
          check(p.success, 'QUERY_INVALID');
          return p.data!;
        });
        check(new Set(filterTypes).size === filterTypes.length, 'QUERY_INVALID');
      }
      const state = this.#state;
      check(state && state.db.isOpen);
      const before = this.projection(limits, c, false, page);
      check(this.#state === state && before.headDigest === state.headDigest);
      const currentDigest = publicationDigest(
        'codeatlas.offline-search.text.v2',
        before.records.map((r) => ({
          type: r.type,
          itemId: r.itemId,
          revisionId: r.revisionId,
          title: r.title,
          summary: r.summary,
          goal: r.goal,
        })),
        c,
      );
      check(currentDigest === state.contentDigest);
      const currentRecords = new Map(before.records.map((r) => [r.itemId, r]));
      const phrase = '"' + request.text.replaceAll('"', '""') + '"',
        b = new HistoryReadBudget(limits);
      const where =
        'lexical MATCH ?' +
        (filterTypes.length
          ? ' AND item_type IN (' + filterTypes.map(() => '?').join(',') + ')'
          : '');
      const queryArgs = [phrase, ...filterTypes];
      b.own([...queryArgs, request.maxResults]);
      b.add('rows', 1);
      const total = state.db
        .prepare('SELECT count(*) n FROM lexical WHERE ' + where)
        .get(...queryArgs)!.n;
      check(typeof total === 'number' && Number.isSafeInteger(total) && total >= 0);
      const hits =
        'WITH hits AS MATERIALIZED (SELECT item_id,revision_id,bm25(lexical) AS rank FROM lexical WHERE ' +
        where +
        ' ORDER BY rank,item_id,revision_id LIMIT ?) ';
      const size = state.db
        .prepare(
          hits +
            'SELECT count(*) n,coalesce(sum(length(CAST(item_id AS BLOB))+length(CAST(revision_id AS BLOB))+length(CAST(rank AS BLOB))),0) bytes FROM hits',
        )
        .get(...queryArgs, request.maxResults)!;
      check(
        typeof size.n === 'number' &&
          typeof size.bytes === 'number' &&
          Number.isSafeInteger(size.n) &&
          Number.isSafeInteger(size.bytes),
      );
      b.add('rows', size.n);
      b.add('serializedBytes', size.bytes);
      b.pin(size.bytes);
      const rows = state.db
        .prepare(
          hits + 'SELECT item_id,revision_id,rank FROM hits ORDER BY rank,item_id,revision_id',
        )
        .all(...queryArgs, request.maxResults);
      check(rows.length === size.n);
      b.own(rows, false);
      const after = this.projection(limits, c, false, page);
      check(
        this.#state === state &&
          after.headDigest === state.headDigest &&
          canonicalCompilationJson(after.records, c) ===
            canonicalCompilationJson(before.records, c),
      );
      const results = rows.map((r) => {
        const record = currentRecords.get(String(r.item_id));
        check(
          record &&
            record.revisionId === r.revision_id &&
            typeof r.rank === 'number' &&
            Number.isFinite(r.rank),
        );
        return {
          ...(page ? { type: record.type, ...record.evidence } : {}),
          itemId: record.itemId,
          revisionId: record.revisionId,
          rank: r.rank,
          title: record.title,
          summary: record.summary,
          goal: record.goal,
          scope: JSON.parse(record.scopeJson) as unknown,
          sourceFreshness: record.sourceFreshness,
          compilationCurrency: record.compilationCurrency,
          warnings:
            record.sourceFreshness === 'FRESH'
              ? ['LIVE_SOURCE_NOT_OBSERVED']
              : ['LIVE_SOURCE_NOT_OBSERVED', record.sourceFreshness],
        };
      });
      b.own(results);
      canonicalCompilationJson(results, c);
      return Object.freeze({
        kind: this.#receipt ? ('SCHEMA11_RECEIPT' as const) : ('OWNED_TEST_PUBLICATION' as const),
        workspaceId: state.workspaceId,
        headDigest: state.headDigest,
        contentDigest: state.contentDigest,
        results,
        totalMatches: total,
        truncated: total > rows.length,
        productionQuery: 'NOT_AUTHORIZED' as const,
        limitations: [
          'DISPLAY_FIELDS_ONLY',
          'NO_SECRET_CLEARANCE',
          'NO_QUALITY_ADMISSION',
          'NO_GRAPH_EXPANSION',
        ],
      });
    } catch (error) {
      return this.failed(error);
    }
  }
  close() {
    try {
      if (this.#state?.db.isOpen) this.#state.db.close();
      this.#state = null;
    } catch (error) {
      return this.failed(error);
    }
  }
}

/** Additive receipt-backed derived index; explicit rebuild only, never writes the source Store. */
export class Schema11KnowledgeSearchIndex extends OfflineKnowledgeSearchIndex {
  constructor(source: Schema11ReadStore, permissions: ReceiptSearchPermissions) {
    super(source, permissions);
  }
}
