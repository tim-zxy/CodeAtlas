import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  assertRuntimeRequestControl,
  EntityRefSchema,
  KnowledgeScopeSchema,
  parseClaim,
  parseKnowledgeCandidate,
  parsePhase1ReferenceContext,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import type { DocumentAccount } from '../../documents/dist/source-positions.js';
import { canonicalCompilationJson } from './compilation-input-contract.js';

type Code =
  | 'MODEL_REQUEST_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'MODEL_INPUT_TOO_LARGE'
  | 'MODEL_OUTPUT_TOO_LARGE'
  | 'MODEL_GENERATION_FAILED'
  | 'MODEL_OUTPUT_INVALID'
  | 'MODEL_OUTPUT_INCOMPLETE'
  | 'USAGE_UNAVAILABLE'
  | 'BUDGET_EXCEEDED'
  | 'CANCELLED'
  | 'DEADLINE';
export class SemanticTestInvocationError extends Error {
  constructor(
    readonly code: Code,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
    readonly usageSettlement: 'NOT_ATTEMPTED' | 'RECORDED' | 'UNKNOWN' = 'NOT_ATTEMPTED',
  ) {
    super(code);
    this.name = 'SemanticTestInvocationError';
  }
}
export interface SemanticInvocationAccount extends DocumentAccount {
  reserveCall(): void;
  chargeUsage(usage: Readonly<{ inputTokens: number; outputTokens: number }>): void;
}
function fail(code: Code): never {
  throw new SemanticTestInvocationError(code);
}
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const tasks = new Map([
  ['COMPONENT_SUMMARY', 'COMPONENT'],
  ['CAPABILITY_SYNTHESIS', 'CAPABILITY'],
  ['BUSINESS_FLOW_SYNTHESIS', 'BUSINESS_FLOW'],
  ['CLAIM_EXTRACTION', 'CLAIM'],
]);
function fields(
  value: unknown,
  keys: readonly string[],
  code: Code = 'MODEL_REQUEST_INVALID',
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(code);
  const own = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length) fail(code);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = own[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    result[key] = descriptor.value;
  }
  return result;
}
function freeze<T>(value: T, checkpoint: () => void): T {
  checkpoint();
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child, checkpoint);
    Object.freeze(value);
  }
  return value;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const text = (value: unknown): value is string =>
  typeof value === 'string' && !!value && value === value.trim();
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
function errorField(error: unknown, key: string): unknown {
  return error && typeof error === 'object' && !types.isProxy(error)
    ? Object.getOwnPropertyDescriptor(error, key)?.value
    : undefined;
}

/** Private local-double boundary only. A DTO, port label or checked schema never
 * authorizes production context, real generation, semantic truth or publication.
 * The trusted port must join its tasks before its promise settles. */
export async function runSemanticTestDouble(
  input: unknown,
  portValue: unknown,
  controlValue: RuntimeRequestControl,
  account: SemanticInvocationAccount,
) {
  let stage: Code = 'MODEL_REQUEST_INVALID';
  let usageSettlement: 'NOT_ATTEMPTED' | 'RECORDED' | 'UNKNOWN' = 'NOT_ATTEMPTED';
  let budgetOwnerUnsettled = false;
  try {
    const c = fields(controlValue, ['signal', 'deadlineEpochMs', 'maxItems', 'maxDepth']);
    const control = Object.freeze({ ...c }) as unknown as RuntimeRequestControl;
    if (!control.signal || types.isProxy(control.signal)) fail('MODEL_REQUEST_INVALID');
    nativeAborted.call(control.signal);
    assertRuntimeRequestControl(control);
    const checkpoint = () => {
      account.checkpoint();
      if (nativeAborted.call(control.signal)) fail('CANCELLED');
      if (Date.now() >= control.deadlineEpochMs) fail('DEADLINE');
    };
    checkpoint();
    if (portValue == null) fail('PROVIDER_UNAVAILABLE');
    const port = fields(portValue, ['evidenceKind', 'identity', 'capabilities', 'generate']);
    if (port.evidenceKind !== 'TEST_DOUBLE') fail('PROVIDER_UNAVAILABLE');
    const capability = fields(port.capabilities, ['outputMode']).outputMode;
    if (!['NATIVE_JSON_SCHEMA', 'JSON', 'PROMPT_JSON'].includes(capability as string))
      fail('CAPABILITY_UNAVAILABLE');
    const generate = port.generate;
    if (typeof generate !== 'function' || types.isProxy(generate)) fail('PROVIDER_UNAVAILABLE');
    const identity = fields(port.identity, ['providerId', 'modelId', 'adapterVersion']);
    if (!Object.values(identity).every(text)) fail('PROVIDER_UNAVAILABLE');
    const fixedIdentity = Object.freeze({ ...identity });
    const raw = fields(input, [
      'taskKind',
      'promptRef',
      'modelPolicyRef',
      'outputSchemaRef',
      'authorizedContext',
      'inputDigest',
      'invocationBudget',
    ]);
    const limits = fields(raw.invocationBudget, ['maxInputBytes', 'maxOutputBytes']);
    if (!positive(limits.maxInputBytes) || !positive(limits.maxOutputBytes))
      fail('MODEL_REQUEST_INVALID');
    const maxInputBytes = limits.maxInputBytes,
      maxOutputBytes = limits.maxOutputBytes;
    const copy = (value: unknown, maximum: number, code: Code) => {
      checkpoint();
      account.own(value);
      account.reserveBuffer(maximum);
      const encoded = canonicalCompilationJson(value, control);
      if (Buffer.byteLength(encoded) > maximum) fail(code);
      account.own(value);
      return freeze(JSON.parse(encoded) as Record<string, unknown>, checkpoint);
    };
    const request = copy(input, maxInputBytes, 'MODEL_INPUT_TOO_LARGE');
    if (
      !tasks.has(request.taskKind as string) ||
      !text(request.promptRef) ||
      !text(request.modelPolicyRef)
    )
      fail('MODEL_REQUEST_INVALID');
    const claim = request.taskKind === 'CLAIM_EXTRACTION';
    if (
      request.outputSchemaRef !== (claim ? 'codeatlas.claim@1' : 'codeatlas.knowledge-candidate@1')
    )
      fail('MODEL_REQUEST_INVALID');
    const context = fields(request.authorizedContext, [
      'instructionRef',
      'dataLabel',
      'scope',
      'inputSnapshotRef',
      'data',
      'referenceContext',
    ]);
    if (context.instructionRef !== request.promptRef || context.dataLabel !== 'UNTRUSTED_DATA')
      fail('MODEL_REQUEST_INVALID');
    const scope = KnowledgeScopeSchema.parse(context.scope);
    const snapshot = EntityRefSchema.parse(context.inputSnapshotRef);
    if (snapshot.kind !== 'COMPILATION_INPUT_SNAPSHOT' || Object.keys(snapshot).length !== 2)
      fail('MODEL_REQUEST_INVALID');
    const refs = parsePhase1ReferenceContext(context.referenceContext);
    account.reserveBuffer(maxInputBytes);
    if (request.inputDigest !== hash(canonicalCompilationJson(request.authorizedContext, control)))
      fail('MODEL_REQUEST_INVALID');
    account.reserveBuffer(maxOutputBytes);
    account.reserveCall();
    checkpoint();
    stage = 'MODEL_GENERATION_FAILED';
    usageSettlement = 'UNKNOWN';
    const pending: unknown = Reflect.apply(generate, portValue, [request, control]);
    if (!types.isPromise(pending)) fail('MODEL_OUTPUT_INVALID');
    // Await actual settlement, including cancellation; never abandon the producer.
    const received: unknown = await pending;
    stage = 'MODEL_OUTPUT_INVALID';
    // Settle bounded usage metadata independently of output/cancellation admission.
    let fixedUsage: Readonly<{ inputTokens: number; outputTokens: number }> | undefined;
    let usageFailed = false,
      usageFailure: unknown;
    try {
      const metadata = fields(
        received,
        ['structuredOutput', 'identity', 'usage', 'finishReason', 'outputDigest', 'warnings'],
        'MODEL_OUTPUT_INVALID',
      );
      const usage = fields(metadata.usage, ['inputTokens', 'outputTokens'], 'USAGE_UNAVAILABLE');
      if (
        !Object.values(usage).every(
          (value) => Number.isSafeInteger(value) && (value as number) >= 0,
        )
      )
        fail('USAGE_UNAVAILABLE');
      fixedUsage = Object.freeze({
        inputTokens: usage.inputTokens as number,
        outputTokens: usage.outputTokens as number,
      });
      const completion: unknown = account.chargeUsage(fixedUsage);
      if (completion !== undefined) {
        budgetOwnerUnsettled = true;
        if (types.isPromise(completion))
          void Promise.prototype.then.call(completion, undefined, () => undefined);
        fail('USAGE_UNAVAILABLE');
      }
      usageSettlement = 'RECORDED';
    } catch (error) {
      usageFailed = true;
      usageFailure = error;
    }
    checkpoint();
    if (usageFailed) throw usageFailure;
    if (!fixedUsage) fail('USAGE_UNAVAILABLE');
    const response = copy(received, maxOutputBytes, 'MODEL_OUTPUT_TOO_LARGE');
    fields(
      response,
      ['structuredOutput', 'identity', 'usage', 'finishReason', 'outputDigest', 'warnings'],
      'MODEL_OUTPUT_INVALID',
    );
    if (
      canonicalCompilationJson(response.identity, control) !==
      canonicalCompilationJson(fixedIdentity, control)
    )
      fail('MODEL_OUTPUT_INVALID');
    if (
      canonicalCompilationJson(response.usage, control) !==
      canonicalCompilationJson(fixedUsage, control)
    )
      fail('MODEL_OUTPUT_INVALID');
    if (response.finishReason === 'LENGTH' || response.finishReason === 'CANCELLED')
      fail('MODEL_OUTPUT_INCOMPLETE');
    if (
      response.finishReason !== 'STOP' ||
      !Array.isArray(response.warnings) ||
      !response.warnings.every((value) => typeof value === 'string')
    )
      fail('MODEL_OUTPUT_INVALID');
    account.reserveBuffer(maxOutputBytes);
    if (
      response.outputDigest !== hash(canonicalCompilationJson(response.structuredOutput, control))
    )
      fail('MODEL_OUTPUT_INVALID');
    account.own(response.structuredOutput);
    const output = claim
      ? parseClaim(response.structuredOutput, refs)
      : parseKnowledgeCandidate(response.structuredOutput, refs);
    if (
      canonicalCompilationJson(output.payload.scope, control) !==
      canonicalCompilationJson(scope, control)
    )
      fail('MODEL_OUTPUT_INVALID');
    if (!claim) {
      const candidate = output as ReturnType<typeof parseKnowledgeCandidate>;
      if (
        candidate.payload.type !== tasks.get(request.taskKind as string) ||
        canonicalCompilationJson(candidate.payload.inputSnapshotRef, control) !==
          canonicalCompilationJson(snapshot, control)
      )
        fail('MODEL_OUTPUT_INVALID');
    }
    checkpoint();
    return freeze(
      {
        structuredOutput: output,
        identity: fixedIdentity,
        usage: fixedUsage,
        inputDigest: request.inputDigest,
        outputDigest: response.outputDigest,
        warnings: response.warnings.length ? ['MODEL_WARNING_PRESENT'] : [],
        outputMode: capability,
        evidenceKind: 'TEST_DOUBLE' as const,
        checks: 'SCHEMA_AND_ALLOWED_REFS_ONLY' as const,
        confidence: 'NOT_VERIFIED' as const,
        quality: 'NOT_EVALUABLE' as const,
        publicationEffect: 'NOT_ATTEMPTED' as const,
        contextAuthorization: 'NOT_ESTABLISHED' as const,
      },
      checkpoint,
    );
  } catch (error) {
    const value = errorField(error, 'code');
    let code: Code = error instanceof SemanticTestInvocationError ? error.code : stage;
    if (
      typeof value === 'string' &&
      ['BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED', 'STAGE_LIMIT_EXCEEDED'].includes(value)
    )
      code = 'BUDGET_EXCEEDED';
    if (value === 'CANCELLED') code = 'CANCELLED';
    if (value === 'DEADLINE' || value === 'DEADLINE_EXCEEDED') code = 'DEADLINE';
    let unknown = budgetOwnerUnsettled || errorField(error, 'cleanupState') === 'UNKNOWN';
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    throw new SemanticTestInvocationError(code, unknown ? 'UNKNOWN' : 'SETTLED', usageSettlement);
  }
}
