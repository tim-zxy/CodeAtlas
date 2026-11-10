// Inert reader transport only. Never imports payload modules or grants qualification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  configuration,
  inventoryTree,
  hashFile,
  assertExactInventory,
  assertSeparateRoots,
  createOwnedDirectory,
  confinedPath,
  assertToolSeal,
} from './r11-staged-pack.mjs';
import {
  readerContentDigest,
  verifyActualReader,
  r11ActualIdentity,
  assertActualLaunchEnvironment,
} from './r11-actual-coordinator.mjs';

// A new child of any retained owner would still mutate its protected inventory.
const protectedReaderRoots = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  ...Array.from({ length: 11 }, (_, index) =>
    path.join(path.parse(configuration.measured).root, 'CodeAtlas-P05-D5-R' + (index + 1)),
  ),
  path.dirname(configuration.frozen),
  path.join(path.parse(configuration.work).root, 'CodeAtlas-R11-PACK-v1'),
  configuration.work,
];
export function assertReaderOutput(root, protectedRoots = protectedReaderRoots) {
  for (const protectedRoot of protectedRoots) assertSeparateRoots(root, protectedRoot);
}
const content = ({ files, links, directories }) => ({ files, links, directories });
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function keys(value, expected) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}
function member(root, relative) {
  const result = confinedPath(root, relative);
  for (const part of relative.split('/')) {
    assert(!/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part), 'Unsafe Windows member');
    assert(!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part), 'Device member');
  }
  return result;
}
function validateInventory(root, value) {
  keys(value, ['files', 'links', 'directories']);
  const names = new Set(),
    directories = new Set(value.directories);
  function name(relative) {
    member(root, relative);
    const folded = relative.toLowerCase();
    assert(!names.has(folded), 'Duplicate or case-aliased member');
    names.add(folded);
    const parent = path.posix.dirname(relative);
    assert(parent === '.' || directories.has(parent), 'Missing parent directory');
  }
  for (const [list, getPath] of [
    [value.files, (x) => x.path],
    [value.links, (x) => x.path],
    [value.directories, (x) => x],
  ]) {
    assert(Array.isArray(list));
    const paths = list.map(getPath);
    assert.deepEqual(paths, [...paths].sort(), 'Noncanonical member order');
    for (const relative of paths) name(relative);
  }
  for (const entry of value.files) {
    keys(entry, ['path', 'bytes', 'sha256']);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
  for (const entry of value.links) {
    keys(entry, ['path', 'target']);
    member(root, entry.target);
    // Frozen dependency links are directory junctions; do not create privileged file symlinks.
    assert(directories.has(entry.target), 'Link target must be an inventoried directory');
  }
}
async function readBundle(root, expectedDigest) {
  const before = await inventoryTree(root);
  assert.deepEqual(before.directories, ['objects']);
  const record = before.files.find((x) => x.path === 'manifest.json');
  assert(record && record.bytes <= 16 * 1024 * 1024, 'Missing/oversized manifest');
  const bytes = fs.readFileSync(path.join(root, 'manifest.json'));
  assert.equal(sha(bytes), record.sha256, 'Manifest changed while reading');
  const manifest = JSON.parse(bytes.toString('utf8'));
  keys(manifest, ['schemaVersion', 'inventory']);
  assert.equal(manifest.schemaVersion, 1);
  validateInventory(root, manifest.inventory);
  assert.equal(readerContentDigest(manifest.inventory), expectedDigest, 'Wrong reader identity');
  const objects = new Map();
  for (const entry of manifest.inventory.files) {
    if (objects.has(entry.sha256)) assert.equal(objects.get(entry.sha256), entry.bytes);
    objects.set(entry.sha256, entry.bytes);
  }
  assert.equal(before.files.length, objects.size + 1, 'Unexpected bundle files');
  for (const [digest, size] of objects) {
    const entry = before.files.find((x) => x.path === 'objects/' + digest);
    assert(entry && entry.sha256 === digest && entry.bytes === size, 'Missing or changed object');
  }
  return { before, inventory: manifest.inventory };
}

// Digest parameter is a self-owned fixture seam. Operational CLI always fixes R11.
export async function exportReader(
  source,
  bundle,
  expectedDigest = r11ActualIdentity.readerContentSha256,
) {
  assertReaderOutput(bundle);
  assertSeparateRoots(source, bundle);
  const before = await verifyActualReader(source, expectedDigest);
  validateInventory(source, content(before));
  await createOwnedDirectory(bundle);
  fs.mkdirSync(path.join(bundle, 'objects'));
  const copied = new Set();
  for (const entry of before.files) {
    if (copied.has(entry.sha256)) continue;
    const original = member(source, entry.path),
      target = path.join(bundle, 'objects', entry.sha256);
    assert.equal(hashFile(original), entry.sha256, 'Source drift');
    fs.copyFileSync(original, target, fs.constants.COPYFILE_EXCL);
    assert.equal(hashFile(target), entry.sha256, 'Object drift');
    copied.add(entry.sha256);
  }
  assertExactInventory(before, await inventoryTree(source, { allowLinks: true }));
  fs.writeFileSync(
    path.join(bundle, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, inventory: content(before) }) + '\n',
    { flag: 'wx' },
  );
  await readBundle(bundle, expectedDigest);
  return { state: 'READER_EXPORTED_NOT_QUALIFIED', readerContentSha256: expectedDigest };
}

export async function materializeReader(
  bundle,
  output,
  expectedDigest = r11ActualIdentity.readerContentSha256,
) {
  assertReaderOutput(output);
  assertSeparateRoots(bundle, output);
  const { before, inventory } = await readBundle(bundle, expectedDigest);
  await createOwnedDirectory(output);
  try {
    const reader = path.join(output, 'reader');
    await createOwnedDirectory(reader);
    for (const relative of inventory.directories) fs.mkdirSync(member(reader, relative));
    for (const entry of inventory.files) {
      const object = path.join(bundle, 'objects', entry.sha256),
        target = member(reader, entry.path);
      assert.equal(hashFile(object), entry.sha256, 'Object changed during construction');
      fs.copyFileSync(object, target, fs.constants.COPYFILE_EXCL);
      assert.equal(hashFile(target), entry.sha256, 'Output changed during construction');
    }
    for (const entry of inventory.links)
      fs.symlinkSync(member(reader, entry.target), member(reader, entry.path), 'junction');
    await verifyActualReader(reader, expectedDigest);
    assertExactInventory(before, await inventoryTree(bundle));
    const receipt = {
      schemaVersion: 1,
      state: 'READER_MATERIALIZED_NOT_QUALIFIED',
      readerContentSha256: expectedDigest,
      files: inventory.files.length,
      links: inventory.links.length,
      directories: inventory.directories.length,
    };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(receipt) + '\n', {
      flag: 'wx',
    });
    return receipt;
  } catch (error) {
    fs.writeFileSync(
      path.join(output, 'failure.json'),
      JSON.stringify({ state: 'STOPPED_NOT_QUALIFIED', code: error.code ?? 'VALIDATION_FAILED' }) +
        '\n',
      { flag: 'wx' },
    );
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, source, target, selfSha] = process.argv.slice(2);
  assert.equal(
    process.argv.length,
    6,
    'Expected export|materialize source target reviewed-self-sha',
  );
  assertActualLaunchEnvironment();
  assertToolSeal(fileURLToPath(import.meta.url), selfSha);
  assertToolSeal(
    fileURLToPath(new URL('./r11-staged-pack.mjs', import.meta.url)),
    r11ActualIdentity.helperSha256,
  );
  assertToolSeal(
    fileURLToPath(new URL('./r11-actual-coordinator.mjs', import.meta.url)),
    'ca58417cdc12c55f6bacabe5111769626843a0987a5f45c1ea4f8d1817eb5b1f',
  );
  assertToolSeal(process.execPath, r11ActualIdentity.nodeSha256);
  assert(['export', 'materialize'].includes(operation), 'Unknown operation');
  const result = await (operation === 'export'
    ? exportReader(source, target)
    : materializeReader(source, target));
  assertToolSeal(fileURLToPath(import.meta.url), selfSha);
  console.log(JSON.stringify(result));
}
