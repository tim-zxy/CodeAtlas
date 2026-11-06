// Component RECORDED_REPLAY: original Source bytes/fingerprints, no Native/Source acquisition claim.
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
  readMixedJavaPreparation,
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
const routes = [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }];
const contracts = [
  {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  },
];
const rows = (db, table) =>
  db
    .prepare('SELECT * FROM ' + table + ' ORDER BY id')
    .all()
    .map((x) => ({ ...x }));
async function publish(db, repositoryId, stage, frozen) {
  const runtime = new RuntimeFactStore(db, repositoryId),
    before = runtime.readRuntimeBasis(historyLimits),
    store = new MixedAnalysisStore(db);
  const outcome = await composeFrozenFrameworkRuntimeV2({
    workspaceId: 'workspace:owned',
    repositoryId,
    stage,
    lease: frozen.lease,
    store,
    expectedOldRuntime: before.runtimeActivationId,
    limits: historyLimits,
    routes,
  }).publish(workflowRequest(repositoryId, 'INDEX'));
  assert.equal(readMixedAnalysisSettlement(store).status, 'COMMITTED');
  return outcome;
}
function addOriginalP1(db, repositoryId, root) {
  const saved = readSurfaceCapture('P1'),
    q = JSON.parse(saved.syntax.request),
    source = q.payload.sourceFiles[0];
  const bytes = fs.readFileSync(new URL('../fixtures/phase1/' + source.path, import.meta.url));
  assert.equal(
    'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    source.contentFingerprint,
  );
  fs.mkdirSync(path.dirname(path.join(root, source.path)), { recursive: true });
  fs.writeFileSync(path.join(root, source.path), bytes);
  const store = new RepositorySourceStateStore(db),
    before = store.load(repositoryId),
    file = { ...source, repositoryId, revisionId: before.revision.id },
    files = [...before.files, file].sort((a, b) => a.path.localeCompare(b.path));
  const contentFingerprint = fingerprintInventory(
    files.map((f) => ({ ...f, sizeBytes: fs.statSync(path.join(root, f.path)).size })),
  );
  store.replace(before, { revision: { ...before.revision, contentFingerprint }, files });
  return { saved, q, original: source };
}
async function deltaObservation(stage, recorded, repositoryId, root) {
  const owner = stage.prepareOwner(null, {
      contracts,
      qualificationRef: 'RECORDED_REPLAY_COMPONENT_NOT_PHYSICAL',
    }),
    preparation = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle),
    p = recorded.q.payload;
  assert.equal(preparation.mode, 'DELTA');
  assert.deepEqual(
    preparation.sourceFiles.map((f) => f.path),
    [recorded.original.path],
  );
  assert.equal(preparation.sourceFiles[0].contentFingerprint, recorded.original.contentFingerprint);
  const requestBytes = constructor.prepareMixedFrameworkSurfaceRequest(
    {
      preparation,
      repository: { id: repositoryId, rootPath: root },
      requestId: recorded.q.requestId,
      providerVersion: p.providerVersion,
      providerSnapshotId: p.providerSnapshotId,
      extractorVersion: p.extractorVersion,
      deadlineEpochMs: p.deadlineEpochMs,
      resourceBudget: p.resourceBudget,
      languages: p.languages,
    },
    new HistoryReadBudget(historyLimits),
  );
  const request = JSON.parse(requestBytes),
    replacement = new Map([
      [p.targetSource.repositoryId, repositoryId],
      [p.targetSource.revisionId, preparation.targetSource.revisionId],
    ]);
  const rebind = (v) =>
    typeof v === 'string'
      ? (replacement.get(v) ?? v)
      : Array.isArray(v)
        ? v.map(rebind)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
          : v;
  const events = recorded.saved.syntax.output
    .toString()
    .trim()
    .split('\n')
    .map((x) => rebind(JSON.parse(x)));
  for (const event of events) {
    if (event.payload.sourceFingerprint)
      assert.equal(event.payload.sourceFingerprint, recorded.original.contentFingerprint);
    if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type))
      Object.assign(event.payload, {
        ownerBinding: request.payload.ownerBinding,
        targetSource: request.payload.targetSource,
        expectedActivationBasis: request.payload.expectedActivationBasis,
      });
  }
  const raw = reseal(request, events),
    metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
  Object.assign(metadata, {
    targetSource: preparation.targetSource,
    inventory: preparation.inventory,
    java: null,
  });
  Object.assign(metadata.snapshot, {
    id: p.providerSnapshotId,
    providerId: p.providerId,
    providerVersion: p.providerVersion,
  });
  metadata.codeSyntax.providerVersion = p.providerVersion;
  assert.deepEqual(raw.requestBytes, requestBytes);
  stage.acceptObservation(owner.ownerHandle, { metadata, ...raw });
  return stage.freeze();
}
test('current13 added original P1 DELTA retains P5 origin and publishes complete Code/Syntax4/Runtime atomically', async (t) => {
  t.diagnostic(
    'RECORDED_REPLAY_COMPONENT: additive file only, no changed-existing-file/Native producer/Source acquisition qualification',
  );
  await withFrozenStage(t, async ({ f, stage, capture, frozen, repositoryId, request }) => {
    await publish(f.db, repositoryId, stage, frozen);
    const oldOrigins = rows(f.db, 'syntax_origins'),
      oldProjections = rows(f.db, 'syntax_projections'),
      oldTrace = new RuntimeFactStore(f.db, repositoryId).traceRuntimeV2(historyLimits),
      oldNodes = rows(f.db, 'canonical_nodes');
    stage.close();
    releaseActivationContext(f.db, capture.handle);
    const root = request.payload.repository.rootPath,
      recorded = addOriginalP1(f.db, repositoryId, root),
      nextCapture = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
      delta = new MixedAnalysisStage(
        f.db,
        nextCapture.handle,
        'DELTA',
        historyLimits,
        createFrameworkSurfaceMixedAnalysisRules(),
      );
    try {
      const next = await deltaObservation(delta, recorded, repositoryId, root),
        view = readFrozenFrameworkInputsV2(delta, next.lease, historyLimits);
      assert.equal(view.sourceFiles.length, 2);
      assert.equal(
        view.sourceFiles.find((x) => x.path === recorded.original.path).contentFingerprint,
        recorded.original.contentFingerprint,
      );
      assert.ok(view.syntaxEvidence.length > oldOrigins.length);
      assert.ok(view.nodes.length > oldNodes.length);
      assert.deepEqual(rows(f.db, 'syntax_origins'), oldOrigins);
      assert.deepEqual(rows(f.db, 'syntax_projections'), oldProjections);
      assert.equal(
        new RuntimeFactStore(f.db, repositoryId).traceRuntimeV2(historyLimits).activationId,
        oldTrace.activationId,
      );
      const outcome = await publish(f.db, repositoryId, delta, next),
        actual = new RuntimeFactStore(f.db, repositoryId).traceRuntimeV2(historyLimits);
      assert.equal(actual.status, 'CURRENT');
      assert.equal(actual.activationId, outcome.runtimeActivationId);
      assert.notEqual(actual.activationId, oldTrace.activationId);
      assert.equal(actual.identity.syntaxActivationId, outcome.syntaxActivationId);
      assert.deepEqual(actual.identity.codeBasis, next.basis);
      assert.ok(
        oldOrigins.every((old) =>
          rows(f.db, 'syntax_origins').some((v) => JSON.stringify(v) === JSON.stringify(old)),
        ),
      );
      assert.ok(
        oldProjections.every((old) =>
          rows(f.db, 'syntax_projections').some((v) => JSON.stringify(v) === JSON.stringify(old)),
        ),
      );
      const members = f.db
        .prepare('SELECT origin_id FROM activation_syntax_members WHERE activation_id=?')
        .all(outcome.syntaxActivationId);
      assert.ok(oldOrigins.every((old) => members.some((m) => m.origin_id === old.id)));
    } finally {
      delta.close();
      releaseActivationContext(f.db, nextCapture.handle);
    }
  });
});
test('current13 DELTA without history refuses before an owner or publication exists', async (t) => {
  await withFrozenStage(t, async ({ f, stage, capture, repositoryId }) => {
    stage.close();
    releaseActivationContext(f.db, capture.handle);
    const next = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
      delta = new MixedAnalysisStage(
        f.db,
        next.handle,
        'DELTA',
        historyLimits,
        createFrameworkSurfaceMixedAnalysisRules(),
      );
    try {
      assert.throws(
        () => readMixedJavaPreparation(delta, contracts),
        (e) => e.code === 'FULL_ANALYSIS_REQUIRED',
      );
      assert.equal(
        new RuntimeFactStore(f.db, repositoryId).traceRuntimeV2(historyLimits).status,
        'NOT_AVAILABLE',
      );
    } finally {
      delta.close();
      releaseActivationContext(f.db, next.handle);
    }
  });
});

test('current13 DELTA refuses Source CAS drift after capture and retains last-good publication', async (t) => {
  await withFrozenStage(t, async ({ f, stage, capture, frozen, repositoryId, request }) => {
    await publish(f.db, repositoryId, stage, frozen);
    const runtime = new RuntimeFactStore(f.db, repositoryId),
      before = runtime.traceRuntimeV2(historyLimits),
      origins = rows(f.db, 'syntax_origins');
    stage.close();
    releaseActivationContext(f.db, capture.handle);
    const next = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
      delta = new MixedAnalysisStage(
        f.db,
        next.handle,
        'DELTA',
        historyLimits,
        createFrameworkSurfaceMixedAnalysisRules(),
      );
    try {
      addOriginalP1(f.db, repositoryId, request.payload.repository.rootPath);
      assert.throws(
        () => readMixedJavaPreparation(delta, contracts),
        (e) => ['SOURCE_CHANGED', 'HISTORY_CHANGED', 'STAGE_CHANGED'].includes(e.code),
      );
      assert.equal(runtime.traceRuntimeV2(historyLimits).activationId, before.activationId);
      assert.deepEqual(rows(f.db, 'syntax_origins'), origins);
    } finally {
      delta.close();
      releaseActivationContext(f.db, next.handle);
    }
  });
});

test('current13 deletion-only component removes P1 support and retains P5 with no Native observation', async (t) => {
  await withFrozenStage(t, async ({ f, stage, capture, frozen, repositoryId, request }) => {
    await publish(f.db, repositoryId, stage, frozen);
    stage.close();
    releaseActivationContext(f.db, capture.handle);
    const root = request.payload.repository.rootPath;
    const recorded = addOriginalP1(f.db, repositoryId, root);
    const addCapture = captureRuntimeActivationContext(f.db, repositoryId, historyLimits);
    const add = new MixedAnalysisStage(
      f.db,
      addCapture.handle,
      'DELTA',
      historyLimits,
      createFrameworkSurfaceMixedAnalysisRules(),
    );
    try {
      const added = await deltaObservation(add, recorded, repositoryId, root);
      await publish(f.db, repositoryId, add, added);
    } finally {
      add.close();
      releaseActivationContext(f.db, addCapture.handle);
    }
    const runtime = new RuntimeFactStore(f.db, repositoryId);
    const oldTrace = runtime.traceRuntimeV2(historyLimits);
    const origins = rows(f.db, 'syntax_origins');
    const projections = rows(f.db, 'syntax_projections');
    const state = new RepositorySourceStateStore(f.db);
    const old = state.load(repositoryId);
    const removed = old.files.find((v) => v.path === recorded.original.path);
    fs.unlinkSync(path.join(root, removed.path));
    const files = old.files.filter((v) => v.id !== removed.id);
    const contentFingerprint = fingerprintInventory(
      files.map((v) => ({ ...v, sizeBytes: fs.statSync(path.join(root, v.path)).size })),
    );
    state.replace(old, { revision: { ...old.revision, contentFingerprint }, files });
    const next = captureRuntimeActivationContext(f.db, repositoryId, historyLimits);
    const deletion = new MixedAnalysisStage(
      f.db,
      next.handle,
      'DELTA',
      historyLimits,
      createFrameworkSurfaceMixedAnalysisRules(),
    );
    try {
      const owner = deletion.prepareOwner(null, {
        contracts,
        qualificationRef: 'DELETION_COMPONENT_NO_NATIVE_OBSERVATION',
      });
      const prepared = readMixedCodeSyntaxPreparation(deletion, owner.ownerHandle);
      assert.deepEqual(prepared.units, []);
      assert.deepEqual(prepared.sourceFiles, []);
      assert.deepEqual(
        prepared.removedSourceFiles.map((v) => v.id),
        [removed.id],
      );
      deletion.acceptObservation(owner.ownerHandle, null);
      const sealed = deletion.freeze();
      const view = readFrozenFrameworkInputsV2(deletion, sealed.lease, historyLimits);
      assert.deepEqual(
        view.sourceFiles.map((v) => v.id),
        files.map((v) => v.id),
      );
      assert.ok(view.sourceFiles.every((v) => v.id !== removed.id));
      assert.deepEqual(rows(f.db, 'syntax_origins'), origins);
      assert.deepEqual(rows(f.db, 'syntax_projections'), projections);
      const outcome = await publish(f.db, repositoryId, deletion, sealed);
      const trace = runtime.traceRuntimeV2(historyLimits);
      assert.equal(trace.status, 'CURRENT');
      assert.equal(trace.activationId, outcome.runtimeActivationId);
      assert.notEqual(trace.activationId, oldTrace.activationId);
      assert.deepEqual(rows(f.db, 'syntax_origins'), origins);
      // Retained evidence receives projections for the new activation basis;
      // historical rows stay immutable rather than freezing the entire table.
      const afterProjections = rows(f.db, 'syntax_projections');
      assert.ok(
        projections.every((old) =>
          afterProjections.some((value) => JSON.stringify(value) === JSON.stringify(old)),
        ),
      );
      const current = runtime.readRuntimeBasis(historyLimits);
      const inputs = runtime.readFrameworkInputsV2(current.identity, historyLimits);
      assert.deepEqual(
        inputs.sourceFiles.map((v) => v.id),
        files.map((v) => v.id),
      );
      assert.ok(inputs.nodes.every((v) => v.sourceRange?.sourceFileId !== removed.id));
      assert.ok(inputs.nodes.every((v) => v.kind !== 'MODULE' || v.qualifiedName !== removed.path));
      assert.ok(inputs.syntaxEvidence.every((v) => v.sourceRange.sourceFileId !== removed.id));
      const members = f.db
        .prepare('SELECT origin_id FROM activation_syntax_members WHERE activation_id=?')
        .all(outcome.syntaxActivationId);
      const retainedOriginIds = origins
        .filter((v) => JSON.parse(v.origin_json).sourceFile.id !== removed.id)
        .map((v) => v.id)
        .sort();
      assert.ok(retainedOriginIds.length > 0 && retainedOriginIds.length < origins.length);
      assert.deepEqual(members.map((v) => v.origin_id).sort(), retainedOriginIds);
      t.diagnostic(
        'DELETION_STAGE_STORE_COMPONENT_ONLY; null observation; no request/producer or no-Native HOST plan created',
      );
    } finally {
      deletion.close();
      releaseActivationContext(f.db, next.handle);
    }
  });
});
