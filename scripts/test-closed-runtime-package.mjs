// Explicit owned-package integration only; never a production trust admission.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { mock } from 'node:test';
const workspace = fileURLToPath(new URL('../', import.meta.url));
assert.equal(process.argv.length, 3);
const relative = process.argv[2];
assert.match(relative, /^\.superpowers\/closed-runtime-[a-zA-Z0-9-]+\/release-[a-f0-9]{64}$/);
const root = path.resolve(workspace, relative),
  parent = path.dirname(root);
assert.ok(root.startsWith(path.join(workspace, '.superpowers') + path.sep));
const digest = path.basename(root).slice(8);
assert.equal(
  createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'closed-runtime.json')))
    .digest('hex'),
  digest,
);
const pairs = [
  [
    'packages/storage/dist/runtime/runtime-fact-store.js',
    'node_modules/@codeatlas/storage/dist/runtime/runtime-fact-store.js',
  ],
  [
    'packages/storage/dist/analysis/activation-history-format.js',
    'node_modules/@codeatlas/storage/dist/analysis/activation-history-format.js',
  ],
  [
    'packages/application/dist/capture-compilation-input.js',
    'node_modules/@codeatlas/application/dist/capture-compilation-input.js',
  ],
];
const singleton = [];
for (const [a, b] of pairs) {
  const left = await import(pathToFileURL(path.join(root, a))),
    right = await import(pathToFileURL(path.join(root, b)));
  assert.strictEqual(left, right);
  assert.equal(fs.realpathSync(path.join(root, a)), fs.realpathSync(path.join(root, b)));
  singleton.push({ a, b, sameNamespace: true, sameRealpath: true });
}
let spawns = 0;
mock.method(childProcess, 'spawn', () => {
  spawns++;
  throw Error('REAL_CHILD_FORBIDDEN_IN_OWNED_PACKAGE_TEST');
});
try {
  const owner = await import(
    pathToFileURL(path.join(root, 'packages/runtime/dist/windows-principal-owner.js'))
  );
  await assert.rejects(
    owner.acquirePrecompiledWindowsPrincipal(
      {
        signal: new AbortController().signal,
        deadlineEpochMs: Date.now() + 30000,
        maxItems: 200000,
        maxDepth: 100,
      },
      { maxInputBytes: 4194304, maxOutputBytes: 16384 },
    ),
    (e) => e.code === 'WINDOWS_PRINCIPAL_UNAVAILABLE' && e.cleanupState === 'SETTLED',
  );
  assert.equal(spawns, 0);
} finally {
  mock.restoreAll();
}
const result = {
  kind: 'OWNED_CLOSED_PACKAGE_INTEGRATION',
  packageDigest: digest,
  singleton,
  ownedRootNotTrusted: true,
  childSpawns: spawns,
  identityQueries: 0,
  userDatabasesOpened: 0,
};
fs.writeFileSync(
  path.join(parent, 'integration-result.json'),
  JSON.stringify(result, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(result));
