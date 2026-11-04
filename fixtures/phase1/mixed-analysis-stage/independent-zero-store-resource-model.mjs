import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelZeroFrozenStage } from './independent-zero-frozen-stage-resource-model.mjs';
import { modelZeroHistoryRead } from './independent-zero-history-read-model.mjs';
import { modelZeroCodeRead } from './independent-zero-code-read-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('unsafe independent Store cost');
    return Number(v);
  };
/** Closed FULL zero-fact successful Store transaction including Stage continuation and prepaid cleanup. */
export function modelZeroStore(input, preparation, raw, schema) {
  const frozen = modelZeroFrozenStage(input, preparation, raw),
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
      Object.values(row).reduce((n, v) => n + (v === null ? 0n : B(String(v))), 0n);
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
      tables[table].push(row);
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
  run([rev, basis.contentFingerprint, repo]);
  Object.assign(
    tables.repository_state.find((v) => v.repository_id === repo),
    { indexed_revision_id: rev, indexed_content_fingerprint: basis.contentFingerprint },
  );
  const codeRead = modelZeroCodeRead({ ...input, tables });
  raise('rows', s.rows + BigInt(codeRead.required.maxRows));
  raise('bytes', s.bytes + BigInt(codeRead.required.maxSerializedBytes));
  raise('memory', 2n * s.pin + BigInt(codeRead.required.memoryBudgetBytes));
  r.depth = Math.max(r.depth, codeRead.required.maxDepth);
  rows(codeRead.consumed.rows);
  bytes(codeRead.consumed.serializedBytes);
  s.items += BigInt(codeRead.consumed.items);
  pin(codeRead.retainedLogicalBytes);
  run([repo]);
  tables.native_analysis_state = [];
  tables.native_analysis_file = [];
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
    tables,
    result,
    activationId: id,
    firstCloseAdditionalCharge: 0,
    scope:
      'FULL zero projected facts; complete successful Stage/real Runtime/Provider/Store transaction. Does not qualify nonempty facts, failure/recovery schedules or Native execution.',
  };
}
