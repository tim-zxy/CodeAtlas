import crypto from 'node:crypto';
import { canonical, measures } from './independent-code-resource-model.mjs';
export const readColumns = {
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
const number = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('unsafe independent read cost');
    return Number(v);
  },
  bytes = (v) => BigInt(Buffer.byteLength(v)),
  rawWeight = (r) =>
    Object.values(r).reduce((n, v) => n + (typeof v === 'string' ? bytes(v) : 0n), 0n),
  sort = (rows, key) =>
    [...rows].sort((a, b) =>
      Buffer.compare(Buffer.from(String(a[key])), Buffer.from(String(b[key]))),
    );
/** Closed zero-fact Code read model, including SQL deliveries, scalar first preflights, framed digests and peak logical admission. */
export function modelZeroCodeRead(input) {
  const { tables: t, repositoryId: id } = input;
  for (const name of [
    'canonical_nodes',
    'canonical_edges',
    'unresolved_targets',
    'evidence',
    'provider_fact_bindings',
    'fact_evidence',
    'active_support_candidates',
    'analysis_coverage',
  ])
    if ((t[name] ?? []).length) throw Error('zero-fact model cannot qualify ' + name);
  const rows = (name) =>
    (t[name] ?? []).map((r) => Object.fromEntries(readColumns[name].map((k) => [k, r[k] ?? null])));
  let delivered = 0n,
    serialized = 0n,
    items = 0n,
    context = bytes(id),
    peak = 0n,
    maxDepth = 0,
    byteRequirement = 0n;
  const entries = {},
    ledger = [];
  const memory = (n) => {
      if (n > peak) peak = n;
    },
    charge = (n) => {
      serialized += n;
      if (serialized > byteRequirement) byteRequirement = serialized;
    },
    guard = (v) => {
      const m = measures(v);
      items += m.nodes;
      maxDepth = Math.max(maxDepth, m.depth);
    },
    numeric = (n) => {
      delivered += BigInt(n);
    },
    read = (table, selected) => {
      numeric(1);
      const projected = selected.map((r) =>
          Object.fromEntries(readColumns[table].map((k) => [k, r[k] ?? null])),
        ),
        largest = projected.reduce((n, r) => (rawWeight(r) > n ? rawWeight(r) : n), 0n);
      memory(context + largest);
      if (serialized + largest > byteRequirement) byteRequirement = serialized + largest;
      return projected.map((row) => {
        numeric(2);
        const size = rawWeight(row);
        memory(context + size);
        charge(size);
        guard(row);
        return { row, bytes: size };
      });
    },
    remember = (tag, value) => {
      if (!entries[tag]) {
        entries[tag] = [];
        guard([]);
        context += bytes(tag);
      }
      context += measures(value).weight;
      memory(context);
      entries[tag].push(value);
    },
    digest = (domain) => {
      const initial = domain + '\0';
      charge(bytes(initial));
      memory(context + bytes(initial));
      let transcript = initial;
      const emit = (v, raw = 0n, tag = '') => {
        guard(v);
        const weight = measures(v).weight,
          json = canonical(v),
          size = bytes(json),
          prefix = String(size) + ':',
          retained = context + raw + 2n * weight;
        memory(retained + 2n * size + bytes(prefix));
        charge(bytes(prefix) + size);
        transcript += prefix + json;
        if (
          v &&
          typeof v === 'object' &&
          Object.hasOwn(v, 'value') &&
          (domain === 'codeatlas-code-activation-v1' ||
            (domain === 'codeatlas-source-inventory-v1' && tag === 'SOURCE_FILE'))
        )
          remember(tag, v.value);
      };
      return {
        group(tag, n) {
          emit({ tag, count: n });
        },
        emit,
        end() {
          context += 64n;
          memory(context);
          return crypto.createHash('sha256').update(transcript).digest('hex');
        },
      };
    };
  numeric(2 + 2 * Object.keys(readColumns).length + 13);
  for (const name of Object.keys(readColumns)) {
    const largest = rows(name).reduce((n, r) => (rawWeight(r) > n ? rawWeight(r) : n), 0n);
    memory(context + largest);
    if (largest > byteRequirement) byteRequirement = largest;
  }
  const [repo] = read(
      'repository',
      rows('repository').filter((r) => r.id === id),
    ),
    [state] = read(
      'repository_state',
      rows('repository_state').filter((r) => r.repository_id === id),
    ),
    [revRow] = read(
      'revisions',
      rows('revisions').filter((r) => r.repository_id === id && r.kind === 'WORKTREE'),
    );
  if (!repo || !state || !revRow) throw Error('closed model requires repository and WORKTREE');
  const repository = { id: repo.row.id, rootPath: repo.row.root_path },
    revision = {
      id: revRow.row.id,
      repositoryId: id,
      kind: 'WORKTREE',
      contentFingerprint: revRow.row.content_fingerprint,
      baseRevisionId: revRow.row.base_revision_id,
    };
  context +=
    rawWeight(repo.row) + rawWeight(state.row) + rawWeight(revRow.row) + measures(revision).weight;
  memory(context);
  const snapshots = rows('provider_snapshots').filter((r) => r.repository_id === id);
  numeric(1);
  const locator = digest('codeatlas-repository-locator-v1');
  locator.group('LOCATOR', 1);
  locator.emit({ key: [id], value: repository });
  const repositoryLocatorDigest = locator.end(),
    sourceRows = sort(
      rows('source_files').filter((r) => r.repository_id === id && r.revision_id === revision.id),
      'id',
    ),
    source = digest('codeatlas-source-inventory-v1');
  const sourceRead = read('source_files', sourceRows);
  source.group('TARGET', 1);
  source.emit({ key: [revision.id], value: revision });
  source.group('SOURCE_FILE', sourceRead.length);
  for (const { row: r, bytes: size } of sourceRead) {
    const f = {
      id: r.id,
      repositoryId: id,
      revisionId: r.revision_id,
      path: r.path,
      contentFingerprint: r.content_fingerprint,
      classification: { role: r.role, provenance: r.provenance, contentKind: r.content_kind },
      languageHint: r.language_hint,
      sensitivity: r.sensitivity,
    };
    source.emit({ key: [f.id], value: f }, size, 'SOURCE_FILE');
  }
  const sourceInventoryDigest = source.end();
  let activeBasis = null;
  if (state.row.indexed_revision_id !== null) {
    const indexed = state.row.indexed_revision_id,
      code = digest('codeatlas-code-activation-v1');
    code.group('HEADER', 1);
    code.emit(
      {
        key: [id],
        value: {
          repositoryId: id,
          indexedRevisionId: indexed,
          indexedContentFingerprint: state.row.indexed_content_fingerprint,
          committedSnapshotCount: snapshots.length,
        },
      },
      0n,
      'HEADER',
    );
    for (const [tag, table] of [
      ['NODE', 'canonical_nodes'],
      ['EDGE', 'canonical_edges'],
      ['EVIDENCE', 'evidence'],
      ['BINDING', 'provider_fact_bindings'],
      ['FACT_EVIDENCE', 'fact_evidence'],
      ['SUPPORT_CANDIDATE', 'active_support_candidates'],
    ]) {
      const selected = read(table, []);
      code.group(tag, selected.length);
    }
    const selected = read(
      'provider_snapshots',
      sort(
        snapshots.filter((r) => r.requested_revision_id === indexed),
        'id',
      ),
    );
    code.group('SNAPSHOT', selected.length);
    for (const { row: r, bytes: size } of selected) {
      const capRows = read(
          'provider_capabilities',
          sort(
            rows('provider_capabilities').filter((v) => v.snapshot_id === r.id),
            'name',
          ),
        ),
        capabilities = [];
      let raw = size;
      for (const { row: c, bytes: n } of capRows) {
        raw += n;
        capabilities.push({ name: c.name, support: c.support, coverage: c.coverage });
        memory(context + raw + 2n * measures(capabilities).weight);
      }
      const snapshot = {
        id: r.id,
        repositoryId: r.repository_id,
        providerId: r.provider_id,
        providerVersion: r.provider_version,
        runtimeVersion: r.runtime_version,
        requestedRevisionId: r.requested_revision_id,
        requestedRevisionFingerprint: r.requested_revision_fingerprint,
        startedAt: new Date(r.started_at).toISOString(),
        completedAt: new Date(r.completed_at).toISOString(),
        capabilities,
        diagnostics: [],
        outcome: r.outcome,
      };
      guard(snapshot);
      remember('PROVIDER_SNAPSHOT', snapshot);
      const { startedAt, completedAt, diagnostics, capabilities: ignored, ...stable } = snapshot;
      code.emit({ key: [snapshot.id], value: { snapshot: stable, capabilities } }, raw, 'SNAPSHOT');
    }
    read('analysis_coverage', []);
    numeric(1);
    code.group('COVERAGE', 0);
    activeBasis = {
      repositoryId: id,
      revisionId: indexed,
      contentFingerprint: state.row.indexed_content_fingerprint,
      codeActivationDigest: code.end(),
    };
  }
  const view = {
    schemaVersion: 1,
    kind: 'REPOSITORY_CODE_CAPTURE',
    repositoryId: id,
    repositoryLocatorDigest,
    activeBasis,
    targetSource: {
      repositoryId: id,
      revisionId: revision.id,
      contentFingerprint: revision.contentFingerprint,
    },
    sourceInventoryDigest,
    sourceFileCount: sourceRows.length,
    committedSnapshotCount: snapshots.length,
    historicalSourceProof: 'UNAVAILABLE',
  };
  memory(context + measures(view).weight);
  guard(view);
  ledger.push(
    { phase: 'fixed numeric SQL', rows: 2 + 2 * Object.keys(readColumns).length + 13 },
    { phase: 'all numeric and row deliveries', rows: number(delivered) },
    { phase: 'retained context', bytes: number(context) },
    { phase: 'view weight', bytes: number(measures(view).weight) },
  );
  return {
    view,
    entries,
    consumed: {
      rows: number(delivered),
      serializedBytes: number(serialized),
      items: number(items),
    },
    retainedLogicalBytes: number(context + measures(view).weight),
    required: {
      maxRows: number(delivered),
      maxSerializedBytes: number(byteRequirement),
      maxItems: number(items),
      maxDepth,
      memoryBudgetBytes: number(2n * peak),
    },
    ledger,
  };
}
