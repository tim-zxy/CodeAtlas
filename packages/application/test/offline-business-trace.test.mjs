import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { canonical, control } from './helpers/captured-integration-fixture.mjs';
import { OfflineBusinessFlowTracer } from '../dist/offline-business-trace.js';
import { OfflinePublicationPreparer } from '../dist/offline-publication.js';
import {
  sampleSet,
  approve,
  limits,
} from '../../storage/test/helpers/offline-publication-fixture.mjs';
import { initializeOfflinePublicationStore } from '../../storage/dist/knowledge/offline-publication-store.js';

function sample() {
  const vectors = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
      'utf8',
    ),
  );
  const vector = vectors.subjects.find((v) => v.name === 'BUSINESS_FLOW'),
    existing = structuredClone(vector.existing),
    revision = existing.revisionEnvelope.payload;
  const knowledgeRef = { itemId: existing.itemEnvelope.payload.id, revisionId: revision.id };
  const request = {
    kind: 'BUSINESS',
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    knowledgeRef,
    startStepKey: 'accept',
    direction: 'FORWARD',
    maxDepth: 10,
    maxSteps: 10,
    maxEdges: 10,
    maxResultBytes: 1000000,
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
    records: [
      {
        itemEnvelope: existing.itemEnvelope,
        revisionEnvelope: existing.revisionEnvelope,
        referenceContext: existing.referenceContext,
        coverage: structuredClone(vector.candidate.candidateEnvelope.payload.coverage),
        provenance: {
          attemptId: 'owned-app-business:synthetic',
          runId: revision.compilationRunId,
          snapshotId: revision.inputSnapshotRef.id,
          revisionSetId: revision.revisionSetId,
          evaluationId: revision.evaluationRef.id,
        },
        currentHeadRevisionId: revision.id,
        isCurrentHead: true,
        warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
      },
    ],
    productionQuery: 'NOT_AUTHORIZED',
    quality: 'NOT_EVALUABLE',
  };
  return { request, knowledge, c: control() };
}

test('fixed workspace and captured query port request only the exact selected published revision', async () => {
  const f = sample();
  let calls = 0;
  const ports = {
    workspaceId: f.request.workspaceId,
    knowledgeQuery: async (request, c) => {
      calls++;
      assert.deepEqual(request, {
        workspaceId: f.request.workspaceId,
        repositoryIds: f.request.repositoryIds,
        selectedPublishedRevisionRefs: [f.request.knowledgeRef],
      });
      assert.ok(Object.isFrozen(request));
      assert.ok(c.signal instanceof AbortSignal);
      return f.knowledge;
    },
  };
  const tracer = new OfflineBusinessFlowTracer(ports);
  ports.knowledgeQuery = () => {
    throw Error('replaced');
  };
  ports.workspaceId = 'foreign';
  const result = await tracer.trace(f.request, f.c);
  assert.deepEqual(
    result.steps.map((s) => s.stepKey),
    ['accept'],
  );
  assert.equal(result.productionQuery, 'NOT_AUTHORIZED');
  assert.equal(result.quality, 'NOT_EVALUABLE');
  assert.equal(calls, 1);
  await assert.rejects(() => tracer.trace({ ...f.request, workspaceId: 'foreign' }, f.c));
  assert.equal(calls, 1);
});

test('request validation precedes query; permission failures propagate and late cancellation refuses delivery', async () => {
  const f = sample();
  let calls = 0,
    callback = () => f.knowledge;
  const tracer = new OfflineBusinessFlowTracer({
    workspaceId: f.request.workspaceId,
    knowledgeQuery: async (...args) => {
      calls++;
      return callback(...args);
    },
  });
  await assert.rejects(() => tracer.trace({ ...f.request, maxSteps: 0 }, f.c), {
    code: 'BUSINESS_TRACE_INVALID_INPUT',
  });
  assert.equal(calls, 0);
  const denied = Object.assign(Error('permission denied'), { code: 'KNOWLEDGE_PERMISSION_DENIED' });
  callback = () => {
    throw denied;
  };
  await assert.rejects(
    () => tracer.trace(f.request, f.c),
    (error) => error === denied,
  );
  const abort = new AbortController();
  callback = () => {
    abort.abort();
    return f.knowledge;
  };
  await assert.rejects(() => tracer.trace(f.request, { ...f.c, signal: abort.signal }));
});

test('unavailable or substituted exact knowledge never becomes an empty successful trace', async () => {
  const f = sample();
  let value = f.knowledge;
  const tracer = new OfflineBusinessFlowTracer({
    workspaceId: f.request.workspaceId,
    knowledgeQuery: async () => value,
  });
  for (const change of [
    (k) => {
      k.records = [];
    },
    (k) => {
      k.records[0].provenance.runId = 'foreign';
    },
    (k) => {
      k.records[0].revisionEnvelope.payload.id = 'foreign';
    },
    (k) => {
      k.selectionDigest = '0'.repeat(64);
    },
  ]) {
    value = structuredClone(f.knowledge);
    change(value);
    await assert.rejects(() => tracer.trace(f.request, f.c));
  }
});

test('real owned Store INTEGRATION query refuses BUSINESS type without changing canonical rows', async (t) => {
  const f = sampleSet(),
    db = new DatabaseSync(':memory:');
  t.after(() => {
    if (db.isOpen) db.close();
  });
  let store;
  const preparer = new OfflinePublicationPreparer({
    lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, limits, c),
    readState: (c) => store.readState(limits, c),
  });
  store = initializeOfflinePublicationStore(db, 'w', limits, f.c, preparer.identity);
  const ready = await preparer.prepare(f.input, approve, f.c),
    attempt = store.begin(ready.handle, limits, f.c);
  store.publish(attempt.handle, limits, f.c);
  const history = () =>
      ['offline_attempts', 'offline_revisions', 'offline_receipts', 'offline_heads'].map((table) =>
        db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    before = history();
  const tracer = new OfflineBusinessFlowTracer({
    workspaceId: 'w',
    knowledgeQuery: async (request, c) =>
      store.readPublishedKnowledge(
        request.selectedPublishedRevisionRefs,
        { kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY', check() {} },
        limits,
        c,
      ),
  });
  const selected = ready.command.entries[0].record;
  await assert.rejects(
    () =>
      tracer.trace(
        {
          kind: 'BUSINESS',
          workspaceId: 'w',
          repositoryIds: ['r'],
          knowledgeRef: {
            itemId: selected.itemEnvelope.payload.id,
            revisionId: selected.revisionEnvelope.payload.id,
          },
          startStepKey: 'accept',
          direction: 'FORWARD',
          maxDepth: 10,
          maxSteps: 10,
          maxEdges: 10,
          maxResultBytes: 1000000,
        },
        f.c,
      ),
    { code: 'BUSINESS_TRACE_KIND_MISMATCH' },
  );
  assert.deepEqual(history(), before);
});
