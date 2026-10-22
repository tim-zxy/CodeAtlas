import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { refreshTransportCases } from './native-refresh-transport-memory.mjs';
import * as memory from './native-refresh-transport-memory.mjs';
import * as replay from '../packages/runtime/test/helpers/native-refresh-transport-replay.mjs';

const runner = await import('./native-refresh-ci.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

for (const command of ['verify', 'collect'])
  test(`required ${command} fails closed with preserved evidence when approval is missing`, async (t) => {
    const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d5-runner-'));
    t.after(() => rm(parent, { recursive: true, force: true }));
    const output = path.join(parent, 'output');
    assert.equal(typeof runner.runRefreshCiAt, 'function');
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {runRefreshCiAt} from ${JSON.stringify(new URL('./native-refresh-ci.mjs', import.meta.url).href)};
     try { await runRefreshCiAt(JSON.parse(process.argv[1]), process.argv[2]); }
     catch { process.exitCode=1; }`,
        JSON.stringify([command, path.join(parent, 'missing.zip'), output]),
        parent,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(await readFile(path.join(output, 'ci-result.json'), 'utf8')), {
      schemaVersion: 1,
      command,
      success: false,
      stage: 'APPROVAL',
      code: 'D5_CI_FAILED',
    });
    assert.deepEqual(await readdir(output), ['ci-result.json']);
  });

test('actual result validation rejects missing, failed, duplicate and offline class receipts', () => {
  assert.equal(typeof runner.validateRefreshCiActualReport, 'function');
  const binding = {
    candidateSha256: 'a'.repeat(64),
    candidate: { reservationBytes: 1000 },
    identity: { environment: {}, corpus: {}, inputs: {} },
  };
  const report = {
    schemaVersion: 2,
    workspace: 'REFRESH_TRANSPORT',
    candidateSha256: 'a'.repeat(64),
    environment: {},
    corpus: {},
    observations: [],
    failures: [],
  };
  assert.throws(() => runner.validateRefreshCiActualReport(report, binding));
  for (const observations of [
    [{ name: 'd-empty', scope: 'OFFLINE_CALIBRATION_ONLY' }],
    [{ name: 'd-empty' }, { name: 'd-empty' }],
  ])
    assert.throws(() => runner.validateRefreshCiActualReport({ ...report, observations }, binding));
  assert.throws(() =>
    runner.validateRefreshCiActualReport(
      { ...report, failures: [{ code: 'WORKER_OR_PEAK_FAILED' }] },
      binding,
    ),
  );
});

// Data-only vectors. These are not measured receipts or admission certificates.
test('actual result validation requires admitted scope and peak bounds even with all22 names present', () => {
  const hash = 'b'.repeat(64);
  const identity = {
    environment: {},
    corpus: {},
    inputs: Object.fromEntries(
      refreshTransportCases.map((name) => [
        name,
        {
          corpusPayloadDigest: hash,
          expectedOutcome: name === 'd-cancel' ? 'CANCELLED' : 'SUCCEEDED',
          inputBytes: 10,
          largestLineBytes: 9,
          outputBytes: name === 'd-cancel' ? null : 10,
          eventCount: name === 'd-cancel' ? null : 1,
          summaryBytes: 0,
          outputContract: { kind: name === 'd-cancel' ? 'CANCELLED_PREFIX' : 'EXACT' },
          outputReference:
            name === 'd-cancel' ? { responseSha256: hash, provenanceSha256: hash } : null,
        },
      ]),
    ),
  };
  const observations = refreshTransportCases.map((name) => ({
    name,
    repetition: 0,
    workspace: 'REFRESH_TRANSPORT',
    environment: {},
    corpus: {},
    scope: 'ACTUAL_ADMITTED',
    corpusPayloadDigest: hash,
    expectedOutcome: identity.inputs[name].expectedOutcome,
    observedOutcome: identity.inputs[name].expectedOutcome,
    inputBytes: 10,
    largestLineBytes: 9,
    outputBytes: 10,
    eventCount: 1,
    summaryBytes: 0,
    persistentStateVerified: true,
    transactionClosed: true,
    tempClosed: true,
    retainedSqlBytes: 5,
    retainedSqlStringChargeBytes: 10,
    samples: [
      {
        phase: 'startup',
        peakKiB: 1,
        memory: { rss: 1024, heapTotal: 10, heapUsed: 5, external: 0, arrayBuffers: 0 },
      },
    ],
    peakResidentBytes: 1024,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    outputProof:
      name !== 'd-cancel'
        ? null
        : {
            kind: 'CANCELLED_PREFIX',
            referenceSha256: hash,
            provenanceSha256: hash,
            inputSha256: hash,
            outputSha256: hash,
            outputBytes: 10,
            eventCount: 1,
            gateVerified: true,
            artifact: { path: 'synthetic.json', sha256: hash },
          },
  }));
  const report = {
    schemaVersion: 2,
    workspace: 'REFRESH_TRANSPORT',
    candidateSha256: hash,
    environment: {},
    corpus: {},
    observations,
    failures: [],
  };
  const binding = { identity, candidateSha256: hash, candidate: { reservationBytes: 2048 } };
  assert.deepEqual(runner.validateRefreshCiActualReport(report, binding), report);
  for (const change of [
    (row) => {
      row.scope = 'OFFLINE_CALIBRATION_ONLY';
    },
    (row) => {
      row.persistentStateVerified = false;
    },
    (row) => {
      row.repetition = 1;
    },
    (row) => {
      row.observedOutcome = 'RESOURCE_LIMIT_EXCEEDED';
    },
  ]) {
    const changed = structuredClone(report);
    change(changed.observations[0]);
    assert.throws(() => runner.validateRefreshCiActualReport(changed, binding));
  }
  assert.throws(() =>
    runner.validateRefreshCiActualReport(report, {
      ...binding,
      candidate: { reservationBytes: 1023 },
    }),
  );
});

for (const root of [
  'C:\\CodeAtlas-P05-D5',
  'C:\\CodeAtlas-P05-D5-R2',
  'C:\\CodeAtlas-P05-D5-R3',
  'C:\\CodeAtlas-P05-D5-R4',
]) {
  test(`CI commands refuse output into preserved layout before approval or build: ${root}`, async () => {
    for (const command of ['prepare', 'verify', 'collect']) {
      const args = command === 'prepare' ? [command, root] : [command, 'missing.zip', root];
      await assert.rejects(
        () => runner.runRefreshCiAt(args, process.cwd()),
        /overlaps frozen layout/i,
      );
    }
  });
}

test('prepare refuses an existing output before acquiring the dedicated root or running a build', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d5-prepare-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await assert.rejects(() => runner.runRefreshCiAt(['prepare', parent], parent), /exist/i);
  assert.deepEqual(await readdir(parent), []);
});

test('pack CLI refuses a foreign candidate geometry before opening any prepared source', async () => {
  await assert.rejects(
    () =>
      runner.runRefreshCi([
        'pack',
        path.resolve('foreign-candidate.json'),
        path.resolve('foreign-holdout.json'),
        path.resolve('foreign.zip'),
      ]),
    /candidate.*geometry/i,
  );
});

test('D feasibility refuses SQL charges beyond the caller input before calibration', () => {
  assert.equal(typeof memory.checkRefreshTransportInputFeasibility, 'function');
  const rows = refreshTransportCases.map((name) => ({
    name,
    retainedSqlBytes: 5,
    retainedSqlStringChargeBytes: 10,
  }));
  assert.deepEqual(memory.checkRefreshTransportInputFeasibility(1_000_000_000, 400_000_000, rows), {
    kind: 'REVIEWED_REFERENCE_DIAGNOSTIC_ONLY',
    callerBudgetBytes: 1_000_000_000,
    referenceReservationBytes: 400_000_000,
    maximumSqlChargeBytes: 10,
    maximumAccountedBytes: 400_000_010,
  });
  const overflow = structuredClone(rows);
  overflow[0].retainedSqlBytes = 400_000_000;
  overflow[0].retainedSqlStringChargeBytes = 800_000_000;
  assert.throws(() =>
    memory.checkRefreshTransportInputFeasibility(1_000_000_000, 400_000_000, overflow),
  );
  rows[0].retainedSqlStringChargeBytes = 0;
  assert.throws(() =>
    memory.checkRefreshTransportInputFeasibility(1_000_000_000, 400_000_000, rows),
  );
  assert.throws(() => memory.checkRefreshTransportInputFeasibility(1_000_000_000, 400_000_000, []));
});

test('offline qualification with no exact-build reference reports SQL-only feasibility without invented headroom', () => {
  const rows = refreshTransportCases.map((name) => ({
    name,
    retainedSqlBytes: 5,
    retainedSqlStringChargeBytes: 10,
  }));
  assert.deepEqual(memory.checkRefreshTransportInputFeasibility(100, null, rows), {
    kind: 'OFFLINE_SQL_ONLY_PENDING_CANDIDATE',
    callerBudgetBytes: 100,
    referenceReservationBytes: null,
    maximumSqlChargeBytes: 10,
    maximumAccountedBytes: null,
  });
  assert.throws(() => memory.checkRefreshTransportInputFeasibility(9, null, rows));
  rows[0].retainedSqlStringChargeBytes = 9;
  assert.throws(() => memory.checkRefreshTransportInputFeasibility(100, null, rows));
});

test('final candidate feasibility never accepts the offline unknown-reservation sentinel', () => {
  const rows = refreshTransportCases.flatMap((name) =>
    [0, 1, 2, 3, 4].map((repetition) => ({
      name,
      repetition,
      retainedSqlBytes: 5,
      retainedSqlStringChargeBytes: 10,
    })),
  );
  for (const reservation of [null, undefined, 0, -1, NaN, Infinity, 1.5])
    assert.throws(() => runner.checkRefreshCiCandidateBudget(1_000, reservation, rows));
});

test('provisional candidate feasibility retains the largest SQL charge from every calibration repetition', () => {
  assert.equal(typeof runner.checkRefreshCiCandidateBudget, 'function');
  const rows = refreshTransportCases.flatMap((name) =>
    Array.from({ length: 5 }, (_, repetition) => ({
      name,
      repetition,
      retainedSqlBytes: 5,
      retainedSqlStringChargeBytes: 10,
    })),
  );
  const diagnostic = runner.checkRefreshCiCandidateBudget(1_000_000_000, 900_000_000, rows);
  assert.equal(diagnostic.kind, 'UNAPPROVED_CANDIDATE_DIAGNOSTIC_ONLY');
  assert.equal(diagnostic.maximumAccountedBytes, 900_000_010);
  rows[4].retainedSqlBytes = 60_000_000;
  rows[4].retainedSqlStringChargeBytes = 120_000_000;
  assert.throws(() => runner.checkRefreshCiCandidateBudget(1_000_000_000, 900_000_000, rows));
});

test('public prepare resolves its real checkout before a test-local build checkpoint', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d5-root-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const output = path.join(parent, 'output');
  // Slow/external build only is intercepted inside this isolated child. Real source
  // discovery/environment checks run; no Native build or dedicated root is acquired.
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
     cp.spawnSync=()=>{throw new Error('BUILD_CHECKPOINT')}; syncBuiltinESMExports();
     const {runRefreshCi}=await import(${JSON.stringify(new URL('./native-refresh-ci.mjs', import.meta.url).href)});
     try {await runRefreshCi(['prepare',process.argv[1]]);process.exitCode=2;}
     catch(error){process.stdout.write(error.message);}`,
      output,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'BUILD_CHECKPOINT');
});

test('foreign environment refuses preparation before source discovery, build or fixed-root acquisition', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d5-env-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
     cp.spawnSync=()=>{throw new Error('UNEXPECTED_BUILD')}; syncBuiltinESMExports();
     Object.defineProperty(process,'version',{value:'foreign-node'});
     const {runRefreshCiAt}=await import(${JSON.stringify(new URL('./native-refresh-ci.mjs', import.meta.url).href)});
     try {await runRefreshCiAt(['prepare',process.argv[1]],process.argv[2]);process.exitCode=2;}
     catch(error){process.stdout.write(error.message);}`,
      path.join(parent, 'output'),
      path.join(parent, 'nonexistent-checkout'),
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reviewed.*environment/i);
  assert.deepEqual(await readdir(parent), ['output']);
});

test('settled attempt export retains complete original bytes and mapping without granting ownership', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-d5-export-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const source = path.join(parent, 'original');
  const destination = path.join(parent, 'exported');
  await mkdir(source);
  for (const [name, bytes] of [
    ['worker.stdout', '{}\n'],
    ['worker.stderr', 'failure diagnostic\n'],
    ['receipt.json', '{"originalPath":"C:\\\\original"}\n'],
    ['process.json', '{"status":1}\n'],
    ['prefix-proof.json', '{"original":true}\n'],
  ])
    await writeFile(path.join(source, name), bytes);
  const db = new DatabaseSync(path.join(source, 'result.sqlite'));
  db.exec("CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES ('old state')");
  db.close();
  assert.equal(typeof replay.copyRefreshReplayAttemptArtifacts, 'function');
  const record = await replay.copyRefreshReplayAttemptArtifacts(source, destination);
  assert.equal(record.sourceRoot, source);
  assert.deepEqual(
    record.files.map((entry) => entry.path),
    (await readdir(source)).sort(),
  );
  for (const entry of record.files) {
    const bytes = await readFile(path.join(source, entry.path));
    assert.deepEqual(await readFile(path.join(destination, entry.path)), bytes);
    assert.equal(entry.bytes, bytes.length);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.deepEqual(
    JSON.parse(await readFile(path.join(destination, 'export-manifest.json'), 'utf8')),
    record,
  );
  await assert.rejects(
    () => replay.copyRefreshReplayAttemptArtifacts(source, destination),
    /exist/i,
  );
  await assert.rejects(
    () => replay.exportRefreshTransportAttempt({ name: 'forged' }, path.join(parent, 'forged')),
    /original|owned/i,
  );
  assert.ok(!(await readdir(parent)).includes('forged'));
});
