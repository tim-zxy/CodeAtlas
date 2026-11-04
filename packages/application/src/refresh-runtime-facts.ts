import {
  RuntimeDerivationV2Schema,
  runtimeSitePlanDigest,
  basisKey,
  type RuntimeDerivationV2,
} from '@codeatlas/ir';
import {
  EntityIdSchema,
  RepoBasisSchema,
  Phase1CoverageSchema,
  ensurePhase1Data,
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  assertRuntimeRequestControl,
  runtimeStopReason,
  type RepoBasis,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { authorizeOperation, type OperationPolicyInput } from './operation-policy.js';
export type RuntimeInputIdentity = {
  codeBasis: RepoBasis;
  syntaxActivationId: string;
  syntaxMembershipDigest: string;
  runtimeActivationId: string | null;
};
export type CompleteRuntimeCandidate = {
  facts: ReturnType<typeof parseRuntimeFactSet>;
  bindings: ReturnType<typeof parseFrameworkBindingSet>;
  coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
  termination: 'COMPLETE';
};
export interface RuntimeWorkflowRequest {
  workspaceId: string;
  repositoryId: string | null;
  policy: OperationPolicyInput;
  control: RuntimeRequestControl;
}
export interface RuntimeRefreshPorts<TResult> {
  capture(): { status: 'AVAILABLE' | 'UNAVAILABLE'; identity: RuntimeInputIdentity | null };
  derive(
    identity: Readonly<RuntimeInputIdentity>,
    control: RuntimeRequestControl,
  ): Promise<unknown>;
  apply(input: { expected: RuntimeInputIdentity; candidate: CompleteRuntimeCandidate }): TResult;
}
export function authorizeRuntimeWorkflow(
  request: RuntimeWorkflowRequest,
  operation: 'INDEX' | 'QUERY',
) {
  EntityIdSchema.parse(request.workspaceId);
  if (request.repositoryId !== null) EntityIdSchema.parse(request.repositoryId);
  assertRuntimeRequestControl(request.control);
  const p = request.policy;
  const decision = authorizeOperation(p);
  if (!decision.allowed) throw Error(decision.code);
  if (
    p.operation !== operation ||
    p.destination !== 'LOCAL' ||
    p.scope.workspaceId !== request.workspaceId ||
    p.scope.repositoryId !== request.repositoryId
  )
    throw Error('PERMISSION_DENIED');
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
/** Trusted domain ports prepare candidates; only this authorized workflow asks Store to publish. */
export type CompleteRuntimeCandidateV2 = CompleteRuntimeCandidate & {
  derivation: RuntimeDerivationV2;
};
export interface RuntimeRefreshPortsV2<TResult> extends Omit<
  RuntimeRefreshPorts<TResult>,
  'apply'
> {
  apply(input: { expected: RuntimeInputIdentity; candidate: CompleteRuntimeCandidateV2 }): TResult;
}
export async function refreshRuntimeFacts<TResult>(
  request: RuntimeWorkflowRequest,
  ports: RuntimeRefreshPorts<TResult>,
) {
  return refresh(request, ports);
}
export async function refreshRuntimeFactsV2<TResult>(
  request: RuntimeWorkflowRequest,
  ports: RuntimeRefreshPortsV2<TResult>,
) {
  return refresh(
    request,
    {
      ...ports,
      apply: (value) =>
        ports.apply({ ...value, candidate: value.candidate as CompleteRuntimeCandidateV2 }),
    },
    true,
  );
}
async function refresh<TResult>(
  request: RuntimeWorkflowRequest,
  ports: RuntimeRefreshPorts<TResult>,
  surface = false,
) {
  authorizeRuntimeWorkflow(request, 'INDEX');
  const stop = () => runtimeStopReason(request.control);
  let reason = stop();
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  const capture = ports.capture();
  ensurePhase1Data(capture);
  if (capture.status !== 'AVAILABLE' || !capture.identity) throw Error('RUNTIME_INPUT_UNAVAILABLE');
  const expected = freeze(structuredClone(capture.identity));
  RepoBasisSchema.parse(expected.codeBasis);
  if (expected.codeBasis.repositoryId !== request.repositoryId) throw Error('PERMISSION_DENIED');
  const value = await ports.derive(expected, request.control);
  reason = stop();
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  ensurePhase1Data(value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('INVALID_RUNTIME_CANDIDATE');
  const raw = value as Record<string, unknown>;
  const facts = parseRuntimeFactSet(raw.facts),
    bindings = parseFrameworkBindingSet(raw.bindings, facts),
    coverage = Phase1CoverageSchema.parse(raw.coverage);
  if (raw.termination !== 'COMPLETE' || coverage.status !== 'COMPLETE')
    return { status: 'NOT_PUBLISHED' as const, reason: 'PARTIAL' as const };
  if ('frontier' in raw && (!Array.isArray(raw.frontier) || raw.frontier.length))
    throw Error('INVALID_RUNTIME_CANDIDATE');
  if (!surface && ('derivation' in raw || 'coverageScope' in raw))
    throw Error('INVALID_RUNTIME_CANDIDATE');
  const derivation = surface ? RuntimeDerivationV2Schema.parse(raw.derivation) : null;
  if (
    derivation &&
    (raw.coverageScope !== 'LOCAL_DECLARED_RUNTIME' ||
      basisKey(derivation.sitePlan.basis) !== basisKey(expected.codeBasis) ||
      derivation.sitePlan.syntaxMembershipDigest !== expected.syntaxMembershipDigest ||
      runtimeSitePlanDigest(derivation.sitePlan) !== derivation.sitePlanDigest)
  )
    throw Error('INVALID_RUNTIME_CANDIDATE');
  const candidate = {
    facts,
    bindings,
    coverage,
    ...(derivation ? { derivation } : {}),
    termination: 'COMPLETE' as const,
  };
  reason = stop();
  if (reason) return { status: 'NOT_PUBLISHED' as const, reason };
  return ports.apply({ expected, candidate });
}
