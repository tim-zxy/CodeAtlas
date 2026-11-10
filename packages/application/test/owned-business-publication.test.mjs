import test from 'node:test';
import assert from 'node:assert/strict';
import { withOwnedBusinessPublication } from './helpers/owned-business-publication-fixture.mjs';
import { OfflineBusinessFlowTracer } from '../dist/offline-business-trace.js';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';

test('owned BUSINESS is published through application/store and read by the actual tracer', async (t) => {
  await withOwnedBusinessPublication(t, async (f) => {
    const before = f.history();
    const tracer = new OfflineBusinessFlowTracer({
      workspaceId: f.workspaceId,
      knowledgeQuery: f.readKnowledge,
    });
    const result = await tracer.trace(f.traceRequest(), f.control());
    assert.deepEqual(
      result.steps.map((x) => x.stepKey),
      ['step:one', 'step:three', 'step:two'],
    );
    assert.equal(result.productionQuery, 'NOT_AUTHORIZED');
    assert.equal(result.quality, 'NOT_EVALUABLE');
    assert.equal(f.publication.status, 'COMMITTED');
    assert.equal(
      f.store.readPublishedKnowledge([f.knowledgeRef], f.permissions, f.limits, f.control())
        .records[0].revisionEnvelope.payload.structuredContent.kind,
      'BUSINESS_FLOW',
    );
    assert.deepEqual(f.history(), before);
  });
});

test('owned BUSINESS missing capture support and denied reads refuse without changing published rows', async (t) => {
  await withOwnedBusinessPublication(t, async (f) => {
    const bad = structuredClone(f.rawSnapshotInput);
    bad.repositories[0].supports = [];
    assert.throws(() => createCompilationInputSnapshot(bad, f.control()));
    const before = f.history();
    f.setDenied(true);
    const tracer = new OfflineBusinessFlowTracer({
      workspaceId: f.workspaceId,
      knowledgeQuery: f.readKnowledge,
    });
    await assert.rejects(tracer.trace(f.traceRequest(), f.control()));
    assert.deepEqual(f.history(), before);
  });
});
