import { types, isDeepStrictEqual } from 'node:util';
import { canonicalCompilationJson } from '../../application/dist/compilation-input-contract.js';
import {
  checkedHistoryLimits,
  type HistoryReadLimits,
} from '../../storage/dist/analysis/activation-history-format.js';

type RuntimeRequestControl = Parameters<typeof canonicalCompilationJson>[1];
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.trim() !== value)
    throw Error('OWNED_BINDING_UNAVAILABLE');
  return value;
}
type Scope = Readonly<{ workspaceId: string; repositoryIds: readonly string[] }>;
/** Owned-data bootstrap only. Not an OS principal, persistent grant or production issuer. */
interface OwnedBinding {
  readonly handle: object;
  readonly scope: Scope;
  readonly signal: AbortSignal;
  check(candidate: object, observed: Scope): void;
  revoke(): void;
}
export function createOwnedPublishedReadBinding(input: {
  store: { readState(limits: HistoryReadLimits, control: RuntimeRequestControl): unknown };
  scope: Scope;
  limits: HistoryReadLimits;
  control: RuntimeRequestControl;
}): OwnedBinding {
  const { store } = input;
  const control = Object.freeze({ ...input.control });
  if (!store || types.isProxy(store) || typeof store.readState !== 'function')
    throw Error('OWNED_BINDING_UNAVAILABLE');
  const readState = Function.prototype.bind.call(store.readState, store) as typeof store.readState;
  const raw = JSON.parse(canonicalCompilationJson(input.scope, control));
  if (
    Object.keys(raw).sort().join(',') !== 'repositoryIds,workspaceId' ||
    !Array.isArray(raw.repositoryIds)
  )
    throw Error('OWNED_BINDING_UNAVAILABLE');
  const workspaceId = identifier(raw.workspaceId);
  const repositoryIds = raw.repositoryIds.map((id: unknown) => identifier(id)).sort() as string[];
  if (!repositoryIds.length || new Set(repositoryIds).size !== repositoryIds.length)
    throw Error('OWNED_BINDING_UNAVAILABLE');
  const scope = Object.freeze({ workspaceId, repositoryIds: Object.freeze(repositoryIds) });
  const limits = Object.freeze({ ...checkedHistoryLimits(input.limits) });
  const read = () => {
    const value = readState(limits, control);
    if (types.isPromise(value) && !types.isProxy(value)) {
      void Promise.prototype.then.call(value, undefined, () => undefined);
      throw Error('OWNED_BINDING_UNAVAILABLE');
    }
    return value;
  };
  const baseline = canonicalCompilationJson(read(), control);
  const parsed = JSON.parse(baseline);
  if (parsed.workspaceId !== workspaceId) throw Error('OWNED_BINDING_UNAVAILABLE');
  const pid = process.pid,
    controller = new AbortController();
  const handle = Object.freeze({});
  const handles = new WeakSet<object>([handle]);
  let revoked = false;
  const check = (candidate: object, observed: Scope): void => {
    try {
      if (
        revoked ||
        process.pid !== pid ||
        types.isProxy(candidate) ||
        !handles.has(candidate) ||
        !isDeepStrictEqual(observed, scope)
      )
        throw Error();
      if (canonicalCompilationJson(read(), control) !== baseline) throw Error();
    } catch {
      revoked = true;
      throw Error('OWNED_BINDING_UNAVAILABLE');
    }
  };
  const stop = () => {
    revoked = true;
    controller.abort();
  };
  EventTarget.prototype.addEventListener.call(control.signal, 'abort', stop, { once: true });
  if (Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!.call(control.signal))
    stop();
  return Object.freeze({
    handle,
    scope,
    signal: controller.signal,
    check,
    revoke() {
      EventTarget.prototype.removeEventListener.call(control.signal, 'abort', stop);
      stop();
    },
  });
}
