import { DatabaseSync } from 'node:sqlite';
import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderEdgeSchema,
  ProviderFactBindingSchema,
  ProviderNodeSchema,
  SourceFileSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type Evidence,
  type FactEvidence,
  type ProviderEdge,
  type ProviderFactBinding,
  type ProviderNode,
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

  constructor(private readonly db: DatabaseSync) {
    db.exec(`
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
    this.assertOpen();
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

  *readSourceFiles(): IterableIterator<SourceFile> {
    yield* this.readEvents('SOURCE_FILE', SourceFileSchema);
  }

  *readProviderNodes(): IterableIterator<ProviderNode> {
    yield* this.readEvents('NODE', ProviderNodeSchema);
  }

  *readProviderEdges(): IterableIterator<ProviderEdge> {
    yield* this.readEvents('EDGE', ProviderEdgeSchema);
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
    this.assertOpen();
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
    this.assertOpen();
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
    this.assertOpen();
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
    this.assertOpen();
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
    return (
      this.db
        .prepare(
          "SELECT 1 FROM temp.analysis_merged_row WHERE kind = 'NODE' AND json_extract(payload, '$.id') = ? LIMIT 1",
        )
        .get(id) !== undefined
    );
  }

  *readMergedRows(kind: StagedMergedRow['kind']): IterableIterator<StagedMergedRow> {
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
    for (const row of rows) yield { kind, value: JSON.parse(row.payload) } as StagedMergedRow;
  }

  close(): void {
    if (this.closed) return;
    this.db.exec(
      'DROP TABLE temp.analysis_support; DROP TABLE temp.analysis_merged_row; DROP TABLE temp.analysis_normalized_edge; DROP TABLE temp.analysis_normalized_node; DROP TABLE temp.analysis_event;',
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
}
