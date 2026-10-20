// Private development evidence packaging; never production admission or publication.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  consumeRefreshCiLayout,
  createExclusiveRefreshCiRootAt,
  hashRefreshCiFile,
  refreshCiFixtureContext,
  refreshCiLayoutRootForRevision,
  assertRefreshCiOutputOutsideLayouts,
  verifyRefreshCiLayoutOwnership,
} from './native-refresh-ci-layout.mjs';
import { nativeMetadataEnvironment } from '../../packages/runtime/dist/native-metadata-admission.js';
import { nativeRefreshTransportProfiles } from '../../packages/runtime/dist/native-metadata-profiles.js';
import {
  decodeRefreshReplayJson,
  discoverRefreshReplayDependencies,
  encodeRefreshReplayJson,
  readRefreshTransportReplayCorpus,
  validateRefreshReplayLocalBindingRecord,
  validateRefreshReplayManifestRecord,
  verifyRefreshReplayDependencyCatalog,
} from '../../packages/runtime/test/helpers/native-refresh-transport-replay.mjs';
import {
  buildRefreshTransportCandidate,
  refreshTransportCases,
  validateRefreshTransportObservation,
} from '../native-refresh-transport-memory.mjs';

function fields(value, names) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Invalid pack record');
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), 'Unknown or missing pack fields');
}
function digest(value) {
  assert.ok(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid pack digest');
}
function counter(value, positive = false) {
  assert.ok(Number.isSafeInteger(value) && value >= (positive ? 1 : 0), 'Invalid pack counter');
}
function text(value) {
  assert.ok(
    typeof value === 'string' && value.length > 0 && !value.includes('\0'),
    'Invalid pack text',
  );
}
function relativePath(value) {
  text(value);
  // The producer-owned synthetic tree uses ASCII names. Do not grow a portable
  // Windows alias/Unicode-normalization scheme merely to accept arbitrary ZIPs.
  assert.ok(
    value
      .split('/')
      .every(
        (part) =>
          /^[A-Za-z0-9_.-]+$/.test(part) &&
          part !== '.' &&
          part !== '..' &&
          !part.endsWith('.') &&
          !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
      ),
    'Invalid pack path',
  );
}
function inventory(values, owned) {
  assert.ok(Array.isArray(values) && values.length > 0, 'Empty pack inventory');
  const names = new Map();
  let previous = '',
    total = 0;
  for (const entry of values) {
    fields(entry, ['path', 'bytes', 'sha256']);
    relativePath(entry.path);
    if (owned)
      assert.ok(
        entry.path.startsWith('evidence/') || entry.path === 'native/codeatlas-native-analyzer.exe',
        'Pack entry is outside owned subtrees',
      );
    assert.ok(previous < entry.path, 'Unsorted or duplicate pack inventory');
    previous = entry.path;
    const key = entry.path.toLowerCase();
    assert.ok(!names.has(key), 'Case-aliased pack inventory');
    names.set(key, entry);
    counter(entry.bytes);
    digest(entry.sha256);
    total += entry.bytes;
    counter(total);
  }
  for (const key of names.keys()) {
    const parts = key.split('/');
    for (let index = 1; index < parts.length; index++)
      assert.ok(
        !names.has(parts.slice(0, index).join('/')),
        'Pack file is also a parent directory',
      );
  }
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const member of Object.values(value)) freeze(member);
    Object.freeze(value);
  }
  return value;
}

async function readEvidenceJson(file) {
  // Existing candidate/holdout tools deliberately use formatted JSON. Authenticate
  // their original file bytes separately; canonical validation snapshots DATA only.
  return decodeRefreshReplayJson(encodeRefreshReplayJson(JSON.parse(await readFile(file, 'utf8'))));
}

function snapshotArchive(input) {
  const value = decodeRefreshReplayJson(encodeRefreshReplayJson(input));
  fields(value, ['sha256', 'bytes', 'entries']);
  digest(value.sha256);
  counter(value.bytes, true);
  inventory(value.entries, true);
  return freeze(value);
}

// Membership is discovered from the reviewed checkout, never from approval.sourceFiles.
export async function discoverRefreshCiNativeSourceAt(root) {
  assert.ok(typeof root === 'string' && path.isAbsolute(root) && path.resolve(root) === root);
  assert.equal(await realpath(root), root, 'Native source root alias');
  const rootInfo = await lstat(root);
  assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink());
  const result = [];
  async function visit(relative) {
    relativePath(relative);
    const file = path.join(root, relative);
    const info = await lstat(file);
    assert.ok(!info.isSymbolicLink(), 'Linked Native source input');
    assert.equal(await realpath(file), file, 'Native source input alias');
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(relative + '/' + name);
    } else {
      assert.ok(info.isFile(), 'Nonregular Native source input');
      const sha256 = await hashRefreshCiFile(file);
      const after = await lstat(file);
      assert.equal(after.size, info.size, 'Native source size changed');
      result.push({ path: relative, bytes: info.size, sha256 });
    }
  }
  for (const relative of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'crates'])
    await visit(relative);
  for (const relative of ['.cargo', 'build.rs']) {
    try {
      await lstat(path.join(root, relative));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    await visit(relative);
  }
  result.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  inventory(result, false);
  return freeze(result);
}

export async function verifyRefreshCiNativeSourceAt(root, expected) {
  const sourceFiles = decodeRefreshReplayJson(encodeRefreshReplayJson(expected));
  inventory(sourceFiles, false);
  assert.deepEqual(
    await discoverRefreshCiNativeSourceAt(root),
    sourceFiles,
    'Native source/build inventory mismatch',
  );
}

async function zipOperation(mode, archivePath, archive, root) {
  assert.equal(process.platform, 'win32', 'Exact CI ZIP execution requires Windows');
  assert.equal(await hashRefreshCiFile(archivePath), archive.sha256, 'Archive hash mismatch');
  assert.equal((await lstat(archivePath)).size, archive.bytes, 'Archive byte length mismatch');
  const child = spawnSync(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      fileURLToPath(new URL('../native-refresh-ci-pack.ps1', import.meta.url)),
      '-Mode',
      mode,
      '-ArchivePath',
      archivePath,
      ...(root === undefined ? [] : ['-RootPath', root]),
    ],
    { input: encodeRefreshReplayJson(archive), encoding: 'utf8', windowsHide: true },
  );
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  fields(result, ['verified', 'mode', 'entries']);
  assert.equal(result.verified, true);
  assert.equal(result.mode, mode);
  assert.equal(result.entries, archive.entries.length);
}

// ZIP integrity/geometry primitives only, NOT complete approval or Native eligibility.
export async function verifyRefreshCiArchive(archivePath, input) {
  await zipOperation('Validate', archivePath, snapshotArchive(input));
}

// Pre-acquisition identity gate only. Full reader/candidate eligibility is still
// required after installation; this function never executes packed Native bytes.
export async function verifyRefreshCiPack({ approval: input, archivePath, repositoryPath }) {
  const approval = validateRefreshCiApproval(input);
  assert.deepEqual(nativeMetadataEnvironment(), approval.environment, 'Pack environment mismatch');
  await verifyRefreshCiNativeSourceAt(repositoryPath, approval.native.sourceFiles);
  await verifyRefreshCiArchive(archivePath, approval.archive);
  return approval;
}

// The injectable HTTP transport is a development-test seam, not an archive URL override.
export async function downloadRefreshCiArchive(input, output, repository, fetchImpl = fetch) {
  const approval = validateRefreshCiApproval(input);
  assert.equal(
    approval.release.repository,
    repository,
    'Asset repository differs from current repository',
  );
  assert.ok(path.isAbsolute(output) && path.resolve(output) === output);
  assert.equal(
    await realpath(path.dirname(output)),
    path.dirname(output),
    'Asset output parent alias',
  );
  const base = `https://api.github.com/repos/${repository}/releases`;
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const metadataResponse = await fetchImpl(`${base}/${approval.release.releaseId}`, { headers });
  assert.equal(metadataResponse.status, 200, 'Pinned release is unavailable');
  const metadata = await metadataResponse.json();
  assert.equal(metadata.id, approval.release.releaseId, 'Pinned release identity changed');
  assert.equal(metadata.tag_name, approval.release.tag, 'Pinned release tag changed');
  const assets = metadata.assets.filter((asset) => asset.id === approval.release.assetId);
  assert.equal(assets.length, 1, 'Pinned release asset missing or duplicated');
  assert.equal(assets[0].name, approval.release.assetName, 'Pinned asset name changed');
  assert.equal(assets[0].size, approval.archive.bytes, 'Pinned asset size changed');
  const handle = await open(output, 'wx');
  try {
    const response = await fetchImpl(`${base}/assets/${approval.release.assetId}`, {
      headers: { ...headers, Accept: 'application/octet-stream' },
    });
    assert.equal(response.status, 200, 'Pinned asset is unavailable');
    assert.ok(response.body, 'Pinned asset has no body');
    const hash = createHash('sha256');
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      assert.ok(length <= approval.archive.bytes, 'Pinned asset length exceeds approval');
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
    assert.equal(length, approval.archive.bytes, 'Pinned asset length differs');
    assert.equal(hash.digest('hex'), approval.archive.sha256, 'Pinned asset hash differs');
    await handle.sync();
  } finally {
    await handle.close();
  }
  assert.equal(
    await hashRefreshCiFile(output),
    approval.archive.sha256,
    'Downloaded asset changed',
  );
  return output;
}

export async function extractRefreshCiArchive(archivePath, input, layout) {
  const archive = snapshotArchive(input);
  await zipOperation('Validate', archivePath, archive);
  const rootInfo = await consumeRefreshCiLayout(layout);
  assert.deepEqual(
    (await readdir(layout.root)).sort(),
    ['native', 'temp'],
    'CI root is not pristine',
  );
  for (const directory of [path.dirname(layout.nativePath), layout.tempRoot]) {
    assert.equal(await realpath(directory), directory, 'CI directory alias');
    const info = await lstat(directory);
    assert.ok(info.isDirectory() && !info.isSymbolicLink());
    assert.deepEqual(await readdir(directory), [], 'CI directory is not empty');
  }
  await zipOperation('Extract', archivePath, archive, layout.root);
  const current = await lstat(layout.root, { bigint: true });
  assert.equal(current.dev, rootInfo.dev);
  assert.equal(current.ino, rootInfo.ino);
  for (const entry of archive.entries) {
    const file = path.join(layout.root, entry.path);
    assert.equal((await lstat(file)).size, entry.bytes);
    assert.equal(await hashRefreshCiFile(file), entry.sha256, 'Extracted file changed');
  }
}

// Trusted internal test root seam; operational entry below accepts no layout override.
export async function installRefreshCiPackAt(args, root) {
  const approval = await verifyRefreshCiPack(args);
  const manifestRelative = 'evidence/corpus/artifacts/manifest.json';
  const bindingRelative = 'evidence/corpus/local-binding.json';
  for (const name of [manifestRelative, bindingRelative, 'evidence/native-build.json'])
    assert.ok(
      approval.archive.entries.some((entry) => entry.path === name),
      'Missing replay closure entry',
    );
  const layout = await createExclusiveRefreshCiRootAt(root);
  await extractRefreshCiArchive(args.archivePath, approval.archive, layout);
  const manifestPath = path.join(root, manifestRelative);
  const bindingPath = path.join(root, bindingRelative);
  const manifest = validateRefreshReplayManifestRecord(
    decodeRefreshReplayJson(await readFile(manifestPath)),
  );
  const binding = validateRefreshReplayLocalBindingRecord(
    decodeRefreshReplayJson(await readFile(bindingPath)),
    manifest,
  );
  assert.deepEqual(manifest.corpus, approval.corpus, 'Pack corpus differs');
  assert.equal(
    manifest.generator.revision,
    approval.layoutRevision === 'p05-d5-exact-layout-v1'
      ? 'p05-refresh-replay-v2'
      : 'p05-refresh-replay-v3',
    'Pack generator/layout revision differs',
  );
  assert.equal(binding.artifactRoot, path.dirname(manifestPath), 'Pack artifact geometry differs');
  assert.equal(
    binding.replayRoot,
    path.join(layout.evidenceRoot, 'corpus', 'replay'),
    'Pack replay geometry differs',
  );
  const buildReceipt = await verifyRefreshCiNativeBuildAt(layout, args.repositoryPath);
  assert.deepEqual(buildReceipt.native, approval.native, 'Pack build provenance differs');
  const fixtureContext = refreshCiFixtureContext(layout);
  const catalog = await discoverRefreshReplayDependencies(
    fixtureContext,
    manifest.generator.revision,
  );
  assert.equal(
    catalog.roots.find((entry) => entry.name === 'repository')?.path,
    await realpath(args.repositoryPath),
    'Installer checkout differs from loaded reader',
  );
  await verifyRefreshReplayDependencyCatalog(
    catalog,
    catalog.roots,
    manifest.generator.dependencies,
  );
  // This locator alone is explicitly nonsemantic; all other archived bytes stay pinned.
  const localBinding = validateRefreshReplayLocalBindingRecord(
    { ...binding, dependencyRoots: catalog.roots },
    manifest,
  );
  await writeFile(bindingPath, encodeRefreshReplayJson(localBinding));
  const values = await readRefreshTransportReplayCorpus(manifestPath, bindingPath, fixtureContext);
  assert.deepEqual(values.map((value) => value.name).sort(), [...refreshTransportCases].sort());
  const candidatePath = path.join(root, approval.candidate.path);
  const candidate = await readEvidenceJson(candidatePath);
  relativePath(candidate.manifest?.path);
  assert.deepEqual(
    candidate,
    await buildRefreshTransportCandidate(
      path.join(layout.evidenceRoot, candidate.manifest.path),
      layout.evidenceRoot,
      values[0].identity,
      fixtureContext,
    ),
    'Packed candidate differs from original evidence',
  );
  for (const name of [
    'reservationBytes',
    'observedPeakBytes',
    'fluctuationAllowanceBytes',
    'policyRevision',
  ])
    assert.equal(candidate[name], approval.candidate[name], 'Approved candidate value differs');
  assert.ok(
    candidate.reports.some(
      (entry) =>
        path.join(layout.evidenceRoot, entry.path) === path.join(root, approval.evidence.rawPath) &&
        entry.sha256 === approval.evidence.rawSha256,
    ),
    'Approved raw report missing from candidate',
  );
  const holdoutPath = path.join(root, approval.evidence.holdoutPath);
  const holdout = await readEvidenceJson(holdoutPath);
  fields(holdout, [
    'schemaVersion',
    'workspace',
    'candidateSha256',
    'environment',
    'corpus',
    'observations',
    'failures',
  ]);
  assert.equal(holdout.schemaVersion, 2);
  assert.equal(holdout.workspace, 'REFRESH_TRANSPORT');
  assert.equal(holdout.candidateSha256, approval.candidate.sha256);
  assert.deepEqual(holdout.environment, approval.environment);
  assert.deepEqual(holdout.corpus, approval.corpus);
  assert.deepEqual(holdout.failures, [], 'Packed holdout has failures');
  assert.deepEqual(
    holdout.observations.map((row) => row.name).sort(),
    [...refreshTransportCases].sort(),
  );
  for (const row of holdout.observations) {
    validateRefreshTransportObservation(row, values[0].identity);
    assert.equal(row.repetition, 0);
    assert.ok(
      row.peakResidentBytes <= candidate.reservationBytes,
      'Packed holdout exceeds reservation',
    );
  }
  await verifyRefreshCiPack(args);
  for (const entry of approval.archive.entries) {
    if (entry.path !== bindingRelative)
      assert.equal(
        await hashRefreshCiFile(path.join(root, entry.path)),
        entry.sha256,
        'Immutable installed pack changed',
      );
  }
  return Object.freeze({
    layout,
    fixtureContext,
    manifestPath,
    bindingPath,
    candidatePath,
    holdoutPath,
  });
}

export async function installRefreshCiPack(args) {
  const approval = validateRefreshCiApproval(args.approval);
  return installRefreshCiPackAt(
    { ...args, approval },
    refreshCiLayoutRootForRevision(approval.layoutRevision),
  );
}

export async function verifyRefreshCiNativeBuildAt(layout, repositoryPath) {
  const receipt = await readEvidenceJson(path.join(layout.evidenceRoot, 'native-build.json'));
  fields(receipt, ['schemaVersion', 'environment', 'native']);
  assert.equal(receipt.schemaVersion, 1);
  assert.deepEqual(
    receipt.environment,
    nativeMetadataEnvironment(),
    'Build receipt environment differs',
  );
  fields(receipt.native, ['path', 'sha256', 'sourceFiles', 'toolchain', 'build']);
  assert.equal(receipt.native.path, 'native/codeatlas-native-analyzer.exe');
  fields(receipt.native.build, ['command', 'args']);
  assert.equal(receipt.native.build.command, 'cargo');
  assert.deepEqual(receipt.native.build.args, ['build', '--workspace']);
  text(receipt.native.toolchain);
  await verifyRefreshCiNativeSourceAt(repositoryPath, receipt.native.sourceFiles);
  assert.equal(
    await hashRefreshCiFile(layout.nativePath),
    receipt.native.sha256,
    'Build Native hash differs',
  );
  return freeze(receipt);
}

async function ownedPackInventory(layout) {
  const entries = [];
  async function visit(relative) {
    relativePath(relative);
    assert.ok(!/-(wal|shm|journal)$/i.test(relative), 'Database sidecar requires closed state');
    const file = path.join(layout.root, relative);
    const info = await lstat(file);
    assert.ok(!info.isSymbolicLink(), 'Linked pack source');
    assert.equal(await realpath(file), file, 'Pack source alias');
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(relative + '/' + name);
    } else {
      assert.ok(info.isFile(), 'Nonregular pack source');
      entries.push({ path: relative, bytes: info.size, sha256: await hashRefreshCiFile(file) });
    }
  }
  await visit('evidence');
  await visit('native/codeatlas-native-analyzer.exe');
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  inventory(entries, true);
  return freeze(entries);
}

export async function createRefreshCiPack({ layout, candidatePath, holdoutPath, outputArchive }) {
  assertRefreshCiOutputOutsideLayouts(outputArchive);
  await verifyRefreshCiLayoutOwnership(layout);
  // Refuse live SQLite state before copying review evidence or creating output.
  await ownedPackInventory(layout);
  const repositoryPath = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  await verifyRefreshCiNativeBuildAt(layout, repositoryPath);
  const candidateRelative = path
    .relative(layout.evidenceRoot, candidatePath)
    .split(path.sep)
    .join('/');
  relativePath(candidateRelative);
  const holdoutHash = await hashRefreshCiFile(holdoutPath);
  const reviewRoot = path.join(layout.evidenceRoot, 'review');
  const packedHoldout = path.join(reviewRoot, 'holdout.json');
  if (layout.readOnly) {
    assert.equal(holdoutPath, packedHoldout, 'Read-only packaging requires the prepared holdout');
  } else {
    await mkdir(reviewRoot); // Fresh review closure only; never adopt prior attempts.
    await copyFile(holdoutPath, packedHoldout, constants.COPYFILE_EXCL);
  }
  assert.equal(await hashRefreshCiFile(packedHoldout), holdoutHash);
  const fixtureContext = refreshCiFixtureContext(layout);
  const manifestPath = path.join(layout.evidenceRoot, 'corpus', 'artifacts', 'manifest.json');
  const bindingPath = path.join(layout.evidenceRoot, 'corpus', 'local-binding.json');
  const values = await readRefreshTransportReplayCorpus(manifestPath, bindingPath, fixtureContext);
  const candidate = await readEvidenceJson(candidatePath);
  relativePath(candidate.manifest?.path);
  assert.deepEqual(
    candidate,
    await buildRefreshTransportCandidate(
      path.join(layout.evidenceRoot, candidate.manifest.path),
      layout.evidenceRoot,
      values[0].identity,
      fixtureContext,
    ),
    'Pack source candidate differs',
  );
  const candidateSha256 = await hashRefreshCiFile(candidatePath);
  assert.ok(
    nativeRefreshTransportProfiles.some(
      (profile) =>
        Object.entries(values[0].identity.environment).every(
          ([key, value]) => profile[key] === value,
        ) &&
        profile.workspace === 'REFRESH_TRANSPORT' &&
        profile.transportCorpusRevision === candidate.corpus.revision &&
        profile.transportCorpusDigest === candidate.corpus.digest &&
        profile.memoryCandidateEvidenceDigest === candidateSha256 &&
        profile.reservationBytes === candidate.reservationBytes &&
        profile.memoryPolicyRevision === candidate.policyRevision,
    ),
    'Missing exact installed pack profile',
  );
  const holdout = await readEvidenceJson(packedHoldout);
  fields(holdout, [
    'schemaVersion',
    'workspace',
    'candidateSha256',
    'environment',
    'corpus',
    'observations',
    'failures',
  ]);
  assert.equal(holdout.schemaVersion, 2);
  assert.equal(holdout.workspace, 'REFRESH_TRANSPORT');
  assert.deepEqual(holdout.environment, values[0].identity.environment);
  assert.deepEqual(holdout.corpus, values[0].identity.corpus);
  assert.equal(holdout.candidateSha256, candidateSha256);
  assert.deepEqual(holdout.failures, []);
  assert.deepEqual(
    holdout.observations.map((row) => row.name).sort(),
    [...refreshTransportCases].sort(),
  );
  for (const row of holdout.observations) {
    validateRefreshTransportObservation(row, values[0].identity);
    assert.equal(row.repetition, 0);
    assert.ok(row.peakResidentBytes <= candidate.reservationBytes);
  }
  assert.equal(await realpath(path.dirname(outputArchive)), path.dirname(outputArchive));
  assert.ok(path.isAbsolute(outputArchive) && path.resolve(outputArchive) === outputArchive);
  const relativeOutput = path.relative(layout.root, outputArchive);
  assert.ok(
    path.isAbsolute(relativeOutput) ||
      relativeOutput === '..' ||
      relativeOutput.startsWith('..' + path.sep),
    'Archive output overlaps owned pack',
  );
  const entries = await ownedPackInventory(layout);
  const child = spawnSync(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      fileURLToPath(new URL('../native-refresh-ci-pack.ps1', import.meta.url)),
      '-Mode',
      'Create',
      '-ArchivePath',
      outputArchive,
      '-RootPath',
      layout.root,
    ],
    { input: encodeRefreshReplayJson({ entries }), encoding: 'utf8', windowsHide: true },
  );
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result, { verified: true, mode: 'Create', entries: entries.length });
  assert.deepEqual(await ownedPackInventory(layout), entries, 'Pack sources changed');
  assert.equal(await hashRefreshCiFile(holdoutPath), holdoutHash, 'Original holdout changed');
  await verifyRefreshCiLayoutOwnership(layout);
  await verifyRefreshCiNativeBuildAt(layout, repositoryPath);
  const archive = snapshotArchive({
    entries,
    bytes: (await lstat(outputArchive)).size,
    sha256: await hashRefreshCiFile(outputArchive),
  });
  await verifyRefreshCiArchive(outputArchive, archive);
  return Object.freeze({ archive, candidateSha256, holdoutSha256: holdoutHash });
}

export function validateRefreshCiApproval(input) {
  // Reuse the strict own-data, dense-array, safe-integer and cyclic-input guard.
  const value = decodeRefreshReplayJson(encodeRefreshReplayJson(input));
  fields(value, [
    'schemaVersion',
    'layoutRevision',
    'environment',
    'corpus',
    'candidate',
    'evidence',
    'native',
    'archive',
    'release',
  ]);
  assert.equal(value.schemaVersion, 1);
  refreshCiLayoutRootForRevision(value.layoutRevision);
  fields(value.environment, [
    'node',
    'v8',
    'platform',
    'arch',
    'zodVersion',
    'implementationDigest',
    'corpusRevision',
  ]);
  for (const entry of Object.values(value.environment)) text(entry);
  assert.equal(value.environment.platform, 'win32');
  assert.equal(value.environment.arch, 'x64');
  assert.equal(value.environment.corpusRevision, 'p05-native-metadata-memory-v1');
  digest(value.environment.implementationDigest);
  fields(value.corpus, ['revision', 'digest']);
  assert.equal(value.corpus.revision, 'p05-native-refresh-transport-memory-v1');
  digest(value.corpus.digest);

  fields(value.candidate, [
    'path',
    'sha256',
    'reservationBytes',
    'observedPeakBytes',
    'fluctuationAllowanceBytes',
    'policyRevision',
  ]);
  relativePath(value.candidate.path);
  digest(value.candidate.sha256);
  counter(value.candidate.reservationBytes, true);
  counter(value.candidate.observedPeakBytes, true);
  counter(value.candidate.fluctuationAllowanceBytes);
  const accounted = value.candidate.observedPeakBytes + value.candidate.fluctuationAllowanceBytes;
  counter(accounted, true);
  assert.ok(accounted <= value.candidate.reservationBytes, 'Underreserved pack candidate');
  assert.equal(value.candidate.policyRevision, 'p05-native-memory-high-water-range-v1');
  fields(value.evidence, ['rawPath', 'rawSha256', 'holdoutPath', 'holdoutSha256']);
  relativePath(value.evidence.rawPath);
  relativePath(value.evidence.holdoutPath);
  digest(value.evidence.rawSha256);
  digest(value.evidence.holdoutSha256);
  const evidencePaths = [value.candidate.path, value.evidence.rawPath, value.evidence.holdoutPath];
  assert.ok(evidencePaths.every((name) => name.startsWith('evidence/')));
  assert.equal(new Set(evidencePaths.map((name) => name.toLowerCase())).size, 3);

  fields(value.native, ['path', 'sha256', 'sourceFiles', 'toolchain', 'build']);
  assert.equal(value.native.path, 'native/codeatlas-native-analyzer.exe');
  digest(value.native.sha256);
  inventory(value.native.sourceFiles, false);
  text(value.native.toolchain);
  fields(value.native.build, ['command', 'args']);
  assert.equal(value.native.build.command, 'cargo');
  assert.deepEqual(value.native.build.args, ['build', '--workspace']);

  fields(value.archive, ['sha256', 'bytes', 'entries']);
  digest(value.archive.sha256);
  counter(value.archive.bytes, true);
  inventory(value.archive.entries, true);
  const entries = new Map(value.archive.entries.map((entry) => [entry.path, entry]));
  for (const [name, sha256] of [
    [value.candidate.path, value.candidate.sha256],
    [value.evidence.rawPath, value.evidence.rawSha256],
    [value.evidence.holdoutPath, value.evidence.holdoutSha256],
    [value.native.path, value.native.sha256],
  ])
    assert.equal(entries.get(name)?.sha256, sha256, 'Missing or mismatched pack reference');

  fields(value.release, ['repository', 'tag', 'releaseId', 'assetId', 'assetName']);
  assert.match(value.release.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.equal(value.release.tag, 'p05-d5-fixture-' + value.candidate.sha256);
  counter(value.release.releaseId, true);
  counter(value.release.assetId, true);
  assert.ok(
    /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.zip$/.test(value.release.assetName),
    'Invalid pack asset',
  );
  return freeze(value);
}
