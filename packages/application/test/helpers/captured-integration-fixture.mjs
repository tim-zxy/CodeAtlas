import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const control = (changes = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...changes,
});
const zero = '0'.repeat(64);
const coverage = () => ({ status: 'COMPLETE', limitations: [], unverifiedRefs: [] });
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const basis = {
  repositoryId: 'r',
  revisionId: 'v',
  contentFingerprint: 'sha256:' + zero,
  codeActivationDigest: zero,
};
const wr = (kind, id) => ({
  scope: 'WORKSPACE',
  workspaceId: 'w',
  entity: { kind, id, revisionId: 'rs' },
});
const rr = (kind, id) => ({
  scope: 'REPOSITORY',
  repositoryId: 'r',
  entity: { kind, id, revisionId: 'v' },
});
function fixture() {
  const file = {
    id: 'f',
    repositoryId: 'r',
    revisionId: 'v',
    path: 'a.java',
    contentFingerprint: 'sha256:' + zero,
    classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: 'java',
    sensitivity: 'INTERNAL',
  };
  const support = {
    basis,
    entity: rr('SOURCE_FILE', 'f').entity,
    valueDigest: hash('codeatlas-phase1-support-value-v1\0' + canonical(file)),
  };
  const source = {
    ref: support,
    valueSchemaRef: 'SourceFile@1',
    value: file,
    capturedValueDigest: hash(
      'codeatlas.capture-value.v1\n' + canonical({ value: file, valueSchemaRef: 'SourceFile@1' }),
    ),
  };
  const workspaceBasis = { workspaceId: 'w', revisionSetId: 'rs', workspaceActivationDigest: zero };
  const confidence = { score: 1, method: 'fixture', reasons: ['literal'] };
  const service = (id) => ({
    ref: wr('SERVICE', id),
    valueSchemaRef: 'Service@1',
    value: {
      id,
      factKey: id,
      logicalServiceKey: id,
      location: 'WORKSPACE',
      repositoryRef: rr('REPOSITORY', 'r'),
      supportRefs: [support],
    },
  });
  const contract = (id, direction) => ({
    ref: rr('CONTRACT', id),
    valueSchemaRef: 'Contract@1',
    value: {
      id,
      factKey: id,
      repositoryId: 'r',
      revisionId: 'v',
      basis,
      sourceRange: { sourceFileId: 'f', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
      supportRefs: [support],
      confidence,
      resolution: 'EXACT',
      direction,
      protocol: 'HTTP',
      serviceRef: null,
      implementationRef: null,
      signature: {
        kind: 'HTTP',
        method: 'GET',
        pathSegments: [],
        querySchemaRef: null,
        requestSchemaRef: null,
        responseSchemaRef: null,
        serviceHint: null,
      },
    },
  });
  const match = {
    id: 'm',
    factKey: 'm',
    workspaceBasis,
    consumerRef: rr('CONTRACT', 'c'),
    status: 'MATCHED',
    candidateProviderRefs: [rr('CONTRACT', 'p')],
    selectedProviderRef: rr('CONTRACT', 'p'),
    reasons: ['EXACT'],
    supportRefs: [support],
    basisRefs: [basis],
    confidence,
  };
  const raw = {
    schemaVersion: 1,
    snapshotId: 'snap',
    workspaceId: 'w',
    scope: { kind: 'WORKSPACE', workspaceId: 'w' },
    revisionSetId: 'rs',
    selection: {
      repositoryIds: ['r'],
      selectedEntityRefs: [
        rr('CONTRACT', 'c'),
        rr('CONTRACT', 'p'),
        wr('SERVICE', 's1'),
        wr('SERVICE', 's2'),
        wr('CONTRACT_MATCH', 'm'),
      ],
      selectedDocumentRevisions: [],
    },
    repositories: [
      {
        repoBasis: basis,
        runtimeActivationDigest: zero,
        entities: [contract('c', 'CONSUMER'), contract('p', 'PROVIDER')],
        supports: [source],
        coverage: coverage(),
      },
    ],
    workspaceCapture: {
      workspaceBasis,
      entities: [
        service('s1'),
        service('s2'),
        { ref: wr('CONTRACT_MATCH', 'm'), valueSchemaRef: 'ContractMatch@1', value: match },
      ],
      supports: [],
      coverage: coverage(),
      contractBindings: {
        schemaVersion: 1,
        bindings: [
          {
            contractRef: rr('CONTRACT', 'c'),
            serviceRef: wr('SERVICE', 's1'),
            supportRefs: [support],
          },
          {
            contractRef: rr('CONTRACT', 'p'),
            serviceRef: wr('SERVICE', 's2'),
            supportRefs: [support],
          },
        ],
      },
    },
    documents: [],
    policyVersions: { securityPolicyRef: 'security', domainPolicyRef: 'domain' },
    captureWindow: {
      startedAt: '2026-11-08T00:00:00.000Z',
      completedAt: '2026-11-08T00:00:01.000Z',
    },
    coverage: coverage(),
  };
  return { raw, match, support };
}
function account() {
  let invalid = false;
  return {
    checkpoint() {
      assert.equal(invalid, false);
    },
    own() {
      this.checkpoint();
    },
    reserveBuffer() {
      this.checkpoint();
    },
    visitItem() {
      this.checkpoint();
    },
    invalidate() {
      invalid = true;
    },
  };
}
const options = () => ({
  candidateId: 'draft',
  matchRef: wr('CONTRACT_MATCH', 'm'),
  importance: 'normal',
});

export { fixture, account, control, options, wr, rr, hash, canonical };
