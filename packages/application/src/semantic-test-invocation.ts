import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  assertRuntimeRequestControl,
  EntityRefSchema,
  KnowledgeScopeSchema,
  parseClaim,
  parseKnowledgeCandidate,
  parseKnowledgeRevision,
  parsePhase1ReferenceContext,
  ScopedRefSchema,
  scopedRefKey,
  supportKey,
  type ScopedRef,
  type SupportRef,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import type { DocumentAccount } from '../../documents/dist/source-positions.js';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
} from './compilation-input-contract.js';
import { KnowledgeBudget, KnowledgeControlStop } from '../../knowledge/dist/comparison-contract.js';
import {
  parseOwnedWikiRequest,
  validateOwnedPublishedSelection,
  type OwnedPublishedRecord,
} from '../../knowledge/dist/offline-wiki.js';

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
function knowledgeStopCode(error: unknown): Code | undefined {
  if (!(error instanceof KnowledgeControlStop)) return undefined;
  const message = errorField(error, 'message');
  if (message === 'CONTROL_CANCELLED') return 'CANCELLED';
  if (message === 'CONTROL_DEADLINE') return 'DEADLINE';
  if (message === 'CONTROL_BUDGET' || message === 'CONTROL_DEPTH') return 'BUDGET_EXCEEDED';
  return undefined;
}

/** Private self-owned fixture preparation only; snapshot validation is neither
 * capture provenance nor read/redaction/model permission. No I/O or truncation. */
export function buildCapturedSemanticTestRequest(
  input: unknown,
  options: unknown,
  controlValue: RuntimeRequestControl,
  account: DocumentAccount,
  capabilityInput?: unknown,
) {
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
    const o = fields(options, ['taskKind', 'promptRef', 'modelPolicyRef', 'invocationBudget']);
    const b = fields(o.invocationBudget, ['maxInputBytes', 'maxOutputBytes']);
    if (
      !positive(b.maxInputBytes) ||
      !positive(b.maxOutputBytes) ||
      !text(o.promptRef) ||
      !text(o.modelPolicyRef)
    )
      fail('MODEL_REQUEST_INVALID');
    // Legacy facts-only Capability requests stay unavailable.
    if (
      !['COMPONENT_SUMMARY', 'CLAIM_EXTRACTION', 'BUSINESS_FLOW_SYNTHESIS'].includes(
        o.taskKind as string,
      ) &&
      !(o.taskKind === 'CAPABILITY_SYNTHESIS' && capabilityInput !== undefined)
    )
      fail(tasks.has(o.taskKind as string) ? 'CAPABILITY_UNAVAILABLE' : 'MODEL_REQUEST_INVALID');
    const maxInputBytes = b.maxInputBytes;
    account.own(input);
    account.reserveBuffer(maxInputBytes);
    const bytes = canonicalCompilationJson(input, control);
    if (Buffer.byteLength(bytes) > maxInputBytes) fail('MODEL_INPUT_TOO_LARGE');
    checkpoint();
    const snapshot = parseCompilationInputSnapshot(JSON.parse(bytes), control);
    account.own(snapshot);
    const captured = new Map<string, { valueSchemaRef: string; value: unknown }>();
    const entities = new Map<string, ScopedRef>(),
      supports = new Map<string, SupportRef>();
    for (const { repoBasis } of snapshot.repositories) {
      checkpoint();
      account.visitItem();
      const ref = ScopedRefSchema.parse({
        scope: 'REPOSITORY',
        repositoryId: repoBasis.repositoryId,
        entity: {
          kind: 'REPOSITORY',
          id: repoBasis.repositoryId,
          revisionId: repoBasis.revisionId,
        },
      });
      entities.set(scopedRefKey(ref), ref);
    }
    const captures = [
      ...snapshot.repositories,
      ...snapshot.documents,
      ...(snapshot.workspaceCapture ? [snapshot.workspaceCapture] : []),
    ];
    for (const capture of captures) {
      checkpoint();
      for (const entity of capture.entities) {
        account.visitItem();
        entities.set(scopedRefKey(entity.ref), entity.ref);
        captured.set(scopedRefKey(entity.ref), entity);
      }
      for (const support of capture.supports) {
        checkpoint();
        account.visitItem();
        const basis = support.ref.basis;
        const ref = ScopedRefSchema.parse(
          'repositoryId' in basis
            ? { scope: 'REPOSITORY', repositoryId: basis.repositoryId, entity: support.ref.entity }
            : { scope: 'WORKSPACE', workspaceId: snapshot.workspaceId, entity: support.ref.entity },
        );
        entities.set(scopedRefKey(ref), ref);
        captured.set(scopedRefKey(ref), support);
        supports.set(supportKey(support.ref), support.ref);
      }
    }
    const ordered = <T>(map: Map<string, T>) =>
      [...map]
        .sort(([a], [b]) => {
          checkpoint();
          account.visitItem();
          return a < b ? -1 : a > b ? 1 : 0;
        })
        .map(([, value]) => value);
    let capabilityInputs:
      | {
          schemaVersion: 1;
          capturedInputDigest: string;
          selectionDigest: string;
          components: OwnedPublishedRecord[];
        }
      | undefined;
    if (o.taskKind === 'CAPABILITY_SYNTHESIS') {
      account.own(capabilityInput);
      account.reserveBuffer(maxInputBytes);
      const encoded = canonicalCompilationJson(capabilityInput, control);
      if (Buffer.byteLength(encoded) > maxInputBytes) fail('MODEL_INPUT_TOO_LARGE');
      const input = fields(JSON.parse(encoded), [
        'selectedComponents',
        'knowledge',
        'sourceInputs',
      ]);
      const selection = parseOwnedWikiRequest(
        {
          workspaceId: snapshot.workspaceId,
          repositoryIds: snapshot.selection.repositoryIds,
          selectedPublishedRevisionRefs: input.selectedComponents,
          customizationPolicy: 'LOCKED',
          allowPartial: false,
        },
        control,
      );
      if (!selection.selectedPublishedRevisionRefs.length) fail('CAPABILITY_UNAVAILABLE');
      const components = validateOwnedPublishedSelection(
        selection,
        input.knowledge,
        new KnowledgeBudget(control),
      );
      if (!Array.isArray(input.sourceInputs) || input.sourceInputs.length !== components.length)
        fail('CAPABILITY_UNAVAILABLE');
      const bindings = new Map<string, string>();
      for (const value of input.sourceInputs) {
        checkpoint();
        account.visitItem();
        const b = fields(value, ['itemId', 'revisionId', 'capturedInputDigest']);
        const key = canonicalCompilationJson([b.itemId, b.revisionId], control);
        if (bindings.has(key) || b.capturedInputDigest !== snapshot.inputDigest)
          fail('CAPABILITY_UNAVAILABLE');
        bindings.set(key, b.capturedInputDigest as string);
      }
      const capturedContext = {
        availableEntities: ordered(entities),
        availableSupports: ordered(supports),
      };
      for (const row of components) {
        checkpoint();
        account.visitItem();
        const item = row.itemEnvelope.payload,
          revision = row.revisionEnvelope.payload;
        const key = canonicalCompilationJson([item.id, revision.id], control);
        if (
          item.type !== 'COMPONENT' ||
          revision.structuredContent.kind !== 'COMPONENT' ||
          row.currentHeadRevisionId !== revision.id ||
          !bindings.delete(key) ||
          row.provenance.snapshotId !== snapshot.snapshotId ||
          row.provenance.revisionSetId !== snapshot.revisionSetId
        )
          fail('CAPABILITY_UNAVAILABLE');
        // Stored metadata is not a substitute for the full captured support values.
        parseKnowledgeRevision(row.revisionEnvelope, capturedContext);
        for (const support of revision.supportRefs) {
          checkpoint();
          account.visitItem();
          if (!supports.has(supportKey(support))) fail('CAPABILITY_UNAVAILABLE');
        }
        for (const ref of row.coverage.unverifiedRefs) {
          checkpoint();
          account.visitItem();
          if (!entities.has(scopedRefKey(ref))) fail('CAPABILITY_UNAVAILABLE');
        }
      }
      if (bindings.size) fail('CAPABILITY_UNAVAILABLE');
      // Only the selected opaque published IDs become new allowed references.
      for (const row of components) {
        checkpoint();
        account.visitItem();
        const item = row.itemEnvelope.payload;
        const ref = ScopedRefSchema.parse({
          ...(item.scope.kind === 'REPOSITORY'
            ? { scope: 'REPOSITORY', repositoryId: item.scope.repositoryId }
            : { scope: 'WORKSPACE', workspaceId: item.scope.workspaceId }),
          entity: { kind: 'COMPONENT', id: item.id, revisionId: row.revisionEnvelope.payload.id },
        });
        entities.set(scopedRefKey(ref), ref);
      }
      capabilityInputs = {
        schemaVersion: 1,
        capturedInputDigest: snapshot.inputDigest,
        selectionDigest: (input.knowledge as { selectionDigest: string }).selectionDigest,
        components,
      };
    }
    // This is only an explicit structural association, never business intent,
    // causal ordering, execution evidence or a stable knowledge identity.
    let businessFlowInputs;
    if (o.taskKind === 'BUSINESS_FLOW_SYNTHESIS') {
      const bindings = snapshot.workspaceCapture?.contractBindings?.bindings;
      const selected = new Map<string, ScopedRef>();
      for (const ref of snapshot.selection.selectedEntityRefs) {
        checkpoint();
        account.visitItem();
        if (ref.entity.kind === 'RUNTIME_FLOW') selected.set(scopedRefKey(ref), ref);
      }
      if (!bindings || selected.size === 0) fail('CAPABILITY_UNAVAILABLE');
      const flows = ordered(selected).map((runtimeFlowRef) => {
        checkpoint();
        const flowRecord = captured.get(scopedRefKey(runtimeFlowRef));
        if (flowRecord?.valueSchemaRef !== 'RuntimeFlow@1') fail('CAPABILITY_UNAVAILABLE');
        const flow = flowRecord.value as import('@codeatlas/ir').RuntimeFlow;
        const entryRecord = captured.get(scopedRefKey(flow.entryRef));
        if (entryRecord?.valueSchemaRef !== 'EntryPoint@1') fail('CAPABILITY_UNAVAILABLE');
        const entry =
          entryRecord.value as import('@codeatlas/ir').RuntimeFactSet['entryPoints'][number];
        const contractRef = entry.contractRef;
        if (
          !contractRef ||
          captured.get(scopedRefKey(contractRef))?.valueSchemaRef !== 'Contract@1'
        )
          fail('CAPABILITY_UNAVAILABLE');
        const matching = bindings.filter((binding) => {
          checkpoint();
          account.visitItem();
          return scopedRefKey(binding.contractRef) === scopedRefKey(contractRef);
        });
        if (matching.length !== 1) fail('CAPABILITY_UNAVAILABLE');
        const binding = matching[0]!;
        if (captured.get(scopedRefKey(binding.serviceRef))?.valueSchemaRef !== 'Service@1')
          fail('CAPABILITY_UNAVAILABLE');
        for (const ref of binding.supportRefs) {
          checkpoint();
          account.visitItem();
          if (!supports.has(supportKey(ref))) fail('CAPABILITY_UNAVAILABLE');
        }
        return {
          runtimeFlowRef,
          entryRef: flow.entryRef,
          contractRef,
          serviceRef: binding.serviceRef,
          bindingSupportRefs: binding.supportRefs,
        };
      });
      businessFlowInputs = {
        schemaVersion: 1 as const,
        capturedInputDigest: snapshot.inputDigest,
        flows,
      };
    }
    const authorizedContext = {
      instructionRef: o.promptRef,
      dataLabel: 'UNTRUSTED_DATA' as const,
      scope: snapshot.scope,
      inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: snapshot.snapshotId },
      data: {
        snapshot,
        ...(businessFlowInputs ? { businessFlowInputs } : {}),
        ...(capabilityInputs ? { capabilityInputs } : {}),
      },
      referenceContext: {
        availableEntities: ordered(entities),
        availableSupports: ordered(supports),
      },
    };
    account.own(authorizedContext);
    account.reserveBuffer(maxInputBytes);
    const request = {
      taskKind: o.taskKind,
      promptRef: o.promptRef,
      modelPolicyRef: o.modelPolicyRef,
      outputSchemaRef:
        o.taskKind === 'CLAIM_EXTRACTION' ? 'codeatlas.claim@1' : 'codeatlas.knowledge-candidate@1',
      authorizedContext,
      inputDigest: hash(canonicalCompilationJson(authorizedContext, control)),
      invocationBudget: { maxInputBytes, maxOutputBytes: b.maxOutputBytes },
    };
    account.own(request);
    account.reserveBuffer(maxInputBytes);
    if (Buffer.byteLength(canonicalCompilationJson(request, control)) > maxInputBytes)
      fail('MODEL_INPUT_TOO_LARGE');
    return freeze(request, checkpoint);
  } catch (error) {
    const value = errorField(error, 'code');
    let code: Code =
      error instanceof SemanticTestInvocationError
        ? error.code
        : (knowledgeStopCode(error) ?? 'MODEL_REQUEST_INVALID');
    if (value === 'CANCELLED') code = 'CANCELLED';
    if (value === 'DEADLINE' || value === 'DEADLINE_EXCEEDED') code = 'DEADLINE';
    if (
      value === 'BUDGET_EXCEEDED' ||
      value === 'HISTORY_LIMIT_EXCEEDED' ||
      value === 'STAGE_LIMIT_EXCEEDED'
    )
      code = 'BUDGET_EXCEEDED';
    let unknown = errorField(error, 'cleanupState') === 'UNKNOWN';
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    throw new SemanticTestInvocationError(code, unknown ? 'UNKNOWN' : 'SETTLED');
  }
}

/** Joins self-owned captured input to the local double and retains input coverage.
 * Does not authorize consumption or establish semantic grounding/quality. */
export async function runCapturedSemanticTestDouble(
  input: unknown,
  options: unknown,
  port: unknown,
  controlValue: RuntimeRequestControl,
  account: SemanticInvocationAccount,
  capabilityInput?: unknown,
) {
  let phase: 'SETUP' | 'PREPARING' | 'INVOKING' | 'VALIDATING' = 'SETUP';
  try {
    const control = Object.freeze({
      ...fields(controlValue, ['signal', 'deadlineEpochMs', 'maxItems', 'maxDepth']),
    }) as unknown as RuntimeRequestControl;
    phase = 'PREPARING';
    const request = buildCapturedSemanticTestRequest(
      input,
      options,
      control,
      account,
      capabilityInput,
    );
    phase = 'INVOKING';
    const result = await runSemanticTestDouble(request, port, control, account);
    phase = 'VALIDATING';
    const checkpoint = () => {
      account.checkpoint();
      if (nativeAborted.call(control.signal)) fail('CANCELLED');
      if (Date.now() >= control.deadlineEpochMs) fail('DEADLINE');
    };
    checkpoint();
    const snapshot = request.authorizedContext.data.snapshot;
    const rank = { UNSUPPORTED: 0, PARTIAL: 1, COMPLETE: 2 };
    let status = snapshot.coverage.status;
    const inputLimitations = new Set<string>(),
      inputUnverified = new Map<string, ScopedRef>();
    const coverages = [
      snapshot.coverage,
      ...snapshot.repositories.map((capture) => capture.coverage),
      ...snapshot.documents.map((capture) => capture.coverage),
      ...(snapshot.workspaceCapture ? [snapshot.workspaceCapture.coverage] : []),
      ...(request.authorizedContext.data.capabilityInputs?.components.map((row) => row.coverage) ??
        []),
    ];
    for (const coverage of coverages) {
      checkpoint();
      account.own(coverage);
      if (rank[coverage.status] < rank[status]) status = coverage.status;
      for (const limitation of coverage.limitations) {
        checkpoint();
        account.visitItem();
        inputLimitations.add(limitation);
      }
      for (const ref of coverage.unverifiedRefs) {
        checkpoint();
        account.visitItem();
        inputUnverified.set(scopedRefKey(ref), ref);
      }
    }
    const compare = (a: string, b: string) => {
      checkpoint();
      account.visitItem();
      return a < b ? -1 : a > b ? 1 : 0;
    };
    const capturedCoverage = {
      status,
      limitations: [...inputLimitations].sort(compare),
      unverifiedRefs: [...inputUnverified].sort(([a], [b]) => compare(a, b)).map(([, ref]) => ref),
    };
    account.own(capturedCoverage);
    const payload = result.structuredOutput.payload;
    if ('coverage' in payload) {
      const coverage = payload.coverage;
      account.own(coverage);
      if (rank[coverage.status] > rank[capturedCoverage.status]) fail('MODEL_OUTPUT_INVALID');
      const limitations = new Set(coverage.limitations);
      const unverified = new Set(coverage.unverifiedRefs.map(scopedRefKey));
      for (const limitation of capturedCoverage.limitations) {
        checkpoint();
        account.visitItem();
        if (!limitations.has(limitation)) fail('MODEL_OUTPUT_INVALID');
      }
      for (const ref of capturedCoverage.unverifiedRefs) {
        checkpoint();
        account.visitItem();
        if (!unverified.has(scopedRefKey(ref))) fail('MODEL_OUTPUT_INVALID');
      }
    }
    const output = {
      ...result,
      capturedInputDigest: snapshot.inputDigest,
      capturedCoverage,
    };
    account.own(output);
    return freeze(output, checkpoint);
  } catch (error) {
    // These owned stages already invalidate/report their failure; never settle twice.
    if (phase === 'PREPARING' || phase === 'INVOKING') throw error;
    const value = errorField(error, 'code');
    let code: Code =
      error instanceof SemanticTestInvocationError
        ? error.code
        : phase === 'SETUP'
          ? 'MODEL_REQUEST_INVALID'
          : 'MODEL_OUTPUT_INVALID';
    if (value === 'CANCELLED') code = 'CANCELLED';
    if (value === 'DEADLINE' || value === 'DEADLINE_EXCEEDED') code = 'DEADLINE';
    if (
      value === 'BUDGET_EXCEEDED' ||
      value === 'HISTORY_LIMIT_EXCEEDED' ||
      value === 'STAGE_LIMIT_EXCEEDED'
    )
      code = 'BUDGET_EXCEEDED';
    let unknown = errorField(error, 'cleanupState') === 'UNKNOWN';
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    throw new SemanticTestInvocationError(
      code,
      unknown ? 'UNKNOWN' : 'SETTLED',
      phase === 'VALIDATING' ? 'RECORDED' : 'NOT_ATTEMPTED',
    );
  }
}

/** Owned Store composition only. The synchronous query must be fixed to an owned
 * test database; no response value grants production read or generation rights. */
export async function runOwnedCapabilityTestDouble(
  input: unknown,
  options: unknown,
  readPublished: (
    refs: readonly { itemId: string; revisionId: string }[],
    control: RuntimeRequestControl,
  ) => unknown,
  port: unknown,
  controlValue: RuntimeRequestControl,
  account: SemanticInvocationAccount,
) {
  let delegated = false;
  try {
    const control = Object.freeze({
      ...fields(controlValue, ['signal', 'deadlineEpochMs', 'maxItems', 'maxDepth']),
    }) as unknown as RuntimeRequestControl;
    const raw = fields(options, [
      'selectedComponents',
      'promptRef',
      'modelPolicyRef',
      'invocationBudget',
    ]);
    account.own(options);
    const fixed = JSON.parse(canonicalCompilationJson(raw, control));
    delegated = true;
    // Own and validate all input before calling even a trusted read callback.
    const base = buildCapturedSemanticTestRequest(
      input,
      {
        taskKind: 'COMPONENT_SUMMARY',
        promptRef: fixed.promptRef,
        modelPolicyRef: fixed.modelPolicyRef,
        invocationBudget: fixed.invocationBudget,
      },
      control,
      account,
    );
    delegated = false;
    const snapshot = base.authorizedContext.data.snapshot;
    const selection = parseOwnedWikiRequest(
      {
        workspaceId: snapshot.workspaceId,
        repositoryIds: snapshot.selection.repositoryIds,
        selectedPublishedRevisionRefs: fixed.selectedComponents,
        customizationPolicy: 'LOCKED',
        allowPartial: false,
      },
      control,
    );
    if (
      !selection.selectedPublishedRevisionRefs.length ||
      typeof readPublished !== 'function' ||
      types.isProxy(readPublished) ||
      types.isAsyncFunction(readPublished)
    )
      fail('CAPABILITY_UNAVAILABLE');
    account.checkpoint();
    const received = readPublished(selection.selectedPublishedRevisionRefs, control);
    if (types.isPromise(received)) {
      void Promise.prototype.then.call(received, undefined, () => undefined);
      throw new SemanticTestInvocationError('CAPABILITY_UNAVAILABLE', 'UNKNOWN');
    }
    account.checkpoint();
    const result = fields(received, ['knowledge', 'sourceInputs']);
    delegated = true;
    return await runCapturedSemanticTestDouble(
      snapshot,
      {
        taskKind: 'CAPABILITY_SYNTHESIS',
        promptRef: fixed.promptRef,
        modelPolicyRef: fixed.modelPolicyRef,
        invocationBudget: fixed.invocationBudget,
      },
      port,
      control,
      account,
      {
        selectedComponents: selection.selectedPublishedRevisionRefs,
        knowledge: result.knowledge,
        sourceInputs: result.sourceInputs,
      },
    );
  } catch (error) {
    if (delegated) throw error;
    let unknown = errorField(error, 'cleanupState') === 'UNKNOWN';
    let code: Code =
      error instanceof SemanticTestInvocationError
        ? error.code
        : (knowledgeStopCode(error) ?? 'CAPABILITY_UNAVAILABLE');
    const value = errorField(error, 'code');
    if (value === 'CANCELLED') code = 'CANCELLED';
    if (value === 'DEADLINE' || value === 'DEADLINE_EXCEEDED') code = 'DEADLINE';
    if (
      ['BUDGET_EXCEEDED', 'HISTORY_LIMIT_EXCEEDED', 'STAGE_LIMIT_EXCEEDED'].includes(
        value as string,
      )
    )
      code = 'BUDGET_EXCEEDED';
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    throw new SemanticTestInvocationError(code, unknown ? 'UNKNOWN' : 'SETTLED');
  }
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
