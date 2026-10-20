import type { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { EntityIdSchema, SourceFileSchema, type SourceFile } from '@codeatlas/ir';
import {
  assertNativeStateLimits,
  readNativeAnalysisState,
  type NativeActivationToken,
  type NativeStateExpectation,
  type NativeStateLimits,
  type NativeStateValidationPort,
  type ValidatedNativeState,
} from './native-analysis-state.js';

type Row = Record<string, unknown>;
type Control = {
  checkpoint(): Promise<void>;
  reserveText(bytes: number): void;
  chargeMetadataRow(): void;
};
type RetainedBinding = {
  expected: NativeStateExpectation;
  snapshotId: string;
  token: NativeActivationToken;
  sourceFiles: readonly SourceFile[];
  limits: NativeStateLimits;
};

// Internal R010 Evaluation projection. No Native header/summary TEXT is read.
const fields: Record<string, readonly string[]> = {
  repository_state: ['repository_id', 'indexed_revision_id', 'indexed_content_fingerprint'],
  revisions: ['id', 'repository_id', 'kind', 'content_fingerprint', 'base_revision_id'],
  source_files: [
    'id',
    'repository_id',
    'revision_id',
    'path',
    'content_fingerprint',
    'role',
    'provenance',
    'content_kind',
    'language_hint',
    'sensitivity',
  ],
  canonical_nodes: [
    'revision_id',
    'id',
    'repository_id',
    'fact_key',
    'kind',
    'type_kind',
    'symbol_kind',
    'name',
    'qualified_name',
    'source_range_json',
    'confidence_score',
    'confidence_method',
    'confidence_reasons_json',
  ],
  canonical_edges: [
    'revision_id',
    'id',
    'repository_id',
    'fact_key',
    'kind',
    'source_node_id',
    'target_state',
    'resolution',
    'target_node_id',
    'source_range_json',
    'confidence_score',
    'confidence_method',
    'confidence_reasons_json',
  ],
  unresolved_targets: ['revision_id', 'edge_id', 'original_hint', 'candidates_json'],
  evidence: [
    'id',
    'repository_id',
    'revision_id',
    'provider_snapshot_id',
    'fact_type',
    'provider_id',
    'provider_fact_id',
    'status',
  ],
  fact_evidence: ['fact_type', 'canonical_fact_id', 'evidence_id'],
  provider_fact_bindings: [
    'fact_type',
    'provider_id',
    'provider_fact_id',
    'provider_snapshot_id',
    'canonical_fact_id',
    'evidence_id',
  ],
  active_support_candidates: ['evidence_id', 'fact_type', 'canonical_fact_id', 'candidate_json'],
  provider_snapshots: [
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
  provider_capabilities: ['snapshot_id', 'name', 'support', 'coverage'],
  analysis_coverage: ['id', 'provider_snapshot_id', 'capability_name', 'source_file_id', 'status'],
  analysis_diagnostics: [
    'provider_snapshot_id',
    'ordinal',
    'code',
    'severity',
    'message',
    'source_range_json',
  ],
  native_analysis_state: [
    'repository_id',
    'provider_id',
    'provider_snapshot_id',
    'revision_id',
    'content_fingerprint',
  ],
};

function invalid(): never {
  throw new Error('Evaluation stored state unavailable or invalid.');
}

/** Borrow a bound read-only connection; never close it or end its outer transaction. */
export async function readEvaluationStateRows(
  db: DatabaseSync,
  repositoryId: string,
  control: Control,
): Promise<Record<string, Row[]>> {
  return readStateRows(db, repositoryId, control);
}

/** Internal inspection only: the returned rows do not authorize target publication. */
export async function readEvaluationRetainedStateRows(
  db: DatabaseSync,
  repositoryId: string,
  control: Control,
  binding: RetainedBinding,
): Promise<Record<string, Row[]>> {
  assertNativeStateLimits(binding.limits);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const input of binding.sourceFiles) {
    const file = SourceFileSchema.parse(input);
    if (
      file.repositoryId !== repositoryId ||
      file.revisionId !== binding.expected.revisionId ||
      ids.has(file.id) ||
      paths.has(file.path)
    )
      invalid();
    ids.add(file.id);
    paths.add(file.path);
  }
  if (binding.expected.repositoryId !== repositoryId) invalid();
  return readStateRows(db, repositoryId, control, binding);
}

async function readStateRows(
  db: DatabaseSync,
  repositoryId: string,
  control: Control,
  retained?: RetainedBinding,
): Promise<Record<string, Row[]>> {
  const id = EntityIdSchema.parse(repositoryId);
  await control.checkpoint();
  if (
    db.prepare('PRAGMA query_only').get()?.query_only !== 1 ||
    db.prepare('PRAGMA user_version').get()?.user_version !== 10
  )
    invalid();
  const owned = !db.isTransaction;
  if (owned) db.exec('BEGIN');
  let retainedBytes = 0;
  const rows = async (table: string, where: string, parameters: string[]): Promise<Row[]> => {
    const columns = fields[table];
    if (!columns) invalid();
    const bytes = columns
      .map(
        (column) =>
          `CASE WHEN typeof(${column})='text' THEN length(CAST(${column} AS BLOB)) ELSE 0 END`,
      )
      .join('+');
    const blobs = columns
      .map((column) => `CASE WHEN typeof(${column})='blob' THEN 1 ELSE 0 END`)
      .join('+');
    const sizes = db
      .prepare(
        `SELECT rowid AS selected_rowid, (${bytes}) AS selected_bytes, (${blobs}) AS invalid_blobs FROM ${table} WHERE ${where} ORDER BY rowid`,
      )
      .iterate(...parameters);
    const result: Row[] = [];
    try {
      for (const size of sizes) {
        await control.checkpoint();
        if (
          size.invalid_blobs !== 0 ||
          typeof size.selected_rowid !== 'number' ||
          !Number.isSafeInteger(size.selected_rowid) ||
          typeof size.selected_bytes !== 'number' ||
          !Number.isSafeInteger(size.selected_bytes) ||
          size.selected_bytes < 0
        )
          invalid();
        control.chargeMetadataRow();
        if (retained) {
          retainedBytes += size.selected_bytes;
          if (
            !Number.isSafeInteger(retainedBytes) ||
            2 * retainedBytes + (retained.limits.workspaceReservationBytes ?? 0) >
              retained.limits.memoryBudgetBytes
          )
            invalid();
        }
        control.reserveText(size.selected_bytes);
        const row = db
          .prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE rowid=?`)
          .get(size.selected_rowid);
        if (!row) invalid();
        result.push(row);
      }
    } finally {
      sizes.return?.();
    }
    return result;
  };
  try {
    const result: Record<string, Row[]> = {};
    result.repository_state = await rows('repository_state', 'repository_id=?', [id]);
    const state = result.repository_state[0];
    if (
      result.repository_state.length !== 1 ||
      !state ||
      typeof state.indexed_revision_id !== 'string' ||
      typeof state.indexed_content_fingerprint !== 'string'
    )
      invalid();
    const revisionId = EntityIdSchema.parse(state.indexed_revision_id);
    result.revisions = await rows('revisions', "repository_id=? AND kind='WORKTREE'", [id]);
    if (
      result.revisions.length !== 1 ||
      result.revisions[0]?.id !== revisionId ||
      result.revisions[0]?.kind !== 'WORKTREE' ||
      (!retained && result.revisions[0]?.content_fingerprint !== state.indexed_content_fingerprint)
    )
      invalid();
    for (const table of ['source_files', 'canonical_nodes', 'canonical_edges'])
      result[table] = await rows(table, 'repository_id=? AND revision_id=?', [id, revisionId]);
    for (const table of ['unresolved_targets', 'evidence'])
      result[table] = await rows(table, 'revision_id=?', [revisionId]);
    for (const table of ['fact_evidence', 'provider_fact_bindings', 'active_support_candidates'])
      result[table] = await rows(
        table,
        `evidence_id IN (SELECT id FROM evidence WHERE revision_id=?) OR NOT EXISTS (SELECT 1 FROM evidence WHERE evidence.id=${table}.evidence_id)`,
        [revisionId],
      );
    const snapshotScope =
      'SELECT id FROM provider_snapshots WHERE repository_id=? AND requested_revision_id=?';
    result.provider_snapshots = await rows(
      'provider_snapshots',
      'repository_id=? AND requested_revision_id=?',
      [id, revisionId],
    );
    result.provider_capabilities = await rows(
      'provider_capabilities',
      `snapshot_id IN (${snapshotScope}) OR NOT EXISTS (SELECT 1 FROM provider_snapshots WHERE id=provider_capabilities.snapshot_id)`,
      [id, revisionId],
    );
    for (const table of ['analysis_coverage', 'analysis_diagnostics'])
      result[table] = await rows(
        table,
        `provider_snapshot_id IN (${snapshotScope}) OR NOT EXISTS (SELECT 1 FROM provider_snapshots WHERE id=${table}.provider_snapshot_id)`,
        [id, revisionId],
      );
    result.native_analysis_state = await rows('native_analysis_state', 'repository_id=?', [id]);
    if (retained) {
      const { expected, token, snapshotId } = retained;
      const snapshot = result.provider_snapshots.find((row) => row.id === snapshotId);
      const native = result.native_analysis_state.find(
        (row) => row.provider_id === expected.providerId,
      );
      if (
        revisionId !== expected.revisionId ||
        state.indexed_content_fingerprint !== expected.contentFingerprint ||
        token.indexedRevisionId !== revisionId ||
        token.indexedContentFingerprint !== expected.contentFingerprint ||
        !snapshot ||
        snapshot.provider_id !== expected.providerId ||
        snapshot.provider_version !== expected.providerVersion ||
        snapshot.outcome !== 'SUCCEEDED' ||
        snapshot.requested_revision_fingerprint !== expected.contentFingerprint ||
        !native ||
        native.provider_snapshot_id !== snapshotId ||
        native.revision_id !== revisionId ||
        native.content_fingerprint !== expected.contentFingerprint ||
        token.states.length !== result.native_analysis_state.length ||
        new Set(token.states.map((entry) => entry.providerId)).size !== token.states.length ||
        !Number.isSafeInteger(token.committedSnapshotCount) ||
        db.prepare('SELECT count(*) AS n FROM provider_snapshots WHERE repository_id=?').get(id)
          ?.n !== token.committedSnapshotCount
      )
        invalid();
      // Compare inside SQLite: no unadmitted Native header/summary TEXT enters Node.
      for (const entry of token.states) {
        if (
          db
            .prepare(
              `SELECT count(*) AS n FROM native_analysis_state
          WHERE repository_id=? AND provider_id=? AND provider_snapshot_id=?
          AND CASE WHEN json_valid(header_json) THEN json_extract(header_json,'$.summaryDigest')=? ELSE 0 END`,
            )
            .get(id, entry.providerId, entry.snapshotId, entry.summaryDigest)?.n !== 1
        )
          invalid();
      }
      const context: [string, string][] = [
        ['repositoryId', expected.repositoryId],
        ['providerId', expected.providerId],
        ['providerVersion', expected.providerVersion],
        ['revisionId', expected.revisionId],
        ['contentFingerprint', expected.contentFingerprint],
        ['resolverVersion', expected.resolverVersion],
        ['normalizerVersion', expected.normalizerVersion],
        ['policyFingerprint', expected.policyFingerprint],
        ['language.languageId', expected.language.languageId],
        ['language.grammarVersion', expected.language.grammarVersion],
        ['language.analyzerVersion', expected.language.analyzerVersion],
        ['language.compatibilityVersion', expected.language.compatibilityVersion],
      ];
      const matches =
        db.prepare(`SELECT count(*) AS n FROM native_analysis_state WHERE repository_id=? AND provider_id=?
        AND CASE WHEN json_valid(header_json) THEN json_extract(header_json,?)=? ELSE 0 END`);
      for (const [path, value] of context)
        if (matches.get(id, expected.providerId, `$.${path}`, value)?.n !== 1) invalid();
      if (
        db
          .prepare(
            `SELECT count(*) AS n FROM native_analysis_state WHERE repository_id=? AND provider_id=?
        AND CASE WHEN json_valid(header_json) THEN json_extract(header_json,'$.requestedCapabilities')=json(?) ELSE 0 END`,
          )
          .get(id, expected.providerId, JSON.stringify(expected.requestedCapabilities))?.n !== 1
      )
        invalid();
    }
    await control.checkpoint();
    if (owned) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (owned && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Inspect the old publication, never a reusable current baseline. The trusted
 * Runtime caller must admit READ_SEAL before invoking this private entry point.
 * SQL image and Native reads share one snapshot and one caller-owned budget.
 */
export async function readEvaluationRetainedNativeState(
  db: DatabaseSync,
  binding: RetainedBinding,
  control: Control,
  validate: NativeStateValidationPort,
): Promise<{
  kind: 'RETAINED_PUBLICATION_ONLY';
  state: ValidatedNativeState;
  token: NativeActivationToken;
}> {
  assertNativeStateLimits(binding.limits);
  if (typeof validate !== 'function') invalid();
  const owned = !db.isTransaction;
  if (owned) db.exec('BEGIN');
  try {
    let imageBytes = 0;
    await readEvaluationRetainedStateRows(
      db,
      binding.expected.repositoryId,
      {
        ...control,
        checkpoint: () => control.checkpoint(),
        chargeMetadataRow: () => control.chargeMetadataRow(),
        reserveText(bytes) {
          imageBytes += bytes;
          if (
            !Number.isSafeInteger(imageBytes) ||
            2 * imageBytes >= binding.limits.memoryBudgetBytes
          )
            invalid();
          control.reserveText(bytes);
        },
      },
      binding,
    );
    const limits = {
      ...binding.limits,
      memoryBudgetBytes: binding.limits.memoryBudgetBytes - 2 * imageBytes,
    };
    let nativeBytes = 0;
    const result = readNativeAnalysisState(db, binding.expected, validate, limits, (bytes) => {
      control.reserveText(bytes - nativeBytes);
      nativeBytes = bytes;
    });
    if (result.status !== 'AVAILABLE' || !isDeepStrictEqual(result.token, binding.token)) invalid();
    const original = new Map<string, SourceFile>(
      binding.sourceFiles.map((file) => [file.id, SourceFileSchema.parse(file)]),
    );
    if (original.size !== result.state.files.length) invalid();
    for (const file of result.state.files) {
      const source = SourceFileSchema.parse(JSON.parse(file.summaryJson).sourceFile);
      if (!isDeepStrictEqual(source, original.get(file.sourceFileId))) invalid();
      original.delete(file.sourceFileId);
    }
    await control.checkpoint();
    if (owned) db.exec('COMMIT');
    return { kind: 'RETAINED_PUBLICATION_ONLY', state: result.state, token: result.token };
  } catch (error) {
    if (owned && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
