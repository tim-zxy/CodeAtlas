// Required development acceptance entry, never a production download or admission bypass.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeMetadataEnvironment } from '../packages/runtime/dist/native-metadata-admission.js';
import { nativeRefreshTransportProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import {
  acquireRefreshCiLayout,
  hashRefreshCiFile,
  readRefreshCiPackLayout,
  refreshCiFixtureContext,
  refreshCiLayoutRoot,
  assertRefreshCiOutputOutsideLayouts,
} from './helpers/native-refresh-ci-layout.mjs';
import {
  installRefreshCiPack,
  createRefreshCiPack,
  discoverRefreshCiNativeSourceAt,
  validateRefreshCiApproval,
  verifyRefreshCiPack,
} from './helpers/native-refresh-ci-pack.mjs';
import {
  decodeRefreshReplayJson,
  encodeRefreshReplayJson,
  readRefreshTransportReplayCorpus,
  runRefreshTransportCommand,
} from '../packages/runtime/test/helpers/native-refresh-transport-replay.mjs';
import {
  refreshTransportCases,
  checkRefreshTransportInputFeasibility,
  validateRefreshTransportObservation,
} from './native-refresh-transport-memory.mjs';

export function checkRefreshCiCandidateBudget(callerBudgetBytes, candidateReservationBytes, rows) {
  assert.ok(Number.isSafeInteger(candidateReservationBytes) && candidateReservationBytes > 0);
  assert.equal(rows.length, refreshTransportCases.length * 5);
  const maximumRows = refreshTransportCases.map((name) => {
    const matches = rows.filter((row) => row.name === name);
    assert.deepEqual(matches.map((row) => row.repetition).sort(), [0, 1, 2, 3, 4]);
    return matches.reduce((largest, row) =>
      row.retainedSqlStringChargeBytes > largest.retainedSqlStringChargeBytes ? row : largest,
    );
  });
  return {
    ...checkRefreshTransportInputFeasibility(
      callerBudgetBytes,
      candidateReservationBytes,
      maximumRows,
    ),
    kind: 'UNAPPROVED_CANDIDATE_DIAGNOSTIC_ONLY',
  };
}

async function prepareRefreshCiEvidence(outputInput, repositoryPath) {
  const output = path.resolve(outputInput);
  assert.equal(await realpath(path.dirname(output)), path.dirname(output));
  assertRefreshCiOutputOutsideLayouts(output);
  await mkdir(output);
  let stage = 'BUILD';
  try {
    assert.equal(process.platform, 'win32');
    assert.equal(process.arch, 'x64');
    const environment = nativeMetadataEnvironment();
    assert.ok(
      nativeRefreshTransportProfiles.some(
        (profile) =>
          profile.workspace === 'REFRESH_TRANSPORT' &&
          // Offline evidence creates a new product's approval; it cannot require
          // that approval first. Actual admission still matches the full digest.
          Object.entries(environment)
            .filter(([key]) => key !== 'implementationDigest')
            .every(([key, value]) => profile[key] === value),
      ),
      'Missing reviewed D environment',
    );
    refreshCiFixtureContext({
      nativePath: path.join(refreshCiLayoutRoot, 'native', 'codeatlas-native-analyzer.exe'),
      tempRoot: path.join(refreshCiLayoutRoot, 'temp'),
    });
    const sourceFiles = await discoverRefreshCiNativeSourceAt(repositoryPath);
    const toolchain = spawnSync('rustc', ['--version'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(toolchain.status, 0, 'Pinned Rust descriptor unavailable');
    const build = spawnSync('cargo', ['build', '--workspace'], {
      cwd: repositoryPath,
      encoding: 'utf8',
      windowsHide: true,
    });
    await writeFile(
      path.join(output, 'native-build-process.json'),
      JSON.stringify({
        status: build.status,
        signal: build.signal,
        error: build.error?.code ?? null,
        stdout: build.stdout,
        stderr: build.stderr,
      }) + '\n',
      { flag: 'wx' },
    );
    assert.equal(build.status, 0, 'Native build failed');
    assert.deepEqual(
      await discoverRefreshCiNativeSourceAt(repositoryPath),
      sourceFiles,
      'Native sources changed across build',
    );
    stage = 'LAYOUT';
    const layout = await acquireRefreshCiLayout();
    const receipt = {
      schemaVersion: 1,
      environment: (
        await import('../packages/runtime/dist/native-metadata-admission.js')
      ).nativeMetadataEnvironment(),
      native: {
        path: 'native/codeatlas-native-analyzer.exe',
        sha256: layout.nativeSha256,
        sourceFiles,
        toolchain: toolchain.stdout.trim(),
        build: { command: 'cargo', args: ['build', '--workspace'] },
      },
    };
    const receiptPath = path.join(output, 'native-build.json');
    await writeFile(receiptPath, encodeRefreshReplayJson(receipt), { flag: 'wx' });
    stage = 'QUALIFICATION_AND_CALIBRATION';
    await runRefreshTransportCommand(['bench', layout.evidenceRoot], layout.fixtureContext);
    await copyFile(
      receiptPath,
      path.join(layout.evidenceRoot, 'native-build.json'),
      constants.COPYFILE_EXCL,
    );
    const candidatePath = path.join(layout.evidenceRoot, 'candidate.json');
    const pendingCandidate = await runRefreshTransportCommand(
      [
        'candidate',
        path.join(layout.evidenceRoot, 'evidence-manifest.json'),
        layout.evidenceRoot,
        candidatePath,
      ],
      layout.fixtureContext,
    );
    stage = 'CANDIDATE_FEASIBILITY';
    const raw = JSON.parse(await readFile(path.join(layout.evidenceRoot, 'raw.json'), 'utf8'));
    const candidateFeasibility = checkRefreshCiCandidateBudget(
      layout.fixtureContext.memoryBudgetBytes,
      pendingCandidate.reservationBytes,
      raw.observations,
    );
    await writeFile(
      path.join(layout.evidenceRoot, 'candidate-input-feasibility.json'),
      encodeRefreshReplayJson(candidateFeasibility),
      { flag: 'wx' },
    );
    stage = 'INDEPENDENT_HOLDOUT';
    const holdout = await runRefreshTransportCommand(
      ['collect', 'candidate', candidatePath, path.join(output, 'independent')],
      layout.fixtureContext,
    );
    assert.deepEqual(holdout.failures, []);
    assert.deepEqual(
      holdout.observations.map((row) => row.name).sort(),
      [...refreshTransportCases].sort(),
    );
    const reviewRoot = path.join(layout.evidenceRoot, 'review');
    await mkdir(reviewRoot);
    const holdoutPath = path.join(reviewRoot, 'holdout.json');
    await copyFile(
      path.join(output, 'independent', 'holdout.json'),
      holdoutPath,
      constants.COPYFILE_EXCL,
    );
    const proposal = {
      schemaVersion: 1,
      status: 'NUMERIC_REVIEW_REQUIRED',
      candidatePath,
      holdoutPath,
      candidateSha256: await hashRefreshCiFile(candidatePath),
      holdoutSha256: await hashRefreshCiFile(holdoutPath),
      candidate: JSON.parse(await readFile(candidatePath, 'utf8')),
    };
    await writeFile(
      path.join(output, 'numeric-review.json'),
      JSON.stringify(proposal, null, 2) + '\n',
      { flag: 'wx' },
    );
    return proposal;
  } catch (error) {
    await writeFile(
      path.join(output, 'ci-result.json'),
      JSON.stringify({
        schemaVersion: 1,
        command: 'prepare',
        success: false,
        stage,
        code: 'D5_CI_FAILED',
      }) + '\n',
      { flag: 'wx' },
    );
    throw error;
  }
}

export function validateRefreshCiActualReport(input, binding) {
  const report = decodeRefreshReplayJson(encodeRefreshReplayJson(input));
  assert.deepEqual(
    Object.keys(report).sort(),
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
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.workspace, 'REFRESH_TRANSPORT');
  assert.equal(report.candidateSha256, binding.candidateSha256);
  assert.deepEqual(report.environment, binding.identity.environment);
  assert.deepEqual(report.corpus, binding.identity.corpus);
  assert.deepEqual(report.failures, [], 'Actual collector has failures');
  assert.deepEqual(
    report.observations.map((row) => row.name).sort(),
    [...refreshTransportCases].sort(),
    'Actual collector must contain all22 exactly once',
  );
  for (const row of report.observations) {
    validateRefreshTransportObservation(row, binding.identity, 'ACTUAL_ADMITTED');
    assert.equal(row.repetition, 0);
    assert.ok(row.peakResidentBytes <= binding.candidate.reservationBytes);
  }
  return report;
}

// Internal test-owned checkout seam. Operational CLI never accepts an approval override.
export async function runRefreshCiAt(args, repositoryPath) {
  if (args[0] === 'prepare') {
    assert.equal(args.length, 2, 'Invalid prepare arguments');
    return prepareRefreshCiEvidence(args[1], repositoryPath);
  }
  if (args[0] === 'pack') {
    assert.equal(args.length, 4, 'Invalid pack arguments');
    assert.equal(
      args[1],
      path.join(refreshCiLayoutRoot, 'evidence', 'candidate.json'),
      'Candidate pack geometry differs',
    );
    assert.equal(
      args[2],
      path.join(refreshCiLayoutRoot, 'evidence', 'review', 'holdout.json'),
      'Holdout pack geometry differs',
    );
    const result = await createRefreshCiPack({
      layout: await readRefreshCiPackLayout(),
      candidatePath: args[1],
      holdoutPath: args[2],
      outputArchive: args[3],
    });
    await writeFile(args[3] + '.manifest.json', JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
    return result;
  }
  const [command, archiveInput, outputInput] = args;
  assert.ok(
    ['verify', 'collect'].includes(command) && args.length === 3,
    'Invalid D5 CI operation',
  );
  const output = path.resolve(outputInput);
  assert.equal(
    await realpath(path.dirname(output)),
    path.dirname(output),
    'CI output parent alias',
  );
  assertRefreshCiOutputOutsideLayouts(output);
  await mkdir(output); // Never overwrite a prior success/failure receipt.
  let stage = 'APPROVAL';
  const save = (result) =>
    writeFile(path.join(output, 'ci-result.json'), JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
  try {
    const approvalPath = path.join(
      repositoryPath,
      'fixtures/ipc/refresh-v3/approved-transport.json',
    );
    const approvalSha256 = await hashRefreshCiFile(approvalPath);
    const approval = validateRefreshCiApproval(JSON.parse(await readFile(approvalPath, 'utf8')));
    assert.equal(process.platform, 'win32');
    assert.equal(process.arch, 'x64');
    stage = 'ARCHIVE';
    const archivePath = path.resolve(archiveInput);
    const packArgs = { approval, archivePath, repositoryPath };
    await verifyRefreshCiPack(packArgs);
    if (command === 'collect') {
      stage = 'INSTALL';
      const installed = await installRefreshCiPack(packArgs);
      stage = 'ACTUAL';
      const values = await readRefreshTransportReplayCorpus(
        installed.manifestPath,
        installed.bindingPath,
        installed.fixtureContext,
      );
      const report = await runRefreshTransportCommand(
        ['collect', 'approved', installed.candidatePath, path.join(output, 'actual')],
        installed.fixtureContext,
      );
      validateRefreshCiActualReport(report, {
        candidateSha256: approval.candidate.sha256,
        candidate: approval.candidate,
        identity: values[0].identity,
      });
    }
    assert.equal(await hashRefreshCiFile(approvalPath), approvalSha256, 'Approval record changed');
    const result = {
      schemaVersion: 1,
      command,
      success: true,
      stage,
      approvalSha256,
      archiveSha256: approval.archive.sha256,
    };
    await save(result);
    return result;
  } catch (error) {
    // Preserve original collector artifacts separately. Never serialize credentials,
    // raw environment or untrusted ZIP error text in the public command receipt.
    await save({ schemaVersion: 1, command, success: false, stage, code: 'D5_CI_FAILED' });
    throw error;
  }
}

export async function runRefreshCi(args) {
  return runRefreshCiAt(args, path.resolve(fileURLToPath(new URL('../', import.meta.url))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runRefreshCi(process.argv.slice(2));
  } catch {
    process.stderr.write(
      'D5_CI_FAILED: see retained ci-result.json and original actual artifacts\n',
    );
    process.exitCode = 1;
  }
}
