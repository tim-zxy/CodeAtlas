// Private PACK-only orchestration; never measurement or production admission.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export function confinedPath(root, relative) {
  assert.equal(path.resolve(root), root, 'Noncanonical owner root');
  assert.equal(typeof relative, 'string');
  assert(relative.length && !relative.includes('\\') && !relative.includes('\0'));
  assert(!path.isAbsolute(relative) && !/^[A-Za-z]:/.test(relative));
  assert(relative.split('/').every((part) => part && part !== '.' && part !== '..'));
  const resolved = path.resolve(root, relative);
  assert(resolved.startsWith(root + path.sep), 'Path escaped owner');
  return resolved;
}

export function assertReboundBinding(original, rebound, roots) {
  assert(Array.isArray(roots) && roots.length, 'Missing independently discovered roots');
  assert.deepEqual(
    rebound,
    { ...original, dependencyRoots: roots },
    'Only dependencyRoots may change',
  );
}

function entryMap(entries) {
  const result = new Map(),
    folded = new Set();
  for (const entry of entries) {
    assert(!folded.has(entry.path.toLowerCase()), 'Duplicate or case-aliased inventory member');
    folded.add(entry.path.toLowerCase());
    result.set(entry.path, entry);
  }
  return result;
}

export function assertPayloadInventory(original, staged, bindingEntry, holdoutEntry) {
  const expected = entryMap(original);
  assert.equal(bindingEntry.path, 'evidence/corpus/local-binding.json');
  assert.equal(holdoutEntry.path, 'evidence/review/holdout.json');
  assert(expected.has(bindingEntry.path), 'Original binding absent');
  assert(!expected.has(holdoutEntry.path), 'Original already has review closure');
  expected.set(bindingEntry.path, bindingEntry);
  expected.set(holdoutEntry.path, holdoutEntry);
  const actual = entryMap(staged);
  assert.equal(actual.size, expected.size, 'Staged inventory membership changed');
  for (const [name, entry] of expected)
    assert.deepEqual(actual.get(name), entry, 'Staged member changed: ' + name);
}

export function assertHoldout(candidate, digest, holdout, names) {
  assert.deepEqual(
    Object.keys(holdout).sort(),
    [
      'schemaVersion',
      'workspace',
      'candidateSha256',
      'environment',
      'corpus',
      'observations',
      'failures',
    ].sort(),
  );
  assert.equal(holdout.schemaVersion, 2);
  assert.equal(holdout.workspace, 'REFRESH_TRANSPORT');
  assert.equal(holdout.candidateSha256, digest);
  assert.deepEqual(holdout.environment, candidate.environment);
  assert.deepEqual(holdout.corpus, candidate.corpus);
  assert.deepEqual(holdout.failures, []);
  assert.deepEqual(
    holdout.observations.map((row) => row.name).sort(),
    [...names].sort(),
    'Holdout roster differs',
  );
  for (const row of holdout.observations) {
    assert.equal(row.repetition, 0);
    assert(Number.isSafeInteger(row.peakResidentBytes) && row.peakResidentBytes > 0);
    assert(row.peakResidentBytes <= candidate.reservationBytes, 'Holdout exceeded candidate');
  }
}

export async function claimPackAttempt(root, receipt) {
  const record = {
    ...receipt,
    pid: process.pid,
    nonce: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    policy: 'ONE_CREATE_NO_RETRY',
  };
  await writeFile(path.join(root, 'pack-attempt.json'), JSON.stringify(record, null, 2) + '\n', {
    flag: 'wx',
  });
  return record;
}

export const profileDeltaPaths = new Set([
  'packages/runtime/src/native-metadata-profiles.ts',
  'packages/runtime/dist/native-metadata-profiles.js',
  'packages/runtime/dist/native-metadata-profiles.js.map',
  'packages/runtime/dist/native-metadata-profiles.d.ts.map',
]);

export function assertReaderDelta(before, after) {
  const left = entryMap(before),
    right = entryMap(after);
  assert.equal(left.size, right.size, 'Reader membership changed');
  for (const [name, entry] of left) {
    assert(right.has(name), 'Reader member removed');
    if (!profileDeltaPaths.has(name))
      assert.deepEqual(right.get(name), entry, 'Non-profile reader byte changed: ' + name);
  }
}

const hashBuffer = Buffer.alloc(65536);
export function hashFile(file, allowHardlinks = false) {
  const before = fs.lstatSync(file, { bigint: true });
  assert(before.isFile() && !before.isSymbolicLink(), 'Nonregular protected file');
  if (!allowHardlinks) assert.equal(before.nlink, 1n, 'Protected file has hard links');
  assert.equal(fs.realpathSync.native(file), file, 'Protected path alias');
  const fd = fs.openSync(file, 'r'),
    digest = crypto.createHash('sha256');
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'])
      assert.equal(opened[key], before[key], 'File changed before open');
    for (;;) {
      const size = fs.readSync(fd, hashBuffer, 0, hashBuffer.length, null);
      if (!size) break;
      digest.update(hashBuffer.subarray(0, size));
    }
    const after = fs.fstatSync(fd, { bigint: true }),
      current = fs.lstatSync(file, { bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink']) {
      assert.equal(after[key], before[key], 'File changed during hashing');
      assert.equal(current[key], before[key], 'File replaced during hashing');
    }
    return digest.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

export async function inventoryTree(root, { allowLinks = false } = {}) {
  assert.equal(fs.realpathSync.native(root), root, 'Inventory root alias');
  const files = [],
    links = [],
    directories = [],
    identities = [];
  function visit(directory, relative = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const rel = relative ? relative + '/' + name : name,
        file = confinedPath(root, rel);
      const st = fs.lstatSync(file, { bigint: true });
      if (st.isSymbolicLink()) {
        assert(allowLinks, 'Linked payload member');
        const target = fs.realpathSync.native(file),
          targetRel = path.relative(root, target).split(path.sep).join('/');
        confinedPath(root, targetRel);
        links.push({ path: rel, target: targetRel });
      } else if (st.isDirectory()) {
        assert.equal(fs.realpathSync.native(file), file, 'Directory alias');
        directories.push(rel);
        visit(file, rel);
      } else {
        assert(st.isFile(), 'Unsupported file type');
        const sha256 = hashFile(file);
        files.push({ path: rel, bytes: Number(st.size), sha256 });
      }
      identities.push({
        path: rel,
        dev: String(st.dev),
        ino: String(st.ino),
        mtimeNs: String(st.mtimeNs),
        ctimeNs: String(st.ctimeNs),
        nlink: String(st.nlink),
      });
    }
  }
  visit(root);
  for (const list of [files, links, identities])
    list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  directories.sort();
  return { files, links, directories, identities };
}

export function assertExactInventory(expected, actual) {
  assert.deepEqual(actual, expected, 'Inventory or physical identity changed');
}
export function assertToolSeal(file, expected) {
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(hashFile(file), expected, 'Tool identity changed');
}
export function assertSeparateRoots(left, right) {
  for (const [a, b] of [
    [left, right],
    [right, left],
  ]) {
    assert.equal(path.resolve(a), a);
    assert.equal(path.resolve(b), b);
    const rel = path.relative(a, b);
    assert(
      rel && (path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)),
      'Overlapping protected roots',
    );
  }
}
export async function createOwnedDirectory(root) {
  assert.equal(path.resolve(root), root, 'Noncanonical new root');
  assert.equal(
    fs.realpathSync.native(path.dirname(root)),
    path.dirname(root),
    'New root parent alias',
  );
  await fs.promises.mkdir(root);
  assert.equal(fs.realpathSync.native(root), root);
}

export const approvedHashes = Object.freeze({
  paired: '0b12d7cdd8857b2bc38fd28f909ca6edd94784dd6c9be79b267f417c163f6817',
  verify: 'e705a5be31330befa72eb6a12d510ec91a5b2ffb0817a3d7521cc0903c8b37fd',
  transport: 'de07bdfe79fb38e763236107cbab6e693f881c22732895b1d5ffe6186a35f4c9',
  readRaw: '08576b922e5dcb610006a35a781fdef579fa6a3483f093a63479e64f143ce287',
  fullRaw: '500d232400881f200d0818ac6e09ad7d92f63b21126177919a98d1e073afa560',
  verifyRaw: '49d18df9f3f6b22479dbf48ee0c8ffe1cd5d4d56f8a6d189b7b0c272da25ccb5',
  transportRaw: 'cf6aaab9c06e3a9a1794434bf1f662a89977ece6892297a5e36e81044f738556',
  holdout: 'e6b824669e6426eb42eaeebdee77046326f6aade335795b5ebc3a0582d5bd972',
});
export function makeProfileEntries(data) {
  assert.deepEqual(data.hashes, approvedHashes, 'Unapproved candidate/report identity');
  const { paired, verify, transport } = data;
  assert.deepEqual(verify.environment, paired.environment);
  assert.deepEqual(transport.environment, paired.environment);
  for (const [c, value] of [
    [paired, 232337408],
    [verify, 401006592],
    [transport, 434798592],
  ]) {
    assert.equal(c.reservationBytes, value, 'Unapproved numerical value');
    assert.equal(c.policyRevision, 'p05-native-memory-high-water-range-v1');
    assert(Number.isSafeInteger(c.observedPeakBytes) && c.observedPeakBytes > 0);
    assert(Number.isSafeInteger(c.fluctuationAllowanceBytes) && c.fluctuationAllowanceBytes >= 0);
    assert.equal(c.observedPeakBytes + c.fluctuationAllowanceBytes, value);
  }
  const common = (c) => ({
    ...c.environment,
    memoryPolicyRevision: c.policyRevision,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    reservationBytes: c.reservationBytes,
    observedPeakBytes: c.observedPeakBytes,
    fluctuationAllowanceBytes: c.fluctuationAllowanceBytes,
  });
  assert(
    Number.isSafeInteger(data.fullPeak) &&
      data.fullPeak > 0 &&
      data.fullPeak <= paired.reservationBytes,
  );
  return {
    metadata: {
      ...common(paired),
      corpusDigest: paired.corpora.READ_SEAL.digest,
      evidenceDigest: data.hashes.readRaw,
      fullTransportCorpusRevision: paired.corpora.FULL_TRANSPORT.revision,
      fullTransportCorpusDigest: paired.corpora.FULL_TRANSPORT.digest,
      fullTransportEvidenceDigest: data.hashes.fullRaw,
      fullTransportPeakBytes: data.fullPeak,
      memoryCandidateEvidenceDigest: data.hashes.paired,
    },
    verification: {
      ...common(verify),
      workspace: 'REFRESH_VERIFY',
      verificationCorpusRevision: verify.corpus.revision,
      verificationCorpusDigest: verify.corpus.digest,
      evidenceDigest: data.hashes.verifyRaw,
      memoryCandidateEvidenceDigest: data.hashes.verify,
    },
    transport: {
      ...common(transport),
      workspace: 'REFRESH_TRANSPORT',
      transportCorpusRevision: transport.corpus.revision,
      transportCorpusDigest: transport.corpus.digest,
      evidenceDigest: data.hashes.transportRaw,
      memoryCandidateEvidenceDigest: data.hashes.transport,
    },
  };
}
export function insertProfileEntries(source, entries) {
  let result = source;
  for (const [name, key] of [
    ['nativeRefreshTransportProfiles', 'transport'],
    ['nativeRefreshVerificationProfiles', 'verification'],
    ['nativeMetadataProfiles', 'metadata'],
  ]) {
    const marker = 'export const ' + name;
    const start = result.indexOf(marker);
    assert(
      start >= 0 && result.indexOf(marker, start + marker.length) === -1,
      'Unknown catalog anchor',
    );
    const end = result.indexOf('export ', start + marker.length),
      array = result.indexOf('Object.freeze([', start);
    assert(array >= 0 && (end < 0 || array < end), 'Unknown catalog array');
    const at = array + 'Object.freeze(['.length;
    result =
      result.slice(0, at) +
      '\n    Object.freeze(' +
      JSON.stringify(entries[key], null, 2) +
      '),' +
      result.slice(at);
  }
  return result;
}
export async function emitCatalog(readerRoot, outputRoot) {
  const { createRequire } = await import('node:module');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  assertSeparateRoots(readerRoot, outputRoot);
  await createOwnedDirectory(outputRoot);
  const require = createRequire(path.join(readerRoot, 'package.json'));
  const compiler = path.dirname(require.resolve('typescript/package.json'));
  const metadata = JSON.parse(fs.readFileSync(path.join(compiler, 'package.json'), 'utf8'));
  assert.equal(metadata.version, '7.0.2');
  assert.equal(metadata.bin.tsc, './bin/tsc');
  const src = path.join(readerRoot, 'packages/runtime/src/native-metadata-profiles.ts');
  const config = {
    extends: path.join(readerRoot, 'packages/runtime/tsconfig.json'),
    files: [src],
    include: [],
    compilerOptions: {
      outDir: path.join(outputRoot, 'emit'),
      rootDir: path.dirname(src),
      typeRoots: [path.join(readerRoot, 'node_modules/@types')],
      incremental: true,
      tsBuildInfoFile: path.join(outputRoot, 'catalog.tsbuildinfo'),
      noEmitOnError: true,
    },
  };
  await writeFile(path.join(outputRoot, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n', {
    flag: 'wx',
  });
  const env = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: outputRoot,
    TMP: outputRoot,
  };
  const result = await promisify(execFile)(
    process.execPath,
    [path.join(compiler, 'bin/tsc'), '-p', path.join(outputRoot, 'tsconfig.json')],
    { cwd: readerRoot, env, timeout: 60000, maxBuffer: 1048576, windowsHide: true },
  );
  assert.equal(result.stdout.trim(), '', 'Unexpected compiler diagnostic');
  assert.equal(result.stderr.trim(), '', 'Unexpected compiler diagnostic');
  const expected = [
    'native-metadata-profiles.d.ts',
    'native-metadata-profiles.d.ts.map',
    'native-metadata-profiles.js',
    'native-metadata-profiles.js.map',
  ];
  assert.deepEqual(fs.readdirSync(path.join(outputRoot, 'emit')).sort(), expected);
  const emitted = new Map(
    expected.map((name) => [name, fs.readFileSync(path.join(outputRoot, 'emit', name), 'utf8')]),
  );
  assert.equal(
    emitted.get('native-metadata-profiles.d.ts'),
    fs.readFileSync(
      path.join(readerRoot, 'packages/runtime/dist/native-metadata-profiles.d.ts'),
      'utf8',
    ),
    'Captured declaration changed',
  );
  return emitted;
}

export const configuration = Object.freeze({
  work: 'D:\\CodeAtlas-R11-PACK-v2',
  reader: 'D:\\CodeAtlas-R11-PACK-v2\\reader',
  payload: 'D:\\CodeAtlas-R11-PACK-v2\\payload',
  measured: 'C:\\CodeAtlas-P05-D5-R11',
  frozen: 'D:\\workspace\\CodeAtlas-frozen-1e78a8c-v1',
  source: 'D:\\workspace\\CodeAtlas-frozen-1e78a8c-v1\\source',
  reused: 'D:\\workspace\\CodeAtlas-phase1-20261106\\.superpowers\\qualification-9633ded-r10-v1',
  holdout:
    'D:\\workspace\\CodeAtlas-phase1-20261106\\.superpowers\\qualification-1e78a8c-r11-v1\\transport-holdout\\holdout.json',
  powershell:
    'C:\\Users\\Freya\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe',
});
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const put = (p, value) => writeFile(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const content = (x) => ({ files: x.files, links: x.links, directories: x.directories });

export async function copyInventory(source, destination, inventory) {
  await createOwnedDirectory(destination);
  for (const rel of inventory.directories) await fs.promises.mkdir(confinedPath(destination, rel));
  for (const entry of inventory.files) {
    const original = confinedPath(source, entry.path),
      target = confinedPath(destination, entry.path);
    assert.equal(hashFile(original), entry.sha256, 'Copy input drift');
    await fs.promises.copyFile(original, target, fs.constants.COPYFILE_EXCL);
    assert.equal(hashFile(target), entry.sha256, 'Copy output drift');
  }
  for (const entry of inventory.links) {
    const original = confinedPath(source, entry.path),
      target = confinedPath(destination, entry.path),
      referent = confinedPath(destination, entry.target);
    assert.equal(
      fs.realpathSync.native(original),
      confinedPath(source, entry.target),
      'Link input drift',
    );
    await fs.promises.symlink(referent, target, 'junction');
  }
  assert.deepEqual(
    content(await inventoryTree(destination, { allowLinks: true })),
    content(inventory),
    'Copy membership/bytes/topology differ',
  );
}

async function readerRole(role, seals) {
  const { execFile } = await import('node:child_process'),
    { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const main = fileURLToPath(import.meta.url),
    child = fileURLToPath(new URL('./r11-pack-reader.mjs', import.meta.url));
  assertToolSeal(main, seals.main);
  assertToolSeal(child, seals.child);
  const nonce = crypto.randomUUID();
  const env = {
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };
  const output = await promisify(execFile)(
    process.execPath,
    [child, role, seals.main, seals.child, nonce],
    { cwd: configuration.source, env, windowsHide: true, timeout: 900000, maxBuffer: 4194304 },
  );
  assertToolSeal(main, seals.main);
  assertToolSeal(child, seals.child);
  const value = JSON.parse(output.stdout);
  assert.equal(value.role, role);
  assert.equal(value.nonce, nonce);
  assert.equal(value.state, 'VERIFIED_READONLY');
  assert.deepEqual(value.audit, { subprocess: 0, mutation: 0, network: 0 });
  return { value, stderr: output.stderr, childExit: 0, endedAt: new Date().toISOString() };
}

export const frozenEvidencePins = Object.freeze({
  'reuse-252.stdout.json': '280badbe9dfe4e89c0f63e67a52cbbdfe216a29eb686a1ab1a881cec8ab45379',
  'final-freeze-verification.json':
    'e6b994e2f8e3f6cff22a8963c443776db9a39294173d6ec1d3791d51280b4c76',
  'reuse-252-readonly.mjs': 'bfeb4ede753f0685a635846bd9ec187dd6932c2a8638db74ada4d1bbab085697',
  'byte-inventories.json': '714b3fddbba26ce1f2acd41b7962bf7b2b049a398017c5148a7cf95105b014f9',
  'native-build-binding.json': 'bf7dd24344555eaa9f7a8e49b85555c29e6910b54f56e69ab08cf5a922501003',
  'all-links.json': '22506c64549f09f9981a484e6ca53b5c07b11b9f9efdc60dad6de1d9b7a1152e',
});
export function verifyFrozenEvidencePins() {
  for (const [p, h] of Object.entries(frozenEvidencePins))
    assertToolSeal(path.join(configuration.frozen, 'evidence', p), h);
}
function checkSeals(seals) {
  assertToolSeal(fileURLToPath(import.meta.url), seals.main);
  assertToolSeal(fileURLToPath(new URL('./r11-pack-reader.mjs', import.meta.url)), seals.child);
}
async function frozenBaseline() {
  const c = configuration;
  verifyFrozenEvidencePins();
  const frozen = await inventoryTree(c.frozen, { allowLinks: true });
  assert.equal(
    hashFile(path.join(c.frozen, 'evidence/final-freeze-verification.json')),
    'e6b994e2f8e3f6cff22a8963c443776db9a39294173d6ec1d3791d51280b4c76',
  );
  const listed = json(path.join(c.frozen, 'evidence/byte-inventories.json'));
  const source = await inventoryTree(c.source, { allowLinks: true });
  const map = new Map(source.files.map((x) => [x.path, x]));
  for (const e of listed.sourceFiles)
    assert.deepEqual(map.get(e.path), e, 'Frozen source byte drift');
  for (const e of listed.compiledOutputs)
    assert.deepEqual(
      map.get(e.path.replace(/^source\//, '')),
      { ...e, path: e.path.replace(/^source\//, '') },
      'Frozen dist drift',
    );
  for (const [i, record] of listed.inventories.entries()) {
    const instance = listed.instances[i];
    assert.equal(record.snapshot, instance.snapshot);
    for (const e of record.files) {
      const rel = instance.path.replace(/^source\//, '') + '/' + e.path;
      assert.deepEqual(
        map.get(rel),
        { path: rel, bytes: e.bytes, sha256: e.sha256 },
        'Frozen dependency drift',
      );
    }
  }
  const original = await inventoryTree(c.measured);
  assert.equal(original.links.length, 0);
  assert.deepEqual(fs.readdirSync(path.join(c.measured, 'temp')), [], 'Original temp not settled');
  assert(
    !original.files.some((e) => /-(wal|shm|journal)$/i.test(e.path)),
    'SQLite sidecar present',
  );
  const holdout = { path: c.holdout, sha256: hashFile(c.holdout) };
  assert.equal(holdout.sha256, approvedHashes.holdout);
  return {
    source,
    original,
    holdout,
    frozen,
    tools: {
      powershell: hashFile(c.powershell, true),
      tar: hashFile('C:\\Windows\\System32\\tar.exe', true),
    },
  };
}
async function unchanged(baseline) {
  verifyFrozenEvidencePins();
  assertExactInventory(
    baseline.frozen,
    await inventoryTree(configuration.frozen, { allowLinks: true }),
  );
  assert.equal(hashFile(configuration.powershell, true), baseline.tools.powershell);
  assert.equal(hashFile('C:\\Windows\\System32\\tar.exe', true), baseline.tools.tar);
  assertExactInventory(
    baseline.source,
    await inventoryTree(configuration.source, { allowLinks: true }),
  );
  assertExactInventory(baseline.original, await inventoryTree(configuration.measured));
  assert.equal(hashFile(configuration.holdout), baseline.holdout.sha256);
}
async function stagePrepare(seals) {
  const c = configuration;
  assertSeparateRoots(c.work, c.frozen);
  assertSeparateRoots(c.work, c.measured);
  assertSeparateRoots(c.work, c.reused);
  assert(!fs.existsSync(c.work), 'Prior staging root refuses preparation');
  const baseline = await frozenBaseline();
  await createOwnedDirectory(c.work);
  await fs.promises.mkdir(path.join(c.work, 'control'));
  await fs.promises.mkdir(path.join(c.work, 'output'));
  await put(path.join(c.work, 'control/baseline.json'), baseline);
  // Preparation reads exact approved candidate bytes; full semantics are checked fresh at PACK.
  const candidateFiles = {
    paired: path.join(c.reused, 'paired/candidate.json'),
    verify: path.join(c.reused, 'verify/candidate.json'),
    transport: path.join(c.measured, 'evidence/candidate.json'),
    readRaw: path.join(c.reused, 'paired/read.json'),
    fullRaw: path.join(c.reused, 'paired/full.json'),
    verifyRaw: path.join(c.reused, 'verify/raw.json'),
    transportRaw: path.join(c.measured, 'evidence/raw.json'),
    holdout: c.holdout,
  };
  for (const [key, p] of Object.entries(candidateFiles))
    assert.equal(hashFile(p), approvedHashes[key]);
  const profiles = makeProfileEntries({
    paired: json(candidateFiles.paired),
    verify: json(candidateFiles.verify),
    transport: json(candidateFiles.transport),
    fullPeak: Math.max(
      ...json(candidateFiles.fullRaw).observations.map((x) => x.peakResidentBytes),
    ),
    hashes: { ...approvedHashes },
  });
  await put(path.join(c.work, 'control/profiles.json'), profiles);
  await copyInventory(c.source, c.reader, baseline.source);
  const src = path.join(c.reader, 'packages/runtime/src/native-metadata-profiles.ts');
  await writeFile(src, insertProfileEntries(fs.readFileSync(src, 'utf8'), profiles));
  const emitted = await emitCatalog(c.reader, path.join(c.work, 'catalog-build'));
  for (const [name, text] of emitted)
    if (name !== 'native-metadata-profiles.d.ts')
      await writeFile(path.join(c.reader, 'packages/runtime/dist', name), text);
  const reader = await inventoryTree(c.reader, { allowLinks: true });
  assertReaderDelta(baseline.source.files, reader.files);
  assert.deepEqual(reader.links, baseline.source.links);
  assert.deepEqual(reader.directories, baseline.source.directories);
  const catalog = await readerRole('catalog', seals);
  await put(path.join(c.work, 'control/catalog.json'), catalog);
  await copyInventory(c.measured, c.payload, baseline.original);
  const bindingPath = path.join(c.payload, 'evidence/corpus/local-binding.json');
  assertReboundBinding(
    json(path.join(c.measured, 'evidence/corpus/local-binding.json')),
    catalog.value.binding,
    catalog.value.binding.dependencyRoots,
  );
  const canonicalBinding = Buffer.from(catalog.value.bindingBytesBase64, 'base64');
  assert.deepEqual(JSON.parse(canonicalBinding.toString('utf8')), catalog.value.binding);
  await writeFile(bindingPath, canonicalBinding);
  await fs.promises.mkdir(path.join(c.payload, 'evidence/review'));
  await fs.promises.copyFile(
    c.holdout,
    path.join(c.payload, 'evidence/review/holdout.json'),
    fs.constants.COPYFILE_EXCL,
  );
  const binding = await readerRole('binding', seals);
  await put(path.join(c.work, 'control/binding.json'), binding);
  const payload = await inventoryTree(c.payload);
  const entry = (p) => payload.files.find((e) => e.path === p);
  assertPayloadInventory(
    baseline.original.files,
    payload.files,
    entry('evidence/corpus/local-binding.json'),
    entry('evidence/review/holdout.json'),
  );
  await unchanged(baseline);
  const receipt = {
    state: 'PREPARED_NOT_PACKED_NOT_QUALIFIED',
    seals,
    baselineSha256: hashFile(path.join(c.work, 'control/baseline.json')),
    profilesSha256: hashFile(path.join(c.work, 'control/profiles.json')),
    reader,
    payload,
    endedAt: new Date().toISOString(),
    nativeExecuted: false,
    sampling: false,
  };
  await put(path.join(c.work, 'control/prepared.json'), receipt);
  return {
    state: receipt.state,
    prepareSha256: hashFile(path.join(c.work, 'control/prepared.json')),
  };
}
async function stagePack(seals, prepareSha256) {
  const c = configuration,
    preparedPath = path.join(c.work, 'control/prepared.json');
  assertToolSeal(preparedPath, prepareSha256);
  const prepared = json(preparedPath);
  assert.equal(prepared.state, 'PREPARED_NOT_PACKED_NOT_QUALIFIED');
  assert.deepEqual(prepared.seals, seals);
  // Consumed before the final validations: failures and uncertain outcomes never retry.
  await claimPackAttempt(c.work, { seals, prepareSha256 });
  const baselinePath = path.join(c.work, 'control/baseline.json');
  assertToolSeal(baselinePath, prepared.baselineSha256);
  assertToolSeal(path.join(c.work, 'control/profiles.json'), prepared.profilesSha256);
  const baseline = json(baselinePath);
  await unchanged(baseline);
  assertExactInventory(prepared.reader, await inventoryTree(c.reader, { allowLinks: true }));
  assertExactInventory(prepared.payload, await inventoryTree(c.payload));
  const original = await readerRole('original', seals),
    binding = await readerRole('binding', seals);
  await put(path.join(c.work, 'control/final-original.json'), original);
  await put(path.join(c.work, 'control/final-binding.json'), binding);
  const archivePath = path.join(c.work, 'output/codeatlas-p05-d5-r11.zip');
  assert(!fs.existsSync(archivePath));
  const { spawnSync } = await import('node:child_process');
  const script = path.join(c.source, 'scripts/native-refresh-ci-pack.ps1');
  const scriptEntry = baseline.source.files.find(
    (e) => e.path === 'scripts/native-refresh-ci-pack.ps1',
  );
  assertToolSeal(script, scriptEntry.sha256);
  const entries = prepared.payload.files.filter(
    (e) => e.path.startsWith('evidence/') || e.path === 'native/codeatlas-native-analyzer.exe',
  );
  assert.equal(entries.length, prepared.payload.files.length, 'Unexpected non-archive payload');
  checkSeals(seals);
  assert.equal(hashFile(c.powershell, true), baseline.tools.powershell);
  const child = spawnSync(
    c.powershell,
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      script,
      '-Mode',
      'Create',
      '-ArchivePath',
      archivePath,
      '-RootPath',
      c.payload,
    ],
    { input: JSON.stringify({ entries }), encoding: 'utf8', windowsHide: true, maxBuffer: 4194304 },
  );
  await put(path.join(c.work, 'control/create-exit.json'), {
    status: child.status,
    signal: child.signal,
    error: child.error?.message ?? null,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    endedAt: new Date().toISOString(),
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    verified: true,
    mode: 'Create',
    entries: entries.length,
  });
  const archive = { entries, bytes: fs.statSync(archivePath).size, sha256: hashFile(archivePath) };
  const { pathToFileURL } = await import('node:url');
  const imp = (p) => import(pathToFileURL(path.join(c.source, p)).href);
  const pack = await imp('scripts/helpers/native-refresh-ci-pack.mjs'),
    layouts = await imp('scripts/helpers/native-refresh-ci-layout.mjs');
  let inspection;
  const previousPath = process.env.PATH;
  process.env.PATH = path.dirname(c.powershell) + ';C:\\Windows\\System32';
  try {
    await pack.verifyRefreshCiArchive(archivePath, archive);
    inspection = await layouts.createExclusiveRefreshCiRootAt(path.join(c.work, 'inspection'));
    await pack.extractRefreshCiArchive(archivePath, archive, inspection);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
  checkSeals(seals);
  const decoded = await inventoryTree(inspection.root);
  assert.deepEqual(decoded.files, entries, 'Decoded payload bytes/membership differ');
  assertExactInventory(prepared.reader, await inventoryTree(c.reader, { allowLinks: true }));
  assertExactInventory(prepared.payload, await inventoryTree(c.payload));
  await unchanged(baseline);
  assertToolSeal(preparedPath, prepareSha256);
  assertToolSeal(script, scriptEntry.sha256);
  const result = {
    state: 'PACKED_DECODED_VERIFIED_NOT_QUALIFIED',
    archivePath,
    archive,
    prepareSha256,
    seals,
    originalEvidencePreserved: true,
    decodedFiles: decoded.files.length,
    nativeExecuted: false,
    sampling: false,
    published: false,
    ciSwitched: false,
    actual22: 'STILL_REQUIRED',
    endedAt: new Date().toISOString(),
  };
  await put(path.join(c.work, 'control/result.json'), result);
  return {
    state: result.state,
    archivePath,
    entries: entries.length,
    bytes: archive.bytes,
    sha256: archive.sha256,
  };
}
export async function runStagedPack(command, seals, prepareSha256) {
  const { fileURLToPath } = await import('node:url');
  assertToolSeal(fileURLToPath(import.meta.url), seals.main);
  assertToolSeal(fileURLToPath(new URL('./r11-pack-reader.mjs', import.meta.url)), seals.child);
  assert.equal(
    hashFile(process.execPath, true),
    '3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5',
  );
  assert(['prepare', 'pack'].includes(command));
  try {
    return command === 'prepare'
      ? await stagePrepare(seals)
      : await stagePack(seals, prepareSha256);
  } catch (error) {
    if (fs.existsSync(path.join(configuration.work, 'control')))
      await put(
        path.join(
          configuration.work,
          'control/failure-' + command + '-' + crypto.randomUUID() + '.json',
        ),
        {
          state: 'STOPPED_NO_RETRY',
          message: error.message,
          stack: error.stack,
          endedAt: new Date().toISOString(),
        },
      );
    throw error;
  }
}
const { fileURLToPath } = await import('node:url');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, main, child, prepareSha256] = process.argv.slice(2);
  try {
    console.log(JSON.stringify(await runStagedPack(command, { main, child }, prepareSha256)));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}
