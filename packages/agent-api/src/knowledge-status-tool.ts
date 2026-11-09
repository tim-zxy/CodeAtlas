import { types } from 'node:util';
import { z } from 'zod';
import { readOwnedKnowledgeStatus } from '@codeatlas/application';
import {
  EntityIdSchema,
  KnowledgeScopeSchema,
  Phase1KnowledgeTypeSchema,
  Phase1CoverageSchema,
  Phase1SupportRefsSchema,
  Phase1ScopedRefsSchema,
  SourceFreshnessSchema,
  CompilationCurrencySchema,
  basisKey,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { publicationDigest } from '../../ir/dist/offline-publication-contract.js';
import { searchProvenanceSchema } from './knowledge-search-contract.js';
import {
  knowledgeStatusBudgetSchema,
  knowledgeStatusRequestSchema,
  knowledgeStatusResponseSchema,
  knowledgeStatusFailure,
  knowledgeStatusResponseDigest,
  serializeKnowledgeStatusResponse,
  type KnowledgeStatusBudget,
  type KnowledgeStatusResponse,
  type KnowledgeStatusErrorCode,
} from './knowledge-status-contract.js';
type Ref = { itemId: string; revisionId: string };
const refKey = (r: Ref) => JSON.stringify([r.itemId, r.revisionId]);
export interface OwnedKnowledgeStatusPorts {
  workspaceId: string;
  repositoryIds: string[];
  selectedRefs: Ref[];
  limits: KnowledgeStatusBudget;
  authorize: (
    manifest: Readonly<{
      operation: 'QUERY';
      purpose: 'get_knowledge_status/SELECTED_PUBLISHED';
      workspaceId: string;
      repositoryIds: readonly string[];
      selectedRefs: readonly Ref[];
      fields: readonly string[];
    }>,
    c: RuntimeRequestControl,
  ) => unknown;
  knowledgeQuery: (refs: readonly Ref[], c: RuntimeRequestControl) => Promise<unknown>;
  tokenCounter?: null | {
    kind: string;
    policyRef: string;
    measure: (text: string, c: RuntimeRequestControl) => unknown;
  };
}
const sourceRef = z.strictObject({ itemId: EntityIdSchema, revisionId: EntityIdSchema });
const sourceProjection = z.strictObject({
  kind: z.literal('OWNED_TEST_PUBLICATION'),
  headDigest: z.string().regex(/^[0-9a-f]{64}$/),
  manifest: z.strictObject({
    workspaceId: EntityIdSchema,
    heads: z.array(sourceRef),
    fields: z.array(z.string()),
    evidenceKind: z.literal('TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY'),
  }),
  records: z.array(
    z.strictObject({
      type: Phase1KnowledgeTypeSchema,
      itemId: EntityIdSchema,
      revisionId: EntityIdSchema,
      scopeJson: z.string(),
      sourceFreshness: SourceFreshnessSchema,
      compilationCurrency: CompilationCurrencySchema,
      evidence: z.strictObject({
        supportScopeRefs: Phase1ScopedRefsSchema,
        coverage: Phase1CoverageSchema,
        supportRefs: Phase1SupportRefsSchema,
        provenance: searchProvenanceSchema,
      }),
    }),
  ),
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
export function createOwnedKnowledgeStatusSession(ports: OwnedKnowledgeStatusPorts) {
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
    knowledgeStatusBudgetSchema.parse(
      JSON.parse(canonicalCompilationJson(d.limits?.value, setupControl)),
    ),
  );
  if (!callback(d.authorize?.value) || !callback(d.knowledgeQuery?.value))
    throw Error('INVALID_INPUT');
  const authorize = d.authorize.value.bind(ports) as OwnedKnowledgeStatusPorts['authorize'];
  const query = d.knowledgeQuery.value.bind(ports) as OwnedKnowledgeStatusPorts['knowledgeQuery'];
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
  const refsSchema = z.array(
    z.strictObject({ itemId: EntityIdSchema, revisionId: EntityIdSchema }),
  );
  const selectedRefs = freeze(
    refsSchema
      .parse(JSON.parse(canonicalCompilationJson(d.selectedRefs?.value, setupControl)))
      .sort((a, b) =>
        a.itemId === b.itemId
          ? a.revisionId < b.revisionId
            ? -1
            : a.revisionId > b.revisionId
              ? 1
              : 0
          : a.itemId < b.itemId
            ? -1
            : 1,
      ),
  );
  if (new Set(selectedRefs.map(refKey)).size !== selectedRefs.length) throw Error('INVALID_INPUT');
  let closed = false;
  const context = Object.freeze(Object.create(null)) as object;
  const descriptor = freeze({
    version: 1 as const,
    supportedModes: ['SELECTED_PUBLISHED'] as const,
    mode: 'OWNED_TEST_ONLY' as const,
    tokenPolicyRef: counter?.policyRef ?? null,
  });
  const close = () => {
    closed = true;
  };
  function fail(code: KnowledgeStatusErrorCode): never {
    throw new StatusFailure(code);
  }
  function active(handle: unknown, control: RuntimeRequestControl) {
    if (closed || handle !== context) fail('CONTEXT_UNAVAILABLE');
    canonicalCompilationJson(null, control);
  }
  function sync(
    fn: (...args: never[]) => unknown,
    args: unknown[],
    code: KnowledgeStatusErrorCode,
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
  ): Promise<KnowledgeStatusResponse> {
    try {
      active(handle, callerControl);
      const c = Object.getOwnPropertyDescriptors(callerControl),
        control = Object.freeze({
          maxItems: c.maxItems!.value,
          maxDepth: c.maxDepth!.value,
          deadlineEpochMs: c.deadlineEpochMs!.value,
          signal: c.signal!.value,
        }) as RuntimeRequestControl;
      let request: ReturnType<typeof knowledgeStatusRequestSchema.parse>;
      try {
        request = knowledgeStatusRequestSchema.parse(
          JSON.parse(canonicalCompilationJson(input, control)),
        );
      } catch (error) {
        if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(safeCode(error))) throw error;
        fail('INVALID_INPUT');
      }
      const budget = Object.fromEntries(
        Object.entries(limits).map(([key, v]) => [
          key,
          Math.min(v, request.budget[key as keyof KnowledgeStatusBudget]),
        ]),
      ) as KnowledgeStatusBudget;
      const manifest = freeze({
        operation: 'QUERY' as const,
        purpose: 'get_knowledge_status/SELECTED_PUBLISHED' as const,
        workspaceId,
        repositoryIds: [...repos],
        selectedRefs,
        fields: [
          'ITEM_SCOPE',
          'ITEM_TYPE',
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
      let records: ReturnType<typeof sourceProjection.parse>['records'] = [];
      if (selectedRefs.length) {
        let raw: unknown;
        try {
          raw = await readOwnedKnowledgeStatus(
            { workspaceId, selectedRefs },
            { workspaceId, read: query },
            control,
          );
        } catch (error) {
          active(handle, control);
          const code = safeCode(error);
          if (/PERMISSION|SCOPE_DENIED/.test(code)) fail('PERMISSION_DENIED');
          if (/BUDGET|LIMIT/.test(code)) fail('BUDGET_EXCEEDED');
          fail('PROVIDER_UNAVAILABLE');
        }
        active(handle, control);
        const value = sourceProjection.parse(JSON.parse(canonicalCompilationJson(raw, control)));
        records = value.records;
        if (value.manifest.workspaceId !== workspaceId) fail('DATA_INVALID');
        const heads = records.map(({ itemId, revisionId }) => ({ itemId, revisionId }));
        if (
          new Set(heads.map(refKey)).size !== heads.length ||
          heads.some((r) => !selectedRefs.some((x) => refKey(x) === refKey(r))) ||
          canonicalCompilationJson(heads, control) !==
            canonicalCompilationJson(value.manifest.heads, control) ||
          value.headDigest !==
            publicationDigest('codeatlas.offline-search.heads.v1', { workspaceId, heads }, control)
        )
          fail('DATA_INVALID');
      }
      const allItems = records
        .map((r) => {
          const scope = KnowledgeScopeSchema.parse(JSON.parse(r.scopeJson)),
            e = r.evidence;
          if (
            scope.kind === 'REPOSITORY'
              ? !repos.includes(scope.repositoryId)
              : scope.workspaceId !== workspaceId ||
                (scope.kind === 'CROSS_REPO' &&
                  scope.repositoryIds.some((id) => !repos.includes(id)))
          )
            fail('DATA_INVALID');
          for (const ref of e.coverage.unverifiedRefs)
            if (
              ref.scope === 'WORKSPACE'
                ? ref.workspaceId !== workspaceId
                : !repos.includes(ref.repositoryId)
            )
              fail('DATA_INVALID');
          for (const support of e.supportRefs) {
            const b = support.basis;
            if (
              'repositoryId' in b
                ? !repos.includes(b.repositoryId)
                : 'workspaceId' in b
                  ? b.workspaceId !== workspaceId
                  : !e.supportScopeRefs.some(
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
          return {
            ref: { kind: 'KNOWLEDGE_ITEM' as const, id: r.itemId, revisionId: r.revisionId },
            type: r.type,
            scope,
            sourceFreshness: r.sourceFreshness,
            compilationCurrency: r.compilationCurrency,
            coverage: e.coverage,
            supportRefs: e.supportRefs,
            provenance: e.provenance,
          };
        })
        .sort((a, b) =>
          a.ref.id === b.ref.id
            ? a.ref.revisionId < b.ref.revisionId
              ? -1
              : a.ref.revisionId > b.ref.revisionId
                ? 1
                : 0
            : a.ref.id < b.ref.id
              ? -1
              : 1,
        );
      const items = allItems.slice(0, budget.maxItems),
        returned = new Set(
          allItems.map((h) => refKey({ itemId: h.ref.id, revisionId: h.ref.revisionId })),
        ),
        missingRefs = selectedRefs.filter((r) => !returned.has(refKey(r))),
        omittedRefs = allItems
          .slice(budget.maxItems)
          .map((h) => ({ itemId: h.ref.id, revisionId: h.ref.revisionId }));
      const uniform = <T>(a: T[]) =>
        a.length &&
        a.every(
          (v) => canonicalCompilationJson(v, control) === canonicalCompilationJson(a[0], control),
        )
          ? a[0]
          : null;
      const warnings = [
        ...new Set([
          'OWNED_TEST_ONLY',
          'NO_PRODUCTION_AUTHORITY',
          'EXPLICIT_SELECTION_ONLY',
          'CURRENT_PUBLISHED_HEADS_ONLY',
          'LIVE_SOURCE_NOT_OBSERVED',
          ...(!selectedRefs.length ? ['NO_SELECTED_KNOWLEDGE'] : []),
          ...(missingRefs.length ? ['SELECTED_CURRENT_REVISION_UNAVAILABLE'] : []),
          ...items.flatMap((h) =>
            [h.sourceFreshness, h.compilationCurrency].filter(
              (x) => x !== 'FRESH' && x !== 'CURRENT',
            ),
          ),
        ]),
      ].sort();
      const bases = new Map(
        items.flatMap((h) => h.supportRefs).map((s) => [basisKey(s.basis), s.basis]),
      );
      const response = freeze(
        knowledgeStatusResponseSchema.parse({
          data: {
            mode: 'SELECTED_PUBLISHED',
            workspaceId,
            coverageScope: 'EXPLICIT_SELECTION_ONLY',
            wholeProjectStatus: 'NOT_ASSESSED',
            selectionState: !items.length
              ? 'MISSING_DATA'
              : missingRefs.length || omittedRefs.length
                ? 'PARTIAL'
                : 'AVAILABLE',
            counts: {
              selected: selectedRefs.length,
              returned: items.length,
              missing: missingRefs.length,
              omitted: omittedRefs.length,
            },
            providerHealth: { availability: 'NOT_OBSERVED', value: null },
            compilationRuns: { availability: 'UNAVAILABLE', value: null },
            selectedRefs,
            missingRefs,
            omittedRefs,
            items,
            quality: 'NOT_EVALUABLE',
            productionQuery: 'NOT_AUTHORIZED',
          },
          meta: {
            basisRefs: [...bases.values()],
            sourceFreshness: uniform(items.map((h) => h.sourceFreshness)),
            compilationCurrency: uniform(items.map((h) => h.compilationCurrency)),
            coverage: uniform(items.map((h) => h.coverage)),
            warnings,
            truncation: {
              truncated: omittedRefs.length > 0,
              reasons: omittedRefs.length ? ['MAX_ITEMS'] : [],
              frontier: [],
            },
          },
        }),
      );
      const text = serializeKnowledgeStatusResponse(response, control);
      if (Buffer.byteLength(text, 'utf8') > budget.maxOutputBytes) fail('BUDGET_EXCEEDED');
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
        m.contentDigest!.value !== knowledgeStatusResponseDigest(text) ||
        !Number.isSafeInteger(m.outputTokens!.value) ||
        m.outputTokens!.value <= 0
      )
        fail('TOKEN_COUNTER_UNAVAILABLE');
      if (m.outputTokens!.value > budget.maxTokens) fail('BUDGET_EXCEEDED');
      permission();
      return response;
    } catch (error) {
      const code = safeCode(error);
      return knowledgeStatusFailure(
        error instanceof StatusFailure
          ? error.code
          : ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(code)
            ? (code as KnowledgeStatusErrorCode)
            : 'DATA_INVALID',
      );
    }
  }
  return Object.freeze({ context, descriptor, execute, close });
}
class StatusFailure extends Error {
  constructor(readonly code: KnowledgeStatusErrorCode) {
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
