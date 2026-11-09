// Private controlled orchestration; never rewrite or import the frozen legacy CLI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { currentMemoryCorpora, requiredMemoryCases } from '../native-memory-profile.mjs';

async function calibrate(workspace, runWorker, control, controllerSha256) {
  assert.equal(typeof control?.worker, 'function', 'Explicit stop control required');
  const checkController = async () => {
    assert.match(controllerSha256 ?? '', /^[a-f0-9]{64}$/, 'Frozen coordinator digest required');
    assert.equal(
      createHash('sha256')
        .update(await readFile(import.meta.filename))
        .digest('hex'),
      controllerSha256,
      'Frozen coordinator changed',
    );
  };
  try {
    await checkController();
    const corpus = (await currentMemoryCorpora())[workspace];
    const worker = fileURLToPath(
      new URL(
        workspace === 'READ_SEAL'
          ? '../../packages/runtime/test/helpers/native-metadata-worker.mjs'
          : '../../packages/providers/test/helpers/native-full-v3-memory-worker.mjs',
        import.meta.url,
      ),
    );
    runWorker ??= (name) =>
      spawnSync(process.execPath, [worker, name], {
        encoding: 'utf8',
        maxBuffer: workspace === 'READ_SEAL' ? 2_000_000 : 10_000_000,
        timeout: 60_000,
        windowsHide: true,
      });
    const observations = [];
    for (const name of requiredMemoryCases[workspace])
      for (let repetition = 1; repetition <= 5; repetition++)
        await control.worker(workspace + '_CALIBRATION:' + name, async () => {
          await checkController();
          const child = await runWorker(name, repetition);
          assert.notEqual(child.cleanupState, 'UNKNOWN');
          assert.equal(child.status, 0, 'Calibration worker failed');
          const row = JSON.parse(child.stdout);
          if (observations.length) assert.deepEqual(row.environment, observations[0].environment);
          observations.push({ repetition, ...row });
          await checkController();
        });
    await checkController();
    return {
      schemaVersion: 1,
      status: 'PROVISIONAL_REVIEW_REQUIRED',
      corpusRevision: corpus.revision,
      corpusDigest: corpus.digest,
      environment: observations[0].environment,
      repetitions: 5,
      cases: requiredMemoryCases[workspace],
      reservationBytes: Math.max(...observations.map((row) => row.peakResidentBytes)),
      observations,
    };
  } catch (error) {
    await control.fail(workspace + '_CALIBRATION_FAILED');
    throw error;
  }
}
// The digest comes from an independently frozen source catalog, not self-approval.
// Actual manifests name this coordinator; the legacy corpus digest alone cannot
// authenticate this code or transfer any prior measurement/profile qualification.
export const benchNativeMetadataMemory = (runWorker, control, controllerSha256) =>
  calibrate('READ_SEAL', runWorker, control, controllerSha256);
export const benchNativeFullV3Memory = (runWorker, control, controllerSha256) =>
  calibrate('FULL_TRANSPORT', runWorker, control, controllerSha256);
