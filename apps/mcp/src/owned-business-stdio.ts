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
type ToolName = 'trace_flow' | 'search_knowledge' | 'get_project_context';
type ReadSession = Session | SearchSession | ContextSession;
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
export function createOwnedReadToolsMcpServer(
  options: {
    scope: Scope;
    business: ScopedPorts<Parameters<typeof createOwnedBusinessTraceSession>[0]>;
    search: ScopedPorts<Parameters<typeof createOwnedKnowledgeSearchSession>[0]>;
    projectContext: ScopedPorts<Parameters<typeof createOwnedProjectContextSession>[0]>;
    limits: OwnedBusinessStdioLimits;
  },
  streams: { input: Readable; output: Writable },
) {
  const d = record(options, ['scope', 'business', 'search', 'projectContext', 'limits']);
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
    const traceSession = createOwnedBusinessTraceSession({ ...business, ...scope() });
    made.push(traceSession);
    const searchSession = createOwnedKnowledgeSearchSession({ ...search, ...scope() });
    made.push(searchSession);
    const contextSession = createOwnedProjectContextSession({ ...projectContext, ...scope() });
    made.push(contextSession);
    return createOwnedQueryMcpServer(
      { session: traceSession, limits },
      streams,
      'trace_flow',
      new Map<ToolName, ReadSession>([
        ['search_knowledge', searchSession],
        ['get_project_context', contextSession],
      ]),
    );
  } catch (error) {
    for (const session of made) session.close();
    throw error;
  }
}
function createOwnedQueryMcpServer(
  options: { session: Session | SearchSession | ContextSession; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
  tool: ToolName,
  additional: ReadonlyMap<ToolName, ReadSession> = new Map(),
) {
  const o = record(options, ['session', 'limits']);
  const bindings = new Map(
    [...new Map<ToolName, ReadSession>([[tool, o.session!.value], ...additional])].map(
      ([name, session]) => {
        const isSearch = name === 'search_knowledge',
          isContext = name === 'get_project_context';
        const s = record(session, ['context', 'descriptor', 'execute', 'close']);
        if (
          typeof s.execute!.value !== 'function' ||
          types.isProxy(s.execute!.value) ||
          typeof s.close!.value !== 'function' ||
          types.isProxy(s.close!.value)
        )
          throw Error('INVALID_OWNED_STDIO_OPTIONS');
        const wire = isContext
          ? projectContextWireSchemas()
          : isSearch
            ? knowledgeSearchWireSchemas()
            : businessTraceWireSchemas();
        return [
          name,
          {
            execute: s.execute!.value.bind(session) as ReadSession['execute'],
            invalidate: s.close!.value.bind(session) as Session['close'],
            context: s.context!.value as unknown,
            failure: isContext
              ? projectContextFailure
              : isSearch
                ? knowledgeSearchFailure
                : businessTraceFailure,
            responseSchema: isContext
              ? projectContextResponseSchema
              : isSearch
                ? knowledgeSearchResponseSchema
                : businessTraceResponseSchema,
            serialize: isContext
              ? serializeProjectContextResponse
              : isSearch
                ? serializeKnowledgeSearchResponse
                : serializeBusinessTraceResponse,
            descriptor: {
              name,
              description: isContext
                ? 'Self-owned selected published L0 only; not a complete project; no production access.'
                : isSearch
                  ? 'Self-owned lexical phrase first page only; no graph or production access.'
                  : 'Self-owned BUSINESS trace only; production access unavailable.',
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
    for (const binding of bindings.values()) {
      try {
        binding.invalidate();
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
    const { failure, responseSchema, serialize, execute, context } = binding;
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
