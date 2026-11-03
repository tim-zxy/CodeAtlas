import path from 'node:path';
import { isIP } from 'node:net';
import { parseAllDocuments } from 'yaml';
import { validateOperationPolicyData } from '@codeatlas/application';
import type { RuntimeBuilder } from './runtime-builder.js';
import type { KnowledgeRuntime } from './knowledge-runtime.js';

export interface RequestResourceBudget {
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
  readonly maxDurationMs: number;
  readonly maxMemoryBytes: number;
}
export interface ModelResourceBudget {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxInvocations: number;
  readonly maxDurationMs: number;
}
export interface EffectiveConfig {
  readonly configVersion: 1;
  readonly runtime: { readonly mode: 'ONE_SHOT' | 'MCP_STDIO'; readonly workspaceRoot: string };
  readonly indexing: {
    readonly nativeAnalyzer: { readonly parseWorkers: 'AUTO' | number };
    readonly resourceBudget: RequestResourceBudget;
  };
  readonly providers: readonly {
    readonly providerId: string;
    readonly enabled: boolean;
    readonly configurationSchemaVersion: number;
    readonly configuration: unknown;
  }[];
  readonly plugins: readonly {
    readonly pluginId: string;
    readonly enabled: boolean;
    readonly configurationSchemaVersion: number;
    readonly configuration: unknown;
  }[];
  readonly knowledge: {
    readonly defaultScope: 'AUTO' | 'REPOSITORY' | 'WORKSPACE' | 'CROSS_REPO' | 'ALL';
    readonly defaultMode: 'AFFECTED_ONLY' | 'FULL';
    readonly degradedCandidates: false;
  };
  readonly llm: {
    readonly enabled: boolean;
    readonly endpoint: string | null;
    readonly credentialRef: { readonly kind: 'ENVIRONMENT'; readonly name: string } | null;
    readonly allowRemoteFallback: boolean;
    readonly resourceBudget: ModelResourceBudget | null;
  };
  readonly embedding: { readonly enabled: false };
  readonly agents: { readonly defaultDepth: 'L0' | 'L1' | 'L2' };
  readonly security: {
    readonly localOnly: boolean;
    readonly remoteLlmEnabled: boolean;
    readonly remoteEmbeddingEnabled: boolean;
    readonly allowSensitiveRemote: boolean;
    readonly allowRawSourceRemote: boolean;
  };
  readonly warnings: readonly {
    readonly code: 'UNKNOWN_CONFIG_KEY';
    readonly path: readonly (string | number)[];
  }[];
}
export interface ConfigurationSources {
  readonly defaults: unknown;
  readonly global?: string;
  readonly workspace?: string;
  readonly repository?: string;
  readonly maxInputBytes: number;
}
export class EffectiveConfigError extends Error {
  readonly code = 'CONFIG_INVALID' as const;
  constructor() {
    super('Invalid or disallowed Phase1 configuration');
    this.name = 'EffectiveConfigError';
  }
}
type RecordValue = Record<string, unknown>;
type Warning = { code: 'UNKNOWN_CONFIG_KEY'; path: (string | number)[] };
const budgetKeys = [
  'maxInputBytes',
  'maxOutputBytes',
  'maxItems',
  'maxDepth',
  'maxDurationMs',
  'maxMemoryBytes',
];
const modelBudgetKeys = ['maxInputTokens', 'maxOutputTokens', 'maxInvocations', 'maxDurationMs'];
const rootKeys = [
  'configVersion',
  'runtime',
  'indexing',
  'providers',
  'plugins',
  'knowledge',
  'llm',
  'embedding',
  'agents',
  'security',
];
const fields: Record<string, readonly string[]> = {
  '': rootKeys,
  runtime: ['mode', 'workspaceRoot'],
  indexing: ['nativeAnalyzer', 'resourceBudget'],
  'indexing.nativeAnalyzer': ['parseWorkers'],
  'indexing.resourceBudget': budgetKeys,
  knowledge: ['defaultScope', 'defaultMode', 'degradedCandidates'],
  llm: ['enabled', 'endpoint', 'credentialRef', 'allowRemoteFallback', 'resourceBudget'],
  'llm.credentialRef': ['kind', 'name'],
  'llm.resourceBudget': modelBudgetKeys,
  embedding: ['enabled'],
  agents: ['defaultDepth'],
  security: [
    'localOnly',
    'remoteLlmEnabled',
    'remoteEmbeddingEnabled',
    'allowSensitiveRemote',
    'allowRawSourceRemote',
  ],
  'providers[]': ['providerId', 'enabled', 'configurationSchemaVersion', 'configuration'],
  'plugins[]': ['pluginId', 'enabled', 'configurationSchemaVersion', 'configuration'],
};
function check(value: unknown): asserts value {
  if (!value) throw new EffectiveConfigError();
}
function record(value: unknown): RecordValue {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as RecordValue;
}
function text(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.trim() === value);
}
function positive(value: unknown): void {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
}
function boolean(value: unknown): void {
  check(typeof value === 'boolean');
}
function choice(value: unknown, values: readonly string[]): void {
  check(typeof value === 'string' && values.includes(value));
}
function secretKeys(value: unknown): void {
  if (typeof value === 'string') {
    check(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]+/.test(value));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) secretKeys(item);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    check(
      key === 'credentialRef' ||
        !/(apikey|password|secret|accesstoken|authtoken|authorization|credential)/i.test(
          key.replace(/[^A-Za-z0-9]/g, ''),
        ),
    );
    secretKeys(child);
  }
}
function clean(
  value: unknown,
  keyPath: string,
  warnings: Warning[],
  dataPath: (string | number)[],
): unknown {
  if (value === null) return null;
  if (keyPath === 'providers' || keyPath === 'plugins') {
    check(Array.isArray(value));
    return value.map((item, index) => clean(item, keyPath + '[]', warnings, [...dataPath, index]));
  }
  const allowed = fields[keyPath];
  if (!allowed) return value;
  const input = record(value),
    entries: [string, unknown][] = [];
  for (const [key, child] of Object.entries(input)) {
    if (!allowed.includes(key)) {
      warnings.push({ code: 'UNKNOWN_CONFIG_KEY', path: [...dataPath] });
      continue;
    }
    const next = keyPath ? keyPath + '.' + key : key;
    entries.push([key, clean(child, next, warnings, [...dataPath, key])]);
  }
  return Object.fromEntries(entries);
}
function merge(base: RecordValue, override: RecordValue): RecordValue {
  const result = Object.fromEntries(Object.entries(base));
  for (const [key, value] of Object.entries(override)) {
    const old = result[key];
    result[key] =
      old !== null &&
      value !== null &&
      typeof old === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(old) &&
      !Array.isArray(value)
        ? merge(record(old), record(value))
        : value;
  }
  return result;
}
function resource(value: unknown, keys: readonly string[]): void {
  const b = record(value);
  check(Object.keys(b).length === keys.length);
  for (const key of keys) positive(b[key]);
}
function registrations(value: unknown, idKey: 'providerId' | 'pluginId'): void {
  check(Array.isArray(value));
  const ids: string[] = [];
  for (const item of value) {
    const o = record(item);
    text(o[idKey]);
    ids.push(o[idKey]);
    boolean(o.enabled);
    positive(o.configurationSchemaVersion);
    check(Object.hasOwn(o, 'configuration'));
  }
  check(new Set(ids).size === ids.length);
}
function localEndpoint(endpoint: string): boolean {
  const u = new URL(endpoint),
    host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'));
}
function validate(value: RecordValue): void {
  check(
    rootKeys.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).length === rootKeys.length &&
      value.configVersion === 1,
  );
  const runtime = record(value.runtime);
  choice(runtime.mode, ['ONE_SHOT', 'MCP_STDIO']);
  text(runtime.workspaceRoot);
  check(path.isAbsolute(runtime.workspaceRoot));
  const indexing = record(value.indexing),
    native = record(indexing.nativeAnalyzer);
  if (native.parseWorkers !== 'AUTO') positive(native.parseWorkers);
  resource(indexing.resourceBudget, budgetKeys);
  registrations(value.providers, 'providerId');
  registrations(value.plugins, 'pluginId');
  const knowledge = record(value.knowledge);
  choice(knowledge.defaultScope, ['AUTO', 'REPOSITORY', 'WORKSPACE', 'CROSS_REPO', 'ALL']);
  choice(knowledge.defaultMode, ['AFFECTED_ONLY', 'FULL']);
  check(knowledge.degradedCandidates === false);
  const embedding = record(value.embedding);
  check(embedding.enabled === false);
  const agents = record(value.agents);
  choice(agents.defaultDepth, ['L0', 'L1', 'L2']);
  const security = record(value.security);
  for (const key of fields.security!) boolean(security[key]);
  const llm = record(value.llm);
  boolean(llm.enabled);
  boolean(llm.allowRemoteFallback);
  if (llm.endpoint !== null) {
    text(llm.endpoint);
    let u: URL;
    try {
      u = new URL(llm.endpoint);
    } catch {
      throw new EffectiveConfigError();
    }
    check(
      ['http:', 'https:'].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.hash &&
        !u.search,
    );
  }
  if (llm.credentialRef !== null) {
    const c = record(llm.credentialRef);
    check(c.kind === 'ENVIRONMENT');
    text(c.name);
    check(/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name));
  }
  if (llm.resourceBudget !== null) resource(llm.resourceBudget, modelBudgetKeys);
  if (llm.enabled) {
    check(llm.endpoint !== null && llm.resourceBudget !== null);
    if (!localEndpoint(llm.endpoint as string))
      check(security.localOnly === false && security.remoteLlmEnabled === true);
  }
}
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
export function loadEffectiveConfig(input: ConfigurationSources): EffectiveConfig {
  try {
    validateOperationPolicyData(input);
    const control = record(input);
    check(
      Object.keys(control).every((k) =>
        ['defaults', 'global', 'workspace', 'repository', 'maxInputBytes'].includes(k),
      ),
    );
    positive(input.maxInputBytes);
    let bytes = Buffer.byteLength(JSON.stringify(input.defaults), 'utf8');
    for (const key of ['global', 'workspace', 'repository'] as const)
      if (Object.hasOwn(input, key)) {
        check(typeof input[key] === 'string');
        bytes += Buffer.byteLength(input[key]!, 'utf8');
      }
    check(Number.isSafeInteger(bytes) && bytes <= input.maxInputBytes);
    const warnings: Warning[] = [];
    const defaults = record(input.defaults);
    check(defaults.configVersion === 1);
    secretKeys(defaults);
    let result = record(clean(JSON.parse(JSON.stringify(defaults)), '', warnings, []));
    for (const key of ['global', 'workspace', 'repository'] as const) {
      if (!Object.hasOwn(input, key)) continue;
      const documents = parseAllDocuments(input[key]!, {
        version: '1.2',
        schema: 'core',
        uniqueKeys: true,
        stringKeys: true,
        prettyErrors: false,
        logLevel: 'silent',
      });
      check(documents.length === 1);
      const doc = documents[0]!;
      check(
        doc.errors.length === 0 &&
          doc.warnings.length === 0 &&
          doc.directives?.yaml.version === '1.2',
      );
      const data: unknown = doc.toJS({ maxAliasCount: 0, mapAsMap: false });
      validateOperationPolicyData(data);
      const layer = record(data);
      check(layer.configVersion === 1);
      secretKeys(layer);
      result = merge(result, record(clean(layer, '', warnings, [])));
    }
    validate(result);
    const runtime = record(result.runtime);
    runtime.workspaceRoot = path.resolve(runtime.workspaceRoot as string);
    return freezeDeep({ ...result, warnings }) as unknown as EffectiveConfig;
  } catch {
    throw new EffectiveConfigError();
  }
}
export async function buildConfiguredRuntime(
  sources: ConfigurationSources,
  builder: RuntimeBuilder,
): Promise<{ readonly runtime: KnowledgeRuntime; readonly effectiveConfig: EffectiveConfig }> {
  const effectiveConfig = loadEffectiveConfig(sources);
  const runtime = await builder.build({
    configVersion: 1,
    mode: effectiveConfig.runtime.mode,
    workspaceRoot: effectiveConfig.runtime.workspaceRoot,
  });
  return Object.freeze({ runtime, effectiveConfig });
}
