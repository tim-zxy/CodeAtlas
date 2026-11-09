import { types } from 'node:util';
import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { type QueryBudget, type QueryControl, type CodeReadPort } from '@codeatlas/application';
import { readOwnedSymbolUnderstanding } from '../../application/dist/owned-symbol-query.js';
import { readOwnedCodeTrace } from '../../application/dist/owned-code-trace.js';
import {
  codeTraceBudgetSchema,
  codeTraceRequestSchema,
  codeTraceResponseSchema,
  serializeCodeTraceResponse,
  codeTraceFailure,
  type CodeTraceBudget,
  type CodeTraceResponse,
} from './code-trace-contract.js';
import type { OwnedCodeTracePorts } from './code-trace-tool.js';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  symbolUnderstandingBudgetSchema,
  symbolUnderstandingRequestSchema,
  symbolUnderstandingResponseSchema,
  symbolUnderstandingFailure,
  symbolUnderstandingResponseDigest,
  serializeSymbolUnderstandingResponse,
  type SymbolUnderstandingBudget,
  type SymbolUnderstandingResponse,
  type SymbolUnderstandingErrorCode,
} from './symbol-understanding-contract.js';
export interface OwnedSymbolUnderstandingPorts {
  workspaceId: string;
  repositoryIds: string[];
  repositoryId: string;
  limits: SymbolUnderstandingBudget;
  authorize(
    manifest: Readonly<{
      operation: 'QUERY';
      purpose: 'understand_symbol/STORED_CODE';
      workspaceId: string;
      repositoryIds: readonly string[];
      repositoryId: string;
      symbolId: string;
      expectedRevisionId: string;
      fields: readonly string[];
    }>,
    c: RuntimeRequestControl,
  ): unknown;
  openCodeQuery(
    budget: QueryBudget,
    control: QueryControl,
  ): Promise<CodeReadPort & { close(): void | Promise<void> }>;
  tokenCounter?: null | {
    kind: string;
    policyRef: string;
    measure(text: string, c: RuntimeRequestControl): unknown;
  };
}
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
export function createOwnedSymbolUnderstandingSession(ports: OwnedSymbolUnderstandingPorts) {
  const session = createOwnedStoredCodeSession(ports, 'SYMBOL');
  return Object.freeze({
    ...session,
    execute: session.execute as (
      input: unknown,
      handle: unknown,
      c: RuntimeRequestControl,
    ) => Promise<SymbolUnderstandingResponse>,
  });
}
/** Internal concrete reuse of exact scope, permissions, measurement and cleanup for both code routes. */
export function createOwnedStoredCodeSession(
  ports: OwnedSymbolUnderstandingPorts | OwnedCodeTracePorts,
  variant: 'SYMBOL' | 'CODE',
) {
  const budgetSchema = variant === 'CODE' ? codeTraceBudgetSchema : symbolUnderstandingBudgetSchema;
  const requestSchema =
    variant === 'CODE' ? codeTraceRequestSchema : symbolUnderstandingRequestSchema;
  const responseSchema =
    variant === 'CODE' ? codeTraceResponseSchema : symbolUnderstandingResponseSchema;
  const serialize =
    variant === 'CODE' ? serializeCodeTraceResponse : serializeSymbolUnderstandingResponse;
  const failure = variant === 'CODE' ? codeTraceFailure : symbolUnderstandingFailure;
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
    budgetSchema.parse(JSON.parse(canonicalCompilationJson(d.limits?.value, setupControl))),
  );
  const repositoryId = EntityIdSchema.parse(d.repositoryId?.value);
  if (!repos.includes(repositoryId)) throw Error('INVALID_INPUT');
  if (!callback(d.authorize?.value) || !callback(d.openCodeQuery?.value))
    throw Error('INVALID_INPUT');
  const authorize = d.authorize.value.bind(ports) as OwnedSymbolUnderstandingPorts['authorize'];
  const open = d.openCodeQuery.value.bind(ports) as OwnedSymbolUnderstandingPorts['openCodeQuery'];
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
  let cleanupUnknown = false;
  const sessionAbort = new AbortController();
  const sourcePending = new Set<Promise<unknown>>();
  let closing: Promise<void> | undefined;
  const context = Object.freeze(Object.create(null)) as object;
  const descriptor = freeze({
    version: 1 as const,
    supportedModes: ['STORED_CODE'] as const,
    mode: 'OWNED_TEST_ONLY' as const,
    tokenPolicyRef: counter?.policyRef ?? null,
  });
  const close = () => {
    closed = true;
    sessionAbort.abort();
    if (!closing) {
      closing = (async () => {
        await Promise.allSettled([...sourcePending]);
        if (cleanupUnknown)
          throw Object.assign(Error('Stored code cleanup is unknown.'), {
            code: 'QUERY_CLEANUP_FAILED',
            cleanupState: 'UNKNOWN',
          });
      })();
      // Observe internally even when a caller ignores close; retain the rejection for joiners.
      void closing.catch(() => undefined);
    }
    return closing;
  };
  function fail(code: SymbolUnderstandingErrorCode): never {
    throw new SymbolFailure(code);
  }
  function active(handle: unknown, control: RuntimeRequestControl) {
    if (closed || handle !== context) fail('CONTEXT_UNAVAILABLE');
    canonicalCompilationJson(null, control);
  }
  function sync(
    fn: (...args: never[]) => unknown,
    args: unknown[],
    code: SymbolUnderstandingErrorCode,
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
  ): Promise<SymbolUnderstandingResponse | CodeTraceResponse> {
    try {
      active(handle, callerControl);
      const c = properties(callerControl),
        control = Object.freeze({
          maxItems: c.maxItems!.value,
          maxDepth: c.maxDepth!.value,
          deadlineEpochMs: c.deadlineEpochMs!.value,
          signal: AbortSignal.any([c.signal!.value as AbortSignal, sessionAbort.signal]),
        }) as RuntimeRequestControl;
      let request:
        | ReturnType<typeof symbolUnderstandingRequestSchema.parse>
        | ReturnType<typeof codeTraceRequestSchema.parse>;
      try {
        request = requestSchema.parse(JSON.parse(canonicalCompilationJson(input, control)));
      } catch (error) {
        if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(safeCode(error))) throw error;
        fail('INVALID_INPUT');
      }
      const budget = Object.fromEntries(
        Object.entries(limits).map(([k, v]) => [
          k,
          Math.min(v, request.budget[k as keyof SymbolUnderstandingBudget]),
        ]),
      ) as SymbolUnderstandingBudget & Partial<Pick<CodeTraceBudget, 'maxDepth'>>;
      const manifest = freeze({
        operation: 'QUERY' as const,
        purpose:
          variant === 'CODE'
            ? ('trace_flow/CODE' as const)
            : ('understand_symbol/STORED_CODE' as const),
        workspaceId,
        repositoryIds: [...repos],
        repositoryId,
        symbolId: request.symbolId,
        expectedRevisionId: request.expectedRevisionId,
        fields: [
          'NODE_NAMES',
          'EDGE_NAMES',
          'SOURCE_LOCATION_METADATA',
          'EVIDENCE_IDS',
          'PROVIDER_COVERAGE',
        ],
      });
      const permission = () => {
        if (
          sync(
            authorize as (...a: never[]) => unknown,
            [manifest, control],
            'PERMISSION_DENIED',
          ) !== undefined
        )
          fail('PERMISSION_DENIED');
        active(handle, control);
      };
      permission();
      if (!counter) fail('TOKEN_COUNTER_UNAVAILABLE');
      const queryBudget: QueryBudget = {
        maxNodes: budget.maxNodes,
        maxEdges: budget.maxEdges,
        maxMetadataRows: budget.maxMetadataRows,
        maxResultBytes: budget.maxOutputBytes,
        timeoutMs: Math.max(1, Math.floor(control.deadlineEpochMs - Date.now())),
      };
      let engineeringResult;
      const work = Promise.resolve()
        .then(() => {
          active(handle, control);
          const queryRequest = {
            repositoryId,
            symbolId: request.symbolId,
            expectedRevisionId: request.expectedRevisionId,
            budget: queryBudget,
          };
          return variant === 'CODE'
            ? readOwnedCodeTrace({ ...queryRequest, maxDepth: budget.maxDepth! }, open, control)
            : readOwnedSymbolUnderstanding(queryRequest, open, control);
        })
        .catch((error: unknown) => {
          if (safeCode(error) === 'QUERY_CLEANUP_FAILED') {
            cleanupUnknown = true;
            closed = true;
          }
          throw error;
        });
      sourcePending.add(work);
      try {
        engineeringResult = await work;
      } catch (error) {
        const code = safeCode(error);
        // Cleanup loss takes precedence over cancellation or earlier context invalidation.
        if (code === 'QUERY_CLEANUP_FAILED') fail('PROVIDER_UNAVAILABLE');
        active(handle, control);
        if (['NOT_INDEXED', 'SYMBOL_NOT_FOUND', 'REVISION_MISMATCH'].includes(code))
          fail(code as SymbolUnderstandingErrorCode);
        if (code === 'QUERY_CANCELLED') fail('CANCELLED');
        if (code === 'QUERY_TIMEOUT') fail('DEADLINE');
        if (code === 'QUERY_BUDGET_EXCEEDED') fail('BUDGET_EXCEEDED');
        if (code === 'QUERY_DATA_INVALID') fail('DATA_INVALID');
        fail('PROVIDER_UNAVAILABLE');
      } finally {
        sourcePending.delete(work);
      }
      active(handle, control);
      const reasons = engineeringResult.payload.truncation;
      const response = freeze(
        responseSchema.parse({
          data: {
            ...(variant === 'CODE'
              ? {
                  kind: 'CODE',
                  queryVersion: 2,
                  direction: 'OUTGOING_CALLS',
                  relationshipSemantics: 'STATIC_CALLS_NOT_RUNTIME',
                }
              : {
                  mode: 'STORED_CODE',
                  entryRuntimeRelevance: { availability: 'NOT_EVALUATED', value: null },
                }),
            workspaceId,
            repositoryId,
            engineeringResult,
            quality: 'NOT_EVALUABLE',
            productionQuery: 'NOT_AUTHORIZED',
          },
          meta: {
            basisRefs: null,
            sourceFreshness: null,
            compilationCurrency: null,
            coverage: null,
            warnings: [
              'OWNED_TEST_ONLY',
              'NO_PRODUCTION_AUTHORITY',
              'KNOWLEDGE_META_NOT_APPLICABLE',
              'WORKTREE_NOT_OBSERVED',
            ],
            truncation: { truncated: reasons.length > 0, reasons, frontier: null },
          },
        }),
      );
      const text = serialize(response, control);
      if (Buffer.byteLength(text, 'utf8') > budget.maxOutputBytes) fail('BUDGET_EXCEEDED');
      const measurement = sync(
        counter.measure as (...a: never[]) => unknown,
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
        m.contentDigest!.value !== symbolUnderstandingResponseDigest(text) ||
        !Number.isSafeInteger(m.outputTokens!.value) ||
        m.outputTokens!.value <= 0
      )
        fail('TOKEN_COUNTER_UNAVAILABLE');
      if (m.outputTokens!.value > budget.maxTokens) fail('BUDGET_EXCEEDED');
      permission();
      return response;
    } catch (error) {
      const code = safeCode(error);
      return failure(
        error instanceof SymbolFailure
          ? error.code
          : ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(code)
            ? (code as SymbolUnderstandingErrorCode)
            : 'DATA_INVALID',
      );
    }
  }
  return Object.freeze({ context, descriptor, execute, close });
}
class SymbolFailure extends Error {
  constructor(readonly code: SymbolUnderstandingErrorCode) {
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
