import type { DatabaseSync } from 'node:sqlite';
type Repository = Parameters<typeof createBudgetedSourceStateStore>[1];
import type { EffectiveConfig } from './effective-config.js';
import { createBudgetedSourceStateStore } from '../../storage/dist/source-state/repository.js';
import {
  checkedHistoryLimits,
  exact,
} from '../../storage/dist/analysis/activation-history-format.js';
import { requireMixedAnalysis as check } from '../../storage/dist/analysis/mixed-analysis-state.js';
import prepareMixedSource, {
  type MixedSourcePreparationInput,
} from '../../application/dist/mixed-source-workflow.js';
import {
  beginMixedSourceAccount,
  type SourceAccountControl,
} from '../../storage/dist/analysis/mixed-source-account.js';
import type { HistoryReadLimits } from '../../storage/dist/analysis/activation-history-format.js';
export type MixedSourcePreparation = Omit<MixedSourcePreparationInput, 'account' | 'control'> & {
  readonly limits: HistoryReadLimits;
  readonly control: SourceAccountControl;
};
/** Private preparation only. Production must qualify the whole operation before invoking this. */
export default async function prepareMixedSourceOperation(input: MixedSourcePreparation) {
  const prelude = beginMixedSourceAccount(input.limits, input.control);
  try {
    const prepared = await prepareMixedSource({ ...input, account: prelude.account });
    return Object.freeze({ ...prepared, budget: prelude.budget, account: prelude.account });
  } catch (e) {
    prelude.account.invalidate();
    throw e;
  }
}

export type BudgetedMixedSourceInput = Omit<MixedSourcePreparation, 'sourceState'> & {
  readonly database: DatabaseSync;
  readonly repository: Repository;
  readonly operationBudget: EffectiveConfig['indexing']['resourceBudget'];
};
/** Local fixed preparation; no public route or qualification bypass. */
export async function prepareBudgetedMixedSourceOperation(input: BudgetedMixedSourceInput) {
  const limits = checkedHistoryLimits(input.limits);
  const cap = exact(input.operationBudget, [
    'maxInputBytes',
    'maxOutputBytes',
    'maxItems',
    'maxDepth',
    'maxDurationMs',
    'maxMemoryBytes',
  ]);
  for (const value of Object.values(cap))
    check(typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  const global = input.operationBudget;
  check(
    limits.maxItems <= global.maxItems &&
      limits.maxDepth <= global.maxDepth &&
      limits.memoryBudgetBytes <= global.maxMemoryBytes,
    'STAGE_LIMIT_EXCEEDED',
  );
  for (const value of [input.control.deadlineEpochMs, input.control.maxInputBytes])
    check(Number.isSafeInteger(value) && value > 0);
  const deadline = Date.now() + global.maxDurationMs;
  check(Number.isSafeInteger(deadline) && deadline > 0);
  const control = {
    signal: input.control.signal,
    deadlineEpochMs: Math.min(input.control.deadlineEpochMs, deadline),
    maxInputBytes: Math.min(input.control.maxInputBytes, global.maxInputBytes),
  };
  const prelude = beginMixedSourceAccount(limits, control);
  try {
    const sourceState = createBudgetedSourceStateStore(
      input.database,
      input.repository,
      prelude.budget,
      prelude.account,
    );
    const prepared = await prepareMixedSource({
      request: input.request,
      policy: input.policy,
      control,
      expectedRepository: input.repository,
      sourceState,
      account: prelude.account,
    });
    return Object.freeze({ ...prepared, budget: prelude.budget, account: prelude.account });
  } catch (e) {
    prelude.account.invalidate();
    throw e;
  }
}
