import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Synthetic evidence tests only: these bytes/peaks are not calibration reports.
const names = [
  'd-preparation-input',
  'd-retained-sites',
  'd-shared-owners',
  'd-dense-upsert',
  'd-dense-remove',
  'd-dependent-edge',
  'd-complete-coverage',
  'd-overlay-retention',
  'd-delete',
  'd-empty',
  'd-zero-fact',
  'd-sql-preflight',
  'd-slow-stdin',
  'd-slow-sink',
  'd-partial',
  'd-corrupt',
  'd-late-exit',
  'd-cancel',
  'd-source-race',
  'd-token-race',
  'd-rollback',
  'd-reopen',
];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const environment = {
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch,
  zodVersion: 'test-only',
  implementationDigest: sha('synthetic-build'),
  corpusRevision: 'test-only',
};
const corpus = {
  revision: 'p05-native-refresh-transport-memory-v1',
  digest: sha('synthetic-corpus'),
};
const identity = {
  environment,
  corpus,
  inputs: Object.fromEntries(
    names.map((name) => [
      name,
      {
        corpusPayloadDigest: sha(name),
        expectedOutcome: 'SUCCEEDED',
        inputBytes: 10,
        largestLineBytes: 9,
        outputBytes: 10,
        eventCount: 1,
        summaryBytes: 0,
      },
    ]),
  ),
};
function row(name, repetition, peakKiB = 100) {
  return {
    name,
    repetition,
    workspace: 'REFRESH_TRANSPORT',
    environment,
    corpus,
    scope: 'OFFLINE_CALIBRATION_ONLY',
    ...identity.inputs[name],
    observedOutcome: 'SUCCEEDED',
    persistentStateVerified: true,
    transactionClosed: true,
    tempClosed: true,
    retainedSqlBytes: 5,
    retainedSqlStringChargeBytes: 10,
    samples: [
      {
        phase: 'startup',
        peakKiB,
        memory: { rss: peakKiB * 1024, heapTotal: 10, heapUsed: 5, external: 0, arrayBuffers: 0 },
      },
    ],
    peakResidentBytes: peakKiB * 1024,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
  };
}
function report() {
  return structuredClone({
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    environment,
    corpus,
    observations: names.flatMap((name) =>
      Array.from({ length: 5 }, (_, i) => row(name, i, 100 + i)),
    ),
    failures: [],
  });
}
async function setup(t, mutate = () => {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-transport-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = async (name, value) => {
    const raw = JSON.stringify(value);
    await writeFile(path.join(root, name), raw);
    return { path: name, sha256: sha(raw) };
  };
  const raw = report();
  mutate(raw);
  const manifest = {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    environment,
    corpus,
    reports: [await save('report.json', raw)],
    priorApprovals: [],
  };
  await save('manifest.json', manifest);
  return { root, save, manifest, path: path.join(root, 'manifest.json') };
}
async function api() {
  const module = await import('./native-refresh-transport-memory.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(
    typeof module.buildRefreshTransportCandidate,
    'function',
    'D5 candidate owner missing',
  );
  return module;
}

function finalInputs() {
  const name = 'd-dependent-edge';
  const coverage = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map(
    (family) => ({ family, role: 'MAIN', disposition: 'OBSERVED' }),
  );
  const input = identity.inputs[name];
  const { corpusPayloadDigest, expectedOutcome, ...physical } = input;
  const value = {
    name,
    caseDigest: corpusPayloadDigest,
    identity,
    coverage,
    workspacePath: path.resolve('synthetic-replay'),
  };
  const receipt = {
    name,
    repetition: 0,
    mode: 'offline',
    caseDigest: corpusPayloadDigest,
    environment,
    corpus,
    physical,
    sqlLifetime: {
      scope: 'COMPLETE_SQL_SOURCE_LIFETIME_ONLY',
      coverageComplete: true,
      retainedSqlBytes: 5,
      retainedSqlStringChargeBytes: 10,
      coverage: coverage.map((entry) => ({ ...entry, cause: null })),
      reasons: [],
    },
    samples: [...row(name, 0).samples, { ...row(name, 0).samples[0], phase: 'finished' }],
    peakResidentBytes: 102400,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    observedOutcome: expectedOutcome,
    operationThrew: false,
    operationFailureText: null,
    captureFailed: false,
    transactionClosed: true,
    tempClosed: true,
    admitted: false,
    workspacePath: value.workspacePath,
    artifactPaths: [path.resolve('synthetic-metadata.json')],
  };
  const verification = {
    persistentStateVerified: true,
    transactionClosed: true,
    tempClosed: true,
    expectedOutcomeVerified: true,
    verificationDigest: sha('synthetic-verification'),
  };
  return { value, receipt, verification };
}

test('D5 final row v2 cancelled prefix retains actual counts and requires owned proof artifact', async () => {
  const module = await api();
  const { value, receipt, verification } = finalInputs();
  value.schemaVersion = receipt.schemaVersion = 2;
  value.name = receipt.name = 'd-cancel';
  value.identity = structuredClone(identity);
  for (const name of names) {
    value.identity.inputs[name].outputContract =
      name === 'd-cancel'
        ? {
            kind: 'CANCELLED_PREFIX',
            referencePath: 'cases/d-cancel/reference.jsonl',
            provenancePath: 'cases/d-cancel/provenance.json',
          }
        : { kind: 'EXACT' };
    value.identity.inputs[name].outputReference =
      name === 'd-cancel'
        ? {
            responseSha256: 'a'.repeat(64),
            provenanceSha256: 'b'.repeat(64),
          }
        : null;
  }
  const input = value.identity.inputs['d-cancel'];
  input.outputBytes = input.eventCount = null;
  input.expectedOutcome = 'CANCELLED';
  value.caseDigest = receipt.caseDigest = input.corpusPayloadDigest;
  receipt.observedOutcome = 'CANCELLED';
  receipt.operationThrew = true;
  receipt.operationFailureText = 'NativeClientError: Native request was cancelled';
  receipt.physical.outputBytes = 753;
  receipt.physical.eventCount = 2;
  verification.outputProof = {
    kind: 'CANCELLED_PREFIX',
    referenceSha256: 'a'.repeat(64),
    provenanceSha256: 'b'.repeat(64),
    inputSha256: 'c'.repeat(64),
    outputSha256: 'd'.repeat(64),
    outputBytes: 753,
    eventCount: 2,
    gateVerified: true,
  };
  verification.proofArtifact = {
    path: 'corpus/replay/d-cancel/prefix-proof.json',
    sha256: 'e'.repeat(64),
  };
  const row = module.buildRefreshTransportFinalObservation(value, receipt, verification, 0);
  assert.equal(row.outputBytes, 753);
  assert.equal(row.eventCount, 2);
  assert.deepEqual(row.outputProof.artifact, verification.proofArtifact);
  assert.throws(() =>
    module.validateRefreshTransportObservation({ ...row, eventCount: 3 }, value.identity),
  );
  assert.throws(() =>
    module.buildRefreshTransportFinalObservation(
      value,
      receipt,
      { ...verification, proofArtifact: null },
      0,
    ),
  );
  assert.throws(() =>
    module.buildRefreshTransportFinalObservation(
      value,
      { ...receipt, schemaVersion: 1 },
      verification,
      0,
    ),
  );
});

test('D5 candidate v2 rejects a forged proof flag without original file evidence', async (t) => {
  const module = await api();
  const f = await setup(t);
  const v2 = structuredClone(identity);
  for (const name of names) {
    Object.assign(
      v2.inputs[name],
      name === 'd-cancel'
        ? {
            expectedOutcome: 'CANCELLED',
            outputBytes: null,
            eventCount: null,
            outputContract: {
              kind: 'CANCELLED_PREFIX',
              referencePath: 'cases/d-cancel/reference.jsonl',
              provenancePath: 'cases/d-cancel/provenance.json',
            },
            outputReference: { responseSha256: 'a'.repeat(64), provenanceSha256: 'b'.repeat(64) },
          }
        : { outputContract: { kind: 'EXACT' }, outputReference: null },
    );
  }
  const raw = report();
  raw.schemaVersion = 2;
  for (const row of raw.observations) {
    row.outputProof =
      row.name === 'd-cancel'
        ? {
            kind: 'CANCELLED_PREFIX',
            referenceSha256: 'a'.repeat(64),
            provenanceSha256: 'b'.repeat(64),
            inputSha256: 'c'.repeat(64),
            outputSha256: 'd'.repeat(64),
            outputBytes: row.outputBytes,
            eventCount: row.eventCount,
            gateVerified: true,
            artifact: { path: 'forged.json', sha256: 'e'.repeat(64) },
          }
        : null;
    if (row.name === 'd-cancel') row.expectedOutcome = row.observedOutcome = 'CANCELLED';
  }
  f.manifest.schemaVersion = 2;
  f.manifest.reports = [await f.save('report.json', raw)];
  await f.save('manifest.json', f.manifest);
  // Shapes/flags alone pass, but no frozen original corpus or proof files exist.
  await assert.rejects(
    () => module.buildRefreshTransportCandidate(f.path, f.root, v2),
    /ENOENT|evidence|corpus|proof/i,
  );
});

for (const scenario of [
  'valid',
  'diagnostic',
  'missing_source',
  'changed_binding',
  'verification_failed',
  'unexpected_failure',
  'capture_failed',
  'wrong_charge',
  'wrong_units',
  'unapproved_actual',
])
  test(`D5 final row ${scenario}`, async () => {
    const module = await api();
    assert.equal(typeof module.buildRefreshTransportFinalObservation, 'function');
    const { value, receipt, verification } = finalInputs();
    if (scenario === 'diagnostic') receipt.calibrationEligible = false;
    if (scenario === 'missing_source') receipt.sqlLifetime.coverage.pop();
    if (scenario === 'changed_binding') receipt.workspacePath += '-other';
    if (scenario === 'verification_failed') verification.persistentStateVerified = false;
    if (scenario === 'unexpected_failure') {
      receipt.operationThrew = true;
      receipt.operationFailureText = 'unexpected';
    }
    if (scenario === 'capture_failed') receipt.captureFailed = true;
    if (scenario === 'wrong_charge') receipt.sqlLifetime.retainedSqlStringChargeBytes = 5;
    if (scenario === 'wrong_units') receipt.peakResidentBytes = 100;
    if (scenario === 'unapproved_actual') receipt.mode = 'actual';
    const build = () =>
      module.buildRefreshTransportFinalObservation(value, receipt, verification, 0);
    if (scenario !== 'valid') assert.throws(build);
    else {
      const result = build();
      assert.deepEqual(result, { ...row('d-dependent-edge', 0), samples: receipt.samples });
      module.validateRefreshTransportObservation(result, identity);
    }
  });

test('D5 final row CLI invalid arguments fail without silent success', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      'scripts/native-refresh-transport-memory.mjs',
      'not-a-command',
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(child.status, 0);
  assert.equal(child.stdout, '');
  assert.match(child.stderr, /Usage|command|arguments/i);
});

for (const scenario of ['existing_directory', 'missing_candidate'])
  test(`D5 final row CLI ${scenario}`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-transport-cli-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(path.join(root, 'sentinel'), 'keep');
    const output = path.join(root, 'new-collection');
    const args =
      scenario === 'existing_directory'
        ? ['bench', root]
        : ['collect', 'candidate', path.join(root, 'absent.json'), output];
    const child = spawnSync(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        'scripts/native-refresh-transport-memory.mjs',
        ...args,
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(child.status, 0);
    assert.equal(await readFile(path.join(root, 'sentinel'), 'utf8'), 'keep');
    if (scenario === 'existing_directory') assert.match(child.stderr, /EEXIST|already exists/i);
    if (scenario === 'missing_candidate') {
      const failure = JSON.parse(await readFile(path.join(output, 'command-failure.json'), 'utf8'));
      assert.match(failure.failure, /ENOENT|no such/i);
    }
  });

test('D5 final row CLI confines candidate manifest before corpus access', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-transport-cli-binding-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = path.join(root, 'evidence');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(evidence);
  await writeFile(path.join(root, 'foreign.json'), '{}');
  const candidate = path.join(evidence, 'candidate.json');
  await writeFile(candidate, JSON.stringify({ manifest: { path: '../foreign.json' } }));
  const child = spawnSync(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      'scripts/native-refresh-transport-memory.mjs',
      'collect',
      'candidate',
      candidate,
      path.join(root, 'output'),
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /relative|confined|escape|path/i);
  assert.doesNotMatch(child.stderr, /ENOENT|not defined/);
});

test('D5 final row actual preflight retains its original throw and observed Source inventory', async () => {
  const module = await api();
  const { value, receipt, verification } = finalInputs();
  value.name = receipt.name = 'd-sql-preflight';
  value.identity = structuredClone(identity);
  value.identity.inputs[value.name] = {
    ...identity.inputs[value.name],
    expectedOutcome: 'RESOURCE_LIMIT_EXCEEDED',
    inputBytes: 0,
    largestLineBytes: 0,
    outputBytes: 0,
    eventCount: 0,
  };
  value.caseDigest = receipt.caseDigest = value.identity.inputs[value.name].corpusPayloadDigest;
  value.coverage = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map(
    (family) => ({
      family,
      role: 'MAIN',
      disposition: family === 'BASELINE_READ' ? 'PROVEN_NO_TEXT' : 'PROVEN_NOT_REACHED',
    }),
  );
  receipt.mode = 'actual';
  receipt.admitted = true;
  receipt.observedOutcome = 'RESOURCE_LIMIT_EXCEEDED';
  receipt.operationThrew = true;
  receipt.operationFailureText = 'NativeStateValidationError: Native refresh baseline unavailable';
  receipt.physical = {
    inputBytes: 0,
    largestLineBytes: 0,
    outputBytes: 0,
    eventCount: 0,
    summaryBytes: 0,
  };
  receipt.sqlLifetime.coverage = value.coverage.map((entry) => ({
    ...entry,
    cause: 'original boundary proof',
    disposition:
      entry.family === 'BASELINE_READ'
        ? 'OBSERVED'
        : entry.family === 'PREPARATION'
          ? 'PROVEN_NO_TEXT'
          : 'PROVEN_NOT_REACHED',
  }));
  const row = module.buildRefreshTransportFinalObservation(value, receipt, verification, 0);
  assert.equal(row.scope, 'ACTUAL_ADMITTED');
  assert.equal(row.observedOutcome, 'RESOURCE_LIMIT_EXCEEDED');
  receipt.sqlLifetime.coverage[0].disposition = 'PROVEN_NO_TEXT';
  assert.throws(() =>
    module.buildRefreshTransportFinalObservation(value, receipt, verification, 0),
  );
});

async function holdoutSetup(t) {
  const c = await setup(t);
  const module = await api();
  const candidate = await module.buildRefreshTransportCandidate(c.path, c.root, identity);
  await c.save('candidate.json', candidate);
  assert.equal(
    typeof module.collectRefreshTransportObservations,
    'function',
    'D5 collector missing',
  );
  return {
    ...c,
    candidate,
    candidatePath: path.join(c.root, 'candidate.json'),
    holdoutPath: path.join(c.root, 'holdout.json'),
    artifactDir: path.join(c.root, 'workers'),
    collect: module.collectRefreshTransportObservations,
  };
}
const successfulWorker = (name, repetition) => ({
  status: 0,
  stderr: '',
  error: null,
  stdout: JSON.stringify(row(name, repetition, 108)),
});
test('holdout collector accepts equality, covers 22 classes once and preserves frozen bytes', async (t) => {
  const c = await holdoutSetup(t);
  const before = await readFile(c.candidatePath);
  const calls = [];
  const result = await c.collect(
    c.candidatePath,
    c.artifactDir,
    c.holdoutPath,
    (name, repetition) => {
      calls.push([name, repetition]);
      return successfulWorker(name, repetition);
    },
    identity,
  );
  assert.deepEqual(
    calls,
    names.map((name) => [name, 0]),
  );
  assert.equal(result.observations.length, 22);
  assert.deepEqual(result.failures, []);
  assert.equal(result.candidateSha256, sha(before));
  assert.deepEqual(await readFile(c.candidatePath), before);
  assert.deepEqual(JSON.parse(await readFile(c.holdoutPath)), result);
  assert.deepEqual(
    await (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    c.candidate,
  );
});
for (const [label, worker] of [
  [
    'peak excess',
    (name, repetition) => ({
      ...successfulWorker(name, repetition),
      stdout: JSON.stringify(row(name, repetition, 109)),
    }),
  ],
  ['invalid JSON', () => ({ status: 0, stderr: '', error: null, stdout: 'broken' })],
  ['nonzero process', (name, repetition) => ({ ...successfulWorker(name, repetition), status: 1 })],
  [
    'process error',
    (name, repetition) => ({ ...successfulWorker(name, repetition), error: 'timed out' }),
  ],
  [
    'stderr pollution',
    (name, repetition) => ({ ...successfulWorker(name, repetition), stderr: 'unexpected' }),
  ],
  ['wrong class', (_name, repetition) => successfulWorker(names[1], repetition)],
  ['wrong repetition', (name) => successfulWorker(name, 1)],
  [
    'wrong scope',
    (name, repetition) => ({
      ...successfulWorker(name, repetition),
      stdout: JSON.stringify({ ...row(name, repetition, 108), scope: 'APPROVED_RUNTIME' }),
    }),
  ],
  [
    'worker throw',
    () => {
      throw new Error('spawn failed');
    },
  ],
])
  test(`holdout collector preserves ${label} without retry`, async (t) => {
    const c = await holdoutSetup(t);
    let calls = 0;
    const result = await c.collect(
      c.candidatePath,
      c.artifactDir,
      c.holdoutPath,
      (name, repetition) => {
        calls++;
        return name === names[0] ? worker(name, repetition) : successfulWorker(name, repetition);
      },
      identity,
    );
    assert.equal(calls, 22);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'WORKER_OR_PEAK_FAILED');
    const artifact = JSON.parse(await readFile(path.join(c.artifactDir, names[0] + '.json')));
    assert.equal(artifact.failure, result.failures[0].message);
    assert.deepEqual(artifact.child, result.failures[0].child);
    assert.deepEqual(JSON.parse(await readFile(c.holdoutPath)), result);
    if (label === 'peak excess') {
      assert.equal(result.observations[0].peakResidentBytes, 109 * 1024);
      assert.deepEqual(
        await (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
        c.candidate,
      );
    }
  });
test('invalid frozen candidate saves refusal before any worker starts', async (t) => {
  const c = await holdoutSetup(t);
  await c.save('candidate.json', {
    ...c.candidate,
    reservationBytes: c.candidate.reservationBytes + 1,
  });
  const result = await c.collect(
    c.candidatePath,
    c.artifactDir,
    c.holdoutPath,
    () => assert.fail('worker started'),
    identity,
  );
  assert.equal(result.failures[0].code, 'CANDIDATE_INVALID');
  assert.deepEqual(JSON.parse(await readFile(c.holdoutPath)), result);
});
test('holdout detects changed frozen candidate and preserves change failure', async (t) => {
  const c = await holdoutSetup(t);
  const result = await c.collect(
    c.candidatePath,
    c.artifactDir,
    c.holdoutPath,
    async (name, repetition) => {
      if (name === names[0]) await writeFile(c.candidatePath, 'changed');
      return successfulWorker(name, repetition);
    },
    identity,
  );
  assert.equal(result.failures.at(-1).code, 'CANDIDATE_CHANGED');
  assert.deepEqual(JSON.parse(await readFile(c.holdoutPath)), result);
});
test('holdout refuses reused output paths without overwriting evidence or running workers', async (t) => {
  const c = await holdoutSetup(t);
  const before = await readFile(c.candidatePath);
  await assert.rejects(
    c.collect(
      c.candidatePath,
      c.artifactDir,
      c.candidatePath,
      () => assert.fail('worker started'),
      identity,
    ),
  );
  await writeFile(c.holdoutPath, 'keep');
  await assert.rejects(
    c.collect(
      c.candidatePath,
      c.artifactDir,
      c.holdoutPath,
      () => assert.fail('worker started'),
      identity,
    ),
  );
  assert.deepEqual(await readFile(c.candidatePath), before);
  assert.equal(await readFile(c.holdoutPath, 'utf8'), 'keep');
});
test('holdout refuses reused worker artifacts and never overwrites the first run', async (t) => {
  const c = await holdoutSetup(t);
  await c.collect(c.candidatePath, c.artifactDir, c.holdoutPath, successfulWorker, identity);
  const artifactPath = path.join(c.artifactDir, names[0] + '.json');
  const before = await readFile(artifactPath);
  await assert.rejects(
    c.collect(
      c.candidatePath,
      c.artifactDir,
      path.join(c.root, 'another-holdout.json'),
      () => assert.fail('worker started'),
      identity,
    ),
  );
  assert.deepEqual(await readFile(artifactPath), before);
});
test('holdout candidate disappearance becomes a persisted change failure', async (t) => {
  const c = await holdoutSetup(t);
  const result = await c.collect(
    c.candidatePath,
    c.artifactDir,
    c.holdoutPath,
    async (name, repetition) => {
      if (name === names[0]) await rm(c.candidatePath);
      return successfulWorker(name, repetition);
    },
    identity,
  );
  assert.equal(result.failures.at(-1).code, 'CANDIDATE_CHANGED');
  assert.deepEqual(JSON.parse(await readFile(c.holdoutPath)), result);
});
test('D purpose candidate uses all 22 five-repeat classes and independent high-water/range arithmetic', async (t) => {
  const c = await setup(t);
  const candidate = await (await api()).buildRefreshTransportCandidate(c.path, c.root, identity);
  assert.equal(candidate.workspace, 'REFRESH_TRANSPORT');
  assert.equal(candidate.groups.length, 22);
  assert.ok(candidate.groups.every((g) => g.count === 5));
  assert.equal(candidate.observedPeakBytes, 106496);
  assert.equal(candidate.fluctuationAllowanceBytes, 4096);
  assert.equal(candidate.reservationBytes, 110592);
  assert.equal(candidate.priorApprovalFloorBytes, null);
  assert.equal(candidate.status, 'PROVISIONAL_REVIEW_REQUIRED');
  assert.equal(candidate.manifest.sha256, sha(await readFile(c.path)));
});
for (const [name, mutate] of [
  ['missing class', (r) => r.observations.splice(0, 5)],
  [
    'duplicate repetition',
    (r) => {
      r.observations[0].repetition = 1;
    },
  ],
  [
    'foreign purpose',
    (r) => {
      r.workspace = 'REFRESH_VERIFY';
    },
  ],
  [
    'build drift',
    (r) => {
      r.observations[0].environment.implementationDigest = sha('other');
    },
  ],
  [
    'payload drift',
    (r) => {
      r.observations[0].corpusPayloadDigest = sha('other');
    },
  ],
  [
    'outcome drift',
    (r) => {
      r.observations[0].observedOutcome = 'FAILED';
    },
  ],
  [
    'unknown row field',
    (r) => {
      r.observations[0].accepted = true;
    },
  ],
  [
    'worker failure',
    (r) => {
      r.failures.push({ code: 'WORKER_FAILED' });
    },
  ],
  [
    'wrong peak units',
    (r) => {
      r.observations[0].peakResidentBytes = 100;
    },
  ],
  [
    'startup omitted',
    (r) => {
      r.observations[0].samples[0].phase = 'finish';
    },
  ],
  [
    'wrong SQL surcharge',
    (r) => {
      r.observations[0].retainedSqlStringChargeBytes = 5;
    },
  ],
  [
    'unverified persisted image',
    (r) => {
      r.observations[0].persistentStateVerified = false;
    },
  ],
  [
    'TEMP retained',
    (r) => {
      r.observations[0].tempClosed = false;
    },
  ],
  [
    'open transaction',
    (r) => {
      r.observations[0].transactionClosed = false;
    },
  ],
])
  test(`D candidate refuses ${name}`, async (t) => {
    const c = await setup(t, mutate);
    await assert.rejects((await api()).buildRefreshTransportCandidate(c.path, c.root, identity));
  });
test('D candidate refuses report bytes changed after manifest hashing', async (t) => {
  const c = await setup(t);
  await c.save('report.json', { ...report(), failures: [{ code: 'changed' }] });
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    /hash/i,
  );
});
test('D candidate refuses omission of a compatible failed raw report', async (t) => {
  const c = await setup(t);
  await c.save('failed-history.json', { ...report(), failures: [{ code: 'WORKER_FAILED' }] });
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    /omitted/i,
  );
});
test('D candidate refuses another purpose as an approval floor', async (t) => {
  const c = await setup(t);
  const old = await c.save('foreign-candidate.json', {
    schemaVersion: 1,
    workspace: 'REFRESH_VERIFY',
    environment,
    corpus,
    reservationBytes: 999999,
  });
  c.manifest.priorApprovals.push({
    reservationBytes: 999999,
    candidatePath: old.path,
    candidateSha256: old.sha256,
  });
  await c.save('manifest.json', c.manifest);
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    (error) => error.actual === 'REFRESH_VERIFY' && error.expected === 'REFRESH_TRANSPORT',
  );
});
test('D candidate refuses an unapproved same-purpose candidate as a floor', async (t) => {
  const c = await setup(t);
  const candidate = await (await api()).buildRefreshTransportCandidate(c.path, c.root, identity);
  const old = await c.save('unapproved-candidate.json', candidate);
  c.manifest.priorApprovals.push({
    reservationBytes: candidate.reservationBytes,
    candidatePath: old.path,
    candidateSha256: old.sha256,
  });
  await c.save('manifest.json', c.manifest);
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    /installed exact-purpose approval/,
  );
});
test('D candidate does not fold a candidate-pinned holdout peak into calibration', async (t) => {
  const c = await setup(t);
  const core = await api();
  const candidate = await core.buildRefreshTransportCandidate(c.path, c.root, identity);
  const frozen = await c.save('candidate.json', candidate);
  await c.save('holdout.json', {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    candidateSha256: frozen.sha256,
    environment,
    corpus,
    observations: names.map((name) => row(name, 0, 1000)),
    failures: [{ code: 'WORKER_OR_PEAK_FAILED' }],
  });
  assert.deepEqual(await core.buildRefreshTransportCandidate(c.path, c.root, identity), candidate);
  assert.equal(sha(await readFile(path.join(c.root, 'candidate.json'))), frozen.sha256);
});
test('D candidate rejects holdout rows used as calibration', async (t) => {
  const c = await setup(t);
  c.manifest.reports = [
    await c.save('holdout.json', {
      ...report(),
      candidateSha256: sha('frozen-parent'),
      observations: names.map((name) => row(name, 0)),
    }),
  ];
  await c.save('manifest.json', c.manifest);
  await assert.rejects((await api()).buildRefreshTransportCandidate(c.path, c.root, identity));
});
test('D candidate rejects a forged holdout parent without its manifest/report provenance', async (t) => {
  const c = await setup(t);
  const parent = await c.save('fake-parent.json', {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    environment,
    corpus,
    policyRevision: 'p05-native-memory-high-water-range-v1',
    reservationBytes: 1,
    groups: Array.from({ length: 22 }, () => ({})),
  });
  await c.save('forged-holdout.json', {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    candidateSha256: parent.sha256,
    environment,
    corpus,
    observations: names.map((name) => row(name, 0)),
    failures: [],
  });
  await assert.rejects((await api()).buildRefreshTransportCandidate(c.path, c.root, identity));
});
test('D candidate refuses unsafe M+J even when individual observations are safe integers', async (t) => {
  const c = await setup(t, (r) => {
    const peakKiB = Math.floor(Number.MAX_SAFE_INTEGER / 1024);
    r.observations[0] = row(names[0], 0, peakKiB);
  });
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    /memory|bytes/i,
  );
});
test('D candidate includes expected refusal peaks rather than discarding negative classes', async (t) => {
  const local = structuredClone(identity);
  local.inputs['d-sql-preflight'].expectedOutcome = 'RESOURCE_LIMIT_EXCEEDED';
  const c = await setup(t, (r) => {
    for (const item of r.observations.filter((x) => x.name === 'd-sql-preflight')) {
      item.expectedOutcome = item.observedOutcome = 'RESOURCE_LIMIT_EXCEEDED';
      item.peakResidentBytes = 200 * 1024;
      item.samples[0].peakKiB = 200;
      item.samples[0].memory.rss = 200 * 1024;
    }
  });
  const candidate = await (await api()).buildRefreshTransportCandidate(c.path, c.root, local);
  assert.equal(candidate.observedPeakBytes, 204800);
  assert.equal(candidate.reservationBytes, 208896);
});
test('D candidate rejects report paths escaping the evidence root', async (t) => {
  const c = await setup(t);
  c.manifest.reports[0].path = c.path;
  await c.save('manifest.json', c.manifest);
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    /Relative evidence path/,
  );
});
test('D candidate rejects duplicate hashed reports', async (t) => {
  const c = await setup(t);
  c.manifest.reports.push(c.manifest.reports[0]);
  await c.save('manifest.json', c.manifest);
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, identity),
    /Duplicate report/,
  );
});
test('D candidate rejects incomplete independently pinned worker identities', async (t) => {
  const c = await setup(t);
  const local = structuredClone(identity);
  delete local.inputs['d-reopen'];
  await assert.rejects(
    (await api()).buildRefreshTransportCandidate(c.path, c.root, local),
    /Missing or unknown fields/,
  );
});
test('D candidate validates older frozen holdout provenance without adding its peaks', async (t) => {
  const c = await setup(t);
  await c.save('old-manifest.json', c.manifest);
  const core = await api();
  const old = await core.buildRefreshTransportCandidate(
    path.join(c.root, 'old-manifest.json'),
    c.root,
    identity,
  );
  const frozen = await c.save('old-candidate.json', old);
  await c.save('old-holdout.json', {
    schemaVersion: 1,
    workspace: 'REFRESH_TRANSPORT',
    candidateSha256: frozen.sha256,
    environment,
    corpus,
    observations: names.map((name) => row(name, 0, 1000)),
    failures: [{ code: 'WORKER_OR_PEAK_FAILED' }],
  });
  const extra = report();
  extra.observations = names.flatMap((name) =>
    Array.from({ length: 5 }, (_, i) => row(name, i, 101 + i)),
  );
  c.manifest.reports.push(await c.save('second-report.json', extra));
  await c.save('manifest.json', c.manifest);
  const candidate = await core.buildRefreshTransportCandidate(c.path, c.root, identity);
  assert.ok(candidate.groups.every((g) => g.count === 10));
  assert.equal(candidate.observedPeakBytes, 107520);
  assert.equal(candidate.fluctuationAllowanceBytes, 5120);
  assert.equal(candidate.reservationBytes, 112640);
});
