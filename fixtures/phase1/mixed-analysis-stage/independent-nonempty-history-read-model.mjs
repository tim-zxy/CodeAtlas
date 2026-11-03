import { modelNonemptyCodeRead } from './independent-nonempty-code-read-model.mjs';
import {
  historyCanonical,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import { measures } from './independent-code-resource-model.mjs';
const historyColumns = {
    activation_history: [
      'id',
      'repository_id',
      'revision_id',
      'parent_id',
      'manifest_digest',
      'manifest_json',
    ],
    syntax_origins: [
      'id',
      'repository_id',
      'revision_id',
      'origin_snapshot_id',
      'origin_digest',
      'origin_json',
    ],
    syntax_projections: ['id', 'repository_id', 'origin_id', 'projection_digest', 'envelope_json'],
    activation_syntax_members: ['activation_id', 'repository_id', 'origin_id', 'projection_id'],
    active_history_pointer: ['repository_id', 'activation_id'],
  },
  snapshotColumns = [
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
  ];
const n = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('unsafe independent H1 count');
    return Number(v);
  },
  B = (v) => BigInt(Buffer.byteLength(v)),
  project = (rows, cols) => rows.map((r) => Object.fromEntries(cols.map((k) => [k, r[k] ?? null]))),
  rowBytes = (row) => Object.values(row).reduce((s, v) => s + (v === null ? 0n : B(String(v))), 0n),
  sortIds = (a) => [...a].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
/** Closed nonempty H1 SQL/semantic pairs. Prior state is independent; never observed usage. Uses frozen H1 schedule and complete manifest/Syntax pair cost models. */
export function modelNonemptyHistoryRead(input, semantic, prior = null, detailed = false) {
  const code = modelNonemptyCodeRead(input, semantic),
    initial = prior?.state ?? {},
    s = {
      rows: BigInt(initial.rows ?? 0),
      serializedBytes: BigInt(initial.serializedBytes ?? 0),
      items: BigInt(initial.items ?? 0),
      pin: BigInt(initial.retainedLogicalBytes ?? 0),
    },
    required = {
      rows: s.rows,
      bytes: s.serializedBytes,
      memory: 2n * s.pin,
      depth: prior?.required.maxDepth ?? 0,
    },
    t = input.tables,
    id = input.repositoryId,
    steps = [];
  const raise = (key, value) => {
      if (value > required[key]) required[key] = value;
    },
    row = (n) => {
      s.rows += BigInt(n);
      raise('rows', s.rows);
    },
    pin = (v) => {
      s.pin += v;
      raise('memory', 2n * s.pin);
    },
    addBytes = (v) => {
      s.serializedBytes += v;
      raise('bytes', s.serializedBytes);
    },
    own = (value, pinned = true) => {
      const m = measures(value);
      s.items += m.nodes;
      required.depth = Math.max(required.depth, m.depth);
      if (pinned) pin(m.weight);
    },
    encode = (value) => {
      own(value, false);
      const text = historyCanonical(value),
        size = B(text);
      addBytes(2n * size);
      pin(2n * size);
      return text;
    },
    parse = (text) => {
      const v = JSON.parse(text);
      own(v);
      return v;
    },
    digest = (domain, value) => {
      encode(value);
      addBytes(B(domain) + 1n);
      pin(64n);
    },
    applyFormat = (m) => {
      const v = manifestResourceModel(m);
      s.items += BigInt(v.cost.items);
      addBytes(BigInt(v.cost.serializedBytes));
      pin(BigInt(v.cost.retainedLogicalBytes));
      required.depth = Math.max(required.depth, v.cost.maxDepth);
    };
  const read = (table, selected, cols = historyColumns[table]) => {
    row(1);
    const rows = project(selected, cols),
      total = rows.reduce((v, r) => v + rowBytes(r), 0n);
    raise('rows', s.rows + 2n * BigInt(rows.length));
    raise('bytes', s.serializedBytes + total);
    raise('memory', 2n * (s.pin + total));
    for (const r of rows) {
      row(2);
      const bytes = rowBytes(r);
      addBytes(bytes);
      pin(bytes);
      own(r, false);
    }
    return rows;
  };
  row(17);
  for (const [table, cols] of Object.entries(historyColumns)) {
    const largest = project(t[table] ?? [], cols).reduce(
      (v, r) => (rowBytes(r) > v ? rowBytes(r) : v),
      0n,
    );
    raise('bytes', s.serializedBytes + largest);
    raise('memory', 2n * (s.pin + largest));
  }
  raise('rows', s.rows + BigInt(code.required.maxRows));
  raise('bytes', s.serializedBytes + BigInt(code.required.maxSerializedBytes));
  raise('memory', 2n * s.pin + BigInt(code.required.memoryBudgetBytes));
  required.depth = Math.max(required.depth, code.required.maxDepth);
  row(code.consumed.rows);
  addBytes(BigInt(code.consumed.serializedBytes));
  s.items += BigInt(code.consumed.items);
  pin(BigInt(code.retainedLogicalBytes));
  const pointer = read(
      'active_history_pointer',
      (t.active_history_pointer ?? []).filter((r) => r.repository_id === id),
    ),
    archive = [],
    originRows = [],
    projectionRows = [];
  let manifest = null;
  if (pointer.length) {
    let activation = pointer[0].activation_id;
    while (activation) {
      const [r] = read(
        'activation_history',
        (t.activation_history ?? []).filter((r) => r.repository_id === id && r.id === activation),
      );
      if (!r) throw Error('closed H1 carrier absent');
      const m = parse(r.manifest_json);
      encode(m);
      applyFormat(m);
      digest('codeatlas-activation-history-v1', m);
      manifest ??= m;
      archive.push(m);
      activation = m.parent?.activationId ?? null;
    }
    const members = read(
      'activation_syntax_members',
      (t.activation_syntax_members ?? []).filter(
        (r) => r.activation_id === pointer[0].activation_id,
      ),
    ).sort((a, b) => (a.origin_id < b.origin_id ? -1 : a.origin_id > b.origin_id ? 1 : 0));
    for (const member of members) {
      const [origin] = read(
          'syntax_origins',
          (t.syntax_origins ?? []).filter(
            (r) => r.repository_id === id && r.id === member.origin_id,
          ),
        ),
        [projection] = read(
          'syntax_projections',
          (t.syntax_projections ?? []).filter(
            (r) => r.repository_id === id && r.id === member.projection_id,
          ),
        );
      if (!origin || !projection) throw Error('closed H1 Syntax carrier absent');
      if (detailed) {
        originRows.push(origin);
        projectionRows.push(projection);
      }
      const value = pairResourceModel({
        origin,
        projection,
        current: manifest,
        ancestors: archive,
      });
      s.items += BigInt(value.cost.items);
      addBytes(BigInt(value.cost.serializedBytes));
      pin(BigInt(value.cost.retainedLogicalBytes));
      required.depth = Math.max(required.depth, value.cost.maxDepth);
    }
  }
  const targetInventory = [...(code.entries.SOURCE_FILE ?? [])].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : a.id < b.id ? -1 : 1,
    ),
    view = {
      status: manifest ? 'AVAILABLE' : 'UNAVAILABLE',
      history: manifest,
      targetSource: code.view.targetSource,
      targetInventory,
      activeBasis: code.view.activeBasis,
    };
  own(view, false);
  const identity = encode(view);
  pin(B(identity));
  let details = null;
  if (detailed) {
    const snapshotRows = read(
        'provider_snapshots',
        (t.provider_snapshots ?? []).filter((r) => r.repository_id === id),
        snapshotColumns,
      ),
      ids = new Set(snapshotRows.map((r) => r.id)),
      capabilityRows = read(
        'provider_capabilities',
        (t.provider_capabilities ?? []).filter((r) => ids.has(r.snapshot_id)),
        ['snapshot_id', 'name', 'support', 'coverage'],
      ),
      coverageRows = read(
        'analysis_coverage',
        (t.analysis_coverage ?? []).filter((r) => ids.has(r.provider_snapshot_id)),
        ['id', 'provider_snapshot_id', 'capability_name', 'source_file_id', 'status'],
      ),
      historyRows = read(
        'activation_history',
        (t.activation_history ?? []).filter((r) => r.repository_id === id),
      );
    details = {
      view,
      repositoryLocatorDigest: code.view.repositoryLocatorDigest,
      sourceInventoryDigest: code.view.sourceInventoryDigest,
      entries: code.entries,
      archive,
      origins: originRows,
      projections: projectionRows,
      snapshotIds: sortIds([...ids]),
      snapshotRows,
      capabilityRows,
      coverageRows,
      historyRows,
    };
    own(details);
  }
  let result = null;
  if (detailed) {
    const detailIdentity = encode(details),
      usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 };
    result = {
      data: details,
      identity: detailIdentity,
      committedSnapshotCount: code.view.committedSnapshotCount,
      usage,
    };
    own(result);
  }
  const state = {
    rows: n(s.rows),
    serializedBytes: n(s.serializedBytes),
    items: n(s.items),
    retainedLogicalBytes: n(s.pin),
  };
  if (result) Object.assign(result.usage, state);
  steps.push(
    { phase: 'prior receipt', state: initial },
    {
      phase: 'Code read imported',
      consumed: code.consumed,
      retainedLogicalBytes: code.retainedLogicalBytes,
    },
    { phase: 'history read and own/encode/parse/hash', state },
  );
  return {
    view,
    identity,
    details,
    result,
    state,
    required: {
      maxRows: n(required.rows),
      maxSerializedBytes: n(required.bytes),
      maxItems: n(s.items),
      maxDepth: required.depth,
      memoryBudgetBytes: n(required.memory),
    },
    steps,
  };
}
