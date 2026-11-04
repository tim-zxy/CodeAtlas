import {
  HistoryReadBudget,
  HistoryCaptureError,
  checkedHistoryLimits,
  exact,
  type HistoryReadLimits,
} from './activation-history-format.js';
import { MixedAnalysisError, requireMixedAnalysis as check } from './mixed-analysis-state.js';
export type SourceAccountControl = {
  signal: AbortSignal;
  deadlineEpochMs: number;
  maxInputBytes: number;
};
type SourceAccountState = SourceAccountControl & { inputBytes: number };
const sourceAccounts = new WeakMap<HistoryReadBudget, SourceAccountState>();
const accountBudgets = new WeakMap<object, HistoryReadBudget>();
/** Only inside SourceState's synchronous owned transaction, after the full account check.
 * No Stage operation runs here; public checkpoint still rejects every ambient transaction. */
export function checkpointOwnedSourceSql(
  budget: HistoryReadBudget,
  account: ReturnType<typeof borrowMixedSourceBudget>,
): void {
  check(accountBudgets.get(account) === budget);
  check(owners.get(budget)?.valid, 'STAGE_RELEASED');
  const state = sourceAccounts.get(budget);
  check(state);
  if (state.signal.aborted) throw new MixedSourceAccountError('CANCELLED');
  if (Date.now() >= state.deadlineEpochMs) throw new MixedSourceAccountError('DEADLINE_EXCEEDED');
}
export function assertMixedSourceAccount(
  budget: HistoryReadBudget,
  account: ReturnType<typeof borrowMixedSourceBudget>,
): void {
  check(accountBudgets.get(account) === budget);
  account.checkpoint();
}
export class MixedSourceAccountError extends Error {
  constructor(readonly code: 'CANCELLED' | 'DEADLINE_EXCEEDED') {
    super(code);
    this.name = 'MixedSourceAccountError';
  }
}

type Owner = { valid: boolean; attached: boolean; alive: () => void; invalidate: () => void };
const owners = new WeakMap<HistoryReadBudget, Owner>();
function owner(budget: HistoryReadBudget): Owner {
  let state = owners.get(budget);
  if (!state) {
    state = { valid: true, attached: false, alive() {}, invalidate() {} };
    owners.set(budget, state);
  }
  return state;
}
function sourceFailure(e: unknown): never {
  if (e instanceof MixedSourceAccountError || e instanceof MixedAnalysisError) throw e;
  if (e instanceof HistoryCaptureError && e.code === 'HISTORY_LIMIT_EXCEEDED')
    throw new MixedAnalysisError('STAGE_LIMIT_EXCEEDED');
  throw new MixedAnalysisError('INVALID_STAGE');
}
export function invalidateMixedSourceBudget(budget: HistoryReadBudget): void {
  const o = owners.get(budget);
  if (o) {
    o.valid = false;
    o.invalidate();
  }
}
export function prepareMixedSourceBudget(
  budget: HistoryReadBudget,
  limits: HistoryReadLimits,
): void {
  const o = owners.get(budget);
  check(o?.valid && !o.attached, 'STAGE_RELEASED');
  for (const k of Object.keys(limits) as (keyof HistoryReadLimits)[])
    check(limits[k] <= budget.limits[k]);
  check(
    budget.rows <= limits.maxRows &&
      budget.items <= limits.maxItems &&
      budget.serializedBytes <= limits.maxSerializedBytes &&
      budget.retainedLogicalBytes <= Math.floor(limits.memoryBudgetBytes / 2),
    'STAGE_LIMIT_EXCEEDED',
  );
  Object.defineProperty(budget, 'limits', { value: limits });
}
export function bindMixedSourceBudget(
  budget: HistoryReadBudget,
  alive: () => void,
  invalidate: () => void,
): void {
  const o = owner(budget);
  check(o.valid && !o.attached, 'STAGE_RELEASED');
  o.attached = true;
  o.alive = alive;
  o.invalidate = invalidate;
}
export function beginMixedSourceAccount(limits: HistoryReadLimits, control: SourceAccountControl) {
  const budget = new HistoryReadBudget(checkedHistoryLimits(limits));
  owner(budget);
  return Object.freeze({ budget, account: borrowMixedSourceBudget(budget, control) });
}
export function borrowMixedSourceBudget(budget: HistoryReadBudget, control: SourceAccountControl) {
  const o = owner(budget);
  const invalidate = () => invalidateMixedSourceBudget(budget);
  const alive = () => {
    check(o.valid, 'STAGE_RELEASED');
    o.alive();
  };
  const perform = <T>(action: () => T): T => {
    try {
      alive();
      return action();
    } catch (e) {
      invalidate();
      if (e instanceof MixedSourceAccountError) throw e;
      return sourceFailure(e);
    }
  };
  let state: SourceAccountState;
  try {
    alive();
    const v = exact(control, ['signal', 'deadlineEpochMs', 'maxInputBytes']);
    const signal = v.signal as AbortSignal;
    // Use the intrinsic getter rather than caller-controlled duck typing.
    Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!.call(signal);
    check(
      typeof v.deadlineEpochMs === 'number' &&
        Number.isSafeInteger(v.deadlineEpochMs) &&
        v.deadlineEpochMs > 0,
    );
    check(
      typeof v.maxInputBytes === 'number' &&
        Number.isSafeInteger(v.maxInputBytes) &&
        v.maxInputBytes > 0,
    );
    const previous = sourceAccounts.get(budget);
    check(!previous || previous.signal === signal);
    state = previous ?? {
      signal,
      deadlineEpochMs: v.deadlineEpochMs,
      maxInputBytes: v.maxInputBytes,
      inputBytes: 0,
    };
    state.deadlineEpochMs = Math.min(state.deadlineEpochMs, v.deadlineEpochMs);
    state.maxInputBytes = Math.min(state.maxInputBytes, v.maxInputBytes);
    sourceAccounts.set(budget, state);
    if (signal.aborted) throw new MixedSourceAccountError('CANCELLED');
    if (Date.now() >= state.deadlineEpochMs) throw new MixedSourceAccountError('DEADLINE_EXCEEDED');
    check(state.inputBytes <= state.maxInputBytes, 'STAGE_LIMIT_EXCEEDED');
    budget.own({
      inputBytes: state.inputBytes,
      maxInputBytes: state.maxInputBytes,
      deadlineEpochMs: state.deadlineEpochMs,
    });
  } catch (e) {
    invalidate();
    if (e instanceof MixedSourceAccountError) throw e;
    return sourceFailure(e);
  }
  const checkpoint = () =>
    perform(() => {
      if (state.signal.aborted) throw new MixedSourceAccountError('CANCELLED');
      if (Date.now() >= state.deadlineEpochMs)
        throw new MixedSourceAccountError('DEADLINE_EXCEEDED');
    });
  const amount = (n: number) =>
    check(Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0), 'STAGE_LIMIT_EXCEEDED');
  const account = Object.freeze({
    checkpoint,
    own(value: unknown) {
      checkpoint();
      perform(() => budget.own(value));
    },
    reserveBuffer(bytes: number) {
      checkpoint();
      perform(() => {
        amount(bytes);
        budget.pin(bytes);
      });
    },
    readBytes(bytes: number) {
      checkpoint();
      perform(() => {
        amount(bytes);
        check(bytes <= state.maxInputBytes - state.inputBytes, 'STAGE_LIMIT_EXCEEDED');
        budget.add('serializedBytes', bytes);
        state.inputBytes += bytes;
      });
    },
    visitItem() {
      checkpoint();
      perform(() => budget.add('items', 1));
    },
    invalidate,
  });
  accountBudgets.set(account, budget);
  return account;
}
