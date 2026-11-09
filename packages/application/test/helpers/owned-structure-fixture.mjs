import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  historyFixture,
  historyLimits,
  prefixPlan,
} from '../../../storage/test/helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../../../storage/dist/migrations/runner.js';
import { RuntimeFactStore } from '../../../storage/dist/runtime/runtime-fact-store.js';
import { canonicalRuntimeJson } from '../../../ir/dist/index.js';
export const structureLimits = {
  maxDepth: 10,
  maxNodes: 100,
  maxEdges: 100,
  maxMetadataRows: 1000000,
  maxOutputBytes: 1000000,
};
export const structureControl = (patch = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...patch,
});
async function expose(t, f, repositoryId, version, callback, affected) {
  if (affected)
    f.db.prepare('DELETE FROM active_history_pointer WHERE repository_id=?').run(repositoryId); // Owned last-good characterization.
  const store = new RuntimeFactStore(f.db, repositoryId),
    snapshot =
      version === 2 ? store.traceRuntimeV2(historyLimits) : store.traceRuntime(historyLimits);
  assert.notEqual(snapshot.status, 'NOT_AVAILABLE');
  const candidate = snapshot.candidate,
    revisionId = snapshot.identity.codeBasis.revisionId,
    activationId = snapshot.activationId,
    executionNodeId = candidate.facts.payload.nodes[0].id,
    flow = candidate.facts.payload.flows[0],
    flowId = flow.id,
    stepKey = flow.steps[0].stepKey,
    seen = { open: 0, read: 0, close: 0, budgets: [] };
  const open = async (budget, control) => {
    seen.open++;
    seen.budgets.push({ ...budget });
    const db = f.reopen(true),
      reader = new RuntimeFactStore(db, repositoryId);
    return {
      read() {
        seen.read++;
        const bounds = {
          ...historyLimits,
          maxRows: budget.maxMetadataRows,
          maxItems: control.maxItems,
          maxDepth: control.maxDepth,
        };
        return version === 2 ? reader.traceRuntimeV2(bounds) : reader.traceRuntime(bounds);
      },
      close() {
        if (db.isOpen) {
          db.close();
          seen.close++;
        }
      },
    };
  };
  const request = (kind = 'EXECUTION', patch = {}) => ({
    kind,
    repositoryId,
    expectedActivationId: activationId,
    expectedRevisionId: revisionId,
    startRef:
      kind === 'EXECUTION'
        ? { kind: 'EXECUTION_NODE', id: executionNodeId }
        : { kind: 'RUNTIME_FLOW', id: flowId, stepKey },
    direction: 'FORWARD',
    budget: { ...structureLimits, ...patch },
  });
  return callback({
    ...f,
    repositoryId,
    revisionId,
    activationId,
    executionNodeId,
    flowId,
    stepKey,
    open,
    snapshot,
    candidate,
    seen,
    request,
  });
}
export async function withOwnedStructureFixture(
  t,
  callback,
  { version = 1, affected = false } = {},
) {
  if (version === 2) {
    const { withFrozenStage, workflowRequest } =
      await import('../../../runtime/test/helpers/framework-surface-stage.mjs');
    const { composeFrozenFrameworkRuntimeV2 } =
      await import('../../../runtime/dist/framework-runtime-composition.js');
    const { MixedAnalysisStore } =
      await import('../../../storage/dist/analysis/mixed-analysis-store.js');
    return withFrozenStage(t, async (x) => {
      await composeFrozenFrameworkRuntimeV2({
        workspaceId: 'workspace:owned',
        repositoryId: x.repositoryId,
        stage: x.stage,
        lease: x.frozen.lease,
        store: new MixedAnalysisStore(x.f.db),
        expectedOldRuntime: null,
        limits: historyLimits,
        routes: [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
      }).publish(workflowRequest(x.repositoryId, 'INDEX'));
      return expose(t, x.f, x.repositoryId, 2, callback, affected);
    });
  }
  assert.equal(version, 1);
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId),
    capture = store.readRuntimeBasis(historyLimits),
    basis = capture.identity.codeBasis;
  const source = f.expected.targetInventory[0],
    owner = f.expected.history.state.nodes[0],
    ref = (kind, id) => ({
      scope: 'REPOSITORY',
      repositoryId: basis.repositoryId,
      entity: { kind, id, revisionId: basis.revisionId },
    }),
    support = (kind, value) => ({
      basis,
      entity: ref(kind, value.id).entity,
      valueDigest: createHash('sha256')
        .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(value))
        .digest('hex'),
    }),
    supports = [support('SOURCE_FILE', source), support('CODE_NODE', owner)],
    coverage = { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
    base = (id) => ({
      id,
      factKey: id + '-key',
      repositoryId: basis.repositoryId,
      revisionId: basis.revisionId,
      basis,
      sourceRange: owner.sourceRange,
      supportRefs: supports,
      confidence: {
        score: 0.5,
        method: 'runtime-execution-declaration-v1',
        reasons: ['OWNED_DECLARATION'],
      },
      resolution: 'HEURISTIC',
    }),
    contextRef = ref('EXECUTION_CONTEXT', 'context:owned'),
    entryRef = ref('ENTRY_POINT', 'entry:owned');
  const nodes = ['one', 'two', 'three'].map((name, i) => ({
    ...base('node:' + name),
    contextRef,
    kind: i === 0 ? 'ENTRY' : 'CODE',
    targetRef: i === 0 ? entryRef : ref('CODE_NODE', owner.id),
  }));
  const edge = (id, from, to) => ({
    ...base(id),
    contextRef,
    sourceRef: ref('EXECUTION_NODE', 'node:' + from),
    target: to
      ? { state: 'RESOLVED', target: ref('EXECUTION_NODE', 'node:' + to) }
      : {
          state: 'NON_RESOLVED',
          resolution: 'AMBIGUOUS',
          hint: 'owned unresolved declaration',
          candidates: [ref('EXECUTION_NODE', 'node:three')],
        },
    transitionKind: 'CALL',
    guard: null,
    boundaryRef: null,
  });
  const edges = [
    edge('edge:01', 'one', 'two'),
    edge('edge:02', 'one', 'three'),
    edge('edge:03', 'two', 'one'),
    edge('edge:04', 'one', null),
  ];
  const steps = nodes.map((node, i) => ({
    stepKey: 'step:' + ['one', 'two', 'three'][i],
    ordinal: i,
    contextRef,
    executionNodeRefs: [ref('EXECUTION_NODE', node.id)],
    incomingEdgeRefs: edges
      .filter((e) => e.target.state === 'RESOLVED' && e.target.target.entity.id === node.id)
      .map((e) => ref('EXECUTION_EDGE', e.id)),
    outgoingStepKeys: i === 0 ? ['step:two', 'step:three'] : i === 1 ? ['step:one'] : [],
    supportRefs: supports,
  }));
  const candidate = {
    facts: {
      schema: 'codeatlas.runtime-fact-set',
      version: 1,
      payload: {
        basis,
        externalRefs: [ref('SOURCE_FILE', source.id), ref('CODE_NODE', owner.id)],
        supportInventory: supports,
        entryPoints: [
          {
            ...base('entry:owned'),
            triggerKind: 'MANUAL',
            ownerRef: ref('CODE_NODE', owner.id),
            contextKind: 'REQUEST',
            contractRef: null,
            taskRef: null,
          },
        ],
        tasks: [],
        dataResources: [],
        triggers: [],
        contracts: [],
        contexts: [{ ...base('context:owned'), kind: 'REQUEST', entryRef, parentContextRef: null }],
        nodes,
        edges,
        flows: [
          {
            ...base('flow:owned'),
            entryRef,
            derivationVersion: 'owned-flow-v1',
            contexts: [contextRef],
            steps,
            branches: [
              {
                fromStepKey: 'step:one',
                toStepKeys: ['step:two', 'step:three'],
                supportRefs: supports,
              },
            ],
            boundaries: [],
            coverage,
          },
        ],
      },
    },
    bindings: {
      schema: 'codeatlas.framework-binding-set',
      version: 1,
      payload: { basis, externalRefs: [], supportInventory: [], bindings: [] },
    },
    coverage,
    termination: 'COMPLETE',
  };
  const out = store.applyRuntimeBatch({ expected: capture.identity, candidate }, historyLimits);
  assert.equal(out.status, 'COMMITTED');
  return expose(t, f, basis.repositoryId, 1, callback, affected);
}
