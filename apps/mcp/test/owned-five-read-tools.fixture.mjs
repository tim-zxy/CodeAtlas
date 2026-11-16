import { createOwnedPublishedReadBinding } from '../../../packages/runtime/dist/owned-published-read-binding.js';
import { OfflineKnowledgeSearchIndex } from '../../../packages/storage/dist/knowledge/offline-knowledge-search.js';
// Shared fixed-scope self-owned host. Business vector is explicitly synthetic, not quality proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acquireAndRunOwnedManagedMcpHost,
  OwnedMcpAcquisitionFailure,
} from '../dist/owned-managed-host.js';
import { createHash } from 'node:crypto';
import {
  setup,
  input as searchInput,
  meter,
} from '../../../packages/agent-api/test/helpers/knowledge-search-fixture.mjs';
import { limits as readLimits } from '../../../packages/storage/test/helpers/offline-publication-fixture.mjs';
import {
  createLocalPublishedReadMcpServer,
  createOwnedFiveReadToolsMcpServer,
  createOwnedExtendedReadToolsMcpServer,
  createOwnedStructureReadToolsMcpServer,
  createOwnedManagedReadToolsMcpServer,
  createOwnedDirectoryManagedReadToolsMcpServer,
} from '../dist/owned-business-stdio.js';
import { withCodeQueryDatabase } from '../../../packages/storage/test/helpers/code-query-fixture.mjs';
import { openRepositoryCodeQuery } from '../../../packages/storage/dist/index.js';
import {
  withOwnedStructureFixture,
  structureLimits,
} from '../../../packages/application/test/helpers/owned-structure-fixture.mjs';
import { withOwnedBusinessPublication } from '../../../packages/application/test/helpers/owned-business-publication-fixture.mjs';
const cleanup = [];
let ownedBusinessClosed = false;
async function run(runtimeSeed = null, ownedBusiness = null) {
  const beforeBusinessHistory = ownedBusiness ? JSON.stringify(ownedBusiness.history()) : null;
  let businessReads = 0;
  await withCodeQueryDatabase(
    {
      after(fn) {
        cleanup.push(fn);
      },
    },
    'current',
    async (seed) => {
      const f = await setup();
      const published = process.argv[2]?.includes('-published');
      const publishedIndex = published
        ? new OfflineKnowledgeSearchIndex(ownedBusiness.store, {
            kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
            check() {},
          })
        : null;
      if (publishedIndex) publishedIndex.rebuild(readLimits, ownedBusiness.control());
      const binding = published
        ? createOwnedPublishedReadBinding({
            store: ownedBusiness.store,
            scope: {
              workspaceId: ownedBusiness.workspaceId,
              repositoryIds: ownedBusiness.repositoryIds,
            },
            limits: ownedBusiness.limits,
            control: ownedBusiness.control(),
          })
        : null;
      const refs = published
        ? [ownedBusiness.knowledgeRef]
        : f.db
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
      if (ownedBusiness)
        process.stderr.write(
          'STORE_BUSINESS_SEED ' +
            JSON.stringify({
              knowledgeRef: ownedBusiness.knowledgeRef,
              startStepKey: ownedBusiness.startStepKey,
              runtimeFlowId: ownedBusiness.runtimeFlowId,
              expectedStepKeys: ownedBusiness.expectedStepKeys,
            }) +
            '\n',
        );
      let reads = 0;
      const authorize = (m) => {
        if (
          m.workspaceId !== 'w' ||
          JSON.stringify(m.repositoryIds) !==
            JSON.stringify(
              published
                ? ownedBusiness.repositoryIds
                : [
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
        repositoryIds: published
          ? ownedBusiness.repositoryIds
          : [
              ...new Set([
                'r',
                seed.repositoryId,
                ...(runtimeSeed ? [runtimeSeed.repositoryId] : []),
              ]),
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
      const actualObserver = process.argv[2]?.startsWith('managed-os');
      const eventActor = process.argv[2] === 'managed-os-event';
      let readEntered, releaseRead, reconciledEvent, actorError;
      const enteredRead = new Promise((r) => (readEntered = r)),
        allowRead = new Promise((r) => (releaseRead = r)),
        eventReconciled = new Promise((r) => (reconciledEvent = r));
      const actor = eventActor
        ? (async () => {
            await enteredRead;
            let timer;
            try {
              await writeFile(
                join(app.getOwnedDirectory(), 'owned-event.txt'),
                'owned test event\n',
              );
              await Promise.race([
                eventReconciled,
                new Promise(
                  (_, reject) =>
                    (timer = setTimeout(() => reject(Error('OWNED_EVENT_TIMEOUT')), 5000)),
                ),
              ]);
              process.stderr.write('OWNED_OS_EVENT_SEEN\n');
            } catch (e) {
              actorError = e;
            } finally {
              clearTimeout(timer);
              releaseRead();
            }
          })()
        : null;
      if (actor) void actor.catch(() => undefined);
      let emit,
        triggered = false,
        overflowDone;
      const overflowReconciled = new Promise((r) => (overflowDone = r));
      const lifecycle = {
        mode: process.argv[2] === 'managed-one-shot' ? 'ONE_SHOT' : 'MCP_STDIO',
        reconcile: async (reason, scope, c) => {
          authorize(scope);
          if (actualObserver && reason === 'POST_ATTACH') {
            if (!app.getOwnedDirectory()) throw Error('OWNED_OBSERVER_NOT_ATTACHED');
            process.stderr.write('OWNED_OS_OBSERVER_ATTACHED\n');
          }
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
          if (reason === 'CHANGE' || reason === 'OVERFLOW') reconciledEvent();
        },
        ...(process.argv[2] === 'managed-one-shot' || actualObserver
          ? {}
          : {
              watch: async (listener, scope, c) => {
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

      let bindingValid = true;
      let app;
      const openServer = (
        process.argv[2]?.includes('-published')
          ? (options, streams) => {
              const selected = Object.fromEntries(
                ['scope', 'business', 'search', 'projectContext', 'status', 'limits'].map((k) => [
                  k,
                  options[k],
                ]),
              );
              return createLocalPublishedReadMcpServer(
                selected,
                {
                  signal: binding.signal,
                  check(scope) {
                    binding.check(binding.handle, scope);
                    authorize(scope);
                    if (!bindingValid) throw Error('BINDING_CHANGED');
                  },
                },
                streams,
              );
            }
          : actualObserver
            ? (options, streams) => {
                for (const value of [
                  { ...options, directory: 'not-an-accepted-path' },
                  {
                    ...options,
                    lifecycle: {
                      ...options.lifecycle,
                      watch: async () => {
                        throw Error('INJECTED_WATCH');
                      },
                    },
                  },
                  { ...options, lifecycle: { ...options.lifecycle, mode: 'ONE_SHOT' } },
                ])
                  assert.throws(
                    () => createOwnedDirectoryManagedReadToolsMcpServer(value, streams),
                    /INVALID_OWNED_STDIO_OPTIONS/,
                  );
                process.stderr.write('OWNED_FACTORY_OVERRIDE_REFUSED\n');
                return createOwnedDirectoryManagedReadToolsMcpServer(options, streams);
              }
            : managed
              ? createOwnedManagedReadToolsMcpServer
              : runtimeSeed
                ? createOwnedStructureReadToolsMcpServer
                : extended
                  ? createOwnedExtendedReadToolsMcpServer
                  : createOwnedFiveReadToolsMcpServer
      ).bind(
        undefined,
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
                      if (eventActor && !triggered)
                        return {
                          ...source,
                          read: async () => {
                            const value = await source.read();
                            triggered = true;
                            readEntered();
                            await allowRead;
                            return value;
                          },
                        };
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
                    return (publishedIndex ?? f.index).searchPage(req, readLimits, c);
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
            authorize(m) {
              authorize(m);
              if (ownedBusiness && m.purpose !== 'trace_flow/BUSINESS') throw Error('PURPOSE');
              if (ownedBusiness && process.argv[2] === 'managed-store-business-deny')
                throw Error('OWNED_TEST_BUSINESS_DENIED');
            },
            knowledgeQuery: async (req, c) => {
              reads++;
              if (!ownedBusiness) return businessResult;
              businessReads++;
              if (req.workspaceId !== ownedBusiness.workspaceId) throw Error('SCOPE_MISMATCH');
              const value = await ownedBusiness.store.readPublishedKnowledge(
                req.selectedPublishedRevisionRefs,
                ownedBusiness.permissions,
                ownedBusiness.limits,
                c,
              );
              if (process.argv[2]?.endsWith('-published-invalidated')) bindingValid = false;
              if (process.argv[2]?.endsWith('-published-revoked')) binding.revoke();
              return value;
            },
            tokenCounter: meter(),
          },
          search: {
            limits: { maxResults: 20, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
            authorize,
            knowledgeQuery: async (req, c) => {
              reads++;
              return (publishedIndex ?? f.index).searchPage(req, readLimits, c);
            },
            tokenCounter: meter(),
          },
          projectContext: {
            selectedRefs: refs,
            limits: { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
            authorize,
            knowledgeQuery: async (selected, c) => {
              reads++;
              return (published ? ownedBusiness.store : f.store).readProjectContextProjection(
                selected,
                () => {
                  if (published) {
                    if (binding.signal.aborted) throw Error('BINDING_REVOKED');
                    authorize(hostScope);
                  }
                },
                readLimits,
                c,
              );
            },
            tokenCounter: meter(),
          },
          status: {
            selectedRefs: refs,
            limits: { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 1000 },
            authorize,
            knowledgeQuery: async (selected, c) => {
              reads++;
              return (published ? ownedBusiness.store : f.store).readKnowledgeStatusProjection(
                selected,
                () => {
                  if (published) {
                    if (binding.signal.aborted) throw Error('BINDING_REVOKED');
                    authorize(hostScope);
                  }
                },
                readLimits,
                c,
              );
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
            maxItems: process.argv[2] === 'managed-store-business-construction-fail' ? 0 : 1000000,
            maxDepth: 100,
            requestTimeoutMs: 10000,
          },
        },
        { input: process.stdin, output: process.stdout },
      );
      if (reads !== 0) throw Error('STARTUP_READ');
      const start = async () => {
        await app.start();
        if (reads !== 0) throw Error('STARTUP_READ');
        process.stderr.write(
          managed ? 'OWNED_GROUP_NO_STARTUP_TOOL_QUERY\n' : 'OWNED_GROUP_NO_STARTUP_READ\n',
        );
      };
      let result;
      if (ownedBusiness || actualObserver) {
        result = await acquireAndRunOwnedManagedMcpHost(
          async () => {
            try {
              app = openServer();
            } catch (error) {
              // This controlled zero-limit refusal occurs before lifecycle/SDK resource allocation.
              if (
                process.argv[2] === 'managed-store-business-construction-fail' &&
                error.message === 'INVALID_OWNED_STDIO_OPTIONS'
              )
                throw new OwnedMcpAcquisitionFailure('SETTLED');
              throw error;
            }
            if (reads !== 0) throw Error('STARTUP_READ');
            return { start, close: () => app.close(), completion: app.completion };
          },
          () => {
            binding?.revoke();
            publishedIndex?.close();
            f.close();
            if (f.db.isOpen) throw Error('OWNED_REGISTERED_STORE_STILL_OPEN');
            process.stderr.write('OWNED_REGISTERED_STORE_CLOSED\n');
            return { cleanupState: 'SETTLED' };
          },
          new AbortController().signal,
        );
        if (result.exitCode !== 0) {
          process.stderr.write('OWNED_EMBEDDING_HOST_FAILED\n');
          process.exitCode = result.exitCode;
          return;
        }
      } else {
        app = openServer();
        if (reads !== 0) throw Error('STARTUP_READ');
        await start();
        result = await app.completion;
      }
      if (triggered && actor) await actor;
      if (actorError) throw actorError;
      if (ownedBusiness) {
        if (JSON.stringify(ownedBusiness.history()) !== beforeBusinessHistory)
          throw Error('OWNED_BUSINESS_HISTORY_CHANGED');
        process.stderr.write('OWNED_BUSINESS_HISTORY_UNCHANGED\n');
        process.stderr.write('OWNED_BUSINESS_READS ' + businessReads + '\n');
      }
      if (!ownedBusiness && !actualObserver) f.close();
      process.stderr.write('OWNED_GROUP_' + result.cleanupState + '\n');
    },
  );
}
try {
  if (process.argv[2]?.startsWith('managed-store-business')) {
    await withOwnedBusinessPublication(
      {
        after(fn) {
          cleanup.push(fn);
        },
      },
      (owned) => run(owned.runtimeSeed, owned),
    );
    ownedBusinessClosed = !process.exitCode;
  } else if (process.argv[2]?.startsWith('structure') || process.argv[2]?.startsWith('managed'))
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
  if (ownedBusinessClosed) process.stderr.write('OWNED_BUSINESS_ALL_CLEANED\n');
}
