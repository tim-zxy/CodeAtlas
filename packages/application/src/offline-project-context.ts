import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
/** Explicitly selected metadata only. No text search, Source, model, update or publication port. */
export async function readOwnedProjectContext(
  request: { workspaceId: string; selectedRefs: readonly { itemId: string; revisionId: string }[] },
  ports: {
    workspaceId: string;
    read: (
      selectedRefs: readonly { itemId: string; revisionId: string }[],
      control: RuntimeRequestControl,
    ) => Promise<unknown>;
  },
  control: RuntimeRequestControl,
): Promise<unknown> {
  canonicalCompilationJson(null, control);
  if (EntityIdSchema.parse(request.workspaceId) !== ports.workspaceId)
    throw Error('CONTEXT_SCOPE_DENIED');
  const result = await ports.read(request.selectedRefs, control);
  canonicalCompilationJson(null, control);
  return result;
}
