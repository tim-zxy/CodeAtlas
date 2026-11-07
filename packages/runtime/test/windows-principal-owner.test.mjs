import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const childLane = process.execArgv.includes('--experimental-test-module-mocks');
const cases = [
  'host',
  'helper',
  'post-host',
  'nonce',
  'pid',
  'stderr',
  'eof',
  'nonzero',
  'output',
  'cleanup',
];
if (!childLane) {
  test('principal owner isolated TEST_DOUBLE binding gates (no identity query)', () => {
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
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1000000,
        env,
      },
    );
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const line of ['tests 18', 'pass 18', 'fail 0', 'cancelled 0', 'skipped 0', 'todo 0'])
      assert.ok(r.stdout.split(/\r?\n/).includes('# ' + line), r.stdout + r.stderr);
  });
} else {
  const realFs = await import('node:fs/promises');
  const crypto = await import('node:crypto');
  const { EventEmitter } = await import('node:events');
  const { PassThrough, Writable } = await import('node:stream');
  const turn = () => new Promise(setImmediate);
  const win = (...parts) => parts.join(String.fromCharCode(92));
  const host = win('C:', 'Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const hostBytes = Buffer.from('TEST_DOUBLE_FIXED_HOST_BYTES');
  const directory = win('C:', 'TEST_DOUBLE_TEMP', 'codeatlas-principal-fixture');
  const nonce = '12345678-1234-4234-8234-123456789abc';
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  let f,
    serial = 0;
  const stat = (isHost) => ({
    dev: 1,
    ino: isHost ? 1 : 2,
    size: isHost ? hostBytes.length : 0,
    nlink: 1,
    isFile: () => isHost,
    isDirectory: () => !isHost,
    isSymbolicLink: () => false,
  });
  await mock.module('node:crypto', {
    exports: {
      randomUUID: () => nonce,
      createHash(...args) {
        const real = crypto.createHash(...args);
        let fakeHost = false;
        return {
          update(bytes) {
            fakeHost = Buffer.isBuffer(bytes) && bytes.equals(hostBytes);
            real.update(bytes);
            return this;
          },
          digest(encoding) {
            return fakeHost
              ? '60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f'
              : real.digest(encoding);
          },
        };
      },
    },
  });
  await mock.module('node:os', { defaultExport: { tmpdir: () => win('C:', 'TEST_DOUBLE_TEMP') } });
  await mock.module('node:fs/promises', {
    defaultExport: {
      async realpath(p) {
        assert.equal(p, host);
        return host;
      },
      async lstat(p) {
        assert.ok(
          p === host || p === directory || p.startsWith(directory + String.fromCharCode(92)),
        );
        return stat(p === host);
      },
      async readFile(p) {
        if (p instanceof URL) {
          assert.equal(
            p.href,
            new URL('../../../scripts/windows-process-principal.cs', import.meta.url).href,
          );
          const bytes = await realFs.readFile(p);
          return f.mode === 'helper' ? Buffer.concat([bytes, Buffer.from('tampered')]) : bytes;
        }
        assert.equal(p, host);
        f.hostReads++;
        return f.mode === 'host' || (f.mode === 'post-host' && f.hostReads > 1)
          ? Buffer.from('UNPINNED_TEST_DOUBLE')
          : Buffer.from(hostBytes);
      },
      async mkdtemp(prefix) {
        assert.equal(prefix, win('C:', 'TEST_DOUBLE_TEMP', 'codeatlas-principal-'));
        f.onMkdtemp?.();
        return directory;
      },
      async readdir(p) {
        assert.ok(p === directory || p.startsWith(directory + String.fromCharCode(92)));
        return f.mode === 'depth' ? [{ name: 'nested', isSymbolicLink: () => false }] : [];
      },
      async rm(p, options) {
        assert.equal(p, directory);
        assert.deepEqual(options, { recursive: true });
        f.cleanups++;
        if (f.mode === 'cleanup') throw Error('TEST_DOUBLE cleanup refused');
      },
    },
  });
  await mock.module('node:child_process', {
    defaultExport: {
      spawn(file, args, options) {
        f.spawns++;
        assert.equal(file, host);
        assert.deepEqual(args.slice(0, 4), [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
        ]);
        assert.equal(options.shell, false);
        assert.equal(options.windowsHide, true);
        assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
        assert.equal(options.cwd, win('C:', 'Windows', 'System32', 'WindowsPowerShell', 'v1.0'));
        assert.equal(options.env.TEMP, directory);
        assert.equal(options.env.PATH, '');
        assert.equal(Object.hasOwn(options.env, 'NODE_OPTIONS'), false);
        const child = new EventEmitter();
        child.pid = 4242;
        child.spawnfile = host;
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        f.child = child;
        child.stdin = new Writable({
          write(chunk, _encoding, cb) {
            f.input = JSON.parse(chunk.toString());
            cb();
          },
          final(cb) {
            cb();
            queueMicrotask(() => {
              assert.equal(f.input.pid, process.pid);
              assert.equal(f.input.challenge, nonce);
              assert.equal(f.input.tempPath, directory);
              const reply = {
                schema: 'codeatlas.windows-process-principal',
                version: 1,
                pid: f.mode === 'pid' ? process.pid + 1 : process.pid,
                creationTimeFileTime: '133000000000000001',
                sid: 'S-1-5-21-1-2-3-1001',
                challenge: f.mode === 'nonce' ? 'bad' : nonce,
              };
              child.stdout.write(
                f.mode === 'output'
                  ? Buffer.alloc(5000, 65)
                  : Buffer.from(JSON.stringify(reply) + '\n'),
              );
              if (f.mode === 'stderr') child.stderr.write('TEST_DOUBLE diagnostic');
              f.close = () => {
                if (f.mode !== 'eof') child.stdout.end();
                child.stderr.end();
                setImmediate(() => child.emit('close', f.mode === 'nonzero' ? 1 : 0, null));
              };
              if (!f.hold) f.close();
            });
          },
        });
        queueMicrotask(() => child.emit('spawn'));
        return child;
      },
    },
  });
  async function fixture(t, mode = 'success', hold = false) {
    f = { mode, hold, spawns: 0, cleanups: 0, hostReads: 0 };
    const api = await import(
      new URL('../dist/windows-principal-owner.js?TEST_DOUBLE=' + serial++, import.meta.url)
    );
    const controller = new AbortController();
    const control = {
      signal: controller.signal,
      deadlineEpochMs: Date.now() + 10000,
      maxItems: 20,
      maxDepth: 8,
    };
    const limits = { maxInputBytes: 100000, maxOutputBytes: 1024 };
    const state = f;
    t.after(() => {
      state.child?.stdin.destroy();
      state.child?.stdout.destroy();
      state.child?.stderr.destroy();
    });
    return {
      api,
      controller,
      control,
      limits,
      state,
      acquire: () => api.acquireCurrentWindowsPrincipal(control, limits),
    };
  }
  const unavailable = (e) => e.code === 'WINDOWS_PRINCIPAL_UNAVAILABLE';
  async function ready(x, pending) {
    // Observe early failure while bounding the synthetic scheduling wait.
    pending.catch(() => {});
    for (let i = 0; i < 50 && !x.state.close; i++) await turn();
    assert.equal(typeof x.state.close, 'function');
  }
  test('opaque principal waits for close EOF host recheck and exact cleanup; rejects clones DTO released and foreign incarnation', async (t) => {
    const x = await fixture(t, 'success', true);
    let resolved = false;
    const pending = x.acquire().then((h) => {
      resolved = true;
      return h;
    });
    await ready(x, pending);
    assert.equal(resolved, false);
    assert.equal(x.state.cleanups, 0);
    x.state.close();
    const handle = await pending;
    assert.equal(x.state.cleanups, 1);
    assert.equal(x.state.hostReads, 2);
    assert.equal(Object.getPrototypeOf(handle), null);
    assert.ok(Object.isFrozen(handle));
    x.api.assertCurrentWindowsPrincipal(handle);
    for (const fake of [{ ...handle }, x.state.input, new Proxy(handle, {})])
      assert.throws(() => x.api.assertCurrentWindowsPrincipal(fake), unavailable);
    const other = await import(
      new URL('../dist/windows-principal-owner.js?TEST_DOUBLE=foreign' + serial++, import.meta.url)
    );
    assert.throws(() => other.assertCurrentWindowsPrincipal(handle), unavailable);
    x.api.releaseCurrentWindowsPrincipal(handle);
    x.api.releaseCurrentWindowsPrincipal(handle);
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(handle), unavailable);
  });
  for (const mode of cases)
    test('owner refuses TEST_DOUBLE ' + mode + ' without any principal', async (t) => {
      const x = await fixture(t, mode);
      await assert.rejects(x.acquire(), unavailable);
      if (mode === 'host' || mode === 'helper') assert.equal(x.state.spawns, 0);
      if (mode === 'cleanup' || mode === 'nonzero' || mode === 'eof')
        await assert.rejects(x.acquire(), unavailable);
      await turn();
    });
  test('cancel retains busy ownership until normal close and cleanup', async (t) => {
    const x = await fixture(t, 'success', true);
    const pending = x.acquire();
    const rejection = assert.rejects(
      pending,
      (e) => unavailable(e) && e.cleanupState === 'UNKNOWN',
    );
    await ready(x, pending);
    x.controller.abort();
    await rejection;
    await assert.rejects(x.acquire(), unavailable);
    assert.equal(x.state.cleanups, 0);
    x.state.close();
    await turn();
    await turn();
    assert.equal(x.state.cleanups, 1);
  });
  test('caller cannot supply source host hashes or extra contexts', async (t) => {
    const x = await fixture(t);
    await assert.rejects(
      x.api.acquireCurrentWindowsPrincipal({ ...x.control, source: 'untrusted' }, x.limits),
      unavailable,
    );
    await assert.rejects(
      x.api.acquireCurrentWindowsPrincipal(x.control, { ...x.limits, hostPath: 'untrusted' }),
      unavailable,
    );
    assert.equal(x.state.spawns, 0);
  });
  test('cleanup observes maxDepth and refuses an overdeep owned tree', async (t) => {
    const x = await fixture(t, 'depth');
    x.control.maxDepth = 1;
    await assert.rejects(x.acquire(), (e) => unavailable(e) && e.cleanupState === 'UNKNOWN');
    assert.equal(x.state.cleanups, 0);
    await assert.rejects(x.acquire(), unavailable);
  });
  test('old principal is permanently invalid after unknown cleanup even after normal settlement', async (t) => {
    const x = await fixture(t);
    const old = await x.acquire();
    x.state.hold = true;
    x.state.close = undefined;
    const controller = new AbortController(),
      control = { ...x.control, signal: controller.signal };
    const pending = x.api.acquireCurrentWindowsPrincipal(control, x.limits);
    const rejected = assert.rejects(pending, (e) => unavailable(e) && e.cleanupState === 'UNKNOWN');
    await ready(x, pending);
    controller.abort();
    await rejected;
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(old), unavailable);
    x.state.close();
    for (let i = 0; i < 5; i++) await turn();
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(old), unavailable);
    x.state.hold = false;
    const fresh = await x.acquire();
    x.api.assertCurrentWindowsPrincipal(fresh);
    x.api.releaseCurrentWindowsPrincipal(old);
    x.api.releaseCurrentWindowsPrincipal(fresh);
  });
  test('own AbortSignal method getters cannot swallow cancellation or revive an old epoch', async (t) => {
    const x = await fixture(t),
      old = await x.acquire();
    x.state.hold = true;
    x.state.close = undefined;
    const controller = new AbortController();
    let getterCalls = 0;
    for (const name of ['addEventListener', 'removeEventListener'])
      Object.defineProperty(controller.signal, name, {
        configurable: true,
        get() {
          getterCalls++;
          return () => {};
        },
      });
    const pending = x.api.acquireCurrentWindowsPrincipal(
      { ...x.control, signal: controller.signal },
      x.limits,
    );
    let rejectedImmediately = false;
    const rejected = assert
      .rejects(pending, (e) => unavailable(e) && e.cleanupState === 'UNKNOWN')
      .then(() => {
        rejectedImmediately = true;
      });
    await ready(x, pending);
    controller.abort();
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(old), unavailable);
    await turn();
    assert.equal(
      rejectedImmediately,
      true,
      'abort must reject without waiting for deadline or child close',
    );
    await rejected;
    assert.equal(getterCalls, 0);
    x.state.close();
    for (let i = 0; i < 5; i++) await turn();
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(old), unavailable);
    x.state.hold = false;
    const fresh = await x.acquire();
    x.api.assertCurrentWindowsPrincipal(fresh);
    x.api.releaseCurrentWindowsPrincipal(old);
    x.api.releaseCurrentWindowsPrincipal(fresh);
    assert.equal(getterCalls, 0);
  });
  test('abort during mkdtemp preserves unverified directory without spawn or recursive removal', async (t) => {
    const x = await fixture(t);
    x.state.onMkdtemp = () => x.controller.abort();
    await assert.rejects(x.acquire(), (e) => unavailable(e) && e.cleanupState === 'UNKNOWN');
    assert.equal(x.state.spawns, 0);
    assert.equal(x.state.cleanups, 0);
    await assert.rejects(x.acquire(), unavailable);
    assert.equal(x.state.spawns, 0);
    assert.equal(x.state.cleanups, 0);
  });
  test('observed deadline cannot be revived by wall clock rollback', async (t) => {
    const x = await fixture(t),
      handle = await x.acquire(),
      now = Date.now;
    t.after(() => {
      Date.now = now;
    });
    Date.now = () => now() + 20000;
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(handle), unavailable);
    Date.now = () => now() - 20000;
    assert.throws(() => x.api.assertCurrentWindowsPrincipal(handle), unavailable);
    x.api.releaseCurrentWindowsPrincipal(handle);
  });
  test.after(() => Object.defineProperty(process, 'platform', originalPlatform));
}
