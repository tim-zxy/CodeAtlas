import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelZeroHistoryRead } from './independent-zero-history-read-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent recovery cost');
    return Number(v);
  };
export const zeroRecoveryPoints = [
  'success',
  'begin-after-open',
  'commit-before',
  'commit-after',
  'post-commit-close',
];
/** Input-only closed zero-fact transaction-prefix and fresh readonly recovery model. No product/usage imports. */
export function modelZeroRecovery(input, transaction, schema, databasePath, point) {
  if (!zeroRecoveryPoints.includes(point)) throw Error('unsupported closed recovery point');
  const committed = ['success', 'commit-after', 'post-commit-close'].includes(point),
    begin = point === 'begin-after-open',
    tables = committed
      ? structuredClone(transaction.tables)
      : Object.fromEntries(
          schema.tables.map((t) => [
            t.name,
            (input.tables[t.name] ?? []).map((v) =>
              Object.fromEntries(t.columns.map((k) => [k, v[k] ?? null])),
            ),
          ]),
        );
  const before = begin ? null : transaction.beforeImage,
    after = begin ? null : transaction.afterImage,
    receipt = {
      path: databasePath,
      repositoryId: input.repositoryId,
      activationId: transaction.activationId,
      manifest: transaction.result.manifest,
      previousIdentity: transaction.frozen.tempRows.find((v) => v.key === 'CAPTURE').value_json,
      before,
      after,
      status:
        point === 'success' || point === 'post-commit-close'
          ? 'COMMITTED'
          : begin
            ? 'NOT_COMMITTED'
            : 'COMMIT_OUTCOME_UNKNOWN',
      cleanupFailed: point === 'post-commit-close',
    };
  const start = transaction.frozen.state,
    shape = measures(transaction.result),
    apply = begin
      ? {
          state: { ...start, items: start.items + N(shape.nodes) },
          required: { ...transaction.frozen.required, maxItems: start.items + N(shape.nodes) },
        }
      : transaction.committed;
  const s = { rows: 0n, bytes: 0n, items: 0n, pin: 0n },
    required = { rows: 0n, bytes: 0n, memory: 0n, depth: 0 };
  const raise = (k, n) => {
      if (n > required[k]) required[k] = n;
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
      required.depth = Math.max(required.depth, m.depth);
      if (retain) pin(m.weight);
    },
    encode = (v) => {
      own(v, false);
      const text = C(v);
      bytes(2n * B(text));
      pin(2n * B(text));
      return text;
    };
  own(receipt);
  const current = { ...input, tables },
    basic = modelZeroHistoryRead(current),
    fresh = modelZeroHistoryRead(current, basic, true);
  raise('rows', s.rows + BigInt(fresh.required.maxRows));
  raise('bytes', s.bytes + BigInt(fresh.required.maxSerializedBytes));
  raise('memory', 2n * s.pin + BigInt(fresh.required.memoryBudgetBytes));
  required.depth = Math.max(required.depth, fresh.required.maxDepth);
  rows(fresh.state.rows);
  bytes(fresh.state.serializedBytes);
  s.items += BigInt(fresh.state.items);
  pin(fresh.state.retainedLogicalBytes);
  const payload = (v) =>
      Object.values(v).reduce((n, v) => n + (v === null ? 0n : B(String(v))), 0n),
    read = (columns, values) => {
      own(columns);
      rows(1);
      const total = values.reduce((n, v) => n + payload(v), 0n);
      raise('rows', s.rows + 2n * BigInt(values.length));
      raise('bytes', s.bytes + total);
      raise('memory', 2n * (s.pin + total));
      for (const v of values) {
        rows(2);
        bytes(payload(v));
        pin(payload(v));
        own(v, false);
      }
      return values;
    };
  read(
    ['name'],
    schema.tables.map((t) => ({ name: t.name })),
  );
  const image = {};
  for (const t of schema.tables) {
    const values = read(t.columns, tables[t.name])
      .map((v) => encode(v))
      .sort();
    own(values);
    image[t.name] = values;
  }
  const actualImage = encode(image);
  if (actualImage !== (committed ? transaction.afterImage : transaction.beforeImage))
    throw Error('independent recovery image disagrees');
  return {
    point,
    apply,
    receipt,
    tables,
    inspection: {
      state: {
        rows: N(s.rows),
        serializedBytes: N(s.bytes),
        items: N(s.items),
        retainedLogicalBytes: N(s.pin),
      },
      required: {
        maxRows: N(required.rows),
        maxSerializedBytes: N(required.bytes),
        maxItems: N(s.items),
        maxDepth: required.depth,
        memoryBudgetBytes: N(required.memory),
      },
      result: {
        status: committed ? 'COMMITTED' : 'NOT_COMMITTED',
        activationId: transaction.activationId,
        cleanupFailed: point === 'post-commit-close',
      },
    },
    expectedError: begin
      ? 'INVALID_CANDIDATE'
      : point === 'commit-before' || point === 'commit-after'
        ? 'COMMIT_OUTCOME_UNKNOWN'
        : null,
    scope:
      'Closed zero-fact FULL successful/BEGIN/COMMIT-before/COMMIT-after/cleanup-failed paths. Failure at other SQL, rollback ambiguity, inconsistent recovery and nonempty facts are separate gates.',
  };
}
