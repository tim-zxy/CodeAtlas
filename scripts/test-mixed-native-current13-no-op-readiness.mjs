// Component readiness only: Source NO_OP is not Runtime publication or skip authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  withFrozenStage,
  workflowRequest,
} from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
import {
  captureRuntimeActivationContext,
  releaseActivationContext,
  recheckActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedNoOpBasis,
} from '../packages/storage/dist/analysis/mixed-analysis-stage.js';
import {
  MixedAnalysisStore,
  readMixedAnalysisSettlement,
} from '../packages/storage/dist/analysis/mixed-analysis-store.js';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { createFrameworkSurfaceMixedAnalysisRules } from '../packages/runtime/dist/mixed-analysis.js';
import {
  composeFrozenFrameworkRuntimeV2,
  prepareFrameworkRuntimeV2,
} from '../packages/runtime/dist/framework-runtime-composition.js';

const routes = [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }];
const contracts = [
  {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  },
];
// This is exactly the fixed candidate shape persisted by the existing Application workflow.
const candidate = ({ facts, bindings, coverage, termination, derivation }) => ({
  facts,
  bindings,
  coverage,
  termination,
  derivation,
});

async function withCurrent(t, run) {
  await withFrozenStage(t, async ({ f, stage, capture, frozen, repositoryId }) => {
    const runtime = new RuntimeFactStore(f.db, repositoryId);
    const before = runtime.readRuntimeBasis(historyLimits);
    const store = new MixedAnalysisStore(f.db);
    const outcome = await composeFrozenFrameworkRuntimeV2({
      workspaceId: 'workspace:owned',
      repositoryId,
      stage,
      lease: frozen.lease,
      store,
      expectedOldRuntime: before.runtimeActivationId,
      limits: historyLimits,
      routes,
    }).publish(workflowRequest(repositoryId, 'INDEX'));
    assert.equal(readMixedAnalysisSettlement(store).status, 'COMMITTED');
    stage.close();
    releaseActivationContext(f.db, capture.handle);
    const next = captureRuntimeActivationContext(f.db, repositoryId, historyLimits);
    const delta = new MixedAnalysisStage(
      f.db,
      next.handle,
      'DELTA',
      historyLimits,
      createFrameworkSurfaceMixedAnalysisRules(),
    );
    try {
      const noOp = readMixedNoOpBasis(delta, contracts);
      assert.ok(noOp);
      const trace = runtime.traceRuntimeV2(historyLimits);
      assert.equal(trace.status, 'CURRENT');
      assert.equal(trace.activationId, outcome.runtimeActivationId);
      const current = runtime.readRuntimeBasis(historyLimits);
      assert.equal(current.status, 'AVAILABLE');
      assert.equal(current.identity.runtimeActivationId, trace.activationId);
      assert.deepEqual(current.identity.codeBasis, noOp.basis);
      assert.deepEqual(current.identity.codeBasis, trace.identity.codeBasis);
      assert.equal(current.identity.syntaxActivationId, trace.identity.syntaxActivationId);
      assert.equal(current.identity.syntaxMembershipDigest, trace.identity.syntaxMembershipDigest);
      const inputs = {
        ...runtime.readFrameworkInputsV2(current.identity, historyLimits),
        syntaxMembershipDigest: current.identity.syntaxMembershipDigest,
      };
      assert.deepEqual(inputs.basis, noOp.basis);
      const control = () => workflowRequest(repositoryId, 'INDEX').control;
      await run({ runtime, noOp, trace, current, inputs, control, delta });
      // These read-only checks are necessary components, never a final Source verification.
      recheckActivationContext(f.db, next.handle, historyLimits);
      assert.deepEqual(runtime.traceRuntimeV2(historyLimits), trace);
    } finally {
      delta.close();
      releaseActivationContext(f.db, next.handle);
    }
  });
}

test('Source/contracts NO_OP plus CURRENT Runtime can rederive equal stored output only as a prerequisite', async (t) => {
  await withCurrent(t, async ({ runtime, trace, current, inputs, control }) => {
    const derived = await prepareFrameworkRuntimeV2(inputs, routes, control());
    assert.equal(derived.coverageScope, 'LOCAL_DECLARED_RUNTIME');
    assert.equal(derived.termination, 'COMPLETE');
    assert.equal(derived.coverage.status, 'COMPLETE');
    assert.deepEqual(candidate(derived), trace.candidate);
    assert.equal(derived.derivation.syntaxContract, 'SYNTAX_BINDING_V4');
    assert.ok(derived.derivation.sitePlan.entries.length > 0);
    assert.throws(
      () =>
        runtime.readFrameworkInputsV2(
          {
            ...current.identity,
            syntaxMembershipDigest: 'f'.repeat(64),
          },
          historyLimits,
        ),
      /RUNTIME_INPUT_CHANGED/,
    );
    t.diagnostic(
      'EQUAL_CURRENT_OUTPUT_IS_A_PREREQUISITE_NOT_NO_OP_AUTHORITY; final Source/control/readset/cleanup checks remain',
    );
  });
});

test('unchanged Source/contracts NO_OP does not cover changed routes: empty routes really fail Runtime validation', async (t) => {
  await withCurrent(t, async ({ trace, inputs, control, delta, noOp }) => {
    await assert.rejects(
      prepareFrameworkRuntimeV2(inputs, [], control()),
      (error) => error.code === 'IR_VALIDATION_FAILED',
    );
    assert.deepEqual(readMixedNoOpBasis(delta, contracts), noOp);
    assert.equal(trace.candidate.coverage.status, 'COMPLETE');
    t.diagnostic(
      'EMPTY_ROUTES_FAIL_REAL_RUNTIME_VALIDATION_WHILE_SOURCE_NO_OP_STILL_MATCHES; no candidate exists to compare',
    );
  });
});

test('valid changed config can be output-equivalent without proving persisted original config identity', async (t) => {
  await withCurrent(t, async ({ trace, inputs, control, delta, noOp }) => {
    const changedRoutes = [
      { ...routes[0], configuration: { readinessMarker: 'different-valid-json' } },
    ];
    assert.notDeepEqual(changedRoutes, routes);
    const changed = await prepareFrameworkRuntimeV2(inputs, changedRoutes, control());
    assert.deepEqual(readMixedNoOpBasis(delta, contracts), noOp);
    // Current FastAPI compiler ignores this valid JSON field. Do not invent a config effect.
    assert.deepEqual(candidate(changed), trace.candidate);
    assert.deepEqual(Object.keys(trace.candidate.derivation).sort(), [
      'coverageVersion',
      'graphPolicy',
      'rulesVersion',
      'sitePlan',
      'sitePlanDigest',
      'syntaxContract',
    ]);
    assert.equal(Object.hasOwn(trace.candidate.derivation, 'routes'), false);
    assert.equal(Object.hasOwn(trace.candidate.derivation, 'configuration'), false);
    t.diagnostic(
      'CHANGED_CONFIG_OUTPUT_EQUAL_ONLY; raw routes/config identity is not persisted by this candidate contract',
    );
  });
});
