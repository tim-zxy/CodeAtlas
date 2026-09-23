import type { CanonicalEdge, CanonicalNode, CanonicalTarget } from '@codeatlas/ir';

import type { ComparisonDifference, ComparisonEntry } from './canonical-comparator.js';

type DifferenceKind = ComparisonDifference['kind'];

function ordinal(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function addDifference(
  differences: ComparisonDifference[],
  kind: DifferenceKind,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  differences.push({
    kind,
    path,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareJson(
  differences: ComparisonDifference[],
  kind: DifferenceKind,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length)
      addDifference(differences, kind, `${path}.length`, expected.length, actual.length);
    for (let index = 0; index < Math.min(expected.length, actual.length); index++)
      compareJson(differences, kind, `${path}[${index}]`, expected[index], actual[index]);
    return;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort(ordinal);
    for (const key of keys)
      compareJson(differences, kind, `${path}.${key}`, expected[key], actual[key]);
    return;
  }
  addDifference(differences, kind, path, expected, actual);
}

function sameNodeRef(
  expectedId: string,
  actualId: string,
  paired: ReadonlyMap<string, string>,
  pairedActualIds: ReadonlySet<string>,
): boolean {
  const mapped = paired.get(expectedId);
  if (mapped !== undefined) return mapped === actualId;
  return !pairedActualIds.has(actualId) && expectedId === actualId;
}

function compareTarget(
  differences: ComparisonDifference[],
  expected: CanonicalTarget,
  actual: CanonicalTarget,
  paired: ReadonlyMap<string, string>,
  pairedActualIds: ReadonlySet<string>,
): void {
  const add = (path: string, a: unknown, b: unknown) =>
    addDifference(differences, 'RESOLUTION_DIFFERENCE', path, a, b);
  if (expected.state !== actual.state) add('target.state', expected.state, actual.state);
  if (expected.resolution !== actual.resolution)
    add('target.resolution', expected.resolution, actual.resolution);
  if (expected.state !== actual.state) return;
  if (expected.state === 'RESOLVED' && actual.state === 'RESOLVED') {
    if (!sameNodeRef(expected.target.id, actual.target.id, paired, pairedActualIds))
      add('target.target.id', expected.target.id, actual.target.id);
  } else if (expected.state === 'UNRESOLVED' && actual.state === 'UNRESOLVED') {
    if (expected.originalHint !== actual.originalHint)
      add('target.originalHint', expected.originalHint, actual.originalHint);
    if (expected.candidates.length !== actual.candidates.length)
      add('target.candidates.length', expected.candidates.length, actual.candidates.length);
    for (
      let index = 0;
      index < Math.min(expected.candidates.length, actual.candidates.length);
      index++
    ) {
      const before = expected.candidates[index]!;
      const after = actual.candidates[index]!;
      if (!sameNodeRef(before.id, after.id, paired, pairedActualIds))
        add(`target.candidates[${index}].id`, before.id, after.id);
    }
  }
}

function sortDifferences(differences: ComparisonDifference[]): ComparisonDifference[] {
  return differences.sort((a, b) => {
    const rank = (kind: DifferenceKind) => (kind === 'SEMANTIC_DIFFERENCE' ? 0 : 1);
    return rank(a.kind) - rank(b.kind) || ordinal(a.path, b.path);
  });
}

export function compareNodes(
  expected: CanonicalNode,
  actual: CanonicalNode,
): ComparisonDifference[] {
  const differences: ComparisonDifference[] = [];
  for (const field of [
    'factKey',
    'repositoryId',
    'revisionId',
    'kind',
    'typeKind',
    'symbolKind',
    'name',
    'qualifiedName',
    'sourceRange',
    'confidence',
  ] as const) {
    compareJson(
      differences,
      'SEMANTIC_DIFFERENCE',
      field,
      Reflect.get(expected, field),
      Reflect.get(actual, field),
    );
  }
  return sortDifferences(differences);
}

export function compareEdges(
  expected: CanonicalEdge,
  actual: CanonicalEdge,
  paired: ReadonlyMap<string, string>,
  pairedActualIds: ReadonlySet<string>,
): ComparisonDifference[] {
  const differences: ComparisonDifference[] = [];
  for (const field of [
    'factKey',
    'repositoryId',
    'revisionId',
    'kind',
    'sourceRange',
    'confidence',
  ] as const)
    compareJson(differences, 'SEMANTIC_DIFFERENCE', field, expected[field], actual[field]);
  if (!sameNodeRef(expected.source.id, actual.source.id, paired, pairedActualIds))
    addDifference(
      differences,
      'SEMANTIC_DIFFERENCE',
      'source.id',
      expected.source.id,
      actual.source.id,
    );
  compareTarget(differences, expected.target, actual.target, paired, pairedActualIds);
  return sortDifferences(differences);
}

export function sortComparisonEntries(entries: ComparisonEntry[]): ComparisonEntry[] {
  const rank = (entry: ComparisonEntry) => (entry.factType === 'NODE' ? 0 : 1);
  const entryRank = (entry: ComparisonEntry) =>
    entry.classification === null ? 0 : entry.classification === 'MISSING' ? 1 : 2;
  return entries.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      ordinal(
        a.expected?.factKey ?? a.actual?.factKey ?? '',
        b.expected?.factKey ?? b.actual?.factKey ?? '',
      ) ||
      ordinal(a.actual?.factKey ?? '', b.actual?.factKey ?? '') ||
      ordinal(a.expected?.id ?? a.actual?.id ?? '', b.expected?.id ?? b.actual?.id ?? '') ||
      entryRank(a) - entryRank(b),
  );
}
