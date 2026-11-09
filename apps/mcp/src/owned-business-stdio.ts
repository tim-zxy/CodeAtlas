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
  businessTraceWireSchemas,
  businessTraceResponseSchema,
  businessTraceFailure,
  serializeBusinessTraceResponse,
  type createOwnedBusinessTraceSession,
} from '@codeatlas/agent-api';

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
/** Explicit self-owned host binding only. No production issuer, fixture, DB or Source opener. */
export function createOwnedBusinessTraceMcpServer(
  options: { session: Session; limits: OwnedBusinessStdioLimits },
  streams: { input: Readable; output: Writable },
) {
  const o = record(options, ['session', 'limits']);
  const s = record(o.session!.value, ['context', 'descriptor', 'execute', 'close']);
  if (
    typeof s.execute!.value !== 'function' ||
    types.isProxy(s.execute!.value) ||
    typeof s.close!.value !== 'function' ||
    types.isProxy(s.close!.value)
  )
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const l = record(o.limits!.value, [
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
  const limits = Object.freeze(
    Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.value])),
  ) as unknown as OwnedBusinessStdioLimits;
  const execute = s.execute!.value.bind(o.session!.value) as Session['execute'];
  const invalidate = s.close!.value.bind(o.session!.value) as Session['close'];
  const context: unknown = s.context!.value;
  const server = new Server(
    { name: 'codeatlas-owned-business', version: '1' },
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
    try {
      invalidate();
    } catch {
      invalidationFailed = true;
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
  const { input: inputSchema, output: outputSchema } = businessTraceWireSchemas();
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'trace_flow',
        description: 'Self-owned BUSINESS trace only; production access unavailable.',
        inputSchema,
        outputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    if (request.params.name !== 'trace_flow')
      throw new McpError(ErrorCode.MethodNotFound, 'Tool unavailable.');
    const control = Object.freeze({
      signal: AbortSignal.any([extra.signal, shutdown.signal]),
      maxItems: limits.maxItems,
      maxDepth: limits.maxDepth,
      deadlineEpochMs: Date.now() + limits.requestTimeoutMs,
    });
    if (!Number.isSafeInteger(control.deadlineEpochMs))
      throw new McpError(ErrorCode.InvalidRequest, 'Invalid request deadline.');
    const reply = (body: unknown) => {
      const value = businessTraceResponseSchema.parse(body);
      return {
        content: [
          {
            type: 'text' as const,
            text:
              'error' in value
                ? JSON.stringify(value)
                : serializeBusinessTraceResponse(value, control),
          },
        ],
        structuredContent: value,
        isError: 'error' in value,
      };
    };
    if (closing) return reply(businessTraceFailure('CONTEXT_UNAVAILABLE'));
    if (active >= limits.maxConcurrentCalls) return reply(businessTraceFailure('BUDGET_EXCEEDED'));
    active++;
    const task = (async () => {
      let value;
      try {
        value = await execute(request.params.arguments, context, control);
      } catch {
        value = businessTraceFailure('PROVIDER_UNAVAILABLE');
      }
      // Cancellation and close must not turn a late result into a successful delivery.
      if (closing) value = businessTraceFailure('CONTEXT_UNAVAILABLE');
      else if (extra.signal.aborted) value = businessTraceFailure('CANCELLED');
      else if (Date.now() >= control.deadlineEpochMs) value = businessTraceFailure('DEADLINE');
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
