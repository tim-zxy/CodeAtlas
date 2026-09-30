import type { DatabaseSync } from 'node:sqlite';
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
  private context: {
    repositoryId: string;
    revisionId: string;
    fingerprint: string;
    snapshotId: string;
  } | null = null;

  constructor(
    private readonly db: DatabaseSync,
    readonly selectGroup: (group: readonly PatchSupport[]) => CanonicalNode | CanonicalEdge,
  ) {
    db.exec(`
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
    this.assertOpen();
    if (this.completed) throw new Error('Patch stage is already complete');
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
        ? parseCoverage(event.payload)
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
        JSON.stringify(payload),
      );
  }

  confirmSucceeded(terminal: unknown): void {
    this.assertOpen();
    if (this.completed) throw new Error('Patch stage is already complete');
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
  *readDiagnostics(): IterableIterator<unknown> {
    yield* this.read('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema);
  }

  getProviderNode(id: string): ProviderNode | null {
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
    const row = this.db
      .prepare('SELECT payload FROM temp.patch_event WHERE source_id = ?')
      .get(id) as PatchRow | undefined;
    return row ? SourceFileSchema.parse(JSON.parse(row.payload)) : null;
  }

  getSourceFileByPath(path: string): SourceFile | null {
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
    this.assertOpen();
    const fact = (value.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
      value.canonical,
    );
    EvidenceSchema.parse(value.evidence);
    FactEvidenceSchema.parse(value.factEvidence);
    ProviderFactBindingSchema.parse(value.binding);
    if (
      value.evidence.id !== value.binding.evidenceId ||
      value.binding.canonicalFact.id !== fact.id ||
      value.binding.canonicalFact.factType !== value.factType
    )
      throw new Error('Patch support identity differs');
    this.db
      .prepare(
        'INSERT INTO temp.patch_support (fact_type, fact_key, evidence_id, payload) VALUES (?, ?, ?, ?)',
      )
      .run(value.factType, fact.factKey, value.evidence.id, JSON.stringify(value));
  }

  *readSupports(): IterableIterator<PatchSupport> {
    this.assertOpen();
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
      'DROP TABLE temp.patch_support; DROP TABLE temp.patch_normalized; DROP TABLE temp.patch_event;',
    );
    this.closed = true;
  }

  private *read<T>(kind: PatchKind, schema: { parse(value: unknown): T }): IterableIterator<T> {
    this.assertOpen();
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
    this.assertOpen();
    ProviderFactRefSchema.parse(pair.provider);
    schema.parse(pair.canonical);
    this.db
      .prepare(
        'INSERT INTO temp.patch_normalized (fact_type, provider_fact_id, payload) VALUES (?, ?, ?)',
      )
      .run(factType, pair.provider.providerFactId, JSON.stringify(pair));
  }

  private *readNormalized<T>(
    factType: 'NODE' | 'EDGE',
    schema: { parse(value: unknown): T },
  ): IterableIterator<{
    readonly provider: ProviderFactRef;
    readonly canonical: T;
  }> {
    this.assertOpen();
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
}
