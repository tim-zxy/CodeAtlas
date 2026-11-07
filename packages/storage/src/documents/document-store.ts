import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual, types } from 'node:util';
import { parseDocumentBundle, ensurePhase1Data, canonicalRuntimeJson } from '@codeatlas/ir';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  exact,
  text,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';

type Bundle = ReturnType<typeof parseDocumentBundle>;
export interface DocumentBatch {
  bundle: unknown;
  expectedCurrentRevisionId: string | null;
}
export interface DocumentApplyReceipt {
  status: 'NOT_COMMITTED' | 'COMMITTED' | 'COMMIT_OUTCOME_UNKNOWN';
  documentId: string;
  revisionId: string | null;
  reused: boolean;
}
export class DocumentStoreError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'DocumentStoreError';
    this.code = code;
  }
}
function check(value: unknown, code: string): asserts value {
  if (!value) throw new DocumentStoreError(code);
}
function assertDocumentSchema(sql: ReturnType<typeof runtimeSql>): void {
  const version = sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version;
  check(version === 7 || version === 8, 'DOCUMENT_SCHEMA_UNSUPPORTED');
  check(
    sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
    'DOCUMENT_FOREIGN_KEYS_REQUIRED',
  );
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Revision aliases apply only to explicit typed references, never literal text/JSON.
 * Structural entity IDs and all external provenance stay exact. */
function bindRevision(input: Bundle, actualId: string, budget: HistoryReadBudget): Bundle {
  budget.own(input);
  const value = structuredClone(input),
    p = value.payload,
    proposed = p.revision.id;
  p.document.currentRevisionId = null;
  p.revision.id = actualId as typeof p.revision.id;
  const groups = [
    ['DOCUMENT', [p.document]],
    ['DOCUMENT_SECTION', p.sections],
    ['DOCUMENT_BLOCK', p.blocks],
    ['DOCUMENT_TABLE', p.tables],
    ['DOCUMENT_LINK', p.links],
    ['DOCUMENT_CODE_SNIPPET', p.codeSnippets],
    ['DOCUMENT_ENTITY_MENTION', p.mentions],
    ['DOCUMENT_CHUNK', p.chunks],
  ] as const;
  const locals = new Map<string, Set<string>>(
    groups.map(([kind, items]) => [kind, new Set(items.map((v) => v.id))]),
  );
  const ref = (r: { kind: string; id: string; revisionId?: string | undefined }) => {
    if (r.revisionId === proposed && locals.get(r.kind)?.has(r.id)) r.revisionId = actualId;
  };
  const scoped = (r: Bundle['payload']['externalRefs'][number]) => {
    if (r.scope === 'WORKSPACE' && r.workspaceId === p.document.workspaceId) ref(r.entity);
  };
  const range = (r: { documentRevisionId: string } | null) => {
    if (r?.documentRevisionId === proposed) r.documentRevisionId = actualId;
  };
  const basis = p.revision.sourceBasis;
  if (
    'documentId' in basis &&
    basis.documentId === p.document.id &&
    basis.documentRevisionId === proposed
  )
    basis.documentRevisionId = actualId as typeof basis.documentRevisionId;
  p.revision.blockRefs.forEach(ref);
  p.revision.diagnostics.forEach((d) => range(d.sourceRange));
  for (const v of [
    ...p.sections,
    ...p.blocks,
    ...p.tables,
    ...p.links,
    ...p.codeSnippets,
    ...p.mentions,
    ...p.chunks,
  ]) {
    v.documentRevisionId = actualId as typeof v.documentRevisionId;
    if ('sourceRange' in v) range(v.sourceRange);
    if ('textRange' in v) range(v.textRange);
    if ('blockRef' in v) ref(v.blockRef);
    if ('blockRefs' in v) v.blockRefs.forEach(ref);
  }
  for (const block of p.blocks)
    if (block.kind === 'LIST') for (const item of block.payload.items) item.blockRefs.forEach(ref);
  p.externalRefs.forEach(scoped);
  for (const link of p.links) {
    if (link.typedContent.targetRef) scoped(link.typedContent.targetRef);
    link.typedContent.candidates.forEach(scoped);
  }
  for (const mention of p.mentions) mention.candidateRefs.forEach(scoped);
  for (const s of p.supportInventory) {
    if (
      'documentId' in s.basis &&
      s.basis.documentId === p.document.id &&
      s.basis.documentRevisionId === proposed
    ) {
      s.basis.documentRevisionId = actualId as typeof s.basis.documentRevisionId;
      ref(s.entity);
    }
  }
  budget.own(value);
  return parseDocumentBundle(value);
}
const owners = new WeakMap<DocumentStore, { db: DatabaseSync; workspaceId: string }>();
/** INTERNAL ONLY. IR/schema validation proves supplied consistency, NOT authorization,
 * secret scanning, capture or Source freshness. Trusted Application performs asynchronous
 * Source/scans OUTSIDE the transaction over the final payload. syncCheck rechecks only
 * existing permission/head/control synchronously. No JSON/receipt is an authority token. */
export class DocumentStore {
  constructor(db: DatabaseSync, workspaceId: string) {
    check(
      !types.isProxy(db) && db instanceof DatabaseSync && db.isOpen,
      'INVALID_DOCUMENT_DATABASE',
    );
    const schemaVersion = db.prepare('PRAGMA user_version').get()?.user_version;
    check(schemaVersion === 7 || schemaVersion === 8, 'DOCUMENT_SCHEMA_UNSUPPORTED');
    check(
      db.prepare('PRAGMA foreign_keys').get()?.foreign_keys === 1,
      'DOCUMENT_FOREIGN_KEYS_REQUIRED',
    );
    owners.set(this, { db, workspaceId: text(workspaceId) });
  }
  applyDocuments(
    input: DocumentBatch,
    limits: HistoryReadLimits,
    syncCheck: (bundle: Readonly<Bundle>) => undefined,
  ): DocumentApplyReceipt {
    const { db, workspaceId } = owners.get(this)!;
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction, 'DOCUMENT_TRANSACTION_ACTIVE');
    const sql = runtimeSql(db, b);
    const schemaVersion = sql.read('pragma_user_version', ['user_version'], '1', [])[0]
      ?.user_version;
    check(schemaVersion === 7 || schemaVersion === 8, 'DOCUMENT_SCHEMA_UNSUPPORTED');
    check(
      sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
      'DOCUMENT_FOREIGN_KEYS_REQUIRED',
    );
    check(
      typeof syncCheck === 'function' &&
        !types.isProxy(syncCheck) &&
        !types.isAsyncFunction(syncCheck),
      'DOCUMENT_SYNC_CHECK_REQUIRED',
    );
    b.own(input);
    ensurePhase1Data(input);
    exact(input, ['bundle', 'expectedCurrentRevisionId']);
    check(
      input.expectedCurrentRevisionId === null ||
        typeof input.expectedCurrentRevisionId === 'string',
      'INVALID_DOCUMENT_HEAD',
    );
    if (input.expectedCurrentRevisionId !== null) text(input.expectedCurrentRevisionId);
    const expectedHead = input.expectedCurrentRevisionId;
    // Explicit first-slice refusal, including malformed attempted Claim payloads.
    const raw = input.bundle as { payload?: { claims?: unknown[] } };
    check(
      !Array.isArray(raw?.payload?.claims) || raw.payload.claims.length === 0,
      'DOCUMENT_CLAIMS_UNSUPPORTED',
    );
    b.own(input.bundle);
    const bundle = freeze(parseDocumentBundle(input.bundle));
    const p = bundle.payload,
      d = p.document;
    check(d.workspaceId === workspaceId, 'DOCUMENT_SCOPE_CHANGED');
    const recheck = () => {
      const result: unknown = syncCheck(bundle);
      // Refuse asynchronous authority, but settle genuine rejected Promises safely.
      if (types.isPromise(result)) Promise.prototype.then.call(result, undefined, () => {});
      check(result === undefined, 'DOCUMENT_SYNC_CHECK_REQUIRED');
    };
    recheck();
    if (p.revision.completeness !== 'COMPLETE')
      return {
        status: 'NOT_COMMITTED',
        documentId: d.id,
        revisionId: null,
        reused: false,
      };
    let committing = false,
      actualId: string = p.revision.id,
      reused = false;
    db.exec('BEGIN IMMEDIATE');
    try {
      assertDocumentSchema(sql);
      check(
        sql.read('workspace', ['id'], 'id=?', [workspaceId]).length === 1,
        'DOCUMENT_SCOPE_CHANGED',
      );
      if (d.repositoryId !== null)
        check(
          sql.read('repositories', ['repository_id'], 'repository_id=? AND workspace_id=?', [
            d.repositoryId,
            workspaceId,
          ]).length === 1,
          'DOCUMENT_SCOPE_CHANGED',
        );
      const rows = sql.read(
        'documents',
        [
          'id',
          'workspace_id',
          'repository_id',
          'logical_path',
          'media_type',
          'source_kind',
          'current_revision_id',
        ],
        'id=?',
        [d.id],
      );
      const current = rows[0];
      check((current?.current_revision_id ?? null) === expectedHead, 'DOCUMENT_HEAD_CHANGED');
      if (current) {
        check(
          current.workspace_id === workspaceId &&
            current.repository_id === d.repositoryId &&
            current.logical_path === d.logicalPath &&
            current.media_type === d.mediaType &&
            current.source_kind === d.sourceKind,
          'DOCUMENT_IDENTITY_CHANGED',
        );
      } else {
        sql.insert('documents', {
          id: d.id,
          workspace_id: workspaceId,
          repository_id: d.repositoryId,
          logical_path: d.logicalPath,
          media_type: d.mediaType,
          source_kind: d.sourceKind,
          current_revision_id: null,
        });
      }
      const tuple = sql.read(
        'document_revisions',
        ['id', 'payload_json'],
        'document_id=? AND source_fingerprint=? AND parser_version=? AND policy_version=?',
        [d.id, p.revision.sourceFingerprint, p.revision.parserVersion, p.revision.policyVersion],
      );
      check(tuple.length <= 1, 'DOCUMENT_TUPLE_CONFLICT');
      if (tuple[0]) {
        actualId = text(tuple[0].id);
        reused = true;
        const storedValue = b.parse(text(tuple[0].payload_json));
        b.own(storedValue);
        const stored = parseDocumentBundle(storedValue);
        check(
          isDeepStrictEqual(stored, bindRevision(bundle, actualId, b)),
          'DOCUMENT_TUPLE_CONFLICT',
        );
      } else {
        const stored = bindRevision(bundle, actualId, b);
        const payload = canonicalRuntimeJson(stored);
        b.own(payload);
        sql.insert('document_revisions', {
          id: actualId,
          document_id: d.id,
          source_fingerprint: p.revision.sourceFingerprint,
          parser_version: p.revision.parserVersion,
          policy_version: p.revision.policyVersion,
          completeness: 'COMPLETE',
          payload_json: payload,
        });
        for (const v of p.sections)
          sql.insert('document_sections', {
            revision_id: actualId,
            entity_id: v.id,
            parent_id: v.parentSectionId,
            ordinal: v.ordinal,
            payload_json: canonicalRuntimeJson(v),
          });
        for (const v of p.blocks)
          sql.insert('document_blocks', {
            revision_id: actualId,
            entity_id: v.id,
            section_id: v.sectionId,
            ordinal: v.ordinal,
            payload_json: canonicalRuntimeJson(v),
          });
        for (const v of p.links)
          sql.insert('document_links', {
            revision_id: actualId,
            entity_id: v.id,
            block_id: v.blockRef.id,
            payload_json: canonicalRuntimeJson(v),
          });
      }
      recheck();
      assertDocumentSchema(sql);
      const result = sql.run(
        'UPDATE documents SET current_revision_id=? WHERE id=? AND current_revision_id IS ?',
        [actualId, d.id, expectedHead],
      );
      check(result.changes === 1, 'DOCUMENT_HEAD_CHANGED');
      committing = true;
      db.exec('COMMIT');
      return {
        status: 'COMMITTED',
        documentId: d.id,
        revisionId: actualId,
        reused,
      };
    } catch (error) {
      let cleanupFailed = false;
      try {
        if (db.isTransaction) db.exec('ROLLBACK');
      } catch {
        cleanupFailed = true;
      }
      if (committing || cleanupFailed)
        return {
          status: 'COMMIT_OUTCOME_UNKNOWN',
          documentId: d.id,
          revisionId: actualId,
          reused,
        };
      throw error;
    }
  }
  readCurrent(
    documentId: string,
    limits: HistoryReadLimits,
    syncCheck?: () => undefined,
  ): { revisionId: string; bundle: Bundle } | null {
    return this.#readDocument(documentId, null, limits, syncCheck);
  }
  /** Exact immutable history only; no fallback to head and no Source/scan authority. */
  readRevision(
    documentId: string,
    revisionId: string,
    limits: HistoryReadLimits,
    syncCheck: () => undefined,
  ): { revisionId: string; bundle: Bundle } | null {
    check(syncCheck !== undefined, 'DOCUMENT_SYNC_CHECK_REQUIRED');
    return this.#readDocument(documentId, text(revisionId), limits, syncCheck);
  }
  /** Internal P1-12 read port only: one database view, not Source/capture authority. */
  readCurrentBatch(
    documentIds: readonly string[],
    limits: HistoryReadLimits,
    syncCheck: () => undefined,
  ): readonly Readonly<{ revisionId: string; bundle: Bundle }>[] {
    check(syncCheck !== undefined, 'DOCUMENT_SYNC_CHECK_REQUIRED');
    let ids: string[] = [];
    return this.#withReadSnapshot(
      limits,
      syncCheck,
      (sql, b, recheck) => {
        const result: Readonly<{ revisionId: string; bundle: Bundle }>[] = [];
        for (const id of ids) {
          recheck();
          const row = readDocumentRowForWorkspaceCompilation(
            owners.get(this)!.workspaceId,
            sql,
            b,
            id,
            null,
            recheck,
          );
          check(row !== null, 'DOCUMENT_REQUIRED_DOCUMENT_MISSING');
          result.push(Object.freeze(row));
        }
        return Object.freeze(result);
      },
      (b) => {
        b.own(documentIds);
        ensurePhase1Data(documentIds);
        check(Array.isArray(documentIds), 'INVALID_DOCUMENT_SELECTION');
        // Prepay the owned selector copy and its reference indexes with the existing
        // request-local logical budget; no default cap or physical RSS formula.
        b.own(documentIds);
        ids = documentIds.map((id) => text(id));
        b.own(ids);
        const unique = new Set(ids);
        check(unique.size === ids.length, 'DOCUMENT_DUPLICATE_SELECTION');
      },
    );
  }
  /** Exact required history in one private database view; no capture/Source authority. */
  readRevisionBatch(
    selection: readonly Readonly<{ documentId: string; revisionId: string }>[],
    limits: HistoryReadLimits,
    syncCheck: () => undefined,
  ): readonly Readonly<{ revisionId: string; bundle: Bundle }>[] {
    check(syncCheck !== undefined, 'DOCUMENT_SYNC_CHECK_REQUIRED');
    let selected: { documentId: string; revisionId: string }[] = [];
    return this.#withReadSnapshot(
      limits,
      syncCheck,
      (sql, b, recheck) => {
        const result: Readonly<{ revisionId: string; bundle: Bundle }>[] = [];
        for (const item of selected) {
          recheck();
          const row = readDocumentRowForWorkspaceCompilation(
            owners.get(this)!.workspaceId,
            sql,
            b,
            item.documentId,
            item.revisionId,
            recheck,
          );
          check(row !== null, 'DOCUMENT_REQUIRED_DOCUMENT_MISSING');
          result.push(Object.freeze(row));
        }
        return Object.freeze(result);
      },
      (b) => {
        b.own(selection);
        ensurePhase1Data(selection);
        check(Array.isArray(selection), 'INVALID_DOCUMENT_SELECTION');
        b.own(selection);
        selected = selection.map((value) => {
          const row = exact(value, ['documentId', 'revisionId']);
          return { documentId: text(row.documentId), revisionId: text(row.revisionId) };
        });
        // Prepay tuple-key/reference indexes with the same logical request account.
        b.own(selected);
        const keys = selected.map((item) => JSON.stringify([item.documentId, item.revisionId]));
        b.own(keys);
        check(new Set(keys).size === selected.length, 'DOCUMENT_DUPLICATE_SELECTION');
      },
    );
  }
  #readDocument(
    documentId: string,
    requestedRevision: string | null,
    limits: HistoryReadLimits,
    syncCheck: (() => undefined) | undefined,
  ): { revisionId: string; bundle: Bundle } | null {
    return this.#withReadSnapshot(limits, syncCheck, (sql, b, recheck) =>
      readDocumentRowForWorkspaceCompilation(
        owners.get(this)!.workspaceId,
        sql,
        b,
        documentId,
        requestedRevision,
        recheck,
      ),
    );
  }
  #withReadSnapshot<T>(
    limits: HistoryReadLimits,
    syncCheck: (() => undefined) | undefined,
    read: (sql: ReturnType<typeof runtimeSql>, b: HistoryReadBudget, recheck: () => void) => T,
    prepare?: (b: HistoryReadBudget) => void,
  ): T {
    const { db } = owners.get(this)!;
    check(!db.isTransaction, 'DOCUMENT_TRANSACTION_ACTIVE');
    if (syncCheck !== undefined)
      check(
        typeof syncCheck === 'function' &&
          !types.isProxy(syncCheck) &&
          !types.isAsyncFunction(syncCheck),
        'DOCUMENT_SYNC_CHECK_REQUIRED',
      );
    const recheck = () => {
      if (syncCheck !== undefined) {
        const result: unknown = syncCheck();
        if (types.isPromise(result)) Promise.prototype.then.call(result, undefined, () => {});
        check(result === undefined, 'DOCUMENT_SYNC_CHECK_REQUIRED');
      }
    };
    // Batch inputs must be owned before a trusted callback can change caller data.
    // Preserve the existing single-read control/budget admission order.
    const preparedBudget = prepare
      ? new HistoryReadBudget(checkedHistoryLimits(limits))
      : undefined;
    if (prepare) prepare(preparedBudget!);
    recheck();
    const b = preparedBudget ?? new HistoryReadBudget(checkedHistoryLimits(limits));
    const baseSql = runtimeSql(db, b);
    const sql = {
      ...baseSql,
      read(...args: Parameters<typeof baseSql.read>) {
        recheck();
        const rows = baseSql.read(...args);
        recheck();
        return rows;
      },
    };
    const version = sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version;
    check(version === 7 || version === 8, 'DOCUMENT_SCHEMA_UNSUPPORTED');
    check(
      sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
      'DOCUMENT_FOREIGN_KEYS_REQUIRED',
    );
    check(!db.isTransaction, 'DOCUMENT_TRANSACTION_ACTIVE');
    db.exec('BEGIN');
    try {
      assertDocumentSchema(sql);
      const result = read(sql, b, recheck);
      recheck();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Private row helper: caller owns the transaction and shared request budget. */
export function readDocumentRowForWorkspaceCompilation(
  workspaceId: string,
  sql: ReturnType<typeof runtimeSql>,
  b: HistoryReadBudget,
  documentId: string,
  requestedRevision: string | null,
  recheck: () => void,
): { revisionId: string; bundle: Bundle } | null {
  const docs = sql.read(
    'documents',
    [
      'id',
      'workspace_id',
      'repository_id',
      'logical_path',
      'media_type',
      'source_kind',
      'current_revision_id',
    ],
    'id=? AND workspace_id=?',
    [text(documentId), workspaceId],
  );
  if (!docs.length || (requestedRevision === null && docs[0]!.current_revision_id === null)) {
    return null;
  }
  const header = docs[0]!,
    revisionId = requestedRevision ?? text(header.current_revision_id);
  const rows = sql.read(
    'document_revisions',
    [
      'id',
      'document_id',
      'source_fingerprint',
      'parser_version',
      'policy_version',
      'completeness',
      'payload_json',
    ],
    'id=? AND document_id=?',
    [revisionId, documentId],
  );
  if (!rows.length && requestedRevision !== null) {
    return null;
  }
  check(rows.length === 1 && rows[0]!.completeness === 'COMPLETE', 'DOCUMENT_STORAGE_CORRUPT');
  recheck();
  const parsed = b.parse(text(rows[0]!.payload_json));
  b.own(parsed);
  const bundle = parseDocumentBundle(parsed),
    d = bundle.payload.document,
    revision = bundle.payload.revision;
  check(
    d.id === documentId &&
      d.workspaceId === workspaceId &&
      d.currentRevisionId === null &&
      revision.id === revisionId &&
      revision.completeness === 'COMPLETE' &&
      header.id === d.id &&
      header.workspace_id === d.workspaceId &&
      header.repository_id === d.repositoryId &&
      header.logical_path === d.logicalPath &&
      header.media_type === d.mediaType &&
      header.source_kind === d.sourceKind &&
      rows[0]!.document_id === d.id &&
      rows[0]!.source_fingerprint === revision.sourceFingerprint &&
      rows[0]!.parser_version === revision.parserVersion &&
      rows[0]!.policy_version === revision.policyVersion,
    'DOCUMENT_STORAGE_CORRUPT',
  );
  for (const [table, columns, expected] of [
    [
      'document_sections',
      ['entity_id', 'parent_id', 'ordinal', 'payload_json'],
      bundle.payload.sections,
    ],
    [
      'document_blocks',
      ['entity_id', 'section_id', 'ordinal', 'payload_json'],
      bundle.payload.blocks,
    ],
    ['document_links', ['entity_id', 'block_id', 'payload_json'], bundle.payload.links],
  ] as const) {
    const actual = sql.read(table, columns, 'revision_id=?', [revisionId]);
    check(actual.length === expected.length, 'DOCUMENT_STORAGE_CORRUPT');
    for (const item of expected) {
      recheck();
      const row = actual.find((r) => r.entity_id === item.id);
      check(row && row.payload_json === canonicalRuntimeJson(item), 'DOCUMENT_STORAGE_CORRUPT');
      if ('parentSectionId' in item)
        check(
          row.parent_id === item.parentSectionId && row.ordinal === item.ordinal,
          'DOCUMENT_STORAGE_CORRUPT',
        );
      else if ('sectionId' in item)
        check(
          row.section_id === item.sectionId && row.ordinal === item.ordinal,
          'DOCUMENT_STORAGE_CORRUPT',
        );
      else check(row.block_id === item.blockRef.id, 'DOCUMENT_STORAGE_CORRUPT');
    }
  }
  return { revisionId, bundle: freeze(bundle) };
}
