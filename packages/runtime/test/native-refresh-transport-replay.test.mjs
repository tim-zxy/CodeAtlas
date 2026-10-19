import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFile,
  link,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyPreparedNativeRefreshAnalysisV3 } from '../dist/native-refresh-workspace.js';
import {
  RepositoryCanonicalFactStore,
  RepositorySourceStateStore,
} from '../../storage/dist/index.js';

import { verifyRefreshReplayAsset } from './helpers/native-refresh-transport-replay.mjs';
import * as replay from './helpers/native-refresh-transport-replay.mjs';
import * as transportWorker from './helpers/native-refresh-transport-worker.mjs';
import * as sourceStateSql from '../../storage/dist/source-state/repository.js';
import { refreshTransportCases } from '../../../scripts/native-refresh-transport-memory.mjs';
import {
  preparedSourceRefresh,
  sourceTransitions,
  assertSourceRelations,
  observeRefreshBaselineRead,
  activationImage,
} from './helpers/native-refresh-source-fixture.mjs';
import { createNativeRefreshPreparation } from '../dist/native-refresh-preparation.js';
import {
  preparedSourceInputBoundary,
  preparedSharedOwnersBoundary,
  preparedCompleteCoverageBoundary,
} from './helpers/native-refresh-source-input-boundary.mjs';
import { preparedRetainedSitesBoundary } from './helpers/native-refresh-retained-sites-boundary.mjs';
import { preparedDenseRemoveBoundary } from './helpers/native-refresh-dense-remove-boundary.mjs';
import {
  prepareDenseUpsertBoundary,
  denseUpsertTransition,
} from './helpers/native-refresh-dense-upsert-boundary.mjs';
import {
  encodeNativeRefreshRequestV3,
  NATIVE_CLIENT_HARD_LIMITS,
} from '../../providers/dist/index.js';
async function verify(root, asset) {
  return verifyRefreshReplayAsset(root, asset);
}
const record = (name, bytes, kind = 'SOURCE') => ({
  path: name,
  kind,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});

// A bad prefix hash, fabricated cancel gate or v1/v2 field conflation must fail
// before a replay can become eligible. Expectations use literal wire bytes.
async function cancellationPrefixModule() {
  const value = await import('./helpers/native-refresh-cancel-prefix.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof value.validateRefreshOutputContract, 'function');
  assert.equal(typeof value.verifyRefreshCancelledPrefix, 'function');
  return value;
}
const cancelledInput = () => ({
  corpusPayloadDigest: 'a'.repeat(64),
  expectedOutcome: 'CANCELLED',
  inputBytes: 13185,
  largestLineBytes: 3602,
  summaryBytes: 9515,
  outputBytes: null,
  eventCount: null,
});
const cancelledContract = () => ({
  kind: 'CANCELLED_PREFIX',
  referencePath: 'reference.jsonl',
  provenancePath: 'provenance.json',
});
test('D5 cancellation prefix contract is exclusive to cancelled v2 input', async () => {
  const { validateRefreshOutputContract } = await cancellationPrefixModule();
  validateRefreshOutputContract('d-cancel', cancelledInput(), cancelledContract());
  for (const change of [
    (input, contract) => {
      input.outputBytes = 753;
    },
    (input, contract) => {
      input.eventCount = 2;
    },
    (input, contract) => {
      input.expectedOutcome = 'SUCCEEDED';
    },
    (input, contract) => {
      contract.referencePath = '../reference.jsonl';
    },
    (input, contract) => {
      contract.extra = true;
    },
    (input, contract) => {
      input.inputBytes = -1;
    },
  ]) {
    const input = cancelledInput(),
      contract = cancelledContract();
    change(input, contract);
    assert.throws(() => validateRefreshOutputContract('d-cancel', input, contract));
  }
  assert.throws(() =>
    validateRefreshOutputContract('d-empty', cancelledInput(), cancelledContract()),
  );
  const exact = {
    ...cancelledInput(),
    expectedOutcome: 'SUCCEEDED',
    outputBytes: 20,
    eventCount: 2,
  };
  validateRefreshOutputContract('d-empty', exact, { kind: 'EXACT' });
  assert.throws(() =>
    validateRefreshOutputContract('d-empty', { ...exact, outputBytes: null }, { kind: 'EXACT' }),
  );
  assert.throws(() => validateRefreshOutputContract('d-cancel', exact, { kind: 'EXACT' }));
});
async function literalCancelledPrefix(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'codeatlas-prefix-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('{"a":1}\n{"b":"雪"}\n');
  assert.equal(bytes.length, 20);
  await writeFile(path.join(root, 'reference.jsonl'), bytes, { flag: 'wx' });
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  return {
    root,
    bytes,
    asset: record('reference.jsonl', bytes, 'ORACLE'),
    evidence: (length, events) => ({
      requestSha256: 'b'.repeat(64),
      wireEvidence: {
        inputSha256: 'b'.repeat(64),
        outputSha256: sha(bytes.subarray(0, length)),
        outputBytes: length,
        eventCount: events,
        cancelGate: {
          kind: 'FIRST_BLOCKED_STAGE_SINK',
          accepted: 1,
          maximumInFlight: 1,
          blockedVerified: true,
          abortCalls: 1,
        },
      },
    }),
  };
}
test('D5 cancellation prefix accepts exact partial, mid-UTF8 and full buffered receive', async (t) => {
  const { verifyRefreshCancelledPrefix } = await cancellationPrefixModule();
  const { root, asset, evidence } = await literalCancelledPrefix(t);
  for (const [length, events] of [
    [8, 1],
    [10, 1],
    [15, 1],
    [20, 2],
  ]) {
    const proof = await verifyRefreshCancelledPrefix(root, asset, evidence(length, events));
    assert.deepEqual(proof, {
      kind: 'CANCELLED_PREFIX',
      referenceSha256: asset.sha256,
      inputSha256: 'b'.repeat(64),
      outputSha256: evidence(length, events).wireEvidence.outputSha256,
      outputBytes: length,
      eventCount: events,
      gateVerified: true,
    });
    assert.equal(Object.isFrozen(proof), true);
  }
});
test('D5 cancellation prefix rejects fabricated wire and gate scalars', async (t) => {
  const { verifyRefreshCancelledPrefix } = await cancellationPrefixModule();
  const { root, asset, evidence } = await literalCancelledPrefix(t);
  for (const change of [
    (v) => {
      v.wireEvidence.outputSha256 = '0'.repeat(64);
    },
    (v) => {
      v.wireEvidence.inputSha256 = 'c'.repeat(64);
    },
    (v) => {
      v.wireEvidence.eventCount = 2;
    },
    (v) => {
      v.wireEvidence.outputBytes = 0;
    },
    (v) => {
      v.wireEvidence.outputBytes = 21;
    },
    (v) => {
      v.wireEvidence.outputBytes = Number.MAX_SAFE_INTEGER + 1;
    },
    (v) => {
      v.wireEvidence.cancelGate = null;
    },
    (v) => {
      v.wireEvidence.cancelGate.accepted = 2;
    },
    (v) => {
      v.wireEvidence.cancelGate.maximumInFlight = 2;
    },
    (v) => {
      v.wireEvidence.cancelGate.blockedVerified = false;
    },
    (v) => {
      v.wireEvidence.cancelGate.abortCalls = 2;
    },
    (v) => {
      v.wireEvidence.cancelGate.unverified = true;
    },
  ]) {
    const value = evidence(8, 1);
    change(value);
    await assert.rejects(() => verifyRefreshCancelledPrefix(root, asset, value));
  }
});
test('D5 cancellation prefix rejects changed reference suffix after valid prefix', async (t) => {
  const { verifyRefreshCancelledPrefix } = await cancellationPrefixModule();
  const { root, bytes, asset, evidence } = await literalCancelledPrefix(t);
  const changed = Buffer.from(bytes);
  changed[10] = 99;
  await writeFile(path.join(root, 'reference.jsonl'), changed);
  await assert.rejects(() => verifyRefreshCancelledPrefix(root, asset, evidence(8, 1)));
});

for (const explicitD of [false, true])
  test(`D5 cancellation prefix real Native complete references and original cancellation${explicitD ? ' D-context' : ''}`, async (t) => {
    const reference = await import('./helpers/native-refresh-cancel-reference.mjs').catch(
      (error) => {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        return {};
      },
    );
    assert.equal(typeof reference.prepareRefreshCancelReference, 'function');
    const dContext = explicitD ? await selectedDContext(t) : undefined;
    const { f, value } = await sharedReplayControls(t, undefined, dContext);
    value.schemaVersion = 2;
    value.name = 'd-cancel';
    value.workload.fault = 'd-cancel';
    value.outputContract = cancelledContract();
    value.inputContract = cancelledInput();
    const directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'codeatlas-cancel-reference-')),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    await copyFile(f.databasePath, path.join(directory, 'seed.sqlite'));
    const prepared = await reference.prepareRefreshCancelReference(value, directory, '', dContext);
    assert.equal(prepared.provenance.trials.length, 2);
    assert.equal(prepared.provenance.kind, 'REAL_NATIVE_COMPLETE_RESPONSE');
    assert.equal(typeof reference.qualifyRefreshCancelReference, 'function');
    value.outputContract.referencePath = prepared.referenceAsset.path;
    value.outputContract.provenancePath = prepared.provenanceAsset.path;
    const qualification = await reference.qualifyRefreshCancelReference(
      directory,
      {
        outputContract: value.outputContract,
        assets: prepared.assets,
        seedPath: 'reference-seed.sqlite',
        sourceHashes: prepared.provenance.sourceAssets,
      },
      { invocationPath: value.workload.invocationPath, optionsPath: value.workload.optionsPath },
    );
    assert.equal(qualification.requestSha256, prepared.provenance.requestSha256);
    const cancelled = await transportWorker.executeRefreshTransportReplayCase(value, { dContext });
    assert.equal(cancelled.observedOutcome, 'CANCELLED');
    assert.equal(cancelled.operationThrew, true);
    assert.equal(cancelled.mainApplyCalls, 0);
    assert.equal(cancelled.competitorCommits, 0);
    assert.equal(cancelled.transactionClosed, true);
    assert.equal(cancelled.tempClosed, true);
    assert.match(
      cancelled.operationFailureText,
      /^NativeClientError: Native request was cancelled/,
    );
    const { verifyRefreshCancelledPrefix } = await cancellationPrefixModule();
    const proof = await verifyRefreshCancelledPrefix(directory, prepared.referenceAsset, {
      requestSha256: prepared.provenance.requestSha256,
      wireEvidence: cancelled.wireEvidence,
    });
    assert.equal(proof.outputBytes, cancelled.physical.outputBytes);
    assert.equal(proof.eventCount, cancelled.physical.eventCount);
    await copyFile(f.databasePath, path.join(directory, 'cancelled-result.sqlite'));
    assert.equal(
      await replay.verifyRefreshReplayPreservedSourceActivation(
        directory,
        'cancelled-result.sqlite',
        record('seed.sqlite', await readFile(path.join(directory, 'seed.sqlite')), 'SQLITE'),
      ),
      true,
    );
  });

for (const mode of ['offline', 'actual'])
  test(`D5 replay worker fresh measurement ${mode}`, async (t) => {
    const module = await import('./helpers/native-refresh-transport-replay-worker.mjs').catch(
      (error) => {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        return {};
      },
    );
    assert.equal(typeof module.runRefreshTransportReplayWorker, 'function');
    const { value } = await sharedReplayControls(t);
    value.coverage = originalLifetimeRequirements(value.name);
    const receipt = await module.runRefreshTransportReplayWorker(mode, value, 0, {
      caseDigest: 'a'.repeat(64),
      corpus: { revision: 'p05-native-refresh-transport-memory-v1', digest: 'b'.repeat(64) },
    });
    const result = { receipt, metadata: module.refreshReplayWorkerMetadata(receipt) };
    assert.equal(result.receipt.mode, mode);
    assert.equal(result.receipt.samples[0].phase, 'startup');
    assert.equal(result.receipt.samples.at(-1).phase, 'finished');
    assert.equal(
      result.receipt.peakResidentBytes,
      Math.max(...result.receipt.samples.map((sample) => sample.peakKiB)) * 1024,
    );
    assert.equal(result.receipt.admitted, false);
    assert.equal(result.receipt.transactionClosed, true);
    assert.equal(result.receipt.tempClosed, true);
    if (mode === 'offline') {
      assert.equal(result.receipt.observedOutcome, 'SUCCEEDED');
      assert.equal(result.receipt.operationThrew, false);
      assert.equal(result.receipt.sqlLifetime.coverageComplete, true);
      assert.equal(
        result.receipt.sqlLifetime.retainedSqlStringChargeBytes,
        2 * result.receipt.sqlLifetime.retainedSqlBytes,
      );
      assert.equal(result.metadata.mainApplyCalls, 1);
      assert.equal(
        result.metadata.snapshotMetadata.entries[0].snapshotId,
        'snapshot-source-refresh',
      );
    } else {
      assert.equal(result.receipt.operationThrew, true);
      assert.match(result.receipt.operationFailureText, /reviewed|profile|environment/i);
      assert.equal(result.receipt.sqlLifetime.coverageComplete, false);
      assert.equal(result.metadata.mainApplyCalls, null);
    }
    assert.equal(fixtureStateCount(value.databasePath), mode === 'offline' ? 2 : 1);
  });

function fixtureStateCount(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n;
  } finally {
    db.close();
  }
}

test('D5 replay worker parent refuses an unowned case before spawning', async () => {
  assert.equal(typeof replay.runRefreshTransportMeasuredReplay, 'function');
  await assert.rejects(
    () => replay.runRefreshTransportMeasuredReplay({}, 'offline', 0),
    /ownership|owned/i,
  );
});

test('D5 replay worker retains cleanup failure separately from the original successful operation', async (t) => {
  const module = await import('./helpers/native-refresh-transport-replay-worker.mjs');
  const { value } = await sharedReplayControls(t);
  value.coverage = originalLifetimeRequirements(value.name);
  const close = DatabaseSync.prototype.close;
  t.mock.method(DatabaseSync.prototype, 'close', function () {
    close.call(this);
    throw 0;
  });
  const receipt = await module.runRefreshTransportReplayWorker('offline', value, 0, {
    caseDigest: 'a'.repeat(64),
    corpus: { revision: 'p05-native-refresh-transport-memory-v1', digest: 'b'.repeat(64) },
  });
  t.mock.restoreAll();
  assert.equal(receipt.observedOutcome, 'SUCCEEDED');
  assert.equal(receipt.operationThrew, false);
  assert.equal(receipt.captureFailed, true);
  assert.equal(module.refreshReplayWorkerMetadata(receipt).cleanupFailureText, '0');
});

async function selectedDContext(t) {
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'codeatlas-d-child-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const selected = path.join(temporary, 'selected-native.exe');
  await copyFile(
    fileURLToPath(
      new URL(
        `../../../target/debug/codeatlas-native-analyzer${process.platform === 'win32' ? '.exe' : ''}`,
        import.meta.url,
      ),
    ),
    selected,
  );
  return {
    memoryBudgetBytes: 1_000_000_000,
    executablePath: selected,
    allowedEnvironment: {
      ...Object.fromEntries(
        ['SYSTEMROOT', 'WINDIR']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
      TEMP: temporary,
      TMP: temporary,
    },
  };
}

for (const scenario of ['valid', 'changed_capsule', 'explicit_d_context'])
  test(`D5 replay worker fresh CLI ${scenario}`, async (t) => {
    const dContext = scenario === 'explicit_d_context' ? await selectedDContext(t) : undefined;
    const { value } = await sharedReplayControls(t, undefined, dContext);
    value.coverage = originalLifetimeRequirements(value.name);
    const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-replay-worker-cli-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const directory = path.join(root, 'cases', value.name);
    await mkdir(directory, { recursive: true });
    const output = path.join(root, 'output');
    await mkdir(output);
    const { corpusPayloadDigest, ...inputContract } = value.inputContract;
    for (const name of ['invocation', 'options'])
      await copyFile(value.workload[name + 'Path'], path.join(directory, name + '.json'));
    const capsule = {
      ...value,
      inputContract,
      workload: {
        ...value.workload,
        invocationPath: `cases/${value.name}/invocation.json`,
        optionsPath: `cases/${value.name}/options.json`,
      },
    };
    const bytes = replay.encodeRefreshReplayJson(capsule);
    const capsulePath = path.join(directory, 'capsule.json');
    await writeFile(
      capsulePath,
      scenario === 'changed_capsule' ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes,
    );
    const child = spawnSync(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        fileURLToPath(
          new URL('./helpers/native-refresh-transport-replay-worker.mjs', import.meta.url),
        ),
        'offline',
        capsulePath,
        createHash('sha256').update(bytes).digest('hex'),
        'a'.repeat(64),
        'b'.repeat(64),
        '0',
        ...(dContext === undefined ? [] : [JSON.stringify(dContext)]),
      ],
      {
        cwd: output,
        encoding: 'utf8',
        timeout: 60_000,
        ...(dContext === undefined
          ? {}
          : { env: { ...process.env, ...dContext.allowedEnvironment } }),
      },
    );
    if (scenario === 'changed_capsule') {
      assert.notEqual(child.status, 0);
      assert.equal(child.stdout, '');
      assert.match(child.stderr, /capsule hash changed/);
      assert.equal(fixtureStateCount(value.databasePath), 1);
    } else {
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stderr, '');
      const envelope = replay.decodeRefreshReplayJson(Buffer.from(child.stdout));
      assert.equal(envelope.pid, child.pid);
      assert.notEqual(envelope.pid, process.pid);
      assert.equal(envelope.receipt.observedOutcome, 'SUCCEEDED');
      assert.equal(envelope.receipt.sqlLifetime.coverageComplete, true);
      const sidecarBytes = await readFile(envelope.sidecar.path);
      assert.equal(
        createHash('sha256').update(sidecarBytes).digest('hex'),
        envelope.sidecar.sha256,
      );
      assert.equal(replay.decodeRefreshReplayJson(sidecarBytes).mainApplyCalls, 1);
    }
  });

for (const scenario of [
  'single',
  'independent_equal',
  'replace_coexist',
  'failed_prefix',
  'missing_event',
])
  test(`D5 source-only competitor census ${scenario}`, async (t) => {
    assert.equal(typeof sourceStateSql.withNativeSourceStateReadLifetime, 'function');
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((row) => row.id === 'modify-call-target'),
    );
    const repositoryId = f.targetRevision.repositoryId;
    // Independent SQLite UTF-8 sums of the literal selected columns, not the
    // observer's calculated values or a serialization of parsed Source IR.
    const revisionBytes = f.db
      .prepare(
        `SELECT sum(
      length(CAST(id AS BLOB))+length(CAST(repository_id AS BLOB))+length(CAST(kind AS BLOB))+
      length(CAST(content_fingerprint AS BLOB))+coalesce(length(CAST(base_revision_id AS BLOB)),0)+
      coalesce(length(CAST(commit_identity AS BLOB)),0)) AS n FROM revisions WHERE kind='WORKTREE'`,
      )
      .get().n;
    const fileBytes = f.db
      .prepare(
        `SELECT coalesce(sum(
      length(CAST(id AS BLOB))+length(CAST(repository_id AS BLOB))+length(CAST(revision_id AS BLOB))+
      length(CAST(path AS BLOB))+length(CAST(content_fingerprint AS BLOB))+length(CAST(role AS BLOB))+
      length(CAST(provenance AS BLOB))+length(CAST(content_kind AS BLOB))+
      coalesce(length(CAST(language_hint AS BLOB)),0)+length(CAST(sensitivity AS BLOB))),0) AS n FROM source_files`,
      )
      .get().n;
    const retained = revisionBytes + fileBytes;
    const store = new RepositorySourceStateStore(f.db);
    const cached = scenario === 'missing_event' ? store.load(repositoryId) : null;
    if (cached) t.mock.method(store, 'load', () => cached);
    if (scenario === 'failed_prefix') {
      const prepare = f.db.prepare;
      t.mock.method(f.db, 'prepare', function (sql, ...args) {
        const statement = prepare.call(this, sql, ...args);
        if (sql === 'SELECT * FROM source_files WHERE revision_id = ? ORDER BY path')
          statement.all = () => {
            throw 0;
          };
        return statement;
      });
    }
    const capture = await transportWorker.captureRefreshSourceLifetime(
      () =>
        sourceStateSql.withNativeSourceStateReadLifetime(() => {
          const current = store.load(repositoryId);
          if (scenario === 'independent_equal') assert.deepEqual(store.load(repositoryId), current);
          if (scenario === 'replace_coexist') store.replace(current, current);
        }),
      [{ family: 'BASELINE_READ', role: 'MAIN', disposition: 'OBSERVED' }],
    );
    assert.equal(capture.captureFailed, false, String(capture.captureFailure));
    assert.equal(capture.threw, scenario === 'failed_prefix');
    if (capture.threw) assert.equal(capture.error.code, 'SOURCE_STATE_INVALID');
    assert.equal(capture.evidence.coverageComplete, scenario !== 'missing_event');
    const expected =
      scenario === 'missing_event'
        ? null
        : scenario === 'failed_prefix'
          ? Math.max(2 * Buffer.byteLength(repositoryId), revisionBytes)
          : ['independent_equal', 'replace_coexist'].includes(scenario)
            ? 2 * retained
            : Math.max(2 * Buffer.byteLength(repositoryId), retained);
    assert.equal(capture.evidence.retainedSqlBytes, expected);
    assert.equal(
      capture.evidence.retainedSqlStringChargeBytes,
      expected === null ? null : 2 * expected,
    );
  });

// These functional controls are not a frozen Manifest or calibration inputs.
// The shared executor must acquire its baseline from the reopened database and
// report real effects, rather than trusting cached preparation or declared counts.
function originalLifetimeRequirements(name) {
  const main = {
    'd-empty': 'OONNOO',
    'd-zero-fact': 'OONNOO',
    'd-dependent-edge': 'OOOOOO',
    'd-delete': 'OOOOOO',
    'd-slow-sink': 'OOOOOO',
    'd-reopen': 'OOOOOO',
    'd-cancel': 'OOXXXX',
    'd-partial': 'OONXXX',
    'd-corrupt': 'OOXXXX',
    'd-late-exit': 'OOXXXX',
    'd-source-race': 'OOOONX',
    'd-token-race': 'OONNOX',
    'd-rollback': 'OOOOOO',
    'd-sql-preflight': 'NXXXXX',
    'd-preparation-input': 'OONNOO',
    'd-slow-stdin': 'OOXXXX',
    'd-shared-owners': 'OONNOO',
    'd-complete-coverage': 'OOOOOO',
    'd-overlay-retention': 'OOOOOO',
    'd-retained-sites': 'OONNOO',
    'd-dense-remove': 'OOOOOO',
    'd-dense-upsert': 'OOOOOO',
  }[name];
  assert.ok(main, 'Original lifetime Fixture must explicitly declare every case');
  const families = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
  const dispositions = { O: 'OBSERVED', N: 'PROVEN_NO_TEXT', X: 'PROVEN_NOT_REACHED' };
  const rows = (role, pattern) =>
    families.map((family, index) => ({ family, role, disposition: dispositions[pattern[index]] }));
  return [
    ...rows('MAIN', main),
    ...(name === 'd-token-race' ? rows('COMPETITOR', 'OONNOO') : []),
    ...(name === 'd-source-race'
      ? [{ family: 'BASELINE_READ', role: 'COMPETITOR', disposition: 'OBSERVED' }]
      : []),
    ...(name === 'd-reopen'
      ? [
          { family: 'BASELINE_READ', role: 'RETRY', disposition: 'OBSERVED' },
          { family: 'PREPARATION', role: 'RETRY', disposition: 'OBSERVED' },
          { family: 'APPLY', role: 'RETRY', disposition: 'PROVEN_NOT_REACHED' },
        ]
      : []),
  ];
}

const sharedReplayChild = `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { DatabaseSync } from 'node:sqlite';
  import { RepositorySourceStateStore } from './packages/storage/dist/index.js';
  import { executeRefreshTransportReplayCase, captureRefreshSourceLifetime } from './packages/runtime/test/helpers/native-refresh-transport-worker.mjs';
  const workloadCase = JSON.parse(readFileSync(0, 'utf8'));
  if (workloadCase.name === 'd-dependent-edge') RepositorySourceStateStore.prototype.load = () => {
    assert.fail('Reuse D1 owned target inventory; do not acquire a second unaccounted SQL copy');
  };
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql, ...args) {
    assert.ok(!/^SELECT \\* FROM (canonical_nodes|canonical_edges|evidence|provider_snapshots)$/.test(sql),
      'Whole-state oracle reads must remain outside the fresh executor');
    if (workloadCase.name === 'd-sql-preflight' && /FROM\\s+native_analysis_(state|file)\\b/i.test(sql))
      assert.match(sql, /(sum|count|length)\\s*\\(/i, 'Refusal must precede Native TEXT selection');
    return prepare.call(this, sql, ...args);
  };
  if (process.argv[1] === 'incoherent-clock') {
    const now = Date.now;
    Date.now = () => now() + 60_000;
  }
  const capture = await captureRefreshSourceLifetime(() => executeRefreshTransportReplayCase(workloadCase), workloadCase.coverage);
  if (capture.threw) throw capture.error;
  process.stdout.write(JSON.stringify({pid:process.pid, receipt:capture.value, sqlLifetime:capture.evidence, captureFailed:capture.captureFailed}));
`;

async function sharedReplayControls(t, transitionId = 'modify-call-target', dContext) {
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === transitionId),
    1,
    undefined,
    undefined,
    dContext,
  );
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-shared-controls-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const {
    baseRevisionId,
    baseRevisionFingerprint,
    baselineState,
    changes,
    targetSourceFiles,
    ...payload
  } = f.prepared.request.payload;
  const invocation = {
    requestId: f.prepared.request.requestId,
    descriptor: f.prepared.descriptor,
    trustedContext: f.prepared.trustedContext,
    payload,
  };
  const invocationPath = path.join(directory, 'invocation.json');
  const optionsPath = path.join(directory, 'options.json');
  await writeFile(invocationPath, replay.encodeRefreshReplayJson(invocation));
  await writeFile(optionsPath, replay.encodeRefreshReplayJson(f.options));
  const value = {
    name: 'd-slow-sink',
    workspacePath: payload.repository.rootPath,
    databasePath: f.databasePath,
    coverage: [],
    inputContract: {
      corpusPayloadDigest: '0'.repeat(64),
      expectedOutcome: 'SUCCEEDED',
      inputBytes: 0,
      largestLineBytes: 0,
      outputBytes: 0,
      eventCount: 0,
      summaryBytes: 0,
    },
    workload: { invocationPath, optionsPath, fault: 'd-slow-sink' },
  };
  f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  f.db.close();
  return { f, value, invocation };
}

for (const [name, transitionId, dispositions, additional] of [
  [
    'd-empty',
    'empty-file-noop',
    ['OBSERVED', 'OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NO_TEXT', 'OBSERVED', 'OBSERVED'],
    [],
  ],
  [
    'd-zero-fact',
    'zero-files-noop',
    ['OBSERVED', 'OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NO_TEXT', 'OBSERVED', 'OBSERVED'],
    [],
  ],
  [
    'd-dependent-edge',
    'add-method-unknown-to-resolved',
    ['OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED'],
    [],
  ],
  [
    'd-source-race',
    'modify-call-target',
    ['OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NOT_REACHED'],
    [{ family: 'BASELINE_READ', role: 'COMPETITOR', disposition: 'OBSERVED' }],
  ],
  [
    'd-token-race',
    'empty-file-noop',
    ['OBSERVED', 'OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NO_TEXT', 'OBSERVED', 'PROVEN_NOT_REACHED'],
    [
      ...['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map(
        (family) => ({
          family,
          role: 'COMPETITOR',
          disposition: ['COMPLETION', 'NORMALIZE'].includes(family) ? 'PROVEN_NO_TEXT' : 'OBSERVED',
        }),
      ),
    ],
  ],
  [
    'd-reopen',
    'modify-call-target',
    ['OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED'],
    [
      { family: 'BASELINE_READ', role: 'RETRY', disposition: 'OBSERVED' },
      { family: 'PREPARATION', role: 'RETRY', disposition: 'OBSERVED' },
      { family: 'APPLY', role: 'RETRY', disposition: 'PROVEN_NOT_REACHED' },
    ],
  ],
  [
    'd-cancel',
    'modify-call-target',
    [
      'OBSERVED',
      'OBSERVED',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
    ],
    [],
  ],
  [
    'd-sql-preflight',
    'modify-call-target',
    [
      'PROVEN_NO_TEXT',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
      'PROVEN_NOT_REACHED',
    ],
    [],
  ],
])
  test(`D5 lifetime fresh shared core proves its original required families: ${name}`, async (t) => {
    const { f, value } = await sharedReplayControls(t, transitionId);
    value.name = name;
    value.inputContract.expectedOutcome = transportWorker.refreshTransportRecipes[name][1];
    value.workload.fault =
      value.inputContract.expectedOutcome !== 'SUCCEEDED' || name === 'd-reopen' ? name : null;
    if (name === 'd-sql-preflight') {
      const db = new DatabaseSync(value.databasePath);
      try {
        db.prepare(
          "UPDATE native_analysis_file SET summary_json=json_quote(printf('%.*c',?,'x')) WHERE source_file_id=(SELECT source_file_id FROM native_analysis_file ORDER BY source_path LIMIT 1)",
        ).run(f.prepared.limits.maxSerializedBytes - 1);
      } finally {
        db.close();
      }
    }
    const requirements = [
      ...['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map(
        (family, index) => ({
          family,
          role: 'MAIN',
          disposition: dispositions[index],
        }),
      ),
      ...additional,
    ];
    const capture = await transportWorker.captureRefreshSourceLifetime(
      () => transportWorker.executeRefreshTransportReplayCase(value),
      requirements,
    );
    assert.equal(capture.threw, false, String(capture.error));
    assert.equal(capture.value.observedOutcome, value.inputContract.expectedOutcome);
    assert.equal(capture.captureFailed, false, String(capture.captureFailure));
    assert.equal(capture.evidence.coverageComplete, true, JSON.stringify(capture.evidence));
    assert.deepEqual(
      capture.evidence.coverage.map(({ family, role, disposition }) => ({
        family,
        role,
        disposition,
      })),
      requirements,
    );
    assert.equal(
      capture.evidence.retainedSqlStringChargeBytes,
      2 * capture.evidence.retainedSqlBytes,
    );
  });

test('D5 replay shared executor settles each existing SQL preparation owner only once', async (t) => {
  const { value } = await sharedReplayControls(t);
  const capture = await transportWorker.captureRefreshSourceLifetime(
    () => transportWorker.executeRefreshTransportReplayCase(value),
    ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map((family) => ({
      family,
      role: 'MAIN',
      disposition: 'OBSERVED',
    })),
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.value.observedOutcome, 'SUCCEEDED');
  assert.equal(capture.captureFailed, false, String(capture.captureFailure));
  assert.deepEqual(capture.evidence.reasons, []);
  // This checks existing owner settlement only, not the full source-field census
  // or whole22 eligibility required by Task2/Task4.
});

test('D5 replay shared executor preserves the operation when snapshot capture fails', async (t) => {
  const { f, value } = await sharedReplayControls(t);
  const child = spawnSync(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      '--input-type=module',
      '-e',
      sharedReplayChild,
      'incoherent-clock',
    ],
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      encoding: 'utf8',
      input: JSON.stringify(value),
      timeout: 60_000,
    },
  );
  assert.equal(child.status, 0, child.stderr + child.stdout);
  const { receipt } = JSON.parse(child.stdout);
  assert.equal(receipt.observedOutcome, 'SUCCEEDED');
  assert.equal(receipt.operationThrew, false);
  assert.equal(receipt.operationFailureText, null);
  assert.equal(receipt.mainApplyCalls, 1);
  assert.equal(receipt.transactionClosed, true);
  assert.equal(receipt.tempClosed, true);
  assert.equal(
    receipt.snapshotMetadata,
    null,
    'Incomplete capture is unavailable, never fabricated valid metadata',
  );
  const db = new DatabaseSync(f.databasePath);
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
  } finally {
    db.close();
  }
});

for (const defect of [
  'cached-baseline',
  'arbitrary-spawn',
  'root-drift',
  'unknown-case',
  'noncanonical-control',
])
  test(`D5 replay shared executor refuses ${defect} without changing the closed seed`, async (t) => {
    const { f, value, invocation } = await sharedReplayControls(t);
    const seed = await readFile(f.databasePath);
    if (defect === 'cached-baseline') {
      invocation.payload.baselineState = {};
      await writeFile(value.workload.invocationPath, replay.encodeRefreshReplayJson(invocation));
    } else if (defect === 'arbitrary-spawn') {
      await writeFile(
        value.workload.optionsPath,
        replay.encodeRefreshReplayJson({ ...f.options, arguments: ['--other'] }),
      );
    } else if (defect === 'root-drift') {
      invocation.payload.repository = {
        ...invocation.payload.repository,
        rootPath: invocation.payload.repository.rootPath + '-other',
      };
      await writeFile(value.workload.invocationPath, replay.encodeRefreshReplayJson(invocation));
    } else if (defect === 'unknown-case') value.name = 'foreign-case';
    else await writeFile(value.workload.invocationPath, JSON.stringify(invocation));
    await assert.rejects(transportWorker.executeRefreshTransportReplayCase(value));
    assert.deepEqual(await readFile(f.databasePath), seed);
  });

for (const [name, transitionId, outcome, mainCalls, competitorCommits] of [
  ['d-empty', 'empty-file-noop', 'SUCCEEDED', 1, 0],
  ['d-zero-fact', 'zero-files-noop', 'SUCCEEDED', 1, 0],
  ['d-dependent-edge', 'add-method-unknown-to-resolved', 'SUCCEEDED', 1, 0],
  ['d-delete', 'shared-last-owner-deletion-zero-target', 'SUCCEEDED', 1, 0],
  ['d-slow-sink', 'modify-call-target', 'SUCCEEDED', 1, 0],
  ['d-reopen', 'modify-call-target', 'SUCCEEDED', 1, 0],
  ['d-cancel', 'modify-call-target', 'CANCELLED', 0, 0],
  ['d-partial', 'empty-file-noop', 'WORKER_EXCEPTION', 0, 0],
  ['d-corrupt', 'empty-file-noop', 'CHECKSUM_MISMATCH', 0, 0],
  ['d-late-exit', 'empty-file-noop', 'PROCESS_FAILED', 0, 0],
  ['d-source-race', 'modify-call-target', 'WORKER_EXCEPTION', 0, 1],
  ['d-token-race', 'empty-file-noop', 'WORKER_EXCEPTION', 0, 1],
  ['d-rollback', 'modify-call-target', 'ERR_SQLITE_ERROR', 1, 0],
  ['d-sql-preflight', 'modify-call-target', 'RESOURCE_LIMIT_EXCEEDED', 0, 0],
  ['d-preparation-input', 'source-empty-input-boundary', 'SUCCEEDED', 1, 0],
  ['d-slow-stdin', 'source-empty-input-boundary', 'CANCELLED', 0, 0],
  ['d-shared-owners', 'source-shared-owners-boundary', 'SUCCEEDED', 1, 0],
  ['d-complete-coverage', 'source-complete-coverage-boundary', 'SUCCEEDED', 1, 0],
  ['d-overlay-retention', 'source-complete-coverage-boundary', 'SUCCEEDED', 1, 0],
  ['d-retained-sites', 'source-field-sites-boundary', 'SUCCEEDED', 1, 0],
  ['d-dense-remove', 'source-dense-remove-boundary', 'SUCCEEDED', 1, 0],
  ['d-dense-upsert', 'source-dense-upsert-boundary', 'SUCCEEDED', 1, 0],
]) {
  test(`D5 replay shared executor ${name} preserves original effects in a fresh process`, async (t) => {
    assert.equal(typeof transportWorker.executeRefreshTransportReplayCase, 'function');
    let transition = sourceTransitions.find((row) => row.id === transitionId);
    let f;
    const boundary = ['d-preparation-input', 'd-slow-stdin'].includes(name)
      ? preparedSourceInputBoundary
      : name === 'd-shared-owners'
        ? preparedSharedOwnersBoundary
        : ['d-complete-coverage', 'd-overlay-retention'].includes(name)
          ? preparedCompleteCoverageBoundary
          : name === 'd-retained-sites'
            ? preparedRetainedSitesBoundary
            : name === 'd-dense-remove'
              ? preparedDenseRemoveBoundary
              : null;
    if (boundary) {
      const generated = await boundary(t);
      f = generated.fixture;
      transition = generated.transition;
    } else {
      if (name === 'd-dense-upsert') {
        const generated = await prepareDenseUpsertBoundary(t);
        transition = denseUpsertTransition(generated.accepted.memberCount);
      }
      f = await preparedSourceRefresh(t, transition);
    }
    const {
      baseRevisionId,
      baseRevisionFingerprint,
      baselineState,
      changes,
      targetSourceFiles,
      ...payload
    } = f.prepared.request.payload;
    const invocation = {
      requestId: f.prepared.request.requestId,
      descriptor: f.prepared.descriptor,
      trustedContext: f.prepared.trustedContext,
      payload,
    };
    const controls = await mkdtemp(path.join(tmpdir(), 'codeatlas-shared-replay-'));
    t.after(() => rm(controls, { recursive: true, force: true }));
    const invocationPath = path.join(controls, 'invocation.json');
    const optionsPath = path.join(controls, 'options.json');
    await writeFile(invocationPath, replay.encodeRefreshReplayJson(invocation));
    await writeFile(optionsPath, replay.encodeRefreshReplayJson(f.options));
    const image = (db) => ({
      ...activationImage(db),
      ...Object.fromEntries(
        ['repository', 'revisions', 'source_files'].map((table) => [
          table,
          db
            .prepare(`SELECT * FROM ${table}`)
            .all()
            .map((row) => JSON.stringify(row))
            .sort(),
        ]),
      ),
    });
    const request = encodeNativeRefreshRequestV3(
      f.prepared.request,
      f.prepared.baseline,
      NATIVE_CLIENT_HARD_LIMITS,
      payload.resourceBudget.maxMemoryBytes,
    );
    let summaryBytes = f.prepared.baseline.summaries.reduce(
      (n, s) => n + Buffer.byteLength(JSON.stringify(s)),
      0,
    );
    if (name === 'd-sql-preflight') {
      f.db
        .prepare(
          "UPDATE native_analysis_file SET summary_json=json_quote(printf('%.*c',?,'x')) WHERE source_file_id=(SELECT source_file_id FROM native_analysis_file ORDER BY source_path LIMIT 1)",
        )
        .run(f.prepared.limits.maxSerializedBytes - 1);
      summaryBytes = f.db
        .prepare('SELECT sum(length(CAST(summary_json AS BLOB))) AS n FROM native_analysis_file')
        .get().n;
    }
    const original = image(f.db);
    const lines = Buffer.from(request).toString('utf8').trimEnd().split('\n');
    f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    f.db.close();
    const child = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', sharedReplayChild],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
        input: JSON.stringify({
          name,
          workspacePath: payload.repository.rootPath,
          databasePath: f.databasePath,
          coverage: originalLifetimeRequirements(name),
          inputContract: {
            corpusPayloadDigest: '0'.repeat(64),
            expectedOutcome: outcome,
            inputBytes: request.length,
            largestLineBytes: Math.max(...lines.map((s) => Buffer.byteLength(s))),
            outputBytes: 0,
            eventCount: 0,
            summaryBytes,
          },
          workload: {
            invocationPath,
            optionsPath,
            fault:
              outcome !== 'SUCCEEDED' || ['d-slow-sink', 'd-reopen'].includes(name) ? name : null,
          },
        }),
        timeout: 60_000,
      },
    );
    assert.equal(child.status, 0, child.stderr + child.stdout);
    const { pid, receipt, sqlLifetime, captureFailed } = JSON.parse(child.stdout);
    assert.notEqual(pid, process.pid);
    assert.equal(captureFailed, false, JSON.stringify(sqlLifetime));
    assert.equal(sqlLifetime.coverageComplete, true, JSON.stringify(sqlLifetime));
    assert.deepEqual(
      sqlLifetime.coverage.map(({ family, role, disposition }) => ({ family, role, disposition })),
      originalLifetimeRequirements(name),
    );
    assert.equal(sqlLifetime.retainedSqlStringChargeBytes, 2 * sqlLifetime.retainedSqlBytes);
    assert.deepEqual(
      Object.keys(receipt).sort(),
      [
        'observedOutcome',
        'operationThrew',
        'operationFailureText',
        'transactionClosed',
        'tempClosed',
        'mainApplyCalls',
        'competitorCommits',
        'physical',
        'snapshotMetadata',
      ].sort(),
    );
    assert.equal(receipt.observedOutcome, outcome);
    assert.equal(
      receipt.operationThrew,
      !['SUCCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(outcome),
    );
    assert.equal(receipt.mainApplyCalls, mainCalls);
    assert.equal(receipt.competitorCommits, competitorCommits);
    assert.equal(receipt.transactionClosed, true);
    assert.equal(receipt.tempClosed, true);
    if (name === 'd-sql-preflight') {
      assert.equal(receipt.physical.inputBytes, 0);
      assert.equal(receipt.physical.largestLineBytes, 0);
    } else if (name === 'd-slow-stdin') {
      assert.ok(receipt.physical.inputBytes > 0 && receipt.physical.inputBytes < request.length);
      assert.ok(receipt.physical.largestLineBytes > 0);
    } else {
      assert.equal(receipt.physical.inputBytes, request.length);
      assert.equal(
        receipt.physical.largestLineBytes,
        Math.max(...lines.map((s) => Buffer.byteLength(s))),
      );
    }
    assert.equal(receipt.physical.summaryBytes, summaryBytes);
    if (['d-sql-preflight', 'd-slow-stdin'].includes(name)) {
      assert.equal(receipt.physical.outputBytes, 0);
      assert.equal(receipt.physical.eventCount, 0);
    } else {
      assert.ok(receipt.physical.outputBytes > 0);
      assert.ok(receipt.physical.eventCount > 0);
    }
    if (['SUCCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(outcome))
      assert.equal(receipt.operationFailureText, null);
    else assert.ok(receipt.operationFailureText.length > 0);
    if (name === 'd-source-race')
      assert.match(receipt.operationFailureText, /Native target revision changed/);
    if (name === 'd-token-race')
      assert.match(receipt.operationFailureText, /Native activation token changed/);
    if (name === 'd-partial')
      assert.match(receipt.operationFailureText, /not eligible for publication/);
    if (name === 'd-rollback')
      assert.match(receipt.operationFailureText, /D5_SUMMARY_INSERT_FAILED/);
    assert.deepEqual(
      receipt.snapshotMetadata.entries.map(({ role, snapshotId }) => ({ role, snapshotId })),
      outcome === 'SUCCEEDED'
        ? [{ role: 'MAIN', snapshotId: 'snapshot-source-refresh' }]
        : name === 'd-token-race'
          ? [{ role: 'COMPETITOR', snapshotId: 'snapshot-d5-competitor' }]
          : [],
    );
    const result = new DatabaseSync(f.databasePath);
    try {
      if (outcome === 'SUCCEEDED') assertSourceRelations(result, transition.targetRelations);
      else if (!competitorCommits) assert.deepEqual(image(result), original);
      if (name === 'd-token-race')
        assert.equal(
          result.prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state').get().id,
          'snapshot-d5-competitor',
        );
      if (name === 'd-source-race')
        assert.ok(
          new RepositorySourceStateStore(result)
            .load('repo-fixture')
            .files.every((file) => file.classification.role === 'TEST'),
        );
    } finally {
      result.close();
    }
  });
}
async function fixture(t, bytes = Buffer.from('abc\n')) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-replay-asset-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'assets');
  await mkdir(root);
  const file = path.join(root, 'source.java');
  await writeFile(file, bytes);
  return { directory, root, file, asset: record('source.java', bytes) };
}

test('D5 replay materializer refuses an existing output without adopting its files', async (t) => {
  assert.equal(typeof replay.prepareRefreshTransportCorpus, 'function');
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-corpus-refusal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sentinel = path.join(directory, 'keep.txt');
  await writeFile(sentinel, 'original');
  await assert.rejects(replay.prepareRefreshTransportCorpus(directory));
  assert.equal(await readFile(sentinel, 'utf8'), 'original');
});

test('D5 replay materializer retains a failed generator seed after closing its original connection', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-corpus-failed-generator-'));
  const output = path.join(await realpath(parent), 'new');
  let registrations = 0,
    failedRoot;
  const failure = new Error('CONTROLLED_GENERATOR_REGISTRATION_FAILURE');
  const prepare = DatabaseSync.prototype.prepare;
  t.mock.method(DatabaseSync.prototype, 'prepare', function (sql, ...args) {
    const statement = prepare.call(this, sql, ...args);
    if (sql.startsWith('INSERT INTO repository(slot')) {
      const run = statement.run;
      statement.run = function (...values) {
        if (++registrations === 2) {
          failedRoot = values[1];
          throw failure;
        }
        return run.apply(this, values);
      };
    }
    return statement;
  });
  await assert.rejects(replay.prepareRefreshTransportCorpus(output), (error) => error === failure);
  assert.ok(failedRoot);
  assert.ok((await (await import('node:fs/promises')).lstat(failedRoot)).isDirectory());
  const report = replay.decodeRefreshReplayJson(
    await readFile(path.join(output, 'preparation-failure.json')),
  );
  assert.ok(report.retainedFixturePaths.includes(failedRoot));
  const db = new DatabaseSync(path.join(failedRoot, 'repository.sqlite'), { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
  } finally {
    db.close();
  }
  t.diagnostic(`Original failure and generator seed retained: ${output}; ${failedRoot}`);
});

test('D5 replay process identity distinguishes independent module lifetimes from a reused PID', () => {
  assert.equal(typeof transportWorker.refreshReplayProcessIdentity, 'object');
  const identity = transportWorker.refreshReplayProcessIdentity;
  assert.equal(identity.pid, process.pid);
  assert.match(identity.nonce, /^[a-f0-9-]{36}$/);
  assert.ok(Object.isFrozen(identity));
  const script = `import {refreshReplayProcessIdentity as identity} from './packages/runtime/test/helpers/native-refresh-transport-worker.mjs';
    process.stdout.write(JSON.stringify(identity));`;
  const identities = [];
  for (let i = 0; i < 2; i++) {
    const child = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', script],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
      },
    );
    assert.equal(child.status, 0, child.stderr);
    const observed = JSON.parse(child.stdout);
    assert.equal(observed.pid, child.pid);
    assert.notEqual(observed.pid, process.pid);
    identities.push(observed.nonce);
  }
  assert.equal(new Set([identity.nonce, ...identities]).size, 3);
});

let completeReplayFixture;
async function materializedReplayFixture(t) {
  completeReplayFixture ??= (async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-corpus-materializer-'));
    t.diagnostic(`Replay preparation and raw trial artifacts retained: ${parent}`);
    return replay.prepareRefreshTransportCorpus(path.join(await realpath(parent), 'corpus'));
  })();
  return completeReplayFixture;
}

for (const name of ['d-empty', 'd-corrupt'])
  test(`D5 settled original attempt export preserves ${name} bytes without ownership transfer`, async (t) => {
    const paths = await materializedReplayFixture(t);
    const value = await replay.readRefreshTransportReplay(
      paths.manifestPath,
      paths.bindingPath,
      name,
    );
    const result = await replay.runRefreshTransportFunctionalReplay(value);
    await replay.restoreRefreshTransportReplay(value);
    const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-original-export-'));
    t.after(() => rm(parent, { recursive: true, force: true }));
    const destination = path.join(parent, 'attempt');
    const exported = await replay.exportRefreshTransportAttempt(value, destination);
    assert.equal(exported.sourceRoot, result.artifactDirectory);
    for (const file of [
      'receipt.json',
      'result.sqlite',
      'original-result.sqlite',
      'trial-0.stdout',
      'trial-0.stderr',
    ]) {
      assert.ok(exported.files.some((entry) => entry.path === file));
      assert.deepEqual(
        await readFile(path.join(destination, file)),
        await readFile(path.join(result.artifactDirectory, file)),
      );
    }
    await assert.rejects(
      () => replay.restoreRefreshTransportReplay(exported),
      /original|ownership/i,
    );
  });

test('D5 replay materializer freezes real original22 seeds independent references and two fresh trials', async (t) => {
  assert.equal(typeof replay.prepareRefreshTransportCorpus, 'function');
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const manifest = replay.validateRefreshReplayManifestRecord(
    replay.decodeRefreshReplayJson(await readFile(manifestPath)),
  );
  const binding = replay.validateRefreshReplayLocalBindingRecord(
    replay.decodeRefreshReplayJson(await readFile(bindingPath)),
    manifest,
  );
  assert.deepEqual(
    manifest.cases.map((item) => item.name),
    [...refreshTransportCases].sort(),
  );
  const processes = new Set();
  for (const item of manifest.cases) {
    await replay.verifyRefreshReplayAssets(binding.artifactRoot, item.assets);
    const workspace = path.join(binding.replayRoot, item.name, item.binding.workspacePath);
    const seedPath = path.join(binding.artifactRoot, item.seedPath);
    const seed = new DatabaseSync(seedPath, { readOnly: true });
    try {
      assert.equal(seed.prepare('SELECT root_path FROM repository').get().root_path, workspace);
      assert.deepEqual(
        seed
          .prepare('SELECT path FROM source_files ORDER BY path')
          .all()
          .map((row) => row.path),
        item.sourceFiles.map((file) => file.destinationPath),
      );
    } finally {
      seed.close();
    }
    const golden = replay.decodeRefreshReplayJson(
      await readFile(path.join(binding.artifactRoot, item.oracle.sourceGoldenPath)),
    );
    assert.equal(golden.transition.id, item.sourceTransition);
    assert.equal(golden.trials.length, 2);
    for (const trial of golden.trials) {
      const envelope = replay.decodeRefreshReplayJson(
        await readFile(path.join(binding.artifactRoot, trial.receiptPath)),
      );
      assert.notEqual(envelope.pid, process.pid);
      assert.equal(envelope.processIdentity.pid, envelope.pid);
      assert.match(envelope.processIdentity.nonce, /^[a-f0-9-]{36}$/);
      assert.ok(!processes.has(envelope.processIdentity.nonce));
      processes.add(envelope.processIdentity.nonce);
      assert.equal(envelope.receipt.observedOutcome, item.expectedOutcome);
      assert.equal(envelope.receipt.transactionClosed, true);
      assert.equal(envelope.receipt.tempClosed, true);
      const { corpusPayloadDigest, expectedOutcome, ...physical } = item.inputContract;
      if (manifest.schemaVersion === 2 && item.name === 'd-cancel') {
        assert.deepEqual(
          { ...envelope.receipt.physical, outputBytes: null, eventCount: null },
          physical,
        );
        const provenance = replay.decodeRefreshReplayJson(
          await readFile(path.join(binding.artifactRoot, item.outputContract.provenancePath)),
        );
        const { verifyRefreshCancelledPrefix } = await cancellationPrefixModule();
        await verifyRefreshCancelledPrefix(
          binding.artifactRoot,
          item.assets.find((asset) => asset.path === item.outputContract.referencePath),
          {
            requestSha256: provenance.requestSha256,
            wireEvidence: envelope.receipt.wireEvidence,
          },
        );
      } else assert.deepEqual(envelope.receipt.physical, physical);
      assert.ok(envelope.receipt.snapshotMetadata);
    }
    const pristine = await readFile(
      path.join(binding.replayRoot, item.name, item.binding.databasePath),
    );
    assert.deepEqual(pristine, await readFile(seedPath));
    const capsule = replay.validateRefreshReplayCapsuleRecord(
      replay.decodeRefreshReplayJson(
        await readFile(path.join(binding.artifactRoot, item.capsulePath)),
      ),
      manifest,
      binding,
    );
    assert.equal(Object.hasOwn(capsule.inputContract, 'corpusPayloadDigest'), false);
    assert.equal(capsule.workspacePath, workspace);
    if (item.expectedOutcome === 'SUCCEEDED') {
      const graph = item.assets.find((asset) => asset.path === item.oracle.graphPath);
      const comparison = await replay.compareRefreshReplayCanonicalGraph(
        binding.artifactRoot,
        item.oracle.statePath,
        graph,
      );
      assert.ok(
        comparison.entries.every(
          (entry) =>
            entry.classification === null &&
            entry.differences.length === 0 &&
            entry.expected.id === entry.actual.id &&
            entry.expected.factKey === entry.actual.factKey,
        ),
      );
    }
  }
  assert.equal(processes.size, 44);
});

test('D5 replay reader exposes a frozen selected case only after the complete physical corpus validates', async (t) => {
  assert.equal(typeof replay.readRefreshTransportReplay, 'function');
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const value = await replay.readRefreshTransportReplay(
    manifestPath,
    bindingPath,
    'd-dependent-edge',
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      'schemaVersion',
      'outputContract',
      'evidenceRoot',
      'name',
      'manifestPath',
      'bindingPath',
      'workspacePath',
      'databasePath',
      'identity',
      'coverage',
      'caseDigest',
      'oraclePaths',
      'capsulePath',
      'capsuleSha256',
    ].sort(),
  );
  assert.equal(value.name, 'd-dependent-edge');
  assert.equal(value.manifestPath, manifestPath);
  assert.equal(value.bindingPath, bindingPath);
  assert.equal(path.dirname(value.databasePath), value.workspacePath);
  assert.deepEqual(Object.keys(value.identity.inputs).sort(), [...refreshTransportCases].sort());
  assert.equal(value.identity.inputs[value.name].corpusPayloadDigest, value.caseDigest);
  assert.equal(
    createHash('sha256')
      .update(await readFile(value.capsulePath))
      .digest('hex'),
    value.capsuleSha256,
  );
  assert.ok(
    value.oraclePaths.length >= 2 && value.oraclePaths.every((file) => path.isAbsolute(file)),
  );
  assert.ok(
    Object.isFrozen(value) && Object.isFrozen(value.identity) && Object.isFrozen(value.coverage),
  );
});

test('D5 replay reader shared corpus issues all22 original owners in one validation traversal', async (t) => {
  assert.equal(typeof replay.readRefreshTransportReplayCorpus, 'function');
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const values = await replay.readRefreshTransportReplayCorpus(manifestPath, bindingPath);
  assert.deepEqual(values.map((value) => value.name).sort(), [...refreshTransportCases].sort());
  assert.equal(new Set(values.map((value) => value)).size, 22);
  for (const value of values) {
    assert.equal(Object.isFrozen(value), true);
    assert.deepEqual(value.identity, values[0].identity);
    await replay.restoreRefreshTransportReplay(value);
  }
});

for (const defect of [
  'selected-source',
  'unselected-source',
  'oracle',
  'capsule',
  'manifest-count',
  'locator-root',
])
  test(`D5 replay reader refuses ${defect} drift before exposing any case`, async (t) => {
    assert.equal(typeof replay.readRefreshTransportReplay, 'function');
    const { manifestPath, bindingPath } = await materializedReplayFixture(t);
    const manifest = replay.decodeRefreshReplayJson(await readFile(manifestPath));
    const binding = replay.decodeRefreshReplayJson(await readFile(bindingPath));
    const item = manifest.cases.find(
      (item) => item.name === (defect === 'unselected-source' ? 'd-empty' : 'd-dependent-edge'),
    );
    let file;
    if (defect.endsWith('source'))
      file = path.join(binding.artifactRoot, item.sourceFiles[0].assetPath);
    else if (defect === 'oracle') file = path.join(binding.artifactRoot, item.oracle.statePath);
    else if (defect === 'capsule') file = path.join(binding.artifactRoot, item.capsulePath);
    else file = defect === 'manifest-count' ? manifestPath : bindingPath;
    const original = await readFile(file);
    try {
      if (defect === 'manifest-count') {
        manifest.cases.pop();
        await writeFile(file, replay.encodeRefreshReplayJson(manifest));
      } else if (defect === 'locator-root') {
        binding.replayRoot += '-foreign';
        await writeFile(file, replay.encodeRefreshReplayJson(binding));
      } else await writeFile(file, Buffer.concat([original, Buffer.from('x')]));
      let consumers = 0;
      await assert.rejects(async () => {
        await replay.readRefreshTransportReplay(manifestPath, bindingPath, 'd-dependent-edge');
        consumers++;
      });
      assert.equal(consumers, 0);
    } finally {
      await writeFile(file, original);
    }
  });

test('D5 replay restore returns the original pristine binding but refuses a copied ownership record', async (t) => {
  assert.equal(typeof replay.restoreRefreshTransportReplay, 'function');
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const value = await replay.readRefreshTransportReplay(
    manifestPath,
    bindingPath,
    'd-dependent-edge',
  );
  const seed = await readFile(value.databasePath);
  assert.deepEqual(await replay.restoreRefreshTransportReplay(value), {
    workspacePath: value.workspacePath,
    databasePath: value.databasePath,
  });
  await assert.rejects(replay.restoreRefreshTransportReplay({ ...value }));
  assert.deepEqual(await readFile(value.databasePath), seed);
});

test('D5 replay restore refuses an unrelated file without removing it', async (t) => {
  assert.equal(typeof replay.restoreRefreshTransportReplay, 'function');
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const value = await replay.readRefreshTransportReplay(
    manifestPath,
    bindingPath,
    'd-dependent-edge',
  );
  const sentinel = path.join(value.workspacePath, 'keep.txt');
  await writeFile(sentinel, 'not generated', { flag: 'wx' });
  try {
    await assert.rejects(replay.restoreRefreshTransportReplay(value));
    assert.equal(await readFile(sentinel, 'utf8'), 'not generated');
  } finally {
    await rm(sentinel);
  }
});

test('D5 replay restore refuses an active transaction and preserves original bytes', async (t) => {
  assert.equal(typeof replay.restoreRefreshTransportReplay, 'function');
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const value = await replay.readRefreshTransportReplay(
    manifestPath,
    bindingPath,
    'd-dependent-edge',
  );
  const bytes = await readFile(value.databasePath);
  const db = new DatabaseSync(value.databasePath);
  try {
    db.exec('BEGIN EXCLUSIVE');
    await assert.rejects(replay.restoreRefreshTransportReplay(value));
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
  }
  assert.deepEqual(await readFile(value.databasePath), bytes);
});

for (const name of [
  'd-dependent-edge',
  'd-token-race',
  'd-source-race',
  'd-cancel',
  'd-rollback',
  'd-reopen',
  'd-sql-preflight',
])
  test(`D5 replay qualification parent owns verification and restoration: ${name}`, async (t) => {
    assert.equal(typeof replay.runRefreshTransportFunctionalReplay, 'function');
    assert.equal(typeof replay.verifyRefreshTransportReplay, 'function');
    const { manifestPath, bindingPath } = await materializedReplayFixture(t);
    const value = await replay.readRefreshTransportReplay(manifestPath, bindingPath, name);
    const original = await readFile(value.databasePath);
    const running = replay.runRefreshTransportFunctionalReplay(value);
    await assert.rejects(replay.restoreRefreshTransportReplay(value), /active/i);
    const { receipt, verification, artifactDirectory } = await running;
    assert.deepEqual(
      Object.keys(verification).sort(),
      [
        'persistentStateVerified',
        'transactionClosed',
        'tempClosed',
        'expectedOutcomeVerified',
        'verificationDigest',
        'outputProof',
        'proofArtifact',
      ].sort(),
    );
    assert.equal(verification.persistentStateVerified, true);
    assert.equal(verification.expectedOutcomeVerified, true);
    assert.equal(verification.transactionClosed, true);
    assert.equal(verification.tempClosed, true);
    assert.match(verification.verificationDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(await replay.verifyRefreshTransportReplay(value, receipt), verification);
    await assert.rejects(replay.verifyRefreshTransportReplay(value, { ...receipt }));
    const result = await readFile(value.databasePath);
    assert.deepEqual(result, await readFile(path.join(artifactDirectory, 'result.sqlite')));
    assert.ok((await readFile(path.join(artifactDirectory, 'trial-0.stdout'))).length > 0);
    await replay.restoreRefreshTransportReplay(value);
    assert.deepEqual(await readFile(value.databasePath), original);
    assert.deepEqual(
      await readFile(path.join(artifactDirectory, 'original-result.sqlite')),
      result,
    );
    await assert.rejects(replay.verifyRefreshTransportReplay(value, receipt));
  });

const dependency = (asset) => ({ path: asset.path, sha256: asset.sha256 });

// A missing commit observation, result-SQL timestamp substitution or leaked nested
// observer must fail these controls. Setup is outside the captured invocation.
test('D5 replay metadata records original committed snapshot times without rereading result SQL', async (t) => {
  assert.equal(typeof transportWorker.captureRefreshSnapshotMetadata, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const originalPrepare = f.db.prepare;
  let capture;
  try {
    capture = await transportWorker.captureRefreshSnapshotMetadata(async () => {
      const value = await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
      f.db.prepare = () => assert.fail('No result SQL is allowed after the committed operation');
      return value;
    }, [{ role: 'MAIN', snapshotId: 'snapshot-source-refresh' }]);
  } finally {
    f.db.prepare = originalPrepare;
  }
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  const snapshot = f.db
    .prepare('SELECT started_at,completed_at FROM provider_snapshots WHERE id=?')
    .get('snapshot-source-refresh');
  assert.deepEqual(capture.metadata.entries, [
    {
      role: 'MAIN',
      snapshotId: 'snapshot-source-refresh',
      startedAt: snapshot.started_at,
      completedAt: snapshot.completed_at,
    },
  ]);
  const entry = capture.metadata.entries[0];
  assert.ok(capture.metadata.invocationStartedAt <= entry.startedAt);
  assert.ok(entry.startedAt <= entry.completedAt);
  assert.ok(entry.completedAt <= capture.metadata.invocationFinishedAt);
  assert.ok(Object.isFrozen(capture.metadata));
  assert.ok(Object.isFrozen(capture.metadata.entries));
  assert.ok(Object.isFrozen(entry));
  f.db
    .prepare('UPDATE provider_snapshots SET completed_at=? WHERE id=?')
    .run(entry.completedAt + 1, entry.snapshotId);
  assert.equal(capture.metadata.entries[0].completedAt, entry.completedAt);
});

test('D5 replay metadata refuses a wrong declared actor without changing the real Store commit', async (t) => {
  assert.equal(typeof transportWorker.captureRefreshSnapshotMetadata, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const capture = await transportWorker.captureRefreshSnapshotMetadata(
    () => applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    [{ role: 'COMPETITOR', snapshotId: 'snapshot-source-refresh' }],
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, true);
  assert.equal(capture.metadata, null);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
});

test('D5 replay metadata records no committed snapshot after real Store rollback', async (t) => {
  assert.equal(typeof transportWorker.captureRefreshSnapshotMetadata, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  f.db.exec(
    "CREATE TRIGGER metadata_rollback AFTER INSERT ON native_analysis_file BEGIN SELECT RAISE(ABORT,'METADATA_ROLLBACK'); END",
  );
  const capture = await transportWorker.captureRefreshSnapshotMetadata(
    () => applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    [],
  );
  assert.equal(capture.threw, true);
  assert.match(capture.error.message, /METADATA_ROLLBACK/);
  assert.equal(capture.captureFailed, false);
  assert.deepEqual(capture.metadata.entries, []);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
  assert.equal(f.db.isTransaction, false);
});

test('D5 replay metadata preserves falsy failures and restores its original Store method', async () => {
  assert.equal(typeof transportWorker.captureRefreshSnapshotMetadata, 'function');
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  for (const error of [undefined, null, false, 0, '']) {
    const capture = await transportWorker.captureRefreshSnapshotMetadata(() => {
      throw error;
    }, []);
    assert.equal(capture.threw, true);
    assert.strictEqual(capture.error, error);
    assert.equal(capture.captureFailed, false);
    assert.deepEqual(capture.metadata.entries, []);
    assert.strictEqual(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
  }
});

test('D5 replay metadata isolates a nested actual commit from its enclosing capture', async (t) => {
  assert.equal(typeof transportWorker.captureRefreshSnapshotMetadata, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const outer = await transportWorker.captureRefreshSnapshotMetadata(
    () =>
      transportWorker.captureRefreshSnapshotMetadata(
        () => applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        [{ role: 'MAIN', snapshotId: 'snapshot-source-refresh' }],
      ),
    [],
  );
  assert.equal(outer.threw, false);
  assert.equal(outer.captureFailed, false);
  assert.deepEqual(outer.metadata.entries, []);
  assert.equal(outer.value.captureFailed, false);
  assert.equal(outer.value.metadata.entries.length, 1);
});

test('D5 replay metadata retains a committed entry when subsequent cleanup throws a falsy error', async (t) => {
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const capture = await transportWorker.captureRefreshSnapshotMetadata(async () => {
    await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
    throw 0;
  }, [{ role: 'MAIN', snapshotId: 'snapshot-source-refresh' }]);
  assert.equal(capture.threw, true);
  assert.strictEqual(capture.error, 0);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.metadata.entries.length, 1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
});

test('D5 replay metadata rejects lost observation ownership while preserving the operation result', async () => {
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const capture = await transportWorker.captureRefreshSnapshotMetadata(() => {
    RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch = () => 0;
    return false;
  }, []);
  assert.equal(capture.value, false);
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, true);
  assert.equal(capture.metadata, null);
  assert.strictEqual(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
});

test('D5 replay metadata refuses a backwards invocation clock without changing its return value', async (t) => {
  let now = 2;
  const clock = t.mock.method(Date, 'now', () => now);
  try {
    const captured = await transportWorker.captureRefreshSnapshotMetadata(() => {
      now = 1;
      return 0;
    }, []);
    assert.equal(captured.value, 0);
    assert.equal(captured.threw, false);
    assert.equal(captured.captureFailed, true);
    assert.equal(captured.metadata, null);
  } finally {
    clock.mock.restore();
  }
});

for (const [name, snapshots] of [
  ['d-empty', [['MAIN', 'snapshot-source-refresh']]],
  ['d-dependent-edge', [['MAIN', 'snapshot-source-refresh']]],
  ['d-reopen', [['MAIN', 'snapshot-source-refresh']]],
  ['d-token-race', [['COMPETITOR', 'snapshot-d5-competitor']]],
  ['d-source-race', []],
  ['d-partial', []],
  ['d-rollback', []],
]) {
  test(`D5 replay metadata original actor/outcome ${name}`, async () => {
    const capture = await transportWorker.captureRefreshSourceLifetime(
      () => transportWorker.runRefreshTransportWorker('offline', name, 0),
      [],
    );
    assert.equal(capture.threw, false);
    assert.equal(capture.value.failure, null);
    const row = capture.value.row;
    assert.equal(row.snapshotMetadataCaptureFailed, false);
    assert.deepEqual(
      row.snapshotMetadata.entries.map(({ role, snapshotId }) => [role, snapshotId]),
      snapshots,
    );
    assert.equal(row.calibrationEligible, false);
    assert.equal(row.retainedSqlBytes, null);
    // These original diagnostic scenarios include generation/reopen validation;
    // they prove actor/outcome observation, not final replay or lifetime eligibility.
  });
}

// Physical catalog fixture, independent of any replay Manifest. Omitting a dependency
// from discovery or accepting differing copies of one package must fail these tests.
async function catalogFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-replay-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryPath = path.join(directory, 'repo');
  const externalPath = path.join(directory, 'installed');
  const nativeExecutablePath = path.join(directory, 'native', 'analyzer');
  const files = {
    'package.json': '{"name":"catalog-test","version":"1"}\n',
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'packages/a/package.json':
      '{"name":"@fixture/a","version":"1","dependencies":{"external":"1"}}\n',
    'packages/a/dist/index.js': 'export const a = 1;\r\n',
    'packages/runtime/package.json': '{"name":"@fixture/runtime","version":"1"}\n',
    'packages/runtime/dist/index.js': 'export const runtime = 1;\n',
    'packages/runtime/dist/native-metadata-profiles.js': 'export const profiles = [];\n',
    'packages/runtime/dist/native-metadata-profiles.js.map': '{"version":3,"mappings":""}\n',
    'packages/runtime/dist/native-metadata-profiles.d.ts.map': '{"version":3,"mappings":""}\n',
    'packages/runtime/dist/native-metadata-profiles.d.ts': 'export declare const profiles: [];\n',
    'packages/runtime/dist/index.js.map': '{"version":3,"mappings":""}\n',
    'packages/runtime/test/helpers/worker.mjs': 'export const worker = 1;\n',
    'scripts/tool.mjs': 'export const tool = 1;\n',
    'fixtures/native/java/source/Test.java': 'class Test {}\n',
    'fixtures/ipc/handshake-v1/request.jsonl': '{"type":"DESCRIBE"}\n',
    'packages/storage/migrations/repository/R001.sql': 'SELECT 1;\n',
  };
  for (const [relative, bytes] of Object.entries(files)) {
    const destination = path.join(repositoryPath, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  await mkdir(externalPath, { recursive: true });
  await writeFile(path.join(externalPath, 'package.json'), '{"name":"external","version":"1"}\n');
  await writeFile(path.join(externalPath, 'index.js'), Buffer.from([0, 13, 10, 255]));
  await mkdir(path.dirname(nativeExecutablePath));
  await writeFile(nativeExecutablePath, Buffer.from([0, 1, 255]));
  const options = {
    repositoryPath,
    nativeExecutablePath,
    resolvePackageRoot: async () => externalPath,
  };
  return { directory, repositoryPath, externalPath, nativeExecutablePath, files, options };
}

test('D5 v3 catalog ignores only exact regular workspace build caches across add/change/remove', async (t) => {
  const f = await catalogFixture(t);
  const original = await replay.discoverRefreshReplayDependenciesAt(f.options);
  const file = path.join(f.repositoryPath, 'packages/a/dist/.tsbuildinfo');
  for (const bytes of ['initial compiler history', 'different resolution history']) {
    await writeFile(file, bytes);
    const current = await replay.discoverRefreshReplayDependenciesAt(f.options);
    await replay.verifyRefreshReplayDependencyCatalog(
      current,
      original.roots,
      original.dependencies,
    );
  }
  await rm(file);
  const removed = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await replay.verifyRefreshReplayDependencyCatalog(removed, original.roots, original.dependencies);
});

test('D5 historical v2 discovery still binds compiler caches without reinterpreting old membership', async (t) => {
  const f = await catalogFixture(t);
  const options = { ...f.options, generatorRevision: 'p05-refresh-replay-v2' };
  const file = path.join(f.repositoryPath, 'packages/a/dist/.tsbuildinfo');
  await writeFile(file, 'original');
  const original = await replay.discoverRefreshReplayDependenciesAt(options);
  assert.ok(
    original.dependencies.some((entry) => entry.path === 'repository/packages/a/dist/.tsbuildinfo'),
  );
  const current = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(current, original.roots, original.dependencies),
  );
  await writeFile(file, 'changed');
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(
      await replay.discoverRefreshReplayDependenciesAt(options),
      original.roots,
      original.dependencies,
    ),
  );
  await rm(file);
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(
      await replay.discoverRefreshReplayDependenciesAt(options),
      original.roots,
      original.dependencies,
    ),
  );
});

test('D5 operational discovery refuses an unknown generator policy', async (t) => {
  const f = await catalogFixture(t);
  await assert.rejects(
    replay.discoverRefreshReplayDependenciesAt({
      ...f.options,
      generatorRevision: 'unreviewed-policy',
    }),
    /generator|revision|policy/i,
  );
});

for (const name of [
  'packages/a/dist/nested/.tsbuildinfo',
  'packages/a/dist/other.tsbuildinfo',
  'packages/runtime/test/helpers/.tsbuildinfo',
  'scripts/.tsbuildinfo',
]) {
  test(`D5 v3 catalog retains nonexcluded cache membership: ${name}`, async (t) => {
    const f = await catalogFixture(t);
    const original = await replay.discoverRefreshReplayDependenciesAt(f.options);
    const file = path.join(f.repositoryPath, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'not an excluded workspace compiler cache');
    await assert.rejects(
      replay.verifyRefreshReplayDependencyCatalog(
        await replay.discoverRefreshReplayDependenciesAt(f.options),
        original.roots,
        original.dependencies,
      ),
    );
  });
}

test('D5 v3 catalog still binds installed-package caches', async (t) => {
  const f = await catalogFixture(t);
  const original = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await writeFile(path.join(f.externalPath, '.tsbuildinfo'), 'installed package bytes');
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(
      await replay.discoverRefreshReplayDependenciesAt(f.options),
      original.roots,
      original.dependencies,
    ),
  );
});

test('D5 cache amendment preserves installed node_modules directory traversal policy for both revisions', async (t) => {
  const f = await catalogFixture(t);
  const original = await replay.discoverRefreshReplayDependenciesAt(f.options);
  const nested = path.join(f.externalPath, 'node_modules', 'unreferenced');
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(nested, 'index.js'), 'outside direct package inventory');
  for (const generatorRevision of ['p05-refresh-replay-v2', 'p05-refresh-replay-v3']) {
    const current = await replay.discoverRefreshReplayDependenciesAt({
      ...f.options,
      generatorRevision,
    });
    await replay.verifyRefreshReplayDependencyCatalog(
      current,
      original.roots,
      original.dependencies,
    );
  }
});

test('D5 v3 excluded cache rejects a hard link instead of silently ignoring linked bytes', async (t) => {
  const f = await catalogFixture(t);
  const original = path.join(f.directory, 'compiler-cache');
  await writeFile(original, 'real linked compiler-cache bytes');
  const { link } = await import('node:fs/promises');
  await link(original, path.join(f.repositoryPath, 'packages/a/dist/.tsbuildinfo'));
  await assert.rejects(
    replay.discoverRefreshReplayDependenciesAt(f.options),
    /cache|regular|link/i,
  );
});

for (const kind of ['directory', 'junction']) {
  test(`D5 v3 cache exclusion refuses a ${kind} at the exact cache path`, async (t) => {
    const f = await catalogFixture(t);
    const file = path.join(f.repositoryPath, 'packages/a/dist/.tsbuildinfo');
    if (kind === 'directory') await mkdir(file);
    else await symlink(f.externalPath, file, 'junction');
    await assert.rejects(
      replay.discoverRefreshReplayDependenciesAt(f.options),
      /cache|regular|symbolic/i,
    );
  });
}

test('D5 replay catalog enumerates independent sorted raw-byte membership', async (t) => {
  assert.equal(typeof replay.discoverRefreshReplayDependenciesAt, 'function');
  const f = await catalogFixture(t);
  const actual = await replay.discoverRefreshReplayDependenciesAt(f.options);
  const externalName =
    'package-' +
    createHash('sha256')
      .update('external\0' + '1')
      .digest('hex');
  const expectedPaths = [
    'native/analyzer',
    `${externalName}/index.js`,
    `${externalName}/package.json`,
    ...Object.keys(f.files)
      .filter(
        (name) =>
          ![
            'packages/runtime/dist/native-metadata-profiles.js',
            'packages/runtime/dist/native-metadata-profiles.js.map',
            'packages/runtime/dist/native-metadata-profiles.d.ts.map',
          ].includes(name),
      )
      .map((name) => `repository/${name}`),
  ].sort();
  assert.deepEqual(
    actual.dependencies.map((entry) => entry.path),
    expectedPaths,
  );
  assert.deepEqual(
    actual.roots.map((entry) => entry.name),
    ['native', externalName, 'repository'].sort(),
  );
  assert.equal(
    actual.dependencies.find((entry) => entry.path === 'repository/packages/a/dist/index.js')
      .sha256,
    createHash('sha256').update('export const a = 1;\r\n').digest('hex'),
  );
  assert.deepEqual(
    await readFile(path.join(f.externalPath, 'index.js')),
    Buffer.from([0, 13, 10, 255]),
  );
  assert.ok(Object.isFrozen(actual.dependencies) && Object.isFrozen(actual.dependencies[0]));
});

for (const change of [
  'omitted-dependency',
  'added-file',
  'omitted-root',
  'added-root',
  'native-drift',
  'resolution-drift',
]) {
  test(`D5 replay catalog refuses ${change} before consumer handoff`, async (t) => {
    assert.equal(typeof replay.discoverRefreshReplayDependenciesAt, 'function');
    assert.equal(typeof replay.verifyRefreshReplayDependencyCatalog, 'function');
    const f = await catalogFixture(t);
    const original = await replay.discoverRefreshReplayDependenciesAt(f.options);
    const declared = structuredClone(original);
    if (change === 'omitted-dependency') declared.dependencies.pop();
    if (change === 'omitted-root') declared.roots.pop();
    if (change === 'added-root') declared.roots.push({ name: 'foreign', path: f.directory });
    if (change === 'added-file') await writeFile(path.join(f.externalPath, 'new.js'), 'new');
    if (change === 'native-drift') await writeFile(f.nativeExecutablePath, 'changed');
    if (change === 'resolution-drift') {
      const relocated = path.join(f.directory, 'relocated');
      await mkdir(relocated);
      await copyFile(
        path.join(f.externalPath, 'package.json'),
        path.join(relocated, 'package.json'),
      );
      await copyFile(path.join(f.externalPath, 'index.js'), path.join(relocated, 'index.js'));
      f.options.resolvePackageRoot = async () => relocated;
    }
    const current = await replay.discoverRefreshReplayDependenciesAt(f.options);
    let consumerCalls = 0;
    await assert.rejects(async () => {
      await replay.verifyRefreshReplayDependencyCatalog(
        current,
        declared.roots,
        declared.dependencies,
      );
      consumerCalls++;
    });
    assert.equal(consumerCalls, 0);
  });
}

test('D5 replay catalog recursively includes installed optional packages and refuses missing required ones', async (t) => {
  assert.equal(typeof replay.discoverRefreshReplayDependenciesAt, 'function');
  const f = await catalogFixture(t);
  const leaf = path.join(f.directory, 'leaf');
  await mkdir(leaf);
  await writeFile(path.join(leaf, 'package.json'), '{"name":"leaf","version":"2"}\n');
  await writeFile(path.join(leaf, 'index.js'), 'leaf');
  await writeFile(
    path.join(f.externalPath, 'package.json'),
    '{"name":"external","version":"1","optionalDependencies":{"leaf":"2","absent":"1"}}\n',
  );
  f.options.resolvePackageRoot = async (name) => {
    if (name === 'external') return f.externalPath;
    if (name === 'leaf') return leaf;
    const error = new Error('missing');
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  };
  const actual = await replay.discoverRefreshReplayDependenciesAt(f.options);
  const leafName =
    'package-' +
    createHash('sha256')
      .update('leaf\0' + '2')
      .digest('hex');
  assert.ok(actual.dependencies.some((entry) => entry.path === `${leafName}/index.js`));
  await writeFile(
    path.join(f.externalPath, 'package.json'),
    '{"name":"external","version":"1","dependencies":{"absent":"1"}}\n',
  );
  await assert.rejects(replay.discoverRefreshReplayDependenciesAt(f.options), /missing/i);
});

test('D5 replay catalog refuses unequal installations with one package name/version', async (t) => {
  assert.equal(typeof replay.discoverRefreshReplayDependenciesAt, 'function');
  const f = await catalogFixture(t);
  const other = path.join(f.directory, 'other');
  await mkdir(other);
  await copyFile(path.join(f.externalPath, 'package.json'), path.join(other, 'package.json'));
  await writeFile(path.join(other, 'index.js'), 'different');
  await writeFile(
    path.join(f.repositoryPath, 'packages/runtime/package.json'),
    '{"name":"@fixture/runtime","version":"1","dependencies":{"external":"1"}}\n',
  );
  f.options.resolvePackageRoot = async (_, importer) =>
    importer.endsWith('runtime') ? other : f.externalPath;
  await assert.rejects(replay.discoverRefreshReplayDependenciesAt(f.options), /installation/i);
});

for (const variant of ['same-bytes', 'different-version']) {
  test(`D5 replay catalog refuses unbound resolution topology: ${variant}`, async (t) => {
    const f = await catalogFixture(t);
    const other = path.join(f.directory, 'other');
    await mkdir(other);
    await copyFile(path.join(f.externalPath, 'package.json'), path.join(other, 'package.json'));
    await copyFile(path.join(f.externalPath, 'index.js'), path.join(other, 'index.js'));
    if (variant === 'different-version')
      await writeFile(path.join(other, 'package.json'), '{"name":"external","version":"2"}\n');
    await writeFile(
      path.join(f.repositoryPath, 'packages/runtime/package.json'),
      '{"name":"@fixture/runtime","version":"1","dependencies":{"external":"*"}}\n',
    );
    f.options.resolvePackageRoot = async (_, importer) =>
      importer.endsWith('runtime') ? other : f.externalPath;
    await assert.rejects(
      replay.discoverRefreshReplayDependenciesAt(f.options),
      /installation|topology/i,
    );
  });
}

test('D5 replay catalog refuses a symlink in its physical inventory', async (t) => {
  assert.equal(typeof replay.discoverRefreshReplayDependenciesAt, 'function');
  const f = await catalogFixture(t);
  await symlink(f.externalPath, path.join(f.repositoryPath, 'packages/a/dist/escape'), 'junction');
  await assert.rejects(
    replay.discoverRefreshReplayDependenciesAt(f.options),
    /nonregular|symbolic/i,
  );
});

test('D5 replay catalog refuses a linked workspace package instead of silently omitting it', async (t) => {
  const f = await catalogFixture(t);
  await symlink(f.externalPath, path.join(f.repositoryPath, 'packages/foreign'), 'junction');
  await assert.rejects(
    replay.discoverRefreshReplayDependenciesAt(f.options),
    /escapes|nonregular|symbolic/i,
  );
});

test('D5 replay catalog keeps only the exact sanctioned profile-data exclusion', async (t) => {
  const f = await catalogFixture(t);
  const before = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await writeFile(
    path.join(f.repositoryPath, 'packages/runtime/dist/native-metadata-profiles.js'),
    'changed profile',
  );
  for (const name of ['native-metadata-profiles.js.map', 'native-metadata-profiles.d.ts.map']) {
    await writeFile(
      path.join(f.repositoryPath, 'packages/runtime/dist', name),
      'rebuilt profile map',
    );
  }
  const after = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await replay.verifyRefreshReplayDependencyCatalog(after, before.roots, before.dependencies);
  await writeFile(
    path.join(f.repositoryPath, 'packages/a/dist/native-metadata-profiles.js'),
    'not excluded',
  );
  const added = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(added, before.roots, before.dependencies),
  );
});

for (const file of [
  'packages/runtime/dist/native-metadata-profiles.d.ts',
  'packages/runtime/dist/index.js.map',
  'packages/runtime/dist/index.js',
  'packages/runtime/test/helpers/worker.mjs',
  'packages/a/package.json',
  'fixtures/native/java/source/Test.java',
]) {
  test(`D5 profile-map amendment still refuses raw drift: ${file}`, async (t) => {
    const f = await catalogFixture(t);
    const before = await replay.discoverRefreshReplayDependenciesAt(f.options);
    await writeFile(
      path.join(f.repositoryPath, file),
      file.endsWith('/package.json')
        ? '{"name":"@fixture/a","version":"2","dependencies":{"external":"1"}}\n'
        : 'unapproved change',
    );
    const after = await replay.discoverRefreshReplayDependenciesAt(f.options);
    await assert.rejects(
      replay.verifyRefreshReplayDependencyCatalog(after, before.roots, before.dependencies),
    );
  });
}

// Independent spec fixtures: key insertion order below is already lexical.
// These empty hash-labelled assets are NOT executable/qualified replay inputs.
function manifestRecordFixture() {
  const mappings = [
    ['d-preparation-input', 'source-empty-input-boundary', 'SUCCEEDED'],
    ['d-retained-sites', 'source-field-sites-boundary', 'SUCCEEDED'],
    ['d-shared-owners', 'source-shared-owners-boundary', 'SUCCEEDED'],
    ['d-dense-upsert', 'source-dense-upsert-boundary', 'SUCCEEDED'],
    ['d-dense-remove', 'source-dense-remove-boundary', 'SUCCEEDED'],
    ['d-complete-coverage', 'source-complete-coverage-boundary', 'SUCCEEDED'],
    ['d-overlay-retention', 'source-complete-coverage-boundary', 'SUCCEEDED'],
    ['d-delete', 'shared-last-owner-deletion-zero-target', 'SUCCEEDED'],
    ['d-empty', 'empty-file-noop', 'SUCCEEDED'],
    ['d-zero-fact', 'zero-files-noop', 'SUCCEEDED'],
    ['d-rollback', 'modify-call-target', 'ERR_SQLITE_ERROR'],
    ['d-reopen', 'modify-call-target', 'SUCCEEDED'],
    ['d-dependent-edge', 'add-method-unknown-to-resolved', 'SUCCEEDED'],
    ['d-slow-sink', 'modify-call-target', 'SUCCEEDED'],
    ['d-slow-stdin', 'source-empty-input-boundary', 'CANCELLED'],
    ['d-cancel', 'modify-call-target', 'CANCELLED'],
    ['d-sql-preflight', 'modify-call-target', 'RESOURCE_LIMIT_EXCEEDED'],
    ['d-source-race', 'modify-call-target', 'WORKER_EXCEPTION'],
    ['d-token-race', 'empty-file-noop', 'WORKER_EXCEPTION'],
    ['d-partial', 'empty-file-noop', 'WORKER_EXCEPTION'],
    ['d-corrupt', 'empty-file-noop', 'CHECKSUM_MISMATCH'],
    ['d-late-exit', 'empty-file-noop', 'PROCESS_FAILED'],
  ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const hash = (prefix, value) =>
    createHash('sha256')
      .update(prefix + '\0' + JSON.stringify(value) + '\n')
      .digest('hex');
  const cases = mappings.map(([name, sourceTransition, expectedOutcome]) => {
    const prefix = `cases/${name}/`;
    const success = expectedOutcome === 'SUCCEEDED';
    const assets = [
      ['capsule.json', 'REPLAY_CAPSULE'],
      ['golden.json', 'ORACLE'],
      ...(success ? [['graph.sqlite', 'SQLITE']] : []),
      ['invocation.json', 'REPLAY_CAPSULE'],
      ['options.json', 'REPLAY_CAPSULE'],
      ['seed.sqlite', 'SQLITE'],
      ['state.sqlite', 'SQLITE'],
    ].map(([file, kind]) => ({ bytes: 0, kind, path: prefix + file, sha256: 'a'.repeat(64) }));
    const input = {
      eventCount: 0,
      expectedOutcome,
      inputBytes: 0,
      largestLineBytes: 0,
      outputBytes: 0,
      summaryBytes: 0,
    };
    const preimage = {
      assets,
      binding: {
        databasePath: 'workspace/repository.sqlite',
        repositoryId: 'repo-fixture',
        workspacePath: 'workspace',
      },
      capsulePath: prefix + 'capsule.json',
      coverage: [{ disposition: 'OBSERVED', family: 'BASELINE_READ', role: 'MAIN' }],
      expectedOutcome,
      inputContract: input,
      name,
      oracle: {
        graphPath: success ? prefix + 'graph.sqlite' : null,
        refusal: success
          ? null
          : {
              code: expectedOutcome,
              competitorCommits: 0,
              mainApplyCalls: 0,
              message: 'unqualified structural fixture',
            },
        sourceGoldenPath: prefix + 'golden.json',
        statePath: prefix + 'state.sqlite',
      },
      seedPath: prefix + 'seed.sqlite',
      sourceFiles: [],
      sourceTransition,
    };
    const caseDigest = hash('p05-refresh-replay-case-v1', preimage);
    return {
      assets,
      binding: preimage.binding,
      capsulePath: preimage.capsulePath,
      caseDigest,
      coverage: preimage.coverage,
      expectedOutcome,
      inputContract: { corpusPayloadDigest: caseDigest, ...input },
      name,
      oracle: preimage.oracle,
      seedPath: preimage.seedPath,
      sourceFiles: [],
      sourceTransition,
    };
  });
  const preimage = {
    cases,
    corpus: { revision: 'p05-native-refresh-transport-memory-v1' },
    generator: {
      dependencies: [{ path: 'repository/generator.mjs', sha256: 'b'.repeat(64) }],
      revision: 'structural-test-only',
    },
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
  };
  return {
    cases,
    corpus: { digest: hash('p05-refresh-replay-corpus-v1', preimage), ...preimage.corpus },
    generator: preimage.generator,
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
  };
}

function capsuleRecordFixture(name = 'd-empty') {
  const manifest = manifestRecordFixture();
  const item = manifest.cases.find((row) => row.name === name);
  const binding = {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    corpusDigest: manifest.corpus.digest,
    artifactRoot: path.resolve('synthetic-artifacts'),
    replayRoot: path.resolve('synthetic-replay'),
    dependencyRoots: [
      { name: 'native', path: path.resolve('synthetic-native') },
      { name: 'repository', path: path.resolve('synthetic-repository') },
    ],
  };
  const { corpusPayloadDigest, ...inputContract } = item.inputContract;
  const capsule = {
    name,
    workspacePath: path.join(binding.replayRoot, name, 'workspace'),
    databasePath: path.join(binding.replayRoot, name, 'workspace', 'repository.sqlite'),
    coverage: structuredClone(item.coverage),
    inputContract,
    workload: {
      invocationPath: `cases/${name}/invocation.json`,
      optionsPath: `cases/${name}/options.json`,
      fault: name === 'd-empty' ? null : name,
    },
  };
  return { manifest, item, binding, capsule };
}

function versionTwoRecordFixture(name = 'd-cancel') {
  const f = capsuleRecordFixture(name);
  // Independent JSON.stringify preimage; this fixture uses no integer-like keys.
  const lexical = (value) =>
    Array.isArray(value)
      ? value.map(lexical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, child]) => [key, lexical(child)]),
          )
        : value;
  const hash = (domain, value) =>
    createHash('sha256')
      .update(domain + '\0' + JSON.stringify(lexical(value)) + '\n')
      .digest('hex');
  f.manifest.schemaVersion = 2;
  for (const item of f.manifest.cases) {
    item.outputContract =
      item.name === 'd-cancel'
        ? {
            kind: 'CANCELLED_PREFIX',
            referencePath: 'cases/d-cancel/reference.jsonl',
            provenancePath: 'cases/d-cancel/provenance.json',
          }
        : { kind: 'EXACT' };
    if (item.name === 'd-cancel') {
      item.inputContract.outputBytes = null;
      item.inputContract.eventCount = null;
      item.assets.push(
        ...['provenance.json', 'reference.jsonl'].map((file) => ({
          bytes: 0,
          kind: 'ORACLE',
          path: 'cases/d-cancel/' + file,
          sha256: 'd'.repeat(64),
        })),
      );
      item.assets.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    }
    const { caseDigest, inputContract, ...rest } = item;
    const { corpusPayloadDigest, ...input } = inputContract;
    item.caseDigest = hash('p05-refresh-replay-case-v2', { ...rest, inputContract: input });
    item.inputContract.corpusPayloadDigest = item.caseDigest;
  }
  const { digest, ...corpus } = f.manifest.corpus;
  f.manifest.corpus.digest = hash('p05-refresh-replay-corpus-v2', { ...f.manifest, corpus });
  f.binding.schemaVersion = 2;
  f.binding.corpusDigest = f.manifest.corpus.digest;
  f.capsule.schemaVersion = 2;
  f.capsule.outputContract = structuredClone(f.item.outputContract);
  const { corpusPayloadDigest, ...input } = f.item.inputContract;
  f.capsule.inputContract = input;
  return f;
}
test('D5 cancellation prefix v2 manifest capsule and locator use independent digests', () => {
  const f = versionTwoRecordFixture();
  const manifest = replay.validateRefreshReplayManifestRecord(f.manifest);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(Object.isFrozen(manifest.cases[0]), true);
  assert.equal(
    replay.validateRefreshReplayLocalBindingRecord(f.binding, manifest).schemaVersion,
    2,
  );
  assert.equal(
    replay.validateRefreshReplayCapsuleRecord(f.capsule, manifest, f.binding).schemaVersion,
    2,
  );
  assert.equal(
    replay.validateRefreshReplayManifestRecord(manifestRecordFixture()).schemaVersion,
    1,
  );
});
test('D5 cancellation prefix v2 rejects mixed capsule locator and changed expectation', () => {
  const f = versionTwoRecordFixture();
  assert.throws(() =>
    replay.validateRefreshReplayLocalBindingRecord({ ...f.binding, schemaVersion: 1 }, f.manifest),
  );
  assert.throws(() =>
    replay.validateRefreshReplayCapsuleRecord(
      { ...f.capsule, schemaVersion: 1 },
      f.manifest,
      f.binding,
    ),
  );
  f.item.inputContract.outputBytes = 753;
  assert.throws(() => replay.validateRefreshReplayManifestRecord(f.manifest));
});

test('D5 replay locator record accepts only a copied frozen locator description, not real-path proof', () => {
  assert.equal(typeof replay.validateRefreshReplayLocalBindingRecord, 'function');
  const f = capsuleRecordFixture();
  const result = replay.validateRefreshReplayLocalBindingRecord(f.binding, f.manifest);
  assert.deepEqual(result, f.binding);
  assert.notEqual(result, f.binding);
  assert.ok(Object.isFrozen(result.dependencyRoots[0]));
});

for (const [name, mutate] of [
  [
    'unknown field',
    (v) => {
      v.extra = 0;
    },
  ],
  [
    'wrong corpus',
    (v) => {
      v.corpusDigest = '0'.repeat(64);
    },
  ],
  [
    'relative root',
    (v) => {
      v.artifactRoot = 'relative';
    },
  ],
  [
    'aliased root spelling',
    (v) => {
      v.replayRoot += path.sep;
    },
  ],
  [
    'same mutable and immutable root',
    (v) => {
      v.replayRoot = v.artifactRoot;
    },
  ],
  [
    'duplicate named root',
    (v) => {
      v.dependencyRoots.push(v.dependencyRoots[0]);
    },
  ],
  [
    'unsorted roots',
    (v) => {
      v.dependencyRoots.reverse();
    },
  ],
  [
    'missing native root',
    (v) => {
      v.dependencyRoots.shift();
    },
  ],
  [
    'unknown root name',
    (v) => {
      v.dependencyRoots[0].name = 'arbitrary';
    },
  ],
])
  test(`D5 replay locator record refuses ${name}`, () => {
    assert.equal(typeof replay.validateRefreshReplayLocalBindingRecord, 'function');
    const f = capsuleRecordFixture();
    mutate(f.binding);
    assert.throws(() => replay.validateRefreshReplayLocalBindingRecord(f.binding, f.manifest), {
      code: 'ERR_ASSERTION',
    });
  });

test('D5 replay locator record refuses NUL in an absolute locator', () => {
  const f = capsuleRecordFixture();
  f.binding.artifactRoot += '\0';
  assert.throws(() => replay.validateRefreshReplayLocalBindingRecord(f.binding, f.manifest), {
    code: 'ERR_ASSERTION',
  });
});

test('D5 replay capsule record preserves the frozen digest-free control record', () => {
  assert.equal(typeof replay.validateRefreshReplayCapsuleRecord, 'function');
  for (const name of ['d-empty', 'd-cancel']) {
    const f = capsuleRecordFixture(name);
    const result = replay.validateRefreshReplayCapsuleRecord(f.capsule, f.manifest, f.binding);
    assert.deepEqual(result, f.capsule);
    assert.notEqual(result, f.capsule);
    assert.ok(Object.isFrozen(result.workload));
    assert.equal('corpusPayloadDigest' in result.inputContract, false);
  }
});

for (const [name, mutate] of [
  [
    'case digest cycle',
    (v) => {
      v.caseDigest = 'a'.repeat(64);
    },
  ],
  [
    'corpus digest cycle',
    (v) => {
      v.corpusDigest = 'a'.repeat(64);
    },
  ],
  [
    'payload digest cycle',
    (v) => {
      v.inputContract.corpusPayloadDigest = 'a'.repeat(64);
    },
  ],
  [
    'cached baseline',
    (v) => {
      v.workload.baselineState = {};
    },
  ],
  [
    'expected graph',
    (v) => {
      v.expectedGraph = [];
    },
  ],
  [
    'relocation',
    (v) => {
      v.workspacePath += '-relocated';
    },
  ],
  [
    'wrong database',
    (v) => {
      v.databasePath = path.join(path.dirname(v.workspacePath), 'elsewhere.sqlite');
    },
  ],
  [
    'changed physical count',
    (v) => {
      v.inputContract.inputBytes = 1;
    },
  ],
  [
    'changed coverage',
    (v) => {
      v.coverage[0].disposition = 'PROVEN_NO_TEXT';
    },
  ],
  [
    'undeclared invocation',
    (v) => {
      v.workload.invocationPath = 'cases/d-empty/absent.json';
    },
  ],
  [
    'wrong-kind options',
    (v) => {
      v.workload.optionsPath = 'cases/d-empty/seed.sqlite';
    },
  ],
  [
    'shell-shaped fault',
    (v) => {
      v.workload.fault = 'cmd /c echo bad';
    },
  ],
  [
    'another case fault',
    (v) => {
      v.workload.fault = 'd-cancel';
    },
  ],
])
  test(`D5 replay capsule record refuses ${name} before consumer handoff`, () => {
    assert.equal(typeof replay.validateRefreshReplayCapsuleRecord, 'function');
    const f = capsuleRecordFixture();
    mutate(f.capsule);
    let consumers = 0;
    assert.throws(
      () => {
        replay.validateRefreshReplayCapsuleRecord(f.capsule, f.manifest, f.binding);
        consumers++;
      },
      { code: 'ERR_ASSERTION' },
    );
    assert.equal(consumers, 0);
  });

test('D5 replay manifest record validates independent structural identities without exposing executable cases', () => {
  assert.equal(typeof replay.validateRefreshReplayManifestRecord, 'function');
  const value = manifestRecordFixture();
  const result = replay.validateRefreshReplayManifestRecord(value);
  assert.deepEqual(result, value);
  assert.notEqual(result, value);
  assert.ok(Object.isFrozen(result.cases[0].inputContract));
  assert.equal('calibrationEligible' in result, false);
});

for (const [name, mutate] of [
  [
    'unknown top field',
    (v) => {
      v.extra = true;
    },
  ],
  [
    'missing case',
    (v) => {
      v.cases.pop();
    },
  ],
  [
    'duplicate case',
    (v) => {
      v.cases[1] = v.cases[0];
    },
  ],
  [
    'unsorted cases',
    (v) => {
      v.cases.reverse();
    },
  ],
  [
    'wrong transition',
    (v) => {
      v.cases[0].sourceTransition = 'empty-file-noop';
    },
  ],
  [
    'changed physical count',
    (v) => {
      v.cases[0].inputContract.inputBytes = 1;
    },
  ],
  [
    'wrong payload digest',
    (v) => {
      v.cases[0].inputContract.corpusPayloadDigest = 'c'.repeat(64);
    },
  ],
  [
    'unknown nested field',
    (v) => {
      v.cases[0].oracle.extra = 0;
    },
  ],
  [
    'undeclared seed',
    (v) => {
      v.cases[0].seedPath = 'cases/d-cancel/absent.sqlite';
    },
  ],
  [
    'wrong capsule kind',
    (v) => {
      v.cases[0].assets[0].kind = 'SOURCE';
    },
  ],
  [
    'escaped geometry',
    (v) => {
      v.cases[0].binding.databasePath = '../outside.sqlite';
    },
  ],
  [
    'duplicate coverage',
    (v) => {
      v.cases[0].coverage.push(v.cases[0].coverage[0]);
    },
  ],
  [
    'unsafe count',
    (v) => {
      v.cases[0].inputContract.inputBytes = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'unknown coverage domain',
    (v) => {
      v.cases[0].coverage[0].role = 'GENERATOR';
    },
  ],
  [
    'changed corpus digest',
    (v) => {
      v.corpus.digest = 'd'.repeat(64);
    },
  ],
])
  test(`D5 replay manifest record rejects ${name}`, () => {
    assert.equal(typeof replay.validateRefreshReplayManifestRecord, 'function');
    const value = manifestRecordFixture();
    mutate(value);
    assert.throws(() => replay.validateRefreshReplayManifestRecord(value), {
      code: 'ERR_ASSERTION',
    });
  });

test('D5 replay encoding emits independent lexical-key and array-order bytes', () => {
  assert.equal(typeof replay.encodeRefreshReplayJson, 'function');
  const value = { z: 0, a: { 2: 'two', 10: 'ten' }, list: [true, null, false] };
  assert.deepEqual(
    replay.encodeRefreshReplayJson(value),
    Buffer.from('{"a":{"10":"ten","2":"two"},"list":[true,null,false],"z":0}\n'),
  );
  assert.deepEqual(value.list, [true, null, false]);
});

test('D5 replay encoding preserves Unicode and scalar JSON escaping', () => {
  assert.equal(typeof replay.encodeRefreshReplayJson, 'function');
  assert.deepEqual(
    replay.encodeRefreshReplayJson({ text: '中😀\n"\\', n: 9007199254740991 }),
    Buffer.from('{"n":9007199254740991,"text":"中😀\\n\\"\\\\"}\n'),
  );
});

for (const [name, value] of [
  ['negative zero', -0],
  ['unsafe integer', 9007199254740992],
  ['fraction', 1.5],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['undefined', undefined],
  ['bigint', 1n],
  ['function', () => 1],
  ['symbol', Symbol('value')],
  ['sparse array', Array(1)],
  ['unpaired high surrogate', '\ud800'],
  ['unpaired low surrogate key', { ['\udc00']: 1 }],
  ['Date', new Date(0)],
  ['custom prototype', Object.create({ inherited: true })],
])
  test(`D5 replay encoding rejects ${name} without coercing it`, () => {
    assert.equal(typeof replay.encodeRefreshReplayJson, 'function');
    assert.throws(() => replay.encodeRefreshReplayJson(value), { code: 'ERR_ASSERTION' });
  });

test('D5 replay encoding rejects getters without reading them', () => {
  assert.equal(typeof replay.encodeRefreshReplayJson, 'function');
  let reads = 0;
  const value = {
    get a() {
      reads++;
      throw new Error('GETTER_RAN');
    },
  };
  assert.throws(() => replay.encodeRefreshReplayJson(value), { code: 'ERR_ASSERTION' });
  assert.equal(reads, 0);
});

test('D5 replay encoding rejects hidden and symbol fields instead of dropping them', () => {
  assert.equal(typeof replay.encodeRefreshReplayJson, 'function');
  for (const value of [
    Object.defineProperty({}, 'hidden', { value: 1 }),
    { [Symbol('hidden')]: 1 },
  ])
    assert.throws(() => replay.encodeRefreshReplayJson(value), { code: 'ERR_ASSERTION' });
});

test('D5 replay encoding rejects a cycle but permits shared acyclic values', () => {
  assert.equal(typeof replay.encodeRefreshReplayJson, 'function');
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => replay.encodeRefreshReplayJson(cycle), { code: 'ERR_ASSERTION' });
  const shared = { n: 1 };
  assert.deepEqual(
    replay.encodeRefreshReplayJson([shared, shared]),
    Buffer.from('[{"n":1},{"n":1}]\n'),
  );
});

test('D5 replay encoding decodes independently pinned canonical bytes', () => {
  assert.equal(typeof replay.decodeRefreshReplayJson, 'function');
  const bytes = Buffer.from('{"10":2,"2":1,"array":[0,true,null]}\n');
  assert.deepEqual(replay.decodeRefreshReplayJson(bytes), { 10: 2, 2: 1, array: [0, true, null] });
  assert.deepEqual(bytes, Buffer.from('{"10":2,"2":1,"array":[0,true,null]}\n'));
});

for (const [name, text] of [
  ['duplicate object keys', '{"a":1,"a":1}\n'],
  ['nested duplicate keys', '{"a":{"b":1,"b":2}}\n'],
  ['nonlexical keys', '{"z":0,"a":1}\n'],
  ['numeric-key ordering', '{"2":1,"10":2}\n'],
  ['CRLF', '{}\r\n'],
  ['missing LF', '{}'],
  ['extra LF', '{}\n\n'],
  ['whitespace', '{ "a":1}\n'],
  ['negative zero', '{"a":-0}\n'],
  ['redundant number notation', '{"a":1e0}\n'],
  ['unpaired surrogate', '{"a":"\\ud800"}\n'],
  ['BOM', '\ufeff{}\n'],
  ['invalid JSON', '{]\n'],
])
  test(`D5 replay encoding decoder rejects ${name}`, () => {
    assert.equal(typeof replay.decodeRefreshReplayJson, 'function');
    assert.throws(() => replay.decodeRefreshReplayJson(Buffer.from(text)));
  });

test('D5 replay encoding decoder rejects malformed UTF-8 instead of replacement characters', () => {
  assert.equal(typeof replay.decodeRefreshReplayJson, 'function');
  assert.throws(() => replay.decodeRefreshReplayJson(Buffer.from([34, 255, 34, 10])));
});

test('D5 replay dependency verifies original binary and CRLF bytes without rewriting them', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
  const bytes = Buffer.from([255, 0, 13, 10]);
  const f = await fixture(t, bytes);
  const list = [dependency(f.asset)];
  assert.deepEqual(await replay.verifyRefreshReplayDependencies(f.root, list), [
    await realpath(f.file),
  ]);
  assert.deepEqual(list, [dependency(f.asset)]);
  assert.deepEqual(await readFile(f.file), bytes);
});

test('D5 replay dependency rejects one changed byte before consumer handoff', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
  const f = await fixture(t);
  await writeFile(f.file, 'abd\n');
  let consumers = 0;
  await assert.rejects(async () => {
    await replay.verifyRefreshReplayDependencies(f.root, [dependency(f.asset)]);
    consumers++;
  }, /hash/i);
  assert.equal(consumers, 0);
});

test('D5 replay dependency returns no partial list when a later dependency drifts', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
  const f = await fixture(t);
  const bytes = Buffer.from('export default 1;\n');
  await writeFile(path.join(f.root, 'worker.mjs'), bytes);
  const list = [dependency(f.asset), dependency(record('worker.mjs', bytes))];
  assert.deepEqual(await replay.verifyRefreshReplayDependencies(f.root, list), [
    await realpath(f.file),
    await realpath(path.join(f.root, 'worker.mjs')),
  ]);
  await writeFile(path.join(f.root, 'worker.mjs'), 'export default 2;\n');
  let handoffs = 0;
  await assert.rejects(async () => {
    await replay.verifyRefreshReplayDependencies(f.root, list);
    handoffs++;
  }, /hash/i);
  assert.equal(handoffs, 0);
});

for (const [name, build] of [
  ['unsorted paths', (d) => [{ ...d, path: 'z.mjs' }, d]],
  ['duplicate paths', (d) => [d, d]],
  ['sparse list', () => Array(1)],
  ['unknown field', (d) => [{ ...d, extra: 1 }]],
  ['unsafe path', (d) => [{ ...d, path: '../outside.mjs' }]],
  ['invalid digest', (d) => [{ ...d, sha256: 'x'.repeat(64) }]],
])
  test(`D5 replay dependency refuses ${name} before file lookup`, async (t) => {
    assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
    const f = await fixture(t);
    await assert.rejects(
      () =>
        replay.verifyRefreshReplayDependencies(
          path.join(f.directory, 'missing-root'),
          build(dependency(f.asset)),
        ),
      { code: 'ERR_ASSERTION' },
    );
  });

test('D5 replay dependency rejects accessor metadata without invoking getters', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
  const f = await fixture(t);
  let reads = 0;
  const item = {
    path: 'source.java',
    get sha256() {
      reads++;
      throw new Error('GETTER_RAN');
    },
  };
  await assert.rejects(() => replay.verifyRefreshReplayDependencies(f.root, [item]), {
    code: 'ERR_ASSERTION',
  });
  assert.equal(reads, 0);
});

test('D5 replay dependency rejects a directory instead of hashing it', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'nested'));
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayDependencies(f.root, [{ path: 'nested', sha256: f.asset.sha256 }]),
    /file/i,
  );
});

test('D5 replay dependency rejects a real symlink escape', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayDependencies, 'function');
  const f = await fixture(t);
  const outside = path.join(f.directory, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'worker.mjs'), 'abc\n');
  await symlink(outside, path.join(f.root, 'escape'), 'junction');
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayDependencies(f.root, [
        { path: 'escape/worker.mjs', sha256: f.asset.sha256 },
      ]),
    /escape/i,
  );
});

test('D5 replay manifest asset verifies exact bytes without rewriting the file', async (t) => {
  const f = await fixture(t);
  assert.equal(await verify(f.root, f.asset), await realpath(f.file));
  assert.deepEqual(await readFile(f.file), Buffer.from('abc\n'));
});

test('D5 replay manifest asset rejects a changed source byte before a consumer runs', async (t) => {
  const f = await fixture(t);
  await writeFile(f.file, 'abd\n'); // Same byte count; only the independent hash changes.
  let consumers = 0;
  await assert.rejects(async () => {
    await verify(f.root, f.asset);
    consumers++;
  }, /hash/i);
  assert.equal(consumers, 0);
});

test('D5 replay manifest asset rejects a wrong physical byte count', async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => verify(f.root, { ...f.asset, bytes: 3 }), /bytes/i);
});

test('D5 replay manifest asset validates empty files and streamed multibyte UTF8', async (t) => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('a'.repeat(65_535) + '😀\n')]) {
    const f = await fixture(t, bytes);
    assert.equal(await verify(f.root, f.asset), await realpath(f.file));
    assert.deepEqual(await readFile(f.file), bytes);
  }
});

test('D5 replay manifest asset uses raw closed SQLite file bytes, not TEXT charge', async (t) => {
  const f = await fixture(t);
  const databasePath = path.join(f.root, 'baseline.sqlite');
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA user_version=1');
  } finally {
    db.close();
  }
  // This tests physical asset integrity only, not a qualified Canonical baseline.
  const bytes = await readFile(databasePath);
  assert.equal(
    await verify(f.root, record('baseline.sqlite', bytes, 'SQLITE')),
    await realpath(databasePath),
  );
  assert.deepEqual(await readFile(databasePath), bytes);
});

for (const [name, bytes, pattern] of [
  ['invalid UTF8', Buffer.from([0xff]), /encoding|utf.?8/i],
  ['CRLF', Buffer.from('abc\r\n'), /LF/i],
])
  test(`D5 replay manifest asset refuses ${name} without normalizing its hash`, async (t) => {
    const f = await fixture(t, bytes);
    await assert.rejects(() => verify(f.root, f.asset), pattern);
    assert.deepEqual(await readFile(f.file), bytes);
  });

for (const name of [
  '../source.java',
  '/source.java',
  'sub\\source.java',
  'source.java:stream',
  './source.java',
  'sub//source.java',
])
  test(`D5 replay manifest asset rejects noncanonical path ${name}`, async (t) => {
    const f = await fixture(t);
    await assert.rejects(() => verify(f.root, { ...f.asset, path: name }), /path/i);
  });

for (const [name, modify] of [
  ['extra key', (a) => ({ ...a, eligible: true })],
  ['hidden key', (a) => Object.defineProperty({ ...a }, 'extra', { value: 1 })],
  ['missing kind', ({ kind, ...a }) => a],
  ['unknown kind', (a) => ({ ...a, kind: 'AST' })],
  ['unsafe bytes', (a) => ({ ...a, bytes: Number.MAX_SAFE_INTEGER + 1 })],
  ['uppercase hash', (a) => ({ ...a, sha256: a.sha256.toUpperCase() })],
])
  test(`D5 replay manifest asset rejects ${name}`, async (t) => {
    const f = await fixture(t);
    await assert.rejects(() => verify(f.root, modify(f.asset)), /asset/i);
  });

test('D5 replay manifest asset rejects a directory as a file', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'directory'));
  await assert.rejects(() => verify(f.root, { ...f.asset, path: 'directory' }));
});

test('D5 replay manifest asset refuses actual junction escape before a consumer runs', async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.directory, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'source.java'), 'abc\n');
  await symlink(
    outside,
    path.join(f.root, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  let consumers = 0;
  await assert.rejects(async () => {
    await verify(f.root, { ...f.asset, path: 'escape/source.java' });
    consumers++;
  }, /escape|confined/i);
  assert.equal(consumers, 0);
  assert.equal(await readFile(path.join(outside, 'source.java'), 'utf8'), 'abc\n');
});

// These are inventory/physical-integrity tests, not a qualified 22-case corpus.
test('D5 replay manifest asset list returns paths only after all real files verify', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayAssets, 'function');
  const f = await fixture(t);
  const oracle = Buffer.from('{"expected":[]}\n');
  await writeFile(path.join(f.root, 'oracle.json'), oracle);
  const records = [record('oracle.json', oracle, 'ORACLE'), f.asset];
  assert.deepEqual(await replay.verifyRefreshReplayAssets(f.root, records), [
    await realpath(path.join(f.root, 'oracle.json')),
    await realpath(f.file),
  ]);
  assert.deepEqual(await readFile(path.join(f.root, 'oracle.json')), oracle);
});

test('D5 replay manifest asset list refuses a changed final asset before consumer handoff', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayAssets, 'function');
  const f = await fixture(t);
  const early = Buffer.from('{}\n');
  await writeFile(path.join(f.root, 'oracle.json'), early);
  await writeFile(f.file, 'abd\n');
  let consumers = 0;
  await assert.rejects(async () => {
    await replay.verifyRefreshReplayAssets(f.root, [
      record('oracle.json', early, 'ORACLE'),
      f.asset,
    ]);
    consumers++;
  }, /hash/i);
  assert.equal(consumers, 0);
  assert.deepEqual(await readFile(path.join(f.root, 'oracle.json')), early);
});

for (const [name, records] of [
  ['duplicate path', (a) => [a, { ...a }]],
  ['unsorted path', (a) => [{ ...a, path: 'z.java' }, a]],
  ['sparse array', (a) => Object.assign(new Array(2), { 1: a })],
  ['unknown array field', (a) => Object.assign([a], { eligible: true })],
])
  test(`D5 replay manifest asset list refuses ${name} before file lookup`, async (t) => {
    assert.equal(typeof replay.verifyRefreshReplayAssets, 'function');
    const f = await fixture(t);
    // Nonexistent root makes an accidental lookup observably different from structural refusal.
    await assert.rejects(
      () => replay.verifyRefreshReplayAssets(path.join(f.directory, 'absent'), records(f.asset)),
      /asset list/i,
    );
  });

test('D5 replay manifest case inventory accepts exactly the existing 22 names without mutating order', () => {
  assert.equal(typeof replay.validateRefreshReplayCaseNames, 'function');
  const names = [...refreshTransportCases].reverse();
  const before = [...names];
  const result = replay.validateRefreshReplayCaseNames(names);
  assert.deepEqual(result, [...refreshTransportCases].sort());
  assert.notEqual(result, names);
  assert.deepEqual(names, before);
});

for (const [name, mutate] of [
  ['missing case', (names) => names.slice(1)],
  ['duplicate replacing case', (names) => [names[1], ...names.slice(1)]],
  ['unknown replacing case', (names) => ['d-not-approved', ...names.slice(1)]],
  ['extra case', (names) => [...names, 'd-not-approved']],
  [
    'sparse slot',
    (names) => {
      delete names[0];
      return names;
    },
  ],
  ['unknown array field', (names) => Object.assign(names, { eligible: true })],
])
  test(`D5 replay manifest case inventory refuses ${name} before consumer handoff`, () => {
    assert.equal(typeof replay.validateRefreshReplayCaseNames, 'function');
    let consumers = 0;
    assert.throws(() => {
      replay.validateRefreshReplayCaseNames(mutate([...refreshTransportCases]));
      consumers++;
    }, /case inventory/i);
    assert.equal(consumers, 0);
  });

// Binding qualification only: not a measured worker or a complete immutable corpus.
const boundReplayChild = `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { createHash } from 'node:crypto';
  import { DatabaseSync } from 'node:sqlite';
  import * as storage from './packages/storage/dist/index.js';
  import * as providers from './packages/providers/dist/index.js';
  import { createNativeRefreshPreparation } from './packages/runtime/dist/native-refresh-preparation.js';
  import { applyPreparedNativeRefreshAnalysisV3 } from './packages/runtime/dist/native-refresh-workspace.js';
  import { captureRefreshSnapshotMetadata } from './packages/runtime/test/helpers/native-refresh-transport-worker.mjs';
  const capsule = JSON.parse(readFileSync(0, 'utf8'));
  const db = new DatabaseSync(capsule.databasePath);
  try {
    assert.equal(db.prepare('SELECT root_path FROM repository').get().root_path,
      capsule.invocation.payload.repository.rootPath, 'Replay binding differs before Native preparation');
    const budget = capsule.invocation.payload.resourceBudget.maxMemoryBytes;
    const baseline = storage.readNativeRefreshBaseline(db, capsule.invocation.trustedContext,
      providers.validateNativeStateCandidate, {maxSerializedBytes: 1_000_000, memoryBudgetBytes: budget});
    const prepared = createNativeRefreshPreparation(capsule.invocation, baseline, budget, capsule.options);
    const raw = providers.encodeNativeRefreshRequestV3(prepared.request, prepared.baseline,
      providers.NATIVE_CLIENT_HARD_LIMITS, budget);
    const wire = Buffer.from(raw);
    const input = {bytes: wire.length, sha256: createHash('sha256').update(wire).digest('hex')};
    const captured = await captureRefreshSnapshotMetadata(
      () => applyPreparedNativeRefreshAnalysisV3(db, prepared, capsule.options),
      [{role:'MAIN',snapshotId:capsule.invocation.payload.providerSnapshotId}]);
    if (captured.threw) throw captured.error;
    assert.equal(captured.captureFailed, false);
    const temp = db.prepare('SELECT type, name FROM sqlite_temp_master').all();
    // SQLite retains its AUTOINCREMENT catalog after the owned patch tables drop.
    const tempCount = temp.filter(row => row.type !== 'table' || row.name !== 'sqlite_sequence').length;
    assert.equal(tempCount, 0, JSON.stringify(temp));
    if (temp.length) assert.equal(db.prepare('SELECT count(*) AS n FROM temp.sqlite_sequence').get().n, 0);
    assert.equal(db.isTransaction, false);
    process.stdout.write(JSON.stringify({pid: process.pid, input, tempCount, transactionOpen: db.isTransaction,
      snapshotMetadata:captured.metadata}));
  } finally { db.close(); }
`;

async function boundSeedFixture(t) {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-bound-seed-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = await realpath(parent);
  const workspace = path.join(root, 'trial');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
    1,
    undefined,
    workspace,
  );
  f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  f.db.close();
  const seedPath = path.join(root, 'seed.sqlite');
  await copyFile(f.databasePath, seedPath);
  const bytes = await readFile(seedPath);
  return { root, workspace, seedPath, bytes, seed: record('seed.sqlite', bytes, 'SQLITE') };
}

test('D5 replay root binding verifies the persisted identity without rewriting the closed seed', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await boundSeedFixture(t);
  assert.equal(
    await replay.verifyRefreshReplayRootBinding(f.root, f.seed, 'trial', 'repo-fixture'),
    f.workspace,
  );
  assert.deepEqual(await readFile(f.seedPath), f.bytes);
});

test('D5 replay root binding refuses relocation before consumer handoff', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await boundSeedFixture(t);
  await mkdir(path.join(f.root, 'relocated'));
  let consumers = 0;
  await assert.rejects(async () => {
    await replay.verifyRefreshReplayRootBinding(f.root, f.seed, 'relocated', 'repo-fixture');
    consumers++;
  }, /binding/i);
  assert.equal(consumers, 0);
  assert.deepEqual(await readFile(f.seedPath), f.bytes);
});

test('D5 replay root binding refuses a different repository identity', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await boundSeedFixture(t);
  await assert.rejects(
    () => replay.verifyRefreshReplayRootBinding(f.root, f.seed, 'trial', 'another-repository'),
    /binding/i,
  );
  assert.deepEqual(await readFile(f.seedPath), f.bytes);
});

test('D5 replay root binding refuses an internal directory alias that changes request-visible geometry', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await boundSeedFixture(t);
  await symlink(f.workspace, path.join(f.root, 'alias'), 'junction');
  await assert.rejects(
    () => replay.verifyRefreshReplayRootBinding(f.root, f.seed, 'alias', 'repo-fixture'),
    /canonical/i,
  );
});

test('D5 replay root binding refuses a real directory escape', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await fixture(t);
  const outside = path.join(f.directory, 'outside');
  await mkdir(outside);
  await symlink(outside, path.join(f.root, 'escape'), 'junction');
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayRootBinding(
        f.root,
        { ...f.asset, kind: 'SQLITE' },
        'escape',
        'repo-fixture',
      ),
    /escape/i,
  );
});

test('D5 replay root binding refuses a file instead of a workspace directory', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await fixture(t);
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayRootBinding(
        f.root,
        { ...f.asset, kind: 'SQLITE' },
        'source.java',
        'repo-fixture',
      ),
    /directory/i,
  );
});

for (const [name, workspace, repositoryId, kind] of [
  ['traversal', '../trial', 'repo-fixture', 'SQLITE'],
  ['empty identity', 'trial', '', 'SQLITE'],
  ['non-SQLite seed', 'trial', 'repo-fixture', 'SOURCE'],
])
  test(`D5 replay root binding refuses ${name} before file lookup`, async (t) => {
    assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
    const f = await fixture(t);
    await assert.rejects(
      () =>
        replay.verifyRefreshReplayRootBinding(
          path.join(f.directory, 'missing-root'),
          { ...f.asset, kind },
          workspace,
          repositoryId,
        ),
      { code: 'ERR_ASSERTION' },
    );
  });

test('D5 replay root binding refuses a changed physical seed before consumer handoff', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayRootBinding, 'function');
  const f = await boundSeedFixture(t);
  const changed = Buffer.from(f.bytes);
  changed[changed.length - 1] ^= 1;
  await writeFile(f.seedPath, changed);
  let consumers = 0;
  await assert.rejects(async () => {
    await replay.verifyRefreshReplayRootBinding(f.root, f.seed, 'trial', 'repo-fixture');
    consumers++;
  }, /hash/i);
  assert.equal(consumers, 0);
  assert.deepEqual(await readFile(f.seedPath), changed);
});

test('D5 replay binding bootstraps at the intended root and replays a closed seed in fresh processes', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-bound-replay-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(await realpath(parent), 'trial');
  const row = sourceTransitions.find((r) => r.id === 'modify-call-target');
  const f = await preparedSourceRefresh(t, row, 1, undefined, root);
  assert.equal(f.prepared.request.payload.repository.rootPath, root);
  assert.equal(f.databasePath, path.join(root, 'repository.sqlite'));
  assert.equal(f.db.prepare('SELECT root_path FROM repository').get().root_path, root);
  const raw = encodeNativeRefreshRequestV3(
    f.prepared.request,
    f.prepared.baseline,
    NATIVE_CLIENT_HARD_LIMITS,
    f.prepared.limits.memoryBudgetBytes,
  );
  const input = { bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
  const {
    baseRevisionId,
    baseRevisionFingerprint,
    baselineState,
    changes,
    targetSourceFiles,
    ...payload
  } = f.prepared.request.payload;
  // Only invocation/control data crosses the boundary, never cached summaries or expected graph.
  const capsule = {
    databasePath: f.databasePath,
    invocation: {
      requestId: f.prepared.request.requestId,
      descriptor: f.prepared.descriptor,
      trustedContext: f.prepared.trustedContext,
      payload,
    },
    options: f.options,
  };
  assert.equal('baselineState' in capsule.invocation.payload, false);
  f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  assert.equal(f.db.isTransaction, false);
  f.db.close();
  const seed = path.join(parent, 'seed.sqlite');
  await copyFile(f.databasePath, seed);
  const seedBytes = await readFile(seed);
  const seedAsset = record('seed.sqlite', seedBytes, 'SQLITE');
  const pids = new Set();
  for (let trial = 0; trial < 2; trial++) {
    assert.equal(
      await replay.verifyRefreshReplayRootBinding(parent, seedAsset, 'trial', 'repo-fixture'),
      root,
    );
    // Restore only this owned, closed fixture database at the original bound location.
    await copyFile(seed, f.databasePath);
    const child = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', boundReplayChild],
      { input: JSON.stringify(capsule), encoding: 'utf8', env: f.options.allowedEnvironment },
    );
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const result = JSON.parse(child.stdout);
    assert.notEqual(result.pid, process.pid);
    pids.add(result.pid);
    assert.deepEqual(result.input, input);
    assert.equal(result.tempCount, 0);
    assert.equal(result.transactionOpen, false);
    const db = new DatabaseSync(f.databasePath);
    try {
      assertSourceRelations(db, row.relations); // Independent frozen source golden, outside child.
      assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
      assert.equal(
        db.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get().fp,
        f.targetRevision.contentFingerprint,
      );
      assert.equal(db.prepare('SELECT root_path FROM repository').get().root_path, root);
    } finally {
      db.close();
    }
    assert.deepEqual(await readFile(seed), seedBytes);
  }
  assert.equal(pids.size, 2);
  const relocatedRoot = path.join(parent, 'relocated');
  await mkdir(relocatedRoot);
  const relocated = structuredClone(capsule);
  relocated.databasePath = path.join(relocatedRoot, 'repository.sqlite');
  relocated.invocation.payload.repository.rootPath = relocatedRoot;
  await copyFile(seed, relocated.databasePath);
  const refused = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', boundReplayChild],
    { input: JSON.stringify(relocated), encoding: 'utf8', env: f.options.allowedEnvironment },
  );
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Replay binding differs before Native preparation/);
  const db = new DatabaseSync(relocated.databasePath);
  try {
    assert.equal(db.prepare('SELECT root_path FROM repository').get().root_path, root);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
    assertSourceRelations(db, row.baselineRelations);
  } finally {
    db.close();
  }
  assert.deepEqual(await readFile(seed), seedBytes);
});

test('D5 replay binding refuses an existing directory without overwriting its sentinel', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeatlas-bound-existing-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await writeFile(path.join(parent, 'sentinel'), 'keep');
  await assert.rejects(
    () =>
      preparedSourceRefresh(
        t,
        sourceTransitions.find((r) => r.id === 'modify-call-target'),
        1,
        undefined,
        parent,
      ),
    { code: 'EEXIST' },
  );
  assert.equal(await readFile(path.join(parent, 'sentinel'), 'utf8'), 'keep');
});

async function preservedOracleFixture(t, transition = 'modify-call-target') {
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === transition),
  );
  const root = path.dirname(f.databasePath);
  const oraclePath = path.join(root, 'oracle.sqlite');
  f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  f.db.close();
  await copyFile(f.databasePath, oraclePath);
  const bytes = await readFile(oraclePath);
  return { ...f, root, oraclePath, oracle: record('oracle.sqlite', bytes, 'SQLITE'), bytes };
}

for (const suffix of ['-wal', '-shm', '-journal'])
  test(`D5 cancellation prefix closed result refuses retained ${suffix}`, async (t) => {
    const f = await preservedOracleFixture(t);
    const relative = path.basename(f.databasePath);
    assert.equal(
      await replay.verifyRefreshReplayPreservedSourceActivation(f.root, relative, f.oracle),
      true,
    );
    const sidecar = f.databasePath + suffix;
    await writeFile(sidecar, Buffer.alloc(0), { flag: 'wx' });
    await assert.rejects(
      () => replay.verifyRefreshReplayPreservedSourceActivation(f.root, relative, f.oracle),
      /sidecar/i,
    );
  });

test('D5 cancellation prefix independence refuses reused artifact or original process', async () => {
  const { assertRefreshPrefixOriginDistinct } =
    await import('./helpers/native-refresh-cancel-prefix.mjs');
  assert.equal(typeof assertRefreshPrefixOriginDistinct, 'function');
  const seen = new Set();
  const original = { artifactSha256: 'a'.repeat(64), processNonce: 'original-process' };
  assertRefreshPrefixOriginDistinct(seen, original);
  assert.throws(() => assertRefreshPrefixOriginDistinct(seen, { ...original }), /reused/i);
  assert.throws(
    () => assertRefreshPrefixOriginDistinct(seen, { ...original, artifactSha256: 'b'.repeat(64) }),
    /reused/i,
  );
  assert.throws(
    () => assertRefreshPrefixOriginDistinct(seen, { ...original, processNonce: 'other-process' }),
    /reused/i,
  );
  assertRefreshPrefixOriginDistinct(seen, {
    artifactSha256: 'b'.repeat(64),
    processNonce: 'other-process',
  });
});

async function metadataStateFixture(t) {
  const f = await preservedOracleFixture(t);
  const {
    baseRevisionId,
    baseRevisionFingerprint,
    baselineState,
    changes,
    targetSourceFiles,
    ...payload
  } = f.prepared.request.payload;
  const capsule = {
    databasePath: f.databasePath,
    invocation: {
      requestId: f.prepared.request.requestId,
      descriptor: f.prepared.descriptor,
      trustedContext: f.prepared.trustedContext,
      payload,
    },
    options: f.options,
  };
  function run() {
    const child = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', boundReplayChild],
      { input: JSON.stringify(capsule), encoding: 'utf8', env: f.options.allowedEnvironment },
    );
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const result = JSON.parse(child.stdout);
    assert.equal(result.transactionOpen, false);
    assert.equal(result.tempCount, 0);
    return result;
  }
  const reference = run();
  const referencePath = path.join(f.root, 'reference.sqlite');
  await copyFile(f.databasePath, referencePath);
  const referenceBytes = await readFile(referencePath);
  // Both independent fresh children use the same generated original binding and
  // closed seed. No expected facts are obtained from the second child's result.
  await copyFile(f.oraclePath, f.databasePath);
  const actual = run();
  assert.notEqual(actual.pid, reference.pid);
  const db = new DatabaseSync(f.databasePath, { readOnly: true });
  try {
    assertSourceRelations(
      db,
      sourceTransitions.find((row) => row.id === 'modify-call-target').relations,
    );
  } finally {
    db.close();
  }
  return {
    ...f,
    referencePath,
    referenceBytes,
    referenceAsset: record('reference.sqlite', referenceBytes, 'SQLITE'),
    parameters: {
      reference: reference.snapshotMetadata,
      actual: actual.snapshotMetadata,
      snapshots: [{ role: 'MAIN', snapshotId: 'snapshot-source-refresh' }],
    },
  };
}

test('D5 replay verification binds only independently captured new snapshot timestamps', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayBoundSourceActivation, 'function');
  const f = await metadataStateFixture(t);
  assert.notEqual(
    f.parameters.reference.entries[0].startedAt,
    f.parameters.actual.entries[0].startedAt,
  );
  assert.equal(
    await replay.verifyRefreshReplayPreservedSourceActivation(
      f.root,
      'repository.sqlite',
      f.referenceAsset,
    ),
    false,
  );
  const before = await readFile(f.databasePath);
  assert.equal(
    await replay.verifyRefreshReplayBoundSourceActivation(
      f.root,
      'repository.sqlite',
      f.referenceAsset,
      f.parameters,
    ),
    true,
  );
  assert.deepEqual(await readFile(f.referencePath), f.referenceBytes);
  assert.deepEqual(await readFile(f.databasePath), before);
});

for (const [name, sql] of [
  [
    'new snapshot time',
    "UPDATE provider_snapshots SET completed_at=completed_at+1 WHERE id='snapshot-source-refresh'",
  ],
  [
    'seed snapshot time',
    "UPDATE provider_snapshots SET completed_at=completed_at+1 WHERE id='snapshot-source-bootstrap'",
  ],
  [
    'Evidence',
    "UPDATE evidence SET status='INVALIDATED' WHERE id=(SELECT id FROM evidence LIMIT 1)",
  ],
  [
    'binding',
    "UPDATE provider_fact_bindings SET provider_fact_id=provider_fact_id||'-tampered' WHERE rowid=(SELECT rowid FROM provider_fact_bindings LIMIT 1)",
  ],
  [
    'R010',
    "UPDATE native_analysis_file SET summary_json=json_set(summary_json,'$.tampered',1) WHERE rowid=(SELECT rowid FROM native_analysis_file LIMIT 1)",
  ],
  [
    'pointer',
    "UPDATE repository_state SET indexed_content_fingerprint='sha256:'||printf('%064d',0)",
  ],
]) {
  test(`D5 replay verification cannot hide changed ${name} through timestamp binding`, async (t) => {
    assert.equal(typeof replay.verifyRefreshReplayBoundSourceActivation, 'function');
    const f = await metadataStateFixture(t);
    const db = new DatabaseSync(f.databasePath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
    assert.equal(
      await replay.verifyRefreshReplayBoundSourceActivation(
        f.root,
        'repository.sqlite',
        f.referenceAsset,
        f.parameters,
      ),
      false,
    );
    assert.deepEqual(await readFile(f.referencePath), f.referenceBytes);
  });
}

test('D5 replay verification rejects missing foreign extra or clock-incoherent metadata bindings', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayBoundSourceActivation, 'function');
  const f = await metadataStateFixture(t);
  const mutations = [
    (p) => {
      p.actual.entries = [];
    },
    (p) => {
      p.actual.entries.push({ ...p.actual.entries[0] });
    },
    (p) => {
      p.actual.entries[0].role = 'COMPETITOR';
    },
    (p) => {
      p.reference.entries[0].snapshotId = 'snapshot-source-bootstrap';
    },
    (p) => {
      p.actual.entries[0].extra = true;
    },
    (p) => {
      p.actual.invocationFinishedAt = p.actual.entries[0].startedAt - 1;
    },
    (p) => {
      p.actual.entries[0].startedAt = -0;
    },
    (p) => {
      p.reference.entries[0].completedAt += 1;
    },
  ];
  for (const mutate of mutations) {
    const parameters = structuredClone(f.parameters);
    mutate(parameters);
    await assert.rejects(() =>
      replay.verifyRefreshReplayBoundSourceActivation(
        f.root,
        'repository.sqlite',
        f.referenceAsset,
        parameters,
      ),
    );
  }
  assert.deepEqual(await readFile(f.referencePath), f.referenceBytes);
});

test('D5 replay preservation oracle accepts unchanged activation without rewriting either database', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedActivation, 'function');
  const f = await preservedOracleFixture(t);
  const resultBefore = await readFile(f.databasePath);
  assert.equal(
    await replay.verifyRefreshReplayPreservedActivation(f.root, 'repository.sqlite', f.oracle),
    true,
  );
  assert.deepEqual(await readFile(f.databasePath), resultBefore);
  assert.deepEqual(await readFile(f.oraclePath), f.bytes);
});

for (const [name, sql] of [
  [
    'Evidence',
    "UPDATE evidence SET status='INVALIDATED' WHERE id=(SELECT id FROM evidence LIMIT 1)",
  ],
  [
    'binding',
    "UPDATE provider_fact_bindings SET provider_fact_id=provider_fact_id||'-tampered' WHERE rowid=(SELECT rowid FROM provider_fact_bindings LIMIT 1)",
  ],
  [
    'R010 summary',
    "UPDATE native_analysis_file SET summary_json=json_set(summary_json,'$.tampered',1) WHERE rowid=(SELECT rowid FROM native_analysis_file LIMIT 1)",
  ],
  [
    'indexed pointer',
    "UPDATE repository_state SET indexed_content_fingerprint='sha256:'||printf('%064d',0)",
  ],
])
  test(`D5 replay preservation oracle rejects altered ${name} against pre-execution seed`, async (t) => {
    assert.equal(typeof replay.verifyRefreshReplayPreservedActivation, 'function');
    const f = await preservedOracleFixture(t);
    const db = new DatabaseSync(f.databasePath);
    try {
      assert.equal(db.prepare(sql).run().changes, 1);
    } finally {
      db.close();
    }
    const changed = await readFile(f.databasePath);
    assert.equal(
      await replay.verifyRefreshReplayPreservedActivation(f.root, 'repository.sqlite', f.oracle),
      false,
    );
    assert.deepEqual(await readFile(f.databasePath), changed);
    assert.deepEqual(await readFile(f.oraclePath), f.bytes);
  });

test('D5 replay preservation oracle rejects result-as-oracle including a real hardlink alias', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedActivation, 'function');
  const f = await preservedOracleFixture(t);
  const borrowed = record('repository.sqlite', await readFile(f.databasePath), 'SQLITE');
  await assert.rejects(
    () => replay.verifyRefreshReplayPreservedActivation(f.root, 'repository.sqlite', borrowed),
    /independent/i,
  );
  await link(f.databasePath, path.join(f.root, 'alias.sqlite'));
  await assert.rejects(
    () => replay.verifyRefreshReplayPreservedActivation(f.root, 'alias.sqlite', borrowed),
    /independent/i,
  );
});

test('D5 replay preservation oracle refuses changed oracle bytes instead of adopting new expected state', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedActivation, 'function');
  const f = await preservedOracleFixture(t);
  const db = new DatabaseSync(f.oraclePath);
  try {
    db.exec("UPDATE evidence SET status='INVALIDATED'");
  } finally {
    db.close();
  }
  await assert.rejects(
    () => replay.verifyRefreshReplayPreservedActivation(f.root, 'repository.sqlite', f.oracle),
    /hash/i,
  );
});

test('D5 replay preservation oracle verifies original activation after real bad-checksum transport refusal', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedActivation, 'function');
  const f = await preservedOracleFixture(t, 'empty-file-noop');
  const db = new DatabaseSync(f.databasePath);
  try {
    await assert.rejects(
      () =>
        applyPreparedNativeRefreshAnalysisV3(db, f.prepared, {
          ...f.options,
          executablePath: process.execPath,
          arguments: [
            fileURLToPath(new URL('./helpers/native-refresh-fault-process.mjs', import.meta.url)),
            'bad-checksum',
          ],
        }),
      { code: 'CHECKSUM_MISMATCH' },
    );
    assert.equal(db.isTransaction, false);
  } finally {
    db.close();
  }
  assert.equal(
    await replay.verifyRefreshReplayPreservedActivation(f.root, 'repository.sqlite', f.oracle),
    true,
  );
  assert.deepEqual(await readFile(f.oraclePath), f.bytes);
});

async function graphOracleFixture(t, transition = 'modify-call-target') {
  const row = sourceTransitions.find((r) => r.id === transition);
  const f = await preparedSourceRefresh(t, row);
  // Independent FULL target bootstrap and frozen source golden, before REFRESH.
  const full = await preparedSourceRefresh(t, {
    ...row,
    baseline: row.target,
    baselineRelations: row.relations,
  });
  assertSourceRelations(full.db, row.relations);
  full.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  full.db.close();
  const root = path.dirname(f.databasePath);
  const oraclePath = path.join(root, 'full-target.sqlite');
  await copyFile(full.databasePath, oraclePath);
  const bytes = await readFile(oraclePath);
  const oracle = record('full-target.sqlite', bytes, 'SQLITE');
  await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
  assertSourceRelations(f.db, row.relations);
  assert.equal(f.db.isTransaction, false);
  f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  f.db.close();
  return { ...f, root, oraclePath, oracle, bytes };
}

for (const transition of [
  'modify-call-target',
  'add-class-method-unknown-to-resolved',
  'delete-class-resolved-to-unknown',
  'same-arity-overload-resolved-to-ambiguous',
])
  test(`D5 replay graph oracle matches independent target FULL for ${transition}`, async (t) => {
    assert.equal(typeof replay.compareRefreshReplayCanonicalGraph, 'function');
    const f = await graphOracleFixture(t, transition);
    const actualBefore = await readFile(f.databasePath);
    const comparison = await replay.compareRefreshReplayCanonicalGraph(
      f.root,
      'repository.sqlite',
      f.oracle,
    );
    assert.ok(comparison.entries.length > 0);
    assert.ok(
      comparison.entries.every(
        (entry) => entry.classification === null && entry.differences.length === 0,
      ),
    );
    assert.deepEqual(await readFile(f.databasePath), actualBefore);
    assert.deepEqual(await readFile(f.oraclePath), f.bytes);
  });

for (const [name, sql, classification, difference] of [
  [
    'missing node',
    'DELETE FROM canonical_nodes WHERE rowid=(SELECT rowid FROM canonical_nodes LIMIT 1)',
    'MISSING',
    null,
  ],
  [
    'extra node',
    `INSERT INTO canonical_nodes SELECT revision_id,id||'-extra',repository_id,fact_key||'-extra',kind,type_kind,symbol_kind,name,qualified_name,source_range_json,confidence_score,confidence_method,confidence_reasons_json FROM canonical_nodes LIMIT 1`,
    'EXTRA',
    null,
  ],
  [
    'missing edge',
    'DELETE FROM canonical_edges WHERE rowid=(SELECT rowid FROM canonical_edges LIMIT 1)',
    'MISSING',
    null,
  ],
  [
    'extra edge',
    `INSERT INTO canonical_edges SELECT revision_id,id||'-extra',repository_id,fact_key||'-extra',kind,source_node_id,target_state,resolution,target_node_id,source_range_json,confidence_score,confidence_method,confidence_reasons_json FROM canonical_edges LIMIT 1`,
    'EXTRA',
    null,
  ],
  [
    'node name',
    "UPDATE canonical_nodes SET name=name||'-changed' WHERE rowid=(SELECT rowid FROM canonical_nodes LIMIT 1)",
    null,
    'SEMANTIC_DIFFERENCE',
  ],
  [
    'node confidence',
    "UPDATE canonical_nodes SET confidence_method=confidence_method||'-changed' WHERE rowid=(SELECT rowid FROM canonical_nodes LIMIT 1)",
    null,
    'SEMANTIC_DIFFERENCE',
  ],
  [
    'edge range',
    'UPDATE canonical_edges SET source_range_json=NULL WHERE rowid=(SELECT rowid FROM canonical_edges WHERE source_range_json IS NOT NULL LIMIT 1)',
    null,
    'SEMANTIC_DIFFERENCE',
  ],
  [
    'target resolution',
    "UPDATE canonical_edges SET resolution='HEURISTIC' WHERE rowid=(SELECT rowid FROM canonical_edges WHERE resolution='EXACT' LIMIT 1)",
    null,
    'RESOLUTION_DIFFERENCE',
  ],
])
  test(`D5 replay graph oracle detects ${name} without adopting result as expected`, async (t) => {
    assert.equal(typeof replay.compareRefreshReplayCanonicalGraph, 'function');
    const f = await graphOracleFixture(t);
    const db = new DatabaseSync(f.databasePath);
    try {
      assert.equal(db.prepare(sql).run().changes, 1);
    } finally {
      db.close();
    }
    const changed = await readFile(f.databasePath);
    const comparison = await replay.compareRefreshReplayCanonicalGraph(
      f.root,
      'repository.sqlite',
      f.oracle,
    );
    assert.ok(
      comparison.entries.some((entry) =>
        classification
          ? entry.classification === classification
          : entry.differences.some((item) => item.kind === difference),
      ),
    );
    assert.deepEqual(await readFile(f.databasePath), changed);
    assert.deepEqual(await readFile(f.oraclePath), f.bytes);
  });

test('D5 replay graph oracle refuses same-result and hardlink aliases', async (t) => {
  assert.equal(typeof replay.compareRefreshReplayCanonicalGraph, 'function');
  const f = await graphOracleFixture(t);
  const borrowed = record('repository.sqlite', await readFile(f.databasePath), 'SQLITE');
  await assert.rejects(
    () => replay.compareRefreshReplayCanonicalGraph(f.root, 'repository.sqlite', borrowed),
    /independent/i,
  );
  await link(f.databasePath, path.join(f.root, 'graph-alias.sqlite'));
  await assert.rejects(
    () => replay.compareRefreshReplayCanonicalGraph(f.root, 'graph-alias.sqlite', borrowed),
    /independent/i,
  );
});

test('D5 replay graph oracle refuses changed oracle bytes', async (t) => {
  assert.equal(typeof replay.compareRefreshReplayCanonicalGraph, 'function');
  const f = await graphOracleFixture(t);
  const db = new DatabaseSync(f.oraclePath);
  try {
    db.exec("UPDATE canonical_nodes SET name=name||'-changed'");
  } finally {
    db.close();
  }
  await assert.rejects(
    () => replay.compareRefreshReplayCanonicalGraph(f.root, 'repository.sqlite', f.oracle),
    /hash/i,
  );
});

test('D5 replay graph oracle refuses invalid Canonical IR instead of dropping confidence data', async (t) => {
  assert.equal(typeof replay.compareRefreshReplayCanonicalGraph, 'function');
  const f = await graphOracleFixture(t);
  const db = new DatabaseSync(f.databasePath);
  try {
    db.exec("UPDATE canonical_nodes SET confidence_reasons_json='[1]'");
  } finally {
    db.close();
  }
  await assert.rejects(
    () => replay.compareRefreshReplayCanonicalGraph(f.root, 'repository.sqlite', f.oracle),
    { code: 'INPUT_INVALID' },
  );
});

for (const [name, sql] of [
  [
    'unresolved hint',
    "UPDATE unresolved_targets SET original_hint=original_hint||'-changed' WHERE rowid=(SELECT rowid FROM unresolved_targets LIMIT 1)",
  ],
  [
    'ordered candidates',
    "UPDATE unresolved_targets SET candidates_json=json_array(json_extract(candidates_json,'$[1]'),json_extract(candidates_json,'$[0]')) WHERE rowid=(SELECT rowid FROM unresolved_targets WHERE json_array_length(candidates_json)=2 LIMIT 1)",
  ],
])
  test(`D5 replay graph oracle detects altered ${name}`, async (t) => {
    const f = await graphOracleFixture(t, 'same-arity-overload-resolved-to-ambiguous');
    const db = new DatabaseSync(f.databasePath);
    try {
      assert.equal(db.prepare(sql).run().changes, 1);
    } finally {
      db.close();
    }
    const comparison = await replay.compareRefreshReplayCanonicalGraph(
      f.root,
      'repository.sqlite',
      f.oracle,
    );
    assert.ok(
      comparison.entries.some((entry) =>
        entry.differences.some((item) => item.kind === 'RESOLUTION_DIFFERENCE'),
      ),
    );
    assert.deepEqual(await readFile(f.oraclePath), f.bytes);
  });

test('D5 replay graph oracle refuses missing unresolved target rows', async (t) => {
  const f = await graphOracleFixture(t, 'delete-class-resolved-to-unknown');
  const db = new DatabaseSync(f.databasePath);
  try {
    assert.equal(db.prepare('DELETE FROM unresolved_targets').run().changes, 1);
  } finally {
    db.close();
  }
  await assert.rejects(() =>
    replay.compareRefreshReplayCanonicalGraph(f.root, 'repository.sqlite', f.oracle),
  );
});

test('D5 replay source activation oracle accepts the closed seed without rewriting files', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedSourceActivation, 'function');
  const f = await preservedOracleFixture(t);
  const before = await readFile(f.databasePath);
  assert.equal(
    await replay.verifyRefreshReplayPreservedSourceActivation(
      f.root,
      'repository.sqlite',
      f.oracle,
    ),
    true,
  );
  assert.deepEqual(await readFile(f.databasePath), before);
  assert.deepEqual(await readFile(f.oraclePath), f.bytes);
});

for (const [name, sql] of [
  ['repository root', "UPDATE repository SET root_path=root_path||'-changed'"],
  [
    'revision fingerprint',
    "UPDATE revisions SET content_fingerprint=content_fingerprint||'-changed'",
  ],
  [
    'source fingerprint',
    "UPDATE source_files SET content_fingerprint=content_fingerprint||'-changed' WHERE rowid=(SELECT rowid FROM source_files LIMIT 1)",
  ],
  [
    'source classification',
    "UPDATE source_files SET role='TEST' WHERE rowid=(SELECT rowid FROM source_files LIMIT 1)",
  ],
  [
    'missing source',
    'DELETE FROM source_files WHERE rowid=(SELECT rowid FROM source_files LIMIT 1)',
  ],
  [
    'extra source',
    "INSERT INTO source_files SELECT revision_id,id||'-extra',repository_id,path||'-extra',content_fingerprint,role,provenance,content_kind,language_hint,sensitivity FROM source_files LIMIT 1",
  ],
  [
    'Evidence in inherited activation scope',
    "UPDATE evidence SET status='INVALIDATED' WHERE id=(SELECT id FROM evidence LIMIT 1)",
  ],
])
  test(`D5 replay source activation oracle detects ${name}`, async (t) => {
    assert.equal(typeof replay.verifyRefreshReplayPreservedSourceActivation, 'function');
    const f = await preservedOracleFixture(t);
    const db = new DatabaseSync(f.databasePath);
    try {
      assert.equal(db.prepare(sql).run().changes, 1);
    } finally {
      db.close();
    }
    const changed = await readFile(f.databasePath);
    assert.equal(
      await replay.verifyRefreshReplayPreservedSourceActivation(
        f.root,
        'repository.sqlite',
        f.oracle,
      ),
      false,
    );
    assert.deepEqual(await readFile(f.databasePath), changed);
    assert.deepEqual(await readFile(f.oraclePath), f.bytes);
  });

test('D5 replay source activation oracle refuses result/hardlink reuse and changed oracle bytes', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedSourceActivation, 'function');
  const f = await preservedOracleFixture(t);
  const borrowed = record('repository.sqlite', await readFile(f.databasePath), 'SQLITE');
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayPreservedSourceActivation(f.root, 'repository.sqlite', borrowed),
    /independent/i,
  );
  await link(f.databasePath, path.join(f.root, 'source-alias.sqlite'));
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayPreservedSourceActivation(f.root, 'source-alias.sqlite', borrowed),
    /independent/i,
  );
  const db = new DatabaseSync(f.oraclePath);
  try {
    db.exec("UPDATE repository SET root_path=root_path||'-changed'");
  } finally {
    db.close();
  }
  await assert.rejects(
    () =>
      replay.verifyRefreshReplayPreservedSourceActivation(f.root, 'repository.sqlite', f.oracle),
    /hash/i,
  );
});

test('D5 replay source activation oracle preserves independently prepared legitimate competitor state after source-race refusal', async (t) => {
  assert.equal(typeof replay.verifyRefreshReplayPreservedSourceActivation, 'function');
  const f = await preservedOracleFixture(t);
  const files = f.targetFiles.map((file) => ({
    ...file,
    classification: { ...file.classification, role: 'TEST' },
  }));
  const next = {
    revision: {
      ...f.targetRevision,
      contentFingerprint: `sha256:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`,
    },
    files,
  };
  const oraclePath = path.join(f.root, 'competitor.sqlite');
  await copyFile(f.oraclePath, oraclePath);
  const expectedDb = new DatabaseSync(oraclePath);
  try {
    const expectedStore = new RepositorySourceStateStore(expectedDb);
    expectedStore.replace(expectedStore.load('repo-fixture'), next);
    assert.equal(expectedStore.load('repo-fixture').files.length, 3);
    assert.ok(
      expectedStore.load('repo-fixture').files.every((file) => file.classification.role === 'TEST'),
    );
    expectedDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    expectedDb.close();
  }
  const expectedBytes = await readFile(oraclePath);
  const oracle = record('competitor.sqlite', expectedBytes, 'SQLITE');
  // Independent expected workflow is pinned before the competing write and stale attempt.
  const competingDb = new DatabaseSync(f.databasePath);
  try {
    const actualStore = new RepositorySourceStateStore(competingDb);
    actualStore.replace(actualStore.load('repo-fixture'), next);
  } finally {
    competingDb.close();
  }
  const db = new DatabaseSync(f.databasePath);
  const originalApply = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  let applyCalls = 0;
  const applySpy = t.mock.method(
    RepositoryCanonicalFactStore.prototype,
    'applyNativeAnalysisPatch',
    function (...args) {
      applyCalls++;
      return originalApply.apply(this, args);
    },
  );
  try {
    await assert.rejects(
      () => applyPreparedNativeRefreshAnalysisV3(db, f.prepared, f.options),
      /Native target revision changed/,
    );
    assert.equal(applyCalls, 0);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(
      db.prepare("SELECT name FROM sqlite_temp_master WHERE name!='sqlite_sequence'").all(),
      [],
    );
    if (db.prepare("SELECT name FROM sqlite_temp_master WHERE name='sqlite_sequence'").get())
      assert.equal(db.prepare('SELECT count(*) AS n FROM temp.sqlite_sequence').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
    assertSourceRelations(
      db,
      sourceTransitions.find((r) => r.id === 'modify-call-target').baselineRelations,
    );
  } finally {
    applySpy.mock.restore();
    db.close();
  }
  assert.equal(
    await replay.verifyRefreshReplayPreservedSourceActivation(f.root, 'repository.sqlite', oracle),
    true,
  );
  assert.equal(
    await replay.verifyRefreshReplayPreservedSourceActivation(
      f.root,
      'repository.sqlite',
      f.oracle,
    ),
    false,
  );
  // The old activation-only preservation scope cannot detect this legitimate source update.
  assert.equal(
    await replay.verifyRefreshReplayPreservedActivation(f.root, 'repository.sqlite', f.oracle),
    true,
  );
  assert.deepEqual(await readFile(oraclePath), expectedBytes);
  assert.deepEqual(await readFile(f.oraclePath), f.bytes);
});

async function tokenCheckpointFixture(t) {
  const f = await preservedOracleFixture(t, 'empty-file-noop');
  const db = new DatabaseSync(f.databasePath);
  try {
    const observed = observeRefreshBaselineRead(db, f.prepared.trustedContext, f.prepared.limits);
    if (observed.value === null) throw observed.error;
    assert.equal(observed.value.status, 'AVAILABLE');
    const {
      baseRevisionId,
      baseRevisionFingerprint,
      baselineState,
      targetSourceFiles,
      changes,
      ...payload
    } = f.prepared.request.payload;
    const competitor = createNativeRefreshPreparation(
      {
        requestId: 'checkpoint-competitor',
        descriptor: f.prepared.descriptor,
        trustedContext: f.prepared.trustedContext,
        payload: { ...payload, providerSnapshotId: 'snapshot-checkpoint-competitor' },
      },
      observed.value,
      f.prepared.limits.memoryBudgetBytes,
      f.options,
    );
    const indexedBefore = db
      .prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state')
      .get().fp;
    await applyPreparedNativeRefreshAnalysisV3(db, competitor, f.options);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.equal(
      db.prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state').get().id,
      'snapshot-checkpoint-competitor',
    );
    assert.equal(
      db.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get().fp,
      indexedBefore,
    );
    assert.deepEqual(
      db
        .prepare('SELECT kind,name,qualified_name,source_range_json FROM canonical_nodes')
        .all()
        .map((row) => ({ ...row })),
      [
        {
          kind: 'MODULE',
          name: 'Empty.java',
          qualified_name: 'Empty.java',
          source_range_json: null,
        },
      ],
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
    assert.equal(db.isTransaction, false);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
  // Pre-stale-attempt preservation checkpoint, not a frozen independent corpus oracle.
  const checkpointPath = path.join(f.root, 'competitor-checkpoint.sqlite');
  await copyFile(f.databasePath, checkpointPath);
  const checkpointBytes = await readFile(checkpointPath);
  const checkpoint = record('competitor-checkpoint.sqlite', checkpointBytes, 'SQLITE');
  const originalApply = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  let staleApplyCalls = 0;
  const spy = t.mock.method(
    RepositoryCanonicalFactStore.prototype,
    'applyNativeAnalysisPatch',
    function (...args) {
      staleApplyCalls++;
      return originalApply.apply(this, args);
    },
  );
  const staleDb = new DatabaseSync(f.databasePath);
  try {
    await assert.rejects(
      () => applyPreparedNativeRefreshAnalysisV3(staleDb, f.prepared, f.options),
      /Native activation token changed/,
    );
    assert.equal(staleApplyCalls, 0);
    assert.equal(staleDb.isTransaction, false);
    assert.deepEqual(
      staleDb.prepare("SELECT name FROM sqlite_temp_master WHERE name!='sqlite_sequence'").all(),
      [],
    );
    if (staleDb.prepare("SELECT name FROM sqlite_temp_master WHERE name='sqlite_sequence'").get())
      assert.equal(staleDb.prepare('SELECT count(*) AS n FROM temp.sqlite_sequence').get().n, 0);
    assert.equal(staleDb.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
  } finally {
    spy.mock.restore();
    staleDb.close();
  }
  return { ...f, checkpointPath, checkpointBytes, checkpoint };
}

test('D5 replay token checkpoint preserves the legitimate same-fingerprint competing activation, not the original seed', async (t) => {
  const f = await tokenCheckpointFixture(t);
  assert.equal(
    await replay.verifyRefreshReplayPreservedSourceActivation(
      f.root,
      'repository.sqlite',
      f.checkpoint,
    ),
    true,
  );
  assert.equal(
    await replay.verifyRefreshReplayPreservedSourceActivation(
      f.root,
      'repository.sqlite',
      f.oracle,
    ),
    false,
  );
  assert.deepEqual(await readFile(f.checkpointPath), f.checkpointBytes);
  assert.deepEqual(await readFile(f.oraclePath), f.bytes);
});

test('D5 replay token checkpoint retains pre-competition Canonical semantics through both attempts', async (t) => {
  const f = await tokenCheckpointFixture(t);
  const comparison = await replay.compareRefreshReplayCanonicalGraph(
    f.root,
    'repository.sqlite',
    f.oracle,
  );
  assert.equal(comparison.entries.length, 1);
  assert.equal(comparison.entries[0].factType, 'NODE');
  assert.equal(comparison.entries[0].classification, null);
  assert.deepEqual(comparison.entries[0].differences, []);
});

for (const [name, sql] of [
  [
    'competitor timestamp',
    "UPDATE provider_snapshots SET completed_at=completed_at+1 WHERE id='snapshot-checkpoint-competitor'",
  ],
  [
    'competitor R010 header',
    "UPDATE native_analysis_state SET header_json=json_set(header_json,'$.tampered',1) WHERE provider_snapshot_id='snapshot-checkpoint-competitor'",
  ],
])
  test(`D5 replay token checkpoint detects altered ${name} without normalizing it away`, async (t) => {
    const f = await tokenCheckpointFixture(t);
    const db = new DatabaseSync(f.databasePath);
    try {
      assert.equal(db.prepare(sql).run().changes, 1);
    } finally {
      db.close();
    }
    assert.equal(
      await replay.verifyRefreshReplayPreservedSourceActivation(
        f.root,
        'repository.sqlite',
        f.checkpoint,
      ),
      false,
    );
    assert.deepEqual(await readFile(f.checkpointPath), f.checkpointBytes);
  });

// One current corpus is shared across these tests; it is generated only after
// the included code batch is stable, never once per small helper change.
for (const name of refreshTransportCases)
  test(`D5 measured qualification original22: ${name}`, async (t) => {
    const { manifestPath, bindingPath } = await materializedReplayFixture(t);
    const value = await replay.readRefreshTransportReplay(manifestPath, bindingPath, name);
    const original = await readFile(value.databasePath);
    const result = await replay.runRefreshTransportMeasuredReplay(value, 'offline', 0);
    assert.equal(result.receipt.captureFailed, false);
    assert.equal(result.receipt.sqlLifetime.coverageComplete, true);
    assert.equal(result.receipt.admitted, false);
    assert.equal(result.verification.persistentStateVerified, true);
    assert.equal(result.verification.expectedOutcomeVerified, true);
    const { buildRefreshTransportFinalObservation } =
      await import('../../../scripts/native-refresh-transport-memory.mjs');
    const row = buildRefreshTransportFinalObservation(
      value,
      result.receipt,
      result.verification,
      0,
    );
    assert.equal(row.name, name);
    assert.equal(row.scope, 'OFFLINE_CALIBRATION_ONLY');
    assert.equal(row.observedOutcome, value.identity.inputs[name].expectedOutcome);
    await assert.rejects(() => replay.verifyRefreshTransportReplay(value, { ...result.receipt }));
    await replay.restoreRefreshTransportReplay(value);
    assert.deepEqual(await readFile(value.databasePath), original);
    if (name === 'd-cancel') {
      // Exercise the independent file-backed reader with the real CLI layout,
      // not only a well-shaped proof flag or a missing-file rejection.
      const audit = await replay.createRefreshTransportPrefixAudit(
        value.evidenceRoot,
        value.identity,
      );
      const { assertRefreshPrefixOriginDistinct } = await cancellationPrefixModule();
      const origins = new Set();
      const rowOrigin = await audit(row);
      assertRefreshPrefixOriginDistinct(origins, rowOrigin);
      // Returning the original valid calibration row is not a fresh holdout.
      assert.throws(() => assertRefreshPrefixOriginDistinct(origins, rowOrigin), /reused/i);
      const proofFile = path.join(value.evidenceRoot, row.outputProof.artifact.path);
      const artifact = replay.decodeRefreshReplayJson(await readFile(proofFile));
      for (const suffix of ['-wal', '-shm', '-journal']) {
        const sidecar = path.join(value.evidenceRoot, artifact.assets.result.path) + suffix;
        await writeFile(sidecar, Buffer.alloc(0), { flag: 'wx' });
        try {
          await assert.rejects(() => audit(row), /sidecar/i);
        } finally {
          await rm(sidecar);
        }
      }
      await writeFile(proofFile, Buffer.concat([await readFile(proofFile), Buffer.from('\n')]));
      await assert.rejects(() => audit(row), /proof artifact changed/i);
    }
    // A separate read/owner can use the same pristine binding without adopting
    // or overwriting the first parent's retained result directory.
    if (name === 'd-dependent-edge') {
      const next = await replay.readRefreshTransportReplay(manifestPath, bindingPath, name);
      const second = await replay.runRefreshTransportMeasuredReplay(next, 'offline', 1);
      assert.notEqual(second.artifactDirectory, result.artifactDirectory);
      assert.equal(second.verification.persistentStateVerified, true);
      await replay.restoreRefreshTransportReplay(next);
    }
  });

test('D5 measured qualification sidecar drift blocks verification and restoration', async (t) => {
  const { manifestPath, bindingPath } = await materializedReplayFixture(t);
  const value = await replay.readRefreshTransportReplay(
    manifestPath,
    bindingPath,
    'd-dependent-edge',
  );
  const result = await replay.runRefreshTransportMeasuredReplay(value, 'offline', 0);
  const file = result.receipt.artifactPaths[0];
  await writeFile(file, 'changed metadata\n');
  await assert.rejects(
    () => replay.verifyRefreshTransportReplay(value, result.receipt),
    /receipt|artifact/i,
  );
  await assert.rejects(() => replay.restoreRefreshTransportReplay(value), /receipt|artifact/i);
  assert.equal(fixtureStateCount(value.databasePath), 2);
});
