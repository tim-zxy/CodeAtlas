// Fixed synthetic main-CI entry. Original gates/context; deny-only stop control.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, realpath, readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import {
  validateRefreshCiApproval,
  verifyRefreshCiPack,
  installRefreshCiPack,
} from '../../scripts/helpers/native-refresh-ci-pack.mjs';
import {
  hashRefreshCiFile,
  assertRefreshCiOutputOutsideLayouts,
  verifyRefreshCiLayoutOwnership,
} from '../../scripts/helpers/native-refresh-ci-layout.mjs';
import {
  readRefreshTransportReplayCorpus,
  runRefreshTransportCommand,
} from '../../packages/runtime/test/helpers/native-refresh-transport-replay.mjs';
import { validateRefreshCiActualReport } from '../../scripts/native-refresh-ci.mjs';
import { createR9StopControl } from '../../scripts/helpers/native-refresh-r9-stop.mjs';
import { nativeMetadataEnvironment } from '../../packages/runtime/dist/native-metadata-admission.js';

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_REPOSITORY, 'tim-zxy/CodeAtlas');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
  assert.equal(process.argv.length, 2);
  assert(!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN, 'Tokenless actual required');
  const repositoryPath = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  assert.equal(await realpath(repositoryPath), repositoryPath);
  assert.equal(path.resolve(process.env.GITHUB_WORKSPACE), repositoryPath);
  assert.equal(process.cwd(), repositoryPath);
  const archivePath = path.join(
    repositoryPath,
    '.superpowers/native-memory/exact-pack/approved.zip',
  );
  const output = path.join(repositoryPath, '.superpowers/native-memory/exact-pack/acceptance');
  assert.equal(await realpath(path.dirname(output)), path.dirname(output));
  assertRefreshCiOutputOutsideLayouts(output);
  await mkdir(output); // No overwrite, resume, recovery or retry.
  let stage = 'APPROVAL';
  let control;
  const save = (value) =>
    writeFile(path.join(output, 'ci-result.json'), JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
    });
  try {
    const approvalPath = path.join(
      repositoryPath,
      'fixtures/ipc/refresh-v3/approved-transport-a1.json',
    );
    const approvalSha256 = await hashRefreshCiFile(approvalPath);
    const approval = validateRefreshCiApproval(JSON.parse(await readFile(approvalPath, 'utf8')));
    assert.equal(approval.layoutRevision, 'p05-d5-exact-layout-v10');
    assert.equal(
      approval.candidate.sha256,
      'c0df81fa46605cb782f909d9f56e0396a7be51c712f881c73506099256f465b3',
    );
    assert.equal(approval.candidate.reservationBytes, 395624448);
    assert.equal(
      approval.archive.sha256,
      'b294bf67d19449862697cbfe24e292ff437930c2a4d1589d25fb28f1f6636501',
    );
    assert.equal(approval.archive.bytes, 246166928);
    assert.equal(approval.release.repository, 'tim-zxy/CodeAtlas');
    assert.equal(approval.release.releaseId, 444184827);
    assert.equal(approval.release.assetId, 743520777);
    assert.equal(
      approval.native.sha256,
      '6d1ee4bc5844835158ffe4fe78ffb6ce30a993ba57c700459711efd47d942a2a',
    );
    assert.equal(
      approval.environment.implementationDigest,
      '7e5e78b981cad1886b7e7cbebc6d3f77ba637cc08700d4f8a5884ea37e764c32',
    );
    assert.deepEqual(nativeMetadataEnvironment(), approval.environment);
    const pins = new Map();
    const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'];
    const same = (a, b) => {
      for (const field of fields) assert.equal(a[field], b[field], 'Input instance drift');
    };
    const pin = async (file, expected, allowHardlinks = false) => {
      const before = await lstat(file, { bigint: true });
      assert(before.isFile() && !before.isSymbolicLink());
      if (allowHardlinks) assert(before.nlink >= 1n);
      else assert.equal(before.nlink, 1n);
      assert.equal(await realpath(file), file);
      const hash = await hashRefreshCiFile(file);
      if (expected) assert.equal(hash, expected, 'Input bytes drift');
      same(before, await lstat(file, { bigint: true }));
      pins.set(file, { before, hash });
    };
    for (const [file, expected, allowHardlinks] of [
      [approvalPath, approvalSha256],
      [archivePath, approval.archive.sha256],
      [fileURLToPath(import.meta.url)],
      [process.execPath, undefined, true],
      ...[
        'scripts/helpers/native-refresh-r9-stop.mjs',
        'scripts/native-refresh-ci.mjs',
        'scripts/native-refresh-transport-memory.mjs',
        'packages/runtime/test/helpers/native-refresh-transport-replay.mjs',
      ].map((p) => [path.join(repositoryPath, p)]),
    ])
      await pin(file, expected, allowHardlinks);
    const verifyIdentity = async (full = false) => {
      for (const [file, seal] of pins) {
        assert.equal(await realpath(file), file);
        same(seal.before, await lstat(file, { bigint: true }));
        if (full) assert.equal(await hashRefreshCiFile(file), seal.hash, 'Input bytes drift');
      }
      assert.deepEqual(nativeMetadataEnvironment(), approval.environment);
    };
    control = await createR9StopControl(output, verifyIdentity);
    const packArgs = { approval, archivePath, repositoryPath };
    stage = 'ARCHIVE';
    await control.stage('ARCHIVE', () => verifyRefreshCiPack(packArgs));
    stage = 'INSTALL';
    const installed = await control.stage('INSTALL', async () => {
      const value = await installRefreshCiPack(packArgs);
      await pin(value.layout.nativePath, approval.native.sha256);
      await pin(value.candidatePath, approval.candidate.sha256);
      return value;
    });
    stage = 'ACTUAL';
    const values = await control.stage('READ', () =>
      readRefreshTransportReplayCorpus(
        installed.manifestPath,
        installed.bindingPath,
        installed.fixtureContext,
      ),
    );
    const report = await control.stage('COLLECT', () =>
      runRefreshTransportCommand(
        ['collect', 'approved', installed.candidatePath, path.join(output, 'actual')],
        installed.fixtureContext,
        control,
      ),
    );
    await control.stage('VALIDATE', () =>
      validateRefreshCiActualReport(report, {
        candidateSha256: approval.candidate.sha256,
        candidate: approval.candidate,
        identity: values[0].identity,
      }),
    );
    await control.stage('VERIFY_AFTER', async () => {
      await verifyRefreshCiPack(packArgs);
      await verifyRefreshCiLayoutOwnership(installed.layout);
      assert.deepEqual(await readdir(installed.layout.tempRoot), []);
      await verifyIdentity(true);
    });
    assert.equal(await hashRefreshCiFile(approvalPath), approvalSha256);
    await save({
      schemaVersion: 1,
      command: 'collect',
      success: true,
      stage,
      approvalSha256,
      archiveSha256: approval.archive.sha256,
    });
    console.log('ACTUAL22_VERIFIED_NOT_PHASE_ACCEPTED');
  } catch (error) {
    try {
      if (control) await control.fail('MAIN_CI_ACTUAL_FAILED');
    } catch {}
    await save({
      schemaVersion: 1,
      command: 'collect',
      success: false,
      stage,
      code: 'D5_CI_FAILED',
    });
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('D5_CI_FAILED: see retained original artifacts');
    process.exitCode = 1;
  });
}
