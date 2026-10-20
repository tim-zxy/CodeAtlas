import { SourceFileSchema, type EntityId, type SourceFile } from '@codeatlas/ir';
import { compareCanonicalFacts, type CanonicalComparison } from './canonical-comparator.js';
import { validateFactSet, type CanonicalFactSet } from './comparator-match.js';
import { calculateMetrics, type FactCounts, type CriticalFailure } from './metric-engine.js';

export type Phase05FactMetrics = {
  symbol: FactCounts & { recall: number | null };
  directCall: FactCounts & { precision: number | null; recall: number | null };
  comparison: CanonicalComparison;
  criticalFailures: readonly CriticalFailure[];
};

export function evaluatePhase05Facts(input: {
  expected: CanonicalFactSet;
  actual: CanonicalFactSet;
  criticalSymbols: readonly string[];
  criticalDirectCalls: readonly string[];
}): Phase05FactMetrics {
  const expected = validateFactSet(input.expected, 'expected');
  const actual = validateFactSet(input.actual, 'actual');
  const scope = (keys: readonly string[], type: 'NODE' | 'EDGE') => {
    if (!Array.isArray(keys) || new Set(keys).size !== keys.length)
      throw new Error('Invalid Phase0.5 critical scope');
    const facts = type === 'NODE' ? expected.nodes : expected.edges;
    for (const key of keys) {
      const fact = facts.find((fact) => fact.factKey === key);
      if (
        !fact ||
        (type === 'NODE'
          ? fact.kind !== 'TYPE' && fact.kind !== 'SYMBOL'
          : fact.kind !== 'CALL' || !('target' in fact) || fact.target.state !== 'RESOLVED')
      )
        throw new Error('Invalid Phase0.5 critical scope');
    }
    return keys.map((id) => ({ type, id, importance: 'CRITICAL' as const }));
  };
  const symbols = scope(input.criticalSymbols, 'NODE');
  const calls = scope(input.criticalDirectCalls, 'EDGE');
  const comparison = compareCanonicalFacts({ expected, actual });
  const symbolResult = calculateMetrics(comparison, symbols, 'phase05');
  const allCritical = calculateMetrics(comparison, [...symbols, ...calls], 'phase05');
  const criticalCalls = new Set(input.criticalDirectCalls);
  const correct = new Set(
    comparison.entries
      .filter(
        (entry) =>
          entry.factType === 'EDGE' &&
          entry.expected !== null &&
          criticalCalls.has(entry.expected.factKey) &&
          entry.classification === null &&
          entry.differences.length === 0,
      )
      .map((entry) => entry.actual!.id),
  );
  // Every resolved direct prediction in this fixture contributes to precision,
  // including extras excluded from the original Phase0 critical metric.
  const predictions = actual.edges.filter(
    (edge) => edge.kind === 'CALL' && edge.target.state === 'RESOLVED',
  );
  const tp = predictions.filter((edge) => correct.has(edge.id)).length;
  const fp = predictions.length - tp;
  const fn = criticalCalls.size - tp;
  return {
    symbol: {
      ...symbolResult.counts.criticalFact,
      recall: symbolResult.metrics.criticalFactRecall.value,
    },
    directCall: {
      tp,
      fp,
      fn,
      precision: tp + fp === 0 ? null : tp / (tp + fp),
      recall: tp + fn === 0 ? null : tp / (tp + fn),
    },
    comparison,
    criticalFailures: allCritical.criticalFailures,
  };
}

export function bindPhase05SourceIdentity(
  expected: readonly SourceFile[],
  actual: readonly SourceFile[],
): ReadonlyMap<EntityId, EntityId> {
  try {
    const inventory = (values: readonly SourceFile[]) => {
      const files = SourceFileSchema.array().parse(values);
      const ids = new Set<EntityId>();
      const indexed = new Map<string, SourceFile>();
      for (const file of files) {
        const key = JSON.stringify([file.repositoryId, file.path]);
        if (ids.has(file.id) || indexed.has(key)) throw new Error();
        ids.add(file.id);
        indexed.set(key, file);
      }
      return indexed;
    };
    const left = inventory(expected);
    const right = inventory(actual);
    if (left.size !== right.size) throw new Error();
    const result = new Map<EntityId, EntityId>();
    for (const [key, file] of left) {
      const match = right.get(key);
      // Both objects have the same fixed IR schema field order after parsing.
      // Only SourceFile.id is opaque; revision IDs are never aligned here.
      if (
        !match ||
        JSON.stringify({ ...file, id: null }) !== JSON.stringify({ ...match, id: null })
      )
        throw new Error();
      result.set(file.id, match.id);
    }
    return result;
  } catch {
    throw new Error('Source inventory mismatch');
  }
}
