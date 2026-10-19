import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { persistPhase05Report } from './helpers/phase05-evaluation-fixture.mjs';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';
import * as comparison from './helpers/phase05-published-comparison.mjs';
import { RepositorySourceStateStore } from '../packages/storage/dist/index.js';
import {
  readEvaluationRetainedStateRows,
  readEvaluationRetainedNativeState,
} from '../packages/storage/dist/analysis/evaluation-state.js';
import { validateNativeStateCandidate } from '../packages/providers/dist/index.js';
import { emptyNativePatch } from '../packages/storage/test/helpers/native-refresh-patch-fixture.mjs';
import { baseCase } from '../packages/providers/test/helpers/native-full-v3-corpus.mjs';

const vectors = JSON.parse(
  await readFile(
    new URL(
      '../packages/evaluation/test/fixtures/phase05-layered-report-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

async function metadataFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-declared-metadata-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pins = await helper.capturePhase05PinnedInputs({ repositoryRoot: path.resolve('.') });
  const bytes = pins.readFile('p05-native-refresh-producer-v1', 'source/Caller.java');
  const prepared = await helper.preparePhase05PinnedRepository({
    directory: path.join(directory, 'owned'),
    baseline: { 'Caller.java': bytes },
    target: { 'Caller.java': bytes },
  });
  const configuration = JSON.parse(
    await readFile(
      new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
    ),
  ).configuration;
  configuration.resourceBudget = { maxMemoryBytes: 16, maxEvents: 10000, maxDurationMs: 10000 };
  const request = {
    schemaVersion: 1,
    operation: 'INCREMENTAL',
    initialize: false,
    databasePath: path.join(directory, 'owned', 'working.sqlite'),
    repositoryId: 'declared-metadata',
    repositoryRoot: prepared.repositoryRoot,
    nativeExecutablePath: path.join(directory, 'absent.exe'),
    configuration,
  };
  const source = (await helper.preparePhase05SourceSeed({ ...request, initialize: true })).state;
  return { directory, pins, source, request };
}

test('declared metadata preserves pinned Caller bytes and identity while changing only Source role and inventory fingerprint', async (t) => {
  assert.equal(typeof helper.preparePhase05DeclaredMetadataTarget, 'function');
  const f = await metadataFixture(t);
  const plan = await helper.preparePhase05DeclaredMetadataTarget({
    pinnedInputs: f.pins,
    sourceState: f.source,
  });
  assert.equal(plan.basis, 'DECLARED_SOURCE_IR');
  assert.deepEqual(plan.baseline, f.source);
  assert.equal(plan.target.files[0].classification.role, 'TEST');
  assert.equal(plan.baseline.files[0].classification.role, 'SOURCE');
  const adjusted = structuredClone(plan.target.files[0]);
  adjusted.classification.role = 'SOURCE';
  assert.deepEqual(adjusted, f.source.files[0]);
  assert.equal(plan.target.revision.id, f.source.revision.id);
  assert.notEqual(plan.target.revision.contentFingerprint, f.source.revision.contentFingerprint);
  // Real Git classification remains SOURCE; the declared target is not a public override.
  const scanned = (await helper.preparePhase05SourceSeed({ ...f.request, initialize: false }))
    .state;
  assert.deepEqual(scanned, f.source);
  for (const defect of ['bytes', 'role', 'path', 'fingerprint', 'duplicate']) {
    const wrong = structuredClone(f.source);
    if (defect === 'bytes') wrong.files[0].contentFingerprint = 'sha256:wrong';
    if (defect === 'role') wrong.files[0].classification.role = 'TEST';
    if (defect === 'path') wrong.files[0].path = 'Renamed.java';
    if (defect === 'fingerprint') wrong.revision.contentFingerprint = 'sha256:wrong';
    if (defect === 'duplicate') wrong.files.push(structuredClone(wrong.files[0]));
    await assert.rejects(
      helper.preparePhase05DeclaredMetadataTarget({ pinnedInputs: f.pins, sourceState: wrong }),
      undefined,
      defect,
    );
  }
});

test('declared metadata trial retains actual admission refusal without applying declared Source or inventing Native results', async (t) => {
  assert.equal(typeof helper.preparePhase05DeclaredMetadataTarget, 'function');
  assert.equal(typeof helper.runPhase05DeclaredMetadataTrial, 'function');
  const f = await metadataFixture(t);
  const target = await helper.preparePhase05DeclaredMetadataTarget({
    pinnedInputs: f.pins,
    sourceState: f.source,
  });
  const before = await readFile(f.request.databasePath);
  const saved = await helper.runPhase05DeclaredMetadataTrial({
    request: f.request,
    receiptDirectory: path.join(f.directory, 'owned', 'metadata-receipt'),
    metadataTarget: target,
  });
  const record = JSON.parse(await readFile(saved.receiptPath));
  assert.equal(record.executionBasis, 'DECLARED_SOURCE_IR');
  assert.equal(
    record.declaredSourceSha256,
    createHash('sha256')
      .update(
        JSON.stringify({
          baseline: target.baseline,
          target: target.target,
        }),
      )
      .digest('hex'),
  );
  assert.equal(record.outcome, 'FAILED');
  assert.equal(record.error.code, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(record.nativeObservation.childClosed, null);
  assert.equal(record.nativeObservation.sqlLifetime.openedConnections, 0);
  assert.equal(record.result, null);
  assert.deepEqual(await readFile(f.request.databasePath), before);
  await saved.assertUnchanged();
  await assert.rejects(
    helper.runPhase05DeclaredMetadataTrial({
      request: f.request,
      receiptDirectory: path.join(f.directory, 'owned', 'forged'),
      metadataTarget: structuredClone(target),
    }),
  );
  await assert.rejects(readFile(path.join(f.directory, 'owned', 'forged', 'receipt.json')), {
    code: 'ENOENT',
  });
});

test('declared metadata control refuses accessor plans and unsupported operation modes before output', async (t) => {
  const f = await metadataFixture(t);
  const target = await helper.preparePhase05DeclaredMetadataTarget({
    pinnedInputs: f.pins,
    sourceState: f.source,
  });
  for (const [name, extra] of [
    ['signal', { signal: new AbortController().signal }],
    ['partial', { expectedNativeOutcome: 'PARTIAL' }],
  ]) {
    const directory = path.join(f.directory, 'owned', name);
    await assert.rejects(
      helper.runPhase05DeclaredMetadataTrial({
        request: f.request,
        receiptDirectory: directory,
        metadataTarget: target,
        ...extra,
      }),
    );
    await assert.rejects(readFile(path.join(directory, 'receipt.json')), { code: 'ENOENT' });
  }
  let reads = 0;
  Object.defineProperty(target.target.files[0].classification, 'role', {
    enumerable: true,
    configurable: true,
    get() {
      reads++;
      return 'TEST';
    },
  });
  const directory = path.join(f.directory, 'owned', 'accessor');
  await assert.rejects(
    helper.runPhase05DeclaredMetadataTrial({
      request: f.request,
      receiptDirectory: directory,
      metadataTarget: target,
    }),
  );
  assert.equal(reads, 0);
  await assert.rejects(readFile(path.join(directory, 'receipt.json')), { code: 'ENOENT' });
});

function retainedControls(directory) {
  return {
    databasePath: path.join(directory, 'missing.sqlite'),
    repositoryId: 'repo',
    repositoryRoot: directory,
    budget: { maxMetadataRows: 5000, maxResultBytes: 1_000_000, timeoutMs: 10_000 },
    binding: {
      expected: {
        repositoryId: 'repo',
        revisionId: 'worktree',
        contentFingerprint: 'old',
        providerId: 'native',
        providerVersion: '1',
        language: {
          languageId: 'java',
          grammarVersion: '0.23.5',
          analyzerVersion: '1',
          compatibilityVersion: '1',
        },
        resolverVersion: '1',
        normalizerVersion: '2',
        policyFingerprint: 'policy',
        requestedCapabilities: ['SYMBOL'],
      },
      snapshotId: 'snapshot',
      sourceFiles: [],
      token: {
        committedSnapshotCount: 1,
        indexedRevisionId: 'worktree',
        indexedContentFingerprint: 'old',
        states: [{ providerId: 'native', snapshotId: 'snapshot', summaryDigest: '0'.repeat(64) }],
      },
      // Deliberately below any Runtime workspace: rejection, never a measured value.
      limits: { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 },
    },
  };
}

test('retained publication inspection requires Runtime READ_SEAL admission before SQL acquisition', async (t) => {
  assert.equal(typeof helper.readPhase05RetainedPublication, 'function');
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-retained-admission-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    helper.readPhase05RetainedPublication(retainedControls(directory)),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.deepEqual(await readdir(directory), []);
});

for (const defect of [
  'workspace',
  'owner',
  'token',
  'snapshot',
  'duplicate-token',
  'source-owner',
  'getter',
  'proxy',
]) {
  test(`retained publication rejects untrusted ${defect} controls without SQL or accessor execution`, async (t) => {
    assert.equal(typeof helper.readPhase05RetainedPublication, 'function');
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-retained-control-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const input = retainedControls(directory);
    let invoked = 0;
    if (defect === 'workspace') input.binding.limits.workspaceReservationBytes = 0;
    if (defect === 'owner') input.binding.expected.repositoryId = 'other';
    if (defect === 'token') input.binding.token.indexedContentFingerprint = 'target';
    if (defect === 'snapshot') input.binding.snapshotId = 'other';
    if (defect === 'duplicate-token')
      input.binding.token.states.push({ ...input.binding.token.states[0] });
    if (defect === 'source-owner')
      input.binding.sourceFiles.push({
        id: 'f',
        repositoryId: 'other',
        revisionId: 'worktree',
        path: 'A.java',
        contentFingerprint: 'file',
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: 'java',
        sensitivity: 'PUBLIC',
      });
    if (defect === 'getter')
      Object.defineProperty(input.binding, 'sourceFiles', {
        enumerable: true,
        get() {
          invoked++;
          throw new Error('accessor');
        },
      });
    if (defect === 'proxy')
      input.binding = new Proxy(input.binding, {
        ownKeys() {
          invoked++;
          throw new Error('proxy');
        },
      });
    await assert.rejects(
      helper.readPhase05RetainedPublication(input),
      /Invalid Evaluation retained controls/,
    );
    assert.equal(invoked, 0);
    assert.deepEqual(await readdir(directory), []);
  });
}

async function retainedComponent(t) {
  // Real Store component, not Runtime admission or live Native/PARTIAL evidence.
  const value = await emptyNativePatch(t, true, false, [], ':memory:', null, '2');
  value.stage.close();
  const store = new RepositorySourceStateStore(value.db);
  const originalFiles = baseCase('shared').request.payload.sourceFiles;
  const initial = store.load('r');
  const original = {
    revision: { ...initial.revision, contentFingerprint: 'base' },
    files: originalFiles,
  };
  store.replace(initial, original);
  const binding = {
    expected: value.context.baseline.expected,
    snapshotId: 'snap',
    token: value.token,
    sourceFiles: originalFiles,
    limits: { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 },
  };
  const control = { checkpoint: async () => {}, reserveText() {}, chargeMetadataRow() {} };
  const capture = async () => {
    const currentSource = store.load('r');
    value.db.exec('PRAGMA query_only=1; BEGIN');
    try {
      const tables = await readEvaluationRetainedStateRows(value.db, 'r', control, binding);
      const nativeInspection = await readEvaluationRetainedNativeState(
        value.db,
        binding,
        control,
        validateNativeStateCandidate,
      );
      return {
        kind: 'RETAINED_PUBLICATION_ONLY',
        currentSource,
        publicationRows: Object.fromEntries(
          Object.entries(tables).filter(([key]) => !['revisions', 'source_files'].includes(key)),
        ),
        nativeInspection,
      };
    } finally {
      value.db.exec('ROLLBACK; PRAGMA query_only=0');
    }
  };
  const expected = await capture();
  const currentSource = {
    revision: { ...original.revision, contentFingerprint: 'target' },
    files: originalFiles.map((file) => ({
      ...file,
      classification: { ...file.classification, role: 'TEST' },
    })),
  };
  store.replace(original, currentSource);
  return { expected, actual: await capture(), currentSource };
}

test('retained comparison preserves a nonempty old publication while independently binding stale Source', async (t) => {
  assert.equal(typeof comparison.comparePhase05RetainedPublications, 'function');
  const input = await retainedComponent(t);
  assert.ok(input.expected.publicationRows.canonical_nodes.length > 0);
  const result = comparison.comparePhase05RetainedPublications(input);
  assert.deepEqual(result, {
    publicationEqual: true,
    nativeStateEqual: true,
    currentSourceEqual: true,
    freshness: 'STALE',
  });
});

for (const defect of ['graph', 'evidence', 'snapshot', 'native-state', 'target-source']) {
  test(`retained comparison exposes changed ${defect} instead of blessing matching revision IDs`, async (t) => {
    assert.equal(typeof comparison.comparePhase05RetainedPublications, 'function');
    const input = await retainedComponent(t);
    if (defect === 'graph') input.actual.publicationRows.canonical_nodes[0].name = 'Changed';
    if (defect === 'evidence') input.actual.publicationRows.evidence[0].status = 'SUPERSEDED';
    if (defect === 'snapshot') input.actual.publicationRows.provider_snapshots[0].completed_at++;
    if (defect === 'native-state') {
      input.actual.nativeInspection = structuredClone(input.actual.nativeInspection);
      input.actual.nativeInspection.token.committedSnapshotCount++;
    }
    if (defect === 'target-source')
      input.currentSource.revision.contentFingerprint = 'independent-other-target';
    const result = comparison.comparePhase05RetainedPublications(input);
    assert.equal(
      result.publicationEqual && result.nativeStateEqual && result.currentSourceEqual,
      false,
    );
  });
}
function missingInput() {
  return {
    schemaVersion: 2,
    identity: structuredClone(vectors.identity),
    observations: [],
    requiredRuns: vectors.policy.map(
      ([fixtureId, scenario, completionOrderId, executionKind, expectedOutcome]) => ({
        fixtureId,
        scenario,
        completionOrderId,
        executionKind,
        expectedOutcome,
        repetition: 1,
        requestedWorkers:
          executionKind === 'RECORDED_PROVIDER_SQLITE'
            ? null
            : completionOrderId?.endsWith('_2')
              ? 2
              : 1,
        expectedEffectiveWorkers:
          executionKind === 'RECORDED_PROVIDER_SQLITE'
            ? null
            : completionOrderId?.endsWith('_2')
              ? 2
              : 1,
      }),
    ),
  };
}
test('owned report writer explicitly persists v2 with all missing cases still failed', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-layered-io-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const reportPath = await persistPhase05Report({
    directory: path.join(base, 'report'),
    input: missingInput(),
  });
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.overall, 'FAIL');
  assert.equal(report.requiredRuns.length, 31);
  assert.equal(report.missingRuns.length, 31);
  await assert.rejects(
    persistPhase05Report({ directory: path.dirname(reportPath), input: missingInput() }),
  );
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
});
test('invalid v2 or unknown report versions refuse before output acquisition', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-layered-refusal-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  for (const version of [0, 3, '2', null])
    await assert.rejects(
      persistPhase05Report({
        directory: path.join(base, 'report'),
        input: { ...missingInput(), schemaVersion: version },
      }),
    );
  const data = missingInput();
  data.requiredRuns.pop();
  await assert.rejects(persistPhase05Report({ directory: path.join(base, 'report'), input: data }));
  assert.deepEqual(await readdir(base), []);
});
test('version dispatch does not execute a caller schemaVersion getter', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-layered-getter-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  let calls = 0;
  const data = missingInput();
  Object.defineProperty(data, 'schemaVersion', {
    enumerable: true,
    get() {
      calls++;
      return 2;
    },
  });
  await assert.rejects(persistPhase05Report({ directory: path.join(base, 'report'), input: data }));
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(base), []);
});
