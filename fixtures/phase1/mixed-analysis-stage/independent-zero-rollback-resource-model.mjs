import { measures } from './independent-code-resource-model.mjs';
import { modelZeroRecovery } from './independent-zero-recovery-resource-model.mjs';
const N = (v) => {
  if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('unsafe rollback reference');
  return Number(v);
};
export const zeroRollbackPoints = ['commit-and-rollback-fail', 'snapshot-and-rollback-fail'];
/** Closed zero-fact rollback ambiguity. All costs derive from frozen independent input/SQL schedules. */
export function modelZeroRollback(input, transaction, schema, databasePath, point) {
  if (!zeroRollbackPoints.includes(point)) throw Error('unsupported rollback reference point');
  const partial = point === 'snapshot-and-rollback-fail',
    settled = modelZeroRecovery(
      input,
      partial ? { ...transaction, afterImage: null } : transaction,
      schema,
      databasePath,
      'commit-before',
    );
  let apply = transaction.committed;
  if (partial) {
    const previous = transaction.before,
      state = { ...previous.state },
      oldIds = new Set((input.tables.provider_snapshots ?? []).map((s) => s.id)),
      snap = transaction.result.code.snapshots.find((s) => !oldIds.has(s.id));
    if (!snap) throw Error('reference requires fresh snapshot');
    const b = transaction.result.basis,
      row = {
        id: snap.id,
        repository_id: b.repositoryId,
        provider_id: snap.providerId,
        provider_version: snap.providerVersion,
        runtime_version: snap.runtimeVersion,
        requested_revision_id: snap.requestedRevisionId,
        requested_revision_fingerprint: snap.requestedRevisionFingerprint,
        started_at: Date.parse(snap.startedAt),
        completed_at: Date.parse(snap.completedAt),
        outcome: snap.outcome,
      };
    const required = { ...previous.required },
      own = (v) => {
        const m = measures(v);
        state.items += N(m.nodes);
        state.retainedLogicalBytes += N(m.weight);
        required.maxDepth = Math.max(required.maxDepth, m.depth);
      };
    state.rows++;
    own(row);
    own([row.id]);
    state.rows++;
    own(row);
    const params = Object.values(row);
    own(params);
    state.rows++;
    state.serializedBytes += params.reduce(
      (n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 0),
      0,
    );
    required.maxRows = Math.max(required.maxRows, state.rows);
    required.maxSerializedBytes = Math.max(required.maxSerializedBytes, state.serializedBytes);
    required.maxItems = state.items;
    required.memoryBudgetBytes = Math.max(
      required.memoryBudgetBytes,
      2 * state.retainedLogicalBytes,
    );
    apply = { state, required };
  }
  const m = measures(settled.receipt),
    open = {
      state: { rows: 0, serializedBytes: 0, items: N(m.nodes), retainedLogicalBytes: N(m.weight) },
      required: {
        maxRows: 1,
        maxSerializedBytes: 1,
        maxItems: N(m.nodes),
        maxDepth: m.depth,
        memoryBudgetBytes: N(2n * m.weight),
      },
      result: {
        status: 'INCONSISTENT',
        activationId: transaction.activationId,
        cleanupFailed: false,
      },
    };
  for (const v of [...Object.values(apply.state), ...Object.values(apply.required)])
    if (!Number.isSafeInteger(v) || v < 0) throw Error('unsafe independent rollback prefix sum');
  return {
    point,
    apply,
    receipt: settled.receipt,
    open,
    settled: settled.inspection,
    durableTables: settled.tables,
    expectedApplyError: 'COMMIT_OUTCOME_UNKNOWN',
    nonzeroOpenDimensions: ['maxItems', 'maxDepth', 'memoryBudgetBytes'],
    zeroCostDimensions: ['rows', 'serializedBytes'],
    zeroCostLimits:
      'Existing checkedHistoryLimits requires positive limits; value1 is an admissibility witness, not a charged SQL row/byte or a new profile.',
    scope:
      'Two closed zero-fact rollback-open paths and readonly recovery after releasing the fault-injected test transaction. Does not authorize production repair/retry or qualify nonempty/other SQL failures.',
  };
}
