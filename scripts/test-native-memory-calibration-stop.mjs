import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createR9StopControl } from './helpers/native-refresh-r9-stop.mjs';

test('calibration modules import without launching any subprocess', () => {
  execFileSync(
    process.execPath,
    [
      '--permission',
      '--allow-fs-read=*',
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    const read = await import('./scripts/bench-native-metadata-memory.mjs');
    const full = await import('./scripts/bench-native-full-v3-memory.mjs');
    assert.equal(typeof read.benchNativeMetadataMemory, 'function');
    assert.equal(typeof full.benchNativeFullV3Memory, 'function');
  `,
    ],
    { windowsHide: true, stdio: 'pipe' },
  );
});

test('READ/FULL controlled calibration completes fixed slots or stops at the first failed worker', async (t) => {
  const read = await import('./bench-native-metadata-memory.mjs');
  const full = await import('./bench-native-full-v3-memory.mjs');
  for (const [bench, slots] of [
    [read.benchNativeMetadataMemory, 65],
    [full.benchNativeFullV3Memory, 70],
  ]) {
    for (const outcome of ['success', 'failure', 'unknown', 'stop', 'drift']) {
      const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-calibration-stop-'));
      t.after(() => rm(root, { recursive: true, force: true }));
      let calls = 0,
        unchanged = true;
      const control = await createR9StopControl(root, async () => assert.equal(unchanged, true));
      const runWorker = async (name) => {
        calls++;
        if (outcome === 'stop') await writeFile(path.join(root, 'STOP_REQUESTED'), '');
        if (outcome === 'drift') unchanged = false;
        return {
          status: outcome === 'failure' ? 1 : 0,
          stdout: JSON.stringify({
            name,
            environment: { fixture: 'SELF_OWNED_SIMULATION' },
            peakResidentBytes: 1,
          }),
          stderr: '',
          ...(outcome === 'unknown' ? { cleanupState: 'UNKNOWN' } : {}),
        };
      };
      const run = () => control.stage('CALIBRATION', () => bench(runWorker, control));
      if (outcome === 'success') assert.equal((await run()).observations.length, slots);
      else {
        await assert.rejects(run);
        await assert.rejects(() => control.worker('LATER', runWorker));
      }
      assert.equal(calls, outcome === 'success' ? slots : 1);
    }
  }
});
