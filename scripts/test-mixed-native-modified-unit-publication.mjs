// Explicit local fixed fixture preparation/replay; no default CI dependency or Native CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  withFrozenStage,
  workflowRequest,
} from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
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
  readFrozenFrameworkInputsV2,
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
import { validateFrameworkSurfaceStreamWithBudget } from '../packages/providers/dist/native-framework-surface-stream.js';

const evidenceRoot = path.resolve('.superpowers/sdd/2026-11-05-modified-unit-library-positive');
const replayAttempt = 'strict-raw-v2';
const rawValidations = [];
const expected = JSON.parse(
  fs.readFileSync(path.join(evidenceRoot, 'manual-expectations.json'), 'utf8'),
);
const phase = process.argv[2];
assert.ok(['prepare', 'replay'].includes(phase), 'explicit prepare or replay phase required');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contracts = [
  {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  },
];
const routes = [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }];
const readRows = (db, table) =>
  db
    .prepare('SELECT * FROM ' + table + ' ORDER BY id')
    .all()
    .map((x) => ({ ...x }));
function makeRequest(preparation, p, repository, requestId, providerSnapshotId) {
  return constructor.prepareMixedFrameworkSurfaceRequest(
    {
      preparation,
      repository,
      requestId,
      providerVersion: p.providerVersion,
      providerSnapshotId,
      extractorVersion: p.extractorVersion,
      deadlineEpochMs: p.deadlineEpochMs,
      resourceBudget: p.resourceBudget,
      languages: p.languages,
    },
    new HistoryReadBudget(historyLimits),
  );
}
function assertMethod(trace, method) {
  const http = trace.candidate.facts.payload.contracts.filter(
    (c) => c.protocol === 'HTTP' && c.direction === 'PROVIDER',
  );
  assert.equal(http.length, 1);
  assert.equal(http[0].signature.method, method);
  assert.equal(
    '/' +
      http[0].signature.pathSegments
        .map((s) => {
          assert.equal(s.kind, 'LITERAL');
          return s.value;
        })
        .join('/'),
    expected.runtimePath,
  );
}
function libraryRecords(prefix) {
  const folder = path.join(evidenceRoot, 'library-output'),
    requestBytes = fs.readFileSync(path.join(folder, prefix + '.request.jsonl')),
    outputBytes = fs.readFileSync(path.join(folder, prefix + '.output.jsonl'));
  // Validate BOTH untouched library byte streams before any replay identity/checksum rewrite.
  const composition = {
    limits: {
      maxSerializedBytes: Number.MAX_SAFE_INTEGER,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: Number.MAX_SAFE_INTEGER,
    },
    budget: { serializedBytes: 0, items: 0 },
  };
  const validated = validateFrameworkSurfaceStreamWithBudget(
    requestBytes,
    outputBytes,
    composition,
  );
  assert.equal(validated.observation.request.protocolVersion, 8);
  assert.equal(validated.outputIdentity, hash(outputBytes));
  assert.ok(composition.budget.serializedBytes > 0 && composition.budget.items > 0);
  rawValidations.push({
    case: prefix,
    requestSha256: hash(requestBytes),
    outputSha256: validated.outputIdentity,
    budget: { ...composition.budget },
  });
  const events = outputBytes.toString().trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type, 'OBSERVATION_COMPLETED');
  assert.equal(events.at(-1).payload.syntaxOutcome, 'COMPLETE');
  assert.equal(events.at(-1).payload.codeOutcome, 'COMPLETE');
  assert.ok(
    events.some(
      (e) =>
        e.type === 'SYNTAX_OBSERVATION' &&
        e.payload.syntaxKind === 'DECORATION' &&
        e.payload.payload.callee.name === expected[prefix].decoration,
    ),
  );
  for (const e of events)
    if (e.payload.sourceFingerprint)
      assert.equal(e.payload.sourceFingerprint, 'sha256:' + expected[prefix].fileSha256);
  return { requestBytes, outputBytes, events };
}
test('fixed modified-unit library ' + phase, async (t) => {
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
      const p = request.payload,
        beforeBytes = makeRequest(
          baselinePreparation,
          p,
          p.repository,
          request.requestId,
          p.providerSnapshotId,
        );
      assert.deepEqual(JSON.parse(beforeBytes), request);
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
          routes,
        }).publish(workflowRequest(repositoryId, 'INDEX'));
      assert.equal(readMixedAnalysisSettlement(store).status, 'COMMITTED');
      assertMethod(runtime.traceRuntimeV2(historyLimits), expected.before.method);
      const oldOrigins = readRows(f.db, 'syntax_origins'),
        oldProjections = readRows(f.db, 'syntax_projections');
      stage.close();
      releaseActivationContext(f.db, capture.handle);
      const sourcePort = new RepositorySourceStateStore(f.db),
        old = sourcePort.load(repositoryId),
        file = old.files[0],
        target = path.join(p.repository.rootPath, file.path),
        afterBytes = fs.readFileSync(
          new URL('../packages/source/test/fixtures/current13-same-path-after.py', import.meta.url),
        );
      assert.equal(file.path, expected.sourcePath);
      assert.equal(hash(fs.readFileSync(target)), expected.before.fileSha256);
      assert.equal(hash(afterBytes), expected.after.fileSha256);
      fs.writeFileSync(target, afterBytes);
      const files = old.files.map((x) =>
          x.id === file.id ? { ...x, contentFingerprint: 'sha256:' + hash(afterBytes) } : x,
        ),
        contentFingerprint = fingerprintInventory(
          files.map((x) => ({
            ...x,
            sizeBytes: fs.statSync(path.join(p.repository.rootPath, x.path)).size,
          })),
        );
      sourcePort.replace(old, { revision: { ...old.revision, contentFingerprint }, files });
      assert.equal(runtime.traceRuntimeV2(historyLimits).status, 'AFFECTED');
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
            qualificationRef: 'LOCAL_LIBRARY_MODIFIED_UNIT_NOT_QUALIFICATION',
          }),
          preparation = readMixedCodeSyntaxPreparation(delta, owner.ownerHandle);
        assert.equal(preparation.units[0].id, baselinePreparation.units[0].id);
        assert.deepEqual(
          preparation.sourceFiles.map((x) => [x.id, x.path, x.contentFingerprint]),
          [[file.id, file.path, 'sha256:' + expected.after.fileSha256]],
        );
        assert.deepEqual(preparation.expectedActivationBasis, frozen.basis);
        const bytes = makeRequest(
            preparation,
            p,
            p.repository,
            'modified-library:post',
            'snapshot:modified-library:post',
          ),
          actual = JSON.parse(bytes);
        if (phase === 'prepare') {
          const input = {
            kind: 'FIXED_MODIFIED_UNIT_LIBRARY_INPUT',
            schemaVersion: 1,
            before: JSON.parse(beforeBytes),
            after: actual,
          };
          fs.writeFileSync(
            path.join(evidenceRoot, 'unit-input.json'),
            JSON.stringify(input, null, 2) + '\n',
            { flag: 'wx' },
          );
          t.diagnostic(
            'INPUTS_FROZEN_ONLY;original constructor;no writer/output/POST publication yet',
          );
          return;
        }
        libraryRecords('before');
        const recorded = libraryRecords('after'),
          recordedRequest = JSON.parse(recorded.requestBytes);
        assert.equal(
          recordedRequest.payload.sourceFiles[0].contentFingerprint,
          actual.payload.sourceFiles[0].contentFingerprint,
        );
        assert.equal(
          recordedRequest.payload.sourceFiles[0].path,
          actual.payload.sourceFiles[0].path,
        );
        const replacement = new Map([
          [recordedRequest.requestId, actual.requestId],
          [recordedRequest.payload.providerSnapshotId, actual.payload.providerSnapshotId],
          [
            recordedRequest.payload.targetSource.repositoryId,
            actual.payload.targetSource.repositoryId,
          ],
          [recordedRequest.payload.targetSource.revisionId, actual.payload.targetSource.revisionId],
          ...recordedRequest.payload.sourceFiles.map((x) => [
            x.id,
            actual.payload.sourceFiles.find((y) => y.path === x.path).id,
          ]),
        ]);
        const rebind = (v) =>
          typeof v === 'string'
            ? (replacement.get(v) ?? v)
            : Array.isArray(v)
              ? v.map(rebind)
              : v && typeof v === 'object'
                ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
                : v;
        const events = recorded.events.map(rebind);
        for (const e of events) {
          if (e.payload.sourceFingerprint)
            assert.equal(e.payload.sourceFingerprint, 'sha256:' + expected.after.fileSha256);
          if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(e.type))
            Object.assign(e.payload, {
              ownerBinding: actual.payload.ownerBinding,
              targetSource: actual.payload.targetSource,
              expectedActivationBasis: actual.payload.expectedActivationBasis,
            });
        }
        const raw = reseal(actual, events),
          metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
        Object.assign(metadata, {
          targetSource: preparation.targetSource,
          inventory: preparation.inventory,
          java: null,
        });
        Object.assign(metadata.snapshot, {
          id: actual.payload.providerSnapshotId,
          providerId: actual.payload.providerId,
          providerVersion: actual.payload.providerVersion,
        });
        metadata.codeSyntax.providerVersion = actual.payload.providerVersion;
        assert.deepEqual(raw.requestBytes, bytes);
        delta.acceptObservation(owner.ownerHandle, { metadata, ...raw });
        const result = delta.freeze(),
          view = readFrozenFrameworkInputsV2(delta, result.lease, historyLimits);
        assert.equal(view.sourceFiles[0].contentFingerprint, 'sha256:' + expected.after.fileSha256);
        const deltaStore = new MixedAnalysisStore(f.db),
          published = await composeFrozenFrameworkRuntimeV2({
            workspaceId: 'workspace:owned',
            repositoryId,
            stage: delta,
            lease: result.lease,
            store: deltaStore,
            expectedOldRuntime: baseline.runtimeActivationId,
            limits: historyLimits,
            routes,
          }).publish(workflowRequest(repositoryId, 'INDEX'));
        assert.equal(readMixedAnalysisSettlement(deltaStore).status, 'COMMITTED');
        const current = runtime.traceRuntimeV2(historyLimits);
        assert.equal(current.status, 'CURRENT');
        assert.equal(current.activationId, published.runtimeActivationId);
        assert.notEqual(current.activationId, baseline.runtimeActivationId);
        assertMethod(current, expected.after.method);
        const memberIds = f.db
          .prepare('SELECT origin_id FROM activation_syntax_members WHERE activation_id=?')
          .all(published.syntaxActivationId)
          .map((m) => m.origin_id);
        assert.ok(memberIds.length > 0);
        assert.ok(oldOrigins.every((x) => !memberIds.includes(x.id)));
        for (const [table, rows] of [
          ['syntax_origins', oldOrigins],
          ['syntax_projections', oldProjections],
        ])
          assert.ok(
            rows.every((oldRow) =>
              readRows(f.db, table).some((row) => JSON.stringify(row) === JSON.stringify(oldRow)),
            ),
          );
        const summary = {
          kind: 'MODIFIED_UNIT_LIBRARY_REPLAY_SUCCESS',
          attempt: replayAttempt,
          strictOriginalRawValidatedBeforeRebinding: rawValidations,
          beforeMethod: expected.before.method,
          afterMethod: expected.after.method,
          beforeFileSha256: expected.before.fileSha256,
          afterFileSha256: expected.after.fileSha256,
          oldOrigins: oldOrigins.length,
          newActiveOrigins: memberIds.length,
          oldChangedOriginsActive: 0,
          immutableOriginsAndProjectionsRetained: true,
          runtimeStatus: current.status,
          libraryRequestSha256: hash(recorded.requestBytes),
          libraryOutputSha256: hash(recorded.outputBytes),
          reboundRequestSha256: hash(raw.requestBytes),
          reboundOutputSha256: hash(raw.outputBytes),
          executionAuthorized: false,
          productionAdmission: false,
          measurementEligible: false,
        };
        fs.writeFileSync(
          path.join(evidenceRoot, replayAttempt + '-replay-summary.json'),
          JSON.stringify(summary, null, 2) + '\n',
          { flag: 'wx' },
        );
        fs.writeFileSync(
          path.join(evidenceRoot, replayAttempt + '-rebound-after.request.jsonl'),
          raw.requestBytes,
          {
            flag: 'wx',
          },
        );
        fs.writeFileSync(
          path.join(evidenceRoot, replayAttempt + '-rebound-after.output.jsonl'),
          raw.outputBytes,
          {
            flag: 'wx',
          },
        );
        t.diagnostic('RESULT=' + JSON.stringify(summary));
      } finally {
        delta.close();
        releaseActivationContext(f.db, next.handle);
      }
    },
    'P1',
  );
});
