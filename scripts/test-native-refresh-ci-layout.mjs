import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

const layout = await import('./helpers/native-refresh-ci-layout.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const native = Buffer.from('owned synthetic executable bytes\n');
const nativeSha256 = createHash('sha256').update(native).digest('hex');

test('versioned operational layouts preserve v1 and v2 and choose R3 for new generation', () => {
  assert.equal(typeof layout.refreshCiLayoutRootForRevision, 'function');
  assert.equal(
    layout.refreshCiLayoutRootForRevision('p05-d5-exact-layout-v1'),
    'C:\\CodeAtlas-P05-D5',
  );
  assert.equal(
    layout.refreshCiLayoutRootForRevision('p05-d5-exact-layout-v2'),
    'C:\\CodeAtlas-P05-D5-R2',
  );
  assert.equal(
    layout.refreshCiLayoutRootForRevision('p05-d5-exact-layout-v3'),
    'C:\\CodeAtlas-P05-D5-R3',
  );
  assert.equal(layout.refreshCiLayoutRoot, 'C:\\CodeAtlas-P05-D5-R3');
  assert.equal(layout.refreshCiLayoutRevision, 'p05-d5-exact-layout-v3');
  assert.throws(() => layout.refreshCiLayoutRootForRevision('other-layout'), /revision|layout/i);
});

test('operational output confinement preserves all three frozen layouts', () => {
  assert.equal(typeof layout.assertRefreshCiOutputOutsideLayouts, 'function');
  for (const root of [
    'C:\\CodeAtlas-P05-D5',
    'C:\\CodeAtlas-P05-D5-R2',
    'C:\\CodeAtlas-P05-D5-R3',
  ]) {
    for (const output of [root, path.join(root, 'evidence', 'trial')])
      assert.throws(() => layout.assertRefreshCiOutputOutsideLayouts(output), /overlap|layout/i);
  }
  layout.assertRefreshCiOutputOutsideLayouts('C:\\CodeAtlas-P05-D5-R20\\output');
});

async function fixture(t) {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-ci-layout-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const nativeSourcePath = path.join(parent, 'original.exe');
  await writeFile(nativeSourcePath, native);
  return { parent, root: path.join(parent, 'owned-root'), nativeSourcePath, nativeSha256 };
}

test('exact-layout preparation copies pinned bytes into an exclusively owned tree', async (t) => {
  const input = await fixture(t);
  assert.equal(typeof layout.acquireRefreshCiLayoutAt, 'function');
  const result = await layout.acquireRefreshCiLayoutAt(input);
  assert.equal(result.root, input.root);
  assert.deepEqual((await readdir(input.root)).sort(), ['native', 'temp']);
  // The existing benchmark must acquire its evidence output exclusively itself.
  await mkdir(result.evidenceRoot);
  await assert.rejects(
    () => mkdir(result.evidenceRoot),
    (error) => error.code === 'EEXIST',
  );
  assert.deepEqual(await readFile(result.nativePath), native);
  assert.equal(result.nativeSha256, nativeSha256);
  assert.equal(result.fixtureContext.memoryBudgetBytes, 1_000_000_000);
  assert.equal(result.fixtureContext.executablePath, result.nativePath);
  assert.equal(result.fixtureContext.allowedEnvironment.TEMP, result.tempRoot);
  assert.equal(result.fixtureContext.allowedEnvironment.TMP, result.tempRoot);
  assert.ok(Object.isFrozen(result.fixtureContext.allowedEnvironment));
});

test('layout refuses to adopt an existing root and leaves every old byte untouched', async (t) => {
  const input = await fixture(t);
  await mkdir(input.root);
  await writeFile(path.join(input.root, 'owner.txt'), 'previous owner');
  assert.equal(typeof layout.acquireRefreshCiLayoutAt, 'function');
  await assert.rejects(() => layout.acquireRefreshCiLayoutAt(input), /exist|owned/i);
  assert.deepEqual(await readdir(input.root), ['owner.txt']);
  assert.equal(await readFile(path.join(input.root, 'owner.txt'), 'utf8'), 'previous owner');
});

test('Native byte mismatch fails before acquiring a layout root', async (t) => {
  const input = await fixture(t);
  assert.equal(typeof layout.acquireRefreshCiLayoutAt, 'function');
  await assert.rejects(
    () => layout.acquireRefreshCiLayoutAt({ ...input, nativeSha256: '0'.repeat(64) }),
    /Native|hash|digest/,
  );
  assert.deepEqual(await readdir(input.parent), ['original.exe']);
});

test('Cargo hard-linked build input is copied to an independent single-link pinned Native', async (t) => {
  const input = await fixture(t);
  const cargoAlias = path.join(input.parent, 'cargo-deps.exe');
  await link(input.nativeSourcePath, cargoAlias);
  assert.equal((await lstat(input.nativeSourcePath)).nlink, 2);
  const result = await layout.acquireRefreshCiLayoutAt(input);
  assert.equal((await lstat(result.nativePath)).nlink, 1);
  assert.equal(await layout.hashRefreshCiFile(result.nativePath), nativeSha256);
  await writeFile(cargoAlias, 'later build bytes');
  assert.deepEqual(await readFile(result.nativePath), native);
});

test('archive and owned Native hard links remain forbidden despite trusted Cargo input support', async (t) => {
  const input = await fixture(t);
  const result = await layout.acquireRefreshCiLayoutAt(input);
  await mkdir(result.evidenceRoot);
  await link(result.nativePath, path.join(input.parent, 'owned-native-alias.exe'));
  await assert.rejects(() => layout.hashRefreshCiFile(result.nativePath));
  await assert.rejects(() => layout.readRefreshCiPackLayoutAt(input.root));
});

test('a linked layout parent cannot redirect acquisition into another directory', async (t) => {
  const input = await fixture(t);
  const target = path.join(input.parent, 'real-parent');
  const link = path.join(input.parent, 'linked-parent');
  await mkdir(target);
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(typeof layout.acquireRefreshCiLayoutAt, 'function');
  await assert.rejects(
    () => layout.acquireRefreshCiLayoutAt({ ...input, root: path.join(link, 'owned-root') }),
    /canonical|alias|real|link/,
  );
  assert.deepEqual(await readdir(target), []);
});

test('concurrent acquirers never share or adopt one layout', async (t) => {
  const input = await fixture(t);
  assert.equal(typeof layout.acquireRefreshCiLayoutAt, 'function');
  const results = await Promise.allSettled([
    layout.acquireRefreshCiLayoutAt(input),
    layout.acquireRefreshCiLayoutAt(input),
  ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(results.filter((value) => value.status === 'rejected').length, 1);
  const result = results.find((value) => value.status === 'fulfilled').value;
  assert.deepEqual(await readFile(result.nativePath), native);
});

test('cross-process packaging can read a checked layout but cannot acquire extraction authority', async (t) => {
  const input = await fixture(t);
  const original = await layout.acquireRefreshCiLayoutAt(input);
  await mkdir(original.evidenceRoot);
  await writeFile(path.join(original.evidenceRoot, 'receipt.txt'), 'retained evidence');
  assert.equal(typeof layout.readRefreshCiPackLayoutAt, 'function');
  const source = await layout.readRefreshCiPackLayoutAt(input.root);
  assert.equal(source.root, original.root);
  await layout.verifyRefreshCiLayoutOwnership(source);
  await assert.rejects(() => layout.consumeRefreshCiLayout(source), /read.only|packaging/i);
  assert.equal(
    await readFile(path.join(original.evidenceRoot, 'receipt.txt'), 'utf8'),
    'retained evidence',
  );
  assert.deepEqual((await readdir(input.root)).sort(), ['evidence', 'native', 'temp']);
});

test('new D environment fixes reviewed Windows spelling without inheriting host case or mutating it', async (t) => {
  const input = await fixture(t);
  const before = { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR };
  const result = await layout.acquireRefreshCiLayoutAt(input);
  assert.equal(result.fixtureContext.allowedEnvironment.SYSTEMROOT, 'C:\\Windows');
  assert.equal(result.fixtureContext.allowedEnvironment.WINDIR, 'C:\\Windows');
  assert.deepEqual({ SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR }, before);
});

test('a non-Windows physical environment root refuses before layout acquisition', async (t) => {
  const input = await fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {createExclusiveRefreshCiRootAt} from ${JSON.stringify(new URL('./helpers/native-refresh-ci-layout.mjs', import.meta.url).href)};
     process.env.SYSTEMROOT=process.argv[1];
     try {await createExclusiveRefreshCiRootAt(process.argv[2]);process.exitCode=2;}
     catch(error){process.stdout.write(error.message);}`,
      input.parent,
      input.root,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unsupported Windows system directory/);
  assert.deepEqual(await readdir(input.parent), ['original.exe']);
});
