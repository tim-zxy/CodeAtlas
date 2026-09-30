import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const context = {
  providerId: 'native',
  providerVersion: '0.0.0',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '0.0.0',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '1',
  policyFingerprint: 'policy',
};
const revision = {
  id: 'rev',
  repositoryId: 'r',
  kind: 'WORKTREE',
  baseRevisionId: null,
  contentFingerprint: 'target',
};
const base = {
  irSchemaVersion: 1,
  providerSnapshotId: 'snap',
  repository: { id: 'r', rootPath: '/repo' },
  requestedCapabilities: ['SYMBOL'],
  deadlineEpochMs: null,
  resourceBudget: { maxDurationMs: 1000, maxMemoryBytes: 10000000, maxEvents: 100 },
  analysisStateContext: context,
};
const file = {
  id: 'f',
  repositoryId: 'r',
  revisionId: 'rev',
  path: 'A.java',
  contentFingerprint: 'old',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'PUBLIC',
};
function summary() {
  return {
    schemaVersion: 1,
    sourceFile: structuredClone(file),
    symbols: [],
    relationSites: [],
    diagnostics: [],
    emittedFacts: [],
    coverage: [
      {
        capability: 'SYMBOL',
        sourceFileId: 'f',
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
  };
}
function header(type = 'ANALYZE', summaries = []) {
  const payload =
    type === 'ANALYZE'
      ? { ...base, revision, sourceFiles: [], baselineState: null }
      : {
          ...base,
          baseRevisionId: 'rev',
          baseRevisionFingerprint: 'base',
          targetRevision: revision,
          changes: { added: [], modified: [], deleted: [] },
          targetSourceFiles: summaries.map((s) => structuredClone(s.sourceFile)),
          baselineState: {
            schemaVersion: 1,
            repositoryId: 'r',
            revisionId: 'rev',
            contentFingerprint: 'base',
            ...context,
            requestedCapabilities: ['SYMBOL'],
            sourceFileCount: summaries.length,
            summaryDigest: api.computeNativeSummaryDigest(summaries),
          },
        };
  return {
    protocolVersion: 3,
    requestId: 'req',
    sequence: 0,
    type,
    payload: structuredClone(payload),
  };
}
function records(h, summaries = []) {
  return [
    h,
    ...summaries.map((payload, i) => ({
      protocolVersion: 3,
      requestId: h.requestId,
      sequence: i + 1,
      type: 'BASELINE_SUMMARY',
      payload,
    })),
  ];
}
function wire(prior, mutateCompletion = () => {}) {
  const prefix = prior.map((r) => JSON.stringify(r) + '\n').join('');
  const completion = {
    protocolVersion: 3,
    requestId: prior[0].requestId,
    sequence: prior.length,
    type: 'REQUEST_COMPLETED',
    payload: { summaryRecords: prior.length - 1, integrityChecksum: hash(prefix) },
  };
  mutateCompletion(completion);
  return Buffer.from(prefix + JSON.stringify(completion) + '\n');
}
function rejects(bytes, code) {
  assert.throws(
    () => api.decodeNativeRequestV3(bytes),
    (e) =>
      e instanceof api.NativeV3ContractError &&
      e.code === code &&
      e.message === `Native v3 contract: ${code}`,
  );
}

test('full request requires completion even without baseline', () => {
  assert.equal(typeof api.decodeNativeRequestV3, 'function');
  const h = header();
  assert.deepEqual(api.decodeNativeRequestV3(wire([h])), { header: h, baseline: null });
  assert.deepEqual(api.NativeRequestHeaderV3Schema.parse(h), h);
  const parsed = wire([h]).toString().trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(api.validateNativeRequestRecordsV3(parsed), h);
  rejects(Buffer.from(JSON.stringify(h) + '\n'), 'PROTOCOL_CORRUPTION');
  const bad = structuredClone(h);
  bad.payload.extra = 'secret';
  rejects(wire([bad]), 'INVALID_REQUEST');
  bad.payload = structuredClone(h.payload);
  bad.protocolVersion = 2;
  rejects(wire([bad]), 'INCOMPATIBLE_PROTOCOL_VERSION');
  rejects(
    wire([h], (c) => {
      c.payload.summaryRecords = 1;
    }),
    'INVALID_REQUEST',
  );
});

test('refresh binds complete baseline and target inventory', () => {
  const s = summary(),
    h = header('REFRESH', [s]);
  assert.deepEqual(api.decodeNativeRequestV3(wire(records(h, [s]))).baseline, {
    header: h.payload.baselineState,
    summaries: [s],
  });
  const modified = structuredClone(file);
  modified.contentFingerprint = 'new';
  h.payload.targetSourceFiles = [modified];
  h.payload.changes.modified = [modified];
  assert.equal(api.decodeNativeRequestV3(wire(records(h, [s]))).header.type, 'REFRESH');
  h.payload.targetSourceFiles = [];
  h.payload.changes.modified = [];
  h.payload.changes.deleted = [{ id: 'f', path: 'A.java', previousContentFingerprint: 'old' }];
  assert.equal(api.decodeNativeRequestV3(wire(records(h, [s]))).header.type, 'REFRESH');
  h.payload.changes.deleted[0].previousContentFingerprint = 'wrong';
  rejects(wire(records(h, [s])), 'INVALID_REQUEST');
  for (const mutate of [
    (h) => {
      h.payload.baselineState.summaryDigest = 'a'.repeat(64);
    },
    (h) => {
      h.payload.analysisStateContext.resolverVersion = 'other';
    },
    (h) => {
      h.payload.targetSourceFiles.push(structuredClone(file));
    },
    (h) => {
      h.payload.targetSourceFiles[0].id = 'other';
    },
    (h) => {
      h.payload.targetSourceFiles[0].revisionId = 'other';
    },
  ]) {
    const bad = header('REFRESH', [s]);
    mutate(bad);
    rejects(wire(records(bad, [s])), 'INVALID_REQUEST');
  }
  assert.equal(api.decodeNativeRequestV3(wire([header('REFRESH')])).baseline.summaries.length, 0);
});

test('empty latest delta cannot hide failed activation', () => {
  const s = summary(),
    h = header('REFRESH', [s]);
  h.payload.targetSourceFiles[0].contentFingerprint = 'unapplied';
  rejects(wire(records(h, [s])), 'INVALID_REQUEST');
  h.payload.targetSourceFiles[0].contentFingerprint = 'old';
  h.payload.targetSourceFiles[0].sensitivity = 'INTERNAL';
  rejects(wire(records(h, [s])), 'INVALID_REQUEST');
});

test('bad framing and checksum expose no baseline', () => {
  const h = header(),
    valid = wire([h]);
  for (const bytes of [
    valid.subarray(0, -1),
    Buffer.concat([valid, Buffer.from('{}\n')]),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid]),
    Buffer.from(valid.toString().replaceAll('\n', '\r\n')),
    Buffer.concat([Buffer.from([0xff]), valid]),
    Buffer.concat([valid, Buffer.from('\n')]),
  ])
    rejects(bytes, 'PROTOCOL_CORRUPTION');
  rejects(
    wire([h], (c) => {
      c.payload.integrityChecksum = 'a'.repeat(64);
    }),
    'PROTOCOL_CORRUPTION',
  );
  rejects(
    wire([h], (c) => {
      c.requestId = 'other';
    }),
    'PROTOCOL_CORRUPTION',
  );
  rejects(
    wire([h], (c) => {
      c.sequence = 2;
    }),
    'PROTOCOL_CORRUPTION',
  );
  rejects(
    wire([h], (c) => {
      c.sequence = Number.MAX_SAFE_INTEGER + 1;
    }),
    'PROTOCOL_CORRUPTION',
  );
  const negative = valid.toString().replace('"sequence":0', '"sequence":-0');
  rejects(Buffer.from(negative), 'PROTOCOL_CORRUPTION');
});

test('byte cap includes multibyte records and final LF', () => {
  const h = header();
  h.payload.repository.rootPath = '/' + '源'.repeat(200000);
  const small = wire([h]);
  const padded = Buffer.concat([Buffer.from(' '.repeat(1000000 - small.length)), small]);
  assert.equal(padded.length, 1000000);
  // Whitespace belongs to the raw first record and therefore changes its checksum.
  const lines = padded.toString().split('\n');
  const c = JSON.parse(lines[1]);
  c.payload.integrityChecksum = hash(lines[0] + '\n');
  const exact = Buffer.from(lines[0] + '\n' + JSON.stringify(c) + '\n');
  assert.equal(api.decodeNativeRequestV3(exact).header.type, 'ANALYZE');
  rejects(Buffer.concat([exact, Buffer.from(' ')]), 'RESOURCE_LIMIT_EXCEEDED');
});

test('shared raw request corpus has identical closed classifications', async () => {
  const root = new URL('../../../fixtures/ipc/protocol-v3/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));
  for (const c of manifest.cases) {
    assert.ok(c.bytesHex || /^[a-z0-9-]+\.jsonl$/.test(c.input), c.id);
    const bytes = c.bytesHex
      ? Buffer.from(c.bytesHex, 'hex')
      : await readFile(new URL(c.input, root));
    if (c.expected === null) assert.ok(api.decodeNativeRequestV3(bytes).header, c.id);
    else
      assert.throws(
        () => api.decodeNativeRequestV3(bytes),
        (e) => e.code === c.expected,
        c.id,
      );
  }
});
