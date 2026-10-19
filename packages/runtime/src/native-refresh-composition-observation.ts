import { AsyncLocalStorage } from 'node:async_hooks';
import { endNativeSqlSourceFor } from '../../storage/dist/analysis/native-apply-sql-observation.js';
import type { createNativeRefreshPreparation } from './native-refresh-preparation.js';

type Preparation = ReturnType<typeof createNativeRefreshPreparation>;
interface Observer {
  active: boolean;
  accept: (prepared: Preparation, apply: () => Promise<unknown>) => Promise<unknown>;
}
const observers = new AsyncLocalStorage<Observer>();

/** Private measurement bridge, deliberately absent from Runtime's package index. */
export async function observeNativeRefreshComposition<T>(
  operation: () => Promise<T>,
  accept: Observer['accept'],
): Promise<T> {
  const owner = { active: true, accept };
  return observers.run(owner, async () => {
    try {
      return await operation();
    } finally {
      owner.active = false;
    }
  });
}

/** Called only after the original admission and preparation, with a fixed Apply. */
export async function applyObservedNativeRefreshComposition<T>(
  prepared: Preparation,
  operation: () => Promise<T>,
): Promise<T> {
  const owner = observers.getStore();
  if (!owner?.active) return operation();
  let calls = 0;
  let value: T | undefined;
  let error: unknown;
  let threw = false;
  let observerError: unknown;
  let observerThrew = false;
  let pending: Promise<T> | undefined;
  let accepting = true;
  const apply = () => {
    if (!accepting) throw new Error('Refresh observation lifetime has settled');
    if (++calls !== 1) throw new Error('Original refresh Apply must run exactly once');
    pending = (async () => {
      try {
        value = await operation();
        return value;
      } catch (failure) {
        threw = true;
        error = failure;
        throw failure;
      }
    })();
    // Retain settlement even if an observer forgets to await its continuation.
    void pending.catch(() => {});
    return pending;
  };
  try {
    await owner.accept(prepared, apply);
  } catch (failure) {
    observerThrew = true;
    observerError = failure;
  } finally {
    accepting = false;
    if (calls === 0) endNativeSqlSourceFor(prepared);
  }
  if (pending) {
    try {
      await pending;
    } catch {
      /* Preserve the original value below. */
    }
  }
  // An observer cannot swallow an original error or supply a replacement result.
  if (threw) throw error;
  if (observerThrew) throw observerError;
  if (calls !== 1) throw new Error('Original refresh Apply must run exactly once');
  return value as T;
}
