import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelNonemptyFrozenStage } from './independent-nonempty-frozen-stage-resource-model.mjs';
import { modelZeroHistoryRead } from './independent-zero-history-read-model.mjs';
import { modelNonemptyCodeRead } from './independent-nonempty-code-read-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('unsafe independent Store cost');
    return Number(v);
  };
/** Closed initial FULL nonempty successful Store transaction including Stage continuation and prepaid cleanup. */
export function modelInitialWritePrefixes(input, preparation, javaRows, raw, schema) {
  const frozen = modelNonemptyFrozenStage(input, preparation, javaRows, raw),
    s = {
      rows: BigInt(frozen.frozen.state.rows),
      bytes: BigInt(frozen.frozen.state.serializedBytes),
      items: BigInt(frozen.frozen.state.items),
      pin: BigInt(frozen.frozen.state.retainedLogicalBytes),
    },
    r = {
      rows: BigInt(frozen.frozen.required.maxRows),
      bytes: BigInt(frozen.frozen.required.maxSerializedBytes),
      memory: BigInt(frozen.frozen.required.memoryBudgetBytes),
      depth: frozen.frozen.required.maxDepth,
    },
    result = frozen.result,
    temp = frozen.frozen.tempRows,
    prior = frozen.privateReadAfterFreeze;
  const raise = (k, n) => {
      if (n > r[k]) r[k] = n;
    },
    rows = (n) => {
      s.rows += BigInt(n);
      raise('rows', s.rows);
    },
    bytes = (n) => {
      s.bytes += BigInt(n);
      raise('bytes', s.bytes);
    },
    pin = (n) => {
      s.pin += BigInt(n);
      raise('memory', 2n * s.pin);
    },
    own = (v, retain = true) => {
      const m = measures(v);
      s.items += m.nodes;
      r.depth = Math.max(r.depth, m.depth);
      if (retain) pin(m.weight);
    },
    encode = (v) => {
      own(v, false);
      const str = C(v);
      bytes(2n * B(str));
      pin(2n * B(str));
      return str;
    },
    snapshot = () => ({
      state: {
        rows: N(s.rows),
        serializedBytes: N(s.bytes),
        items: N(s.items),
        retainedLogicalBytes: N(s.pin),
      },
      required: {
        maxRows: N(r.rows),
        maxSerializedBytes: N(r.bytes),
        maxItems: N(s.items),
        maxDepth: r.depth,
        memoryBudgetBytes: N(r.memory),
      },
    }),
    payload = (row) =>
      Object.entries(row).reduce((n, [k, v]) => {
        if (k === 'confidence_score') {
          if (v !== 1) throw Error('closed Store REAL confidence requires literal one');
          return n + B('1.0');
        }
        return n + (v === null ? 0n : B(String(v)));
      }, 0n);
  const tables = Object.fromEntries(
    schema.tables.map((t) => [
      t.name,
      (input.tables[t.name] ?? []).map((row) =>
        Object.fromEntries(t.columns.map((k) => [k, row[k] ?? null])),
      ),
    ]),
  );
  for (const key of [
    'canonical_nodes',
    'canonical_edges',
    'unresolved_targets',
    'evidence',
    'fact_evidence',
    'provider_fact_bindings',
    'active_support_candidates',
    'analysis_coverage',
    'syntax_origins',
    'syntax_projections',
    'activation_syntax_members',
    'analysis_diagnostics',
    'native_analysis_state',
    'native_analysis_file',
  ])
    if (tables[key]?.length) throw Error('zero Store reference does not admit ' + key);
  own(result, false);
  rows(4);
  own({ changes: 0, dataVersion: 0 });
  own({ changes: 0, dataVersion: 0 }, false);
  const tempBytes = temp.reduce((n, v) => n + B(v.key) + B(v.value_json), 0n);
  raise('rows', s.rows + 2n * BigInt(temp.length));
  raise('bytes', s.bytes + tempBytes);
  raise('memory', 2n * (s.pin + tempBytes));
  for (const row of temp) {
    rows(2);
    bytes(B(row.key) + B(row.value_json));
    pin(B(row.key) + B(row.value_json));
    own(row, false);
  }
  const locked = modelZeroHistoryRead(input, prior, true);
  raise('rows', s.rows + BigInt(locked.required.maxRows - prior.state.rows));
  raise(
    'bytes',
    s.bytes + BigInt(locked.required.maxSerializedBytes - prior.state.serializedBytes),
  );
  raise(
    'memory',
    2n * s.pin +
      BigInt(locked.required.memoryBudgetBytes) -
      2n * BigInt(prior.state.retainedLogicalBytes),
  );
  r.depth = Math.max(r.depth, locked.required.maxDepth);
  rows(locked.state.rows - prior.state.rows);
  bytes(locked.state.serializedBytes - prior.state.serializedBytes);
  s.items += BigInt(locked.state.items - prior.state.items);
  pin(locked.state.retainedLogicalBytes - prior.state.retainedLogicalBytes);
  const sealText = encode(temp.map((v) => [v.key, v.value_json]));
  bytes(B(sealText));
  pin(64);
  const readRows = (columns, values) => {
      own(columns);
      rows(1);
      const total = values.reduce((n, v) => n + payload(v), 0n);
      raise('rows', s.rows + 2n * BigInt(values.length));
      raise('bytes', s.bytes + total);
      raise('memory', 2n * (s.pin + total));
      for (const value of values) {
        rows(2);
        bytes(payload(value));
        pin(payload(value));
        own(value, false);
      }
      return values;
    },
    image = () => {
      readRows(
        ['name'],
        schema.tables.map((t) => ({ name: t.name })),
      );
      const out = {};
      for (const t of schema.tables) {
        const values = readRows(t.columns, tables[t.name])
          .map((v) => encode(v))
          .sort();
        own(values);
        out[t.name] = values;
      }
      return encode(out);
    };
  const prefixes = {},
    mark = (point) => {
      if (prefixes[point]) return;
      const p = snapshot();
      if (point === 'code-identity') {
        p.required.maxRows = Math.max(p.required.maxRows, p.state.rows + 1);
        p.required.maxSerializedBytes = Math.max(
          p.required.maxSerializedBytes,
          p.state.serializedBytes + 1,
        );
        p.required.maxItems = Math.max(p.required.maxItems, p.state.items + 1);
        p.required.memoryBudgetBytes = Math.max(
          p.required.memoryBudgetBytes,
          2 * p.state.retainedLogicalBytes + 1,
        );
      }
      prefixes[point] = p;
    };
  const beforeImage = image(),
    before = snapshot(),
    run = (params) => {
      own(params);
      rows(1);
      bytes(params.reduce((n, v) => n + (typeof v === 'string' ? B(v) : 0n), 0n));
    },
    insert = (table, row) => {
      own(row);
      run(Object.values(row));
      const point = {
        provider_snapshots: 'snapshot',
        provider_capabilities: 'capabilities',
        evidence: 'evidence-insert',
        provider_fact_bindings: 'binding',
        active_support_candidates: 'candidate',
        canonical_nodes: 'node',
        canonical_edges: 'edge',
        analysis_coverage: 'coverage',
        syntax_origins: 'origin',
        syntax_projections: 'projection',
        activation_history: 'history',
        activation_syntax_members: 'members',
        active_history_pointer: 'pointer',
      }[table];
      if (point) mark(point);
      tables[table].push(
        table === 'analysis_coverage' ? { id: tables[table].length + 1, ...row } : row,
      );
    },
    immutable = (table, row, keys) => {
      own(row);
      own(keys.map((k) => row[k]));
      rows(1);
      if (tables[table].some((old) => keys.every((k) => row[k] === old[k])))
        throw Error('closed Store fixture expects new immutable row');
      insert(table, row);
    };
  rows(1);
  const basis = result.basis,
    repo = basis.repositoryId,
    rev = basis.revisionId,
    oldIds = new Set((input.tables.provider_snapshots ?? []).map((v) => v.id));
  for (const snap of result.code.snapshots) {
    if (oldIds.has(snap.id)) continue;
    immutable(
      'provider_snapshots',
      {
        id: snap.id,
        repository_id: repo,
        provider_id: snap.providerId,
        provider_version: snap.providerVersion,
        runtime_version: snap.runtimeVersion,
        requested_revision_id: snap.requestedRevisionId,
        requested_revision_fingerprint: snap.requestedRevisionFingerprint,
        started_at: Date.parse(snap.startedAt),
        completed_at: Date.parse(snap.completedAt),
        outcome: snap.outcome,
      },
      ['id'],
    );
    for (const c of snap.capabilities)
      insert('provider_capabilities', {
        snapshot_id: snap.id,
        name: c.name,
        support: c.support,
        coverage: c.coverage,
      });
  }
  for (const table of ['unresolved_targets', 'canonical_edges', 'canonical_nodes']) {
    run([rev]);
    tables[table] = tables[table].filter((v) => v.revision_id !== rev);
  }

  const json = (v) => (v === null ? null : encode(v));
  for (const n of result.code.nodes) {
    const c = n.confidence;
    insert('canonical_nodes', {
      revision_id: rev,
      id: n.id,
      repository_id: repo,
      fact_key: n.factKey,
      kind: n.kind,
      type_kind: n.kind === 'TYPE' ? n.typeKind : null,
      symbol_kind: n.kind === 'SYMBOL' ? n.symbolKind : null,
      name: n.name,
      qualified_name: n.qualifiedName,
      source_range_json: json(n.sourceRange),
      confidence_score: c.score,
      confidence_method: c.method,
      confidence_reasons_json: json(c.reasons),
    });
  }
  for (const e of result.code.edges) {
    const c = e.confidence,
      t = e.target;
    insert('canonical_edges', {
      revision_id: rev,
      id: e.id,
      repository_id: repo,
      fact_key: e.factKey,
      kind: e.kind,
      source_node_id: e.source.id,
      target_state: t.state,
      resolution: t.resolution,
      target_node_id: t.state === 'RESOLVED' ? t.target.id : null,
      source_range_json: json(e.sourceRange),
      confidence_score: c.score,
      confidence_method: c.method,
      confidence_reasons_json: json(c.reasons),
    });
    if (t.state === 'UNRESOLVED')
      insert('unresolved_targets', {
        revision_id: rev,
        edge_id: e.id,
        original_hint: t.originalHint,
        candidates_json: json(t.candidates),
      });
  }
  for (const e of result.code.evidence) {
    const p = e.providerFact;
    immutable(
      'evidence',
      {
        id: e.id,
        repository_id: repo,
        revision_id: rev,
        provider_snapshot_id: e.providerSnapshotId,
        fact_type: p.factType,
        provider_id: p.providerId,
        provider_fact_id: p.providerFactId,
        status: e.status,
      },
      ['id'],
    );
  }
  for (const v of result.code.factEvidence)
    insert('fact_evidence', {
      fact_type: v.fact.factType,
      canonical_fact_id: v.fact.id,
      evidence_id: v.evidenceId,
    });
  for (const v of result.code.bindings)
    insert('provider_fact_bindings', {
      fact_type: v.providerFact.factType,
      provider_id: v.providerFact.providerId,
      provider_fact_id: v.providerFact.providerFactId,
      provider_snapshot_id: v.providerSnapshotId,
      canonical_fact_id: v.canonicalFact.id,
      evidence_id: v.evidenceId,
    });
  for (const v of result.code.candidates)
    insert('active_support_candidates', {
      evidence_id: v.evidenceId,
      fact_type: v.factType,
      canonical_fact_id: v.canonicalFactId,
      candidate_json: json(v.candidate),
    });
  for (const v of result.code.coverage)
    insert('analysis_coverage', {
      provider_snapshot_id: v.providerSnapshotId,
      capability_name: v.capabilityName,
      source_file_id: v.sourceFileId,
      status: v.status,
    });
  for (const s of result.code.snapshots)
    for (const [ordinal, d] of s.diagnostics.entries())
      insert('analysis_diagnostics', {
        provider_snapshot_id: s.id,
        ordinal,
        code: d.code,
        severity: d.severity,
        message: d.message,
        source_range_json: json(d.sourceRange),
      });

  run([rev, basis.contentFingerprint, repo]);
  Object.assign(
    tables.repository_state.find((v) => v.repository_id === repo),
    { indexed_revision_id: rev, indexed_content_fingerprint: basis.contentFingerprint },
  );
  mark('code-identity');
  const codeRead = modelNonemptyCodeRead({ ...input, tables }, result.code);
  raise('rows', s.rows + BigInt(codeRead.required.maxRows));
  raise('bytes', s.bytes + BigInt(codeRead.required.maxSerializedBytes));
  raise('memory', 2n * s.pin + BigInt(codeRead.required.memoryBudgetBytes));
  r.depth = Math.max(r.depth, codeRead.required.maxDepth);
  rows(codeRead.consumed.rows);
  bytes(codeRead.consumed.serializedBytes);
  s.items += BigInt(codeRead.consumed.items);
  pin(codeRead.retainedLogicalBytes);
  run([repo]);
  mark('native-state-clear');
  tables.native_analysis_state = [];
  tables.native_analysis_file = [];
  for (const origin of result.origins) immutable('syntax_origins', origin, ['id']);
  for (const projection of result.projections) immutable('syntax_projections', projection, ['id']);
  const manifest = result.manifest,
    id = result.activationId;
  immutable(
    'activation_history',
    {
      id,
      repository_id: repo,
      revision_id: rev,
      parent_id: manifest.parent?.activationId ?? null,
      manifest_digest: id.slice('activation:'.length),
      manifest_json: encode(manifest),
    },
    ['id'],
  );
  for (const m of result.members)
    immutable(
      'activation_syntax_members',
      {
        activation_id: id,
        repository_id: repo,
        origin_id: m.originId,
        projection_id: m.projectionId,
      },
      ['activation_id', 'origin_id', 'projection_id'],
    );
  run([repo]);
  tables.active_history_pointer = tables.active_history_pointer.filter(
    (v) => v.repository_id !== repo,
  );
  insert('active_history_pointer', { repository_id: repo, activation_id: id });
  const afterImage = image(),
    committed = snapshot();
  return {
    frozen: frozen.frozen,
    lockedRead: locked.state,
    before,
    committed,
    beforeImage,
    afterImage,
    prefixes: {
      ...prefixes,
      'pre-commit': committed,
      'commit-unknown': committed,
      'post-commit-close': committed,
    },
    tables,
    result,
    activationId: id,
    firstCloseAdditionalCharge: 0,
    scope:
      'Three initial FULL nonempty cases only; complete successful Stage/Runtime/Provider/Store and first cleanup. No DELTA/retained/failure recovery or Native/RSS qualification.',
  };
}
