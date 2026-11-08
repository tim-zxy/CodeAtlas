import { createHash } from 'node:crypto';
import { types, isDeepStrictEqual } from 'node:util';
import {
  assertRuntimeRequestControl,
  KnowledgeScopeSchema,
  EntityIdSchema,
  RepositoryRelativePathSchema,
  Phase1ExactStringSchema,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import type { DocumentAccount } from '../../documents/dist/source-positions.js';
import { inspectDocumentSecretCandidate } from '../../documents/dist/secret-candidate.js';
import { maskDocumentRanges } from '../../documents/dist/document-range-mask.js';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
} from './compilation-input-contract.js';
import {
  planCompilationOriginals,
  inspectSuppliedCompilationOriginals,
} from './compilation-secret-candidate.js';
type Requirement = ReturnType<typeof planCompilationOriginals>['required'][number];
type Snapshot = ReturnType<typeof parseCompilationInputSnapshot>;
type Binding = {
  operationId: string;
  workspaceId: string;
  revisionSetId: string;
  scope: Snapshot['scope'];
  policyVersions: Snapshot['policyVersions'];
};
export interface OfflineInspectionPorts {
  evidenceKind: 'TEST_PORTS_NOT_AUTHORITY';
  readMetadata(): Promise<readonly Requirement[]>;
  // Test metadata owner must refuse unsupported content/classification before reading.
  // OriginalRequirement alone does not authenticate Source or prove classification.
  authorizeOriginal(file: Requirement): Promise<undefined>;
  readOriginal(file: Requirement): Promise<Uint8Array>;
  materializeSnapshot(originals: ReadonlyMap<string, Uint8Array>): Promise<unknown>;
  recheck(binding: Readonly<Binding>, files: readonly Requirement[]): Promise<undefined>;
  settle(): Promise<undefined>;
  consume(snapshot: Readonly<Snapshot>): Promise<undefined>;
}
export class OfflineInspectionError extends Error {
  constructor(
    readonly code: string,
    readonly cleanupState: 'SETTLED' | 'UNKNOWN',
    readonly consumption: 'NOT_CONSUMED' | 'UNKNOWN' | 'CONSUMED',
  ) {
    super(code);
    this.name = 'OfflineInspectionError';
  }
}
const ownField = (v: unknown, k: string) =>
  v && typeof v === 'object' && !types.isProxy(v)
    ? Object.getOwnPropertyDescriptor(v, k)?.value
    : undefined;
function exact(v: unknown, keys: string[]) {
  if (!v || typeof v !== 'object' || types.isProxy(v)) throw Error('INVALID');
  const d = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(d).length !== keys.length ||
    keys.some((k) => !d[k] || !d[k]!.enumerable || !Object.hasOwn(d[k]!, 'value'))
  )
    throw Error('INVALID');
  return Object.fromEntries(keys.map((k) => [k, d[k]!.value]));
}
const owners = new WeakMap<
  object,
  {
    binding: Binding;
    control: RuntimeRequestControl;
    account: DocumentAccount;
    ports: OfflineInspectionPorts;
    started: boolean;
    lastOutcome: {
      cleanupState: 'SETTLED' | 'UNKNOWN';
      consumption: 'NOT_CONSUMED' | 'UNKNOWN' | 'CONSUMED';
    };
  }
>();
/** Explicit TEST_PORTS owner only; possession creates no production permission. */
export function createOfflineCompilationInspection(input: {
  binding: Binding;
  control: RuntimeRequestControl;
  account: DocumentAccount;
  ports: OfflineInspectionPorts;
}) {
  input = exact(input, ['binding', 'control', 'account', 'ports']) as typeof input;
  const c = exact(input.control, [
    'maxItems',
    'maxDepth',
    'deadlineEpochMs',
    'signal',
  ]) as RuntimeRequestControl;
  if (!c.signal || types.isProxy(c.signal)) throw Error('INVALID');
  assertRuntimeRequestControl(c);
  const binding = JSON.parse(canonicalCompilationJson(input.binding, c));
  exact(binding, ['operationId', 'workspaceId', 'revisionSetId', 'scope', 'policyVersions']);
  if (typeof binding.operationId !== 'string' || !binding.operationId.trim())
    throw Error('INVALID');
  Phase1ExactStringSchema.parse(binding.operationId);
  EntityIdSchema.parse(binding.workspaceId);
  EntityIdSchema.parse(binding.revisionSetId);
  KnowledgeScopeSchema.parse(binding.scope);
  exact(binding.policyVersions, ['securityPolicyRef', 'domainPolicyRef']);
  Phase1ExactStringSchema.parse(binding.policyVersions.securityPolicyRef);
  Phase1ExactStringSchema.parse(binding.policyVersions.domainPolicyRef);
  const p = exact(input.ports, [
    'evidenceKind',
    'readMetadata',
    'authorizeOriginal',
    'readOriginal',
    'materializeSnapshot',
    'recheck',
    'settle',
    'consume',
  ]);
  if (
    p.evidenceKind !== 'TEST_PORTS_NOT_AUTHORITY' ||
    Object.entries(p).some(
      ([k, v]) => k !== 'evidenceKind' && (typeof v !== 'function' || types.isProxy(v)),
    )
  )
    throw Error('INVALID');
  const handle = Object.freeze({});
  owners.set(handle, {
    binding,
    control: Object.freeze(c),
    account: input.account,
    ports: Object.freeze(p) as unknown as OfflineInspectionPorts,
    started: false,
    lastOutcome: { cleanupState: 'SETTLED', consumption: 'NOT_CONSUMED' },
  });
  return handle;
}
/** No scan receipt/Boolean/payload parameter can bypass the fixed offline flow. */
export async function runOfflineCompilationInspection(handle: object) {
  const owner = handle && !types.isProxy(handle) ? owners.get(handle) : undefined;
  if (!owner || owner.started)
    throw new OfflineInspectionError(
      'OFFLINE_OWNER_UNAVAILABLE',
      owner?.lastOutcome.cleanupState ?? 'SETTLED',
      owner?.lastOutcome.consumption ?? 'NOT_CONSUMED',
    );
  owner.started = true;
  owner.lastOutcome = { cleanupState: 'UNKNOWN', consumption: 'UNKNOWN' };
  const { ports, control, binding } = owner;
  let invalid = false,
    invalidationFailed = false,
    settleAttempted = false,
    settled = false,
    consumption: 'NOT_CONSUMED' | 'UNKNOWN' | 'CONSUMED' = 'NOT_CONSUMED';
  const account: DocumentAccount = {
    checkpoint: () => checkpoint(),
    own: (v) => {
      checkpoint();
      owner.account.own(v);
    },
    visitItem: () => {
      checkpoint();
      owner.account.visitItem();
    },
    reserveBuffer: (n) => {
      checkpoint();
      owner.account.reserveBuffer(n);
    },
    invalidate: () => {
      if (!invalid) {
        invalid = true;
        try {
          owner.account.invalidate();
        } catch (error) {
          invalidationFailed = true;
          throw error;
        }
      }
    },
  };
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
  const checkpoint = () => {
    owner.account.checkpoint();
    if (aborted.call(control.signal))
      throw Object.assign(Error('CANCELLED'), { code: 'CANCELLED' });
    if (Date.now() >= control.deadlineEpochMs)
      throw Object.assign(Error('DEADLINE'), { code: 'DEADLINE' });
  };
  const freeze = (v: unknown) => {
    checkpoint();
    account.visitItem();
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      for (const child of Object.values(v)) freeze(child);
      Object.freeze(v);
    }
  };
  const copy = (v: unknown) => {
    account.own(v);
    return JSON.parse(canonicalCompilationJson(v, control));
  };
  const voidResult = (v: unknown) => {
    if (v !== undefined) throw Error('INVALID_CALLBACK_RESULT');
  };
  const settle = async () => {
    settleAttempted = true;
    voidResult(await ports.settle());
    settled = true;
  };
  try {
    checkpoint();
    freeze(binding);
    const required = copy(await ports.readMetadata()) as Requirement[];
    checkpoint();
    if (!Array.isArray(required) || !required.length) throw Error('EMPTY_OR_INVALID_INVENTORY');
    const keys = new Set<string>();
    for (const r of required) {
      account.visitItem();
      exact(r, [
        'key',
        'kind',
        'workspaceId',
        'repositoryId',
        'revisionId',
        'entityId',
        'path',
        'contentFingerprint',
      ]);
      if (
        !['SOURCE_FILE', 'DOCUMENT_REVISION'].includes(r.kind) ||
        (r.kind === 'SOURCE_FILE' && typeof r.repositoryId !== 'string') ||
        typeof r.revisionId !== 'string' ||
        typeof r.entityId !== 'string' ||
        typeof r.contentFingerprint !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/.test(r.contentFingerprint)
      )
        throw Error('INVALID_INVENTORY');
      EntityIdSchema.parse(r.revisionId);
      EntityIdSchema.parse(r.entityId);
      if (r.repositoryId !== null) EntityIdSchema.parse(r.repositoryId);
      if (
        r.kind === 'DOCUMENT_REVISION' &&
        r.repositoryId !== null &&
        typeof r.repositoryId !== 'string'
      )
        throw Error('INVALID_INVENTORY');
      RepositoryRelativePathSchema.parse(r.path);
      if (
        r.workspaceId !== binding.workspaceId ||
        keys.has(r.key) ||
        r.key !== JSON.stringify([r.kind, r.workspaceId, r.repositoryId, r.revisionId, r.entityId])
      )
        throw Error('INVALID_INVENTORY');
      keys.add(r.key);
    }
    freeze(required);
    account.own({ binding, required });
    const metadataDigest = createHash('sha256')
      .update(canonicalCompilationJson({ binding, required }, control))
      .digest('hex');
    const originals = new Map<string, Uint8Array>();
    for (const file of required) {
      checkpoint();
      voidResult(await ports.authorizeOriginal(file));
      checkpoint();
      const bytes = await ports.readOriginal(file);
      checkpoint();
      const owned = maskDocumentRanges(bytes, [], account);
      if ('sha256:' + createHash('sha256').update(owned).digest('hex') !== file.contentFingerprint)
        throw Error('ORIGINAL_CHANGED');
      const rawScan = inspectDocumentSecretCandidate(owned, {}, account);
      if (rawScan.detected)
        throw Object.assign(Error('DETECTED'), { code: 'OFFLINE_SECRET_DETECTED' });
      originals.set(file.key, owned);
    }
    const materializationBytes = new Map(
      [...originals].map(([key, bytes]) => [key, maskDocumentRanges(bytes, [], account)]),
    );
    const checkMaterializationBytes = () => {
      checkpoint();
      if (
        Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get!.call(materializationBytes) !==
        originals.size
      )
        throw Error('MATERIALIZATION_BYTES_CHANGED');
      for (const [key, value] of Map.prototype.entries.call(materializationBytes) as Iterable<
        [string, Uint8Array]
      >) {
        const expected = originals.get(key);
        if (!expected) throw Error('MATERIALIZATION_BYTES_CHANGED');
        const safe = maskDocumentRanges(value, [], account);
        if (
          createHash('sha256').update(safe).digest('hex') !==
          createHash('sha256').update(expected).digest('hex')
        )
          throw Error('MATERIALIZATION_BYTES_CHANGED');
      }
    };
    const rawSnapshot = await ports.materializeSnapshot(materializationBytes);
    checkMaterializationBytes();
    const snapshot = parseCompilationInputSnapshot(rawSnapshot, control);
    checkpoint();
    freeze(snapshot);
    if (
      snapshot.workspaceId !== binding.workspaceId ||
      snapshot.revisionSetId !== binding.revisionSetId ||
      !isDeepStrictEqual(snapshot.scope, binding.scope) ||
      !isDeepStrictEqual(snapshot.policyVersions, binding.policyVersions)
    )
      throw Error('BINDING_CHANGED');
    const plan = planCompilationOriginals(snapshot, control, account);
    if (!isDeepStrictEqual(plan.required, required)) throw Error('INVENTORY_MISMATCH');
    account.own(snapshot);
    const payloadDigest = createHash('sha256')
      .update(canonicalCompilationJson(snapshot, control))
      .digest('hex');
    const scan = inspectSuppliedCompilationOriginals(snapshot, originals, control, account);
    if (scan.detected) throw Object.assign(Error('DETECTED'), { code: 'OFFLINE_SECRET_DETECTED' });
    checkpoint();
    voidResult(await ports.recheck(binding, required));
    checkpoint();
    await settle();
    checkpoint();
    for (const file of required) {
      voidResult(await ports.authorizeOriginal(file));
      checkpoint();
    }
    voidResult(await ports.recheck(binding, required));
    checkpoint();
    checkMaterializationBytes();
    consumption = 'UNKNOWN';
    voidResult(await ports.consume(snapshot));
    consumption = 'CONSUMED';
    owner.lastOutcome = { cleanupState: 'SETTLED', consumption };
    return Object.freeze({
      evidenceKind: 'TEST_PORTS_NOT_AUTHORITY' as const,
      originalSource: 'SUPPLIED_BYTES_ONLY' as const,
      authorization: 'NOT_ESTABLISHED' as const,
      clearance: false as const,
      consumption,
      operationId: binding.operationId,
      metadataDigest,
      inputDigest: snapshot.inputDigest,
      payloadDigest,
      inputsChecked: scan.inputsChecked,
    });
  } catch (error) {
    let unknown = invalidationFailed || ownField(error, 'cleanupState') === 'UNKNOWN';
    if (!settleAttempted)
      try {
        await settle();
      } catch {
        unknown = true;
      }
    if (!settled) unknown = true;
    try {
      account.invalidate();
    } catch {
      unknown = true;
    }
    owner.lastOutcome = { cleanupState: unknown ? 'UNKNOWN' : 'SETTLED', consumption };
    const code = ownField(error, 'code');
    throw new OfflineInspectionError(
      ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'OFFLINE_SECRET_DETECTED'].includes(code)
        ? code
        : 'OFFLINE_INSPECTION_REFUSED',
      unknown ? 'UNKNOWN' : 'SETTLED',
      consumption,
    );
  }
}
