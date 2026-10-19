import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { computeNativeSummaryDigest } from '../packages/providers/dist/index.js';

let compare;
try {
  ({ comparePhase05PublishedStates: compare } =
    await import('./helpers/phase05-published-comparison.mjs'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

// Independent original normalization vectors, not output from the comparison.
async function image() {
  const root = new URL('../fixtures/normalization/canonical-normalization/', import.meta.url);
  const { request } = JSON.parse(await readFile(new URL('inputs/result.json', root), 'utf8'));
  const pairs = JSON.parse(await readFile(new URL('expected/nodes.json', root), 'utf8'));
  const nodes = ['method-run', 'ctor-a'].map(
    (id) => pairs.find((pair) => pair.provider.providerFactId === id).canonical,
  );
  const edges = [
    JSON.parse(await readFile(new URL('expected/edges.json', root), 'utf8')).find(
      (pair) => pair.provider.providerFactId === 'call-ctor',
    ).canonical,
  ];
  const revision = request.payload.revision;
  const sourceFiles = request.payload.sourceFiles;
  const snapshot = {
    id: 'reference-snapshot',
    repositoryId: revision.repositoryId,
    providerId: 'native',
    providerVersion: '1',
    runtimeVersion: '1',
    requestedRevisionId: revision.id,
    requestedRevisionFingerprint: revision.contentFingerprint,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    outcome: 'SUCCEEDED',
    capabilities: [{ name: 'SYMBOL', support: 'SUPPORTED', coverage: 'COMPLETE' }],
    diagnostics: [],
  };
  const evidence = [],
    bindings = [],
    factEvidence = [],
    candidates = [];
  for (const [i, candidate] of [...nodes, ...edges].entries()) {
    const fact = { factType: i < 2 ? 'NODE' : 'EDGE', id: candidate.id };
    const providerFact = {
      factType: fact.factType,
      providerId: 'native',
      providerFactId: ['method-run', 'ctor-a', 'call-ctor'][i],
    };
    const evidenceId = `evidence-${i}`;
    evidence.push({
      id: evidenceId,
      repositoryId: revision.repositoryId,
      revisionId: revision.id,
      providerSnapshotId: snapshot.id,
      providerFact,
      status: 'ACTIVE',
    });
    bindings.push({
      providerFact,
      providerSnapshotId: snapshot.id,
      canonicalFact: fact,
      evidenceId,
    });
    factEvidence.push({ fact, evidenceId });
    candidates.push({ fact, evidenceId, candidate });
  }
  const observations = sourceFiles.map((file) => ({
    providerSnapshotId: snapshot.id,
    sourceFileId: file.id,
    capability: 'SYMBOL',
    coverage: 'COMPLETE',
  }));
  const summaries = sourceFiles.map((sourceFile) => ({
    schemaVersion: 1,
    sourceFile,
    symbols: [],
    relationSites: [],
    diagnostics: [],
    emittedFacts: [],
    coverage: [
      {
        sourceFileId: sourceFile.id,
        capability: 'SYMBOL',
        support: 'SUPPORTED',
        coverage: 'COMPLETE',
        statistics: {
          eligibleSites: 0,
          coveredSites: 0,
          unsupportedSites: 0,
          partialSites: 0,
          resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
        },
      },
    ],
  }));
  for (const [i, candidate] of [...nodes, ...edges].entries()) {
    summaries
      .find((summary) => summary.sourceFile.id === candidate.sourceRange.sourceFileId)
      .emittedFacts.push({
        factType: i < 2 ? 'NODE' : 'EDGE',
        providerFactId: ['method-run', 'ctor-a', 'call-ctor'][i],
        ownership: 'FILE',
        contentDigest: 'a'.repeat(64),
      });
  }
  const expected = {
    repositoryId: revision.repositoryId,
    revisionId: revision.id,
    contentFingerprint: revision.contentFingerprint,
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
  };
  const digest = computeNativeSummaryDigest(summaries);
  return {
    revision,
    indexed: { revisionId: revision.id, contentFingerprint: revision.contentFingerprint },
    supports: {
      sourceFiles,
      facts: { nodes, edges },
      snapshots: [snapshot],
      evidence,
      bindings,
      factEvidence,
      candidates,
    },
    coverage: {
      observations,
      nativeStates: [
        {
          providerId: 'native',
          providerSnapshotId: snapshot.id,
          revisionId: revision.id,
          contentFingerprint: revision.contentFingerprint,
        },
      ],
      baseline: 'PRESENT_UNVERIFIED',
    },
    nativeBaseline: {
      status: 'AVAILABLE',
      state: {
        expected,
        headerJson: JSON.stringify({
          schemaVersion: 1,
          ...expected,
          sourceFileCount: summaries.length,
          summaryDigest: digest,
        }),
        summaryDigest: digest,
        files: summaries.map((summary) => ({
          sourceFileId: summary.sourceFile.id,
          sourcePath: summary.sourceFile.path,
          contentFingerprint: summary.sourceFile.contentFingerprint,
          summaryJson: JSON.stringify(summary),
        })),
      },
      token: {
        committedSnapshotCount: 1,
        indexedRevisionId: revision.id,
        indexedContentFingerprint: revision.contentFingerprint,
        states: [{ providerId: 'native', snapshotId: snapshot.id, summaryDigest: digest }],
      },
    },
  };
}

function relabel(value) {
  const old = value.supports.snapshots[0].id;
  value.supports.snapshots[0].id = 'trial-snapshot';
  value.coverage.nativeStates[0].providerSnapshotId = 'trial-snapshot';
  value.nativeBaseline.token.states[0].snapshotId = 'trial-snapshot';
  for (const row of [
    ...value.supports.evidence,
    ...value.supports.bindings,
    ...value.coverage.observations,
  ])
    if (row.providerSnapshotId === old) row.providerSnapshotId = 'trial-snapshot';
}

test('published comparison checks independent graph, supports, current coverage and summary without rewriting histories', async () => {
  assert.equal(typeof compare, 'function');
  const expected = await image(),
    actual = await image();
  relabel(actual);
  actual.supports.snapshots.push({
    ...actual.supports.snapshots[0],
    id: 'historical',
    requestedRevisionFingerprint: 'old-fingerprint',
  });
  actual.coverage.observations.push({
    providerSnapshotId: 'historical',
    sourceFileId: 'deleted-historical-file',
    capability: 'SYMBOL',
    coverage: 'NONE',
  });
  const before = structuredClone({ expected, actual });
  const result = compare({
    expected,
    actual,
    criticalSymbols: [expected.supports.facts.nodes[0].factKey],
    criticalDirectCalls: [expected.supports.facts.edges[0].factKey],
  });
  assert.equal(result.graphEqual, true);
  assert.equal(result.supportEqual, true);
  assert.equal(result.coverageEqual, true);
  assert.equal(result.nativeStateEqual, true);
  assert.equal(result.staleBindings, 0);
  assert.equal(result.facts.directCall.precision, 1);
  assert.deepEqual({ expected, actual }, before);
});

for (const defect of [
  'unverified',
  'unavailable',
  'missing-current-row',
  'duplicate-current-row',
  'old-row-substitution',
  'wrong-coverage',
  'wrong-pointer',
  'wrong-token',
  'missing-summary-file',
  'wrong-summary-source',
  'different-indexed-fingerprint',
  'old-normalizer',
  'extra-field',
]) {
  test(`published comparison refuses ${defect} instead of blessing current Native state`, async () => {
    assert.equal(typeof compare, 'function');
    const expected = await image(),
      actual = await image();
    if (defect === 'unverified') delete actual.nativeBaseline;
    if (defect === 'unavailable')
      actual.nativeBaseline = { status: 'UNAVAILABLE', reason: 'INCOMPATIBLE' };
    if (defect === 'missing-current-row') actual.coverage.observations.pop();
    if (defect === 'duplicate-current-row')
      actual.coverage.observations.push({ ...actual.coverage.observations[0] });
    if (defect === 'old-row-substitution') {
      actual.supports.snapshots.push({
        ...actual.supports.snapshots[0],
        id: 'old',
        requestedRevisionFingerprint: 'old-fingerprint',
      });
      actual.coverage.observations[0].providerSnapshotId = 'old';
    }
    if (defect === 'wrong-coverage') actual.coverage.observations[0].coverage = 'PARTIAL';
    if (defect === 'wrong-pointer') actual.coverage.nativeStates[0].providerSnapshotId = 'absent';
    if (defect === 'wrong-token')
      actual.nativeBaseline.token.states[0].summaryDigest = '0'.repeat(64);
    if (defect === 'missing-summary-file') actual.nativeBaseline.state.files.pop();
    if (defect === 'wrong-summary-source')
      actual.nativeBaseline.state.files[0].sourceFileId = 'absent';
    if (defect === 'different-indexed-fingerprint')
      actual.indexed.contentFingerprint = 'other-fingerprint';
    if (defect === 'old-normalizer') actual.nativeBaseline.state.expected.normalizerVersion = '1';
    if (defect === 'extra-field') actual.coverage.verified = true;
    const before = structuredClone(actual);
    assert.throws(
      () => compare({ expected, actual, criticalSymbols: [], criticalDirectCalls: [] }),
      /Published comparison/,
    );
    assert.deepEqual(actual, before);
  });
}

test('published comparison exposes changed valid graph semantics rather than repairing the oracle', async () => {
  assert.equal(typeof compare, 'function');
  const expected = await image(),
    actual = await image();
  actual.supports.facts.nodes[0].confidence.score = 0.5;
  actual.supports.candidates[0].candidate.confidence.score = 0.5;
  const result = compare({ expected, actual, criticalSymbols: [], criticalDirectCalls: [] });
  assert.equal(result.graphEqual, false);
  assert.equal(result.supportEqual, false);
  assert.equal(result.coverageEqual, true);
});

function replaceSummaries(value, edit) {
  const state = value.nativeBaseline.state;
  const summaries = state.files.map((file) => JSON.parse(file.summaryJson));
  edit(summaries);
  const digest = computeNativeSummaryDigest(summaries);
  for (const [i, summary] of summaries.entries())
    state.files[i].summaryJson = JSON.stringify(summary);
  state.headerJson = JSON.stringify({ ...JSON.parse(state.headerJson), summaryDigest: digest });
  state.summaryDigest = digest;
  value.nativeBaseline.token.states[0].summaryDigest = digest;
}

test('published comparison rejects a rehashed summary missing an active Provider support', async () => {
  const expected = await image(),
    actual = await image();
  replaceSummaries(actual, (summaries) => {
    summaries[0].emittedFacts.pop();
  });
  assert.throws(
    () => compare({ expected, actual, criticalSymbols: [], criticalDirectCalls: [] }),
    /Published comparison/,
  );
});

test('published comparison rejects two equally obsolete normalizer contexts rather than treating agreement as compatibility', async () => {
  const expected = await image(),
    actual = await image();
  for (const value of [expected, actual]) {
    value.nativeBaseline.state.expected.normalizerVersion = '1';
    value.nativeBaseline.state.headerJson = JSON.stringify({
      ...JSON.parse(value.nativeBaseline.state.headerJson),
      normalizerVersion: '1',
    });
  }
  assert.throws(
    () => compare({ expected, actual, criticalSymbols: [], criticalDirectCalls: [] }),
    /Published comparison/,
  );
});

test('published comparison reports different valid site statistics even when categorical coverage agrees', async () => {
  const expected = await image(),
    actual = await image();
  replaceSummaries(actual, (summaries) => {
    summaries[0].coverage[0].statistics.eligibleSites = 1;
    summaries[0].coverage[0].statistics.coveredSites = 1;
  });
  const result = compare({ expected, actual, criticalSymbols: [], criticalDirectCalls: [] });
  assert.equal(result.graphEqual, true);
  assert.equal(result.supportEqual, true);
  assert.equal(result.coverageEqual, false);
  assert.equal(result.nativeStateEqual, false);
});

for (const defect of [
  'extra-emitted-support',
  'wrong-file-owner',
  'duplicate-token',
  'zero-commits',
  'hidden-proof',
  'accessor-proof',
]) {
  test(`published comparison refuses ${defect} without weakening evidence closure`, async () => {
    const expected = await image(),
      actual = await image();
    let calls = 0;
    if (defect === 'extra-emitted-support')
      replaceSummaries(actual, (summaries) => {
        summaries[0].emittedFacts.push({
          factType: 'NODE',
          providerFactId: 'foreign',
          ownership: 'FILE',
          contentDigest: 'b'.repeat(64),
        });
      });
    if (defect === 'wrong-file-owner')
      replaceSummaries(actual, (summaries) => {
        const row = summaries[0].emittedFacts.shift();
        summaries[1].emittedFacts.push(row);
      });
    if (defect === 'duplicate-token')
      actual.nativeBaseline.token.states.push({ ...actual.nativeBaseline.token.states[0] });
    if (defect === 'zero-commits') actual.nativeBaseline.token.committedSnapshotCount = 0;
    if (defect === 'hidden-proof')
      Object.defineProperty(actual.nativeBaseline, 'verified', { value: true });
    if (defect === 'accessor-proof')
      Object.defineProperty(actual.nativeBaseline.state, 'headerJson', {
        enumerable: true,
        get() {
          calls++;
          return expected.nativeBaseline.state.headerJson;
        },
      });
    assert.throws(
      () => compare({ expected, actual, criticalSymbols: [], criticalDirectCalls: [] }),
      /Published comparison/,
    );
    assert.equal(calls, 0);
  });
}
