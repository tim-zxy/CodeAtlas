import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
    const read = await import('./scripts/helpers/native-memory-calibration.mjs');
    const full = read;
    assert.equal(typeof read.benchNativeMetadataMemory, 'function');
    assert.equal(typeof full.benchNativeFullV3Memory, 'function');
  `,
    ],
    { windowsHide: true, stdio: 'pipe' },
  );
});

test('READ/FULL controlled calibration completes fixed slots or stops at the first failed worker', async (t) => {
  const read = await import('./helpers/native-memory-calibration.mjs');
  const full = read;
  const controllerSha256 = createHash('sha256')
    .update(await readFile(new URL('./helpers/native-memory-calibration.mjs', import.meta.url)))
    .digest('hex');
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
      const run = () =>
        control.stage('CALIBRATION', () => bench(runWorker, control, controllerSha256));
      if (outcome === 'success') assert.equal((await run()).observations.length, slots);
      else {
        await assert.rejects(run);
        await assert.rejects(() => control.worker('LATER', runWorker));
      }
      assert.equal(calls, outcome === 'success' ? slots : 1);
    }
  }
});

test('controlled calibration requires its separately frozen controller bytes before and after launch', async (t) => {
  const { pathToFileURL } = await import('node:url');
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-controller-pin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = (
    await readFile(new URL('./helpers/native-memory-calibration.mjs', import.meta.url), 'utf8')
  ).replace(
    "'../native-memory-profile.mjs'",
    JSON.stringify(new URL('./native-memory-profile.mjs', import.meta.url).href),
  );
  const copy = path.join(root, 'controller.mjs');
  await writeFile(copy, source);
  const pin = createHash('sha256').update(source).digest('hex');
  const tools = await import(pathToFileURL(copy));
  for (const mode of ['wrong-pin', 'changed-after-launch']) {
    const directory = await mkdtemp(path.join(root, 'attempt-'));
    const control = await createR9StopControl(directory);
    let calls = 0;
    await assert.rejects(() =>
      tools.benchNativeMetadataMemory(
        async (name) => {
          calls++;
          await writeFile(copy, source + '\n// self-owned mutation\n');
          return {
            status: 0,
            stdout: JSON.stringify({ name, environment: {}, peakResidentBytes: 1 }),
          };
        },
        control,
        mode === 'wrong-pin' ? '0'.repeat(64) : pin,
      ),
    );
    assert.equal(calls, mode === 'wrong-pin' ? 0 : 1);
    await assert.rejects(() =>
      control.worker('LATER', async () => {
        calls++;
      }),
    );
    assert.equal(calls, mode === 'wrong-pin' ? 0 : 1);
  }
});
