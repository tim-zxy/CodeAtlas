import assert from 'node:assert/strict';
import test from 'node:test';

import * as provider from '../dist/index.js';

const repository = { id: 'repo-v2', rootPath: '/repo-v2' };
const revision = {
  id: 'rev-v2',
  repositoryId: repository.id,
  kind: 'WORKTREE',
  contentFingerprint: 'revision-v2',
  baseRevisionId: null,
};
const sourceFile = {
  id: 'file-v2',
  repositoryId: repository.id,
  revisionId: revision.id,
  path: 'src/A.java',
  contentFingerprint: 'source-v2',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'PUBLIC',
};
const context = {
  providerSnapshotId: 'snapshot-v2',
  repositoryId: repository.id,
  revisionId: revision.id,
  revisionFingerprint: revision.contentFingerprint,
};
const request = {
  protocolVersion: 2,
  requestId: 'request-v2',
  type: 'ANALYZE',
  payload: {
    irSchemaVersion: 1,
    providerSnapshotId: context.providerSnapshotId,
    repository,
    revision,
    sourceFiles: [sourceFile],
    requestedCapabilities: ['CALL'],
    deadlineEpochMs: null,
    resourceBudget: { maxDurationMs: 30_000, maxMemoryBytes: 64_000_000, maxEvents: 20 },
  },
};
const statistics = {
  eligibleSites: 2,
  coveredSites: 1,
  unsupportedSites: 1,
  partialSites: 0,
  resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 1, UNSUPPORTED: 0 },
};

function event(type, sequence, payload, protocolVersion = 2) {
  return { protocolVersion, requestId: request.requestId, sequence, type, payload };
}

function stream(coverage = statistics) {
  return {
    request,
    events: [
      event('ANALYSIS_STARTED', 0, context),
      event('SOURCE_FILE', 1, sourceFile),
      event('COVERAGE', 2, {
        capability: 'CALL',
        sourceFileId: sourceFile.id,
        support: 'SUPPORTED',
        coverage: 'PARTIAL',
        statistics: coverage,
      }),
      event('ANALYSIS_COMPLETED', 3, {
        ...context,
        outcome: 'PARTIAL',
        counts: { sourceFiles: 1, nodes: 0, edges: 0, coverage: 1, diagnostics: 0 },
        capabilities: [{ name: 'CALL', support: 'SUPPORTED', coverage: 'PARTIAL' }],
        contentFingerprint: 'content-v2',
        integrityChecksum: 'checksum-v2',
      }),
    ],
  };
}

test('v2 accepts only ANALYZE with IR schema 1 and strict measured coverage', () => {
  assert.ok(provider.NativeAnalyzeRequestV2Schema);
  assert.ok(provider.NativeAnalyzeEventStreamV2Schema);
  assert.equal(provider.NativeAnalyzeRequestV2Schema.safeParse(request).success, true);
  assert.equal(provider.NativeAnalyzeEventStreamV2Schema.safeParse(stream()).success, true);
  assert.equal(
    provider.NativeAnalyzeRequestV2Schema.safeParse({ ...request, type: 'REFRESH' }).success,
    false,
  );
  assert.equal(
    provider.NativeAnalyzeRequestV2Schema.safeParse({ ...request, type: 'DESCRIBE' }).success,
    false,
  );
  assert.equal(
    provider.NativeAnalyzeRequestV2Schema.safeParse({
      ...request,
      payload: { ...request.payload, irSchemaVersion: 2 },
    }).success,
    false,
  );
});

test('v2 rejects invalid site partitions and resolution distribution', () => {
  assert.ok(provider.NativeCoverageStatisticsV2Schema);
  for (const invalid of [
    { ...statistics, eligibleSites: -1 },
    { ...statistics, eligibleSites: 2.5 },
    { ...statistics, eligibleSites: Number.MAX_SAFE_INTEGER + 1 },
    { ...statistics, extra: 1 },
    { ...statistics, eligibleSites: 3 },
  ]) {
    assert.equal(provider.NativeCoverageStatisticsV2Schema.safeParse(invalid).success, false);
  }
  assert.equal(
    provider.NativeAnalyzeEventStreamV2Schema.safeParse(
      stream({
        ...statistics,
        resolutionCounts: { ...statistics.resolutionCounts, UNRESOLVED: 0 },
      }),
    ).success,
    false,
  );
  const missingField = provider.NativeAnalyzeEventStreamV2Schema.safeParse(
    stream({ ...statistics, coveredSites: undefined }),
  );
  assert.equal(missingField.success, false);
  assert.ok(
    missingField.error.issues.some(
      (issue) => issue.path.join('.') === 'events.2.payload.statistics.coveredSites',
    ),
  );
});

test('v2 requires exactly one coverage record per requested file and capability', () => {
  assert.ok(provider.NativeAnalyzeEventStreamV2Schema);
  const base = stream();
  const missing = {
    ...base,
    events: [
      base.events[0],
      base.events[1],
      {
        ...base.events[3],
        sequence: 2,
        payload: {
          ...base.events[3].payload,
          counts: {
            ...base.events[3].payload.counts,
            coverage: 0,
          },
        },
      },
    ],
  };
  assert.equal(provider.NativeAnalyzeEventStreamV2Schema.safeParse(missing).success, false);
  const duplicate = {
    ...base,
    events: [
      base.events[0],
      base.events[1],
      base.events[2],
      { ...base.events[2], sequence: 3 },
      {
        ...base.events[3],
        sequence: 4,
        payload: {
          ...base.events[3].payload,
          counts: { ...base.events[3].payload.counts, coverage: 2 },
        },
      },
    ],
  };
  assert.equal(provider.NativeAnalyzeEventStreamV2Schema.safeParse(duplicate).success, false);
});

test('v1 strict COVERAGE rejects v2 statistics and mixed-version streams', () => {
  const v2Coverage = stream().events[2];
  assert.equal(
    provider.NativeEventEnvelopeSchema.safeParse({ ...v2Coverage, protocolVersion: 1 }).success,
    false,
  );
  assert.ok(provider.NativeAnalyzeEventStreamV2Schema);
  const mixed = stream();
  mixed.events[2] = { ...mixed.events[2], protocolVersion: 1 };
  assert.equal(provider.NativeAnalyzeEventStreamV2Schema.safeParse(mixed).success, false);
});
