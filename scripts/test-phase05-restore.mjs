import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rename,
  link,
  access,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-restore-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'seed.sqlite');
  // Tooling-only database, not a seeded Canonical graph or Native acceptance.
  const db = new DatabaseSync(sourcePath);
  db.exec("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('seed')");
  db.close();
  const targetPath = path.join(directory, 'working.sqlite');
  await helper.copyPhase05ClosedSeed({ directory, sourcePath, targetPath, maxBytes: 1000000 });
  const repositoryRoot = path.join(directory, 'repository');
  await mkdir(repositoryRoot);
  const vector = JSON.parse(
    await readFile(
      new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
    ),
  );
  const request = {
    ...vector.write,
    initialize: false,
    repositoryRoot,
    databasePath: targetPath,
    nativeExecutablePath: path.join(directory, 'absent.exe'),
    configuration: vector.configuration,
  };
  return { directory, sourcePath, targetPath, request, maxBytes: 1000000 };
}

test('owned restore preserves durable failed trial and restores bytes at the original location', async (t) => {
  const input = await fixture(t);
  assert.equal(typeof helper.preparePhase05RestorePoint, 'function');
  const point = await helper.preparePhase05RestorePoint(input);
  const db = new DatabaseSync(input.targetPath);
  db.exec("UPDATE marker SET value='interrupted'");
  db.close();
  const interrupted = await readFile(input.targetPath);
  const receipt = await helper.runPhase05IndexTrial({
    request: input.request,
    receiptDirectory: path.join(input.directory, 'failure'),
  });
  const receiptBytes = await readFile(receipt.receiptPath);
  const result = await point.restore({ receipt });
  assert.equal(result.restored, true);
  assert.equal(result.path, 'working.sqlite');
  assert.deepEqual(await readFile(input.targetPath), await readFile(input.sourcePath));
  assert.deepEqual(await readFile(path.join(input.directory, result.archivePath)), interrupted);
  assert.deepEqual(await readFile(receipt.receiptPath), receiptBytes);
  const reopened = new DatabaseSync(input.targetPath, { readOnly: true });
  try {
    assert.equal(reopened.prepare('SELECT value FROM marker').get().value, 'seed');
  } finally {
    reopened.close();
  }
  await assert.rejects(point.restore({ receipt }));
});

for (const refuseInspection of [false, true]) {
  test(`failed-trial inspection ${refuseInspection ? 'refusal prevents' : 'precedes'} owned restoration`, async (t) => {
    assert.equal(typeof helper.inspectPhase05FailedTrialBeforeRestore, 'function');
    const input = await fixture(t);
    const point = await helper.preparePhase05RestorePoint(input);
    const db = new DatabaseSync(input.targetPath);
    db.exec("UPDATE marker SET value='failed state'");
    db.close();
    const failedBytes = await readFile(input.targetPath);
    const receipt = await helper.runPhase05IndexTrial({
      request: input.request,
      receiptDirectory: path.join(input.directory, 'failure'),
    });
    const failure = new Error('inspection unavailable');
    let inspected = false;
    const operation = () =>
      helper.inspectPhase05FailedTrialBeforeRestore({
        receipt,
        restorePoint: point,
        inspect: async () => {
          inspected = true;
          await receipt.assertUnchanged();
          assert.deepEqual(await readFile(input.targetPath), failedBytes);
          if (refuseInspection) throw failure;
          return { scope: 'TOOLING_ORDER_ONLY', value: 'failed state' };
        },
      });
    if (refuseInspection) {
      await assert.rejects(operation, (error) => error === failure);
      assert.deepEqual(await readFile(input.targetPath), failedBytes);
      // A failed inspection did not consume the owned restore authority.
      const result = await point.restore({ receipt });
      assert.deepEqual(await readFile(path.join(input.directory, result.archivePath)), failedBytes);
    } else {
      const result = await operation();
      assert.equal(result.inspection.value, 'failed state');
      assert.deepEqual(
        await readFile(path.join(input.directory, result.restored.archivePath)),
        failedBytes,
      );
      assert.deepEqual(await readFile(input.targetPath), await readFile(input.sourcePath));
    }
    assert.equal(inspected, true);
  });
}

test('owned restore rejects a seed that differs from the captured original database', async (t) => {
  const input = await fixture(t);
  const db = new DatabaseSync(input.targetPath);
  db.exec("UPDATE marker SET value='different original'");
  db.close();
  const before = await readFile(input.targetPath);
  await assert.rejects(helper.preparePhase05RestorePoint(input));
  assert.deepEqual(await readFile(input.targetPath), before);
});

test('owned restore rejects a receipt issued before its replay input was captured', async (t) => {
  const input = await fixture(t);
  const receipt = await helper.runPhase05IndexTrial({
    request: input.request,
    receiptDirectory: path.join(input.directory, 'earlier-failure'),
  });
  const point = await helper.preparePhase05RestorePoint(input);
  const before = await readFile(input.targetPath);
  await assert.rejects(point.restore({ receipt }));
  assert.deepEqual(await readFile(input.targetPath), before);
});

test('owned restore keeps independent points for different databases in the same case', async (t) => {
  const input = await fixture(t);
  const first = await helper.preparePhase05RestorePoint(input);
  const other = { ...input, targetPath: path.join(input.directory, 'reference.sqlite') };
  await helper.copyPhase05ClosedSeed({ ...other, targetPath: other.targetPath });
  const second = await helper.preparePhase05RestorePoint(other);
  const a = await helper.runPhase05IndexTrial({
    request: input.request,
    receiptDirectory: path.join(input.directory, 'a'),
  });
  const b = await helper.runPhase05IndexTrial({
    request: { ...input.request, databasePath: other.targetPath },
    receiptDirectory: path.join(input.directory, 'b'),
  });
  const restoredA = await first.restore({ receipt: a });
  const restoredB = await second.restore({ receipt: b });
  assert.notEqual(restoredA.archivePath, restoredB.archivePath);
  assert.deepEqual(await readFile(input.targetPath), await readFile(other.targetPath));
});

test('owned restore supports a later operation at the same database without reusing or reviving the earlier point', async (t) => {
  const input = await fixture(t);
  const first = await helper.preparePhase05RestorePoint(input);
  const originalSeed = await readFile(input.sourcePath);
  const completed = new DatabaseSync(input.targetPath);
  completed.exec("UPDATE marker SET value='baseline-completed'");
  completed.close();
  const nextSource = path.join(input.directory, 'next-replay.sqlite');
  await helper.copyPhase05ClosedSeed({
    ...input,
    sourcePath: input.targetPath,
    targetPath: nextSource,
  });
  const second = await helper.preparePhase05RestorePoint({ ...input, sourcePath: nextSource });
  const locations = (await readdir(input.directory)).filter((name) => name.startsWith('restore-'));
  assert.equal(locations.length, 2, 'both original closed restore snapshots must remain retained');
  const failed = new DatabaseSync(input.targetPath);
  failed.exec("UPDATE marker SET value='later interrupted'");
  failed.close();
  const interrupted = await readFile(input.targetPath);
  const receipt = await helper.runPhase05IndexTrial({
    request: input.request,
    receiptDirectory: path.join(input.directory, 'later-failure'),
  });
  await assert.rejects(first.restore({ receipt }), /ownership|superseded|original/i);
  assert.deepEqual(await readFile(input.targetPath), interrupted);
  const restored = await second.restore({ receipt });
  assert.deepEqual(await readFile(path.join(input.directory, restored.archivePath)), interrupted);
  assert.deepEqual(await readFile(input.targetPath), await readFile(nextSource));
  assert.deepEqual(await readFile(input.sourcePath), originalSeed);
  const reopened = new DatabaseSync(input.targetPath, { readOnly: true });
  try {
    assert.equal(reopened.prepare('SELECT value FROM marker').get().value, 'baseline-completed');
  } finally {
    reopened.close();
  }
  await assert.rejects(first.restore({ receipt }));
  await assert.rejects(second.restore({ receipt }));
});

for (const defect of [
  'foreign-receipt',
  'changed-receipt',
  'wrong-trial',
  'changed-seed',
  'replaced-target',
  'hardlinked-target',
  'wal',
]) {
  test(`owned restore refuses ${defect} without changing the target`, async (t) => {
    const input = await fixture(t);
    assert.equal(typeof helper.preparePhase05RestorePoint, 'function');
    const point = await helper.preparePhase05RestorePoint(input);
    let request = input.request;
    if (defect === 'wrong-trial')
      request = { ...request, databasePath: path.join(input.directory, 'other.sqlite') };
    let receipt = await helper.runPhase05IndexTrial({
      request,
      receiptDirectory: path.join(input.directory, 'failure'),
    });
    if (defect === 'foreign-receipt') receipt = { ...receipt };
    if (defect === 'changed-receipt') await writeFile(receipt.receiptPath, '{}\n');
    if (defect === 'changed-seed') await writeFile(input.sourcePath, 'foreign');
    if (defect === 'replaced-target') {
      await rename(input.targetPath, path.join(input.directory, 'original.sqlite'));
      await writeFile(input.targetPath, 'foreign');
    }
    if (defect === 'hardlinked-target')
      await link(input.targetPath, path.join(input.directory, 'foreign-link'));
    if (defect === 'wal') await writeFile(input.targetPath + '-wal', 'active sidecar');
    const before = await readFile(input.targetPath);
    await assert.rejects(point.restore({ receipt }));
    assert.deepEqual(await readFile(input.targetPath), before);
    const points = (await readdir(input.directory)).filter((name) => name.startsWith('restore-'));
    assert.equal(points.length, 1);
    for (const name of points)
      await assert.rejects(access(path.join(input.directory, name, 'interrupted.sqlite')), {
        code: 'ENOENT',
      });
  });
}
