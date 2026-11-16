// Private historical file contract. It grants no live Source or production authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { EntityIdSchema, type RuntimeRequestControl } from './index.js';
import { canonicalCompilationJson } from './compilation-input-contract.js';
export type ReceiptWikiArtifact = {
  kind: 'SCHEMA11_RECEIPT_WIKI_ARTIFACT';
  version: 2;
  artifactId: string;
  artifactRevisionId: string;
  createdAt: string;
  projection: Record<string, unknown>;
  markdown: string;
  source: {
    kind: 'SCHEMA11_RECEIPT';
    version: 1;
    workspaceId: string;
    repositoryIds: string[];
    records: {
      itemId: string;
      revisionId: string;
      publicationId: string;
      candidateId: string;
      runId: string;
      snapshotId: string;
      revisionSetId: string;
      evaluationId: string;
      inputDigest: string;
    }[];
  };
  observation: {
    ruleVersion: 'owned-one-shot-freshness@1';
    scope: 'SELECTED_CAPTURED_BASES_ONLY';
    state: 'HISTORICAL_MATCHED_WINDOW';
    validity: 'ENDED';
    currentFreshness: 'UNASSESSED';
    startedAt: string;
    completedAt: string;
    basisDigest: string;
    sourceDigest: string;
    projectionDigest: string;
  };
};
export const historicalReceiptWikiMarkdown = (markdown: string) =>
  '# Historical observed Wiki\n\nHISTORICAL_MATCHED_WINDOW / ENDED / currentFreshness: UNASSESSED. A past matching window does not guarantee current Source freshness or grant authority.\n\n' +
  markdown;
function need(v: unknown): asserts v {
  if (!v) throw Error('RECEIPT_WIKI_ARTIFACT_INVALID');
}
const hashPattern = /^[a-f0-9]{64}$/;
export const receiptWikiDigest = (domain: string, value: unknown, c: RuntimeRequestControl) =>
  createHash('sha256')
    .update(domain + '\0' + canonicalCompilationJson(value, c))
    .digest('hex');
function exact(v: unknown, keys: string[]): Record<string, unknown> {
  need(v && typeof v === 'object' && !Array.isArray(v));
  need(Object.keys(v).sort().join(',') === keys.sort().join(','));
  return v as Record<string, unknown>;
}
function date(v: unknown): number {
  need(typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
  return Date.parse(v);
}
export function parseReceiptWikiArtifact(
  value: unknown,
  c: RuntimeRequestControl,
): ReceiptWikiArtifact {
  const a = exact(JSON.parse(canonicalCompilationJson(value, c)), [
    'kind',
    'version',
    'artifactId',
    'artifactRevisionId',
    'createdAt',
    'projection',
    'markdown',
    'source',
    'observation',
  ]);
  need(
    a.kind === 'SCHEMA11_RECEIPT_WIKI_ARTIFACT' &&
      a.version === 2 &&
      typeof a.artifactId === 'string' &&
      hashPattern.test(a.artifactId),
  );
  EntityIdSchema.parse(a.artifactRevisionId);
  const p = a.projection as Record<string, unknown>;
  need(
    p &&
      p.kind === 'SCHEMA11_RECEIPT_WIKI' &&
      p.version === 2 &&
      p.quality === 'NOT_EVALUABLE' &&
      p.productionPublication === 'NOT_AUTHORIZED' &&
      p.canMaterialize === true &&
      (p.status === 'COMPLETE' || p.status === 'PARTIAL'),
  );
  need(typeof p.markdown === 'string' && a.markdown === historicalReceiptWikiMarkdown(p.markdown));
  const source = exact(a.source, ['kind', 'version', 'workspaceId', 'repositoryIds', 'records']);
  need(source.kind === 'SCHEMA11_RECEIPT' && source.version === 1);
  EntityIdSchema.parse(source.workspaceId);
  need(
    Array.isArray(source.repositoryIds) &&
      source.repositoryIds.length > 0 &&
      new Set(source.repositoryIds).size === source.repositoryIds.length,
  );
  source.repositoryIds.forEach((id) => EntityIdSchema.parse(id));
  need(Array.isArray(source.records) && source.records.length > 0);
  for (const v of source.records) {
    const r = exact(v, [
      'itemId',
      'revisionId',
      'publicationId',
      'candidateId',
      'runId',
      'snapshotId',
      'revisionSetId',
      'evaluationId',
      'inputDigest',
    ]);
    for (const key of [
      'itemId',
      'revisionId',
      'publicationId',
      'candidateId',
      'runId',
      'snapshotId',
      'revisionSetId',
      'evaluationId',
    ])
      EntityIdSchema.parse(r[key]);
    need(typeof r.inputDigest === 'string' && hashPattern.test(r.inputDigest));
  }
  const refs = source.records.map((r) => ({ itemId: r.itemId, revisionId: r.revisionId }));
  need(new Set(refs.map((r) => canonicalCompilationJson(r, c))).size === refs.length);
  const provenance = p.provenance as {
    selectedPublishedRevisionRefs: unknown;
    knowledgeRevisionRefs: unknown;
  };
  need(
    provenance &&
      canonicalCompilationJson(refs, c) ===
        canonicalCompilationJson(provenance.selectedPublishedRevisionRefs, c),
  );
  need(
    canonicalCompilationJson(refs.map((r) => r.revisionId).sort(), c) ===
      canonicalCompilationJson(provenance.knowledgeRevisionRefs, c),
  );
  const o = exact(a.observation, [
    'ruleVersion',
    'scope',
    'state',
    'validity',
    'currentFreshness',
    'startedAt',
    'completedAt',
    'basisDigest',
    'sourceDigest',
    'projectionDigest',
  ]);
  need(
    o.ruleVersion === 'owned-one-shot-freshness@1' &&
      o.scope === 'SELECTED_CAPTURED_BASES_ONLY' &&
      o.state === 'HISTORICAL_MATCHED_WINDOW' &&
      o.validity === 'ENDED' &&
      o.currentFreshness === 'UNASSESSED',
  );
  need(date(o.startedAt) <= date(o.completedAt) && date(o.completedAt) <= date(a.createdAt));
  for (const key of ['basisDigest', 'sourceDigest', 'projectionDigest'])
    need(typeof o[key] === 'string' && hashPattern.test(o[key] as string));
  need(
    o.sourceDigest === receiptWikiDigest('codeatlas.receipt-wiki.source.v2', source, c) &&
      o.projectionDigest === receiptWikiDigest('codeatlas.receipt-wiki.projection.v2', p, c),
  );
  const profile = p.profile as { specId: string };
  need(profile && typeof profile.specId === 'string');
  need(
    a.artifactId ===
      receiptWikiDigest(
        'codeatlas.receipt-wiki.artifact.v2',
        {
          workspaceId: source.workspaceId,
          repositoryIds: source.repositoryIds,
          specId: profile.specId,
          audience: 'OWNED_RECEIPT_HISTORICAL',
        },
        c,
      ),
  );
  const freeze = (v: unknown): void => {
    if (v && typeof v === 'object') {
      for (const child of Object.values(v)) freeze(child);
      Object.freeze(v);
    }
  };
  freeze(a);
  return a as ReceiptWikiArtifact;
}
const commands = new WeakMap<object, { issuer: object; artifact: ReceiptWikiArtifact }>();
export function issueReceiptWikiArtifact(
  issuer: object,
  value: ReceiptWikiArtifact,
  c: RuntimeRequestControl,
): object {
  const handle = Object.freeze({});
  commands.set(handle, { issuer, artifact: parseReceiptWikiArtifact(value, c) });
  return handle;
}
export function consumeReceiptWikiArtifact(
  issuer: object,
  handle: object,
  c: RuntimeRequestControl,
): ReceiptWikiArtifact {
  const saved =
    handle && typeof handle === 'object' && !types.isProxy(handle)
      ? commands.get(handle)
      : undefined;
  if (!saved || saved.issuer !== issuer) throw Error('RECEIPT_WIKI_HANDLE_UNAVAILABLE');
  commands.delete(handle);
  return parseReceiptWikiArtifact(saved.artifact, c);
}
