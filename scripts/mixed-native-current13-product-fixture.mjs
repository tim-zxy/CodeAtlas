import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
// Test-only explicit additive or same-path DELTA fixture; no real children/canonical SQL seed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { PassThrough, Writable } from 'node:stream';
import { buildMixedNativeHostProductGraph } from './mixed-native-host-product-graph.mjs';
import { loadMixedNativeOwnerContext } from './mixed-native-owner-context.mjs';
import { createMixedNativeDynamicControlCodec } from './mixed-native-dynamic-control-codec.mjs';
import { setup, cases } from '../packages/source/test/fixtures/mixed-source-git-double.mjs';
import { readSurfaceCapture } from '../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import {
  loadCompositionCase,
  reseal,
} from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
import { workflowRequest } from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
import { validateGitQualification } from '../packages/source/dist/git.js';
import nativeOwner from '../packages/providers/dist/native-client.js';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { validateFrameworkSurfaceStreamWithBudget } from '../packages/providers/dist/native-framework-surface-stream.js';

import { openRepositoryIndexSession } from '../packages/storage/dist/index.js';
import { prepareBudgetedMixedSourceOperation } from '../packages/runtime/dist/mixed-source-preparation.js';
import {
  captureRuntimeActivationContext,
  releaseActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedCodeSyntaxPreparation,
} from '../packages/storage/dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../packages/storage/dist/analysis/mixed-analysis-store.js';
import { createFrameworkSurfaceMixedAnalysisRules } from '../packages/runtime/dist/mixed-analysis.js';
import { composeFrozenFrameworkRuntimeV2 } from '../packages/runtime/dist/framework-runtime-composition.js';
import construct from '../packages/runtime/dist/mixed-request-preparation.js';
async function buildActualSourceBaseline(f, operation, saved, old) {
  const session = await openRepositoryIndexSession(operation.database, {
    async checkpoint() {},
    reserveText() {},
    chargeMetadataRow() {},
  });
  let source, capture, stage;
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
    assert.equal(source.state.files.length, 1);
    const original = old.payload;
    assert.equal(
      source.state.files[0].contentFingerprint,
      original.sourceFiles[0].contentFingerprint,
    );
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
    const owner = stage.prepareOwner(null, {
        contracts: operation.contracts,
        qualificationRef: 'RECORDED_REPLAY_COMPONENT_BASELINE_NOT_NATIVE',
      }),
      preparation = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
    const requestBytes = construct.prepareMixedFrameworkSurfaceRequest(
        {
          preparation,
          repository: operation.repository,
          requestId: old.requestId,
          providerVersion: original.providerVersion,
          providerSnapshotId: original.providerSnapshotId,
          extractorVersion: original.extractorVersion,
          deadlineEpochMs: original.deadlineEpochMs,
          resourceBudget: original.resourceBudget,
          languages: original.languages,
        },
        source.budget,
      ),
      request = JSON.parse(requestBytes);
    const replacements = new Map([
      [original.targetSource.revisionId, request.payload.targetSource.revisionId],
      ...original.sourceFiles.map((p) => [
        p.id,
        request.payload.sourceFiles.find((n) => n.path === p.path).id,
      ]),
    ]);
    const rebind = (v) =>
      typeof v === 'string'
        ? (replacements.get(v) ?? v)
        : Array.isArray(v)
          ? v.map(rebind)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
            : v;
    const events = saved.syntax.output
      .toString()
      .trim()
      .split('\n')
      .map((line) => rebind(JSON.parse(line)));
    for (const event of events) {
      if (event.payload.sourceFingerprint)
        assert.equal(event.payload.sourceFingerprint, original.sourceFiles[0].contentFingerprint);
      if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type))
        Object.assign(event.payload, {
          ownerBinding: request.payload.ownerBinding,
          targetSource: request.payload.targetSource,
          expectedActivationBasis: request.payload.expectedActivationBasis,
        });
    }
    const metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
    Object.assign(metadata, {
      targetSource: preparation.targetSource,
      inventory: preparation.inventory,
      java: null,
    });
    Object.assign(metadata.snapshot, {
      id: original.providerSnapshotId,
      providerId: original.providerId,
      providerVersion: original.providerVersion,
    });
    metadata.codeSyntax.providerVersion = original.providerVersion;
    const raw = reseal(request, events);
    assert.deepEqual(raw.requestBytes, requestBytes);
    stage.acceptObservation(owner.ownerHandle, { metadata, ...raw });
    const frozen = stage.freeze();
    await source.verifySelection();
    const store = new MixedAnalysisStore(session.database),
      outcome = await composeFrozenFrameworkRuntimeV2({
        workspaceId: operation.policy.scope.workspaceId,
        repositoryId: operation.repository.id,
        stage,
        lease: frozen.lease,
        store,
        expectedOldRuntime: null,
        limits: historyLimits,
        routes: operation.routes,
      }).publish(workflowRequest(operation.repository.id, 'INDEX'));
    const rows = (table) =>
      session.database
        .prepare('SELECT * FROM ' + table + ' ORDER BY id')
        .all()
        .map((x) => ({ ...x }));
    return {
      basis: frozen.basis,
      syntaxActivationId: outcome.syntaxActivationId,
      runtimeActivationId: outcome.runtimeActivationId,
      origins: rows('syntax_origins'),
      projections: rows('syntax_projections'),
      nodeIds: rows('canonical_nodes').map((x) => x.id),
      sourceFiles: structuredClone(source.state.files),
      sourceRevision: structuredClone(source.state.revision),
      sourceConfig: structuredClone(operation.sourceRequest.config),
      gitHead: f.state.head,
      gitBranch: f.state.branch,
    };
  } finally {
    try {
      stage?.close();
      if (capture) releaseActivationContext(session.database, capture.handle);
    } finally {
      source?.account.invalidate();
      session.close();
    }
  }
}

const hash = (b) => createHash('sha256').update(b).digest('hex'),
  repo = fileURLToPath(new URL('../', import.meta.url));
export async function createCurrent13DeltaEntryFixture(t, scenario = 'additive') {
  assert.ok(['additive', 'modified-p1'].includes(scenario));
  let modifiedReplay = null,
    libraryValidation = null;
  if (scenario === 'modified-p1') {
    const folder = '.superpowers/sdd/2026-11-05-modified-unit-library-positive';
    const requestBytes = readHistoricalInputOrLocal(
        folder + '/library-output/after.request.jsonl',
        undefined,
        repo,
      ),
      outputBytes = readHistoricalInputOrLocal(
        folder + '/library-output/after.output.jsonl',
        undefined,
        repo,
      );
    const requestSha256 = '314b12e8b2c038fcd66c347ee5e1b7f96e8883fe7669cea378381cafcfb2c789',
      outputSha256 = 'bc586840d4d101f471120125c58d7306d3b749e11d71edf06079a0482932b9f0';
    const rustReceiptBytes = readHistoricalInputOrLocal(
        folder + '/rust-verification.json',
        undefined,
        repo,
      ),
      nodeReceiptBytes = readHistoricalInputOrLocal(
        folder + '/node-verification.json',
        undefined,
        repo,
      ),
      rustReceipt = JSON.parse(rustReceiptBytes),
      nodeReceipt = JSON.parse(nodeReceiptBytes);
    assert.equal(rustReceipt.cases.after.request.sha256, requestSha256);
    assert.equal(rustReceipt.cases.after.output.sha256, outputSha256);
    for (const [name, sha256] of [
      ['after.request.jsonl', requestSha256],
      ['after.output.jsonl', outputSha256],
    ])
      assert.ok(
        nodeReceipt.strictOriginalRustRaw.some(
          (x) => x.path.endsWith('/library-output/' + name) && x.sha256 === sha256,
        ),
      );
    assert.equal(hash(requestBytes), requestSha256);
    assert.equal(hash(outputBytes), outputSha256);
    const ledger = {
        limits: {
          maxSerializedBytes: Number.MAX_SAFE_INTEGER,
          maxItems: Number.MAX_SAFE_INTEGER,
          maxDepth: Number.MAX_SAFE_INTEGER,
        },
        budget: { serializedBytes: 0, items: 0 },
      },
      validated = validateFrameworkSurfaceStreamWithBudget(requestBytes, outputBytes, ledger);
    assert.equal(validated.outputIdentity, outputSha256);
    assert.equal(validated.observation.request.protocolVersion, 8);
    modifiedReplay = { request: JSON.parse(requestBytes), output: outputBytes };
    libraryValidation = {
      requestSha256,
      outputSha256,
      rustReceiptSha256: hash(rustReceiptBytes),
      nodeReceiptSha256: hash(nodeReceiptBytes),
      strictBeforeRebind: true,
      budget: { ...ledger.budget },
    };
  }
  const f = await setup(t),
    saved = readSurfaceCapture(scenario === 'modified-p1' ? 'P1' : 'P5'),
    old = JSON.parse(saved.syntax.request),
    source = old.payload,
    repositoryId = source.targetSource.repositoryId;
  await fs.mkdir(path.dirname(path.join(f.root, source.sourceFiles[0].path)), { recursive: true });
  await fs.copyFile(
    new URL('../fixtures/phase1/' + source.sourceFiles[0].path, import.meta.url),
    path.join(f.root, source.sourceFiles[0].path),
  );
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
  const runtimeRequest = workflowRequest(repositoryId, 'INDEX'),
    policy = runtimeRequest.policy;
  policy.callerCapabilities.push('READ_SOURCE');
  policy.permissionContext.allowedOperations.push('READ_SOURCE');
  const composition = (await loadCompositionCase('python-only')).metadata;
  const operation = {
    kind: 'MIXED_NATIVE_CURRENT13_FULL_OPERATION',
    schemaVersion: 1,
    database: {
      databasePath: path.join(f.root, 'probe.sqlite'),
      repositoryRoot: await fs.realpath(f.root),
      repositoryId,
      initialize: true,
      readOnly: false,
    },
    repository: { id: repositoryId, rootPath: await fs.realpath(f.root) },
    sourceRequest: {
      ...f.request,
      repositoryId,
      config: {
        include:
          scenario === 'modified-p1'
            ? [source.sourceFiles[0].path]
            : [
                source.sourceFiles[0].path,
                JSON.parse(readSurfaceCapture('P1').syntax.request).payload.sourceFiles[0].path,
              ],
        exclude: [
          ...cases.sourcePaths.filter((p) => p !== source.sourceFiles[0].path),
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
        tool: composition.tool,
        providerVersion: source.providerVersion,
        runtimeVersion: composition.snapshot.runtimeVersion,
      },
      languages: source.languages,
      maxEvents: source.resourceBudget.maxEvents,
    },
    git: { executablePath: process.execPath, environment: {} },
    contracts: [
      {
        providerId: 'native',
        extractor: 'syntax-v2',
        normalizer: 'syntax-canonical-mapper-v4',
        contract: 'SYNTAX_BINDING_V4',
        policy: 'syntax-surface-support-v2',
      },
    ],
    qualificationRef: 'OFFLINE_RECORDED_REPLAY_NOT_A6',
    routes: [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
    runtimeControl: { maxItems: 10000, maxDepth: 10 },
  };

  t.diagnostic(
    'Baseline uses actual Source reconcile/CAS plus original ' +
      (scenario === 'modified-p1' ? 'P1 GET' : 'P5') +
      ' recorded-replay component Stage/Runtime/Store; no FULL product bootstrap.',
  );
  const baseline = await buildActualSourceBaseline(f, operation, saved, old),
    deltaSaved = readSurfaceCapture('P1'),
    deltaOld = JSON.parse(deltaSaved.syntax.request),
    deltaSource = deltaOld.payload,
    originalP1 = deltaSource.sourceFiles[0],
    originalP5 = source.sourceFiles[0];
  if (scenario === 'modified-p1') {
    const database = new DatabaseSync(operation.database.databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    try {
      const trace = new RuntimeFactStore(database, repositoryId).traceRuntimeV2(historyLimits);
      const http = trace.candidate.facts.payload.contracts.filter(
        (c) => c.protocol === 'HTTP' && c.direction === 'PROVIDER',
      );
      assert.equal(trace.status, 'CURRENT');
      assert.equal(http.length, 1);
      assert.equal(http[0].signature.method, 'GET');
      baseline.beforeRuntime = {
        status: trace.status,
        method: http[0].signature.method,
        path:
          '/' +
          http[0].signature.pathSegments
            .map((p) => {
              assert.equal(p.kind, 'LITERAL');
              return p.value;
            })
            .join('/'),
      };
    } finally {
      database.close();
    }
  }
  const replayRequest = modifiedReplay?.request ?? deltaOld,
    replaySource = replayRequest.payload,
    replayOutput = modifiedReplay?.output ?? deltaSaved.syntax.output;
  const addedBytes = await fs.readFile(
    scenario === 'modified-p1'
      ? new URL('../packages/source/test/fixtures/current13-same-path-after.py', import.meta.url)
      : new URL('../fixtures/phase1/' + originalP1.path, import.meta.url),
  );
  const expectedObservedSource =
    scenario === 'modified-p1'
      ? { ...originalP1, contentFingerprint: replaySource.sourceFiles[0].contentFingerprint }
      : originalP1;
  assert.equal('sha256:' + hash(addedBytes), expectedObservedSource.contentFingerprint);
  assert.equal(
    'sha256:' + hash(await fs.readFile(path.join(f.root, originalP5.path))),
    originalP5.contentFingerprint,
  );
  await fs.mkdir(path.dirname(path.join(f.root, originalP1.path)), { recursive: true });
  await fs.writeFile(path.join(f.root, originalP1.path), addedBytes);
  operation.kind = 'MIXED_NATIVE_CURRENT13_INCREMENTAL_OPERATION';
  operation.database.initialize = false;
  f.state.calls = 0;
  f.state.closes = 0;
  f.state.inputs.length = 0;
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
  let nativeCalls = 0;
  const nativeRequests = [];
  const productSpawnDouble = (file, args, options) => {
    assert.equal(file, process.execPath);
    if (args[0] === '-C') return f.spawnDouble(file, args, options);
    nativeCalls++;
    assert.deepEqual(args, []);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter(),
      chunks = [];
    let done = false;
    Object.assign(child, {
      pid: 12345,
      exitCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const close = (code = 0) => {
      if (done) return;
      done = true;
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
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
      final(cb) {
        cb();
        queueMicrotask(() => {
          const current = JSON.parse(Buffer.concat(chunks)),
            mapping = new Map([
              [replayRequest.requestId, current.requestId],
              [replaySource.targetSource.repositoryId, current.payload.targetSource.repositoryId],
              [replaySource.providerSnapshotId, current.payload.providerSnapshotId],
              [replaySource.targetSource.revisionId, current.payload.targetSource.revisionId],
              ...replaySource.sourceFiles.map((p) => [
                p.id,
                current.payload.sourceFiles.find((n) => n.path === p.path).id,
              ]),
            ]);
          nativeRequests.push(structuredClone(current));
          assert.equal(current.protocolVersion, 8);
          assert.deepEqual(current.payload.expectedActivationBasis, baseline.basis);
          assert.deepEqual(
            current.payload.sourceFiles.map((p) => [p.path, p.contentFingerprint]),
            [[expectedObservedSource.path, expectedObservedSource.contentFingerprint]],
          );
          const rebind = (v) =>
            typeof v === 'string'
              ? (mapping.get(v) ?? v)
              : Array.isArray(v)
                ? v.map(rebind)
                : v && typeof v === 'object'
                  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
                  : v;
          const events = replayOutput
            .toString()
            .trim()
            .split('\n')
            .map((line) => rebind(JSON.parse(line)));
          for (const event of events) {
            if (event.payload.sourceFingerprint)
              assert.equal(
                event.payload.sourceFingerprint,
                expectedObservedSource.contentFingerprint,
              );
            if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type)) {
              event.payload.ownerBinding = structuredClone(current.payload.ownerBinding);
              event.payload.targetSource = structuredClone(current.payload.targetSource);
              event.payload.expectedActivationBasis = structuredClone(
                current.payload.expectedActivationBasis,
              );
            }
          }
          const raw = reseal(current, events);
          child.stdout.end(raw.outputBytes);
          child.stderr.end();
          setImmediate(() => close());
        });
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  cp.spawn = productSpawnDouble;
  syncBuiltinESMExports();
  t.after(() => {
    if (cp.spawn === productSpawnDouble) cp.spawn = f.spawnDouble;
    syncBuiltinESMExports();
  });
  const env = {
    CODEATLAS_HOST_MAX_MANIFEST_BYTES: String(artifactLimits.maxManifestBytes),
    CODEATLAS_HOST_MAX_ARTIFACT_BYTES: String(artifactLimits.maxArtifactBytes),
    CODEATLAS_HOST_MAX_TOTAL_BYTES: String(artifactLimits.maxTotalBytes),
    CODEATLAS_HOST_MAX_FILES: String(artifactLimits.maxFiles),
    CODEATLAS_HOST_DEADLINE_EPOCH_MS: String(deadlineEpochMs),
  };
  return {
    ...f,
    root,
    operation,
    graph,
    messages,
    replies,
    incoming,
    outgoing,
    env,
    argv: [path.join(root, 'context.json'), sha],
    nativeCalls: () => nativeCalls,
    baseline,
    originalP1,
    originalP5,
    expectedObservedSource,
    libraryValidation,
    nativeRequests,
  };
}

export async function createCurrent13ModifiedEntryFixture(t) {
  return createCurrent13DeltaEntryFixture(t, 'modified-p1');
}
