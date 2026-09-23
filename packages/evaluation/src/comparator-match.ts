import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  type CanonicalEdge,
  type CanonicalNode,
} from '@codeatlas/ir';

import { CanonicalComparatorError } from './comparator-error.js';

export interface CanonicalFactSet {
  readonly nodes: readonly CanonicalNode[];
  readonly edges: readonly CanonicalEdge[];
}

export type PairBasis = 'FACT_KEY' | 'ID';

export interface FactPair<T> {
  readonly expected: T;
  readonly actual: T;
  readonly basis: PairBasis;
}

export interface MatchedFacts<T> {
  readonly pairs: readonly FactPair<T>[];
  readonly missing: readonly T[];
  readonly extra: readonly T[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issuePath(base: string, segments: readonly PropertyKey[]): string {
  return segments.reduce<string>(
    (path, segment) =>
      typeof segment === 'number' ? `${path}[${segment}]` : `${path}.${String(segment)}`,
    base,
  );
}

export function validateFactSet(input: unknown, side: 'expected' | 'actual'): CanonicalFactSet {
  if (!isRecord(input))
    throw new CanonicalComparatorError('INPUT_INVALID', side, 'must be a fact collection');
  for (const field of ['nodes', 'edges']) {
    if (!Object.hasOwn(input, field) || !Array.isArray(input[field]))
      throw new CanonicalComparatorError('INPUT_INVALID', `${side}.${field}`, 'must be an array');
  }
  for (const field of Object.keys(input)) {
    if (field !== 'nodes' && field !== 'edges')
      throw new CanonicalComparatorError('INPUT_INVALID', `${side}.${field}`, 'unknown field');
  }

  const ids = new Set<string>();
  const parse = <T extends { id: string; factKey: string }>(
    values: unknown[],
    collection: 'nodes' | 'edges',
    parseValue: (
      value: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: readonly { path: readonly PropertyKey[] }[] } },
  ): T[] => {
    const factKeys = new Set<string>();
    return values.map((value, index) => {
      const base = `${side}.${collection}[${index}]`;
      const result = parseValue(value);
      if (!result.success) {
        const issue = result.error.issues[0];
        throw new CanonicalComparatorError(
          'INPUT_INVALID',
          issuePath(base, issue?.path ?? []),
          'does not satisfy Canonical IR',
        );
      }
      const fact = result.data;
      if (ids.has(fact.id))
        throw new CanonicalComparatorError('DUPLICATE_ID', `${base}.id`, 'duplicate Canonical ID');
      if (factKeys.has(fact.factKey))
        throw new CanonicalComparatorError(
          'DUPLICATE_FACT_KEY',
          `${base}.factKey`,
          'duplicate FactKey',
        );
      ids.add(fact.id);
      factKeys.add(fact.factKey);
      return fact;
    });
  };

  return {
    nodes: parse<CanonicalNode>(input.nodes as unknown[], 'nodes', (value) =>
      CanonicalNodeSchema.safeParse(value),
    ),
    edges: parse<CanonicalEdge>(input.edges as unknown[], 'edges', (value) =>
      CanonicalEdgeSchema.safeParse(value),
    ),
  };
}

function compareIdentity(
  a: { factKey: string; id: string },
  b: { factKey: string; id: string },
): number {
  if (a.factKey !== b.factKey) return a.factKey < b.factKey ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function matchFacts<T extends { id: string; factKey: string }>(
  expected: readonly T[],
  actual: readonly T[],
): MatchedFacts<T> {
  const byKey = new Map(actual.map((fact) => [fact.factKey, fact]));
  const consumed = new Set<string>();
  const matchedExpected = new Set<string>();
  const pairs: FactPair<T>[] = [];
  for (const fact of expected) {
    const match = byKey.get(fact.factKey);
    if (!match) continue;
    pairs.push({ expected: fact, actual: match, basis: 'FACT_KEY' });
    consumed.add(match.id);
    matchedExpected.add(fact.id);
  }
  const byId = new Map(
    actual.filter((fact) => !consumed.has(fact.id)).map((fact) => [fact.id, fact]),
  );
  for (const fact of expected) {
    if (matchedExpected.has(fact.id)) continue;
    const match = byId.get(fact.id);
    if (!match) continue;
    pairs.push({ expected: fact, actual: match, basis: 'ID' });
    consumed.add(match.id);
    matchedExpected.add(fact.id);
  }
  return {
    pairs: pairs.sort((a, b) => compareIdentity(a.expected, b.expected)),
    missing: expected.filter((fact) => !matchedExpected.has(fact.id)).sort(compareIdentity),
    extra: actual.filter((fact) => !consumed.has(fact.id)).sort(compareIdentity),
  };
}
