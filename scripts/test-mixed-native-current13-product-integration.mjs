import test from 'node:test';
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
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';
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
const hash = (b) => createHash('sha256').update(b).digest('hex'),
  repo = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t, mode) {
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
  if (mode === 'permission') policy.callerCapabilities = [];
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
        include: [source.sourceFiles[0].path],
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
    messages = [];
  let active;
  outgoing.on('data', (chunk) => {
    for (const m of peer.push(chunk)) {
      messages.push(m);
      const send = (x) => incoming.write(peer.encode(x));
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
              [old.requestId, current.requestId],
              [source.providerSnapshotId, current.payload.providerSnapshotId],
              [source.targetSource.revisionId, current.payload.targetSource.revisionId],
              ...source.sourceFiles.map((p) => [
                p.id,
                current.payload.sourceFiles.find((n) => n.path === p.path).id,
              ]),
            ]);
          const rebind = (v) =>
            typeof v === 'string'
              ? (mapping.get(v) ?? v)
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
          for (const event of events)
            if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type)) {
              event.payload.ownerBinding = structuredClone(current.payload.ownerBinding);
              event.payload.targetSource = structuredClone(current.payload.targetSource);
            }
          const raw = reseal(current, events);
          child.stdout.end(mode === 'corrupt-native' ? Buffer.from('invalid\n') : raw.outputBytes);
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
    incoming,
    outgoing,
    env,
    argv: [path.join(root, 'context.json'), sha],
    nativeCalls: () => nativeCalls,
  };
}
for (const mode of ['success', 'corrupt-native', 'permission'])
  test('fixed bootstrap -> complete actual current13 product graph ' + mode, async (t) => {
    const f = await fixture(t, mode);
    t.diagnostic(
      'GRAPH=' +
        JSON.stringify({
          modules: f.graph.hostModuleArtifactIds.length,
          edges: f.graph.edges.length,
          artifacts: f.graph.artifacts.length,
          sourceInputs: f.graph.sourceFiles.length,
        }),
    );
    const pending = runFixedMixedNativeHostBootstrap(f.argv, f.env, {
      incoming: f.incoming,
      outgoing: f.outgoing,
    });
    if (mode !== 'success') {
      await assert.rejects(pending, (error) => {
        t.diagnostic(
          'REFUSAL=' +
            JSON.stringify({ code: error.code, step: error.step, effects: error.effects }),
        );
        assert.equal(error.code, 'CURRENT13_OPERATION_FAILED');
        assert.notEqual(error.effects.graphCommit, 'COMMITTED');
        assert.equal(
          error.effects.sourceCommit,
          mode === 'permission' ? 'NOT_ATTEMPTED' : 'COMMITTED',
        );
        return true;
      });
      if (mode === 'permission') {
        assert.equal(f.nativeCalls(), 0);
        assert.equal(f.state.calls, 0);
        await assert.rejects(fs.access(f.operation.database.databasePath));
      }
      return;
    }
    let outcome;
    try {
      outcome = await pending;
    } catch (error) {
      t.diagnostic(
        'PRODUCT_BOUNDARY_FAILURE=' +
          JSON.stringify({ code: error.code, step: error.step, effects: error.effects }),
      );
      throw error;
    }
    assert.equal(outcome.value.kind, 'COMMITTED');
    assert.equal(outcome.value.effects.graphCommit, 'COMMITTED');
    assert.equal(outcome.value.effects.cleanupFailed, false);
    assert.equal(outcome.value.executionAuthorized, false);
    assert.equal(outcome.executionAuthorized, false);
    assert.equal(f.nativeCalls(), 1);
    const registers = f.messages.filter((m) => m.type === 'REGISTER');
    assert.equal(registers.length, 17);
    assert.ok(
      registers
        .slice(9)
        .every(
          (m) =>
            m.role === 'GIT' &&
            m.phase === 'ANALYSIS' &&
            m.contextDigest === registers[8].contextDigest,
        ),
    );
    assert.equal(f.state.calls, f.state.closes);
    // Fresh readonly Runtime owner, not IndexSession's already-open readonly snapshot.
    const database = new DatabaseSync(f.operation.database.databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    try {
      const value = new RuntimeFactStore(database, f.operation.repository.id).traceRuntimeV2(
        historyLimits,
      );
      assert.equal(value.status, 'CURRENT');
      assert.equal(value.activationId, outcome.value.runtimeActivationId);
      assert.ok(value.candidate.derivation.sitePlan.entries.length > 0);
    } finally {
      database.close();
    }
    t.diagnostic(
      'PRODUCT_CURRENT13_ACTUAL_SOURCE_STAGE_CANDIDATE_STORE=COMMITTED;Git/Native/observer=memory;no HOST CLI/OS execution',
    );
  });
