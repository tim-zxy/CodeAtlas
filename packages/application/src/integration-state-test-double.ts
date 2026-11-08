import { types } from 'node:util';
import {
  parseKnowledgeCandidate,
  assertRuntimeRequestControl,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
} from './compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from './integration-candidate.js';
import {
  buildCapturedSemanticTestRequest,
  runSemanticTestDouble,
  type SemanticInvocationAccount,
} from './semantic-test-invocation.js';

export class IntegrationStateTestError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
    readonly usageSettlement: 'NOT_ATTEMPTED' | 'RECORDED' | 'UNKNOWN' = 'NOT_ATTEMPTED',
  ) {
    super(code);
    this.name = 'IntegrationStateTestError';
  }
}
const field = (v: unknown, k: string) =>
  v && typeof v === 'object' && !types.isProxy(v)
    ? Object.getOwnPropertyDescriptor(v, k)?.value
    : undefined;
/** Private self-owned, same-invocation TEST_DOUBLE only. Hashes/Claim state prove
 * supplied consistency, not actual semantic truth, read authority or publishing. */
export async function runCapturedIntegrationStateTestDouble(
  input: unknown,
  integrationOptions: unknown,
  claimOptions: unknown,
  port: unknown,
  controlValue: RuntimeRequestControl,
  account: SemanticInvocationAccount,
) {
  let completed = false;
  let phase: 'SETUP' | 'INTEGRATION' | 'REQUEST' | 'INVOKING' | 'VERIFY' = 'SETUP';
  try {
    if (!controlValue || typeof controlValue !== 'object' || types.isProxy(controlValue))
      throw new IntegrationStateTestError('INTEGRATION_STATE_INPUT_INVALID');
    const d = Object.getOwnPropertyDescriptors(controlValue);
    const controlKeys = ['maxItems', 'maxDepth', 'signal', 'deadlineEpochMs'];
    if (
      Reflect.ownKeys(d).length !== controlKeys.length ||
      controlKeys.some((k) => !d[k] || !d[k]!.enumerable || !Object.hasOwn(d[k]!, 'value'))
    )
      throw new IntegrationStateTestError('INTEGRATION_STATE_INPUT_INVALID');
    const control = Object.freeze(
      Object.fromEntries(
        ['maxItems', 'maxDepth', 'signal', 'deadlineEpochMs'].map((k) => [k, d[k]!.value]),
      ),
    ) as RuntimeRequestControl;
    if (!control.signal || types.isProxy(control.signal))
      throw new IntegrationStateTestError('INTEGRATION_STATE_INPUT_INVALID');
    assertRuntimeRequestControl(control);
    const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
    const checkpoint = () => {
      account.checkpoint();
      if (aborted.call(control.signal)) throw new IntegrationStateTestError('CANCELLED');
      if (Date.now() >= control.deadlineEpochMs) throw new IntegrationStateTestError('DEADLINE');
    };
    const freeze = (v: unknown) => {
      checkpoint();
      account.visitItem();
      if (v && typeof v === 'object' && !Object.isFrozen(v)) {
        for (const child of Object.values(v)) freeze(child);
        Object.freeze(v);
      }
    };
    checkpoint();
    account.own(input);
    account.own(integrationOptions);
    account.own(claimOptions);
    const snapshot = parseCompilationInputSnapshot(input, control);
    const options = JSON.parse(canonicalCompilationJson(claimOptions, control));
    const selected = JSON.parse(canonicalCompilationJson(integrationOptions, control));
    freeze(snapshot);
    freeze(options);
    freeze(selected);
    const optionKeys = Object.keys(options).sort();
    if (
      optionKeys.length !== 3 ||
      optionKeys.some((key, i) => key !== ['invocationBudget', 'modelPolicyRef', 'promptRef'][i])
    )
      throw new IntegrationStateTestError('INTEGRATION_STATE_TASK_REQUIRED');
    phase = 'INTEGRATION';
    const integration = buildCapturedIntegrationCandidate(snapshot, selected, control, account);
    phase = 'REQUEST';
    const request = buildCapturedSemanticTestRequest(
      snapshot,
      { ...options, taskKind: 'CLAIM_EXTRACTION' },
      control,
      account,
    );
    phase = 'VERIFY';
    if (request.authorizedContext.data.snapshot.inputDigest !== integration.capturedInputDigest)
      throw new IntegrationStateTestError('INTEGRATION_STATE_BINDING_INVALID');
    phase = 'INVOKING';
    const result = await runSemanticTestDouble(request, port, control, account);
    completed = true;
    phase = 'VERIFY';
    checkpoint();
    // The awaited local-double boundary validated the exact actual completed output
    // and its digest, under its prepaid maxOutputBytes, before freezing this result.
    if (
      result.inputDigest !== request.inputDigest ||
      result.structuredOutput.schema !== 'codeatlas.claim'
    )
      throw new IntegrationStateTestError('INTEGRATION_STATE_BINDING_INVALID');
    const candidate = parseKnowledgeCandidate(
      integration.candidate,
      request.authorizedContext.referenceContext,
    );
    account.own(candidate);
    const output = {
      ...integration,
      candidate,
      reconciliationSubject: {
        ...integration.reconciliationSubject,
        candidateEnvelope: candidate,
        // Same validated capture plus its real repository metadata refs; no new facts.
        referenceContext: request.authorizedContext.referenceContext,
        stateBinding: {
          inputSnapshotRef: integration.candidate.payload.inputSnapshotRef,
          claims: [result.structuredOutput],
        },
      },
      binding: {
        capturedInputDigest: integration.capturedInputDigest,
        requestInputDigest: request.inputDigest,
        claimOutputDigest: result.outputDigest,
      },
      evidenceKind: 'TEST_DOUBLE' as const,
      confidence: 'NOT_VERIFIED' as const,
      quality: 'NOT_EVALUABLE' as const,
      contextAuthorization: 'NOT_ESTABLISHED' as const,
      publicationEffect: 'NOT_ATTEMPTED' as const,
    };
    account.own(output);
    freeze(output);
    checkpoint();
    return output;
  } catch (error) {
    if (phase === 'INTEGRATION' || phase === 'REQUEST' || phase === 'INVOKING') throw error;
    let unknown = field(error, 'cleanupState') === 'UNKNOWN';
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    const code = field(error, 'code');
    throw new IntegrationStateTestError(
      [
        'CANCELLED',
        'DEADLINE',
        'DEADLINE_EXCEEDED',
        'BUDGET_EXCEEDED',
        'INTEGRATION_STATE_TASK_REQUIRED',
        'INTEGRATION_STATE_BINDING_INVALID',
      ].includes(code)
        ? code
        : 'INTEGRATION_STATE_INPUT_INVALID',
      unknown ? 'UNKNOWN' : 'SETTLED',
      completed ? 'RECORDED' : 'NOT_ATTEMPTED',
    );
  }
}
