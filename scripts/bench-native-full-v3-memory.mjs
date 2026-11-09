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
const observations = [];
for (const name of transportMemoryCases)
  for (let repetition = 1; repetition <= 5; repetition++) {
    const child = spawnSync(process.execPath, [worker, name], {
      encoding: 'utf8',
      maxBuffer: 10_000_000,
      timeout: 60_000,
      windowsHide: true,
    });
    if (child.status !== 0)
      throw Error(`Calibration failed ${name}/${repetition}: ${child.stderr}`);
    observations.push({ repetition, ...JSON.parse(child.stdout) });
  }
const environment = observations[0].environment;
if (observations.some((o) => JSON.stringify(o.environment) !== JSON.stringify(environment)))
  throw Error('Environment changed');
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      status: 'PROVISIONAL_REVIEW_REQUIRED',
      corpusRevision: 'p05-native-full-v3-memory-v1',
      corpusDigest: hash.digest('hex'),
      environment,
      repetitions: 5,
      cases: transportMemoryCases,
      reservationBytes: Math.max(...observations.map((o) => o.peakResidentBytes)),
      observations,
    },
    null,
    2,
  ),
);
