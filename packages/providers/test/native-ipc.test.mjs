import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NativeAnalyzerDescriptorSchema,
  NativeEventEnvelopeSchema,
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
} from '../dist/index.js';

const repository = { id: 'repo-a', rootPath: '/repo-a' };
const revision = {
  id: 'rev-a',
  repositoryId: repository.id,
  kind: 'WORKTREE',
  contentFingerprint: 'rev-fp-a',
  baseRevisionId: null,
};
const targetRevision = { ...revision, id: 'rev-b', contentFingerprint: 'rev-fp-b' };
const sourceFile = {
  id: 'file-a',
  repositoryId: repository.id,
  revisionId: revision.id,
  path: 'src/a.fixture',
  contentFingerprint: 'file-fp-a',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'fixture-lang',
  sensitivity: 'PUBLIC',
};
const targetSourceFile = { ...sourceFile, revisionId: targetRevision.id };
const requestBase = { protocolVersion: 1, requestId: 'request-a' };
const analysisBase = {
  irSchemaVersion: 1,
  providerSnapshotId: 'snapshot-a',
  repository,
  requestedCapabilities: ['code-graph'],
  deadlineEpochMs: null,
  resourceBudget: { maxDurationMs: 30_000, maxMemoryBytes: 64_000_000, maxEvents: 20 },
};
const analyzeRequest = {
  ...requestBase,
  type: 'ANALYZE',
  payload: { ...analysisBase, revision, sourceFiles: [sourceFile] },
};
const refreshRequest = {
  ...requestBase,
  type: 'REFRESH',
  payload: {
    ...analysisBase,
    baseRevisionId: revision.id,
    baseRevisionFingerprint: revision.contentFingerprint,
    targetRevision,
    changes: { added: [targetSourceFile], modified: [], deleted: [] },
  },
};
const node = {
  providerId: 'native',
  providerFactId: 'node-a',
  providerSnapshotId: analysisBase.providerSnapshotId,
  repositoryId: repository.id,
  revisionId: revision.id,
  providerKind: 'fixture.symbol',
  name: 'a',
  qualifiedName: null,
  sourceRange: null,
  confidence: { score: 1, method: 'parser', reasons: [] },
};
const edge = {
  providerId: 'native',
  providerFactId: 'edge-a',
  providerSnapshotId: analysisBase.providerSnapshotId,
  repositoryId: repository.id,
  revisionId: revision.id,
  providerKind: 'fixture.calls',
  source: { factType: 'NODE', providerId: 'native', providerFactId: node.providerFactId },
  target: {
    state: 'UNRESOLVED',
    resolution: 'UNRESOLVED',
    originalHint: 'missing',
    candidates: [],
  },
  sourceRange: null,
  confidence: { score: 1, method: 'parser', reasons: [] },
};
const diagnostic = {
  code: 'PARTIAL',
  severity: 'WARNING',
  message: 'Partial analysis',
  sourceRange: null,
};
const capability = { name: 'code-graph', support: 'SUPPORTED', coverage: 'COMPLETE' };
const coverage = {
  capability: capability.name,
  sourceFileId: sourceFile.id,
  support: capability.support,
  coverage: capability.coverage,
};
const descriptor = {
  providerId: 'native',
  providerVersion: '1.0.0',
  runtimeVersion: '1.0.0',
  protocolVersions: [1],
  irSchemaVersions: [1],
  capabilities: ['code-graph'],
  languages: [
    {
      languageId: 'fixture-lang',
      grammarVersion: '1.0.0',
      analyzerVersion: '1.0.0',
      compatibilityVersion: '1',
    },
  ],
  limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
  build: { target: 'fixture-target', profile: 'release' },
};

function envelope(type, sequence, payload, requestId = requestBase.requestId) {
  return { protocolVersion: 1, requestId, sequence, type, payload };
}

function analyzeEvents() {
  const context = {
    providerSnapshotId: analysisBase.providerSnapshotId,
    repositoryId: repository.id,
    revisionId: revision.id,
    revisionFingerprint: revision.contentFingerprint,
  };
  return [
    envelope('ANALYSIS_STARTED', 0, context),
    envelope('SOURCE_FILE', 1, sourceFile),
    envelope('NODE', 2, node),
    envelope('EDGE', 3, edge),
    envelope('COVERAGE', 4, coverage),
    envelope('DIAGNOSTIC', 5, diagnostic),
    envelope('ANALYSIS_COMPLETED', 6, {
      ...context,
      outcome: 'SUCCEEDED',
      counts: { sourceFiles: 1, nodes: 1, edges: 1, coverage: 1, diagnostics: 1 },
      capabilities: [capability],
      contentFingerprint: 'analysis-fp-a',
      integrityChecksum: 'analysis-checksum-a',
    }),
  ];
}

function refreshEvents() {
  const context = {
    providerSnapshotId: analysisBase.providerSnapshotId,
    repositoryId: repository.id,
    revisionId: targetRevision.id,
    revisionFingerprint: targetRevision.contentFingerprint,
  };
  const refreshedNode = { ...node, revisionId: targetRevision.id };
  const refreshedEdge = { ...edge, revisionId: targetRevision.id };
  return [
    envelope('REFRESH_STARTED', 0, context),
    envelope('SOURCE_FILE', 1, targetSourceFile),
    envelope('UPSERT_NODE', 2, refreshedNode),
    envelope('REMOVE_NODE', 3, {
      factType: 'NODE',
      providerId: node.providerId,
      providerFactId: 'removed-node',
    }),
    envelope('UPSERT_EDGE', 4, refreshedEdge),
    envelope('REMOVE_EDGE', 5, {
      factType: 'EDGE',
      providerId: edge.providerId,
      providerFactId: 'removed-edge',
    }),
    envelope('COVERAGE', 6, { ...coverage, sourceFileId: targetSourceFile.id }),
    envelope('DIAGNOSTIC', 7, diagnostic),
    envelope('REFRESH_COMPLETED', 8, {
      ...context,
      outcome: 'PARTIAL',
      counts: {
        sourceFiles: 1,
        upsertedNodes: 1,
        removedNodes: 1,
        upsertedEdges: 1,
        removedEdges: 1,
        coverage: 1,
        diagnostics: 1,
      },
      capabilities: [capability],
      contentFingerprint: 'refresh-fp-a',
      integrityChecksum: 'refresh-checksum-a',
    }),
  ];
}

test('P0-W3-001 Fixture declares the request, event, version, stream, and cancellation cases', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('../../../fixtures/ipc/schema-v1/cases.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(fixture.cases, [
    'request-envelope-matrix',
    'event-envelope-matrix',
    'version-and-limit-declarations',
    'stream-ordering-terminal-count-and-context',
    'cancellation',
  ]);
});

test('all four request envelopes are strict, versioned, and context-valid', () => {
  const requests = [
    {
      ...requestBase,
      type: 'DESCRIBE',
      payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
    },
    analyzeRequest,
    refreshRequest,
    { ...requestBase, type: 'CANCEL', payload: { targetRequestId: 'request-b' } },
  ];
  requests.forEach((request) =>
    assert.equal(NativeRequestEnvelopeSchema.safeParse(request).success, true),
  );

  assert.equal(
    NativeRequestEnvelopeSchema.safeParse({ ...requests[0], protocolVersion: 2 }).success,
    false,
  );
  assert.equal(
    NativeRequestEnvelopeSchema.safeParse({ ...requests[0], unexpected: true }).success,
    false,
  );
  assert.equal(
    NativeRequestEnvelopeSchema.safeParse({
      ...analyzeRequest,
      payload: { ...analyzeRequest.payload, sourceFiles: [{ ...sourceFile, revisionId: 'wrong' }] },
    }).success,
    false,
  );
  assert.equal(
    NativeRequestEnvelopeSchema.safeParse({
      ...refreshRequest,
      payload: {
        ...refreshRequest.payload,
        changes: {
          ...refreshRequest.payload.changes,
          modified: [targetSourceFile],
        },
      },
    }).success,
    false,
  );
});

test('descriptor is language-neutral and declares unique versions, capabilities, languages, and limits', () => {
  assert.equal(NativeAnalyzerDescriptorSchema.safeParse(descriptor).success, true);
  assert.equal(
    NativeAnalyzerDescriptorSchema.safeParse({ ...descriptor, protocolVersions: [1, 1] }).success,
    false,
  );
  assert.equal(
    NativeAnalyzerDescriptorSchema.safeParse({
      ...descriptor,
      languages: [...descriptor.languages, descriptor.languages[0]],
    }).success,
    false,
  );
  assert.equal(
    NativeAnalyzerDescriptorSchema.safeParse({
      ...descriptor,
      limits: { ...descriptor.limits, maxLineBytes: 0 },
    }).success,
    false,
  );
});

test('analysis and refresh use request-specific failure terminals after start', () => {
  const analysisContext = analyzeEvents()[0].payload;
  const refreshContext = refreshEvents()[0].payload;
  const error = {
    code: 'INTERNAL_ANALYZER_FAILURE',
    message: 'Analyzer failed',
    retryable: true,
  };
  const analysisFailure = [
    envelope('ANALYSIS_STARTED', 0, analysisContext),
    envelope('ANALYSIS_FAILED', 1, { ...analysisContext, error }),
  ];
  const refreshFailure = [
    envelope('REFRESH_STARTED', 0, refreshContext),
    envelope('REFRESH_FAILED', 1, { ...refreshContext, error }),
  ];
  assert.equal(
    NativeEventStreamSchema.safeParse({ request: analyzeRequest, events: analysisFailure }).success,
    true,
  );
  assert.equal(
    NativeEventStreamSchema.safeParse({ request: refreshRequest, events: refreshFailure }).success,
    true,
  );
  assert.equal(
    NativeEventStreamSchema.safeParse({
      request: analyzeRequest,
      events: [
        envelope('ANALYSIS_STARTED', 0, analysisContext),
        envelope('REQUEST_FAILED', 1, { error }),
      ],
    }).success,
    false,
  );
});

test('analyze and refresh event matrices form valid complete streams', () => {
  const analyze = analyzeEvents();
  const refresh = refreshEvents();
  [...analyze, ...refresh].forEach((eventValue) =>
    assert.equal(NativeEventEnvelopeSchema.safeParse(eventValue).success, true),
  );
  assert.equal(
    NativeEventStreamSchema.safeParse({ request: analyzeRequest, events: analyze }).success,
    true,
  );
  assert.equal(
    NativeEventStreamSchema.safeParse({ request: refreshRequest, events: refresh }).success,
    true,
  );
});

test('describe, cancellation, and pre-start request failure are terminal streams', () => {
  const describe = {
    ...requestBase,
    type: 'DESCRIBE',
    payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
  };
  const cancel = { ...requestBase, type: 'CANCEL', payload: { targetRequestId: 'request-b' } };
  assert.equal(
    NativeEventStreamSchema.safeParse({
      request: describe,
      events: [envelope('DESCRIBE_COMPLETED', 0, descriptor)],
    }).success,
    true,
  );
  assert.equal(
    NativeEventStreamSchema.safeParse({
      request: cancel,
      events: [envelope('CANCEL_ACCEPTED', 0, { targetRequestId: 'request-b' })],
    }).success,
    true,
  );
  assert.equal(
    NativeEventStreamSchema.safeParse({
      request: analyzeRequest,
      events: [
        envelope('REQUEST_FAILED', 0, {
          error: { code: 'INVALID_REQUEST', message: 'Invalid request', retryable: false },
        }),
      ],
    }).success,
    true,
  );
});

test('stream validator rejects gaps, wrong IDs, illegal events, missing terminals, count drift, and context drift', () => {
  const mutations = [
    (events) => (events[1].sequence = 2),
    (events) => (events[1].requestId = 'wrong'),
    (events) => (events[1] = envelope('UPSERT_NODE', 1, node)),
    (events) => events.pop(),
    (events) => (events[1].payload.revisionId = 'wrong'),
    (events) => (events.at(-1).payload.counts.nodes = 2),
    (events) => (events[0].payload.revisionFingerprint = 'wrong'),
    (events) => events.push(envelope('DIAGNOSTIC', events.length, diagnostic)),
  ];
  mutations.forEach((mutate) => {
    const events = structuredClone(analyzeEvents());
    mutate(events);
    assert.equal(
      NativeEventStreamSchema.safeParse({ request: analyzeRequest, events }).success,
      false,
    );
  });

  const lowBudgetRequest = structuredClone(analyzeRequest);
  lowBudgetRequest.payload.resourceBudget.maxEvents = 1;
  assert.equal(
    NativeEventStreamSchema.safeParse({ request: lowBudgetRequest, events: analyzeEvents() })
      .success,
    false,
  );
  const cancel = { ...requestBase, type: 'CANCEL', payload: { targetRequestId: 'request-b' } };
  assert.equal(
    NativeEventStreamSchema.safeParse({
      request: cancel,
      events: [envelope('CANCEL_ACCEPTED', 0, { targetRequestId: 'wrong' })],
    }).success,
    false,
  );
});
