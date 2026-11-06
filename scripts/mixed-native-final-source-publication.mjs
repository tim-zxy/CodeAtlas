import { isDeepStrictEqual } from 'node:util';
// Private offline composition. No live runner or qualification authority.
import { prepareBudgetedMixedSourceOperation } from '../packages/runtime/dist/mixed-source-preparation.js';
import { prepareFrameworkRuntimeV2 } from '../packages/runtime/dist/framework-runtime-composition.js';
import { refreshRuntimeFactsV2 } from '../packages/application/dist/refresh-runtime-facts.js';
import {
  readMixedNoOpBasis,
  readFrozenFrameworkInputsV2,
} from '../packages/storage/dist/analysis/mixed-analysis-stage.js';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { recheckActivationContext } from '../packages/storage/dist/analysis/activation-history.js';

// Own the real Source preparation; a caller-returned verification callback is never authority.
export async function prepareMixedNativeFinalSourcePublication(input, owner, qualification) {
  const fixed = {
    ...input,
    repository: structuredClone(input.repository),
    request: structuredClone(input.request),
    policy: structuredClone(input.policy),
    limits: structuredClone(input.limits),
    operationBudget: structuredClone(input.operationBudget),
    control: { ...input.control },
  };
  const source = await prepareBudgetedMixedSourceOperation({
    ...fixed,
    qualification: {
      executablePath: qualification.executablePath,
      environment: qualification.environment,
      createLifecycle() {
        return owner.take('GIT');
      },
    },
  });
  let published = false;
  return Object.freeze({
    source,
    noOp({ stage, contracts, routes, capture, request }) {
      const runtime = new RuntimeFactStore(fixed.database, fixed.repository.id);
      let prior, current, trace, inputs;
      const need = (value) => {
        if (!value) throw Error('MIXED_NO_OP_INPUT_CHANGED');
      };
      const settled = () => {
        source.account.checkpoint();
        recheckActivationContext(fixed.database, capture, fixed.limits);
        const state = owner.status();
        need(state.status === 'OFFLINE_IDLE' && state.remaining === 0);
      };
      return refreshRuntimeFactsV2(
        {
          ...request,
          workspaceId: fixed.policy.scope.workspaceId,
          repositoryId: fixed.repository.id,
        },
        {
          capture() {
            if (published) throw Error('MIXED_FINAL_PUBLICATION_ALREADY_ATTEMPTED');
            published = true;
            prior = readMixedNoOpBasis(stage, contracts);
            need(prior);
            current = runtime.readRuntimeBasis(fixed.limits);
            trace = runtime.traceRuntimeV2(fixed.limits);
            need(current.status === 'AVAILABLE' && trace.status === 'CURRENT');
            need(current.identity.runtimeActivationId === trace.activationId);
            need(isDeepStrictEqual(current.identity.codeBasis, prior.basis));
            need(isDeepStrictEqual(current.identity.codeBasis, trace.identity.codeBasis));
            need(current.identity.syntaxActivationId === trace.identity.syntaxActivationId);
            need(current.identity.syntaxMembershipDigest === trace.identity.syntaxMembershipDigest);
            inputs = runtime.readFrameworkInputsV2(current.identity, fixed.limits);
            return { status: 'AVAILABLE', identity: current.identity };
          },
          async derive(_identity, control) {
            const candidate = await prepareFrameworkRuntimeV2(
              { ...inputs, syntaxMembershipDigest: current.identity.syntaxMembershipDigest },
              routes,
              control,
            );
            await source.verifySelection();
            return candidate;
          },
          apply({ expected, candidate }) {
            settled();
            need(isDeepStrictEqual(readMixedNoOpBasis(stage, contracts), prior));
            const live = runtime.readRuntimeBasis(fixed.limits);
            need(live.status === 'AVAILABLE' && isDeepStrictEqual(live.identity, expected));
            const latest = runtime.traceRuntimeV2(fixed.limits);
            need(latest.status === 'CURRENT' && latest.activationId === trace.activationId);
            need(isDeepStrictEqual(latest.candidate, trace.candidate));
            need(isDeepStrictEqual(candidate, latest.candidate));
            runtime.readFrameworkInputsV2(live.identity, fixed.limits);
            settled();
            return Object.freeze({
              kind: 'NO_OP',
              basis: prior.basis,
              activationId: prior.activationId,
              runtimeActivationId: trace.activationId,
              syntaxActivationId: expected.syntaxActivationId,
            });
          },
        },
      );
    },
    publish({ stage, lease, store, expectedOldRuntime, routes, capture, request }) {
      let view;
      return refreshRuntimeFactsV2(
        {
          ...request,
          workspaceId: fixed.policy.scope.workspaceId,
          repositoryId: fixed.repository.id,
        },
        {
          capture() {
            if (published) throw Error('MIXED_FINAL_PUBLICATION_ALREADY_ATTEMPTED');
            published = true;
            view = readFrozenFrameworkInputsV2(stage, lease, fixed.limits);
            return {
              status: 'AVAILABLE',
              identity: {
                codeBasis: view.basis,
                syntaxActivationId: view.syntaxActivationId,
                syntaxMembershipDigest: view.syntaxMembershipDigest,
                runtimeActivationId: expectedOldRuntime,
              },
            };
          },
          async derive(_identity, control) {
            const candidate = await prepareFrameworkRuntimeV2(view, routes, control);
            // Last external await: actual Source/Git re-observation, after real plugin derivation.
            await source.verifySelection();
            return candidate;
          },
          apply({ expected, candidate }) {
            // Application validation/control above and this fixed tail are synchronous.
            // The original refresh workflow has its ordinary derive Promise continuation;
            // no external callback/await is inserted between final verification and apply.
            recheckActivationContext(fixed.database, capture, fixed.limits);
            const state = owner.status();
            if (state.status !== 'OFFLINE_IDLE' || state.remaining !== 0)
              throw Error('MIXED_FINAL_VERIFICATION_NOT_SETTLED');
            return store.applyWithRuntimeV2(
              lease,
              fixed.limits,
              candidate,
              expected.runtimeActivationId,
            );
          },
        },
      );
    },
  });
}
