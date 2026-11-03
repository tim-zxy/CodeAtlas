import { createCodeIdentityEncoder } from './code-identity.js';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { types } from 'node:util';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  EntityIdSchema,
  ContentFingerprintSchema,
  EvidenceSchema,
  ProviderFactBindingSchema,
  FactEvidenceSchema,
  ProviderSnapshotSchema,
  ProviderCapabilityObservationSchema,
  ProviderCoverageStatusSchema,
  WorktreeRevisionSchema,
  SourceFileSchema,
  RepositorySchema,
  RepoBasisSchema,
  ensurePhase1Data,
  EpochMillisecondsSchema,
  epochMillisecondsToUtcInstant,
  type EntityId,
  type ContentFingerprint,
  type RepoBasis,
  type WorktreeRevision,
  type CanonicalEdge,
} from '@codeatlas/ir';
import { boundedJson } from './bounded-json.js';

export interface CodeContextCaptureLimits {
  readonly maxRows: number;
  readonly maxSerializedBytes: number;
  readonly memoryBudgetBytes: number;
}
export interface RepositoryCodeContextView {
  readonly schemaVersion: 1;
  readonly kind: 'REPOSITORY_CODE_CAPTURE';
  readonly repositoryId: EntityId;
  readonly repositoryLocatorDigest: string;
  readonly activeBasis: Readonly<RepoBasis> | null;
  readonly targetSource: Readonly<{
    repositoryId: EntityId;
    revisionId: EntityId;
    contentFingerprint: ContentFingerprint;
  }> | null;
  readonly sourceInventoryDigest: string | null;
  readonly sourceFileCount: number;
  readonly committedSnapshotCount: number;
  readonly historicalSourceProof: 'UNAVAILABLE';
}
export interface CapturedRepositoryCodeContext {
  readonly handle: object;
  readonly view: RepositoryCodeContextView;
}
type Code =
  | 'INVALID_CODE_CAPTURE'
  | 'CODE_CAPTURE_UNAVAILABLE'
  | 'CODE_CAPTURE_CHANGED'
  | 'CODE_CAPTURE_LIMIT_EXCEEDED'
  | 'CODE_CAPTURE_RELEASED';
export class CaptureError extends Error {
  constructor(readonly code: Code) {
    super(code);
  }
}
export function fail(code: Code = 'INVALID_CODE_CAPTURE'): never {
  throw new CaptureError(code);
}
type Row = Record<string, unknown>;
const columns: Record<string, readonly string[]> = {
  repository: ['slot', 'id', 'root_path'],
  repository_state: ['repository_id', 'indexed_revision_id', 'indexed_content_fingerprint'],
  revisions: [
    'id',
    'repository_id',
    'kind',
    'content_fingerprint',
    'commit_identity',
    'base_revision_id',
    'source_revision_id',
  ],
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
  provider_fact_bindings: [
    'fact_type',
    'provider_id',
    'provider_fact_id',
    'provider_snapshot_id',
    'canonical_fact_id',
    'evidence_id',
  ],
  fact_evidence: ['fact_type', 'canonical_fact_id', 'evidence_id'],
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
  analysis_coverage: ['provider_snapshot_id', 'capability_name', 'source_file_id', 'status'],
};
const nullable = new Set([
  'indexed_revision_id',
  'indexed_content_fingerprint',
  'commit_identity',
  'base_revision_id',
  'source_revision_id',
  'language_hint',
  'type_kind',
  'symbol_kind',
  'qualified_name',
  'source_range_json',
  'target_node_id',
  'source_file_id',
]);
const numbers = new Set(['slot', 'confidence_score', 'started_at', 'completed_at']);
const relationChecks = [
  `SELECT (SELECT count(*) FROM repository WHERE slot<>1 OR id<>?) + abs((SELECT count(*) FROM repository)-1) + abs((SELECT count(*) FROM repository_state)-1) + (SELECT count(*) FROM repository_state s WHERE NOT EXISTS(SELECT 1 FROM repository r WHERE r.id=s.repository_id)) AS n`,
  `SELECT (SELECT count(*) FROM revisions v WHERE NOT EXISTS(SELECT 1 FROM repository r WHERE r.id=v.repository_id)) + max(0,(SELECT count(*) FROM revisions WHERE kind='WORKTREE')-1) AS n`,
  `SELECT count(*) AS n FROM source_files f WHERE NOT EXISTS(SELECT 1 FROM revisions v WHERE v.id=f.revision_id AND v.repository_id=f.repository_id)`,
  `SELECT (SELECT count(*) FROM canonical_nodes n WHERE NOT EXISTS(SELECT 1 FROM revisions v WHERE v.id=n.revision_id AND v.repository_id=n.repository_id)) + (SELECT count(*) FROM canonical_edges e WHERE NOT EXISTS(SELECT 1 FROM revisions v WHERE v.id=e.revision_id AND v.repository_id=e.repository_id)) AS n`,
  `SELECT (SELECT count(*) FROM canonical_edges e WHERE NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.id=e.source_node_id) OR (e.target_state='RESOLVED' AND (NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.id=e.target_node_id) OR EXISTS(SELECT 1 FROM unresolved_targets u WHERE u.revision_id=e.revision_id AND u.edge_id=e.id))) OR (e.target_state='UNRESOLVED' AND NOT EXISTS(SELECT 1 FROM unresolved_targets u WHERE u.revision_id=e.revision_id AND u.edge_id=e.id))) + (SELECT count(*) FROM unresolved_targets u WHERE NOT EXISTS(SELECT 1 FROM canonical_edges e WHERE e.revision_id=u.revision_id AND e.id=u.edge_id AND e.target_state='UNRESOLVED')) + (SELECT count(*) FROM unresolved_targets u JOIN json_each(u.candidates_json) j WHERE NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=u.revision_id AND n.id=json_extract(j.value,'$.id'))) AS n`,
  `SELECT count(*) AS n FROM evidence e LEFT JOIN provider_snapshots p ON p.id=e.provider_snapshot_id LEFT JOIN repository_state s ON s.repository_id=e.repository_id WHERE e.status='ACTIVE' AND (p.id IS NULL OR s.repository_id IS NULL OR e.repository_id<>p.repository_id OR e.revision_id<>p.requested_revision_id OR e.provider_id<>p.provider_id OR p.outcome<>'SUCCEEDED' OR NOT EXISTS(SELECT 1 FROM provider_fact_bindings b WHERE b.evidence_id=e.id) OR s.indexed_revision_id IS NULL OR e.revision_id<>s.indexed_revision_id)`,
  `SELECT count(*) AS n FROM provider_fact_bindings b LEFT JOIN evidence e ON e.id=b.evidence_id WHERE e.id IS NULL OR (e.status='ACTIVE' AND (b.fact_type<>e.fact_type OR b.provider_id<>e.provider_id OR b.provider_fact_id<>e.provider_fact_id OR b.provider_snapshot_id<>e.provider_snapshot_id OR NOT EXISTS(SELECT 1 FROM fact_evidence f WHERE f.evidence_id=e.id AND f.fact_type=b.fact_type AND f.canonical_fact_id=b.canonical_fact_id) OR (b.fact_type='NODE' AND NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.repository_id=e.repository_id AND n.id=b.canonical_fact_id)) OR (b.fact_type='EDGE' AND NOT EXISTS(SELECT 1 FROM canonical_edges n WHERE n.revision_id=e.revision_id AND n.repository_id=e.repository_id AND n.id=b.canonical_fact_id))))`,
  `SELECT count(*) AS n FROM fact_evidence f LEFT JOIN evidence e ON e.id=f.evidence_id WHERE e.id IS NULL OR (e.status='ACTIVE' AND (f.fact_type<>e.fact_type OR NOT EXISTS(SELECT 1 FROM provider_fact_bindings b WHERE b.evidence_id=f.evidence_id AND b.fact_type=f.fact_type AND b.canonical_fact_id=f.canonical_fact_id)))`,
  `SELECT count(*) AS n FROM active_support_candidates c LEFT JOIN provider_fact_bindings b ON b.evidence_id=c.evidence_id AND b.fact_type=c.fact_type AND b.canonical_fact_id=c.canonical_fact_id LEFT JOIN evidence e ON e.id=c.evidence_id WHERE b.evidence_id IS NULL OR e.id IS NULL OR (e.status='ACTIVE' AND (NOT json_valid(c.candidate_json) OR CASE WHEN json_valid(c.candidate_json) THEN json_extract(c.candidate_json,'$.id') IS NOT c.canonical_fact_id OR json_extract(c.candidate_json,'$.repositoryId') IS NOT e.repository_id OR json_extract(c.candidate_json,'$.revisionId') IS NOT e.revision_id OR json_extract(c.candidate_json,'$.factKey') IS NOT CASE c.fact_type WHEN 'NODE' THEN (SELECT n.fact_key FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.id=c.canonical_fact_id) ELSE (SELECT n.fact_key FROM canonical_edges n WHERE n.revision_id=e.revision_id AND n.id=c.canonical_fact_id) END ELSE 1 END)) OR (e.status='ACTIVE' AND c.fact_type='EDGE' AND (NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.id=json_extract(c.candidate_json,'$.source.id')) OR (json_extract(c.candidate_json,'$.target.state')='RESOLVED' AND NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.id=json_extract(c.candidate_json,'$.target.target.id'))) OR (json_extract(c.candidate_json,'$.target.state')='UNRESOLVED' AND EXISTS(SELECT 1 FROM json_each(c.candidate_json,'$.target.candidates') j WHERE NOT EXISTS(SELECT 1 FROM canonical_nodes n WHERE n.revision_id=e.revision_id AND n.id=json_extract(j.value,'$.id'))))))`,
  `SELECT (SELECT count(*) FROM canonical_nodes n JOIN repository_state s ON s.repository_id=n.repository_id AND s.indexed_revision_id=n.revision_id WHERE NOT EXISTS(SELECT 1 FROM fact_evidence f JOIN evidence e ON e.id=f.evidence_id WHERE f.fact_type='NODE' AND f.canonical_fact_id=n.id AND e.repository_id=n.repository_id AND e.revision_id=n.revision_id AND e.status='ACTIVE')) + (SELECT count(*) FROM canonical_edges n JOIN repository_state s ON s.repository_id=n.repository_id AND s.indexed_revision_id=n.revision_id WHERE NOT EXISTS(SELECT 1 FROM fact_evidence f JOIN evidence e ON e.id=f.evidence_id WHERE f.fact_type='EDGE' AND f.canonical_fact_id=n.id AND e.repository_id=n.repository_id AND e.revision_id=n.revision_id AND e.status='ACTIVE')) AS n`,
  `SELECT (SELECT count(*) FROM analysis_coverage c WHERE NOT EXISTS(SELECT 1 FROM provider_capabilities p WHERE p.snapshot_id=c.provider_snapshot_id AND p.name=c.capability_name)) + (SELECT count(*) FROM provider_capabilities c WHERE NOT EXISTS(SELECT 1 FROM provider_snapshots p WHERE p.id=c.snapshot_id)) AS n`,
  `SELECT count(*) AS n FROM provider_fact_bindings b JOIN evidence e ON e.id=b.evidence_id WHERE e.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM active_support_candidates c WHERE c.evidence_id=b.evidence_id AND c.fact_type=b.fact_type AND c.canonical_fact_id=b.canonical_fact_id)`,
  `SELECT count(*) AS n FROM repository_state s WHERE (s.indexed_revision_id IS NULL)<>(s.indexed_content_fingerprint IS NULL) OR (s.indexed_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM revisions v WHERE v.id=s.indexed_revision_id AND v.repository_id=s.repository_id))`,
];
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function natural(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail();
  return value;
}
export function limitsOf(input: CodeContextCaptureLimits): CodeContextCaptureLimits {
  ensurePhase1Data(input);
  if (
    input === null ||
    typeof input !== 'object' ||
    Object.keys(input).sort().join(',') !== 'maxRows,maxSerializedBytes,memoryBudgetBytes'
  )
    fail();
  if (
    !positive(input.maxRows) ||
    !positive(input.maxSerializedBytes) ||
    !positive(input.memoryBudgetBytes)
  )
    fail();
  return { ...input };
}
export function databaseOpen(db: DatabaseSync): boolean {
  if (typeof db !== 'object' || db === null || types.isProxy(db)) fail();
  try {
    DatabaseSync.prototype.location.call(db, 'temp');
    return true;
  } catch (e) {
    if (
      e instanceof Error &&
      !(e instanceof TypeError) &&
      'code' in e &&
      e.code === 'ERR_INVALID_STATE'
    )
      return false;
    return fail();
  }
}
// UTF-8 order equals scalar-value order for validated well-formed Unicode.
// Compare scalars without temporary byte buffers.
function compare(a: string, b: string): number {
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    const x = a.codePointAt(i)!,
      y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return a === b ? 0 : a.length < b.length ? -1 : 1;
}
export function wellFormed(value: unknown): void {
  if (typeof value === 'string') {
    if (!value.isWellFormed()) fail();
  } else if (Array.isArray(value)) {
    for (const v of value) wellFormed(v);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      wellFormed(k);
      wellFormed(v);
    }
  }
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort(compare)
        .map((k) => [k, sorted((value as Row)[k])]),
    );
  return value;
}
function weight(value: unknown): number {
  if (typeof value === 'string') return Buffer.byteLength(value);
  if (Array.isArray(value)) return value.reduce<number>((n, x) => n + weight(x), 0);
  if (value && typeof value === 'object')
    return Object.entries(value).reduce((n, [k, x]) => n + Buffer.byteLength(k) + weight(x), 0);
  return 0;
}
function rawWeight(row: Row): number {
  return Object.values(row).reduce<number>(
    (n, x) => n + (typeof x === 'string' ? Buffer.byteLength(x) : 0),
    0,
  );
}
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
export function readCodeContextSnapshot(
  db: DatabaseSync,
  repoId: EntityId,
  limits: CodeContextCaptureLimits,
  mode:
    | { readonly schemaVersion: 10 }
    | { readonly schemaVersion: 11 | 13; readonly maxItems: number; readonly maxDepth: number },
): {
  readonly view: RepositoryCodeContextView;
  readonly consumed: {
    readonly rows: number;
    readonly serializedBytes: number;
    readonly items: number;
  };
  readonly retainedLogicalBytes: number;
  readonly entries?: Readonly<Record<string, readonly unknown[]>>;
} {
  const entries: Record<string, unknown[]> = {};
  let items = 0;
  const guard = (value: unknown) => {
    if (mode.schemaVersion === 10) return;
    const maxItems = mode.maxItems,
      maxDepth = mode.maxDepth;
    if (!positive(maxItems) || !positive(maxDepth)) fail();
    function* children(v: object): Generator<unknown> {
      for (const key in v) if (Object.hasOwn(v, key)) yield (v as Record<string, unknown>)[key];
    }
    const frames: { iterator: Generator<unknown>; depth: number }[] = [];
    let next = value,
      depth = 0;
    while (true) {
      if (depth > maxDepth || items >= maxItems) fail('CODE_CAPTURE_LIMIT_EXCEEDED');
      items++;
      if (next !== null && typeof next === 'object')
        frames.push({ iterator: children(next), depth });
      let found = false;
      while (frames.length) {
        const f = frames.at(-1)!,
          n = f.iterator.next();
        if (!n.done) {
          next = n.value;
          depth = f.depth + 1;
          found = true;
          break;
        }
        frames.pop();
      }
      if (!found) break;
    }
  };
  const parseText = (text: string): unknown => {
    if (mode.schemaVersion !== 10) {
      let depth = 0,
        quoted = false,
        escape = false;
      for (const c of text) {
        if (quoted) {
          if (escape) escape = false;
          else if (c === '\\') escape = true;
          else if (c === '"') quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === '{' || c === '[') {
          depth++;
          if (depth - 1 > mode.maxDepth) fail('CODE_CAPTURE_LIMIT_EXCEEDED');
        } else if (c === '}' || c === ']') depth--;
      }
    }
    const parsed: unknown = JSON.parse(text);
    guard(parsed);
    return parsed;
  };
  let delivered = 0,
    serialized = 0,
    context = Buffer.byteLength(repoId);
  const memory = (utf8: number) => {
    if (!Number.isSafeInteger(utf8) || utf8 > Math.floor(limits.memoryBudgetBytes / 2))
      fail('CODE_CAPTURE_LIMIT_EXCEEDED');
  };
  const charge = (n: number) => {
    if (!Number.isSafeInteger(n) || n > limits.maxSerializedBytes - serialized)
      fail('CODE_CAPTURE_LIMIT_EXCEEDED');
    serialized += n;
  };
  const rowCharge = () => {
    if (++delivered > limits.maxRows) fail('CODE_CAPTURE_LIMIT_EXCEEDED');
  };
  const numeric = (sql: string, args: SQLInputValue[] = []) => {
    const r = db.prepare(sql).get(...args);
    if (r) rowCharge();
    return r;
  };
  const count = (sql: string, args: SQLInputValue[] = []) => natural(numeric(sql, args)?.n);
  const textSize = (table: string) =>
    columns[table]!.filter((c) => !numbers.has(c))
      .map((c) => `coalesce(length(CAST("${c}" AS BLOB)),0)`)
      .join('+');
  const checks = (table: string) =>
    columns[table]!.map(
      (c) =>
        `(typeof("${c}") NOT IN (${numbers.has(c) ? "'integer','real'" : "'text'"}${nullable.has(c) ? ",'null'" : ''}))`,
    ).join('+');
  function read(table: string, where: string, args: SQLInputValue[] = [], order = 'rowid') {
    const size = textSize(table);
    const unique: Record<string, string[][]> = {
      repository: [['id']],
      repository_state: [['repository_id']],
      revisions: [['id']],
      source_files: [['id'], ['path']],
      canonical_nodes: [['id'], ['fact_key']],
      canonical_edges: [['id'], ['fact_key']],
      unresolved_targets: [['edge_id']],
      evidence: [['id']],
      provider_fact_bindings: [['evidence_id', 'fact_type', 'canonical_fact_id']],
      fact_evidence: [['evidence_id', 'fact_type', 'canonical_fact_id']],
      active_support_candidates: [['evidence_id']],
      provider_snapshots: [['id']],
      provider_capabilities: [['name']],
    };
    const keys = unique[table] ?? [];
    const duplicate =
      keys
        .map(
          (k) =>
            `EXISTS(SELECT 1 FROM ${table} WHERE ${where} GROUP BY ${k.map((c) => c + ' COLLATE BINARY').join(',')} HAVING count(*)>1)`,
        )
        .join(' OR ') || '0';
    const census = numeric(
      `SELECT count(*) AS n,coalesce(max(${size}),0) AS bytes,(${duplicate}) AS duplicates FROM ${table} WHERE ${where}`,
      [...keys.flatMap(() => args), ...args],
    )!;
    if (census.duplicates !== 0) fail();
    const n = natural(census.n),
      largest = natural(census.bytes);
    if (largest > limits.maxSerializedBytes - serialized) fail('CODE_CAPTURE_LIMIT_EXCEEDED');
    memory(context + largest);
    function* rows(): Generator<{ row: Row; bytes: number; multiplicity: number; last: boolean }> {
      const coveragePartition = 'provider_snapshot_id,capability_name,source_file_id,status';
      const window =
        table === 'analysis_coverage'
          ? `,count(*) OVER (PARTITION BY ${coveragePartition}) AS multiplicity,row_number() OVER (PARTITION BY ${coveragePartition} ORDER BY rowid) AS occurrence`
          : '';
      const iterator = db
        .prepare(
          `SELECT rowid AS locator,${size} AS bytes${window} FROM ${table} WHERE ${where} ORDER BY ${order}`,
        )
        .iterate(...args);
      try {
        for (const loc of iterator) {
          rowCharge();
          const bytes = natural(loc.bytes);
          memory(context + bytes);
          if (bytes > limits.maxSerializedBytes - serialized) fail('CODE_CAPTURE_LIMIT_EXCEEDED');
          const row = db
            .prepare(`SELECT ${columns[table]!.join(',')} FROM ${table} WHERE rowid=?`)
            .get(loc.locator as SQLInputValue);
          if (!row) fail();
          rowCharge();
          if (mode.schemaVersion !== 10 && rawWeight(row) !== bytes) fail();
          charge(bytes);
          guard(row);
          wellFormed(row);
          yield {
            row,
            bytes,
            multiplicity: table === 'analysis_coverage' ? natural(loc.multiplicity) : 1,
            last: table !== 'analysis_coverage' || loc.occurrence === loc.multiplicity,
          };
        }
      } finally {
        iterator.return?.();
      }
    }
    return { n, rows: rows() };
  }
  function single(table: string, where: string, args: SQLInputValue[] = []) {
    const r = read(table, where, args);
    if (r.n > 1) fail();
    let value: Row | null = null;
    for (const item of r.rows) value = item.row;
    return value;
  }
  const order = (...fields: string[]) => fields.map((f) => `CAST(${f} AS BLOB)`).join(',');
  const remember = (tag: string, value: unknown) => {
    if (mode.schemaVersion === 10) return;
    if (!entries[tag]) {
      guard([]);
      entries[tag] = [];
      context += Buffer.byteLength(tag);
    }
    context += weight(value);
    memory(context);
    entries[tag]!.push(frozen(value));
  };
  function digest(domain: string) {
    return createCodeIdentityEncoder(domain, {
      start(initial) {
        charge(Buffer.byteLength(initial));
        memory(context + Buffer.byteLength(initial));
      },
      encode(value, rawBytes) {
        guard(value);
        ensurePhase1Data(value);
        wellFormed(value);
        const retained = context + rawBytes + 2 * weight(value);
        memory(retained);
        // Bound serializer fragments before constructing the joined encoded row.
        const max = Math.min(
          limits.maxSerializedBytes - serialized,
          Math.floor((Math.floor(limits.memoryBudgetBytes / 2) - retained) / 2),
        );
        let json: string;
        try {
          json = boundedJson(sorted(value), max);
        } catch (e) {
          if (e instanceof TypeError) fail();
          return fail('CODE_CAPTURE_LIMIT_EXCEEDED');
        }
        const bytes = Buffer.byteLength(json),
          prefix = String(bytes) + ':';
        memory(retained + 2 * bytes + prefix.length);
        charge(prefix.length + bytes);
        return json;
      },
      remember(tag, value) {
        if (
          mode.schemaVersion !== 10 &&
          value !== null &&
          typeof value === 'object' &&
          'value' in value &&
          (domain === 'codeatlas-code-activation-v1' ||
            (domain === 'codeatlas-source-inventory-v1' && tag === 'SOURCE_FILE'))
        )
          remember(tag, value.value);
      },
      end() {
        context += 64;
        memory(context);
      },
    });
  }
  const version = numeric('PRAGMA user_version')?.user_version;
  if (version !== mode.schemaVersion) fail('CODE_CAPTURE_UNAVAILABLE');
  if (count("SELECT count(*) AS n FROM pragma_encoding WHERE encoding='UTF-8'") !== 1)
    fail('CODE_CAPTURE_UNAVAILABLE');
  for (const [table, names] of Object.entries(columns)) {
    const schemaNames = table === 'analysis_coverage' ? ['id', ...names] : names;
    const total = schemaNames.length;
    const expected = schemaNames.map(() => '?').join(',');
    if (
      count(
        `SELECT CASE WHEN (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name=?)=1 AND (SELECT count(*) FROM pragma_table_info(?))=? THEN (SELECT count(*) FROM pragma_table_info(?) WHERE name IN (${expected})) ELSE 0 END AS n`,
        [table, table, total, table, ...schemaNames],
      ) !== total
    )
      fail('CODE_CAPTURE_UNAVAILABLE');
    // Table existence and exact current shape are included numerically in this census.
    // No arbitrary SQL/schema/column-name TEXT is fetched.
    // An extra physical coverage id is deliberately not part of its payload.
  }
  for (const table of Object.keys(columns)) {
    const c = numeric(
      `SELECT count(*) AS n,coalesce(sum(${checks(table)}),0) AS bad,coalesce(max(${textSize(table)}),0) AS bytes FROM ${table}`,
    )!;
    natural(c.n);
    if (natural(c.bad) !== 0) fail();
    if (natural(c.bytes) > limits.maxSerializedBytes - serialized)
      fail('CODE_CAPTURE_LIMIT_EXCEEDED');
    memory(context + natural(c.bytes));
  }
  for (const [i, sql] of relationChecks.entries())
    if (count(sql, i === 0 ? [repoId] : []) !== 0)
      fail(i === 11 ? 'CODE_CAPTURE_UNAVAILABLE' : 'INVALID_CODE_CAPTURE');
  const repo = single('repository', 'id=?', [repoId]);
  const state = single('repository_state', 'repository_id=?', [repoId]);
  if (!repo || !state) fail();
  const repository = RepositorySchema.parse({ id: repo.id, rootPath: repo.root_path });
  const revRow = single('revisions', "repository_id=? AND kind='WORKTREE'", [repoId]);
  const revision: WorktreeRevision | null = revRow
    ? WorktreeRevisionSchema.parse({
        id: revRow.id,
        repositoryId: revRow.repository_id,
        kind: revRow.kind,
        contentFingerprint: revRow.content_fingerprint,
        baseRevisionId: revRow.base_revision_id,
      })
    : null;
  const indexed =
    state.indexed_revision_id === null ? null : EntityIdSchema.parse(state.indexed_revision_id);
  const fingerprint =
    state.indexed_content_fingerprint === null
      ? null
      : ContentFingerprintSchema.parse(state.indexed_content_fingerprint);
  context +=
    rawWeight(repo) + rawWeight(state) + (revRow ? rawWeight(revRow) : 0) + weight(revision);
  memory(context);
  const committedSnapshotCount = count(
    'SELECT count(*) AS n FROM provider_snapshots WHERE repository_id=?',
    [repoId],
  );
  const locator = digest('codeatlas-repository-locator-v1');
  locator.group('LOCATOR', 1);
  locator.emit({ key: [repository.id], value: repository });
  const repositoryLocatorDigest = locator.end();
  const sources = read(
    'source_files',
    'repository_id=? AND revision_id=?',
    [repoId, revision?.id ?? null],
    order('id'),
  );
  let sourceInventoryDigest: string | null = null;
  if (revision) {
    const source = digest('codeatlas-source-inventory-v1');
    source.group('TARGET', 1);
    source.emit({ key: [revision.id], value: revision });
    source.group('SOURCE_FILE', sources.n);
    for (const { row: r, bytes } of sources.rows) {
      const f = SourceFileSchema.parse({
        id: r.id,
        repositoryId: r.repository_id,
        revisionId: r.revision_id,
        path: r.path,
        contentFingerprint: r.content_fingerprint,
        classification: { role: r.role, provenance: r.provenance, contentKind: r.content_kind },
        languageHint: r.language_hint,
        sensitivity: r.sensitivity,
      });
      source.emit({ key: [f.id], value: f }, bytes);
    }
    sourceInventoryDigest = source.end();
  } else if (sources.n !== 0) fail();
  let activeBasis: RepoBasis | null = null;
  if (indexed !== null) {
    const code = digest('codeatlas-code-activation-v1');
    code.group('HEADER', 1);
    code.emit({
      key: [repoId],
      value: {
        repositoryId: repoId,
        indexedRevisionId: indexed,
        indexedContentFingerprint: fingerprint,
        committedSnapshotCount,
      },
    });
    const scope = 'repository_id=? AND revision_id=?';
    const params = [repoId, indexed];
    const confidence = (r: Row) => ({
      score: r.confidence_score,
      method: r.confidence_method,
      reasons: parseText(String(r.confidence_reasons_json)),
    });
    function edge(r: Row): { value: CanonicalEdge; extra: number } {
      const u = single('unresolved_targets', 'revision_id=? AND edge_id=?', [
        indexed!,
        String(r.id),
      ]);
      const value = CanonicalEdgeSchema.parse({
        id: r.id,
        factKey: r.fact_key,
        repositoryId: r.repository_id,
        revisionId: r.revision_id,
        kind: r.kind,
        source: { factType: 'NODE', id: r.source_node_id },
        target:
          r.target_state === 'RESOLVED'
            ? {
                state: r.target_state,
                resolution: r.resolution,
                target: { factType: 'NODE', id: r.target_node_id },
              }
            : {
                state: r.target_state,
                resolution: r.resolution,
                originalHint: u?.original_hint,
                candidates: parseText(String(u?.candidates_json)),
              },
        sourceRange: r.source_range_json === null ? null : parseText(String(r.source_range_json)),
        confidence: confidence(r),
      });
      return { value, extra: u ? rawWeight(u) : 0 };
    }
    for (const [tag, table] of [
      ['NODE', 'canonical_nodes'],
      ['EDGE', 'canonical_edges'],
    ] as const) {
      const selected = read(table, scope, params, order('id'));
      code.group(tag, selected.n);
      for (const { row: r, bytes } of selected.rows) {
        const e = tag === 'EDGE' ? edge(r) : null;
        const value = e
          ? e.value
          : CanonicalNodeSchema.parse({
              id: r.id,
              factKey: r.fact_key,
              repositoryId: r.repository_id,
              revisionId: r.revision_id,
              kind: r.kind,
              ...(r.kind === 'TYPE'
                ? { typeKind: r.type_kind }
                : r.kind === 'SYMBOL'
                  ? { symbolKind: r.symbol_kind }
                  : {}),
              name: r.name,
              qualifiedName: r.qualified_name,
              sourceRange:
                r.source_range_json === null ? null : parseText(String(r.source_range_json)),
              confidence: confidence(r),
            });
        code.emit({ key: [value.id], value }, bytes + (e?.extra ?? 0));
      }
    }
    const active =
      "evidence_id IN (SELECT id FROM evidence WHERE repository_id=? AND status='ACTIVE')";
    for (const [tag, table] of [
      ['EVIDENCE', 'evidence'],
      ['BINDING', 'provider_fact_bindings'],
      ['FACT_EVIDENCE', 'fact_evidence'],
      ['SUPPORT_CANDIDATE', 'active_support_candidates'],
    ] as const) {
      const selected = read(
        table,
        tag === 'EVIDENCE' ? "repository_id=? AND status='ACTIVE'" : active,
        [repoId],
        tag === 'EVIDENCE' ? order('id') : order('evidence_id', 'fact_type', 'canonical_fact_id'),
      );
      code.group(tag, selected.n);
      for (const { row: r, bytes } of selected.rows) {
        const providerFact = {
          factType: r.fact_type,
          providerId: r.provider_id,
          providerFactId: r.provider_fact_id,
        };
        const fact = { factType: r.fact_type, id: r.canonical_fact_id };
        const value =
          tag === 'EVIDENCE'
            ? EvidenceSchema.parse({
                id: r.id,
                repositoryId: r.repository_id,
                revisionId: r.revision_id,
                providerSnapshotId: r.provider_snapshot_id,
                providerFact,
                status: r.status,
              })
            : tag === 'BINDING'
              ? ProviderFactBindingSchema.parse({
                  providerFact,
                  providerSnapshotId: r.provider_snapshot_id,
                  canonicalFact: fact,
                  evidenceId: r.evidence_id,
                })
              : tag === 'FACT_EVIDENCE'
                ? FactEvidenceSchema.parse({ fact, evidenceId: r.evidence_id })
                : {
                    evidenceId: EntityIdSchema.parse(r.evidence_id),
                    factType: r.fact_type,
                    canonicalFactId: r.canonical_fact_id,
                    candidate: (r.fact_type === 'NODE'
                      ? CanonicalNodeSchema
                      : CanonicalEdgeSchema
                    ).parse(parseText(String(r.candidate_json))),
                  };
        code.emit(
          {
            key: tag === 'EVIDENCE' ? [r.id] : [r.evidence_id, r.fact_type, r.canonical_fact_id],
            value,
          },
          bytes,
        );
      }
    }
    const snapshots = read(
      'provider_snapshots',
      'repository_id=? AND requested_revision_id=?',
      [repoId, indexed],
      order('id'),
    );
    code.group('SNAPSHOT', snapshots.n);
    for (const { row: r, bytes } of snapshots.rows) {
      const caps = read('provider_capabilities', 'snapshot_id=?', [String(r.id)], order('name'));
      const capabilities = [];
      let raw = bytes;
      for (const { row: c, bytes: b } of caps.rows) {
        raw += b;
        capabilities.push(
          ProviderCapabilityObservationSchema.parse({
            name: c.name,
            support: c.support,
            coverage: c.coverage,
          }),
        );
        memory(context + raw + 2 * weight(capabilities));
      }
      const snapshot = ProviderSnapshotSchema.parse({
        id: r.id,
        repositoryId: r.repository_id,
        providerId: r.provider_id,
        providerVersion: r.provider_version,
        runtimeVersion: r.runtime_version,
        requestedRevisionId: r.requested_revision_id,
        requestedRevisionFingerprint: r.requested_revision_fingerprint,
        startedAt: epochMillisecondsToUtcInstant(EpochMillisecondsSchema.parse(r.started_at)),
        completedAt: epochMillisecondsToUtcInstant(EpochMillisecondsSchema.parse(r.completed_at)),
        capabilities,
        diagnostics: [],
        outcome: r.outcome,
      });
      if (mode.schemaVersion !== 10) {
        guard(snapshot);
        remember('PROVIDER_SNAPSHOT', snapshot);
      }
      const {
        startedAt: ignoredStart,
        completedAt: ignoredEnd,
        capabilities: ignoredCaps,
        diagnostics: ignoredDiagnostics,
        ...stable
      } = snapshot;
      void ignoredStart;
      void ignoredEnd;
      void ignoredCaps;
      void ignoredDiagnostics;
      code.emit({ key: [snapshot.id], value: { snapshot: stable, capabilities } }, raw);
    }
    const coverScope =
      'provider_snapshot_id IN (SELECT id FROM provider_snapshots WHERE repository_id=? AND requested_revision_id=?)';
    const selected = read(
      'analysis_coverage',
      coverScope,
      [repoId, indexed],
      order('provider_snapshot_id', 'capability_name') +
        ',CASE WHEN source_file_id IS NULL THEN 0 ELSE 1 END,' +
        order("coalesce(source_file_id,'')", 'status'),
    );
    const distinct = count(
      `SELECT count(*) AS n FROM (SELECT 1 FROM analysis_coverage WHERE ${coverScope} GROUP BY provider_snapshot_id,capability_name,source_file_id,status)`,
      [repoId, indexed],
    );
    code.group('COVERAGE', distinct);
    for (const { row: r, bytes, multiplicity, last } of selected.rows) {
      const value = {
        providerSnapshotId: EntityIdSchema.parse(r.provider_snapshot_id),
        capabilityName: EntityIdSchema.parse(r.capability_name),
        sourceFileId: r.source_file_id === null ? null : EntityIdSchema.parse(r.source_file_id),
        status: ProviderCoverageStatusSchema.parse(r.status),
        multiplicity,
      };
      if (multiplicity < 1) fail();
      const key = [
        value.providerSnapshotId,
        value.capabilityName,
        value.sourceFileId === null ? 'NONE' : 'SOURCE',
        value.sourceFileId ?? '',
        value.status,
      ];
      // Visit and charge every physical row; emit once without retaining a
      // previous payload while fetching the next semantic coverage group.
      if (last) code.emit({ key, value }, bytes);
    }
    activeBasis = RepoBasisSchema.parse({
      repositoryId: repoId,
      revisionId: indexed,
      contentFingerprint: fingerprint,
      codeActivationDigest: code.end(),
    });
  }
  const view: RepositoryCodeContextView = {
    schemaVersion: 1,
    kind: 'REPOSITORY_CODE_CAPTURE',
    repositoryId: repoId,
    repositoryLocatorDigest,
    activeBasis,
    targetSource: revision
      ? {
          repositoryId: repoId,
          revisionId: revision.id,
          contentFingerprint: revision.contentFingerprint,
        }
      : null,
    sourceInventoryDigest,
    sourceFileCount: sources.n,
    committedSnapshotCount,
    historicalSourceProof: 'UNAVAILABLE',
  };
  memory(context + weight(view));
  guard(view);
  if (mode.schemaVersion !== 10) {
    for (const a of Object.values(entries)) Object.freeze(a);
    Object.freeze(entries);
  }
  return {
    view: frozen(view),
    consumed: { rows: delivered, serializedBytes: serialized, items },
    retainedLogicalBytes: context + weight(view),
    ...(mode.schemaVersion !== 10 ? { entries } : {}),
  };
}
