import { types } from 'node:util';
import { z } from 'zod';
import { searchOwnedKnowledge } from '@codeatlas/application';
import {
  EntityIdSchema,
  basisKey,
  Phase1ScopedRefsSchema,
  KnowledgeScopeSchema,
  Phase1KnowledgeTypeSchema,
  Phase1CoverageSchema,
  Phase1SupportRefsSchema,
  SourceFreshnessSchema,
  CompilationCurrencySchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  knowledgeSearchBudgetSchema,
  knowledgeSearchRequestSchema,
  knowledgeSearchResponseSchema,
  knowledgeSearchFailure,
  knowledgeSearchResponseDigest,
  serializeKnowledgeSearchResponse,
  searchProvenanceSchema,
  type KnowledgeSearchBudget,
  type KnowledgeSearchResponse,
  type KnowledgeSearchErrorCode,
} from './knowledge-search-contract.js';
import {
  projectL1RequestSchema,
  projectL1ResponseSchema,
  projectL1Failure,
  serializeProjectL1Response,
  type ProjectL1Response,
} from './project-l1-contract.js';
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const knowledgeSearchLimitsSchema = knowledgeSearchBudgetSchema.extend({ maxResults: positive });
export interface OwnedKnowledgeSearchPorts {
  workspaceId: string;
  repositoryIds: string[];
  limits: KnowledgeSearchBudget & { maxResults: number };
  authorize: (
    manifest: Readonly<{
      operation: 'QUERY';
      purpose: 'search_knowledge/LEXICAL_PHRASE';
      workspaceId: string;
      repositoryIds: readonly string[];
      fields: readonly string[];
    }>,
    control: RuntimeRequestControl,
  ) => unknown;
  knowledgeQuery: (
    request: { text: string; maxResults: number; types: string[] | null },
    control: RuntimeRequestControl,
  ) => Promise<unknown>;
  tokenCounter?: null | {
    kind: string;
    policyRef: string;
    measure: (text: string, control: RuntimeRequestControl) => unknown;
  };
}
const rawHit = z.strictObject({
  supportScopeRefs: Phase1ScopedRefsSchema,
  itemId: EntityIdSchema,
  revisionId: EntityIdSchema,
  rank: z.number().finite(),
  type: Phase1KnowledgeTypeSchema,
  title: z.string(),
  summary: z.string(),
  goal: z.string(),
  scope: KnowledgeScopeSchema,
  sourceFreshness: SourceFreshnessSchema,
  compilationCurrency: CompilationCurrencySchema,
  coverage: Phase1CoverageSchema,
  supportRefs: Phase1SupportRefsSchema,
  provenance: searchProvenanceSchema,
  warnings: z.array(z.string()),
});
const rawPage = z.strictObject({
  kind: z.literal('OWNED_TEST_PUBLICATION'),
  workspaceId: EntityIdSchema,
  headDigest: z.string().regex(/^[0-9a-f]{64}$/),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  results: z.array(rawHit),
  totalMatches: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  truncated: z.boolean(),
  productionQuery: z.literal('NOT_AUTHORIZED'),
  limitations: z.array(z.string()),
});
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function properties(value: unknown): PropertyDescriptorMap {
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw Error('INVALID_INPUT');
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).some((k) => typeof k !== 'string' || !Object.hasOwn(d[k]!, 'value')))
    throw Error('INVALID_INPUT');
  return d;
}
function callback(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function' && !types.isProxy(value);
}
/** No token algorithm, SDK route, production principal or write port is installed here. */
export type OwnedProjectL1Ports = Omit<OwnedKnowledgeSearchPorts, 'authorize'> & {
  authorize: (
    manifest: Omit<Parameters<OwnedKnowledgeSearchPorts['authorize']>[0], 'purpose'> & {
      purpose: 'get_project_context/L1';
    },
    control: RuntimeRequestControl,
  ) => unknown;
};
type SearchDescriptor = Readonly<{
  version: 1;
  supportedModes: readonly ['LEXICAL_PHRASE'];
  mode: 'OWNED_TEST_ONLY';
  tokenPolicyRef: string | null;
}>;
type L1Descriptor = Readonly<{
  version: 2;
  supportedDepths: readonly ['L1'];
  mode: 'OWNED_TEST_ONLY';
  tokenPolicyRef: string | null;
}>;
export function createOwnedKnowledgeSearchSession(ports: OwnedKnowledgeSearchPorts) {
  const session = createOwnedPublishedSearchSession(ports, false);
  return Object.freeze({
    ...session,
    descriptor: session.descriptor as SearchDescriptor,
    execute: session.execute as (
      input: unknown,
      handle: unknown,
      control: RuntimeRequestControl,
    ) => Promise<KnowledgeSearchResponse>,
  });
}
export function createOwnedProjectL1Session(ports: OwnedProjectL1Ports) {
  const session = createOwnedPublishedSearchSession(ports, true);
  return Object.freeze({
    ...session,
    descriptor: session.descriptor as L1Descriptor,
    execute: session.execute as (
      input: unknown,
      handle: unknown,
      control: RuntimeRequestControl,
    ) => Promise<ProjectL1Response>,
  });
}
function createOwnedPublishedSearchSession(
  ports: OwnedKnowledgeSearchPorts | OwnedProjectL1Ports,
  isL1: boolean,
) {
  const responseSchema = isL1 ? projectL1ResponseSchema : knowledgeSearchResponseSchema;
  const failure = isL1 ? projectL1Failure : knowledgeSearchFailure;
  const serialize = isL1 ? serializeProjectL1Response : serializeKnowledgeSearchResponse;
  const d = properties(ports);
  const workspaceId = EntityIdSchema.parse(d.workspaceId?.value);
  // Capture immutable scope/limits; later mutation of the caller's ports grants nothing.
  const setupControl: RuntimeRequestControl = {
    maxItems: 100000,
    maxDepth: 20,
    deadlineEpochMs: Date.now() + 10000,
    signal: new AbortController().signal,
  };
  const repositoryIds = JSON.parse(
    canonicalCompilationJson(d.repositoryIds?.value, setupControl),
  ) as unknown;
  if (!Array.isArray(repositoryIds) || !repositoryIds.length) throw Error('INVALID_INPUT');
  const repos = repositoryIds.map((id) => EntityIdSchema.parse(id)).sort();
  if (new Set(repos).size !== repos.length) throw Error('INVALID_INPUT');
  const limits = freeze(
    knowledgeSearchLimitsSchema.parse(
      JSON.parse(canonicalCompilationJson(d.limits?.value, setupControl)),
    ),
  );
  if (!callback(d.authorize?.value) || !callback(d.knowledgeQuery?.value))
    throw Error('INVALID_INPUT');
  const authorize = d.authorize.value.bind(ports) as OwnedKnowledgeSearchPorts['authorize'];
  const query = d.knowledgeQuery.value.bind(ports) as OwnedKnowledgeSearchPorts['knowledgeQuery'];
  let counter:
    | { policyRef: string; measure: (text: string, control: RuntimeRequestControl) => unknown }
    | undefined;
  if (d.tokenCounter?.value != null) {
    const t = properties(d.tokenCounter.value);
    if (
      t.kind?.value === 'EXACT_LOCAL_COUNTER' &&
      typeof t.policyRef?.value === 'string' &&
      t.policyRef.value.trim() === t.policyRef.value &&
      t.policyRef.value.length > 0 &&
      callback(t.measure?.value)
    ) {
      counter = {
        policyRef: t.policyRef.value,
        measure: t.measure.value.bind(d.tokenCounter.value) as (
          text: string,
          control: RuntimeRequestControl,
        ) => unknown,
      };
    }
  }
  let closed = false;
  const context = Object.freeze(Object.create(null)) as object;
  const descriptor = freeze(
    isL1
      ? {
          version: 2 as const,
          supportedDepths: ['L1'] as const,
          mode: 'OWNED_TEST_ONLY' as const,
          tokenPolicyRef: counter?.policyRef ?? null,
        }
      : {
          version: 1 as const,
          supportedModes: ['LEXICAL_PHRASE'] as const,
          mode: 'OWNED_TEST_ONLY' as const,
          tokenPolicyRef: counter?.policyRef ?? null,
        },
  );
  const close = () => {
    closed = true;
  };
  function fail(code: KnowledgeSearchErrorCode): never {
    throw new SearchFailure(code);
  }
  function active(handle: unknown, control: RuntimeRequestControl) {
    if (closed || handle !== context) fail('CONTEXT_UNAVAILABLE');
    canonicalCompilationJson(null, control);
  }
  function sync(
    fn: (...args: never[]) => unknown,
    args: unknown[],
    code: KnowledgeSearchErrorCode,
  ) {
    if (types.isAsyncFunction(fn)) {
      closed = true;
      fail(code);
    }
    let result: unknown;
    try {
      result = Reflect.apply(fn, undefined, args);
    } catch {
      fail(code);
    }
    if (types.isPromise(result)) {
      // Observe rejection without invoking an arbitrary thenable; this authority is unusable thereafter.
      closed = true;
      try {
        Promise.prototype.then.call(
          result,
          () => undefined,
          () => undefined,
        );
      } catch {
        // Exotic host Promise species cannot always be observed safely. Authority stays closed.
      }
      fail(code);
    }
    if (result && typeof result === 'object') {
      if (types.isProxy(result)) {
        closed = true;
        fail(code);
      }
      let p: object | null = result;
      while (p) {
        if (Object.getOwnPropertyDescriptor(p, 'then')) {
          closed = true;
          fail(code);
        }
        p = Object.getPrototypeOf(p);
      }
    }
    return result;
  }
  async function execute(
    input: unknown,
    handle: unknown,
    callerControl: RuntimeRequestControl,
  ): Promise<KnowledgeSearchResponse | ProjectL1Response> {
    try {
      active(handle, callerControl);
      const c = Object.getOwnPropertyDescriptors(callerControl);
      const control = Object.freeze({
        maxItems: c.maxItems!.value,
        maxDepth: c.maxDepth!.value,
        deadlineEpochMs: c.deadlineEpochMs!.value,
        signal: c.signal!.value,
      }) as RuntimeRequestControl;
      let request: ReturnType<typeof knowledgeSearchRequestSchema.parse>;
      try {
        const raw = JSON.parse(canonicalCompilationJson(input, control));
        if (isL1) {
          const query = projectL1RequestSchema.parse(raw);
          request = knowledgeSearchRequestSchema.parse({
            version: 1,
            mode: query.query.mode,
            text: query.query.text,
            scope: 'WORKSPACE',
            filters: query.query.filters,
            page: { limit: query.budget.maxItems, cursor: null },
            budget: {
              maxDepth: 0,
              maxOutputBytes: query.budget.maxOutputBytes,
              maxTokens: query.budget.maxTokens,
            },
          });
        } else request = knowledgeSearchRequestSchema.parse(raw);
      } catch (error) {
        if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(safeCode(error))) throw error;
        fail('INVALID_INPUT');
      }
      const maxResults = Math.min(limits.maxResults, request.page.limit),
        maxOutputBytes = Math.min(limits.maxOutputBytes, request.budget.maxOutputBytes),
        maxTokens = Math.min(limits.maxTokens, request.budget.maxTokens);
      const manifest = freeze({
        operation: 'QUERY' as const,
        purpose: isL1
          ? ('get_project_context/L1' as const)
          : ('search_knowledge/LEXICAL_PHRASE' as const),
        workspaceId,
        repositoryIds: [...repos],
        fields: [
          'ITEM_SCOPE',
          'ITEM_TYPE',
          'TITLE',
          'SUMMARY',
          'GOAL',
          'PROVENANCE_IDS',
          'COVERAGE',
          'SUPPORT_METADATA',
          'SOURCE_FRESHNESS',
          'COMPILATION_CURRENCY',
        ],
      });
      const permission = () => {
        if (
          sync(
            authorize as (...args: never[]) => unknown,
            [manifest, control],
            'PERMISSION_DENIED',
          ) !== undefined
        )
          fail('PERMISSION_DENIED');
        active(handle, control);
      };
      permission();
      if (!counter) fail('TOKEN_COUNTER_UNAVAILABLE');
      let value: unknown;
      try {
        value = await searchOwnedKnowledge(
          { workspaceId, text: request.text, maxResults, types: request.filters.types },
          { workspaceId, search: query },
          control,
        );
      } catch (error) {
        active(handle, control);
        const code = safeCode(error);
        if (/PERMISSION|SCOPE_DENIED/.test(code)) fail('PERMISSION_DENIED');
        if (code === 'INDEX_UNAVAILABLE') fail('INDEX_UNAVAILABLE');
        if (/BUDGET|LIMIT/.test(code)) fail('BUDGET_EXCEEDED');
        fail('PROVIDER_UNAVAILABLE');
      }
      active(handle, control);
      const page = rawPage.parse(JSON.parse(canonicalCompilationJson(value, control)));
      if (
        page.workspaceId !== workspaceId ||
        page.results.length !== Math.min(page.totalMatches, maxResults) ||
        page.totalMatches < page.results.length ||
        page.truncated !== page.totalMatches > page.results.length
      )
        fail('DATA_INVALID');
      const seen = new Set<string>();
      let previous: (typeof page.results)[number] | undefined;
      for (const hit of page.results) {
        const scope = hit.scope;
        if (
          scope.kind === 'REPOSITORY'
            ? !repos.includes(scope.repositoryId)
            : scope.workspaceId !== workspaceId ||
              (scope.kind === 'CROSS_REPO' && scope.repositoryIds.some((id) => !repos.includes(id)))
        )
          fail('DATA_INVALID');
        if (request.filters.types && !request.filters.types.includes(hit.type))
          fail('DATA_INVALID');
        if (seen.has(hit.itemId)) fail('DATA_INVALID');
        seen.add(hit.itemId);
        if (
          previous &&
          (previous.rank > hit.rank ||
            (previous.rank === hit.rank &&
              (previous.itemId > hit.itemId ||
                (previous.itemId === hit.itemId && previous.revisionId > hit.revisionId))))
        )
          fail('DATA_INVALID');
        previous = hit;
        for (const ref of hit.coverage.unverifiedRefs) {
          if (
            ref.scope === 'WORKSPACE'
              ? ref.workspaceId !== workspaceId
              : !repos.includes(ref.repositoryId)
          )
            fail('DATA_INVALID');
        }
        for (const support of hit.supportRefs) {
          const b = support.basis;
          if (
            'repositoryId' in b
              ? !repos.includes(b.repositoryId)
              : 'workspaceId' in b
                ? b.workspaceId !== workspaceId
                : !hit.supportScopeRefs.some(
                    (ref) =>
                      ref.scope === 'WORKSPACE' &&
                      ref.workspaceId === workspaceId &&
                      ref.entity.kind === 'DOCUMENT' &&
                      ref.entity.id === b.documentId &&
                      ref.entity.revisionId === b.documentRevisionId,
                  )
          )
            fail('DATA_INVALID');
        }
      }
      const results = page.results.map(
        ({
          itemId,
          revisionId,
          rank: _rank,
          warnings: _warnings,
          supportScopeRefs: _scopeRefs,
          ...hit
        }) => ({ ref: { kind: 'KNOWLEDGE_ITEM' as const, id: itemId, revisionId }, ...hit }),
      );
      const uniform = <T>(values: T[]): T | null =>
        values.length &&
        values.every(
          (v) =>
            canonicalCompilationJson(v, control) === canonicalCompilationJson(values[0], control),
        )
          ? values[0]!
          : null;
      const bases = new Map(
        page.results.flatMap((h) => h.supportRefs).map((s) => [basisKey(s.basis), s.basis]),
      );
      const warnings = [
        ...new Set([
          'OWNED_TEST_ONLY',
          'NO_PRODUCTION_AUTHORITY',
          'LIVE_SOURCE_NOT_OBSERVED',
          'DISPLAY_FIELDS_ONLY',
          'NO_GRAPH_EXPANSION',
          ...results.flatMap((h) =>
            [h.sourceFreshness, h.compilationCurrency].filter(
              (v) => v !== 'FRESH' && v !== 'CURRENT',
            ),
          ),
        ]),
      ].sort();
      const response = freeze(
        responseSchema.parse({
          data: {
            ...(isL1
              ? {
                  depth: 'L1',
                  contextVersion: 2,
                  selectionBasis: 'EXPLICIT_LEXICAL_QUERY',
                  projectCompleteness: 'NOT_ASSESSED',
                }
              : {}),
            mode: 'LEXICAL_PHRASE',
            scope: 'WORKSPACE',
            workspaceId,
            index: { headDigest: page.headDigest, contentDigest: page.contentDigest },
            results,
            page: { hasMore: page.truncated, nextCursor: null },
            quality: 'NOT_EVALUABLE',
            productionQuery: 'NOT_AUTHORIZED',
          },
          meta: {
            basisRefs: [...bases.values()],
            sourceFreshness: uniform(results.map((h) => h.sourceFreshness)),
            compilationCurrency: uniform(results.map((h) => h.compilationCurrency)),
            coverage: uniform(results.map((h) => h.coverage)),
            warnings,
            truncation: {
              truncated: page.truncated,
              reasons: page.truncated ? ['MAX_RESULTS'] : [],
              frontier: [],
            },
          },
        }),
      );
      const text = serialize(response, control);
      if (Buffer.byteLength(text, 'utf8') > maxOutputBytes) fail('BUDGET_EXCEEDED');
      const measurement = sync(
        counter.measure as (...args: never[]) => unknown,
        [text, control],
        'TOKEN_COUNTER_UNAVAILABLE',
      );
      let m: PropertyDescriptorMap;
      try {
        m = properties(measurement);
      } catch {
        fail('TOKEN_COUNTER_UNAVAILABLE');
      }
      if (
        Object.keys(m).sort().join(',') !== 'contentDigest,outputTokens,policyRef' ||
        m.policyRef!.value !== counter.policyRef ||
        m.contentDigest!.value !== knowledgeSearchResponseDigest(text) ||
        !Number.isSafeInteger(m.outputTokens!.value) ||
        m.outputTokens!.value <= 0
      )
        fail('TOKEN_COUNTER_UNAVAILABLE');
      if (m.outputTokens!.value > maxTokens) fail('BUDGET_EXCEEDED');
      permission();
      return response;
    } catch (error) {
      const code = safeCode(error);
      return failure(
        error instanceof SearchFailure
          ? error.code
          : ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(code)
            ? (code as KnowledgeSearchErrorCode)
            : 'DATA_INVALID',
      );
    }
  }
  return Object.freeze({ context, descriptor, execute, close });
}
class SearchFailure extends Error {
  constructor(readonly code: KnowledgeSearchErrorCode) {
    super(code);
  }
}
function safeCode(error: unknown): string {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return '';
  const d = Object.getOwnPropertyDescriptors(error);
  if (typeof d.code?.value === 'string') return d.code.value;
  const stops: Record<string, string> = {
    CONTROL_CANCELLED: 'CANCELLED',
    CONTROL_DEADLINE: 'DEADLINE',
    CONTROL_BUDGET: 'BUDGET_EXCEEDED',
    CONTROL_DEPTH: 'BUDGET_EXCEEDED',
  };
  return typeof d.message?.value === 'string' ? (stops[d.message.value] ?? '') : '';
}
