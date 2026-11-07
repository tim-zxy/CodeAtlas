// Explicit local preparation only. Never install, load or query an identity.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
assert.deepEqual(process.argv.slice(2), [
  '--build-only',
  '--max-build-ms',
  '30000',
  '--max-artifact-bytes',
  '1048576',
]);
assert.equal(process.platform, 'win32');
assert.equal(process.arch, 'x64');
const root = fileURLToPath(new URL('../', import.meta.url));
const framework = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319';
const source = path.join(root, 'scripts/windows-process-principal.cs');
const compiler = framework + '/csc.exe';
const pins = new Map([
  [source, '1cfe23cd44422131131e29fe3eecf7f1c95c3b4281e4d3f06a0a03a4cfa11f25'],
  [compiler, '46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'],
  [compiler + '.config', '2d4610ade011e530d817dd3ba4fc787e5dc0c2297cc520c30a643b8fb13f9093'],
  [framework + '/mscorlib.dll', '11ac114c43ecf6996bef58ba3c99fba3693a4560a84eeadde54d193060dc626c'],
  [framework + '/System.dll', '2b3c17c6208a0b4b6beb94e1a066f99ba06cdb2ea919479e99d47e8c6d96dc71'],
]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function frozenInput(file, expected) {
  const stat = await fs.lstat(file);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 16 * 1024 * 1024,
  );
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, stat.size);
  assert.equal(sha(bytes), expected, 'FROZEN_INPUT_IDENTITY_CHANGED');
  return bytes;
}
const inputs = [];
let sourceBytes;
for (const [file, expected] of pins) {
  const bytes = await frozenInput(file, expected);
  inputs.push({ path: file, sha256: expected, bytes: bytes.length });
  if (file === source) sourceBytes = bytes;
}
const parent = path.join(root, '.superpowers');
const parentStat = await fs.lstat(parent);
assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink());
const directory = await fs.mkdtemp(path.join(parent, 'principal-artifact-'));
const frozenSource = path.join(directory, 'windows-process-principal.cs');
const artifact = path.join(directory, 'windows-process-principal.dll');
const temp = path.join(directory, 'compiler-temp');
await fs.mkdir(temp);
await fs.writeFile(frozenSource, sourceBytes, { flag: 'wx' });
const args = [
  '/nologo',
  '/noconfig',
  '/nostdlib+',
  '/target:library',
  '/platform:x64',
  '/optimize+',
  '/debug-',
  '/unsafe-',
  '/reference:' + framework + '/mscorlib.dll',
  '/reference:' + framework + '/System.dll',
  '/out:' + artifact,
  frozenSource,
];
const result = spawnSync(compiler, args, {
  shell: false,
  windowsHide: true,
  cwd: directory,
  env: { SystemRoot: 'C:/Windows', WINDIR: 'C:/Windows', PATH: '', TEMP: temp, TMP: temp },
  timeout: 30000,
  maxBuffer: 65536,
  encoding: 'utf8',
});
const receipt = {
  kind: 'PRINCIPAL_HELPER_BUILD_ONLY',
  inputs,
  args,
  directory,
  artifact,
  status: result.status,
  signal: result.signal,
  errorCode: result.error?.code ?? null,
  compilerOutputObserved: Boolean(result.stdout || result.stderr),
  identityQueries: 0,
  installed: false,
};
if (result.error || result.status !== 0 || result.signal !== null) {
  await fs.writeFile(
    path.join(directory, 'build-failure.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx' },
  );
  throw Error('HELPER_BUILD_FAILED_RETAINED_NO_LOAD');
}
for (const [file, expected] of pins) await frozenInput(file, expected);
assert.equal(sha(await fs.readFile(frozenSource)), pins.get(source));
const stat = await fs.lstat(artifact);
assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1048576);
const bytes = await fs.readFile(artifact);
assert.equal(bytes.length, stat.size);
Object.assign(receipt, {
  sha256: sha(bytes),
  bytes: bytes.length,
  compilerTempEntries: await fs.readdir(temp),
});
await fs.writeFile(path.join(directory, 'build.json'), JSON.stringify(receipt, null, 2) + '\n', {
  flag: 'wx',
});
console.log(JSON.stringify(receipt));
