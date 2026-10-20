// Development Fixture ownership only, never product configuration or cleanup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, realpathSync } from 'node:fs';
import { copyFile, lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotDRefreshFixtureContext } from '../../packages/runtime/test/helpers/native-refresh-d-context.mjs';

export const refreshCiLayoutRevision = 'p05-d5-exact-layout-v3';
export function refreshCiLayoutRootForRevision(revision) {
  if (revision === 'p05-d5-exact-layout-v1') return 'C:\\CodeAtlas-P05-D5';
  if (revision === 'p05-d5-exact-layout-v2') return 'C:\\CodeAtlas-P05-D5-R2';
  assert.equal(revision, 'p05-d5-exact-layout-v3', 'Unsupported CI layout revision');
  return 'C:\\CodeAtlas-P05-D5-R3';
}
export const refreshCiLayoutRoot = refreshCiLayoutRootForRevision(refreshCiLayoutRevision);

export function assertRefreshCiOutputOutsideLayouts(output) {
  canonicalPath(output);
  for (const revision of [
    'p05-d5-exact-layout-v1',
    'p05-d5-exact-layout-v2',
    'p05-d5-exact-layout-v3',
  ]) {
    const relative = path.relative(refreshCiLayoutRootForRevision(revision), output);
    assert.ok(
      path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep),
      'CI output overlaps frozen layout',
    );
  }
}
const ownedLayouts = new WeakMap();

function canonicalPath(value) {
  assert.ok(
    typeof value === 'string' &&
      !value.includes('\0') &&
      path.isAbsolute(value) &&
      path.resolve(value) === value,
    'CI layout path must be canonical and absolute',
  );
}

async function hashRegularFile(file, requireSingleLink) {
  canonicalPath(file);
  const before = await lstat(file, { bigint: true });
  assert.ok(
    before.isFile() && !before.isSymbolicLink() && (!requireSingleLink || before.nlink === 1n),
  );
  assert.equal(await realpath(file), file, 'CI layout file alias is forbidden');
  const handle = await open(file, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    assert.equal(opened.dev, before.dev);
    assert.equal(opened.ino, before.ino);
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat({ bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'])
      assert.equal(after[key], before[key], 'CI layout file changed while hashing');
    const current = await lstat(file, { bigint: true });
    assert.equal(current.dev, before.dev);
    assert.equal(current.ino, before.ino);
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

export async function hashRefreshCiFile(file) {
  return hashRegularFile(file, true);
}

// Root is trusted development/test input, never accepted from a pack or CLI flag.
export async function createExclusiveRefreshCiRootAt(root) {
  canonicalPath(root);
  const parent = path.dirname(root);
  const parentInfo = await lstat(parent);
  assert.ok(parentInfo.isDirectory() && !parentInfo.isSymbolicLink(), 'CI layout parent is linked');
  assert.equal(await realpath(parent), parent, 'CI layout parent must be real and canonical');
  const layout = {
    root,
    evidenceRoot: path.join(root, 'evidence'),
    nativePath: path.join(root, 'native', 'codeatlas-native-analyzer.exe'),
    tempRoot: path.join(root, 'temp'),
  };
  refreshCiFixtureContext(layout); // Fixed OS controls must be feasible BEFORE acquisition.
  await mkdir(root); // EEXIST is a refusal, including a prior partial attempt.
  // Bench owns exclusive creation of evidenceRoot; never make it adopt a directory.
  for (const directory of [path.dirname(layout.nativePath), layout.tempRoot])
    await mkdir(directory);
  Object.freeze(layout);
  ownedLayouts.set(layout, {
    info: await lstat(root, { bigint: true }),
    used: false,
    readOnly: false,
  });
  return layout;
}

export async function verifyRefreshCiLayoutOwnership(layout) {
  const owner = ownedLayouts.get(layout);
  assert.ok(owner, 'Original owned CI layout required');
  const current = await lstat(layout.root, { bigint: true });
  assert.ok(current.isDirectory() && !current.isSymbolicLink(), 'CI layout root changed');
  assert.equal(await realpath(layout.root), layout.root, 'CI layout root alias');
  assert.equal(current.dev, owner.info.dev);
  assert.equal(current.ino, owner.info.ino);
  return owner.info;
}

export async function consumeRefreshCiLayout(layout) {
  const owner = ownedLayouts.get(layout);
  assert.ok(owner, 'Original owned CI layout required');
  assert.equal(owner.readOnly, false, 'Read-only packaging cannot acquire extraction authority');
  assert.equal(owner.used, false, 'CI layout extraction attempt already consumed');
  owner.used = true;
  return verifyRefreshCiLayoutOwnership(layout);
}

// Reading a previously prepared pack source grants no mkdir/extraction/repair authority.
export async function readRefreshCiPackLayoutAt(root) {
  canonicalPath(root);
  const layout = Object.freeze({
    root,
    evidenceRoot: path.join(root, 'evidence'),
    nativePath: path.join(root, 'native', 'codeatlas-native-analyzer.exe'),
    tempRoot: path.join(root, 'temp'),
    readOnly: true,
  });
  for (const directory of [
    root,
    layout.evidenceRoot,
    path.dirname(layout.nativePath),
    layout.tempRoot,
  ]) {
    const info = await lstat(directory);
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Pack source directory is linked');
    assert.equal(await realpath(directory), directory, 'Pack source directory alias');
  }
  await hashRefreshCiFile(layout.nativePath);
  ownedLayouts.set(layout, {
    info: await lstat(root, { bigint: true }),
    used: false,
    readOnly: true,
  });
  return layout;
}

export async function readRefreshCiPackLayout() {
  return readRefreshCiPackLayoutAt(refreshCiLayoutRoot);
}

export function refreshCiFixtureContext(layout) {
  assert.equal(process.platform, 'win32', 'Exact D context requires Windows');
  const windows = 'C:\\Windows';
  const physicalWindows = realpathSync.native(windows);
  for (const key of ['SYSTEMROOT', 'WINDIR']) {
    assert.equal(typeof process.env[key], 'string', 'Windows context control missing');
    assert.equal(
      realpathSync.native(process.env[key]),
      physicalWindows,
      'Unsupported Windows system directory',
    );
  }
  return snapshotDRefreshFixtureContext({
    memoryBudgetBytes: 1_000_000_000,
    executablePath: layout.nativePath,
    allowedEnvironment: {
      SYSTEMROOT: windows,
      WINDIR: windows,
      TEMP: layout.tempRoot,
      TMP: layout.tempRoot,
    },
  });
}

export async function acquireRefreshCiLayoutAt({ root, nativeSourcePath, nativeSha256 }) {
  canonicalPath(root);
  assert.match(nativeSha256, /^[a-f0-9]{64}$/, 'Native digest must be exact');
  // Cargo may hard-link target/debug to target/debug/deps. Only this trusted
  // build input permits multiple links; the independent owned copy never does.
  assert.equal(
    await hashRegularFile(nativeSourcePath, false),
    nativeSha256,
    'Native hash mismatch',
  );
  const layout = await createExclusiveRefreshCiRootAt(root);
  await copyFile(nativeSourcePath, layout.nativePath, constants.COPYFILE_EXCL);
  assert.equal(
    await hashRefreshCiFile(layout.nativePath),
    nativeSha256,
    'Native copy hash mismatch',
  );
  assert.equal(
    await hashRegularFile(nativeSourcePath, false),
    nativeSha256,
    'Native source changed',
  );
  const result = Object.freeze({
    ...layout,
    nativeSha256,
    fixtureContext: refreshCiFixtureContext(layout),
  });
  ownedLayouts.set(result, ownedLayouts.get(layout));
  return result;
}

export async function acquireRefreshCiLayout() {
  assert.equal(process.platform, 'win32', 'Exact D CI layout requires Windows');
  assert.equal(process.arch, 'x64', 'Exact D CI layout requires x64');
  const nativeSourcePath = fileURLToPath(
    new URL('../../target/debug/codeatlas-native-analyzer.exe', import.meta.url),
  );
  return acquireRefreshCiLayoutAt({
    root: refreshCiLayoutRoot,
    nativeSourcePath,
    nativeSha256: await hashRegularFile(nativeSourcePath, false),
  });
}
