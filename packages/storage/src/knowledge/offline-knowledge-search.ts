import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import { type RuntimeRequestControl } from '@codeatlas/ir';
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
  if (code === 'SEARCH_PERMISSION_DENIED') {
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
type IndexState = {
  db: DatabaseSync;
  workspaceId: string;
  headDigest: string;
  contentDigest: string;
  records: Map<string, OfflineSearchRecord>;
};
/** Derived private lexical experiment; not production Query, authority or secret clearance. */
export class OfflineKnowledgeSearchIndex {
  #state: IndexState | null = null;
  #unsettled = false;
  #source: OfflinePublicationStore;
  #check: (manifest: OfflineSearchManifest) => undefined;
  constructor(source: OfflinePublicationStore, permissions: OfflineSearchPermissions) {
    check(source instanceof OfflinePublicationStore && !types.isProxy(source));
    check(permissions && typeof permissions === 'object' && !types.isProxy(permissions));
    const d = Object.getOwnPropertyDescriptors(permissions);
    check(
      d.kind &&
        'value' in d.kind &&
        d.kind.value === 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY' &&
        d.check &&
        'value' in d.check &&
        typeof d.check.value === 'function' &&
        !types.isProxy(d.check.value) &&
        !types.isAsyncFunction(d.check.value),
    );
    this.#source = source;
    this.#check = d.check.value.bind(permissions);
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
  private projection(limits: HistoryReadLimits, c: RuntimeRequestControl, metadataOnly = false) {
    return OfflinePublicationStore.prototype.readSearchProjection.call(
      this.#source,
      this.#check,
      limits,
      c,
      metadataOnly,
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
        "CREATE VIRTUAL TABLE lexical USING fts5(item_id UNINDEXED,revision_id UNINDEXED,title,summary,goal,tokenize='unicode61')",
      );
      const b = new HistoryReadBudget(limits),
        sql = runtimeSql(fresh, b);
      fresh.exec('BEGIN');
      for (const row of projection.records) {
        canonicalCompilationJson(row, c);
        sql.insert('lexical', {
          item_id: row.itemId,
          revision_id: row.revisionId,
          title: row.title,
          summary: row.summary,
          goal: row.goal,
        });
      }
      fresh.exec('COMMIT');
      fresh.exec('PRAGMA query_only=ON');
      const after = this.projection(limits, c, true);
      check(after.headDigest === projection.headDigest);
      const contentDigest = publicationDigest(
          'codeatlas.offline-search.text.v1',
          projection.records.map((r) => ({
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
        kind: 'OWNED_TEST_PUBLICATION' as const,
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
    if (this.#unsettled) throw new OfflineKnowledgeSearchError('INDEX_UNAVAILABLE', 'UNKNOWN');
    const c = ownControl(control),
      limits = checkedHistoryLimits(JSON.parse(canonicalCompilationJson(limitsValue, c)));
    try {
      const request = JSON.parse(canonicalCompilationJson(input, c));
      check(
        request &&
          Object.keys(request).sort().join(',') === 'maxResults,text' &&
          typeof request.text === 'string' &&
          request.text.trim().length > 0 &&
          Number.isSafeInteger(request.maxResults) &&
          request.maxResults > 0 &&
          request.maxResults <= limits.maxRows,
        'QUERY_INVALID',
      );
      const state = this.#state;
      check(state && state.db.isOpen);
      const before = this.projection(limits, c);
      check(this.#state === state && before.headDigest === state.headDigest);
      const currentDigest = publicationDigest(
        'codeatlas.offline-search.text.v1',
        before.records.map((r) => ({
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
      b.own([phrase, request.maxResults]);
      b.add('rows', 1);
      const total = state.db
        .prepare('SELECT count(*) n FROM lexical WHERE lexical MATCH ?')
        .get(phrase)!.n;
      check(typeof total === 'number' && Number.isSafeInteger(total) && total >= 0);
      const hits =
        'WITH hits AS MATERIALIZED (SELECT item_id,revision_id,bm25(lexical) AS rank FROM lexical WHERE lexical MATCH ? ORDER BY rank,item_id,revision_id LIMIT ?) ';
      const size = state.db
        .prepare(
          hits +
            'SELECT count(*) n,coalesce(sum(length(CAST(item_id AS BLOB))+length(CAST(revision_id AS BLOB))+length(CAST(rank AS BLOB))),0) bytes FROM hits',
        )
        .get(phrase, request.maxResults)!;
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
        .all(phrase, request.maxResults);
      check(rows.length === size.n);
      b.own(rows, false);
      const after = this.projection(limits, c, true);
      check(this.#state === state && after.headDigest === state.headDigest);
      const results = rows.map((r) => {
        const record = currentRecords.get(String(r.item_id));
        check(
          record &&
            record.revisionId === r.revision_id &&
            typeof r.rank === 'number' &&
            Number.isFinite(r.rank),
        );
        return {
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
        kind: 'OWNED_TEST_PUBLICATION' as const,
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
