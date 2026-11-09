import { setup as contextSetup, control, meter } from './project-context-fixture.mjs';
import { limits as readLimits } from '../../../storage/test/helpers/offline-publication-fixture.mjs';
import { createOwnedKnowledgeStatusSession } from '../../dist/knowledge-status-tool.js';
export { control, meter };
export const limits = { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 };
export const input = { version: 1, mode: 'SELECTED_PUBLISHED', budget: { ...limits } };
export async function setup(overrides = {}) {
  const f = await contextSetup(),
    seen = { reads: 0, permissions: [], metadata: [] };
  const query = async (refs, c) => {
    seen.reads++;
    return f.store.readKnowledgeStatusProjection(
      refs,
      (m) => {
        seen.metadata.push(m);
        if (m.fields.some((f) => ['TITLE', 'SUMMARY', 'GOAL'].includes(f)))
          throw Error('DISPLAY_READ_FORBIDDEN');
      },
      readLimits,
      c,
    );
  };
  const make = (patch) =>
    createOwnedKnowledgeStatusSession({
      workspaceId: 'w',
      repositoryIds: ['r'],
      selectedRefs: f.refs,
      limits,
      authorize(m) {
        seen.permissions.push(m);
      },
      knowledgeQuery: query,
      tokenCounter: meter(),
      ...overrides,
      ...patch,
    });
  return { ...f, seen, query, make, api: make() };
}
