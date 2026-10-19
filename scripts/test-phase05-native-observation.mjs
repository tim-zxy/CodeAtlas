import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  executeNativeRequest,
  validateNativeStateCandidate,
  streamNativeRefreshV3,
  streamNativeFullAnalysisV3,
} from '../packages/providers/dist/index.js';
import { DatabaseSync } from 'node:sqlite';
import {
  readNativeRefreshBaseline,
  openRepositoryIndexSession,
} from '../packages/storage/dist/index.js';
import { createNativeRefreshPreparation } from '../packages/runtime/dist/native-refresh-preparation.js';
import { applyPreparedNativeRefreshAnalysisV3 } from '../packages/runtime/dist/native-refresh-workspace.js';
import {
  preparedSourceRefresh,
  sourceTransitions,
  activationImage,
} from '../packages/runtime/test/helpers/native-refresh-source-fixture.mjs';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';
import {
  verifyPhase05PartialSites,
  phase05ObservedClosure,
  verifyPhase05ConsumedNativeRecords,
} from './evaluate-phase05.mjs';
import * as phase05Runner from './evaluate-phase05.mjs';

const request = {
  protocolVersion: 1,
  requestId: 'phase05-lifecycle',
  type: 'DESCRIBE',
  payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
};
const limits = {
  maxStdinBytes: 1000000,
  maxLineBytes: 1000000,
  maxStdoutBytes: 10000000,
  maxEvents: 10000,
  maxStderrBytes: 1000000,
};
const executablePath = path.resolve(
  'target/debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const options = {
  executablePath,
  timeoutMs: 10000,
  limits,
  allowedEnvironment: Object.fromEntries(
    ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  ),
};

const diagnosticControls = (f) => ({
  transportLimits: f.options.limits ?? limits,
  resourceBudget: f.prepared.request.payload.resourceBudget,
});

test('Native observation separates an expected Git probe failure from consumed Native streams while closing both children', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-observed-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exec = promisify(execFile);
  await exec('git', ['init', '--quiet', root], { windowsHide: true });
  const full = JSON.parse(
    (await readFile('fixtures/ipc/protocol-v3/valid-full.jsonl', 'utf8')).split('\n')[0],
  );
  full.payload.repository.rootPath = root;
  full.payload.resourceBudget = {
    maxDurationMs: 10000,
    maxMemoryBytes: 128 * 1024 * 1024,
    maxEvents: 10000,
  };
  const observed = await helper.observePhase05NativeOperation(
    {
      executablePath,
      observationConfiguration: {
        transportLimits: limits,
        resourceBudget: full.payload.resourceBudget,
      },
    },
    async () => {
      // An unborn Git repository is an existing supported Source input. Its
      // expected rev-parse status must not become a Native failure or stderr.
      const git = spawn('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], {
        windowsHide: true,
      });
      const closed = new Promise((resolve, reject) => {
        git.once('close', resolve);
        git.once('error', reject);
      });
      git.stdin.end();
      await Promise.all(
        [git.stdout, git.stderr].map(async (stream) => {
          for await (const chunk of stream) {
            void chunk;
          }
        }),
      );
      assert.equal(await closed, 128);
      return streamNativeFullAnalysisV3(full, options, { async accept() {} });
    },
  );
  assert.equal(observed.threw, false);
  assert.equal(observed.evidence.children.length, 2);
  assert.equal(observed.evidence.children[0].executableMatches, false);
  assert.equal(observed.evidence.children[0].exitCode, 128);
  assert.ok(
    observed.evidence.children.every(
      (c) => c.closeObserved && c.stdinClosed && c.stdoutClosed && c.stderrClosed,
    ),
  );
  assert.equal(observed.evidence.childClosed, true);
  assert.equal(observed.evidence.wire.length, 1);
  assert.equal(observed.evidence.nativeStream.captureFailed, false);
  assert.equal(observed.evidence.parseObservation.complete, true);
  const input = {
    record: {
      operation: 'FULL',
      outcome: 'SUCCEEDED',
      result: { workers: { effectiveCount: 1 } },
      nativeObservation: observed.evidence,
    },
    source: { revision: full.payload.revision, files: [] },
    capabilities: full.payload.requestedCapabilities,
  };
  assert.equal(verifyPhase05ConsumedNativeRecords(input), true);
  assert.equal(phase05Runner.verifyPhase05ParseObservation(input), true);
  for (const mutate of [
    (x) => {
      x.record.nativeObservation.children[1].exitCode = 1;
    },
    (x) => {
      x.record.nativeObservation.children[1].executableMatches = false;
    },
    (x) => {
      x.record.nativeObservation.childClosed = false;
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.equal(verifyPhase05ConsumedNativeRecords(changed), false);
    assert.equal(phase05Runner.verifyPhase05ParseObservation(changed), false);
  }
});

test('consumed real full-v3 diagnostics retain both parses and the real ANALYSIS_COMPLETED terminal', async () => {
  const full = JSON.parse(
    (await readFile('fixtures/ipc/protocol-v3/valid-full.jsonl', 'utf8')).split('\n')[0],
  );
  full.payload.repository.rootPath = path.resolve('fixtures/native/java-basic-symbol/source');
  const bytes = await readFile(path.join(full.payload.repository.rootPath, 'src/Basic.java'));
  full.payload.sourceFiles = [
    {
      id: 'private-source-id',
      repositoryId: 'r',
      revisionId: 'rev',
      path: 'src/Basic.java',
      contentFingerprint: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    },
  ];
  full.payload.requestedCapabilities = ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'];
  full.payload.resourceBudget = {
    maxDurationMs: 10000,
    maxMemoryBytes: 128 * 1024 * 1024,
    maxEvents: 10000,
  };
  const observed = await helper.observePhase05NativeOperation(
    {
      executablePath,
      observationConfiguration: {
        transportLimits: limits,
        resourceBudget: full.payload.resourceBudget,
      },
    },
    () => streamNativeFullAnalysisV3(full, options, { async accept() {} }),
  );
  assert.equal(observed.threw, false);
  assert.equal(observed.evidence.childClosed, true);
  assert.equal(observed.evidence.nativeStream.terminal?.type, 'ANALYSIS_COMPLETED');
  assert.equal(observed.evidence.parseObservation.complete, true);
  assert.equal(observed.evidence.parseObservation.invocations.length, 2);
  assert.equal(observed.evidence.parseObservation.finished, 2);
  assert.equal(
    verifyPhase05ConsumedNativeRecords({
      record: {
        operation: 'FULL',
        outcome: 'SUCCEEDED',
        result: {},
        nativeObservation: observed.evidence,
      },
      source: { revision: full.payload.revision, files: full.payload.sourceFiles },
    }),
    true,
  );
  assert.equal(typeof phase05Runner.verifyPhase05ParseObservation, 'function');
  const input = {
    record: {
      operation: 'FULL',
      outcome: 'SUCCEEDED',
      result: { workers: { effectiveCount: 1 } },
      nativeObservation: observed.evidence,
    },
    source: { revision: full.payload.revision, files: full.payload.sourceFiles },
    capabilities: full.payload.requestedCapabilities,
  };
  assert.equal(phase05Runner.verifyPhase05ParseObservation(input), true);
  for (const change of [
    (x) => x.record.nativeObservation.parseObservation.invocations.pop(),
    (x) => (x.record.nativeObservation.parseObservation.requestRefSha256 = '0'.repeat(64)),
    (x) => (x.record.nativeObservation.children[0].exitCode = 2),
    (x) =>
      (x.record.nativeObservation.parseObservation.invocations[0].sourceRefSha256 = '0'.repeat(64)),
    (x) => (x.capabilities = ['SYMBOL']),
    (x) => (x.record.nativeObservation.parseObservation.complete = false),
  ]) {
    const mutated = structuredClone(input);
    change(mutated);
    assert.equal(phase05Runner.verifyPhase05ParseObservation(mutated), false);
  }
});

for (const id of [
  'shared-first-owner-deletion',
  'shared-nonlast-owner-deletion',
  'shared-last-owner-deletion-zero-target',
]) {
  test(`consumed real Rust ${id} retains raw shared operations instead of inferring them from final state`, async (t) => {
    const row = sourceTransitions.find((item) => item.id === id);
    const f = await preparedSourceRefresh(t, row);
    const baseline = {
      nativeBaseline: { state: f.prepared.baselineState },
      supports: {
        sourceFiles: f.prepared.baseline.summaries.map((summary) => summary.sourceFile),
        candidates: f.db
          .prepare('SELECT evidence_id,candidate_json FROM active_support_candidates')
          .all()
          .map((row) => ({
            evidenceId: row.evidence_id,
            candidate: JSON.parse(row.candidate_json),
          })),
        bindings: f.db
          .prepare(
            'SELECT evidence_id,fact_type,provider_id,provider_fact_id FROM provider_fact_bindings',
          )
          .all()
          .map((row) => ({
            evidenceId: row.evidence_id,
            providerFact: {
              factType: row.fact_type,
              providerId: row.provider_id,
              providerFactId: row.provider_fact_id,
            },
          })),
      },
    };
    const observed = await helper.observePhase05NativeOperation(
      { executablePath: f.options.executablePath, observationConfiguration: diagnosticControls(f) },
      () =>
        streamNativeRefreshV3(
          f.prepared.request,
          f.prepared.baseline,
          f.options,
          { async accept() {} },
          f.prepared.limits.memoryBudgetBytes,
        ),
    );
    assert.equal(observed.threw, false);
    assert.equal(observed.evidence.parseObservation.complete, true);
    assert.equal(observed.evidence.parseObservation.started, 0);
    assert.equal(observed.evidence.parseObservation.finished, 0);
    const capture = observed.evidence.nativeStream;
    assert.ok(capture, 'raw operations are independent of persisted state');
    assert.equal(capture.captureFailed, false);
    assert.equal(capture.terminal.type, 'REFRESH_COMPLETED');
    assert.equal(capture.terminal.payload.counts.sourceFiles, 0);
    assert.equal(capture.siteEvents.filter((e) => e.type === 'SOURCE_FILE').length, 0);
    const shared = capture.operations.filter((e) =>
      e.payload.providerFactId.startsWith('java-package-container-v1:'),
    );
    assert.equal(shared.length, row.shared.operations);
    if (shared.length) assert.equal(shared[0].type, 'REMOVE_NODE');
    assert.equal(observed.evidence.childClosed, true);
    assert.equal(
      verifyPhase05ConsumedNativeRecords({
        record: {
          outcome: 'SUCCEEDED',
          operation: 'INCREMENTAL',
          result: observed.value,
          nativeObservation: observed.evidence,
        },
        source: { revision: f.targetRevision, files: f.targetFiles },
        baseline,
        recipe: row,
      }),
      true,
    );
  });
}

test('PARTIAL observation does not convert a generic no-spawn refusal into validated Native completion', async () => {
  assert.equal(typeof helper.observePhase05PartialRefreshOperation, 'function');
  const failure = new Error('refused before transport');
  const result = await helper.observePhase05PartialRefreshOperation(
    { executablePath },
    async () => {
      throw failure;
    },
  );
  assert.equal(result.error, failure);
  assert.equal(result.evidence.partialRefresh.validatedPartialBranch, false);
  assert.equal(result.evidence.childClosed, null);
});

test('PARTIAL observation preserves malformed terminal refusal instead of throwing from its own decoder', async () => {
  const executablePath = process.execPath;
  const result = await helper.observePhase05PartialRefreshOperation({ executablePath }, () =>
    executeNativeRequest(request, {
      ...options,
      executablePath,
      arguments: [
        '-e',
        `process.stdout.write(JSON.stringify({protocolVersion:3,requestId:'bad',sequence:0,type:'REFRESH_COMPLETED',payload:null})+'\\n')`,
      ],
    }),
  );
  assert.equal(result.threw, true);
  assert.ok(result.error instanceof Error);
  assert.equal(result.evidence.partialRefresh.validatedPartialBranch, false);
});

for (const id of [
  'syntax-partial-retained-restart',
  'unsupported-recognized-region-retained-restart',
]) {
  test(`actual Rust ${id} exposes validated PARTIAL and guarded downstream no-call without publication`, async (t) => {
    assert.equal(typeof helper.observePhase05PartialRefreshOperation, 'function');
    // Offline component construction only; not an admitted public index run or D5 qualification.
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((row) => row.id === id),
    );
    const before = activationImage(f.db);
    f.db.close();
    const result = await helper.observePhase05PartialRefreshOperation(
      { executablePath: f.options.executablePath, observationConfiguration: diagnosticControls(f) },
      async () => {
        const session = await openRepositoryIndexSession(
          {
            databasePath: f.databasePath,
            repositoryRoot: path.dirname(f.databasePath),
            repositoryId: f.prepared.request.payload.repository.id,
            initialize: false,
            readOnly: false,
          },
          { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
        );
        const db = session.database;
        try {
          if (id === 'syntax-partial-retained-restart')
            await executeNativeRequest(request, { ...f.options, arguments: [] });
          const baseline = readNativeRefreshBaseline(
            db,
            f.prepared.trustedContext,
            validateNativeStateCandidate,
            f.prepared.limits,
          );
          assert.equal(baseline.status, 'AVAILABLE');
          const {
            baseRevisionId,
            baseRevisionFingerprint,
            baselineState,
            targetSourceFiles,
            changes,
            ...payload
          } = f.prepared.request.payload;
          const prepared = createNativeRefreshPreparation(
            {
              requestId: `observed-${id}`,
              descriptor: f.prepared.descriptor,
              trustedContext: f.prepared.trustedContext,
              payload,
            },
            baseline,
            f.prepared.limits.memoryBudgetBytes,
            f.options,
          );
          return await applyPreparedNativeRefreshAnalysisV3(db, prepared, f.options);
        } finally {
          assert.deepEqual(activationImage(db), before);
          assert.equal(db.isTransaction, false);
          // The owner observes TEMP/sequence state before actual connection close.
          session.close();
        }
      },
    );
    assert.equal(result.threw, true);
    assert.equal(result.evidence.parseObservation.complete, true);
    assert.equal(result.evidence.parseObservation.invocations.length, 1);
    assert.equal(result.evidence.parseObservation.invocations[0].outcome, 'PARTIAL');
    assert.equal(result.evidence.childClosed, true);
    assert.equal(result.evidence.children.length, id === 'syntax-partial-retained-restart' ? 2 : 1);
    assert.equal(result.evidence.children[0].exitCode, 0);
    assert.equal(result.evidence.partialRefresh.validatedPartialBranch, true);
    assert.equal(result.evidence.partialRefresh.completionCalls, 1);
    assert.equal(result.evidence.partialRefresh.normalizationCalls, 0);
    assert.equal(result.evidence.partialRefresh.terminalCaptureFailed, false);
    assert.equal(result.evidence.partialRefresh.terminal.requestId, `observed-${id}`);
    assert.equal(result.evidence.partialRefresh.terminal.type, 'REFRESH_COMPLETED');
    assert.equal(result.evidence.partialRefresh.terminal.payload.outcome, 'PARTIAL');
    assert.equal(
      result.evidence.partialRefresh.terminal.payload.revisionFingerprint,
      f.targetRevision.contentFingerprint,
    );
    assert.equal(result.evidence.partialRefresh.terminal.payload.counts.sourceFiles, 1);
    assert.equal(
      verifyPhase05PartialSites(
        sourceTransitions.find((row) => row.id === id),
        result.evidence.partialRefresh,
        { files: f.targetFiles },
      ),
      true,
    );
    assert.deepEqual(phase05ObservedClosure(result.evidence), {
      transactionClosed: true,
      tempClosed: true,
      childClosed: true,
    });
    const sites = result.evidence.partialRefresh.siteEvents;
    assert.ok(Array.isArray(sites), 'original source/coverage/diagnostic records must be retained');
    assert.equal(sites.filter((e) => e.type === 'SOURCE_FILE').length, 1);
    assert.equal(sites.filter((e) => e.type === 'COVERAGE').length, 5);
    const diagnostics = sites.filter((e) => e.type === 'DIAGNOSTIC');
    assert.equal(diagnostics.length, 1);
    assert.equal(
      diagnostics[0].payload.code,
      id === 'syntax-partial-retained-restart' ? 'SYNTAX_ERROR' : 'UNSUPPORTED_RELATION_SOURCE',
    );
    assert.equal(diagnostics[0].payload.sourceRange.sourceFileId, f.targetFiles[0].id);
    if (id === 'unsupported-recognized-region-retained-restart') {
      const call = sites.find((e) => e.type === 'COVERAGE' && e.payload.capability === 'CALL');
      assert.equal(call.payload.statistics.eligibleSites, 1);
      assert.equal(call.payload.statistics.unsupportedSites, 1);
      assert.equal(call.payload.statistics.coveredSites, 0);
    }
    assert.deepEqual(
      result.evidence.partialRefresh.sourceLifetime.coverage
        .filter((item) => ['NORMALIZE', 'SEAL', 'APPLY'].includes(item.family))
        .map((item) => item.disposition),
      ['PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED'],
    );
    const reopened = new DatabaseSync(f.databasePath, { readOnly: true });
    try {
      assert.deepEqual(activationImage(reopened), before);
    } finally {
      reopened.close();
    }
  });
}

test('Native observation preserves a no-spawn refusal without inventing child closure', async () => {
  assert.equal(typeof helper.observePhase05NativeOperation, 'function');
  const failure = new Error('refused before spawn');
  const result = await helper.observePhase05NativeOperation({ executablePath }, async () => {
    throw failure;
  });
  assert.equal(result.error, failure);
  assert.equal(result.threw, true);
  assert.deepEqual(result.evidence.children, []);
  assert.equal(result.evidence.childClosed, null);
  assert.deepEqual(result.evidence.wire, []);
});

test('Native observation sees real Rust DESCRIBE close and consumed wire without changing its result', async () => {
  assert.equal(typeof helper.observePhase05NativeOperation, 'function');
  const result = await helper.observePhase05NativeOperation({ executablePath }, () =>
    executeNativeRequest(request, options),
  );
  assert.equal(result.threw, false);
  assert.equal(result.value.terminal.type, 'DESCRIBE_COMPLETED');
  assert.equal(result.evidence.children.length, 1);
  assert.equal(result.evidence.children[0].executableMatches, true);
  assert.equal(result.evidence.children[0].exitCode, 0);
  assert.equal(result.evidence.childClosed, true);
  assert.ok(result.evidence.wire[0].inputBytes > 0);
  assert.ok(result.evidence.wire[0].outputBytes > 0);
});

test('Native observation preserves a real client timeout and waits for observed child closure', async () => {
  assert.equal(typeof helper.observePhase05NativeOperation, 'function');
  // Fault child only, not successful Native extraction or indexing acceptance.
  const executablePath = process.execPath;
  const result = await helper.observePhase05NativeOperation({ executablePath }, () =>
    executeNativeRequest(request, {
      ...options,
      executablePath,
      arguments: ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000)'],
      timeoutMs: 1000,
    }),
  );
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'TIMEOUT');
  assert.equal(result.evidence.children.length, 1);
  assert.equal(result.evidence.childClosed, true);
  assert.equal(result.evidence.wire[0].outputBytes, 0);
});

test('Native observation cannot certify a different executable as the expected child', async () => {
  assert.equal(typeof helper.observePhase05NativeOperation, 'function');
  const result = await helper.observePhase05NativeOperation(
    { executablePath: process.execPath },
    () => executeNativeRequest(request, options),
  );
  assert.equal(result.threw, false);
  assert.equal(result.evidence.children[0].executableMatches, false);
  assert.equal(result.evidence.childClosed, null);
});
