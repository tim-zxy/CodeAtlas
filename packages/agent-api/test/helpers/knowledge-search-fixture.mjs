import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  sampleSet,
  approve,
  limits as readLimits,
} from '../../../storage/test/helpers/offline-publication-fixture.mjs';
import { OfflinePublicationPreparer } from '../../../application/dist/offline-publication.js';
import { initializeOfflinePublicationStore } from '../../../storage/dist/knowledge/offline-publication-store.js';
import { OfflineKnowledgeSearchIndex } from '../../../storage/dist/knowledge/offline-knowledge-search.js';
import { createOwnedKnowledgeSearchSession } from '../../dist/index.js';
export const limits = { maxResults: 20, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 };
export const input = {
  version: 1,
  mode: 'LEXICAL_PHRASE',
  text: 'Matched contract',
  scope: 'WORKSPACE',
  filters: { types: ['INTEGRATION'] },
  page: { limit: 1, cursor: null },
  budget: { maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
};
export const control = (patch = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...patch,
});
export const sha = (text) => createHash('sha256').update(text).digest('hex');
// Synthetic37-token policy proves mechanics, not production tokenization or authority.
export const meter = (
  measure = (text) => ({
    policyRef: 'fixture:owned-search:v1',
    contentDigest: sha(text),
    outputTokens: 37,
  }),
) => ({ kind: 'EXACT_LOCAL_COUNTER', policyRef: 'fixture:owned-search:v1', measure });
export async function setup(overrides = {}) {
  const f = sampleSet(),
    db = new DatabaseSync(':memory:');
  let store;
  const preparer = new OfflinePublicationPreparer({
    lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, readLimits, c),
    readState: (c) => store.readState(readLimits, c),
  });
  store = initializeOfflinePublicationStore(db, 'w', readLimits, f.c, preparer.identity);
  const ready = await preparer.prepare(f.input, approve, f.c),
    attempt = store.begin(ready.handle, readLimits, f.c);
  store.publish(attempt.handle, readLimits, f.c);
  const seen = { query: 0, permission: [], projection: [] };
  let deny = false;
  const index = new OfflineKnowledgeSearchIndex(store, {
    kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
    check(manifest) {
      seen.projection.push(manifest);
      if (deny) throw Error('SECRET projection denied');
    },
  });
  index.rebuild(readLimits, f.c);
  const make = (patch) =>
    createOwnedKnowledgeSearchSession({
      workspaceId: 'w',
      repositoryIds: ['r'],
      limits,
      authorize(m) {
        seen.permission.push(m);
        if (deny) throw Error('SECRET permission');
      },
      knowledgeQuery: async (req, c) => {
        seen.query++;
        return index.searchPage(req, readLimits, c);
      },
      tokenCounter: meter(),
      ...overrides,
      ...patch,
    });
  return {
    ...f,
    db,
    store,
    index,
    seen,
    make,
    api: make(),
    setDeny(v) {
      deny = v;
    },
    close() {
      index.close();
      if (db.isOpen) db.close();
    },
  };
}
