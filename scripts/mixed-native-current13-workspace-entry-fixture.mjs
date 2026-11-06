// Test-only existing FULL entry fixture; original Native roles/analysis binding remain unchanged.
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
import { PassThrough, Writable } from 'node:stream';
import { readSurfaceCapture } from '../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import { reseal } from '../packages/providers/test/fixtures/native-composition-helpers.mjs';
import nativeOwner, { executeNativeRequest } from '../packages/providers/dist/native-client.js';
import { validateFrameworkSurfaceStreamWithBudget } from '../packages/providers/dist/native-framework-surface-stream.js';
import { validateGitQualification } from '../packages/source/dist/git.js';
import { buildMixedNativeHostProductGraph } from './mixed-native-host-product-graph.mjs';
import { loadMixedNativeOwnerContext } from './mixed-native-owner-context.mjs';
import { createMixedNativeDynamicControlCodec } from './mixed-native-dynamic-control-codec.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));
const hash = (b) => createHash('sha256').update(b).digest('hex');
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

export async function createCurrent13WorkspaceEntryFixture(t, prepared, delivery) {
  assert.ok(['compact', 'closedgraph'].includes(delivery));
  assert.ok(['J7', 'P5'].includes(prepared.caseId));
  prepared.activateGitDouble();
  const f = { ...prepared, root: prepared.sourceRoot },
    operation = structuredClone(prepared.operation),
    policy = operation.policy,
    repositoryId = operation.repository.id;
  assert.equal(operation.kind, 'MIXED_NATIVE_CURRENT13_FULL_OPERATION');
  assert.equal(operation.database.initialize, false);
  const saved = readSurfaceCapture(prepared.caseId),
    original = JSON.parse(saved.syntax.request),
    p = original.payload;
  assert.equal(hash(saved.syntax.request), prepared.rawPins.syntax.requestSha256);
  assert.equal(hash(saved.syntax.output), prepared.rawPins.syntax.outputSha256);
  assert.equal(
    hash(await fs.readFile(path.join(f.root, prepared.expectedSource.path))),
    prepared.expectedSource.sha256,
  );
  assert.equal(
    hash(await fs.readFile(path.join(f.root, prepared.schemaDocument.path))),
    prepared.schemaDocument.sha256,
  );
  const ledger = {
    limits: {
      maxSerializedBytes: Number.MAX_SAFE_INTEGER,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: Number.MAX_SAFE_INTEGER,
    },
    budget: { serializedBytes: 0, items: 0 },
  };
  const strict = validateFrameworkSurfaceStreamWithBudget(
    saved.syntax.request,
    saved.syntax.output,
    ledger,
  );
  assert.equal(strict.observation.outcome, 'SUCCEEDED');
  assert.equal(strict.observation.syntaxOutcome, 'COMPLETE');
  assert.equal(strict.observation.codeOutcome, saved.code ? 'NOT_APPLICABLE' : 'COMPLETE');
  if (saved.code) {
    assert.equal(hash(saved.code.request), prepared.rawPins.java.requestSha256);
    assert.equal(hash(saved.code.output), prepared.rawPins.java.outputSha256);
    await withMemory(
      f.spawnDouble,
      () => saved.code.output,
      () =>
        executeNativeRequest(JSON.parse(saved.code.request), {
          executablePath: process.execPath,
          timeoutMs: 1000,
          signal: f.controller.signal,
        }),
    );
  }
  f.state.calls = 0;
  f.state.closes = 0;
  f.state.inputs.length = 0;
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
          await fs.writeFile(path.join(root, 'compact.mjs'), bytes);
          return {
            hostEntryArtifactId: 'compact',
            hostModuleArtifactIds: ['compact'],
            edges: [],
            sourceFiles: [],
            artifacts: [
              { id: 'compact', path: 'compact.mjs', sha256: hash(bytes), sizeBytes: bytes.length },
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
      ...(saved.code
        ? [{ launchId: 'java', role: 'V2', phase: 'ANALYSIS', command: nativeCommand }]
        : []),
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
  const memory = memoryTransport(f.spawnDouble, (current) => {
    nativeRequests.push(structuredClone(current));
    if (current.protocolVersion === 2) {
      assert.ok(saved.code);
      assert.equal(nativeRequests.length, 1);
      return replayJava(saved, current);
    }
    assert.equal(current.protocolVersion, 8);
    assert.equal(nativeRequests.length, saved.code ? 2 : 1);
    assert.equal(current.payload.expectedActivationBasis, null);
    assert.equal(current.payload.targetSource.repositoryId, prepared.repositoryId);
    assert.equal(
      current.payload.targetSource.revisionId,
      prepared.sourcePreparation.withSchema.revision.id,
    );
    assert.equal(
      current.payload.targetSource.contentFingerprint,
      prepared.sourcePreparation.withSchema.revision.contentFingerprint,
    );
    assert.deepEqual(
      current.payload.sourceFiles.map((s) => [s.path, s.id, s.contentFingerprint]),
      [
        [
          prepared.expectedSource.path,
          prepared.sourcePreparation.withSchema.files.find(
            (s) => s.path === prepared.expectedSource.path,
          ).id,
          'sha256:' + prepared.expectedSource.sha256,
        ],
      ],
    );
    if (saved.code) {
      assert.equal(
        current.payload.providerSnapshotId,
        nativeRequests[0].payload.providerSnapshotId,
      );
      assert.equal(
        current.payload.targetSource.contentFingerprint,
        nativeRequests[0].payload.revision.contentFingerprint,
      );
    }
    const mapping = new Map([
      [original.requestId, current.requestId],
      [p.targetSource.repositoryId, current.payload.targetSource.repositoryId],
      [p.targetSource.revisionId, current.payload.targetSource.revisionId],
      [p.providerSnapshotId, current.payload.providerSnapshotId],
      ...p.sourceFiles.map((s) => [
        s.id,
        current.payload.sourceFiles.find((n) => n.path === s.path).id,
      ]),
    ]);
    const events = saved.syntax.output
      .toString()
      .trim()
      .split('\n')
      .map((line) => mapValues(JSON.parse(line), mapping));
    for (const event of events) {
      if (event.payload.sourceFingerprint)
        assert.equal(event.payload.sourceFingerprint, 'sha256:' + prepared.expectedSource.sha256);
      if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(event.type))
        Object.assign(event.payload, {
          ownerBinding: current.payload.ownerBinding,
          targetSource: current.payload.targetSource,
          expectedActivationBasis: current.payload.expectedActivationBasis,
        });
    }
    return reseal(current, events).outputBytes;
  });
  t.after(() => memory.restore());
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
    nativeRequests,
    assertMemoryHealthy: () => memory.assertHealthy(),
    restoreMemory: () => memory.restore(),
    originalValidation: {
      ...prepared.rawPins,
      strictBeforeRebind: true,
      syntaxCompositionBudget: { ...ledger.budget },
    },
    sourceContextDigest: artifacts.find((a) => a.id === bindings.source).sha256,
  };
}
