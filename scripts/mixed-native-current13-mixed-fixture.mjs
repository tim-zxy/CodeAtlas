import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
// Fixed local mixed FULL fixture; no real child process, CLI, qualification or canonical SQL seed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildMixedNativeHostProductGraph } from './mixed-native-host-product-graph.mjs';
import { validateGitQualification } from '../packages/source/dist/git.js';
import { loadMixedNativeOwnerContext } from './mixed-native-owner-context.mjs';
import { createMixedNativeDynamicControlCodec } from './mixed-native-dynamic-control-codec.mjs';
import { validateFrameworkSurfaceStreamWithBudget } from '../packages/providers/dist/native-framework-surface-stream.js';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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
} from '../packages/storage/dist/analysis/mixed-analysis-stage.js';
import { createFrameworkSurfaceMixedAnalysisRules } from '../packages/runtime/dist/mixed-analysis.js';
import construct from '../packages/runtime/dist/mixed-request-preparation.js';
import { withMixedNativeTransportBudget } from '../packages/runtime/dist/mixed-native-transport-budget.js';
import nativeOwner, { executeNativeRequest } from '../packages/providers/dist/native-client.js';
import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));
export const mixedEvidenceRoot = path.join(
  repo,
  '.superpowers/sdd/2026-11-05-current13-mixed-entry',
);
const readMixedInput = (name, encoding) =>
  readHistoricalInputOrLocal(
    '.superpowers/sdd/2026-11-05-current13-mixed-entry/' + name,
    encoding,
    repo,
  );
const hash = (b) => createHash('sha256').update(b).digest('hex');
const contracts = [
  {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  },
];
const routes = [
  { languageId: 'java', frameworkId: 'spring', configuration: {} },
  { languageId: 'python', frameworkId: 'fastapi', configuration: {} },
];
const usage = (b) => ({
  rows: b.rows,
  serializedBytes: b.serializedBytes,
  items: b.items,
  retainedLogicalBytes: b.retainedLogicalBytes,
});
function mapValues(value, mapping) {
  return typeof value === 'string'
    ? (mapping.get(value) ?? value)
    : Array.isArray(value)
      ? value.map((x) => mapValues(x, mapping))
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapValues(v, mapping)]))
        : value;
}
function memoryTransport(gitSpawn, chooseOutput, closedEmptyOutput = false) {
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
            // Refusal case models a producer already closed normally before EOF decoding.
            if (closedEmptyOutput && raw.length === 0) close();
            else setImmediate(() => close());
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
async function fixedInputs(t) {
  const expected = JSON.parse(readMixedInput('manual-expectations.json', 'utf8')),
    { request: javaRequestBytes, output: javaOutputBytes } = readSurfaceCapture('J1').code;
  assert.equal(hash(javaRequestBytes), expected.javaOriginal.requestSha256);
  assert.equal(hash(javaOutputBytes), expected.javaOriginal.outputSha256);
  const javaOriginal = JSON.parse(javaRequestBytes),
    python = JSON.parse(readSurfaceCapture('P1').syntax.request),
    javaSurface = JSON.parse(readSurfaceCapture('J1').syntax.request);
  const f = await setup(t);
  for (const source of expected.sources) {
    const bytes = await fs.readFile(path.join(repo, 'fixtures/phase1', source.path));
    assert.equal(hash(bytes), source.fileSha256);
    await fs.mkdir(path.dirname(path.join(f.root, source.path)), { recursive: true });
    await fs.writeFile(path.join(f.root, source.path), bytes);
  }
  const originalValidated = await withMemory(
    f.spawnDouble,
    () => javaOutputBytes,
    () =>
      executeNativeRequest(javaOriginal, {
        executablePath: process.execPath,
        timeoutMs: 1000,
        signal: f.controller.signal,
      }),
  );
  assert.equal(originalValidated.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(originalValidated.terminal.payload.outcome, 'SUCCEEDED');
  assert.ok(
    originalValidated.terminal.payload.capabilities.every(
      (c) => c.support === 'SUPPORTED' && c.coverage === 'COMPLETE',
    ),
  );
  return {
    ...f,
    expected,
    javaOriginal,
    javaRequestBytes,
    javaOutputBytes,
    originalJavaValidation: {
      requestSha256: hash(javaRequestBytes),
      outputSha256: hash(javaOutputBytes),
      strictBeforeRebind: true,
      events: originalValidated.events.length,
    },
    javaSurface,
    python,
  };
}
function operationFor(f) {
  const policy = workflowRequest(f.javaOriginal.payload.repository.id, 'INDEX').policy;
  policy.callerCapabilities.push('READ_SOURCE');
  policy.permissionContext.allowedOperations.push('READ_SOURCE');
  const include = f.expected.sources.map((s) => s.path);
  return {
    kind: 'MIXED_NATIVE_CURRENT13_FULL_OPERATION',
    schemaVersion: 1,
    database: {
      databasePath: path.join(f.root, 'probe.sqlite'),
      repositoryRoot: f.root,
      repositoryId: policy.scope.repositoryId,
      initialize: true,
      readOnly: false,
    },
    repository: { id: policy.scope.repositoryId, rootPath: f.root },
    sourceRequest: {
      ...f.request,
      repositoryId: policy.scope.repositoryId,
      config: {
        include,
        exclude: [
          ...cases.sourcePaths.filter((p) => !include.includes(p)),
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
    git: { executablePath: process.execPath, environment: {} },
    contracts,
    qualificationRef: 'MIXED_LOCAL_LIBRARY_NOT_A6',
    routes,
    runtimeControl: { maxItems: 100000, maxDepth: 64 },
  };
}
function javaReplay(f, current) {
  const old = f.javaOriginal,
    originalFiles = old.payload.sourceFiles;
  assert.equal(current.protocolVersion, 2);
  assert.equal(current.payload.sourceFiles.length, 1);
  for (const source of current.payload.sourceFiles) {
    const original = originalFiles.find((x) => x.path === source.path);
    assert.ok(original);
    assert.equal(source.contentFingerprint, original.contentFingerprint);
  }
  const mapping = new Map([
    [old.requestId, current.requestId],
    [old.payload.repository.id, current.payload.repository.id],
    [old.payload.revision.id, current.payload.revision.id],
    [old.payload.providerSnapshotId, current.payload.providerSnapshotId],
    ...originalFiles.map((p) => [
      p.id,
      current.payload.sourceFiles.find((n) => n.path === p.path).id,
    ]),
  ]);
  const events = f.javaOutputBytes
    .toString()
    .trim()
    .split('\n')
    .map((line) => mapValues(JSON.parse(line), mapping));
  for (const event of events)
    if (['ANALYSIS_STARTED', 'ANALYSIS_COMPLETED'].includes(event.type))
      event.payload.revisionFingerprint = current.payload.revision.contentFingerprint;
  const integrity =
    'sha256:' +
    hash(
      Buffer.from(
        events
          .slice(0, -1)
          .map((e) => JSON.stringify(e) + '\n')
          .join(''),
      ),
    );
  Object.assign(events.at(-1).payload, {
    integrityChecksum: integrity,
    contentFingerprint: integrity,
  });
  return Buffer.from(events.map((e) => JSON.stringify(e) + '\n').join(''));
}
export async function prepareCurrent13MixedLibraryInput(t) {
  const f = await fixedInputs(t),
    operation = operationFor(f),
    identity = (await loadCompositionCase('java-only')).metadata;
  const session = await openRepositoryIndexSession(operation.database, {
    async checkpoint() {},
    reserveText() {},
    chargeMetadataRow() {},
  });
  let source, capture, stage, owner;
  try {
    source = await prepareBudgetedMixedSourceOperation({
      database: session.database,
      repository: operation.repository,
      request: operation.sourceRequest,
      policy: operation.policy,
      control: {
        ...f.control,
        maxInputBytes: Number.MAX_SAFE_INTEGER,
        deadlineEpochMs: Date.now() + 300000,
      },
      limits: historyLimits,
      operationBudget: operation.operationBudget,
    });
    assert.equal(source.effects.sourceCommit, 'COMMITTED');
    assert.equal(source.state.files.length, 2);
    capture = captureRuntimeActivationContext(
      session.database,
      operation.repository.id,
      source.budget.remaining(),
    );
    stage = new MixedAnalysisStage(
      session.database,
      capture.handle,
      'FULL',
      historyLimits,
      createFrameworkSurfaceMixedAnalysisRules(),
      source.budget,
    );
    const snapshot = {
        id: 'snapshot:mixed-library',
        providerId: 'native',
        providerVersion: f.javaSurface.payload.providerVersion,
        runtimeVersion: identity.snapshot.runtimeVersion,
        startedAt: new Date().toISOString(),
      },
      javaPreparation = readMixedJavaPreparation(stage, contracts);
    const javaRequest = construct.prepareMixedJavaRequest(
      {
        preparation: javaPreparation,
        repository: operation.repository,
        revision: source.state.revision,
        providerSnapshotId: snapshot.id,
        requestId: 'mixed-library:java',
        requestedCapabilities: f.javaOriginal.payload.requestedCapabilities,
        deadlineEpochMs: Date.now() + 300000,
        resourceBudget: {
          maxDurationMs: 300000,
          maxMemoryBytes: operation.operationBudget.maxMemoryBytes,
          maxEvents: 10000,
        },
      },
      source.budget,
    );
    const dynamic = await dynamicOwnerFixture(t, operation.repository.id);
    dynamic.request.slots[0] = { ...dynamic.request.slots[0], launchId: 'java', role: 'V2' };
    owner = await dynamic.bind();
    owner.bindAnalysis(
      session.database,
      capture.handle,
      historyLimits,
      workflowRequest(operation.repository.id, 'INDEX'),
    );
    const beforeJava = usage(source.budget),
      startedAt = new Date().toISOString(),
      actual = await withMemory(
        f.spawnDouble,
        (current) => javaReplay(f, current),
        () =>
          withMixedNativeTransportBudget(source.budget, (ledger) =>
            nativeOwner.executeOwnedJavaRequest(
              javaRequest,
              { executablePath: process.execPath, timeoutMs: 120000, signal: f.controller.signal },
              owner.take('V2'),
              ledger,
            ),
          ),
      ),
      settledAt = new Date().toISOString(),
      afterJava = usage(source.budget);
    assert.ok(afterJava.serializedBytes > beforeJava.serializedBytes);
    assert.ok(afterJava.items > beforeJava.items);
    assert.ok(afterJava.retainedLogicalBytes > beforeJava.retainedLogicalBytes);
    const java = {
      tool: identity.tool,
      providerVersion: snapshot.providerVersion,
      runtimeVersion: snapshot.runtimeVersion,
      startedAt,
      settledAt,
      request: actual.request,
      events: actual.events,
      terminal: actual.terminal,
    };
    const stageOwner = stage.prepareOwner(
        {
          kind: 'SETTLED_JAVA_OWNER',
          schemaVersion: 1,
          targetSource: javaPreparation.targetSource,
          inventory: source.state.files,
          snapshot,
          tool: identity.tool,
          java,
        },
        { contracts, qualificationRef: operation.qualificationRef },
      ),
      preparation = readMixedCodeSyntaxPreparation(stage, stageOwner.ownerHandle),
      afterStage = usage(source.budget);
    assert.equal(preparation.sourceFiles.length, 2);
    assert.ok(preparation.owners.length > 0);
    assert.ok(
      preparation.owners.every(
        (o) =>
          preparation.sourceFiles.find((s) => s.id === o.sourceFileId)?.languageHint === 'java',
      ),
    );
    const requestBytes = construct.prepareMixedFrameworkSurfaceRequest(
        {
          preparation,
          repository: operation.repository,
          requestId: 'mixed-library:surface',
          providerVersion: snapshot.providerVersion,
          providerSnapshotId: snapshot.id,
          extractorVersion: 'syntax-v2',
          deadlineEpochMs: null,
          resourceBudget: f.expected.resourceBudget,
          languages: [...f.javaSurface.payload.languages, ...f.python.payload.languages],
        },
        source.budget,
      ),
      request = JSON.parse(requestBytes);
    assert.equal(request.payload.expectedActivationBasis, null);
    assert.equal(request.payload.providerSnapshotId, actual.request.payload.providerSnapshotId);
    assert.deepEqual(request.payload.resourceBudget, f.expected.resourceBudget);
    const frozen = { kind: 'FIXED_CURRENT13_MIXED_LIBRARY_INPUT', schemaVersion: 1, request };
    await fs.mkdir(mixedEvidenceRoot, { recursive: true });
    await fs.writeFile(
      path.join(mixedEvidenceRoot, 'unit-input.json'),
      JSON.stringify(frozen, null, 2) + '\n',
      { flag: 'wx' },
    );
    const summary = {
      kind: 'MIXED_PREPARE_REAL_SOURCE_JAVA_OWNER_MAP',
      originalJavaValidation: f.originalJavaValidation,
      sourceFiles: source.state.files.map((s) => ({
        id: s.id,
        path: s.path,
        contentFingerprint: s.contentFingerprint,
      })),
      aggregateSource: preparation.targetSource,
      javaRequestSourceFiles: actual.request.payload.sourceFiles.map((s) => ({
        id: s.id,
        path: s.path,
        contentFingerprint: s.contentFingerprint,
      })),
      javaSnapshot: actual.request.payload.providerSnapshotId,
      surfaceSnapshot: request.payload.providerSnapshotId,
      owners: preparation.owners,
      ownerMapDigest: request.payload.ownerBinding.ownerMapDigest,
      stageDigest: request.payload.ownerBinding.stageDigest,
      sharedSourceHistory: {
        beforeJava,
        afterJava,
        afterStage,
        afterSurfaceRequest: usage(source.budget),
      },
      dynamicRoles: dynamic.messages.filter((m) => m.type === 'REGISTER').map((m) => m.role),
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
    };
    await fs.writeFile(
      path.join(mixedEvidenceRoot, 'prepare-summary.json'),
      JSON.stringify(summary, null, 2) + '\n',
      { flag: 'wx' },
    );
    return summary;
  } finally {
    try {
      owner?.dispose();
      stage?.close();
      if (capture) releaseActivationContext(session.database, capture.handle);
    } finally {
      source?.account.invalidate();
      session.close();
    }
  }
}

export async function createCurrent13MixedEntryFixture(t, refuseSurface = false) {
  const f = await fixedInputs(t),
    operation = operationFor(f),
    policy = operation.policy,
    repositoryId = operation.repository.id;
  const rawPins = JSON.parse(readMixedInput('mixed-raw-pins.json', 'utf8')),
    mixedRequestBytes = readMixedInput(rawPins.request.path),
    mixedOutputBytes = readMixedInput(rawPins.output.path);
  assert.equal(hash(mixedRequestBytes), rawPins.request.sha256);
  assert.equal(hash(mixedOutputBytes), rawPins.output.sha256);
  const composition = {
      limits: {
        maxSerializedBytes: Number.MAX_SAFE_INTEGER,
        maxItems: Number.MAX_SAFE_INTEGER,
        maxDepth: Number.MAX_SAFE_INTEGER,
      },
      budget: { serializedBytes: 0, items: 0 },
    },
    validated = validateFrameworkSurfaceStreamWithBudget(
      mixedRequestBytes,
      mixedOutputBytes,
      composition,
    );
  assert.equal(validated.outputIdentity, rawPins.output.sha256);
  assert.equal(validated.observation.outcome, 'SUCCEEDED');
  assert.equal(validated.observation.syntaxOutcome, 'COMPLETE');
  assert.equal(validated.observation.codeOutcome, 'COMPLETE');
  const originalCombined = JSON.parse(mixedRequestBytes),
    originalEvents = mixedOutputBytes.toString().trim().split('\n').map(JSON.parse);
  assert.equal(originalCombined.payload.sourceFiles.length, 2);
  assert.equal(originalCombined.payload.owners.length, 10);
  for (const source of originalCombined.payload.sourceFiles)
    assert.equal(
      source.contentFingerprint,
      'sha256:' + f.expected.sources.find((x) => x.path === source.path).fileSha256,
    );
  const identity = (await loadCompositionCase('java-only')).metadata;
  operation.native = {
    options: { executablePath: process.execPath, timeoutMs: 120000 },
    identity: {
      tool: identity.tool,
      providerVersion: f.javaSurface.payload.providerVersion,
      runtimeVersion: identity.snapshot.runtimeVersion,
    },
    languages: [...f.javaSurface.payload.languages, ...f.python.payload.languages],
    maxEvents: 10000,
  };
  const outer = await fs.mkdtemp(path.join(tmpdir(), 'codeatlas-current13-product-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(outer)), path.resolve(tmpdir()));
    assert.ok(path.basename(outer).startsWith('codeatlas-current13-product-'));
    await fs.rm(outer, { recursive: true, force: true });
  });
  const root = path.join(outer, 'bundle'),
    migrationDir = path.join(repo, 'packages/storage/migrations/repository'),
    migration = JSON.parse(await fs.readFile(path.join(migrationDir, 'manifest.json'), 'utf8'));
  const graph = await buildMixedNativeHostProductGraph({
    entryPath: path.join(repo, 'scripts/mixed-native-current13-operation.mjs'),
    // Explicit package roots shorten copied paths without changing verified bytes,
    // edges or Storage's relative data layout. No extra trusted input root.
    authorizedRoots: [
      path.join(repo, 'scripts'),
      ...['application', 'storage', 'providers', 'runtime', 'ir', 'plugins', 'domain']
        .map((name) => path.join(repo, 'packages', name))
        .filter((p) => existsSync(p)),
      path.join(repo, 'node_modules/.pnpm/zod@4.6.1/node_modules/zod'),
      repo,
    ],
    dataPaths: [
      path.join(migrationDir, 'manifest.json'),
      ...migration.migrations.map((m) => path.join(migrationDir, m.file)),
    ],
    outputRoot: root,
    caps: {
      maxFiles: 1024,
      maxFileBytes: 4 * 1024 * 1024,
      maxTotalBytes: 32 * 1024 * 1024,
      maxEdges: 4096,
      maxPlanBytes: 2 * 1024 * 1024,
    },
    deadlineEpochMs: Date.now() + 300000,
  });
  const artifactLimits = {
      maxManifestBytes: 2 * 1024 * 1024,
      maxArtifactBytes: 4 * 1024 * 1024,
      maxTotalBytes: 64 * 1024 * 1024,
      maxFiles: 1024,
    },
    deadlineEpochMs = Date.now() + 300000;

  const git = validateGitQualification({
      ...operation.git,
      createLifecycle() {
        throw Error('shape only');
      },
    }),
    nativeCommand = {
      executablePath: process.execPath,
      arguments: [],
      environment: nativeOwner.buildOwnedNativeEnvironment(
        {},
        process.platform === 'win32' ? Object.keys(process.env) : [],
      ),
      cwd: process.cwd(),
    };
  const args = [
    ['rev-parse', '--show-toplevel'],
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
    ['check-ignore', '--no-index', '-z', '--stdin'],
    ['check-ignore', '--no-index', '-z', '--stdin'],
    ['rev-parse', '--show-toplevel'],
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
  ];
  const slots = (phase, prefix) =>
    args.map((arg, i) => ({
      launchId: prefix + i,
      role: 'GIT',
      phase,
      command: {
        executablePath: process.execPath,
        arguments: ['-C', f.root, ...arg],
        environment: git.environment,
        cwd: process.cwd(),
      },
    }));
  const descriptor = {
    kind: 'MIXED_NATIVE_HOST_BOOTSTRAP_DESCRIPTOR',
    schemaVersion: 1,
    artifactLimits,
    deadlineEpochMs,
    hostEntryArtifactId: graph.hostEntryArtifactId,
    hostModuleArtifactIds: graph.hostModuleArtifactIds,
    workspaceId: policy.scope.workspaceId,
    repositoryId,
    slots: [
      ...slots('SOURCE', 'initial'),
      { launchId: 'java', role: 'V2', phase: 'ANALYSIS', command: nativeCommand },
      { launchId: 'surface', role: 'SURFACE_V8', phase: 'ANALYSIS', command: nativeCommand },
      ...slots('ANALYSIS', 'final'),
    ],
    controlLimits: { maxFrameBytes: 4096, maxTotalBytes: 1024 * 1024, maxFrames: 1000 },
    edges: graph.edges,
  };
  const artifacts = [...graph.artifacts],
    bindings = {};
  for (const id of [
    'owner',
    'host',
    'observer',
    'git',
    'native',
    'oracle',
    'repository',
    'workspace',
    'source',
  ]) {
    const bytes = Buffer.from('SYNTHETIC_INDEPENDENT_' + id + '\n'),
      file = 'marker-' + id + '.txt';
    await fs.writeFile(path.join(root, file), bytes);
    artifacts.push({
      id: 'marker-' + id,
      path: file,
      sizeBytes: bytes.length,
      sha256: hash(bytes),
    });
    bindings[id] = 'marker-' + id;
  }
  for (const [id, data] of [
    ['operation', operation],
    ['bootstrap', descriptor],
  ]) {
    const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n'),
      file = id + '.json';
    await fs.writeFile(path.join(root, file), bytes);
    artifacts.push({ id, path: file, sizeBytes: bytes.length, sha256: hash(bytes) });
  }
  const manifest = {
      kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
      schemaVersion: 1,
      status: 'PROPOSED',
      artifacts,
      bindings,
      liveContext: null,
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
    },
    manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'context.json'), manifestBytes);
  const sha = hash(manifestBytes),
    context = await loadMixedNativeOwnerContext(root, 'context.json', sha, artifactLimits),
    incoming = new PassThrough(),
    outgoing = new PassThrough({ highWaterMark: 1 }),
    peer = createMixedNativeDynamicControlCodec(context.contextSha256, descriptor.controlLimits),
    messages = [],
    replies = [];
  let active;
  outgoing.on('data', (chunk) => {
    for (const m of peer.push(chunk)) {
      messages.push(m);
      const send = (x) => {
        replies.push(x);
        return incoming.write(peer.encode(x));
      };
      if (m.type === 'REGISTER') {
        active = m;
        send({
          type: 'BOUND',
          launchId: m.launchId,
          role: m.role,
          phase: m.phase,
          contextDigest: m.contextDigest,
          commandSha256: m.commandSha256,
        });
      }
      if (m.type === 'INTENT') send({ ...m, type: 'READY' });
      if (m.type === 'SPAWNED')
        send({
          type: 'ACQUIRED',
          launchId: m.launchId,
          role: active.role,
          pid: m.pid,
          imageSha256: artifacts.find(
            (a) => a.id === bindings[active.role === 'GIT' ? 'git' : 'native'],
          ).sha256,
          creationIdentity: 'memory-' + m.launchId,
          parentOwned: true,
        });
      if (m.type === 'CLOSED')
        send({
          type: 'RELEASED',
          launchId: m.launchId,
          pid: m.pid,
          imageSha256: artifacts.find(
            (a) => a.id === bindings[active.role === 'GIT' ? 'git' : 'native'],
          ).sha256,
          creationIdentity: m.creationIdentity,
          osExited: true,
          handleReleased: true,
          unknownDescendants: false,
          cleanupComplete: true,
          queryStatus: 'RECORDED',
          peakWorkingSetBytes: 1,
        });
      if (m.type === 'ABANDON')
        send({
          type: 'ABANDONED',
          launchId: m.launchId,
          unknownDescendants: false,
          cleanupComplete: true,
        });
    }
  });
  t.after(() => {
    incoming.destroy();
    outgoing.destroy();
  });

  f.state.expectedExecutable = process.execPath;
  const nativeRequests = [];
  const memory = memoryTransport(
    f.spawnDouble,
    (current) => {
      nativeRequests.push(structuredClone(current));
      if (current.protocolVersion === 2) {
        assert.equal(nativeRequests.length, 1);
        return javaReplay(f, current);
      }
      assert.equal(current.protocolVersion, 8);
      assert.equal(nativeRequests.length, 2);
      assert.equal(current.payload.expectedActivationBasis, null);
      assert.equal(
        current.payload.providerSnapshotId,
        nativeRequests[0].payload.providerSnapshotId,
      );
      assert.equal(
        current.payload.targetSource.contentFingerprint,
        nativeRequests[0].payload.revision.contentFingerprint,
      );
      assert.equal(current.payload.sourceFiles.length, 2);
      assert.equal(current.payload.owners.length, 10);
      assert.ok(
        current.payload.owners.every(
          (o) => o.sourceFileId === nativeRequests[0].payload.sourceFiles[0].id,
        ),
      );
      for (const source of current.payload.sourceFiles)
        assert.equal(
          source.contentFingerprint,
          'sha256:' + f.expected.sources.find((x) => x.path === source.path).fileSha256,
        );
      const old = originalCombined.payload,
        mapping = new Map([
          [originalCombined.requestId, current.requestId],
          [old.targetSource.repositoryId, current.payload.targetSource.repositoryId],
          [old.targetSource.revisionId, current.payload.targetSource.revisionId],
          [old.providerSnapshotId, current.payload.providerSnapshotId],
          ...old.sourceFiles.map((x) => [
            x.id,
            current.payload.sourceFiles.find((y) => y.path === x.path).id,
          ]),
        ]);
      const events = originalEvents.map((e) => mapValues(e, mapping));
      for (const event of events) {
        if (event.payload.sourceFingerprint)
          assert.ok(
            f.expected.sources.some(
              (x) => 'sha256:' + x.fileSha256 === event.payload.sourceFingerprint,
            ),
          );
        if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type))
          Object.assign(event.payload, {
            ownerBinding: current.payload.ownerBinding,
            targetSource: current.payload.targetSource,
            expectedActivationBasis: current.payload.expectedActivationBasis,
          });
      }
      // Local protocol-failure fixture only; original bytes were strictly validated above.
      return refuseSurface ? Buffer.alloc(0) : reseal(current, events).outputBytes;
    },
    refuseSurface,
  );
  t.after(() => memory.restore());
  const env = {
    CODEATLAS_HOST_MAX_MANIFEST_BYTES: String(artifactLimits.maxManifestBytes),
    CODEATLAS_HOST_MAX_ARTIFACT_BYTES: String(artifactLimits.maxArtifactBytes),
    CODEATLAS_HOST_MAX_TOTAL_BYTES: String(artifactLimits.maxTotalBytes),
    CODEATLAS_HOST_MAX_FILES: String(artifactLimits.maxFiles),
    CODEATLAS_HOST_DEADLINE_EPOCH_MS: String(deadlineEpochMs),
  };
  await fs.mkdir(
    refuseSurface
      ? path.join(repo, '.superpowers/sdd/2026-11-05-current13-mixed-refusal')
      : mixedEvidenceRoot,
    { recursive: true },
  );
  return {
    ...f,
    operation,
    graph,
    messages,
    replies,
    incoming,
    outgoing,
    env,
    argv: [path.join(root, 'context.json'), sha],
    nativeRequests,
    assertMemoryHealthy: () => memory.assertHealthy(),
    originalCombinedValidation: {
      requestSha256: hash(mixedRequestBytes),
      outputSha256: hash(mixedOutputBytes),
      strictBeforeRebind: true,
      budget: { ...composition.budget },
    },
    prepareSummary: JSON.parse(readMixedInput('prepare-summary.json', 'utf8')),
  };
}

export function createCurrent13MixedRefusalFixture(t) {
  return createCurrent13MixedEntryFixture(t, true);
}
