import { createHash } from 'node:crypto';
import {
  EntityIdSchema,
  ScopedRefSchema,
  scopedRefKey,
  supportKey,
  parseKnowledgeCandidate,
  type RuntimeRequestControl,
} from './index.js';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
} from './compilation-input-contract.js';
export interface OfflineEvaluationRecord {
  schemaVersion: 1;
  evaluationId: string;
  workspaceId: string;
  runId: string;
  snapshotId: string;
  revisionSetId: string;
  inputDigest: string;
  snapshotDigest: string;
  candidateDigest: string;
  ruleRef: 'offline-candidate-structure-v1';
  executionKind: 'PURE_CONTRACT';
  structuralResult: 'VALID';
  quality: 'NOT_EVALUABLE';
  publication: 'NOT_AUTHORIZED';
}
const check = (v: unknown) => {
  if (!v) throw new Error('EVALUATION_RECORD_INVALID');
};
const digest = (domain: string, v: unknown, c: RuntimeRequestControl) =>
  createHash('sha256')
    .update(domain + '\0' + canonicalCompilationJson(v, c))
    .digest('hex');
/** Structural records only. No quality threshold, producer authentication or publication grant. */
export function deriveOfflineEvaluationRecord(
  input: unknown,
  c: RuntimeRequestControl,
): OfflineEvaluationRecord {
  const value = JSON.parse(canonicalCompilationJson(input, c));
  check(Object.keys(value).sort().join(',') === 'candidates,evaluationId,runId,snapshot');
  const evaluationId = EntityIdSchema.parse(value.evaluationId),
    runId = EntityIdSchema.parse(value.runId);
  const snapshot = parseCompilationInputSnapshot(value.snapshot, c);
  check(Array.isArray(value.candidates) && value.candidates.length > 0);
  const inventories = [
    ...snapshot.repositories,
    ...snapshot.documents,
    ...(snapshot.workspaceCapture ? [snapshot.workspaceCapture] : []),
  ];
  const entities = new Map(
      inventories.flatMap((v) => v.entities.map((e) => [scopedRefKey(e.ref), e.ref] as const)),
    ),
    supports = new Map();
  for (const inventory of inventories)
    for (const s of inventory.supports) {
      const b = s.ref.basis;
      const ref = ScopedRefSchema.parse(
        'repositoryId' in b
          ? { scope: 'REPOSITORY', repositoryId: b.repositoryId, entity: s.ref.entity }
          : { scope: 'WORKSPACE', workspaceId: snapshot.workspaceId, entity: s.ref.entity },
      );
      entities.set(scopedRefKey(ref), ref);
      supports.set(supportKey(s.ref), s.ref);
    }
  const context = {
    availableEntities: [...entities.values()],
    availableSupports: [...supports.values()],
  };
  const candidates = value.candidates.map((v: unknown) => parseKnowledgeCandidate(v, context));
  const ids = new Set<string>();
  for (const candidate of candidates) {
    canonicalCompilationJson(candidate, c);
    const p = candidate.payload;
    check(!ids.has(p.id));
    ids.add(p.id);
    check(
      p.inputSnapshotRef.id === snapshot.snapshotId && p.inputSnapshotRef.revisionId === undefined,
    );
    check(canonicalCompilationJson(p.scope, c) === canonicalCompilationJson(snapshot.scope, c));
  }
  candidates.sort((a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    a.payload.id < b.payload.id ? -1 : a.payload.id > b.payload.id ? 1 : 0,
  );
  return Object.freeze({
    schemaVersion: 1,
    evaluationId,
    workspaceId: snapshot.workspaceId,
    runId,
    snapshotId: snapshot.snapshotId,
    revisionSetId: snapshot.revisionSetId,
    inputDigest: snapshot.inputDigest,
    snapshotDigest: digest('codeatlas.offline-evaluation.snapshot.v1', snapshot, c),
    candidateDigest: digest('codeatlas.offline-evaluation.candidates.v1', candidates, c),
    ruleRef: 'offline-candidate-structure-v1',
    executionKind: 'PURE_CONTRACT',
    structuralResult: 'VALID',
    quality: 'NOT_EVALUABLE',
    publication: 'NOT_AUTHORIZED',
  });
}
export function parseOfflineEvaluationRecord(
  record: unknown,
  input: unknown,
  c: RuntimeRequestControl,
): OfflineEvaluationRecord {
  const expected = deriveOfflineEvaluationRecord(input, c);
  check(canonicalCompilationJson(record, c) === canonicalCompilationJson(expected, c));
  return expected;
}
