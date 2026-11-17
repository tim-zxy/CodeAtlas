import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
const url = new URL(
  './helpers/native-refresh-transport-replay.mjs?combined-command-test',
  import.meta.url,
).href;
const hook = registerHooks({
  load(u, c, next) {
    const loaded = next(u, c);
    if (u !== url) return loaded;
    return {
      ...loaded,
      source:
        String(loaded.source) +
        `
export const routeFixture = (log, fail, manifestVersion = 3) => {
 const value={schemaVersion:2,name:'d-cancel',identity:{environment:{synthetic:true},corpus:{synthetic:true}}};
 replayOwners.set(value,{manifest:{schemaVersion:manifestVersion,generator:{revision:'p05-refresh-replay-v4'}}});
 readRefreshTransportReplayCorpus=async()=>[value];
 prepareRefreshTransportCorpus=async(root,context,control,revision)=>{log.push(['prepare',revision]);};
 runRefreshTransportCombinedOfflineReplayV1=async(v,repetition)=>{assert.equal(v,value);log.push(['combined',repetition]);if(fail)throw fail;return {synthetic:true,repetition};};
};`,
    };
  },
});
const replay = await import(url);
hook.deregister();
async function owned(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'combined-command-test-')));
  t.after(async () => {
    assert.ok(path.basename(root).startsWith('combined-command-test-'));
    await fs.rm(root, { recursive: true });
  });
  return root;
}
test('versioned command has fixed contract and rejects actual/unknown before side effects', async () => {
  assert.equal(replay.refreshTransportCombinedExecutionRevision, 'p05-refresh-combined-offline-v1');
  assert.equal(typeof replay.runRefreshTransportCombinedCommandV1, 'function');
  let checkpoints = 0;
  const control = {
    checkpoint: async () => {
      checkpoints++;
    },
  };
  for (const args of [
    ['collect', 'approved', 'absent', 'absent'],
    ['actual', 'absent'],
    ['bench'],
    ['candidate', 'a', 'b'],
    ['bench', {}],
  ])
    await assert.rejects(() =>
      replay.runRefreshTransportCombinedCommandV1(args, undefined, control),
    );
  assert.equal(checkpoints, 0);
});
test('versioned bench selects combined path and generator4 without changing repetition order', async (t) => {
  const root = await owned(t),
    output = path.join(root, 'run'),
    log = [];
  replay.routeFixture(log);
  assert.equal(typeof replay.runRefreshTransportCombinedCommandV1, 'function');
  const value = await replay.runRefreshTransportCombinedCommandV1(['bench', output]);
  assert.deepEqual(log, [
    ['prepare', 'p05-refresh-replay-v4'],
    ...[0, 0, 1, 2, 3, 4].map((r) => ['combined', r]),
  ]);
  assert.deepEqual(
    value.observations.map((x) => x.repetition),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(output, 'qualification.json'), 'utf8')).cases,
    [{ name: 'd-cancel', passed: true }],
  );
});
test('versioned command retains stop control and never starts another worker after failure', async (t) => {
  const root = await owned(t),
    output = path.join(root, 'run'),
    log = [],
    failure = Error('SYNTHETIC_WORKER_FAILED');
  replay.routeFixture(log, failure);
  let stopped = false,
    workers = 0;
  const control = {
    checkpoint: async () => {
      if (stopped) throw failure;
    },
    worker: async (label, op) => {
      workers++;
      try {
        return await op();
      } catch (e) {
        stopped = true;
        throw e;
      }
    },
    fail: async () => {
      stopped = true;
    },
  };
  await assert.rejects(
    () => replay.runRefreshTransportCombinedCommandV1(['bench', output], undefined, control),
    /Full22 qualification failed/,
  );
  const qualification = JSON.parse(
    await fs.readFile(path.join(output, 'qualification.json'), 'utf8'),
  );
  assert.match(qualification.failures[0].message, /SYNTHETIC_WORKER_FAILED/);
  assert.equal(workers, 1);
  assert.equal(stopped, true);
  assert.deepEqual(log, [
    ['prepare', 'p05-refresh-replay-v4'],
    ['combined', 0],
  ]);
  await assert.rejects(() => fs.stat(path.join(output, 'raw.json')), { code: 'ENOENT' });
});

test('versioned command rejects legacy non-topology corpus before any observation', async (t) => {
  const root = await owned(t),
    log = [];
  replay.routeFixture(log, undefined, 2);
  await assert.rejects(
    () => replay.runRefreshTransportCombinedCommandV1(['bench', path.join(root, 'run')]),
    /requires topology corpus/,
  );
  assert.deepEqual(log, [['prepare', 'p05-refresh-replay-v4']]);
});
test('versioned command snapshots caller arguments before asynchronous control', async (t) => {
  const root = await owned(t),
    log = [];
  replay.routeFixture(log);
  const args = ['bench', path.join(root, 'run')];
  const control = {
    checkpoint: async () => {
      args[0] = 'collect';
      args[1] = 'approved';
    },
    worker: async (label, op) => op(),
    fail: async () => {},
  };
  const result = await replay.runRefreshTransportCombinedCommandV1(args, undefined, control);
  assert.equal(result.observations.length, 5);
  assert.equal(log.filter((x) => x[0] === 'combined').length, 6);
});
