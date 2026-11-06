import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
// Test-only fixed no-Native entry fixtures; actual AppSource and recorded component baselines.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
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
async function buildActualSourceBaseline(f, operation, saved, old, mode) {
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
    assert.equal(source.state.files.length, mode === 'FULL' ? 1 : 2);
    const original = old.payload;
    const strict = validateFrameworkSurfaceStreamWithBudget(
      saved.syntax.request,
      saved.syntax.output,
      {
        limits: {
          maxSerializedBytes: Number.MAX_SAFE_INTEGER,
          maxItems: Number.MAX_SAFE_INTEGER,
          maxDepth: Number.MAX_SAFE_INTEGER,
        },
        budget: { serializedBytes: 0, items: 0 },
      },
    );
    assert.equal(strict.observation.outcome, 'SUCCEEDED');
    assert.equal(
      source.state.files.find((s) => s.path === original.sourceFiles[0].path).contentFingerprint,
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
      mode,
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
      [original.targetSource.repositoryId, request.payload.targetSource.repositoryId],
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
        expectedOldRuntime: new RuntimeFactStore(
          session.database,
          operation.repository.id,
        ).readRuntimeBasis(historyLimits).runtimeActivationId,
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
export const noNativeEvidenceRoot = path.join(
  repo,
  '.superpowers/sdd/2026-11-06-current13-no-native-entry',
);
export async function createCurrent13NoNativeEntryFixture(
  t,
  scenario,
  delivery = 'closedgraph',
  variant = 'plain',
) {
  assert.ok(['no-op', 'deletion'].includes(scenario));
  assert.ok(['baseline', 'direct', 'closedgraph'].includes(delivery));
  assert.ok(
    [
      'plain',
      'requires-native',
      'route-change',
      'ignored-config',
      'head-drift',
      'source-drift',
      'ignored-drift',
      'cancel-final',
      'unexpected-command',
      'unsettled-cleanup',
    ].includes(variant),
  );
  await fs.mkdir(noNativeEvidenceRoot, { recursive: true });
  const expected = JSON.parse(
    readHistoricalInputOrLocal(
      '.superpowers/sdd/2026-11-05-current13-no-native-entry/manual-expectations.json',
      'utf8',
      repo,
    ),
  );
  const f = await setup(t),
    saved = readSurfaceCapture('P5'),
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
  const graph =
    delivery === 'closedgraph'
      ? await buildMixedNativeHostProductGraph({
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
        })
      : await (async () => {
          await fs.mkdir(root);
          const bytes = Buffer.from('export default false;\n');
          await fs.writeFile(path.join(root, 'direct-entry.mjs'), bytes);
          return {
            hostEntryArtifactId: 'direct-entry',
            hostModuleArtifactIds: ['direct-entry'],
            edges: [],
            sourceFiles: [],
            artifacts: [
              {
                id: 'direct-entry',
                path: 'direct-entry.mjs',
                sizeBytes: bytes.length,
                sha256: hash(bytes),
              },
            ],
          };
        })();
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
        include: [
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

  // Default selection lets a later Git ignore change alter the selected Source set.
  if (variant === 'ignored-drift')
    operation.sourceRequest.config.include = operation.sourceRequest.config.include.filter(
      (p) => p !== source.sourceFiles[0].path,
    );
  let baseline = await buildActualSourceBaseline(f, operation, saved, old, 'FULL');
  const p1Saved = readSurfaceCapture('P1'),
    p1Old = JSON.parse(p1Saved.syntax.request),
    originalP1 = p1Old.payload.sourceFiles[0],
    originalP5 = source.sourceFiles[0];
  for (const s of [originalP1, originalP5])
    assert.equal(
      s.contentFingerprint,
      'sha256:' + expected.sources.find((x) => x.path === s.path).sha256,
    );
  operation.kind = 'MIXED_NATIVE_CURRENT13_INCREMENTAL_OPERATION';
  operation.database.initialize = false;
  if (scenario === 'deletion') {
    await fs.mkdir(path.dirname(path.join(f.root, originalP1.path)), { recursive: true });
    await fs.copyFile(
      new URL('../fixtures/phase1/' + originalP1.path, import.meta.url),
      path.join(f.root, originalP1.path),
    );
    baseline = await buildActualSourceBaseline(f, operation, p1Saved, p1Old, 'DELTA');
    await fs.unlink(path.join(f.root, originalP1.path));
  }
  if (variant === 'requires-native') {
    await fs.mkdir(path.dirname(path.join(f.root, originalP1.path)), { recursive: true });
    await fs.copyFile(
      new URL('../fixtures/phase1/' + originalP1.path, import.meta.url),
      path.join(f.root, originalP1.path),
    );
  }
  if (variant === 'route-change') operation.routes = [];
  if (variant === 'ignored-config')
    operation.routes[0].configuration = { readinessMarker: 'different-valid-json' };
  if (delivery === 'baseline')
    return { ...f, operation, baseline, originalP1, originalP5, expected };
  f.state.calls = 0;
  f.state.closes = 0;
  f.state.inputs.length = 0;
  const git = validateGitQualification({
    ...operation.git,
    createLifecycle() {
      throw Error('shape only');
    },
  });
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
    slots: [...slots('SOURCE', 'initial'), ...slots('SOURCE', 'final')],
    controlLimits: { maxFrameBytes: 4096, maxTotalBytes: 1024 * 1024, maxFrames: 1000 },
    edges: graph.edges,
  };
  if (variant === 'unexpected-command')
    descriptor.slots[8].command.arguments = ['-C', f.root, 'rev-parse', '--git-dir'];
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
        if (variant === 'cancel-final' && m.launchId === 'final0') {
          incoming.end();
          continue;
        }
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
          unknownDescendants: variant === 'unsettled-cleanup' && m.launchId === 'final0',
          cleanupComplete: !(variant === 'unsettled-cleanup' && m.launchId === 'final0'),
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
  let driftInjected = false;
  if (['head-drift', 'source-drift', 'ignored-drift'].includes(variant))
    f.state.beforeReply = async () => {
      if (f.state.calls === 9 && !driftInjected) {
        driftInjected = true;
        if (variant === 'head-drift') f.state.head = 'b'.repeat(40);
        else if (variant === 'ignored-drift') f.state.ignored.add(originalP5.path);
        else await fs.appendFile(path.join(f.root, originalP5.path), '\n');
      }
    };
  let nativeCalls = 0;
  const productSpawnDouble = (file, args, options) => {
    assert.equal(file, process.execPath);
    if (args[0] === '-C') return f.spawnDouble(file, args, options);
    nativeCalls++;
    throw Error('NO_NATIVE_PLAN_MUST_NEVER_SPAWN_NATIVE');
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
    ownerInput: {
      root,
      manifestPath: 'context.json',
      manifestSha256: sha,
      artifactLimits,
      hostEntryArtifactId: descriptor.hostEntryArtifactId,
      hostModuleArtifactIds: descriptor.hostModuleArtifactIds,
      workspaceId: descriptor.workspaceId,
      repositoryId,
      slots: descriptor.slots,
      deadlineEpochMs,
      controlLimits: descriptor.controlLimits,
    },
    nativeCalls: () => nativeCalls,
    driftInjected: () => driftInjected,
    baseline,
    originalP1,
    originalP5,
    expected,
    sourceContextDigest: artifacts.find((a) => a.id === bindings.source).sha256,
  };
}
