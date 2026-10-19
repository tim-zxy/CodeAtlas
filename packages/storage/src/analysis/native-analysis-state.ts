import type { RepositoryAnalysisStage } from './temp-stage.js';
import type { PatchSupport } from './patch-stage.js';
import type { DatabaseSync } from 'node:sqlite';
import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderSnapshotSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderFactBinding,
  type ProviderSnapshot,
  type SourceFile,
} from '@codeatlas/ir';
import { parseStoredSourceFile } from '../source-state/repository.js';
import { SourceStateError } from '../source-state/errors.js';
import {
  nativeApplySqlTokenObserver,
  nativeApplySqlSupportsObserver,
  nativeSqlSourceRole,
  beginNativeSqlSourceDomain,
  replaceNativeSqlSourceDomain,
  endNativeSqlSourceDomain,
  bindNativeSqlSourceDomain,
  proveNativeSqlDisposition,
  type NativeSqlDomainHandle,
} from './native-apply-sql-observation.js';

export interface NativeStateLimits {
  readonly maxSerializedBytes: number;
  readonly memoryBudgetBytes: number;
  /** Runtime-owned reviewed workspace reservation, not SQL representation bytes.
   * Absent for legacy/component callers; never supplied by Native IPC.
   */
  readonly workspaceReservationBytes?: number;
}
export interface NativeActivationToken {
  readonly committedSnapshotCount: number;
  readonly indexedRevisionId: string | null;
  readonly indexedContentFingerprint: string | null;
  readonly states: readonly {
    readonly providerId: string;
    readonly snapshotId: string;
    readonly summaryDigest: string;
  }[];
}
export interface NativeStateExpectation {
  readonly repositoryId: string;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly revisionId: string;
  readonly contentFingerprint: string;
  readonly language: {
    readonly languageId: string;
    readonly grammarVersion: string;
    readonly analyzerVersion: string;
    readonly compatibilityVersion: string;
  };
  readonly resolverVersion: string;
  readonly normalizerVersion: string;
  readonly policyFingerprint: string;
  readonly requestedCapabilities: readonly string[];
}
export interface NativeStateJsonFile {
  readonly sourceFileId: string;
  readonly sourcePath: string;
  readonly contentFingerprint: string;
  readonly summaryJson: string;
}
export interface ValidatedNativeState {
  readonly expected: NativeStateExpectation;
  readonly headerJson: string;
  readonly summaryDigest: string;
  readonly files: readonly NativeStateJsonFile[];
}
export interface NativeStateValidationInput extends NativeStateLimits {
  readonly headerJson: string;
  readonly files: Iterable<NativeStateJsonFile>;
  readonly expected: NativeStateExpectation;
  readonly fullStage?: Pick<
    RepositoryAnalysisStage,
    | 'readSourceFiles'
    | 'readProviderNodes'
    | 'readProviderEdges'
    | 'readCoverage'
    | 'readDiagnostics'
  >;
}
export type NativeStateValidationPort = (input: NativeStateValidationInput) => ValidatedNativeState;
export type NativeBaselineResult =
  | {
      readonly status: 'AVAILABLE';
      readonly state: ValidatedNativeState;
      readonly token: NativeActivationToken;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason:
        'MISSING' | 'INCOMPATIBLE' | 'INVALID' | 'RESOURCE_LIMIT_EXCEEDED' | 'NOT_APPLICABLE';
    };

export type NativeRefreshReadResult =
  | (Extract<NativeBaselineResult, { status: 'AVAILABLE' }> & {
      readonly targetSourceFiles: readonly SourceFile[];
    })
  | Extract<NativeBaselineResult, { status: 'UNAVAILABLE' }>;

/** Logical SQL-field ownership at selected read handoffs, not V8 heap/RSS. */
export interface NativeReadSqlOwnership {
  readonly scope: 'BASELINE_READ_SQL_OWNERSHIP_ONLY' | 'REFRESH_READ_SQL_OWNERSHIP_ONLY';
  readonly phase:
    | 'INVENTORY_PREFIX'
    | 'BASELINE_PREFIX'
    | 'VALIDATED_BASELINE'
    | 'TOKEN_ROW'
    | 'TOKEN_ACCEPTED'
    | 'TOKEN_RETURN'
    | 'STATE_CLONE_BEGIN'
    | 'STATE_CLONE_END'
    | 'BASELINE_RETURN'
    | 'RETURN';
  readonly retainedSqlBytes: number;
  readonly retainedSqlStringChargeBytes: number;
}

/** Exact per-support history, not a selected Canonical representative or raw fact.
 * Snapshot observations are deliberately excluded: only provenance is exposed.
 */
export interface NativePatchActiveSupport {
  readonly canonical: CanonicalNode | CanonicalEdge;
  readonly evidence: Evidence;
  readonly binding: ProviderFactBinding;
  readonly factEvidence: FactEvidence;
  readonly snapshot: Pick<
    ProviderSnapshot,
    | 'id'
    | 'repositoryId'
    | 'providerId'
    | 'providerVersion'
    | 'requestedRevisionId'
    | 'requestedRevisionFingerprint'
    | 'outcome'
  >;
}

/** Provider-independent structural injection contract. Runtime supplies the
 * accepted baseline/inventory and the mandatory Provider-owned validation port.
 */
export interface NativePatchContext {
  readonly baseline: ValidatedNativeState;
  readonly targetSourceFiles: readonly SourceFile[];
}
export interface NativePatchOverlayInput extends NativeStateLimits {
  readonly expected: NativeStateExpectation;
  readonly baseline: ValidatedNativeState;
  readonly baselineToken: NativeActivationToken;
  readonly snapshot: ProviderSnapshot;
  readonly headerJson: string;
  readonly files: Iterable<NativeStateJsonFile>;
  readonly targetSourceFiles: Iterable<SourceFile>;
  readonly changedSourceFiles: Iterable<SourceFile>;
  readonly activeSupports: Iterable<NativePatchActiveSupport>;
  readonly upsertNodes: Iterable<import('@codeatlas/ir').ProviderNode>;
  readonly upsertEdges: Iterable<import('@codeatlas/ir').ProviderEdge>;
  readonly removeNodes: Iterable<import('@codeatlas/ir').ProviderFactRef>;
  readonly removeEdges: Iterable<import('@codeatlas/ir').ProviderFactRef>;
  readonly normalizedNodes: Iterable<{
    readonly provider: import('@codeatlas/ir').ProviderFactRef;
    readonly canonical: CanonicalNode;
  }>;
  readonly normalizedEdges: Iterable<{
    readonly provider: import('@codeatlas/ir').ProviderFactRef;
    readonly canonical: CanonicalEdge;
  }>;
  readonly supports: Iterable<PatchSupport>;
  readonly coverage: Iterable<unknown>;
  readonly diagnostics: Iterable<unknown>;
}
export type NativePatchValidationPort = (input: NativePatchOverlayInput) => ValidatedNativeState;

/** Storage-owned, bounded support view for the Provider overlay port. Includes
 * other Providers so target validation cannot overlook their dangling support.
 * This attests history only; source-range retirement/target checks belong to the
 * overlay and Store. No graph, summary or activation pointer is written here.
 */
export function readNativePatchActiveSupports(
  db: DatabaseSync,
  expected: Pick<NativeStateExpectation, 'repositoryId' | 'revisionId'>,
  limits: NativeStateLimits,
  onSqlAdmission?: (retainedSqlBytes: number) => void,
): { readonly retainedSqlBytes: number; readonly supports: readonly NativePatchActiveSupport[] } {
  assertNativeStateLimits(limits);
  return transaction(db, () => {
    const columns = {
      evidence_id: 'e.id',
      repository_id: 'e.repository_id',
      revision_id: 'e.revision_id',
      evidence_snapshot: 'e.provider_snapshot_id',
      evidence_type: 'e.fact_type',
      evidence_provider: 'e.provider_id',
      evidence_fact: 'e.provider_fact_id',
      status: 'e.status',
      binding_type: 'b.fact_type',
      binding_provider: 'b.provider_id',
      binding_fact: 'b.provider_fact_id',
      binding_snapshot: 'b.provider_snapshot_id',
      binding_canonical: 'b.canonical_fact_id',
      candidate_type: 'c.fact_type',
      candidate_canonical: 'c.canonical_fact_id',
      candidate_json: 'c.candidate_json',
      link_type: 'f.fact_type',
      link_canonical: 'f.canonical_fact_id',
      snapshot_id: 's.id',
      snapshot_repo: 's.repository_id',
      snapshot_provider: 's.provider_id',
      snapshot_version: 's.provider_version',
      runtime_version: 's.runtime_version',
      snapshot_revision: 's.requested_revision_id',
      snapshot_fingerprint: 's.requested_revision_fingerprint',
      snapshot_outcome: 's.outcome',
      node_key: 'n.fact_key',
      edge_key: 'g.fact_key',
    };
    // LEFT joins retain missing chains; inner joins would silently hide orphans.
    const from = `FROM evidence e
      LEFT JOIN provider_fact_bindings b ON b.evidence_id=e.id
      LEFT JOIN active_support_candidates c ON c.evidence_id=e.id
      LEFT JOIN fact_evidence f ON f.evidence_id=e.id
      LEFT JOIN provider_snapshots s ON s.id=e.provider_snapshot_id
      LEFT JOIN canonical_nodes n ON b.fact_type='NODE' AND n.id=b.canonical_fact_id
        AND n.repository_id=e.repository_id AND n.revision_id=e.revision_id
      LEFT JOIN canonical_edges g ON b.fact_type='EDGE' AND g.id=b.canonical_fact_id
        AND g.repository_id=e.repository_id AND g.revision_id=e.revision_id
      WHERE e.repository_id=? AND e.revision_id=? AND e.status='ACTIVE'`;
    const args = [expected.repositoryId, expected.revisionId];
    const length = sqlLengths(Object.values(columns));
    const sizes = db
      .prepare(
        `SELECT count(*) AS n, coalesce(sum(${length}),0) AS bytes,
      coalesce(max(${length}),0) AS maximum ${from}`,
      )
      .get(...args)!;
    if (
      ![sizes.n, sizes.bytes, sizes.maximum].every(
        (n) => Number.isSafeInteger(n) && (n as number) >= 0,
      )
    )
      throw new Error('Invalid native active support size');
    const bytes = sizes.bytes as number,
      count = sizes.n as number;
    // Support rows are not the serialized summary bundle. Bound every retained
    // row before TEXT; their aggregate uses the existing twice-SQL budget below.
    if ((sizes.maximum as number) > limits.maxSerializedBytes)
      throw new Error('Native active support resource limit exceeded');
    assertNativeStringBudget(bytes, limits);
    if (count > bytes) throw new Error('Invalid native active support count');
    // Owner-local accounting before TEXT: a later decoding failure must not
    // erase the admitted SQL overlap. Refused/unsafe sizes never reach here.
    onSqlAdmission?.(bytes);
    const onSqlOwnership = nativeApplySqlSupportsObserver();
    let returnedSqlBytes = 0;
    const invalid = (): never => {
      throw new Error('Invalid native active support chain');
    };
    const supports: NativePatchActiveSupport[] = [],
      evidenceIds = new Set<string>(),
      identities = new Set<string>();
    const rows = db
      .prepare(
        `SELECT ${Object.entries(columns)
          .map(([alias, column]) => `${column} AS ${alias}`)
          .join(',')},
      s.started_at, s.completed_at ${from} ORDER BY e.provider_id,e.fact_type,e.provider_fact_id,e.id`,
      )
      .iterate(...args);
    for (const row of rows) {
      const rawSqlBytes = onSqlOwnership ? stringBytes(...Object.values(row)) : 0;
      onSqlOwnership?.('ACTIVE_SUPPORT_ROW', returnedSqlBytes + rawSqlBytes);
      let support: NativePatchActiveSupport;
      try {
        const evidence = EvidenceSchema.parse({
          id: row.evidence_id,
          repositoryId: row.repository_id,
          revisionId: row.revision_id,
          providerSnapshotId: row.evidence_snapshot,
          status: row.status,
          providerFact: {
            factType: row.evidence_type,
            providerId: row.evidence_provider,
            providerFactId: row.evidence_fact,
          },
        });
        const binding = ProviderFactBindingSchema.parse({
          evidenceId: evidence.id,
          providerSnapshotId: row.binding_snapshot,
          providerFact: {
            factType: row.binding_type,
            providerId: row.binding_provider,
            providerFactId: row.binding_fact,
          },
          canonicalFact: { factType: row.binding_type, id: row.binding_canonical },
        });
        const factEvidence = FactEvidenceSchema.parse({
          evidenceId: evidence.id,
          fact: { factType: row.link_type, id: row.link_canonical },
        });
        if (typeof row.candidate_json !== 'string') invalid();
        const canonical = (
          evidence.providerFact.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema
        ).parse(JSON.parse(row.candidate_json as string));
        if (!Number.isSafeInteger(row.started_at) || !Number.isSafeInteger(row.completed_at))
          invalid();
        // Reuse IR scalar/time schemas, not fabricated empty snapshot observations.
        const schema = ProviderSnapshotSchema.shape;
        const startedAt = schema.startedAt.parse(new Date(row.started_at as number).toISOString());
        const completedAt = schema.completedAt.parse(
          new Date(row.completed_at as number).toISOString(),
        );
        schema.runtimeVersion.parse(row.runtime_version);
        if (completedAt < startedAt) invalid();
        const snapshot = {
          id: schema.id.parse(row.snapshot_id),
          repositoryId: schema.repositoryId.parse(row.snapshot_repo),
          providerId: schema.providerId.parse(row.snapshot_provider),
          providerVersion: schema.providerVersion.parse(row.snapshot_version),
          requestedRevisionId: schema.requestedRevisionId.parse(row.snapshot_revision),
          requestedRevisionFingerprint: schema.requestedRevisionFingerprint.parse(
            row.snapshot_fingerprint,
          ),
          outcome: schema.outcome.parse(row.snapshot_outcome),
        };
        if (
          binding.providerFact.factType !== evidence.providerFact.factType ||
          binding.providerFact.providerId !== evidence.providerFact.providerId ||
          binding.providerFact.providerFactId !== evidence.providerFact.providerFactId ||
          binding.providerSnapshotId !== evidence.providerSnapshotId ||
          row.candidate_type !== binding.canonicalFact.factType ||
          row.candidate_canonical !== binding.canonicalFact.id ||
          canonical.id !== binding.canonicalFact.id ||
          canonical.repositoryId !== expected.repositoryId ||
          canonical.revisionId !== expected.revisionId ||
          canonical.factKey !==
            (binding.canonicalFact.factType === 'NODE' ? row.node_key : row.edge_key) ||
          factEvidence.fact.factType !== binding.canonicalFact.factType ||
          factEvidence.fact.id !== canonical.id ||
          snapshot.repositoryId !== expected.repositoryId ||
          snapshot.requestedRevisionId !== expected.revisionId ||
          snapshot.providerId !== evidence.providerFact.providerId ||
          snapshot.outcome !== 'SUCCEEDED'
        )
          invalid();
        const identity = JSON.stringify(evidence.providerFact);
        if (evidenceIds.has(evidence.id) || identities.has(identity)) invalid();
        evidenceIds.add(evidence.id);
        identities.add(identity);
        support = { canonical, evidence, binding, factEvidence, snapshot };
      } catch {
        invalid();
      }
      supports.push(support!);
      // Schema results reuse these actual SQL scalar fields. Evidence IDs reused
      // by binding/link and Set entries are aliases, not extra materializations.
      // Parsed candidate JSON and generated identity/time strings are workspace.
      onSqlOwnership?.('ACTIVE_SUPPORT_ACCEPTED', returnedSqlBytes + rawSqlBytes);
      if (onSqlOwnership)
        returnedSqlBytes += stringBytes(
          row.evidence_id,
          row.repository_id,
          row.revision_id,
          row.evidence_snapshot,
          row.evidence_type,
          row.evidence_provider,
          row.evidence_fact,
          row.status,
          row.binding_type,
          row.binding_provider,
          row.binding_fact,
          row.binding_snapshot,
          row.binding_canonical,
          row.link_type,
          row.link_canonical,
          row.snapshot_id,
          row.snapshot_repo,
          row.snapshot_provider,
          row.snapshot_version,
          row.snapshot_revision,
          row.snapshot_fingerprint,
          row.snapshot_outcome,
        );
    }
    if (supports.length !== count) invalid();
    // A Canonical fact with no ACTIVE binding cannot appear in the support join.
    for (const [type, table] of [
      ['NODE', 'canonical_nodes'],
      ['EDGE', 'canonical_edges'],
    ] as const) {
      if (
        db
          .prepare(
            `SELECT count(*) AS n FROM ${table} a
        WHERE a.repository_id=? AND a.revision_id=? AND NOT EXISTS (
          SELECT 1 FROM provider_fact_bindings b JOIN evidence e ON e.id=b.evidence_id
          WHERE b.fact_type=? AND b.canonical_fact_id=a.id AND e.repository_id=a.repository_id
            AND e.revision_id=a.revision_id AND e.status='ACTIVE')`,
          )
          .get(...args, type)?.n !== 0
      )
        invalid();
    }
    // All values are owned schema results. Freeze in place rather than making
    // another complete copy of the bounded support view.
    const result = { retainedSqlBytes: bytes, supports };
    const pending: object[] = [result];
    while (pending.length) {
      const next = pending.pop()!;
      Object.freeze(next);
      for (const value of Object.values(next))
        if (value !== null && typeof value === 'object') pending.push(value);
    }
    onSqlOwnership?.('ACTIVE_SUPPORT_RETURN', returnedSqlBytes);
    return result;
  });
}

/** The indexed baseline and current complete inventory must share one read snapshot.
 * Source reconciliation can advance current metadata without activating the graph.
 */
export function readNativeRefreshBaseline(
  db: DatabaseSync,
  expectedTarget: NativeStateExpectation,
  validate: NativeStateValidationPort,
  limits: NativeStateLimits,
  onInventorySqlRetention?: (retainedSqlBytes: number) => void,
  onReadSqlRetention?: (retainedSqlBytes: number) => void,
  onSqlOwnership?: (observation: NativeReadSqlOwnership) => void,
): NativeRefreshReadResult {
  const role = nativeSqlSourceRole();
  if (role === null)
    return readNativeRefreshBaselineSql(
      db,
      expectedTarget,
      validate,
      limits,
      onInventorySqlRetention,
      onReadSqlRetention,
      onSqlOwnership,
    );
  let handle: NativeSqlDomainHandle | null = null;
  let handedOff = false;
  const census = (bytes: number) => {
    if (handle === null) handle = beginNativeSqlSourceDomain('BASELINE_READ', role, bytes);
    else replaceNativeSqlSourceDomain(handle, bytes);
  };
  try {
    // The existing outer record already includes the nested baseline/token census.
    // Do not attach a second observer to the inner reader or add its peak.
    const result = readNativeRefreshBaselineSql(
      db,
      expectedTarget,
      validate,
      limits,
      onInventorySqlRetention,
      onReadSqlRetention,
      (record) => {
        census(record.retainedSqlBytes);
        onSqlOwnership?.(record);
      },
      census,
    );
    if (result.status === 'AVAILABLE' && handle !== null) {
      bindNativeSqlSourceDomain(result, handle);
      handedOff = true;
    }
    return result;
  } finally {
    if (!handedOff && handle !== null) endNativeSqlSourceDomain(handle);
  }
}

function readNativeRefreshBaselineSql(
  db: DatabaseSync,
  expectedTarget: NativeStateExpectation,
  validate: NativeStateValidationPort,
  limits: NativeStateLimits,
  /** Trusted owner observation of outer pointer/revision/inventory SQL fields
   * after each read, before decoding. Excludes nested baseline/token reads and
   * copies; not an admission footprint, heap peak or complete-lifecycle total.
   */
  onInventorySqlRetention?: (retainedSqlBytes: number) => void,
  onReadSqlRetention?: (retainedSqlBytes: number) => void,
  onSqlOwnership?: (observation: NativeReadSqlOwnership) => void,
  onSourceCensus?: (bytes: number) => void,
): NativeRefreshReadResult {
  assertNativeStateLimits(limits);
  if (typeof validate !== 'function') throw new TypeError('Native validation port is required');
  const unavailable = (
    reason: Extract<NativeBaselineResult, { status: 'UNAVAILABLE' }>['reason'],
  ): NativeRefreshReadResult => ({ status: 'UNAVAILABLE', reason });
  const result: NativeRefreshReadResult = transaction(db, () => {
    const version = db.prepare('PRAGMA user_version').get()?.user_version;
    if (!Number.isSafeInteger(version)) return unavailable('INVALID');
    if ((version as number) < 10) return unavailable('MISSING');
    if (
      db
        .prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('native_analysis_state','native_analysis_file','active_support_candidates')",
        )
        .get()?.n !== 3
    )
      return unavailable('INVALID');
    const repo = expectedTarget.repositoryId;
    const revisionId = expectedTarget.revisionId;
    const retainedStrings =
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['id', 'repository_id', 'revision_id', 'path', 'content_fingerprint', 'role', 'provenance', 'content_kind', 'language_hint', 'sensitivity'])}),0) AS bytes FROM source_files WHERE repository_id=? AND revision_id=?`,
        repo,
        revisionId,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['id', 'repository_id', 'kind', 'content_fingerprint', 'base_revision_id'])}),0) AS bytes FROM revisions WHERE repository_id=? AND id=?`,
        repo,
        revisionId,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['indexed_revision_id', 'indexed_content_fingerprint'])}),0) AS bytes FROM repository_state WHERE repository_id=?`,
        repo,
      );
    const count = db
      .prepare('SELECT count(*) AS n FROM source_files WHERE repository_id=? AND revision_id=?')
      .get(repo, revisionId)?.n;
    if (
      !Number.isSafeInteger(retainedStrings) ||
      retainedStrings > limits.maxSerializedBytes ||
      !nativeStringBudgetFits(retainedStrings, limits) ||
      2 * retainedStrings >= limits.memoryBudgetBytes
    ) {
      const role = nativeSqlSourceRole();
      if (role !== null)
        proveNativeSqlDisposition(
          'BASELINE_READ',
          role,
          'PROVEN_NO_TEXT',
          'Refresh inventory numeric preflight refused before selected TEXT reads',
        );
      return unavailable('RESOURCE_LIMIT_EXCEEDED');
    }
    if (
      !Number.isSafeInteger(count) ||
      (count as number) < 0 ||
      (count as number) > retainedStrings
    )
      return unavailable('INVALID');
    let inventorySqlBytes = 0;
    const observeInventory = (...values: unknown[]) => {
      if (!onInventorySqlRetention && !onReadSqlRetention && !onSqlOwnership) return;
      for (const value of values)
        if (typeof value === 'string') inventorySqlBytes += Buffer.byteLength(value);
      onSourceCensus?.(inventorySqlBytes);
      onInventorySqlRetention?.(inventorySqlBytes);
      onReadSqlRetention?.(inventorySqlBytes);
      if (onSqlOwnership)
        emitReadSqlOwnership(
          onSqlOwnership,
          'REFRESH_READ_SQL_OWNERSHIP_ONLY',
          'INVENTORY_PREFIX',
          inventorySqlBytes,
        );
    };
    const indexed = pointer(db, repo);
    if (indexed) observeInventory(indexed.indexed_revision_id, indexed.indexed_content_fingerprint);
    if (!indexed?.indexed_revision_id || !indexed.indexed_content_fingerprint)
      return unavailable('MISSING');
    if (indexed.indexed_revision_id !== revisionId) return unavailable('NOT_APPLICABLE');
    const revision = db
      .prepare('SELECT kind,content_fingerprint FROM revisions WHERE repository_id=? AND id=?')
      .get(repo, revisionId);
    if (revision) observeInventory(revision.kind, revision.content_fingerprint);
    if (!revision || revision.kind !== 'WORKTREE') return unavailable('NOT_APPLICABLE');
    if (revision.content_fingerprint !== expectedTarget.contentFingerprint)
      return unavailable('INVALID');
    const targetSourceFiles: SourceFile[] = [];
    for (const row of db
      .prepare('SELECT * FROM source_files WHERE repository_id=? AND revision_id=? ORDER BY path')
      .iterate(repo, revisionId)) {
      // The current raw row coexists with the accepted decoded prefix. Decoding
      // copies wrappers, not a second independent SQL string representation.
      // Keep the owner callback outside the pure decoder's error catch.
      observeInventory(
        row.id,
        row.repository_id,
        row.revision_id,
        row.path,
        row.content_fingerprint,
        row.role,
        row.provenance,
        row.content_kind,
        row.language_hint,
        row.sensitivity,
      );
      // Only pure row decoding is caught. SQLite read/I/O/lock errors propagate.
      try {
        targetSourceFiles.push(parseStoredSourceFile(row));
      } catch (error) {
        if (error instanceof SourceStateError) return unavailable('INVALID');
        throw error;
      }
    }
    if (targetSourceFiles.length !== count) return unavailable('INVALID');
    const missingCandidate = db
      .prepare(
        `SELECT count(*) AS n FROM provider_fact_bindings b
      JOIN evidence e ON e.id=b.evidence_id
      LEFT JOIN active_support_candidates c ON c.evidence_id=e.id
      WHERE e.repository_id=? AND e.revision_id=? AND e.provider_id=? AND e.status='ACTIVE' AND c.evidence_id IS NULL`,
      )
      .get(repo, revisionId, expectedTarget.providerId)?.n;
    if (missingCandidate !== 0) return unavailable('MISSING');
    const result = readNativeAnalysisStateOwned(
      db,
      { ...expectedTarget, contentFingerprint: indexed.indexed_content_fingerprint },
      validate,
      { ...limits, memoryBudgetBytes: limits.memoryBudgetBytes - 2 * retainedStrings },
      onReadSqlRetention ? (bytes) => onReadSqlRetention(inventorySqlBytes + bytes) : undefined,
      onSqlOwnership
        ? (observation) =>
            emitReadSqlOwnership(
              onSqlOwnership,
              'REFRESH_READ_SQL_OWNERSHIP_ONLY',
              observation.phase === 'RETURN' ? 'BASELINE_RETURN' : observation.phase,
              inventorySqlBytes + observation.retainedSqlBytes,
            )
        : undefined,
      onSourceCensus ? (bytes) => onSourceCensus(inventorySqlBytes + bytes) : undefined,
    );
    if (result.status !== 'AVAILABLE') return result;
    for (const file of targetSourceFiles) {
      Object.freeze(file.classification);
      Object.freeze(file);
    }
    return Object.freeze({ ...result, targetSourceFiles: Object.freeze(targetSourceFiles) });
  });
  if (onSqlOwnership && result.status === 'AVAILABLE')
    emitReadSqlOwnership(
      onSqlOwnership,
      'REFRESH_READ_SQL_OWNERSHIP_ONLY',
      'RETURN',
      stateSqlBytes(result.state) +
        activationSqlBytes(result.token) +
        sourceSqlBytes(result.targetSourceFiles),
    );
  return result;
}

export function assertNativeStateLimits(limits: NativeStateLimits): void {
  if (
    !limits ||
    !Number.isSafeInteger(limits.maxSerializedBytes) ||
    limits.maxSerializedBytes <= 0 ||
    limits.maxSerializedBytes > 1_000_000 ||
    !Number.isSafeInteger(limits.memoryBudgetBytes) ||
    limits.memoryBudgetBytes <= 0 ||
    (limits.workspaceReservationBytes !== undefined &&
      (!Number.isSafeInteger(limits.workspaceReservationBytes) ||
        limits.workspaceReservationBytes < 0))
  )
    throw new TypeError('Invalid native metadata limits');
}

function nativeStringBudgetFits(bytes: number, limits: NativeStateLimits): boolean {
  const charge = 2 * bytes;
  const total = charge + (limits.workspaceReservationBytes ?? 0);
  return (
    Number.isSafeInteger(bytes) &&
    bytes >= 0 &&
    Number.isSafeInteger(charge) &&
    Number.isSafeInteger(total) &&
    total <= limits.memoryBudgetBytes
  );
}

/** Twice SQL UTF-8 plus the Runtime-owned measured workspace reservation. */
export function assertNativeStringBudget(bytes: number, limits: NativeStateLimits): void {
  assertNativeStateLimits(limits);
  if (!nativeStringBudgetFits(bytes, limits))
    throw new Error('Native metadata resource limit exceeded');
}

export function immutableNativeState(value: ValidatedNativeState): ValidatedNativeState {
  const copy = structuredClone(value);
  const pending: object[] = [copy];
  while (pending.length) {
    const next = pending.pop()!;
    if (Object.isFrozen(next)) continue;
    Object.freeze(next);
    for (const nested of Object.values(next))
      if (nested !== null && typeof nested === 'object') pending.push(nested);
  }
  return copy;
}

function stringBytes(...values: unknown[]): number {
  let bytes = 0;
  for (const value of values) if (typeof value === 'string') bytes += Buffer.byteLength(value);
  return bytes;
}
function stateSqlBytes(state: ValidatedNativeState): number {
  let bytes = stringBytes(state.headerJson, state.summaryDigest);
  for (const file of state.files)
    bytes += stringBytes(
      file.sourceFileId,
      file.sourcePath,
      file.contentFingerprint,
      file.summaryJson,
    );
  return bytes;
}
function activationSqlBytes(value: NativeActivationToken): number {
  let bytes = stringBytes(value.indexedRevisionId, value.indexedContentFingerprint);
  for (const state of value.states)
    bytes += stringBytes(state.providerId, state.snapshotId, state.summaryDigest);
  return bytes;
}
function sourceSqlBytes(files: readonly SourceFile[]): number {
  let bytes = 0;
  for (const file of files)
    bytes += stringBytes(
      file.id,
      file.repositoryId,
      file.revisionId,
      file.path,
      file.contentFingerprint,
      file.classification.role,
      file.classification.provenance,
      file.classification.contentKind,
      file.languageHint,
      file.sensitivity,
    );
  return bytes;
}
function emitReadSqlOwnership(
  observe: (observation: NativeReadSqlOwnership) => void,
  scope: NativeReadSqlOwnership['scope'],
  phase: NativeReadSqlOwnership['phase'],
  retainedSqlBytes: number,
): void {
  const retainedSqlStringChargeBytes = 2 * retainedSqlBytes;
  if (
    !Number.isSafeInteger(retainedSqlBytes) ||
    retainedSqlBytes < 0 ||
    !Number.isSafeInteger(retainedSqlStringChargeBytes)
  )
    throw new Error('Invalid native SQL ownership measurement');
  observe(Object.freeze({ scope, phase, retainedSqlBytes, retainedSqlStringChargeBytes }));
}

type StateRow = {
  repository_id: string;
  provider_id: string;
  provider_snapshot_id: string;
  revision_id: string;
  content_fingerprint: string;
  header_json: string;
};
type PointerRow = {
  indexed_revision_id: string | null;
  indexed_content_fingerprint: string | null;
};
type SnapshotRow = {
  id: string;
  repository_id: string;
  provider_id: string;
  provider_version: string;
  requested_revision_id: string;
  requested_revision_fingerprint: string;
  outcome: string;
};

function transaction<T>(db: DatabaseSync, run: () => T): T {
  const own = !db.isTransaction;
  if (own) db.exec('BEGIN');
  try {
    const result = run();
    if (own) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (own && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
function size(db: DatabaseSync, sql: string, ...args: string[]): number {
  const row = db.prepare(sql).get(...args) as { bytes: number };
  if (!Number.isSafeInteger(row.bytes) || row.bytes < 0) throw new Error('Invalid native SQL size');
  return row.bytes;
}
function sqlLengths(columns: readonly string[]): string {
  return columns.map((column) => `coalesce(length(CAST(${column} AS BLOB)), 0)`).join(' + ');
}
function pointer(db: DatabaseSync, repositoryId: string): PointerRow | undefined {
  return db
    .prepare(
      'SELECT indexed_revision_id, indexed_content_fingerprint FROM repository_state WHERE repository_id=?',
    )
    .get(repositoryId) as PointerRow | undefined;
}
function token(
  db: DatabaseSync,
  repositoryId: string,
  active: PointerRow | undefined,
  onStateRow?: (row: StateRow) => void,
  onSqlOwnership?: (phase: NativeReadSqlOwnership['phase'], bytes: number) => void,
  onSourceCensus?: (bytes: number) => void,
): NativeActivationToken {
  // Validated full/patch Apply appends one snapshot inside its activation
  // transaction. Count also detects legacy activations when no derived header
  // exists and the indexed fingerprint is unchanged; no rowid/time ordering.
  const committedSnapshotCount = db
    .prepare('SELECT count(*) AS n FROM provider_snapshots WHERE repository_id=?')
    .get(repositoryId)?.n;
  if (!Number.isSafeInteger(committedSnapshotCount) || (committedSnapshotCount as number) < 0)
    throw new Error('Invalid native activation snapshot count');
  const states = db
    .prepare('SELECT * FROM native_analysis_state WHERE repository_id=? ORDER BY provider_id')
    .iterate(repositoryId) as IterableIterator<StateRow>;
  const result: { providerId: string; snapshotId: string; summaryDigest: string }[] = [];
  const pointerBytes = onSqlOwnership
    ? stringBytes(active?.indexed_revision_id, active?.indexed_content_fingerprint)
    : 0;
  let acceptedBytes = 0;
  for (const row of states) {
    const rawBytes = onSqlOwnership
      ? stringBytes(
          row.repository_id,
          row.provider_id,
          row.provider_snapshot_id,
          row.revision_id,
          row.content_fingerprint,
          row.header_json,
        )
      : 0;
    // The cumulative retention callback is not current token-row ownership.
    // Reuse this current-row census before that callback can reenter a read.
    onSourceCensus?.(pointerBytes + acceptedBytes + rawBytes);
    onStateRow?.(row);
    onSqlOwnership?.('TOKEN_ROW', pointerBytes + acceptedBytes + rawBytes);
    let header: Record<string, unknown>;
    try {
      header = JSON.parse(row.header_json);
    } catch {
      throw new Error('Invalid native activation token header');
    }
    if (
      !header ||
      typeof header !== 'object' ||
      header.repositoryId !== row.repository_id ||
      header.providerId !== row.provider_id ||
      header.revisionId !== row.revision_id ||
      header.contentFingerprint !== row.content_fingerprint ||
      typeof header.summaryDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(header.summaryDigest)
    )
      throw new Error('Invalid native activation token header');
    result.push(
      Object.freeze({
        providerId: row.provider_id,
        snapshotId: row.provider_snapshot_id,
        summaryDigest: header.summaryDigest,
      }),
    );
    if (onSqlOwnership) {
      // Current provider/snapshot strings alias the raw row. Only the parsed
      // digest adds a new retained field while that row is still owned.
      onSqlOwnership(
        'TOKEN_ACCEPTED',
        pointerBytes + acceptedBytes + rawBytes + Buffer.byteLength(header.summaryDigest),
      );
      acceptedBytes += stringBytes(row.provider_id, row.provider_snapshot_id, header.summaryDigest);
    }
  }
  onSqlOwnership?.('TOKEN_RETURN', pointerBytes + acceptedBytes);
  return Object.freeze({
    committedSnapshotCount: committedSnapshotCount as number,
    indexedRevisionId: active?.indexed_revision_id ?? null,
    indexedContentFingerprint: active?.indexed_content_fingerprint ?? null,
    states: Object.freeze(result),
  });
}

export function captureNativeActivationToken(
  db: DatabaseSync,
  repositoryId: string,
): NativeActivationToken {
  return transaction(db, () => {
    // The token is itself retained metadata. Bound it by the unchanged native
    // envelope ceiling before fetching any of its SQL strings.
    const bytes =
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['repository_id', 'provider_id', 'provider_snapshot_id', 'revision_id', 'content_fingerprint', 'header_json'])}), 0) AS bytes FROM native_analysis_state WHERE repository_id=?`,
        repositoryId,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['indexed_revision_id', 'indexed_content_fingerprint'])}), 0) AS bytes FROM repository_state WHERE repository_id=?`,
        repositoryId,
      );
    if (bytes > 1_000_000) throw new Error('Native activation token resource limit exceeded');
    const active = pointer(db, repositoryId);
    const onSqlOwnership = nativeApplySqlTokenObserver();
    if (onSqlOwnership)
      onSqlOwnership(
        'TOKEN_POINTER',
        stringBytes(active?.indexed_revision_id, active?.indexed_content_fingerprint),
      );
    return token(db, repositoryId, active, undefined, onSqlOwnership);
  });
}

export function readNativeAnalysisState(
  db: DatabaseSync,
  expected: NativeStateExpectation,
  validate: NativeStateValidationPort,
  limits: NativeStateLimits,
  onSqlRetention?: (retainedSqlBytes: number) => void,
  onSqlOwnership?: (observation: NativeReadSqlOwnership) => void,
): NativeBaselineResult {
  return readNativeAnalysisStateOwned(
    db,
    expected,
    validate,
    limits,
    onSqlRetention,
    onSqlOwnership,
    undefined,
    () => {
      const role = nativeSqlSourceRole();
      if (role !== null)
        proveNativeSqlDisposition(
          'BASELINE_READ',
          role,
          'PROVEN_NO_TEXT',
          'Standalone Native baseline numeric preflight refused before selected TEXT reads',
        );
    },
  );
}

function readNativeAnalysisStateOwned(
  db: DatabaseSync,
  expected: NativeStateExpectation,
  validate: NativeStateValidationPort,
  limits: NativeStateLimits,
  onSqlRetention?: (retainedSqlBytes: number) => void,
  onSqlOwnership?: (observation: NativeReadSqlOwnership) => void,
  onSourceCensus?: (bytes: number) => void,
  onNumericRefusal?: () => void,
): NativeBaselineResult {
  if (typeof validate !== 'function') throw new TypeError('Native validation port is required');
  assertNativeStateLimits(limits);
  const unavailable = (
    reason: Extract<NativeBaselineResult, { status: 'UNAVAILABLE' }>['reason'],
  ): NativeBaselineResult => ({ status: 'UNAVAILABLE', reason });
  const result: NativeBaselineResult = transaction(db, () => {
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version < 10) return unavailable('MISSING');
    const repo = expected.repositoryId;
    const provider = expected.providerId;
    // SQLite computes numeric lengths and row counts without materializing
    // possibly corrupt TEXT columns in Node. Everything stays in this snapshot.
    const headers = size(
      db,
      'SELECT coalesce(sum(length(CAST(header_json AS BLOB))),0) AS bytes FROM native_analysis_state WHERE repository_id=?',
      repo,
    );
    const filesJson = size(
      db,
      'SELECT coalesce(sum(length(CAST(summary_json AS BLOB))),0) AS bytes FROM native_analysis_file WHERE repository_id=? AND provider_id=?',
      repo,
      provider,
    );
    const strings =
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['repository_id', 'provider_id', 'provider_snapshot_id', 'revision_id', 'content_fingerprint', 'header_json'])}),0) AS bytes FROM native_analysis_state WHERE repository_id=?`,
        repo,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['source_file_id', 'source_path', 'content_fingerprint', 'summary_json'])}),0) AS bytes FROM native_analysis_file WHERE repository_id=? AND provider_id=?`,
        repo,
        provider,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['indexed_revision_id', 'indexed_content_fingerprint'])}),0) AS bytes FROM repository_state WHERE repository_id=?`,
        repo,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['p.id', 'p.repository_id', 'p.provider_id', 'p.provider_version', 'p.requested_revision_id', 'p.requested_revision_fingerprint', 'p.outcome'])}),0) AS bytes FROM provider_snapshots p JOIN native_analysis_state s ON s.provider_snapshot_id=p.id WHERE s.repository_id=? AND s.provider_id=?`,
        repo,
        provider,
      ) +
      size(
        db,
        `SELECT coalesce(sum(${sqlLengths(['id', 'repository_id', 'kind'])}),0) AS bytes FROM revisions WHERE repository_id=? AND id=?`,
        repo,
        expected.revisionId,
      );
    if (
      headers + filesJson > limits.maxSerializedBytes ||
      !Number.isSafeInteger(strings) ||
      !nativeStringBudgetFits(strings, limits) ||
      2 * strings >= limits.memoryBudgetBytes
    ) {
      onNumericRefusal?.();
      return unavailable('RESOURCE_LIMIT_EXCEEDED');
    }
    const count = db
      .prepare(
        'SELECT count(*) AS n FROM native_analysis_file WHERE repository_id=? AND provider_id=?',
      )
      .get(repo, provider) as { n: number };
    if (!Number.isSafeInteger(count.n) || count.n > filesJson) return unavailable('INVALID');
    let retainedSqlBytes = 0;
    const observe = (...values: unknown[]) => {
      if (!onSqlRetention) return;
      for (const value of values)
        if (typeof value === 'string') retainedSqlBytes += Buffer.byteLength(value);
      onSqlRetention(retainedSqlBytes);
    };
    // The raw baseline frame and accepted summary prefix coexist through
    // validation. Later token reads are a census, not simultaneously pinned rows.
    let baselinePrefixBytes = 0;
    const observeBaseline = (...values: unknown[]) => {
      if (onSqlOwnership) {
        baselinePrefixBytes += stringBytes(...values);
        onSourceCensus?.(baselinePrefixBytes);
      }
      observe(...values);
      if (!onSqlOwnership) return;
      emitReadSqlOwnership(
        onSqlOwnership,
        'BASELINE_READ_SQL_OWNERSHIP_ONLY',
        'BASELINE_PREFIX',
        baselinePrefixBytes,
      );
    };
    const active = pointer(db, repo);
    if (active) observeBaseline(active.indexed_revision_id, active.indexed_content_fingerprint);
    if (!active?.indexed_revision_id || !active.indexed_content_fingerprint)
      return unavailable('MISSING');
    const row = db
      .prepare('SELECT * FROM native_analysis_state WHERE repository_id=? AND provider_id=?')
      .get(repo, provider) as StateRow | undefined;
    if (!row) return unavailable('MISSING');
    observeBaseline(
      row.repository_id,
      row.provider_id,
      row.provider_snapshot_id,
      row.revision_id,
      row.content_fingerprint,
      row.header_json,
    );
    if (active.indexed_revision_id !== expected.revisionId) return unavailable('NOT_APPLICABLE');
    const revision = db
      .prepare('SELECT kind FROM revisions WHERE repository_id=? AND id=?')
      .get(repo, expected.revisionId) as { kind: string } | undefined;
    if (revision) observeBaseline(revision.kind);
    if (!revision || revision.kind !== 'WORKTREE') return unavailable('NOT_APPLICABLE');
    const snapshot = db
      .prepare(
        'SELECT id,repository_id,provider_id,provider_version,requested_revision_id,requested_revision_fingerprint,outcome FROM provider_snapshots WHERE id=?',
      )
      .get(row.provider_snapshot_id) as SnapshotRow | undefined;
    if (snapshot)
      observeBaseline(
        snapshot.id,
        snapshot.repository_id,
        snapshot.provider_id,
        snapshot.provider_version,
        snapshot.requested_revision_id,
        snapshot.requested_revision_fingerprint,
        snapshot.outcome,
      );
    // Column/provenance checks stay in SQLite. Node must not decode the
    // candidate before the Runtime port admits its measured working set.
    const columns = db
      .prepare(
        `SELECT CASE WHEN json_valid(header_json) THEN (
      json_extract(header_json, '$.repositoryId') IS repository_id AND
      json_extract(header_json, '$.providerId') IS provider_id AND
      json_extract(header_json, '$.revisionId') IS revision_id AND
      json_extract(header_json, '$.contentFingerprint') IS content_fingerprint AND
      json_extract(header_json, '$.providerVersion') IS ?
    ) ELSE 0 END AS valid FROM native_analysis_state WHERE repository_id=? AND provider_id=?`,
      )
      .get(snapshot?.provider_version ?? null, repo, provider) as { valid: number };
    if (
      columns.valid !== 1 ||
      row.revision_id !== active.indexed_revision_id ||
      row.content_fingerprint !== active.indexed_content_fingerprint ||
      !snapshot ||
      snapshot.outcome !== 'SUCCEEDED' ||
      snapshot.repository_id !== repo ||
      snapshot.provider_id !== provider ||
      snapshot.requested_revision_id !== row.revision_id ||
      snapshot.requested_revision_fingerprint !== row.content_fingerprint
    )
      return unavailable('INVALID');
    const rows = db
      .prepare(
        'SELECT source_file_id,source_path,content_fingerprint,summary_json FROM native_analysis_file WHERE repository_id=? AND provider_id=? ORDER BY source_path',
      )
      .iterate(repo, provider) as IterableIterator<{
      source_file_id: string;
      source_path: string;
      content_fingerprint: string;
      summary_json: string;
    }>;
    let observationFailed = false;
    let observationError: unknown;
    function* files(): IterableIterator<NativeStateJsonFile> {
      for (const f of rows) {
        // Provider validation catches decoder errors. Owner failures must retain
        // their identity even if that port wraps or swallows an iterator error.
        try {
          observeBaseline(f.source_file_id, f.source_path, f.content_fingerprint, f.summary_json);
        } catch (error) {
          observationFailed = true;
          observationError = error;
          throw error;
        }
        yield {
          sourceFileId: f.source_file_id,
          sourcePath: f.source_path,
          contentFingerprint: f.content_fingerprint,
          summaryJson: f.summary_json,
        };
      }
    }
    let state: ValidatedNativeState;
    try {
      state = validate({
        headerJson: row.header_json,
        files: files(),
        expected,
        maxSerializedBytes: limits.maxSerializedBytes,
        memoryBudgetBytes: limits.memoryBudgetBytes - 2 * strings,
      });
    } catch (error) {
      if (observationFailed) throw observationError;
      if (
        error !== null &&
        typeof error === 'object' &&
        'nativeStateReason' in error &&
        (error.nativeStateReason === 'INVALID' ||
          error.nativeStateReason === 'INCOMPATIBLE' ||
          error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED')
      )
        return unavailable(error.nativeStateReason);
      throw error;
    }
    if (observationFailed) throw observationError;
    // Header/summary strings retain their original charge through the clone
    // handoff; trusted expectation and clone workspace are not new SQL fields.
    // These raw column owners remain pinned until this read closure returns.
    const pinnedBytes = onSqlOwnership
      ? stateSqlBytes(state) +
        stringBytes(
          row.repository_id,
          row.provider_id,
          row.provider_snapshot_id,
          row.revision_id,
          row.content_fingerprint,
          revision.kind,
          snapshot.id,
          snapshot.repository_id,
          snapshot.provider_id,
          snapshot.provider_version,
          snapshot.requested_revision_id,
          snapshot.requested_revision_fingerprint,
          snapshot.outcome,
        )
      : 0;
    if (onSqlOwnership)
      emitReadSqlOwnership(
        onSqlOwnership,
        'BASELINE_READ_SQL_OWNERSHIP_ONLY',
        'VALIDATED_BASELINE',
        pinnedBytes + stringBytes(active.indexed_revision_id, active.indexed_content_fingerprint),
      );
    let activation: NativeActivationToken;
    try {
      activation = token(
        db,
        repo,
        active,
        onSqlRetention
          ? (tokenRow) => {
              // A read census, not all token rows simultaneously resident. The token
              // reuses the already observed pointer; it does not fetch it again.
              try {
                observe(
                  tokenRow.repository_id,
                  tokenRow.provider_id,
                  tokenRow.provider_snapshot_id,
                  tokenRow.revision_id,
                  tokenRow.content_fingerprint,
                  tokenRow.header_json,
                );
              } catch (error) {
                observationFailed = true;
                observationError = error;
                throw error;
              }
            }
          : undefined,
        onSqlOwnership
          ? (phase, bytes) => {
              try {
                emitReadSqlOwnership(
                  onSqlOwnership,
                  'BASELINE_READ_SQL_OWNERSHIP_ONLY',
                  phase,
                  pinnedBytes + bytes,
                );
              } catch (error) {
                observationFailed = true;
                observationError = error;
                throw error;
              }
            }
          : undefined,
        onSourceCensus ? (bytes) => onSourceCensus(pinnedBytes + bytes) : undefined,
      );
    } catch (error) {
      if (observationFailed) throw observationError;
      if (error instanceof Error && error.message === 'Invalid native activation token header')
        return unavailable('INVALID');
      throw error;
    }
    const cloneBytes = onSqlOwnership ? pinnedBytes + activationSqlBytes(activation) : 0;
    if (onSqlOwnership)
      emitReadSqlOwnership(
        onSqlOwnership,
        'BASELINE_READ_SQL_OWNERSHIP_ONLY',
        'STATE_CLONE_BEGIN',
        cloneBytes,
      );
    const copy = immutableNativeState(state);
    if (onSqlOwnership)
      emitReadSqlOwnership(
        onSqlOwnership,
        'BASELINE_READ_SQL_OWNERSHIP_ONLY',
        'STATE_CLONE_END',
        cloneBytes,
      );
    return { status: 'AVAILABLE', state: copy, token: activation };
  });
  if (onSqlOwnership && result.status === 'AVAILABLE')
    emitReadSqlOwnership(
      onSqlOwnership,
      'BASELINE_READ_SQL_OWNERSHIP_ONLY',
      'RETURN',
      stateSqlBytes(result.state) + activationSqlBytes(result.token),
    );
  return result;
}
