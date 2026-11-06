import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import nativeOwner, {
  executeNativeRequest,
  NativeClientError,
  type NativeClientOptions,
} from '../../providers/dist/native-client.js';
import { NativeAnalyzeRequestV2Schema } from '../../providers/dist/native-ipc-v2.js';
import observe from '../../providers/dist/native-code-syntax-client.js';
import {
  CompositionMetadataSchema,
  type CompositionMetadata,
} from '../../providers/dist/native-composition-input.js';
import type { CodeSyntaxRequest } from '../../providers/dist/native-code-syntax-request.js';
import type { HistoryContractIdentity } from '../../providers/dist/history-transition-input.js';
import {
  MixedSourceWorkflowError,
  validateMixedSourceQualification,
} from '../../application/dist/mixed-source-workflow.js';
import {
  captureActivationContext,
  releaseActivationContext,
} from '../../storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedNoOpBasis,
  readMixedJavaPreparation,
  readMixedCodeSyntaxPreparation,
} from '../../storage/dist/analysis/mixed-analysis-stage.js';
import {
  MixedAnalysisStore,
  readMixedAnalysisSettlement,
} from '../../storage/dist/analysis/mixed-analysis-store.js';
import {
  MixedAnalysisError,
  requireMixedAnalysis as check,
} from '../../storage/dist/analysis/mixed-analysis-state.js';
import { MixedSourceAccountError } from '../../storage/dist/analysis/mixed-source-account.js';
import {
  HistoryCaptureError,
  exact,
} from '../../storage/dist/analysis/activation-history-format.js';
import { EffectiveConfigError, type EffectiveConfig } from './effective-config.js';
import {
  prepareBudgetedMixedSourceOperation,
  type BudgetedMixedSourceInput,
} from './mixed-source-preparation.js';
import { resolveMixedExecutionConfig } from './mixed-execution-config.js';
import { createMixedAnalysisRules } from './mixed-analysis.js';
import construct from './mixed-request-preparation.js';

type Input = Pick<BudgetedMixedSourceInput, 'database' | 'repository' | 'policy' | 'control'> & {
  readonly operation: 'FULL' | 'INCREMENTAL';
  readonly configuration: EffectiveConfig;
  readonly request: Omit<BudgetedMixedSourceInput['request'], 'config'>;
  readonly native: {
    readonly options: NativeClientOptions;
    readonly identity: Pick<CompositionMetadata, 'tool'> &
      Pick<CompositionMetadata['snapshot'], 'providerVersion' | 'runtimeVersion'>;
    readonly languages: CodeSyntaxRequest['payload']['languages'];
  };
  readonly contracts: readonly HistoryContractIdentity[];
  readonly qualificationRef: string;
};
type PrivateQualification = {
  readonly source: NonNullable<BudgetedMixedSourceInput['qualification']>;
  createNativeLifecycle(
    role: 'V2' | 'V5',
  ): NonNullable<Parameters<(typeof nativeOwner)['runOwnedNativeProcess']>[5]>;
};

type Effects = {
  sourceCommit: 'NOT_ATTEMPTED' | 'UNKNOWN' | 'COMMITTED';
  graphCommit: 'NOT_ATTEMPTED' | 'NOT_COMMITTED' | 'UNKNOWN' | 'COMMITTED';
  activationId: string | null;
  cleanupFailed: boolean;
};
export class MixedExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly effects: Readonly<Effects>,
  ) {
    super(code);
    this.name = 'MixedExecutionError';
  }
}
function safeCode(e: unknown): string {
  if (
    e instanceof MixedSourceWorkflowError ||
    e instanceof MixedAnalysisError ||
    e instanceof MixedSourceAccountError ||
    e instanceof HistoryCaptureError ||
    e instanceof NativeClientError ||
    e instanceof EffectiveConfigError
  )
    return e.code;
  return 'ANALYSIS_FAILED';
}
/** Trusted local component only. No public route or physical resource qualification. */
export default async function runMixedExecution(
  input: Input,
  qualification: PrivateQualification | null = null,
) {
  const effects: Effects = {
    sourceCommit: 'NOT_ATTEMPTED',
    graphCommit: 'NOT_ATTEMPTED',
    activationId: null,
    cleanupFailed: false,
  };
  let source: Awaited<ReturnType<typeof prepareBudgetedMixedSourceOperation>> | undefined;
  let capture: ReturnType<typeof captureActivationContext> | undefined,
    stage: MixedAnalysisStage | undefined,
    store: MixedAnalysisStore | undefined;
  let result:
      | {
          kind: 'NO_OP' | 'COMMITTED';
          basis: ReturnType<MixedAnalysisStage['freeze']>['basis'];
          activationId: string;
        }
      | undefined,
    error: { cause: unknown } | undefined;
  const settle = () => {
    const receipt = store && readMixedAnalysisSettlement(store);
    if (receipt) {
      effects.graphCommit =
        receipt.status === 'COMMIT_OUTCOME_UNKNOWN' ? 'UNKNOWN' : receipt.status;
      effects.activationId = receipt.activationId;
      effects.cleanupFailed ||= receipt.cleanupFailed;
    }
  };
  try {
    exact(input, [
      'operation',
      'configuration',
      'database',
      'repository',
      'request',
      'policy',
      'control',
      'native',
      'contracts',
      'qualificationRef',
    ]);
    let sourceQualification: PrivateQualification['source'] | undefined;
    let createNativeLifecycle: PrivateQualification['createNativeLifecycle'] | undefined;
    if (qualification !== null) {
      exact(qualification, ['source', 'createNativeLifecycle']);
      check(
        typeof qualification.createNativeLifecycle === 'function' &&
          !types.isProxy(qualification.createNativeLifecycle),
      );
      sourceQualification = validateMixedSourceQualification(qualification.source);
      createNativeLifecycle = qualification.createNativeLifecycle.bind(qualification);
    }
    const lifecycle = (role: 'V2' | 'V5') => {
      const value =
        qualification === null
          ? null
          : nativeOwner.validateOwnedNativeLifecycle(createNativeLifecycle!(role));
      check(qualification === null || typeof value?.beforeSpawn === 'function');
      return value;
    };
    check(input.operation === 'FULL' || input.operation === 'INCREMENTAL');
    const config = resolveMixedExecutionConfig(input.configuration);
    const validated = nativeOwner.validateOwnedNativeOptions(input.native.options);
    const deadline = NativeAnalyzeRequestV2Schema.shape.payload.shape.deadlineEpochMs.parse(
      Math.min(input.control.deadlineEpochMs, Date.now() + config.operationBudget.maxDurationMs),
    );
    check(deadline !== null && Number.isSafeInteger(deadline) && deadline > 0);
    const remaining = () => {
      source?.account.checkpoint();
      if (input.control.signal.aborted || validated.signal?.aborted)
        throw new NativeClientError('CANCELLED', 'CANCELLED');
      const value = deadline - Date.now();
      if (value <= 0) throw new NativeClientError('TIMEOUT', 'TIMEOUT');
      return value;
    };
    const options = (): NativeClientOptions => ({
      executablePath: validated.executablePath,
      arguments: validated.arguments,
      ...(input.native.options.allowedEnvironment
        ? { allowedEnvironment: input.native.options.allowedEnvironment }
        : {}),
      signal: validated.signal
        ? AbortSignal.any([input.control.signal, validated.signal])
        : input.control.signal,
      timeoutMs: Math.min(validated.timeoutMs, remaining()),
      limits: Object.fromEntries(
        Object.entries(config.native.transportLimits).map(([key, value]) => [
          key,
          Math.min(value, validated.limits[key as keyof typeof validated.limits]),
        ]),
      ),
    });
    remaining();
    source = await prepareBudgetedMixedSourceOperation({
      ...(qualification === null ? {} : { qualification: sourceQualification! }),
      database: input.database,
      repository: input.repository,
      request: { ...input.request, config: config.source },
      policy: input.policy,
      limits: config.history,
      operationBudget: config.operationBudget,
      control: { ...input.control, deadlineEpochMs: deadline },
    });
    effects.sourceCommit = source.effects.sourceCommit;
    source.account.checkpoint();
    capture = captureActivationContext(
      input.database,
      input.repository.id,
      source.budget.remaining(),
    );
    stage = new MixedAnalysisStage(
      input.database,
      capture.handle,
      input.operation === 'FULL' ? 'FULL' : 'DELTA',
      config.history,
      createMixedAnalysisRules(),
      source.budget,
    );
    if (input.operation === 'INCREMENTAL') {
      const prior = readMixedNoOpBasis(stage, input.contracts);
      if (prior) {
        await source.verifySelection();
        const confirmed = readMixedNoOpBasis(stage, input.contracts);
        check(confirmed, 'HISTORY_CHANGED');
        effects.activationId = confirmed.activationId;
        result = { kind: 'NO_OP', basis: confirmed.basis, activationId: confirmed.activationId };
      }
    }
    if (!result) {
      const id = input.native.identity;
      const snapshot = {
        id: CompositionMetadataSchema.shape.snapshot.shape.id.parse('snapshot:' + randomUUID()),
        providerId: 'native' as const,
        providerVersion: id.providerVersion,
        runtimeVersion: id.runtimeVersion,
        startedAt: new Date().toISOString(),
      };
      const j = readMixedJavaPreparation(stage, input.contracts);
      const javaRequest = construct.prepareMixedJavaRequest(
        {
          preparation: j,
          repository: input.repository,
          revision: source.state.revision,
          providerSnapshotId: snapshot.id,
          requestId: randomUUID(),
          requestedCapabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
          deadlineEpochMs: deadline,
          resourceBudget: {
            maxDurationMs: remaining(),
            maxMemoryBytes: config.operationBudget.maxMemoryBytes,
            maxEvents: config.native.maxEvents,
          },
        },
        source.budget,
      );
      let java: unknown = null,
        ownerInput: unknown = null;
      if (javaRequest) {
        const startedAt = new Date().toISOString();
        const actual =
          qualification === null
            ? await executeNativeRequest(javaRequest, options())
            : await nativeOwner.executeOwnedJavaRequest(javaRequest, options(), lifecycle('V2')!);
        check(actual.request.protocolVersion === 2);
        java = {
          ...id,
          startedAt,
          settledAt: new Date().toISOString(),
          request: actual.request,
          events: actual.events,
          terminal: actual.terminal,
        };
        ownerInput = {
          kind: 'SETTLED_JAVA_OWNER',
          schemaVersion: 1,
          targetSource: j.targetSource,
          inventory: source.state.files,
          snapshot,
          tool: id.tool,
          java: java!,
        };
      }
      remaining();
      const owner = stage.prepareOwner(ownerInput, {
        contracts: input.contracts,
        qualificationRef: input.qualificationRef,
      });
      const p = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
      const bytes = construct.prepareMixedCodeSyntaxRequest(
        {
          preparation: p,
          requestId: randomUUID(),
          repository: input.repository,
          providerVersion: id.providerVersion,
          providerSnapshotId: snapshot.id,
          extractorVersion: input.contracts.find((c) => c.providerId === 'native')!.extractor,
          deadlineEpochMs: deadline,
          resourceBudget: {
            ...config.operationBudget,
            maxDurationMs: remaining(),
            maxEvents: config.native.maxEvents,
          },
          languages: input.native.languages,
        },
        source.budget,
      );
      if (bytes) {
        const startedAt = new Date().toISOString(),
          raw = await observe(bytes, options(), lifecycle('V5')),
          settledAt = new Date().toISOString();
        const metadata = {
          targetSource: p.targetSource,
          inventory: p.inventory,
          snapshot: { ...snapshot, completedAt: new Date().toISOString() },
          tool: id.tool,
          java,
          codeSyntax: { ...id, startedAt, settledAt },
        };
        stage.acceptObservation(owner.ownerHandle, {
          metadata,
          requestBytes: raw.requestBytes,
          outputBytes: raw.outputBytes,
        });
      } else stage.acceptObservation(owner.ownerHandle, null);
      const frozen = stage.freeze();
      store = new MixedAnalysisStore(input.database);
      await source.verifySelection();
      effects.graphCommit = 'NOT_COMMITTED';
      const activationId = store.apply(frozen.lease, config.history);
      settle();
      result = { kind: 'COMMITTED', basis: frozen.basis, activationId };
    }
  } catch (e) {
    if (e instanceof MixedSourceWorkflowError) effects.sourceCommit = e.effects.sourceCommit;
    settle();
    error = { cause: e };
  } finally {
    try {
      if (stage && !effects.cleanupFailed) stage.close();
      if (capture) releaseActivationContext(input.database, capture.handle);
    } catch (e) {
      effects.cleanupFailed = true;
      if (!error && effects.graphCommit !== 'COMMITTED') error = { cause: e };
    }
    source?.account.invalidate();
  }
  if (error) {
    const failure = new MixedExecutionError(safeCode(error.cause), Object.freeze({ ...effects }));
    if (
      error.cause &&
      typeof error.cause === 'object' &&
      Object.getOwnPropertyDescriptor(error.cause, 'cleanupState')?.value === 'UNKNOWN'
    )
      Object.assign(failure, { cleanupState: 'UNKNOWN' });
    throw failure;
  }
  check(result);
  return Object.freeze({ ...result, effects: Object.freeze({ ...effects }) });
}
