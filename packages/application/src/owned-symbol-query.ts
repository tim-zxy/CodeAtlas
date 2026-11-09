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
/** Host opens its fixed readonly repository; no name, position, source-body or fallback port. */
export async function readOwnedSymbolUnderstanding(
  request: {
    repositoryId: string;
    symbolId: string;
    expectedRevisionId: string;
    budget: QueryBudget;
  },
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
        { operation: 'UNDERSTAND', repositoryId, symbolId, budget },
        session,
        queryControl,
      ),
    );
    if (
      result.payload.operation !== 'UNDERSTAND' ||
      result.payload.repositoryId !== repositoryId ||
      result.payload.revisionId !== expectedRevisionId ||
      result.payload.symbol.id !== symbolId
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
