import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { CanonicalEdgeSchema, CanonicalNodeSchema } from '../../ir/dist/index.js';
import { CanonicalNormalizationError, normalizeNativeAnalysis } from '../dist/index.js';

const confidence = { score: 1, method: 'parser', reasons: [] };
const repository = { id: 'repo-fixture', rootPath: '/repo-fixture' };
const revision = {
  id: 'rev-fixture',
  repositoryId: repository.id,
  kind: 'WORKTREE',
  contentFingerprint: 'sha256:revision-fixture',
  baseRevisionId: null,
};
const file = {
  id: 'file-A.java',
  repositoryId: repository.id,
  revisionId: revision.id,
  path: 'src/A.java',
  contentFingerprint: 'sha256:source-A',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'PUBLIC',
};
const range = {
  sourceFileId: file.id,
  startLine: 1,
  startColumn: 2,
  endLine: 1,
  endColumn: 3,
};

function node(id, providerKind, overrides = {}) {
  return {
    providerId: 'native',
    providerFactId: id,
    providerSnapshotId: 'snapshot-fixture',
    repositoryId: repository.id,
    revisionId: revision.id,
    providerKind,
    name: id,
    qualifiedName: `demo.${id}`,
    sourceRange: range,
    confidence,
    ...overrides,
  };
}

function ref(id, providerId = 'native') {
  return { factType: 'NODE', providerId, providerFactId: id };
}

function edge(id, providerKind, target, overrides = {}) {
  return {
    providerId: 'native',
    providerFactId: id,
    providerSnapshotId: 'snapshot-fixture',
    repositoryId: repository.id,
    revisionId: revision.id,
    providerKind,
    source: ref('caller'),
    target,
    sourceRange: range,
    confidence,
    ...overrides,
  };
}

function resolved(id) {
  return { state: 'RESOLVED', resolution: 'EXACT', target: ref(id) };
}

function unresolved(resolution = 'UNRESOLVED', candidates = []) {
  return { state: 'UNRESOLVED', resolution, originalHint: 'demo.Unknown', candidates };
}

function result({
  version = 1,
  nodes = [],
  edges = [],
  outcome = 'SUCCEEDED',
  source = file,
} = {}) {
  const request = {
    protocolVersion: version,
    requestId: 'normalize-fixture',
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot-fixture',
      repository,
      requestedCapabilities: ['SYMBOL'],
      deadlineEpochMs: null,
      resourceBudget: { maxDurationMs: 10_000, maxMemoryBytes: 64_000_000, maxEvents: 100 },
      revision,
      sourceFiles: [source],
    },
  };
  const context = {
    providerSnapshotId: request.payload.providerSnapshotId,
    repositoryId: repository.id,
    revisionId: revision.id,
    revisionFingerprint: revision.contentFingerprint,
  };
  const coverage = {
    capability: 'SYMBOL',
    sourceFileId: source.id,
    support: 'SUPPORTED',
    coverage: outcome === 'PARTIAL' ? 'PARTIAL' : 'COMPLETE',
    ...(version === 2
      ? {
          statistics: {
            eligibleSites: 0,
            coveredSites: 0,
            unsupportedSites: 0,
            partialSites: 0,
            resolutionCounts: {
              EXACT: 0,
              HEURISTIC: 0,
              AMBIGUOUS: 0,
              UNRESOLVED: 0,
              UNSUPPORTED: 0,
            },
          },
        }
      : {}),
  };
  const raw = [
    ['ANALYSIS_STARTED', context],
    ['SOURCE_FILE', source],
    ...nodes.map((value) => ['NODE', value]),
    ...edges.map((value) => ['EDGE', value]),
    ['COVERAGE', coverage],
  ];
  const events = raw.map(([type, payload], sequence) => ({
    protocolVersion: version,
    requestId: request.requestId,
    sequence,
    type,
    payload,
  }));
  const checksum = createHash('sha256')
    .update(events.map((value) => `${JSON.stringify(value)}\n`).join(''))
    .digest('hex');
  const terminal = {
    protocolVersion: version,
    requestId: request.requestId,
    sequence: events.length,
    type: 'ANALYSIS_COMPLETED',
    payload: {
      ...context,
      outcome,
      counts: {
        sourceFiles: 1,
        nodes: nodes.length,
        edges: edges.length,
        coverage: 1,
        diagnostics: 0,
      },
      capabilities: [{ name: 'SYMBOL', support: 'SUPPORTED', coverage: coverage.coverage }],
      contentFingerprint: 'sha256:result',
      integrityChecksum: `sha256:${checksum}`,
    },
  };
  return { request, events: [...events, terminal], terminal, stderr: '' };
}

const caller = node('caller', 'java.class', { name: 'Caller' });
const target = node('target', 'java.method', { name: 'target' });

function failure(code) {
  return (error) => error instanceof CanonicalNormalizationError && error.code === code;
}

test('completed v1 and v2 analyses map nodes and preserve partial outcome without publication', () => {
  for (const version of [1, 2]) {
    const batch = normalizeNativeAnalysis(result({ version, nodes: [caller, target] }));
    assert.equal(batch.nodes.length, 2);
    assert.equal(batch.edges.length, 0);
    for (const pair of batch.nodes) CanonicalNodeSchema.parse(pair.canonical);
  }
  const partial = normalizeNativeAnalysis(result({ nodes: [caller], outcome: 'PARTIAL' }));
  assert.equal(partial.nodes.length, 1);
  assert.deepEqual(Object.keys(partial).sort(), ['edges', 'nodeRefsByProviderFactId', 'nodes']);
});

test('all reviewed Java edge kinds map while target state and callsite stay honest', () => {
  const sourceUnit = node('unit', 'java.compilation_unit', {
    name: file.path,
    qualifiedName: file.path,
    sourceRange: null,
  });
  const cases = [
    ['java.import.normal', 'IMPORT'],
    ['java.import.static', 'IMPORT'],
    ['java.import.wildcard', 'IMPORT'],
    ['java.call', 'CALL'],
    ['java.inheritance', 'INHERITANCE'],
    ['java.reference', 'REFERENCE'],
  ];
  const edges = cases.map(([providerKind], index) =>
    edge(`edge-${index}`, providerKind, resolved('target'), {
      source: ref(providerKind.startsWith('java.import') ? 'unit' : 'caller'),
    }),
  );
  const batch = normalizeNativeAnalysis(result({ nodes: [caller, target, sourceUnit], edges }));
  const call = batch.edges.find((pair) => pair.provider.providerFactId === 'edge-3');
  assert.equal(
    call.canonical.factKey,
    'edge-fact-v1:e9f1ff8063b2b3c040e9e45367c605141db340d96b3d21d9e7fdbf794a5b1d23',
  );
  assert.deepEqual(
    batch.edges.map(({ canonical }) => canonical.kind).sort(),
    cases.map(([, kind]) => kind).sort(),
  );
  for (const { canonical } of batch.edges) {
    assert.equal(canonical.target.state, 'RESOLVED');
    assert.deepEqual(canonical.sourceRange, range);
    assert.deepEqual(canonical.confidence, confidence);
    CanonicalEdgeSchema.parse(canonical);
    assert.equal(JSON.stringify(canonical).includes('native'), false);
  }
});

test('unresolved and ambiguous relations preserve hints and ordered unique candidates', () => {
  const second = node('second', 'java.method', {
    name: 'second',
    sourceRange: { ...range, startLine: 2, endLine: 2 },
  });
  const edges = [
    edge('missing', 'java.call', unresolved()),
    edge('ambiguous', 'java.call', unresolved('AMBIGUOUS', [ref('target'), ref('second')])),
  ];
  const batch = normalizeNativeAnalysis(result({ nodes: [caller, target, second], edges }));
  const byId = new Map(batch.edges.map((pair) => [pair.provider.providerFactId, pair.canonical]));
  assert.equal(byId.get('missing').target.state, 'UNRESOLVED');
  assert.equal(byId.get('missing').target.originalHint, 'demo.Unknown');
  assert.equal(byId.get('ambiguous').target.resolution, 'AMBIGUOUS');
  assert.equal(byId.get('missing').factKey, byId.get('ambiguous').factKey);
  assert.deepEqual(byId.get('ambiguous').target.candidates, [
    batch.nodeRefsByProviderFactId.get('target'),
    batch.nodeRefsByProviderFactId.get('second'),
  ]);
});

test('different Provider candidate refs collapsing to one Canonical identity cannot fake ambiguity', () => {
  const packageA = node('package-a', 'java.package', { name: 'demo', qualifiedName: 'demo' });
  const packageB = node('package-b', 'java.package_container', {
    name: 'demo',
    qualifiedName: 'demo',
    sourceRange: null,
  });
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({
          nodes: [caller, packageA, packageB],
          edges: [
            edge(
              'ambiguous',
              'java.call',
              unresolved('AMBIGUOUS', [ref('package-a'), ref('package-b')]),
            ),
          ],
        }),
      ),
    failure('INVALID_FACT'),
  );
  const batch = normalizeNativeAnalysis(
    result({
      nodes: [caller, packageA, packageB],
      edges: [
        edge(
          'unresolved',
          'java.call',
          unresolved('UNRESOLVED', [ref('package-a'), ref('package-b')]),
        ),
      ],
    }),
  );
  assert.equal(batch.edges[0].canonical.target.candidates.length, 1);
  assert.equal(batch.nodes.filter((pair) => pair.canonical.kind === 'PACKAGE').length, 2);
});

test('invalid stream context, terminal, references, and kinds return no partial batch', () => {
  const valid = result({
    nodes: [caller, target],
    edges: [edge('call', 'java.call', resolved('target'))],
  });
  assert.throws(
    () => normalizeNativeAnalysis({ ...valid, request: { ...valid.request, type: 'DESCRIBE' } }),
    failure('INVALID_CONTEXT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis({
        ...valid,
        terminal: { ...valid.terminal, type: 'ANALYSIS_FAILED' },
      }),
    failure('INVALID_CONTEXT'),
  );
  assert.throws(
    () => normalizeNativeAnalysis({ ...valid, events: valid.events.slice(0, -1) }),
    failure('INVALID_CONTEXT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis({
        ...valid,
        events: valid.events.map((event) =>
          event.type === 'ANALYSIS_COMPLETED'
            ? {
                ...event,
                payload: { ...event.payload, counts: { ...event.payload.counts, nodes: 99 } },
              }
            : event,
        ),
      }),
    failure('INVALID_CONTEXT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis({
        ...valid,
        events: valid.events.map((event) =>
          event.type === 'NODE'
            ? { ...event, payload: { ...event.payload, revisionId: 'other-rev' } }
            : event,
        ),
      }),
    failure('INVALID_CONTEXT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(result({ nodes: [caller, { ...target, providerFactId: 'caller' }] })),
    failure('INVALID_FACT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({ nodes: [caller], edges: [edge('caller', 'java.call', resolved('caller'))] }),
      ),
    failure('INVALID_FACT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(result({ nodes: [caller, { ...target, providerId: 'secondary' }] })),
    failure('INVALID_CONTEXT'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({
          nodes: [caller],
          edges: [edge('call', 'java.call', resolved('caller'), { source: ref('absent') })],
        }),
      ),
    failure('MISSING_REFERENCE'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({ nodes: [caller], edges: [edge('call', 'java.call', resolved('absent'))] }),
      ),
    failure('MISSING_REFERENCE'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({
          nodes: [caller],
          edges: [edge('call', 'java.call', unresolved('UNRESOLVED', [ref('absent')]))],
        }),
      ),
    failure('MISSING_REFERENCE'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({ nodes: [caller], edges: [edge('call', 'java.other', resolved('caller'))] }),
      ),
    failure('UNSUPPORTED_KIND'),
  );
  assert.throws(
    () =>
      normalizeNativeAnalysis(
        result({
          nodes: [caller],
          edges: [edge('call', 'java.call', resolved('caller'), { sourceRange: null })],
        }),
      ),
    failure('INVALID_FACT'),
  );
  const inconsistentSource = result({ nodes: [caller] });
  assert.throws(
    () =>
      normalizeNativeAnalysis({
        ...inconsistentSource,
        events: inconsistentSource.events.map((event) =>
          event.type === 'SOURCE_FILE'
            ? { ...event, payload: { ...event.payload, path: 'src/Other.java' } }
            : event,
        ),
      }),
    failure('INVALID_CONTEXT'),
  );
});

test('permuted valid fact events preserve Canonical keys, IDs, and stable pair order', () => {
  const first = result({
    nodes: [caller, target],
    edges: [edge('call', 'java.call', resolved('target'))],
  });
  const second = result({
    nodes: [target, caller],
    edges: [edge('call', 'java.call', resolved('target'))],
  });
  const normalize = (value) => {
    const batch = normalizeNativeAnalysis(value);
    return {
      nodes: batch.nodes.map((pair) => [
        pair.provider.providerFactId,
        pair.canonical.factKey,
        pair.canonical.id,
      ]),
      edges: batch.edges.map((pair) => [
        pair.provider.providerFactId,
        pair.canonical.factKey,
        pair.canonical.id,
      ]),
    };
  };
  assert.deepEqual(normalize(first), normalize(second));
  assert.notEqual(
    first.terminal.payload.integrityChecksum,
    second.terminal.payload.integrityChecksum,
  );
});
