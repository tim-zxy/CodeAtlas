import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json', root)));
let archive;
const archivePath = new URL('historical-bytes.json.gz', root);
const digest = (b) => createHash('sha256').update(b).digest('hex');
export function historicalPath(logical) {
  assert.ok(Object.hasOwn(index.files, logical), 'unlisted historical input: ' + logical);
  const pin = index.files[logical];
  assert.match(pin.sha256, /^[a-f0-9]{64}$/);
  return fileURLToPath(archivePath);
}
export function readHistoricalInput(logical, encoding) {
  const pin = index.files[logical];
  historicalPath(logical);
  archive ??= JSON.parse(gunzipSync(fs.readFileSync(archivePath)));
  assert.ok(Object.hasOwn(archive, pin.sha256), 'missing historical bytes: ' + logical);
  const bytes = Buffer.from(archive[pin.sha256], 'base64');
  assert.equal(bytes.length, pin.bytes, logical);
  assert.equal(digest(bytes), pin.sha256, logical);
  return encoding ? bytes.toString(encoding) : bytes;
}
export function historicalEntries(logical) {
  const prefix = logical + '/';
  const entries = Object.keys(index.files)
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length).split('/')[0]);
  return [...new Set(entries)].sort();
}
export function applyPortableSourceMigration(logical, original) {
  const patches =
    JSON.parse(fs.readFileSync(new URL('source-migrations.json', root)))[logical] ?? [];
  for (const { before, after } of patches) {
    assert.equal(original.split(before).length, 2, 'exact approved portability patch: ' + logical);
    original = original.replace(before, after);
  }
  return original;
}

// Old pins remain exact; only listed additive Fixture registrations are successors.
export function assertHistoricalFixturePin(logical, sha256) {
  const bytes = fs.readFileSync(logical);
  const extension = JSON.parse(fs.readFileSync(new URL('manifest-extensions.json', root)))[logical];
  if (!extension) {
    const actual = digest(bytes);
    // The frozen README was CRLF; allow only its verified LF checkout bytes.
    if (
      logical === 'fixtures/README.md' &&
      sha256 === 'dfd131b04df41a1acd2baf7e1041d2ffbf617a5ce3e406948d74004b8ff513a1' &&
      actual === '2ab9b3896e19c94105d4c454eb82b51aeba625a0074ef4354fec0b7572bcf7a8'
    ) {
      return;
    }
    return assert.equal(actual, sha256, logical);
  }
  assert.equal(extension.sha256, sha256, logical);
  const originalBytes = readHistoricalInput(extension.origin);
  assert.equal(digest(originalBytes), sha256, logical);
  const original = JSON.parse(originalBytes);
  for (const field of ['inputs', 'expected']) {
    for (const key of Object.keys(extension.added[field]))
      assert.equal(Object.hasOwn(original[field], key), false);
    Object.assign(original[field], extension.added[field]);
  }
  assert.deepEqual(JSON.parse(bytes), original, logical);
}

// Current13 test inputs retain local reads; only an absent file uses immutable history.
// localRoot is explicit so callers preserve their original repository-relative behavior.
export function readHistoricalInputOrLocal(logical, encoding, localRoot) {
  assert.ok(
    typeof logical === 'string' &&
      !path.isAbsolute(logical) &&
      !/^[A-Za-z]:/.test(logical) &&
      !/[\\:\x00-\x1f]/.test(logical) &&
      logical.split('/').every((part) => part && part !== '.' && part !== '..'),
    'UNSAFE_HISTORICAL_INPUT_PATH',
  );
  historicalPath(logical); // Require the fixed archive allowlist before touching local files.
  assert.ok(
    typeof localRoot === 'string' && path.isAbsolute(localRoot),
    'ABSOLUTE_LOCAL_ROOT_REQUIRED',
  );
  try {
    return fs.readFileSync(path.resolve(localRoot, ...logical.split('/')), encoding);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return readHistoricalInput(logical, encoding);
  }
}
