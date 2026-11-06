import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
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
import { prepareMixedNativeFinalSourcePublication } from './mixed-native-final-source-publication.mjs';
import { validateGitQualification } from '../packages/source/dist/git.js';
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
import requestConstructor from '../packages/runtime/dist/mixed-request-preparation.js';
import observeOwnedFrameworkSurface from '../packages/providers/dist/native-framework-surface-client.js';
import { withMixedNativeTransportBudget } from '../packages/runtime/src/mixed-native-transport-budget.ts';

// Process-shaped memory double only. The only delegated spawn is the existing Git double.
async function replayTransport(fixture, raw, historyBudget, dynamicLifecycle) {
  const events = [],
    writes = [];
  cp.spawn = (file, args, options) => {
    if (file === 'git') return fixture.spawnDouble(file, args, options);
    assert.equal(file, process.execPath);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    events.push('spawn');
    const child = new EventEmitter();
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
      events.push('close');
      child.emit('exit', code, null);
      child.emit('close', code, null);
    };
    child.kill = () => {
      queueMicrotask(() => close(9));
      return true;
    };
    child.stdin = new Writable({
      write(chunk, _encoding, done) {
        writes.push(Buffer.from(chunk));
        events.push('stdin');
        done();
      },
      final(done) {
        done();
        queueMicrotask(() => {
          child.stdout.end(raw.outputBytes);
          child.stderr.end();
          setImmediate(() => close());
        });
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  syncBuiltinESMExports();
  try {
    const before = {
      bytes: historyBudget.serializedBytes,
      items: historyBudget.items,
      pinned: historyBudget.retainedLogicalBytes,
    };
    const result = await withMixedNativeTransportBudget(historyBudget, (ledger) =>
      observeOwnedFrameworkSurface(
        raw.requestBytes,
        { executablePath: process.execPath, timeoutMs: 1000, signal: fixture.controller.signal },
        {
          beforeSpawn: (plan, signal) => dynamicLifecycle.beforeSpawn(plan, signal),
          async beforeInput(child, signal) {
            events.push('beforeInput');
            assert.equal(writes.length, 0);
            await dynamicLifecycle.beforeInput(child, signal);
          },
          async afterClose(close, signal) {
            assert.ok(events.includes('close'));
            events.push('afterClose');
            await dynamicLifecycle.afterClose(close, signal);
          },
          async dispose(signal) {
            events.push('dispose');
            await dynamicLifecycle.dispose(signal);
          },
        },
        ledger,
      ),
    );
    assert.deepEqual(result.requestBytes, raw.requestBytes);
    assert.deepEqual(result.outputBytes, raw.outputBytes);
    assert.deepEqual(Buffer.concat(writes), raw.requestBytes);
    assert.deepEqual(events, ['spawn', 'beforeInput', 'stdin', 'close', 'afterClose', 'dispose']);
    const delta = historyBudget.serializedBytes - before.bytes;
    assert.ok(delta > raw.requestBytes.length);
    assert.ok(historyBudget.items > before.items);
    assert.equal(historyBudget.retainedLogicalBytes - before.pinned, delta);
    return result;
  } finally {
    cp.spawn = fixture.spawnDouble;
    syncBuiltinESMExports();
  }
}

for (const mode of [
  'success',
  'source-drift',
  'head-drift',
  'command-drift',
  'failed-query',
  'cancel',
])
  test('R013 fixed complete offline operation ' + mode, async (t) => {
    t.diagnostic(
      'Git=IN_MEMORY_TEST_DOUBLE; Native=RECORDED_REPLAY_REBOUND; physical/measurement/environment authorization=false',
    );
    // Fixture caps exercise existing interfaces; they are not real-run resource policy.
    const f = await setup(t),
      saved = readSurfaceCapture('P5');
    assert.equal(saved.code, null);
    const request = JSON.parse(saved.syntax.request),
      original = structuredClone(request.payload);
    const repositoryId = original.targetSource.repositoryId;
    let session,
      source,
      capture,
      stage,
      step = 'INITIALIZE';
    try {
      await fs.mkdir(path.dirname(path.join(f.root, original.sourceFiles[0].path)), {
        recursive: true,
      });
      await fs.copyFile(
        new URL('../fixtures/phase1/' + original.sourceFiles[0].path, import.meta.url),
        path.join(f.root, original.sourceFiles[0].path),
      );
      session = await openRepositoryIndexSession(
        {
          databasePath: path.join(f.root, 'probe.sqlite'),
          repositoryRoot: await fs.realpath(f.root),
          repositoryId,
          initialize: true,
          readOnly: false,
        },
        { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
      );
      assert.equal(session.initialized, true);
      t.diagnostic('INITIALIZE: current manifest, exclusive owned evaluation DB; no manual SQL');
      step = 'SOURCE';
      const policy = workflowRequest(repositoryId, 'INDEX').policy;
      policy.callerCapabilities.push('READ_SOURCE');
      policy.permissionContext.allowedOperations.push('READ_SOURCE');
      const dynamicFixture = await dynamicOwnerFixture(t, repositoryId),
        qualified = validateGitQualification({
          executablePath: process.execPath,
          environment: {},
          createLifecycle() {
            throw Error('shape only');
          },
        });
      f.state.expectedExecutable = process.execPath;
      const gitArgs = [
        ['rev-parse', '--show-toplevel'],
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        ['rev-parse', '--verify', '--quiet', 'HEAD'],
        ['check-ignore', '--no-index', '-z', '--stdin'],
        ['check-ignore', '--no-index', '-z', '--stdin'],
        ['rev-parse', '--show-toplevel'],
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        ['rev-parse', '--verify', '--quiet', 'HEAD'],
      ];
      const gitSlots = (phase, prefix) =>
        gitArgs.map((args, i) => ({
          launchId: prefix + i,
          role: 'GIT',
          phase,
          command: {
            executablePath: process.execPath,
            arguments: ['-C', f.root, ...args],
            environment: qualified.environment,
            cwd: process.cwd(),
          },
        }));
      dynamicFixture.request.slots = [
        ...gitSlots('SOURCE', 'initial'),
        dynamicFixture.request.slots[0],
        ...gitSlots('ANALYSIS', 'final'),
      ];
      if (mode === 'command-drift')
        dynamicFixture.request.slots[9].command.arguments.push('--unexpected');
      const dynamicOwner = await dynamicFixture.bind();
      const prepared = await prepareMixedNativeFinalSourcePublication(
        {
          database: session.database,
          repository: { id: repositoryId, rootPath: f.root },
          request: {
            ...f.request,
            repositoryId,
            config: {
              include: [original.sourceFiles[0].path],
              exclude: [
                ...cases.sourcePaths.filter((x) => x !== original.sourceFiles[0].path),
                'probe.sqlite',
                'probe.sqlite-*',
              ],
            },
          },
          policy,
          control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
          limits: historyLimits,
          operationBudget: {
            maxInputBytes: Number.MAX_SAFE_INTEGER,
            maxOutputBytes: Number.MAX_SAFE_INTEGER,
            maxItems: Number.MAX_SAFE_INTEGER,
            maxDepth: Number.MAX_SAFE_INTEGER,
            maxMemoryBytes: Number.MAX_SAFE_INTEGER,
            maxDurationMs: 60000,
          },
        },
        dynamicOwner,
        { executablePath: process.execPath, environment: {} },
      );
      source = prepared.source;
      assert.equal(source.effects.sourceCommit, 'COMMITTED');
      assert.equal(source.state.files.length, 1);
      assert.equal(source.state.files[0].path, original.sourceFiles[0].path);
      assert.equal(
        source.state.files[0].contentFingerprint,
        original.sourceFiles[0].contentFingerprint,
      );
      t.diagnostic(
        'SOURCE: genuine observe/reconcile/CAS; Git spawn intercepted by existing in-memory double',
      );
      step = 'CAPTURE_STAGE';
      capture = captureRuntimeActivationContext(
        session.database,
        repositoryId,
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
      const contracts = [
        {
          providerId: 'native',
          extractor: 'syntax-v2',
          normalizer: 'syntax-canonical-mapper-v4',
          contract: 'SYNTAX_BINDING_V4',
          policy: 'syntax-surface-support-v2',
        },
      ];
      const owner = stage.prepareOwner(null, {
        contracts,
        qualificationRef: 'RECORDED_REPLAY_COMPONENT_NOT_PHYSICAL',
      });
      const preparation = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
      // RECORDED_REPLAY only: rebind opaque Source IDs, never file bytes/fingerprints.
      // The target inventory digest is distinct from an individual file digest.
      const replacements = new Map([
        [original.targetSource.revisionId, preparation.targetSource.revisionId],
        ...original.sourceFiles.map((old) => [
          old.id,
          preparation.sourceFiles.find((x) => x.path === old.path).id,
        ]),
      ]);
      const rebind = (value) =>
        typeof value === 'string'
          ? (replacements.get(value) ?? value)
          : Array.isArray(value)
            ? value.map(rebind)
            : value && typeof value === 'object'
              ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebind(v)]))
              : value;
      const builtBytes = requestConstructor.prepareMixedFrameworkSurfaceRequest(
        {
          preparation,
          repository: { ...request.payload.repository, rootPath: f.root },
          requestId: request.requestId,
          providerVersion: request.payload.providerVersion,
          providerSnapshotId: request.payload.providerSnapshotId,
          extractorVersion: request.payload.extractorVersion,
          deadlineEpochMs: request.payload.deadlineEpochMs,
          resourceBudget: request.payload.resourceBudget,
          languages: request.payload.languages,
        },
        source.budget,
      );
      assert.ok(Buffer.isBuffer(builtBytes));
      const builtRequest = JSON.parse(builtBytes),
        p = builtRequest.payload;
      const events = saved.syntax.output
        .toString()
        .trim()
        .split('\n')
        .map((line) => rebind(JSON.parse(line)));
      for (const e of events)
        if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(e.type)) {
          e.payload.ownerBinding = structuredClone(p.ownerBinding);
          e.payload.targetSource = structuredClone(p.targetSource);
        }
      const raw = reseal(builtRequest, events);
      assert.deepEqual(raw.requestBytes, builtBytes);
      t.diagnostic(
        'REQUEST: actual private Runtime wire8 constructor from same Stage preparation and Source/Stage ledger',
      );
      step = 'OWNED_WIRE8_TRANSPORT_SHARED_LEDGER';
      dynamicOwner.bindAnalysis(
        session.database,
        capture.handle,
        historyLimits,
        workflowRequest(repositoryId, 'INDEX'),
      );
      const transported = await replayTransport(
        f,
        raw,
        source.budget,
        dynamicOwner.take('SURFACE_V8'),
      );
      assert.deepEqual(
        dynamicFixture.messages.map((m) => m.type),
        Array.from({ length: 9 }, () => ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED']).flat(),
      );
      assert.equal(dynamicOwner.status().executionAuthorized, false);
      t.diagnostic(
        'DYNAMIC_V2: independent synthetic artifact check + genuine same capture/Application authorization + original wire8 issuer claim -> REGISTER/BOUND/INTENT/READY -> ACQUIRED/release; all live authority false',
      );
      t.diagnostic(
        'TRANSPORT: owned Native lifecycle through in-memory process double; actual byte/item/retention deltas returned to same Source/Stage HistoryReadBudget',
      );
      step = 'STAGE_FREEZE';
      const metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
      Object.assign(metadata, {
        targetSource: preparation.targetSource,
        inventory: source.state.files,
        java: null,
      });
      Object.assign(metadata.snapshot, {
        id: p.providerSnapshotId,
        providerId: p.providerId,
        providerVersion: p.providerVersion,
      });
      metadata.codeSyntax.providerVersion = p.providerVersion;
      stage.acceptObservation(owner.ownerHandle, {
        metadata,
        requestBytes: transported.requestBytes,
        outputBytes: transported.outputBytes,
      });
      const frozen = stage.freeze();
      step = 'RUNTIME_ATOMIC_PUBLISH';
      const runtime = new RuntimeFactStore(session.database, repositoryId);
      const before = runtime.readRuntimeBasis(historyLimits);
      assert.equal(before.status, 'UNAVAILABLE');
      const store = new MixedAnalysisStore(session.database);
      const publicationInput = {
        stage,
        lease: frozen.lease,
        store,
        expectedOldRuntime: before.runtimeActivationId,
        routes: [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
        capture: capture.handle,
      };
      const denied = workflowRequest(repositoryId, 'INDEX');
      denied.policy.callerCapabilities = [];
      await assert.rejects(
        prepared.publish({ ...publicationInput, request: denied }),
        /PERMISSION_DENIED/,
      );
      assert.equal(runtime.readRuntimeBasis(historyLimits).status, 'UNAVAILABLE');
      assert.equal(readMixedAnalysisSettlement(store), null);
      const registersBefore = dynamicFixture.messages.filter((m) => m.type === 'REGISTER').length;
      assert.equal(registersBefore, 9);
      if (mode === 'source-drift')
        await fs.appendFile(
          path.join(f.root, original.sourceFiles[0].path),
          '\n#changed after Native\n',
        );
      if (mode === 'head-drift') f.state.head = 'b'.repeat(40);
      if (mode === 'cancel') f.controller.abort();
      if (mode === 'failed-query')
        dynamicFixture.control.beforeReply = (m) => {
          if (m.type === 'RELEASED') {
            m.queryStatus = 'FAILED';
            m.peakWorkingSetBytes = null;
          }
        };
      const pending = prepared.publish({
        ...publicationInput,
        request: workflowRequest(repositoryId, 'INDEX'),
      });
      if (mode !== 'success') {
        await assert.rejects(pending);
        assert.equal(readMixedAnalysisSettlement(store), null);
        assert.equal(runtime.readRuntimeBasis(historyLimits).status, 'UNAVAILABLE');
        assert.equal(source.effects.sourceCommit, 'COMMITTED');
        assert.equal(
          dynamicFixture.messages.filter((m) => m.type === 'REGISTER' && m.role !== 'GIT').length,
          1,
        );
        t.diagnostic('REFUSED_BEFORE_STORE=' + mode);
        dynamicOwner.dispose();
        return;
      }
      const outcome = await pending;
      const registers = dynamicFixture.messages.filter((m) => m.type === 'REGISTER');
      assert.equal(registers.length, 17);
      assert.deepEqual(
        registers.map((m) => [m.role, m.phase]),
        [
          ...Array.from({ length: 8 }, () => ['GIT', 'SOURCE']),
          ['SURFACE_V8', 'ANALYSIS'],
          ...Array.from({ length: 8 }, () => ['GIT', 'ANALYSIS']),
        ],
      );
      assert.ok(registers.slice(9).every((m) => m.contextDigest === registers[8].contextDigest));
      assert.equal(dynamicOwner.status().remaining, 0);
      assert.equal(dynamicOwner.status().status, 'OFFLINE_IDLE');
      assert.throws(() => dynamicOwner.take('SURFACE_V8'));
      dynamicOwner.dispose();
      assert.equal(readMixedAnalysisSettlement(store).status, 'COMMITTED');
      assert.equal(readMixedAnalysisSettlement(store).cleanupFailed, false);
      assert.ok(outcome.runtimeActivationId);
      const result = runtime.traceRuntimeV2(historyLimits);
      assert.equal(result.status, 'CURRENT');
      assert.equal(result.activationId, outcome.runtimeActivationId);
      assert.deepEqual(result.identity.codeBasis, frozen.basis);
      assert.equal(result.candidate.derivation.syntaxContract, 'SYNTAX_BINDING_V4');
      assert.ok(result.candidate.derivation.sitePlan.entries.length > 0);
      assert.equal(result.identity.syntaxActivationId, outcome.syntaxActivationId);
      t.diagnostic(
        'PUBLISHED: actual fixed V5 factories -> Application RuntimeDerivationV2 -> same-lease Code/Syntax/Runtime commit; authoritative reader CURRENT',
      );
    } catch (error) {
      t.diagnostic(
        `INTERFACE_RED step=${step} code=${error.code ?? error.message}; no fallback/schema downgrade/candidate fabrication`,
      );
      throw error;
    } finally {
      try {
        stage?.close();
      } finally {
        try {
          if (capture) releaseActivationContext(session.database, capture.handle);
        } finally {
          try {
            source?.account.invalidate();
          } finally {
            session?.close();
          }
        }
      }
    }
  });
