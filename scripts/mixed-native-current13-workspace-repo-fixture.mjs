import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
// Private T4 test-only Source identity preparation and TEMP preview; no canonical publication.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { setup, cases } from '../packages/source/test/fixtures/mixed-source-git-double.mjs';
import { readSurfaceCapture } from '../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import {
  loadCompositionCase,
  reseal,
} from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
import { workflowRequest } from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
import { openRepositoryIndexSession } from '../packages/storage/dist/index.js';
import { prepareBudgetedMixedSourceOperation } from '../packages/runtime/dist/mixed-source-preparation.js';
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
import { createFrameworkSurfaceMixedAnalysisRules } from '../packages/runtime/dist/mixed-analysis.js';
import { prepareFrameworkRuntimeV2 } from '../packages/runtime/dist/framework-runtime-composition.js';
import construct from '../packages/runtime/dist/mixed-request-preparation.js';
import { executeNativeRequest } from '../packages/providers/dist/native-client.js';
import { projectSettledJavaOwner } from '../packages/providers/dist/native-composition-input.js';
import { validateFrameworkSurfaceStreamWithBudget } from '../packages/providers/dist/native-framework-surface-stream.js';
const originalSpawn = cp.spawn;
const repo = fileURLToPath(new URL('../', import.meta.url));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const composition = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { serializedBytes: 0, items: 0 },
});
const contracts = [
  {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  },
];
const mapValues = (v, m) =>
  typeof v === 'string'
    ? (m.get(v) ?? v)
    : Array.isArray(v)
      ? v.map((x) => mapValues(x, m))
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapValues(x, m)]))
        : v;
function memoryTransport(gitSpawn, chooseOutput) {
  const previous = cp.spawn;
  let failure;
  const spawn = (file, args, options) => {
    if (args[0] === '-C') return gitSpawn(file, args, options);
    assert.equal(file, process.execPath);
    assert.deepEqual(args, []);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter(),
      chunks = [];
    let closed = false;
    Object.assign(child, {
      pid: 12345,
      exitCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const close = (code = 0) => {
      if (closed) return;
      closed = true;
      child.exitCode = code;
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', code, null);
      child.emit('close', code, null);
    };
    child.kill = () => {
      queueMicrotask(() => close(9));
      return true;
    };
    child.stdin = new Writable({
      write(chunk, _enc, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
      final(done) {
        done();
        queueMicrotask(() => {
          try {
            const input = Buffer.concat(chunks),
              request = JSON.parse(input),
              raw = chooseOutput(request, input);
            assert.ok(Buffer.isBuffer(raw));
            child.stdout.end(raw);
            child.stderr.end();
            setImmediate(() => close());
          } catch (error) {
            failure = error;
            child.stdout.end();
            child.stderr.end();
            setImmediate(() => close(2));
          }
        });
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  cp.spawn = spawn;
  syncBuiltinESMExports();
  return {
    restore() {
      if (cp.spawn === spawn) cp.spawn = previous;
      syncBuiltinESMExports();
    },
    assertHealthy() {
      if (failure) throw failure;
    },
  };
}
async function withMemory(gitSpawn, choose, run) {
  const memory = memoryTransport(gitSpawn, choose);
  try {
    const result = await run();
    memory.assertHealthy();
    return result;
  } catch (error) {
    memory.assertHealthy();
    throw error;
  } finally {
    memory.restore();
  }
}

function replayJava(saved, current) {
  const original = JSON.parse(saved.code.request),
    mapping = new Map([
      [original.requestId, current.requestId],
      [original.payload.repository.id, current.payload.repository.id],
      [original.payload.revision.id, current.payload.revision.id],
      [original.payload.providerSnapshotId, current.payload.providerSnapshotId],
      ...original.payload.sourceFiles.map((s) => [
        s.id,
        current.payload.sourceFiles.find((n) => n.path === s.path).id,
      ]),
    ]);
  for (const file of current.payload.sourceFiles)
    assert.equal(
      file.contentFingerprint,
      original.payload.sourceFiles.find((s) => s.path === file.path).contentFingerprint,
    );
  const events = saved.code.output
    .toString()
    .trim()
    .split('\n')
    .map((line) => mapValues(JSON.parse(line), mapping));
  for (const event of events)
    if (['ANALYSIS_STARTED', 'ANALYSIS_COMPLETED'].includes(event.type))
      event.payload.revisionFingerprint = current.payload.revision.contentFingerprint;
  const digest =
    'sha256:' +
    hash(
      Buffer.from(
        events
          .slice(0, -1)
          .map((e) => JSON.stringify(e) + '\n')
          .join(''),
      ),
    );
  events.at(-1).payload.integrityChecksum = digest;
  events.at(-1).payload.contentFingerprint = digest;
  return Buffer.from(events.map((e) => JSON.stringify(e) + '\n').join(''));
}
async function preview(f, operation, saved, source) {
  const capture = captureRuntimeActivationContext(
    f.database,
    operation.repository.id,
    source.budget.remaining(),
  );
  const stage = new MixedAnalysisStage(
    f.database,
    capture.handle,
    'FULL',
    historyLimits,
    createFrameworkSurfaceMixedAnalysisRules(),
    source.budget,
  );
  try {
    const original = JSON.parse(saved.syntax.request),
      p = original.payload;
    const metadata = structuredClone(
      (await loadCompositionCase(saved.code ? 'java-only' : 'python-only')).metadata,
    );
    metadata.targetSource = {
      repositoryId: source.state.revision.repositoryId,
      revisionId: source.state.revision.id,
      contentFingerprint: source.state.revision.contentFingerprint,
    };
    metadata.inventory = source.state.files;
    metadata.snapshot = {
      ...metadata.snapshot,
      id: 'snapshot:' + randomUUID(),
      providerId: p.providerId,
      providerVersion: p.providerVersion,
      startedAt: new Date().toISOString(),
    };
    metadata.codeSyntax.providerVersion = p.providerVersion;
    let javaOwner = null;
    if (saved.code) {
      const prep = readMixedJavaPreparation(stage, contracts);
      const request = construct.prepareMixedJavaRequest(
        {
          preparation: prep,
          repository: operation.repository,
          revision: source.state.revision,
          providerSnapshotId: metadata.snapshot.id,
          requestId: randomUUID(),
          requestedCapabilities: JSON.parse(saved.code.request).payload.requestedCapabilities,
          deadlineEpochMs: Date.now() + 300000,
          resourceBudget: JSON.parse(saved.code.request).payload.resourceBudget,
        },
        source.budget,
      );
      assert.ok(request);
      const startedAt = new Date().toISOString();
      const actual = await withMemory(
        f.spawnDouble,
        () => replayJava(saved, request),
        () =>
          executeNativeRequest(request, {
            executablePath: process.execPath,
            timeoutMs: 1000,
            signal: f.controller.signal,
          }),
      );
      metadata.java = {
        ...metadata.java,
        request: actual.request,
        events: actual.events,
        terminal: actual.terminal,
        providerVersion: p.providerVersion,
        startedAt,
        settledAt: new Date().toISOString(),
      };
      javaOwner = projectSettledJavaOwner(metadata);
    } else metadata.java = null;
    metadata.codeSyntax.startedAt = metadata.java?.settledAt ?? metadata.snapshot.startedAt;
    const owner = stage.prepareOwner(javaOwner, {
        contracts,
        qualificationRef: 'T4_RECORDED_REPLAY_PURE_PREVIEW_NOT_PUBLICATION',
      }),
      prep = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
    const requestBytes = construct.prepareMixedFrameworkSurfaceRequest(
      {
        preparation: prep,
        repository: operation.repository,
        requestId: randomUUID(),
        providerVersion: p.providerVersion,
        providerSnapshotId: metadata.snapshot.id,
        extractorVersion: p.extractorVersion,
        deadlineEpochMs: Date.now() + 300000,
        resourceBudget: p.resourceBudget,
        languages: p.languages,
      },
      source.budget,
    );
    assert.ok(requestBytes);
    const request = JSON.parse(requestBytes);
    const mapping = new Map([
      [original.requestId, request.requestId],
      [p.targetSource.repositoryId, request.payload.targetSource.repositoryId],
      [p.targetSource.revisionId, request.payload.targetSource.revisionId],
      [p.providerSnapshotId, request.payload.providerSnapshotId],
      ...p.sourceFiles.map((s) => [
        s.id,
        request.payload.sourceFiles.find((n) => n.path === s.path).id,
      ]),
    ]);
    const events = saved.syntax.output
      .toString()
      .trim()
      .split('\n')
      .map((line) => mapValues(JSON.parse(line), mapping));
    for (const event of events) {
      if (event.payload.sourceFingerprint)
        assert.equal(event.payload.sourceFingerprint, p.sourceFiles[0].contentFingerprint);
      if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type))
        Object.assign(event.payload, {
          targetSource: request.payload.targetSource,
          expectedActivationBasis: request.payload.expectedActivationBasis,
          ownerBinding: request.payload.ownerBinding,
        });
    }
    metadata.codeSyntax.settledAt = new Date().toISOString();
    metadata.snapshot.completedAt = metadata.codeSyntax.settledAt;
    const raw = reseal(request, events);
    assert.deepEqual(raw.requestBytes, requestBytes);
    stage.acceptObservation(owner.ownerHandle, { metadata, ...raw });
    const frozen = stage.freeze(),
      view = readFrozenFrameworkInputsV2(stage, frozen.lease, historyLimits);
    assert.match(view.basis.codeActivationDigest, /^[a-f0-9]{64}$/);
    const candidate = await prepareFrameworkRuntimeV2(view, operation.routes, {
      ...workflowRequest(operation.repository.id, 'INDEX').control,
      maxItems: 100000,
      maxDepth: 64,
    });
    assert.equal(candidate.termination, 'COMPLETE');
    assert.equal(candidate.coverage.status, 'COMPLETE');
    const direction = saved.code ? 'CONSUMER' : 'PROVIDER',
      selected = candidate.facts.payload.contracts.filter(
        (c) => c.protocol === 'HTTP' && c.direction === direction,
      );
    return {
      contractFactKeys: selected.map((c) => c.factKey).sort(),
      basis: frozen.basis,
      ownerCount: prep.owners.length,
    };
  } finally {
    stage.close();
    releaseActivationContext(f.database, capture.handle);
  }
}
export async function prepareCurrent13WorkspaceRepo(t, caseId) {
  assert.ok(['J7', 'P5'].includes(caseId));
  const manual = JSON.parse(
    readHistoricalInputOrLocal(
      '.superpowers/sdd/2026-11-05-current13-workspace-entry/prepare-manual-expectations.json',
      'utf8',
      repo,
    ),
  );
  const expected = manual.sources.find((s) => s.case === caseId);
  assert.equal(
    hash(
      await fs.readFile(
        path.join(
          repo,
          'fixtures/phase1/syntax-contract/surface-closure/recorded-library-inputs.json.gz',
        ),
      ),
    ),
    'fbc9be6995c5995538c43e6352a0e533d9d49d0ce4ff4ed6d096eab813b714b6',
  );
  const saved = readSurfaceCapture(caseId),
    request = JSON.parse(saved.syntax.request),
    p = request.payload;
  assert.equal(hash(saved.syntax.request), expected.originalSyntaxRequestSha256);
  assert.equal(hash(saved.syntax.output), expected.originalSyntaxOutputSha256);
  const validated = validateFrameworkSurfaceStreamWithBudget(
    saved.syntax.request,
    saved.syntax.output,
    composition(),
  );
  assert.equal(validated.observation.outcome, 'SUCCEEDED');
  assert.equal(validated.observation.codeOutcome, saved.code ? 'NOT_APPLICABLE' : 'COMPLETE');
  assert.equal(validated.observation.syntaxOutcome, 'COMPLETE');
  const f = await setup(t),
    sourceRoot = await fs.realpath(f.root),
    repositoryId = p.targetSource.repositoryId;
  // Multiple repo fixtures may share one enclosing test; do not leave an earlier
  // fixture's process double installed after the last owned-root cleanup.
  t.after(() => {
    cp.spawn = originalSpawn;
    syncBuiltinESMExports();
  });
  const sourceBytes = await fs.readFile(path.join(repo, expected.path));
  assert.equal(hash(sourceBytes), expected.sourceSha256);
  const expectedSource = { path: p.sourceFiles[0].path, sha256: expected.sourceSha256 };
  await fs.mkdir(path.dirname(path.join(sourceRoot, expectedSource.path)), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, expectedSource.path), sourceBytes, { flag: 'wx' });
  const rawPins = {
    syntax: {
      requestSha256: hash(saved.syntax.request),
      outputSha256: hash(saved.syntax.output),
      strictBeforeRebind: true,
    },
  };
  if (saved.code) {
    const original = JSON.parse(saved.code.request);
    const validatedJava = await withMemory(
      f.spawnDouble,
      () => saved.code.output,
      () =>
        executeNativeRequest(original, {
          executablePath: process.execPath,
          timeoutMs: 1000,
          signal: f.controller.signal,
        }),
    );
    assert.equal(validatedJava.terminal.type, 'ANALYSIS_COMPLETED');
    rawPins.java = {
      requestSha256: hash(saved.code.request),
      outputSha256: hash(saved.code.output),
      strictBeforeRebind: true,
      events: validatedJava.events.length,
    };
  }
  const schemaPath =
    'contracts/' + (caseId === 'J7' ? 'caller-http.contract' : 'provider-http.contract');
  const policy = workflowRequest(repositoryId, 'INDEX').policy;
  policy.callerCapabilities.push('READ_SOURCE');
  policy.permissionContext.allowedOperations.push('READ_SOURCE');
  const metadata = (await loadCompositionCase(saved.code ? 'java-only' : 'python-only')).metadata;
  const operation = {
    kind: 'MIXED_NATIVE_CURRENT13_FULL_OPERATION',
    schemaVersion: 1,
    database: {
      databasePath: path.join(sourceRoot, 'probe.sqlite'),
      repositoryRoot: sourceRoot,
      repositoryId,
      initialize: true,
      readOnly: false,
    },
    repository: { id: repositoryId, rootPath: sourceRoot },
    sourceRequest: {
      ...f.request,
      repositoryId,
      config: {
        include: [expectedSource.path, schemaPath],
        exclude: [
          ...cases.sourcePaths.filter((x) => x !== expectedSource.path),
          'probe.sqlite',
          'probe.sqlite-*',
        ],
      },
    },
    policy,
    historyLimits,
    operationBudget: {
      maxInputBytes: Number.MAX_SAFE_INTEGER,
      maxOutputBytes: Number.MAX_SAFE_INTEGER,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: Number.MAX_SAFE_INTEGER,
      maxMemoryBytes: Number.MAX_SAFE_INTEGER,
      maxDurationMs: 300000,
    },
    sessionBudget: { maxMetadataRows: 100000, maxResultBytes: 64 * 1024 * 1024, timeoutMs: 300000 },
    native: {
      options: { executablePath: process.execPath, timeoutMs: 120000 },
      identity: {
        tool: metadata.tool,
        providerVersion: p.providerVersion,
        runtimeVersion: metadata.snapshot.runtimeVersion,
      },
      languages: p.languages,
      maxEvents: p.resourceBudget.maxEvents,
    },
    git: { executablePath: process.execPath, environment: {} },
    contracts,
    qualificationRef: 'T4_RECORDED_REPLAY_NOT_A6',
    routes: [
      {
        languageId: caseId === 'J7' ? 'java' : 'python',
        frameworkId: caseId === 'J7' ? 'spring' : 'fastapi',
        configuration: {},
      },
    ],
    runtimeControl: { maxItems: 100000, maxDepth: 64 },
  };
  const session = await openRepositoryIndexSession(operation.database, {
    async checkpoint() {},
    reserveText() {},
    chargeMetadataRow() {},
  });
  f.database = session.database;
  let source;
  try {
    const observe = async () => {
      source = await prepareBudgetedMixedSourceOperation({
        database: session.database,
        repository: operation.repository,
        request: operation.sourceRequest,
        policy,
        control: {
          ...f.control,
          maxInputBytes: Number.MAX_SAFE_INTEGER,
          deadlineEpochMs: Date.now() + 300000,
        },
        limits: historyLimits,
        operationBudget: operation.operationBudget,
      });
      assert.equal(source.effects.sourceCommit, 'COMMITTED');
      return structuredClone({ revision: source.state.revision, files: source.state.files });
    };
    const before = await observe(),
      first = await preview(f, operation, saved, source);
    source.account.invalidate();
    source = null;
    assert.equal(first.contractFactKeys.length, manual.schemaOracle.bindingCounts[caseId]);
    const templateBytes = await fs.readFile(
        path.join(repo, manual.schemaOracle[caseId === 'J7' ? 'caller' : 'provider']),
      ),
      template = JSON.parse(templateBytes);
    assert.equal(template.bindings.length, first.contractFactKeys.length);
    for (const { contractFactKey, ...meaning } of template.bindings)
      assert.deepEqual(meaning, manual.schemaOracle.exactLiteralSemantics);
    const doc = {
      ...template,
      bindings: template.bindings.map((b, i) => ({
        ...b,
        contractFactKey: first.contractFactKeys[i],
      })),
    };
    const contentUtf8 = JSON.stringify(doc, null, 2) + '\n',
      schemaDocument = {
        path: schemaPath,
        contentUtf8,
        sha256: hash(Buffer.from(contentUtf8)),
        contractFactKeys: first.contractFactKeys,
        oracleSha256: hash(templateBytes),
      };
    await fs.mkdir(path.dirname(path.join(sourceRoot, schemaPath)), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, schemaPath), contentUtf8, { flag: 'wx' });
    const withSchema = await observe(),
      second = await preview(f, operation, saved, source);
    assert.equal(withSchema.revision.id, before.revision.id);
    assert.equal(
      withSchema.files.find((s) => s.path === expectedSource.path).id,
      before.files.find((s) => s.path === expectedSource.path).id,
    );
    assert.notEqual(withSchema.revision.contentFingerprint, before.revision.contentFingerprint);
    assert.deepEqual(second.contractFactKeys, first.contractFactKeys);
    const flags = {
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
      moduleClosureAuthenticated: false,
      contextAuthenticated: false,
      liveTransportConnected: false,
    };
    const sourcePreparation = { before, withSchema, actualSourceOperations: 2 };
    const descriptor = {
      kind: 'CURRENT13_T4_SOURCE_IDENTITY_PREPARATION_ONLY',
      caseId,
      repositoryId,
      sourceRoot,
      databasePath: operation.database.databasePath,
      sourcePreparation,
      schemaDocument,
      expectedSource,
      preview: {
        beforeSchemaKeys: first.contractFactKeys,
        afterSchemaKeys: second.contractFactKeys,
        beforeBasis: first.basis,
        afterBasis: second.basis,
        ownerCount: first.ownerCount,
      },
      rawPins,
      flags,
      lifecycle:
        'Owned temp root removed by enclosing test cleanup. This descriptor is not live authority or a canonical activation.',
    };
    operation.database.initialize = false;
    return {
      ...descriptor,
      descriptor,
      operation,
      state: f.state,
      spawnDouble: f.spawnDouble,
      controller: f.controller,
      activateGitDouble() {
        cp.spawn = f.spawnDouble;
        syncBuiltinESMExports();
      },
    };
  } finally {
    source?.account.invalidate();
    session.close();
  }
}
