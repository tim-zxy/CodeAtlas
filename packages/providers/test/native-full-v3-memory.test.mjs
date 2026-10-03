import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { transportMemoryCases } from './helpers/native-full-v3-memory-corpus.mjs';
import {
  checkNativeMemoryObservation,
  recordNativeMemoryObservation,
} from '../../../scripts/native-memory-gate.mjs';
const worker = fileURLToPath(
  new URL('./helpers/native-full-v3-memory-worker.mjs', import.meta.url),
);
const manifest = JSON.parse(
  await readFile(new URL('../../../fixtures/ipc/analysis-v3/cases.json', import.meta.url)),
);
assert.deepEqual(manifest.memoryCases, transportMemoryCases);
for (const name of manifest.memoryCases)
  test(`actual full-v3 transport workspace: ${name}`, () => {
    const child = spawnSync(process.execPath, [worker, name], {
      encoding: 'utf8',
      maxBuffer: 2_000_000,
      timeout: 60_000,
      windowsHide: true,
    });
    assert.equal(child.status, 0, child.stderr);
    const observation = JSON.parse(child.stdout);
    recordNativeMemoryObservation('FULL_TRANSPORT', observation);
    assert.equal(observation.name, name);
    assert.ok(observation.peakResidentBytes > 0);
    checkNativeMemoryObservation(observation);
    assert.equal(observation.maximumOverlap, 1);
    assert.equal(observation.peakMethod, 'resourceUsage.maxRSS');
  });
