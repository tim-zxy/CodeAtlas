import {
  EntityIdSchema,
  Phase1CoverageSchema,
  parseKnowledgeItem,
  parseKnowledgeRevision,
  parsePhase1ReferenceContext,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { publicationDigest } from '../../ir/dist/offline-publication-contract.js';

export interface Schema11SelectedProjection {
  kind: 'SCHEMA11_RECEIPT';
  headDigest: string;
  manifest: {
    workspaceId: string;
    heads: { itemId: string; revisionId: string }[];
    fields: string[];
    evidenceKind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY';
  };
  records: {
    type: ReturnType<typeof parseKnowledgeItem>['payload']['type'];
    itemId: string;
    revisionId: string;
    scopeJson: string;
    sourceFreshness: ReturnType<typeof parseKnowledgeItem>['payload']['sourceFreshness'];
    compilationCurrency: ReturnType<typeof parseKnowledgeItem>['payload']['compilationCurrency'];
    title?: string;
    summary?: string;
    goal?: string;
    evidence: {
      supportScopeRefs: ReturnType<typeof parsePhase1ReferenceContext>['availableEntities'];
      coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
      supportRefs: ReturnType<typeof parseKnowledgeRevision>['payload']['supportRefs'];
      provenance: {
        kind: 'SCHEMA11_RECEIPT';
        version: 1;
        publicationId: string;
        candidateId: string;
        runId: string;
        snapshotId: string;
        revisionSetId: string;
        evaluationId: string;
      };
    };
  }[];
}
/** Trusted Store port only, self-owned data. The DTO and its digests issue no permission. */
export async function readSchema11SelectedKnowledge(
  request: {
    workspaceId: string;
    selectedRefs: readonly { itemId: string; revisionId: string }[];
    purpose: 'STATUS' | 'L0';
  },
  ports: {
    workspaceId: string;
    read: (
      refs: readonly { itemId: string; revisionId: string }[],
      c: RuntimeRequestControl,
    ) => Promise<unknown>;
  },
  c: RuntimeRequestControl,
): Promise<Schema11SelectedProjection> {
  const json = (v: unknown) => canonicalCompilationJson(v, c);
  const need = (v: unknown) => {
    if (!v) throw Error('SCHEMA11_SOURCE_INVALID');
  };
  const workspaceId = EntityIdSchema.parse(request.workspaceId);
  need(
    workspaceId === ports.workspaceId && (request.purpose === 'STATUS' || request.purpose === 'L0'),
  );
  const selected = JSON.parse(json(request.selectedRefs)) as {
    itemId: string;
    revisionId: string;
  }[];
  const refKey = (r: { itemId: string; revisionId: string }) => json(r);
  const allowed = new Set(selected.map(refKey));
  need(allowed.size === selected.length);
  const raw = await ports.read(selected, c);
  return parseCoveredSource(request, raw, c).projection;
}
function parseCoveredSource(
  request: {
    workspaceId: string;
    selectedRefs: readonly { itemId: string; revisionId: string }[];
    purpose: 'STATUS' | 'L0';
  },
  raw: unknown,
  c: RuntimeRequestControl,
) {
  const json = (v: unknown) => canonicalCompilationJson(v, c),
    workspaceId = request.workspaceId;
  const need = (v: unknown) => {
    if (!v) throw Error('SCHEMA11_SOURCE_INVALID');
  };
  const exact = (v: unknown, keys: string[]) => {
    need(
      v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v).sort().join(',') === keys.sort().join(','),
    );
  };
  const allowed = new Set(request.selectedRefs.map((r) => json(r))),
    refKey = (r: { itemId: string; revisionId: string }) => json(r);
  try {
    const value = JSON.parse(json(raw));
    exact(value, [
      'schema',
      'version',
      'mode',
      'workspaceId',
      'records',
      'qualityAdmission',
      'productionAccess',
    ]);
    need(
      value.schema === 'codeatlas.published-knowledge-projection' &&
        value.version === 2 &&
        value.mode === 'SCHEMA11_READ_CANDIDATE' &&
        value.workspaceId === workspaceId &&
        value.qualityAdmission === 'UNAVAILABLE' &&
        value.productionAccess === 'CLOSED' &&
        Array.isArray(value.records),
    );
    const records = value.records.map((record: Record<string, unknown>) => {
      exact(record, [
        'itemEnvelope',
        'revisionEnvelope',
        'referenceContext',
        'provenance',
        'currentHeadRevisionId',
        'evaluationStatus',
        'knowledgeCoverage',
        'publicationId',
        'candidateId',
      ]);
      const context = parsePhase1ReferenceContext(record.referenceContext),
        itemEnvelope = parseKnowledgeItem(record.itemEnvelope),
        revisionEnvelope = parseKnowledgeRevision(record.revisionEnvelope, context);
      const item = itemEnvelope.payload,
        r = revisionEnvelope.payload;
      const ids = record.provenance as Record<string, unknown>;
      exact(ids, ['runId', 'snapshotId', 'revisionSetId', 'evaluationId']);
      need(
        record.evaluationStatus === 'NOT_EVALUABLE' &&
          r.publicationState === 'PUBLISHED' &&
          r.structuredContent.kind === item.type &&
          r.itemId === item.id &&
          item.publishedRevisionId === r.id &&
          record.currentHeadRevisionId === r.id &&
          allowed.has(refKey({ itemId: item.id, revisionId: r.id })),
      );
      need(
        ids.runId === r.compilationRunId &&
          ids.snapshotId === r.inputSnapshotRef.id &&
          ids.revisionSetId === r.revisionSetId &&
          ids.evaluationId === r.evaluationRef.id &&
          r.inputSnapshotRef.revisionId === undefined &&
          r.evaluationRef.revisionId === undefined,
      );
      const provenance = {
        kind: 'SCHEMA11_RECEIPT' as const,
        version: 1 as const,
        publicationId: EntityIdSchema.parse(record.publicationId),
        candidateId: EntityIdSchema.parse(record.candidateId),
        runId: EntityIdSchema.parse(ids.runId),
        snapshotId: EntityIdSchema.parse(ids.snapshotId),
        revisionSetId: EntityIdSchema.parse(ids.revisionSetId),
        evaluationId: EntityIdSchema.parse(ids.evaluationId),
      };
      const content = r.structuredContent as { title?: unknown; summary?: unknown; goal?: unknown };
      return {
        type: item.type,
        itemId: item.id,
        revisionId: r.id,
        scopeJson: json(item.scope),
        sourceFreshness: item.sourceFreshness,
        compilationCurrency: item.compilationCurrency,
        ...(request.purpose === 'L0'
          ? {
              title: typeof content.title === 'string' ? content.title : '',
              summary: typeof content.summary === 'string' ? content.summary : '',
              goal: typeof content.goal === 'string' ? content.goal : '',
            }
          : {}),
        evidence: {
          supportScopeRefs: context.availableEntities,
          coverage: Phase1CoverageSchema.parse(record.knowledgeCoverage),
          supportRefs: r.supportRefs,
          provenance,
        },
      };
    });
    const heads = records.map(({ itemId, revisionId }: { itemId: string; revisionId: string }) => ({
      itemId,
      revisionId,
    }));
    need(new Set(heads.map(refKey)).size === heads.length);
    const result = {
      kind: 'SCHEMA11_RECEIPT' as const,
      headDigest: publicationDigest('codeatlas.offline-search.heads.v1', { workspaceId, heads }, c),
      manifest: {
        workspaceId,
        heads,
        fields: ['VALIDATED_CANONICAL', 'PUBLICATION_RECEIPT', 'KNOWLEDGE_COVERAGE'],
        evidenceKind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY' as const,
      },
      records,
    };
    json(result);
    return { projection: result, covered: value };
  } catch (error) {
    canonicalCompilationJson(null, c);
    if (error instanceof Error && ['CONTROL_BUDGET', 'CONTROL_DEPTH'].includes(error.message))
      throw error;
    throw Object.assign(Error('SCHEMA11_SOURCE_INVALID'), { code: 'SCHEMA11_SOURCE_INVALID' });
  }
}

export interface Schema11PublishedSelection {
  kind: 'SCHEMA11_RECEIPT';
  version: 2;
  workspaceId: string;
  selectionDigest: string;
  records: {
    itemEnvelope: ReturnType<typeof parseKnowledgeItem>;
    revisionEnvelope: ReturnType<typeof parseKnowledgeRevision>;
    referenceContext: ReturnType<typeof parsePhase1ReferenceContext>;
    coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
    provenance: Schema11SelectedProjection['records'][number]['evidence']['provenance'];
    currentHeadRevisionId: string;
    isCurrentHead: true;
    warnings: string[];
  }[];
  quality: 'NOT_EVALUABLE';
  productionQuery: 'NOT_AUTHORIZED';
}
/** Receipt-backed full published selection for declared tracing and deterministic Wiki. */
export async function readSchema11PublishedSelection(
  request: {
    workspaceId: string;
    repositoryIds: readonly string[];
    selectedPublishedRevisionRefs: readonly { itemId: string; revisionId: string }[];
  },
  ports: {
    workspaceId: string;
    read: (
      refs: readonly { itemId: string; revisionId: string }[],
      c: RuntimeRequestControl,
    ) => Promise<unknown>;
  },
  c: RuntimeRequestControl,
): Promise<Schema11PublishedSelection> {
  const workspaceId = EntityIdSchema.parse(request.workspaceId),
    selectedRefs = JSON.parse(canonicalCompilationJson(request.selectedPublishedRevisionRefs, c));
  if (workspaceId !== ports.workspaceId) throw Error('SCHEMA11_SCOPE_DENIED');
  if (!Array.isArray(selectedRefs)) throw Error('SCHEMA11_SOURCE_INVALID');
  for (const ref of selectedRefs) {
    if (
      !ref ||
      typeof ref !== 'object' ||
      Object.keys(ref).sort().join(',') !== 'itemId,revisionId'
    )
      throw Error('SCHEMA11_SOURCE_INVALID');
    EntityIdSchema.parse(ref.itemId);
    EntityIdSchema.parse(ref.revisionId);
  }
  if (
    new Set(
      selectedRefs.map((r: { itemId: string; revisionId: string }) =>
        canonicalCompilationJson(r, c),
      ),
    ).size !== selectedRefs.length
  )
    throw Error('SCHEMA11_SOURCE_INVALID');

  if (!selectedRefs.length)
    return {
      kind: 'SCHEMA11_RECEIPT',
      version: 2,
      workspaceId,
      selectionDigest: publicationDigest(
        'codeatlas.offline-knowledge.selection.v1',
        { workspaceId, refs: [] },
        c,
      ),
      records: [],
      quality: 'NOT_EVALUABLE',
      productionQuery: 'NOT_AUTHORIZED',
    };
  const raw = await ports.read(selectedRefs, c);
  const parsed = parseCoveredSource({ workspaceId, selectedRefs, purpose: 'L0' }, raw, c);
  const records = parsed.covered.records.map((r: any, i: number) => ({
    itemEnvelope: r.itemEnvelope,
    revisionEnvelope: r.revisionEnvelope,
    referenceContext: r.referenceContext,
    coverage: r.knowledgeCoverage,
    provenance: parsed.projection.records[i].evidence.provenance,
    currentHeadRevisionId: r.currentHeadRevisionId,
    isCurrentHead: true as const,
    warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
  }));
  return {
    kind: 'SCHEMA11_RECEIPT',
    version: 2,
    workspaceId,
    selectionDigest: publicationDigest(
      'codeatlas.offline-knowledge.selection.v1',
      { workspaceId, refs: selectedRefs },
      c,
    ),
    records,
    quality: 'NOT_EVALUABLE',
    productionQuery: 'NOT_AUTHORIZED',
  };
}
