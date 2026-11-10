import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, link, mkdir, symlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  confinedPath,
  assertReboundBinding,
  assertPayloadInventory,
  assertHoldout,
  claimPackAttempt,
  assertReaderDelta,
  inventoryTree,
  assertExactInventory,
  assertToolSeal,
  assertSeparateRoots,
  createOwnedDirectory,
  approvedHashes,
  makeProfileEntries,
  insertProfileEntries,
  emitCatalog,
  copyInventory,
  verifyFrozenEvidencePins,
} from './r11-staged-pack.mjs';

const item = (path, sha256 = 'a'.repeat(64), bytes = 1) => ({ path, sha256, bytes });
test('staging paths refuse traversal, absolute paths and aliases', () => {
  const root = realpathSync(tmpdir());
  assert.equal(confinedPath(root, 'evidence/raw.json'), path.join(root, 'evidence/raw.json'));
  for (const rel of ['../outside', '/absolute', 'C:/outside', 'a/../b', 'a//b', 'a\\b'])
    assert.throws(() => confinedPath(root, rel));
});
test('only independently proved dependencyRoots may change in binding', () => {
  const old = {
    schemaVersion: 3,
    artifactRoot: 'C:/fixed/artifacts',
    replayRoot: 'C:/fixed/replay',
    dependencyRoots: [{ name: 'repository', path: 'D:/old' }],
  };
  const roots = [{ name: 'repository', path: 'D:/new' }],
    copy = { ...old, dependencyRoots: roots };
  assert.doesNotThrow(() => assertReboundBinding(old, copy, roots));
  for (const bad of [
    { ...copy, artifactRoot: 'D:/new/artifacts' },
    { ...copy, schemaVersion: 2 },
    { ...copy, extra: true },
    { ...copy, dependencyRoots: [] },
  ])
    assert.throws(() => assertReboundBinding(old, bad, roots));
});
test('payload member equivalence permits only exact binding replacement and added holdout', () => {
  const old = [item('evidence/raw.json'), item('evidence/corpus/local-binding.json')];
  const binding = item('evidence/corpus/local-binding.json', 'b'.repeat(64), 2),
    hold = item('evidence/review/holdout.json', 'c'.repeat(64), 3);
  const good = [old[0], binding, hold];
  assert.doesNotThrow(() => assertPayloadInventory(old, good, binding, hold));
  for (const bad of [
    good.slice(1),
    [...good, item('extra')],
    [item('evidence/raw.json', 'd'.repeat(64)), binding, hold],
    [...good, hold],
  ])
    assert.throws(() => assertPayloadInventory(old, bad, binding, hold));
});
test('holdout requires exact candidate, complete unique roster and bounded peaks', () => {
  const environment = { node: 'pinned' },
    corpus = { digest: 'pinned' },
    candidate = { environment, corpus, reservationBytes: 10 },
    digest = 'a'.repeat(64),
    names = ['a', 'b'];
  const h = {
    schemaVersion: 2,
    workspace: 'REFRESH_TRANSPORT',
    candidateSha256: digest,
    environment,
    corpus,
    failures: [],
    observations: names.map((name) => ({ name, repetition: 0, peakResidentBytes: 10 })),
  };
  assert.doesNotThrow(() => assertHoldout(candidate, digest, h, names));
  for (const bad of [
    { ...h, candidateSha256: 'b'.repeat(64) },
    { ...h, failures: [{}] },
    { ...h, observations: h.observations.slice(1) },
    { ...h, observations: [h.observations[0], h.observations[0]] },
    { ...h, observations: [{ ...h.observations[0], peakResidentBytes: 11 }, h.observations[1]] },
    { ...h, observations: [{ ...h.observations[0], repetition: 1 }, h.observations[1]] },
  ])
    assert.throws(() => assertHoldout(candidate, digest, bad, names));
});
test('failed or uncertain PACK attempt remains consumed across processes', async (t) => {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-stage-latch-'));
  t.after(async () => {
    const resolved = realpathSync(root);
    assert(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
    await rm(resolved, { recursive: true, force: true });
  });
  await claimPackAttempt(root, { prepareSha256: 'a'.repeat(64) });
  const original = await readFile(path.join(root, 'pack-attempt.json'));
  await writeFile(path.join(root, 'failure.json'), '{"state":"UNKNOWN"}');
  await assert.rejects(() => claimPackAttempt(root, { prepareSha256: 'a'.repeat(64) }));
  assert.deepEqual(await readFile(path.join(root, 'pack-attempt.json')), original);
});

test('unexpected reader file or declaration changes cannot hide behind profile exemption', () => {
  const before = [
    item('packages/runtime/dist/native-metadata-profiles.js'),
    item('packages/runtime/dist/native-metadata-profiles.d.ts'),
    item('packages/runtime/dist/index.js'),
  ];
  const good = [item(before[0].path, 'b'.repeat(64)), before[1], before[2]];
  assert.doesNotThrow(() => assertReaderDelta(before, good));
  for (const bad of [
    [good[0], item(before[1].path, 'c'.repeat(64)), before[2]],
    [...good, item('new.mjs')],
    good.slice(1),
    [good[0], before[1], item(before[2].path, 'd'.repeat(64))],
  ])
    assert.throws(() => assertReaderDelta(before, bad));
});
test('physical payload inventory refuses linked or hard-linked protected members', async (t) => {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-stage-links-'));
  t.after(async () => {
    const p = realpathSync(root);
    assert(p.startsWith(realpathSync(tmpdir()) + path.sep));
    await rm(p, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'original'), 'payload');
  assert.equal((await inventoryTree(root)).files.length, 1);
  await link(path.join(root, 'original'), path.join(root, 'second'));
  await assert.rejects(() => inventoryTree(root));
});
test('tool seals and copied file hashes reject one-byte drift', async (t) => {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-stage-seal-'));
  t.after(async () => {
    const p = realpathSync(root);
    assert(p.startsWith(realpathSync(tmpdir()) + path.sep));
    await rm(p, { recursive: true, force: true });
  });
  const f = path.join(root, 'file');
  await writeFile(f, 'one');
  const before = await inventoryTree(root);
  await writeFile(f, 'two');
  const after = await inventoryTree(root);
  assert.notDeepEqual(before, after);
  assert.throws(() => assertExactInventory(before, after));
  assert.throws(() => assertToolSeal(f, '0'.repeat(64)));
  assert.doesNotThrow(() => assertToolSeal(f, after.files[0].sha256));
});
test('owned work and output locations reject an occupied root or overlap', async (t) => {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-stage-owned-'));
  t.after(async () => {
    const p = realpathSync(root);
    assert(p.startsWith(realpathSync(tmpdir()) + path.sep));
    await rm(p, { recursive: true, force: true });
  });
  assert.throws(() => assertSeparateRoots(root, path.join(root, 'nested')));
  assert.doesNotThrow(() => assertSeparateRoots(path.join(root, 'a'), path.join(root, 'b')));
  await assert.rejects(() => createOwnedDirectory(root));
});

test('numeric adoption is fixed to the three approved candidate identities and exact bytes', () => {
  const common = {
    environment: { node: 'v24.15.0' },
    policyRevision: 'p05-native-memory-high-water-range-v1',
    observedPeakBytes: 10,
  };
  const data = {
    paired: {
      ...common,
      reservationBytes: 232337408,
      fluctuationAllowanceBytes: 232337398,
      corpora: {
        READ_SEAL: { revision: 'read', digest: 'a' },
        FULL_TRANSPORT: { revision: 'full', digest: 'b' },
      },
    },
    verify: {
      ...common,
      reservationBytes: 401006592,
      fluctuationAllowanceBytes: 401006582,
      corpus: { revision: 'verify', digest: 'c' },
    },
    transport: {
      ...common,
      reservationBytes: 434798592,
      fluctuationAllowanceBytes: 434798582,
      corpus: { revision: 'transport', digest: 'd' },
    },
    fullPeak: 8,
    hashes: { ...approvedHashes },
  };
  const entries = makeProfileEntries(data);
  assert.equal(entries.metadata.reservationBytes, 232337408);
  assert.equal(entries.verification.reservationBytes, 401006592);
  assert.equal(entries.transport.reservationBytes, 434798592);
  assert.throws(() =>
    makeProfileEntries({ ...data, transport: { ...data.transport, reservationBytes: 434798593 } }),
  );
  assert.throws(() =>
    makeProfileEntries({ ...data, hashes: { ...data.hashes, transport: '0'.repeat(64) } }),
  );
  assert.throws(() =>
    makeProfileEntries({ ...data, verify: { ...data.verify, environment: { node: 'different' } } }),
  );
});
test('catalog insertion preserves all historical source bytes and refuses an unknown anchor', () => {
  const src =
    'export const nativeRefreshTransportProfiles = Object.freeze([\noldTransport\n]);\nexport const nativeRefreshVerificationProfiles = Object.freeze([\noldVerify\n]);\nexport const nativeMetadataProfiles = Object.freeze([\noldMetadata\n]);\n';
  const out = insertProfileEntries(src, {
    transport: { v: 1 },
    verification: { v: 2 },
    metadata: { v: 3 },
  });
  for (const old of ['oldTransport', 'oldVerify', 'oldMetadata']) assert(out.includes(old));
  assert.equal((out.match(/Object.freeze\(\{/g) || []).length, 3);
  assert.throws(() => insertProfileEntries('wrong source', {}));
});
test('existing compiler emits only in an owned output and preserves the catalog declaration', async (t) => {
  const owner = await mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-stage-compiler-'));
  t.after(async () => {
    const p = realpathSync(owner);
    assert(p.startsWith(realpathSync(tmpdir()) + path.sep));
    await rm(p, { recursive: true, force: true });
  });
  const source = await readFile('packages/runtime/src/native-metadata-profiles.ts');
  const result = await emitCatalog(path.resolve('.'), path.join(owner, 'build'));
  assert.deepEqual(await readFile('packages/runtime/src/native-metadata-profiles.ts'), source);
  assert(result.has('native-metadata-profiles.js'));
  const original = await readFile('packages/runtime/dist/native-metadata-profiles.d.ts', 'utf8');
  assert.equal(result.get('native-metadata-profiles.d.ts'), original);
});

test('frozen executable evidence and inventories retain their independent seals', () => {
  verifyFrozenEvidencePins();
});
test('owned copy preserves internal package links without following or adopting foreign roots', async (t) => {
  const owner = await mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-stage-copy-'));
  t.after(async () => {
    const p = realpathSync(owner);
    assert(p.startsWith(realpathSync(tmpdir()) + path.sep));
    await rm(p, { recursive: true, force: true });
  });
  const source = path.join(owner, 'source'),
    copy = path.join(owner, 'copy');
  await mkdir(source);
  await mkdir(path.join(source, 'package'));
  await writeFile(path.join(source, 'package/index.js'), 'export const value=1;');
  await symlink(path.join(source, 'package'), path.join(source, 'alias'), 'junction');
  const before = await inventoryTree(source, { allowLinks: true });
  await copyInventory(source, copy, before);
  assert.equal(realpathSync(path.join(copy, 'alias')), path.join(copy, 'package'));
  assertExactInventory(before, await inventoryTree(source, { allowLinks: true }));
  await assert.rejects(() => copyInventory(source, copy, before));
  await writeFile(path.join(source, 'package/index.js'), 'export const value=2;');
  await assert.rejects(() => copyInventory(source, path.join(owner, 'drift'), before));
});

test('staged binding retains the existing canonical codec and refuses pretty JSON', async () => {
  const { pathToFileURL } = await import('node:url');
  const { configuration } = await import('./r11-staged-pack.mjs');
  const replay = await import(
    pathToFileURL(
      path.join(
        configuration.source,
        'packages/runtime/test/helpers/native-refresh-transport-replay.mjs',
      ),
    ).href
  );
  const binding = {
    schemaVersion: 3,
    dependencyRoots: [{ name: 'repository', path: 'D:\\controlled' }],
    artifactRoot: 'C:\\fixed',
    replayRoot: 'C:\\replay',
  };
  assert.throws(() =>
    replay.decodeRefreshReplayJson(Buffer.from(JSON.stringify(binding, null, 2) + '\n')),
  );
  const encoded = replay.encodeRefreshReplayJson(binding);
  assert.deepEqual(replay.decodeRefreshReplayJson(encoded), binding);
  const transported = Buffer.from(encoded.toString('base64'), 'base64');
  assert.deepEqual(transported, encoded);
});
