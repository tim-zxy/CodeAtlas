// Shared fixed-scope self-owned host. Business vector is explicitly synthetic, not quality proof.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  setup,
  input as searchInput,
  meter,
} from '../../../packages/agent-api/test/helpers/knowledge-search-fixture.mjs';
import { limits as readLimits } from '../../../packages/storage/test/helpers/offline-publication-fixture.mjs';
import {
  createOwnedFiveReadToolsMcpServer,
  createOwnedExtendedReadToolsMcpServer,
  createOwnedStructureReadToolsMcpServer,
  createOwnedManagedReadToolsMcpServer,
} from '../dist/owned-business-stdio.js';
import { withCodeQueryDatabase } from '../../../packages/storage/test/helpers/code-query-fixture.mjs';
import { openRepositoryCodeQuery } from '../../../packages/storage/dist/index.js';
import {
  withOwnedStructureFixture,
  structureLimits,
} from '../../../packages/application/test/helpers/owned-structure-fixture.mjs';
const cleanup = [];
async function run(runtimeSeed = null) {
  await withCodeQueryDatabase(
    {
      after(fn) {
        cleanup.push(fn);
      },
    },
    'current',
    async (seed) => {
      const f = await setup();
      const refs = f.db
        .prepare(
          'SELECT item_id AS itemId,revision_id AS revisionId FROM offline_heads ORDER BY item_id',
        )
        .all()
        .map((r) => ({ ...r }));
      const raw = JSON.parse(
        readFileSync(
          new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
          'utf8',
        ),
      ).subjects.find((x) => x.name === 'BUSINESS_FLOW');
      const replace = (v) =>
        Array.isArray(v)
          ? v.map(replace)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x)]))
            : v === 'workspace:one'
              ? 'w'
              : v === 'repo:one'
                ? 'r'
                : v;
      const vector = replace(raw),
        existing = vector.existing,
        revision = existing.revisionEnvelope.payload,
        ref = { itemId: existing.itemEnvelope.payload.id, revisionId: revision.id };
      const canonical = (v) =>
        Array.isArray(v)
          ? '[' + v.map(canonical).join(',') + ']'
          : v && typeof v === 'object'
            ? '{' +
              Object.keys(v)
                .sort()
                .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
                .join(',') +
              '}'
            : JSON.stringify(v);
      const sha = (s) => createHash('sha256').update(s).digest('hex');
      const businessResult = {
        kind: 'OWNED_TEST_PUBLICATION',
        workspaceId: 'w',
        selectionDigest: sha(
          'codeatlas.offline-knowledge.selection.v1\0' +
            canonical({ workspaceId: 'w', refs: [ref] }),
        ),
        records: [
          {
            itemEnvelope: existing.itemEnvelope,
            revisionEnvelope: existing.revisionEnvelope,
            referenceContext: existing.referenceContext,
            coverage: vector.candidate.candidateEnvelope.payload.coverage,
            provenance: {
              attemptId: 'owned-group:synthetic',
              runId: revision.compilationRunId,
              snapshotId: revision.inputSnapshotRef.id,
              revisionSetId: revision.revisionSetId,
              evaluationId: revision.evaluationRef.id,
            },
            currentHeadRevisionId: revision.id,
            isCurrentHead: true,
            warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
          },
        ],
        productionQuery: 'NOT_AUTHORIZED',
        quality: 'NOT_EVALUABLE',
      };
      let reads = 0;
      const authorize = (m) => {
        if (
          m.workspaceId !== 'w' ||
          JSON.stringify(m.repositoryIds) !==
            JSON.stringify(
              [
                ...new Set([
                  'r',
                  seed.repositoryId,
                  ...(runtimeSeed ? [runtimeSeed.repositoryId] : []),
                ]),
              ].sort(),
            )
        )
          throw Error('SCOPE_MISMATCH');
      };
      const hostScope = {
        workspaceId: 'w',
        repositoryIds: [
          ...new Set(['r', seed.repositoryId, ...(runtimeSeed ? [runtimeSeed.repositoryId] : [])]),
        ],
      };
      if (runtimeSeed)
        process.stderr.write(
          'STRUCTURE_SEED ' +
            JSON.stringify({
              repositoryId: runtimeSeed.repositoryId,
              revisionId: runtimeSeed.revisionId,
              activationId: runtimeSeed.activationId,
              executionNodeId: runtimeSeed.executionNodeId,
              flowId: runtimeSeed.flowId,
              stepKey: runtimeSeed.stepKey,
            }) +
            '\n',
        );
      if (process.argv[2]?.includes('mutate-scope'))
        Object.defineProperty(authorize, 'bind', {
          value(receiver) {
            hostScope.repositoryIds.push('foreign');
            return Function.prototype.bind.call(authorize, receiver);
          },
        });
      const extended = process.argv[2]?.startsWith('extended') || !!runtimeSeed;
      const managed = process.argv[2]?.startsWith('managed');
      let emit,
        triggered = false,
        overflowDone;
      const overflowReconciled = new Promise((r) => (overflowDone = r));
      const lifecycle = {
        mode: process.argv[2] === 'managed-one-shot' ? 'ONE_SHOT' : 'MCP_STDIO',
        reconcile: async (reason, scope, c) => {
          authorize(scope);
          process.stderr.write('RECONCILE_START ' + reason + '\n');
          const source = await runtimeSeed.open(structureLimits, c);
          try {
            const view = await source.read();
            if (view.activationId !== runtimeSeed.activationId)
              throw Error('OWNED_METADATA_CHANGED');
          } finally {
            await source.close();
          }
          process.stderr.write('RECONCILE_DONE ' + reason + '\n');
          if (reason === 'OVERFLOW') overflowDone();
        },
        ...(process.argv[2] === 'managed-one-shot'
          ? {}
          : {
              watch: async (listener, scope) => {
                authorize(scope);
                emit = listener;
                process.stderr.write('OWNED_OBSERVER_ATTACHED\n');
                return {
                  close() {
                    process.stderr.write('OWNED_OBSERVER_CLOSED\n');
                  },
                };
              },
            }),
      };

      const app = (
        managed
          ? createOwnedManagedReadToolsMcpServer
          : runtimeSeed
            ? createOwnedStructureReadToolsMcpServer
            : extended
              ? createOwnedExtendedReadToolsMcpServer
              : createOwnedFiveReadToolsMcpServer
      )(
        {
          scope: hostScope,
          ...(managed ? { lifecycle } : {}),
          ...(runtimeSeed
            ? Object.fromEntries(
                ['structure', 'l2'].map((name) => [
                  name,
                  {
                    repositoryId: runtimeSeed.repositoryId,
                    limits: { ...structureLimits, maxTokens: 1000 },
                    authorize(m) {
                      authorize(m);
                      if (
                        m.purpose !==
                        (name === 'structure'
                          ? 'trace_flow/STORED_STRUCTURE'
                          : 'get_project_context/L2')
                      )
                        throw Error('PURPOSE');
                    },
                    openRuntimeQuery: async (b, c) => {
                      reads++;
                      if (process.argv[2] === 'structure-hold') {
                        process.stderr.write('HELD_QUERY_STARTED\n');
                        await new Promise((r) => setTimeout(r, 400));
                      }
                      const source = await runtimeSeed.open(b, c);
                      if (managed && process.argv[2] === 'managed-overflow' && !triggered) {
                        return {
                          ...source,
                          read: async () => {
                            const value = await source.read();
                            triggered = true;
                            emit('OVERFLOW');
                            await overflowReconciled;
                            await new Promise((r) => setImmediate(r));
                            process.stderr.write(
                              'POST_EVENT_STATE ' + app.getLifecycleState().phase + '\n',
                            );
                            return value;
                          },
                        };
                      }
                      return source;
                    },
                    tokenCounter: meter(),
                  },
                ]),
              )
            : {}),
          ...(extended
            ? {
                code: {
                  repositoryId: seed.repositoryId,
                  limits: {
                    maxDepth: 10,
                    maxNodes: 50,
                    maxEdges: 50,
                    maxMetadataRows: 10000,
                    maxOutputBytes: 1000000,
                    maxTokens: 1000,
                  },
                  authorize(m) {
                    authorize(m);
                    if (m.purpose !== 'trace_flow/CODE') throw Error('PURPOSE');
                  },
                  openCodeQuery: async (_budget, c) => {
                    reads++;
                    if (process.argv[2] === 'extended-hold-code') {
                      process.stderr.write('HELD_QUERY_STARTED\n');
                      await new Promise((r) => setTimeout(r, 400));
                    }
                    return openRepositoryCodeQuery(seed.databasePath, seed.repositoryId, c);
                  },
                  tokenCounter: meter(),
                },
                l1: {
                  limits: { maxResults: 20, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
                  authorize(m) {
                    authorize(m);
                    if (m.purpose !== 'get_project_context/L1') throw Error('PURPOSE');
                  },
                  knowledgeQuery: async (req, c) => {
                    reads++;
                    if (process.argv[2] === 'extended-hold-l1') {
                      process.stderr.write('HELD_QUERY_STARTED\n');
                      await new Promise((r) => setTimeout(r, 400));
                    }
                    return f.index.searchPage(req, readLimits, c);
                  },
                  tokenCounter: meter(),
                },
              }
            : {}),
          business: {
            limits: {
              maxDepth: 20,
              maxSteps: 20,
              maxEdges: 20,
              maxOutputBytes: 1000000,
              maxTokens: 1000,
            },
            authorize,
            knowledgeQuery: async () => {
              reads++;
              return businessResult;
            },
            tokenCounter: meter(),
          },
          search: {
            limits: { maxResults: 20, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
            authorize,
            knowledgeQuery: async (req, c) => {
              reads++;
              return f.index.searchPage(req, readLimits, c);
            },
            tokenCounter: meter(),
          },
          projectContext: {
            selectedRefs: refs,
            limits: { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
            authorize,
            knowledgeQuery: async (selected, c) => {
              reads++;
              return f.store.readProjectContextProjection(selected, () => {}, readLimits, c);
            },
            tokenCounter: meter(),
          },
          status: {
            selectedRefs: refs,
            limits: { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
            authorize,
            knowledgeQuery: async (selected, c) => {
              reads++;
              return f.store.readKnowledgeStatusProjection(selected, () => {}, readLimits, c);
            },
            tokenCounter: meter(),
          },
          symbol: {
            repositoryId: seed.repositoryId,
            limits: {
              maxNodes: 50,
              maxEdges: 50,
              maxMetadataRows: 10000,
              maxOutputBytes: 1000000,
              maxTokens: 1000,
            },
            authorize,
            openCodeQuery: async (_budget, control) => {
              reads++;
              return openRepositoryCodeQuery(seed.databasePath, seed.repositoryId, control);
            },
            tokenCounter: meter(),
          },
          limits: {
            maxMessageBytes: 4000000,
            maxConcurrentCalls: process.argv[2]?.includes('hold') ? 1 : 4,
            maxItems: 1000000,
            maxDepth: 100,
            requestTimeoutMs: 10000,
          },
        },
        { input: process.stdin, output: process.stdout },
      );
      if (reads !== 0) throw Error('STARTUP_READ');
      await app.start();
      if (reads !== 0) throw Error('STARTUP_READ');
      process.stderr.write(
        managed ? 'OWNED_GROUP_NO_STARTUP_TOOL_QUERY\n' : 'OWNED_GROUP_NO_STARTUP_READ\n',
      );
      const result = await app.completion;
      f.close();
      process.stderr.write('OWNED_GROUP_' + result.cleanupState + '\n');
    },
  );
}
try {
  if (process.argv[2]?.startsWith('structure') || process.argv[2]?.startsWith('managed'))
    await withOwnedStructureFixture(
      {
        after(fn) {
          cleanup.push(fn);
        },
      },
      run,
    );
  else await run();
} finally {
  for (const fn of cleanup.reverse()) await fn();
}
