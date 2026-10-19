import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  CanonicalEdgeSchema,
  CanonicalFactRefSchema,
  CanonicalIdSchema,
  CanonicalNodeSchema,
  EntityIdSchema,
  EpochMillisecondsSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderSnapshotSchema,
  ProviderCapabilityObservationSchema,
  ProviderCoverageStatusSchema,
  epochMillisecondsToUtcInstant,
} from '@codeatlas/ir';
import type {
  CanonicalEdge,
  CanonicalFactRef,
  CanonicalId,
  CanonicalNode,
  CodeEdgeKind,
  ContentFingerprint,
  EntityId,
  Evidence,
  ProviderFactBinding,
  ProviderSnapshot,
  SourceFile,
} from '@codeatlas/ir';

import { readActiveAnalysisState, readAnalysisFreshness } from '../analysis/activation-state.js';
import { loadMigrationPlan } from '../migrations/manifest.js';
import { parseStoredSourceFile } from '../source-state/repository.js';

export class StorageCodeQueryError extends Error {
  constructor(
    readonly code:
      | 'DATABASE_UNAVAILABLE'
      | 'DATABASE_KIND_MISMATCH'
      | 'DATABASE_UPGRADE_REQUIRED'
      | 'DATABASE_TOO_NEW'
      | 'REPOSITORY_NOT_FOUND'
      | 'NOT_INDEXED'
      | 'QUERY_DATA_INVALID',
  ) {
    super('Repository code query could not read valid stored data.');
    this.name = 'StorageCodeQueryError';
  }
}
type Control = {
  checkpoint(): Promise<void>;
  reserveText(bytes: number): void;
  chargeMetadataRow(): void;
};
type Row = Record<string, unknown>;
type SnapshotProvenance = Pick<
  ProviderSnapshot,
  | 'id'
  | 'repositoryId'
  | 'requestedRevisionId'
  | 'requestedRevisionFingerprint'
  | 'startedAt'
  | 'completedAt'
  | 'outcome'
>;
type Coverage = {
  kind: 'COVERAGE';
  snapshot: SnapshotProvenance;
  capability: string;
  support: 'SUPPORTED' | 'UNSUPPORTED';
  capabilityCoverage: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN';
  sourceFileId: EntityId | null;
  rowId: number | null;
  fileCoverage: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN' | null;
};
type Metadata =
  | { kind: 'SOURCE'; sourceFile: SourceFile }
  | {
      kind: 'SUPPORT';
      fact: CanonicalFactRef;
      evidence: Evidence;
      binding: ProviderFactBinding;
      snapshot: SnapshotProvenance;
    }
  | Coverage;
export interface RepositoryCodeQuerySession {
  readonly context: {
    repositoryId: EntityId;
    revisionId: EntityId;
    indexedContentFingerprint: ContentFingerprint | null;
    freshness: {
      state: 'CURRENT' | 'STALE' | 'UNKNOWN';
      basis: 'PERSISTED_SOURCE';
      worktreeObservation: 'NOT_OBSERVED';
    };
  };
  readNode(id: CanonicalId): Promise<CanonicalNode | null>;
  findNodes(name: string, match: 'exact' | 'prefix'): AsyncIterable<CanonicalNode>;
  readEdges(
    id: CanonicalId,
    direction: 'INCOMING' | 'OUTGOING',
    kind: CodeEdgeKind | null,
  ): AsyncIterable<CanonicalEdge>;
  hasOutgoingCall(id: CanonicalId): Promise<boolean>;
  readMetadata(fact: CanonicalFactRef): AsyncIterable<Metadata>;
  close(): void;
}
function invalid(): never {
  throw new StorageCodeQueryError('QUERY_DATA_INVALID');
}

const columns: Record<string, readonly string[]> = {
  repository: ['id'],
  repository_state: ['repository_id', 'indexed_revision_id', 'indexed_content_fingerprint'],
  revisions: ['id', 'repository_id', 'content_fingerprint'],
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
  source_files: [
    'revision_id',
    'id',
    'repository_id',
    'path',
    'content_fingerprint',
    'role',
    'provenance',
    'content_kind',
    'language_hint',
    'sensitivity',
  ],
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
};

function schema(database: DatabaseSync, latest: number): void {
  const workspace = database
    .prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name='workspace'")
    .get();
  if (workspace) throw new StorageCodeQueryError('DATABASE_KIND_MISMATCH');
  const version = database.prepare('PRAGMA user_version').get()?.user_version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) invalid();
  if (version > latest) throw new StorageCodeQueryError('DATABASE_TOO_NEW');
  if (version < 8) throw new StorageCodeQueryError('DATABASE_UPGRADE_REQUIRED');
  for (const [table, expected] of Object.entries(columns)) {
    if (
      !database
        .prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name=?")
        .get(table)
    )
      invalid();
    const matches = database
      .prepare(
        `SELECT count(*) AS n FROM pragma_table_info(?) WHERE name IN (${expected.map(() => '?').join(',')})`,
      )
      .get(table, ...expected);
    if (matches?.n !== expected.length) invalid();
  }
}

export async function openRepositoryCodeQuery(
  databasePath: string,
  repositoryId: EntityId,
  control: Control,
): Promise<RepositoryCodeQuerySession> {
  await control.checkpoint();
  let path: string;
  try {
    if (
      typeof databasePath !== 'string' ||
      databasePath.length === 0 ||
      databasePath.trim() !== databasePath ||
      databasePath.includes('\0') ||
      databasePath === ':memory:' ||
      /^[a-z][a-z\d+.-]*:\/\//i.test(databasePath) ||
      /^file:/i.test(databasePath)
    ) {
      throw new StorageCodeQueryError('DATABASE_UNAVAILABLE');
    }
    path = await realpath(resolve(databasePath));
    if (!(await stat(path)).isFile()) throw new StorageCodeQueryError('DATABASE_UNAVAILABLE');
  } catch {
    throw new StorageCodeQueryError('DATABASE_UNAVAILABLE');
  }
  const id = EntityIdSchema.parse(repositoryId);
  const plan = await loadMigrationPlan(
    new URL('../../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  await control.checkpoint();
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  } catch {
    throw new StorageCodeQueryError('DATABASE_UNAVAILABLE');
  }
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    try {
      if (database.isTransaction) database.exec('ROLLBACK');
    } finally {
      database.close();
    }
  }
  function assertOpen(): void {
    if (closed) invalid();
  }
  // Numeric TEXT lengths and rowid are fetched first. The same read snapshot
  // then supplies only a budget-admitted row, never an unbounded result array.
  async function* rows(
    table: string,
    where: string,
    parameters: (string | number)[],
    order = 'rowid',
  ) {
    assertOpen();
    const fields = columns[table];
    if (!fields) invalid();
    const lengths = fields
      .map(
        (name) => `CASE WHEN typeof(${name})='text' THEN length(CAST(${name} AS BLOB)) ELSE 0 END`,
      )
      .join('+');
    const invalidBlobs = fields
      .map((name) => `CASE WHEN typeof(${name})='blob' THEN 1 ELSE 0 END`)
      .join('+');
    const sizes = database
      .prepare(
        `SELECT rowid AS selected_rowid, (${lengths}) AS selected_bytes, (${invalidBlobs}) AS invalid_blob_count FROM ${table} WHERE ${where} ORDER BY ${order}`,
      )
      .iterate(...parameters);
    try {
      for (const size of sizes) {
        await control.checkpoint();
        assertOpen();
        if (size.invalid_blob_count !== 0) invalid();
        if (
          typeof size.selected_bytes !== 'number' ||
          !Number.isSafeInteger(size.selected_bytes) ||
          size.selected_bytes < 0 ||
          typeof size.selected_rowid !== 'number' ||
          !Number.isSafeInteger(size.selected_rowid)
        )
          invalid();
        control.reserveText(size.selected_bytes);
        const row = database
          .prepare(`SELECT ${fields.join(',')} FROM ${table} WHERE rowid=?`)
          .get(size.selected_rowid);
        if (!row) invalid();
        yield row as Row;
      }
    } finally {
      sizes.return?.();
    }
  }
  async function single(
    table: string,
    where: string,
    parameters: (string | number)[],
  ): Promise<Row | null> {
    let result: Row | null = null;
    for await (const row of rows(table, where, parameters)) {
      if (result !== null) invalid();
      result = row;
    }
    return result;
  }
  try {
    database.exec('PRAGMA query_only=ON');
    database.exec('BEGIN');
    schema(database, plan.latestVersion);
    const repository = await single('repository', 'id=?', [id]);
    if (!repository) throw new StorageCodeQueryError('REPOSITORY_NOT_FOUND');
    const stored = await single('repository_state', 'repository_id=?', [id]);
    if (!stored) invalid();
    const state = readActiveAnalysisState(database, id);
    if (state.revisionId === null) {
      if (state.contentFingerprint !== null) invalid();
      throw new StorageCodeQueryError('NOT_INDEXED');
    }
    const revision = await single('revisions', 'repository_id=? AND id=?', [id, state.revisionId]);
    if (!revision) invalid();
    const revisionId = state.revisionId;
    const freshness = readAnalysisFreshness(database, id);
    if (freshness === 'NOT_INDEXED') invalid();
    const context = Object.freeze({
      repositoryId: id,
      revisionId,
      indexedContentFingerprint: state.contentFingerprint,
      freshness: Object.freeze({
        state: freshness,
        basis: 'PERSISTED_SOURCE' as const,
        worktreeObservation: 'NOT_OBSERVED' as const,
      }),
    });
    function scope(row: Row): void {
      if (row.repository_id !== id || row.revision_id !== revisionId) invalid();
    }
    function hasNode(nodeId: string): void {
      if (
        !database
          .prepare(
            'SELECT 1 AS found FROM canonical_nodes WHERE repository_id=? AND revision_id=? AND id=?',
          )
          .get(id, revisionId, nodeId)
      )
        invalid();
    }
    function sourceExists(sourceRange: { sourceFileId: string } | null): void {
      if (
        sourceRange &&
        !database
          .prepare(
            'SELECT 1 AS found FROM source_files WHERE repository_id=? AND revision_id=? AND id=?',
          )
          .get(id, revisionId, sourceRange.sourceFileId)
      )
        invalid();
    }
    function node(row: Row) {
      try {
        scope(row);
        const value = CanonicalNodeSchema.parse({
          id: row.id,
          factKey: row.fact_key,
          repositoryId: row.repository_id,
          revisionId: row.revision_id,
          kind: row.kind,
          ...(row.kind === 'TYPE'
            ? { typeKind: row.type_kind }
            : row.kind === 'SYMBOL'
              ? { symbolKind: row.symbol_kind }
              : {}),
          name: row.name,
          qualifiedName: row.qualified_name,
          sourceRange:
            row.source_range_json === null ? null : JSON.parse(String(row.source_range_json)),
          confidence: {
            score: row.confidence_score,
            method: row.confidence_method,
            reasons: JSON.parse(String(row.confidence_reasons_json)),
          },
        });
        sourceExists(value.sourceRange);
        return value;
      } catch {
        return invalid();
      }
    }
    async function edge(row: Row) {
      scope(row);
      const unresolved =
        row.target_state === 'UNRESOLVED'
          ? await single('unresolved_targets', 'revision_id=? AND edge_id=?', [
              revisionId,
              String(row.id),
            ])
          : null;
      try {
        if (row.target_state === 'UNRESOLVED' && !unresolved) invalid();
        const value = CanonicalEdgeSchema.parse({
          id: row.id,
          factKey: row.fact_key,
          repositoryId: id,
          revisionId,
          kind: row.kind,
          source: { factType: 'NODE', id: row.source_node_id },
          target:
            row.target_state === 'RESOLVED'
              ? {
                  state: 'RESOLVED',
                  resolution: row.resolution,
                  target: { factType: 'NODE', id: row.target_node_id },
                }
              : {
                  state: 'UNRESOLVED',
                  resolution: row.resolution,
                  originalHint: unresolved!.original_hint,
                  candidates: JSON.parse(String(unresolved!.candidates_json)),
                },
          sourceRange:
            row.source_range_json === null ? null : JSON.parse(String(row.source_range_json)),
          confidence: {
            score: row.confidence_score,
            method: row.confidence_method,
            reasons: JSON.parse(String(row.confidence_reasons_json)),
          },
        });
        hasNode(value.source.id);
        if (value.target.state === 'RESOLVED') hasNode(value.target.target.id);
        else for (const candidate of value.target.candidates) hasNode(candidate.id);
        sourceExists(value.sourceRange);
        return value;
      } catch {
        return invalid();
      }
    }
    async function readNode(nodeId: CanonicalId) {
      const selected = await single(
        'canonical_nodes',
        'repository_id=? AND revision_id=? AND id=?',
        [id, revisionId, CanonicalIdSchema.parse(nodeId)],
      );
      return selected === null ? null : node(selected);
    }
    async function* findNodes(name: string, match: 'exact' | 'prefix') {
      if (
        typeof name !== 'string' ||
        name.length === 0 ||
        (match !== 'exact' && match !== 'prefix')
      )
        invalid();
      const predicate =
        match === 'exact'
          ? '(name=? COLLATE BINARY OR qualified_name=? COLLATE BINARY)'
          : '(substr(name,1,length(?))=? COLLATE BINARY OR substr(qualified_name,1,length(?))=? COLLATE BINARY)';
      const names = match === 'exact' ? [name, name] : [name, name, name, name];
      for await (const row of rows(
        'canonical_nodes',
        `repository_id=? AND revision_id=? AND kind IN ('TYPE','SYMBOL') AND ${predicate}`,
        [id, revisionId, ...names],
        'qualified_name COLLATE BINARY, name COLLATE BINARY, kind COLLATE BINARY, id COLLATE BINARY',
      ))
        yield node(row);
    }
    async function* readEdges(
      nodeId: CanonicalId,
      direction: 'INCOMING' | 'OUTGOING',
      kind: CodeEdgeKind | null,
    ) {
      if (direction !== 'INCOMING' && direction !== 'OUTGOING') invalid();
      const selected = CanonicalIdSchema.parse(nodeId);
      const predicate =
        direction === 'INCOMING'
          ? "target_state='RESOLVED' AND target_node_id=?"
          : 'source_node_id=?';
      for await (const row of rows(
        'canonical_edges',
        `repository_id=? AND revision_id=? AND ${predicate}${kind === null ? '' : ' AND kind=?'}`,
        kind === null ? [id, revisionId, selected] : [id, revisionId, selected, kind],
        'id COLLATE BINARY',
      ))
        yield await edge(row);
    }
    async function hasOutgoingCall(nodeId: CanonicalId) {
      await control.checkpoint();
      assertOpen();
      return (
        database
          .prepare(
            "SELECT 1 AS found FROM canonical_edges WHERE repository_id=? AND revision_id=? AND source_node_id=? AND kind='CALL' LIMIT 1",
          )
          .get(id, revisionId, CanonicalIdSchema.parse(nodeId)) !== undefined
      );
    }
    async function* readMetadata(factValue: CanonicalFactRef) {
      const fact = CanonicalFactRefSchema.parse(factValue);
      const selected = await single(
        fact.factType === 'NODE' ? 'canonical_nodes' : 'canonical_edges',
        'repository_id=? AND revision_id=? AND id=?',
        [id, revisionId, fact.id],
      );
      if (!selected) invalid();
      const value = fact.factType === 'NODE' ? node(selected) : await edge(selected);
      if (value.sourceRange) {
        const row = await single('source_files', 'repository_id=? AND revision_id=? AND id=?', [
          id,
          revisionId,
          value.sourceRange.sourceFileId,
        ]);
        if (!row) invalid();
        control.chargeMetadataRow();
        let sourceFile;
        try {
          sourceFile = parseStoredSourceFile(row);
        } catch {
          return invalid();
        }
        yield { kind: 'SOURCE' as const, sourceFile };
      }
      let supported = false;
      // Validate every selected link before filtering ACTIVE support. Otherwise
      // an orphan or foreign-context link disappears behind a valid sibling.
      for await (const link of rows(
        'fact_evidence',
        'fact_type=? AND canonical_fact_id=?',
        [fact.factType, fact.id],
        'evidence_id COLLATE BINARY',
      )) {
        control.chargeMetadataRow();
        let parsedLink;
        try {
          parsedLink = FactEvidenceSchema.parse({
            fact: { factType: link.fact_type, id: link.canonical_fact_id },
            evidenceId: link.evidence_id,
          });
        } catch {
          return invalid();
        }
        const referenced = await single('evidence', 'id=?', [parsedLink.evidenceId]);
        if (
          !referenced ||
          referenced.repository_id !== id ||
          referenced.revision_id !== revisionId ||
          referenced.fact_type !== fact.factType
        )
          invalid();
        try {
          EvidenceSchema.parse({
            id: referenced.id,
            repositoryId: referenced.repository_id,
            revisionId: referenced.revision_id,
            providerSnapshotId: referenced.provider_snapshot_id,
            status: referenced.status,
            providerFact: {
              factType: referenced.fact_type,
              providerId: referenced.provider_id,
              providerFactId: referenced.provider_fact_id,
            },
          });
        } catch {
          return invalid();
        }
      }
      const filter = `repository_id=? AND revision_id=? AND status='ACTIVE' AND id IN (SELECT evidence_id FROM fact_evidence WHERE fact_type=? AND canonical_fact_id=?)`;
      for await (const row of rows(
        'evidence',
        filter,
        [id, revisionId, fact.factType, fact.id],
        'id COLLATE BINARY',
      )) {
        control.chargeMetadataRow();
        let evidence;
        try {
          evidence = EvidenceSchema.parse({
            id: row.id,
            repositoryId: row.repository_id,
            revisionId: row.revision_id,
            providerSnapshotId: row.provider_snapshot_id,
            status: row.status,
            providerFact: {
              factType: row.fact_type,
              providerId: row.provider_id,
              providerFactId: row.provider_fact_id,
            },
          });
        } catch {
          return invalid();
        }
        const bindingRow = await single(
          'provider_fact_bindings',
          'evidence_id=? AND fact_type=? AND canonical_fact_id=?',
          [evidence.id, fact.factType, fact.id],
        );
        const snapshotRow = await single(
          'provider_snapshots',
          'repository_id=? AND requested_revision_id=? AND id=?',
          [id, revisionId, evidence.providerSnapshotId],
        );
        if (!bindingRow || !snapshotRow) invalid();
        let binding;
        let fullSnapshot;
        try {
          binding = ProviderFactBindingSchema.parse({
            evidenceId: bindingRow.evidence_id,
            providerSnapshotId: bindingRow.provider_snapshot_id,
            canonicalFact: { factType: bindingRow.fact_type, id: bindingRow.canonical_fact_id },
            providerFact: {
              factType: bindingRow.fact_type,
              providerId: bindingRow.provider_id,
              providerFactId: bindingRow.provider_fact_id,
            },
          });
          if (
            evidence.providerFact.factType !== fact.factType ||
            binding.providerFact.providerId !== evidence.providerFact.providerId ||
            binding.providerFact.providerFactId !== evidence.providerFact.providerFactId ||
            binding.providerSnapshotId !== evidence.providerSnapshotId ||
            snapshotRow.provider_id !== evidence.providerFact.providerId
          )
            invalid();
          fullSnapshot = ProviderSnapshotSchema.parse({
            id: snapshotRow.id,
            repositoryId: snapshotRow.repository_id,
            providerId: snapshotRow.provider_id,
            providerVersion: snapshotRow.provider_version,
            runtimeVersion: snapshotRow.runtime_version,
            requestedRevisionId: snapshotRow.requested_revision_id,
            requestedRevisionFingerprint: snapshotRow.requested_revision_fingerprint,
            startedAt: epochMillisecondsToUtcInstant(
              EpochMillisecondsSchema.parse(snapshotRow.started_at),
            ),
            completedAt: epochMillisecondsToUtcInstant(
              EpochMillisecondsSchema.parse(snapshotRow.completed_at),
            ),
            outcome: snapshotRow.outcome,
            capabilities: [],
            diagnostics: [],
          });
          if (fullSnapshot.outcome !== 'SUCCEEDED') invalid();
        } catch {
          return invalid();
        }
        supported = true;
        const snapshot = {
          id: fullSnapshot.id,
          repositoryId: fullSnapshot.repositoryId,
          requestedRevisionId: fullSnapshot.requestedRevisionId,
          requestedRevisionFingerprint: fullSnapshot.requestedRevisionFingerprint,
          startedAt: fullSnapshot.startedAt,
          completedAt: fullSnapshot.completedAt,
          outcome: fullSnapshot.outcome,
        };
        yield { kind: 'SUPPORT' as const, fact, evidence, binding, snapshot };
        for await (const capabilityRow of rows(
          'provider_capabilities',
          'snapshot_id=?',
          [snapshot.id],
          'name COLLATE BINARY',
        )) {
          let capability;
          try {
            capability = ProviderCapabilityObservationSchema.parse({
              name: capabilityRow.name,
              support: capabilityRow.support,
              coverage: capabilityRow.coverage,
            });
          } catch {
            return invalid();
          }
          let found = false;
          for await (const coverageRow of rows(
            'analysis_coverage',
            'provider_snapshot_id=? AND capability_name=? AND (source_file_id IS NULL OR source_file_id=?)',
            [snapshot.id, capability.name, value.sourceRange?.sourceFileId ?? ''],
            'source_file_id COLLATE BINARY, id',
          )) {
            control.chargeMetadataRow();
            found = true;
            let status;
            try {
              status = ProviderCoverageStatusSchema.parse(coverageRow.status);
            } catch {
              return invalid();
            }
            if (
              typeof coverageRow.id !== 'number' ||
              !Number.isSafeInteger(coverageRow.id) ||
              coverageRow.id <= 0
            )
              invalid();
            const sourceFileId =
              coverageRow.source_file_id === null
                ? null
                : EntityIdSchema.parse(coverageRow.source_file_id);
            yield {
              kind: 'COVERAGE' as const,
              snapshot,
              capability: capability.name,
              support: capability.support,
              capabilityCoverage: capability.coverage,
              sourceFileId,
              rowId: coverageRow.id,
              fileCoverage: status,
            };
          }
          if (!found) {
            control.chargeMetadataRow();
            yield {
              kind: 'COVERAGE' as const,
              snapshot,
              capability: capability.name,
              support: capability.support,
              capabilityCoverage: capability.coverage,
              sourceFileId: null,
              rowId: null,
              fileCoverage: null,
            };
          }
        }
      }
      if (!supported) invalid();
    }
    return { context, readNode, findNodes, readEdges, hasOutgoingCall, readMetadata, close };
  } catch (error) {
    close();
    throw error;
  }
}
