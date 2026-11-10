// Pure owned structural data only; no observed Runtime, model quality or production provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  fixture as integrationFixture,
  control,
  rr,
  wr,
} from './helpers/captured-integration-fixture.mjs';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import {
  buildCapturedSemanticTestRequest,
  runCapturedSemanticTestDouble,
} from '../dist/semantic-test-invocation.js';

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
const digest = (v) => createHash('sha256').update(canonical(v)).digest('hex');
const limitation = 'SELF_OWNED_STRUCTURAL_FIXTURE_NOT_OBSERVED';
function account() {
  const seen = { invalid: false, calls: 0, tokens: 0, bytes: 0 };
  const check = () => {
    assert.equal(seen.invalid, false);
  };
  return {
    seen,
    checkpoint: check,
    own: check,
    visitItem: check,
    reserveBuffer(n) {
      check();
      seen.bytes += n;
      assert(seen.bytes <= 4000000);
    },
    reserveCall() {
      check();
      seen.calls++;
      assert(seen.calls <= 1);
    },
    chargeUsage(v) {
      check();
      seen.tokens += v.inputTokens + v.outputTokens;
      assert(seen.tokens <= 100);
    },
    invalidate() {
      seen.invalid = true;
    },
  };
}
function fixture(change = () => {}) {
  const f = integrationFixture(),
    raw = f.raw;
  const basis = raw.repositories[0].repoBasis;
  const coverage = { status: 'PARTIAL', limitations: [limitation], unverifiedRefs: [] };
  raw.coverage = structuredClone(coverage);
  raw.repositories[0].coverage = structuredClone(coverage);
  raw.workspaceCapture.coverage = structuredClone(coverage);
  const sourceRange = { sourceFileId: 'f', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 };
  const nodeRef = rr('CODE_NODE', 'owned-code'),
    entryRef = rr('ENTRY_POINT', 'owned-entry'),
    contextRef = rr('EXECUTION_CONTEXT', 'owned-context'),
    executionRef = rr('EXECUTION_NODE', 'owned-execution'),
    flowRef = rr('RUNTIME_FLOW', 'owned-flow');
  const contractRef = rr('CONTRACT', 'p'),
    serviceRef = wr('SERVICE', 's2');
  const base = (id) => ({
    id,
    factKey: id + '-fact',
    repositoryId: basis.repositoryId,
    revisionId: basis.revisionId,
    basis,
    sourceRange,
    supportRefs: [f.support],
    confidence: { score: 1, method: 'OWNED_STRUCTURAL_FIXTURE', reasons: ['NOT_OBSERVED_RUNTIME'] },
    resolution: 'EXACT',
  });
  const entry = {
    ...base(entryRef.entity.id),
    triggerKind: 'HTTP',
    ownerRef: nodeRef,
    contextKind: 'REQUEST',
    contractRef,
    taskRef: null,
  };
  raw.repositories[0].entities.push(
    {
      ref: nodeRef,
      valueSchemaRef: 'CanonicalNode@1',
      value: {
        id: nodeRef.entity.id,
        factKey: 'owned-code-fact',
        repositoryId: basis.repositoryId,
        revisionId: basis.revisionId,
        name: 'owned',
        qualifiedName: 'Owned.handle',
        kind: 'SYMBOL',
        symbolKind: 'METHOD',
        sourceRange,
        confidence: { score: 1, method: 'OWNED_FIXTURE', reasons: ['STRUCTURAL_ONLY'] },
      },
    },
    { ref: entryRef, valueSchemaRef: 'EntryPoint@1', value: entry },
    {
      ref: contextRef,
      valueSchemaRef: 'ExecutionContext@1',
      value: { ...base(contextRef.entity.id), kind: 'REQUEST', entryRef, parentContextRef: null },
    },
    {
      ref: executionRef,
      valueSchemaRef: 'ExecutionNode@1',
      value: { ...base(executionRef.entity.id), contextRef, kind: 'ENTRY', targetRef: entryRef },
    },
    {
      ref: flowRef,
      valueSchemaRef: 'RuntimeFlow@1',
      value: {
        ...base(flowRef.entity.id),
        entryRef,
        derivationVersion: 'owned-structural-fixture-v1',
        contexts: [contextRef],
        steps: [
          {
            stepKey: 'owned-step',
            ordinal: 0,
            contextRef,
            executionNodeRefs: [executionRef],
            incomingEdgeRefs: [],
            outgoingStepKeys: [],
            supportRefs: [f.support],
          },
        ],
        branches: [],
        boundaries: [],
        coverage,
      },
    },
  );
  raw.selection.selectedEntityRefs = [
    ...raw.repositories[0].entities.map((x) => x.ref),
    ...raw.workspaceCapture.entities.map((x) => x.ref),
  ];
  const refs = { nodeRef, entryRef, contextRef, executionRef, flowRef, contractRef, serviceRef };
  change({ raw, refs, entry });
  const c = control(),
    snapshot = createCompilationInputSnapshot(raw, c),
    a = account();
  const options = {
    taskKind: 'BUSINESS_FLOW_SYNTHESIS',
    promptRef: 'prompt:owned-business-chain-v1',
    modelPolicyRef: 'model:local-double-only',
    invocationBudget: { maxInputBytes: 200000, maxOutputBytes: 200000 },
  };
  return { ...f, raw, refs, snapshot, c, a, options };
}
const build = (f) => buildCapturedSemanticTestRequest(f.snapshot, f.options, f.c, f.a);
const unavailable = (e) => e.code === 'CAPABILITY_UNAVAILABLE';
function candidate(f) {
  return {
    schema: 'codeatlas.knowledge-candidate',
    version: 1,
    payload: {
      id: 'owned-business-output',
      type: 'BUSINESS_FLOW',
      scope: f.snapshot.scope,
      importance: 'normal',
      structuredContent: {
        kind: 'BUSINESS_FLOW',
        title: 'Owned declaration',
        goal: 'Test one explicit captured binding',
        participants: [f.refs.serviceRef],
        runtimeFlowRefs: [f.refs.flowRef],
        steps: [
          {
            stepKey: 'owned-step',
            action: 'Owned candidate statement, not observed execution',
            supportRefs: [f.support],
            nextStepKeys: [],
          },
        ],
        limitations: ['TEST_DOUBLE_NOT_QUALITY'],
      },
      supportRefs: [f.support],
      inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: f.snapshot.snapshotId },
      generationMethod: 'PARSER_GROUNDED',
      coverage: { status: 'PARTIAL', limitations: [limitation], unverifiedRefs: [] },
      unverifiedRelations: [],
      publicationState: 'CANDIDATE',
    },
  };
}
function double(f, output) {
  const identity = { providerId: 'owned-test', modelId: 'not-a-real-model', adapterVersion: 'v1' };
  const calls = [];
  return {
    calls,
    port: {
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
    },
  };
}

test('explicit selected flow produces only the independently expected exact captured entry/contract/service chain', () => {
  const f = fixture(),
    result = build(f);
  assert.deepEqual(result.authorizedContext.data, {
    snapshot: f.snapshot,
    businessFlowInputs: {
      schemaVersion: 1,
      capturedInputDigest: f.snapshot.inputDigest,
      flows: [
        {
          runtimeFlowRef: rr('RUNTIME_FLOW', 'owned-flow'),
          entryRef: rr('ENTRY_POINT', 'owned-entry'),
          contractRef: rr('CONTRACT', 'p'),
          serviceRef: wr('SERVICE', 's2'),
          bindingSupportRefs: [f.support],
        },
      ],
    },
  });
  assert.equal(result.inputDigest, digest(result.authorizedContext));
  assert.equal(result.authorizedContext.dataLabel, 'UNTRUSTED_DATA');
  assert(Object.isFrozen(result.authorizedContext.data.businessFlowInputs.flows[0]));
  assert.equal(
    Object.hasOwn(result.authorizedContext.data.businessFlowInputs.flows[0], 'steps'),
    false,
  );
});

test('binding assignment is taken from the exact captured contract, never guessed from repository', () => {
  const f = fixture(({ raw }) => {
    raw.workspaceCapture.contractBindings.bindings.find(
      (x) => x.contractRef.entity.id === 'p',
    ).serviceRef = wr('SERVICE', 's1');
  });
  const result = build(f);
  assert.deepEqual(
    result.authorizedContext.data.businessFlowInputs.flows[0].serviceRef,
    wr('SERVICE', 's1'),
  );
});

test('zero selected flows, missing entry contract and missing exact binding refuse; Capability stays closed', () => {
  for (const change of [
    ({ raw }) => {
      raw.selection.selectedEntityRefs = raw.selection.selectedEntityRefs.filter(
        (r) => r.entity.kind !== 'RUNTIME_FLOW',
      );
      raw.repositories[0].entities = raw.repositories[0].entities.filter(
        (e) => e.valueSchemaRef !== 'RuntimeFlow@1',
      );
    },
    ({ entry }) => {
      entry.contractRef = null;
    },
    ({ raw }) => {
      raw.workspaceCapture.contractBindings.bindings =
        raw.workspaceCapture.contractBindings.bindings.filter(
          (x) => x.contractRef.entity.id !== 'p',
        );
    },
  ]) {
    const f = fixture(change);
    assert.throws(() => build(f), unavailable);
    assert.equal(f.a.seen.calls, 0);
  }
  const f = fixture();
  f.options.taskKind = 'CAPABILITY_SYNTHESIS';
  assert.throws(() => build(f), unavailable);
});

test('foreign revision and duplicate exact bindings fail existing capture validation before model invocation', () => {
  for (const change of [
    ({ entry }) => {
      entry.contractRef.entity.revisionId = 'wrong-revision';
    },
    ({ raw }) => {
      raw.workspaceCapture.contractBindings.bindings.find(
        (x) => x.contractRef.entity.id === 'p',
      ).serviceRef.entity.revisionId = 'wrong-revision';
    },
    ({ raw }) => {
      raw.workspaceCapture.contractBindings.bindings.push(
        structuredClone(
          raw.workspaceCapture.contractBindings.bindings.find(
            (x) => x.contractRef.entity.id === 'p',
          ),
        ),
      );
    },
  ])
    assert.throws(() => fixture(change));
});

test('same captured invocation returns only TEST_DOUBLE candidate with inherited partial coverage and exact digest', async () => {
  const f = fixture(),
    output = candidate(f),
    model = double(f, output);
  const result = await runCapturedSemanticTestDouble(f.snapshot, f.options, model.port, f.c, f.a);
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].inputDigest, digest(model.calls[0].authorizedContext));
  assert.deepEqual(result.structuredOutput, output);
  assert.equal(result.capturedInputDigest, f.snapshot.inputDigest);
  assert.deepEqual(result.capturedCoverage, f.snapshot.coverage);
  assert.equal(result.evidenceKind, 'TEST_DOUBLE');
  assert.equal(result.quality, 'NOT_EVALUABLE');
  assert.equal(result.contextAuthorization, 'NOT_ESTABLISHED');
  assert.equal(result.publicationEffect, 'NOT_ATTEMPTED');
});

test('test-double coverage inflation, lost limitation and out-of-snapshot RuntimeFlow references refuse', async () => {
  for (const change of [
    (p) => {
      p.coverage = { status: 'COMPLETE', limitations: [], unverifiedRefs: [] };
    },
    (p) => {
      p.coverage.limitations = [];
    },
    (p) => {
      p.structuredContent.runtimeFlowRefs[0].entity.revisionId = 'foreign-revision';
    },
  ]) {
    const f = fixture(),
      output = candidate(f);
    change(output.payload);
    const model = double(f, output);
    await assert.rejects(
      runCapturedSemanticTestDouble(f.snapshot, f.options, model.port, f.c, f.a),
      (e) => e.code === 'MODEL_OUTPUT_INVALID',
    );
    assert.equal(model.calls.length, 1);
  }
});
