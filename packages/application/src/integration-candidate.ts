import { types } from 'node:util';
import {
  assertRuntimeRequestControl,
  EntityIdSchema,
  ScopedRefSchema,
  parseKnowledgeCandidate,
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

export class IntegrationCandidateError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'IntegrationCandidateError';
  }
}
function check(value: unknown, code = 'INTEGRATION_INPUT_INVALID'): asserts value {
  if (!value) throw new IntegrationCandidateError(code);
}
function fields(input: unknown, keys: string[]) {
  check(input && typeof input === 'object' && !types.isProxy(input));
  const descriptors = Object.getOwnPropertyDescriptors(input);
  check(Reflect.ownKeys(descriptors).length === keys.length);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = descriptors[key];
    check(d && d.enumerable && Object.hasOwn(d, 'value'));
    result[key] = d.value;
  }
  return result;
}
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
/** Private self-owned input composition. Neither schema/digest agreement nor this
 * candidate establishes Source provenance, scan clearance or publication rights. */
export function buildCapturedIntegrationCandidate(
  input: unknown,
  options: unknown,
  controlValue: RuntimeRequestControl,
  account: DocumentAccount,
) {
  try {
    const control = Object.freeze(
      fields(controlValue, ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal']),
    ) as unknown as RuntimeRequestControl;
    assertRuntimeRequestControl(control);
    const checkpoint = () => {
      account.checkpoint();
      if (aborted.call(control.signal)) throw new IntegrationCandidateError('CANCELLED');
      if (Date.now() >= control.deadlineEpochMs) throw new IntegrationCandidateError('DEADLINE');
    };
    const visit = () => {
      checkpoint();
      account.visitItem();
    };
    checkpoint();
    account.own(input);
    account.own(options);
    const o = fields(JSON.parse(canonicalCompilationJson(options, control)), [
      'candidateId',
      'matchRef',
      'importance',
    ]);
    const id = EntityIdSchema.parse(o.candidateId),
      matchRef = ScopedRefSchema.parse(o.matchRef);
    check(
      typeof o.importance === 'string' &&
        o.importance.length > 0 &&
        o.importance.trim() === o.importance,
    );
    const snapshot = parseCompilationInputSnapshot(input, control);
    account.own(snapshot);
    const workspace = snapshot.workspaceCapture;
    check(workspace?.contractBindings, 'INTEGRATION_BINDINGS_UNAVAILABLE');
    check(
      matchRef.scope === 'WORKSPACE' &&
        matchRef.workspaceId === snapshot.workspaceId &&
        matchRef.entity.kind === 'CONTRACT_MATCH' &&
        matchRef.entity.revisionId === snapshot.revisionSetId,
    );
    const captures = [...snapshot.repositories, ...snapshot.documents, workspace];
    const entities = new Map<string, { ref: ScopedRef; value: unknown; valueSchemaRef: string }>();
    const supports = new Map<string, SupportRef>();
    for (const capture of captures) {
      visit();
      for (const entity of capture.entities) {
        visit();
        entities.set(scopedRefKey(entity.ref), entity);
      }
      for (const support of capture.supports) {
        visit();
        const basis = support.ref.basis;
        const ref = ScopedRefSchema.parse(
          'repositoryId' in basis
            ? { scope: 'REPOSITORY', repositoryId: basis.repositoryId, entity: support.ref.entity }
            : { scope: 'WORKSPACE', workspaceId: snapshot.workspaceId, entity: support.ref.entity },
        );
        entities.set(scopedRefKey(ref), {
          ref,
          value: support.value,
          valueSchemaRef: support.valueSchemaRef,
        });
        supports.set(supportKey(support.ref), support.ref);
      }
    }
    const item = entities.get(scopedRefKey(matchRef));
    check(item?.valueSchemaRef === 'ContractMatch@1', 'INTEGRATION_MATCH_UNAVAILABLE');
    const match = item.value as import('@codeatlas/ir').ContractMatch;
    check(
      match.status === 'MATCHED' && match.selectedProviderRef !== null,
      'INTEGRATION_MATCH_NOT_RESOLVED',
    );
    const endpoints = [match.consumerRef, match.selectedProviderRef];
    const usedSupports = new Map<string, SupportRef>();
    const addSupports = (refs: readonly SupportRef[]) => {
      for (const ref of refs) {
        visit();
        check(supports.has(supportKey(ref)));
        usedSupports.set(supportKey(ref), ref);
      }
    };
    addSupports(match.supportRefs);
    const participants: ScopedRef[] = [];
    for (const [index, ref] of endpoints.entries()) {
      visit();
      const contract = entities.get(scopedRefKey(ref));
      check(contract?.valueSchemaRef === 'Contract@1');
      const value = contract.value as import('@codeatlas/ir').RuntimeFactSet['contracts'][number];
      check(value.direction === (index === 0 ? 'CONSUMER' : 'PROVIDER'));
      const bindings = workspace.contractBindings.bindings.filter((binding) => {
        visit();
        return scopedRefKey(binding.contractRef) === scopedRefKey(ref);
      });
      check(bindings.length === 1, 'INTEGRATION_BINDING_UNAVAILABLE');
      const binding = bindings[0]!;
      const service = entities.get(scopedRefKey(binding.serviceRef));
      check(service?.valueSchemaRef === 'Service@1');
      participants.push(binding.serviceRef);
      addSupports(binding.supportRefs);
      addSupports(value.supportRefs);
      addSupports(
        (service.value as import('@codeatlas/ir').FrozenContractSet['catalog']['services'][number])
          .supportRefs,
      );
    }
    check(
      scopedRefKey(participants[0]!) !== scopedRefKey(participants[1]!),
      'INTEGRATION_DISTINCT_PARTICIPANTS_REQUIRED',
    );
    const sort = (a: string, b: string) => {
      visit();
      return a < b ? -1 : a > b ? 1 : 0;
    };
    const ordered = <T>(map: Map<string, T>) =>
      [...map].sort(([a], [b]) => sort(a, b)).map(([, v]) => v);
    const ranks = { UNSUPPORTED: 0, PARTIAL: 1, COMPLETE: 2 };
    let status = snapshot.coverage.status;
    const limitations = new Set<string>(),
      unverified = new Map<string, ScopedRef>();
    for (const coverage of [snapshot.coverage, ...captures.map((c) => c.coverage)]) {
      visit();
      if (ranks[coverage.status] < ranks[status]) status = coverage.status;
      for (const text of coverage.limitations) {
        visit();
        limitations.add(text);
      }
      for (const ref of coverage.unverifiedRefs) {
        visit();
        unverified.set(scopedRefKey(ref), ref);
      }
    }
    const referenceContext = {
      availableEntities: [...entities.values()].map((e) => e.ref),
      availableSupports: ordered(supports),
    };
    const candidate = parseKnowledgeCandidate(
      {
        schema: 'codeatlas.knowledge-candidate',
        version: 1,
        payload: {
          id,
          type: 'INTEGRATION',
          scope: snapshot.scope,
          importance: o.importance,
          structuredContent: {
            kind: 'INTEGRATION',
            title: 'Contract match ' + match.id,
            summary:
              'Matched contract ' +
              match.consumerRef.entity.id +
              ' -> ' +
              match.selectedProviderRef.entity.id,
            participantRefs: participants.sort((a, b) => sort(scopedRefKey(a), scopedRefKey(b))),
            contractMatchRefs: [matchRef],
            boundaryRefs: endpoints.sort((a, b) => sort(scopedRefKey(a), scopedRefKey(b))),
            limitations: [...limitations].sort(sort),
          },
          supportRefs: ordered(usedSupports),
          inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: snapshot.snapshotId },
          generationMethod: 'PARSER_GROUNDED',
          coverage: {
            status,
            limitations: [...limitations].sort(sort),
            unverifiedRefs: ordered(unverified),
          },
          unverifiedRelations: [],
          publicationState: 'CANDIDATE',
        },
      },
      referenceContext,
    );
    const result = {
      candidate,
      // MATCHED is a structural fact, not CURRENT/TARGET/HISTORICAL state evidence.
      reconciliationSubject: { candidateEnvelope: candidate, referenceContext, stateBinding: null },
      capturedInputDigest: snapshot.inputDigest,
      authorization: 'NOT_ESTABLISHED' as const,
      quality: 'NOT_EVALUABLE' as const,
      publication: 'NOT_ATTEMPTED' as const,
    };
    account.own(result);
    const freeze = (v: unknown) => {
      visit();
      if (v && typeof v === 'object') {
        for (const child of Object.values(v)) freeze(child);
        Object.freeze(v);
      }
    };
    freeze(result);
    checkpoint();
    return result;
  } catch (error) {
    const code =
      error && typeof error === 'object' && !types.isProxy(error)
        ? Object.getOwnPropertyDescriptor(error, 'code')?.value
        : undefined;
    let unknown = !!(
      error &&
      typeof error === 'object' &&
      !types.isProxy(error) &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN'
    );
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    const allowed = [
      'INTEGRATION_INPUT_INVALID',
      'INTEGRATION_BINDINGS_UNAVAILABLE',
      'INTEGRATION_MATCH_UNAVAILABLE',
      'INTEGRATION_MATCH_NOT_RESOLVED',
      'INTEGRATION_BINDING_UNAVAILABLE',
      'INTEGRATION_DISTINCT_PARTICIPANTS_REQUIRED',
      'CANCELLED',
      'DEADLINE',
      'BUDGET_EXCEEDED',
    ];
    throw new IntegrationCandidateError(
      typeof code === 'string' && allowed.includes(code) ? code : 'INTEGRATION_INPUT_INVALID',
      unknown ? 'UNKNOWN' : 'SETTLED',
    );
  }
}
