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
const observations = [];
for (const name of memoryCases)
  for (let repetition = 1; repetition <= 5; repetition++) {
    const child = spawnSync(process.execPath, [worker, name], {
      encoding: 'utf8',
      maxBuffer: 2_000_000,
      timeout: 60_000,
      windowsHide: true,
    });
    if (child.status !== 0)
      throw Error(
        `Calibration failed ${name}/${repetition}: ${child.error?.message ?? child.stderr}`,
      );
    observations.push({ repetition, ...JSON.parse(child.stdout) });
  }
const environment = observations[0].environment;
if (observations.some((o) => JSON.stringify(o.environment) !== JSON.stringify(environment)))
  throw Error('Calibration environment changed');
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      status: 'PROVISIONAL_REVIEW_REQUIRED',
      corpusRevision,
      corpusDigest,
      environment,
      repetitions: 5,
      cases: memoryCases,
      reservationBytes: Math.max(...observations.map((o) => o.peakResidentBytes)),
      observations,
    },
    null,
    2,
  ),
);
