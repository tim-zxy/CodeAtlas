import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  canonical,
  control,
} from '../../application/test/helpers/captured-integration-fixture.mjs';
import { traceOwnedBusinessFlow } from '../dist/offline-business-trace.js';

const vectors = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
);
function sample(type = 'BUSINESS_FLOW') {
  const vector = vectors.subjects.find((v) => v.name === type),
    existing = structuredClone(vector.existing),
    revision = existing.revisionEnvelope.payload;
  if (type === 'BUSINESS_FLOW') {
    const supportRefs = structuredClone(revision.structuredContent.steps[0].supportRefs);
    revision.structuredContent.steps = [
      ['d', ['e', 'a']],
      ['c', ['d']],
      ['a', ['c', 'b']],
      ['e', []],
      ['b', ['d']],
    ].map(([stepKey, nextStepKeys]) => ({
      stepKey,
      action: 'Literal action ' + stepKey,
      supportRefs: structuredClone(supportRefs),
      nextStepKeys,
    }));
    revision.structuredContent.limitations = ['Synthetic fixture; no execution or temporal proof'];
  }
  const knowledgeRef = { itemId: existing.itemEnvelope.payload.id, revisionId: revision.id };
  const request = {
    kind: 'BUSINESS',
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    knowledgeRef,
    startStepKey: 'a',
    direction: 'FORWARD',
    maxDepth: 20,
    maxSteps: 20,
    maxEdges: 20,
    maxResultBytes: 1000000,
  };
  const row = {
    itemEnvelope: existing.itemEnvelope,
    revisionEnvelope: existing.revisionEnvelope,
    referenceContext: existing.referenceContext,
    coverage: structuredClone(vector.candidate.candidateEnvelope.payload.coverage),
    provenance: {
      attemptId: 'owned-business:synthetic',
      runId: revision.compilationRunId,
      snapshotId: revision.inputSnapshotRef.id,
      revisionSetId: revision.revisionSetId,
      evaluationId: revision.evaluationRef.id,
    },
    currentHeadRevisionId: revision.id,
    isCurrentHead: true,
    warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
  };
  const knowledge = {
    kind: 'OWNED_TEST_PUBLICATION',
    workspaceId: request.workspaceId,
    selectionDigest: createHash('sha256')
      .update(
        'codeatlas.offline-knowledge.selection.v1\0' +
          canonical({ workspaceId: request.workspaceId, refs: [knowledgeRef] }),
      )
      .digest('hex'),
    records: [row],
    productionQuery: 'NOT_AUTHORIZED',
    quality: 'NOT_EVALUABLE',
  };
  return { request, knowledge, row, c: control() };
}
const edgeKeys = (edges) => edges.map((e) => e.fromStepKey + '>' + e.toStepKey).sort();

test('literal diamond and cycle traverse once by stable breadth-first keys with original actions and supports', () => {
  const f = sample(),
    result = traceOwnedBusinessFlow(f.request, f.knowledge, f.c);
  assert.equal(result.kind, 'BUSINESS');
  assert.deepEqual(result.knowledgeRef, f.request.knowledgeRef);
  assert.deepEqual(
    result.steps.map((s) => [s.stepKey, s.depth]),
    [
      ['a', 0],
      ['b', 1],
      ['c', 1],
      ['d', 2],
      ['e', 3],
    ],
  );
  assert.deepEqual(edgeKeys(result.edges), ['a>b', 'a>c', 'b>d', 'c>d', 'd>a', 'd>e']);
  assert.deepEqual(result.frontier, []);
  assert.equal(result.truncated, false);
  for (const step of result.steps) {
    const original = f.row.revisionEnvelope.payload.structuredContent.steps.find(
      (s) => s.stepKey === step.stepKey,
    );
    assert.equal(step.action, original.action);
    assert.deepEqual(step.supportRefs, original.supportRefs);
  }
  assert.deepEqual(result.coverage, f.row.coverage);
  assert.deepEqual(result.provenance, f.row.provenance);
  assert.deepEqual(
    result.participants,
    f.row.revisionEnvelope.payload.structuredContent.participants,
  );
  assert.deepEqual(
    result.runtimeFlowRefs,
    f.row.revisionEnvelope.payload.structuredContent.runtimeFlowRefs,
  );
  assert.equal(result.quality, 'NOT_EVALUABLE');
  assert.equal(result.productionQuery, 'NOT_AUTHORIZED');
  const permuted = structuredClone(f.knowledge);
  permuted.records[0].revisionEnvelope.payload.structuredContent.steps.reverse();
  for (const step of permuted.records[0].revisionEnvelope.payload.structuredContent.steps)
    step.nextStepKeys.reverse();
  assert.deepEqual(traceOwnedBusinessFlow(f.request, permuted, f.c), result);
});

test('backward traversal retains the original directed edges and shortest depths', () => {
  const f = sample(),
    result = traceOwnedBusinessFlow(
      { ...f.request, startStepKey: 'e', direction: 'BACKWARD' },
      f.knowledge,
      f.c,
    );
  assert.deepEqual(
    result.steps.map((s) => [s.stepKey, s.depth]),
    [
      ['e', 0],
      ['d', 1],
      ['b', 2],
      ['c', 2],
      ['a', 3],
    ],
  );
  assert.deepEqual(edgeKeys(result.edges), ['a>b', 'a>c', 'b>d', 'c>d', 'd>a', 'd>e']);
  assert.equal(result.truncated, false);
});

test('depth zero, step count and edge count each retain explicit frontier rather than false completeness', () => {
  const f = sample();
  for (const [patch, reason] of [
    [{ maxDepth: 0 }, 'MAX_DEPTH'],
    [{ maxSteps: 1 }, 'MAX_STEPS'],
    [{ maxEdges: 1 }, 'MAX_EDGES'],
  ]) {
    const result = traceOwnedBusinessFlow({ ...f.request, ...patch }, f.knowledge, f.c);
    assert.equal(result.truncated, true);
    assert.ok(result.frontier.some((e) => e.reason === reason));
    assert.ok(result.steps.length <= (patch.maxSteps ?? f.request.maxSteps));
    assert.ok(result.edges.length <= (patch.maxEdges ?? f.request.maxEdges));
    for (const frontier of result.frontier) {
      assert.equal(typeof frontier.fromStepKey, 'string');
      assert.equal(typeof frontier.toStepKey, 'string');
      assert.ok(Number.isSafeInteger(frontier.depth));
    }
    if (patch.maxDepth === 0) {
      assert.deepEqual(
        result.steps.map((s) => s.stepKey),
        ['a'],
      );
      assert.deepEqual(result.frontier.map((e) => e.toStepKey).sort(), ['b', 'c']);
    }
  }
});

test('whole response UTF8 budget includes coverage provenance limitations and support metadata', () => {
  const f = sample();
  f.row.revisionEnvelope.payload.structuredContent.limitations.push('界'.repeat(2000));
  const result = traceOwnedBusinessFlow(f.request, f.knowledge, f.c),
    bytes = Buffer.byteLength(JSON.stringify(result));
  assert.deepEqual(
    traceOwnedBusinessFlow({ ...f.request, maxResultBytes: bytes }, f.knowledge, f.c),
    result,
  );
  assert.throws(
    () => traceOwnedBusinessFlow({ ...f.request, maxResultBytes: bytes - 1 }, f.knowledge, f.c),
    { code: 'BUSINESS_TRACE_BUDGET_EXCEEDED' },
  );
  const graphBytes = Buffer.byteLength(
    JSON.stringify({ steps: result.steps, edges: result.edges, frontier: result.frontier }),
  );
  assert.ok(graphBytes < bytes);
  assert.throws(
    () => traceOwnedBusinessFlow({ ...f.request, maxResultBytes: graphBytes }, f.knowledge, f.c),
    { code: 'BUSINESS_TRACE_BUDGET_EXCEEDED' },
  );
});

test('invalid request, wrong knowledge kind and missing start step return typed refusals', () => {
  const f = sample();
  for (const patch of [
    { kind: 'RUNTIME' },
    { direction: 'BOTH' },
    { maxDepth: -1 },
    { maxSteps: 0 },
    { maxEdges: 0 },
    { maxResultBytes: 0 },
    { maxSteps: 1.5 },
    { maxDepth: Number.MAX_SAFE_INTEGER + 1 },
    { extra: true },
  ])
    assert.throws(() => traceOwnedBusinessFlow({ ...f.request, ...patch }, f.knowledge, f.c), {
      code: 'BUSINESS_TRACE_INVALID_INPUT',
    });
  assert.throws(
    () => traceOwnedBusinessFlow({ ...f.request, startStepKey: 'missing' }, f.knowledge, f.c),
    { code: 'BUSINESS_TRACE_STEP_NOT_FOUND' },
  );
  const other = sample('INTEGRATION');
  assert.throws(() => traceOwnedBusinessFlow(other.request, other.knowledge, other.c), {
    code: 'BUSINESS_TRACE_KIND_MISMATCH',
  });
});

test('selection membership, scope, digest, malformed edges and unpublished records refuse', () => {
  for (const change of [
    (f) => {
      f.knowledge.records = [];
    },
    (f) => {
      f.knowledge.records.push(structuredClone(f.row));
    },
    (f) => {
      f.knowledge.selectionDigest = 'a'.repeat(64);
    },
    (f) => {
      f.row.itemEnvelope.payload.scope.repositoryId = 'foreign';
    },
    (f) => {
      f.row.provenance.runId = 'other';
    },
    (f) => {
      f.row.revisionEnvelope.payload.publicationState = 'CANDIDATE';
    },
    (f) => {
      f.row.revisionEnvelope.payload.structuredContent.steps[0].nextStepKeys = ['missing'];
    },
  ]) {
    const f = sample();
    change(f);
    assert.throws(() => traceOwnedBusinessFlow(f.request, f.knowledge, f.c));
  }
});

test('affected source and partial coverage are preserved with explicit warnings; cooperative controls refuse', () => {
  const f = sample();
  f.row.itemEnvelope.payload.sourceFreshness = 'AFFECTED';
  f.row.warnings.push('AFFECTED');
  f.row.coverage = {
    status: 'PARTIAL',
    limitations: ['synthetic missing support'],
    unverifiedRefs: [],
  };
  const result = traceOwnedBusinessFlow(f.request, f.knowledge, f.c);
  assert.equal(result.sourceFreshness, 'AFFECTED');
  assert.equal(result.compilationCurrency, 'CURRENT');
  assert.deepEqual(result.coverage, f.row.coverage);
  assert.ok(result.warnings.includes('AFFECTED'));
  const abort = new AbortController();
  abort.abort();
  assert.throws(() =>
    traceOwnedBusinessFlow(f.request, f.knowledge, { ...f.c, signal: abort.signal }),
  );
  assert.throws(() => traceOwnedBusinessFlow(f.request, f.knowledge, { ...f.c, maxItems: 1 }));
});

test('historical published selection remains exact and is explicit even without query warnings', () => {
  const f = sample();
  const selected = structuredClone(f.request.knowledgeRef),
    freshness = f.row.itemEnvelope.payload.sourceFreshness,
    currency = f.row.itemEnvelope.payload.compilationCurrency;
  f.row.currentHeadRevisionId = 'new:revision';
  f.row.isCurrentHead = false;
  f.row.warnings = [];
  const result = traceOwnedBusinessFlow(f.request, f.knowledge, f.c);
  assert.deepEqual(result.knowledgeRef, selected);
  assert.equal(result.currentHeadRevisionId, 'new:revision');
  assert.equal(result.isCurrentHead, false);
  assert.ok(result.warnings.includes('HISTORICAL_PUBLISHED_REVISION'));
  assert.equal(result.sourceFreshness, freshness);
  assert.equal(result.compilationCurrency, currency);
  assert.equal(result.quality, 'NOT_EVALUABLE');
  assert.equal(result.productionQuery, 'NOT_AUTHORIZED');
});
