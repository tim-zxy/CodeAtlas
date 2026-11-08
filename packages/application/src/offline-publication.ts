import { randomUUID } from 'node:crypto';
import {
  parseKnowledgeItem,
  parseKnowledgeRevision,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { reconcileKnowledge, type ReconciliationPlan } from '../../knowledge/dist/index.js';
import {
  fingerprintKnowledgeComparison,
  KnowledgeBudget,
} from '../../knowledge/dist/comparison-contract.js';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  offlinePublicationState,
  parseOfflinePublicationCommand,
  publicationCheck as check,
  publicationDigest,
  publicationRequestDigest,
  publicationInputDigest,
  createOfflinePublicationIssuer,
  type OfflinePublicationCommand,
  type OfflinePublicationState,
  type OfflinePublicationEntry,
} from '../../ir/dist/offline-publication-contract.js';

export type OfflineTestReviewPort = {
  kind: 'TEST_REVIEW_NOT_AUTHORITY';
  review(input: {
    plan: ReconciliationPlan;
    planDigest: string;
  }): { decision: string; planDigest: string } | Promise<{ decision: string; planDigest: string }>;
};
function fields(value: Record<string, unknown>, keys: string[]) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).sort().join(',') === [...keys].sort().join(','));
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Private owned-test preparation only. Review is a test decision, never consent,
 * Source proof, quality admission, or production publication authority. */
export async function prepareOfflinePublication(
  input: unknown,
  currentState: OfflinePublicationState,
  reviewPort: OfflineTestReviewPort,
  controlValue: RuntimeRequestControl,
): Promise<OfflinePublicationCommand> {
  const control = new KnowledgeBudget(controlValue).control;
  // Own caller data before invoking an external callback.
  const v = JSON.parse(canonicalCompilationJson(input, control));
  fields(v, [
    'workspaceId',
    'runId',
    'subject',
    'requestKey',
    'snapshot',
    'candidates',
    'evaluation',
    'subjects',
  ]);
  const supplied = JSON.parse(canonicalCompilationJson(currentState, control));
  fields(supplied, ['workspaceId', 'records', 'stateDigest']);
  const state = offlinePublicationState(supplied.workspaceId, supplied.records, control);
  check(state.workspaceId === v.workspaceId && state.stateDigest === supplied.stateDigest);
  check(Array.isArray(v.candidates) && v.candidates.length > 0 && Array.isArray(v.subjects));
  check(v.subjects.length === v.candidates.length);
  const subjects = new Map<
    string,
    { candidateEnvelope: any; referenceContext: unknown; stateBinding: unknown }
  >();
  const candidates = new Map<string, any>();
  for (const candidate of v.candidates) {
    check(candidate?.payload && !candidates.has(candidate.payload.id));
    candidates.set(candidate.payload.id, candidate);
  }
  for (const subject of v.subjects) {
    fields(subject, ['candidateEnvelope', 'referenceContext', 'stateBinding']);
    const id = subject.candidateEnvelope?.payload?.id;
    check(candidates.has(id) && !subjects.has(id));
    check(
      canonicalCompilationJson(subject.candidateEnvelope, control) ===
        canonicalCompilationJson(candidates.get(id), control),
    );
    subjects.set(id, subject);
  }
  const plan = reconcileKnowledge({
    subjects: v.subjects,
    existingItems: state.records,
    policyRef: 'knowledge-exact-reference-v1',
    intents: [],
    disappearedItemIds: [],
    control,
  });
  check(plan.diagnostics.length === 0 && plan.actions.length === candidates.size);
  const affectedIds = new Set<string>(candidates.keys());
  for (const action of plan.actions) {
    check(
      (action.operation === 'NEW' || action.operation === 'UPDATE') && action.candidateId !== null,
    );
    if (action.retainedItemId) affectedIds.add(action.retainedItemId);
  }
  const rejectIntraSet = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const o = value as Record<string, any>;
    if (o.entity && typeof o.entity === 'object') check(!affectedIds.has(o.entity.id));
    for (const child of Object.values(o)) rejectIntraSet(child);
  };
  for (const subject of subjects.values()) {
    rejectIntraSet(subject.candidateEnvelope);
    rejectIntraSet(subject.stateBinding);
  }
  const planDigest = publicationDigest('codeatlas.offline-publication.plan.v1', plan, control);
  const request = {
    workspaceId: v.workspaceId,
    runId: v.runId,
    subject: v.subject,
    requestKey: v.requestKey,
    snapshot: v.snapshot,
    candidates: [...candidates.values()].sort((a, b) => (a.payload.id < b.payload.id ? -1 : 1)),
    subjects: [...subjects.values()].sort((a, b) =>
      a.candidateEnvelope.payload.id < b.candidateEnvelope.payload.id ? -1 : 1,
    ),
    evaluation: v.evaluation,
    priorStateDigest: state.stateDigest,
    planDigest,
    reviewKind: 'TEST_REVIEW_NOT_AUTHORITY' as const,
  };
  // Validate the complete command before asking even a test reviewer. These
  // private allocations never enter the logical request digest.
  const entries: OfflinePublicationEntry[] = plan.actions.map((action) => {
    const subject = subjects.get(action.candidateId!)!;
    const candidate = subject.candidateEnvelope.payload;
    const itemId = action.operation === 'NEW' ? randomUUID() : action.retainedItemId;
    check(
      itemId &&
        (action.operation === 'NEW' ||
          (action.previousRevisionId &&
            state.records.some(
              (r) =>
                r.itemEnvelope.payload.id === itemId &&
                r.revisionEnvelope.payload.id === action.previousRevisionId,
            ))),
    );
    const revisionId = randomUUID();
    const itemEnvelope = parseKnowledgeItem({
      schema: 'codeatlas.knowledge-item',
      version: 1,
      payload: {
        id: itemId,
        type: candidate.type,
        scope: candidate.scope,
        importance: candidate.importance,
        lifecycleState: 'ACTIVE',
        publishedRevisionId: revisionId,
        sourceFreshness: 'AFFECTED',
        compilationCurrency: 'CURRENT',
      },
    });
    const revisionEnvelope = parseKnowledgeRevision(
      {
        schema: 'codeatlas.knowledge-revision',
        version: 1,
        payload: {
          id: revisionId,
          itemId,
          previousRevisionId: action.previousRevisionId,
          revisionSetId: v.snapshot.revisionSetId,
          structuredContent: candidate.structuredContent,
          ...fingerprintKnowledgeComparison(subject, control),
          supportRefs: candidate.supportRefs,
          inputSnapshotRef: candidate.inputSnapshotRef,
          compilationRunId: v.runId,
          evaluationRef: { kind: 'EVALUATION_RUN', id: v.evaluation.evaluationId },
          publicationState: 'PUBLISHED',
          createdAt: new Date().toISOString(),
        },
      },
      subject.referenceContext,
    );
    return {
      candidateId: action.candidateId!,
      operation: action.operation as 'NEW' | 'UPDATE',
      expectedHead: action.previousRevisionId,
      record: {
        itemEnvelope,
        revisionEnvelope,
        referenceContext: subject.referenceContext,
        stateBinding: subject.stateBinding,
        fingerprintPolicyRef: 'knowledge-exact-reference-v1',
      },
    };
  });
  const command = parseOfflinePublicationCommand(
    {
      schemaVersion: 1,
      kind: 'OWNED_TEST_PUBLICATION',
      request,
      entries,
      requestDigest: publicationRequestDigest(request, control),
      commandDigest: publicationDigest(
        'codeatlas.offline-publication.command.v1',
        { request, entries },
        control,
      ),
      quality: 'NOT_EVALUABLE',
      productionPublication: 'NOT_AUTHORIZED',
    },
    control,
  );
  check(
    reviewPort?.kind === 'TEST_REVIEW_NOT_AUTHORITY' && typeof reviewPort.review === 'function',
  );
  const decision = JSON.parse(
    canonicalCompilationJson(await reviewPort.review(freeze({ plan, planDigest })), control),
  );
  fields(decision, ['decision', 'planDigest']);
  check(decision.decision === 'APPROVED' && decision.planDigest === planDigest);
  return freeze(parseOfflinePublicationCommand(command, control));
}

export type OfflinePublicationInspection = { status: string; [key: string]: unknown };
export type OfflinePublicationPreparationPorts = {
  lookup(
    subject: { issuerNamespace: string; subjectId: string },
    requestKey: string,
    requestDigest: string,
    control: RuntimeRequestControl,
  ): OfflinePublicationInspection | Promise<OfflinePublicationInspection>;
  readState(
    control: RuntimeRequestControl,
  ): OfflinePublicationState | Promise<OfflinePublicationState>;
};
export type OfflinePublicationPreparationResult =
  | { status: 'EXISTING'; inspection: OfflinePublicationInspection }
  | {
      status: 'PREPARED';
      handle: ReturnType<ReturnType<typeof createOfflinePublicationIssuer>['issue']>;
      command: OfflinePublicationCommand;
    };

/** The issuer capability stays inside this instance. Its identity only binds
 * the owned-test Store; neither adapter nor identity establishes production rights. */
export class OfflinePublicationPreparer {
  readonly #issuer = createOfflinePublicationIssuer();
  readonly #lookup: OfflinePublicationPreparationPorts['lookup'];
  readonly #readState: OfflinePublicationPreparationPorts['readState'];

  constructor(ports: OfflinePublicationPreparationPorts) {
    check(ports && typeof ports.lookup === 'function' && typeof ports.readState === 'function');
    this.#lookup = ports.lookup.bind(ports);
    this.#readState = ports.readState.bind(ports);
  }

  get identity(): ReturnType<typeof createOfflinePublicationIssuer>['identity'] {
    return this.#issuer.identity;
  }

  async prepare(
    input: unknown,
    reviewPort: OfflineTestReviewPort,
    controlValue: RuntimeRequestControl,
  ): Promise<OfflinePublicationPreparationResult> {
    const control = new KnowledgeBudget(controlValue).control;
    const value = freeze(JSON.parse(canonicalCompilationJson(input, control)));
    const requestDigest = publicationInputDigest(value, control);
    const inspection = JSON.parse(
      canonicalCompilationJson(
        await this.#lookup(value.subject, value.requestKey, requestDigest, control),
        control,
      ),
    ) as OfflinePublicationInspection;
    check(
      ['ABSENT', 'COMMITTED', 'COMMIT_OUTCOME_UNKNOWN', 'NOT_COMMITTED'].includes(
        inspection.status,
      ),
    );
    if (inspection.status !== 'ABSENT') return freeze({ status: 'EXISTING', inspection });
    const state = await this.#readState(control);
    const command = await prepareOfflinePublication(value, state, reviewPort, control);
    check(command.requestDigest === requestDigest);
    const handle = this.#issuer.issue(command, control);
    return Object.freeze({ status: 'PREPARED', handle, command });
  }
}
