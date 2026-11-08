import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import {
  KnowledgeBudget,
  KnowledgeControlStop,
  immutable,
  order,
  record,
} from './comparison-contract.js';
import {
  parseOwnedWikiRequest,
  validateOwnedPublishedSelection,
  type OwnedPublishedRecord,
} from './offline-wiki.js';

export class BusinessTraceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BusinessTraceError';
  }
}
export type OwnedBusinessTraceRequest = {
  kind: 'BUSINESS';
  workspaceId: string;
  repositoryIds: string[];
  knowledgeRef: { itemId: string; revisionId: string };
  startStepKey: string;
  direction: 'FORWARD' | 'BACKWARD';
  maxDepth: number;
  maxSteps: number;
  maxEdges: number;
  maxResultBytes: number;
};
export type OwnedBusinessTrace = {
  kind: 'BUSINESS';
  knowledgeRef: { itemId: string; revisionId: string };
  currentHeadRevisionId: string;
  isCurrentHead: boolean;
  title: string;
  goal: string;
  steps: {
    stepKey: string;
    action: string;
    supportRefs: OwnedPublishedRecord['revisionEnvelope']['payload']['supportRefs'];
    depth: number;
  }[];
  edges: { fromStepKey: string; toStepKey: string }[];
  frontier: {
    fromStepKey: string;
    toStepKey: string;
    depth: number;
    reason: 'MAX_DEPTH' | 'MAX_STEPS' | 'MAX_EDGES';
  }[];
  truncated: boolean;
  sourceFreshness: string;
  compilationCurrency: string;
  coverage: OwnedPublishedRecord['coverage'];
  provenance: OwnedPublishedRecord['provenance'];
  participants: unknown[];
  runtimeFlowRefs: unknown[];
  limitations: string[];
  warnings: string[];
  quality: 'NOT_EVALUABLE';
  productionQuery: 'NOT_AUTHORIZED';
};
const requireTrace = (value: unknown, code = 'BUSINESS_TRACE_INVALID_INPUT'): void => {
  if (!value) throw new BusinessTraceError(code);
};
export function parseOwnedBusinessTraceRequest(
  value: unknown,
  control: RuntimeRequestControl,
): OwnedBusinessTraceRequest {
  const budget = new KnowledgeBudget(control);
  try {
    budget.data(value);
    const r = record(JSON.parse(JSON.stringify(value)), [
      'kind',
      'workspaceId',
      'repositoryIds',
      'knowledgeRef',
      'startStepKey',
      'direction',
      'maxDepth',
      'maxSteps',
      'maxEdges',
      'maxResultBytes',
    ]);
    requireTrace(
      r.kind === 'BUSINESS' && (r.direction === 'FORWARD' || r.direction === 'BACKWARD'),
    );
    const ref = record(r.knowledgeRef, ['itemId', 'revisionId']);
    EntityIdSchema.parse(ref.itemId);
    EntityIdSchema.parse(ref.revisionId);
    requireTrace(
      typeof r.startStepKey === 'string' &&
        r.startStepKey.length > 0 &&
        r.startStepKey.trim() === r.startStepKey,
    );
    for (const name of ['maxDepth', 'maxSteps', 'maxEdges', 'maxResultBytes']) {
      const n = r[name];
      requireTrace(
        typeof n === 'number' &&
          Number.isSafeInteger(n) &&
          !Object.is(n, -0) &&
          n >= (name === 'maxDepth' ? 0 : 1),
      );
    }
    const scope = parseOwnedWikiRequest(
      {
        workspaceId: r.workspaceId,
        repositoryIds: r.repositoryIds,
        selectedPublishedRevisionRefs: [r.knowledgeRef],
        customizationPolicy: 'LOCKED',
        allowPartial: false,
      },
      budget.control,
    );
    const request = {
      ...r,
      workspaceId: scope.workspaceId,
      repositoryIds: scope.repositoryIds,
      knowledgeRef: scope.selectedPublishedRevisionRefs[0]!,
    } as OwnedBusinessTraceRequest;
    budget.tick();
    return immutable(request);
  } catch (error) {
    if (error instanceof KnowledgeControlStop || error instanceof BusinessTraceError) throw error;
    throw new BusinessTraceError('BUSINESS_TRACE_INVALID_INPUT');
  }
}
/** Traverse declared steps within one published business revision; never runtime execution. */
export function traceOwnedBusinessFlow(
  requestInput: unknown,
  knowledgeInput: unknown,
  control: RuntimeRequestControl,
): OwnedBusinessTrace {
  const budget = new KnowledgeBudget(control),
    request = parseOwnedBusinessTraceRequest(requestInput, budget.control);
  budget.data(request);
  const rows = validateOwnedPublishedSelection(
    {
      workspaceId: request.workspaceId,
      repositoryIds: request.repositoryIds,
      selectedPublishedRevisionRefs: [request.knowledgeRef],
    },
    knowledgeInput,
    budget,
  );
  requireTrace(rows.length === 1, 'BUSINESS_TRACE_INVALID_INPUT');
  const row = rows[0]!,
    content = row.revisionEnvelope.payload.structuredContent;
  if (content.kind !== 'BUSINESS_FLOW')
    throw new BusinessTraceError('BUSINESS_TRACE_KIND_MISMATCH');
  const all = new Map(content.steps.map((step) => [step.stepKey, step]));
  requireTrace(all.has(request.startStepKey), 'BUSINESS_TRACE_STEP_NOT_FOUND');
  type Link = { fromStepKey: string; toStepKey: string; neighbour: string };
  const adjacency = new Map([...all.keys()].map((key) => [key, [] as Link[]]));
  for (const step of content.steps)
    for (const next of step.nextStepKeys) {
      budget.tick();
      const fromStepKey = step.stepKey,
        toStepKey = next,
        origin = request.direction === 'FORWARD' ? fromStepKey : toStepKey;
      adjacency.get(origin)!.push({
        fromStepKey,
        toStepKey,
        neighbour: request.direction === 'FORWARD' ? toStepKey : fromStepKey,
      });
    }
  for (const links of adjacency.values())
    links.sort(
      (a, b) =>
        order(a.neighbour, b.neighbour) ||
        order(a.fromStepKey, b.fromStepKey) ||
        order(a.toStepKey, b.toStepKey),
    );
  const queue = [request.startStepKey],
    depths = new Map([[request.startStepKey, 0]]),
    steps: OwnedBusinessTrace['steps'] = [],
    edges: OwnedBusinessTrace['edges'] = [],
    frontier: OwnedBusinessTrace['frontier'] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    budget.tick();
    const key = queue[cursor]!,
      step = all.get(key)!,
      depth = depths.get(key)!;
    steps.push({ stepKey: key, action: step.action, supportRefs: step.supportRefs, depth });
    for (const link of adjacency.get(key)!) {
      budget.tick();
      const known = depths.has(link.neighbour),
        nextDepth = depth + 1;
      const reason =
        !known && nextDepth > request.maxDepth
          ? 'MAX_DEPTH'
          : !known && depths.size >= request.maxSteps
            ? 'MAX_STEPS'
            : edges.length >= request.maxEdges
              ? 'MAX_EDGES'
              : null;
      if (reason) {
        frontier.push({
          fromStepKey: link.fromStepKey,
          toStepKey: link.toStepKey,
          depth: nextDepth,
          reason,
        });
        continue;
      }
      edges.push({ fromStepKey: link.fromStepKey, toStepKey: link.toStepKey });
      if (!known) {
        depths.set(link.neighbour, nextDepth);
        queue.push(link.neighbour);
      }
    }
  }
  const isCurrentHead = row.currentHeadRevisionId === row.revisionEnvelope.payload.id;
  const warnings = new Set([
    ...row.warnings,
    'LIVE_SOURCE_NOT_OBSERVED',
    'DECLARED_BUSINESS_STEPS_ONLY',
    'NO_QUALITY_ADMISSION',
  ]);
  if (!isCurrentHead) warnings.add('HISTORICAL_PUBLISHED_REVISION');
  if (row.itemEnvelope.payload.sourceFreshness !== 'FRESH')
    warnings.add(row.itemEnvelope.payload.sourceFreshness);
  if (row.itemEnvelope.payload.compilationCurrency !== 'CURRENT')
    warnings.add(row.itemEnvelope.payload.compilationCurrency);
  const result: OwnedBusinessTrace = {
    kind: 'BUSINESS',
    knowledgeRef: request.knowledgeRef,
    currentHeadRevisionId: row.currentHeadRevisionId,
    isCurrentHead,
    title: content.title,
    goal: content.goal,
    steps,
    edges,
    frontier,
    truncated: frontier.length > 0,
    sourceFreshness: row.itemEnvelope.payload.sourceFreshness,
    compilationCurrency: row.itemEnvelope.payload.compilationCurrency,
    coverage: row.coverage,
    provenance: row.provenance,
    participants: content.participants,
    runtimeFlowRefs: content.runtimeFlowRefs,
    limitations: content.limitations,
    warnings: [...warnings].sort(order),
    quality: 'NOT_EVALUABLE',
    productionQuery: 'NOT_AUTHORIZED',
  };
  budget.data(result);
  requireTrace(
    Buffer.byteLength(JSON.stringify(result), 'utf8') <= request.maxResultBytes,
    'BUSINESS_TRACE_BUDGET_EXCEEDED',
  );
  budget.tick();
  return immutable(result);
}
