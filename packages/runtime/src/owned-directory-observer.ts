import { watch, type FSWatcher } from 'node:fs';
import { lstat, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { types } from 'node:util';
import type { RuntimeWorkflowRequest } from '@codeatlas/application';
import type { OwnedReadEvent, OwnedReadScope } from './owned-read-lifecycle.js';
type Control = RuntimeWorkflowRequest['control'];
export interface OwnedDirectoryObserver {
  readonly directory: string;
  readonly signal: Control['signal'];
  close(): Promise<void>;
}
function failure(
  code:
    | 'INVALID_INPUT'
    | 'CANCELLED'
    | 'DEADLINE'
    | 'OBSERVER_UNAVAILABLE'
    | 'OBSERVER_CLEANUP_UNKNOWN',
) {
  return Object.assign(Error(code), {
    code,
    ...(code === 'OBSERVER_CLEANUP_UNKNOWN' ? { cleanupState: 'UNKNOWN' as const } : {}),
  });
}
function invalid(): never {
  throw failure('INVALID_INPUT');
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
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener,
  remove = EventTarget.prototype.removeEventListener;
function observed<T>(promise: Promise<T>) {
  void promise.catch(() => undefined);
  return promise;
}
/** Fresh owned fixture directory only. Identity observations do not prove production path security. */
export async function createOwnedDirectoryObserver(
  scope: OwnedReadScope,
  listener: (event: OwnedReadEvent) => void,
  control: Control,
): Promise<OwnedDirectoryObserver> {
  const s = properties(scope),
    c = properties(control);
  if (
    Object.keys(s).sort().join(',') !== 'repositoryIds,workspaceId' ||
    Object.keys(c).sort().join(',') !== 'deadlineEpochMs,maxDepth,maxItems,signal' ||
    !text(s.workspaceId?.value) ||
    typeof listener !== 'function' ||
    types.isProxy(listener) ||
    types.isAsyncFunction(listener)
  )
    invalid();
  const maxItems = c.maxItems!.value as unknown,
    maxDepth = c.maxDepth!.value as unknown,
    deadlineEpochMs = c.deadlineEpochMs!.value as unknown,
    inputSignal = c.signal!.value as unknown;
  if (
    typeof maxItems !== 'number' ||
    !Number.isSafeInteger(maxItems) ||
    maxItems <= 0 ||
    typeof maxDepth !== 'number' ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    Object.is(maxDepth, -0) ||
    typeof deadlineEpochMs !== 'number' ||
    !Number.isSafeInteger(deadlineEpochMs) ||
    !inputSignal ||
    typeof inputSignal !== 'object' ||
    types.isProxy(inputSignal)
  )
    invalid();
  try {
    if (typeof nativeAborted.call(inputSignal) !== 'boolean') invalid();
  } catch {
    invalid();
  }
  const repos = s.repositoryIds!.value as unknown;
  if (!Array.isArray(repos) || types.isProxy(repos) || !repos.length || repos.length > maxItems)
    invalid();
  const r = Object.getOwnPropertyDescriptors(repos),
    ids: string[] = [];
  if (
    Reflect.ownKeys(r).some(
      (k) =>
        typeof k !== 'string' ||
        (k !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= repos.length)) ||
        !Object.hasOwn(r[k as string]!, 'value'),
    )
  )
    invalid();
  for (let i = 0; i < repos.length; i++) {
    const id = r[String(i)]?.value as unknown;
    if (!text(id)) invalid();
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) invalid();
  // All caller fields are captured before asynchronous allocation or callback delivery.
  const owned = Object.freeze({
      maxItems,
      maxDepth,
      deadlineEpochMs,
      signal: inputSignal as Control['signal'],
    }),
    deliver = listener;
  const providerAbort = new AbortController();
  let directory = '',
    watcher: FSWatcher | undefined,
    closing = false,
    failed = false,
    watchCloseRequested = false,
    watchClosed = false,
    closeThrew = false;
  let closeWork: Promise<void> | undefined;
  let confirm!: () => void;
  const closeConfirmation = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  let acquisition: Promise<void>;
  function active() {
    if (closing || nativeAborted.call(owned.signal)) throw failure('CANCELLED');
    if (Date.now() >= owned.deadlineEpochMs) throw failure('DEADLINE');
  }
  function requestNativeClose() {
    if (!watcher || watchClosed || watchCloseRequested) return;
    watchCloseRequested = true;
    try {
      watcher.close();
    } catch {
      failed = true;
      closeThrew = true;
    }
  }
  function close(): Promise<void> {
    if (closeWork) return closeWork;
    closing = true;
    // Register settlement before abort can synchronously reenter through a host listener.
    closeWork = observed(
      Promise.resolve().then(async () => {
        await Promise.allSettled([acquisition]);
        requestNativeClose();
        if (watcher && !closeThrew) await closeConfirmation;
        if (failed || closeThrew) throw failure('OBSERVER_CLEANUP_UNKNOWN');
      }),
    );
    remove.call(owned.signal, 'abort', onAbort);
    providerAbort.abort();
    requestNativeClose();
    return closeWork;
  }
  function onAbort() {
    void close();
  }
  function unavailable() {
    failed = true;
    void close();
  }
  function onChange(event: string, filename: string | null) {
    if (closing) return;
    const known =
      (event === 'rename' || event === 'change') &&
      typeof filename === 'string' &&
      filename.length > 0 &&
      !/[\0\ufffd\\/]/.test(filename) &&
      filename !== '.' &&
      filename !== '..';
    try {
      const result = Reflect.apply(deliver, undefined, [known ? 'CHANGE' : 'OVERFLOW']);
      if (result !== undefined) {
        if (types.isPromise(result)) {
          try {
            Promise.prototype.then.call(
              result,
              () => undefined,
              () => undefined,
            );
          } catch {
            // Exotic Promise species can refuse observation; this observer still fails permanently.
          }
        }
        unavailable();
      }
    } catch {
      unavailable();
    }
  }
  acquisition = observed(
    Promise.resolve()
      .then(async () => {
        active();
        const tempRoot = await realpath(tmpdir());
        active();
        directory = await mkdtemp(join(tempRoot, 'codeatlas-owned-observer-'));
        active();
        const before = await lstat(directory, { bigint: true });
        active();
        if (!before.isDirectory() || before.isSymbolicLink()) throw failure('OBSERVER_UNAVAILABLE');
        watcher = watch(
          directory,
          { persistent: true, recursive: false, encoding: 'utf8' },
          onChange,
        );
        watcher.on('error', unavailable);
        watcher.once('close', () => {
          watchClosed = true;
          confirm();
          if (!watchCloseRequested) unavailable();
        });
        // Observe the same newly allocated directory on both sides of native attachment.
        const after = await lstat(directory, { bigint: true });
        if (
          !after.isDirectory() ||
          after.isSymbolicLink() ||
          before.dev !== after.dev ||
          before.ino !== after.ino ||
          before.birthtimeNs !== after.birthtimeNs
        )
          throw failure('OBSERVER_UNAVAILABLE');
        active();
      })
      .catch((error) => {
        const code =
          error && typeof error === 'object' && !types.isProxy(error)
            ? Object.getOwnPropertyDescriptor(error, 'code')?.value
            : undefined;
        if (code !== 'CANCELLED' && code !== 'DEADLINE') failed = true;
        throw failure(
          code === 'CANCELLED'
            ? 'CANCELLED'
            : code === 'DEADLINE'
              ? 'DEADLINE'
              : 'OBSERVER_UNAVAILABLE',
        );
      }),
  );
  add.call(owned.signal, 'abort', onAbort, { once: true });
  if (nativeAborted.call(owned.signal)) void close();
  try {
    await acquisition;
    active();
    return Object.freeze({ directory, signal: providerAbort.signal, close });
  } catch (error) {
    try {
      await close();
    } catch {
      throw failure('OBSERVER_CLEANUP_UNKNOWN');
    }
    throw error;
  }
}
