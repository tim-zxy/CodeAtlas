// Read-only roles for the approved staged PACK; never a worker or authority issuer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  approvedHashes,
  assertHoldout,
  assertReboundBinding,
  hashFile,
  makeProfileEntries,
  assertToolSeal,
  configuration as c,
  verifyFrozenEvidencePins,
} from './r11-staged-pack.mjs';
const [role, mainSeal, selfSeal, nonce] = process.argv.slice(2);
assert(['original', 'catalog', 'binding'].includes(role));
assert.match(nonce, /^[a-f0-9-]{36}$/);
assertToolSeal(fileURLToPath(new URL('./r11-staged-pack.mjs', import.meta.url)), mainSeal);
assertToolSeal(process.argv[1], selfSeal);
const require = createRequire(import.meta.url),
  audit = { subprocess: 0, mutation: 0, network: 0 };
const deny = (kind, name) => () => {
  audit[kind]++;
  throw Error('Readonly PACK role forbids ' + name);
};
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
  require('node:child_process')[name] = deny('subprocess', name);
for (const name of [
  'writeFile',
  'appendFile',
  'mkdir',
  'mkdtemp',
  'rename',
  'copyFile',
  'unlink',
  'rm',
  'rmdir',
  'chmod',
  'chown',
  'symlink',
  'link',
  'truncate',
  'cp',
]) {
  for (const k of [name, name + 'Sync']) if (fs[k]) fs[k] = deny('mutation', k);
  if (fs.promises[name]) fs.promises[name] = deny('mutation', name);
}
for (const [mod, names] of [
  ['net', ['connect', 'createConnection']],
  ['dgram', ['createSocket']],
  ['http', ['request', 'get']],
  ['https', ['request', 'get']],
])
  for (const name of names) require('node:' + mod)[name] = deny('network', mod + '.' + name);
globalThis.fetch = deny('network', 'fetch');
syncBuiltinESMExports();
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const imp = (root, p) => import(pathToFileURL(path.join(root, p)).href);
verifyFrozenEvidencePins();
const root = role === 'original' ? c.source : c.reader;
const replay = await imp(root, 'packages/runtime/test/helpers/native-refresh-transport-replay.mjs');
const layoutModule = await imp(root, 'scripts/helpers/native-refresh-ci-layout.mjs');
const layout = await layoutModule.readRefreshCiPackLayoutAt(c.measured);
const ctx = layoutModule.refreshCiFixtureContext(layout);
const runtime = await imp(root, 'packages/runtime/dist/native-metadata-admission.js');
const manifestPath = path.join(c.measured, 'evidence/corpus/artifacts/manifest.json');
const manifest = read(manifestPath);
assert.equal(
  manifest.generator.topology.digest,
  'bbeecb7f820f432a7267256bf94c6e1f0c7ea5ebe70f3daf290fc3faa75cace4',
);
const oldBinding = read(path.join(c.measured, 'evidence/corpus/local-binding.json'));
const build = read(path.join(c.frozen, 'evidence/native-build-binding.json'));
assert.deepEqual(runtime.nativeMetadataEnvironment(), build.environment);
let result;
if (role === 'original') {
  assert.equal(
    hashFile(process.execPath, true),
    '3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5',
  );
  assert.equal(hashFile(build.buildResultPath), build.buildResultSha256);
  assert.equal(Object.keys(build.compilerPins).length, 8);
  for (const [p, h] of Object.entries(build.compilerPins))
    assert.equal(hashFile(path.resolve(p), true), h);
  assert.equal(hashFile(path.join(root, build.controller.path)), build.controller.sha256);
  const pack = await imp(root, 'scripts/helpers/native-refresh-ci-pack.mjs');
  await pack.verifyRefreshCiNativeBuildAt(layout, root);
  for (const item of manifest.cases) {
    const capsule = read(path.join(oldBinding.artifactRoot, item.capsulePath));
    assert(capsule.databasePath.startsWith(oldBinding.replayRoot + path.sep));
    const seed = item.assets.find((x) => x.path === item.seedPath);
    assert(seed);
    assert.equal(hashFile(capsule.databasePath), seed.sha256, 'Working database not restored');
  }
  const values = await replay.readRefreshTransportReplayCorpus(
    manifestPath,
    path.join(c.measured, 'evidence/corpus/local-binding.json'),
    ctx,
  );
  const identity = values[0].identity;
  const memory = await imp(root, 'scripts/native-refresh-transport-memory.mjs');
  const candidate = read(path.join(c.measured, 'evidence/candidate.json'));
  assert.equal(
    hashFile(path.join(c.measured, 'evidence/candidate.json')),
    approvedHashes.transport,
  );
  assert.equal(hashFile(path.join(c.measured, 'evidence/raw.json')), approvedHashes.transportRaw);
  assert.equal(hashFile(c.holdout), approvedHashes.holdout);
  assert.deepEqual(
    await memory.buildRefreshTransportCandidate(
      path.join(c.measured, 'evidence', candidate.manifest.path),
      path.join(c.measured, 'evidence'),
      identity,
      ctx,
    ),
    candidate,
  );
  const qualification = read(path.join(c.measured, 'evidence/qualification.json'));
  assert.deepEqual(Object.keys(qualification).sort(), ['cases', 'failures']);
  assert(
    qualification.cases.every((x) => JSON.stringify(Object.keys(x).sort()) === '["name","passed"]'),
  );
  assert.deepEqual(qualification.failures, []);
  assert.deepEqual(
    qualification.cases.map((x) => x.name).sort(),
    [...memory.refreshTransportCases].sort(),
  );
  assert(qualification.cases.every((x) => x.passed === true));
  const holdout = read(c.holdout);
  assertHoldout(candidate, approvedHashes.transport, holdout, memory.refreshTransportCases);
  const raw = read(path.join(c.measured, 'evidence/raw.json'));
  assert.equal(raw.observations.length, 110);
  assert.deepEqual(raw.failures, []);
  const prefix = await replay.createRefreshTransportPrefixAudit(
    path.join(c.measured, 'evidence'),
    identity,
    ctx,
  );
  const origins = [];
  for (const row of [...raw.observations, ...holdout.observations]) {
    memory.validateRefreshTransportObservation(row, identity);
    if (row.name === 'd-cancel') origins.push(await prefix(row));
    else assert.equal(row.outputProof, null);
  }
  assert.equal(origins.length, 6);
  assert.equal(new Set(origins.map((x) => x.artifactSha256)).size, 6);
  assert.equal(new Set(origins.map((x) => x.processNonce)).size, 6);
  const reuse = [];
  const log = console.log;
  console.log = (x) => reuse.push(JSON.parse(x));
  try {
    await import(pathToFileURL(path.join(c.frozen, 'evidence/reuse-252-readonly.mjs')).href);
  } finally {
    console.log = log;
  }
  assert.equal(reuse.length, 1);
  assert.equal(reuse[0].counts.total, 252);
  assert.deepEqual(
    reuse[0],
    read(path.join(c.frozen, 'evidence/reuse-252.stdout.json')),
    'All nine reused artifact identities must match original frozen audit',
  );
  for (const [name, count] of [
    ['paired/read.json', 65],
    ['paired/full.json', 70],
    ['verify/raw.json', 75],
    ['paired-holdout/observations.json', 27],
    ['verify-holdout/holdout.json', 15],
  ])
    assert.equal(read(path.join(c.reused, name)).observations.length, count);
  const pairedCandidate = read(path.join(c.reused, 'paired/candidate.json'));
  for (const { workspace, observation: row } of read(
    path.join(c.reused, 'paired-holdout/observations.json'),
  ).observations)
    if (workspace === 'READ_SEAL')
      assert(
        pairedCandidate.groups.some(
          (g) =>
            g.workspace === workspace &&
            g.caseName === row.name &&
            g.inputIdentity === row.corpusPayloadDigest,
        ),
        'Paired holdout input drift',
      );
  const data = {
    paired: read(path.join(c.reused, 'paired/candidate.json')),
    verify: read(path.join(c.reused, 'verify/candidate.json')),
    transport: candidate,
    fullPeak: Math.max(
      ...read(path.join(c.reused, 'paired/full.json')).observations.map((x) => x.peakResidentBytes),
    ),
    hashes: { ...approvedHashes },
  };
  for (const [key, p] of [
    ['paired', 'paired/candidate.json'],
    ['verify', 'verify/candidate.json'],
    ['readRaw', 'paired/read.json'],
    ['fullRaw', 'paired/full.json'],
    ['verifyRaw', 'verify/raw.json'],
  ])
    assert.equal(hashFile(path.join(c.reused, p)), approvedHashes[key]);
  result = {
    qualification: 22,
    calibration: 110,
    holdout: 22,
    prefixOrigins: origins,
    reused: reuse[0],
    profiles: makeProfileEntries(data),
    environment: identity.environment,
  };
} else {
  const catalog = await replay.discoverRefreshReplayDependencies(ctx, manifest.generator.revision);
  await replay.verifyRefreshReplayDependencyCatalog(
    catalog,
    catalog.roots,
    manifest.generator.dependencies,
    manifest.generator.topology,
  );
  assert.equal(
    catalog.roots.find((x) => x.name === 'repository')?.path,
    c.reader,
    'Discovered wrong repository root',
  );
  const binding = { ...oldBinding, dependencyRoots: catalog.roots };
  assertReboundBinding(oldBinding, binding, catalog.roots);
  const profiles = await imp(root, 'packages/runtime/dist/native-metadata-profiles.js');
  const expected = read(path.join(c.work, 'control/profiles.json'));
  for (const [list, key] of [
    [profiles.nativeMetadataProfiles, 'metadata'],
    [profiles.nativeRefreshVerificationProfiles, 'verification'],
    [profiles.nativeRefreshTransportProfiles, 'transport'],
  ])
    assert.deepEqual(list[0], expected[key]);
  for (const [fn, n] of [
    [(b) => runtime.assertNativeMetadataAdmission(b, 'READ_SEAL'), 232337408],
    [(b) => runtime.assertNativeMetadataAdmission(b, 'FULL_TRANSPORT'), 232337408],
    [runtime.assertNativeRefreshVerificationAdmission, 401006592],
    [runtime.assertNativeRefreshTransportAdmission, 434798592],
  ]) {
    assert.doesNotThrow(() => fn(n));
    assert.throws(() => fn(n - 1));
  }
  if (role === 'binding') {
    const p = path.join(c.payload, 'evidence/corpus/local-binding.json');
    assert.deepEqual(read(p), binding);
    const values = await replay.readRefreshTransportReplayCorpus(manifestPath, p, ctx);
    assert.equal(values.length, 22);
    assert.deepEqual(values[0].identity.environment, build.environment);
  }
  result = {
    binding,
    bindingBytesBase64: replay.encodeRefreshReplayJson(binding).toString('base64'),
    dependencyEntries: catalog.dependencies.length,
    topologyDigest: catalog.topology.digest,
    environment: runtime.nativeMetadataEnvironment(),
    profiles: expected,
  };
}
verifyFrozenEvidencePins();
assert.deepEqual(audit, { subprocess: 0, mutation: 0, network: 0 });
console.log(JSON.stringify({ role, nonce, state: 'VERIFIED_READONLY', audit, ...result }));
