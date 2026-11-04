import { ensurePhase1Data } from '@codeatlas/ir';
import { types } from 'node:util';
import { boundedJson } from './native-request-json.js';
import { NativeSyntaxContractError } from './native-syntax-ipc.js';
import type { NativeIpcErrorCode } from './native-ipc.js';
export interface NativeCompositionLimits {
  readonly maxSerializedBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
}
export type NativeCompositionErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CONTEXT'
  | 'UNSUPPORTED_SCOPE'
  | 'INCOMPLETE_OBSERVATION'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'NORMALIZATION_FAILED'
  | 'MERGE_FAILED';
export class NativeCompositionError extends Error {
  constructor(readonly code: NativeCompositionErrorCode) {
    super(code);
    this.name = 'NativeCompositionError';
  }
}
export function requireComposition(
  value: unknown,
  code: NativeCompositionErrorCode = 'INVALID_INPUT',
): asserts value {
  if (!value) throw new NativeCompositionError(code);
}
export interface CompositionBudget {
  serializedBytes: number;
  items: number;
}
export function spendComposition(
  b: CompositionBudget,
  l: NativeCompositionLimits,
  key: 'serializedBytes' | 'items',
  n: number,
): void {
  const max = key === 'items' ? l.maxItems : l.maxSerializedBytes;
  requireComposition(
    Number.isSafeInteger(n) && n >= 0 && n <= max - b[key],
    'RESOURCE_LIMIT_EXCEEDED',
  );
  b[key] += n;
}
export function requirePlainCompositionData(v: object): void {
  requireComposition(!types.isProxy(v));
  const p = Object.getPrototypeOf(v);
  requireComposition(
    Array.isArray(v) ? p === Array.prototype : p === Object.prototype || p === null,
  );
}
// A depth-first descriptor iterator holds one frame per level,never a whole-tree value queue.
function scan(value: unknown, l: NativeCompositionLimits, b: CompositionBudget): void {
  const ancestors = new Set<object>();
  function* children(v: object): Generator<unknown> {
    requirePlainCompositionData(v);
    const array = Array.isArray(v);
    let count = 0;
    for (const key in v) {
      if (!Object.hasOwn(v, key)) continue;
      requireComposition(key.isWellFormed());
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      requireComposition(Object.hasOwn(d, 'value') && d.enumerable);
      if (array) requireComposition(String(count) === key);
      count++;
      yield d.value;
    }
    requireComposition(Reflect.ownKeys(v).length === count + (array ? 1 : 0));
    if (array) requireComposition(count === v.length);
  }
  const stack: { object: object; iterator: Generator<unknown>; depth: number }[] = [];
  let next = value,
    depth = 0;
  while (true) {
    requireComposition(depth <= l.maxDepth, 'RESOURCE_LIMIT_EXCEEDED');
    spendComposition(b, l, 'items', 1);
    if (next !== null && typeof next === 'object') {
      requirePlainCompositionData(next);
      requireComposition(!ancestors.has(next));
      ancestors.add(next);
      stack.push({ object: next, iterator: children(next), depth });
    } else
      requireComposition(
        next === null ||
          typeof next === 'boolean' ||
          (typeof next === 'string' && next.isWellFormed()) ||
          (typeof next === 'number' && Number.isFinite(next) && !Object.is(next, -0)),
      );
    let found = false;
    while (stack.length) {
      const f = stack.at(-1)!;
      const item = f.iterator.next();
      if (!item.done) {
        next = item.value;
        depth = f.depth + 1;
        found = true;
        break;
      }
      ancestors.delete(f.object);
      stack.pop();
    }
    if (!found) return;
  }
}
export function chargeCompositionJSON(
  value: unknown,
  l: NativeCompositionLimits,
  b: CompositionBudget,
): string {
  scan(value, l, b);
  let text: string;
  try {
    text = boundedJson(value, l.maxSerializedBytes - b.serializedBytes);
  } catch {
    throw new NativeCompositionError('RESOURCE_LIMIT_EXCEEDED');
  }
  spendComposition(b, l, 'serializedBytes', Buffer.byteLength(text));
  return text;
}
export interface CodeSyntaxCompositionBudget {
  readonly limits: NativeCompositionLimits;
  readonly budget: CompositionBudget;
}
export function spendCodeSyntaxBudget(
  context: CodeSyntaxCompositionBudget,
  key: 'serializedBytes' | 'items',
  n: number,
): void {
  try {
    spendComposition(context.budget, context.limits, key, n);
  } catch {
    throw new NativeSyntaxContractError('RESOURCE_LIMIT_EXCEEDED');
  }
}
export function chargeCodeSyntaxJSON(
  value: unknown,
  code: NativeIpcErrorCode,
  context: CodeSyntaxCompositionBudget,
): string {
  try {
    return chargeCompositionJSON(value, context.limits, context.budget);
  } catch (e) {
    throw new NativeSyntaxContractError(
      e !== null && typeof e === 'object' && 'code' in e && e.code === 'RESOURCE_LIMIT_EXCEEDED'
        ? 'RESOURCE_LIMIT_EXCEEDED'
        : code,
    );
  }
}
/** Resource-only ASCII scan; JSON validity and UTF8 remain the existing decoder's responsibility. */
export function preflightCodeSyntaxJSON(raw: Buffer, context: CodeSyntaxCompositionBudget): void {
  let depth = 0,
    string = false,
    escaped = false,
    scalar = false;
  const tick = () => {
    if (depth > context.limits.maxDepth)
      throw new NativeSyntaxContractError('RESOURCE_LIMIT_EXCEEDED');
    spendCodeSyntaxBudget(context, 'items', 1);
  };
  const whitespace = (b: number | undefined) => b === 32 || b === 9 || b === 10 || b === 13;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i]!;
    if (string) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (b === 92) {
        escaped = true;
        continue;
      }
      if (b === 34) {
        string = false;
        let next = i + 1;
        while (whitespace(raw[next])) next++;
        if (raw[next] !== 58) tick();
      }
      continue;
    }
    if (b === 34) {
      string = true;
      escaped = false;
      scalar = false;
      continue;
    }
    if (b === 123 || b === 91) {
      tick();
      depth++;
      scalar = false;
      continue;
    }
    if (b === 125 || b === 93) {
      depth = Math.max(0, depth - 1);
      scalar = false;
      continue;
    }
    if (b === 44 || b === 58 || whitespace(b)) {
      scalar = false;
      continue;
    }
    if (!scalar) {
      tick();
      scalar = true;
    }
  }
}

/** Reserve the existing identity tuple's representations before calling its encoder. */
export function chargeCompositionIdentityTuple(
  domain: string,
  fields: readonly (string | number)[],
  context: CodeSyntaxCompositionBudget,
): void {
  requireComposition(typeof domain === 'string' && domain.isWellFormed());
  requireComposition(
    Array.isArray(fields) &&
      !types.isProxy(fields) &&
      Object.getPrototypeOf(fields) === Array.prototype,
  );
  requireComposition(Reflect.ownKeys(fields).length === fields.length + 1);
  spendComposition(context.budget, context.limits, 'items', 1);
  spendComposition(
    context.budget,
    context.limits,
    'serializedBytes',
    Buffer.byteLength(domain) + 1,
  );
  for (let index = 0; index < fields.length; index++) {
    const d = Object.getOwnPropertyDescriptor(fields, String(index));
    requireComposition(d && d.enumerable && Object.hasOwn(d, 'value'));
    const field: unknown = d.value;
    requireComposition(
      typeof field === 'string'
        ? field.isWellFormed()
        : typeof field === 'number' &&
            Number.isSafeInteger(field) &&
            field >= 0 &&
            !Object.is(field, -0),
    );
    const bytes = Buffer.byteLength(String(field));
    spendComposition(context.budget, context.limits, 'items', 1);
    spendComposition(
      context.budget,
      context.limits,
      'serializedBytes',
      String(bytes).length + 1 + bytes,
    );
  }
  spendComposition(context.budget, context.limits, 'items', 1);
  spendComposition(
    context.budget,
    context.limits,
    'serializedBytes',
    Buffer.byteLength(domain) + 1 + 64,
  );
}

/** Internal continuation adapter: reserve old admission against the actual residual ledger. */
export function remainingCompositionLimits(
  context: CodeSyntaxCompositionBudget,
): NativeCompositionLimits {
  try {
    ensurePhase1Data(context);
    requireComposition(Object.keys(context).sort().join(',') === 'budget,limits');
    requireComposition(
      Object.keys(context.limits).sort().join(',') === 'maxDepth,maxItems,maxSerializedBytes',
    );
    requireComposition(
      Object.values(context.limits).every((v) => Number.isSafeInteger(v) && v > 0),
    );
    requireComposition(Object.keys(context.budget).sort().join(',') === 'items,serializedBytes');
    for (const [key, value] of Object.entries(context.budget))
      requireComposition(
        Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= context.limits[key === 'items' ? 'maxItems' : 'maxSerializedBytes'],
      );
    const maxSerializedBytes = context.limits.maxSerializedBytes - context.budget.serializedBytes,
      maxItems = context.limits.maxItems - context.budget.items;
    requireComposition(maxSerializedBytes > 0 && maxItems > 0, 'RESOURCE_LIMIT_EXCEEDED');
    return { maxSerializedBytes, maxItems, maxDepth: context.limits.maxDepth };
  } catch (e) {
    if (e instanceof NativeCompositionError) throw e;
    throw new NativeCompositionError('INVALID_INPUT');
  }
}
