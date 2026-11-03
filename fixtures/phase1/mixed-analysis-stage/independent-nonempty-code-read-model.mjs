import crypto from 'node:crypto';
import { canonical, measures, codeGroups } from './independent-code-resource-model.mjs';
import { readColumns } from './independent-zero-code-read-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent nonempty Code read');
    return Number(v);
  },
  cmp = (a, b) => Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b))),
  rawWeight = (r) => Object.values(r).reduce((n, v) => n + (typeof v === 'string' ? B(v) : 0n), 0n);
/** Closed independently frozen SQL + canonical semantic pairs; not an arbitrary SQL decoder. No product imports. */
export function modelNonemptyCodeRead(input, semantic) {
  const id = input.repositoryId,
    t = input.tables,
    project = (name, values = t[name] ?? []) =>
      values.map((r) => Object.fromEntries(readColumns[name].map((k) => [k, r[k] ?? null]))),
    sort = (vs, keys) =>
      [...vs].sort((a, b) => {
        for (const k of keys) {
          const c = cmp(a[k], b[k]);
          if (c) return c;
        }
        return 0;
      });
  let rows = 0n,
    serialized = 0n,
    items = 0n,
    context = B(id),
    peak = 0n,
    byteRequired = 0n,
    depth = 0;
  const entries = {},
    groups = new Map(codeGroups(semantic));
  const memory = (n) => {
      if (n > peak) peak = n;
    },
    charge = (n) => {
      serialized += n;
      if (serialized > byteRequired) byteRequired = serialized;
    },
    guard = (v) => {
      const m = measures(v);
      items += m.nodes;
      depth = Math.max(depth, m.depth);
    },
    parse = (text) => {
      const v = JSON.parse(text);
      guard(v);
      return v;
    },
    numeric = (n) => {
      rows += BigInt(n);
    },
    remember = (tag, v) => {
      if (!entries[tag]) {
        guard([]);
        context += B(tag);
        entries[tag] = [];
      }
      context += measures(v).weight;
      memory(context);
      entries[tag].push(v);
    };
  const read = (name, selected) => {
    const values = project(name, selected),
      largest = values.reduce((n, v) => (rawWeight(v) > n ? rawWeight(v) : n), 0n);
    numeric(1);
    memory(context + largest);
    if (serialized + largest > byteRequired) byteRequired = serialized + largest;
    return {
      n: values.length,
      *[Symbol.iterator]() {
        for (const row of values) {
          numeric(2);
          const bytes = rawWeight(row);
          memory(context + bytes);
          charge(bytes);
          guard(row);
          yield { row, bytes };
        }
      },
    };
  };
  const digest = (domain) => {
    const initial = domain + '\0';
    charge(B(initial));
    memory(context + B(initial));
    let transcript = initial;
    const emit = (value, raw = 0n, tag = null) => {
      guard(value);
      const encoded = canonical(value),
        size = B(encoded),
        prefix = String(size) + ':';
      memory(context + raw + 2n * measures(value).weight + 2n * size + B(prefix));
      charge(size + B(prefix));
      transcript += prefix + encoded;
      if (tag) remember(tag, value.value);
    };
    return {
      group: (tag, n) => emit({ tag, count: n }),
      emit,
      end: () => {
        context += 64n;
        memory(context);
        return crypto.createHash('sha256').update(transcript).digest('hex');
      },
    };
  };
  numeric(2 + 2 * Object.keys(readColumns).length + 13);
  for (const name of Object.keys(readColumns)) {
    const largest = project(name).reduce((n, r) => (rawWeight(r) > n ? rawWeight(r) : n), 0n);
    memory(context + largest);
    if (largest > byteRequired) byteRequired = largest;
  }
  const [{ row: repo }] = [
      ...read(
        'repository',
        (t.repository ?? []).filter((v) => v.id === id),
      ),
    ],
    [{ row: state }] = [
      ...read(
        'repository_state',
        (t.repository_state ?? []).filter((v) => v.repository_id === id),
      ),
    ],
    [{ row: revisionRow }] = [
      ...read(
        'revisions',
        (t.revisions ?? []).filter((v) => v.repository_id === id && v.kind === 'WORKTREE'),
      ),
    ];
  if (state.indexed_revision_id === null) throw Error('closed nonempty read requires active Code');
  const revision = {
    id: revisionRow.id,
    repositoryId: id,
    kind: 'WORKTREE',
    contentFingerprint: revisionRow.content_fingerprint,
    baseRevisionId: revisionRow.base_revision_id,
  };
  context +=
    rawWeight(repo) + rawWeight(state) + rawWeight(revisionRow) + measures(revision).weight;
  memory(context);
  numeric(1);
  const locator = digest('codeatlas-repository-locator-v1');
  locator.group('LOCATOR', 1);
  locator.emit({ key: [id], value: { id, rootPath: repo.root_path } });
  const repositoryLocatorDigest = locator.end(),
    sources = read(
      'source_files',
      sort(
        (t.source_files ?? []).filter(
          (v) => v.repository_id === id && v.revision_id === revision.id,
        ),
        ['id'],
      ),
    ),
    source = digest('codeatlas-source-inventory-v1');
  source.group('TARGET', 1);
  source.emit({ key: [revision.id], value: revision });
  source.group('SOURCE_FILE', sources.n);
  for (const { row: r, bytes } of sources) {
    const f = {
      id: r.id,
      repositoryId: r.repository_id,
      revisionId: r.revision_id,
      path: r.path,
      contentFingerprint: r.content_fingerprint,
      classification: { role: r.role, provenance: r.provenance, contentKind: r.content_kind },
      languageHint: r.language_hint,
      sensitivity: r.sensitivity,
    };
    source.emit({ key: [f.id], value: f }, bytes, 'SOURCE_FILE');
  }
  const sourceInventoryDigest = source.end(),
    code = digest('codeatlas-code-activation-v1');
  code.group('HEADER', 1);
  code.emit(groups.get('HEADER')[0], 0n, 'HEADER');
  const rev = state.indexed_revision_id,
    activeIds = new Set(
      (t.evidence ?? [])
        .filter((v) => v.repository_id === id && v.status === 'ACTIVE')
        .map((v) => v.id),
    );
  for (const [tag, table] of [
    ['NODE', 'canonical_nodes'],
    ['EDGE', 'canonical_edges'],
    ['EVIDENCE', 'evidence'],
    ['BINDING', 'provider_fact_bindings'],
    ['FACT_EVIDENCE', 'fact_evidence'],
    ['SUPPORT_CANDIDATE', 'active_support_candidates'],
  ]) {
    const selected = read(
        table,
        sort(
          (t[table] ?? []).filter((r) =>
            tag === 'NODE' || tag === 'EDGE'
              ? r.repository_id === id && r.revision_id === rev
              : tag === 'EVIDENCE'
                ? activeIds.has(r.id)
                : activeIds.has(r.evidence_id),
          ),
          tag === 'NODE' || tag === 'EDGE' || tag === 'EVIDENCE'
            ? ['id']
            : ['evidence_id', 'fact_type', 'canonical_fact_id'],
        ),
      ),
      frames = groups.get(tag);
    if (selected.n !== frames.length) throw Error('closed SQL/canonical count mismatch ' + tag);
    code.group(tag, selected.n);
    let i = 0;
    for (const { row: r, bytes } of selected) {
      let extra = 0n;
      if (tag === 'EDGE') {
        const u = [
          ...read(
            'unresolved_targets',
            (t.unresolved_targets ?? []).filter((u) => u.revision_id === rev && u.edge_id === r.id),
          ),
        ];
        if (u.length > 1) throw Error('duplicate closed unresolved');
        if (u[0]) extra = u[0].bytes;
        if (r.target_state === 'UNRESOLVED') parse(u[0].row.candidates_json);
      }
      if (tag === 'NODE' || tag === 'EDGE') {
        if (r.source_range_json !== null) parse(r.source_range_json);
        parse(r.confidence_reasons_json);
      }
      if (tag === 'SUPPORT_CANDIDATE') parse(r.candidate_json);
      code.emit(frames[i++], bytes + extra, tag);
    }
  }
  const snapRows = read(
    'provider_snapshots',
    sort(
      (t.provider_snapshots ?? []).filter(
        (r) => r.repository_id === id && r.requested_revision_id === rev,
      ),
      ['id'],
    ),
  );
  if (snapRows.n !== groups.get('SNAPSHOT').length) throw Error('closed snapshot mismatch');
  code.group('SNAPSHOT', snapRows.n);
  let i = 0;
  for (const { row: r, bytes } of snapRows) {
    const caps = read(
        'provider_capabilities',
        sort(
          (t.provider_capabilities ?? []).filter((c) => c.snapshot_id === r.id),
          ['name'],
        ),
      ),
      capabilities = [];
    let raw = bytes;
    for (const { row: c, bytes: n } of caps) {
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
    code.emit(groups.get('SNAPSHOT')[i++], raw, 'SNAPSHOT');
  }
  const ids = new Set(
      (t.provider_snapshots ?? [])
        .filter((r) => r.repository_id === id && r.requested_revision_id === rev)
        .map((v) => v.id),
    ),
    coverageFrames = groups.get('COVERAGE'),
    physical = (t.analysis_coverage ?? []).filter((r) => ids.has(r.provider_snapshot_id)),
    coverageKey = (r) => [
      r.provider_snapshot_id,
      r.capability_name,
      r.source_file_id === null ? 'NONE' : 'SOURCE',
      r.source_file_id ?? '',
      r.status,
    ],
    ordered = [...physical].sort((a, b) => {
      const aa = coverageKey(a),
        bb = coverageKey(b);
      for (let j = 0; j < aa.length; j++) {
        const c = cmp(aa[j], bb[j]);
        if (c) return c;
      }
      return 0;
    }),
    selected = read('analysis_coverage', ordered);
  numeric(1);
  code.group('COVERAGE', coverageFrames.length);
  let index = 0,
    j = 0;
  for (const { bytes } of selected) {
    const key = coverageKey(ordered[index]),
      next = ordered[index + 1];
    if (!next || JSON.stringify(key) !== JSON.stringify(coverageKey(next)))
      code.emit(coverageFrames[j++], bytes, 'COVERAGE');
    index++;
  }
  if (j !== coverageFrames.length) throw Error('closed physical coverage mismatch');
  const activeBasis = {
      repositoryId: id,
      revisionId: rev,
      contentFingerprint: state.indexed_content_fingerprint,
      codeActivationDigest: code.end(),
    },
    view = {
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
      sourceFileCount: sources.n,
      committedSnapshotCount: (t.provider_snapshots ?? []).filter((v) => v.repository_id === id)
        .length,
      historicalSourceProof: 'UNAVAILABLE',
    };
  memory(context + measures(view).weight);
  guard(view);
  return {
    view,
    entries,
    consumed: { rows: N(rows), serializedBytes: N(serialized), items: N(items) },
    retainedLogicalBytes: N(context + measures(view).weight),
    required: {
      maxRows: N(rows),
      maxSerializedBytes: N(byteRequired),
      maxItems: N(items),
      maxDepth: depth,
      memoryBudgetBytes: N(2n * peak),
    },
    scope:
      'Closed independent SQL/semantic nonempty Code read only; not H1/Stage/Runtime/Store full operation or arbitrary SQL decoder.',
  };
}
