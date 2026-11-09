import { types } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import type { Readable, Writable } from 'node:stream';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createOwnedCodeTraceSession,
  codeTraceWireSchemas,
  codeTraceFailure,
  codeTraceResponseSchema,
  serializeCodeTraceResponse,
  createOwnedProjectL1Session,
  projectL1WireSchemas,
  projectL1Failure,
  projectL1ResponseSchema,
  serializeProjectL1Response,
  createOwnedKnowledgeStatusSession,
  knowledgeStatusWireSchemas,
  knowledgeStatusResponseSchema,
  knowledgeStatusFailure,
  serializeKnowledgeStatusResponse,
  createOwnedSymbolUnderstandingSession,
  symbolUnderstandingWireSchemas,
  symbolUnderstandingResponseSchema,
  symbolUnderstandingFailure,
  serializeSymbolUnderstandingResponse,
  projectContextWireSchemas,
  projectContextResponseSchema,
  projectContextFailure,
  serializeProjectContextResponse,
  createOwnedProjectContextSession,
  knowledgeSearchWireSchemas,
  knowledgeSearchResponseSchema,
  knowledgeSearchFailure,
  serializeKnowledgeSearchResponse,
  createOwnedKnowledgeSearchSession,
  businessTraceWireSchemas,
  businessTraceResponseSchema,
  businessTraceFailure,
  serializeBusinessTraceResponse,
  createOwnedBusinessTraceSession,
} from '@codeatlas/agent-api';

type StatusSession = ReturnType<typeof createOwnedKnowledgeStatusSession>;
type SymbolSession = ReturnType<typeof createOwnedSymbolUnderstandingSession>;
type ContextSession = ReturnType<typeof createOwnedProjectContextSession>;
type SearchSession = ReturnType<typeof createOwnedKnowledgeSearchSession>;
type Session = ReturnType<typeof createOwnedBusinessTraceSession>;
export interface OwnedBusinessStdioLimits {
  maxMessageBytes: number;
  maxConcurrentCalls: number;
  maxItems: number;
  maxDepth: number;
  requestTimeoutMs: number;
}
function record(value: unknown, keys: readonly string[]): PropertyDescriptorMap {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((k) => !descriptors[k]?.enumerable || !Object.hasOwn(descriptors[k]!, 'value'))
  )
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  return descriptors;
}
function stdioLimits(value: unknown): OwnedBusinessStdioLimits {
  const l = record(value, [
    'maxMessageBytes',
    'maxConcurrentCalls',
    'maxItems',
    'maxDepth',
    'requestTimeoutMs',
  ]);
  for (const key of Object.keys(l)) {
    const value = l[key]!.value;
    if (
      !Number.isSafeInteger(value) ||
      Object.is(value, -0) ||
      value < (key === 'maxDepth' ? 0 : 1)
    )
      throw Error('INVALID_OWNED_STDIO_OPTIONS');
  }
  return Object.freeze(
    Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.value])),
  ) as unknown as OwnedBusinessStdioLimits;
}
/** Explicit self-owned host binding only. No production issuer, fixture, DB or Source opener. */
export function createOwnedBusinessTraceMcpServer(
  options: { session: Session; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
) {
  return createOwnedQueryMcpServer(options, streams, 'trace_flow');
}
export function createOwnedKnowledgeSearchMcpServer(
  options: { session: SearchSession; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
) {
  return createOwnedQueryMcpServer(options, streams, 'search_knowledge');
}
export function createOwnedProjectContextMcpServer(
  options: { session: ContextSession; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
) {
  return createOwnedQueryMcpServer(options, streams, 'get_project_context');
}
type ToolName =
  | 'trace_flow'
  | 'search_knowledge'
  | 'get_project_context'
  | 'get_knowledge_status'
  | 'understand_symbol';
type LeafSession =
  | Session
  | SearchSession
  | ContextSession
  | StatusSession
  | SymbolSession
  | ReturnType<typeof createOwnedCodeTraceSession>
  | ReturnType<typeof createOwnedProjectL1Session>;
type ReadSession = LeafSession | ReturnType<typeof composeVersions>;
function matchesVersion(input: unknown, field: 'kind' | 'depth', value: 'CODE' | 'L1') {
  if (!input || typeof input !== 'object' || types.isProxy(input)) return false;
  const d = Object.getOwnPropertyDescriptors(input);
  return (
    Object.hasOwn(d.version ?? {}, 'value') &&
    d.version!.value === 2 &&
    Object.hasOwn(d[field] ?? {}, 'value') &&
    d[field]!.value === value
  );
}
// This is a private route over genuine constructor-owned leaves, not a new authority.
function composeVersions(
  first: LeafSession,
  second: LeafSession,
  field: 'kind' | 'depth',
  value: 'CODE' | 'L1',
) {
  const context = Object.freeze(Object.create(null));
  let closed = false;
  let task: Promise<void> | undefined;
  return Object.freeze({
    context,
    descriptor: Object.freeze({}),
    execute(input: unknown, handle: unknown, control: Parameters<LeafSession['execute']>[2]) {
      if (closed || handle !== context)
        return Promise.resolve(
          field === 'kind'
            ? businessTraceFailure('CONTEXT_UNAVAILABLE')
            : projectContextFailure('CONTEXT_UNAVAILABLE'),
        );
      const next = matchesVersion(input, field, value);
      const leaf = next ? second : first;
      return leaf.execute(input, leaf.context, control);
    },
    close() {
      if (task) return task;
      closed = true;
      const pending: Promise<unknown>[] = [];
      let failed = false;
      for (const leaf of [first, second])
        try {
          const p = Promise.resolve(leaf.close());
          void p.catch(() => undefined);
          pending.push(p);
        } catch {
          failed = true;
        }
      task = Promise.allSettled(pending).then((results) => {
        if (failed || results.some((r) => r.status === 'rejected'))
          throw Error('OWNED_CLEANUP_UNKNOWN');
      });
      void task.catch(() => undefined);
      return task;
    },
  });
}
function versionedConfig<A, B>(
  first: {
    wire: () => { input: object; output: object };
    responseSchema: { safeParse: (v: unknown) => { success: boolean }; parse: (v: unknown) => A };
    serialize: (v: unknown, c: Parameters<LeafSession['execute']>[2]) => string;
  },
  second: {
    wire: () => { input: object; output: object };
    responseSchema: { parse: (v: unknown) => B };
    serialize: (v: unknown, c: Parameters<LeafSession['execute']>[2]) => string;
  },
) {
  return {
    wire: () => ({
      input: { type: 'object' as const, anyOf: [first.wire().input, second.wire().input] },
      output: { type: 'object' as const, anyOf: [first.wire().output, second.wire().output] },
    }),
    responseSchema: {
      parse: (v: unknown) => {
        if (first.responseSchema.safeParse(v).success) return first.responseSchema.parse(v);
        return second.responseSchema.parse(v);
      },
    },
    serialize: (v: unknown, c: Parameters<LeafSession['execute']>[2]) =>
      first.responseSchema.safeParse(v).success ? first.serialize(v, c) : second.serialize(v, c),
  };
}
type Scope = { workspaceId: string; repositoryIds: string[] };
type ScopedPorts<T> = Omit<T, 'workspaceId' | 'repositoryIds'>;
function portFields(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const d = record(value, [
    ...keys,
    ...(Object.hasOwn(value, 'tokenCounter') ? ['tokenCounter'] : []),
  ]);
  return Object.fromEntries(Object.entries(d).map(([key, v]) => [key, v.value]));
}
/** Three existing read contracts, one constructor-owned scope; no startup read or production authority. */
type ThreeReadOptions = {
  scope: Scope;
  business: ScopedPorts<Parameters<typeof createOwnedBusinessTraceSession>[0]>;
  search: ScopedPorts<Parameters<typeof createOwnedKnowledgeSearchSession>[0]>;
  projectContext: ScopedPorts<Parameters<typeof createOwnedProjectContextSession>[0]>;
  limits: OwnedBusinessStdioLimits;
};
type FiveReadOptions = ThreeReadOptions & {
  status: ScopedPorts<Parameters<typeof createOwnedKnowledgeStatusSession>[0]>;
  symbol: ScopedPorts<Parameters<typeof createOwnedSymbolUnderstandingSession>[0]>;
};
export function createOwnedKnowledgeStatusMcpServer(
  options: { session: StatusSession; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
) {
  return createOwnedQueryMcpServer(options, streams, 'get_knowledge_status');
}
export function createOwnedSymbolUnderstandingMcpServer(
  options: { session: SymbolSession; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
) {
  return createOwnedQueryMcpServer(options, streams, 'understand_symbol');
}
export function createOwnedReadToolsMcpServer(
  options: ThreeReadOptions,
  streams: { input: Readable; output: Writable },
) {
  return createOwnedReadToolset(options, streams, false);
}
export function createOwnedFiveReadToolsMcpServer(
  options: FiveReadOptions,
  streams: { input: Readable; output: Writable },
) {
  return createOwnedReadToolset(options, streams, true);
}
type ExtendedReadOptions = FiveReadOptions & {
  code: ScopedPorts<Parameters<typeof createOwnedCodeTraceSession>[0]>;
  l1: ScopedPorts<Parameters<typeof createOwnedProjectL1Session>[0]>;
};
export function createOwnedExtendedReadToolsMcpServer(
  options: ExtendedReadOptions,
  streams: { input: Readable; output: Writable },
) {
  return createOwnedReadToolset(options, streams, true, true);
}
function createOwnedReadToolset(
  options: ThreeReadOptions | FiveReadOptions | ExtendedReadOptions,
  streams: { input: Readable; output: Writable },
  includeStatusAndSymbol: boolean,
  extended = false,
) {
  const d = record(options, [
    'scope',
    'business',
    'search',
    'projectContext',
    'limits',
    ...(includeStatusAndSymbol ? ['status', 'symbol'] : []),
    ...(extended ? ['code', 'l1'] : []),
  ]);
  const p = record(d.scope!.value, ['workspaceId', 'repositoryIds']);
  const limits = stdioLimits(d.limits!.value);
  const rawRepos = p.repositoryIds!.value;
  if (
    typeof p.workspaceId!.value !== 'string' ||
    !Array.isArray(rawRepos) ||
    types.isProxy(rawRepos)
  )
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const rd = Object.getOwnPropertyDescriptors(rawRepos as object),
    length = rd.length!.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > limits.maxItems ||
    Reflect.ownKeys(rd).length !== length + 1
  )
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const repos: string[] = [];
  for (let i = 0; i < length; i++) {
    const v = rd[String(i)];
    if (!v?.enumerable || !Object.hasOwn(v, 'value') || typeof v.value !== 'string')
      throw Error('INVALID_OWNED_STDIO_OPTIONS');
    repos.push(v.value);
  }
  const workspaceId = p.workspaceId!.value as string;
  // Snapshot once before invoking host function binding; do not share the caller's mutable scope array.
  const scope = () => ({ workspaceId, repositoryIds: [...repos] });
  const business = portFields(d.business!.value, [
    'limits',
    'authorize',
    'knowledgeQuery',
  ]) as ScopedPorts<Parameters<typeof createOwnedBusinessTraceSession>[0]>;
  const search = portFields(d.search!.value, [
    'limits',
    'authorize',
    'knowledgeQuery',
  ]) as ScopedPorts<Parameters<typeof createOwnedKnowledgeSearchSession>[0]>;
  const projectContext = portFields(d.projectContext!.value, [
    'selectedRefs',
    'limits',
    'authorize',
    'knowledgeQuery',
  ]) as ScopedPorts<Parameters<typeof createOwnedProjectContextSession>[0]>;
  const made: ReadSession[] = [];
  try {
    let traceSession: ReadSession = createOwnedBusinessTraceSession({ ...business, ...scope() });
    made.push(traceSession);
    const searchSession = createOwnedKnowledgeSearchSession({ ...search, ...scope() });
    made.push(searchSession);
    let contextSession: ReadSession = createOwnedProjectContextSession({
      ...projectContext,
      ...scope(),
    });
    made.push(contextSession);
    if (extended) {
      const code = portFields(d.code!.value, [
        'repositoryId',
        'limits',
        'authorize',
        'openCodeQuery',
      ]) as ScopedPorts<Parameters<typeof createOwnedCodeTraceSession>[0]>;
      const l1 = portFields(d.l1!.value, ['limits', 'authorize', 'knowledgeQuery']) as ScopedPorts<
        Parameters<typeof createOwnedProjectL1Session>[0]
      >;
      const codeSession = createOwnedCodeTraceSession({ ...code, ...scope() });
      made.push(codeSession);
      const l1Session = createOwnedProjectL1Session({ ...l1, ...scope() });
      made.push(l1Session);
      traceSession = composeVersions(traceSession, codeSession, 'kind', 'CODE');
      contextSession = composeVersions(contextSession, l1Session, 'depth', 'L1');
    }
    const additional = new Map<ToolName, ReadSession>([
      ['search_knowledge', searchSession],
      ['get_project_context', contextSession],
    ]);
    if (includeStatusAndSymbol) {
      const status = portFields(d.status!.value, [
        'selectedRefs',
        'limits',
        'authorize',
        'knowledgeQuery',
      ]) as ScopedPorts<Parameters<typeof createOwnedKnowledgeStatusSession>[0]>;
      const symbol = portFields(d.symbol!.value, [
        'repositoryId',
        'limits',
        'authorize',
        'openCodeQuery',
      ]) as ScopedPorts<Parameters<typeof createOwnedSymbolUnderstandingSession>[0]>;
      const statusSession = createOwnedKnowledgeStatusSession({ ...status, ...scope() });
      made.push(statusSession);
      additional.set('get_knowledge_status', statusSession);
      const symbolSession = createOwnedSymbolUnderstandingSession({ ...symbol, ...scope() });
      made.push(symbolSession);
      additional.set('understand_symbol', symbolSession);
    }
    return createOwnedQueryMcpServer(
      { session: traceSession, limits },
      streams,
      'trace_flow',
      additional,
      extended,
    );
  } catch (error) {
    for (const session of made)
      try {
        void Promise.resolve(session.close()).catch(() => undefined);
      } catch {}
    throw error;
  }
}
function createOwnedQueryMcpServer(
  options: { session: ReadSession; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
  tool: ToolName,
  additional: ReadonlyMap<ToolName, ReadSession> = new Map(),
  extended = false,
) {
  const o = record(options, ['session', 'limits']);
  const bindings = new Map(
    [...new Map<ToolName, ReadSession>([[tool, o.session!.value], ...additional])].map(
      ([name, session]) => {
        const config = {
          trace_flow: {
            wire: businessTraceWireSchemas,
            failure: businessTraceFailure,
            responseSchema: businessTraceResponseSchema,
            serialize: serializeBusinessTraceResponse,
            description: extended
              ? 'Self-owned BUSINESS v1 or finite static CODE v2; static calls are not runtime flow; production closed.'
              : 'Self-owned BUSINESS trace only; production access unavailable.',
            ...(extended
              ? versionedConfig(
                  {
                    wire: businessTraceWireSchemas,
                    responseSchema: businessTraceResponseSchema,
                    serialize: serializeBusinessTraceResponse,
                  },
                  {
                    wire: codeTraceWireSchemas,
                    responseSchema: codeTraceResponseSchema,
                    serialize: serializeCodeTraceResponse,
                  },
                )
              : {}),
          },
          search_knowledge: {
            wire: knowledgeSearchWireSchemas,
            failure: knowledgeSearchFailure,
            responseSchema: knowledgeSearchResponseSchema,
            serialize: serializeKnowledgeSearchResponse,
            description:
              'Self-owned lexical phrase first page only; no graph or production access.',
          },
          get_project_context: {
            wire: projectContextWireSchemas,
            failure: projectContextFailure,
            responseSchema: projectContextResponseSchema,
            serialize: serializeProjectContextResponse,
            description: extended
              ? 'Self-owned selected L0 v1 or explicit-query published L1 v2; incomplete project; production closed.'
              : 'Self-owned selected published L0 only; not a complete project; no production access.',
            ...(extended
              ? versionedConfig(
                  {
                    wire: projectContextWireSchemas,
                    responseSchema: projectContextResponseSchema,
                    serialize: serializeProjectContextResponse,
                  },
                  {
                    wire: projectL1WireSchemas,
                    responseSchema: projectL1ResponseSchema,
                    serialize: serializeProjectL1Response,
                  },
                )
              : {}),
          },
          get_knowledge_status: {
            wire: knowledgeStatusWireSchemas,
            failure: knowledgeStatusFailure,
            responseSchema: knowledgeStatusResponseSchema,
            serialize: serializeKnowledgeStatusResponse,
            description:
              'Self-owned selected published metadata only; global health/runs unobserved; no production access.',
          },
          understand_symbol: {
            wire: symbolUnderstandingWireSchemas,
            failure: symbolUnderstandingFailure,
            responseSchema: symbolUnderstandingResponseSchema,
            serialize: serializeSymbolUnderstandingResponse,
            description:
              'Self-owned exact stored code symbol/revision only; runtime relevance unevaluated; no production access.',
          },
        }[name];
        const s = record(session, ['context', 'descriptor', 'execute', 'close']);
        if (
          typeof s.execute!.value !== 'function' ||
          types.isProxy(s.execute!.value) ||
          typeof s.close!.value !== 'function' ||
          types.isProxy(s.close!.value)
        )
          throw Error('INVALID_OWNED_STDIO_OPTIONS');
        const wire = config.wire();
        return [
          name,
          {
            execute: s.execute!.value.bind(session) as ReadSession['execute'],
            invalidate: s.close!.value.bind(session) as ReadSession['close'],
            context: s.context!.value as unknown,
            failure: config.failure,
            responseSchema: config.responseSchema,
            serialize: config.serialize,
            descriptor: {
              name,
              description: config.description,
              inputSchema: wire.input,
              outputSchema: wire.output,
              annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
            },
          },
        ] as const;
      },
    ),
  );
  const limits = stdioLimits(o.limits!.value);
  const server = new Server(
    {
      name: additional.size
        ? 'codeatlas-owned-read-tools'
        : tool === 'get_project_context'
          ? 'codeatlas-owned-context'
          : tool === 'search_knowledge'
            ? 'codeatlas-owned-search'
            : 'codeatlas-owned-business',
      version: '1',
    },
    { capabilities: { tools: {} } },
  );
  const transport = new StdioServerTransport(streams.input, streams.output, {
    maxBufferSize: limits.maxMessageBytes,
  });
  const shutdown = new AbortController();
  let started = false,
    closing = false,
    active = 0,
    writing = 0,
    outputFailed = false;
  const pending = new Set<Promise<unknown>>();
  let closeTask: Promise<{ cleanupState: 'SETTLED' | 'UNKNOWN' }> | undefined;
  let complete!: (value: { cleanupState: 'SETTLED' | 'UNKNOWN' }) => void;
  const completion = new Promise<{ cleanupState: 'SETTLED' | 'UNKNOWN' }>((resolve) => {
    complete = resolve;
  });
  function close() {
    if (closeTask) return closeTask;
    closing = true;
    shutdown.abort();
    let invalidationFailed = false;
    const invalidations: Promise<unknown>[] = [];
    for (const binding of bindings.values()) {
      try {
        const invalidation = Promise.resolve(binding.invalidate());
        void invalidation.catch(() => undefined); // Observe immediately while the transport and requests settle.
        invalidations.push(invalidation);
      } catch {
        invalidationFailed = true;
      }
    }
    closeTask = Promise.resolve().then(async () => {
      let transportFailed = false;
      try {
        await server.close();
      } catch {
        transportFailed = true;
      }
      await Promise.allSettled([...pending]);
      const settledInvalidations = await Promise.allSettled(invalidations);
      if (settledInvalidations.some((result) => result.status === 'rejected'))
        invalidationFailed = true;
      await setImmediate(); // Writable may emit error after its write callback.
      const result = Object.freeze({
        cleanupState:
          invalidationFailed || transportFailed || outputFailed
            ? ('UNKNOWN' as const)
            : ('SETTLED' as const),
      });
      streams.input.removeListener('end', onEnd);
      streams.input.removeListener('error', onEnd);
      streams.output.removeListener('error', onOutputEnd);
      streams.output.removeListener('close', onOutputEnd);
      complete(result);
      return result;
    });
    return closeTask;
  }
  function onEnd() {
    void close();
  }
  function onOutputEnd() {
    outputFailed = true;
    void close();
  }
  server.onclose = onEnd;
  server.onerror = onEnd;
  streams.input.once('end', onEnd);
  streams.input.once('error', onEnd);
  streams.output.once('error', onOutputEnd);
  streams.output.once('close', onOutputEnd);
  // SDK owns message shape/framing. Node write callbacks also settle failed sinks,
  // unlike this SDK version's drain-only send implementation.
  transport.send = async (message) => {
    if (closing) throw Error('OWNED_STDIO_CLOSED');
    const encoded = serializeMessage(message);
    if (
      Buffer.byteLength(encoded, 'utf8') > limits.maxMessageBytes ||
      writing >= limits.maxConcurrentCalls
    ) {
      void close();
      throw Error('MCP_MESSAGE_BUDGET_EXCEEDED');
    }
    writing++;
    const sending = new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (failed = false) => {
        if (done) return;
        done = true;
        streams.output.removeListener('error', failWrite);
        streams.output.removeListener('close', failWrite);
        if (failed) {
          onOutputEnd();
          reject(Error('MCP_OUTPUT_FAILED'));
        } else resolve();
      };
      const failWrite = () => finish(true);
      streams.output.once('error', failWrite);
      streams.output.once('close', failWrite);
      try {
        streams.output.write(encoded, 'utf8', (error) => finish(!!error));
      } catch {
        finish(true);
      }
    });
    pending.add(sending);
    try {
      await sending;
    } finally {
      writing--;
      pending.delete(sending);
    }
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...bindings.values()].map((binding) => binding.descriptor),
  }));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    const binding = bindings.get(request.params.name as ToolName);
    if (!binding) throw new McpError(ErrorCode.MethodNotFound, 'Tool unavailable.');
    const { responseSchema, serialize, execute, context } = binding;
    const failure =
      extended &&
      request.params.name === 'trace_flow' &&
      matchesVersion(request.params.arguments, 'kind', 'CODE')
        ? codeTraceFailure
        : extended &&
            request.params.name === 'get_project_context' &&
            matchesVersion(request.params.arguments, 'depth', 'L1')
          ? projectL1Failure
          : binding.failure;
    const control = Object.freeze({
      signal: AbortSignal.any([extra.signal, shutdown.signal]),
      maxItems: limits.maxItems,
      maxDepth: limits.maxDepth,
      deadlineEpochMs: Date.now() + limits.requestTimeoutMs,
    });
    if (!Number.isSafeInteger(control.deadlineEpochMs))
      throw new McpError(ErrorCode.InvalidRequest, 'Invalid request deadline.');
    const reply = (body: unknown) => {
      const value = responseSchema.parse(body);
      return {
        content: [
          {
            type: 'text' as const,
            text: 'error' in value ? JSON.stringify(value) : serialize(value, control),
          },
        ],
        structuredContent: value,
        isError: 'error' in value,
      };
    };
    if (closing) return reply(failure('CONTEXT_UNAVAILABLE'));
    if (active >= limits.maxConcurrentCalls) return reply(failure('BUDGET_EXCEEDED'));
    active++;
    const task = (async () => {
      let value;
      try {
        value = await execute(request.params.arguments, context, control);
      } catch {
        value = failure('PROVIDER_UNAVAILABLE');
      }
      // Cancellation and close must not turn a late result into a successful delivery.
      if (closing) value = failure('CONTEXT_UNAVAILABLE');
      else if (extra.signal.aborted) value = failure('CANCELLED');
      else if (Date.now() >= control.deadlineEpochMs) value = failure('DEADLINE');
      return reply(value);
    })();
    pending.add(task);
    return task.finally(() => {
      active--;
      pending.delete(task);
    });
  });
  async function start() {
    if (started || closing) throw Error('OWNED_STDIO_ALREADY_STARTED_OR_CLOSED');
    started = true;
    try {
      await server.connect(transport);
    } catch {
      await close();
      throw Error('OWNED_STDIO_START_FAILED');
    }
  }
  return Object.freeze({ start, close, completion });
}
