import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
/** Fixed self-owned query composition; no update, publication or Source port. */
export async function searchOwnedKnowledge(
  request: { workspaceId: string; text: string; maxResults: number; types: string[] | null },
  ports: {
    workspaceId: string;
    search: (
      request: { text: string; maxResults: number; types: string[] | null },
      control: RuntimeRequestControl,
    ) => Promise<unknown>;
  },
  control: RuntimeRequestControl,
): Promise<unknown> {
  canonicalCompilationJson(null, control);
  if (EntityIdSchema.parse(request.workspaceId) !== ports.workspaceId)
    throw Error('SEARCH_SCOPE_DENIED');
  const result = await ports.search(
    { text: request.text, maxResults: request.maxResults, types: request.types },
    control,
  );
  canonicalCompilationJson(null, control);
  return result;
}
