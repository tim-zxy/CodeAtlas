import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  buildRefreshTransportFinalObservation,
  refreshTransportCases,
} from '../../../scripts/native-refresh-transport-memory.mjs';

// Only the test-loaded module exposes private ownership and substitutes acquisition
// and dependency discovery. The semantic verifier, filesystem guards, projector,
// exclusive artifact writer and restoration execute their real implementations.
const url = new URL('./helpers/native-refresh-transport-replay.mjs?combined-test', import.meta.url)
  .href;
const hooks = registerHooks({
  load(urlValue, context, next) {
    const loaded = next(urlValue, context);
    if (urlValue !== url) return loaded;
    return {
      ...loaded,
      source:
        String(loaded.source) +
        `
const originalIssuedGuard = guardIssuedReplayReceipt;
let testGuardHook, testGuardCount = 0;
guardIssuedReplayReceipt = async issued => {
  await originalIssuedGuard(issued);
  if (testGuardHook) await testGuardHook(++testGuardCount);
};
export const testOnly = {
  onIssuedGuard(fn) { testGuardHook = fn; testGuardCount = 0; },
  issue(value, owner, issued, catalog, acquire) {
    testGuardHook = undefined; testGuardCount = 0;
    replayOwners.set(value, owner); replayReceipts.set(issued.receipt, issued);
    discoverRefreshReplayDependencies = async () => { owner.checks++; return catalog; };
    acquireOwnedRefreshReplay = async (v, m) => {
      assert.equal(v, value); assert.equal(m.mode, 'offline');
      await acquire?.(); owner.currentReceipt = issued.receipt;
      owner.stage = 'AWAITING_VERIFICATION';
      return { receipt: issued.receipt, artifactDirectory: issued.artifactDirectory };
    };
  }
};`,
    };
  },
});
const replay = await import(url);
hooks.deregister();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tables = [
  'canonical_nodes',
  'canonical_edges',
  'unresolved_targets',
  'evidence',
  'fact_evidence',
  'provider_fact_bindings',
  'active_support_candidates',
  'provider_snapshots',
  'analysis_coverage',
  'analysis_diagnostics',
  'native_analysis_state',
  'native_analysis_file',
  'repository_state',
  'repository',
  'revisions',
  'source_files',
];
async function fixture(t, acquire, name = 'd-corrupt') {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'combined-replay-test-')));
  t.after(async () => {
    assert.ok(path.basename(root).startsWith('combined-replay-test-'));
    await fs.rm(root, { recursive: true });
  });
  const workspacePath = path.join(root, 'workspace'),
    artifactRoot = path.join(root, 'assets'),
    artifactDirectory = path.join(root, 'attempt'),
    depRoot = path.join(root, 'dependency');
  for (const directory of [workspacePath, artifactRoot, artifactDirectory, depRoot])
    await fs.mkdir(directory);
  const databasePath = path.join(workspacePath, 'result.sqlite');
  const db = new DatabaseSync(databasePath);
  for (const table of tables) db.exec(`CREATE TABLE ${table}(id TEXT)`);
  db.close();
  const assets = [];
  const put = async (name, bytes, kind = 'SOURCE') => {
    await fs.writeFile(path.join(artifactRoot, name), bytes);
    const asset = { path: name, kind, bytes: bytes.length, sha256: sha(bytes) };
    assets.push(asset);
    return asset;
  };
  const sqlite = await fs.readFile(databasePath);
  await put('seed.sqlite', sqlite, 'SQLITE');
  await put('oracle.sqlite', sqlite, 'SQLITE');
  await put(
    'golden.json',
    replay.encodeRefreshReplayJson({ trials: [{ receiptPath: 'reference.json' }] }),
    'ORACLE',
  );
  const snapshotMetadata = { invocationStartedAt: 1, invocationFinishedAt: 2, entries: [] };
  await put(
    'reference.json',
    replay.encodeRefreshReplayJson({ receipt: { snapshotMetadata } }),
    'ORACLE',
  );
  await put('invocation.json', replay.encodeRefreshReplayJson({}), 'CAPSULE');
  await put('manifest.json', replay.encodeRefreshReplayJson({}), 'CAPSULE');
  await fs.writeFile(path.join(depRoot, 'bytes.txt'), 'synthetic dependency\n');
  const dependencies = [{ path: 'synthetic/bytes.txt', sha256: sha('synthetic dependency\n') }];
  const roots = [{ name: 'synthetic', path: depRoot }],
    catalog = { roots, dependencies };
  const cancelled = name === 'd-cancel';
  const response = Buffer.from('{}\n');
  const referenceAsset = await put('reference.jsonl', response, 'ORACLE');
  const provenanceAsset = await put(
    'provenance.json',
    replay.encodeRefreshReplayJson({ synthetic: true }),
    'ORACLE',
  );
  const physical = {
    inputBytes: 1,
    largestLineBytes: 1,
    outputBytes: cancelled ? 3 : 0,
    eventCount: cancelled ? 1 : 0,
    summaryBytes: 1,
  };
  const contract = {
    corpusPayloadDigest: 'a'.repeat(64),
    expectedOutcome: cancelled ? 'CANCELLED' : 'CHECKSUM_MISMATCH',
    ...physical,
    ...(cancelled ? { outputBytes: null, eventCount: null } : {}),
  };
  const identity = {
    environment: {
      node: 'synthetic',
      v8: 'synthetic',
      platform: 'synthetic',
      arch: 'synthetic',
      zodVersion: 'synthetic',
      implementationDigest: 'b'.repeat(64),
      corpusRevision: 'synthetic',
    },
    corpus: { revision: 'p05-native-refresh-transport-memory-v1', digest: 'c'.repeat(64) },
    inputs: Object.fromEntries(
      refreshTransportCases.map((name) => [
        name,
        {
          ...contract,
          ...(name === 'd-cancel'
            ? {
                expectedOutcome: 'CANCELLED',
                outputBytes: null,
                eventCount: null,
                outputContract: {
                  kind: 'CANCELLED_PREFIX',
                  referencePath: 'reference.jsonl',
                  provenancePath: 'provenance.json',
                },
                outputReference: {
                  responseSha256: referenceAsset.sha256,
                  provenanceSha256: provenanceAsset.sha256,
                },
              }
            : {
                expectedOutcome: 'CHECKSUM_MISMATCH',
                outputBytes: 0,
                eventCount: 0,
                outputContract: { kind: 'EXACT' },
                outputReference: null,
              }),
        },
      ]),
    ),
  };
  const coverage = [{ family: 'BASELINE_READ', role: 'MAIN', disposition: 'OBSERVED' }];
  const value = Object.freeze({
    schemaVersion: 2,
    name,
    caseDigest: contract.corpusPayloadDigest,
    identity,
    coverage,
    workspacePath,
    databasePath,
    evidenceRoot: root,
  });
  const receipt = Object.freeze({
    schemaVersion: 2,
    name: value.name,
    repetition: 0,
    mode: 'offline',
    caseDigest: value.caseDigest,
    environment: identity.environment,
    corpus: identity.corpus,
    physical,
    sqlLifetime: {
      scope: 'COMPLETE_SQL_SOURCE_LIFETIME_ONLY',
      coverageComplete: true,
      retainedSqlBytes: 1,
      retainedSqlStringChargeBytes: 2,
      coverage: coverage.map((v) => ({ ...v, cause: null })),
      reasons: [],
    },
    samples: [
      ...['startup', 'finished'].map((phase) => ({
        phase,
        peakKiB: 1,
        memory: { rss: 1, heapTotal: 1, heapUsed: 1, external: 0, arrayBuffers: 0 },
      })),
    ],
    peakResidentBytes: 1024,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    observedOutcome: contract.expectedOutcome,
    operationThrew: true,
    operationFailureText: 'synthetic refusal',
    captureFailed: false,
    transactionClosed: true,
    tempClosed: true,
    admitted: false,
    workspacePath,
    artifactPaths: [databasePath],
  });
  const owner = {
    active: false,
    stage: 'PRISTINE',
    checks: 0,
    workspacePath,
    databasePath,
    rootInfo: await fs.lstat(workspacePath, { bigint: true }),
    databaseInfo: await fs.lstat(databasePath, { bigint: true }),
    manifestPath: path.join(artifactRoot, 'manifest.json'),
    manifest: {
      schemaVersion: 2,
      corpus: identity.corpus,
      generator: { revision: 'p05-refresh-replay-v4', dependencies },
    },
    binding: { artifactRoot, dependencyRoots: roots },
    capsule: { workload: { invocationPath: 'invocation.json' } },
    pins: [],
    item: {
      name,
      caseDigest: value.caseDigest,
      seedPath: 'seed.sqlite',
      assets,
      sourceFiles: [],
      expectedOutcome: contract.expectedOutcome,
      inputContract: contract,
      oracle: {
        statePath: 'oracle.sqlite',
        sourceGoldenPath: 'golden.json',
        refusal: { message: 'synthetic refusal' },
      },
    },
  };
  for (const asset of assets) {
    const file = path.join(artifactRoot, asset.path);
    owner.pins.push({ file, info: await fs.lstat(file, { bigint: true }), sha256: asset.sha256 });
  }
  if (cancelled)
    owner.cancelReference = { referenceAsset, provenanceAsset, requestSha256: 'd'.repeat(64) };
  const functionalReceipt = {
    ...receipt,
    snapshotMetadata,
    mainApplyCalls: 0,
    competitorCommits: 0,
    ...(cancelled
      ? {
          wireEvidence: {
            inputSha256: 'd'.repeat(64),
            outputSha256: sha(response),
            outputBytes: 3,
            eventCount: 1,
            cancelGate: {
              kind: 'FIRST_BLOCKED_STAGE_SINK',
              accepted: 1,
              maximumInFlight: 1,
              blockedVerified: true,
              abortCalls: 1,
            },
          },
        }
      : {}),
  };
  const issued = {
    owner,
    receipt,
    functionalReceipt,
    artifactDirectory,
    artifacts: [],
    resultSha256: sha(sqlite),
    verification: null,
    measurement: { mode: 'offline', repetition: 0 },
  };
  for (const name of ['receipt.json', 'metadata.json', 'process.json']) {
    const file = path.join(artifactDirectory, name);
    const bytes = Buffer.from(
      JSON.stringify(name === 'metadata.json' ? functionalReceipt : { synthetic: true }),
    );
    await fs.writeFile(file, bytes);
    issued.artifacts.push({
      file,
      info: await fs.lstat(file, { bigint: true }),
      sha256: sha(bytes),
    });
  }
  await fs.copyFile(databasePath, path.join(artifactDirectory, 'result.sqlite'));
  replay.testOnly.issue(value, owner, issued, catalog, () => acquire?.({ value, owner, issued }));
  return {
    root,
    value,
    owner,
    issued,
    depRoot,
    legacy: async (restore = true) => {
      owner.currentReceipt = receipt;
      owner.stage = 'AWAITING_VERIFICATION';
      const proof = await replay.verifyRefreshTransportReplay(value, receipt);
      await replay.verifyRefreshTransportReplay(value, receipt);
      const row = buildRefreshTransportFinalObservation(value, receipt, proof, 0);
      if (restore) await replay.restoreRefreshTransportReplay(value);
      return row;
    },
  };
}

test('combined v1 exists only as a separately named private offline entry', () => {
  assert.equal(typeof replay.runRefreshTransportCombinedOfflineReplayV1, 'function');
});

test('combined v1 matches stable legacy output and returns only after real restoration', async (t) => {
  const f = await fixture(t);
  assert.equal(typeof replay.runRefreshTransportCombinedOfflineReplayV1, 'function');
  const actual = await replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0);
  assert.equal(f.owner.stage, 'PRISTINE');
  assert.equal(f.owner.currentReceipt, null);
  assert.deepEqual(
    await fs.readFile(f.value.databasePath),
    await fs.readFile(path.join(f.root, 'assets/seed.sqlite')),
  );
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(path.join(f.issued.artifactDirectory, 'observation.json'), 'utf8'),
    ),
    actual,
  );
  const checks = f.owner.checks;
  const g = await fixture(t);
  const expected = await g.legacy();
  assert.deepEqual(actual, expected);
  assert.equal(checks, 3);
  assert.equal(g.owner.checks, 5);
});

test('combined rejects forged owners, concurrent operations and nested entry', async (t) => {
  const f = await fixture(t, async ({ value, issued }) => {
    for (const operation of [
      () => replay.runRefreshTransportCombinedOfflineReplayV1(value, 0),
      () => replay.runRefreshTransportMeasuredReplay(value, 'offline', 0),
      () => replay.runRefreshTransportFunctionalReplay(value),
      () => replay.verifyRefreshTransportReplay(value, issued.receipt),
      () => replay.restoreRefreshTransportReplay(value),
    ])
      await assert.rejects(operation, /combined|active/i);
  });
  await assert.rejects(
    () => replay.runRefreshTransportCombinedOfflineReplayV1({ ...f.value }, 0),
    /ownership/i,
  );
  await replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0);
});

async function mutateOnProof(t, f, operation) {
  const open = fs.open;
  fs.open = async (...args) => {
    const handle = await open(...args);
    if (path.basename(args[0]) === 'verification.json' && args[1] === 'wx') {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close();
        await operation();
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.open = open;
    syncBuiltinESMExports();
  });
}
for (const kind of ['dependency', 'proof', 'result', 'unexpected-file'])
  test(`combined tail refuses post-proof ${kind} drift and latches failure`, async (t) => {
    const f = await fixture(t);
    let mutated = false;
    await mutateOnProof(t, f, async () => {
      mutated = true;
      if (kind === 'dependency') await fs.writeFile(path.join(f.depRoot, 'bytes.txt'), 'changed');
      if (kind === 'proof') await fs.writeFile(f.issued.artifacts[0].file, 'changed');
      if (kind === 'result') await fs.writeFile(f.value.databasePath, Buffer.from('changed'));
      if (kind === 'unexpected-file')
        await fs.writeFile(path.join(f.value.workspacePath, 'foreign'), 'changed');
    });
    await assert.rejects(() => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0));
    assert.equal(mutated, true, 'The fault must occur after proof persistence');
    assert.equal(f.owner.stage, 'FAILED');
    await assert.rejects(() => fs.stat(path.join(f.issued.artifactDirectory, 'observation.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(
      () => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0),
      /PRISTINE|FAILED|settled/i,
    );
  });

test('combined withholds delivery when exclusive observation persistence fails', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.issued.artifactDirectory, 'observation.json'), 'prior evidence');
  await assert.rejects(() => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0), {
    code: 'EEXIST',
  });
  assert.equal(f.owner.stage, 'FAILED');
  assert.equal(
    await fs.readFile(path.join(f.issued.artifactDirectory, 'observation.json'), 'utf8'),
    'prior evidence',
  );
});

test('combined withholds delivery and preserves evidence when restoration fails', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    path.join(f.issued.artifactDirectory, 'original-result.sqlite'),
    'prior evidence',
  );
  await assert.rejects(
    () => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0),
    /archive already exists/,
  );
  assert.equal(f.owner.stage, 'FAILED');
  assert.ok(await fs.stat(path.join(f.issued.artifactDirectory, 'observation.json')));
  assert.equal(
    await fs.readFile(path.join(f.issued.artifactDirectory, 'original-result.sqlite'), 'utf8'),
    'prior evidence',
  );
});

test('combined v2 cancellation proof is created, pinned and rechecked before delivery', async (t) => {
  const f = await fixture(t, undefined, 'd-cancel');
  const actual = await replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0);
  assert.equal(actual.outputProof.kind, 'CANCELLED_PREFIX');
  const proof = await fs.readFile(path.join(f.issued.artifactDirectory, 'prefix-proof.json'));
  assert.equal(actual.outputProof.artifact.sha256, sha(proof));
  assert.equal(f.owner.stage, 'PRISTINE');
  // Same original paths and receipt, so verification bytes remain comparable.
  const expected = await f.legacy(false);
  assert.deepEqual(actual, expected);
});

test('combined v2 refuses cancellation proof tampering after verification persistence', async (t) => {
  const f = await fixture(t, undefined, 'd-cancel');
  let mutated = false;
  await mutateOnProof(t, f, async () => {
    mutated = true;
    await fs.writeFile(path.join(f.issued.artifactDirectory, 'prefix-proof.json'), 'changed');
  });
  await assert.rejects(
    () => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0),
    /artifact changed|bytes changed/,
  );
  assert.equal(mutated, true);
  assert.equal(f.owner.stage, 'FAILED');
});

test('preserved counterexample: transient dependency drift can reject legacy but pass combined v1', async (t) => {
  const f = await fixture(t);
  const transient = async (g) => {
    const file = path.join(g.depRoot, 'bytes.txt');
    replay.testOnly.onIssuedGuard(async (count) => {
      if (count === 2) await fs.writeFile(file, 'transient mutation');
    });
    return file;
  };
  await transient(f);
  await assert.rejects(() => f.legacy(), /Asset hash mismatch/);
  const g = await fixture(t);
  const file = await transient(g);
  let restored = false;
  await mutateOnProof(t, g, async () => {
    await fs.writeFile(file, 'synthetic dependency\n');
    restored = true;
  });
  const row = await replay.runRefreshTransportCombinedOfflineReplayV1(g.value, 0);
  assert.equal(restored, true);
  assert.equal(row.persistentStateVerified, true);
  assert.equal(g.owner.stage, 'PRISTINE');
});

for (const kind of ['owner', 'case-version', 'closure-flag'])
  test(`combined rejects substituted ${kind}`, async (t) => {
    const f = await fixture(t);
    if (kind === 'owner') f.issued.owner = {};
    if (kind === 'case-version')
      f.value.identity.inputs[f.value.name].corpusPayloadDigest = 'f'.repeat(64);
    if (kind === 'closure-flag') f.issued.functionalReceipt.tempClosed = false;
    await assert.rejects(() => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0));
    assert.equal(f.owner.stage, 'FAILED');
  });

test('combined preserves both observation and restoration failures', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    path.join(f.issued.artifactDirectory, 'observation.json'),
    'prior observation',
  );
  await fs.writeFile(
    path.join(f.issued.artifactDirectory, 'original-result.sqlite'),
    'prior archive',
  );
  await assert.rejects(
    () => replay.runRefreshTransportCombinedOfflineReplayV1(f.value, 0),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.equal(error.errors[0].code, 'EEXIST');
      assert.match(error.errors[1].message, /archive already exists/);
      return true;
    },
  );
  assert.equal(f.owner.stage, 'FAILED');
});
