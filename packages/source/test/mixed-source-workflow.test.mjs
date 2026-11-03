import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
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
