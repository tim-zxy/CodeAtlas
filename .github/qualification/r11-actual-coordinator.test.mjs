import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createR9StopControl } from '../../scripts/helpers/native-refresh-r9-stop.mjs';
import { inventoryTree } from './r11-staged-pack.mjs';
import {
  runActual22Sequence,
  validateActualRequest,
  assertR11Bindings,
  readerContentDigest,
  verifyActualReader,
  assertFreshActualLocations,
  assertActualLaunchEnvironment,
  createActual22Ports,
  readSealedActualJson,
  writeActualReceipt,
  withActualZipTools,
} from './r11-actual-coordinator.mjs';
const stages = [
  'VERIFY_READER',
  'DOWNLOAD',
  'VERIFY_PACK',
  'INSTALL',
  'READ',
  'COLLECT',
  'VALIDATE',
  'VERIFY_AFTER',
];
async function own(t) {
  const root = await fs.mkdtemp(path.join(realpathSync(tmpdir()), 'codeatlas-r11-actual-double-'));
  t.after(async () => {
    const p = realpathSync(root);
    assert(p.startsWith(realpathSync(tmpdir()) + path.sep));
    await fs.rm(p, { recursive: true, force: true });
  });
  return root;
}
async function fixture(t, options = {}) {
  const root = await own(t),
    events = [],
    workers = [];
  let changed = false;
  const control = await createR9StopControl(root, async () => {
    if (changed) throw Error('identity drift');
  });
  const report = { observations: [], failures: [] };
  const step =
    (name, body) =>
    async (...args) => {
      events.push(name);
      if (options.fail === name) throw Error('failure ' + name);
      return body?.(...args);
    };
  const archive = { kind: 'TEST_DOUBLE_ARCHIVE' },
    installed = { kind: 'TEST_DOUBLE_OWNED_INSTALL' },
    values = [{ identity: { kind: 'TEST_DOUBLE_IDENTITY' } }];
  const ports = {
    verifyReader: step('VERIFY_READER'),
    download: step('DOWNLOAD', () => archive),
    verifyPack: step('VERIFY_PACK', (a) => assert.equal(a, archive)),
    install: step('INSTALL', (a) => {
      assert.equal(a, archive);
      return installed;
    }),
    read: step('READ', (v) => {
      assert.equal(v, installed);
      return values;
    }),
    collect: step('COLLECT', async (v, rows, c) => {
      assert.equal(v, installed);
      assert.equal(rows, values);
      assert.equal(c, control);
      for (let i = 0; i < 22; i++) {
        await c.worker('TEST_DOUBLE:' + i, async () => {
          workers.push(i);
          if (options.workerFailure === i) throw Error('worker failed');
          if (options.unknown === i) return { cleanupState: 'UNKNOWN' };
          report.observations.push(i);
          if (options.drift === i) changed = true;
          if (options.stop === i)
            await fs.writeFile(path.join(root, 'STOP_REQUESTED'), 'stop', { flag: 'wx' });
        });
      }
      return options.badReport
        ? { ...report, failures: [{ code: 'TEST_DOUBLE_FAILURE' }] }
        : report;
    }),
    validate: step('VALIDATE', (v, r, i) => {
      assert.equal(v, report);
      assert.equal(r, values);
      assert.equal(i, installed);
      assert.equal(v.observations.length, 22);
    }),
    verifyAfter: step('VERIFY_AFTER', (i, v) => {
      assert.equal(i, installed);
      assert.equal(v, report);
    }),
  };
  return { root, events, workers, control, ports, report };
}
test('successful sequence retains all frozen operations,22 worker order and original report', async (t) => {
  const f = await fixture(t);
  assert.equal(await runActual22Sequence(f.ports, f.control), f.report);
  assert.deepEqual(f.events, stages);
  assert.deepEqual(
    f.workers,
    Array.from({ length: 22 }, (_, i) => i),
  );
  await assert.rejects(fs.stat(path.join(f.root, 'r9-stop-receipt.json')), { code: 'ENOENT' });
});
test('failure in every stage prevents all later stages and retains stop evidence', async (t) => {
  for (const name of stages) {
    const f = await fixture(t, { fail: name });
    await assert.rejects(
      () => runActual22Sequence(f.ports, f.control),
      new RegExp('failure ' + name),
    );
    assert.deepEqual(f.events, stages.slice(0, stages.indexOf(name) + 1));
    const r = JSON.parse(await fs.readFile(path.join(f.root, 'r9-stop-receipt.json')));
    assert.equal(r.laterLaunchesBlocked, true);
    await assert.rejects(() => f.control.worker('LATER', async () => assert.fail('later launch')));
  }
});
test('a worker failure preserves its error and blocks the fourth worker and validation', async (t) => {
  const f = await fixture(t, { workerFailure: 2 });
  await assert.rejects(() => runActual22Sequence(f.ports, f.control), /worker failed/);
  assert.deepEqual(f.workers, [0, 1, 2]);
  assert(!f.events.includes('VALIDATE'));
});
test('UNKNOWN cleanup blocks the next worker without claiming settlement', async (t) => {
  const f = await fixture(t, { unknown: 2 });
  await assert.rejects(() => runActual22Sequence(f.ports, f.control), /R9_CLEANUP_UNKNOWN/);
  assert.deepEqual(f.workers, [0, 1, 2]);
  const r = JSON.parse(await fs.readFile(path.join(f.root, 'r9-stop-receipt.json')));
  assert.equal(r.cleanupState, 'UNKNOWN');
});
test('post-worker identity drift and stop requests block the next worker', async (t) => {
  for (const option of ['drift', 'stop']) {
    const f = await fixture(t, { [option]: 2 });
    await assert.rejects(() => runActual22Sequence(f.ports, f.control));
    assert.deepEqual(f.workers, [0, 1, 2]);
    assert(!f.events.includes('VALIDATE'));
  }
});
test('a failure report cannot reach strict validation or final success checks', async (t) => {
  const f = await fixture(t, { badReport: true });
  await assert.rejects(() => runActual22Sequence(f.ports, f.control), /R9_STAGE_FAILED/);
  assert(!f.events.includes('VALIDATE'));
  assert(!f.events.includes('VERIFY_AFTER'));
});
test('missing phase or stopping control refuses before any operation', async (t) => {
  const f = await fixture(t);
  delete f.ports.validate;
  await assert.rejects(() => runActual22Sequence(f.ports, f.control));
  assert.deepEqual(f.events, []);
  await assert.rejects(() => runActual22Sequence({}, undefined));
});
test('request schema refuses unknown authority fields, aliasing and overlapping output', () => {
  const root = realpathSync(tmpdir()),
    request = {
      schemaVersion: 1,
      readerRoot: path.join(root, 'reader'),
      approvalPath: path.join(root, 'approved.json'),
      powershellPath: path.join(root, 'pwsh.exe'),
      approvalSha256: 'a'.repeat(64),
      outputRoot: path.join(root, 'output'),
    };
  assert.deepEqual(validateActualRequest(request), request);
  for (const v of [
    { ...request, executeApproved: true },
    { ...request, schemaVersion: 2 },
    { ...request, approvalSha256: 'wrong' },
    { ...request, readerRoot: 'relative' },
    { ...request, approvalPath: request.approvalPath + ':stream' },
    { ...request, outputRoot: request.outputRoot + '.' },
    { ...request, readerRoot: path.join(root, 'CON') },
    { ...request, outputRoot: path.join(request.readerRoot, 'out') },
  ])
    assert.throws(() => validateActualRequest(v));
});
function bindings() {
  return {
    layoutRevision: 'p05-d5-exact-layout-v11',
    environment: {
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: '571d757965c5743e60a92f49c795e1995fe3dbeea8d75189ffcda5f9dcd66e73',
      corpusRevision: 'p05-native-metadata-memory-v1',
    },
    corpus: {
      revision: 'p05-native-refresh-transport-memory-v1',
      digest: 'f7be1f03622872d42ca0a3541ba0a685693ad159c618d92ef0abbd05651568de',
    },
    candidate: {
      sha256: 'de07bdfe79fb38e763236107cbab6e693f881c22732895b1d5ffe6186a35f4c9',
      reservationBytes: 434798592,
      policyRevision: 'p05-native-memory-high-water-range-v1',
    },
    native: { sha256: '696a593d6082286efdedede2ec0c9592cfc83ada9c709bc034d1ad07ed714623' },
    archive: {
      sha256: '3ce3ef83e1e584d6a6de52150f7020f895d1f4ab8a65245451ada65521e740bd',
      bytes: 245661348,
      entries: Array(5423).fill(null),
    },
    release: {
      repository: 'tim-zxy/CodeAtlas',
      tag: 'p05-d5-fixture-de07bdfe79fb38e763236107cbab6e693f881c22732895b1d5ffe6186a35f4c9',
      assetName: 'codeatlas-p05-d5-r11.zip',
    },
  };
}
test('R11 bindings are exact; partial substitute record is never an approval or real asset identity', () => {
  const value = bindings();
  assert.doesNotThrow(() => assertR11Bindings(value));
  for (const v of [
    { ...value, layoutRevision: 'p05-d5-exact-layout-v8' },
    { ...value, archive: { ...value.archive, sha256: '0'.repeat(64) } },
    { ...value, candidate: { ...value.candidate, reservationBytes: 434798593 } },
    { ...value, environment: { ...value.environment, zodVersion: 'different' } },
    { ...value, release: { ...value.release, repository: 'wrong/repository' } },
  ])
    assert.throws(() => assertR11Bindings(v));
});
test('reader bootstrap binds complete files, internal topology and profile bytes before imports', async (t) => {
  const owner = await own(t),
    reader = path.join(owner, 'reader');
  await fs.mkdir(reader);
  await fs.mkdir(path.join(reader, 'package'));
  await fs.writeFile(path.join(reader, 'package/profile.js'), 'export const bytes=434798592;');
  await fs.symlink(path.join(reader, 'package'), path.join(reader, 'alias'), 'junction');
  const inventory = await inventoryTree(reader, { allowLinks: true }),
    digest = readerContentDigest(inventory);
  assert.match(digest, /^[a-f0-9]{64}$/);
  await verifyActualReader(reader, digest);
  await fs.writeFile(path.join(reader, 'package/profile.js'), 'export const bytes=434798593;');
  await assert.rejects(() => verifyActualReader(reader, digest));
  await fs.writeFile(path.join(reader, 'extra'), 'unapproved');
  await assert.rejects(() => verifyActualReader(reader, digest));
});

test('fresh actual locations refuse existing layout/output and never adopt an old tree', async (t) => {
  const root = await own(t),
    reader = path.join(root, 'reader'),
    approval = path.join(root, 'approval.json'),
    out = path.join(root, 'out'),
    layout = path.join(root, 'layout');
  await fs.mkdir(reader);
  await fs.writeFile(approval, 'TEST_DOUBLE_NOT_APPROVAL');
  const r = {
    schemaVersion: 1,
    readerRoot: reader,
    approvalPath: approval,
    powershellPath: path.join(root, 'pwsh.exe'),
    approvalSha256: 'a'.repeat(64),
    outputRoot: out,
  };
  assert.doesNotThrow(() => assertFreshActualLocations(r, layout));
  await fs.mkdir(layout);
  assert.throws(() => assertFreshActualLocations(r, layout));
  assert.deepEqual(await fs.readdir(layout), []);
  await fs.rmdir(layout);
  await fs.mkdir(out);
  assert.throws(() => assertFreshActualLocations(r, layout));
  assert.deepEqual(await fs.readdir(out), []);
});
test('operational environment refuses Node preloads and wrong runtime before imports', () => {
  const valid = {
    version: 'v24.15.0',
    versions: { v8: '13.6.233.17-node.48' },
    platform: 'win32',
    arch: 'x64',
    execArgv: [],
    env: {},
  };
  assert.doesNotThrow(() => assertActualLaunchEnvironment(valid));
  for (const bad of [
    { ...valid, env: { NODE_OPTIONS: '--import=unknown' } },
    { ...valid, env: { NODE_PATH: 'outside' } },
    { ...valid, execArgv: ['--import=unknown'] },
    { ...valid, version: 'different' },
  ])
    assert.throws(() => assertActualLaunchEnvironment(bad));
});
test('sealed reader preflight refuses a directory link escaping its owner', async (t) => {
  const root = await own(t),
    reader = path.join(root, 'reader'),
    outside = path.join(root, 'outside');
  await fs.mkdir(reader);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'package.js'), 'TEST_DOUBLE');
  await fs.symlink(outside, path.join(reader, 'bad'), 'junction');
  await assert.rejects(() => verifyActualReader(reader, '0'.repeat(64)));
});
test('bridge retains original installer/context/approved collector and strict validator arguments', async (t) => {
  const root = await own(t),
    calls = [],
    control = await createR9StopControl(root),
    approval = { candidate: { sha256: 'TEST_DOUBLE_NOT_CANDIDATE', reservationBytes: 1 } },
    request = { readerRoot: path.join(root, 'reader'), outputRoot: root };
  const archive = path.join(root, 'approved.zip'),
    installed = {
      manifestPath: 'OWNED_MANIFEST',
      bindingPath: 'OWNED_BINDING',
      candidatePath: 'OWNED_CANDIDATE',
      fixtureContext: { kind: 'TEST_DOUBLE_OPAQUE_CONTEXT' },
    },
    values = [{ identity: { kind: 'TEST_DOUBLE_IDENTITY' } }],
    report = { observations: [], failures: [] };
  const modules = {
    pack: {
      downloadRefreshCiArchive: async (a, p, repo) => {
        calls.push('download');
        assert.equal(a, approval);
        assert.equal(p, archive);
        assert.equal(repo, 'tim-zxy/CodeAtlas');
        return p;
      },
      verifyRefreshCiPack: async (a) => {
        calls.push('verify');
        assert.equal(a.approval, approval);
        assert.equal(a.archivePath, archive);
        assert.equal(a.repositoryPath, request.readerRoot);
      },
      installRefreshCiPack: async (a) => {
        calls.push('install');
        assert.equal(a.approval, approval);
        return installed;
      },
    },
    replay: {
      readRefreshTransportReplayCorpus: async (m, b, c) => {
        calls.push('read');
        assert.equal(m, installed.manifestPath);
        assert.equal(b, installed.bindingPath);
        assert.equal(c, installed.fixtureContext);
        return values;
      },
      runRefreshTransportCommand: async (args, c, ctl) => {
        calls.push('collect');
        assert.deepEqual(args, [
          'collect',
          'approved',
          installed.candidatePath,
          path.join(root, 'actual'),
        ]);
        assert.equal(c, installed.fixtureContext);
        assert.equal(ctl, control);
        for (let i = 0; i < 22; i++)
          await ctl.worker('DOUBLE:' + i, async () => report.observations.push(i));
        return report;
      },
    },
    ci: {
      validateRefreshCiActualReport: (r, b) => {
        calls.push('validate');
        assert.equal(r, report);
        assert.equal(b.candidate, approval.candidate);
        assert.equal(b.identity, values[0].identity);
        assert.equal(b.candidateSha256, approval.candidate.sha256);
      },
    },
  };
  let toolCalls = 0;
  const ports = createActual22Ports(modules, {
    withZipTools: async (operation) => {
      toolCalls++;
      return operation();
    },
    request,
    approval,
    archivePath: archive,
    verifyReader: async () => calls.push('reader'),
    verifyAfter: async () => calls.push('after'),
  });
  assert.equal(await runActual22Sequence(ports, control), report);
  assert.deepEqual(calls, [
    'reader',
    'download',
    'verify',
    'install',
    'read',
    'collect',
    'validate',
    'verify',
    'after',
  ]);
  assert.equal(report.observations.length, 22);
  assert.equal(toolCalls, 3);
  await assert.rejects(fs.stat(path.join(root, 'ci-result.json')), { code: 'ENOENT' });
});

test('import and unsupported CLI commands are inert and cannot create an actual receipt', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const root = await own(t),
    file = fileURLToPath(new URL('./r11-actual-coordinator.mjs', import.meta.url));
  const env = { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', TEMP: root, TMP: root };
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'globalThis.fetch=()=>{throw Error("UNEXPECTED_NETWORK")};await import(' +
        JSON.stringify(pathToFileURL(file).href) +
        ');process.stdout.write("INERT")',
    ],
    { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'INERT');
  assert.deepEqual(await fs.readdir(root), []);
  for (const command of ['prepare', 'pack', 'collect']) {
    const c = spawnSync(process.execPath, [file, command], {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    assert.equal(c.status, 1);
    assert.equal(c.stdout, '');
    assert.match(c.stderr, /R11_ACTUAL_REFUSED_OR_FAILED/);
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test('sealed JSON parses the exact checked bytes and refuses drift or linked authority', async (t) => {
  const { createHash } = await import('node:crypto'),
    root = await own(t),
    file = path.join(root, 'request.json'),
    bytes = Buffer.from('{"source":"TEST_DOUBLE"}');
  await fs.writeFile(file, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(readSealedActualJson(file, digest), { source: 'TEST_DOUBLE' });
  await fs.writeFile(file, '{"source":"DRIFT"}');
  assert.throws(() => readSealedActualJson(file, digest));
});
test('exclusive evidence serialization is valid JSON and cannot overwrite old receipts', async (t) => {
  const root = await own(t),
    file = path.join(root, 'double-receipt.json'),
    value = { source: 'TEST_DOUBLE', state: 'STOPPED_NOT_QUALIFIED' };
  await writeActualReceipt(file, value);
  const before = await fs.readFile(file);
  assert.deepEqual(JSON.parse(before), value);
  assert.equal(before.at(-1), 10);
  await assert.rejects(() => writeActualReceipt(file, { source: 'different' }), { code: 'EEXIST' });
  assert.deepEqual(await fs.readFile(file), before);
});
test('ZIP tool scope seals exact executables and restores path/cwd even after an error', async (t) => {
  const { createHash } = await import('node:crypto'),
    root = await own(t),
    pwsh = path.join(root, 'pwsh.exe'),
    tar = path.join(root, 'tar.exe'),
    data = Buffer.from('TEST_DOUBLE_NOT_EXECUTABLE');
  await fs.writeFile(pwsh, data);
  await fs.writeFile(tar, data);
  const digest = createHash('sha256').update(data).digest('hex'),
    tools = {
      powershellSha256: digest,
      tarSha256: digest,
      tarPath: tar,
      searchDirectories: [root],
    };
  const before = { cwd: process.cwd(), path: process.env.PATH, ext: process.env.PATHEXT };
  await withActualZipTools(
    pwsh,
    async () => {
      assert.equal(process.cwd(), root);
      assert.equal(process.env.PATHEXT, '.EXE');
      assert.equal(process.env.PATH, root + path.delimiter + root);
    },
    tools,
  );
  await assert.rejects(
    () =>
      withActualZipTools(
        pwsh,
        async () => {
          throw Error('preserve original error');
        },
        tools,
      ),
    /preserve original error/,
  );
  assert.equal(process.cwd(), before.cwd);
  assert.equal(process.env.PATH, before.path);
  assert.equal(process.env.PATHEXT, before.ext);
  await fs.writeFile(pwsh, 'changed');
  let called = false;
  await assert.rejects(() =>
    withActualZipTools(
      pwsh,
      async () => {
        called = true;
      },
      tools,
    ),
  );
  assert.equal(called, false);
});

test('vanished previous cwd cannot skip environment restoration or hide the primary failure', async (t) => {
  const { createHash } = await import('node:crypto'),
    root = await own(t),
    prior = path.join(root, 'prior'),
    toolDir = path.join(root, 'tools');
  await fs.mkdir(prior);
  await fs.mkdir(toolDir);
  const pwsh = path.join(toolDir, 'pwsh.exe'),
    tar = path.join(toolDir, 'tar.exe'),
    bytes = Buffer.from('TEST_DOUBLE');
  await fs.writeFile(pwsh, bytes);
  await fs.writeFile(tar, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex'),
    tools = {
      powershellSha256: digest,
      tarSha256: digest,
      tarPath: tar,
      searchDirectories: [toolDir],
    },
    before = { cwd: process.cwd(), path: process.env.PATH, ext: process.env.PATHEXT };
  let caught;
  try {
    process.chdir(prior);
    try {
      await withActualZipTools(
        pwsh,
        async () => {
          await fs.rmdir(prior);
          throw Error('primary operation failure');
        },
        tools,
      );
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof AggregateError);
    assert(caught.errors.some((e) => e.message === 'primary operation failure'));
    assert(caught.errors.some((e) => e.code === 'ENOENT'));
    assert.equal(process.env.PATH, before.path);
    assert.equal(process.env.PATHEXT, before.ext);
  } finally {
    process.chdir(before.cwd);
    if (before.path === undefined) delete process.env.PATH;
    else process.env.PATH = before.path;
    if (before.ext === undefined) delete process.env.PATHEXT;
    else process.env.PATHEXT = before.ext;
  }
});
