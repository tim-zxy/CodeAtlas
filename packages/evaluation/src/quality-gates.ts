import { FixtureRegistryError } from './fixture-error.js';
import type { QualityGateOperator, QualityGate } from './fixture-manifest.js';
import type { MetricName, MetricValue } from './metric-engine.js';

export interface EvaluatedGate {
  readonly name: MetricName;
  readonly value: number | null;
  readonly operator: QualityGateOperator;
  readonly threshold: number;
  readonly status: 'PASS' | 'FAIL' | 'NOT_EVALUABLE';
}

export interface GateResult {
  readonly gates: readonly EvaluatedGate[];
  readonly overall: 'PASS' | 'FAIL';
}

const metricNames: readonly MetricName[] = [
  'nodePrecision',
  'nodeRecall',
  'edgePrecision',
  'edgeRecall',
  'criticalFactPrecision',
  'criticalFactRecall',
];

function passes(value: number, operator: QualityGateOperator, threshold: number): boolean {
  switch (operator) {
    case '>=':
      return value >= threshold;
    case '>':
      return value > threshold;
    case '<=':
      return value <= threshold;
    case '<':
      return value < threshold;
    case '==':
      return value === threshold;
  }
}

function ordinal(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function evaluateQualityGates(
  metrics: Readonly<Record<MetricName, MetricValue>>,
  qualityGates: Readonly<Record<string, QualityGate>>,
  manifestPath: string,
): GateResult {
  const names = Object.keys(qualityGates).sort(ordinal);
  for (const name of names) {
    if (!metricNames.includes(name as MetricName)) {
      throw new FixtureRegistryError(
        'MANIFEST_INVALID',
        manifestPath,
        `qualityGates.${name}`,
        'unsupported metric gate',
      );
    }
    const threshold = qualityGates[name]!.threshold;
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new FixtureRegistryError(
        'MANIFEST_INVALID',
        manifestPath,
        `qualityGates.${name}.threshold`,
        'must be a finite ratio in [0, 1]',
      );
    }
  }

  const gates: EvaluatedGate[] = names.map((name) => {
    const metricName = name as MetricName;
    const { operator, threshold } = qualityGates[name]!;
    const value = metrics[metricName].value;
    return {
      name: metricName,
      value,
      operator,
      threshold,
      status:
        value === null ? 'NOT_EVALUABLE' : passes(value, operator, threshold) ? 'PASS' : 'FAIL',
    };
  });
  return { gates, overall: gates.every((gate) => gate.status === 'PASS') ? 'PASS' : 'FAIL' };
}
