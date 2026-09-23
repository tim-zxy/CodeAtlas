import { CanonicalComparatorError } from './comparator-error.js';
import { compareEdges, compareNodes, sortComparisonEntries } from './comparator-diff.js';
import { matchFacts, validateFactSet, type PairBasis } from './comparator-match.js';

export interface FactIdentity {
  readonly id: string;
  readonly factKey: string;
}

export interface ComparisonDifference {
  readonly kind: 'SEMANTIC_DIFFERENCE' | 'RESOLUTION_DIFFERENCE';
  readonly path: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface ComparisonEntry {
  readonly factType: 'NODE' | 'EDGE';
  readonly expected: FactIdentity | null;
  readonly actual: FactIdentity | null;
  readonly matchBasis: PairBasis | null;
  readonly classification: 'MISSING' | 'EXTRA' | null;
  readonly differences: readonly ComparisonDifference[];
}

export interface CanonicalComparison {
  readonly entries: readonly ComparisonEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identity(fact: FactIdentity): FactIdentity {
  return { id: fact.id, factKey: fact.factKey };
}

export function compareCanonicalFacts(input: unknown): CanonicalComparison {
  if (!isRecord(input))
    throw new CanonicalComparatorError('INPUT_INVALID', 'comparison', 'must be an object');
  for (const side of ['expected', 'actual'] as const) {
    if (!Object.hasOwn(input, side))
      throw new CanonicalComparatorError('INPUT_INVALID', side, 'required field is missing');
  }
  for (const field of Object.keys(input)) {
    if (field !== 'expected' && field !== 'actual')
      throw new CanonicalComparatorError('INPUT_INVALID', field, 'unknown field');
  }
  const expected = validateFactSet(input.expected, 'expected');
  const actual = validateFactSet(input.actual, 'actual');
  const nodes = matchFacts(expected.nodes, actual.nodes);
  const edges = matchFacts(expected.edges, actual.edges);
  const nodeIds = new Map(nodes.pairs.map((pair) => [pair.expected.id, pair.actual.id]));
  const entries: ComparisonEntry[] = [];
  for (const pair of nodes.pairs) {
    entries.push({
      factType: 'NODE',
      expected: identity(pair.expected),
      actual: identity(pair.actual),
      matchBasis: pair.basis,
      classification: null,
      differences: compareNodes(pair.expected, pair.actual),
    });
  }
  for (const pair of edges.pairs) {
    entries.push({
      factType: 'EDGE',
      expected: identity(pair.expected),
      actual: identity(pair.actual),
      matchBasis: pair.basis,
      classification: null,
      differences: compareEdges(pair.expected, pair.actual, nodeIds),
    });
  }
  for (const [factType, matched] of [
    ['NODE', nodes],
    ['EDGE', edges],
  ] as const) {
    for (const fact of matched.missing)
      entries.push({
        factType,
        expected: identity(fact),
        actual: null,
        matchBasis: null,
        classification: 'MISSING',
        differences: [],
      });
    for (const fact of matched.extra)
      entries.push({
        factType,
        expected: null,
        actual: identity(fact),
        matchBasis: null,
        classification: 'EXTRA',
        differences: [],
      });
  }
  return { entries: sortComparisonEntries(entries) };
}
