import {
  deriveFrameworkRuntimeV2,
  refreshRuntimeFactsV2,
  traceRuntime,
  type FrameworkRuntimeCandidateV2,
  type RuntimeWorkflowRequest,
} from '@codeatlas/application';
import { selectFrameworkPluginsV5, validatePluginV5Context } from '@codeatlas/plugins';
import { validatePluginV5ExtractionContext, type PluginV5Candidate } from '@codeatlas/plugins';
type RuntimeSitePlanV1 = PluginV5Candidate['sitePlan'];
import { isDeepStrictEqual } from 'node:util';
import {
  MixedAnalysisStage,
  readFrozenFrameworkInputsV2,
} from '../../storage/dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../../storage/dist/analysis/mixed-analysis-store.js';
import {
  deriveFrameworkRuntime,
  type FrameworkRuntimeCandidate,
  type RuntimeRefreshPorts,
} from '@codeatlas/application';
import {
  selectFrameworkPluginsV4,
  pluginV4CandidateUnits,
  validatePluginV4Context,
  MAX_PLUGIN_CONTEXT_FACTS,
  type PluginV4Context,
} from '@codeatlas/plugins';
import { RuntimeFactStore, type HistoryReadLimits } from '@codeatlas/storage';
import { composeRuntimeFacts } from './runtime-fact-composition.js';
type Inputs = ReturnType<RuntimeFactStore['readFrameworkInputs']>;
type Control = Parameters<RuntimeRefreshPorts<unknown>['derive']>[1];
export interface FrameworkRuntimeRoute {
  languageId: string;
  frameworkId: string;
  configuration: PluginV4Context['configuration'];
}
/** Fixed built-ins, explicit routes/configuration, stored IR only. No Source acquisition. */
export async function prepareFrameworkRuntime(
  inputs: Inputs,
  routes: readonly FrameworkRuntimeRoute[],
  control: Control,
): Promise<ReturnType<typeof deriveFrameworkRuntime>> {
  const output: FrameworkRuntimeCandidate[] = [];
  let remaining = control.maxItems;
  for (const route of routes) {
    if (control.signal.aborted || Date.now() >= control.deadlineEpochMs) break;
    const plugins = selectFrameworkPluginsV4({
      languageId: route.languageId,
      frameworkId: route.frameworkId,
      providerCapabilities: inputs.providerCapabilities,
    });
    const context = validatePluginV4Context({
      contextVersion: 4,
      syntaxSchemaVersion: 3,
      basis: inputs.basis,
      nodes: inputs.nodes,
      edges: inputs.edges,
      sourceFiles: inputs.sourceFiles,
      syntaxEvidence: inputs.syntaxEvidence,
      supportInventory: inputs.supportInventory,
      configuration: route.configuration,
    });
    for (const plugin of plugins) {
      const detection = await plugin.detect(context);
      if (!detection.matched) continue;
      if (remaining <= 0) throw Error('RUNTIME_LIMIT_EXCEEDED');
      let facts: unknown, bindings: unknown, coverage: unknown;
      for await (const candidate of plugin.extract({
        ...context,
        detection,
        maxItems: Math.min(remaining, MAX_PLUGIN_CONTEXT_FACTS),
      })) {
        remaining -= pluginV4CandidateUnits(candidate);
        if (remaining < 0) throw Error('RUNTIME_LIMIT_EXCEEDED');
        if (candidate.capability === 'RUNTIME_FACT_SET') {
          facts = candidate.value;
          coverage = candidate.coverage;
        }
        if (candidate.capability === 'FRAMEWORK_BINDING_SET') bindings = candidate.value;
      }
      output.push({ facts, bindings, coverage });
    }
  }
  return deriveFrameworkRuntime(inputs, output, control);
}
/** Authorized capture -> current SQLite IR -> actual factories -> graph/flow -> fixed Store. */
export function composeFrameworkRuntime(input: {
  workspaceId: string;
  repositoryId: string;
  store: RuntimeFactStore;
  limits: HistoryReadLimits;
  routes: readonly FrameworkRuntimeRoute[];
}): ReturnType<typeof composeRuntimeFacts> {
  return composeRuntimeFacts({
    ...input,
    derive: async (identity, control) =>
      prepareFrameworkRuntime(
        input.store.readFrameworkInputs(identity, input.limits),
        input.routes,
        control,
      ),
  });
}

type InputsV2 = ReturnType<RuntimeFactStore['readFrameworkInputsV2']> & {
  syntaxMembershipDigest: string;
};
/** Fixed factories and Application V2 derivation for both frozen and committed inputs. */
export async function prepareFrameworkRuntimeV2(
  inputs: InputsV2,
  routes: readonly FrameworkRuntimeRoute[],
  control: Control,
) {
  const output: FrameworkRuntimeCandidateV2[] = [];
  let remaining = control.maxItems;
  for (const route of routes) {
    if (control.signal.aborted || Date.now() >= control.deadlineEpochMs) break;
    const plugins = selectFrameworkPluginsV5({
        languageId: route.languageId,
        frameworkId: route.frameworkId,
        providerCapabilities: inputs.providerCapabilities,
      }),
      context = validatePluginV5Context({
        contextVersion: 5,
        syntaxSchemaVersion: 4,
        basis: inputs.basis,
        nodes: inputs.nodes,
        edges: inputs.edges,
        sourceFiles: inputs.sourceFiles,
        syntaxEvidence: inputs.syntaxEvidence,
        supportInventory: inputs.supportInventory,
        configuration: route.configuration,
      });
    for (const plugin of plugins) {
      const detection = await plugin.detect(context);
      if (!detection.matched) continue;
      if (remaining <= 0) throw Error('RUNTIME_LIMIT_EXCEEDED');
      let facts: unknown,
        bindings: unknown,
        coverage: unknown,
        sitePlan: RuntimeSitePlanV1 | undefined;
      const emitted = new Set<string>();
      for await (const candidate of plugin.extract(
        validatePluginV5ExtractionContext({
          ...context,
          detection,
          syntaxMembershipDigest: inputs.syntaxMembershipDigest,
          maxItems: Math.min(remaining, MAX_PLUGIN_CONTEXT_FACTS),
        }),
      )) {
        if (emitted.has(candidate.capability)) throw Error('INVALID_RUNTIME_CANDIDATE');
        emitted.add(candidate.capability);
        remaining -=
          pluginV4CandidateUnits(candidate) +
          candidate.sitePlan.entries.reduce(
            (n, e) => n + 1 + e.proofSyntaxKeys.length + e.bindingIds.length,
            0,
          );
        if (remaining < 0) throw Error('RUNTIME_LIMIT_EXCEEDED');
        if (sitePlan && !isDeepStrictEqual(sitePlan, candidate.sitePlan))
          throw Error('INVALID_RUNTIME_CANDIDATE');
        sitePlan = candidate.sitePlan;
        if (candidate.capability === 'RUNTIME_FACT_SET') {
          facts = candidate.value;
          coverage = candidate.coverage;
        } else if (candidate.capability === 'FRAMEWORK_BINDING_SET') {
          bindings = candidate.value;
          if (coverage && !isDeepStrictEqual(coverage, candidate.coverage))
            throw Error('INVALID_RUNTIME_CANDIDATE');
        }
      }
      if (!facts || !bindings || !coverage || !sitePlan) throw Error('INVALID_RUNTIME_CANDIDATE');
      output.push({ facts, bindings, coverage, sitePlan });
    }
  }
  return deriveFrameworkRuntimeV2(
    {
      basis: inputs.basis,
      nodes: inputs.nodes,
      edges: inputs.edges,
      sourceFiles: inputs.sourceFiles,
      supportInventory: inputs.supportInventory,
      syntaxEvidence: inputs.syntaxEvidence,
      syntaxMembershipDigest: inputs.syntaxMembershipDigest,
    },
    output,
    control,
  );
}
type RequestV2 = Pick<RuntimeWorkflowRequest, 'policy' | 'control'>;
export function composeFrameworkRuntimeV2(input: {
  workspaceId: string;
  repositoryId: string;
  store: RuntimeFactStore;
  limits: HistoryReadLimits;
  routes: readonly FrameworkRuntimeRoute[];
}): {
  refresh(
    request: RequestV2,
  ): ReturnType<typeof refreshRuntimeFactsV2<import('@codeatlas/storage').RuntimeCommitOutcome>>;
  trace(request: RequestV2): ReturnType<RuntimeFactStore['traceRuntimeV2']>;
} {
  const scope = { workspaceId: input.workspaceId, repositoryId: input.repositoryId };
  return Object.freeze({
    refresh: (request: RequestV2) =>
      refreshRuntimeFactsV2(
        { ...request, ...scope },
        {
          capture: () => input.store.readRuntimeBasis(input.limits),
          derive: (identity, control) =>
            prepareFrameworkRuntimeV2(
              {
                ...input.store.readFrameworkInputsV2(identity, input.limits),
                syntaxMembershipDigest: identity.syntaxMembershipDigest,
              },
              input.routes,
              control,
            ),
          apply: (value) => input.store.applyRuntimeBatchV2(value, input.limits),
        },
      ),
    trace: (request: RequestV2) =>
      traceRuntime(
        { ...request, ...scope },
        { read: () => input.store.traceRuntimeV2(input.limits) },
      ),
  });
}
/** No preliminary Syntax commit: authorization precedes the genuine same-lease read. */
export function composeFrozenFrameworkRuntimeV2(input: {
  workspaceId: string;
  repositoryId: string;
  stage: MixedAnalysisStage;
  lease: object;
  store: MixedAnalysisStore;
  expectedOldRuntime: string | null;
  limits: HistoryReadLimits;
  routes: readonly FrameworkRuntimeRoute[];
}) {
  return Object.freeze({
    publish: (request: RequestV2) => {
      let view: ReturnType<typeof readFrozenFrameworkInputsV2> | undefined;
      return refreshRuntimeFactsV2(
        { ...request, workspaceId: input.workspaceId, repositoryId: input.repositoryId },
        {
          capture: () => {
            view = readFrozenFrameworkInputsV2(input.stage, input.lease, input.limits);
            return {
              status: 'AVAILABLE',
              identity: {
                codeBasis: view.basis,
                syntaxActivationId: view.syntaxActivationId,
                syntaxMembershipDigest: view.syntaxMembershipDigest,
                runtimeActivationId: input.expectedOldRuntime,
              },
            };
          },
          derive: (_identity, control) => {
            if (!view) throw Error('RUNTIME_INPUT_UNAVAILABLE');
            return prepareFrameworkRuntimeV2(view, input.routes, control);
          },
          apply: ({ expected, candidate }) =>
            input.store.applyWithRuntimeV2(
              input.lease,
              input.limits,
              candidate,
              expected.runtimeActivationId,
            ),
        },
      );
    },
  });
}
