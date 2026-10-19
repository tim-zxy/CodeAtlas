import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';

import * as api from '../dist/index.js';

const budget = {
  maxNodes: 8,
  maxEdges: 12,
  maxMetadataRows: 100,
  maxResultBytes: 4096,
  timeoutMs: 1000,
};
const request = { operation: 'UNDERSTAND', repositoryId: 'repo', symbolId: 'symbol', budget };
const searchEnvelope = {
  schema: 'code-query-result',
  version: 1,
  payload: {
    operation: 'SEARCH',
    repositoryId: 'repo',
    revisionId: 'revision',
    indexedContentFingerprint: 'fingerprint',
    freshness: { state: 'CURRENT', basis: 'PERSISTED_SOURCE', worktreeObservation: 'NOT_OBSERVED' },
    budget,
    warnings: ['REPOSITORY_COVERAGE_UNPROVEN', 'WORKTREE_NOT_OBSERVED'],
    truncation: [],
    refs: { facts: [], sources: [], evidence: [] },
    coverage: { basis: 'SUPPORT_SNAPSHOTS', observations: [] },
    symbols: [],
  },
};
const symbol = {
  id: 'symbol',
  factKey: 'symbol-key',
  repositoryId: 'repo',
  revisionId: 'revision',
  kind: 'SYMBOL',
  symbolKind: 'METHOD',
  name: 'run',
  qualifiedName: 'Example.run',
  sourceRange: null,
  confidence: { score: 0.75, method: 'parser', reasons: ['partial receiver resolution'] },
};
const symbolEnvelope = {
  ...searchEnvelope,
  payload: {
    ...searchEnvelope.payload,
    operation: 'GET_SYMBOL',
    symbol,
    refs: {
      facts: [{ factType: 'NODE', id: 'symbol' }],
      sources: [],
      evidence: [
        {
          fact: { factType: 'NODE', id: 'symbol' },
          evidenceId: 'evidence',
          providerSnapshotId: 'snapshot',
        },
      ],
    },
  },
};
delete symbolEnvelope.payload.symbols;

function required(name) {
  assert.equal(typeof api[name], 'function', `Missing approved query behavior: ${name}`);
  return api[name];
}
function rejectsRequest(value) {
  const parse = required('parseCodeQueryRequest');
  assert.throws(
    () => parse(value),
    (error) => error.code === 'INVALID_QUERY',
  );
}

for (const operation of ['GET_SYMBOL', 'INCOMING', 'OUTGOING', 'UNDERSTAND']) {
  test(`preserves explicit ${operation} request`, () => {
    assert.deepEqual(required('parseCodeQueryRequest')({ ...request, operation }), {
      ...request,
      operation,
    });
  });
}
test('accepts zero-depth trace without inventing a default', () => {
  const value = { ...request, operation: 'CODE_TRACE', maxDepth: 0 };
  assert.deepEqual(required('parseCodeQueryRequest')(value), value);
});
test('accepts literal wildcard-like and astral search names', () => {
  const value = {
    operation: 'SEARCH',
    repositoryId: 'repo',
    name: '%_😀',
    match: 'prefix',
    budget,
  };
  assert.deepEqual(required('parseCodeQueryRequest')(value), value);
});
for (const value of [
  null,
  {},
  { ...request, extra: true },
  { ...request, repositoryId: ' repo' },
  { ...request, symbolId: '' },
  { ...request, operation: 'BUSINESS_TRACE' },
  { ...request, maxDepth: 1 },
  { ...request, operation: 'CODE_TRACE' },
  { ...request, operation: 'CODE_TRACE', maxDepth: -0 },
  { operation: 'SEARCH', repositoryId: 'repo', name: '', match: 'exact', budget },
  { operation: 'SEARCH', repositoryId: 'repo', name: 'x', match: 'fuzzy', budget },
]) {
  test(`rejects invalid request ${JSON.stringify(value)}`, () => rejectsRequest(value));
}
for (const key of Object.keys(budget)) {
  for (const value of [0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '1', undefined]) {
    test(`rejects ${key}=${String(value)} without numeric coercion`, () => {
      rejectsRequest({ ...request, budget: { ...budget, [key]: value } });
    });
  }
}
test('rejects unknown budget option', () =>
  rejectsRequest({ ...request, budget: { ...budget, auto: true } }));
test('valid empty SEARCH is distinct from missing graph and round-trips', () => {
  assert.deepEqual(required('parseCodeQueryEnvelope')(searchEnvelope), searchEnvelope);
});
test('preserves stored confidence without promotion', () => {
  const result = required('parseCodeQueryEnvelope')(symbolEnvelope);
  assert.deepEqual(result.payload.symbol.confidence, {
    score: 0.75,
    method: 'parser',
    reasons: ['partial receiver resolution'],
  });
});
for (const mutation of [
  (value) => {
    value.payload.refs.facts = [];
  },
  (value) => {
    value.payload.refs.evidence = [];
  },
  (value) => {
    value.payload.symbol.repositoryId = 'another-repo';
  },
  (value) => {
    value.payload.refs.facts.push({ factType: 'NODE', id: 'other' });
  },
  (value) => {
    value.payload.refs.evidence[0].fact.id = 'other';
  },
  (value) => {
    value.payload.warnings = [];
  },
]) {
  test(`refuses unsupported or mis-scoped result ${mutation.toString()}`, () => {
    const parse = required('parseCodeQueryEnvelope');
    const value = structuredClone(symbolEnvelope);
    mutation(value);
    assert.throws(
      () => parse(value),
      (error) => error.code === 'QUERY_DATA_INVALID',
    );
  });
}
test('refuses an empty CODE_TRACE rather than implying a root exists', () => {
  const value = structuredClone(searchEnvelope);
  value.payload.operation = 'CODE_TRACE';
  delete value.payload.symbols;
  value.payload.nodes = [];
  value.payload.edges = [];
  assert.throws(
    () => required('parseCodeQueryEnvelope')(value),
    (error) => error.code === 'QUERY_DATA_INVALID',
  );
});
test('rejects accessor requests without invoking untrusted getters', () => {
  const value = { ...request };
  let reads = 0;
  Object.defineProperty(value, 'operation', {
    enumerable: true,
    get() {
      reads++;
      return 'UNDERSTAND';
    },
  });
  rejectsRequest(value);
  assert.equal(reads, 0);
});
for (const mutation of [
  (value) => {
    value.schema = 'native-result';
  },
  (value) => {
    value.version = 2;
  },
  (value) => {
    value.payload.extra = true;
  },
  (value) => {
    value.payload.freshness.worktreeObservation = 'CURRENT';
  },
  (value) => {
    value.payload.coverage.basis = 'COMPLETE_REPOSITORY';
  },
  (value) => {
    value.payload.warnings.push('SECRET_RAW_DIAGNOSTIC');
  },
  (value) => {
    value.payload.truncation = ['NODE_LIMIT', 'NODE_LIMIT'];
  },
  (value) => {
    value.payload.refs.sources.push({
      path: '../secret',
      sourceFileId: 'f',
      revisionId: 'revision',
      range: null,
    });
  },
]) {
  test(`rejects invalid result ${mutation.toString()}`, () => {
    const parse = required('parseCodeQueryEnvelope');
    const value = structuredClone(searchEnvelope);
    mutation(value);
    assert.throws(
      () => parse(value),
      (error) => error.code === 'QUERY_DATA_INVALID',
    );
  });
}
test('counts retained text with UTF-8 byte inputs and refuses overflow', () => {
  const control = required('createQueryControl')({ ...budget, maxResultBytes: 4 });
  control.reserveText(Buffer.byteLength('😀'));
  assert.throws(
    () => control.reserveText(1),
    (error) => error.code === 'QUERY_BUDGET_EXCEEDED',
  );
});
test('metadata row budget is global', () => {
  const control = required('createQueryControl')({ ...budget, maxMetadataRows: 1 });
  control.chargeMetadataRow();
  assert.throws(
    () => control.chargeMetadataRow(),
    (error) => error.code === 'QUERY_BUDGET_EXCEEDED',
  );
});
test('cancellation refuses a checkpoint', async () => {
  const create = required('createQueryControl');
  const controller = new AbortController();
  controller.abort();
  const control = create(budget, controller.signal);
  await assert.rejects(control.checkpoint(), (error) => error.code === 'QUERY_CANCELLED');
});
test('cooperative deadline refuses after actual expiry', async () => {
  const control = required('createQueryControl')({ ...budget, timeoutMs: 1 });
  await setTimeout(10);
  await assert.rejects(control.checkpoint(), (error) => error.code === 'QUERY_TIMEOUT');
});
