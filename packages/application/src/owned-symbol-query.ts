import { CanonicalIdSchema, EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { executeCodeQuery } from './code-query.js';
import {
  createQueryControl,
  parseCodeQueryEnvelope,
  type CodeReadPort,
  type QueryBudget,
  type QueryControl,
} from './code-query-contract.js';
export type OwnedSymbolCodeSession = CodeReadPort & { close(): void | Promise<void> };
type OwnedCodeRequest = {
  repositoryId: string;
  symbolId: string;
  expectedRevisionId: string;
  budget: QueryBudget;
};
/** Existing symbol entry point retains its exact request semantics. */
export async function readOwnedSymbolUnderstanding(
  request: OwnedCodeRequest,
  open: (budget: QueryBudget, control: QueryControl) => Promise<OwnedSymbolCodeSession>,
  control: RuntimeRequestControl,
) {
  return readOwnedStoredCodeQuery(
    {
      repositoryId: request.repositoryId,
      symbolId: request.symbolId,
      expectedRevisionId: request.expectedRevisionId,
      budget: request.budget,
      operation: 'UNDERSTAND',
    },
    open,
    control,
  );
}
/** Shared readonly owner for the two approved exact code operations. */
export async function readOwnedStoredCodeQuery(
  request: OwnedCodeRequest &
    ({ operation: 'UNDERSTAND' } | { operation: 'CODE_TRACE'; maxDepth: number }),
  open: (budget: QueryBudget, control: QueryControl) => Promise<OwnedSymbolCodeSession>,
  control: RuntimeRequestControl,
) {
  canonicalCompilationJson(null, control);
  const repositoryId = EntityIdSchema.parse(request.repositoryId),
    symbolId = CanonicalIdSchema.parse(request.symbolId),
    expectedRevisionId = EntityIdSchema.parse(request.expectedRevisionId),
    budget = {
      ...request.budget,
      timeoutMs: Math.min(
        request.budget.timeoutMs,
        Math.max(1, Math.floor(control.deadlineEpochMs - Date.now())),
      ),
    },
    queryControl = createQueryControl(budget, control.signal);
  let session: OwnedSymbolCodeSession | undefined;
  try {
    session = await open(budget, queryControl);
    canonicalCompilationJson(null, control);
    if (session.context.repositoryId !== repositoryId)
      throw Object.assign(Error(), { code: 'QUERY_DATA_INVALID' });
    // Active revision is checked before executeCodeQuery can perform its first node lookup.
    if (session.context.revisionId !== expectedRevisionId)
      throw Object.assign(Error(), { code: 'REVISION_MISMATCH' });
    const result = parseCodeQueryEnvelope(
      await executeCodeQuery(
        request.operation === 'CODE_TRACE'
          ? { operation: 'CODE_TRACE', repositoryId, symbolId, budget, maxDepth: request.maxDepth }
          : { operation: 'UNDERSTAND', repositoryId, symbolId, budget },
        session,
        queryControl,
      ),
    );
    const rootId =
      result.payload.operation === 'UNDERSTAND'
        ? result.payload.symbol.id
        : result.payload.operation === 'CODE_TRACE'
          ? result.payload.nodes[0]?.node.id
          : null;
    if (
      result.payload.operation !== request.operation ||
      result.payload.repositoryId !== repositoryId ||
      result.payload.revisionId !== expectedRevisionId ||
      rootId !== symbolId
    )
      throw Object.assign(Error(), { code: 'QUERY_DATA_INVALID' });
    canonicalCompilationJson(null, control);
    return result;
  } finally {
    if (session) {
      try {
        await session.close();
      } catch {
        throw Object.assign(Error(), { code: 'QUERY_CLEANUP_FAILED', cleanupState: 'UNKNOWN' });
      }
    }
  }
}
