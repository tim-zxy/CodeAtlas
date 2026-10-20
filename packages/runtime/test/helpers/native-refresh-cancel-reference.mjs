import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { openSync, writeSync, fsyncSync, closeSync, readFileSync, createReadStream } from 'node:fs';
import { copyFile, readFile, writeFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readNativeRefreshBaseline, RepositoryPatchStage } from '../../../storage/dist/index.js';
import {
  selectMergedGroup,
  streamNativeRefreshV3,
  validateNativeStateCandidate,
  encodeNativeRefreshRequestV3,
  decodeNativeRefreshV3,
  NATIVE_CLIENT_HARD_LIMITS,
} from '../../../providers/dist/index.js';
import { createNativeRefreshPreparation } from '../../dist/native-refresh-preparation.js';
import { observeNativeWire } from './native-refresh-wire-probe.mjs';
import {
  readRefreshReplayWorkloadControls,
  encodeRefreshReplayJson,
  decodeRefreshReplayJson,
  verifyRefreshReplayPreservedSourceActivation,
  verifyRefreshReplayAsset,
} from './native-refresh-transport-replay.mjs';

// Preparation only. Dynamically loaded by the materializer, never a measured role.
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asset = async (directory, name, kind = 'ORACLE') => {
  const bytes = await readFile(path.join(directory, name));
  return { path: name, bytes: bytes.length, sha256: sha(bytes), kind };
};
const closed = (db) => {
  assert.equal(db.isTransaction, false);
  const objects = db
    .prepare("SELECT type,name FROM sqlite_temp_master WHERE name != 'sqlite_sequence'")
    .all();
  assert.deepEqual(objects, []);
  if (db.prepare("SELECT name FROM sqlite_temp_master WHERE name='sqlite_sequence'").get())
    assert.equal(db.prepare('SELECT count(*) AS n FROM temp.sqlite_sequence').get().n, 0);
};
const keys = (value, fields) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(
    Object.keys(value).sort(),
    [...fields].sort(),
    'Invalid reference provenance fields',
  );
};

export async function qualifyRefreshCancelReference(root, item, controls) {
  const getAsset = (name, kind = 'ORACLE') => {
    const value = item.assets.find((entry) => entry.path === name);
    assert.ok(value && value.kind === kind, 'Undeclared reference dependency');
    return value;
  };
  const provenanceFile = await verifyRefreshReplayAsset(
    root,
    getAsset(item.outputContract.provenancePath),
  );
  const provenance = decodeRefreshReplayJson(await readFile(provenanceFile));
  keys(provenance, [
    'schemaVersion',
    'kind',
    'nativeSha256',
    'requestSha256',
    'inputBytes',
    'sourceAssets',
    'invocationSha256',
    'optionsSha256',
    'response',
    'trials',
  ]);
  assert.equal(provenance.schemaVersion, 2);
  assert.equal(provenance.kind, 'REAL_NATIVE_COMPLETE_RESPONSE');
  const invocationBytes = await readFile(controls.invocationPath),
    optionsBytes = await readFile(controls.optionsPath);
  const invocation = decodeRefreshReplayJson(invocationBytes),
    options = decodeRefreshReplayJson(optionsBytes);
  assert.equal(provenance.invocationSha256, sha(invocationBytes));
  assert.equal(provenance.optionsSha256, sha(optionsBytes));
  assert.equal(provenance.nativeSha256, sha(await readFile(options.executablePath)));
  assert.deepEqual(provenance.sourceAssets, item.sourceHashes);
  const seed = getAsset(item.seedPath, 'SQLITE');
  const db = new DatabaseSync(await verifyRefreshReplayAsset(root, seed), { readOnly: true });
  let requestBytes, budget;
  const limits = { ...NATIVE_CLIENT_HARD_LIMITS, ...options.limits };
  try {
    budget = invocation.payload.resourceBudget.maxMemoryBytes;
    const baseline = readNativeRefreshBaseline(
      db,
      invocation.trustedContext,
      validateNativeStateCandidate,
      {
        maxSerializedBytes: 1_000_000,
        memoryBudgetBytes: budget,
      },
    );
    const prepared = createNativeRefreshPreparation(invocation, baseline, budget, options);
    requestBytes = encodeNativeRefreshRequestV3(
      prepared.request,
      prepared.baseline,
      limits,
      budget,
    );
  } finally {
    db.close();
  }
  assert.equal(provenance.requestSha256, sha(requestBytes));
  assert.equal(provenance.inputBytes, requestBytes.length);
  keys(provenance.response, ['path', 'sha256', 'bytes', 'lfCount']);
  const responseAsset = getAsset(item.outputContract.referencePath);
  assert.deepEqual(provenance.response, {
    path: responseAsset.path,
    sha256: responseAsset.sha256,
    bytes: responseAsset.bytes,
    lfCount: provenance.response.lfCount,
  });
  assert.ok(Number.isSafeInteger(provenance.response.lfCount) && provenance.response.lfCount > 0);
  assert.ok(Array.isArray(provenance.trials) && provenance.trials.length === 2);
  const identities = new Set();
  for (const trial of provenance.trials) {
    keys(trial, ['receiptPath', 'stdoutPath', 'stderrPath', 'resultPath']);
    const receipt = decodeRefreshReplayJson(
      await readFile(await verifyRefreshReplayAsset(root, getAsset(trial.receiptPath))),
    );
    keys(receipt, [
      'schemaVersion',
      'kind',
      'pid',
      'processIdentity',
      'nativeSha256',
      'inputSha256',
      'inputBytes',
      'outputSha256',
      'outputBytes',
      'eventCount',
      'exitCode',
      'completeStreamValidated',
      'transactionClosed',
      'tempClosed',
      'persistentStateVerified',
    ]);
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.kind, 'REAL_NATIVE_REFERENCE_TRIAL');
    assert.ok(Number.isSafeInteger(receipt.pid) && receipt.pid > 0);
    assert.ok(typeof receipt.processIdentity === 'string' && receipt.processIdentity.length > 0);
    assert.ok(!identities.has(receipt.processIdentity));
    identities.add(receipt.processIdentity);
    assert.equal(receipt.nativeSha256, provenance.nativeSha256);
    assert.equal(receipt.inputSha256, provenance.requestSha256);
    assert.equal(receipt.inputBytes, provenance.inputBytes);
    assert.equal(receipt.outputSha256, responseAsset.sha256);
    assert.equal(receipt.outputBytes, responseAsset.bytes);
    assert.equal(receipt.eventCount, provenance.response.lfCount);
    assert.equal(receipt.exitCode, 0);
    for (const field of [
      'completeStreamValidated',
      'transactionClosed',
      'tempClosed',
      'persistentStateVerified',
    ])
      assert.equal(receipt[field], true);
    const stdout = getAsset(trial.stdoutPath);
    assert.equal(stdout.sha256, responseAsset.sha256);
    assert.equal(stdout.bytes, responseAsset.bytes);
    const stdoutFile = await verifyRefreshReplayAsset(root, stdout);
    assert.equal(
      (await readFile(await verifyRefreshReplayAsset(root, getAsset(trial.stderrPath)))).length,
      0,
    );
    let lfCount = 0;
    async function* chunks() {
      for await (const chunk of createReadStream(stdoutFile)) {
        for (const byte of chunk) if (byte === 10) lfCount++;
        yield chunk;
      }
    }
    const decoded = await decodeNativeRefreshV3(
      requestBytes,
      chunks(),
      { async accept() {} },
      limits,
      budget,
    );
    assert.equal(decoded.terminal.type, 'REFRESH_COMPLETED');
    assert.equal(lfCount, provenance.response.lfCount);
    getAsset(trial.resultPath, 'SQLITE');
    assert.equal(
      await verifyRefreshReplayPreservedSourceActivation(root, trial.resultPath, seed),
      true,
    );
  }
  assert.equal(provenance.trials[0].stdoutPath, responseAsset.path);
  return Object.freeze({
    referenceAsset: responseAsset,
    provenanceAsset: getAsset(item.outputContract.provenancePath),
    requestSha256: provenance.requestSha256,
  });
}

export async function prepareRefreshCancelReference(
  value,
  directory,
  relativePrefix = '',
  dContext,
) {
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.name, 'd-cancel');
  assert.equal(await realpath(directory), directory);
  const assets = [],
    trials = [];
  const nativeSha256 = sha(
    await readFile(
      (await readRefreshReplayWorkloadControls(value, dContext)).options.executablePath,
    ),
  );
  const seedName = 'reference-seed.sqlite';
  await copyFile(value.databasePath, path.join(directory, seedName), constants.COPYFILE_EXCL);
  const seed = await asset(directory, seedName, 'SQLITE');
  assets.push(seed);
  let first;
  for (let repetition = 0; repetition < 2; repetition++) {
    const prefix = `reference-${repetition}`;
    const stdoutPath = `${prefix}.jsonl`,
      receiptPath = `${prefix}.json`,
      stderrPath = `${prefix}.stderr`,
      resultPath = `${prefix}.sqlite`;
    const child = spawnSync(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        fileURLToPath(import.meta.url),
        '--reference',
        path.join(directory, stdoutPath),
        seedName,
        resultPath,
        ...(dContext === undefined ? [] : [JSON.stringify(dContext)]),
      ],
      {
        input: encodeRefreshReplayJson(value),
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 1_000_000,
        ...(dContext === undefined
          ? {}
          : { env: { ...process.env, ...dContext.allowedEnvironment } }),
      },
    );
    await writeFile(path.join(directory, receiptPath), child.stdout ?? '', { flag: 'wx' });
    await writeFile(path.join(directory, stderrPath), child.stderr ?? '', { flag: 'wx' });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, '');
    const receipt = decodeRefreshReplayJson(Buffer.from(child.stdout));
    assert.equal(receipt.pid, child.pid);
    assert.equal(receipt.nativeSha256, nativeSha256);
    assert.equal(receipt.exitCode, 0);
    for (const field of [
      'completeStreamValidated',
      'transactionClosed',
      'tempClosed',
      'persistentStateVerified',
    ])
      assert.equal(receipt[field], true);
    assert.equal(
      await verifyRefreshReplayPreservedSourceActivation(directory, resultPath, seed),
      true,
    );
    const response = await asset(directory, stdoutPath);
    assert.equal(response.sha256, receipt.outputSha256);
    assert.equal(response.bytes, receipt.outputBytes);
    if (first) {
      assert.notEqual(receipt.processIdentity, first.receipt.processIdentity);
      assert.equal(receipt.inputSha256, first.receipt.inputSha256);
      assert.equal(
        response.sha256,
        first.response.sha256,
        'Unstable complete reference; review required',
      );
      assert.equal(receipt.eventCount, first.receipt.eventCount);
    } else first = { response, receipt };
    assets.push(
      response,
      await asset(directory, receiptPath),
      await asset(directory, stderrPath),
      await asset(directory, resultPath, 'SQLITE'),
    );
    trials.push({ receiptPath, stdoutPath, stderrPath, resultPath });
  }
  const { invocation, options } = await readRefreshReplayWorkloadControls(value, dContext);
  const sourceAssets = [];
  // Obtain target inventory from the same trusted reconstruction, never result SQL.
  const db = new DatabaseSync(value.databasePath);
  try {
    const baseline = readNativeRefreshBaseline(
      db,
      invocation.trustedContext,
      validateNativeStateCandidate,
      {
        maxSerializedBytes: 1_000_000,
        memoryBudgetBytes: invocation.payload.resourceBudget.maxMemoryBytes,
      },
    );
    const prepared = createNativeRefreshPreparation(
      invocation,
      baseline,
      invocation.payload.resourceBudget.maxMemoryBytes,
      options,
    );
    for (const file of prepared.request.payload.targetSourceFiles)
      sourceAssets.push({
        path: file.path,
        sha256: sha(await readFile(path.join(value.workspacePath, file.path))),
      });
  } finally {
    db.close();
  }
  sourceAssets.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const provenance = {
    schemaVersion: 2,
    kind: 'REAL_NATIVE_COMPLETE_RESPONSE',
    nativeSha256,
    requestSha256: first.receipt.inputSha256,
    inputBytes: first.receipt.inputBytes,
    sourceAssets,
    invocationSha256: sha(await readFile(value.workload.invocationPath)),
    optionsSha256: sha(await readFile(value.workload.optionsPath)),
    response: {
      path: relativePrefix + first.response.path,
      sha256: first.response.sha256,
      bytes: first.response.bytes,
      lfCount: first.receipt.eventCount,
    },
    trials: trials.map((trial) =>
      Object.fromEntries(
        Object.entries(trial).map(([key, value]) => [key, relativePrefix + value]),
      ),
    ),
  };
  const provenancePath = 'reference-provenance.json';
  await writeFile(path.join(directory, provenancePath), encodeRefreshReplayJson(provenance), {
    flag: 'wx',
  });
  assets.push(await asset(directory, provenancePath));
  return {
    referenceAsset: { ...first.response, path: relativePrefix + first.response.path },
    provenanceAsset: { ...assets.at(-1), path: relativePrefix + assets.at(-1).path },
    provenance,
    assets: assets.map((item) => ({ ...item, path: relativePrefix + item.path })),
  };
}

async function runReference(value, stdoutPath, seedName, resultName, dContext) {
  const { invocation, options } = await readRefreshReplayWorkloadControls(value, dContext);
  assert.equal(await realpath(path.dirname(stdoutPath)), path.dirname(stdoutPath));
  const writer = openSync(stdoutPath, 'wx');
  const db = new DatabaseSync(value.databasePath);
  let stage;
  try {
    const budget = invocation.payload.resourceBudget.maxMemoryBytes;
    const baseline = readNativeRefreshBaseline(
      db,
      invocation.trustedContext,
      validateNativeStateCandidate,
      { maxSerializedBytes: 1_000_000, memoryBudgetBytes: budget },
    );
    const prepared = createNativeRefreshPreparation(invocation, baseline, budget, options);
    stage = new RepositoryPatchStage(
      db,
      (group) => selectMergedGroup(group).fact,
      { ...prepared.limits, memoryBudgetBytes: budget - 2 * prepared.retainedSqlBytes },
      { baseline: prepared.baselineState, targetSourceFiles: prepared.targetSourceFiles },
    );
    let exitCode = null;
    const observed = await observeNativeWire(
      () =>
        streamNativeRefreshV3(
          prepared.request,
          prepared.baseline,
          options,
          {
            async accept(event) {
              if (event.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(event.payload);
              else if (event.type !== 'REFRESH_STARTED') await stage.acceptNativeEvent(event);
            },
          },
          budget,
        ),
      (chunk) => {
        let offset = 0;
        while (offset < chunk.length)
          offset += writeSync(writer, chunk, offset, chunk.length - offset);
      },
      (child) =>
        child.once('close', (code) => {
          exitCode = code;
        }),
    );
    if (observed.threw) throw observed.error;
    assert.equal(observed.value.terminal.type, 'REFRESH_COMPLETED');
    assert.equal(observed.wire.length, 1);
    stage.close();
    stage = null;
    closed(db);
    assert.equal(exitCode, 0);
    const wire = observed.wire[0];
    fsyncSync(writer);
    db.close();
    const directory = path.dirname(stdoutPath);
    await copyFile(value.databasePath, path.join(directory, resultName), constants.COPYFILE_EXCL);
    const seed = await asset(directory, seedName, 'SQLITE');
    assert.equal(
      await verifyRefreshReplayPreservedSourceActivation(directory, resultName, seed),
      true,
    );
    return {
      schemaVersion: 2,
      kind: 'REAL_NATIVE_REFERENCE_TRIAL',
      pid: process.pid,
      processIdentity: randomUUID(),
      nativeSha256: sha(await readFile(options.executablePath)),
      inputSha256: wire.inputSha256,
      inputBytes: wire.inputBytes,
      outputSha256: wire.outputSha256,
      outputBytes: wire.outputBytes,
      eventCount: wire.outputRecords,
      exitCode,
      completeStreamValidated: true,
      transactionClosed: true,
      tempClosed: true,
      persistentStateVerified: true,
    };
  } finally {
    try {
      stage?.close();
    } finally {
      if (db.isOpen) db.close();
      closeSync(writer);
    }
  }
}

if (
  process.argv[2] === '--reference' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const value = decodeRefreshReplayJson(readFileSync(0));
  process.stdout.write(
    encodeRefreshReplayJson(
      await runReference(
        value,
        process.argv[3],
        process.argv[4],
        process.argv[5],
        process.argv[6] === undefined ? undefined : JSON.parse(process.argv[6]),
      ),
    ),
  );
}
