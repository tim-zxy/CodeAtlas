import type { RuntimeRequestControl } from '@codeatlas/ir';
import type { QueryBudget, QueryControl } from './code-query-contract.js';
import { readOwnedStoredCodeQuery, type OwnedSymbolCodeSession } from './owned-symbol-query.js';
/** Exact bounded forward static CALL graph; no runtime or fallback inference. */
export function readOwnedCodeTrace(
  request: {
    repositoryId: string;
    symbolId: string;
    expectedRevisionId: string;
    maxDepth: number;
    budget: QueryBudget;
  },
  open: (budget: QueryBudget, control: QueryControl) => Promise<OwnedSymbolCodeSession>,
  control: RuntimeRequestControl,
) {
  return readOwnedStoredCodeQuery({ ...request, operation: 'CODE_TRACE' }, open, control);
}
