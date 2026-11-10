// Independent R11 deny-only coordinator. Importing this module executes no operations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  inventoryTree,
  hashFile,
  assertSeparateRoots,
  createOwnedDirectory,
  assertToolSeal,
  assertExactInventory,
} from './r11-staged-pack.mjs';
export const r11ActualIdentity = Object.freeze({
  readerContentSha256: 'f3b38dfa119698daf1f0a2e942bf476922bee489bd334bde77e0463736cd5b75',
  helperSha256: '0d8f8fca213c44295964335c6a210076f580aaf04c75e11af106ad91121ccd16',
  nodeSha256: '3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5',
  candidateSha256: 'de07bdfe79fb38e763236107cbab6e693f881c22732895b1d5ffe6186a35f4c9',
  archiveSha256: '3ce3ef83e1e584d6a6de52150f7020f895d1f4ab8a65245451ada65521e740bd',
  nativeSha256: '696a593d6082286efdedede2ec0c9592cfc83ada9c709bc034d1ad07ed714623',
  layoutRoot: 'C:\\CodeAtlas-P05-D5-R11',
  repository: 'tim-zxy/CodeAtlas',
  archiveBytes: 245661348,
  entries: 5423,
  environment: Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '571d757965c5743e60a92f49c795e1995fe3dbeea8d75189ffcda5f9dcd66e73',
    corpusRevision: 'p05-native-metadata-memory-v1',
  }),
  corpus: Object.freeze({
    revision: 'p05-native-refresh-transport-memory-v1',
    digest: 'f7be1f03622872d42ca0a3541ba0a685693ad159c618d92ef0abbd05651568de',
  }),
});
const phases = [
  'verifyReader',
  'download',
  'verifyPack',
  'install',
  'read',
  'collect',
  'validate',
  'verifyAfter',
];
// Internal sequencing seam; substitute ports cannot produce a real acceptance receipt.
export async function runActual22Sequence(ports, control) {
  assert(control && typeof control.stage === 'function' && typeof control.worker === 'function');
  for (const name of phases)
    assert.equal(typeof ports?.[name], 'function', 'Missing phase ' + name);
  await control.stage('VERIFY_READER', () => ports.verifyReader());
  const archive = await control.stage('DOWNLOAD', () => ports.download());
  await control.stage('VERIFY_PACK', () => ports.verifyPack(archive));
  const installed = await control.stage('INSTALL', () => ports.install(archive));
  const values = await control.stage('READ', () => ports.read(installed));
  const report = await control.stage('COLLECT', () => ports.collect(installed, values, control));
  await control.stage('VALIDATE', () => ports.validate(report, values, installed));
  await control.stage('VERIFY_AFTER', () => ports.verifyAfter(installed, report));
  return report;
}
function localCanonicalPath(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[A-Z]:\\/, 'Local Windows drive required');
  assert.equal(path.resolve(value), value, 'Noncanonical path');
  for (const part of value.slice(3).split('\\')) {
    assert(part && !/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part), 'Unsafe Windows path');
    assert(!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part), 'Device path forbidden');
  }
}
export function validateActualRequest(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      'schemaVersion',
      'readerRoot',
      'approvalPath',
      'approvalSha256',
      'outputRoot',
      'powershellPath',
    ].sort(),
  );
  assert.equal(value.schemaVersion, 1);
  assert.match(value.approvalSha256, /^[a-f0-9]{64}$/);
  for (const name of ['readerRoot', 'approvalPath', 'outputRoot', 'powershellPath'])
    localCanonicalPath(value[name]);
  assertSeparateRoots(value.readerRoot, value.outputRoot);
  return Object.freeze({ ...value });
}
// Additional fixed bindings, AFTER original validateRefreshCiApproval, never an approval producer.
export function assertR11Bindings(value) {
  const p = r11ActualIdentity;
  assert.equal(value.layoutRevision, 'p05-d5-exact-layout-v11');
  assert.deepEqual(value.environment, p.environment);
  assert.deepEqual(value.corpus, p.corpus);
  assert.equal(value.candidate.sha256, p.candidateSha256);
  assert.equal(value.candidate.reservationBytes, 434798592);
  assert.equal(value.candidate.policyRevision, 'p05-native-memory-high-water-range-v1');
  assert.equal(value.native.sha256, p.nativeSha256);
  assert.equal(value.archive.sha256, p.archiveSha256);
  assert.equal(value.archive.bytes, p.archiveBytes);
  assert.equal(value.archive.entries.length, p.entries);
  assert.equal(value.release.repository, p.repository);
  assert.equal(value.release.tag, 'p05-d5-fixture-' + p.candidateSha256);
  assert.equal(value.release.assetName, 'codeatlas-p05-d5-r11.zip');
}
export function readerContentDigest(inventory) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        files: inventory.files,
        links: inventory.links,
        directories: inventory.directories,
      }),
    )
    .digest('hex');
}
export async function verifyActualReader(
  root,
  expectedDigest = r11ActualIdentity.readerContentSha256,
) {
  assert.match(expectedDigest, /^[a-f0-9]{64}$/);
  const inventory = await inventoryTree(root, { allowLinks: true });
  assert.equal(readerContentDigest(inventory), expectedDigest, 'Reader content or topology drift');
  return inventory;
}

const present = (p) => {
  try {
    fs.lstatSync(p);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
// The optional target is an internal self-owned-test seam; CLI always uses fixed R11.
export function assertFreshActualLocations(request, target = r11ActualIdentity.layoutRoot) {
  assertSeparateRoots(request.readerRoot, target);
  assertSeparateRoots(request.outputRoot, target);
  assertSeparateRoots(request.readerRoot, request.outputRoot);
  assert(!present(target), 'Protected actual layout already exists');
  assert(!present(request.outputRoot), 'Output already exists');
  for (const root of [request.readerRoot, path.dirname(request.outputRoot)]) {
    const st = fs.lstatSync(root);
    assert(st.isDirectory() && !st.isSymbolicLink());
    assert.equal(fs.realpathSync.native(root), root);
  }
  const rel = path.relative(request.outputRoot, request.approvalPath);
  assert(
    rel && (path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)),
    'Approval overlaps output',
  );
}
export function assertActualLaunchEnvironment(value = process) {
  const p = r11ActualIdentity.environment;
  assert.equal(value.version, p.node);
  assert.equal(value.versions.v8, p.v8);
  assert.equal(value.platform, p.platform);
  assert.equal(value.arch, p.arch);
  assert.deepEqual(value.execArgv, [], 'Unknown Node startup flags');
  assert(!value.env.NODE_OPTIONS, 'Node preloads/options forbidden');
  assert(!value.env.NODE_PATH, 'External module path forbidden');
}
// Internal bridge seam. The operational CLI constructs modules from its verified reader only.
export function createActual22Ports(modules, context) {
  const { request, approval, archivePath } = context;
  const packArgs = () => ({ approval, archivePath, repositoryPath: request.readerRoot });
  assert.equal(typeof context.withZipTools, 'function');
  return {
    verifyReader: context.verifyReader,
    download: () =>
      modules.pack.downloadRefreshCiArchive(approval, archivePath, r11ActualIdentity.repository),
    verifyPack: (archive) => {
      assert.equal(archive, archivePath);
      return context.withZipTools(() => modules.pack.verifyRefreshCiPack(packArgs()));
    },
    install: (archive) => {
      assert.equal(archive, archivePath);
      return context.withZipTools(() => modules.pack.installRefreshCiPack(packArgs()));
    },
    read: (installed) =>
      modules.replay.readRefreshTransportReplayCorpus(
        installed.manifestPath,
        installed.bindingPath,
        installed.fixtureContext,
      ),
    collect: (installed, values, control) =>
      modules.replay.runRefreshTransportCommand(
        ['collect', 'approved', installed.candidatePath, path.join(request.outputRoot, 'actual')],
        installed.fixtureContext,
        control,
      ),
    validate: (report, values) =>
      modules.ci.validateRefreshCiActualReport(report, {
        candidateSha256: approval.candidate.sha256,
        candidate: approval.candidate,
        identity: values[0].identity,
      }),
    verifyAfter: async () => {
      await context.withZipTools(() => modules.pack.verifyRefreshCiPack(packArgs()));
      await context.verifyAfter();
    },
  };
}
const ownFields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'];
function statEqual(before, after) {
  for (const key of ownFields)
    assert.equal(after[key], before[key], 'Input physical identity drift');
}

// Future real invocation requires separate authorization. This function has no injectable ports.
export async function runActualRequest(requestPath, requestSha256, selfSha256) {
  assertActualLaunchEnvironment();
  const self = fileURLToPath(import.meta.url),
    helper = fileURLToPath(new URL('./r11-staged-pack.mjs', import.meta.url));
  assertToolSeal(self, selfSha256);
  assertToolSeal(helper, r11ActualIdentity.helperSha256);
  localCanonicalPath(requestPath);
  assertToolSeal(requestPath, requestSha256);
  assert.equal(hashFile(process.execPath, true), r11ActualIdentity.nodeSha256, 'Node binary drift');
  const request = validateActualRequest(readSealedActualJson(requestPath, requestSha256));
  assertFreshActualLocations(request);
  assertToolSeal(request.approvalPath, request.approvalSha256);
  await withActualZipTools(request.powershellPath, async () => undefined);
  const bootstrap = await verifyActualReader(request.readerRoot);
  const rootStat = fs.lstatSync(request.readerRoot, { bigint: true }),
    nodeStat = fs.lstatSync(process.execPath, { bigint: true });
  const imp = (p) => import(pathToFileURL(path.join(request.readerRoot, p)).href);
  const modules = {
    pack: await imp('scripts/helpers/native-refresh-ci-pack.mjs'),
    replay: await imp('packages/runtime/test/helpers/native-refresh-transport-replay.mjs'),
    ci: await imp('scripts/native-refresh-ci.mjs'),
    stop: await imp('scripts/helpers/native-refresh-r9-stop.mjs'),
    layout: await imp('scripts/helpers/native-refresh-ci-layout.mjs'),
    runtime: await imp('packages/runtime/dist/native-metadata-admission.js'),
  };
  // Preserve old output confinement independently of the new fixed R11 target.
  modules.layout.assertRefreshCiOutputOutsideLayouts(request.outputRoot);
  modules.layout.assertRefreshCiOutputOutsideLayouts(request.readerRoot);
  const approval = modules.pack.validateRefreshCiApproval(
    readSealedActualJson(request.approvalPath, request.approvalSha256),
  );
  assertR11Bindings(approval);
  assert.deepEqual(modules.runtime.nativeMetadataEnvironment(), r11ActualIdentity.environment);
  const inputs = new Map([
    [self, selfSha256],
    [helper, r11ActualIdentity.helperSha256],
    [requestPath, requestSha256],
    [request.approvalPath, request.approvalSha256],
  ]);
  for (const rel of [
    'scripts/native-refresh-ci.mjs',
    'scripts/helpers/native-refresh-r9-stop.mjs',
    'scripts/native-refresh-transport-memory.mjs',
    'packages/runtime/test/helpers/native-refresh-transport-replay.mjs',
    'packages/runtime/dist/native-metadata-admission.js',
    'packages/runtime/dist/native-metadata-profiles.js',
  ]) {
    const entry = bootstrap.files.find((x) => x.path === rel);
    assert(entry, 'Missing entry seal');
    inputs.set(path.join(request.readerRoot, rel), entry.sha256);
  }
  const seen = new Map(),
    archivePath = path.join(request.outputRoot, 'approved.zip');
  const verifyIdentity = async () => {
    await withActualZipTools(request.powershellPath, async () => undefined);
    const currentRoot = fs.lstatSync(request.readerRoot, { bigint: true });
    for (const field of ['dev', 'ino', 'birthtimeNs'])
      assert.equal(currentRoot[field], rootStat[field], 'Reader root replaced');
    assert.equal(fs.realpathSync.native(request.readerRoot), request.readerRoot);
    statEqual(nodeStat, fs.lstatSync(process.execPath, { bigint: true }));
    for (const [file, sha] of [
      [archivePath, r11ActualIdentity.archiveSha256],
      [
        path.join(r11ActualIdentity.layoutRoot, 'native/codeatlas-native-analyzer.exe'),
        r11ActualIdentity.nativeSha256,
      ],
      [
        path.join(r11ActualIdentity.layoutRoot, 'evidence/candidate.json'),
        r11ActualIdentity.candidateSha256,
      ],
    ])
      if (present(file)) inputs.set(file, sha);
    for (const [file, sha] of inputs) {
      const st = fs.lstatSync(file, { bigint: true });
      if (seen.has(file)) statEqual(seen.get(file), st);
      assertToolSeal(file, sha);
      if (!seen.has(file)) seen.set(file, st);
    }
    assert.deepEqual(modules.runtime.nativeMetadataEnvironment(), r11ActualIdentity.environment);
  };
  const verifyComplete = async () => {
    await verifyIdentity();
    assertExactInventory(bootstrap, await inventoryTree(request.readerRoot, { allowLinks: true }));
  };
  await verifyComplete();
  assertFreshActualLocations(request);
  await createOwnedDirectory(request.outputRoot);
  const attempt = {
    schemaVersion: 1,
    kind: 'R11_CONTROLLED_ACTUAL22_ATTEMPT',
    requestSha256,
    coordinatorSha256: selfSha256,
    readerContentSha256: r11ActualIdentity.readerContentSha256,
    approvalSha256: request.approvalSha256,
    pid: process.pid,
    nonce: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    retry: false,
    hardIsolation: false,
  };
  await writeActualReceipt(path.join(request.outputRoot, 'coordinator-attempt.json'), attempt);
  let control;
  try {
    control = await modules.stop.createR9StopControl(request.outputRoot, verifyIdentity);
    const ports = createActual22Ports(modules, {
      withZipTools: (operation) => withActualZipTools(request.powershellPath, operation),
      request,
      approval,
      archivePath,
      verifyReader: verifyComplete,
      verifyAfter: verifyComplete,
    });
    await runActual22Sequence(ports, control);
    const result = {
      schemaVersion: 1,
      state: 'ACTUAL22_VERIFIED_NOT_PHASE_ACCEPTED',
      candidateSha256: r11ActualIdentity.candidateSha256,
      archiveSha256: r11ActualIdentity.archiveSha256,
      approvalSha256: request.approvalSha256,
      coordinatorSha256: selfSha256,
      readerContentSha256: r11ActualIdentity.readerContentSha256,
      actualObservations: 22,
      requestSha256,
      retry: false,
      hardIsolation: false,
      endedAt: new Date().toISOString(),
    };
    await writeActualReceipt(path.join(request.outputRoot, 'coordinator-result.json'), result);
    return result;
  } catch (error) {
    try {
      if (control) await control.fail('COORDINATOR_FAILED');
    } catch {}
    await writeActualReceipt(path.join(request.outputRoot, 'coordinator-result.json'), {
      schemaVersion: 1,
      state: 'STOPPED_NOT_QUALIFIED',
      code: 'R11_CONTROLLED_ACTUAL22_FAILED',
      requestSha256,
      coordinatorSha256: selfSha256,
      cleanupState: 'UNKNOWN',
      retry: false,
      endedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export function readSealedActualJson(file, expectedSha256) {
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  const before = fs.lstatSync(file, { bigint: true });
  assert(before.isFile() && !before.isSymbolicLink());
  assert.equal(before.nlink, 1n);
  assert.equal(fs.realpathSync.native(file), file);
  const fd = fs.openSync(file, 'r');
  try {
    statEqual(before, fs.fstatSync(fd, { bigint: true }));
    const bytes = fs.readFileSync(fd);
    statEqual(before, fs.fstatSync(fd, { bigint: true }));
    statEqual(before, fs.lstatSync(file, { bigint: true }));
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      expectedSha256,
      'Sealed JSON bytes drift',
    );
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}
export async function writeActualReceipt(file, value) {
  await fs.promises.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
export const r11ActualZipTools = Object.freeze({
  powershellSha256: '362a356ce7f0940ec74f73a8fc2c990a2cc24a38a11c90bbd8eca947110ad139',
  tarSha256: 'a3ac62fd4cdf619a7c53f71ca3fe5fb42f72020975670ff29afe3603f6416a8e',
  tarPath: path.resolve('C:/Windows/System32/tar.exe'),
});
// The third argument is an internal test policy, never accepted from a CLI request.
export async function withActualZipTools(powershellPath, operation, tools = r11ActualZipTools) {
  assert.equal(path.basename(powershellPath), 'pwsh.exe');
  const check = () => {
    assert.equal(
      hashFile(powershellPath, true),
      tools.powershellSha256,
      'PowerShell identity drift',
    );
    assert.equal(hashFile(tools.tarPath, true), tools.tarSha256, 'Windows tar identity drift');
    const dirs = tools.searchDirectories ?? [
      path.dirname(powershellPath),
      path.dirname(process.execPath),
      ...['C:/Windows/System32', 'C:/Windows/System', 'C:/Windows'].map((p) => path.resolve(p)),
    ];
    for (const dir of dirs)
      for (const name of ['pwsh', 'pwsh.com', 'pwsh.exe', 'pwsh.cmd', 'pwsh.bat']) {
        const candidate = path.join(dir, name);
        if (present(candidate)) {
          assert.equal(name, 'pwsh.exe', 'Shadow PowerShell command');
          assert.equal(
            hashFile(candidate, true),
            tools.powershellSha256,
            'Shadow PowerShell executable',
          );
        }
      }
  };
  check();
  const previous = { cwd: process.cwd(), path: process.env.PATH, ext: process.env.PATHEXT };
  let value;
  const errors = [];
  try {
    process.chdir(path.dirname(powershellPath));
    process.env.PATH = path.dirname(powershellPath) + path.delimiter + path.dirname(tools.tarPath);
    process.env.PATHEXT = '.EXE';
    value = await operation();
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      process.chdir(previous.cwd);
    } catch (error) {
      errors.push(error);
    } finally {
      for (const [key, old] of [
        ['PATH', previous.path],
        ['PATHEXT', previous.ext],
      ])
        try {
          if (old === undefined) delete process.env[key];
          else process.env[key] = old;
        } catch (error) {
          errors.push(error);
        }
    }
  }
  try {
    check();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      'Operation, environment restoration or ZIP tool identity failed',
    );
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, request, requestSha, selfSha] = process.argv.slice(2);
    assert.equal(process.argv.length, 6);
    assert.equal(command, 'collect');
    console.log(JSON.stringify(await runActualRequest(request, requestSha, selfSha)));
  } catch {
    console.error(
      'R11_ACTUAL_REFUSED_OR_FAILED: preserve original evidence; do not retry automatically',
    );
    process.exitCode = 1;
  }
}
