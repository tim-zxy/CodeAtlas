import { createHash } from 'node:crypto';
import {
  EntityIdSchema,
  Phase1DigestSchema,
  parseKnowledgeItem,
  parsePhase1ReferenceContext,
  parseClaim,
  ScopedRefSchema,
  scopedRefKey,
  supportKey,
  parseKnowledgeRevision,
  type RuntimeRequestControl,
} from './index.js';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
  type CompilationInputSnapshot,
} from './compilation-input-contract.js';
import {
  parseOfflineEvaluationRecord,
  type OfflineEvaluationRecord,
} from './evaluation-record-contract.js';
export type OfflineHeadRecord = {
  itemEnvelope: ReturnType<typeof parseKnowledgeItem>;
  revisionEnvelope: ReturnType<typeof parseKnowledgeRevision>;
  referenceContext: unknown;
  stateBinding: unknown;
  fingerprintPolicyRef: string;
};
export type OfflinePublicationState = {
  workspaceId: string;
  records: OfflineHeadRecord[];
  stateDigest: string;
};
export type OfflinePublicationRequest = {
  workspaceId: string;
  runId: string;
  subject: { issuerNamespace: string; subjectId: string };
  requestKey: string;
  snapshot: CompilationInputSnapshot;
  candidates: unknown[];
  subjects: unknown[];
  evaluation: OfflineEvaluationRecord;
  priorStateDigest: string;
  planDigest: string;
  reviewKind: 'TEST_REVIEW_NOT_AUTHORITY';
};
export type OfflinePublicationEntry = {
  candidateId: string;
  operation: 'NEW' | 'UPDATE';
  expectedHead: string | null;
  record: OfflineHeadRecord;
};
export type OfflinePublicationCommand = {
  schemaVersion: 1;
  kind: 'OWNED_TEST_PUBLICATION';
  request: OfflinePublicationRequest;
  entries: OfflinePublicationEntry[];
  requestDigest: string;
  commandDigest: string;
  quality: 'NOT_EVALUABLE';
  productionPublication: 'NOT_AUTHORIZED';
};
export function publicationCheck(v: unknown): asserts v {
  if (!v) throw new Error('OFFLINE_PUBLICATION_INVALID');
}
export const publicationDigest = (domain: string, value: unknown, c: RuntimeRequestControl) =>
  createHash('sha256')
    .update(domain + '\0' + canonicalCompilationJson(value, c))
    .digest('hex');
function fields(v: Record<string, unknown>, keys: string[]) {
  publicationCheck(
    v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).sort().join(',') === keys.sort().join(','),
  );
}
export function parseOfflineHeadRecord(
  input: unknown,
  c: RuntimeRequestControl,
): OfflineHeadRecord {
  const v = JSON.parse(canonicalCompilationJson(input, c));
  fields(v, [
    'itemEnvelope',
    'revisionEnvelope',
    'referenceContext',
    'stateBinding',
    'fingerprintPolicyRef',
  ]);
  const item = parseKnowledgeItem(v.itemEnvelope),
    revision = parseKnowledgeRevision(v.revisionEnvelope, v.referenceContext);
  publicationCheck(
    item.payload.id === revision.payload.itemId &&
      item.payload.publishedRevisionId === revision.payload.id &&
      item.payload.type === revision.payload.structuredContent.kind &&
      item.payload.lifecycleState === 'ACTIVE' &&
      revision.payload.publicationState === 'PUBLISHED',
  );
  publicationCheck(typeof v.fingerprintPolicyRef === 'string' && v.fingerprintPolicyRef.length > 0);
  return { ...v, itemEnvelope: item, revisionEnvelope: revision };
}
export function offlinePublicationState(
  workspaceId: string,
  records: unknown[],
  c: RuntimeRequestControl,
): OfflinePublicationState {
  EntityIdSchema.parse(workspaceId);
  const rows = records.map((v) => parseOfflineHeadRecord(v, c));
  rows.sort((a, b) => (a.itemEnvelope.payload.id < b.itemEnvelope.payload.id ? -1 : 1));
  publicationCheck(new Set(rows.map((r) => r.itemEnvelope.payload.id)).size === rows.length);
  return {
    workspaceId,
    records: rows,
    stateDigest: publicationDigest(
      'codeatlas.offline-publication.state.v1',
      { workspaceId, records: rows },
      c,
    ),
  };
}
/** Logical input excludes generated IDs/time and planning against mutable heads. */
export function publicationRequestDigest(
  request: OfflinePublicationRequest,
  c: RuntimeRequestControl,
): string {
  const { priorStateDigest: _state, planDigest: _plan, ...logical } = request;
  return publicationDigest('codeatlas.offline-publication.request.v1', logical, c);
}
export function publicationInputDigest(input: unknown, c: RuntimeRequestControl): string {
  const v = JSON.parse(canonicalCompilationJson(input, c));
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
  publicationCheck(Array.isArray(v.candidates) && Array.isArray(v.subjects));
  v.candidates.sort((a: any, b: any) => (a.payload.id < b.payload.id ? -1 : 1));
  v.subjects.sort((a: any, b: any) =>
    a.candidateEnvelope.payload.id < b.candidateEnvelope.payload.id ? -1 : 1,
  );
  return publicationDigest(
    'codeatlas.offline-publication.request.v1',
    { ...v, reviewKind: 'TEST_REVIEW_NOT_AUTHORITY' },
    c,
  );
}
const continuations = new WeakMap<
  object,
  { identity: object; command: OfflinePublicationCommand }
>();
/** Origin binding only, no permission/quality authority. Mint closure remains with fixed Application producer. */
export function createOfflinePublicationIssuer() {
  const identity = Object.freeze({});
  return Object.freeze({
    identity,
    issue(input: unknown, c: RuntimeRequestControl) {
      const command = parseOfflinePublicationCommand(input, c);
      const stack: unknown[] = [command];
      while (stack.length) {
        const v = stack.pop();
        if (v && typeof v === 'object' && !Object.isFrozen(v)) {
          stack.push(...Object.values(v));
          Object.freeze(v);
        }
      }
      const handle = Object.freeze({});
      continuations.set(handle, { identity, command });
      return handle;
    },
  });
}
export function readOfflinePublicationCommand(
  identity: object,
  handle: object,
): OfflinePublicationCommand {
  const owner = continuations.get(handle);
  publicationCheck(owner && owner.identity === identity);
  return owner.command;
}
export function parseOfflinePublicationCommand(
  input: unknown,
  c: RuntimeRequestControl,
): OfflinePublicationCommand {
  const v = JSON.parse(canonicalCompilationJson(input, c));
  fields(v, [
    'schemaVersion',
    'kind',
    'request',
    'entries',
    'requestDigest',
    'commandDigest',
    'quality',
    'productionPublication',
  ]);
  publicationCheck(
    v.schemaVersion === 1 &&
      v.kind === 'OWNED_TEST_PUBLICATION' &&
      v.quality === 'NOT_EVALUABLE' &&
      v.productionPublication === 'NOT_AUTHORIZED',
  );
  const r = v.request;
  fields(r, [
    'workspaceId',
    'runId',
    'subject',
    'requestKey',
    'snapshot',
    'candidates',
    'subjects',
    'evaluation',
    'priorStateDigest',
    'planDigest',
    'reviewKind',
  ]);
  fields(r.subject, ['issuerNamespace', 'subjectId']);
  for (const text of [
    r.workspaceId,
    r.runId,
    r.subject.issuerNamespace,
    r.subject.subjectId,
    r.requestKey,
  ])
    EntityIdSchema.parse(text);
  publicationCheck(r.reviewKind === 'TEST_REVIEW_NOT_AUTHORITY');
  Phase1DigestSchema.parse(r.priorStateDigest);
  Phase1DigestSchema.parse(r.planDigest);
  const snapshot = parseCompilationInputSnapshot(r.snapshot, c);
  publicationCheck(snapshot.workspaceId === r.workspaceId);
  parseOfflineEvaluationRecord(
    r.evaluation,
    { evaluationId: r.evaluation.evaluationId, runId: r.runId, snapshot, candidates: r.candidates },
    c,
  );
  publicationCheck(
    Array.isArray(v.entries) && v.entries.length === r.candidates.length && v.entries.length > 0,
  );
  publicationCheck(Array.isArray(r.subjects) && r.subjects.length === r.candidates.length);
  const inventory = [
      ...snapshot.repositories,
      ...snapshot.documents,
      ...(snapshot.workspaceCapture ? [snapshot.workspaceCapture] : []),
    ],
    actualEntities = new Set(inventory.flatMap((v) => v.entities.map((e) => scopedRefKey(e.ref)))),
    actualSupports = new Set<string>();
  for (const group of inventory)
    for (const support of group.supports) {
      const b = support.ref.basis,
        ref = ScopedRefSchema.parse(
          'repositoryId' in b
            ? { scope: 'REPOSITORY', repositoryId: b.repositoryId, entity: support.ref.entity }
            : { scope: 'WORKSPACE', workspaceId: snapshot.workspaceId, entity: support.ref.entity },
        );
      actualEntities.add(scopedRefKey(ref));
      actualSupports.add(supportKey(support.ref));
    }
  const subjectMap = new Map<string, any>();
  for (const subject of r.subjects) {
    fields(subject, ['candidateEnvelope', 'referenceContext', 'stateBinding']);
    const id = subject.candidateEnvelope?.payload?.id;
    publicationCheck(typeof id === 'string' && !subjectMap.has(id));
    subjectMap.set(id, subject);
  }
  const candidates = new Map<string, any>(r.candidates.map((x: any) => [x.payload.id, x])),
    ids = new Set<string>(),
    items = new Set<string>(),
    revisions = new Set<string>();
  for (const e of v.entries) {
    fields(e, ['candidateId', 'operation', 'expectedHead', 'record']);
    const candidate = candidates.get(e.candidateId);
    publicationCheck(candidate && !ids.has(e.candidateId));
    ids.add(e.candidateId);
    const rec = parseOfflineHeadRecord(e.record, c),
      item = rec.itemEnvelope.payload,
      rev = rec.revisionEnvelope.payload;
    const subject = subjectMap.get(e.candidateId);
    publicationCheck(
      subject &&
        canonicalCompilationJson(subject.candidateEnvelope, c) ===
          canonicalCompilationJson(candidate, c) &&
        canonicalCompilationJson(subject.referenceContext, c) ===
          canonicalCompilationJson(rec.referenceContext, c) &&
        canonicalCompilationJson(subject.stateBinding, c) ===
          canonicalCompilationJson(rec.stateBinding, c),
    );
    const context = parsePhase1ReferenceContext(rec.referenceContext);
    for (const ref of context.availableEntities)
      publicationCheck(actualEntities.has(scopedRefKey(ref)));
    for (const ref of context.availableSupports)
      publicationCheck(actualSupports.has(supportKey(ref)));
    const state = JSON.parse(canonicalCompilationJson(rec.stateBinding, c));
    fields(state, ['inputSnapshotRef', 'claims']);
    publicationCheck(
      canonicalCompilationJson(state.inputSnapshotRef, c) ===
        canonicalCompilationJson(candidate.payload.inputSnapshotRef, c) &&
        Array.isArray(state.claims) &&
        state.claims.length > 0,
    );
    for (const claim of state.claims) {
      const parsed = parseClaim(claim, context);
      publicationCheck(
        canonicalCompilationJson(parsed.payload.scope, c) ===
          canonicalCompilationJson(snapshot.scope, c),
      );
    }
    publicationCheck(!items.has(item.id) && !revisions.has(rev.id));
    items.add(item.id);
    revisions.add(rev.id);
    publicationCheck(
      canonicalCompilationJson(item.scope, c) ===
        canonicalCompilationJson(candidate.payload.scope, c) &&
        item.importance === candidate.payload.importance,
    );
    publicationCheck(
      canonicalCompilationJson(rev.structuredContent, c) ===
        canonicalCompilationJson(candidate.payload.structuredContent, c) &&
        canonicalCompilationJson(rev.supportRefs, c) ===
          canonicalCompilationJson(candidate.payload.supportRefs, c),
    );
    publicationCheck(
      rev.inputSnapshotRef.id === snapshot.snapshotId &&
        rev.compilationRunId === r.runId &&
        rev.revisionSetId === snapshot.revisionSetId &&
        rev.evaluationRef.id === r.evaluation.evaluationId &&
        rev.inputSnapshotRef.revisionId === undefined &&
        rev.evaluationRef.revisionId === undefined,
    );
    publicationCheck(
      (e.operation === 'NEW' && e.expectedHead === null && rev.previousRevisionId === null) ||
        (e.operation === 'UPDATE' &&
          typeof e.expectedHead === 'string' &&
          e.expectedHead === rev.previousRevisionId),
    );
  }
  publicationCheck(v.requestDigest === publicationRequestDigest(r, c));
  publicationCheck(
    v.commandDigest ===
      publicationDigest(
        'codeatlas.offline-publication.command.v1',
        { request: r, entries: v.entries },
        c,
      ),
  );
  return v as OfflinePublicationCommand;
}
