// Explicit offline preparation only: emit a fixed checker into a new owned directory.
// Does not execute PowerShell, inspect installed ACLs, query identity, install or repair.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { principalAclReader } from '../packages/runtime/dist/windows-principal-precompiled.js';
import { readClosedRuntimePackage } from '../packages/runtime/dist/closed-runtime-package.js';
const args = process.argv.slice(2);
assert.equal(args.length, 5, 'EXPLICIT_SOURCE_OUTPUT_AND_LIMITS_REQUIRED');
const [sourceRelative, outputRelative, ...numbers] = args;
assert.match(sourceRelative, /^\.superpowers\/closed-runtime-[a-zA-Z0-9-]+\/release-[a-f0-9]{64}$/);
assert.match(outputRelative, /^\.superpowers\/principal-guard-[a-zA-Z0-9-]+$/);
const limits = numbers.map((n) => {
  assert.match(n, /^[1-9][0-9]*$/);
  const v = Number(n);
  assert.ok(Number.isSafeInteger(v));
  return v;
});
const workspace = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(workspace, sourceRelative),
  output = path.resolve(workspace, outputRelative);
assert.equal(path.dirname(output), path.join(workspace, '.superpowers'));
const sha = '4ee3e48cfa2f6c4d883a983a2f7b5739ecf7b01d515c94cecbed9f87e3bb7147';
const dll = 'packages/runtime/dist/principal/win32-x64/' + sha + '/windows-process-principal.dll';
const bundle = await readClosedRuntimePackage(source, dll, sha, {
  maxFileBytes: limits[0],
  maxItems: limits[1],
  maxDepth: limits[2],
  check: () => undefined,
});
assert.equal(path.basename(source), 'release-' + bundle.contentDigest);
const candidateManifest = JSON.parse(bundle.manifestBytes.toString('utf8'));
const moduleRow = candidateManifest.files.find(
  (file) => file.path === 'packages/runtime/dist/windows-principal-precompiled.js',
);
const currentModule = await fs.readFile(
  new URL('../packages/runtime/dist/windows-principal-precompiled.js', import.meta.url),
);
const candidateModuleSha256 = createHash('sha256').update(currentModule).digest('hex');
assert.ok(
  moduleRow &&
    moduleRow.bytes === currentModule.length &&
    moduleRow.sha256 === candidateModuleSha256,
  'CANDIDATE_PRINCIPAL_MODULE_MISMATCH',
);

const template = await fs.readFile(
  new URL('./windows-principal-deployment-guard.ps1', import.meta.url),
  'utf8',
);
assert.equal(template.split('__FIXED_ACL_READER__').length, 2);
assert.equal(template.split('__FIXED_RELEASE_DIGEST__').length, 3);
const program = template
  .replace('__FIXED_ACL_READER__', principalAclReader)
  .replaceAll('__FIXED_RELEASE_DIGEST__', bundle.contentDigest);
await bundle.recheck();
await fs.mkdir(output);
await fs.writeFile(path.join(output, 'guard.ps1'), program, { flag: 'wx' });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const receipt = {
  kind: 'FIXED_DEPLOYMENT_GUARD_PREPARATION_ONLY',
  sourceRelative,
  contentDigest: bundle.contentDigest,
  candidateModuleSha256,
  guardSha256: hash(Buffer.from(program)),
  guardBytes: Buffer.byteLength(program),
  readerSha256: hash(Buffer.from(principalAclReader)),
  templateSha256: hash(Buffer.from(template)),
  requiredChildPSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
  modes: ['PREFLIGHT', 'INSTALLED', 'NEW_VERSION'],
  guardExecuted: false,
  identityQueries: 0,
  ACLChanges: 0,
};
await fs.writeFile(path.join(output, 'preparation.json'), JSON.stringify(receipt, null, 2) + '\n', {
  flag: 'wx',
});
console.log(JSON.stringify(receipt));
