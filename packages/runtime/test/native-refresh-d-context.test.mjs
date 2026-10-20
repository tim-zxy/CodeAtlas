import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { preparedSourceRefresh } from './helpers/native-refresh-source-fixture.mjs';
import {
  encodeRefreshReplayJson,
  readRefreshReplayWorkloadControls,
} from './helpers/native-refresh-transport-replay.mjs';
import {
  preparedRetainedSitesBoundary,
  sizeRetainedSitesBoundary,
} from './helpers/native-refresh-retained-sites-boundary.mjs';

const executablePath = fileURLToPath(
  new URL(
    `../../../target/debug/codeatlas-native-analyzer${process.platform === 'win32' ? '.exe' : ''}`,
    import.meta.url,
  ),
);
const allowedEnvironment = Object.fromEntries(
  ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);
const context = () => ({
  memoryBudgetBytes: 1_000_000_000,
  executablePath,
  allowedEnvironment: { ...allowedEnvironment },
});
const row = {
  id: 'd-context-budget-proof',
  baseline: { 'Empty.java': 'Empty.java' },
  target: { 'Empty.java': 'Empty.java' },
};

test('D explicit caller input reaches real bootstrap and reopened preparation', async (t) => {
  const fixture = await preparedSourceRefresh(t, row, 1, undefined, undefined, context());
  assert.equal(fixture.prepared.request.payload.resourceBudget.maxMemoryBytes, 1_000_000_000);
  assert.equal(fixture.prepared.limits.memoryBudgetBytes, 1_000_000_000);
  assert.equal(fixture.options.executablePath, executablePath);
  assert.deepEqual(fixture.options.allowedEnvironment, allowedEnvironment);
  assert.equal(fixture.db.isTransaction, false);
  assert.equal(fixture.prepared.baseline.summaries.length, 1);
  assert.equal(fixture.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
});

test('omitted D context preserves C caller input and real preparation', async (t) => {
  const fixture = await preparedSourceRefresh(t, row);
  assert.equal(fixture.prepared.request.payload.resourceBudget.maxMemoryBytes, 268_435_456);
  assert.equal(fixture.prepared.limits.memoryBudgetBytes, 268_435_456);
  assert.equal(fixture.prepared.baseline.summaries.length, 1);
});

test('invalid D context refuses before acquiring a replay root', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d-context-invalid-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  let getterCalls = 0;
  const accessor = context();
  Object.defineProperty(accessor, 'memoryBudgetBytes', {
    enumerable: true,
    get() {
      getterCalls++;
      return 1_000_000_000;
    },
  });
  const invalid = [
    { ...context(), memoryBudgetBytes: 268_435_456 },
    { ...context(), memoryBudgetBytes: NaN },
    { ...context(), executablePath: 'relative.exe' },
    { ...context(), extra: true },
    { ...context(), [Symbol('unexpected')]: true },
    { ...context(), allowedEnvironment: { SECRET: 'not-permitted' } },
    { ...context(), allowedEnvironment: { TEMP: 1 } },
    accessor,
  ];
  for (let index = 0; index < invalid.length; index++)
    await assert.rejects(
      () =>
        preparedSourceRefresh(
          t,
          row,
          1,
          undefined,
          path.join(parent, String(index)),
          invalid[index],
        ),
      /D fixture context/,
    );
  assert.equal(getterCalls, 0);
  assert.deepEqual(await readdir(parent), []);
});

test('D context is snapshotted before the first asynchronous acquisition', async (t) => {
  const input = context();
  const pending = preparedSourceRefresh(t, row, 1, undefined, undefined, input);
  input.memoryBudgetBytes = 1;
  input.executablePath = 'wrong.exe';
  input.allowedEnvironment.TEMP = 'wrong-temp';
  const fixture = await pending;
  assert.equal(fixture.prepared.limits.memoryBudgetBytes, 1_000_000_000);
  assert.equal(fixture.options.executablePath, executablePath);
  assert.deepEqual(fixture.options.allowedEnvironment, allowedEnvironment);
});

test('D temporary source and reference fixtures use the explicit owned TEMP root', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d-owned-temp-'));
  try {
    const selected = context();
    selected.allowedEnvironment.TEMP = parent;
    selected.allowedEnvironment.TMP = parent;
    const fixture = await preparedSourceRefresh(t, row, 1, undefined, undefined, selected);
    assert.equal(path.dirname(path.dirname(fixture.databasePath)), parent);
    assert.equal(fixture.prepared.limits.memoryBudgetBytes, 1_000_000_000);
  } finally {
    t.after(() => rm(parent, { recursive: true, force: true }));
  }
});

test('D retained-site sizing seed carries the explicit input before framing', async (t) => {
  const framed = new Error('original framing checkpoint reached');
  await assert.rejects(
    () =>
      sizeRetainedSitesBoundary(
        t,
        [],
        (request, summary, count) => {
          assert.equal(request.payload.resourceBudget.maxMemoryBytes, 1_000_000_000);
          assert.equal(count, 0);
          assert.equal(summary.sourceFile.path, 'Sites.java');
          throw framed;
        },
        undefined,
        context(),
      ),
    (error) => error === framed,
  );
});

test('D retained-site boundary rechecks a source seed at changed physical geometry', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d-boundary-'));
  try {
    const directory = path.join(parent, 'selected-layout');
    await mkdir(directory, { recursive: true });
    const result = await preparedRetainedSitesBoundary(
      t,
      undefined,
      path.join(directory, 'workspace'),
      context(),
    );
    assert.equal(result.fixture.prepared.limits.memoryBudgetBytes, 1_000_000_000);
    assert.equal(result.accepted.request.payload.resourceBudget.maxMemoryBytes, 1_000_000_000);
    assert.ok(result.accepted.metrics.inputBytes <= 1_000_000);
    assert.ok(result.next.metrics.inputBytes > 1_000_000);
    assert.equal(result.next.metrics.memberCount, result.accepted.metrics.memberCount + 1);
    assert.equal(
      result.accepted.request.payload.repository.rootPath,
      path.join(directory, 'workspace'),
    );
  } finally {
    // Register after the fixture's close hook; do not unlink an open Windows DB.
    t.after(() => rm(parent, { recursive: true, force: true }));
  }
});

test('D sizing rejects an oversized checked seed before trying a lower real source', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d-sizing-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const directory = path.join(parent, ...Array(4).fill('界'.repeat(30)));
  await mkdir(directory, { recursive: true });
  let seedReads = 0;
  const checkpoint = new Error('second original seed read reached');
  await assert.rejects(
    () =>
      preparedRetainedSitesBoundary(
        t,
        (diagnostic, role) => {
          if (role !== 'GENERATOR_SEED') return;
          assert.equal(diagnostic.status, 'AVAILABLE');
          if (++seedReads === 2) throw checkpoint;
        },
        path.join(directory, 'workspace'),
        context(),
      ),
    (error) => error === checkpoint,
  );
  assert.equal(seedReads, 2);
  assert.deepEqual(await readdir(directory), []);
});

async function replayControls(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-d-controls-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'repository.sqlite');
  const invocationPath = path.join(directory, 'invocation.json');
  const optionsPath = path.join(directory, 'options.json');
  const selected = { ...context(), executablePath: path.join(directory, 'selected.exe') };
  const invocation = {
    requestId: 'controls-only',
    descriptor: {},
    trustedContext: {},
    payload: {
      repository: { rootPath: directory },
      resourceBudget: { maxMemoryBytes: 1_000_000_000 },
    },
  };
  const options = {
    executablePath: selected.executablePath,
    arguments: ['--parse-workers', '1'],
    timeoutMs: 10_000,
    allowedEnvironment: selected.allowedEnvironment,
  };
  await writeFile(databasePath, 'control reader does not open SQLite');
  await writeFile(invocationPath, encodeRefreshReplayJson(invocation));
  await writeFile(optionsPath, encodeRefreshReplayJson(options));
  return {
    selected,
    invocation,
    options,
    invocationPath,
    optionsPath,
    workload: {
      name: 'd-empty',
      workspacePath: directory,
      databasePath,
      coverage: [],
      inputContract: {},
      workload: { invocationPath, optionsPath, fault: null },
    },
  };
}

test('D replay controls validate the explicitly selected executable rather than target/debug', async (t) => {
  const input = await replayControls(t);
  const result = await readRefreshReplayWorkloadControls(input.workload, input.selected);
  assert.deepEqual(result.invocation, input.invocation);
  assert.deepEqual(result.options, input.options);
  await assert.rejects(
    () => readRefreshReplayWorkloadControls(input.workload),
    (error) => error.actual === input.selected.executablePath && error.expected === executablePath,
  );
});

test('D replay controls reject a frozen old budget even with the selected executable', async (t) => {
  const input = await replayControls(t);
  input.invocation.payload.resourceBudget.maxMemoryBytes = 268_435_456;
  await writeFile(input.invocationPath, encodeRefreshReplayJson(input.invocation));
  await assert.rejects(
    () => readRefreshReplayWorkloadControls(input.workload, input.selected),
    /caller input|budget/,
  );
});

test('D replay controls reject another executable instead of trusting frozen options alone', async (t) => {
  const input = await replayControls(t);
  input.options.executablePath = executablePath;
  await writeFile(input.optionsPath, encodeRefreshReplayJson(input.options));
  await assert.rejects(
    () => readRefreshReplayWorkloadControls(input.workload, input.selected),
    (error) => error.actual === executablePath && error.expected === input.selected.executablePath,
  );
});
