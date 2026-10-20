import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PHASE05_CASE_POLICY } from '../packages/evaluation/dist/index.js';

let runner;
try {
  runner = await import('./evaluate-phase05.mjs');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  runner = {};
}
const fixtureDirectory = fileURLToPath(
  new URL('../fixtures/evaluation/phase05-code-intelligence/', import.meta.url),
);
const configuration = {
  configVersion: 1,
  source: { include: ['**/*.java'], exclude: [] },
  indexing: { nativeAnalyzer: { parseWorkers: 1 } },
  resourceBudget: { maxDurationMs: 10000, maxMemoryBytes: 16 * 1024 * 1024, maxEvents: 10000 },
  transportLimits: {
    maxStdinBytes: 1000000,
    maxLineBytes: 1000000,
    maxStdoutBytes: 10000000,
    maxEvents: 10000,
    maxStderrBytes: 1000000,
  },
};
// Node is only a readable executable identity in these missing-profile controls;
// required admission refuses before it can be spawned as a Native analyzer.
const controls = (outputDirectory) => ({
  fixtureDirectory,
  outputDirectory,
  nativeExecutablePath: process.execPath,
  configuration,
  repetitions: 1,
});

test('actual Phase05 runner preserves all required classes and raw public-operation refusal evidence', async (t) => {
  assert.equal(typeof runner.runPhase05Evaluation, 'function');
  const cleanupRoot = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-runner-'));
  t.after(() => rm(cleanupRoot, { recursive: true, force: true }));
  // Reproduce real Windows worktree-length roots, not only short temp paths.
  const root = path.join(cleanupRoot, 'x'.repeat(Math.max(1, 136 - cleanupRoot.length)));
  await mkdir(root);
  const result = await runner.runPhase05Evaluation(controls(path.join(root, 'run')));
  assert.equal(result.exitCode, 1);
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.kind, 'PHASE05_EVALUATION');
  assert.equal(report.overall, 'FAIL');
  assert.equal(report.requiredRuns.length, 31);
  assert.equal(report.observations.length, 31);
  const workers = report.observations.filter((row) => row.runKey.scenario === 'WORKER_CONSISTENCY');
  assert.deepEqual(
    workers.map((row) => row.status),
    ['FAILED', 'FAILED'],
    'original worker rows must be attempted or explicitly refused, not silently unimplemented',
  );
  assert.equal(workers[0].failure.code, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(workers[1].failure.code, 'WORKER_CONFIGURATION_UNAVAILABLE');
  assert.match(workers[0].artifactDigests.SOURCE_ONLY_SEED, /^[a-f0-9]{64}$/);
  assert.equal(
    workers[0].artifactDigests.SOURCE_ONLY_SEED,
    workers[1].artifactDigests.SOURCE_ONLY_SEED,
  );
  assert.match(workers[0].artifactDigests.PREREQUISITE_RECEIPT, /^[a-f0-9]{64}$/);
  assert.equal(workers[1].effectiveWorkers, null);
  assert.equal(workers[1].nativeOutcome, null);
  const diagnosticFixture = await Promise.all(
    ['expected/results.json', 'fixture.json', 'inputs/vectors.json'].map(async (relative) => ({
      path: relative,
      sha256: createHash('sha256')
        .update(
          await readFile(
            new URL(`../fixtures/evaluation/native-parse-observation/${relative}`, import.meta.url),
          ),
        )
        .digest('hex'),
    })),
  );
  const catalogue = JSON.parse(
    await readFile(path.join(fixtureDirectory, 'inputs/scenarios.json')),
  );
  assert.equal(
    report.identity.corpusDigest,
    createHash('sha256')
      .update(
        JSON.stringify({
          fixtures: catalogue.fixtures,
          policy: PHASE05_CASE_POLICY,
          requiredRuns: report.requiredRuns,
          diagnosticFixture,
        }),
      )
      .digest('hex'),
    'actual corpus identity must bind independent diagnostic Fixture bytes',
  );
  for (const [index, row] of report.observations.entries()) {
    if (!row.artifactDigests.PREREQUISITE_RECEIPT) continue;
    assert.equal(
      row.artifactDigests.receipt,
      row.artifactDigests.PREREQUISITE_RECEIPT,
      'the original failed public receipt must also bind the required report receipt slot',
    );
    const role = ['COLD', 'GOLDEN', 'WORKER_CONSISTENCY'].includes(row.runKey.scenario)
      ? 'REFERENCE'
      : 'BASELINE';
    assert.match(row.artifactDigests[`${role}_RESTORE_RECEIPT`] ?? '', /^[a-f0-9]{64}$/);
    const filename = `restore-${index + 1}-${row.runKey.repetition}-${role.toLowerCase()}.json`;
    const bytes = await readFile(path.join(root, 'run', filename));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      row.artifactDigests[`${role}_RESTORE_RECEIPT`],
    );
    const replay = JSON.parse(bytes);
    assert.deepEqual(replay.identity, report.identity);
    assert.deepEqual(replay.runKey, row.runKey);
    assert.equal(replay.scope, 'OWNED_CLOSED_FILE_REPLAY_ONLY');
    assert.equal(replay.trialReceiptSha256, row.artifactDigests.PREREQUISITE_RECEIPT);
    assert.equal(replay.restored.sha256, row.artifactDigests[`${role}_REPLAY_INPUT`]);
    assert.equal(replay.restored.sha256, row.artifactDigests[`${role}_RESTORED_IMAGE`]);
    // This refusal corpus never opens the database; archive must be identical too.
    assert.equal(row.artifactDigests[`${role}_RETAINED_FAILURE_IMAGE`], replay.restored.sha256);
    assert.deepEqual(row.closure, { transactionClosed: null, tempClosed: null, childClosed: null });
  }
  const javaCases = report.observations.filter(
    (row) =>
      row.runKey.scenario === 'TRANSITION' ||
      (row.runKey.scenario === 'GOLDEN' && row.runKey.fixtureId.startsWith('java-')),
  );
  assert.equal(javaCases.length, 23);
  for (const row of javaCases) {
    assert.equal(row.status, 'FAILED');
    assert.equal(row.failure.code, 'RESOURCE_LIMIT_EXCEEDED');
    assert.equal(row.facts, null);
    assert.ok(row.artifactDigests.PREREQUISITE_RECEIPT);
    assert.ok(row.artifactDigests.SOURCE_ONLY_SEED);
    if (row.runKey.scenario === 'GOLDEN')
      assert.match(row.artifactDigests.REGISTERED_JAVA_ORACLE ?? '', /^[a-f0-9]{64}$/);
    if (row.runKey.scenario === 'TRANSITION')
      assert.match(row.artifactDigests.ORIGINAL_TRANSITION_RECIPE ?? '', /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(report.missingRuns, []);
  const contracts = report.observations.filter((row) =>
    ['canonical-normalization', 'two-provider-same-call'].includes(row.runKey.fixtureId),
  );
  assert.equal(contracts.length, 2);
  for (const row of contracts) {
    const normalization = row.runKey.fixtureId === 'canonical-normalization';
    assert.equal(row.runKey.executionKind, 'RECORDED_PROVIDER_SQLITE');
    assert.equal(row.runKey.expectedOutcome, 'CONTRACT_MATCH');
    assert.equal(row.runKey.requestedWorkers, null);
    assert.equal(row.runKey.expectedEffectiveWorkers, null);
    assert.equal(row.status, 'PASSED');
    assert.equal(row.failure, null);
    assert.equal(row.facts, null);
    assert.equal(row.graphEqual, true);
    assert.equal(row.supportEqual, true);
    assert.equal(row.effectiveWorkers, null);
    assert.equal(row.nativeOutcome, null);
    assert.equal(row.workerUnavailableReason, 'NOT_APPLICABLE_RECORDED_PROVIDER');
    assert.equal(row.timings.total.value, null);
    assert.deepEqual(row.closure, { transactionClosed: true, tempClosed: true, childClosed: null });
    if (normalization)
      assert.equal(
        Object.values(row.componentChecks).every((value) => value === true),
        true,
      );
    else assert.equal(row.componentChecks.rejectedPatchRecovery, true);
    const position = report.observations.indexOf(row) + 1;
    const filename = `contract-${String(position).padStart(4, '0')}-1.json`;
    const bytes = await readFile(path.join(root, 'run', filename));
    assert.equal(
      row.artifactDigests.PURE_CONTRACT_RECEIPT,
      createHash('sha256').update(bytes).digest('hex'),
    );
    const receipt = JSON.parse(bytes);
    assert.equal(receipt.contract.fixtureId, row.runKey.fixtureId);
    assert.equal(receipt.contract.matches, true);
    assert.equal(receipt.contract.evidenceScope, 'PURE_PROVIDER_CONTRACT_ONLY');
    assert.deepEqual(receipt.runKey, row.runKey);
    assert.equal(receipt.sourceDigest, row.sourceDigest);
    assert.deepEqual(receipt.identity, report.identity);
    const sqliteBytes = await readFile(
      path.join(root, 'run', `sqlite-contract-${String(position).padStart(4, '0')}-1.json`),
    );
    assert.equal(
      row.artifactDigests.SQLITE_CONTRACT_RECEIPT,
      createHash('sha256').update(sqliteBytes).digest('hex'),
    );
    const sqliteReceipt = JSON.parse(sqliteBytes);
    assert.deepEqual(sqliteReceipt.identity, report.identity);
    assert.deepEqual(sqliteReceipt.runKey, row.runKey);
    assert.equal(sqliteReceipt.sourceDigest, row.sourceDigest);
    assert.equal(sqliteReceipt.contract.evidenceScope, 'RECORDED_PROVIDER_SQLITE_CONTRACT_ONLY');
    assert.equal(sqliteReceipt.contract.matches, true);
    if (!normalization) {
      assert.deepEqual(
        sqliteReceipt.contract.rejectedPatches.map((item) => item.kind),
        ['DANGLING_NODE_REMOVAL', 'STALE_BASE'],
      );
      for (const item of sqliteReceipt.contract.rejectedPatches) {
        assert.equal(item.beforeImageDigest, item.afterImageDigest);
        assert.deepEqual(item.closure, {
          transactionClosed: true,
          tempClosed: true,
          connectionClosed: true,
        });
      }
    }
    assert.deepEqual(sqliteReceipt.contract.closure, {
      transactionClosed: true,
      tempClosed: true,
      connectionClosed: true,
    });
    for (const phase of sqliteReceipt.contract.phases) {
      assert.equal(phase.graphEqual, true);
      assert.equal(phase.supportCandidatesEqual, true);
      assert.equal(phase.historyEqual, true);
      const file = path.join(
        root,
        'run',
        `contract-${String(position).padStart(4, '0')}-1`,
        `${phase.role}.sqlite`,
      );
      assert.equal(
        row.artifactDigests[`SQLITE_${phase.role.toUpperCase()}_IMAGE`],
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      );
    }
  }
  assert.deepEqual([...new Set(report.requiredRuns.map((key) => key.scenario))].sort(), [
    'COLD',
    'GOLDEN',
    'INCREMENTAL_1',
    'INCREMENTAL_5',
    'INCREMENTAL_50',
    'PROVIDER_MERGE',
    'TRANSITION',
    'WORKER_CONSISTENCY',
  ]);
  const performance = report.observations.filter(
    (row) => row.runKey.scenario === 'COLD' || row.runKey.scenario.startsWith('INCREMENTAL_'),
  );
  assert.equal(performance.length, 4);
  for (const row of performance) {
    assert.equal(row.status, 'FAILED');
    assert.equal(row.failure.code, 'RESOURCE_LIMIT_EXCEEDED');
    assert.equal(row.facts, null);
    assert.equal(row.timings.total.value, null); // reference/baseline is not a measured trial
    assert.equal(row.effectiveWorkers, null);
    assert.deepEqual(row.closure, { transactionClosed: null, tempClosed: null, childClosed: null });
    assert.ok(Object.keys(row.artifactDigests).includes('PREREQUISITE_RECEIPT'));
  }
  for (const scenario of ['COLD', 'INCREMENTAL_1', 'INCREMENTAL_5', 'INCREMENTAL_50']) {
    const role = scenario === 'COLD' ? 'reference' : 'baseline';
    const receipt = JSON.parse(
      await readFile(
        path.join(root, 'run', `${scenario}-1`, `${role}-receipt`, 'receipt.json'),
        'utf8',
      ),
    );
    assert.equal(receipt.outcome, 'FAILED');
    assert.equal(receipt.error.code, 'RESOURCE_LIMIT_EXCEEDED');
    assert.equal(receipt.error.effects.graphCommit, 'NOT_ATTEMPTED');
    assert.equal(report.telemetry[`NATIVE_INDEX/${scenario}/NATIVE_FAILURE_PATH`].sampleCount, 0);
    const directory = path.join(root, 'run', `${scenario}-1`);
    assert.deepEqual(
      await readFile(path.join(directory, 'source-seed.sqlite')),
      await readFile(path.join(directory, 'working.sqlite')),
    );
    const db = new DatabaseSync(path.join(directory, 'working.sqlite'), { readOnly: true });
    try {
      assert.equal(db.prepare('SELECT count(*) AS n FROM source_files').get().n, 50);
      for (const table of [
        'canonical_nodes',
        'canonical_edges',
        'provider_snapshots',
        'native_analysis_state',
      ])
        assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
      assert.equal(
        db.prepare('SELECT indexed_revision_id FROM repository_state').get().indexed_revision_id,
        null,
      );
    } finally {
      db.close();
    }
  }
  assert.ok(
    report.observations.some(
      (row) => row.runKey.scenario === 'WORKER_CONSISTENCY' && row.status === 'FAILED',
    ),
  );
  assert.equal(report.identity.nativeExecutableSha256.length, 64);
  const inventory = JSON.parse(
    await readFile(path.join(root, 'run', 'required-runs.json'), 'utf8'),
  );
  assert.deepEqual(inventory, report.requiredRuns);
  await assert.rejects(runner.runPhase05Evaluation(controls(path.join(root, 'run'))));
  assert.deepEqual(JSON.parse(await readFile(result.reportPath, 'utf8')), report);
});

for (const defect of [
  'extra',
  'repetitions',
  'relative',
  'native-missing',
  'configuration',
  'sentinel',
  'linked-parent',
]) {
  test(`Phase05 runner refuses ${defect} before acquiring output`, async (t) => {
    assert.equal(typeof runner.runPhase05Evaluation, 'function');
    const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-runner-control-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = controls(path.join(root, 'run'));
    if (defect === 'extra') input.skipAdmission = true;
    if (defect === 'repetitions') input.repetitions = 0;
    if (defect === 'relative') input.outputDirectory = 'relative-run';
    if (defect === 'native-missing') input.nativeExecutablePath = path.join(root, 'missing');
    if (defect === 'configuration')
      input.configuration = { ...configuration, implicitFullFallback: true };
    if (defect === 'sentinel') await writeFile(input.outputDirectory, 'retained sentinel');
    if (defect === 'linked-parent') {
      const real = path.join(root, 'real'),
        alias = path.join(root, 'alias');
      await mkdir(real);
      await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
      input.outputDirectory = path.join(alias, 'run');
    }
    await assert.rejects(runner.runPhase05Evaluation(input));
    if (defect === 'sentinel')
      assert.equal(await readFile(path.join(root, 'run'), 'utf8'), 'retained sentinel');
    else assert.equal((await readdir(root)).includes('run'), false);
  });
}

for (const arguments_ of [[], ['--unknown'], ['--repetitions', '1', '--repetitions', '2']]) {
  test(`Phase05 executable rejects invalid CLI controls ${JSON.stringify(arguments_)}`, () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./evaluate-phase05.mjs', import.meta.url)), ...arguments_],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Invalid Phase05 Evaluation controls/);
    assert.doesNotMatch(result.stderr, / at |Error:|node:internal/);
  });
}

test('Phase05 CLI classifies missing Native input as invalid control without an output artifact', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-runner-cli-control-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = path.join(root, 'config.json');
  await writeFile(config, JSON.stringify(configuration));
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./evaluate-phase05.mjs', import.meta.url)),
      '--fixture',
      fixtureDirectory,
      '--output',
      path.join(root, 'run'),
      '--native',
      path.join(root, 'absent'),
      '--config',
      config,
      '--repetitions',
      '1',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Invalid Phase05 Evaluation controls/);
  assert.deepEqual(await readdir(root), ['config.json']);
});

test('independent performance cases do not recursively inherit unrelated replay receipts', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-runner-dependency-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const control = path.join(root, 'control.json');
  await writeFile(control, JSON.stringify(controls(path.join(root, 'run'))));
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-test-module-mocks',
      fileURLToPath(new URL('./fixtures/phase05-runner-dependency.mjs', import.meta.url)),
      control,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    rawPublicRefusals: 28,
    unrelatedCaseDependency: false,
  });
});
