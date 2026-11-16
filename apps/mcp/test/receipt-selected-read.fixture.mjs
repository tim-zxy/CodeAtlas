import { Schema11KnowledgeSearchIndex } from '../../../packages/storage/dist/knowledge/offline-knowledge-search.js';
import assert from 'node:assert/strict';
import { withReadyPublication } from '../../../packages/storage/test/helpers/schema11-publication-fixture.mjs';
import { createOwnedPublishedReadBinding } from '../../../packages/runtime/dist/owned-published-read-binding.js';
import { createCl100kTokenCounter } from '../../../packages/runtime/dist/local-token-counter.js';
import {
  createReceiptSelectedReadMcpServer,
  createReceiptPublishedReadMcpServer,
} from '../dist/owned-business-stdio.js';
import { acquireAndRunOwnedManagedMcpHost } from '../dist/owned-managed-host.js';
const cleanup = [],
  mode = process.argv[2] ?? 'normal';
try {
  await withReadyPublication(
    { after: (fn) => cleanup.push(fn) },
    async (f) => {
      f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
      const scope = { workspaceId: f.w, repositoryIds: f.owned.repositoryIds };
      let reads = 0;
      const query = (refs, c) => {
        reads++;
        return f.api.readSelectedCoveredProjection(refs, f.limits, c, () => {});
      };
      const index =
        mode === 'extended'
          ? new Schema11KnowledgeSearchIndex(f.api, {
              kind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY',
              check(m) {
                assert.equal(m.workspaceId, f.w);
              },
            })
          : null;
      if (index) index.rebuild(f.limits, f.c);
      const binding = createOwnedPublishedReadBinding({
        store: {
          readState: (limits, c) =>
            index ? f.api.readCurrentCoveredProjection(limits, c, () => {}) : query(f.refs, c),
        },
        scope,
        limits: f.limits,
        control: f.owned.control(),
      });
      const budget = { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 50000 };
      const ports = {
        selectedRefs: f.refs,
        limits: budget,
        authorize: (m) => {
          binding.check(binding.handle, scope);
          assert.equal(m.workspaceId, f.w);
          assert.deepEqual(m.repositoryIds, scope.repositoryIds);
          if (m.selectedRefs) assert.deepEqual(m.selectedRefs, f.refs);
          if (m.selectedPublishedRevisionRefs)
            assert.deepEqual(m.selectedPublishedRevisionRefs, f.refs);
          if (mode === 'deny') throw Error('OWNED_QUERY_DENIED');
        },
        knowledgeQuery: async (refs, c) => {
          const value = query(refs, c);
          if (mode === 'revoke-on-query') {
            process.stderr.write('SCHEMA11_REVOKED\n');
            binding.revoke();
          }
          return value;
        },
        tokenCounter: createCl100kTokenCounter(budget.maxOutputBytes),
      };
      const expected = f.api.readSelectedCoveredProjection(f.refs, f.limits, f.c, () => {})
        .records[0];
      process.stderr.write(
        'SCHEMA11_SEED ' +
          JSON.stringify({
            ref: f.refs[0],
            publicationId: expected.publicationId,
            candidateId: expected.candidateId,
            provenance: expected.provenance,
            coverage: expected.knowledgeCoverage,
            title: expected.revisionEnvelope.payload.structuredContent.title,
            goal: expected.revisionEnvelope.payload.structuredContent.goal,
            startStepKey: f.owned.startStepKey,
            expectedStepKeys: f.owned.expectedStepKeys,
          }) +
          '\n',
      );
      const before = f.db.prepare('SELECT total_changes() n').get().n;
      const result = await acquireAndRunOwnedManagedMcpHost(
        async () =>
          (index ? createReceiptPublishedReadMcpServer : createReceiptSelectedReadMcpServer)(
            {
              scope,
              status: ports,
              projectContext: ports,
              ...(index
                ? {
                    search: {
                      limits: {
                        maxResults: 10,
                        maxDepth: 0,
                        maxOutputBytes: 1000000,
                        maxTokens: 50000,
                      },
                      authorize: ports.authorize,
                      knowledgeQuery: async (r, c) => index.searchPage(r, f.limits, c),
                      tokenCounter: ports.tokenCounter,
                    },
                    business: {
                      limits: {
                        maxDepth: 10,
                        maxSteps: 20,
                        maxEdges: 20,
                        maxOutputBytes: 1000000,
                        maxTokens: 50000,
                      },
                      authorize: ports.authorize,
                      knowledgeQuery: async (r, c) => query(r.selectedPublishedRevisionRefs, c),
                      tokenCounter: ports.tokenCounter,
                    },
                  }
                : {}),
              limits: {
                maxMessageBytes: 4000000,
                maxConcurrentCalls: 1,
                maxItems: 1000000,
                maxDepth: 100,
                requestTimeoutMs: 15000,
              },
            },
            {
              signal: binding.signal,
              check: (observed) => binding.check(binding.handle, observed),
            },
            { input: process.stdin, output: process.stdout },
          ),
        async () => {
          assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
          binding.revoke();
          if (index) index.close();
          f.db.close();
          process.stderr.write('SCHEMA11_RELEASED\n');
          return { cleanupState: mode === 'unknown-cleanup' ? 'UNKNOWN' : 'SETTLED' };
        },
        new AbortController().signal,
      );
      assert.ok(reads > 0);
      assert.equal(f.db.isOpen, false);
      process.stderr.write('SCHEMA11_HOST ' + JSON.stringify(result) + '\n');
      process.exitCode = result.exitCode;
    },
    { status: 'PARTIAL', limitations: ['SOURCE_PARTIAL'], unverifiedRefs: [] },
  );
} catch {
  process.stderr.write('SCHEMA11_FIXTURE_FAILED\n');
  process.exitCode = 2;
} finally {
  for (const fn of cleanup.reverse()) await fn();
}
