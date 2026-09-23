import { FixtureRegistryError } from './fixture-error.js';

export type FixtureCategory = 'code-intelligence' | 'runtime-graph' | 'knowledge' | 'agent-utility';
export type FixturePhase = '0' | '0.5' | '1' | '2' | '3';
export type QualityGateOperator = '>=' | '>' | '<=' | '<' | '==';

export interface CriticalFact {
  readonly id: string;
  readonly type: string;
  readonly importance: string;
}

export interface QualityGate {
  readonly operator: QualityGateOperator;
  readonly threshold: number;
}

export interface FixtureManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly category: FixtureCategory;
  readonly phase: FixturePhase;
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly capabilities: readonly string[];
  readonly inputs: Readonly<Record<string, string>>;
  readonly expected: Readonly<Record<string, string>>;
  readonly criticalFacts: readonly CriticalFact[];
  readonly qualityGates: Readonly<Record<string, QualityGate>>;
}

const categories: readonly string[] = [
  'code-intelligence',
  'runtime-graph',
  'knowledge',
  'agent-utility',
];
const phases: readonly string[] = ['0', '0.5', '1', '2', '3'];
const operators: readonly string[] = ['>=', '>', '<=', '<', '=='];
const manifestKeys = [
  'schemaVersion',
  'id',
  'category',
  'phase',
  'languages',
  'frameworks',
  'capabilities',
  'inputs',
  'expected',
  'criticalFacts',
  'qualityGates',
] as const;

function fail(manifestPath: string, fieldPath: string, reason: string): never {
  throw new FixtureRegistryError('MANIFEST_INVALID', manifestPath, fieldPath, reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function field(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  manifestPath: string,
  fieldPath: string,
): void {
  for (const key of keys) {
    if (!Object.hasOwn(value, key))
      fail(manifestPath, field(fieldPath, key), 'required field is missing');
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(manifestPath, field(fieldPath, key), 'unknown field');
  }
}

function exactString(value: unknown, manifestPath: string, fieldPath: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(manifestPath, fieldPath, 'must be a nonempty exact string');
  }
  return value;
}

function uniqueStrings(value: unknown, manifestPath: string, fieldPath: string): string[] {
  if (!Array.isArray(value)) fail(manifestPath, fieldPath, 'must be an array');
  const seen = new Set<string>();
  return value.map((item: unknown, index: number) => {
    const path = field(fieldPath, String(index));
    const text = exactString(item, manifestPath, path);
    if (seen.has(text)) fail(manifestPath, path, 'duplicate value');
    seen.add(text);
    return text;
  });
}

function safeArtifactPath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value)
  )
    return false;
  const parts = (value.endsWith('/') ? value.slice(0, -1) : value).split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

function artifactMap(
  value: unknown,
  manifestPath: string,
  fieldPath: string,
): Record<string, string> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    fail(manifestPath, fieldPath, 'must be a nonempty artifact map');
  }
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, path] of Object.entries(value)) {
    exactString(name, manifestPath, field(fieldPath, name));
    if (!safeArtifactPath(path))
      fail(manifestPath, field(fieldPath, name), 'must be a safe relative artifact path');
    result[name] = path;
  }
  return result;
}

function criticalFacts(value: unknown, manifestPath: string): CriticalFact[] {
  if (!Array.isArray(value)) fail(manifestPath, 'criticalFacts', 'must be an array');
  const seen = new Set<string>();
  return value.map((item: unknown, index: number) => {
    const path = `criticalFacts.${index}`;
    if (!isRecord(item)) fail(manifestPath, path, 'must be an object');
    exactKeys(item, ['id', 'type', 'importance'], manifestPath, path);
    const id = exactString(item.id, manifestPath, `${path}.id`);
    const type = exactString(item.type, manifestPath, `${path}.type`);
    const key = JSON.stringify([type, id]);
    if (seen.has(key)) fail(manifestPath, `${path}.id`, 'duplicate critical fact identity');
    seen.add(key);
    return {
      id,
      type,
      importance: exactString(item.importance, manifestPath, `${path}.importance`),
    };
  });
}

function qualityGates(value: unknown, manifestPath: string): Record<string, QualityGate> {
  if (!isRecord(value)) fail(manifestPath, 'qualityGates', 'must be an object');
  const result: Record<string, QualityGate> = Object.create(null) as Record<string, QualityGate>;
  for (const [name, gate] of Object.entries(value)) {
    const path = field('qualityGates', name);
    exactString(name, manifestPath, path);
    if (!isRecord(gate)) fail(manifestPath, path, 'must be an object');
    exactKeys(gate, ['operator', 'threshold'], manifestPath, path);
    if (!operators.includes(gate.operator as string))
      fail(manifestPath, `${path}.operator`, 'unsupported operator');
    if (typeof gate.threshold !== 'number' || !Number.isFinite(gate.threshold)) {
      fail(manifestPath, `${path}.threshold`, 'must be a finite number');
    }
    result[name] = { operator: gate.operator as QualityGateOperator, threshold: gate.threshold };
  }
  return result;
}

export function parseFixtureManifest(value: unknown, manifestPath: string): FixtureManifestV1 {
  if (!isRecord(value)) fail(manifestPath, '', 'manifest must be an object');
  exactKeys(value, manifestKeys, manifestPath, '');
  if (value.schemaVersion !== 1) fail(manifestPath, 'schemaVersion', 'unsupported schema version');
  const id = exactString(value.id, manifestPath, 'id');
  if (!categories.includes(value.category as string))
    fail(manifestPath, 'category', 'unsupported category');
  if (!phases.includes(value.phase as string)) fail(manifestPath, 'phase', 'unsupported phase');
  return {
    schemaVersion: 1,
    id,
    category: value.category as FixtureCategory,
    phase: value.phase as FixturePhase,
    languages: uniqueStrings(value.languages, manifestPath, 'languages'),
    frameworks: uniqueStrings(value.frameworks, manifestPath, 'frameworks'),
    capabilities: uniqueStrings(value.capabilities, manifestPath, 'capabilities'),
    inputs: artifactMap(value.inputs, manifestPath, 'inputs'),
    expected: artifactMap(value.expected, manifestPath, 'expected'),
    criticalFacts: criticalFacts(value.criticalFacts, manifestPath),
    qualityGates: qualityGates(value.qualityGates, manifestPath),
  };
}
