import { types, isDeepStrictEqual } from 'node:util';
import {
  ensurePhase1Data,
  RepoBasisSchema,
  SourceFileSchema,
  type RepoBasis,
  type SourceFile,
} from '@codeatlas/ir';
import prepareMixedSource, {
  MixedSourceWorkflowError,
  type MixedSourcePreparationInput,
} from './mixed-source-workflow.js';

type Prepared = Awaited<ReturnType<typeof prepareMixedSource>>;
export interface CompilationSourceIdentity {
  readonly rootPath: string;
  readonly repoBasis: RepoBasis;
  readonly targetSource: {
    readonly repositoryId: string;
    readonly revisionId: string;
    readonly contentFingerprint: string;
  };
  readonly targetInventory: readonly SourceFile[];
}
export class CompilationSourceError extends Error {
  constructor(
    readonly code: 'SOURCE_CONTEXT_UNAVAILABLE' | 'SOURCE_CHANGED',
    readonly effects: Prepared['effects'],
  ) {
    super(code);
    this.name = 'CompilationSourceError';
  }
}
type Owner = {
  prepared: Prepared;
  state: Prepared['state'];
  observation: Prepared['observation'];
  workspaceId: string;
  account: MixedSourcePreparationInput['account'];
};
const owners = new WeakMap<object, Owner>();
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
function unavailable(): never {
  throw new CompilationSourceError(
    'SOURCE_CONTEXT_UNAVAILABLE',
    Object.freeze({ sourceCommit: 'NOT_ATTEMPTED', sourceReconciled: false }),
  );
}
function ownerFor(handle: object): Owner {
  if (!handle || typeof handle !== 'object' || types.isProxy(handle)) return unavailable();
  return owners.get(handle) ?? unavailable();
}
function owned<T>(value: T, account: Owner['account']): T {
  account.checkpoint();
  account.own(value);
  ensurePhase1Data(value);
  account.own(value);
  return freeze(structuredClone(value));
}
const safeCodes = new Set([
  'CANCELLED',
  'DEADLINE_EXCEEDED',
  'STAGE_LIMIT_EXCEEDED',
  'HISTORY_LIMIT_EXCEEDED',
  'STAGE_RELEASED',
  'SOURCE_CHANGED',
  'SOURCE_STATE_CONFLICT',
  'PERMISSION_DENIED',
  'SECURITY_POLICY_BLOCKED',
  'GIT_FAILED',
  'FILE_READ_FAILED',
]);
function refusal(error: unknown, effects: Prepared['effects'], account: Owner['account']): never {
  let unsettled = false;
  try {
    account.invalidate();
  } catch {
    unsettled = true;
  }
  const descriptors: PropertyDescriptorMap =
    error && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptors(error)
      : {};
  const code: unknown = descriptors.code?.value;
  const actualEffects =
    effects.sourceCommit === 'NOT_ATTEMPTED' && error instanceof MixedSourceWorkflowError
      ? error.effects
      : effects;
  const failure =
    error instanceof CompilationSourceError
      ? new CompilationSourceError(error.code, actualEffects)
      : new MixedSourceWorkflowError(
          typeof code === 'string' && safeCodes.has(code) ? code : 'SOURCE_FAILED',
          actualEffects,
        );
  if (unsettled || descriptors.cleanupState?.value === 'UNKNOWN')
    Object.assign(failure, { cleanupState: 'UNKNOWN' });
  throw failure;
}
function inventory(values: readonly SourceFile[]): SourceFile[] {
  return [...values].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
/** Separate preparation, before capture: reuse the existing controlled Source
 * issuer and reconciliation workflow. This may reconcile Source exactly as that
 * workflow already does. Capture itself never calls preparation or writes Source.
 * This context authenticates Source origin/content only, never a read permission,
 * scan clearance, production policy issuer, Code activation or publication. */
export async function prepareCompilationSource(input: MixedSourcePreparationInput): Promise<{
  readonly handle: object;
  readonly repositoryId: string;
  readonly effects: Prepared['effects'];
}> {
  let effects: Prepared['effects'] = Object.freeze({
    sourceCommit: 'NOT_ATTEMPTED',
    sourceReconciled: false,
  });
  try {
    const request = owned(input.request, input.account);
    const policy = owned(input.policy, input.account);
    const prepared = await prepareMixedSource({ ...input, request, policy });
    effects = prepared.effects;
    const state = owned(prepared.state, input.account);
    const observation = owned(prepared.observation, input.account);
    const handle = Object.freeze({});
    owners.set(handle, {
      prepared,
      state,
      observation,
      workspaceId: policy.scope.workspaceId,
      account: input.account,
    });
    return Object.freeze({ handle, repositoryId: state.revision.repositoryId, effects });
  } catch (error) {
    return refusal(error, effects, input.account);
  }
}
/** The expected identity comes from the genuine Storage owner, not Capture DTOs.
 * Original Source verifySelection performs its own issuer/inventory/Git/content
 * checks and checks the actual SourceStatePort again; no DTO proof substitutes. */
export async function verifyCompilationSource(
  handle: object,
  identityValue: CompilationSourceIdentity,
  workspaceId: string,
): Promise<void> {
  const owner = ownerFor(handle),
    { account, prepared, state, observation } = owner;
  try {
    const identity = owned(identityValue, account);
    function unchanged() {
      account.checkpoint();
      if (owners.get(handle) !== owner)
        throw new CompilationSourceError('SOURCE_CONTEXT_UNAVAILABLE', prepared.effects);
      if (
        workspaceId !== owner.workspaceId ||
        !isDeepStrictEqual(prepared.state, state) ||
        !isDeepStrictEqual(prepared.observation, observation)
      )
        throw new CompilationSourceError('SOURCE_CHANGED', prepared.effects);
    }
    unchanged();
    const basis = RepoBasisSchema.parse(identity.repoBasis),
      revision = state.revision;
    const expectedTarget = {
      repositoryId: revision.repositoryId,
      revisionId: revision.id,
      contentFingerprint: revision.contentFingerprint,
    };
    if (
      Object.keys(identity).length !== 4 ||
      identity.rootPath !== observation.rootPath ||
      basis.repositoryId !== revision.repositoryId ||
      basis.revisionId !== revision.id ||
      basis.contentFingerprint !== revision.contentFingerprint ||
      !isDeepStrictEqual(identity.targetSource, expectedTarget) ||
      !Array.isArray(identity.targetInventory) ||
      !isDeepStrictEqual(
        inventory(identity.targetInventory.map((f) => SourceFileSchema.parse(f))),
        inventory(state.files),
      )
    )
      throw new CompilationSourceError('SOURCE_CHANGED', prepared.effects);
    await prepared.verifySelection();
    unchanged();
  } catch (error) {
    return refusal(error, prepared.effects, account);
  }
}
export function releaseCompilationSource(handle: object): void {
  ownerFor(handle);
  owners.delete(handle);
}
