import { types } from 'node:util';
import { OfflineBusinessFlowTracer } from '@codeatlas/application';
import { EntityIdSchema, basisKey, type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  businessTraceBudgetSchema,
  businessTraceRequestSchema,
  businessTraceResponseSchema,
  businessTraceFailure,
  businessTraceResponseDigest,
  businessTraceWarningCodes,
  serializeBusinessTraceResponse,
  type BusinessTraceBudget,
  type BusinessTraceResponse,
  type BusinessTraceErrorCode,
} from './business-trace-contract.js';

type ReadPort = ConstructorParameters<typeof OfflineBusinessFlowTracer>[0]['knowledgeQuery'];
export interface BusinessTraceReadManifest {
  readonly operation: 'QUERY';
  readonly purpose: 'trace_flow/BUSINESS';
  readonly workspaceId: string;
  readonly repositoryIds: readonly string[];
  readonly selectedPublishedRevisionRefs: readonly {
    readonly itemId: string;
    readonly revisionId: string;
  }[];
  readonly fields: readonly [
    'PUBLISHED_BUSINESS_FLOW',
    'SUPPORT_METADATA',
    'COVERAGE',
    'PROVENANCE',
    'FRESHNESS',
    'CURRENCY',
  ];
}
export interface OwnedBusinessTracePorts {
  workspaceId: string;
  repositoryIds: string[];
  limits: BusinessTraceBudget;
  authorize: (manifest: BusinessTraceReadManifest, control: RuntimeRequestControl) => unknown;
  knowledgeQuery: ReadPort;
  tokenCounter?: null | {
    kind: string;
    policyRef: string;
    measure: (serializedResponse: string, control: RuntimeRequestControl) => unknown;
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
/** No token algorithm, SDK route, production principal or write port is installed here. */
export function createOwnedBusinessTraceSession(ports: OwnedBusinessTracePorts) {
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
    businessTraceBudgetSchema.parse(
      JSON.parse(canonicalCompilationJson(d.limits?.value, setupControl)),
    ),
  );
  if (!callback(d.authorize?.value) || !callback(d.knowledgeQuery?.value))
    throw Error('INVALID_INPUT');
  const authorize = d.authorize.value.bind(ports) as OwnedBusinessTracePorts['authorize'];
  const query = d.knowledgeQuery.value.bind(ports) as ReadPort;
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
  const descriptor = freeze({
    version: 1 as const,
    supportedKinds: ['BUSINESS'] as const,
    mode: 'OWNED_TEST_ONLY' as const,
    tokenPolicyRef: counter?.policyRef ?? null,
  });
  const close = () => {
    closed = true;
  };
  function fail(code: BusinessTraceErrorCode): never {
    throw new TraceFailure(code);
  }
  function active(handle: unknown, control: RuntimeRequestControl) {
    if (closed || handle !== context) fail('CONTEXT_UNAVAILABLE');
    canonicalCompilationJson(null, control);
  }
  function sync(fn: (...args: never[]) => unknown, args: unknown[], code: BusinessTraceErrorCode) {
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
  ): Promise<BusinessTraceResponse> {
    try {
      active(handle, callerControl);
      const c = Object.getOwnPropertyDescriptors(callerControl);
      const control = Object.freeze({
        maxItems: c.maxItems!.value,
        maxDepth: c.maxDepth!.value,
        deadlineEpochMs: c.deadlineEpochMs!.value,
        signal: c.signal!.value,
      }) as RuntimeRequestControl;
      let request: ReturnType<typeof businessTraceRequestSchema.parse>;
      try {
        request = businessTraceRequestSchema.parse(
          JSON.parse(canonicalCompilationJson(input, control)),
        );
      } catch (error) {
        if (
          safeCode(error) === 'CANCELLED' ||
          safeCode(error) === 'DEADLINE' ||
          safeCode(error) === 'BUDGET_EXCEEDED'
        )
          throw error;
        fail('INVALID_INPUT');
      }
      if (request.kind !== 'BUSINESS') fail('FEATURE_UNAVAILABLE');
      const budget = Object.fromEntries(
        Object.entries(limits).map(([key, ceiling]) => [
          key,
          Math.min(ceiling, request.budget[key as keyof BusinessTraceBudget]),
        ]),
      ) as BusinessTraceBudget;
      const manifest: BusinessTraceReadManifest = freeze({
        operation: 'QUERY',
        purpose: 'trace_flow/BUSINESS',
        workspaceId,
        repositoryIds: [...repos],
        selectedPublishedRevisionRefs: [
          { itemId: request.startRef.id, revisionId: request.startRef.revisionId },
        ],
        fields: [
          'PUBLISHED_BUSINESS_FLOW',
          'SUPPORT_METADATA',
          'COVERAGE',
          'PROVENANCE',
          'FRESHNESS',
          'CURRENCY',
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
      const tracer = new OfflineBusinessFlowTracer({
        workspaceId,
        knowledgeQuery: async (scope, c) => {
          try {
            return await query(scope, c);
          } catch {
            active(handle, c);
            fail('PROVIDER_UNAVAILABLE');
          }
        },
      });
      const trace = await tracer.trace(
        {
          kind: 'BUSINESS',
          workspaceId,
          repositoryIds: repos,
          knowledgeRef: { itemId: request.startRef.id, revisionId: request.startRef.revisionId },
          startStepKey: request.startStepKey,
          direction: request.direction,
          maxDepth: budget.maxDepth,
          maxSteps: budget.maxSteps,
          maxEdges: budget.maxEdges,
          maxResultBytes: budget.maxOutputBytes,
        },
        control,
      );
      active(handle, control);
      const {
        knowledgeRef: _ref,
        frontier,
        truncated,
        sourceFreshness,
        compilationCurrency,
        coverage,
        warnings: rawWarnings,
        ...data
      } = trace;
      const bases = new Map(
        [...trace.supportRefs, ...trace.steps.flatMap((step) => step.supportRefs)].map((s) => [
          basisKey(s.basis),
          s.basis,
        ]),
      );
      const allowed = new Set<string>(businessTraceWarningCodes);
      const warnings = [
        ...new Set([
          ...rawWarnings.map((warning) =>
            allowed.has(warning) ? warning : 'UNCLASSIFIED_WARNING',
          ),
          'OWNED_TEST_ONLY',
          'NO_PRODUCTION_AUTHORITY',
        ]),
      ].sort();
      const response = freeze(
        businessTraceResponseSchema.parse({
          data: {
            ...data,
            startRef: request.startRef,
            startStepKey: request.startStepKey,
            direction: request.direction,
          },
          meta: {
            basisRefs: [...bases.values()],
            sourceFreshness,
            compilationCurrency,
            coverage,
            warnings,
            truncation: {
              truncated,
              reasons: [...new Set(frontier.map((f) => f.reason))].sort(),
              frontier,
            },
          },
        }),
      );
      const text = serializeBusinessTraceResponse(response, control);
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
        m.contentDigest!.value !== businessTraceResponseDigest(text) ||
        !Number.isSafeInteger(m.outputTokens!.value) ||
        m.outputTokens!.value <= 0
      )
        fail('TOKEN_COUNTER_UNAVAILABLE');
      if (m.outputTokens!.value > budget.maxTokens) fail('BUDGET_EXCEEDED');
      permission();
      return response;
    } catch (error) {
      return businessTraceFailure(error instanceof TraceFailure ? error.code : mappedCode(error));
    }
  }
  return Object.freeze({ context, descriptor, execute, close });
}
class TraceFailure extends Error {
  constructor(readonly code: BusinessTraceErrorCode) {
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
function mappedCode(error: unknown): BusinessTraceErrorCode {
  const code = safeCode(error);
  if (code === 'CANCELLED' || code === 'DEADLINE' || code === 'BUDGET_EXCEEDED') return code;
  if (/BUDGET|LIMIT|RESULT_BYTES/.test(code)) return 'BUDGET_EXCEEDED';
  if (/NOT_FOUND/.test(code)) return 'NOT_FOUND';
  if (/PERMISSION|SCOPE_DENIED/.test(code)) return 'PERMISSION_DENIED';
  return 'DATA_INVALID';
}
