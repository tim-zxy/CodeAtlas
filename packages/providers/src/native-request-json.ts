import { NativeClientError } from './native-client.js';

/** Serialize plain JSON without first allocating an unbounded JSON string.
 * Iterators keep wide/deep unknown input from creating an unbounded work list.
 * No getters, toJSON, nonfinite numbers, sparse arrays or lossy JSON coercions.
 */
export function boundedJson(value: unknown, maxBytes: number): string {
  const fragments: string[] = [];
  let bytes = 0;
  const ancestors = new Set<object>();
  function charge(n: number): void {
    bytes += n;
    if (bytes > maxBytes) throw new Error('Native metadata resource limit exceeded');
  }
  function text(s: string): void {
    charge(Buffer.byteLength(s));
    fragments.push(s);
  }
  function string(s: string): void {
    charge(2);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 34 || c === 92 || [8, 9, 10, 12, 13].includes(c)) charge(2);
      else if (c < 32) charge(6);
      else if (c < 128) charge(1);
      else if (c < 2048) charge(2);
      else if (
        c >= 0xd800 &&
        c <= 0xdbff &&
        i + 1 < s.length &&
        s.charCodeAt(i + 1) >= 0xdc00 &&
        s.charCodeAt(i + 1) <= 0xdfff
      ) {
        charge(4);
        i++;
      } else if (c >= 0xd800 && c <= 0xdfff) charge(6);
      else charge(3);
    }
    fragments.push(JSON.stringify(s));
  }
  function data(object: object, key: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !('value' in descriptor))
      throw new TypeError('Native metadata must be plain JSON');
    return descriptor.value;
  }
  function* entries(object: object): Generator<unknown> {
    if (Array.isArray(object)) {
      text('[');
      for (let i = 0; i < object.length; i++) {
        if (i) text(',');
        yield data(object, String(i));
      }
      text(']');
    } else {
      const prototype = Object.getPrototypeOf(object);
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('Native metadata must be plain JSON');
      for (const symbol of Object.getOwnPropertySymbols(object))
        if (Object.getOwnPropertyDescriptor(object, symbol)?.enumerable)
          throw new TypeError('Native metadata must be plain JSON');
      text('{');
      let first = true;
      for (const key in object) {
        if (!Object.hasOwn(object, key)) continue;
        if (!first) text(',');
        first = false;
        string(key);
        text(':');
        yield data(object, key);
      }
      text('}');
    }
  }
  const stack: { object: object; iterator: Generator<unknown> }[] = [];
  let next: unknown = value;
  while (true) {
    if (next === null) text('null');
    else if (typeof next === 'string') string(next);
    else if (typeof next === 'boolean') text(next ? 'true' : 'false');
    else if (typeof next === 'number' && Number.isFinite(next)) text(JSON.stringify(next));
    else if (typeof next === 'object') {
      if (ancestors.has(next)) throw new TypeError('Native metadata must be acyclic JSON');
      ancestors.add(next);
      stack.push({ object: next, iterator: entries(next) });
    } else throw new TypeError('Native metadata must be plain JSON');
    let found = false;
    while (stack.length) {
      const frame = stack.at(-1)!;
      const item = frame.iterator.next();
      if (!item.done) {
        next = item.value;
        found = true;
        break;
      }
      ancestors.delete(frame.object);
      stack.pop();
    }
    if (!found) return fragments.join('');
  }
}

/** Internal transport helper. A cancelled header never schedules completion. */
export function writeFullRequestRecords(
  stdin: NodeJS.WritableStream,
  records: readonly Buffer[],
  signal: AbortSignal,
  requestId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let index = 0,
      settled = false;
    const cleanup = () => {
      stdin.removeListener('drain', advance);
      stdin.removeListener('error', fail);
      stdin.removeListener('close', fail);
      stdin.removeListener('finish', finish);
      signal.removeEventListener('abort', abort);
    };
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const fail = () =>
      settle(
        new NativeClientError('PROCESS_FAILED', 'Native request could not be written', {
          requestId,
        }),
      );
    const finish = () => settle();
    const abort = () =>
      settle(
        signal.reason instanceof NativeClientError
          ? signal.reason
          : new NativeClientError('CANCELLED', 'Native request was cancelled', { requestId }),
      );
    const advance = () => {
      if (settled) return;
      if (signal.aborted) {
        abort();
        return;
      }
      try {
        if (index === records.length) {
          stdin.end();
          return;
        }
        const accepted = stdin.write(records[index++]!);
        if (settled) return;
        if (accepted) queueMicrotask(advance);
        else stdin.once('drain', advance);
      } catch {
        fail();
      }
    };
    stdin.once('error', fail);
    stdin.once('close', fail);
    stdin.once('finish', finish);
    signal.addEventListener('abort', abort, { once: true });
    advance();
  });
}
