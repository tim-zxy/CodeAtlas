import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { boundedJson } from './bounded-json.js';
import {
  assertNativeStateLimits,
  assertNativeStringBudget,
  immutableNativeState,
  type NativeStateLimits,
  type NativeStateExpectation,
  type NativeStateValidationPort,
  type NativeStateJsonFile,
  type ValidatedNativeState,
} from './native-analysis-state.js';
import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderEdgeSchema,
  ProviderFactBindingSchema,
  ProviderNodeSchema,
  ProviderSnapshotDiagnosticSchema,
  SourceFileSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderEdge,
  type ProviderFactBinding,
  type ProviderNode,
  type ProviderSnapshotDiagnostic,
  type SourceFile,
  type ProviderFactRef,
  type ProviderNodeRef,
} from '@codeatlas/ir';

export type StagedMergedRow =
  | { readonly kind: 'NODE'; readonly value: CanonicalNode }
  | { readonly kind: 'EDGE'; readonly value: CanonicalEdge }
  | { readonly kind: 'EVIDENCE'; readonly value: Evidence }
  | { readonly kind: 'FACT_EVIDENCE'; readonly value: FactEvidence }
  | { readonly kind: 'BINDING'; readonly value: ProviderFactBinding };

type StageEvent = { readonly type: string; readonly payload: unknown };
type RecordRow = { readonly payload: string };

/** Provisional, connection-local facts. No TEMP row is an active canonical fact. */
export class RepositoryAnalysisStage {
  private closed = false;
  private completed = false;
  private sealed: ValidatedNativeState | null = null;
  private nativeSerializedBytes = 0;
  private nativeStringBytes = 0;
  private readonly nativeLimits: NativeStateLimits | undefined;
  private terminalContext: {
    repositoryId: string;
    revisionId: string;
    fingerprint: string;
    snapshotId: string;
  } | null = null;
  private terminalCapabilities: unknown = null;

  constructor(
    private readonly db: DatabaseSync,
    nativeLimits?: NativeStateLimits,
  ) {
    if (nativeLimits) assertNativeStateLimits(nativeLimits);
    this.nativeLimits = nativeLimits ? { ...nativeLimits } : undefined;
    db.exec(`
      CREATE TEMP TABLE analysis_native_summary (
        source_file_id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL UNIQUE,
        content_fingerprint TEXT NOT NULL,
        summary_json TEXT NOT NULL
      );
      CREATE TEMP TABLE analysis_event (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        source_file_id TEXT,
        source_path TEXT,
        provider_fact_id TEXT,
        payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX temp.analysis_event_source ON analysis_event(source_file_id) WHERE source_file_id IS NOT NULL;
      CREATE UNIQUE INDEX temp.analysis_event_path ON analysis_event(source_path) WHERE source_path IS NOT NULL;
      CREATE UNIQUE INDEX temp.analysis_event_fact ON analysis_event(provider_fact_id) WHERE provider_fact_id IS NOT NULL;
      CREATE INDEX temp.analysis_event_kind ON analysis_event(type, sequence);
      CREATE TEMP TABLE analysis_normalized_node (
        provider_fact_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TEMP TABLE analysis_normalized_edge (
        provider_fact_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TEMP TABLE analysis_merged_row (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX temp.analysis_merged_kind ON analysis_merged_row(kind, sequence);
      CREATE TEMP TABLE analysis_support (
        fact_type TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_id TEXT NOT NULL,
        evidence_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL
      );
      CREATE INDEX temp.analysis_support_key ON analysis_support(fact_type, fact_key, evidence_id);
    `);
  }

  async accept(value: unknown): Promise<void> {
    this.assertWritable();
    if (this.completed) throw new Error('Analysis stage is already complete');
    if (
      value === null ||
      typeof value !== 'object' ||
      !('type' in value) ||
      !('payload' in value) ||
      typeof value.type !== 'string'
    ) {
      throw new TypeError('Invalid staged event');
    }
    const event = value as StageEvent;
    const payload =
      event.type === 'SOURCE_FILE'
        ? SourceFileSchema.parse(event.payload)
        : event.type === 'NODE'
          ? ProviderNodeSchema.parse(event.payload)
          : event.type === 'EDGE'
            ? ProviderEdgeSchema.parse(event.payload)
            : event.payload;
    const sourceId = event.type === 'SOURCE_FILE' ? (payload as SourceFile).id : null;
    const sourcePath = event.type === 'SOURCE_FILE' ? (payload as SourceFile).path : null;
    const factId =
      event.type === 'NODE' || event.type === 'EDGE'
        ? (payload as ProviderNode | ProviderEdge).providerFactId
        : null;
    this.db
      .prepare(
        'INSERT INTO temp.analysis_event (type, source_file_id, source_path, provider_fact_id, payload) VALUES (?, ?, ?, ?, ?)',
      )
      .run(event.type, sourceId, sourcePath, factId, JSON.stringify(payload));
  }

  async acceptNativeSummary(value: unknown): Promise<void> {
    this.assertWritable();
    if (this.completed) throw new Error('Analysis stage is already complete');
    if (!this.nativeLimits) throw new Error('Native summary retention requires declared limits');
    const json = boundedJson(
      value,
      this.nativeLimits.maxSerializedBytes - this.nativeSerializedBytes,
    );
    const source = (value as { sourceFile?: Record<string, unknown> } | null)?.sourceFile;
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
    assertNativeStringBudget(this.nativeStringBytes + stringBytes, this.nativeLimits);
    this.db
      .prepare('INSERT INTO temp.analysis_native_summary VALUES (?, ?, ?, ?)')
      .run(source.id, source.path, source.contentFingerprint, json);
    this.nativeSerializedBytes += serializedBytes;
    this.nativeStringBytes += stringBytes;
  }

  sealNativeState(
    headerJson: string,
    expected: NativeStateExpectation,
    validate: NativeStateValidationPort,
    limits: NativeStateLimits,
  ): ValidatedNativeState {
    this.assertWritable();
    if (typeof validate !== 'function') throw new TypeError('Native validation port is required');
    if (!this.completed || this.terminalContext === null)
      throw new Error('Analysis stage is not complete');
    if (
      this.terminalContext.repositoryId !== expected.repositoryId ||
      this.terminalContext.revisionId !== expected.revisionId ||
      this.terminalContext.fingerprint !== expected.contentFingerprint
    )
      throw new Error('Native state context differs from completed stage');
    assertNativeStateLimits(limits);
    const effective = {
      maxSerializedBytes: Math.min(
        limits.maxSerializedBytes,
        this.nativeLimits?.maxSerializedBytes ?? limits.maxSerializedBytes,
      ),
      memoryBudgetBytes: Math.min(
        limits.memoryBudgetBytes,
        this.nativeLimits?.memoryBudgetBytes ?? limits.memoryBudgetBytes,
      ),
    };
    const headerBytes = Buffer.byteLength(headerJson);
    if (headerBytes + this.nativeSerializedBytes > effective.maxSerializedBytes)
      throw new Error('Native metadata resource limit exceeded');
    // Preflight the actual full-stage SQL payload before any fact iterator decodes it.
    const staged = this.db
      .prepare(
        'SELECT coalesce(sum(length(CAST(payload AS BLOB))), 0) AS bytes, coalesce(max(length(CAST(payload AS BLOB))), 0) AS largest FROM temp.analysis_event',
      )
      .get() as { bytes: number; largest: number };
    if (staged.largest > 1_000_000) throw new Error('Native staged fact resource limit exceeded');
    const retained = headerBytes + this.nativeStringBytes + staged.bytes;
    assertNativeStringBudget(retained, effective);
    const foreign = this.db
      .prepare(
        `SELECT count(*) AS n FROM temp.analysis_event WHERE type IN ('NODE','EDGE') AND (
      json_extract(payload, '$.providerSnapshotId') IS NOT ? OR json_extract(payload, '$.repositoryId') IS NOT ? OR
      json_extract(payload, '$.revisionId') IS NOT ? OR json_extract(payload, '$.providerId') IS NOT ?)`,
      )
      .get(
        this.terminalContext.snapshotId,
        expected.repositoryId,
        expected.revisionId,
        expected.providerId,
      ) as { n: number };
    if (foreign.n) throw new Error('Native fact context differs from completed snapshot');
    const rows = this.db
      .prepare(
        'SELECT source_file_id, source_path, content_fingerprint, summary_json FROM temp.analysis_native_summary ORDER BY source_path',
      )
      .iterate() as IterableIterator<{
      source_file_id: string;
      source_path: string;
      content_fingerprint: string;
      summary_json: string;
    }>;
    function* files(): IterableIterator<NativeStateJsonFile> {
      for (const row of rows)
        yield {
          sourceFileId: row.source_file_id,
          sourcePath: row.source_path,
          contentFingerprint: row.content_fingerprint,
          summaryJson: row.summary_json,
        };
    }
    const state = validate({
      headerJson,
      expected,
      files: files(),
      maxSerializedBytes: effective.maxSerializedBytes,
      memoryBudgetBytes: effective.memoryBudgetBytes - 2 * retained,
      fullStage: Object.freeze({
        readSourceFiles: () => this.readSourceFiles(),
        readProviderNodes: () => this.readProviderNodes(),
        readProviderEdges: () => this.readProviderEdges(),
        readCoverage: () => this.readCoverage(),
        readDiagnostics: () => this.readDiagnostics(),
      }),
    });
    this.sealed = immutableNativeState(state);
    return this.sealed;
  }

  readSealedNativeState(): ValidatedNativeState {
    this.assertOpen();
    if (!this.sealed) throw new Error('Native state has not been sealed');
    return this.sealed;
  }

  *readSourceFiles(): IterableIterator<SourceFile> {
    yield* this.readEvents('SOURCE_FILE', SourceFileSchema);
  }

  *readProviderNodes(): IterableIterator<ProviderNode> {
    yield* this.readEvents('NODE', ProviderNodeSchema);
  }

  *readProviderEdges(): IterableIterator<ProviderEdge> {
    yield* this.readEvents('EDGE', ProviderEdgeSchema);
  }

  *readCoverage(): IterableIterator<unknown> {
    yield* this.readEvents('COVERAGE', { parse: (value: unknown) => value });
  }

  *readDiagnostics(): IterableIterator<ProviderSnapshotDiagnostic> {
    yield* this.readEvents('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema);
  }

  estimatedTempBytes(): number {
    this.assertOpen();
    const pages = this.db.prepare('PRAGMA temp.page_count').get() as { page_count: number };
    const size = this.db.prepare('PRAGMA temp.page_size').get() as { page_size: number };
    return pages.page_count * size.page_size;
  }

  confirmSucceeded(terminal: unknown): void {
    this.assertWritable();
    if (this.completed) throw new Error('Analysis stage is already complete');
    if (
      terminal === null ||
      typeof terminal !== 'object' ||
      !('type' in terminal) ||
      terminal.type !== 'ANALYSIS_COMPLETED' ||
      !('payload' in terminal) ||
      terminal.payload === null ||
      typeof terminal.payload !== 'object' ||
      !('outcome' in terminal.payload) ||
      terminal.payload.outcome !== 'SUCCEEDED'
    ) {
      throw new Error('Only a successful complete analysis can activate');
    }
    const payload = terminal.payload as Record<string, unknown>;
    if (
      typeof payload.repositoryId !== 'string' ||
      typeof payload.revisionId !== 'string' ||
      typeof payload.revisionFingerprint !== 'string' ||
      typeof payload.providerSnapshotId !== 'string'
    ) {
      throw new Error('Analysis terminal context is incomplete');
    }
    const counts = payload.counts as Record<string, unknown> | undefined;
    for (const [name, eventType] of [
      ['sourceFiles', 'SOURCE_FILE'],
      ['nodes', 'NODE'],
      ['edges', 'EDGE'],
      ['coverage', 'COVERAGE'],
      ['diagnostics', 'DIAGNOSTIC'],
    ] as const) {
      const actual = this.db
        .prepare('SELECT count(*) AS n FROM temp.analysis_event WHERE type = ?')
        .get(eventType) as { n: number };
      if (!counts || counts[name] !== actual.n) {
        throw new Error(`Analysis terminal ${name} count does not match stage`);
      }
    }
    this.terminalContext = {
      repositoryId: payload.repositoryId,
      revisionId: payload.revisionId,
      fingerprint: payload.revisionFingerprint,
      snapshotId: payload.providerSnapshotId,
    };
    this.terminalCapabilities = payload.capabilities;
    this.completed = true;
  }

  assertApplicable(
    db: DatabaseSync,
    expected: {
      repositoryId: string;
      revisionId: string;
      contentFingerprint: string;
      snapshotId: string;
      capabilities: unknown;
    },
  ): void {
    this.assertOpen();
    if (
      this.db !== db ||
      !this.completed ||
      this.terminalContext === null ||
      this.terminalContext.repositoryId !== expected.repositoryId ||
      this.terminalContext.revisionId !== expected.revisionId ||
      this.terminalContext.fingerprint !== expected.contentFingerprint ||
      this.terminalContext.snapshotId !== expected.snapshotId ||
      !isDeepStrictEqual(this.terminalCapabilities, expected.capabilities)
    ) {
      throw new Error('Analysis stage is not a complete result on this connection');
    }
  }

  getProviderNode(providerFactId: string): ProviderNode | null {
    this.assertOpen();
    const row = this.db
      .prepare(
        "SELECT payload FROM temp.analysis_event WHERE type = 'NODE' AND provider_fact_id = ?",
      )
      .get(providerFactId) as RecordRow | undefined;
    return row ? ProviderNodeSchema.parse(JSON.parse(row.payload)) : null;
  }

  getSourceFile(id: string): SourceFile | null {
    this.assertOpen();
    const row = this.db
      .prepare('SELECT payload FROM temp.analysis_event WHERE source_file_id = ?')
      .get(id) as RecordRow | undefined;
    return row ? SourceFileSchema.parse(JSON.parse(row.payload)) : null;
  }

  getSourceFileByPath(path: string): SourceFile | null {
    this.assertOpen();
    const row = this.db
      .prepare('SELECT payload FROM temp.analysis_event WHERE source_path = ?')
      .get(path) as RecordRow | undefined;
    return row ? SourceFileSchema.parse(JSON.parse(row.payload)) : null;
  }

  putNormalizedNode(pair: {
    readonly provider: { readonly providerFactId: string };
    readonly canonical: CanonicalNode;
  }): void {
    this.assertWritable();
    CanonicalNodeSchema.parse(pair.canonical);
    this.db
      .prepare(
        'INSERT INTO temp.analysis_normalized_node (provider_fact_id, payload) VALUES (?, ?)',
      )
      .run(pair.provider.providerFactId, JSON.stringify(pair));
  }

  getNormalizedNode(providerFactId: string): {
    readonly provider: { readonly providerFactId: string };
    readonly canonical: CanonicalNode;
  } | null {
    this.assertOpen();
    const row = this.db
      .prepare('SELECT payload FROM temp.analysis_normalized_node WHERE provider_fact_id = ?')
      .get(providerFactId) as RecordRow | undefined;
    if (!row) return null;
    const value = JSON.parse(row.payload);
    return { provider: value.provider, canonical: CanonicalNodeSchema.parse(value.canonical) };
  }

  *readNormalizedNodes(): IterableIterator<{
    readonly provider: ProviderNodeRef;
    readonly canonical: CanonicalNode;
  }> {
    this.assertOpen();
    const rows = this.db
      .prepare(
        "SELECT payload FROM temp.analysis_normalized_node ORDER BY json_extract(payload, '$.canonical.factKey'), provider_fact_id",
      )
      .iterate() as IterableIterator<RecordRow>;
    for (const row of rows) {
      const pair = JSON.parse(row.payload);
      yield {
        provider: pair.provider as ProviderNodeRef,
        canonical: CanonicalNodeSchema.parse(pair.canonical),
      };
    }
  }

  putNormalizedEdge(pair: {
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalEdge;
  }): void {
    this.assertWritable();
    CanonicalEdgeSchema.parse(pair.canonical);
    this.db
      .prepare(
        'INSERT INTO temp.analysis_normalized_edge (provider_fact_id, payload) VALUES (?, ?)',
      )
      .run(pair.provider.providerFactId, JSON.stringify(pair));
  }

  *readNormalizedEdges(): IterableIterator<{
    readonly provider: ProviderFactRef;
    readonly canonical: CanonicalEdge;
  }> {
    this.assertOpen();
    const rows = this.db
      .prepare(
        "SELECT payload FROM temp.analysis_normalized_edge ORDER BY json_extract(payload, '$.canonical.factKey'), provider_fact_id",
      )
      .iterate() as IterableIterator<RecordRow>;
    for (const row of rows) {
      const pair = JSON.parse(row.payload);
      yield { provider: pair.provider, canonical: CanonicalEdgeSchema.parse(pair.canonical) };
    }
  }

  appendMergedRow(row: StagedMergedRow): void {
    this.assertWritable();
    const schema =
      row.kind === 'NODE'
        ? CanonicalNodeSchema
        : row.kind === 'EDGE'
          ? CanonicalEdgeSchema
          : row.kind === 'EVIDENCE'
            ? EvidenceSchema
            : row.kind === 'FACT_EVIDENCE'
              ? FactEvidenceSchema
              : ProviderFactBindingSchema;
    const value = schema.parse(row.value);
    this.db
      .prepare('INSERT INTO temp.analysis_merged_row (kind, payload) VALUES (?, ?)')
      .run(row.kind, JSON.stringify(value));
  }

  appendSupport(value: {
    readonly factType: 'NODE' | 'EDGE';
    readonly canonical: CanonicalNode | CanonicalEdge;
    readonly evidence: Evidence;
  }): void {
    this.assertWritable();
    const prior = this.db
      .prepare(
        'SELECT fact_key FROM temp.analysis_support WHERE fact_type = ? AND fact_id = ? LIMIT 1',
      )
      .get(value.factType, value.canonical.id) as { fact_key: string } | undefined;
    if (prior && prior.fact_key !== value.canonical.factKey) {
      throw new Error('Canonical fact ID conflicts with another FactKey');
    }
    this.db
      .prepare(
        'INSERT INTO temp.analysis_support (fact_type, fact_key, fact_id, evidence_id, payload) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        value.factType,
        value.canonical.factKey,
        value.canonical.id,
        value.evidence.id,
        JSON.stringify(value),
      );
  }

  *readSupportGroups<T>(): IterableIterator<T[]> {
    this.assertOpen();
    const rows = this.db
      .prepare(
        "SELECT fact_type, fact_key, payload FROM temp.analysis_support ORDER BY CASE fact_type WHEN 'NODE' THEN 0 ELSE 1 END, fact_key, evidence_id",
      )
      .iterate() as IterableIterator<{ fact_type: string; fact_key: string; payload: string }>;
    let key: string | undefined;
    let group: T[] = [];
    for (const row of rows) {
      const next = `${row.fact_type}\0${row.fact_key}`;
      if (key !== undefined && key !== next) {
        yield group;
        group = [];
      }
      key = next;
      group.push(JSON.parse(row.payload) as T);
    }
    if (group.length) yield group;
  }

  hasMergedNode(id: string): boolean {
    this.assertOpen();
    return this.hasMergedRow('NODE', id);
  }

  hasMergedRow(kind: StagedMergedRow['kind'], id: string): boolean {
    this.assertOpen();
    const path = kind === 'FACT_EVIDENCE' || kind === 'BINDING' ? '$.evidenceId' : '$.id';
    return (
      this.db
        .prepare(
          `SELECT 1 FROM temp.analysis_merged_row WHERE kind = ? AND json_extract(payload, '${path}') = ? LIMIT 1`,
        )
        .get(kind, id) !== undefined
    );
  }

  *readMergedRows<K extends StagedMergedRow['kind']>(
    kind: K,
  ): IterableIterator<Extract<StagedMergedRow, { kind: K }>> {
    this.assertOpen();
    const order =
      kind === 'NODE' || kind === 'EDGE'
        ? '$.factKey'
        : kind === 'EVIDENCE'
          ? '$.id'
          : '$.evidenceId';
    const rows = this.db
      .prepare(
        `SELECT payload FROM temp.analysis_merged_row WHERE kind = ? ORDER BY json_extract(payload, '${order}')`,
      )
      .iterate(kind) as IterableIterator<RecordRow>;
    for (const row of rows)
      yield { kind, value: JSON.parse(row.payload) } as Extract<StagedMergedRow, { kind: K }>;
  }

  close(): void {
    if (this.closed) return;
    this.db.exec(
      'DROP TABLE temp.analysis_native_summary; DROP TABLE temp.analysis_support; DROP TABLE temp.analysis_merged_row; DROP TABLE temp.analysis_normalized_edge; DROP TABLE temp.analysis_normalized_node; DROP TABLE temp.analysis_event;',
    );
    this.closed = true;
  }

  private *readEvents<T>(type: string, schema: { parse(value: unknown): T }): IterableIterator<T> {
    this.assertOpen();
    const rows = this.db
      .prepare('SELECT payload FROM temp.analysis_event WHERE type = ? ORDER BY sequence')
      .iterate(type) as IterableIterator<RecordRow>;
    for (const row of rows) yield schema.parse(JSON.parse(row.payload));
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Analysis stage is closed');
  }

  private assertWritable(): void {
    this.assertOpen();
    if (this.sealed) throw new Error('Analysis stage is sealed');
  }
}
