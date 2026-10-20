import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../dist/index.js';
import { buildRefreshCase, chunkBytes, finish } from './helpers/native-refresh-v3-corpus.mjs';
import { baseCase, stateDigest, factDigest } from './helpers/native-full-v3-corpus.mjs';
import { normalizeJavaNode } from '../dist/java-node-normalizer.js';
import { normalizeJavaEdge } from '../dist/canonical-normalizer.js';
import { collectMergeSupports } from '../dist/fact-merger-input.js';

// D3 preflight of its mandatory C proof, not database overlay/seal acceptance.
const globalDiagnostic = {
  code: 'RUN_NOTICE',
  severity: 'INFO',
  message: 'Run observation',
  sourceRange: null,
};
function observation(declared = [], emitted = []) {
  const c = buildRefreshCase('noop');
  const summaries = c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY');
  declared.forEach((diagnostics, i) => {
    summaries[i].payload.diagnostics = diagnostics;
  });
  const terminal = c.records.at(-1);
  terminal.payload.analysisState.summaryDigest = stateDigest(summaries.map((e) => e.payload));
  terminal.payload.counts.diagnostics = emitted.length;
  c.records.splice(
    c.records.length - 1,
    0,
    ...emitted.map((payload) => ({
      protocolVersion: 3,
      requestId: c.request.requestId,
      type: 'DIAGNOSTIC',
      payload,
    })),
  );
  c.eventBytes = finish(c.records);
  return c;
}
async function decode(c) {
  return api.decodeNativeRefreshV3(
    c.requestBytes,
    chunkBytes(c.eventBytes),
    { async accept() {} },
    api.NATIVE_CLIENT_HARD_LIMITS,
    c.trustedMemoryBudgetBytes,
  );
}
const violation = (error) =>
  error instanceof api.NativeClientError && error.code === 'PROTOCOL_VIOLATION';

test('D3 preflight: run-global diagnostics remain stream-only observations', async () => {
  const result = await decode(observation([], [globalDiagnostic]));
  assert.equal(result.terminal.payload.counts.diagnostics, 1);
  assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
});

test('D3 preflight: source-less file diagnostics require one originating file and observation', async () => {
  await assert.rejects(
    decode(
      observation([[globalDiagnostic], [globalDiagnostic]], [globalDiagnostic, globalDiagnostic]),
    ),
    violation,
  );
  await assert.rejects(decode(observation([[globalDiagnostic]], [])), violation);
  await assert.rejects(
    decode(observation([[globalDiagnostic]], [globalDiagnostic, globalDiagnostic])),
    violation,
  );
  const result = await decode(observation([[globalDiagnostic]], [globalDiagnostic]));
  assert.equal(result.terminal.payload.counts.diagnostics, 1);
});

test('D3 preflight: undeclared source-backed diagnostics still refuse', async () => {
  const local = {
    ...globalDiagnostic,
    sourceRange: { sourceFileId: 'f-0', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
  };
  await assert.rejects(decode(observation([], [local])), violation);
  const result = await decode(observation([[local]], [local]));
  assert.equal(result.terminal.payload.counts.diagnostics, 1);
});

const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };
function expectation(header) {
  const { schemaVersion, sourceFileCount, summaryDigest, ...expected } = header;
  return expected;
}
function state(bundle) {
  return {
    expected: expectation(bundle.header),
    headerJson: JSON.stringify(bundle.header),
    summaryDigest: bundle.header.summaryDigest,
    files: bundle.summaries.map((s) => ({
      sourceFileId: s.sourceFile.id,
      sourcePath: s.sourceFile.path,
      contentFingerprint: s.sourceFile.contentFingerprint,
      summaryJson: JSON.stringify(s),
    })),
  };
}
function snapshot(id, fingerprint, capabilities) {
  return {
    id,
    repositoryId: 'r',
    providerId: 'native',
    providerVersion: '0.0.0',
    runtimeVersion: '0.0.0',
    requestedRevisionId: 'rev',
    requestedRevisionFingerprint: fingerprint,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: capabilities.map((name) => ({
      name,
      support: 'SUPPORTED',
      coverage: 'COMPLETE',
    })),
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
}
// Independent C contract observations, not real Java resolver or database
// acceptance. Remove the helper's deliberately nullable synthetic CU facts:
// production CU normalization requires the real producer's path qualifiedName.
function overlay(mode = 'noop') {
  const c = buildRefreshCase(mode),
    baseline = c.baseline;
  const target = {
    header: c.records.at(-1).payload.analysisState,
    summaries: c.records.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload),
  };
  for (const bundle of [baseline, target]) {
    for (const s of bundle.summaries)
      s.emittedFacts = s.emittedFacts.filter(
        (f) => !f.providerFactId.startsWith('java-compilation-unit-v1:'),
      );
    bundle.header.summaryDigest = stateDigest(bundle.summaries);
  }
  const files = new Map(baseline.summaries.map((s) => [s.sourceFile.id, s.sourceFile]));
  const nodePairs = baseCase('shared')
    .nodes.filter((n) => n.providerKind !== 'java.compilation_unit')
    .map((n) => ({
      provider: { factType: 'NODE', providerId: 'native', providerFactId: n.providerFactId },
      canonical: normalizeJavaNode(n, files),
    }));
  const nodes = new Map(nodePairs.map((p) => [p.provider.providerFactId, p.canonical]));
  const upsertNodes = c.records.filter((e) => e.type === 'UPSERT_NODE').map((e) => e.payload);
  const upsertEdges = c.records.filter((e) => e.type === 'UPSERT_EDGE').map((e) => e.payload);
  const oldEdges = upsertEdges.map((e) => ({
    ...e,
    providerSnapshotId: 'snap',
    target: {
      state: 'UNRESOLVED',
      resolution: 'UNRESOLVED',
      originalHint: 'later',
      candidates: [],
    },
  }));
  const edgePairs = oldEdges.map((e) => ({
    provider: { factType: 'EDGE', providerId: 'native', providerFactId: e.providerFactId },
    canonical: normalizeJavaEdge(e, nodes, files),
  }));
  const old = snapshot('snap', 'base', baseline.header.requestedCapabilities);
  const activeSupports = collectMergeSupports({
    repositoryId: 'r',
    revisionId: 'rev',
    observations: [{ snapshot: old, nodes: nodePairs, edges: edgePairs }],
  }).map((s) => ({
    ...s,
    snapshot: {
      id: old.id,
      repositoryId: old.repositoryId,
      providerId: old.providerId,
      providerVersion: old.providerVersion,
      requestedRevisionId: old.requestedRevisionId,
      requestedRevisionFingerprint: old.requestedRevisionFingerprint,
      outcome: old.outcome,
    },
  }));
  const nextSnapshot = snapshot(
    'snap-next',
    target.header.contentFingerprint,
    target.header.requestedCapabilities,
  );
  const normalizedNodes = upsertNodes.map((n) => ({
    provider: { factType: 'NODE', providerId: 'native', providerFactId: n.providerFactId },
    canonical: normalizeJavaNode(n, files),
  }));
  const normalizedEdges = upsertEdges.map((e) => ({
    provider: { factType: 'EDGE', providerId: 'native', providerFactId: e.providerFactId },
    canonical: normalizeJavaEdge(e, nodes, files),
  }));
  return {
    ...limits,
    expected: expectation(target.header),
    baseline: state(baseline),
    baselineToken: {
      committedSnapshotCount: 1,
      indexedRevisionId: 'rev',
      indexedContentFingerprint: 'base',
      states: [
        { providerId: 'native', snapshotId: 'snap', summaryDigest: baseline.header.summaryDigest },
      ],
    },
    snapshot: nextSnapshot,
    headerJson: JSON.stringify(target.header),
    files: state(target).files,
    targetSourceFiles: target.summaries.map((s) => s.sourceFile),
    changedSourceFiles: c.records.filter((e) => e.type === 'SOURCE_FILE').map((e) => e.payload),
    upsertNodes,
    upsertEdges,
    removeNodes: c.records
      .filter(
        (e) =>
          e.type === 'REMOVE_NODE' &&
          !e.payload.providerFactId.startsWith('java-compilation-unit-v1:'),
      )
      .map((e) => e.payload),
    removeEdges: [],
    normalizedNodes,
    normalizedEdges,
    supports: collectMergeSupports({
      repositoryId: 'r',
      revisionId: 'rev',
      observations: [
        {
          snapshot: nextSnapshot,
          nodes: normalizedNodes,
          edges: normalizedEdges,
        },
      ],
    }),
    activeSupports,
    coverage: target.summaries.flatMap((s) => s.coverage),
    diagnostics: [],
  };
}
const invalidOverlay = (error) =>
  error instanceof api.NativeStateValidationError && error.nativeStateReason === 'INVALID';

test('D3 overlay binds exactly the Native baseline ledger without changing retained provenance', () => {
  const input = overlay();
  assert.equal(typeof api.validateNativeRefreshOverlay, 'function');
  const before = structuredClone(input.activeSupports);
  const result = api.validateNativeRefreshOverlay(input);
  assert.equal(result.summaryDigest, input.baseline.summaryDigest);
  assert.deepEqual(input.activeSupports, before);
  for (const mutate of [
    (i) => i.activeSupports.pop(),
    (i) => i.activeSupports.push(i.activeSupports[0]),
    (i) => (i.activeSupports[0].binding.providerSnapshotId = 'forged'),
    (i) => (i.activeSupports[0].snapshot.providerId = 'forged'),
    (i) => (i.activeSupports[0].canonical.name = 'forged'),
    (i) => (i.baselineToken.states[0].summaryDigest = '0'.repeat(64)),
    (i) => (i.baselineToken.indexedContentFingerprint = 'stale'),
  ]) {
    const changed = overlay();
    mutate(changed);
    assert.throws(() => api.validateNativeRefreshOverlay(changed), invalidOverlay);
  }
});

test('D3 overlay counts facts independently of their raw, normalized and support representations', () => {
  const input = overlay('noop');
  // Independent component corpus, not actual Rust capacity or an RSS/profile
  // admission. A declared workspace budget is not a new production reservation.
  input.memoryBudgetBytes = 128 * 1024 * 1024;
  const baseline = JSON.parse(input.baseline.files[0].summaryJson);
  const target = JSON.parse(input.files[0].summaryJson);
  const template = baseCase('shared').nodes.find((n) => n.providerFactId === 'package-0');
  const oldSnapshot = snapshot('snap', 'base', ['SYMBOL']);
  const oldPairs = [],
    newPairs = [];
  for (let i = 0; i < 2_500; i++) {
    const old = {
      ...template,
      providerFactId: `extra-${i}`,
      name: `p${i}`,
      qualifiedName: `p${i}`,
    };
    const next = {
      ...old,
      providerSnapshotId: input.snapshot.id,
      name: `next${i}`,
      qualifiedName: `next${i}`,
    };
    for (const [summary, fact] of [
      [baseline, old],
      [target, next],
    ]) {
      summary.symbols.push({
        providerFactId: fact.providerFactId,
        providerKind: fact.providerKind,
        name: fact.name,
        qualifiedName: fact.qualifiedName,
        signature: '',
        isStatic: false,
        span: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
      });
      summary.emittedFacts.push({
        factType: 'NODE',
        providerFactId: fact.providerFactId,
        contentDigest: factDigest(fact),
        ownership: 'FILE',
      });
    }
    const provider = { factType: 'NODE', providerId: 'native', providerFactId: old.providerFactId };
    oldPairs.push({
      provider,
      canonical: normalizeJavaNode(old, new Map([[baseline.sourceFile.id, baseline.sourceFile]])),
    });
    newPairs.push({
      provider,
      canonical: normalizeJavaNode(next, new Map([[target.sourceFile.id, target.sourceFile]])),
    });
    input.upsertNodes.push(next);
  }
  for (const summary of [baseline, target]) {
    summary.coverage[0].statistics.eligibleSites = 2_501;
    summary.coverage[0].statistics.coveredSites = 2_501;
  }
  input.baseline.files[0].summaryJson = JSON.stringify(baseline);
  input.files[0].summaryJson = JSON.stringify(target);
  const oldHeader = JSON.parse(input.baseline.headerJson),
    header = JSON.parse(input.headerJson);
  oldHeader.summaryDigest = stateDigest(input.baseline.files.map((f) => JSON.parse(f.summaryJson)));
  header.summaryDigest = stateDigest(input.files.map((f) => JSON.parse(f.summaryJson)));
  input.baseline.headerJson = JSON.stringify(oldHeader);
  input.baseline.summaryDigest = oldHeader.summaryDigest;
  input.baselineToken.states[0].summaryDigest = oldHeader.summaryDigest;
  input.headerJson = JSON.stringify(header);
  input.coverage = input.files.flatMap((f) => JSON.parse(f.summaryJson).coverage);
  input.normalizedNodes = newPairs;
  input.supports = collectMergeSupports({
    repositoryId: 'r',
    revisionId: 'rev',
    observations: [{ snapshot: input.snapshot, nodes: newPairs, edges: [] }],
  });
  input.activeSupports.push(
    ...collectMergeSupports({
      repositoryId: 'r',
      revisionId: 'rev',
      observations: [{ snapshot: oldSnapshot, nodes: oldPairs, edges: [] }],
    }).map((s) => ({ ...s, snapshot: oldSnapshot })),
  );
  assert.equal(input.upsertNodes.length, 2_500);
  // Summary/header bytes and actual wire observations remain within the fixed
  // caps; their in-memory copies are not another 2,500 wire operations each.
  for (const [json, files] of [
    [input.baseline.headerJson, input.baseline.files],
    [input.headerJson, input.files],
  ])
    assert.ok(
      Buffer.byteLength(json) + files.reduce((n, f) => n + Buffer.byteLength(f.summaryJson), 0) <
        1_000_000,
    );
  assert.ok(input.upsertNodes.length + input.coverage.length + input.files.length + 2 < 10_000);
  const sealed = api.validateNativeRefreshOverlay(input);
  assert.equal(sealed.files.length, 2);
  assert.equal(JSON.parse(sealed.files[0].summaryJson).symbols.length, 2_501);
  assert.throws(
    () => api.validateNativeRefreshOverlay({ ...input, memoryBudgetBytes: 1 }),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('D3 overlay wire count includes summaries, coverage and terminal overhead at equality', () => {
  const input = overlay('noop');
  // Two summaries + two coverage + start/terminal = six observations before
  // the run-global diagnostics. Global duplicates are legal observations.
  let yielded = 0;
  input.diagnostics = (function* () {
    for (let i = 0; i < 9_994; i++) {
      yielded++;
      yield globalDiagnostic;
    }
  })();
  assert.equal(api.validateNativeRefreshOverlay(input).files.length, 2);
  assert.equal(yielded, 9_994);
  yielded = 0;
  input.diagnostics = (function* () {
    for (;;) {
      yielded++;
      yield globalDiagnostic;
    }
  })();
  assert.throws(
    () => api.validateNativeRefreshOverlay(input),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.equal(yielded, 9_995);
});

test('D3 overlay permits shared owner transfer and only retired Native historical ranges', () => {
  const input = overlay('shared-owner-transfer');
  const result = api.validateNativeRefreshOverlay(input);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].sourceFileId, 'f-1');
  assert.equal(
    input.activeSupports.find((s) => s.canonical.sourceRange === null).snapshot.id,
    'snap',
  );
  const dangling = overlay('shared-owner-transfer');
  const historical = dangling.activeSupports.find(
    (s) => s.canonical.sourceRange?.sourceFileId === 'f-0',
  );
  const otherSnapshot = { ...snapshot('snap-other', 'base', ['SYMBOL']), providerId: 'other' };
  const [support] = collectMergeSupports({
    repositoryId: 'r',
    revisionId: 'rev',
    observations: [
      {
        snapshot: otherSnapshot,
        nodes: [
          {
            provider: { ...historical.binding.providerFact, providerId: 'other' },
            canonical: historical.canonical,
          },
        ],
        edges: [],
      },
    ],
  });
  const unrelated = {
    ...support,
    snapshot: {
      id: otherSnapshot.id,
      repositoryId: 'r',
      providerId: 'other',
      providerVersion: '0.0.0',
      requestedRevisionId: 'rev',
      requestedRevisionFingerprint: 'base',
      outcome: 'SUCCEEDED',
    },
  };
  const applicable = overlay();
  applicable.activeSupports.push(unrelated);
  api.validateNativeRefreshOverlay(applicable);
  dangling.activeSupports.push(unrelated);
  assert.throws(() => api.validateNativeRefreshOverlay(dangling), invalidOverlay);
});

test('D3 overlay rejects forged shared identity and confidence despite valid field schemas', () => {
  for (const mutate of [
    (s) => (s.canonical.confidence.score = 0.5),
    (s) => {
      s.canonical.id = 'node-forged';
      s.binding.canonicalFact.id = s.factEvidence.fact.id = s.canonical.id;
    },
  ]) {
    const input = overlay();
    mutate(input.activeSupports.find((s) => s.canonical.sourceRange === null));
    assert.throws(() => api.validateNativeRefreshOverlay(input), invalidOverlay);
  }
});

test('D3 overlay rejects target snapshot identity reused from the accepted baseline', () => {
  const input = overlay();
  input.snapshot.id = 'snap';
  assert.throws(() => api.validateNativeRefreshOverlay(input), invalidOverlay);
});

test('D3 overlay normalizes dependent upsert references through retained nodes', () => {
  const input = overlay('retained-caller-upsert');
  assert.equal(input.upsertNodes.length, 0);
  const result = api.validateNativeRefreshOverlay(input);
  assert.equal(result.files.length, 2);
  assert.equal(result.expected.contentFingerprint, 'target');
  for (const mutate of [
    (i) => (i.normalizedEdges[0].canonical.target.target.id = 'forged'),
    (i) => (i.supports[0].evidence.providerSnapshotId = 'snap'),
    (i) => (i.upsertEdges[0].target.target.providerFactId = 'missing'),
    (i) => (i.upsertEdges = []),
    (i) => i.removeEdges.push({ factType: 'EDGE', providerId: 'native', providerFactId: 'call-0' }),
  ]) {
    const bad = overlay('retained-caller-upsert');
    mutate(bad);
    assert.throws(() => api.validateNativeRefreshOverlay(bad), invalidOverlay);
  }
});

test('D3 overlay checks complete target observations and rejects partial or malformed metadata', () => {
  for (const mutate of [
    (i) => i.targetSourceFiles.pop(),
    (i) => (i.targetSourceFiles[0].sensitivity = 'SECRET'),
    (i) => i.coverage.pop(),
    (i) => i.coverage[0].statistics.coveredSites++,
    (i) => (i.snapshot.outcome = 'PARTIAL'),
    (i) => (i.files[0].summaryJson = '{}'),
  ]) {
    const bad = overlay();
    mutate(bad);
    assert.throws(() => api.validateNativeRefreshOverlay(bad), invalidOverlay);
  }
  const small = overlay();
  small.memoryBudgetBytes = 1;
  assert.throws(
    () => api.validateNativeRefreshOverlay(small),
    (e) =>
      e instanceof api.NativeStateValidationError &&
      e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('D3 overlay permits final shared-owner deletion and complete zero-fact files', () => {
  const empty = overlay();
  const zero = baseCase('empty').bundle;
  zero.header.contentFingerprint = 'empty';
  empty.expected = expectation(zero.header);
  empty.headerJson = JSON.stringify(zero.header);
  empty.files = state(zero).files;
  empty.snapshot.requestedRevisionFingerprint = 'empty';
  empty.targetSourceFiles = zero.summaries.map((s) => s.sourceFile);
  empty.coverage = zero.summaries.flatMap((s) => s.coverage);
  empty.removeNodes = empty.activeSupports.map((s) => s.binding.providerFact);
  assert.equal(api.validateNativeRefreshOverlay(empty).files.length, 1);

  const allDeleted = overlay();
  const zeroFiles = baseCase('zero-file').bundle;
  zeroFiles.header.contentFingerprint = 'deleted';
  allDeleted.expected = expectation(zeroFiles.header);
  allDeleted.headerJson = JSON.stringify(zeroFiles.header);
  allDeleted.files = [];
  allDeleted.targetSourceFiles = [];
  allDeleted.coverage = [];
  allDeleted.snapshot.requestedRevisionFingerprint = 'deleted';
  allDeleted.removeNodes = allDeleted.activeSupports.map((s) => s.binding.providerFact);
  assert.equal(api.validateNativeRefreshOverlay(allDeleted).files.length, 0);
  allDeleted.removeNodes.pop();
  assert.throws(() => api.validateNativeRefreshOverlay(allDeleted), invalidOverlay);
});

test('D3 overlay preserves exact local and file-owned source-less diagnostics with run globals', () => {
  const input = overlay();
  const summaries = input.files.map((f) => JSON.parse(f.summaryJson));
  const local = {
    ...globalDiagnostic,
    code: 'LOCAL',
    sourceRange: { sourceFileId: 'f-0', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
  };
  summaries[0].diagnostics = [local, globalDiagnostic];
  const header = { ...JSON.parse(input.headerJson), summaryDigest: stateDigest(summaries) };
  input.headerJson = JSON.stringify(header);
  input.files = state({ header, summaries }).files;
  input.diagnostics = [local, globalDiagnostic, { ...globalDiagnostic, code: 'GLOBAL' }];
  api.validateNativeRefreshOverlay(input);
  input.diagnostics.push(globalDiagnostic);
  assert.throws(() => api.validateNativeRefreshOverlay(input), invalidOverlay);
});
