import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  corpusRevision,
  memoryCases,
} from '../packages/runtime/test/helpers/native-metadata-corpus.mjs';

const worker = fileURLToPath(
  new URL('../packages/runtime/test/helpers/native-metadata-worker.mjs', import.meta.url),
);
const corpusDigest = createHash('sha256')
  .update(
    readFileSync(
      new URL('../packages/runtime/test/helpers/native-metadata-corpus.mjs', import.meta.url),
    ),
  )
  .update(readFileSync(worker))
  .update(readFileSync(import.meta.filename))
  .digest('hex');
function runPinnedWorker(name) {
  return spawnSync(process.execPath, [worker, name], {
    encoding: 'utf8',
    maxBuffer: 2_000_000,
    timeout: 60_000,
    windowsHide: true,
  });
}
export async function benchNativeMetadataMemory(runWorker = runPinnedWorker, control) {
  const observations = [];
  for (const name of memoryCases)
    for (let repetition = 1; repetition <= 5; repetition++) {
      const collect = async () => {
        const child = await runWorker(name, repetition);
        if (control && child.cleanupState === 'UNKNOWN') throw Error('R9_CLEANUP_UNKNOWN');
        if (child.status !== 0)
          throw Error(
            `Calibration failed ${name}/${repetition}: ${child.error?.message ?? child.stderr}`,
          );
        const row = JSON.parse(child.stdout);
        if (
          control &&
          observations.length &&
          JSON.stringify(row.environment) !== JSON.stringify(observations[0].environment)
        )
          throw Error('Calibration environment changed');
        observations.push({ repetition, ...row });
      };
      if (control) await control.worker('READ_CALIBRATION:' + name, collect);
      else await collect();
    }
  const environment = observations[0].environment;
  if (observations.some((o) => JSON.stringify(o.environment) !== JSON.stringify(environment)))
    throw Error('Calibration environment changed');
  return {
    schemaVersion: 1,
    status: 'PROVISIONAL_REVIEW_REQUIRED',
    corpusRevision,
    corpusDigest,
    environment,
    repetitions: 5,
    cases: memoryCases,
    reservationBytes: Math.max(...observations.map((o) => o.peakResidentBytes)),
    observations,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await benchNativeMetadataMemory(), null, 2));
}
