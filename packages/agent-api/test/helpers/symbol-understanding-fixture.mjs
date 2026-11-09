import { createHash } from 'node:crypto';
import { openRepositoryCodeQuery } from '../../../storage/dist/index.js';
import { createOwnedSymbolUnderstandingSession } from '../../dist/symbol-understanding-tool.js';
export { withCodeQueryDatabase } from '../../../storage/test/helpers/code-query-fixture.mjs';
export const limits = {
  maxNodes: 50,
  maxEdges: 50,
  maxMetadataRows: 10000,
  maxOutputBytes: 1000000,
  maxTokens: 1000,
};
export const control = (patch = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...patch,
});
export const sha = (text) => createHash('sha256').update(text).digest('hex');
export const meter = (
  measure = (text) => ({
    policyRef: 'fixture:symbol:v1',
    contentDigest: sha(text),
    outputTokens: 37,
  }),
) => ({ kind: 'EXACT_LOCAL_COUNTER', policyRef: 'fixture:symbol:v1', measure });
export function setup(seed, overrides = {}) {
  const seen = { open: 0, close: 0, node: 0, permission: [], budget: null };
  const open = async (budget, c) => {
    seen.open++;
    seen.budget = budget;
    const s = await openRepositoryCodeQuery(seed.databasePath, seed.repositoryId, c);
    return {
      ...s,
      readNode: async (id) => {
        seen.node++;
        return s.readNode(id);
      },
      findNodes() {
        throw Error('FORBIDDEN_NAME_LOOKUP');
      },
      close: async () => {
        s.close();
        seen.close++;
      },
    };
  };
  const ports = {
    workspaceId: 'owned-symbol-workspace',
    repositoryIds: [seed.repositoryId],
    repositoryId: seed.repositoryId,
    limits: { ...limits },
    authorize(m) {
      seen.permission.push(m);
    },
    openCodeQuery: open,
    tokenCounter: meter(),
    ...overrides,
  };
  const make = (patch) => createOwnedSymbolUnderstandingSession({ ...ports, ...patch });
  return {
    seen,
    open,
    ports,
    make,
    api: make(),
    input: {
      version: 1,
      mode: 'STORED_CODE',
      symbolId: seed.symbolIds.root,
      expectedRevisionId: 'query-revision',
      budget: { ...limits },
    },
  };
}
