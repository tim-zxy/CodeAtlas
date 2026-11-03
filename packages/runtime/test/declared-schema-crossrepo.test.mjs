import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withFrozenStage, workflowRequest } from './helpers/framework-surface-stage.mjs';
import { historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { surfaceContext } from '../../plugins/test/fixtures/framework-surface-context.mjs';
import { compileFrameworkSurfaceCandidate } from '../../plugins/dist/framework-surface-compiler.js';
import { composeFrozenFrameworkRuntimeV2 } from '../dist/framework-runtime-composition.js';
import { composeMatchedWorkspaceRuntimeV2 } from '../dist/runtime-fact-composition.js';
import { MixedAnalysisStore } from '../../storage/dist/analysis/mixed-analysis-store.js';
import { RuntimeFactStore } from '../../storage/dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../../storage/dist/runtime/contract-store.js';
import { loadMigrationPlan, RepositorySourceStateStore } from '../../storage/dist/index.js';
import { applyMigrationPlan } from '../../storage/dist/migrations/runner.js';
import { canonicalRuntimeJson, workspaceRuntimeInputDigestV2 } from '../../ir/dist/index.js';
// Selectors refer to existing recorded Code contracts; expected schema semantics remain literal Source fixtures.
async function declaredSource(id, framework, direction) {
  const context = await surfaceContext(id),
    prior = compileFrameworkSurfaceCandidate(
      context,
      framework,
      'c'.repeat(64),
      10000,
    ).facts.payload.contracts.filter((c) => c.direction === direction);
  assert.equal(prior.length, id === 'J7' ? 2 : 1);
  const name = id === 'J7' ? 'caller-http.contract' : 'provider-http.contract',
    template = JSON.parse(
      fs.readFileSync(
        new URL('../../../fixtures/phase1/contract-matching/sources/' + name, import.meta.url),
        'utf8',
      ),
    );
  const contentUtf8 =
    JSON.stringify(
      {
        ...template,
        bindings: prior.map((c, i) => ({
          ...template.bindings[Math.min(i, template.bindings.length - 1)],
          contractFactKey: c.factKey,
        })),
      },
      null,
      2,
    ) + '\n';
  return { id: 'file:ab:declared:' + id, path: 'contracts/' + name, contentUtf8 };
}
function workspaceRequest(operation) {
  const r = workflowRequest(null, operation);
  r.workspaceId = 'workspace:owned';
  r.repositoryId = null;
  r.policy.permissionContext.repositoryIds = null;
  return r;
}
test('declared Source schemas publish real Java to Python HTTP workspace edges and preserve last-good on Source CAS', async (t) => {
  const javaDoc = await declaredSource('J7', 'spring', 'CONSUMER'),
    pyDoc = await declaredSource('P5', 'fastapi', 'PROVIDER');
  await withFrozenStage(
    t,
    async (py) => {
      await withFrozenStage(
        t,
        async (java) => {
          const snapshots = [];
          for (const [x, language, framework, doc] of [
            [py, 'python', 'fastapi', pyDoc],
            [java, 'java', 'spring', javaDoc],
          ]) {
            await composeFrozenFrameworkRuntimeV2({
              workspaceId: 'workspace:owned',
              repositoryId: x.repositoryId,
              stage: x.stage,
              lease: x.frozen.lease,
              store: new MixedAnalysisStore(x.f.db),
              expectedOldRuntime: null,
              limits: historyLimits,
              routes: [{ languageId: language, frameworkId: framework, configuration: {} }],
            }).publish(workflowRequest(x.repositoryId, 'INDEX'));
            const store = new RuntimeFactStore(x.f.db, x.repositoryId),
              c = store.readRuntimeBasis(historyLimits),
              trace = store.traceRuntimeV2(historyLimits),
              view = store.readFrameworkInputsV2(c.identity, historyLimits),
              sourceFile = view.sourceFiles.find((f) => f.id === doc.id);
            assert(sourceFile);
            const sourceSupport = {
              basis: c.identity.codeBasis,
              entity: { kind: 'SOURCE_FILE', id: sourceFile.id, revisionId: sourceFile.revisionId },
              valueDigest: createHash('sha256')
                .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(sourceFile))
                .digest('hex'),
            };
            snapshots.push({
              x,
              store,
              trace,
              doc,
              proof: { sourceFile, sourceSupport, contentUtf8: doc.contentUtf8 },
              binding: {
                repoBasis: c.identity.codeBasis,
                syntaxActivationId: c.identity.syntaxActivationId,
                syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
                runtimeActivationId: c.identity.runtimeActivationId,
                runtimeCandidateDigest: trace.identity.candidateDigest,
              },
            });
          }
          const [provider, caller] = snapshots,
            wb = {
              workspaceId: 'workspace:owned',
              revisionSetId: 'set:declared-source',
              workspaceActivationDigest: '0'.repeat(64),
            },
            ref = (s, kind, id) => ({
              scope: 'REPOSITORY',
              repositoryId: s.binding.repoBasis.repositoryId,
              entity: { kind, id, revisionId: s.binding.repoBasis.revisionId },
            }),
            serviceRef = {
              scope: 'WORKSPACE',
              workspaceId: wb.workspaceId,
              entity: { kind: 'SERVICE', id: 'service:inventory', revisionId: wb.revisionSetId },
            },
            support = provider.trace.candidate.facts.payload.supportInventory.filter(
              (s) => s.entity.kind === 'SOURCE_FILE',
            );
          const frozen = {
            workspaceBasis: wb,
            repositoryBindings: snapshots.map((s) => s.binding),
            catalog: {
              workspaceBasis: wb,
              services: [
                {
                  id: 'service:inventory',
                  factKey: 'service:inventory',
                  logicalServiceKey: 'inventory',
                  location: 'WORKSPACE',
                  repositoryRef: ref(
                    provider,
                    'REPOSITORY',
                    provider.binding.repoBasis.repositoryId,
                  ),
                  supportRefs: support,
                },
              ],
              entries: [
                {
                  id: 'identity:inventory',
                  factKey: 'identity:inventory',
                  serviceRef,
                  sourceBasis: provider.binding.repoBasis,
                  identityKind: 'LOGICAL_SERVICE',
                  namespace: 'service',
                  key: 'inventory',
                  supportRefs: support,
                },
              ],
              contractBindings: provider.trace.candidate.facts.payload.contracts.map((c) => ({
                contractRef: ref(provider, 'CONTRACT', c.id),
                serviceRef,
                supportRefs: c.supportRefs,
              })),
            },
            contractRefs: snapshots.flatMap((s) =>
              s.trace.candidate.facts.payload.contracts.map((contract) => ({
                ref: ref(s, 'CONTRACT', contract.id),
                contract,
              })),
            ),
            matchingPolicyVersion: 'declared-http-schema-v1',
            schemaDocuments: snapshots.map((s) => s.proof),
          };
          wb.workspaceActivationDigest = workspaceRuntimeInputDigestV2(frozen);
          const dbPath = path.join(py.f.directory, 'workspace-declared.sqlite'),
            db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
          py.f.connections.push(db);
          applyMigrationPlan(
            db,
            await loadMigrationPlan(
              new URL('../../storage/migrations/workspace/manifest.json', import.meta.url),
              'WORKSPACE',
            ),
          );
          db.prepare('INSERT INTO workspace(slot,id,root_path)VALUES(1,?,?)').run(
            wb.workspaceId,
            py.f.directory,
          );
          db.prepare(
            'INSERT INTO revision_sets(id,workspace_id,created_at,frozen)VALUES(?,?,0,0)',
          ).run(wb.revisionSetId, wb.workspaceId);
          for (const s of snapshots) {
            db.prepare(
              'INSERT INTO repositories(repository_id,workspace_id,root_path)VALUES(?,?,?)',
            ).run(
              s.binding.repoBasis.repositoryId,
              wb.workspaceId,
              s.x.f.db.prepare('SELECT root_path FROM repository').get().root_path,
            );
            db.prepare(
              'INSERT INTO revision_set_items(revision_set_id,repository_id,revision_id,revision_fingerprint)VALUES(?,?,?,?)',
            ).run(
              wb.revisionSetId,
              s.binding.repoBasis.repositoryId,
              s.binding.repoBasis.revisionId,
              s.binding.repoBasis.contentFingerprint,
            );
          }
          db.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run(wb.revisionSetId);
          const store = new ContractStore(
              db,
              wb.workspaceId,
              snapshots.map((s) => s.store),
            ),
            composition = composeMatchedWorkspaceRuntimeV2({
              workspaceId: wb.workspaceId,
              store,
              limits: historyLimits,
              frozen,
              maxInputBytes: historyLimits.maxSerializedBytes,
            });
          // An actual invocation still needs its boundary: retain its binding/site, remove all links for that boundary.
          const { deriveWorkspaceRuntimeV3 } = await import('../../application/dist/index.js');
          const { runtimeCandidateDigestV2 } = await import('../../ir/dist/index.js');
          const missing = store.readWorkspaceInputsV2(
            frozen,
            historyLimits,
            historyLimits.maxSerializedBytes,
          );
          const missingCaller = missing.graphs.find(
            (g) =>
              g.repositoryBinding.repoBasis.repositoryId === caller.binding.repoBasis.repositoryId,
          );
          const edge = missingCaller.candidate.facts.payload.edges.find(
            (e) => e.transitionKind === 'HTTP' && e.boundaryRef,
          );
          assert(edge);
          const boundaryId = edge.boundaryRef.entity.id;
          for (const linked of missingCaller.candidate.facts.payload.edges)
            if (linked.boundaryRef?.entity.id === boundaryId) linked.boundaryRef = null;
          missingCaller.repositoryBinding.runtimeCandidateDigest = runtimeCandidateDigestV2(
            missingCaller.candidate,
          );
          missing.frozen.repositoryBindings.find(
            (b) => b.repoBasis.repositoryId === caller.binding.repoBasis.repositoryId,
          ).runtimeCandidateDigest = missingCaller.repositoryBinding.runtimeCandidateDigest;
          missing.frozen.workspaceBasis.workspaceActivationDigest = workspaceRuntimeInputDigestV2(
            missing.frozen,
          );
          missing.frozen.catalog.workspaceBasis = structuredClone(missing.frozen.workspaceBasis);
          const rejected = deriveWorkspaceRuntimeV3(missing, {
            ...workspaceRequest('QUERY').control,
            maxInputBytes: historyLimits.maxSerializedBytes,
          });
          assert.equal(rejected.execution.payload.coverage.status, 'PARTIAL');
          assert(
            rejected.execution.payload.coverage.limitations.includes('WORKSPACE_BOUNDARY_UNPROVEN'),
          );
          const outcome = await composition.refresh(workspaceRequest('INDEX'));
          if (outcome.status !== 'COMMITTED') {
            const { deriveWorkspaceRuntimeV3 } = await import('../../application/dist/index.js');
            const diagnosed = deriveWorkspaceRuntimeV3(
              store.readWorkspaceInputsV2(frozen, historyLimits, historyLimits.maxSerializedBytes),
              {
                ...workspaceRequest('QUERY').control,
                maxInputBytes: historyLimits.maxSerializedBytes,
              },
            );
            t.diagnostic(
              JSON.stringify({
                outcome,
                coverage: diagnosed.execution.payload.coverage,
                matches: diagnosed.matches.map((m) => ({
                  consumer: m.payload.consumerRef.entity.id,
                  status: m.payload.status,
                  reasons: m.payload.reasons,
                })),
                httpEdges: diagnosed.execution.payload.edges.filter(
                  (e) => e.transitionKind === 'HTTP',
                ).length,
              }),
            );
          }
          assert.equal(outcome.status, 'COMMITTED');
          const actual = composition.trace(workspaceRequest('QUERY'));
          assert.equal(actual.status, 'CURRENT');
          assert.equal(actual.matches.length, 2);
          assert(actual.matches.every((m) => m.payload.status === 'MATCHED'));
          assert.equal(actual.execution.payload.coverage.status, 'COMPLETE');
          // The literal Source has one proxy invocation; its interface method is a declaration.
          assert.equal(
            actual.execution.payload.edges.filter((e) => e.transitionKind === 'HTTP').length,
            1,
          );
          assert.equal(actual.evidenceScope, 'EXPLICIT_DECLARED_HTTP_SCHEMA');
          assert(frozen.contractRefs.every((r) => r.contract.signature.querySchemaRef === null));
          const ro = new DatabaseSync(dbPath, {
            readOnly: true,
            enableForeignKeyConstraints: true,
          });
          try {
            assert.deepEqual(
              new ContractStore(
                ro,
                wb.workspaceId,
                snapshots.map((s) => s.store),
              ).traceWorkspaceRuntimeV2(historyLimits).matches,
              actual.matches,
            );
          } finally {
            ro.close();
          }
          const source = new RepositorySourceStateStore(py.f.db),
            old = source.load(py.repositoryId);
          const next = structuredClone(old);
          const changed = next.files.find((f) => f.id === pyDoc.id);
          fs.writeFileSync(
            path.join(
              py.f.db.prepare('SELECT root_path FROM repository').get().root_path,
              pyDoc.path,
            ),
            pyDoc.contentUtf8 + ' ',
          );
          changed.contentFingerprint =
            'sha256:' +
            createHash('sha256')
              .update(pyDoc.contentUtf8 + ' ')
              .digest('hex');
          const { fingerprintInventory } = await import('../../source/dist/fingerprint.js');
          const root = py.f.db.prepare('SELECT root_path FROM repository').get().root_path;
          next.revision.contentFingerprint = fingerprintInventory(
            next.files.map((f) => ({ ...f, sizeBytes: fs.statSync(path.join(root, f.path)).size })),
          );
          source.replace(old, next);
          assert.equal(store.traceWorkspaceRuntimeV2(historyLimits).status, 'AFFECTED');
          assert.throws(() =>
            store.readWorkspaceInputsV2(frozen, historyLimits, historyLimits.maxSerializedBytes),
          );
          assert.equal(
            db.prepare('SELECT activation_id FROM workspace_runtime_state').get().activation_id,
            outcome.activationId,
          );
          t.diagnostic(
            'RECORDED_REPLAY + ACTUAL_OWNED_SOURCE_DOCUMENT + OWNED_SQLITE; no Native acquisition or actual HTTP execution.',
          );
        },
        'J7',
        false,
        [javaDoc],
      );
    },
    'P5',
    false,
    [pyDoc],
  );
});
