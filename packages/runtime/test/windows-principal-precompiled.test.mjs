import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const childLane = process.execArgv.includes('--experimental-test-module-mocks');
if (!childLane) {
  test('precompiled preparation isolated DATA-only lane (never PowerShell or Query)', () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(
      process.execPath,
      [
        '--experimental-test-module-mocks',
        '--test',
        '--test-reporter=tap',
        fileURLToPath(import.meta.url),
      ],
      {
        env,
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1000000,
      },
    );
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const summary of ['tests 8', 'pass 8', 'fail 0', 'cancelled 0', 'skipped 0', 'todo 0'])
      assert.ok(r.stdout.split(/\r?\n/).includes('# ' + summary), r.stdout + r.stderr);
  });
} else {
  const win = (...parts) => parts.join(String.fromCharCode(92));
  const digest = 'a'.repeat(64);
  const root = win(
    'C:',
    'Users',
    'TEST_DOUBLE',
    'AppData',
    'Local',
    'Programs',
    'CodeAtlas',
    'releases',
    'release-' + digest,
  );
  const sha = '4ee3e48cfa2f6c4d883a983a2f7b5739ecf7b01d515c94cecbed9f87e3bb7147';
  let state;
  // Explicit DATA substitute only. This does not exercise closed-package FS gates,
  // authenticate a release, or turn these zero fixture bytes into the pinned DLL.
  await mock.module(new URL('../dist/closed-runtime-package.js', import.meta.url).href, {
    exports: {
      async readClosedRuntimePackage(actualRoot, relative, expectedSha, limits) {
        state.reads++;
        assert.equal(actualRoot, root);
        assert.equal(
          relative,
          `packages/runtime/dist/principal/win32-x64/${sha}/windows-process-principal.dll`,
        );
        assert.equal(expectedSha, sha);
        assert.equal(limits.maxFileBytes, 100000);
        assert.equal(limits.maxItems, 1000);
        assert.equal(limits.maxDepth, 20);
        assert.equal(limits.check(), undefined);
        return {
          root: state.mode === 'root' ? win('C:', 'OTHER') : root,
          manifestBytes: Buffer.from('TEST_DOUBLE_MANIFEST'),
          artifactBytes: Buffer.alloc(state.mode === 'length' ? 6655 : 6656),
          contentDigest: state.mode === 'digest' ? 'b'.repeat(64) : digest,
          async recheck() {
            state.rechecks++;
            if (state.mode === 'recheck-fail') throw Error('TEST_DOUBLE_METADATA_DRIFT');
          },
        };
      },
    },
  });
  await mock.module('node:url', {
    exports: {
      fileURLToPath(url) {
        assert.ok(url instanceof URL);
        return state.mode === 'development'
          ? win('D:', 'workspace', 'CodeAtlas-phase1-20261106')
          : root;
      },
    },
  });
  const api = await import('../dist/windows-principal-precompiled.js');
  function fixture(mode = 'success') {
    state = { mode, reads: 0, rechecks: 0, checks: 0, stopped: false };
    return {
      maxInputBytes: 100000,
      maxItems: 1000,
      maxDepth: 20,
      deadlineEpochMs: Date.now() + 10000,
      check() {
        state.checks++;
        if (state.stopped) throw Error('TEST_DOUBLE_STOPPED');
      },
    };
  }
  test('fixed preparation returns detached bounded stdin DATA, never a Principal', async () => {
    const result = await api.preparePrecompiledPrincipal(fixture());
    assert.deepEqual(Object.keys(result).sort(), ['payload', 'program', 'recheck']);
    assert.deepEqual(Object.keys(result.payload).sort(), [
      'artifactBase64',
      'deadlineEpochMs',
      'deploymentRoot',
      'manifestBase64',
      'maxDepth',
      'maxInputBytes',
      'maxItems',
    ]);
    assert.equal(result.payload.deploymentRoot, root);
    const bytes = Buffer.from(result.payload.artifactBase64, 'base64');
    assert.equal(bytes.length, 6656);
    assert.notEqual(
      createHash('sha256').update(bytes).digest('hex'),
      sha,
      'fixture bytes are not a real artifact',
    );
    assert.equal(
      Buffer.from(result.payload.manifestBase64, 'base64').toString(),
      'TEST_DOUBLE_MANIFEST',
    );
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.payload));
    assert.ok(result.program.includes(api.principalAssemblyLoader));
  });
  test('real development/self-owned checkout refuses before package read', async () => {
    await assert.rejects(api.preparePrecompiledPrincipal(fixture('development')));
    assert.equal(state.reads, 0);
  });
  for (const mode of ['digest', 'length', 'root'])
    test('preparation refuses closed DATA mismatch ' + mode, async () => {
      await assert.rejects(api.preparePrecompiledPrincipal(fixture(mode)));
      assert.equal(state.reads, 1);
    });
  test('readonly recheck remains possible after cancellation/expiry and surfaces metadata drift', async () => {
    const options = fixture(),
      result = await api.preparePrecompiledPrincipal(options),
      before = state.checks;
    state.stopped = true;
    options.deadlineEpochMs = 1;
    await result.recheck();
    assert.equal(state.checks, before);
    assert.equal(state.rechecks, 1);
    state.mode = 'recheck-fail';
    await assert.rejects(result.recheck(), /TEST_DOUBLE_METADATA_DRIFT/);
  });
  test('options cannot select paths/hashes or execute getters; expired preparation refuses', async () => {
    const options = fixture();
    await assert.rejects(api.preparePrecompiledPrincipal({ ...options, deploymentRoot: root }));
    let called = false;
    const accessor = { ...options };
    Object.defineProperty(accessor, 'maxItems', {
      enumerable: true,
      get() {
        called = true;
        return 1000;
      },
    });
    await assert.rejects(api.preparePrecompiledPrincipal(accessor));
    assert.equal(called, false);
    await assert.rejects(api.preparePrecompiledPrincipal({ ...options, deadlineEpochMs: 1 }));
    assert.equal(state.reads, 0);
  });
  test('loader export is fixed inert text without identity/ACL/compilation entry', () => {
    assert.equal(typeof api.principalAssemblyLoader, 'string');
    for (const text of ['Assembly]::Load($artifact)', sha, '6656', 'GetReferencedAssemblies'])
      assert.ok(api.principalAssemblyLoader.includes(text));
    for (const text of ['GetCurrent', "GetMethod('Query')", 'Get-Acl', 'Add-Type', 'Start-Process'])
      assert.equal(api.principalAssemblyLoader.includes(text), false);
  });
}
