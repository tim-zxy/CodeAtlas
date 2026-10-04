import type { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { boundedJson } from './bounded-json.js';
import {
  assertNativeStateLimits,
  assertNativeStringBudget,
  captureNativeActivationToken,
  readNativePatchActiveSupports,
  type NativePatchContext,
  type NativePatchValidationPort,
  type NativeActivationToken,
  type NativeStateExpectation,
  type NativeStateJsonFile,
  type ValidatedNativeState,
  type NativeStateLimits,
} from './native-analysis-state.js';
import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EntityIdSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderCapabilityObservationSchema,
  ProviderEdgeSchema,
  ProviderFactRefSchema,
  ProviderNodeSchema,
  ProviderSnapshotDiagnosticSchema,
  ProviderSnapshotSchema,
  ProviderFactBindingSchema,
  SourceFileSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderFactBinding,
  type ProviderEdge,
  type ProviderFactRef,
  type ProviderNode,
  type SourceFile,
  type ProviderSnapshot,
} from '@codeatlas/ir';

type PatchKind =
  | 'SOURCE_FILE'
  | 'UPSERT_NODE'
  | 'REMOVE_NODE'
  | 'UPSERT_EDGE'
  | 'REMOVE_EDGE'
  | 'COVERAGE'
  | 'DIAGNOSTIC';
type PatchRow = { readonly payload: string };
type PatchCoverage = {
  readonly capability: string;
  readonly sourceFileId: string | null;
  readonly support: 'SUPPORTED' | 'UNSUPPORTED';
  readonly coverage: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN';
};

export interface NativePatchCoverage extends PatchCoverage {
  readonly statistics: {
    readonly eligibleSites: number;
    readonly coveredSites: number;
    readonly unsupportedSites: number;
    readonly partialSites: number;
    readonly resolutionCounts: Readonly<
      Record<'EXACT' | 'HEURISTIC' | 'AMBIGUOUS' | 'UNRESOLVED' | 'UNSUPPORTED', number>
    >;
  };
}

function coverageRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new TypeError('Invalid native coverage statistics');
  return value as Record<string, unknown>;
}

// Structural Storage boundary only. Provider-owned overlay validation still
// proves summary/statistics correspondence before any Native activation.
function parseNativeCoverage(value: unknown): NativePatchCoverage {
  const row = coverageRecord(value, [
    'capability',
    'sourceFileId',
    'support',
    'coverage',
    'statistics',
  ]);
  const categorical = parseCoverage({
    capability: row.capability,
    sourceFileId: row.sourceFileId,
    support: row.support,
    coverage: row.coverage,
  });
  const stats = coverageRecord(row.statistics, [
    'eligibleSites',
    'coveredSites',
    'unsupportedSites',
    'partialSites',
    'resolutionCounts',
  ]);
  const counts = coverageRecord(stats.resolutionCounts, [
    'EXACT',
    'HEURISTIC',
    'AMBIGUOUS',
    'UNRESOLVED',
    'UNSUPPORTED',
  ]);
  const integer = (n: unknown): number => {
    if (!Number.isSafeInteger(n) || (n as number) < 0)
      throw new TypeError('Invalid native coverage statistics');
    return n as number;
  };
  const statistics = {
    eligibleSites: integer(stats.eligibleSites),
    coveredSites: integer(stats.coveredSites),
    unsupportedSites: integer(stats.unsupportedSites),
    partialSites: integer(stats.partialSites),
    resolutionCounts: {
      EXACT: integer(counts.EXACT),
      HEURISTIC: integer(counts.HEURISTIC),
      AMBIGUOUS: integer(counts.AMBIGUOUS),
      UNRESOLVED: integer(counts.UNRESOLVED),
      UNSUPPORTED: integer(counts.UNSUPPORTED),
    },
  };
  if (
    statistics.eligibleSites !==
    statistics.coveredSites + statistics.unsupportedSites + statistics.partialSites
  )
    throw new TypeError('Invalid native coverage statistics partition');
  return { ...categorical, statistics };
}

function parseCoverage(value: unknown): PatchCoverage {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'capability,coverage,sourceFileId,support'
  )
    throw new TypeError('Invalid patch coverage');
  const record = value as Record<string, unknown>;
  const observation = ProviderCapabilityObservationSchema.parse({
    name: record.capability,
    support: record.support,
    coverage: record.coverage,
  });
  const sourceFileId =
    record.sourceFileId === null ? null : EntityIdSchema.parse(record.sourceFileId);
  return {
    capability: observation.name,
    sourceFileId,
    support: observation.support,
    coverage: observation.coverage,
  };
}

export interface PatchSupport {
  readonly factType: 'NODE' | 'EDGE';
  readonly canonical: CanonicalNode | CanonicalEdge;
  readonly evidence: Evidence;
  readonly factEvidence: FactEvidence;
  readonly binding: ProviderFactBinding;
  readonly snapshotId: string;
  readonly inputPath: readonly (string | number)[];
}

/** Provisional, indexed patch rows on the caller's SQLite connection. */
export class RepositoryPatchStage {
  private closed = false;
  private completed = false;
  private readonly nativeLimits: NativeStateLimits | undefined;
  private nativeSerializedBytes = 0;
  private nativeStringBytes = 0;
  private nativeRowStringBytes = 0;
  private nativeEventBytes = 0;
  private readonly nativeRows = {
    patch_event: 0,
    patch_normalized: 0,
    patch_support: 0,
    patch_native_summary: 0,
  };
  private readonly nativeContext: NativePatchContext | undefined;
  private nativeOwnedBytes = 0;
  private nativeHeaderJson: string | undefined;
  private nativeSnapshot: ProviderSnapshot | undefined;
  private sealed: ValidatedNativeState | undefined;
  private validating = false;
  private context: {
    repositoryId: string;
    revisionId: string;
    fingerprint: string;
    snapshotId: string;
  } | null = null;

  constructor(
    private readonly db: DatabaseSync,
    readonly selectGroup: (group: readonly PatchSupport[]) => CanonicalNode | CanonicalEdge,
    nativeLimits?: NativeStateLimits,
    nativeContext?: NativePatchContext,
  ) {
    if (nativeLimits) assertNativeStateLimits(nativeLimits);
    this.nativeLimits = nativeLimits ? { ...nativeLimits } : undefined;
    if (nativeContext) {
      if (!this.nativeLimits) throw new Error('Native context requires declared limits');
      const json = boundedJson(nativeContext, Math.floor(this.nativeLimits.memoryBudgetBytes / 2));
      const owned = JSON.parse(json) as NativePatchContext;
      if (
        !Array.isArray(owned.baseline?.files) ||
        !Array.isArray(owned.targetSourceFiles) ||
        owned.baseline.files.length > 10_000 ||
        owned.targetSourceFiles.length > 10_000 ||
        typeof owned.baseline.headerJson !== 'string'
      )
        throw new TypeError('Invalid native context');
      const metadata =
        Buffer.byteLength(owned.baseline.headerJson) +
        owned.baseline.files.reduce((n, f) => n + Buffer.byteLength(f.summaryJson), 0);
      if (
        metadata > this.nativeLimits.maxSerializedBytes ||
        Buffer.byteLength(boundedJson(owned.targetSourceFiles, 1_000_000)) > 1_000_000
      )
        throw new Error('Native context resource limit exceeded');
      for (const file of owned.targetSourceFiles) SourceFileSchema.parse(file);
      this.nativeContext = freezeOwned(owned);
      this.nativeOwnedBytes = Buffer.byteLength(json);
    }
    db.exec(`
      CREATE TEMP TABLE patch_native_summary (
        source_file_id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL UNIQUE,
        content_fingerprint TEXT NOT NULL,
        summary_json TEXT NOT NULL
      );
      CREATE TEMP TABLE patch_event (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        source_id TEXT,
        source_path TEXT,
        provider_id TEXT,
        provider_fact_id TEXT,
        fact_type TEXT,
        payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX temp.patch_source_id ON patch_event(source_id) WHERE source_id IS NOT NULL;
      CREATE UNIQUE INDEX temp.patch_source_path ON patch_event(source_path) WHERE source_path IS NOT NULL;
      CREATE UNIQUE INDEX temp.patch_operation ON patch_event(fact_type, provider_id, provider_fact_id)
        WHERE provider_fact_id IS NOT NULL;
      CREATE INDEX temp.patch_kind ON patch_event(kind, sequence);
      CREATE TEMP TABLE patch_normalized (
        fact_type TEXT NOT NULL,
        provider_fact_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY(fact_type, provider_fact_id)
      );
      CREATE TEMP TABLE patch_support (
        fact_type TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        evidence_id TEXT NOT NULL PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE INDEX temp.patch_support_key ON patch_support(fact_type, fact_key, evidence_id);
    `);
  }

  async accept(value: unknown): Promise<void> {
    this.acceptEvent(value, false);
  }

  async acceptNativeEvent(value: unknown): Promise<void> {
    if (!this.nativeLimits) throw new Error('Native event retention requires declared limits');
    this.acceptEvent(value, true);
  }

  private acceptEvent(value: unknown, nativeCoverage: boolean): void {
    this.assertWritable();
    if (this.completed) throw new Error('Patch stage is already complete');
    if (this.nativeLimits) value = JSON.parse(boundedJson(value, 1_000_000));
    if (!value || typeof value !== 'object' || !('type' in value) || !('payload' in value)) {
      throw new TypeError('Invalid patch event');
    }
    const event = value as { type: string; payload: unknown };
    const kind = event.type as PatchKind;
    const schema =
      kind === 'SOURCE_FILE'
        ? SourceFileSchema
        : kind === 'UPSERT_NODE'
          ? ProviderNodeSchema
          : kind === 'UPSERT_EDGE'
            ? ProviderEdgeSchema
            : kind === 'REMOVE_NODE' || kind === 'REMOVE_EDGE'
              ? ProviderFactRefSchema
              : kind === 'DIAGNOSTIC'
                ? ProviderSnapshotDiagnosticSchema
                : null;
    if (!schema && kind !== 'COVERAGE') throw new TypeError('Unsupported patch event');
    const payload =
      kind === 'COVERAGE'
        ? nativeCoverage
          ? parseNativeCoverage(event.payload)
          : parseCoverage(event.payload)
        : schema
          ? schema.parse(event.payload)
          : event.payload;
    if (kind === 'REMOVE_NODE' && (payload as ProviderFactRef).factType !== 'NODE') {
      throw new TypeError('Wrong node removal type');
    }
    if (kind === 'REMOVE_EDGE' && (payload as ProviderFactRef).factType !== 'EDGE') {
      throw new TypeError('Wrong edge removal type');
    }
    const file = kind === 'SOURCE_FILE' ? (payload as SourceFile) : null;
    const fact =
      kind === 'UPSERT_NODE' ||
      kind === 'UPSERT_EDGE' ||
      kind === 'REMOVE_NODE' ||
      kind === 'REMOVE_EDGE'
        ? (payload as ProviderNode | ProviderEdge | ProviderFactRef)
        : null;
    const json = JSON.stringify(payload);
    const strings = [
      kind,
      file?.id ?? '',
      file?.path ?? '',
      fact?.providerId ?? '',
      fact?.providerFactId ?? '',
      fact ? (kind.endsWith('NODE') ? 'NODE' : 'EDGE') : '',
      json,
    ];
    const bytes = this.checkNativeInsert('patch_event', strings);
    const eventBytes = Buffer.byteLength(json);
    if (this.nativeLimits && this.nativeEventBytes + eventBytes > 10_000_000)
      throw new Error('Native staged event resource limit exceeded');
    this.db
      .prepare(
        `INSERT INTO temp.patch_event
      (kind, source_id, source_path, provider_id, provider_fact_id, fact_type, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        kind,
        file?.id ?? null,
        file?.path ?? null,
        fact?.providerId ?? null,
        fact?.providerFactId ?? null,
        fact ? (kind.endsWith('NODE') ? 'NODE' : 'EDGE') : null,
        json,
      );
    this.nativeRowStringBytes += bytes;
    this.nativeEventBytes += eventBytes;
    this.nativeRows.patch_event++;
  }

  async acceptNativeSummary(value: unknown): Promise<void> {
    this.assertWritable();
    if (this.completed) throw new Error('Patch stage is already complete');
    if (!this.nativeLimits) throw new Error('Native summary retention requires declared limits');
    const json = boundedJson(
      value,
      this.nativeLimits.maxSerializedBytes - this.nativeSerializedBytes,
    );
    // Decode the bounded owned serialization, not caller-controlled accessors.
    const source = (JSON.parse(json) as { sourceFile?: Record<string, unknown> } | null)
      ?.sourceFile;
    if (
      !source ||
      typeof source.id !== 'string' ||
      typeof source.path !== 'string' ||
      typeof source.contentFingerprint !== 'string'
    )
      throw new TypeError('Native summary requires JSON source columns');
    const serializedBytes = Buffer.byteLength(json);
    const stringBytes =
      serializedBytes +
      Buffer.byteLength(source.id) +
      Buffer.byteLength(source.path) +
      Buffer.byteLength(source.contentFingerprint);
    this.checkNativeInsert('patch_native_summary', [
      source.id,
      source.path,
      source.contentFingerprint,
      json,
    ]);
    this.db
      .prepare('INSERT INTO temp.patch_native_summary VALUES (?, ?, ?, ?)')
      .run(source.id, source.path, source.contentFingerprint, json);
    this.nativeSerializedBytes += serializedBytes;
    this.nativeStringBytes += stringBytes;
    this.nativeRows.patch_native_summary++;
  }

  /** Actual SQL lengths/counts before any Native-stage TEXT decoding. Includes
   * duplicated indexed columns and all simultaneously retained stage tables.
   * Runtime's reviewed purpose reservation remains separately mandatory.
   */
  preflightNativeRows(): { readonly retainedSqlBytes: number } {
    this.assertOpen();
    if (!this.nativeLimits) throw new Error('Native preflight requires declared limits');
    let retainedSqlBytes = 0,
      metadataBytes = 0,
      observations = 0;
    for (const [table, columns, payload] of [
      [
        'patch_event',
        [
          'kind',
          'source_id',
          'source_path',
          'provider_id',
          'provider_fact_id',
          'fact_type',
          'payload',
        ],
        'payload',
      ],
      ['patch_normalized', ['fact_type', 'provider_fact_id', 'payload'], 'payload'],
      ['patch_support', ['fact_type', 'fact_key', 'evidence_id', 'payload'], 'payload'],
      [
        'patch_native_summary',
        ['source_file_id', 'source_path', 'content_fingerprint', 'summary_json'],
        'summary_json',
      ],
    ] as const) {
      const lengths = columns.map((c) => `coalesce(length(CAST(${c} AS BLOB)),0)`);
      const length = lengths.join('+');
      const row = this.db
        .prepare(
          `SELECT count(*) AS n,coalesce(sum(${length}),0) AS bytes,
        coalesce(sum(length(CAST(${payload} AS BLOB))),0) AS payload_bytes,
        coalesce(max(max(${lengths.join(',')})),0) AS maximum FROM temp.${table}`,
        )
        .get()!;
      if (
        ![row.n, row.bytes, row.payload_bytes, row.maximum].every(
          (n) => Number.isSafeInteger(n) && (n as number) >= 0,
        )
      )
        throw new Error('Invalid native stage size');
      if ((row.n as number) > 10_000 || (row.maximum as number) > 1_000_000)
        throw new Error('Native staged row resource limit exceeded');
      retainedSqlBytes += row.bytes as number;
      if (table === 'patch_native_summary') {
        metadataBytes = row.payload_bytes as number;
        observations += row.n as number;
      }
      if (table === 'patch_event') {
        observations += row.n as number;
        if ((row.payload_bytes as number) > 10_000_000)
          throw new Error('Native staged event resource limit exceeded');
      }
    }
    if (observations > 10_000 || metadataBytes > this.nativeLimits.maxSerializedBytes)
      throw new Error('Native staged metadata resource limit exceeded');
    assertNativeStringBudget(retainedSqlBytes + this.nativeOwnedBytes, this.nativeLimits);
    return { retainedSqlBytes };
  }

  confirmSucceeded(terminal: unknown): void {
    this.assertWritable();
    if (this.completed) throw new Error('Patch stage is already complete');
    if (this.nativeLimits) {
      this.preflightNativeRows();
      terminal = JSON.parse(boundedJson(terminal, 1_000_000));
    }
    if (
      !terminal ||
      typeof terminal !== 'object' ||
      !('type' in terminal) ||
      terminal.type !== 'REFRESH_COMPLETED' ||
      !('payload' in terminal) ||
      !terminal.payload ||
      typeof terminal.payload !== 'object' ||
      !('outcome' in terminal.payload) ||
      terminal.payload.outcome !== 'SUCCEEDED'
    )
      throw new Error('Only a successful refresh can activate');
    const payload = terminal.payload as Record<string, unknown>;
    if (
      typeof payload.repositoryId !== 'string' ||
      typeof payload.revisionId !== 'string' ||
      typeof payload.revisionFingerprint !== 'string' ||
      typeof payload.providerSnapshotId !== 'string'
    )
      throw new Error('Patch terminal context is incomplete');
    const counts = payload.counts as Record<string, unknown> | undefined;
    for (const [name, kind] of [
      ['sourceFiles', 'SOURCE_FILE'],
      ['upsertedNodes', 'UPSERT_NODE'],
      ['removedNodes', 'REMOVE_NODE'],
      ['upsertedEdges', 'UPSERT_EDGE'],
      ['removedEdges', 'REMOVE_EDGE'],
      ['coverage', 'COVERAGE'],
      ['diagnostics', 'DIAGNOSTIC'],
    ] as const) {
      const actual = this.db
        .prepare('SELECT count(*) AS n FROM temp.patch_event WHERE kind = ?')
        .get(kind) as { n: number };
      if (!counts || counts[name] !== actual.n) throw new Error(`Patch ${name} count differs`);
    }
    for (const row of this.db
      .prepare(
        "SELECT kind, payload FROM temp.patch_event WHERE kind IN ('SOURCE_FILE', 'UPSERT_NODE', 'UPSERT_EDGE')",
      )
      .iterate() as IterableIterator<{ kind: PatchKind; payload: string }>) {
      const value = JSON.parse(row.payload) as Record<string, unknown>;
      if (
        value.repositoryId !== payload.repositoryId ||
        value.revisionId !== payload.revisionId ||
        ('providerSnapshotId' in value && value.providerSnapshotId !== payload.providerSnapshotId)
      )
        throw new Error('Patch event context differs from terminal');
    }
    let activeBinding: ReturnType<DatabaseSync['prepare']> | undefined;
    for (const row of this.db
      .prepare(
        "SELECT fact_type, provider_id, provider_fact_id FROM temp.patch_event WHERE kind IN ('REMOVE_NODE', 'REMOVE_EDGE')",
      )
      .iterate() as IterableIterator<{
      fact_type: string;
      provider_id: string;
      provider_fact_id: string;
    }>) {
      activeBinding ??= this.db.prepare(`SELECT count(*) AS n
        FROM provider_fact_bindings AS binding
        JOIN evidence AS evidence ON evidence.id = binding.evidence_id
        WHERE binding.fact_type = ? AND binding.provider_id = ? AND binding.provider_fact_id = ?
          AND evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'`);
      const result = activeBinding.get(
        row.fact_type,
        row.provider_id,
        row.provider_fact_id,
        payload.repositoryId,
        payload.revisionId,
      ) as { n: number };
      if (result.n !== 1)
        throw new Error('Patch removal requires exactly one active Provider binding');
    }
    this.context = {
      repositoryId: payload.repositoryId,
      revisionId: payload.revisionId,
      fingerprint: payload.revisionFingerprint,
      snapshotId: payload.providerSnapshotId,
    };
    this.completed = true;
  }

  confirmNativeSucceeded(terminalValue: unknown, snapshotValue: ProviderSnapshot): void {
    this.assertWritable();
    if (!this.nativeLimits) throw new Error('Native completion requires declared limits');
    if (this.completed) throw new Error('Patch stage is already complete');
    const json = boundedJson({ terminal: terminalValue, snapshot: snapshotValue }, 1_000_000);
    const owned = JSON.parse(json) as {
      terminal: { type: string; payload: Record<string, unknown> };
      snapshot: unknown;
    };
    const snapshot = ProviderSnapshotSchema.parse(owned.snapshot),
      terminal = owned.terminal;
    const payload = terminal?.payload;
    if (
      !payload ||
      !payload.analysisState ||
      typeof payload.analysisState !== 'object' ||
      snapshot.outcome !== 'SUCCEEDED' ||
      snapshot.id !== payload.providerSnapshotId ||
      snapshot.repositoryId !== payload.repositoryId ||
      snapshot.requestedRevisionId !== payload.revisionId ||
      snapshot.requestedRevisionFingerprint !== payload.revisionFingerprint ||
      !isDeepStrictEqual(snapshot.capabilities, payload.capabilities)
    )
      throw new Error('Native completion snapshot differs');
    const count = this.db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get()!.n;
    if (payload.summaryRecords !== count) throw new Error('Native summary count differs');
    const headerJson = JSON.stringify(payload.analysisState);
    if (
      Buffer.byteLength(headerJson) + this.nativeSerializedBytes >
      this.nativeLimits.maxSerializedBytes
    )
      throw new Error('Native metadata resource limit exceeded');
    const rows = this.preflightNativeRows();
    const bytes = Buffer.byteLength(json);
    assertNativeStringBudget(
      rows.retainedSqlBytes + this.nativeOwnedBytes + bytes,
      this.nativeLimits,
    );
    this.confirmSucceeded(terminal);
    this.nativeHeaderJson = headerJson;
    this.nativeSnapshot = freezeOwned(snapshot);
    this.nativeOwnedBytes += bytes;
  }

  sealNativePatchState(
    expectedValue: NativeStateExpectation,
    baselineValue: NativeActivationToken,
    validate: NativePatchValidationPort,
  ): void {
    this.assertWritable();
    if (typeof validate !== 'function')
      throw new TypeError('Native patch validation port is required');
    if (
      !this.completed ||
      !this.nativeContext ||
      !this.nativeHeaderJson ||
      !this.nativeSnapshot ||
      !this.nativeLimits
    )
      throw new Error('Native patch stage is not complete');
    const expected = JSON.parse(boundedJson(expectedValue, 1_000_000)) as NativeStateExpectation;
    const baselineToken = JSON.parse(
      boundedJson(baselineValue, 1_000_000),
    ) as NativeActivationToken;
    this.assertContext({
      repositoryId: expected.repositoryId,
      revisionId: expected.revisionId,
      contentFingerprint: expected.contentFingerprint,
      snapshotId: this.nativeSnapshot.id,
    });
    const stageBytes = this.preflightNativeRows().retainedSqlBytes;
    const scalarBytes = Buffer.byteLength(JSON.stringify({ expected, baselineToken }));
    const ownTransaction = !this.db.isTransaction;
    if (ownTransaction) this.db.exec('BEGIN');
    try {
      const baseline = this.nativeContext.baseline;
      // Verify retained indexed metadata and complete current inventory using
      // numeric SQL predicates, not a second decoded/fabricated baseline.
      if (
        this.db
          .prepare(
            'SELECT count(*) AS n FROM native_analysis_state WHERE repository_id=? AND provider_id=? AND revision_id=? AND content_fingerprint=? AND header_json=?',
          )
          .get(
            expected.repositoryId,
            expected.providerId,
            expected.revisionId,
            baseline.expected.contentFingerprint,
            baseline.headerJson,
          )!.n !== 1
      )
        throw new Error('Native indexed baseline changed');
      if (
        this.db
          .prepare(
            'SELECT count(*) AS n FROM native_analysis_file WHERE repository_id=? AND provider_id=?',
          )
          .get(expected.repositoryId, expected.providerId)!.n !== baseline.files.length
      )
        throw new Error('Native indexed baseline changed');
      const match = this.db.prepare(
        'SELECT count(*) AS n FROM native_analysis_file WHERE repository_id=? AND provider_id=? AND source_file_id=? AND source_path=? AND content_fingerprint=? AND summary_json=?',
      );
      for (const f of baseline.files)
        if (
          match.get(
            expected.repositoryId,
            expected.providerId,
            f.sourceFileId,
            f.sourcePath,
            f.contentFingerprint,
            f.summaryJson,
          )!.n !== 1
        )
          throw new Error('Native indexed baseline changed');
      if (
        this.db
          .prepare(
            "SELECT count(*) AS n FROM revisions WHERE repository_id=? AND id=? AND kind='WORKTREE' AND content_fingerprint=?",
          )
          .get(expected.repositoryId, expected.revisionId, expected.contentFingerprint)!.n !== 1
      )
        throw new Error('Native target revision changed');
      const inventory = this.nativeContext.targetSourceFiles;
      if (
        this.db
          .prepare('SELECT count(*) AS n FROM source_files WHERE repository_id=? AND revision_id=?')
          .get(expected.repositoryId, expected.revisionId)!.n !== inventory.length
      )
        throw new Error('Native target inventory changed');
      const source = this.db
        .prepare(`SELECT count(*) AS n FROM source_files WHERE repository_id=? AND revision_id=?
        AND id=? AND path=? AND content_fingerprint=? AND role=? AND provenance=? AND content_kind=? AND language_hint IS ? AND sensitivity=?`);
      for (const f of inventory)
        if (
          source.get(
            expected.repositoryId,
            expected.revisionId,
            f.id,
            f.path,
            f.contentFingerprint,
            f.classification.role,
            f.classification.provenance,
            f.classification.contentKind,
            f.languageHint,
            f.sensitivity,
          )!.n !== 1
        )
          throw new Error('Native target inventory changed');
      // The token reader materializes its header/pointer strings; reserve their
      // actual SQL bytes first, independently of the owned preparation context.
      const tokenLength = (columns: readonly string[]) =>
        columns.map((c) => `coalesce(length(CAST(${c} AS BLOB)),0)`).join('+');
      const tokenBytes =
        (this.db
          .prepare(
            `SELECT coalesce(sum(${tokenLength(['repository_id', 'provider_id', 'provider_snapshot_id', 'revision_id', 'content_fingerprint', 'header_json'])}),0) AS bytes FROM native_analysis_state WHERE repository_id=?`,
          )
          .get(expected.repositoryId)!.bytes as number) +
        (this.db
          .prepare(
            `SELECT coalesce(sum(${tokenLength(['indexed_revision_id', 'indexed_content_fingerprint'])}),0) AS bytes FROM repository_state WHERE repository_id=?`,
          )
          .get(expected.repositoryId)!.bytes as number);
      const retained = stageBytes + this.nativeOwnedBytes + scalarBytes + tokenBytes;
      assertNativeStringBudget(retained, this.nativeLimits);
      if (
        !isDeepStrictEqual(
          captureNativeActivationToken(this.db, expected.repositoryId),
          baselineToken,
        )
      )
        throw new Error('Native activation token changed');
      const active = readNativePatchActiveSupports(this.db, expected, {
        ...this.nativeLimits,
        memoryBudgetBytes: this.nativeLimits.memoryBudgetBytes - 2 * retained,
      });
      this.validating = true;
      let state: ValidatedNativeState;
      try {
        state = validate({
          expected,
          baseline,
          baselineToken,
          snapshot: this.nativeSnapshot,
          headerJson: this.nativeHeaderJson,
          files: this.readNativeSummaries(),
          targetSourceFiles: inventory,
          changedSourceFiles: this.readSourceFiles(),
          activeSupports: active.supports,
          upsertNodes: this.readUpsertNodes(),
          upsertEdges: this.readUpsertEdges(),
          removeNodes: this.readRemoveNodes(),
          removeEdges: this.readRemoveEdges(),
          normalizedNodes: this.readNormalizedNodes(),
          normalizedEdges: this.readNormalizedEdges(),
          supports: this.readSupports(),
          coverage: this.readNativeCoverage(),
          diagnostics: this.readDiagnostics(),
          maxSerializedBytes: this.nativeLimits.maxSerializedBytes,
          memoryBudgetBytes:
            this.nativeLimits.memoryBudgetBytes - 2 * (retained + active.retainedSqlBytes),
        });
      } finally {
        this.validating = false;
      }
      // Result, serialization and detached owned copy overlap here; the port's
      // temporary maps have returned. Charge all three representations before
      // copying, and never invoke accessors/toJSON from an injected result.
      const resultBudget =
        this.nativeLimits.memoryBudgetBytes - 2 * (retained + active.retainedSqlBytes);
      const owned = JSON.parse(
        boundedJson(state, Math.floor(resultBudget / 3)),
      ) as ValidatedNativeState;
      if (
        Object.keys(owned).sort().join(',') !== 'expected,files,headerJson,summaryDigest' ||
        !Array.isArray(owned.files) ||
        !isDeepStrictEqual(owned.expected, expected) ||
        owned.headerJson !== this.nativeHeaderJson
      )
        throw new Error('Native validation result differs from stage');
      const count = this.db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get()!.n;
      if (
        owned.files.length !== count ||
        new Set(owned.files.map((f) => f.sourceFileId)).size !== count ||
        new Set(owned.files.map((f) => f.sourcePath)).size !== count ||
        owned.summaryDigest !==
          (JSON.parse(this.nativeHeaderJson) as { summaryDigest: unknown }).summaryDigest
      )
        throw new Error('Native validation result differs from stage');
      const matches = this.db.prepare(
        'SELECT count(*) AS n FROM temp.patch_native_summary WHERE source_file_id=? AND source_path=? AND content_fingerprint=? AND summary_json=?',
      );
      for (const f of owned.files)
        if (matches.get(f.sourceFileId, f.sourcePath, f.contentFingerprint, f.summaryJson)!.n !== 1)
          throw new Error('Native validation result differs from stage');
      const sealed = freezeOwned(owned);
      if (ownTransaction) this.db.exec('COMMIT');
      this.sealed = sealed;
    } catch (error) {
      if (ownTransaction && this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  readSealedNativeState(): ValidatedNativeState {
    this.assertOpen();
    if (!this.sealed) throw new Error('Native patch state has not been sealed');
    return this.sealed;
  }

  private *readNativeSummaries(): IterableIterator<NativeStateJsonFile> {
    this.preflightNativeRows();
    for (const row of this.db
      .prepare(
        'SELECT source_file_id,source_path,content_fingerprint,summary_json FROM temp.patch_native_summary ORDER BY source_path',
      )
      .iterate())
      yield {
        sourceFileId: row.source_file_id as string,
        sourcePath: row.source_path as string,
        contentFingerprint: row.content_fingerprint as string,
        summaryJson: row.summary_json as string,
      };
  }

  assertApplicable(
    db: DatabaseSync,
    expected: {
      repositoryId: string;
      revisionId: string;
      contentFingerprint: string;
      snapshotId: string;
    },
  ): void {
    this.assertOpen();
    // Native composition requires its separate immutable overlay seal. Until
    // that authority exists, a native stage cannot enter the legacy writer.
    if (this.nativeLimits) throw new Error('Native patch state has not been sealed');
    if (db !== this.db) throw new Error('Patch stage belongs to another connection');
    this.assertContext(expected);
  }

  assertContext(expected: {
    repositoryId: string;
    revisionId: string;
    contentFingerprint: string;
    snapshotId: string;
  }): void {
    this.assertOpen();
    if (
      !this.completed ||
      !this.context ||
      this.context.repositoryId !== expected.repositoryId ||
      this.context.revisionId !== expected.revisionId ||
      this.context.fingerprint !== expected.contentFingerprint ||
      this.context.snapshotId !== expected.snapshotId
    )
      throw new Error('Patch stage is not complete on this connection');
  }

  *readSourceFiles(): IterableIterator<SourceFile> {
    yield* this.read('SOURCE_FILE', SourceFileSchema);
  }
  *readUpsertNodes(): IterableIterator<ProviderNode> {
    yield* this.read('UPSERT_NODE', ProviderNodeSchema);
  }
  *readUpsertEdges(): IterableIterator<ProviderEdge> {
    yield* this.read('UPSERT_EDGE', ProviderEdgeSchema);
  }
  *readRemoveNodes(): IterableIterator<ProviderFactRef> {
    yield* this.read('REMOVE_NODE', ProviderFactRefSchema);
  }
  *readRemoveEdges(): IterableIterator<ProviderFactRef> {
    yield* this.read('REMOVE_EDGE', ProviderFactRefSchema);
  }
  *readCoverage(): IterableIterator<PatchCoverage> {
    yield* this.read('COVERAGE', { parse: parseCoverage });
  }
  *readNativeCoverage(): IterableIterator<NativePatchCoverage> {
    if (!this.nativeLimits) throw new Error('Native coverage requires declared limits');
    yield* this.read('COVERAGE', { parse: parseNativeCoverage });
  }
  *readDiagnostics(): IterableIterator<unknown> {
    yield* this.read('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema);
  }

  getProviderNode(id: string): ProviderNode | null {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const row = this.db
      .prepare(
        "SELECT payload FROM temp.patch_event WHERE kind = 'UPSERT_NODE' AND provider_fact_id = ?",
      )
      .get(id) as PatchRow | undefined;
    return row ? ProviderNodeSchema.parse(JSON.parse(row.payload)) : null;
  }

  getSourceFile(id: string): SourceFile | null {
    return this.getChangedSourceFile(id) ?? this.getPersistedSource('id', id);
  }

  getChangedSourceFile(id: string): SourceFile | null {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const row = this.db
      .prepare('SELECT payload FROM temp.patch_event WHERE source_id = ?')
      .get(id) as PatchRow | undefined;
    return row ? SourceFileSchema.parse(JSON.parse(row.payload)) : null;
  }

  getSourceFileByPath(path: string): SourceFile | null {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const row = this.db
      .prepare('SELECT payload FROM temp.patch_event WHERE source_path = ?')
      .get(path) as PatchRow | undefined;
    return row
      ? SourceFileSchema.parse(JSON.parse(row.payload))
      : this.getPersistedSource('path', path);
  }

  private getPersistedSource(field: 'id' | 'path', value: string): SourceFile | null {
    this.assertOpen();
    if (!this.completed || !this.context) return null;
    // Native normalization uses the owned complete D1 inventory. Seal rechecks
    // every persisted metadata column; no fresh unbounded SQL source is read.
    if (this.nativeContext)
      return this.nativeContext.targetSourceFiles.find((f) => f[field] === value) ?? null;
    const row = this.db
      .prepare(
        `SELECT * FROM source_files
      WHERE repository_id = ? AND revision_id = ? AND ${field} = ?`,
      )
      .get(this.context.repositoryId, this.context.revisionId, value) as
      Record<string, string | null> | undefined;
    if (!row) return null;
    return SourceFileSchema.parse({
      id: row.id,
      repositoryId: row.repository_id,
      revisionId: row.revision_id,
      path: row.path,
      contentFingerprint: row.content_fingerprint,
      classification: { role: row.role, provenance: row.provenance, contentKind: row.content_kind },
      languageHint: row.language_hint,
      sensitivity: row.sensitivity,
    });
  }

  putNormalizedNode(pair: {
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalNode;
  }): void {
    this.putNormalized('NODE', pair, CanonicalNodeSchema);
  }
  putNormalizedEdge(pair: {
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalEdge;
  }): void {
    this.putNormalized('EDGE', pair, CanonicalEdgeSchema);
  }
  getNormalizedNode(
    id: string,
  ): { readonly provider: ProviderFactRef; readonly canonical: CanonicalNode } | null {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const row = this.db
      .prepare(
        "SELECT payload FROM temp.patch_normalized WHERE fact_type = 'NODE' AND provider_fact_id = ?",
      )
      .get(id) as PatchRow | undefined;
    if (!row) return null;
    const pair = JSON.parse(row.payload);
    return {
      provider: ProviderFactRefSchema.parse(pair.provider),
      canonical: CanonicalNodeSchema.parse(pair.canonical),
    };
  }
  getRetainedCanonicalNode(providerId: string, providerFactId: string): CanonicalNode | null {
    this.assertOpen();
    if (!this.completed || !this.context) throw new Error('Patch stage is not complete');
    if (this.nativeLimits) {
      const stage = this.preflightNativeRows();
      const size = this.db
        .prepare(
          `SELECT count(*) AS n,
        coalesce(sum(length(CAST(candidate.candidate_json AS BLOB))),0) AS bytes,
        coalesce(max(length(CAST(candidate.candidate_json AS BLOB))),0) AS maximum
        FROM provider_fact_bindings AS binding JOIN evidence AS evidence ON evidence.id=binding.evidence_id
        JOIN active_support_candidates AS candidate ON candidate.evidence_id=binding.evidence_id
        WHERE binding.fact_type='NODE' AND binding.provider_id=? AND binding.provider_fact_id=?
        AND evidence.repository_id=? AND evidence.revision_id=? AND evidence.status='ACTIVE'`,
        )
        .get(providerId, providerFactId, this.context.repositoryId, this.context.revisionId)!;
      if (
        ![size.n, size.bytes, size.maximum].every(
          (n) => Number.isSafeInteger(n) && (n as number) >= 0,
        ) ||
        (size.maximum as number) > 1_000_000 ||
        (size.n as number) > 2
      )
        throw new Error('Native retained candidate resource limit exceeded');
      assertNativeStringBudget(
        stage.retainedSqlBytes + this.nativeOwnedBytes + (size.bytes as number),
        this.nativeLimits,
      );
    }
    const rows = this.db
      .prepare(
        `SELECT candidate.candidate_json
      FROM provider_fact_bindings AS binding
      JOIN evidence AS evidence ON evidence.id = binding.evidence_id
      JOIN active_support_candidates AS candidate ON candidate.evidence_id = binding.evidence_id
      WHERE binding.fact_type = 'NODE' AND binding.provider_id = ? AND binding.provider_fact_id = ?
        AND evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'
      LIMIT 2`,
      )
      .all(providerId, providerFactId, this.context.repositoryId, this.context.revisionId) as {
      candidate_json: string;
    }[];
    if (rows.length > 1) throw new Error('Provider node has ambiguous active support');
    if (!rows.length) return null;
    const node = CanonicalNodeSchema.parse(JSON.parse(rows[0]!.candidate_json));
    if (
      node.repositoryId !== this.context.repositoryId ||
      node.revisionId !== this.context.revisionId
    ) {
      throw new Error('Retained Provider node context differs');
    }
    return node;
  }
  *readNormalizedNodes(): IterableIterator<{
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalNode;
  }> {
    yield* this.readNormalized('NODE', CanonicalNodeSchema);
  }
  *readNormalizedEdges(): IterableIterator<{
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalEdge;
  }> {
    yield* this.readNormalized('EDGE', CanonicalEdgeSchema);
  }

  appendSupport(value: PatchSupport): void {
    this.assertWritable();
    if (this.nativeLimits) value = JSON.parse(boundedJson(value, 1_000_000)) as PatchSupport;
    const fact = (value.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
      value.canonical,
    );
    EvidenceSchema.parse(value.evidence);
    FactEvidenceSchema.parse(value.factEvidence);
    ProviderFactBindingSchema.parse(value.binding);
    if (
      value.evidence.id !== value.binding.evidenceId ||
      value.binding.canonicalFact.id !== fact.id ||
      value.binding.canonicalFact.factType !== value.factType ||
      value.evidence.providerFact.factType !== value.factType ||
      value.binding.providerFact.factType !== value.factType ||
      value.evidence.providerFact.providerId !== value.binding.providerFact.providerId ||
      value.evidence.providerFact.providerFactId !== value.binding.providerFact.providerFactId ||
      value.evidence.providerSnapshotId !== value.binding.providerSnapshotId
    )
      throw new Error('Patch support identity differs');
    const json = JSON.stringify(value);
    const bytes = this.checkNativeInsert('patch_support', [
      value.factType,
      fact.factKey,
      value.evidence.id,
      json,
    ]);
    this.db
      .prepare(
        'INSERT INTO temp.patch_support (fact_type, fact_key, evidence_id, payload) VALUES (?, ?, ?, ?)',
      )
      .run(value.factType, fact.factKey, value.evidence.id, json);
    this.nativeRowStringBytes += bytes;
    this.nativeRows.patch_support++;
  }

  *readSupports(): IterableIterator<PatchSupport> {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const rows = this.db
      .prepare(
        "SELECT payload FROM temp.patch_support ORDER BY CASE fact_type WHEN 'NODE' THEN 0 ELSE 1 END, fact_key, evidence_id",
      )
      .iterate() as IterableIterator<PatchRow>;
    for (const row of rows) yield JSON.parse(row.payload) as PatchSupport;
  }

  close(): void {
    if (this.closed) return;
    this.db.exec(
      'DROP TABLE temp.patch_native_summary; DROP TABLE temp.patch_support; DROP TABLE temp.patch_normalized; DROP TABLE temp.patch_event;',
    );
    this.closed = true;
  }

  private *read<T>(kind: PatchKind, schema: { parse(value: unknown): T }): IterableIterator<T> {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const rows = this.db
      .prepare(
        'SELECT payload FROM temp.patch_event WHERE kind = ? ORDER BY source_path, provider_id, provider_fact_id, sequence',
      )
      .iterate(kind) as IterableIterator<PatchRow>;
    for (const row of rows) yield schema.parse(JSON.parse(row.payload));
  }

  private putNormalized<T>(
    factType: 'NODE' | 'EDGE',
    pair: { readonly provider: ProviderFactRef; readonly canonical: T },
    schema: { parse(value: unknown): T },
  ): void {
    this.assertWritable();
    if (this.nativeLimits) pair = JSON.parse(boundedJson(pair, 1_000_000)) as typeof pair;
    ProviderFactRefSchema.parse(pair.provider);
    if (pair.provider.factType !== factType)
      throw new Error('Normalized Provider Fact type differs');
    schema.parse(pair.canonical);
    const json = JSON.stringify(pair);
    const bytes = this.checkNativeInsert('patch_normalized', [
      factType,
      pair.provider.providerFactId,
      json,
    ]);
    this.db
      .prepare(
        'INSERT INTO temp.patch_normalized (fact_type, provider_fact_id, payload) VALUES (?, ?, ?)',
      )
      .run(factType, pair.provider.providerFactId, json);
    this.nativeRowStringBytes += bytes;
    this.nativeRows.patch_normalized++;
  }

  private *readNormalized<T>(
    factType: 'NODE' | 'EDGE',
    schema: { parse(value: unknown): T },
  ): IterableIterator<{
    readonly provider: ProviderFactRef;
    readonly canonical: T;
  }> {
    this.assertOpen();
    if (this.nativeLimits) this.preflightNativeRows();
    const rows = this.db
      .prepare(
        "SELECT payload FROM temp.patch_normalized WHERE fact_type = ? ORDER BY json_extract(payload, '$.canonical.factKey'), provider_fact_id",
      )
      .iterate(factType) as IterableIterator<PatchRow>;
    for (const row of rows) {
      const pair = JSON.parse(row.payload);
      yield {
        provider: ProviderFactRefSchema.parse(pair.provider),
        canonical: schema.parse(pair.canonical),
      };
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Patch stage is closed');
  }
  private assertWritable(): void {
    this.assertOpen();
    if (this.sealed || this.validating)
      throw new Error('Native patch state is sealed or validating');
  }

  private checkNativeInsert(
    table: keyof RepositoryPatchStage['nativeRows'],
    strings: readonly string[],
  ): number {
    if (!this.nativeLimits) return 0;
    const bytes = strings.reduce((total, s) => total + Buffer.byteLength(s), 0);
    if (
      this.nativeRows[table] >= 10_000 ||
      ((table === 'patch_event' || table === 'patch_native_summary') &&
        this.nativeRows.patch_event + this.nativeRows.patch_native_summary >= 10_000)
    )
      throw new Error('Native staged row resource limit exceeded');
    assertNativeStringBudget(
      this.nativeStringBytes + this.nativeRowStringBytes + this.nativeOwnedBytes + bytes,
      this.nativeLimits,
    );
    return bytes;
  }
}

function freezeOwned<T>(value: T): T {
  const pending: object[] = [value as object];
  while (pending.length) {
    const next = pending.pop()!;
    if (Object.isFrozen(next)) continue;
    Object.freeze(next);
    for (const item of Object.values(next))
      if (item !== null && typeof item === 'object') pending.push(item);
  }
  return value;
}
