import { frozenContractReferenceContext } from '@codeatlas/ir';
import {
  FrozenContractSetV2Schema,
  parseFrozenContractSetV2,
  workspaceRuntimeInputDigestV2,
  canonicalRuntimeJson,
  type RuntimeRequestControl as BaseControl,
  type FrozenContractSetV2,
  type DerivedHttpSchemaDeclaration,
} from '@codeatlas/ir';
import { createHash } from 'node:crypto';
import {
  FrozenContractSetSchema,
  workspaceRuntimeInputDigest,
  parseFrozenContractSet,
  parseContractMatch,
  parseIr,
  phase1Assert,
  ensurePhase1Data,
  scopedRefKey,
  supportKey,
  basisKey,
  entityRefKey,
  assertRuntimeRequestControl,
  runtimeStopReason,
  type FrozenContractSet,
  type ScopedRef,
  type SupportRef,
  type ContractMatch,
  type RuntimeRequestControl,
  type Phase1ReferenceContext,
} from '@codeatlas/ir';
export const contractSupportPolicy = 'contract-support-bound-v1';
export const hashTuple = (domain: string, tuple: unknown[]) =>
  createHash('sha256')
    .update(domain + '\0' + JSON.stringify(tuple))
    .digest('hex');
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v !== null && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
          .join(',') +
        '}'
      : JSON.stringify(v)!;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function workspaceEntityIdentity(
  b: FrozenContractSet['workspaceBasis'],
  kind: string,
  prefix: string,
  meaning: unknown[],
) {
  const factKey = prefix + hashTuple('phase1-workspace-fact-v1', [b.workspaceId, kind, meaning]);
  return {
    factKey,
    id:
      'workspace-entity:' +
      hashTuple('phase1-workspace-entity-v1', [b.workspaceId, b.revisionSetId, kind, factKey]),
  };
}
export { workspaceRuntimeInputDigest } from '@codeatlas/ir';
/** Structural frozen-input closure. Actual RevisionSet/currentness is authenticated by Application/Store. */
export function prepareFrozenContracts(input: unknown): {
  set: FrozenContractSet;
  context: Phase1ReferenceContext;
} {
  ensurePhase1Data(input);
  const raw = parseIr(FrozenContractSetSchema, input);
  const context = frozenContractReferenceContext(raw);
  const set = parseFrozenContractSet(raw, context);
  phase1Assert(workspaceRuntimeInputDigest(set) === set.workspaceBasis.workspaceActivationDigest);
  return { set, context };
}
export type ContractMatchingCandidate = {
  matches: ReturnType<typeof parseContractMatch>[];
  workspaceBasis: FrozenContractSet['workspaceBasis'];
  inputDigest: string;
  frontier: ScopedRef[];
  termination: 'COMPLETE' | 'BUDGET' | 'CANCELLED' | 'DEADLINE';
  coverage: { status: 'PARTIAL' | 'COMPLETE'; limitations: string[]; unverifiedRefs: ScopedRef[] };
};
export function matchContracts(
  input: unknown,
  control: RuntimeRequestControl,
): ContractMatchingCandidate {
  return matchCore(input, control);
}
export type DeclaredContractControl = BaseControl & { maxInputBytes: number };
export type DeclaredContractMatchingCandidate = ContractMatchingCandidate & {
  consumed: { items: number; inputBytes: number };
};
export function prepareFrozenContractsV2(
  input: unknown,
  control: DeclaredContractControl,
): {
  set: FrozenContractSetV2;
  context: Phase1ReferenceContext;
  declarations: readonly DerivedHttpSchemaDeclaration[];
  consumed: { items: number; inputBytes: number };
} {
  assertRuntimeRequestControl(control);
  ensurePhase1Data(input);
  const raw = FrozenContractSetV2Schema.parse(input),
    context = frozenContractReferenceContext(
      raw,
      raw.schemaDocuments.map((d) => d.sourceSupport),
    );
  return { ...parseFrozenContractSetV2(raw, context, control), context };
}
export function matchContractsV2(
  input: unknown,
  control: DeclaredContractControl,
): DeclaredContractMatchingCandidate {
  return matchCore(
    input,
    control,
    prepareFrozenContractsV2(input, control),
  ) as DeclaredContractMatchingCandidate;
}
function matchCore(
  input: unknown,
  control: RuntimeRequestControl,
  prepared?: ReturnType<typeof prepareFrozenContractsV2>,
) {
  assertRuntimeRequestControl(control);
  const { set, context } = prepared ?? prepareFrozenContracts(input);
  const declarations = new Map(prepared?.declarations.map((d) => [scopedRefKey(d.contractRef), d]));
  const services = new Map(set.catalog.services.map((s) => [String(s.id), s]));
  const ownServices = (ref: ScopedRef) =>
    set.catalog.contractBindings
      .filter((b) => scopedRefKey(b.contractRef) === scopedRefKey(ref))
      .map((b) => b.serviceRef.entity.id);
  const consumerRows = set.contractRefs
    .filter((r) => r.contract.direction === 'CONSUMER')
    .sort((a, b) => cmp(scopedRefKey(a.ref), scopedRefKey(b.ref)));
  const matches: ReturnType<typeof parseContractMatch>[] = [],
    frontier: ScopedRef[] = [];
  let used = prepared?.consumed.items ?? 0,
    termination: 'COMPLETE' | 'BUDGET' | 'CANCELLED' | 'DEADLINE' = 'COMPLETE';
  const limitations = new Set<string>();
  for (const row of consumerRows) {
    const why = runtimeStopReason(control);
    if (why) {
      termination = why;
      frontier.push(row.ref);
      limitations.add('MATCH_TERMINATED_' + why);
      break;
    }
    const consumer = row.contract,
      sig = consumer.signature;
    const targetIdentities = set.catalog.entries.filter((e) =>
      sig.kind === 'MESSAGE'
        ? sig.namespace !== null &&
          e.identityKind === 'MESSAGE_NAMESPACE' &&
          e.namespace === sig.transport &&
          e.key === sig.namespace
        : e.identityKind === 'LOGICAL_SERVICE' &&
          e.key === (sig.kind === 'HTTP' ? sig.serviceHint : sig.service),
    );
    const serviceIds = new Set(targetIdentities.map((e) => String(e.serviceRef.entity.id)));
    const schemaSupports: SupportRef[] = [],
      declaredCompatible = new Set<string>();
    const reasons: string[] = [],
      compatible: typeof set.contractRefs = [],
      conflicts: typeof set.contractRefs = [],
      unknown: typeof set.contractRefs = [];
    let status: ContractMatch['status'] = 'UNRESOLVED';
    const targets = [...serviceIds].map((id) => services.get(id)!);
    let candidates: typeof set.contractRefs = [];
    if (!targetIdentities.length) reasons.push('SERVICE_IDENTITY_UNPROVEN');
    else if (
      sig.kind === 'MESSAGE' &&
      !ownServices(row.ref).some((id) => serviceIds.has(String(id)))
    )
      reasons.push('CONSUMER_MESSAGE_NAMESPACE_UNPROVEN');
    else if (targets.length === 1 && targets[0]!.location !== 'WORKSPACE') {
      status = targets[0]!.location;
      reasons.push('EXPLICIT_SERVICE_REGISTRATION');
    } else {
      candidates = set.contractRefs.filter(
        (r) =>
          r.contract.direction === 'PROVIDER' &&
          r.contract.protocol === consumer.protocol &&
          ownServices(r.ref).some((id) => serviceIds.has(String(id))),
      );
      for (const provider of candidates) {
        const s = provider.contract.signature;
        let contradiction = false,
          unproved = false;
        const schemas: [ScopedRef | null, ScopedRef | null][] = [];
        if (sig.kind === 'HTTP' && s.kind === 'HTTP') {
          contradiction =
            sig.method !== s.method || sig.pathSegments.length !== s.pathSegments.length;
          if (!contradiction)
            for (let i = 0; i < sig.pathSegments.length; i++) {
              const a = sig.pathSegments[i]!,
                b = s.pathSegments[i]!;
              if (b.kind === 'LITERAL') {
                if (a.kind === 'PARAMETER') unproved = true;
                else if (a.value !== b.value) contradiction = true;
              }
            }
          schemas.push(
            [sig.querySchemaRef, s.querySchemaRef],
            [sig.requestSchemaRef, s.requestSchemaRef],
            [sig.responseSchemaRef, s.responseSchemaRef],
          );
        } else if (sig.kind === 'MESSAGE' && s.kind === 'MESSAGE') {
          contradiction =
            sig.role !== 'CONSUMER' ||
            s.role !== 'PRODUCER' ||
            sig.transport !== s.transport ||
            sig.channel !== s.channel;
          unproved = sig.namespace === null || s.namespace === null;
          if (!unproved && sig.namespace !== s.namespace) contradiction = true;
          schemas.push(
            [sig.payloadSchemaRef, s.payloadSchemaRef],
            [sig.keySchemaRef, s.keySchemaRef],
          );
        } else if (sig.kind === 'RPC' && s.kind === 'RPC') {
          contradiction = sig.service !== s.service || sig.operation !== s.operation;
          schemas.push(
            [sig.requestSchemaRef, s.requestSchemaRef],
            [sig.responseSchemaRef, s.responseSchemaRef],
          );
        } else contradiction = true;
        const declaredHttp =
          prepared &&
          sig.kind === 'HTTP' &&
          s.kind === 'HTTP' &&
          schemas.every(([a, b]) => a === null && b === null);
        if (declaredHttp) {
          const a = declarations.get(scopedRefKey(row.ref)),
            b = declarations.get(scopedRefKey(provider.ref));
          if (a) schemaSupports.push(a.sourceSupport);
          if (b) schemaSupports.push(b.sourceSupport);
          if (used >= control.maxItems) {
            termination = 'BUDGET';
            break;
          }
          used++;
          if (!a || !b) unproved = true;
          else if (
            canonicalRuntimeJson([a.query, a.request, a.response]) !==
            canonicalRuntimeJson([b.query, b.request, b.response])
          )
            contradiction = true;
          else declaredCompatible.add(scopedRefKey(provider.ref));
        } else if (schemas.some(([a, b]) => !a || !b || scopedRefKey(a) !== scopedRefKey(b)))
          unproved = true;
        (contradiction ? conflicts : unproved ? unknown : compatible).push(provider);
      }
      if (compatible.length > 1) {
        status = 'AMBIGUOUS';
        reasons.push('MULTIPLE_SUPPORTED_PROVIDERS');
      } else if (compatible.length === 1 && (sig.kind === 'MESSAGE' || serviceIds.size === 1)) {
        status = 'MATCHED';
        reasons.push('UNIQUE_SUPPORTED_PROVIDER');
      } else if (!compatible.length && !unknown.length && conflicts.length) {
        status = 'CONFLICTED';
        reasons.push('CONTRACT_SIGNATURE_CONFLICT');
      } else
        reasons.push(
          sig.kind !== 'MESSAGE' && serviceIds.size > 1
            ? 'SERVICE_IDENTITY_AMBIGUOUS'
            : unknown.length
              ? 'SCHEMA_COMPATIBILITY_UNPROVEN'
              : 'NO_SUPPORTED_PROVIDER',
        );
    }
    const selected = status === 'MATCHED' ? compatible[0]!.ref : null;
    if (selected && declaredCompatible.has(scopedRefKey(selected)))
      reasons.push('DECLARED_HTTP_SCHEMA_EXACT_V1');
    const candidateRows =
      status === 'MATCHED' || status === 'AMBIGUOUS'
        ? compatible
        : status === 'CONFLICTED'
          ? conflicts
          : [];
    const candidateProviderRefs = candidateRows
      .map((r) => r.ref)
      .sort((a, b) => cmp(scopedRefKey(a), scopedRefKey(b)));
    const usedRows = [row, ...candidates];
    const registrations = set.catalog.contractBindings.filter((b) =>
      usedRows.some((r) => scopedRefKey(r.ref) === scopedRefKey(b.contractRef)),
    );
    const allSupports = [
      ...schemaSupports,
      ...usedRows.flatMap((r) => r.contract.supportRefs),
      ...targetIdentities.flatMap((i) => i.supportRefs),
      ...targets.flatMap((t) => t.supportRefs),
      ...registrations.flatMap((r) => r.supportRefs),
    ];
    const supportRefs = [...new Map(allSupports.map((s) => [supportKey(s), s])).values()].sort(
      (a, b) => cmp(supportKey(a), supportKey(b)),
    );
    const basisRefs = [
      ...new Map(supportRefs.map((s) => [basisKey(s.basis), s.basis])).values(),
    ].sort((a, b) => cmp(basisKey(a), basisKey(b)));
    const identity = workspaceEntityIdentity(
      set.workspaceBasis,
      'CONTRACT_MATCH',
      'contract-match:',
      [
        set.workspaceBasis.workspaceId,
        set.workspaceBasis.revisionSetId,
        [consumer.repositoryId, consumer.factKey],
      ],
    );
    if (prepared)
      identity.id =
        'workspace-entity:' +
        hashTuple('phase1-workspace-entity-v2', [
          set.workspaceBasis.workspaceId,
          set.workspaceBasis.revisionSetId,
          'CONTRACT_MATCH',
          identity.factKey,
          set.workspaceBasis.workspaceActivationDigest,
        ]);
    const value = {
      schema: 'codeatlas.contract-match',
      version: 1,
      payload: {
        ...identity,
        workspaceBasis: set.workspaceBasis,
        consumerRef: row.ref,
        status,
        candidateProviderRefs,
        selectedProviderRef: selected,
        reasons,
        supportRefs,
        basisRefs,
        confidence: {
          score: Math.min(...usedRows.map((r) => r.contract.confidence.score)),
          method: contractSupportPolicy,
          reasons: ['SUPPORTED_INPUT_BOUND'],
        },
      },
    };
    const statusLimit =
      status === 'UNRESOLVED' || status === 'CONFLICTED' || status === 'AMBIGUOUS'
        ? 'CONTRACT_MATCH_' + status
        : null;
    const cost =
      1 +
      supportRefs.length +
      basisRefs.length +
      candidateProviderRefs.length +
      reasons.length +
      (statusLimit && !limitations.has(statusLimit) ? 1 : 0);
    if (used + cost + 2 > control.maxItems) {
      termination = 'BUDGET';
      frontier.push(row.ref);
      limitations.add('MATCH_TERMINATED_BUDGET');
      break;
    }
    used += cost;
    matches.push(parseContractMatch(value, context));
    if (statusLimit) limitations.add(statusLimit);
  }
  return {
    matches,
    workspaceBasis: set.workspaceBasis,
    inputDigest: prepared
      ? workspaceRuntimeInputDigestV2(prepared.set)
      : workspaceRuntimeInputDigest(set),
    ...(prepared ? { consumed: { items: used, inputBytes: prepared.consumed.inputBytes } } : {}),
    frontier,
    termination,
    coverage: {
      status: limitations.size ? ('PARTIAL' as const) : ('COMPLETE' as const),
      limitations: [...limitations].sort(),
      unverifiedRefs: frontier,
    },
  };
}
