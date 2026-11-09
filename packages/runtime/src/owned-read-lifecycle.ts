import { types } from 'node:util';
import type { RuntimeWorkflowRequest } from '@codeatlas/application';
type Control = RuntimeWorkflowRequest['control'];
export type OwnedReadScope = Readonly<{ workspaceId: string; repositoryIds: readonly string[] }>;
export type OwnedReadReason = 'STARTUP' | 'POST_ATTACH' | 'CHANGE' | 'OVERFLOW';
export type OwnedReadEvent = 'CHANGE' | 'OVERFLOW';
export type OwnedReadCleanup = Readonly<{ cleanupState: 'SETTLED' | 'UNKNOWN' }>;
export interface OwnedReadLifecycleOptions {
  mode: 'ONE_SHOT' | 'MCP_STDIO';
  workspaceId: string;
  repositoryIds: string[];
  maxItems: number;
  maxDepth: number;
  requestTimeoutMs: number;
  reconcile(reason: OwnedReadReason, scope: OwnedReadScope, control: Control): Promise<void>;
  watch?(
    listener: (event: OwnedReadEvent) => void,
    scope: OwnedReadScope,
    control: Control,
  ): Promise<{ close(): void | Promise<void> }>;
}
type Phase =
  'IDLE' | 'STARTING' | 'READY' | 'RECONCILING' | 'UNCERTAIN' | 'CLOSING' | 'CLOSED' | 'FAILED';
export interface OwnedReadLifecycle {
  readonly signal: Control['signal'];
  readonly completion: Promise<OwnedReadCleanup>;
  start(): Promise<void>;
  close(): Promise<OwnedReadCleanup>;
  getState(): Readonly<{ phase: Phase; uncertain: boolean; dirty: boolean; generation: number }>;
}
type FailureCode =
  'INVALID_OPTIONS' | 'LIFECYCLE_CLOSED' | 'RECONCILIATION_FAILED' | 'WATCH_FAILED';
function failure(code: FailureCode) {
  return Object.assign(Error(code), { code });
}
function invalid(): never {
  throw failure('INVALID_OPTIONS');
}
function properties(value: unknown): PropertyDescriptorMap {
  if (!value || typeof value !== 'object' || types.isProxy(value)) invalid();
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).some(
      (k) => typeof k !== 'string' || !Object.hasOwn(d[k]!, 'value') || !d[k]!.enumerable,
    )
  )
    invalid();
  return d;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}
function callback(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function' && !types.isProxy(value);
}
function observed<T>(promise: Promise<T>) {
  void promise.catch(() => undefined);
  return promise;
}
/** Private callback coordination only: readiness and generation grant no data or freshness authority. */
export function createOwnedReadLifecycle(options: OwnedReadLifecycleOptions): OwnedReadLifecycle {
  const d = properties(options),
    required = [
      'mode',
      'workspaceId',
      'repositoryIds',
      'maxItems',
      'maxDepth',
      'requestTimeoutMs',
      'reconcile',
    ];
  if (
    required.some((k) => !Object.hasOwn(d, k)) ||
    Object.keys(d).some((k) => !required.includes(k) && k !== 'watch')
  )
    invalid();
  const mode = d.mode!.value as unknown,
    workspaceId = d.workspaceId!.value as unknown;
  if ((mode !== 'ONE_SHOT' && mode !== 'MCP_STDIO') || !text(workspaceId)) invalid();
  const maxItems = d.maxItems!.value as unknown,
    maxDepth = d.maxDepth!.value as unknown,
    requestTimeoutMs = d.requestTimeoutMs!.value as unknown;
  if (
    typeof maxItems !== 'number' ||
    !Number.isSafeInteger(maxItems) ||
    maxItems <= 0 ||
    typeof maxDepth !== 'number' ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    Object.is(maxDepth, -0) ||
    typeof requestTimeoutMs !== 'number' ||
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs <= 0
  )
    invalid();
  const bounds = Object.freeze({ maxItems, maxDepth, requestTimeoutMs });
  const raw = d.repositoryIds!.value as unknown;
  if (!Array.isArray(raw) || types.isProxy(raw) || raw.length > bounds.maxItems) invalid();
  const a = Object.getOwnPropertyDescriptors(raw),
    repositoryIds: string[] = [];
  if (
    Reflect.ownKeys(a).some(
      (k) =>
        typeof k !== 'string' ||
        (k !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= raw.length)) ||
        !Object.hasOwn(a[k as string]!, 'value'),
    )
  )
    invalid();
  for (let i = 0; i < raw.length; i++) {
    const value = a[String(i)]?.value as unknown;
    if (!text(value)) invalid();
    repositoryIds.push(value);
  }
  if (!repositoryIds.length || new Set(repositoryIds).size !== repositoryIds.length) invalid();
  repositoryIds.sort();
  // Capture scope and numeric policy before binding any host function.
  const scope: OwnedReadScope = Object.freeze({
    workspaceId,
    repositoryIds: Object.freeze(repositoryIds),
  });
  if (
    !callback(d.reconcile!.value) ||
    (mode === 'MCP_STDIO' && !callback(d.watch?.value)) ||
    (d.watch && !callback(d.watch.value))
  )
    invalid();
  const reconcile = Function.prototype.bind.call(
    d.reconcile!.value,
    options,
  ) as OwnedReadLifecycleOptions['reconcile'];
  const watch = d.watch
    ? (Function.prototype.bind.call(d.watch.value, options) as NonNullable<
        OwnedReadLifecycleOptions['watch']
      >)
    : undefined;
  const abort = new AbortController();
  let phase: Phase = 'IDLE',
    uncertain = false,
    dirty = false,
    overflow = false,
    generation = 0;
  let ready = false,
    closed = false,
    failed = false,
    cleanupUnknown = false;
  let startWork: Promise<void> | undefined,
    drainWork: Promise<void> | undefined,
    closeWork: Promise<OwnedReadCleanup> | undefined;
  let watcherClose: (() => void | Promise<void>) | undefined;
  let finish!: (result: OwnedReadCleanup) => void;
  const completion = new Promise<OwnedReadCleanup>((resolve) => {
    finish = resolve;
  });
  function active() {
    if (closed) throw failure('LIFECYCLE_CLOSED');
  }
  function control(): Control {
    const deadlineEpochMs = Date.now() + bounds.requestTimeoutMs;
    if (!Number.isSafeInteger(deadlineEpochMs)) throw failure('RECONCILIATION_FAILED');
    return Object.freeze({
      maxItems: bounds.maxItems,
      maxDepth: bounds.maxDepth,
      deadlineEpochMs,
      signal: abort.signal,
    });
  }
  function stopForFailure() {
    cleanupUnknown = true;
    failed = true;
    uncertain = true;
    phase = 'FAILED';
    void close();
  }
  async function invokeReconcile(reason: OwnedReadReason) {
    active();
    const c = control();
    try {
      const work = reconcile(reason, scope, c);
      if (!types.isPromise(work) || types.isProxy(work)) throw failure('RECONCILIATION_FAILED');
      const result = await work;
      if (result !== undefined || (!closed && Date.now() >= c.deadlineEpochMs))
        throw failure('RECONCILIATION_FAILED');
    } catch {
      cleanupUnknown = true;
      throw failure('RECONCILIATION_FAILED');
    }
    active();
  }
  async function drain() {
    while (dirty && !closed) {
      const reason = overflow ? 'OVERFLOW' : 'CHANGE';
      dirty = false;
      overflow = false;
      phase = uncertain ? 'UNCERTAIN' : 'RECONCILING';
      await invokeReconcile(reason);
      if (!overflow) uncertain = false;
    }
    if (!closed) {
      ready = true;
      phase = 'READY';
    }
  }
  function schedule() {
    if (closed || !ready || drainWork) return;
    // Register before the microtask can invoke an injected host callback.
    drainWork = observed(
      Promise.resolve()
        .then(drain)
        .catch(() => {
          stopForFailure();
        })
        .finally(() => {
          drainWork = undefined;
          if (!closed && dirty) schedule();
        }),
    );
  }
  function event(value: OwnedReadEvent) {
    if (closed) return;
    if ((value !== 'CHANGE' && value !== 'OVERFLOW') || generation === Number.MAX_SAFE_INTEGER) {
      stopForFailure();
      return;
    }
    generation++;
    dirty = true;
    if (value === 'OVERFLOW') {
      overflow = true;
      uncertain = true;
    }
    if (ready) phase = uncertain ? 'UNCERTAIN' : 'RECONCILING';
    else if (uncertain) phase = 'UNCERTAIN';
    schedule();
  }
  function start(): Promise<void> {
    if (closed) return observed(Promise.reject(failure('LIFECYCLE_CLOSED')));
    if (startWork) return startWork;
    phase = 'STARTING';
    startWork = observed(
      Promise.resolve()
        .then(async () => {
          await invokeReconcile('STARTUP');
          if (mode === 'MCP_STDIO') {
            const c = control();
            try {
              const acquisition = watch!(event, scope, c);
              if (!types.isPromise(acquisition) || types.isProxy(acquisition))
                throw failure('WATCH_FAILED');
              const handle = await acquisition,
                h = properties(handle);
              if (Object.keys(h).join(',') !== 'close' || !callback(h.close?.value))
                throw failure('WATCH_FAILED');
              watcherClose = Function.prototype.bind.call(
                h.close.value,
                handle,
              ) as () => void | Promise<void>;
              if (!closed && Date.now() >= c.deadlineEpochMs) throw failure('WATCH_FAILED');
            } catch {
              cleanupUnknown = true;
              throw failure('WATCH_FAILED');
            }
            active();
            await invokeReconcile('POST_ATTACH');
          }
          await drain();
          active();
        })
        .catch((error) => {
          if (!closed || (error as { code?: unknown })?.code !== 'LIFECYCLE_CLOSED')
            stopForFailure();
          throw error;
        }),
    );
    return startWork;
  }
  function close(): Promise<OwnedReadCleanup> {
    if (closeWork) return closeWork;
    closed = true;
    ready = false;
    dirty = false;
    overflow = false;
    phase = failed ? 'FAILED' : 'CLOSING';
    abort.abort();
    if (!closeWork) {
      closeWork = observed(
        Promise.resolve().then(async () => {
          await Promise.allSettled(
            [startWork, drainWork].filter((p): p is Promise<void> => p !== undefined),
          );
          const dispose = watcherClose;
          watcherClose = undefined;
          if (dispose)
            try {
              const result = dispose();
              if (result !== undefined) {
                if (!types.isPromise(result) || types.isProxy(result))
                  throw failure('WATCH_FAILED');
                if ((await result) !== undefined) throw failure('WATCH_FAILED');
              }
            } catch {
              cleanupUnknown = true;
              failed = true;
              uncertain = true;
            }
          phase = failed ? 'FAILED' : 'CLOSED';
          const result = Object.freeze({
            cleanupState: cleanupUnknown ? ('UNKNOWN' as const) : ('SETTLED' as const),
          });
          finish(result);
          return result;
        }),
      );
    }
    return closeWork;
  }
  function getState() {
    return Object.freeze({ phase, uncertain, dirty, generation });
  }
  return Object.freeze({ start, close, getState, completion, signal: abort.signal });
}
