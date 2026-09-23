import type { CanonicalComparison, ComparisonEntry } from './canonical-comparator.js';
import { FixtureRegistryError } from './fixture-error.js';
import type { CriticalFact } from './fixture-manifest.js';

export type MetricName =
  | 'nodePrecision'
  | 'nodeRecall'
  | 'edgePrecision'
  | 'edgeRecall'
  | 'criticalFactPrecision'
  | 'criticalFactRecall';

export interface FactCounts {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
}

export interface MetricValue {
  readonly value: number | null;
  readonly reason: 'NO_PREDICTIONS' | 'NO_EXPECTED_FACTS' | null;
}

export interface CriticalFailure {
  readonly type: 'NODE' | 'EDGE';
  readonly factKey: string;
  readonly classification: 'CHANGED' | 'MISSING';
}

export interface CoverageExclusion {
  readonly reason: 'NON_CRITICAL' | 'UNDECLARED_ACTUAL_EXTRA';
  readonly type: 'NODE' | 'EDGE';
  readonly factKey: string;
}

export interface MetricResult {
  readonly counts: {
    readonly node: FactCounts;
    readonly edge: FactCounts;
    readonly criticalFact: FactCounts;
  };
  readonly metrics: Readonly<Record<MetricName, MetricValue>>;
  readonly criticalFailures: readonly CriticalFailure[];
  readonly coverageExclusions: readonly CoverageExclusion[];
}

interface MutableCounts {
  tp: number;
  fp: number;
  fn: number;
}

function emptyCounts(): MutableCounts {
  return { tp: 0, fp: 0, fn: 0 };
}

function score(entry: ComparisonEntry, counts: MutableCounts): void {
  if (entry.classification === 'MISSING') counts.fn++;
  else if (entry.classification === 'EXTRA') counts.fp++;
  else if (entry.differences.length === 0) counts.tp++;
  else {
    counts.fp++;
    counts.fn++;
  }
}

function ratio(
  numerator: number,
  denominator: number,
  reason: 'NO_PREDICTIONS' | 'NO_EXPECTED_FACTS',
): MetricValue {
  return denominator === 0
    ? { value: null, reason }
    : { value: numerator / denominator, reason: null };
}

function metricsFor(counts: FactCounts): { precision: MetricValue; recall: MetricValue } {
  return {
    precision: ratio(counts.tp, counts.tp + counts.fp, 'NO_PREDICTIONS'),
    recall: ratio(counts.tp, counts.tp + counts.fn, 'NO_EXPECTED_FACTS'),
  };
}

function typeRank(type: 'NODE' | 'EDGE'): number {
  return type === 'NODE' ? 0 : 1;
}

function ordinal(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function byTypeAndKey<T extends { type: 'NODE' | 'EDGE'; factKey: string }>(
  left: T,
  right: T,
): number {
  return typeRank(left.type) - typeRank(right.type) || ordinal(left.factKey, right.factKey);
}

export function calculateMetrics(
  comparison: CanonicalComparison,
  criticalFacts: readonly CriticalFact[],
  manifestPath: string,
): MetricResult {
  const node = emptyCounts();
  const edge = emptyCounts();
  const criticalFact = emptyCounts();
  const expected = new Map<string, ComparisonEntry>();
  const exclusions: CoverageExclusion[] = [];

  for (const entry of comparison.entries) {
    score(entry, entry.factType === 'NODE' ? node : edge);
    if (entry.expected !== null)
      expected.set(`${entry.factType}\0${entry.expected.factKey}`, entry);
    if (entry.classification === 'EXTRA' && entry.actual !== null) {
      exclusions.push({
        reason: 'UNDECLARED_ACTUAL_EXTRA',
        type: entry.factType,
        factKey: entry.actual.factKey,
      });
    }
  }

  const criticalFailures: CriticalFailure[] = [];
  const seen = new Set<string>();
  for (const [index, declaration] of criticalFacts.entries()) {
    if (declaration.type !== 'NODE' && declaration.type !== 'EDGE') {
      throw new FixtureRegistryError(
        'MANIFEST_INVALID',
        manifestPath,
        `criticalFacts.${index}.type`,
        'unsupported fact type',
      );
    }
    const key = `${declaration.type}\0${declaration.id}`;
    const entry = expected.get(key);
    if (entry === undefined || seen.has(key)) {
      throw new FixtureRegistryError(
        'MANIFEST_INVALID',
        manifestPath,
        `criticalFacts.${index}.id`,
        entry === undefined ? 'FactKey is absent from expected graph' : 'duplicate declared fact',
      );
    }
    seen.add(key);
    if (declaration.importance !== 'CRITICAL') {
      exclusions.push({ reason: 'NON_CRITICAL', type: declaration.type, factKey: declaration.id });
      continue;
    }
    score(entry, criticalFact);
    if (entry.classification === 'MISSING' || entry.differences.length !== 0) {
      criticalFailures.push({
        type: declaration.type,
        factKey: declaration.id,
        classification: entry.classification === 'MISSING' ? 'MISSING' : 'CHANGED',
      });
    }
  }

  const nodeMetrics = metricsFor(node);
  const edgeMetrics = metricsFor(edge);
  const criticalMetrics = metricsFor(criticalFact);
  return {
    counts: { node, edge, criticalFact },
    metrics: {
      nodePrecision: nodeMetrics.precision,
      nodeRecall: nodeMetrics.recall,
      edgePrecision: edgeMetrics.precision,
      edgeRecall: edgeMetrics.recall,
      criticalFactPrecision: criticalMetrics.precision,
      criticalFactRecall: criticalMetrics.recall,
    },
    criticalFailures: criticalFailures.sort(byTypeAndKey),
    coverageExclusions: exclusions.sort(
      (left, right) =>
        (left.reason === 'NON_CRITICAL' ? 0 : 1) - (right.reason === 'NON_CRITICAL' ? 0 : 1) ||
        byTypeAndKey(left, right),
    ),
  };
}
