import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function runPinnedMemoryWorker(workspace, caseName) {
  const worker =
    workspace === 'READ_SEAL'
      ? '../packages/runtime/test/helpers/native-metadata-worker.mjs'
      : '../packages/providers/test/helpers/native-full-v3-memory-worker.mjs';
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(worker, import.meta.url)), caseName],
    { encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 10_000_000 },
  );
  return { exitCode: child.status, stdout: child.stdout, stderr: child.stderr };
}

export async function collectNativeMemoryObservations(
  { mode, candidatePath, outputDirectory },
  runWorker = runPinnedMemoryWorker,
) {
  assert.ok(['candidate', 'approved'].includes(mode));
  assert.ok(typeof outputDirectory === 'string' && outputDirectory.length);
  await mkdir(outputDirectory, { recursive: true });
  const artifact = {
    schemaVersion: 1,
    purpose: 'verification',
    mode,
    environment: null,
    corpora: null,
    observations: [],
    failures: [],
  };
  const save = () =>
    writeFile(
      path.join(outputDirectory, 'observations.json'),
      JSON.stringify(artifact, null, 2) + '\n',
    );
  let tools, check, candidate;
  try {
    tools = await import('./native-memory-profile.mjs');
    ({ checkNativeMemoryObservation: check } = await import('./native-memory-gate.mjs'));
    const runtime = await import('../packages/runtime/dist/native-metadata-admission.js');
    artifact.environment = runtime.nativeMetadataEnvironment();
    artifact.corpora = await tools.currentMemoryCorpora();
  } catch {
    artifact.failures.push({ code: 'TOOL_UNAVAILABLE' });
    await save();
    return { passed: false, ...artifact };
  }
  if (mode === 'candidate') {
    try {
      const loaded = await tools.loadNativeMemoryCandidate(candidatePath);
      candidate = loaded.candidate;
      assert.deepEqual(candidate.environment, artifact.environment);
      assert.deepEqual(candidate.corpora, artifact.corpora);
      artifact.candidateEvidenceDigest = loaded.digest;
    } catch {
      artifact.failures.push({ code: 'CANDIDATE_INVALID' });
      await save();
      return { passed: false, ...artifact };
    }
  }
  await save();
  for (const [workspace, names] of Object.entries(tools.requiredMemoryCases))
    for (const name of names) {
      let child, row;
      try {
        child = await runWorker(workspace, name);
      } catch {
        artifact.failures.push({ workspace, name, code: 'PROCESS_FAILED' });
        await save();
        continue;
      }
      if (child.exitCode !== 0) {
        artifact.failures.push({
          workspace,
          name,
          code: 'PROCESS_FAILED',
          exitCode: child.exitCode ?? null,
        });
        await save();
        continue;
      }
      try {
        row = JSON.parse(child.stdout);
        tools.validateNativeMemoryObservation(row, workspace, artifact.environment);
        assert.equal(row.name, name, 'Observation does not match requested class');
        if (candidate && workspace === 'READ_SEAL')
          assert.ok(
            candidate.groups.some(
              (group) =>
                group.workspace === workspace &&
                group.caseName === name &&
                group.inputIdentity === row.corpusPayloadDigest,
            ),
            'Observation input differs from frozen evidence',
          );
      } catch {
        artifact.failures.push({ workspace, name, code: 'OBSERVATION_INVALID' });
        await save();
        continue;
      }
      artifact.observations.push({ workspace, observation: row });
      await save();
      try {
        if (mode === 'candidate') assert.ok(row.peakResidentBytes <= candidate.reservationBytes);
        else check(row, undefined, true);
      } catch {
        artifact.failures.push({ workspace, name, code: 'RESERVATION_REFUSED' });
        await save();
      }
    }
  return { passed: artifact.failures.length === 0, ...artifact };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectNativeMemoryObservations({
      mode: process.argv[2],
      outputDirectory: process.argv[3],
      candidatePath: process.argv[4],
    });
    console.log(
      JSON.stringify({
        passed: result.passed,
        observations: result.observations.length,
        failures: result.failures.length,
      }),
    );
    if (!result.passed) process.exitCode = 1;
  } catch {
    console.error('Native memory collection failed');
    process.exitCode = 1;
  }
}
