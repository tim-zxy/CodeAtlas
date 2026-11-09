import { setup as searchSetup, meter, control, sha } from './knowledge-search-fixture.mjs';
import { limits as readLimits } from '../../../storage/test/helpers/offline-publication-fixture.mjs';
import { createOwnedProjectContextSession } from '../../dist/index.js';
export { control, meter, sha };
export const limits = { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 };
export const input = { version: 1, depth: 'L0', budget: { ...limits } };
export async function setup(overrides = {}) {
  const f = await searchSetup();
  f.index.close();
  f.index.searchPage = () => {
    throw Error('SEARCH_FORBIDDEN');
  };
  const refs = f.db
    .prepare(
      'SELECT item_id AS itemId,revision_id AS revisionId FROM offline_heads ORDER BY item_id',
    )
    .all()
    .map((r) => ({ ...r }));
  const seen = { read: 0, permission: [], metadata: [] };
  const query = async (selected, c) => {
    seen.read++;
    return f.store.readProjectContextProjection(
      selected,
      (m) => {
        seen.metadata.push(m);
      },
      readLimits,
      c,
    );
  };
  const make = (patch) =>
    createOwnedProjectContextSession({
      workspaceId: 'w',
      repositoryIds: ['r'],
      selectedRefs: structuredClone(refs),
      limits,
      authorize(m) {
        seen.permission.push(m);
      },
      knowledgeQuery: query,
      tokenCounter: meter(),
      ...overrides,
      ...patch,
    });
  return { ...f, refs, seen, query, make, api: make() };
}
