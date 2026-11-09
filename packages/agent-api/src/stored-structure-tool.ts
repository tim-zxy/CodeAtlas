import { types } from 'node:util';
import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import {
  readOwnedStructureTrace,
  type OwnedStructureTraceRequest,
} from '../../application/dist/owned-structure-trace.js';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import {
  storedStructureBudgetSchema,
  storedStructureRequestSchema,
  projectL2RequestSchema,
  storedStructureResponseSchema,
  projectL2ResponseSchema,
  storedStructureFailure,
  serializeStoredStructureResponse,
  serializeProjectL2Response,
  storedStructureResponseDigest,
  type StoredStructureErrorCode,
  type StoredStructureResponse,
  type ProjectL2Response,
} from './stored-structure-contract.js';
export type StoredStructureBudget = ReturnType<typeof storedStructureBudgetSchema.parse>;
type Purpose = 'trace_flow/STORED_STRUCTURE' | 'get_project_context/L2';
export interface OwnedStoredStructurePorts {
  workspaceId: string;
  repositoryIds: string[];
  repositoryId: string;
  limits: StoredStructureBudget;
  authorize: (
    manifest: Readonly<{
      operation: 'QUERY';
      purpose: Purpose;
      workspaceId: string;
      repositoryIds: readonly string[];
      repositoryId: string;
      kind: 'EXECUTION' | 'RUNTIME';
      expectedActivationId: string;
      expectedRevisionId: string;
      startRef: OwnedStructureTraceRequest['startRef'];
      fields: readonly string[];
    }>,
    control: RuntimeRequestControl,
  ) => unknown;
  openRuntimeQuery: Parameters<typeof readOwnedStructureTrace>[1];
  tokenCounter?: null | {
    kind: string;
    policyRef: string;
    measure: (text: string, control: RuntimeRequestControl) => unknown;
  };
}
function properties(value: unknown): PropertyDescriptorMap {
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw Error('INVALID_INPUT');
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).some((k) => typeof k !== 'string' || !Object.hasOwn(d[k]!, 'value')))
    throw Error('INVALID_INPUT');
  return d;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
function callback(v: unknown): v is (...args: never[]) => unknown {
  return typeof v === 'function' && !types.isProxy(v);
}
export function createOwnedStoredStructureTraceSession(ports: OwnedStoredStructurePorts) {
  const s = createStoredStructureSession(ports, false);
  return Object.freeze({
    ...s,
    execute: s.execute as (
      input: unknown,
      context: unknown,
      c: RuntimeRequestControl,
    ) => Promise<StoredStructureResponse>,
  });
}
export function createOwnedProjectL2Session(ports: OwnedStoredStructurePorts) {
  const s = createStoredStructureSession(ports, true);
  return Object.freeze({
    ...s,
    execute: s.execute as (
      input: unknown,
      context: unknown,
      c: RuntimeRequestControl,
    ) => Promise<ProjectL2Response>,
  });
}
function createStoredStructureSession(ports: OwnedStoredStructurePorts, l2: boolean) {
  const d = properties(ports),
    workspaceId = EntityIdSchema.parse(d.workspaceId?.value),
    repositoryId = EntityIdSchema.parse(d.repositoryId?.value);
  const setupControl: RuntimeRequestControl = {
    maxItems: 100000,
    maxDepth: 20,
    deadlineEpochMs: Date.now() + 10000,
    signal: new AbortController().signal,
  };
  const rawRepos = JSON.parse(canonicalCompilationJson(d.repositoryIds?.value, setupControl));
  if (!Array.isArray(rawRepos) || !rawRepos.length) throw Error('INVALID_INPUT');
  const repos = rawRepos.map((id) => EntityIdSchema.parse(id)).sort();
  if (new Set(repos).size !== repos.length || !repos.includes(repositoryId))
    throw Error('INVALID_INPUT');
  const limits = freeze(
    storedStructureBudgetSchema.parse(
      JSON.parse(canonicalCompilationJson(d.limits?.value, setupControl)),
    ),
  );
  if (!callback(d.authorize?.value) || !callback(d.openRuntimeQuery?.value))
    throw Error('INVALID_INPUT');
  const authorize = d.authorize.value.bind(ports) as OwnedStoredStructurePorts['authorize'],
    open = d.openRuntimeQuery.value.bind(ports) as OwnedStoredStructurePorts['openRuntimeQuery'];
  let counter:
    { policyRef: string; measure: (text: string, c: RuntimeRequestControl) => unknown } | undefined;
  if (d.tokenCounter?.value != null) {
    const t = properties(d.tokenCounter.value);
    if (
      t.kind?.value === 'EXACT_LOCAL_COUNTER' &&
      typeof t.policyRef?.value === 'string' &&
      t.policyRef.value.length > 0 &&
      t.policyRef.value.trim() === t.policyRef.value &&
      callback(t.measure?.value)
    )
      counter = {
        policyRef: t.policyRef.value,
        measure: t.measure.value.bind(d.tokenCounter.value) as (
          text: string,
          c: RuntimeRequestControl,
        ) => unknown,
      };
  }
  let closed = false,
    cleanupUnknown = false;
  const sessionAbort = new AbortController(),
    sourcePending = new Set<Promise<unknown>>();
  let closing: Promise<void> | undefined;
  const context = Object.freeze(Object.create(null)) as object;
  const descriptor = freeze({
    version: 3 as const,
    mode: 'OWNED_TEST_ONLY' as const,
    supportedKinds: ['EXECUTION', 'RUNTIME'] as const,
    supportedDepths: l2 ? (['L2'] as const) : [],
    tokenPolicyRef: counter?.policyRef ?? null,
  });
  const close = () => {
    closed = true;
    sessionAbort.abort();
    if (!closing) {
      closing = (async () => {
        await Promise.allSettled([...sourcePending]);
        if (cleanupUnknown)
          throw Object.assign(Error('Stored structure cleanup is unknown.'), {
            code: 'QUERY_CLEANUP_FAILED',
            cleanupState: 'UNKNOWN',
          });
      })();
      void closing.catch(() => undefined);
    }
    return closing;
  };
  function fail(code: StoredStructureErrorCode): never {
    throw new StructureFailure(code);
  }
  const active = (handle: unknown, c: RuntimeRequestControl) => {
    if (closed || handle !== context) fail('CONTEXT_UNAVAILABLE');
    canonicalCompilationJson(null, c);
  };
  function sync(
    fn: (...args: never[]) => unknown,
    args: unknown[],
    code: StoredStructureErrorCode,
  ) {
    if (types.isAsyncFunction(fn)) {
      void close();
      fail(code);
    }
    let result: unknown;
    try {
      result = Reflect.apply(fn, undefined, args);
    } catch {
      fail(code);
    }
    if (types.isPromise(result)) {
      void close();
      try {
        Promise.prototype.then.call(
          result,
          () => undefined,
          () => undefined,
        );
      } catch {}
      fail(code);
    }
    if (result && typeof result === 'object') {
      if (types.isProxy(result)) {
        void close();
        fail(code);
      }
      let p: object | null = result;
      while (p) {
        if (Object.getOwnPropertyDescriptor(p, 'then')) {
          void close();
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
  ): Promise<StoredStructureResponse | ProjectL2Response> {
    try {
      active(handle, callerControl);
      const cd = properties(callerControl),
        control = Object.freeze({
          maxItems: cd.maxItems!.value,
          maxDepth: cd.maxDepth!.value,
          deadlineEpochMs: cd.deadlineEpochMs!.value,
          signal: AbortSignal.any([cd.signal!.value as AbortSignal, sessionAbort.signal]),
        }) as RuntimeRequestControl;
      let request: ReturnType<typeof storedStructureRequestSchema.parse>;
      try {
        const raw = JSON.parse(canonicalCompilationJson(input, control));
        if (l2) {
          const v = projectL2RequestSchema.parse(raw);
          request = storedStructureRequestSchema.parse({
            ...v.selection,
            version: 3,
            budget: v.budget,
          });
        } else request = storedStructureRequestSchema.parse(raw);
      } catch (e) {
        if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(safeCode(e))) throw e;
        fail('INVALID_INPUT');
      }
      const budget = Object.fromEntries(
        Object.entries(limits).map(([k, v]) => [
          k,
          Math.min(v, request.budget[k as keyof StoredStructureBudget]),
        ]),
      ) as StoredStructureBudget;
      const manifest = freeze({
        operation: 'QUERY' as const,
        purpose: l2
          ? ('get_project_context/L2' as const)
          : ('trace_flow/STORED_STRUCTURE' as const),
        workspaceId,
        repositoryIds: [...repos],
        repositoryId,
        kind: request.kind,
        expectedActivationId: request.expectedActivationId,
        expectedRevisionId: request.expectedRevisionId,
        startRef: request.startRef,
        fields: [
          'STORED_ACTIVATION_IDENTITY',
          'EXECUTION_STRUCTURE',
          'RUNTIME_FLOW_STRUCTURE',
          'SOURCE_LOCATION_METADATA',
          'EVIDENCE_IDS',
          'DERIVATION_COVERAGE',
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
      const work = Promise.resolve()
        .then(() => {
          active(handle, control);
          const { version: _version, budget: _budget, ...selection } = request;
          return readOwnedStructureTrace(
            {
              ...selection,
              repositoryId,
              budget: {
                maxDepth: budget.maxDepth,
                maxNodes: budget.maxNodes,
                maxEdges: budget.maxEdges,
                maxMetadataRows: budget.maxMetadataRows,
                maxOutputBytes: budget.maxOutputBytes,
              },
            },
            open,
            control,
          );
        })
        .catch((e: unknown) => {
          if (safeCode(e) === 'QUERY_CLEANUP_FAILED') {
            cleanupUnknown = true;
            closed = true;
            sessionAbort.abort();
          }
          throw e;
        });
      sourcePending.add(work);
      let engineeringResult;
      try {
        engineeringResult = await work;
      } catch (e) {
        const code = safeCode(e);
        if (code === 'QUERY_CLEANUP_FAILED') fail('PROVIDER_UNAVAILABLE');
        active(handle, control);
        if (
          [
            'NOT_AVAILABLE',
            'STRUCTURE_NOT_FOUND',
            'ACTIVATION_MISMATCH',
            'REVISION_MISMATCH',
            'DATA_INVALID',
            'BUDGET_EXCEEDED',
            'CANCELLED',
            'DEADLINE',
          ].includes(code)
        )
          fail(code as StoredStructureErrorCode);
        fail('PROVIDER_UNAVAILABLE');
      } finally {
        sourcePending.delete(work);
      }
      active(handle, control);
      const responseSchema = l2 ? projectL2ResponseSchema : storedStructureResponseSchema;
      const response = freeze(
        responseSchema.parse({
          data: {
            kind: request.kind,
            queryVersion: 3,
            workspaceId,
            repositoryId,
            engineeringResult,
            quality: 'NOT_EVALUABLE',
            productionQuery: 'NOT_AUTHORIZED',
            ...(l2
              ? {
                  depth: 'L2',
                  contextVersion: 3,
                  selectionBasis: 'EXPLICIT_STORED_STRUCTURE',
                  projectCompleteness: 'NOT_ASSESSED',
                }
              : {}),
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
              'STORED_DERIVATION_NOT_OBSERVED_EXECUTION',
            ],
            truncation: engineeringResult.truncation,
          },
        }),
      );
      const text = (l2 ? serializeProjectL2Response : serializeStoredStructureResponse)(
        response,
        control,
      );
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
        m.contentDigest!.value !== storedStructureResponseDigest(text) ||
        !Number.isSafeInteger(m.outputTokens!.value) ||
        m.outputTokens!.value <= 0
      )
        fail('TOKEN_COUNTER_UNAVAILABLE');
      if (m.outputTokens!.value > budget.maxTokens) fail('BUDGET_EXCEEDED');
      permission();
      return response;
    } catch (e) {
      const code = safeCode(e);
      return storedStructureFailure(
        e instanceof StructureFailure
          ? e.code
          : ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(code)
            ? (code as StoredStructureErrorCode)
            : 'DATA_INVALID',
      );
    }
  }
  return Object.freeze({ context, descriptor, execute, close });
}
class StructureFailure extends Error {
  constructor(readonly code: StoredStructureErrorCode) {
    super(code);
  }
}
function safeCode(e: unknown): string {
  if (!e || typeof e !== 'object' || types.isProxy(e)) return '';
  const d = Object.getOwnPropertyDescriptors(e);
  if (typeof d.code?.value === 'string') return d.code.value;
  const stops: Record<string, string> = {
    CONTROL_CANCELLED: 'CANCELLED',
    CONTROL_DEADLINE: 'DEADLINE',
    CONTROL_BUDGET: 'BUDGET_EXCEEDED',
    CONTROL_DEPTH: 'BUDGET_EXCEEDED',
  };
  return typeof d.message?.value === 'string' ? (stops[d.message.value] ?? d.message.value) : '';
}
