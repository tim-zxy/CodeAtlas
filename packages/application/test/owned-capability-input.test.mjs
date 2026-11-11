import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture, control, rr, canonical } from './helpers/captured-integration-fixture.mjs';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import * as semantic from '../dist/semantic-test-invocation.js';
const { buildCapturedSemanticTestRequest, runOwnedCapabilityTestDouble } = semantic;
import { evaluateCandidateRecord } from '../dist/evaluation-record.js';
import { OfflinePublicationPreparer } from '../dist/offline-publication.js';
import { initializeOfflinePublicationStore } from '../../storage/dist/knowledge/offline-publication-store.js';
import { approve, limits } from '../../storage/test/helpers/offline-publication-fixture.mjs';

const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');
function account() {
  const seen = { invalid: 0, calls: 0, bytes: 0 };
  const checkpoint = () => assert.equal(seen.invalid, 0);
  return {
    seen,
    checkpoint,
    own: checkpoint,
    visitItem: checkpoint,
    reserveBuffer(n) {
      checkpoint();
      seen.bytes += n;
      assert(seen.bytes < 30000000);
    },
    reserveCall() {
      checkpoint();
      assert.equal(++seen.calls, 1);
    },
    chargeUsage() {
      checkpoint();
    },
    invalidate() {
      seen.invalid++;
    },
  };
}
async function owned(t) {
  const f = fixture(),
    c = control(),
    nodeRef = rr('CODE_NODE', 'owned-code');
  f.raw.repositories[0].entities.push({
    ref: nodeRef,
    valueSchemaRef: 'CanonicalNode@1',
    value: {
      id: 'owned-code',
      factKey: 'owned-code-fact',
      repositoryId: 'r',
      revisionId: 'v',
      name: 'owned',
      qualifiedName: 'Owned.handle',
      kind: 'SYMBOL',
      symbolKind: 'METHOD',
      sourceRange: { sourceFileId: 'f', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
      confidence: { score: 1, method: 'OWNED_FIXTURE', reasons: ['STRUCTURAL_ONLY'] },
    },
  });
  f.raw.selection.selectedEntityRefs.push(nodeRef);
  const snapshot = createCompilationInputSnapshot(f.raw, c),
    a = account();
  const baseOptions = {
    taskKind: 'COMPONENT_SUMMARY',
    promptRef: 'prompt:owned',
    modelPolicyRef: 'policy:double',
    invocationBudget: { maxInputBytes: 300000, maxOutputBytes: 100000 },
  };
  const base = buildCapturedSemanticTestRequest(snapshot, baseOptions, c, account());
  const candidate = {
    schema: 'codeatlas.knowledge-candidate',
    version: 1,
    payload: {
      id: 'owned-component-draft',
      type: 'COMPONENT',
      scope: snapshot.scope,
      importance: 'normal',
      structuredContent: {
        kind: 'COMPONENT',
        title: 'Owned component',
        summary: 'Owned declaration',
        implementationRefs: [nodeRef],
        entryPointRefs: [],
        responsibilityClaims: [],
        relationships: [],
      },
      supportRefs: [f.support],
      inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: snapshot.snapshotId },
      generationMethod: 'PARSER_GROUNDED',
      coverage: {
        status: 'PARTIAL',
        limitations: ['OWNED_COMPONENT_NOT_QUALITY'],
        unverifiedRefs: [],
      },
      unverifiedRelations: [],
      publicationState: 'CANDIDATE',
    },
  };
  const stateBinding = {
    inputSnapshotRef: candidate.payload.inputSnapshotRef,
    claims: [
      {
        schema: 'codeatlas.claim',
        version: 1,
        payload: {
          id: 'owned-state',
          subject: nodeRef,
          predicate: 'declares-current',
          value: { kind: 'LITERAL', value: 'owned' },
          scope: snapshot.scope,
          stateIntent: 'CURRENT',
          claimKind: 'DECLARED',
          evidenceRefs: [f.support],
          confidence: { score: 1, method: 'TEST', reasons: ['NOT_AUTHORITY'] },
          authority: 'DECLARED',
        },
      },
    ],
  };
  const referenceContext = {
    ...base.authorizedContext.referenceContext,
    availableEntities: base.authorizedContext.referenceContext.availableEntities.filter(
      (ref) => ref.entity.kind !== 'REPOSITORY',
    ),
  };
  const subject = { candidateEnvelope: candidate, referenceContext, stateBinding };
  const input = {
    workspaceId: 'w',
    runId: 'owned-run',
    subject: { issuerNamespace: 'owned-test', subjectId: 'capability' },
    requestKey: 'owned-component',
    snapshot,
    candidates: [candidate],
    subjects: [subject],
    evaluation: evaluateCandidateRecord(
      { evaluationId: 'owned-eval', runId: 'owned-run', snapshot, candidates: [candidate] },
      c,
    ),
  };
  const db = new DatabaseSync(':memory:');
  t.after(() => {
    if (db.isOpen) db.close();
  });
  let store;
  const preparer = new OfflinePublicationPreparer({
    lookup: (s, k, d, cc) => store.lookup(s, k, d, limits, cc),
    readState: (cc) => store.readState(limits, cc),
  });
  store = initializeOfflinePublicationStore(db, 'w', limits, c, preparer.identity);
  const ready = await preparer.prepare(input, approve, c);
  const attempt = store.begin(ready.handle, limits, c);
  assert.equal(store.publish(attempt.handle, limits, c).status, 'COMMITTED');
  const row = ready.command.entries[0].record,
    selected = { itemId: row.itemEnvelope.payload.id, revisionId: row.revisionEnvelope.payload.id };
  const componentRef = {
    scope: 'WORKSPACE',
    workspaceId: 'w',
    entity: { kind: 'COMPONENT', id: selected.itemId, revisionId: selected.revisionId },
  };
  const options = { ...baseOptions, selectedComponents: [selected] };
  delete options.taskKind;
  const calls = [],
    reads = [];
  const permissions = {
    kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY',
    check(manifest) {
      assert(manifest.fields.includes('SNAPSHOT_INPUT_DIGEST'));
    },
  };
  const read = (refs, cc) => {
    reads.push(refs);
    return store.readPublishedCapabilityInputs(refs, permissions, limits, cc);
  };
  const output = structuredClone(candidate);
  output.payload.id = 'capability-draft';
  output.payload.type = 'CAPABILITY';
  output.payload.structuredContent = {
    kind: 'CAPABILITY',
    title: 'Owned capability',
    summary: 'A test declaration',
    componentRefs: [componentRef],
    entryPointRefs: [],
    runtimeFlowRefs: [],
    supportedClaimRefs: [],
  };
  const identity = { providerId: 'owned', modelId: 'double', adapterVersion: 'v1' };
  const port = {
    evidenceKind: 'TEST_DOUBLE',
    identity,
    capabilities: { outputMode: 'NATIVE_JSON_SCHEMA' },
    async generate(request) {
      calls.push(request);
      return {
        structuredOutput: output,
        identity,
        usage: { inputTokens: 1, outputTokens: 2 },
        finishReason: 'STOP',
        outputDigest: digest(output),
        warnings: [],
      };
    },
  };
  return {
    ...f,
    snapshot,
    options,
    c,
    a,
    read,
    reads,
    calls,
    output,
    port,
    componentRef,
    store,
    db,
    selected,
  };
}
const run = (f) => runOwnedCapabilityTestDouble(f.snapshot, f.options, f.read, f.port, f.c, f.a);

test('actual owned Component publication and exact Store read reach Capability double with source and digest binding', async (t) => {
  const f = await owned(t),
    before = f.db.prepare('SELECT count(*) n FROM offline_revisions').get().n;
  const result = await run(f),
    request = f.calls[0],
    binding = request.authorizedContext.data.capabilityInputs;
  assert.equal(result.evidenceKind, 'TEST_DOUBLE');
  assert.equal(result.quality, 'NOT_EVALUABLE');
  assert.equal(result.contextAuthorization, 'NOT_ESTABLISHED');
  assert.equal(result.publicationEffect, 'NOT_ATTEMPTED');
  assert.equal(binding.capturedInputDigest, f.snapshot.inputDigest);
  assert.equal(binding.components[0].provenance.snapshotId, f.snapshot.snapshotId);
  assert.deepEqual(binding.components[0].revisionEnvelope.payload.supportRefs, [f.support]);
  assert.deepEqual(request.authorizedContext.data.snapshot, f.snapshot);
  assert.equal(request.inputDigest, digest(request.authorizedContext));
  assert(
    request.authorizedContext.referenceContext.availableEntities.some(
      (r) => canonical(r) === canonical(f.componentRef),
    ),
  );
  assert.deepEqual(result.capturedCoverage, f.output.payload.coverage);
  assert.equal(f.db.prepare('SELECT count(*) n FROM offline_revisions').get().n, before);
  assert.equal(f.a.seen.calls, 1);
});

test('different snapshot or revision set, historical head, wrong type and missing support all refuse before generation', async (t) => {
  for (const mutate of [
    (x) => {
      x.knowledge.records[0].provenance.snapshotId = 'other';
    },
    (x) => {
      x.knowledge.records[0].provenance.revisionSetId = 'other';
    },
    (x) => {
      x.knowledge.records[0].isCurrentHead = false;
      x.knowledge.records[0].currentHeadRevisionId = 'other';
    },
    (x) => {
      x.knowledge.records[0].itemEnvelope.payload.type = 'CAPABILITY';
    },
    (x) => {
      x.knowledge.records[0].revisionEnvelope.payload.supportRefs[0].valueDigest = 'f'.repeat(64);
    },
    (x) => {
      x.knowledge.workspaceId = 'other';
    },
    (x) => {
      x.sourceInputs[0].capturedInputDigest = 'f'.repeat(64);
    },
  ]) {
    const f = await owned(t),
      original = f.read;
    f.read = (...args) => {
      const x = structuredClone(original(...args));
      mutate(x);
      return x;
    };
    await assert.rejects(run(f));
    assert.equal(f.calls.length, 0);
    assert.equal(f.a.seen.invalid, 1);
  }
});

test('selection is explicit, unique and exact, with no fake Component from caller allowlists', async (t) => {
  for (const selection of [[], [{ itemId: 'missing', revisionId: 'missing' }], null]) {
    const f = await owned(t);
    f.options.selectedComponents = selection;
    await assert.rejects(run(f));
    assert.equal(f.calls.length, 0);
  }
  const f = await owned(t);
  f.options.selectedComponents.push({ ...f.selected });
  await assert.rejects(run(f));
  assert.equal(f.reads.length, 0);
});

test('same snapshot ID and revision set cannot conceal different captured bytes', async (t) => {
  const f = await owned(t);
  f.raw.coverage = { status: 'PARTIAL', limitations: ['CHANGED_CAPTURE'], unverifiedRefs: [] };
  f.snapshot = createCompilationInputSnapshot(f.raw, f.c);
  await assert.rejects(run(f), (e) => e.code === 'CAPABILITY_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
});

test('knowledge validation work exhaustion remains a budget refusal', async (t) => {
  const f = await owned(t);
  f.c = control({ maxItems: 5000 });
  await assert.rejects(run(f), (e) => e.code === 'BUDGET_EXCEEDED');
  assert.equal(f.calls.length, 0);
});

test('trusted read Knowledge control stops retain cancellation, deadline and budget categories', async (t) => {
  const { KnowledgeControlStop } = await import('../../knowledge/dist/comparison-contract.js');
  for (const [stop, expected] of [
    ['CONTROL_CANCELLED', 'CANCELLED'],
    ['CONTROL_DEADLINE', 'DEADLINE'],
    ['CONTROL_BUDGET', 'BUDGET_EXCEEDED'],
    ['CONTROL_DEPTH', 'BUDGET_EXCEEDED'],
  ]) {
    const f = await owned(t);
    f.read = () => {
      throw new KnowledgeControlStop(stop);
    };
    await assert.rejects(run(f), (e) => e.code === expected);
    assert.equal(f.calls.length, 0);
    assert.equal(f.a.seen.invalid, 1);
  }
});

test('read denial and asynchronous read uncertainty are preserved, with no model call or retry', async (t) => {
  const f = await owned(t);
  let count = 0;
  f.read = () => {
    count++;
    throw Object.assign(Error('denied'), { code: 'KNOWLEDGE_PERMISSION_DENIED' });
  };
  await assert.rejects(run(f));
  assert.equal(count, 1);
  assert.equal(f.calls.length, 0);
  const g = await owned(t);
  g.read = () => Promise.resolve({});
  await assert.rejects(run(g), (e) => e.cleanupState === 'UNKNOWN');
  assert.equal(g.calls.length, 0);
});

test('read callback cannot replace original selection, snapshot or invocation control', async (t) => {
  const f = await owned(t),
    original = f.read,
    snapshot = structuredClone(f.snapshot);
  f.snapshot = structuredClone(f.snapshot);
  f.read = (...args) => {
    f.snapshot.snapshotId = 'replacement';
    f.options.selectedComponents = [];
    f.c.deadlineEpochMs = 0;
    f.c.signal = new AbortController().signal;
    return original(...args);
  };
  await run(f);
  assert.deepEqual(f.calls[0].authorizedContext.data.snapshot, snapshot);
});

test('Component limitations cannot disappear and unselected or cyclic output references refuse', async (t) => {
  for (const mutate of [
    (f) => {
      f.output.payload.coverage = { status: 'COMPLETE', limitations: [], unverifiedRefs: [] };
    },
    (f) => {
      f.output.payload.structuredContent.componentRefs[0].entity.id = 'capability-draft';
    },
  ]) {
    const f = await owned(t);
    mutate(f);
    await assert.rejects(run(f), (e) => e.code === 'MODEL_OUTPUT_INVALID');
    assert.equal(f.a.seen.calls, 1);
    assert.equal(f.a.seen.invalid, 1);
  }
});

test('cancel and byte budget stop before reading, without a new allowance or model attempt', async (t) => {
  const f = await owned(t),
    abort = new AbortController();
  abort.abort();
  f.c = control({ signal: abort.signal });
  await assert.rejects(run(f), (e) => e.code === 'CANCELLED');
  assert.equal(f.reads.length, 0);
  const g = await owned(t);
  g.options.invocationBudget.maxInputBytes = 1;
  await assert.rejects(run(g), (e) => e.code === 'MODEL_INPUT_TOO_LARGE');
  assert.equal(g.reads.length, 0);
});
