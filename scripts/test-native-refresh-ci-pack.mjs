import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  acquireRefreshCiLayoutAt,
  createExclusiveRefreshCiRootAt,
} from './helpers/native-refresh-ci-layout.mjs';
import { test } from 'node:test';
import { nativeMetadataEnvironment } from '../packages/runtime/dist/native-metadata-admission.js';

const pack = await import('./helpers/native-refresh-ci-pack.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const sha = (letter) => letter.repeat(64);

test('pinned asset retrieval verifies release identity and streams only exact approved bytes', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-ci-download-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const bytes = Buffer.from('synthetic archive bytes, not an approved fixture\n');
  const approval = record();
  approval.archive.bytes = bytes.length;
  approval.archive.sha256 = createHash('sha256').update(bytes).digest('hex');
  const output = path.join(parent, 'fixture.zip');
  assert.equal(typeof pack.downloadRefreshCiArchive, 'function');
  const fetchFixture = async (url) => {
    assert.ok(
      url.startsWith('https://api.github.com/repos/fixture-owner/fixture-repository/releases/'),
    );
    if (url.endsWith('/assets/2')) return new Response(bytes);
    return Response.json({
      id: 1,
      tag_name: approval.release.tag,
      assets: [{ id: 2, name: 'fixture.zip', size: bytes.length }],
    });
  };
  await pack.downloadRefreshCiArchive(
    approval,
    output,
    'fixture-owner/fixture-repository',
    fetchFixture,
  );
  assert.deepEqual(await readFile(output), bytes);
  await assert.rejects(
    () =>
      pack.downloadRefreshCiArchive(
        approval,
        output,
        'fixture-owner/fixture-repository',
        fetchFixture,
      ),
    /exist/i,
  );
  const missing = path.join(parent, 'missing.zip');
  await assert.rejects(
    () => pack.downloadRefreshCiArchive(approval, missing, 'foreign/repository', fetchFixture),
    /repository/i,
  );
  await assert.rejects(
    () =>
      pack.downloadRefreshCiArchive(
        approval,
        missing,
        'fixture-owner/fixture-repository',
        async () => Response.json({ id: 99 }),
      ),
    /release/i,
  );
  assert.ok(!(await readdir(parent)).includes('missing.zip'));
  await assert.rejects(
    () =>
      pack.downloadRefreshCiArchive(
        approval,
        missing,
        'fixture-owner/fixture-repository',
        async (url) =>
          url.endsWith('/assets/2')
            ? new Response(Buffer.concat([bytes, Buffer.from('overflow')]))
            : fetchFixture(url),
      ),
    /length|size/i,
  );
  assert.ok((await readFile(missing)).length <= bytes.length);
  const foreign = path.join(parent, 'foreign.zip');
  const changed = Buffer.from(bytes);
  changed[0] ^= 1;
  await assert.rejects(
    () =>
      pack.downloadRefreshCiArchive(
        approval,
        foreign,
        'fixture-owner/fixture-repository',
        async (url) => (url.endsWith('/assets/2') ? new Response(changed) : fetchFixture(url)),
      ),
    /hash/i,
  );
  assert.deepEqual(await readFile(foreign), changed);
});

// Schema vectors only: none is an approval, archive or numerical proposal.
function record() {
  return {
    schemaVersion: 1,
    layoutRevision: 'p05-d5-exact-layout-v1',
    environment: {
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: sha('a'),
      corpusRevision: 'p05-native-metadata-memory-v1',
    },
    corpus: { revision: 'p05-native-refresh-transport-memory-v1', digest: sha('b') },
    candidate: {
      path: 'evidence/candidate.json',
      sha256: sha('c'),
      reservationBytes: 110,
      observedPeakBytes: 100,
      fluctuationAllowanceBytes: 10,
      policyRevision: 'p05-native-memory-high-water-range-v1',
    },
    evidence: {
      rawPath: 'evidence/raw.json',
      rawSha256: sha('d'),
      holdoutPath: 'evidence/review/holdout.json',
      holdoutSha256: sha('e'),
    },
    native: {
      path: 'native/codeatlas-native-analyzer.exe',
      sha256: sha('f'),
      sourceFiles: [{ path: 'Cargo.toml', bytes: 1, sha256: sha('a') }],
      toolchain: 'schema-vector-only',
      build: { command: 'cargo', args: ['build', '--workspace'] },
    },
    archive: {
      bytes: 100,
      sha256: sha('a'),
      entries: [
        { path: 'evidence/candidate.json', bytes: 1, sha256: sha('c') },
        { path: 'evidence/raw.json', bytes: 1, sha256: sha('d') },
        { path: 'evidence/review/holdout.json', bytes: 1, sha256: sha('e') },
        { path: 'native/codeatlas-native-analyzer.exe', bytes: 1, sha256: sha('f') },
      ],
    },
    release: {
      repository: 'fixture-owner/fixture-repository',
      tag: 'p05-d5-fixture-' + sha('c'),
      releaseId: 1,
      assetId: 2,
      assetName: 'fixture.zip',
    },
  };
}

test('pack output refuses all frozen layouts before reading ownership or evidence', async () => {
  for (const root of ['C:\\CodeAtlas-P05-D5', 'C:\\CodeAtlas-P05-D5-R2', 'C:\\CodeAtlas-P05-D5-R3'])
    await assert.rejects(
      () =>
        pack.createRefreshCiPack({
          layout: {},
          candidatePath: '',
          holdoutPath: '',
          outputArchive: path.join(root, 'new.zip'),
        }),
      /overlaps frozen layout/i,
    );
});

test('pack approval parsing preserves v1 and v2 and accepts v3 without retagging evidence', () => {
  for (const layoutRevision of [
    'p05-d5-exact-layout-v1',
    'p05-d5-exact-layout-v2',
    'p05-d5-exact-layout-v3',
  ]) {
    const input = { ...record(), layoutRevision };
    assert.deepEqual(pack.validateRefreshCiApproval(input), input);
  }
});

test('pack approval validator copies and freezes data without granting physical eligibility', () => {
  assert.equal(typeof pack.validateRefreshCiApproval, 'function');
  const input = record();
  const value = pack.validateRefreshCiApproval(input);
  assert.deepEqual(value, input);
  input.native.sourceFiles[0].sha256 = sha('b');
  assert.equal(value.native.sourceFiles[0].sha256, sha('a'));
  assert.ok(Object.isFrozen(value.archive.entries));
  assert.ok(Object.isFrozen(value.archive.entries[0]));
});

for (const [name, change] of [
  [
    'unknown field',
    (value) => {
      value.override = true;
    },
  ],
  [
    'different layout',
    (value) => {
      value.layoutRevision = 'other-layout';
    },
  ],
  [
    'unsafe byte count',
    (value) => {
      value.archive.bytes = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'negative zero',
    (value) => {
      value.native.sourceFiles[0].bytes = -0;
    },
  ],
  [
    'underreserved workspace',
    (value) => {
      value.candidate.reservationBytes = 109;
    },
  ],
  [
    'unknown policy',
    (value) => {
      value.candidate.policyRevision = 'weaker';
    },
  ],
  [
    'wrong Native hash',
    (value) => {
      value.native.sha256 = sha('a');
    },
  ],
  [
    'missing candidate entry',
    (value) => {
      value.archive.entries.shift();
    },
  ],
  [
    'duplicate entry',
    (value) => {
      value.archive.entries.splice(1, 0, { ...value.archive.entries[0] });
    },
  ],
  [
    'case alias',
    (value) => {
      value.archive.entries.splice(0, 0, {
        ...value.archive.entries[0],
        path: 'evidence/CANDIDATE.json',
      });
    },
  ],
  [
    'parent traversal',
    (value) => {
      value.archive.entries[0].path = '../candidate.json';
    },
  ],
  [
    'absolute entry',
    (value) => {
      value.archive.entries[0].path = '/evidence/candidate.json';
    },
  ],
  [
    'drive entry',
    (value) => {
      value.archive.entries[0].path = 'C:/evidence/candidate.json';
    },
  ],
  [
    'alternate stream',
    (value) => {
      value.archive.entries[0].path = 'evidence/candidate.json:stream';
    },
  ],
  [
    'reserved Windows name',
    (value) => {
      value.archive.entries[0].path = 'evidence/CON.json';
    },
  ],
  [
    'trailing dot alias',
    (value) => {
      value.archive.entries[0].path = 'evidence/candidate.json.';
    },
  ],
  [
    'outside owned subtrees',
    (value) => {
      value.archive.entries[0].path = 'unrelated/file.json';
    },
  ],
  [
    'wrong release tag',
    (value) => {
      value.release.tag = 'latest';
    },
  ],
  [
    'unsafe release identity',
    (value) => {
      value.release.assetId = 0;
    },
  ],
  [
    'untrusted build command',
    (value) => {
      value.native.build.command = 'powershell';
    },
  ],
])
  test(`pack approval refuses ${name} before filesystem or network effects`, () => {
    assert.equal(typeof pack.validateRefreshCiApproval, 'function');
    const input = record();
    change(input);
    assert.throws(() => pack.validateRefreshCiApproval(input));
  });

test('pack approval refuses accessors without executing them and refuses cycles', () => {
  assert.equal(typeof pack.validateRefreshCiApproval, 'function');
  let calls = 0;
  const input = record();
  Object.defineProperty(input.archive, 'sha256', {
    enumerable: true,
    get() {
      calls++;
      return sha('a');
    },
  });
  assert.throws(() => pack.validateRefreshCiApproval(input));
  assert.equal(calls, 0);
  const cyclic = record();
  cyclic.archive.entries.push(cyclic);
  assert.throws(() => pack.validateRefreshCiApproval(cyclic));
});

test('CI checkout preserves exact source bytes while retaining raw IPC CRLF fixtures', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-ci-checkout-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const source = path.join(parent, 'source');
  const destination = path.join(parent, 'checkout');
  await mkdir(source);
  const git = (...args) => {
    const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  };
  git('init', '--template=', '--initial-branch=main', source);
  git('-C', source, 'config', 'core.autocrlf', 'false');
  await copyFile(
    new URL('../.gitattributes', import.meta.url),
    path.join(source, '.gitattributes'),
  );
  const files = [
    ['Cargo.toml', Buffer.from('[workspace]\n')],
    ['rust-toolchain.toml', Buffer.from('[toolchain]\n')],
    ['Cargo.lock', Buffer.from('version = 4\n')],
    ['crates/main.rs', Buffer.from('fn main() {}\n')],
    ['scripts/entry.mjs', Buffer.from('export const fixture = true;\n')],
    ['scripts/entry.ps1', Buffer.from("Write-Output 'fixture'\n")],
    ['package.json', Buffer.from('{}\n')],
    ['pnpm-workspace.yaml', Buffer.from('packages:\n')],
    ['fixtures/ipc/protocol-v3/raw.jsonl', Buffer.from('{"fixture":true}\r\n')],
    [
      'fixtures/storage/native-analysis-state/memory-baseline.json',
      Buffer.from('{"raw":true}\r\n'),
    ],
    ['packages/storage/migrations/repository/001_repo_core.sql', Buffer.from('SELECT 1;\r\n')],
    [
      'packages/storage/migrations/repository/008_indexed_fingerprint.sql',
      Buffer.from('SELECT 1;\n'),
    ],
    ['packages/storage/migrations/workspace/001_workspace_core.sql', Buffer.from('SELECT 1;\r\n')],
  ];
  for (const [relative, bytes] of files) {
    const file = path.join(source, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  git('-C', source, 'add', '.');
  git(
    '-C',
    source,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@invalid',
    '-c',
    'commit.gpgSign=false',
    '-c',
    'core.hooksPath=' + path.join(parent, 'no-hooks'),
    'commit',
    '-m',
    'Owned checkout contract fixture',
  );
  git('clone', '--config', 'core.autocrlf=true', source, destination);
  for (const [relative, bytes] of files)
    assert.deepEqual(await readFile(path.join(destination, relative)), bytes, relative);
});

async function zipFixture(t, mutate = () => {}, extraFiles = []) {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-ci-zip-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const files = [
    ['evidence/candidate.json', Buffer.from('{}\n')],
    ['evidence/raw.json', Buffer.from('[]\n')],
    ['evidence/review/holdout.json', Buffer.from('[]\n')],
    ['native/codeatlas-native-analyzer.exe', Buffer.from('synthetic-not-executable-fixture\n')],
    ...extraFiles,
  ];
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const entries = files.map(([name, bytes]) => ({ name, base64: bytes.toString('base64') }));
  mutate(entries);
  const archivePath = path.join(parent, 'fixture.zip');
  const child = spawnSync(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      fileURLToPath(new URL('./fixtures/native-refresh-ci-zip-fixture.ps1', import.meta.url)),
      '-ArchivePath',
      archivePath,
    ],
    { input: JSON.stringify(entries), encoding: 'utf8', windowsHide: true },
  );
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const raw = await readFile(archivePath);
  return {
    parent,
    archivePath,
    files,
    archive: {
      sha256: createHash('sha256').update(raw).digest('hex'),
      bytes: raw.length,
      entries: files.map(([relative, bytes]) => ({
        path: relative,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })),
    },
  };
}

test('ZIP primitive verifies and extracts only exact declared files into its original owned root', async (t) => {
  assert.equal(typeof pack.verifyRefreshCiArchive, 'function');
  assert.equal(typeof pack.extractRefreshCiArchive, 'function');
  const input = await zipFixture(t);
  await pack.verifyRefreshCiArchive(input.archivePath, input.archive);
  const layout = await createExclusiveRefreshCiRootAt(path.join(input.parent, 'owned-root'));
  await pack.extractRefreshCiArchive(input.archivePath, input.archive, layout);
  for (const [relative, bytes] of input.files)
    assert.deepEqual(await readFile(path.join(layout.root, relative)), bytes);
});

async function approvalFixture(input) {
  const repositoryPath = path.join(input.parent, 'repository');
  await mkdir(path.join(repositoryPath, 'crates'), { recursive: true });
  for (const name of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'])
    await writeFile(path.join(repositoryPath, name), 'synthetic source fixture\n');
  const approval = record();
  approval.environment = nativeMetadataEnvironment();
  approval.archive = input.archive;
  approval.native.sourceFiles = await pack.discoverRefreshCiNativeSourceAt(repositoryPath);
  const entries = new Map(input.archive.entries.map((entry) => [entry.path, entry]));
  approval.candidate.sha256 = entries.get(approval.candidate.path).sha256;
  approval.native.sha256 = entries.get(approval.native.path).sha256;
  approval.evidence.rawSha256 = entries.get(approval.evidence.rawPath).sha256;
  approval.evidence.holdoutSha256 = entries.get(approval.evidence.holdoutPath).sha256;
  approval.release.tag = 'p05-d5-fixture-' + approval.candidate.sha256;
  return { approval, archivePath: input.archivePath, repositoryPath };
}

test('installer refuses an incomplete replay closure before acquiring its test root', async (t) => {
  const input = await zipFixture(t);
  const args = await approvalFixture(input);
  const root = path.join(input.parent, 'install');
  assert.equal(typeof pack.installRefreshCiPackAt, 'function');
  await assert.rejects(() => pack.installRefreshCiPackAt(args, root), /replay.*closure/i);
  assert.ok(!(await readdir(input.parent)).includes('install'));
});

test('installer preserves extracted failures and never returns a malformed replay as eligible', async (t) => {
  const input = await zipFixture(t, undefined, [
    ['evidence/corpus/artifacts/manifest.json', Buffer.from('{}\n')],
    ['evidence/corpus/local-binding.json', Buffer.from('{}\n')],
    ['evidence/native-build.json', Buffer.from('{}\n')],
  ]);
  const args = await approvalFixture(input);
  const root = path.join(input.parent, 'install');
  assert.equal(typeof pack.installRefreshCiPackAt, 'function');
  await assert.rejects(() => pack.installRefreshCiPackAt(args, root), /field|schema|keys/i);
  for (const [relative, bytes] of input.files)
    assert.deepEqual(await readFile(path.join(root, relative)), bytes);
  await assert.rejects(() => pack.installRefreshCiPackAt(args, root), /exist/i);
});

test('pack creation rejects copied layout authority and live database sidecars before output', async (t) => {
  const input = await zipFixture(t);
  const nativeSourcePath = path.join(input.parent, 'native-fixture.exe');
  const nativeBytes = Buffer.from('synthetic fixture, never executed\n');
  await writeFile(nativeSourcePath, nativeBytes);
  const layout = await acquireRefreshCiLayoutAt({
    root: path.join(input.parent, 'owned'),
    nativeSourcePath,
    nativeSha256: createHash('sha256').update(nativeBytes).digest('hex'),
  });
  await mkdir(layout.evidenceRoot);
  const candidatePath = path.join(layout.evidenceRoot, 'candidate.json');
  const holdoutPath = path.join(input.parent, 'holdout.json');
  const outputArchive = path.join(input.parent, 'result.zip');
  await writeFile(candidatePath, '{}\n');
  await writeFile(holdoutPath, '{}\n');
  assert.equal(typeof pack.createRefreshCiPack, 'function');
  await assert.rejects(
    () =>
      pack.createRefreshCiPack({
        layout: { ...layout },
        candidatePath,
        holdoutPath,
        outputArchive,
      }),
    /original owned/i,
  );
  await writeFile(path.join(layout.evidenceRoot, 'state.sqlite-wal'), 'live WAL');
  await assert.rejects(
    () => pack.createRefreshCiPack({ layout, candidatePath, holdoutPath, outputArchive }),
    /sidecar|WAL|closed/i,
  );
  assert.ok(!(await readdir(input.parent)).includes('result.zip'));
  assert.equal(
    await readFile(path.join(layout.evidenceRoot, 'state.sqlite-wal'), 'utf8'),
    'live WAL',
  );
});

test('ZIP producer streams original declared bytes and never overwrites an existing archive', async (t) => {
  const input = await zipFixture(t);
  const root = path.join(input.parent, 'source');
  await mkdir(root);
  for (const [relative, bytes] of input.files) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), bytes);
  }
  const archivePath = path.join(input.parent, 'produced.zip');
  const produce = () =>
    spawnSync(
      'pwsh',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        fileURLToPath(new URL('./native-refresh-ci-pack.ps1', import.meta.url)),
        '-Mode',
        'Create',
        '-ArchivePath',
        archivePath,
        '-RootPath',
        root,
      ],
      {
        input: JSON.stringify({ entries: input.archive.entries }),
        encoding: 'utf8',
        windowsHide: true,
      },
    );
  const result = produce();
  assert.equal(result.status, 0, result.stderr);
  const bytes = await readFile(archivePath);
  const archive = {
    ...input.archive,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  await pack.verifyRefreshCiArchive(archivePath, archive);
  const layout = await createExclusiveRefreshCiRootAt(path.join(input.parent, 'extracted'));
  await pack.extractRefreshCiArchive(archivePath, archive, layout);
  for (const [relative, original] of input.files)
    assert.deepEqual(await readFile(path.join(layout.root, relative)), original);
  assert.notEqual(produce().status, 0);
  assert.deepEqual(await readFile(archivePath), bytes);
});

test('Native build receipt binds the actual source tree, command and packed executable bytes', async (t) => {
  const input = await zipFixture(t);
  const args = await approvalFixture(input);
  const source = path.join(input.parent, 'producer.exe');
  const bytes = Buffer.from('synthetic not-executed Native fixture\n');
  await writeFile(source, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const layout = await acquireRefreshCiLayoutAt({
    root: path.join(input.parent, 'owned-build'),
    nativeSourcePath: source,
    nativeSha256: sha256,
  });
  await mkdir(layout.evidenceRoot);
  const receipt = {
    schemaVersion: 1,
    environment: nativeMetadataEnvironment(),
    native: {
      path: 'native/codeatlas-native-analyzer.exe',
      sha256,
      sourceFiles: args.approval.native.sourceFiles,
      toolchain: 'synthetic receipt vector',
      build: { command: 'cargo', args: ['build', '--workspace'] },
    },
  };
  const file = path.join(layout.evidenceRoot, 'native-build.json');
  await writeFile(file, JSON.stringify(receipt));
  assert.equal(typeof pack.verifyRefreshCiNativeBuildAt, 'function');
  assert.deepEqual(await pack.verifyRefreshCiNativeBuildAt(layout, args.repositoryPath), receipt);
  await writeFile(layout.nativePath, 'foreign executable bytes\n');
  await assert.rejects(
    () => pack.verifyRefreshCiNativeBuildAt(layout, args.repositoryPath),
    /Native hash/i,
  );
  await writeFile(layout.nativePath, bytes);
  await writeFile(path.join(args.repositoryPath, 'crates', 'extra.rs'), 'new source\n');
  await assert.rejects(
    () => pack.verifyRefreshCiNativeBuildAt(layout, args.repositoryPath),
    /inventory/i,
  );
  await rm(path.join(args.repositoryPath, 'crates', 'extra.rs'));
  receipt.native.build.command = 'untrusted';
  await writeFile(file, JSON.stringify(receipt));
  await assert.rejects(() => pack.verifyRefreshCiNativeBuildAt(layout, args.repositoryPath));
});

test('ZIP primitive refuses decoded overflow even when the central directory claims the approved length', async (t) => {
  const input = await zipFixture(t);
  const bytes = await readFile(input.archivePath);
  // Adversarial fixture only: corrupt ONE known central-header length in the
  // real .NET-generated ZIP. No archive parsing/patching exists in the installer.
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central >= 0);
  assert.equal(bytes.readUInt32LE(central + 24), 3); // literal '{}\n' first member
  bytes.writeUInt32LE(2, central + 24);
  await writeFile(input.archivePath, bytes);
  const archive = structuredClone(input.archive);
  archive.sha256 = createHash('sha256').update(bytes).digest('hex');
  archive.entries[0].bytes = 2;
  archive.entries[0].sha256 = createHash('sha256').update(Buffer.from('{}')).digest('hex');
  await pack.verifyRefreshCiArchive(input.archivePath, archive);
  const layout = await createExclusiveRefreshCiRootAt(path.join(input.parent, 'overflow'));
  await assert.rejects(
    () => pack.extractRefreshCiArchive(input.archivePath, archive, layout),
    /decoded length exceeds/,
  );
});

for (const [name, change] of [
  [
    'parent escape',
    (entries) => {
      entries[0].name = '../escape';
    },
  ],
  [
    'drive path',
    (entries) => {
      entries[0].name = 'C:/escape';
    },
  ],
  [
    'alternate stream',
    (entries) => {
      entries[0].name = 'evidence/candidate.json:stream';
    },
  ],
  [
    'case drift',
    (entries) => {
      entries[0].name = 'EVIDENCE/candidate.json';
    },
  ],
  [
    'duplicate',
    (entries) => {
      entries[0].name = entries[1].name;
    },
  ],
  [
    'extra member',
    (entries) => {
      entries.push({ name: 'evidence/extra', base64: '' });
    },
  ],
  [
    'missing member',
    (entries) => {
      entries.pop();
    },
  ],
  [
    'Unix symlink',
    (entries) => {
      entries[0].attributes = 0xa1ff0000 | 0;
    },
  ],
  [
    'Windows reparse point',
    (entries) => {
      entries[0].attributes = 0x400;
    },
  ],
])
  test(`ZIP primitive rejects ${name} before creating a destination`, async (t) => {
    assert.equal(typeof pack.verifyRefreshCiArchive, 'function');
    const input = await zipFixture(t, change);
    await assert.rejects(() => pack.verifyRefreshCiArchive(input.archivePath, input.archive));
    assert.deepEqual(await readdir(input.parent), ['fixture.zip']);
  });

test('ZIP primitive refuses a same-size foreign body and cannot repair a partial extraction', async (t) => {
  assert.equal(typeof pack.extractRefreshCiArchive, 'function');
  const input = await zipFixture(t, (entries) => {
    const bytes = Buffer.from(entries.at(-1).base64, 'base64');
    bytes[0] ^= 1;
    entries.at(-1).base64 = bytes.toString('base64');
  });
  const layout = await createExclusiveRefreshCiRootAt(path.join(input.parent, 'owned-root'));
  await assert.rejects(() =>
    pack.extractRefreshCiArchive(input.archivePath, input.archive, layout),
  );
  assert.deepEqual(await readFile(path.join(layout.root, input.files[0][0])), input.files[0][1]);
  await assert.rejects(
    () => pack.extractRefreshCiArchive(input.archivePath, input.archive, layout),
    /used|attempt|consumed/,
  );
});

test('ZIP primitive refuses copied ownership without consuming the original layout', async (t) => {
  const input = await zipFixture(t);
  const layout = await createExclusiveRefreshCiRootAt(path.join(input.parent, 'owned-root'));
  await assert.rejects(
    () => pack.extractRefreshCiArchive(input.archivePath, input.archive, { ...layout }),
    /Original owned/,
  );
  assert.deepEqual((await readdir(layout.root)).sort(), ['native', 'temp']);
  await pack.extractRefreshCiArchive(input.archivePath, input.archive, layout);
});

test('Native source inventory discovers new build inputs independently of a claimed inventory', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-ci-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'crates/analyzer/Cargo.toml',
    'crates/analyzer/build.rs',
    'crates/analyzer/src/main.rs',
  ];
  for (const relative of files) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), relative + '\n');
  }
  assert.equal(typeof pack.discoverRefreshCiNativeSourceAt, 'function');
  const before = await pack.discoverRefreshCiNativeSourceAt(root);
  assert.deepEqual(
    before.map((entry) => entry.path),
    [...files].sort(),
  );
  for (const entry of before) {
    const bytes = Buffer.from(entry.path + '\n');
    assert.equal(entry.bytes, bytes.length);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  await mkdir(path.join(root, '.cargo'));
  await writeFile(path.join(root, '.cargo', 'config.toml'), '[build]\n');
  await writeFile(path.join(root, 'crates/analyzer/extra.rs'), 'new input\n');
  const after = await pack.discoverRefreshCiNativeSourceAt(root);
  assert.deepEqual(
    after.map((entry) => entry.path),
    [...files, '.cargo/config.toml', 'crates/analyzer/extra.rs'].sort(),
  );
  assert.ok(Object.isFrozen(after) && after.every(Object.isFrozen));
  assert.equal(typeof pack.verifyRefreshCiNativeSourceAt, 'function');
  await pack.verifyRefreshCiNativeSourceAt(root, after);
  await assert.rejects(() => pack.verifyRefreshCiNativeSourceAt(root, before));
  await writeFile(path.join(root, 'Cargo.lock'), 'changed lock\n');
  assert.notDeepEqual(await pack.discoverRefreshCiNativeSourceAt(root), after);
  await assert.rejects(() => pack.verifyRefreshCiNativeSourceAt(root, after));
});

test('pack preflight verifies current environment, independently discovered sources and exact archive', async (t) => {
  const input = await zipFixture(t);
  const repositoryPath = path.join(input.parent, 'repository');
  await mkdir(path.join(repositoryPath, 'crates'), { recursive: true });
  for (const name of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'])
    await writeFile(path.join(repositoryPath, name), 'synthetic source fixture\n');
  const approval = record();
  approval.environment = nativeMetadataEnvironment();
  approval.archive = input.archive;
  approval.native.sourceFiles = await pack.discoverRefreshCiNativeSourceAt(repositoryPath);
  for (const [target, source] of [
    [approval.candidate, input.archive.entries[0]],
    [approval.native, input.archive.entries[3]],
  ])
    target.sha256 = source.sha256;
  approval.evidence.rawSha256 = input.archive.entries[1].sha256;
  approval.evidence.holdoutSha256 = input.archive.entries[2].sha256;
  approval.release.tag = 'p05-d5-fixture-' + approval.candidate.sha256;
  assert.equal(typeof pack.verifyRefreshCiPack, 'function');
  const args = { approval, archivePath: input.archivePath, repositoryPath };
  await pack.verifyRefreshCiPack(args);
  await assert.rejects(
    () =>
      pack.verifyRefreshCiPack({
        ...args,
        approval: { ...approval, environment: { ...approval.environment, node: 'foreign-node' } },
      }),
    /environment/i,
  );
  await writeFile(path.join(repositoryPath, 'crates', 'new.rs'), 'extra source\n');
  await assert.rejects(() => pack.verifyRefreshCiPack(args), /inventory/i);
  await rm(path.join(repositoryPath, 'crates', 'new.rs'));
  await writeFile(input.archivePath, 'foreign archive\n');
  await assert.rejects(() => pack.verifyRefreshCiPack(args), /Archive hash/);
  // These are structural synthetic vectors, NOT a candidate/admission approval.
});
