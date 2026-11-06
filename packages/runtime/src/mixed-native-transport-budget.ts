import type { CodeSyntaxCompositionBudget } from '../../providers/dist/native-code-syntax-budget.js';
import {
  requireHistory,
  type HistoryReadBudget,
} from '../../storage/dist/analysis/activation-history-format.js';

/**
 * Private fixed transport bridge using the existing request-preparation accounting.
 * The trusted action exclusively owns this ledger until settlement and must not
 * concurrently mutate the same HistoryReadBudget. This grants no run authority.
 */
export async function withMixedNativeTransportBudget<T>(
  budget: HistoryReadBudget,
  action: (ledger: CodeSyntaxCompositionBudget) => Promise<T>,
): Promise<T> {
  const remaining = budget.remaining(),
    cap = Math.min(remaining.maxSerializedBytes, Math.floor(remaining.memoryBudgetBytes / 2));
  requireHistory(cap > 0, 'HISTORY_LIMIT_EXCEEDED');
  const startBytes = budget.serializedBytes,
    startItems = budget.items;
  const ledger: CodeSyntaxCompositionBudget = {
    limits: {
      maxSerializedBytes: startBytes + cap,
      maxItems: budget.limits.maxItems,
      maxDepth: budget.limits.maxDepth,
    },
    budget: { serializedBytes: startBytes, items: startItems },
  };
  try {
    return await action(ledger);
  } finally {
    const delta = ledger.budget.serializedBytes - startBytes;
    budget.add('serializedBytes', delta);
    budget.add('items', ledger.budget.items - startItems);
    budget.pin(delta);
  }
}
