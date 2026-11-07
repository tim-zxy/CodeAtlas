import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as guardTimeout, clearTimeout as clearGuardTimeout } from 'node:timers';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setup, expected, cases, makeAccount } from './fixtures/mixed-source-git-double.mjs';
let api = {};
try {
  api = (await import('../dist/mixed-source-workflow.js')).default;
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const code = (c) => (e) => e.code === c;
test('A2 private mixed Source API exists', async () => {
  assert.equal(typeof api.observeMixedGitWorktree, 'function');
  assert.equal((await import('../dist/index.js')).observeMixedGitWorktree, undefined);
});
test('A2 complete Source observation retains OTHER Unicode and excludes denied paths', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal);
  const result = await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.deepEqual(
    result.files.map(({ path, languageHint, classification, contentFingerprint, sizeBytes }) => ({
      path,
      languageHint,
      role: classification.role,
      contentFingerprint,
      sizeBytes,
    })),
    expected.files,
  );
  assert.equal(result.rootPath, f.root);
  assert.equal(f.state.calls, f.state.closes);
  assert.ok(a.usage.reads > expected.files.reduce((n, x) => n + x.sizeBytes, 0));
});
for (const change of cases.selectionChanges)
  test('A2 selection rejects ' + change, async (t) => {
    const f = await setup(t),
      a = makeAccount(f.control.signal),
      before = await api.observeMixedGitWorktree(f.request, a.account, f.control);
    if (change === 'added') await fs.writeFile(path.join(f.root, 'new.py'), 'pass\n');
    if (change === 'removed') await fs.unlink(path.join(f.root, 'app.py'));
    if (change === 'bytes') await fs.writeFile(path.join(f.root, 'app.py'), 'pass\n');
    if (change === 'ignored') f.state.ignored.add('app.py');
    if (change === 'excluded') f.request.config.exclude.push('app.py');
    if (change === 'head') f.state.head = 'b'.repeat(40);
    if (change === 'branch') f.state.branch = 'other';
    await assert.rejects(
      api.verifyMixedSourceSelection(f.request, before, a.account, f.control),
      code('SOURCE_CHANGED'),
    );
    assert.equal(a.usage.invalid, true);
  });
test('A2 selection permits unchanged inventory and does not reset accounting', async (t) => {
  const f = await setup(t),
    a = makeAccount(),
    before = await api.observeMixedGitWorktree(f.request, a.account, f.control),
    bytes = a.usage.reads;
  await api.verifyMixedSourceSelection(f.request, before, a.account, f.control);
  assert.ok(a.usage.reads > bytes);
});
test('A2 include overrides ignore/default but hard deny remains', async (t) => {
  const f = await setup(t),
    a = makeAccount();
  f.state.ignored.add('app.py');
  f.request.config.include = ['app.py', 'build/**', '.env'];
  const result = await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.ok(result.files.some((x) => x.path === 'app.py'));
  assert.ok(result.files.some((x) => x.path === 'build/hidden.py'));
  assert.ok(!result.files.some((x) => x.path === '.env'));
});
test('A2 legacy Python classification remains unchanged', async () => {
  const old = await import('../dist/classify.js');
  for (const x of cases.classification) {
    const b = Buffer.from('pass\n');
    assert.equal(old.classifySample(x.path, b, b.length).languageHint, x.legacyLanguage);
  }
});
for (const kind of ['exit', 'overflow', 'cancel', 'timeout'])
  test('A2 controlled Git ' + kind + ' closes before refusal', async (t) => {
    const f = await setup(t),
      a = makeAccount(f.control.signal);
    f.state.mode = ['cancel', 'timeout'].includes(kind) ? 'hang' : kind;
    if (kind === 'timeout') f.control.deadlineEpochMs = Date.now() + 25;
    const pending = api.observeMixedGitWorktree(f.request, a.account, f.control);
    if (kind === 'cancel') setImmediate(() => f.controller.abort());
    await assert.rejects(
      pending,
      kind === 'cancel'
        ? code('CANCELLED')
        : kind === 'timeout'
          ? code('DEADLINE_EXCEEDED')
          : () => true,
    );
    assert.equal(f.state.calls, f.state.closes);
    assert.equal(a.usage.invalid, true);
  });
test('A2 pre-abort has zero Git or file observation', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal);
  f.controller.abort();
  await assert.rejects(
    api.observeMixedGitWorktree(f.request, a.account, f.control),
    code('CANCELLED'),
  );
  assert.equal(f.state.calls, 0);
});
test('A2 selected hardlink is refused', async (t) => {
  const f = await setup(t),
    a = makeAccount();
  await fs.link(path.join(f.root, 'app.py'), path.join(f.root, 'linked.py'));
  await assert.rejects(api.observeMixedGitWorktree(f.request, a.account, f.control));
  assert.equal(a.usage.invalid, true);
});

test('A2 Git output pipe failure is owned and closes before refusal', async (t) => {
  const f = await setup(t),
    a = makeAccount();
  f.state.mode = 'stream-error';
  f.control.deadlineEpochMs = Date.now() + 100;
  await assert.rejects(api.observeMixedGitWorktree(f.request, a.account, f.control));
  assert.equal(f.state.calls, f.state.closes);
  assert.equal(a.usage.invalid, true);
});
test('A2 default-excluded directory junction stays outside mixed Source', async (t) => {
  const f = await setup(t),
    a = makeAccount();
  await fs.rm(path.join(f.root, 'build'), { recursive: true });
  try {
    await fs.symlink(
      path.join(f.root, 'tests'),
      path.join(f.root, 'build'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (e) {
    if (e.code === 'EPERM') {
      t.todo('OS cannot create owned directory link');
      return;
    }
    throw e;
  }
  const result = await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.ok(!result.files.some((x) => x.path.startsWith('build/')));
});
test('A2 per-file RAW authorization occurs before any fingerprint read', async (t) => {
  const f = await setup(t),
    a = makeAccount(),
    seen = [],
    original = fs.open;
  let opens = 0;
  fs.open = async (...args) => {
    opens++;
    return original(...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      api.observeMixedGitWorktree(f.request, a.account, {
        ...f.control,
        authorizePath(p) {
          seen.push(p);
          throw Object.assign(Error('DENIED'), { code: 'PERMISSION_DENIED' });
        },
      }),
      (e) => e.code === 'PERMISSION_DENIED',
    );
  } finally {
    fs.open = original;
    syncBuiltinESMExports();
  }
  assert.equal(seen.length, 1);
  assert.equal(opens, 0);
});

test('A2 Git-ignored directory junction stays outside mixed Source', async (t) => {
  const f = await setup(t),
    a = makeAccount();
  f.state.ignored.add('linked');
  try {
    await fs.symlink(
      path.join(f.root, 'tests'),
      path.join(f.root, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (e) {
    if (e.code === 'EPERM') {
      t.todo('OS cannot create owned directory link');
      return;
    }
    throw e;
  }
  const result = await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.ok(!result.files.some((x) => x.path.startsWith('linked/')));
});

// setup installs a self-contained EventEmitter Git double; no forwarding spawn.
test('A2 private pinned Git gate precedes every spawn and preserves close ownership', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal);
  let plannedEnvironment;
  let ready = false,
    before = 0,
    after = 0,
    disposed = 0;
  f.state.expectedExecutable = process.execPath;
  f.state.spawnAudit = (_file, _args, options) => {
    assert.equal(ready, true);
    ready = false;
    assert.equal(options.env, plannedEnvironment);
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    for (const key of [
      'HOMEDRIVE',
      'HOMEPATH',
      'LOGONSERVER',
      'PATH',
      'SYSTEMDRIVE',
      'SYSTEMROOT',
      'TEMP',
      'USERDOMAIN',
      'USERNAME',
      'USERPROFILE',
      'WINDIR',
      'NODE_V8_COVERAGE',
    ])
      assert.equal(options.env[key], '');
  };
  f.control.qualification = {
    executablePath: process.execPath,
    environment: { GIT_TERMINAL_PROMPT: '0' },
    createLifecycle(plan) {
      plannedEnvironment = plan.environment;
      assert.equal(plan.executablePath, process.execPath);
      assert.ok(
        Object.isFrozen(plan) &&
          Object.isFrozen(plan.arguments) &&
          Object.isFrozen(plan.environment),
      );
      assert.equal(plan.arguments[0], '-C');
      assert.match(plan.stdinSha256, /^[a-f0-9]{64}$/);
      return {
        async beforeSpawn(p) {
          assert.equal(p, plan);
          assert.equal(ready, false);
          ready = true;
          before++;
        },
        async beforeInput(child) {
          assert.equal(child.executablePath, process.execPath);
          assert.ok(child.pid > 0);
        },
        async afterClose() {
          assert.ok(f.state.closes > after);
          after++;
        },
        async dispose() {
          disposed++;
        },
      };
    },
  };
  const v = await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.equal(v.rootPath, f.root);
  assert.ok(before > 0);
  assert.equal(before, f.state.calls);
  assert.equal(after, before);
  assert.equal(disposed, before);
});
for (const mode of ['reject', 'cancel', 'timeout'])
  test('A2 qualification beforeSpawn ' + mode + ' cannot launch Git', async (t) => {
    const f = await setup(t),
      a = makeAccount(f.control.signal);
    let disposed = 0;
    if (mode === 'timeout') f.control.deadlineEpochMs = Date.now() + 30;
    f.control.qualification = {
      executablePath: process.execPath,
      environment: {},
      createLifecycle() {
        return {
          async beforeSpawn(_plan, signal) {
            if (mode === 'reject') throw Error('SENSITIVE_SENTINEL');
            if (mode === 'cancel') setImmediate(() => f.controller.abort());
            await new Promise((r) =>
              signal.aborted ? r() : signal.addEventListener('abort', r, { once: true }),
            );
          },
          async beforeInput() {
            assert.fail('no child');
          },
          async afterClose() {
            assert.fail('no close');
          },
          async dispose() {
            disposed++;
          },
        };
      },
    };
    await assert.rejects(
      api.observeMixedGitWorktree(f.request, a.account, f.control),
      code(
        mode === 'cancel' ? 'CANCELLED' : mode === 'timeout' ? 'DEADLINE_EXCEEDED' : 'GIT_FAILED',
      ),
    );
    assert.equal(f.state.calls, 0);
    assert.equal(disposed, 1);
    assert.equal(a.usage.invalid, true);
  });
test('A2 relative qualification executable cannot fall back to PATH', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal);
  f.control.qualification = {
    executablePath: 'git',
    environment: {},
    createLifecycle() {
      assert.fail('invalid binding');
    },
  };
  await assert.rejects(
    api.observeMixedGitWorktree(f.request, a.account, f.control),
    code('GIT_FAILED'),
  );
  assert.equal(f.state.calls, 0);
});

async function boundedGitOutcome(p) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_r, j) => (timer = guardTimeout(() => j(Error('UNBOUNDED_GUARD')), 200))),
    ]);
  } finally {
    clearGuardTimeout(timer);
  }
}
for (const stage of ['afterClose', 'dispose'])
  test(
    'A2 qualified hanging ' + stage + ' yields deadline refusal with unknown cleanup',
    async (t) => {
      const f = await setup(t),
        a = makeAccount(f.control.signal);
      let disposed = 0,
        entered = 0;
      // Advance only once the actual hanging hook is entered, independent of host scheduling.
      t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
      f.control.deadlineEpochMs = Date.now() + 30;
      f.control.qualification = {
        executablePath: process.execPath,
        environment: {},
        createLifecycle() {
          return {
            async beforeSpawn() {},
            async beforeInput() {},
            async afterClose() {
              if (stage === 'afterClose') {
                entered++;
                t.mock.timers.tick(30);
                await new Promise(() => {});
              }
            },
            async dispose() {
              disposed++;
              if (stage === 'dispose') {
                entered++;
                t.mock.timers.tick(30);
                await new Promise(() => {});
              }
            },
          };
        },
      };
      f.state.expectedExecutable = process.execPath;
      await assert.rejects(
        boundedGitOutcome(api.observeMixedGitWorktree(f.request, a.account, f.control)),
        (error) => {
          assert.equal(error.code, 'DEADLINE_EXCEEDED');
          assert.equal(error.cleanupState, 'UNKNOWN');
          return true;
        },
      );
      assert.equal(entered, 1);
      assert.equal(disposed, 1);
      assert.equal(f.state.calls, 1);
      assert.equal(f.state.calls, f.state.closes);
    },
  );

test('A2 frozen observer error cannot skip dispose or replace safe primary', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal),
    { SourceScanError } = await import('../dist/errors.js'),
    frozen = Object.freeze(new SourceScanError('GIT_FAILED', 'fixture frozen'));
  let disposed = 0;
  f.state.expectedExecutable = process.execPath;
  f.control.qualification = {
    executablePath: process.execPath,
    environment: {},
    createLifecycle() {
      return {
        async beforeSpawn() {},
        async beforeInput() {},
        async afterClose() {
          throw frozen;
        },
        async dispose() {
          disposed++;
        },
      };
    },
  };
  await assert.rejects(
    api.observeMixedGitWorktree(f.request, a.account, f.control),
    (e) => e.code === 'GIT_FAILED' && e.cleanupState === 'UNKNOWN',
  );
  assert.equal(disposed, 1);
});

test('A2 fixed Windows qualification dictionary blocks missing-required host supplementation', async () => {
  const { validateGitQualification } = await import('../dist/git.js');
  const required = [
    'HOMEDRIVE',
    'HOMEPATH',
    'LOGONSERVER',
    'PATH',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'WINDIR',
  ];
  const q = validateGitQualification({
    executablePath: process.execPath,
    environment: { SystemRoot: 'FIXED_ROOT' },
    createLifecycle() {
      assert.fail('shape only');
    },
  });
  const simulatedParent = Object.fromEntries(required.map((k) => [k, 'FAKE_HOST_SENTINEL'])),
    consumed = { ...q.environment };
  for (const key of required)
    if (!Object.hasOwn(consumed, key)) consumed[key] = simulatedParent[key];
  for (const key of required) assert.equal(consumed[key], key === 'SYSTEMROOT' ? 'FIXED_ROOT' : '');
  assert.equal(q.environment.NODE_V8_COVERAGE, '');
  assert.equal(Object.values(consumed).includes('FAKE_HOST_SENTINEL'), false);
  assert.ok(Object.isFrozen(q.environment));
});

// Ownership is a live identity witness, not executable/profile authorization.
for (const outcome of ['success', 'throw-create', 'reject', 'cancel', 'timeout'])
  test('A2 owned Git plan proof expires after ' + outcome, async (t) => {
    const f = await setup(t),
      a = makeAccount(f.control.signal),
      gitModule = await import('../dist/git.js'),
      read = gitModule.default?.readOwnedGitLaunchPlan;
    assert.equal(typeof read, 'function');
    assert.equal((await import('../dist/index.js')).readOwnedGitLaunchPlan, undefined);
    assert.equal(gitModule.readOwnedGitLaunchPlan, undefined);
    for (const fake of [null, {}, Object.freeze({}), new Proxy({}, {})])
      assert.throws(() => read(fake), code('GIT_FAILED'));
    let captured, releaseLate;
    const late = new Promise((resolve) => {
      releaseLate = resolve;
    });
    let lateRead;
    const plans = [];
    f.state.expectedExecutable = process.execPath;
    f.state.beforeReply = async (args) => {
      if (args[2] === 'check-ignore') {
        const { createHash } = await import('node:crypto');
        assert.equal(
          captured.stdinSha256,
          createHash('sha256').update(f.state.inputs.at(-1)).digest('hex'),
        );
      }
    };
    f.state.spawnAudit = () => assert.throws(() => read(captured), code('GIT_FAILED'));
    f.control.qualification = {
      executablePath: process.execPath,
      environment: {},
      createLifecycle(plan) {
        captured = plan;
        plans.push(plan);
        assert.deepEqual(Object.keys(plan).sort(), [
          'arguments',
          'cwd',
          'environment',
          'executablePath',
          'stdinSha256',
        ]);
        const proof = read(plan);
        assert.ok(Object.isFrozen(proof));
        assert.equal(proof.role, 'GIT');
        assert.equal(proof.plan, plan);
        assert.throws(() => read({ ...plan }), code('GIT_FAILED'));
        assert.throws(() => read(new Proxy(plan, {})), code('GIT_FAILED'));
        if (outcome === 'throw-create') throw Error('fixture');
        return {
          async beforeSpawn(p, signal) {
            assert.equal(read(p).plan, plan);
            if (outcome === 'reject') throw Error('fixture');
            if (outcome === 'cancel' || outcome === 'timeout') {
              lateRead = late.then(() => assert.throws(() => read(plan), code('GIT_FAILED')));
              if (outcome === 'cancel') setImmediate(() => f.controller.abort());
              else f.control.deadlineEpochMs = Date.now();
              await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
              );
              await late;
              assert.throws(() => read(plan), code('GIT_FAILED'));
            }
          },
          async beforeInput() {
            assert.throws(() => read(plan), code('GIT_FAILED'));
          },
          async afterClose() {
            assert.throws(() => read(plan), code('GIT_FAILED'));
          },
          async dispose() {
            assert.throws(() => read(plan), code('GIT_FAILED'));
          },
        };
      },
    };
    if (outcome === 'timeout') f.control.deadlineEpochMs = Date.now() + 50;
    const pending = api.observeMixedGitWorktree(f.request, a.account, f.control);
    if (outcome === 'success') await pending;
    else
      await assert.rejects(
        pending,
        code(
          outcome === 'cancel'
            ? 'CANCELLED'
            : outcome === 'timeout'
              ? 'DEADLINE_EXCEEDED'
              : 'GIT_FAILED',
        ),
      );
    assert.ok(plans.length > 0);
    for (const plan of plans) assert.throws(() => read(plan), code('GIT_FAILED'));
    releaseLate();
    if (lateRead) await lateRead;
    assert.equal(f.state.calls, outcome === 'success' ? f.state.closes : 0);
    if (outcome === 'success') {
      const { createHash } = await import('node:crypto');
      assert.equal(plans.length, f.state.calls);
      // Empty stdin commands mint the hash of exactly the bytes sent, too.
      assert.equal(
        plans[0].stdinSha256,
        createHash('sha256').update(Buffer.alloc(0)).digest('hex'),
      );
    }
  });

test('A2 owned Git plan claim is globally one-shot within the active window', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal),
    gitModule = await import('../dist/git.js'),
    { readOwnedGitLaunchPlan: read, claimOwnedGitLaunchPlan: claim } = gitModule.default;
  assert.equal(typeof claim, 'function');
  assert.equal(gitModule.claimOwnedGitLaunchPlan, undefined);
  assert.equal((await import('../dist/index.js')).claimOwnedGitLaunchPlan, undefined);
  for (const fake of [null, {}, new Proxy({}, {})])
    assert.throws(() => claim(fake), code('GIT_FAILED'));
  const plans = [];
  f.state.expectedExecutable = process.execPath;
  f.control.qualification = {
    executablePath: process.execPath,
    environment: {},
    createLifecycle(plan) {
      for (const previous of plans) assert.throws(() => claim(previous), code('GIT_FAILED'));
      plans.push(plan);
      assert.throws(() => claim({ ...plan }), code('GIT_FAILED'));
      assert.throws(() => claim(new Proxy(plan, {})), code('GIT_FAILED'));
      const proof = claim(plan);
      assert.equal(proof.plan, plan);
      assert.equal(proof.role, 'GIT');
      assert.ok(Object.isFrozen(proof));
      assert.equal(read(plan), proof);
      assert.equal(read(plan), proof);
      assert.throws(() => claim(plan), code('GIT_FAILED'));
      return {
        async beforeSpawn(p) {
          // A second consumer of the same genuine object cannot claim it again.
          const secondConsumer = () => claim(p);
          assert.throws(secondConsumer, code('GIT_FAILED'));
          assert.equal(read(p).plan, plan);
        },
        async beforeInput() {
          assert.throws(() => claim(plan), code('GIT_FAILED'));
        },
        async afterClose() {},
        async dispose() {},
      };
    },
  };
  await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.ok(plans.length > 1);
  for (const plan of plans) assert.throws(() => claim(plan), code('GIT_FAILED'));
  const firstCount = plans.length;
  await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.ok(plans.length > firstCount);
  assert.equal(new Set(plans).size, plans.length);
  assert.equal(f.state.calls, f.state.closes);
});

test('A2 genuine Git gate composes with opaque prepared registration', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal),
    { createMixedNativePreparedRegistration } =
      await import('../../../scripts/mixed-native-prepared-registration.mjs');
  f.state.expectedExecutable = process.execPath;
  let prepared = 0;
  f.control.qualification = {
    executablePath: process.execPath,
    environment: {},
    createLifecycle(plan) {
      // API coupling only: static fields are derived here, not independent run approval.
      const { stdinSha256, ...command } = plan,
        registry = createMixedNativePreparedRegistration({
          contextSha256: 'a'.repeat(64),
          slots: [
            { launchId: 'git-' + prepared, role: 'GIT', imageSha256: 'b'.repeat(64), command },
          ],
        });
      return {
        async beforeSpawn(p) {
          const receipt = registry.consume(registry.prepare(p));
          assert.equal(receipt.binding.role, 'GIT');
          assert.equal(receipt.registrationAuthority, false);
          assert.equal(receipt.liveTransportConnected, false);
          prepared++;
        },
        async beforeInput() {},
        async afterClose() {},
        async dispose() {},
      };
    },
  };
  await api.observeMixedGitWorktree(f.request, a.account, f.control);
  assert.ok(prepared > 0);
  assert.equal(f.state.calls, f.state.closes);
});

test('A2 owned Git proof refuses synchronously inside gate abort listener', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal),
    {
      default: { readOwnedGitLaunchPlan: read, claimOwnedGitLaunchPlan: claim },
    } = await import('../dist/git.js');
  const outcomes = [];
  f.control.qualification = {
    executablePath: process.execPath,
    environment: {},
    createLifecycle(plan) {
      assert.equal(read(plan).plan, plan);
      return {
        async beforeSpawn(_plan, signal) {
          signal.addEventListener(
            'abort',
            () => {
              for (const check of [read, claim]) {
                try {
                  check(plan);
                  outcomes.push('ACCEPTED');
                } catch (error) {
                  outcomes.push(error.code);
                }
              }
            },
            { once: true },
          );
          f.controller.abort();
        },
        async beforeInput() {
          assert.fail('no child');
        },
        async afterClose() {
          assert.fail('no child');
        },
        async dispose() {},
      };
    },
  };
  await assert.rejects(
    api.observeMixedGitWorktree(f.request, a.account, f.control),
    code('CANCELLED'),
  );
  assert.deepEqual(outcomes, ['GIT_FAILED', 'GIT_FAILED']);
  assert.equal(f.state.calls, 0);
});

test('A2 qualification timer retains deadline refusal when wall clock lags', async (t) => {
  const f = await setup(t),
    a = makeAccount(f.control.signal),
    epoch = Date.now();
  t.mock.method(Date, 'now', () => epoch);
  f.control.deadlineEpochMs = epoch + 30;
  let entered = 0,
    disposed = 0;
  f.control.qualification = {
    executablePath: process.execPath,
    environment: {},
    createLifecycle() {
      return {
        async beforeSpawn(_plan, signal) {
          entered++;
          await new Promise((resolve) =>
            signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }),
          );
        },
        async beforeInput() {
          assert.fail('no child');
        },
        async afterClose() {
          assert.fail('no close');
        },
        async dispose() {
          disposed++;
        },
      };
    },
  };
  await assert.rejects(
    boundedGitOutcome(api.observeMixedGitWorktree(f.request, a.account, f.control)),
    code('DEADLINE_EXCEEDED'),
  );
  assert.equal(entered, 1);
  assert.equal(disposed, 1);
  assert.equal(f.state.calls, 0);
  assert.equal(a.usage.invalid, true);
});
