import { ensurePhase1Data, EntityIdSchema, RepositoryRelativePathSchema } from '@codeatlas/ir';
export const POLICY_OPERATIONS = [
  'QUERY',
  'INDEX',
  'UPDATE_KNOWLEDGE',
  'READ_SOURCE',
  'REPROJECT_WIKI',
  'LOCAL_LLM',
  'LOCAL_EMBEDDING',
  'REMOTE_LLM',
  'REMOTE_EMBEDDING',
] as const;
export type PolicyOperation = (typeof POLICY_OPERATIONS)[number];
export interface OperationPolicyInput {
  operation: PolicyOperation;
  phase: 'PRIMARY' | 'REPAIR' | 'FALLBACK';
  scope: { workspaceId: string; repositoryId: string | null };
  callerCapabilities: PolicyOperation[];
  permissionContext: {
    workspaceId: string;
    repositoryIds: string[] | null;
    allowedOperations: PolicyOperation[];
  };
  source: {
    path: string | null;
    classification: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'SECRET';
    form: 'RAW' | 'DERIVED';
    secretDetected: boolean;
    policyBlocked: boolean;
    derivedAccessAllowed: boolean;
  };
  destination: 'LOCAL' | 'REMOTE';
  settings: {
    localOnly: boolean;
    remoteLlmEnabled: boolean;
    remoteEmbeddingEnabled: boolean;
    allowRemoteFallback: boolean;
    allowSensitiveRemote: boolean;
    allowRawSourceRemote: boolean;
  };
}
export type PolicyDecisionCode =
  | 'ALLOWED'
  | 'PERMISSION_DENIED'
  | 'SECURITY_POLICY_BLOCKED'
  | 'SECRET_DETECTED'
  | 'REMOTE_DISABLED';
export interface OperationPolicyDecision {
  readonly allowed: boolean;
  readonly code: PolicyDecisionCode;
  readonly fallbackAllowed: false;
}
export class OperationPolicyError extends Error {
  readonly code = 'POLICY_INPUT_INVALID' as const;
  constructor() {
    super('Invalid operation policy input');
    this.name = 'OperationPolicyError';
  }
}
export function validateOperationPolicyData(input: unknown): void {
  ensurePhase1Data(input);
}
function check(value: unknown): asserts value {
  if (!value) throw new OperationPolicyError();
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  const v = value as Record<string, unknown>;
  check(Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)));
  return v;
}
function choice(value: unknown, allowed: readonly string[]): void {
  check(typeof value === 'string' && allowed.includes(value));
}
function operations(value: unknown): void {
  check(Array.isArray(value));
  for (const v of value) choice(v, POLICY_OPERATIONS);
  check(new Set(value).size === value.length);
}
function parseInput(input: unknown): OperationPolicyInput {
  try {
    validateOperationPolicyData(input);
    const root = object(input, [
      'operation',
      'phase',
      'scope',
      'callerCapabilities',
      'permissionContext',
      'source',
      'destination',
      'settings',
    ]);
    choice(root.operation, POLICY_OPERATIONS);
    choice(root.phase, ['PRIMARY', 'REPAIR', 'FALLBACK']);
    choice(root.destination, ['LOCAL', 'REMOTE']);
    operations(root.callerCapabilities);
    const scope = object(root.scope, ['workspaceId', 'repositoryId']);
    EntityIdSchema.parse(scope.workspaceId);
    if (scope.repositoryId !== null) EntityIdSchema.parse(scope.repositoryId);
    const permission = object(root.permissionContext, [
      'workspaceId',
      'repositoryIds',
      'allowedOperations',
    ]);
    EntityIdSchema.parse(permission.workspaceId);
    operations(permission.allowedOperations);
    if (permission.repositoryIds !== null) {
      check(Array.isArray(permission.repositoryIds));
      for (const id of permission.repositoryIds) EntityIdSchema.parse(id);
      check(new Set(permission.repositoryIds).size === permission.repositoryIds.length);
    }
    const source = object(root.source, [
      'path',
      'classification',
      'form',
      'secretDetected',
      'policyBlocked',
      'derivedAccessAllowed',
    ]);
    if (source.path !== null) RepositoryRelativePathSchema.parse(source.path);
    choice(source.classification, ['PUBLIC', 'INTERNAL', 'SENSITIVE', 'SECRET']);
    choice(source.form, ['RAW', 'DERIVED']);
    if (source.form === 'RAW') check(source.path !== null);
    for (const k of ['secretDetected', 'policyBlocked', 'derivedAccessAllowed'])
      check(typeof source[k] === 'boolean');
    const settings = object(root.settings, [
      'localOnly',
      'remoteLlmEnabled',
      'remoteEmbeddingEnabled',
      'allowRemoteFallback',
      'allowSensitiveRemote',
      'allowRawSourceRemote',
    ]);
    for (const v of Object.values(settings)) check(typeof v === 'boolean');
    return input as OperationPolicyInput;
  } catch {
    throw new OperationPolicyError();
  }
}
function secretPath(path: string | null): boolean {
  if (path === null) return false;
  const parts = path.toLowerCase().split('/'),
    name = parts.at(-1)!;
  return (
    parts.some((p) => ['secrets', 'secret', 'credentials', '.ssh', '.aws', '.gnupg'].includes(p)) ||
    name.startsWith('.env') ||
    name.startsWith('credentials') ||
    ['id_rsa', 'id_ed25519', 'id_dsa', '.netrc', '.git-credentials', '.npmrc'].includes(name) ||
    /\.(pem|key|p12|pfx)$/.test(name)
  );
}
export function authorizeOperation(value: unknown): OperationPolicyDecision {
  const x = parseInput(value);
  const decision = (code: PolicyDecisionCode): OperationPolicyDecision =>
    Object.freeze({ allowed: code === 'ALLOWED', code, fallbackAllowed: false });
  const p = x.permissionContext;
  if (
    !x.callerCapabilities.includes(x.operation) ||
    !p.allowedOperations.includes(x.operation) ||
    x.scope.workspaceId !== p.workspaceId ||
    (p.repositoryIds !== null &&
      (x.scope.repositoryId === null || !p.repositoryIds.includes(x.scope.repositoryId)))
  )
    return decision('PERMISSION_DENIED');
  if (x.source.policyBlocked || (x.source.form === 'DERIVED' && !x.source.derivedAccessAllowed))
    return decision('SECURITY_POLICY_BLOCKED');
  if (x.source.secretDetected) return decision('SECRET_DETECTED');
  const restricted = x.source.classification === 'SECRET' || secretPath(x.source.path);
  const safeDerived =
    x.source.form === 'DERIVED' && x.source.derivedAccessAllowed && x.destination === 'LOCAL';
  if (restricted && !safeDerived) return decision('SECURITY_POLICY_BLOCKED');
  const remoteOperation = x.operation === 'REMOTE_LLM' || x.operation === 'REMOTE_EMBEDDING';
  if ((x.destination === 'REMOTE') !== remoteOperation) return decision('SECURITY_POLICY_BLOCKED');
  if (x.destination === 'REMOTE') {
    if (
      x.settings.localOnly ||
      (x.operation === 'REMOTE_LLM' && !x.settings.remoteLlmEnabled) ||
      (x.operation === 'REMOTE_EMBEDDING' && !x.settings.remoteEmbeddingEnabled) ||
      (x.phase === 'FALLBACK' && !x.settings.allowRemoteFallback)
    )
      return decision('REMOTE_DISABLED');
    if (x.source.classification === 'SENSITIVE' && !x.settings.allowSensitiveRemote)
      return decision('SECURITY_POLICY_BLOCKED');
    if (
      x.source.form === 'RAW' &&
      (!x.settings.allowRawSourceRemote ||
        !x.callerCapabilities.includes('READ_SOURCE') ||
        !p.allowedOperations.includes('READ_SOURCE'))
    )
      return decision('SECURITY_POLICY_BLOCKED');
  }
  return decision('ALLOWED');
}
