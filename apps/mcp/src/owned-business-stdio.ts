import { types } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import type { Readable, Writable } from 'node:stream';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { createOwnedReadLifecycle, createOwnedDirectoryObserver } from '@codeatlas/runtime';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createOwnedStoredStructureTraceSession,
  createOwnedProjectL2Session,
  storedStructureWireSchemas,
  storedStructureResponseSchema,
  storedStructureFailure,
  serializeStoredStructureResponse,
  projectL2WireSchemas,
  projectL2ResponseSchema,
  serializeProjectL2Response,
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

import {
  createReceiptKnowledgeSearchSession,
  createReceiptBusinessTraceSession,
  knowledgeSearchWireV2Schemas,
  knowledgeSearchResponseV2Schema,
  knowledgeSearchFailureV2,
  serializeKnowledgeSearchResponseV2,
  businessTraceWireV2Schemas,
  businessTraceResponseV2Schema,
  businessTraceFailureV2,
  serializeBusinessTraceResponseV2,
  createReceiptKnowledgeStatusSession,
  createReceiptProjectContextSession,
  knowledgeStatusWireV2Schemas,
  knowledgeStatusResponseV2Schema,
  knowledgeStatusFailureV2,
  serializeKnowledgeStatusResponseV2,
  projectContextWireV2Schemas,
  projectContextResponseV2Schema,
  projectContextFailureV2,
  serializeProjectContextResponseV2,
} from '@codeatlas/agent-api';

/** Explicit owned schema11 selection only. No database opener or production entry. */
type ReceiptSelectedOptions = {
  scope: Scope;
  status: ScopedPorts<Parameters<typeof createReceiptKnowledgeStatusSession>[0]>;
  projectContext: ScopedPorts<Parameters<typeof createReceiptProjectContextSession>[0]>;
  limits: OwnedBusinessStdioLimits;
};
type ReceiptBinding = {
  signal: AbortSignal;
  check: (scope: Readonly<{ workspaceId: string; repositoryIds: readonly string[] }>) => void;
};
type ReceiptAdditionalOptions = {
  search: ScopedPorts<Parameters<typeof createReceiptKnowledgeSearchSession>[0]>;
  business: ScopedPorts<Parameters<typeof createReceiptBusinessTraceSession>[0]>;
};
export function createReceiptSelectedReadMcpServer(
  options: ReceiptSelectedOptions,
  binding: ReceiptBinding,
  streams: { input: Readable; output: Writable },
) {
  return createReceiptReadMcpServer(options, binding, streams);
}
/** Independent four-tool receipt source route; old two-tool and v1 routes remain unchanged. */
export function createReceiptPublishedReadMcpServer(
  options: ReceiptSelectedOptions & ReceiptAdditionalOptions,
  binding: ReceiptBinding,
  streams: { input: Readable; output: Writable },
) {
  return createReceiptReadMcpServer(options, binding, streams, true);
}
function createReceiptReadMcpServer(
  options: ReceiptSelectedOptions & Partial<ReceiptAdditionalOptions>,
  binding: ReceiptBinding,
  streams: { input: Readable; output: Writable },
  extended = false,
) {
  const fields = record(options, [
      'scope',
      'status',
      'projectContext',
      'limits',
      ...(extended ? ['search', 'business'] : []),
    ]),
    b = record(binding, ['signal', 'check']);
  const limits = stdioLimits(fields.limits!.value),
    rawScope = snapshotReadScope(fields.scope!.value, limits);
  const scope = Object.freeze({
    workspaceId: rawScope.workspaceId,
    repositoryIds: Object.freeze([...rawScope.repositoryIds].sort()),
  });
  const signal = b.signal!.value as AbortSignal,
    check = b.check!.value as typeof binding.check;
  if (
    !(signal instanceof AbortSignal) ||
    types.isProxy(signal) ||
    typeof check !== 'function' ||
    types.isProxy(check)
  )
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!,
    pid = process.pid;
  let valid = true;
  const readiness = () => {
    if (valid)
      try {
        if (aborted.call(signal) || process.pid !== pid) throw Error();
        const value: unknown = check(scope);
        if (value !== undefined) {
          if (types.isPromise(value) && !types.isProxy(value))
            void Promise.prototype.then.call(value, undefined, () => undefined);
          throw Error();
        }
      } catch {
        valid = false;
      }
    return { ready: valid, generation: 0 };
  };
  const makePorts = (raw: unknown, selected = true) => {
    const ports = portFields(raw, [
      ...(selected ? ['selectedRefs'] : []),
      'limits',
      'authorize',
      'knowledgeQuery',
    ]);
    const authorize = ports.authorize;
    if (typeof authorize !== 'function' || types.isProxy(authorize))
      throw Error('INVALID_OWNED_STDIO_OPTIONS');
    return {
      ...ports,
      workspaceId: scope.workspaceId,
      repositoryIds: [...scope.repositoryIds],
      authorize: (manifest: unknown, c: unknown) => {
        if (!readiness().ready) throw Error('OWNED_BINDING_UNAVAILABLE');
        return Reflect.apply(authorize, raw, [manifest, c]);
      },
    };
  };
  const status = createReceiptKnowledgeStatusSession(
    makePorts(fields.status!.value) as Parameters<typeof createReceiptKnowledgeStatusSession>[0],
  );
  let context: ReturnType<typeof createReceiptProjectContextSession>;
  try {
    context = createReceiptProjectContextSession(
      makePorts(fields.projectContext!.value) as Parameters<
        typeof createReceiptProjectContextSession
      >[0],
    );
  } catch (error) {
    status.close();
    throw error;
  }
  const additional = new Map<ToolName, ReadSession>([['get_project_context', context]]);
  let app: ReturnType<typeof createOwnedQueryMcpServer>;
  try {
    if (extended) {
      additional.set(
        'search_knowledge',
        createReceiptKnowledgeSearchSession(
          makePorts(fields.search!.value, false) as Parameters<
            typeof createReceiptKnowledgeSearchSession
          >[0],
        ),
      );
      additional.set(
        'trace_flow',
        createReceiptBusinessTraceSession(
          makePorts(fields.business!.value, false) as Parameters<
            typeof createReceiptBusinessTraceSession
          >[0],
        ),
      );
    }
    app = createOwnedQueryMcpServer(
      { session: status, limits },
      streams,
      'get_knowledge_status',
      additional,
      false,
      false,
      readiness,
      true,
    );
  } catch (error) {
    status.close();
    for (const session of additional.values()) void session.close();
    throw error;
  }
  const stop = () => {
    valid = false;
    void app.close().catch(() => undefined);
  };
  EventTarget.prototype.addEventListener.call(signal, 'abort', stop, { once: true });
  if (aborted.call(signal)) stop();
  void app.completion
    .finally(() => EventTarget.prototype.removeEventListener.call(signal, 'abort', stop))
    .catch(() => undefined);
  return app;
}

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
type ReadSession = {
  context: unknown;
  descriptor: unknown;
  execute(input: unknown, handle: unknown, c: Parameters<Session['execute']>[2]): Promise<unknown>;
  close(): void | Promise<void>;
};
function matchesVersion(
  input: unknown,
  field: 'kind' | 'depth',
  value: string | readonly string[],
  version = 2,
) {
  if (!input || typeof input !== 'object' || types.isProxy(input)) return false;
  const d = Object.getOwnPropertyDescriptors(input);
  return (
    Object.hasOwn(d.version ?? {}, 'value') &&
    d.version!.value === version &&
    Object.hasOwn(d[field] ?? {}, 'value') &&
    (Array.isArray(value) ? value.includes(d[field]!.value) : d[field]!.value === value)
  );
}
// This is a private route over genuine constructor-owned leaves, not a new authority.
function composeVersions(
  first: ReadSession,
  second: ReadSession,
  field: 'kind' | 'depth',
  value: string | readonly string[],
  version = 2,
): ReadSession {
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
      const next = matchesVersion(input, field, value, version);
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
function versionedConfig(
  first: {
    wire: () => { input: object; output: object };
    responseSchema: {
      safeParse: (v: unknown) => { success: boolean };
      parse: (v: unknown) => Record<string, unknown>;
    };
    serialize: (v: unknown, c: Parameters<LeafSession['execute']>[2]) => string;
  },
  second: {
    wire: () => { input: object; output: object };
    responseSchema: { parse: (v: unknown) => Record<string, unknown> };
    serialize: (v: unknown, c: Parameters<LeafSession['execute']>[2]) => string;
  },
) {
  return {
    wire: () => ({
      input: { type: 'object' as const, anyOf: [first.wire().input, second.wire().input] },
      output: { type: 'object' as const, anyOf: [first.wire().output, second.wire().output] },
    }),
    responseSchema: {
      safeParse: (v: unknown) => {
        try {
          if (first.responseSchema.safeParse(v).success) first.responseSchema.parse(v);
          else second.responseSchema.parse(v);
          return { success: true };
        } catch {
          return { success: false };
        }
      },
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
type PublishedReadOptions = ThreeReadOptions & {
  status: ScopedPorts<Parameters<typeof createOwnedKnowledgeStatusSession>[0]>;
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
/** Trusted in-process owned-data binding; never accepts request-supplied grants or opens a database. */
export function createLocalPublishedReadMcpServer(
  options: PublishedReadOptions,
  binding: {
    signal: AbortSignal;
    check: (scope: Readonly<{ workspaceId: string; repositoryIds: readonly string[] }>) => void;
  },
  streams: { input: Readable; output: Writable },
) {
  const b = record(binding, ['signal', 'check']);
  const signal = b.signal!.value as AbortSignal;
  const check = b.check!.value as (
    scope: Readonly<{ workspaceId: string; repositoryIds: readonly string[] }>,
  ) => void;
  const fields = record(options, [
    'scope',
    'business',
    'search',
    'projectContext',
    'status',
    'limits',
  ]);
  const originalScope = snapshotReadScope(fields.scope!.value, stdioLimits(fields.limits!.value));
  const scope = Object.freeze({
    workspaceId: originalScope.workspaceId,
    repositoryIds: Object.freeze([...originalScope.repositoryIds].sort()),
  });
  const captured = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value]));
  captured.scope = scope;
  if (
    !(signal instanceof AbortSignal) ||
    types.isProxy(signal) ||
    typeof check !== 'function' ||
    types.isProxy(check)
  )
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
  const pid = process.pid;
  let valid = true;
  const readiness = () => {
    if (valid) {
      try {
        if (aborted.call(signal) || process.pid !== pid) throw Error();
        const receipt: unknown = check(scope);
        if (receipt !== undefined) {
          if (types.isPromise(receipt) && !types.isProxy(receipt))
            void Promise.prototype.then.call(receipt, undefined, () => undefined);
          throw Error(); // Async/boolean receipts are not authorization.
        }
      } catch {
        valid = false;
      }
    }
    return { ready: valid, generation: 0 };
  };
  const app = createOwnedReadToolset(
    captured as PublishedReadOptions,
    streams,
    'PUBLISHED_ONLY',
    false,
    false,
    readiness,
  );
  const stop = () => {
    valid = false;
    void app.close().catch(() => undefined);
  };
  EventTarget.prototype.addEventListener.call(signal, 'abort', stop, { once: true });
  if (aborted.call(signal)) stop();
  void app.completion
    .finally(() => EventTarget.prototype.removeEventListener.call(signal, 'abort', stop))
    .catch(() => undefined);
  return Object.freeze({
    ...app,
    start: async () => {
      if (!readiness().ready) throw Error('LOCAL_PUBLISHED_BINDING_UNAVAILABLE');
      return app.start();
    },
    close: () => {
      valid = false;
      return app.close();
    },
  });
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
type StructureReadOptions = ExtendedReadOptions & {
  structure: ScopedPorts<Parameters<typeof createOwnedStoredStructureTraceSession>[0]>;
  l2: ScopedPorts<Parameters<typeof createOwnedProjectL2Session>[0]>;
};
export function createOwnedStructureReadToolsMcpServer(
  options: StructureReadOptions,
  streams: { input: Readable; output: Writable },
) {
  return createOwnedReadToolset(options, streams, true, true, true);
}
function snapshotReadScope(value: unknown, limits: OwnedBusinessStdioLimits) {
  const p = record(value, ['workspaceId', 'repositoryIds']);
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
  return Object.freeze({ workspaceId, repositoryIds: Object.freeze(repos) });
}

type LifecycleOptions = Parameters<typeof createOwnedReadLifecycle>[0];
type ManagedReadOptions = StructureReadOptions & {
  lifecycle: Pick<LifecycleOptions, 'mode' | 'reconcile' | 'watch'>;
};
export function createOwnedManagedReadToolsMcpServer(
  options: ManagedReadOptions,
  streams: { input: Readable; output: Writable },
) {
  const keys = [
    'scope',
    'business',
    'search',
    'projectContext',
    'limits',
    'status',
    'symbol',
    'code',
    'l1',
    'structure',
    'l2',
  ];
  const d = record(options, [...keys, 'lifecycle']);
  const limits = stdioLimits(d.limits!.value),
    scope = snapshotReadScope(d.scope!.value, limits);
  const value = d.lifecycle!.value;
  if (!value || typeof value !== 'object' || types.isProxy(value))
    throw Error('INVALID_OWNED_STDIO_OPTIONS');
  const l = record(value, [
    'mode',
    'reconcile',
    ...(Object.hasOwn(value, 'watch') ? ['watch'] : []),
  ]);
  const lifecycle = createOwnedReadLifecycle({
    mode: l.mode!.value,
    workspaceId: scope.workspaceId,
    repositoryIds: [...scope.repositoryIds],
    maxItems: limits.maxItems,
    maxDepth: limits.maxDepth,
    requestTimeoutMs: limits.requestTimeoutMs,
    reconcile: l.reconcile!.value,
    ...(l.watch ? { watch: l.watch.value } : {}),
  });
  const plain = Object.fromEntries(keys.map((k) => [k, d[k]!.value]));
  plain.scope = { workspaceId: scope.workspaceId, repositoryIds: [...scope.repositoryIds] };
  plain.limits = limits;
  let app: ReturnType<typeof createOwnedStructureReadToolsMcpServer>;
  try {
    app = createOwnedReadToolset(plain as StructureReadOptions, streams, true, true, true, () => {
      const s = lifecycle.getState();
      return { ready: s.phase === 'READY' && !s.uncertain, generation: s.generation };
    });
  } catch (e) {
    void lifecycle.close().catch(() => undefined);
    throw e;
  }
  let starting: Promise<void> | undefined,
    closing: Promise<{ cleanupState: 'SETTLED' | 'UNKNOWN' }> | undefined,
    closed = false;
  let completed!: (v: { cleanupState: 'SETTLED' | 'UNKNOWN' }) => void;
  const completion = new Promise<{ cleanupState: 'SETTLED' | 'UNKNOWN' }>((r) => (completed = r));
  function close() {
    if (closing) return closing;
    closed = true;
    let finish!: (v: { cleanupState: 'SETTLED' | 'UNKNOWN' }) => void;
    closing = new Promise((r) => (finish = r));
    const tasks: Promise<{ cleanupState: 'SETTLED' | 'UNKNOWN' }>[] = [];
    let failed = false;
    for (const stop of [() => lifecycle.close(), () => app.close()])
      try {
        const p = Promise.resolve(stop());
        void p.catch(() => undefined);
        tasks.push(p);
      } catch {
        failed = true;
      }
    void (async () => {
      const results = await Promise.allSettled(tasks);
      if (starting) await Promise.allSettled([starting]);
      const result = Object.freeze({
        cleanupState:
          failed ||
          results.some((r) => r.status === 'rejected' || r.value.cleanupState === 'UNKNOWN')
            ? ('UNKNOWN' as const)
            : ('SETTLED' as const),
      });
      finish(result);
      completed(result);
    })();
    return closing;
  }
  function start() {
    if (closed) {
      const p = Promise.reject(Error('OWNED_MANAGED_CLOSED'));
      void p.catch(() => undefined);
      return p;
    }
    if (starting) return starting;
    starting = Promise.resolve()
      .then(async () => {
        await lifecycle.start();
        if (closed) throw Error('OWNED_MANAGED_CLOSED');
        await app.start();
        if (closed) throw Error('OWNED_MANAGED_CLOSED');
      })
      .catch(() => {
        void close();
        throw Error('OWNED_MANAGED_START_FAILED');
      });
    void starting.catch(() => undefined);
    return starting;
  }
  lifecycle.signal.addEventListener(
    'abort',
    () => {
      void close();
    },
    { once: true },
  );
  void app.completion.then(
    () => close(),
    () => close(),
  );
  void lifecycle.completion.then(
    () => close(),
    () => close(),
  );
  return Object.freeze({ start, close, completion, getLifecycleState: () => lifecycle.getState() });
}
type OwnedDirectoryManagedOptions = Omit<ManagedReadOptions, 'lifecycle'> & {
  lifecycle: Pick<LifecycleOptions, 'mode' | 'reconcile'>;
};
/** Fresh-owned-directory wiring only; no caller path, watch override or production grant. */
export function createOwnedDirectoryManagedReadToolsMcpServer(
  options: OwnedDirectoryManagedOptions,
  streams: { input: Readable; output: Writable },
) {
  const d = record(options, [
    'scope',
    'business',
    'search',
    'projectContext',
    'limits',
    'status',
    'symbol',
    'code',
    'l1',
    'structure',
    'l2',
    'lifecycle',
  ]);
  const l = record(d.lifecycle!.value, ['mode', 'reconcile']);
  if (l.mode!.value !== 'MCP_STDIO') throw Error('INVALID_OWNED_STDIO_OPTIONS');
  let observer: Awaited<ReturnType<typeof createOwnedDirectoryObserver>> | undefined;
  const app = createOwnedManagedReadToolsMcpServer(
    {
      ...Object.fromEntries(Object.entries(d).map(([key, value]) => [key, value.value])),
      lifecycle: {
        mode: 'MCP_STDIO',
        reconcile: l.reconcile!.value,
        watch: async (listener, scope, control) => {
          const handle = await createOwnedDirectoryObserver(scope, listener, control);
          observer = handle;
          handle.signal.addEventListener(
            'abort',
            () => {
              void app.close();
            },
            { once: true },
          );
          if (handle.signal.aborted) void app.close();
          return { close: () => handle.close() };
        },
      },
    } as ManagedReadOptions,
    streams,
  );
  return Object.freeze({ ...app, getOwnedDirectory: () => observer?.directory ?? null });
}
type Readiness = () => Readonly<{ ready: boolean; generation: number }>;
function createOwnedReadToolset(
  options:
    | ThreeReadOptions
    | PublishedReadOptions
    | FiveReadOptions
    | ExtendedReadOptions
    | StructureReadOptions,
  streams: { input: Readable; output: Writable },
  includeStatusAndSymbol: boolean | 'PUBLISHED_ONLY',
  extended = false,
  stored = false,
  readiness?: Readiness,
) {
  const d = record(options, [
    'scope',
    'business',
    'search',
    'projectContext',
    'limits',
    ...(includeStatusAndSymbol ? ['status'] : []),
    ...(includeStatusAndSymbol === true ? ['symbol'] : []),
    ...(extended ? ['code', 'l1'] : []),
    ...(stored ? ['structure', 'l2'] : []),
  ]);
  const limits = stdioLimits(d.limits!.value);
  const captured = snapshotReadScope(d.scope!.value, limits);
  const scope = () => ({
    workspaceId: captured.workspaceId,
    repositoryIds: [...captured.repositoryIds],
  });
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
    if (stored) {
      const getPorts = (value: unknown) =>
        portFields(value, [
          'repositoryId',
          'limits',
          'authorize',
          'openRuntimeQuery',
        ]) as ScopedPorts<Parameters<typeof createOwnedStoredStructureTraceSession>[0]>;
      const structureSession = createOwnedStoredStructureTraceSession({
        ...getPorts(d.structure!.value),
        ...scope(),
      });
      made.push(structureSession);
      const l2Session = createOwnedProjectL2Session({ ...getPorts(d.l2!.value), ...scope() });
      made.push(l2Session);
      traceSession = composeVersions(
        traceSession,
        structureSession,
        'kind',
        ['EXECUTION', 'RUNTIME'],
        3,
      );
      contextSession = composeVersions(contextSession, l2Session, 'depth', 'L2', 3);
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
      const statusSession = createOwnedKnowledgeStatusSession({ ...status, ...scope() });
      made.push(statusSession);
      additional.set('get_knowledge_status', statusSession);
      if (includeStatusAndSymbol === true) {
        const symbol = portFields(d.symbol!.value, [
          'repositoryId',
          'limits',
          'authorize',
          'openCodeQuery',
        ]) as ScopedPorts<Parameters<typeof createOwnedSymbolUnderstandingSession>[0]>;
        const symbolSession = createOwnedSymbolUnderstandingSession({ ...symbol, ...scope() });
        made.push(symbolSession);
        additional.set('understand_symbol', symbolSession);
      }
    }
    return createOwnedQueryMcpServer(
      { session: traceSession, limits },
      streams,
      'trace_flow',
      additional,
      extended,
      stored,
      readiness,
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
  stored = false,
  readiness?: Readiness,
  receipt = false,
) {
  const o = record(options, ['session', 'limits']);
  const bindings = new Map(
    [...new Map<ToolName, ReadSession>([[tool, o.session!.value], ...additional])].map(
      ([name, session]) => {
        const originalConfig =
          receipt && name === 'search_knowledge'
            ? {
                wire: knowledgeSearchWireV2Schemas,
                failure: knowledgeSearchFailureV2,
                responseSchema: knowledgeSearchResponseV2Schema,
                serialize: serializeKnowledgeSearchResponseV2,
                description:
                  'Self-owned receipt lexical phrase first page only; explicit rebuilt index, quality unavailable, production closed.',
              }
            : receipt && name === 'trace_flow'
              ? {
                  wire: businessTraceWireV2Schemas,
                  failure: businessTraceFailureV2,
                  responseSchema: businessTraceResponseV2Schema,
                  serialize: serializeBusinessTraceResponseV2,
                  description:
                    'Self-owned receipt BUSINESS declared steps only; not observed runtime, production closed.',
                }
              : receipt && name === 'get_knowledge_status'
                ? {
                    wire: knowledgeStatusWireV2Schemas,
                    failure: knowledgeStatusFailureV2,
                    responseSchema: knowledgeStatusResponseV2Schema,
                    serialize: serializeKnowledgeStatusResponseV2,
                    description:
                      'Self-owned schema11 receipt status v2; explicit current published selection; quality unavailable and production closed.',
                  }
                : receipt && name === 'get_project_context'
                  ? {
                      wire: projectContextWireV2Schemas,
                      failure: projectContextFailureV2,
                      responseSchema: projectContextResponseV2Schema,
                      serialize: serializeProjectContextResponseV2,
                      description:
                        'Self-owned schema11 receipt L0 v2; explicit selected summaries only, incomplete project, quality unavailable and production closed.',
                    }
                  : {
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
        const config =
          stored && name === 'trace_flow'
            ? {
                ...originalConfig,
                ...versionedConfig(originalConfig, {
                  wire: storedStructureWireSchemas,
                  responseSchema: storedStructureResponseSchema,
                  serialize: serializeStoredStructureResponse,
                }),
                description:
                  'Self-owned bounded CODE/BUSINESS and stored EXECUTION/RUNTIME; derived structures are not observed execution; production closed.',
              }
            : stored && name === 'get_project_context'
              ? {
                  ...originalConfig,
                  ...versionedConfig(originalConfig, {
                    wire: projectL2WireSchemas,
                    responseSchema: projectL2ResponseSchema,
                    serialize: serializeProjectL2Response,
                  }),
                  description:
                    'Self-owned selected L0/explicit published L1/explicit stored structure L2; incomplete project; production closed.',
                }
              : originalConfig;
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
      stored &&
      ((request.params.name === 'trace_flow' &&
        matchesVersion(request.params.arguments, 'kind', ['EXECUTION', 'RUNTIME'], 3)) ||
        (request.params.name === 'get_project_context' &&
          matchesVersion(request.params.arguments, 'depth', 'L2', 3)))
        ? storedStructureFailure
        : extended &&
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
    const observed = readiness?.();
    if (closing || (readiness && !observed?.ready)) return reply(failure('CONTEXT_UNAVAILABLE'));
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
      const current = readiness?.();
      if (
        closing ||
        (readiness && (!current?.ready || current.generation !== observed?.generation))
      )
        value = failure('CONTEXT_UNAVAILABLE');
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
