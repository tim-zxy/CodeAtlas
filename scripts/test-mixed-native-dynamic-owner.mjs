import { releaseActivationContext } from '../packages/storage/dist/analysis/activation-history.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readSurfaceCapture } from '../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { serializedBytes: 0, items: 0 },
});
let api = {};
try {
  api = await import('../packages/providers/dist/native-framework-surface-client.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const error = (c) => (e) => e.code === c;
async function harness(t, mode = 'success', provided) {
  const input =
    provided ??
    (() => {
      const raw = readSurfaceCapture('P5').syntax;
      return { requestBytes: raw.request, expectedOutputBytes: raw.output };
    })();
  const original = cp.spawn,
    events = [],
    writes = [],
    child = new EventEmitter();
  let closed = false;
  Object.assign(child, {
    pid: 12345,
    exitCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  const close = (code = 0, signal = null) => {
    if (closed) return;
    closed = true;
    child.exitCode = code;
    child.stdout.end();
    child.stderr.end();
    events.push('close');
    child.emit('exit', code, signal);
    child.emit('close', code, signal);
  };
  child.kill = () => {
    queueMicrotask(() => close(null, 'SIGTERM'));
    return true;
  };
  child.stdin = new Writable({
    write(chunk, enc, done) {
      writes.push(Buffer.from(chunk));
      events.push('stdin');
      done();
    },
    final(done) {
      done();
      if (mode !== 'no-output')
        queueMicrotask(() => {
          child.stdout.end(mode === 'corrupt' ? Buffer.from('bad\n') : input.expectedOutputBytes);
          child.stderr.end();
          setImmediate(() => close());
        });
    },
  });
  cp.spawn = (file, args, options) => {
    // Simulate Node's own normalization on its private dictionary, not a process.
    if (mode === 'normalize-owned-env') options.env.FIXTURE_NORMALIZED = 'yes';
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    events.push('spawn');
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  syncBuiltinESMExports();
  const keep = setTimeout(() => close(9), 3000);
  t.after(() => {
    clearTimeout(keep);
    cp.spawn = original;
    syncBuiltinESMExports();
  });
  return {
    input,
    events,
    writes,
    child,
    close,
    run: (lifecycle, options = {}, ledger = budget()) =>
      api.default(
        input.requestBytes,
        { executablePath: process.execPath, timeoutMs: 1000, ...options },
        lifecycle,
        ledger,
      ),
  };
}

import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';
import {
  withFrozenStage,
  workflowRequest,
} from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
for (const kind of [
  'success',
  'permission',
  'forged',
  'artifact-drift',
  'replay',
  'late-release',
  'lost-context-BOUND',
  'lost-context-READY',
  'lost-context-ACQUIRED',
])
  test('dynamic owner actual issuer ' + kind, async (t) => {
    await withFrozenStage(t, async ({ f, capture, repositoryId }) => {
      const fixture = await dynamicOwnerFixture(t, repositoryId);
      if (kind === 'late-release') {
        fixture.request.deadlineEpochMs = Date.now() + 2000;
        fixture.control.beforeReply = (message) =>
          message.type === 'RELEASED'
            ? new Promise((resolve) =>
                setTimeout(resolve, Math.max(1, fixture.request.deadlineEpochMs - Date.now() + 10)),
              )
            : undefined;
      }
      if (kind.startsWith('lost-context-'))
        fixture.control.beforeReply = (message) => {
          if (message.type === kind.slice('lost-context-'.length))
            releaseActivationContext(f.db, capture.handle);
        };
      const owner = await fixture.bind(),
        request = workflowRequest(repositoryId, 'INDEX');
      if (kind === 'permission') {
        request.policy.callerCapabilities = [];
        assert.throws(
          () => owner.bindAnalysis(f.db, capture.handle, historyLimits, request),
          /PERMISSION_DENIED/,
        );
        assert.deepEqual(fixture.messages, []);
        return;
      }
      owner.bindAnalysis(f.db, capture.handle, historyLimits, request);
      const life = owner.take('SURFACE_V8');
      if (kind === 'forged') {
        const plan = { ...fixture.request.slots[0].command, stdinSha256: '1'.repeat(64) };
        await assert.rejects(life.beforeSpawn(plan, new AbortController().signal));
        assert.deepEqual(fixture.messages, []);
        return;
      }
      if (kind === 'artifact-drift')
        await fs.appendFile(path.join(fixture.root, 'entry.mjs'), '//drift');
      const h = await harness(t);
      if (kind === 'artifact-drift') {
        await assert.rejects(h.run(life));
        assert.equal(h.events.includes('spawn'), false);
        assert.deepEqual(fixture.messages, []);
        return;
      }
      let actualLife = life;
      if (kind === 'replay') {
        const otherFixture = await dynamicOwnerFixture(t, repositoryId),
          other = await otherFixture.bind();
        other.bindAnalysis(f.db, capture.handle, historyLimits, request);
        const second = other.take('SURFACE_V8');
        actualLife = {
          ...life,
          async beforeSpawn(plan, signal) {
            await life.beforeSpawn(plan, signal);
            await assert.rejects(second.beforeSpawn(plan, signal));
            assert.deepEqual(otherFixture.messages, []);
          },
        };
      }
      if (kind === 'late-release') {
        let recordedClose;
        // Obtain a genuine acquired lifecycle, then isolate its release wait from the
        // outer Native client's separate timeout; no plan or child identity is fabricated.
        await h.run(
          {
            ...actualLife,
            async afterClose(close) {
              recordedClose = close;
            },
            async dispose() {},
          },
          { timeoutMs: 5000 },
        );
        assert.equal(owner.status().status, 'PENDING');
        await assert.rejects(actualLife.afterClose(recordedClose, new AbortController().signal));
        await actualLife.dispose(new AbortController().signal);
        assert.equal(owner.status().status, 'FAILED');
        return;
      }
      if (kind.startsWith('lost-context-')) {
        await assert.rejects(h.run(actualLife));
        assert.equal(h.events.includes('stdin'), false);
        assert.equal(owner.status().status, 'FAILED');
        return;
      }
      const result = await h.run(actualLife);
      assert.equal(result.observation.request.protocolVersion, 8);
      assert.deepEqual(
        fixture.messages.map((m) => m.type),
        ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'],
      );
      assert.equal(owner.status().status, 'OFFLINE_IDLE');
      for (const flag of [
        'executionAuthorized',
        'productionAdmission',
        'measurementEligible',
        'contextAuthenticated',
        'moduleClosureAuthenticated',
        'liveTransportConnected',
      ])
        assert.equal(owner.status()[flag], false);
      const b = owner.bootstrap(),
        slot = b.slots[0];
      assert.equal(slot.role, 'SURFACE_V8');
      assert.ok(slot.canonicalPrefix.endsWith('"stdinSha256":"'));
    });
  });
test('independent expected manifest rejects mismatch before stream ownership', async (t) => {
  const f = await dynamicOwnerFixture(t, 'repo:owned');
  f.request.manifestSha256 = '0'.repeat(64);
  await assert.rejects(f.bind());
  assert.equal(f.incoming.listenerCount('data'), 0);
  assert.equal(f.outgoing.listenerCount('drain'), 0);
});

test('dynamic SOURCE registration consumes the actual controlled Git issuer without running Git', async (t) => {
  const { setup, makeAccount } =
    await import('../packages/source/test/fixtures/mixed-source-git-double.mjs');
  const { gitIgnoredPathsControlled, validateGitQualification } =
    await import('../packages/source/dist/git.js');
  const f = await setup(t),
    fixed = validateGitQualification({
      executablePath: process.execPath,
      environment: {},
      createLifecycle() {
        throw Error('shape only');
      },
    });
  f.state.expectedExecutable = process.execPath;
  const fixture = await dynamicOwnerFixture(t, 'repo:owned');
  fixture.request.slots = [
    {
      launchId: 'ignore',
      role: 'GIT',
      phase: 'SOURCE',
      command: {
        executablePath: process.execPath,
        arguments: ['-C', f.root, 'check-ignore', '--no-index', '-z', '--stdin'],
        environment: fixed.environment,
        cwd: process.cwd(),
      },
    },
  ];
  const owner = await fixture.bind(),
    account = makeAccount(f.controller.signal);
  const ignored = await gitIgnoredPathsControlled(f.root, ['src/app.py'], account.account, {
    ...f.control,
    qualification: {
      executablePath: process.execPath,
      environment: {},
      createLifecycle() {
        return owner.take('GIT');
      },
    },
  });
  assert.equal(ignored.size, 0);
  assert.equal(f.state.calls, 1);
  assert.equal(f.state.closes, 1);
  assert.deepEqual(
    fixture.messages.map((m) => m.type),
    ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'],
  );
  assert.equal(fixture.messages[0].phase, 'SOURCE');
  assert.equal(owner.status().status, 'OFFLINE_IDLE');
  assert.equal(owner.status().executionAuthorized, false);
});

for (const phase of ['bind', 'ready', 'release'])
  test('Application bound control cancellation refuses at ' + phase, async (t) => {
    await withFrozenStage(t, async ({ f, capture, repositoryId }) => {
      const fixture = await dynamicOwnerFixture(t, repositoryId),
        owner = await fixture.bind(),
        request = workflowRequest(repositoryId, 'INDEX'),
        controller = new AbortController();
      request.control.signal = controller.signal;
      if (phase === 'bind') {
        controller.abort();
        assert.throws(() => owner.bindAnalysis(f.db, capture.handle, historyLimits, request));
        assert.deepEqual(fixture.messages, []);
        return;
      }
      owner.bindAnalysis(f.db, capture.handle, historyLimits, request);
      fixture.control.beforeReply = (m) => {
        if (m.type === (phase === 'ready' ? 'READY' : 'RELEASED')) controller.abort();
      };
      const h = await harness(t);
      await assert.rejects(h.run(owner.take('SURFACE_V8')));
      if (phase === 'ready') assert.equal(h.events.includes('spawn'), false);
      assert.equal(owner.status().status, 'FAILED');
    });
  });
