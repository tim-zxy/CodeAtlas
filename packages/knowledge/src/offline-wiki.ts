import { createHash } from 'node:crypto';
import {
  EntityIdSchema,
  Phase1CoverageSchema,
  parseKnowledgeItem,
  parseKnowledgeRevision,
  parsePhase1ReferenceContext,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { KnowledgeBudget, immutable, order, record } from './comparison-contract.js';

export class WikiProjectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WikiProjectionError';
  }
}
const requireWiki = (value: unknown, code = 'WIKI_INVALID_INPUT'): void => {
  if (!value) throw new WikiProjectionError(code);
};
export type OwnedWikiRequest = {
  workspaceId: string;
  repositoryIds: string[];
  selectedPublishedRevisionRefs: { itemId: string; revisionId: string }[];
  customizationPolicy: 'LOCKED';
  allowPartial: boolean;
};
export type WikiStatus = 'REVIEW_REQUIRED' | 'MISSING_DATA' | 'STALE' | 'PARTIAL' | 'COMPLETE';
export const standardWikiProfile = immutable({
  profileId: 'codeatlas.standard',
  profileVersion: '1.0.0',
  specId: 'codeatlas.standard-wiki',
  specRevisionId: '1',
  projectionEngineVersion: '1',
  rendererVersion: '1',
  customizationPolicy: 'LOCKED',
  sections: [
    { sectionId: 'overview', title: 'Project / System Overview', required: true, type: null },
    { sectionId: 'components', title: 'Components', required: false, type: 'COMPONENT' },
    { sectionId: 'capabilities', title: 'Capabilities', required: false, type: 'CAPABILITY' },
    {
      sectionId: 'integrations',
      title: 'Integrations / Contracts',
      required: false,
      type: 'INTEGRATION',
    },
    {
      sectionId: 'runtime-flows',
      title: 'RuntimeFlow References',
      required: false,
      type: 'RUNTIME_FLOW_REFERENCE',
    },
    { sectionId: 'business-flows', title: 'BusinessFlow', required: false, type: 'BUSINESS_FLOW' },
    {
      sectionId: 'provenance',
      title: 'Sources / Coverage / Freshness',
      required: true,
      type: null,
    },
  ],
});
export type OwnedWikiProjection = {
  kind: 'OWNED_TEST_WIKI';
  profile: typeof standardWikiProfile;
  status: WikiStatus;
  diagnostics: { code: string; status: WikiStatus; sectionId: string; revisionIds: string[] }[];
  sections: { sectionId: string; required: boolean; revisionIds: string[] }[];
  provenance: {
    knowledgeRevisionRefs: string[];
    selectedPublishedRevisionRefs: { itemId: string; revisionId: string }[];
    profileVersion: string;
    wikiSpecRevisionId: string;
    projectionEngineVersion: string;
    rendererVersion: string;
  };
  inputDigest: string;
  contentFingerprint: string;
  markdown: string;
  canMaterialize: boolean;
  limitations: readonly string[];
  quality: 'NOT_EVALUABLE';
  productionPublication: 'NOT_AUTHORIZED';
};
export const wikiDigest = (
  domain: string,
  value: unknown,
  control: RuntimeRequestControl,
): string =>
  createHash('sha256')
    .update(domain + '\0' + canonicalCompilationJson(value, control))
    .digest('hex');
const refKey = (r: { itemId: string; revisionId: string }): string =>
  JSON.stringify([r.itemId, r.revisionId]);
export function parseOwnedWikiRequest(
  value: unknown,
  control: RuntimeRequestControl,
): OwnedWikiRequest {
  const budget = new KnowledgeBudget(control);
  budget.data(value);
  const owned = JSON.parse(JSON.stringify(value));
  const r = record(owned, [
    'workspaceId',
    'repositoryIds',
    'selectedPublishedRevisionRefs',
    'customizationPolicy',
    'allowPartial',
  ]);
  requireWiki(r.customizationPolicy === 'LOCKED', 'WIKI_POLICY_DENIED');
  requireWiki(typeof r.allowPartial === 'boolean');
  EntityIdSchema.parse(r.workspaceId);
  requireWiki(Array.isArray(r.repositoryIds) && Array.isArray(r.selectedPublishedRevisionRefs));
  const repos = r.repositoryIds as unknown[];
  for (const repo of repos) EntityIdSchema.parse(repo);
  requireWiki(new Set(repos).size === repos.length);
  const refs = r.selectedPublishedRevisionRefs as unknown[];
  for (const raw of refs) {
    const ref = record(raw, ['itemId', 'revisionId']);
    EntityIdSchema.parse(ref.itemId);
    EntityIdSchema.parse(ref.revisionId);
  }
  const request = owned as OwnedWikiRequest;
  requireWiki(new Set(request.selectedPublishedRevisionRefs.map(refKey)).size === refs.length);
  requireWiki(
    new Set(request.selectedPublishedRevisionRefs.map((r) => r.itemId)).size === refs.length,
    'WIKI_QUERY_MISMATCH',
  );
  request.repositoryIds.sort(order);
  request.selectedPublishedRevisionRefs.sort(
    (a, b) => order(a.itemId, b.itemId) || order(a.revisionId, b.revisionId),
  );
  budget.tick();
  return immutable(request);
}
function literal(text: string): string {
  return text.replace(/[\\`*_{}\[\]()#+.!|<>~-]/g, '\\$&').replace(/[\r\n]+/g, ' ');
}
function jsonBlock(value: unknown, control: RuntimeRequestControl): string {
  const json = canonicalCompilationJson(value, control);
  let longest = 2;
  for (const run of json.matchAll(/`+/g)) longest = Math.max(longest, run[0].length);
  const fence = '`'.repeat(longest + 1);
  return fence + 'json\n' + json + '\n' + fence;
}
export type OwnedPublishedScope = Pick<
  OwnedWikiRequest,
  'workspaceId' | 'repositoryIds' | 'selectedPublishedRevisionRefs'
>;
export type OwnedPublishedRecord = {
  itemEnvelope: ReturnType<typeof parseKnowledgeItem>;
  revisionEnvelope: ReturnType<typeof parseKnowledgeRevision>;
  coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
  provenance: Record<string, unknown>;
  currentHeadRevisionId: string;
  warnings: string[];
};
/** Shared owned published-only validation; performs no Wiki rendering or profile decision. */
export function validateOwnedPublishedSelection(
  request: OwnedPublishedScope,
  knowledgeInput: unknown,
  budget: KnowledgeBudget,
): OwnedPublishedRecord[] {
  budget.data(knowledgeInput);
  const knowledge = record(JSON.parse(JSON.stringify(knowledgeInput)), [
    'kind',
    'workspaceId',
    'selectionDigest',
    'records',
    'productionQuery',
    'quality',
  ]);
  requireWiki(
    knowledge.kind === 'OWNED_TEST_PUBLICATION' &&
      knowledge.productionQuery === 'NOT_AUTHORIZED' &&
      knowledge.quality === 'NOT_EVALUABLE',
  );
  requireWiki(knowledge.workspaceId === request.workspaceId, 'WIKI_SCOPE_DENIED');
  requireWiki(
    typeof knowledge.selectionDigest === 'string' &&
      /^[a-f0-9]{64}$/.test(knowledge.selectionDigest),
  );
  requireWiki(
    knowledge.selectionDigest ===
      wikiDigest(
        'codeatlas.offline-knowledge.selection.v1',
        { workspaceId: request.workspaceId, refs: request.selectedPublishedRevisionRefs },
        budget.control,
      ),
    'WIKI_QUERY_MISMATCH',
  );
  requireWiki(Array.isArray(knowledge.records));
  const selected = new Set(request.selectedPublishedRevisionRefs.map(refKey));
  const rows = (knowledge.records as unknown[])
    .map((raw) => {
      budget.tick();
      const row = record(raw, [
        'itemEnvelope',
        'revisionEnvelope',
        'referenceContext',
        'coverage',
        'provenance',
        'currentHeadRevisionId',
        'isCurrentHead',
        'warnings',
      ]);
      const itemEnvelope = parseKnowledgeItem(row.itemEnvelope),
        context = parsePhase1ReferenceContext(row.referenceContext),
        revisionEnvelope = parseKnowledgeRevision(row.revisionEnvelope, context),
        coverage = Phase1CoverageSchema.parse(row.coverage);
      const item = itemEnvelope.payload,
        revision = revisionEnvelope.payload;
      requireWiki(
        item.lifecycleState === 'ACTIVE' &&
          revision.publicationState === 'PUBLISHED' &&
          item.id === revision.itemId &&
          item.publishedRevisionId === revision.id &&
          item.type === revision.structuredContent.kind,
      );
      const key = refKey({ itemId: item.id, revisionId: revision.id });
      requireWiki(selected.delete(key), 'WIKI_QUERY_MISMATCH');
      const scope = item.scope;
      if (scope.kind === 'REPOSITORY')
        requireWiki(request.repositoryIds.includes(scope.repositoryId), 'WIKI_SCOPE_DENIED');
      else
        requireWiki(
          scope.workspaceId === request.workspaceId &&
            (scope.kind !== 'CROSS_REPO' ||
              scope.repositoryIds.every((repo) => request.repositoryIds.includes(repo))),
          'WIKI_SCOPE_DENIED',
        );
      const provenance = record(row.provenance, [
        'attemptId',
        'runId',
        'snapshotId',
        'revisionSetId',
        'evaluationId',
      ]);
      for (const value of Object.values(provenance)) EntityIdSchema.parse(value);
      requireWiki(
        provenance.runId === revision.compilationRunId &&
          provenance.snapshotId === revision.inputSnapshotRef.id &&
          provenance.revisionSetId === revision.revisionSetId &&
          provenance.evaluationId === revision.evaluationRef.id,
      );
      EntityIdSchema.parse(row.currentHeadRevisionId);
      requireWiki(row.isCurrentHead === (row.currentHeadRevisionId === revision.id));
      requireWiki(Array.isArray(row.warnings) && row.warnings.every((v) => typeof v === 'string'));
      // Only references consumed by this revision constrain scope; unused context is not rendered.
      const stack: unknown[] = [
        revision.structuredContent,
        revision.supportRefs,
        coverage.unverifiedRefs,
      ];
      while (stack.length) {
        budget.tick();
        const value = stack.pop();
        if (!value || typeof value !== 'object') continue;
        const object = value as Record<string, unknown>;
        if (object.scope === 'REPOSITORY')
          requireWiki(
            request.repositoryIds.includes(String(object.repositoryId)),
            'WIKI_SCOPE_DENIED',
          );
        if (object.scope === 'WORKSPACE')
          requireWiki(object.workspaceId === request.workspaceId, 'WIKI_SCOPE_DENIED');
        if (object.basis && typeof object.basis === 'object') {
          const basis = object.basis as Record<string, unknown>;
          if (basis.workspaceId)
            requireWiki(basis.workspaceId === request.workspaceId, 'WIKI_SCOPE_DENIED');
          if (basis.documentId) {
            const entity = object.entity as Record<string, unknown>;
            requireWiki(
              context.availableEntities.some(
                (known) =>
                  known.scope === 'WORKSPACE' &&
                  known.workspaceId === request.workspaceId &&
                  known.entity.kind === entity.kind &&
                  known.entity.id === entity.id &&
                  known.entity.revisionId === entity.revisionId,
              ),
              'WIKI_SCOPE_DENIED',
            );
          }
          if (basis.repositoryId)
            requireWiki(
              request.repositoryIds.includes(String(basis.repositoryId)),
              'WIKI_SCOPE_DENIED',
            );
        }
        stack.push(...Object.values(value));
      }
      return {
        itemEnvelope,
        revisionEnvelope,
        coverage,
        provenance,
        currentHeadRevisionId: row.currentHeadRevisionId as string,
        warnings: row.warnings as string[],
      };
    })
    .sort((a, b) => order(a.revisionEnvelope.payload.id, b.revisionEnvelope.payload.id));
  requireWiki(!selected.size, 'WIKI_QUERY_MISMATCH');
  return immutable(rows);
}
/** Private deterministic projection only: test permission is never production authority. */
export function projectOwnedWiki(
  requestInput: unknown,
  knowledgeInput: unknown,
  control: RuntimeRequestControl,
): OwnedWikiProjection {
  const budget = new KnowledgeBudget(control),
    request = parseOwnedWikiRequest(requestInput, budget.control);
  budget.data(requestInput);
  const rows = validateOwnedPublishedSelection(request, knowledgeInput, budget);
  const diagnostics: OwnedWikiProjection['diagnostics'] = [],
    sections: OwnedWikiProjection['sections'] = [];
  const lines = ['# Standard Wiki', '', 'OWNED_TEST_WIKI — NOT_EVALUABLE / NOT_AUTHORIZED', ''];
  for (const section of standardWikiProfile.sections) {
    const members =
        section.type === null
          ? rows
          : rows.filter((r) => r.itemEnvelope.payload.type === section.type),
      revisionIds = members.map((r) => r.revisionEnvelope.payload.id);
    sections.push({ sectionId: section.sectionId, required: section.required, revisionIds });
    lines.push('## ' + section.title, '');
    if (!members.length) {
      diagnostics.push({
        code: section.required ? 'REQUIRED_SECTION_MISSING' : 'OPTIONAL_SECTION_MISSING',
        status: section.required ? 'MISSING_DATA' : 'PARTIAL',
        sectionId: section.sectionId,
        revisionIds: [],
      });
      lines.push('Missing published Knowledge for this section.', '');
      continue;
    }
    if (section.sectionId === 'overview') {
      lines.push('Selected scope: ' + literal(request.workspaceId), '');
      for (const row of members) {
        const content = row.revisionEnvelope.payload.structuredContent;
        lines.push(
          '- ' +
            literal('title' in content ? content.title : row.itemEnvelope.payload.type) +
            ' (' +
            literal(row.revisionEnvelope.payload.id) +
            ')',
        );
      }
      lines.push('');
    } else if (section.sectionId === 'provenance') {
      for (const row of members)
        lines.push(
          jsonBlock(
            {
              itemId: row.itemEnvelope.payload.id,
              revisionId: row.revisionEnvelope.payload.id,
              provenance: row.provenance,
              coverage: row.coverage,
              sourceFreshness: row.itemEnvelope.payload.sourceFreshness,
              compilationCurrency: row.itemEnvelope.payload.compilationCurrency,
              supportRefs: row.revisionEnvelope.payload.supportRefs,
              warnings: row.warnings,
              currentHeadRevisionId: row.currentHeadRevisionId,
            },
            budget.control,
          ),
          '',
        );
    } else
      for (const row of members) {
        const content = row.revisionEnvelope.payload.structuredContent;
        lines.push(
          '### ' + literal('title' in content ? content.title : row.itemEnvelope.payload.type),
          '',
          jsonBlock(content, budget.control),
          '',
        );
      }
  }
  for (const row of rows) {
    const item = row.itemEnvelope.payload,
      revisionIds = [row.revisionEnvelope.payload.id];
    if (item.sourceFreshness !== 'FRESH')
      diagnostics.push({
        code: 'SOURCE_' + item.sourceFreshness,
        status: 'STALE',
        sectionId: 'provenance',
        revisionIds,
      });
    if (item.compilationCurrency !== 'CURRENT')
      diagnostics.push({
        code: 'COMPILATION_OUTDATED',
        status: 'REVIEW_REQUIRED',
        sectionId: 'provenance',
        revisionIds,
      });
    if (row.coverage.status !== 'COMPLETE')
      diagnostics.push({
        code: 'COVERAGE_' + row.coverage.status,
        status: row.coverage.status === 'UNSUPPORTED' ? 'MISSING_DATA' : 'PARTIAL',
        sectionId: 'provenance',
        revisionIds,
      });
  }
  const priority: WikiStatus[] = [
    'REVIEW_REQUIRED',
    'MISSING_DATA',
    'STALE',
    'PARTIAL',
    'COMPLETE',
  ];
  diagnostics.sort(
    (a, b) =>
      priority.indexOf(a.status) - priority.indexOf(b.status) ||
      order(a.sectionId, b.sectionId) ||
      order(a.code, b.code) ||
      order(a.revisionIds.join(), b.revisionIds.join()),
  );
  const status = diagnostics[0]?.status ?? 'COMPLETE';
  lines.push(
    'Architecture / Migration: not applicable to Phase 1 formal Knowledge types.',
    '',
    '## Validation',
    '',
    jsonBlock({ status, diagnostics }, budget.control),
    '',
  );
  const markdown = lines.join('\n'),
    provenance: OwnedWikiProjection['provenance'] = {
      knowledgeRevisionRefs: rows.map((r) => r.revisionEnvelope.payload.id),
      selectedPublishedRevisionRefs: request.selectedPublishedRevisionRefs,
      profileVersion: standardWikiProfile.profileVersion,
      wikiSpecRevisionId: standardWikiProfile.specRevisionId,
      projectionEngineVersion: standardWikiProfile.projectionEngineVersion,
      rendererVersion: standardWikiProfile.rendererVersion,
    };
  const inputDigest = wikiDigest(
    'codeatlas.owned-wiki.input.v1',
    {
      scope: { workspaceId: request.workspaceId, repositoryIds: request.repositoryIds },
      rows,
      profile: standardWikiProfile,
    },
    budget.control,
  );
  const contentFingerprint = wikiDigest(
    'codeatlas.owned-wiki.content.v1',
    { inputDigest, provenance, markdown },
    budget.control,
  );
  const output: OwnedWikiProjection = {
    kind: 'OWNED_TEST_WIKI',
    profile: standardWikiProfile,
    status,
    diagnostics,
    sections,
    provenance,
    inputDigest,
    contentFingerprint,
    markdown,
    canMaterialize: status === 'COMPLETE' || (status === 'PARTIAL' && request.allowPartial),
    limitations: [
      'LIVE_SOURCE_NOT_OBSERVED',
      'NO_SECRET_CLEARANCE',
      'NO_QUALITY_ADMISSION',
      'IN_MEMORY_OWNED_ARTIFACT_ONLY',
    ],
    quality: 'NOT_EVALUABLE',
    productionPublication: 'NOT_AUTHORIZED',
  };
  budget.data(output);
  budget.tick();
  return immutable(output);
}
