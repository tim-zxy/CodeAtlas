// Same-path modification refusal only; Source port component CAS, not Native/Source acquisition.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  withFrozenStage,
  workflowRequest,
} from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
import { readSurfaceCapture } from '../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import {
  loadCompositionCase,
  reseal,
} from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
import { RepositorySourceStateStore } from '../packages/storage/dist/index.js';
import { fingerprintInventory } from '../packages/source/dist/fingerprint.js';
import {
  captureRuntimeActivationContext,
  releaseActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedCodeSyntaxPreparation,
} from '../packages/storage/dist/analysis/mixed-analysis-stage.js';
import {
  MixedAnalysisStore,
  readMixedAnalysisSettlement,
} from '../packages/storage/dist/analysis/mixed-analysis-store.js';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { createFrameworkSurfaceMixedAnalysisRules } from '../packages/runtime/dist/mixed-analysis.js';
import { composeFrozenFrameworkRuntimeV2 } from '../packages/runtime/dist/framework-runtime-composition.js';
import constructor from '../packages/runtime/dist/mixed-request-preparation.js';
import { HistoryReadBudget } from '../packages/storage/dist/analysis/activation-history-format.js';
const contracts = [
  {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  },
];
const sha = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const tables = [
  'canonical_nodes',
  'canonical_edges',
  'evidence',
  'provider_fact_bindings',
  'fact_evidence',
  'syntax_origins',
  'syntax_projections',
  'activation_syntax_members',
  'activation_history',
  'active_history_pointer',
  'runtime_activations',
  'runtime_state',
  'runtime_domain_facts',
  'runtime_bindings',
  'runtime_support_membership',
  'execution_contexts',
  'execution_nodes',
  'execution_edges',
  'runtime_flows',
  'runtime_flow_steps',
];
const image = (db) =>
  Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare('SELECT * FROM ' + table)
        .all()
        .map((row) => ({ ...row }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]),
  );
for (const mode of ['missing-observation', 'stale-get-recording'])
  test('modified same Python unit refuses ' + mode + ' while preserving last-good', async (t) => {
    await withFrozenStage(
      t,
      async ({
        f,
        stage,
        capture,
        frozen,
        repositoryId,
        request,
        preparation: baselinePreparation,
      }) => {
        const store = new MixedAnalysisStore(f.db),
          runtime = new RuntimeFactStore(f.db, repositoryId),
          baseline = await composeFrozenFrameworkRuntimeV2({
            workspaceId: 'workspace:owned',
            repositoryId,
            stage,
            lease: frozen.lease,
            store,
            expectedOldRuntime: null,
            limits: historyLimits,
            routes: [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
          }).publish(workflowRequest(repositoryId, 'INDEX'));
        assert.equal(readMixedAnalysisSettlement(store).status, 'COMMITTED');
        assert.equal(runtime.traceRuntimeV2(historyLimits).status, 'CURRENT');
        const before = image(f.db);
        stage.close();
        releaseActivationContext(f.db, capture.handle);
        const sourcePort = new RepositorySourceStateStore(f.db),
          old = sourcePort.load(repositoryId),
          source = old.files[0],
          file = path.join(request.payload.repository.rootPath, source.path),
          afterBytes = fs.readFileSync(
            new URL(
              '../packages/source/test/fixtures/current13-same-path-after.py',
              import.meta.url,
            ),
          );
        assert.match(fs.readFileSync(file, 'utf8'), /@router\.get\("\/items"\)/);
        assert.match(afterBytes.toString(), /@router\.post\("\/items"\)/);
        const newFingerprint = sha(afterBytes);
        assert.notEqual(newFingerprint, source.contentFingerprint);
        fs.writeFileSync(file, afterBytes);
        const files = old.files.map((x) =>
            x.id === source.id ? { ...x, contentFingerprint: newFingerprint } : x,
          ),
          contentFingerprint = fingerprintInventory(
            files.map((x) => ({
              ...x,
              sizeBytes: fs.statSync(path.join(request.payload.repository.rootPath, x.path)).size,
            })),
          );
        sourcePort.replace(old, { revision: { ...old.revision, contentFingerprint }, files });
        const stale = runtime.traceRuntimeV2(historyLimits);
        assert.notEqual(stale.status, 'CURRENT');
        assert.equal(stale.activationId, baseline.runtimeActivationId);
        assert.deepEqual(image(f.db), before);
        const next = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
          delta = new MixedAnalysisStage(
            f.db,
            next.handle,
            'DELTA',
            historyLimits,
            createFrameworkSurfaceMixedAnalysisRules(),
          );
        try {
          const owner = delta.prepareOwner(null, {
              contracts,
              qualificationRef: 'MODIFIED_SOURCE_REJECTION_ONLY',
            }),
            preparation = readMixedCodeSyntaxPreparation(delta, owner.ownerHandle);
          assert.equal(preparation.mode, 'DELTA');
          assert.equal(preparation.units[0].id, baselinePreparation.units[0].id);
          assert.deepEqual(preparation.units[0].sourceFileIds, [source.id]);
          assert.deepEqual(
            preparation.sourceFiles.map((x) => [x.id, x.path, x.contentFingerprint]),
            [[source.id, source.path, newFingerprint]],
          );
          assert.deepEqual(preparation.expectedActivationBasis, frozen.basis);
          const original = readSurfaceCapture('P1'),
            oldRequest = JSON.parse(original.syntax.request),
            p = oldRequest.payload,
            snapshotId = 'snapshot:modified-readiness';
          const bytes = constructor.prepareMixedFrameworkSurfaceRequest(
              {
                preparation,
                repository: request.payload.repository,
                requestId: 'modified-unit:' + mode,
                providerVersion: p.providerVersion,
                providerSnapshotId: snapshotId,
                extractorVersion: p.extractorVersion,
                deadlineEpochMs: p.deadlineEpochMs,
                resourceBudget: p.resourceBudget,
                languages: p.languages,
              },
              new HistoryReadBudget(historyLimits),
            ),
            actual = JSON.parse(bytes);
          assert.deepEqual(actual.payload.expectedActivationBasis, frozen.basis);
          assert.equal(actual.payload.sourceFiles[0].contentFingerprint, newFingerprint);
          let rejectedCode;
          if (mode === 'stale-get-recording') {
            const identities = new Map([
              [p.providerSnapshotId, snapshotId],
              [oldRequest.requestId, actual.requestId],
            ]);
            const replace = (v) =>
              typeof v === 'string'
                ? (identities.get(v) ?? v)
                : Array.isArray(v)
                  ? v.map(replace)
                  : v && typeof v === 'object'
                    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x)]))
                    : v;
            const events = original.syntax.output
              .toString()
              .trim()
              .split('\n')
              .map((line) => replace(JSON.parse(line)));
            for (const event of events) {
              assert.equal(event.requestId, actual.requestId);
              if (event.payload.sourceFingerprint)
                assert.equal(event.payload.sourceFingerprint, source.contentFingerprint);
              if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type))
                Object.assign(event.payload, {
                  ownerBinding: actual.payload.ownerBinding,
                  targetSource: actual.payload.targetSource,
                  expectedActivationBasis: actual.payload.expectedActivationBasis,
                });
            }
            const metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
            Object.assign(metadata, {
              targetSource: preparation.targetSource,
              inventory: preparation.inventory,
              java: null,
            });
            Object.assign(metadata.snapshot, {
              id: snapshotId,
              providerId: p.providerId,
              providerVersion: p.providerVersion,
            });
            metadata.codeSyntax.providerVersion = p.providerVersion;
            const raw = reseal(actual, events);
            assert.deepEqual(raw.requestBytes, bytes);
            assert.throws(
              () => delta.acceptObservation(owner.ownerHandle, { metadata, ...raw }),
              (e) => {
                rejectedCode = e.code;
                return e.code === 'INVALID_CANDIDATE';
              },
            );
          }
          assert.throws(
            () => delta.freeze(),
            (e) => {
              rejectedCode ??= e.code;
              return (
                e.code === (mode === 'missing-observation' ? 'INVALID_STAGE' : 'STAGE_RELEASED')
              );
            },
          );
          assert.deepEqual(image(f.db), before);
          const final = runtime.traceRuntimeV2(historyLimits);
          assert.equal(final.activationId, baseline.runtimeActivationId);
          assert.notEqual(final.status, 'CURRENT');
          t.diagnostic(
            'READINESS=' +
              JSON.stringify({
                mode,
                runtimeStatus: final.status,
                rejectedCode,
                oldFingerprint: source.contentFingerprint,
                newFingerprint,
                sourceId: source.id,
                path: source.path,
              }),
          );
        } finally {
          delta.close();
          releaseActivationContext(f.db, next.handle);
        }
      },
      'P1',
    );
  });
