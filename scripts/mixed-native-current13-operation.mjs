// Fixed private FULL/DELTA current13 business entry. No live/qualification authority.
import { randomUUID } from 'node:crypto';
import { authorizeRuntimeWorkflow } from '../packages/application/dist/refresh-runtime-facts.js';
import { authorizeOperation, createQueryControl } from '../packages/application/dist/index.js';
import { MixedSourceWorkflowError } from '../packages/application/dist/mixed-source-workflow.js';
import { openRepositoryIndexSession } from '../packages/storage/dist/index.js';
import {
  captureRuntimeActivationContext,
  releaseActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedJavaPreparation,
  readMixedCodeSyntaxPreparation,
  readMixedNoOpBasis,
} from '../packages/storage/dist/analysis/mixed-analysis-stage.js';
import {
  MixedAnalysisStore,
  readMixedAnalysisSettlement,
} from '../packages/storage/dist/analysis/mixed-analysis-store.js';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { createFrameworkSurfaceMixedAnalysisRules } from '../packages/runtime/dist/mixed-analysis.js';
import construct from '../packages/runtime/dist/mixed-request-preparation.js';
import { withMixedNativeTransportBudget } from '../packages/runtime/dist/mixed-native-transport-budget.js';
import nativeOwner from '../packages/providers/dist/native-client.js';
import observeOwnedFrameworkSurface from '../packages/providers/dist/native-framework-surface-client.js';
import { loadMixedNativeCurrent13OperationDescriptor } from './mixed-native-owner-context.mjs';
import { bindMixedNativeDynamicOwner } from './mixed-native-dynamic-owner.mjs';
import { prepareMixedNativeFinalSourcePublication } from './mixed-native-final-source-publication.mjs';
const need = (v) => {
  if (!v) throw Error('INVALID_CURRENT13_OPERATION');
};
const exact = (v, keys) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const flags = Object.freeze({
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
  contextAuthenticated: false,
  moduleClosureAuthenticated: false,
  liveTransportConnected: false,
});
export class Current13OperationError extends Error {
  constructor(step, effects) {
    super('CURRENT13_OPERATION_FAILED');
    this.code = 'CURRENT13_OPERATION_FAILED';
    this.step = step;
    this.effects = Object.freeze({ ...effects });
  }
}
// Same bounded session control plus the coordinator's absolute cooperative deadline.
export function createCurrent13InitializationControl(sessionBudget, signal, deadlineEpochMs) {
  const alive = () =>
    need(!signal.aborted && Number.isSafeInteger(deadlineEpochMs) && Date.now() < deadlineEpochMs);
  alive();
  const inner = createQueryControl(
    {
      ...sessionBudget,
      timeoutMs: Math.min(sessionBudget.timeoutMs, deadlineEpochMs - Date.now()),
      maxNodes: sessionBudget.maxMetadataRows,
      maxEdges: sessionBudget.maxMetadataRows,
    },
    signal,
  );
  return Object.freeze({
    async checkpoint() {
      alive();
      await inner.checkpoint();
      alive();
    },
    reserveText(bytes) {
      alive();
      inner.reserveText(bytes);
    },
    chargeMetadataRow() {
      alive();
      inner.chargeMetadataRow();
    },
  });
}
export async function runMixedNativeHostOperation(input, channels) {
  const effects = {
    sourceCommit: 'NOT_ATTEMPTED',
    graphCommit: 'NOT_ATTEMPTED',
    activationId: null,
    cleanupFailed: false,
  };
  let step = 'LOAD_OPERATION',
    owner,
    session,
    source,
    capture,
    stage,
    store,
    value,
    error;
  const controller = new AbortController(),
    abort = () => controller.abort();
  let incoming;
  const settle = () => {
    if (!store) return;
    const receipt = readMixedAnalysisSettlement(store);
    if (receipt) {
      effects.graphCommit =
        receipt.status === 'COMMIT_OUTCOME_UNKNOWN' ? 'UNKNOWN' : receipt.status;
      effects.activationId = receipt.activationId;
      effects.cleanupFailed ||= receipt.cleanupFailed;
    }
  };
  try {
    need(
      input && exact(input, ['ownerInput']) && channels && channels.incoming && channels.outgoing,
    );
    const expected = structuredClone(input.ownerInput);
    need(Number.isSafeInteger(expected.deadlineEpochMs) && Date.now() < expected.deadlineEpochMs);
    const loaded = await loadMixedNativeCurrent13OperationDescriptor(
      expected.root,
      expected.manifestPath,
      expected.manifestSha256,
      expected.artifactLimits,
    );
    const op = loaded.operation;
    need(
      exact(op, [
        'kind',
        'schemaVersion',
        'database',
        'repository',
        'sourceRequest',
        'policy',
        'historyLimits',
        'operationBudget',
        'sessionBudget',
        'native',
        'git',
        'contracts',
        'qualificationRef',
        'routes',
        'runtimeControl',
      ]),
    );
    const stageMode =
      op.kind === 'MIXED_NATIVE_CURRENT13_FULL_OPERATION'
        ? 'FULL'
        : op.kind === 'MIXED_NATIVE_CURRENT13_INCREMENTAL_OPERATION'
          ? 'DELTA'
          : null;
    need(stageMode !== null && op.schemaVersion === 1);
    need(
      op.repository.id === expected.repositoryId &&
        op.database.repositoryId === expected.repositoryId &&
        op.database.repositoryRoot === op.repository.rootPath &&
        op.sourceRequest.repositoryId === expected.repositoryId,
    );
    need(
      op.database.readOnly === false &&
        op.policy.scope.workspaceId === expected.workspaceId &&
        op.policy.scope.repositoryId === expected.repositoryId,
    );
    need(
      exact(op.runtimeControl, ['maxItems', 'maxDepth']) &&
        exact(op.native, ['options', 'identity', 'languages', 'maxEvents']) &&
        !Object.hasOwn(op.native.options, 'signal'),
    );
    const control = {
        ...op.runtimeControl,
        deadlineEpochMs: expected.deadlineEpochMs,
        signal: controller.signal,
      },
      workflow = {
        workspaceId: expected.workspaceId,
        repositoryId: expected.repositoryId,
        policy: op.policy,
        control,
      };
    // Real Application authorization occurs before opening/initializing a DB or reconciling Source.
    authorizeRuntimeWorkflow(workflow, 'INDEX');
    need(authorizeOperation({ ...op.policy, operation: 'READ_SOURCE' }).allowed);
    incoming = channels.incoming;
    incoming.on('end', abort);
    incoming.on('error', abort);
    owner = await bindMixedNativeDynamicOwner(expected, incoming, channels.outgoing);
    need(owner.bootstrap().contextSha256 === loaded.context.contextSha256);
    const native = nativeOwner.validateOwnedNativeOptions(op.native.options);
    const remaining = () => {
      source?.account.checkpoint();
      need(!controller.signal.aborted);
      const left = expected.deadlineEpochMs - Date.now();
      need(left > 0);
      return left;
    };
    step = 'INITIALIZE';
    const budget = createCurrent13InitializationControl(
      op.sessionBudget,
      controller.signal,
      expected.deadlineEpochMs,
    );
    session = await openRepositoryIndexSession(op.database, budget);
    step = 'SOURCE';
    const prepared = await prepareMixedNativeFinalSourcePublication(
      {
        database: session.database,
        repository: op.repository,
        request: op.sourceRequest,
        policy: op.policy,
        control: {
          signal: controller.signal,
          deadlineEpochMs: expected.deadlineEpochMs,
          maxInputBytes: op.operationBudget.maxInputBytes,
        },
        limits: op.historyLimits,
        operationBudget: op.operationBudget,
      },
      owner,
      op.git,
    );
    source = prepared.source;
    effects.sourceCommit = source.effects.sourceCommit;
    step = 'CAPTURE_STAGE';
    capture = captureRuntimeActivationContext(
      session.database,
      expected.repositoryId,
      source.budget.remaining(),
    );
    const noNative = owner
      .bootstrap()
      .slots.every((slot) => slot.role === 'GIT' && slot.phase === 'SOURCE');
    if (!noNative) owner.bindAnalysis(session.database, capture.handle, op.historyLimits, workflow);
    stage = new MixedAnalysisStage(
      session.database,
      capture.handle,
      stageMode,
      op.historyLimits,
      createFrameworkSurfaceMixedAnalysisRules(),
      source.budget,
    );
    if (noNative && stageMode === 'DELTA' && readMixedNoOpBasis(stage, op.contracts)) {
      step = 'FINAL_VERIFY_NO_OP';
      const outcome = await prepared.noOp({
        stage,
        contracts: op.contracts,
        routes: op.routes,
        capture: capture.handle,
        request: workflow,
      });
      need(outcome.kind === 'NO_OP');
      effects.activationId = outcome.activationId;
      value = Object.freeze({ ...outcome, ...flags });
    } else {
      const options = () => ({
        ...op.native.options,
        signal: controller.signal,
        timeoutMs: Math.min(native.timeoutMs, remaining()),
      });
      const identity = op.native.identity,
        snapshot = {
          id: 'snapshot:' + randomUUID(),
          providerId: 'native',
          providerVersion: identity.providerVersion,
          runtimeVersion: identity.runtimeVersion,
          startedAt: new Date().toISOString(),
        };
      const javaPreparation = readMixedJavaPreparation(stage, op.contracts),
        javaRequest = construct.prepareMixedJavaRequest(
          {
            preparation: javaPreparation,
            repository: op.repository,
            revision: source.state.revision,
            providerSnapshotId: snapshot.id,
            requestId: randomUUID(),
            requestedCapabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
            deadlineEpochMs: expected.deadlineEpochMs,
            resourceBudget: {
              maxDurationMs: remaining(),
              maxMemoryBytes: op.operationBudget.maxMemoryBytes,
              maxEvents: op.native.maxEvents,
            },
          },
          source.budget,
        );
      let java = null,
        ownerInput = null;
      // Java and Surface responses continue the same exclusively owned Source/Stage ledger.
      if (javaRequest) {
        need(!noNative);
        step = 'OWNED_JAVA_V2';
        const startedAt = new Date().toISOString(),
          actual = await withMixedNativeTransportBudget(source.budget, (ledger) =>
            nativeOwner.executeOwnedJavaRequest(javaRequest, options(), owner.take('V2'), ledger),
          );
        java = {
          ...identity,
          startedAt,
          settledAt: new Date().toISOString(),
          request: actual.request,
          events: actual.events,
          terminal: actual.terminal,
        };
        ownerInput = {
          kind: 'SETTLED_JAVA_OWNER',
          schemaVersion: 1,
          targetSource: javaPreparation.targetSource,
          inventory: source.state.files,
          snapshot,
          tool: identity.tool,
          java,
        };
      }
      const stageOwner = stage.prepareOwner(ownerInput, {
          contracts: op.contracts,
          qualificationRef: op.qualificationRef,
        }),
        preparation = readMixedCodeSyntaxPreparation(stage, stageOwner.ownerHandle);
      const bytes = construct.prepareMixedFrameworkSurfaceRequest(
        {
          preparation,
          requestId: randomUUID(),
          repository: op.repository,
          providerVersion: identity.providerVersion,
          providerSnapshotId: snapshot.id,
          extractorVersion: op.contracts.find((c) => c.providerId === 'native').extractor,
          deadlineEpochMs: expected.deadlineEpochMs,
          resourceBudget: {
            ...op.operationBudget,
            maxDurationMs: remaining(),
            maxEvents: op.native.maxEvents,
          },
          languages: op.native.languages,
        },
        source.budget,
      );
      if (bytes) {
        need(!noNative);
        step = 'OWNED_SURFACE_V8';
        const startedAt = new Date().toISOString(),
          transported = await withMixedNativeTransportBudget(source.budget, (ledger) =>
            observeOwnedFrameworkSurface(bytes, options(), owner.take('SURFACE_V8'), ledger),
          ),
          settledAt = new Date().toISOString();
        stage.acceptObservation(stageOwner.ownerHandle, {
          metadata: {
            targetSource: preparation.targetSource,
            inventory: source.state.files,
            snapshot: { ...snapshot, completedAt: new Date().toISOString() },
            tool: identity.tool,
            java,
            codeSyntax: { ...identity, startedAt, settledAt },
          },
          requestBytes: transported.requestBytes,
          outputBytes: transported.outputBytes,
        });
      } else stage.acceptObservation(stageOwner.ownerHandle, null);
      step = 'FREEZE';
      const frozen = stage.freeze(),
        runtime = new RuntimeFactStore(session.database, expected.repositoryId),
        prior = runtime.readRuntimeBasis(op.historyLimits);
      store = new MixedAnalysisStore(session.database);
      step = 'FINAL_VERIFY_AND_ATOMIC_PUBLISH';
      effects.graphCommit = 'NOT_COMMITTED';
      const outcome = await prepared.publish({
        stage,
        lease: frozen.lease,
        store,
        expectedOldRuntime: prior.runtimeActivationId,
        routes: op.routes,
        capture: capture.handle,
        request: workflow,
      });
      settle();
      need(effects.graphCommit === 'COMMITTED');
      value = Object.freeze({
        kind: 'COMMITTED',
        activationId: effects.activationId,
        runtimeActivationId: outcome.runtimeActivationId,
        syntaxActivationId: outcome.syntaxActivationId,
        basis: frozen.basis,
        ...flags,
      });
    }
  } catch (cause) {
    if (cause instanceof MixedSourceWorkflowError)
      effects.sourceCommit = cause.effects.sourceCommit;
    try {
      settle();
    } catch {
      effects.cleanupFailed = true;
      effects.graphCommit = 'UNKNOWN';
    }
    if (Object.getOwnPropertyDescriptor(cause ?? {}, 'cleanupState')?.value === 'UNKNOWN')
      effects.cleanupFailed = true;
    error = { cause };
  } finally {
    // Preserve the original Store/Stage cleanup ownership and committed/UNKNOWN receipt.
    try {
      if (stage && !effects.cleanupFailed) stage.close();
      if (capture) releaseActivationContext(session.database, capture.handle);
    } catch (failure) {
      effects.cleanupFailed = true;
      if (!error && effects.graphCommit !== 'COMMITTED') error = { cause: failure };
    }
    for (const cleanup of [
      () => source?.account.invalidate(),
      () => session?.close(),
      () => owner?.dispose(),
    ]) {
      try {
        cleanup();
      } catch (failure) {
        effects.cleanupFailed = true;
        if (!error && effects.graphCommit !== 'COMMITTED') error = { cause: failure };
      }
    }
    incoming?.removeListener('end', abort);
    incoming?.removeListener('error', abort);
  }
  if (error) {
    const failure = new Current13OperationError(step, effects);
    if (Object.getOwnPropertyDescriptor(error.cause ?? {}, 'cleanupState')?.value === 'UNKNOWN')
      failure.cleanupState = 'UNKNOWN';
    throw failure;
  }
  return Object.freeze({ ...value, effects: Object.freeze({ ...effects }) });
}
