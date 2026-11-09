import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transportMemoryCases } from '../packages/providers/test/helpers/native-full-v3-memory-corpus.mjs';
const worker = fileURLToPath(
  new URL('../packages/providers/test/helpers/native-full-v3-memory-worker.mjs', import.meta.url),
);
const paths = [
  import.meta.filename,
  worker,
  fileURLToPath(
    new URL('../packages/providers/test/helpers/native-full-v3-memory-corpus.mjs', import.meta.url),
  ),
  fileURLToPath(
    new URL('../packages/providers/test/fixtures/native-full-v3-memory-child.mjs', import.meta.url),
  ),
  fileURLToPath(
    new URL('../packages/runtime/test/helpers/native-metadata-corpus.mjs', import.meta.url),
  ),
];
const hash = createHash('sha256');
for (const path of paths) hash.update(readFileSync(path));
const corpusDigest = hash.digest('hex');
function runPinnedWorker(name) {
  return spawnSync(process.execPath, [worker, name], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
    timeout: 60_000,
    windowsHide: true,
  });
}
export async function benchNativeFullV3Memory(runWorker = runPinnedWorker, control) {
  const observations = [];
  for (const name of transportMemoryCases)
    for (let repetition = 1; repetition <= 5; repetition++) {
      const collect = async () => {
        const child = await runWorker(name, repetition);
        if (control && child.cleanupState === 'UNKNOWN') throw Error('R9_CLEANUP_UNKNOWN');
        if (child.status !== 0)
          throw Error(`Calibration failed ${name}/${repetition}: ${child.stderr}`);
        const row = JSON.parse(child.stdout);
        if (
          control &&
          observations.length &&
          JSON.stringify(row.environment) !== JSON.stringify(observations[0].environment)
        )
          throw Error('Calibration environment changed');
        observations.push({ repetition, ...row });
      };
      if (control) await control.worker('FULL_CALIBRATION:' + name, collect);
      else await collect();
    }
  const environment = observations[0].environment;
  if (observations.some((o) => JSON.stringify(o.environment) !== JSON.stringify(environment)))
    throw Error('Environment changed');
  return {
    schemaVersion: 1,
    status: 'PROVISIONAL_REVIEW_REQUIRED',
    corpusRevision: 'p05-native-full-v3-memory-v1',
    corpusDigest,
    environment,
    repetitions: 5,
    cases: transportMemoryCases,
    reservationBytes: Math.max(...observations.map((o) => o.peakResidentBytes)),
    observations,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await benchNativeFullV3Memory(), null, 2));
}
