import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const api = await import('./helpers/native-refresh-r9-stop.mjs').catch(() => ({}));
async function setup(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-r9-stop-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'executor');
  await mkdir(root);
  return { base, root, control: await api.createR9StopControl(root) };
}
test('R9 stop control is available without acquiring fixed roots', () =>
  assert.equal(typeof api.createR9StopControl, 'function'));
test('stop request is deny-only, sticky and preserves first exclusive receipt', async (t) => {
  const f = await setup(t);
  await writeFile(path.join(f.root, 'STOP_REQUESTED'), 'ignored synthetic content');
  await assert.rejects(() => f.control.checkpoint('BEFORE_BUILD'), { code: 'R9_STOP_REQUESTED' });
  const original = await readFile(path.join(f.root, 'r9-stop-receipt.json'), 'utf8');
  await rm(path.join(f.root, 'STOP_REQUESTED'));
  assert.equal(JSON.parse(original).boundary, 'BEFORE_BUILD');
  assert.equal(original.includes('synthetic content'), false);
  await assert.rejects(() => f.control.checkpoint('LATER'), { code: 'R9_STOP_REQUESTED' });
  assert.equal(await readFile(path.join(f.root, 'r9-stop-receipt.json'), 'utf8'), original);
});
test('worker saves its original evidence before honoring a stop created during operation', async (t) => {
  const f = await setup(t);
  let calls = 0;
  await assert.rejects(
    () =>
      f.control.worker('MEASURE:d-empty', async () => {
        calls++;
        await writeFile(path.join(f.root, 'worker-original.json'), 'original');
        await writeFile(path.join(f.root, 'STOP_REQUESTED'), '');
        return { status: 0 };
      }),
    { code: 'R9_STOP_REQUESTED' },
  );
  assert.equal(await readFile(path.join(f.root, 'worker-original.json'), 'utf8'), 'original');
  await assert.rejects(
    () =>
      f.control.worker('NEXT', async () => {
        calls++;
      }),
    { code: 'R9_STOP_REQUESTED' },
  );
  assert.equal(calls, 1);
});
test('failure or explicit UNKNOWN cleanup blocks later worker, without copying raw errors', async (t) => {
  for (const mode of ['throw', 'unknown']) {
    const f = await setup(t);
    let calls = 0;
    await assert.rejects(() =>
      f.control.worker('WORKER', async () => {
        calls++;
        if (mode === 'throw') throw Error('password=synthetic-only');
        return { cleanupState: 'UNKNOWN' };
      }),
    );
    await assert.rejects(() =>
      f.control.worker('NEXT', async () => {
        calls++;
      }),
    );
    assert.equal(calls, 1);
    const receipt = JSON.parse(await readFile(path.join(f.root, 'r9-stop-receipt.json'), 'utf8'));
    assert.equal(receipt.cleanupState, 'UNKNOWN');
    assert.equal(JSON.stringify(receipt).includes('synthetic-only'), false);
  }
});
test('replaced owned executor root refuses checkpoint', async (t) => {
  const f = await setup(t);
  await rename(f.root, path.join(f.base, 'original'));
  await mkdir(f.root);
  await assert.rejects(() => f.control.checkpoint('NEXT'));
});

test('occupied stop receipt fails closed without overwriting original evidence', async (t) => {
  const f = await setup(t);
  await writeFile(path.join(f.root, 'r9-stop-receipt.json'), 'original');
  await writeFile(path.join(f.root, 'STOP_REQUESTED'), '');
  await assert.rejects(() => f.control.checkpoint('BEFORE'), {
    code: 'R9_STOP_CONTROL_UNAVAILABLE',
  });
  assert.equal(await readFile(path.join(f.root, 'r9-stop-receipt.json'), 'utf8'), 'original');
});

test('during-functional-trial stop waits for receipt, preserved result and original-location restore', async (t) => {
  const f = await setup(t);
  let calls = 0;
  const seed = path.join(f.root, 'seed.sqlite'),
    live = path.join(f.root, 'live.sqlite');
  await writeFile(seed, 'seed');
  await writeFile(live, 'seed');
  await assert.rejects(
    () =>
      f.control.worker('FUNCTIONAL_TRIAL:d-empty', async () => {
        calls++;
        await writeFile(live, 'worker-result');
        await writeFile(path.join(f.root, 'STOP_REQUESTED'), '');
        // Synthetic original caller lifecycle, not an actual Native execution.
        await writeFile(
          path.join(f.root, 'trial-0.json'),
          JSON.stringify({ transactionClosed: true, tempClosed: true }),
        );
        await rename(live, path.join(f.root, 'trial-0.sqlite'));
        await writeFile(live, await readFile(seed));
        assert.equal(await readFile(live, 'utf8'), 'seed');
      }),
    { code: 'R9_STOP_REQUESTED' },
  );
  assert.equal(await readFile(path.join(f.root, 'trial-0.sqlite'), 'utf8'), 'worker-result');
  assert.equal(
    JSON.parse(await readFile(path.join(f.root, 'trial-0.json'), 'utf8')).tempClosed,
    true,
  );
  assert.equal(await readFile(live, 'utf8'), 'seed');
  await assert.rejects(() =>
    f.control.worker('NEXT_TRIAL', async () => {
      calls++;
    }),
  );
  assert.equal(calls, 1);
});

test('identity verification is checked before and after a worker and latches drift', async (t) => {
  const f = await setup(t);
  let identity = 'frozen',
    calls = 0;
  const control = await api.createR9StopControl(f.root, async () => {
    assert.equal(identity, 'frozen');
  });
  await assert.rejects(() =>
    control.worker('FIRST', async () => {
      calls++;
      await writeFile(path.join(f.root, 'original.json'), 'preserved');
      identity = 'changed';
    }),
  );
  identity = 'frozen';
  await assert.rejects(() =>
    control.worker('NEXT', async () => {
      calls++;
    }),
  );
  assert.equal(calls, 1);
  assert.equal(await readFile(path.join(f.root, 'original.json'), 'utf8'), 'preserved');
});

test('stage allows serial workers but rejects failed reports and later stages', async (t) => {
  const f = await setup(t);
  let calls = 0;
  await assert.rejects(() =>
    f.control.stage('READ', async () => {
      await f.control.worker('FIRST', async () => {
        calls++;
      });
      return { failures: [{ code: 'SYNTHETIC_FAILURE' }] };
    }),
  );
  await assert.rejects(() =>
    f.control.stage('VERIFY', async () => {
      await f.control.worker('NEXT', async () => {
        calls++;
      });
    }),
  );
  assert.equal(calls, 1);
});

test('failure while another identity check awaits cannot reopen the worker boundary', async (t) => {
  const f = await setup(t);
  let holdIdentity = false,
    releaseIdentity,
    identityEntered,
    failFirst,
    firstStarted;
  const identityWait = new Promise((resolve) => {
    releaseIdentity = resolve;
  });
  const entered = new Promise((resolve) => {
    identityEntered = resolve;
  });
  const firstWait = new Promise((resolve) => {
    failFirst = resolve;
  });
  const started = new Promise((resolve) => {
    firstStarted = resolve;
  });
  const control = await api.createR9StopControl(f.root, async () => {
    if (holdIdentity) {
      identityEntered();
      await identityWait;
    }
  });
  let calls = 0;
  const first = assert.rejects(() =>
    control.worker('FIRST', async () => {
      calls++;
      firstStarted();
      await firstWait;
      throw Error('synthetic failure');
    }),
  );
  await started;
  holdIdentity = true;
  const next = assert.rejects(() =>
    control.worker('NEXT', async () => {
      calls++;
    }),
  );
  await entered;
  failFirst();
  await first;
  releaseIdentity();
  await next;
  assert.equal(calls, 1);
});
