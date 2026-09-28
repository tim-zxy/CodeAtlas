import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeNativeCoverage } from '../dist/index.js';

const sourceFile = {
  id: 'file',
  repositoryId: 'repo',
  revisionId: 'rev',
  path: 'src/A.java',
  contentFingerprint: 'source',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'PUBLIC',
};
const context = {
  providerSnapshotId: 'snapshot',
  repositoryId: 'repo',
  revisionId: 'rev',
  revisionFingerprint: 'revision',
};
const baseRequest = {
  requestId: 'request',
  type: 'ANALYZE',
  payload: {
    irSchemaVersion: 1,
    providerSnapshotId: 'snapshot',
    repository: { id: 'repo', rootPath: '/repo' },
    revision: {
      id: 'rev',
      repositoryId: 'repo',
      kind: 'WORKTREE',
      contentFingerprint: 'revision',
      baseRevisionId: null,
    },
    sourceFiles: [sourceFile],
    requestedCapabilities: ['CALL'],
    deadlineEpochMs: null,
    resourceBudget: { maxDurationMs: 1000, maxMemoryBytes: 64_000_000, maxEvents: 20 },
  },
};
const empty = {
  eligibleSites: 0,
  coveredSites: 0,
  unsupportedSites: 0,
  partialSites: 0,
  resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
};

function result(version, statistics = empty, coverage = 'COMPLETE') {
  const request = { ...baseRequest, protocolVersion: version };
  const event = (type, sequence, payload) => ({
    protocolVersion: version,
    requestId: request.requestId,
    sequence,
    type,
    payload,
  });
  const events = [
    event('ANALYSIS_STARTED', 0, context),
    event('SOURCE_FILE', 1, sourceFile),
    event('COVERAGE', 2, {
      capability: 'CALL',
      sourceFileId: sourceFile.id,
      support: 'SUPPORTED',
      coverage,
      ...(version === 2 ? { statistics } : {}),
    }),
    event('ANALYSIS_COMPLETED', 3, {
      ...context,
      outcome: coverage === 'PARTIAL' ? 'PARTIAL' : 'SUCCEEDED',
      counts: { sourceFiles: 1, nodes: 0, edges: 0, coverage: 1, diagnostics: 0 },
      capabilities: [{ name: 'CALL', support: 'SUPPORTED', coverage }],
      contentFingerprint: 'content',
      integrityChecksum: 'checksum',
    }),
  ];
  return { request, events, terminal: events.at(-1), stderr: '' };
}

test('v1 numeric statistics are unavailable rather than measured zero', () => {
  const summary = summarizeNativeCoverage(result(1));
  assert.equal(summary.statisticsAvailable, false);
  assert.equal(summary.files[0].statistics, null);
  assert.deepEqual(summary.warnings, [
    { code: 'STATISTICS_UNAVAILABLE', sourceFileId: null, capability: null },
  ]);
});

test('v2 valid empty file is measured zero with no warnings', () => {
  const summary = summarizeNativeCoverage(result(2));
  assert.equal(summary.statisticsAvailable, true);
  assert.deepEqual(summary.files[0].statistics, empty);
  assert.deepEqual(summary.warnings, []);
});

test('v2 incomplete extraction and relation resolution produce sorted explicit warnings', () => {
  const statistics = {
    eligibleSites: 4,
    coveredSites: 2,
    unsupportedSites: 1,
    partialSites: 1,
    resolutionCounts: { EXACT: 1, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 1, UNSUPPORTED: 0 },
  };
  const summary = summarizeNativeCoverage(result(2, statistics, 'PARTIAL'));
  assert.deepEqual(
    summary.warnings.map((warning) => warning.code),
    ['INCOMPLETE_RESOLUTION', 'PARTIAL_COVERAGE', 'UNSUPPORTED_SITE'],
  );
  assert.ok(
    summary.warnings.every(
      (warning) => warning.sourceFileId === 'file' && warning.capability === 'CALL',
    ),
  );
});

test('failed or non-ANALYZE results cannot be summarized', () => {
  const failed = result(2);
  failed.events[3] = {
    ...failed.events[3],
    type: 'ANALYSIS_FAILED',
    payload: {
      ...context,
      error: { code: 'BUDGET_EXCEEDED', message: 'Expired', retryable: false },
    },
  };
  failed.terminal = failed.events[3];
  assert.throws(() => summarizeNativeCoverage(failed));
  assert.throws(() =>
    summarizeNativeCoverage({
      ...result(1),
      request: { ...baseRequest, protocolVersion: 1, type: 'DESCRIBE' },
    }),
  );
});
