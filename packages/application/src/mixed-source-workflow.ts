import {
  RepositorySchema,
  RepositoryRelativePathSchema,
  SourceFileSchema,
  ensurePhase1Data,
  type Repository,
  type RepositoryRelativePath,
} from '@codeatlas/ir';
import { readDocumentSourceBytes } from '../../source/dist/document-bytes.js';
import { isDeepStrictEqual } from 'node:util';
import source from '../../source/dist/mixed-source-workflow.js';
import type { MixedSourceAccount } from '../../source/dist/mixed-source-verification.js';
import { validateGitQualification, type SourceProcessControl } from '../../source/dist/git.js';
import type { ObservedWorktree, SourceScanRequest } from '@codeatlas/source';
import { authorizeOperation, type OperationPolicyInput } from './operation-policy.js';
import {
  reconcileObservedGitWorktree,
  type SourceStatePort,
  type StoredWorktreeState,
} from './reconcile-worktree.js';
/** Deep-private bridge to Source validation; no public request/admission option. */
export function validateMixedSourceQualification(
  value: SourceProcessControl['qualification'],
): NonNullable<SourceProcessControl['qualification']> {
  return validateGitQualification(value);
}
export interface MixedSourcePreparationInput {
  readonly request: SourceScanRequest;
  readonly expectedRepository?: Repository;
  readonly policy: OperationPolicyInput;
  readonly sourceState: SourceStatePort;
  readonly account: MixedSourceAccount;
  readonly control: SourceProcessControl;
}
type SourceCommit = 'NOT_ATTEMPTED' | 'UNKNOWN' | 'COMMITTED';
export class MixedSourceWorkflowError extends Error {
  constructor(
    readonly code: string,
    readonly effects: Readonly<{ sourceCommit: SourceCommit; sourceReconciled: boolean | null }>,
  ) {
    super(code);
    this.name = 'MixedSourceWorkflowError';
  }
}
const safeCodes = new Set([
  'PERMISSION_DENIED',
  'SECURITY_POLICY_BLOCKED',
  'SECRET_DETECTED',
  'REMOTE_DISABLED',
  'SOURCE_CHANGED',
  'SOURCE_STATE_CONFLICT',
  'CANCELLED',
  'DEADLINE_EXCEEDED',
  'STAGE_LIMIT_EXCEEDED',
  'HISTORY_LIMIT_EXCEEDED',
  'STAGE_RELEASED',
  'INVALID_STAGE',
  'INVALID_INPUT',
  'NON_GIT_DIRECTORY',
  'GIT_FAILED',
  'FILE_READ_FAILED',
]);
export default async function prepareMixedSource(input: MixedSourcePreparationInput) {
  let sourceCommit: SourceCommit = 'NOT_ATTEMPTED';
  const effects = () =>
    Object.freeze({
      sourceCommit,
      sourceReconciled: sourceCommit === 'UNKNOWN' ? null : sourceCommit === 'COMMITTED',
    });
  const fail = (e: unknown): never => {
    input.account.invalidate();
    const code =
      e &&
      typeof e === 'object' &&
      'code' in e &&
      typeof e.code === 'string' &&
      safeCodes.has(e.code)
        ? e.code
        : 'SOURCE_FAILED';
    const failure = new MixedSourceWorkflowError(code, effects());
    if (
      e &&
      typeof e === 'object' &&
      Object.getOwnPropertyDescriptor(e, 'cleanupState')?.value === 'UNKNOWN'
    )
      Object.assign(failure, { cleanupState: 'UNKNOWN' });
    throw failure;
  };
  try {
    const { policy, request } = input;
    if (
      policy.operation !== 'INDEX' ||
      policy.destination !== 'LOCAL' ||
      policy.source.form !== 'DERIVED' ||
      policy.source.path !== null ||
      policy.scope.repositoryId !== request.repositoryId
    )
      throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
    for (const operation of ['INDEX', 'READ_SOURCE'] as const) {
      const decision = authorizeOperation({ ...policy, operation });
      if (!decision.allowed) throw Object.assign(new Error(decision.code), { code: decision.code });
    }
    let expectedRepository: Readonly<Repository> | undefined;
    if (input.expectedRepository !== undefined) {
      input.account.own(input.expectedRepository);
      try {
        expectedRepository = Object.freeze(RepositorySchema.parse(input.expectedRepository));
      } catch {
        throw Object.assign(new Error('INVALID_INPUT'), { code: 'INVALID_INPUT' });
      }
      if (expectedRepository.id !== request.repositoryId)
        throw Object.assign(new Error('INVALID_INPUT'), { code: 'INVALID_INPUT' });
    }
    input.account.checkpoint();
    const previous = input.sourceState.load(request.repositoryId);
    input.account.own(previous);
    const sourceControl = {
      ...input.control,
      authorizePath(path: RepositoryRelativePath) {
        const decision = authorizeOperation({
          ...policy,
          operation: 'READ_SOURCE',
          source: { ...policy.source, path, form: 'RAW' },
        });
        if (!decision.allowed)
          throw Object.assign(new Error(decision.code), { code: decision.code });
      },
    };
    const observation: ObservedWorktree = await source.observeMixedGitWorktree(
      request,
      input.account,
      sourceControl,
    );
    const verifyRoot = () => {
      if (expectedRepository && observation.rootPath !== expectedRepository.rootPath)
        throw Object.assign(new Error('SOURCE_CHANGED'), { code: 'SOURCE_CHANGED' });
    };
    verifyRoot();
    let target: StoredWorktreeState | null = null;
    reconcileObservedGitWorktree(
      observation,
      {
        load: (id) => input.sourceState.load(id),
        findCommitRevisionId: (id, commit) => input.sourceState.findCommitRevisionId(id, commit),
        replace(expected, next) {
          input.account.checkpoint();
          input.account.own(next);
          sourceCommit = 'UNKNOWN';
          input.sourceState.replace(expected, next);
          sourceCommit = 'COMMITTED';
          target = next;
        },
      },
      previous,
    );
    if (target === null) throw new Error('Missing reconciled Source');
    const state: StoredWorktreeState = target;
    async function verifySelection(): Promise<void> {
      try {
        await source.verifyMixedSourceSelection(request, observation, input.account, sourceControl);
        verifyRoot();
        const current = input.sourceState.load(request.repositoryId);
        input.account.own(current);
        if (!isDeepStrictEqual(current, state))
          throw Object.assign(new Error('SOURCE_CHANGED'), { code: 'SOURCE_CHANGED' });
      } catch (e) {
        fail(e);
      }
    }
    return Object.freeze({
      state,
      observation,
      effects: effects(),
      verifySelection,
      /** Raw selected input only, not a DocumentRevision or CompilationInputSnapshot. */
      async readDocumentBytes(requestedPath: RepositoryRelativePath) {
        try {
          input.account.checkpoint();
          input.account.own(requestedPath);
          const parsedPath = RepositoryRelativePathSchema.safeParse(requestedPath);
          if (!parsedPath.success)
            throw Object.assign(new Error('INVALID_INPUT'), { code: 'INVALID_INPUT' });
          input.account.own(state);
          ensurePhase1Data(state);
          const selected = state.files.find((f) => f.path === parsedPath.data);
          if (!selected)
            throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
          input.account.own(selected);
          const file = SourceFileSchema.parse(selected);
          const observed = observation.files.find((f) => f.path === file.path);
          if (
            !observed ||
            file.repositoryId !== observation.repositoryId ||
            file.contentFingerprint !== observed.contentFingerprint ||
            !isDeepStrictEqual(file.classification, observed.classification) ||
            file.languageHint !== observed.languageHint
          )
            throw Object.assign(new Error('SOURCE_CHANGED'), { code: 'SOURCE_CHANGED' });
          const authorize = () => {
            if (policy.destination !== 'LOCAL' || policy.scope.repositoryId !== file.repositoryId)
              throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
            // Neither the operation policy nor the stored file classification may be downgraded.
            for (const classification of [policy.source.classification, file.sensitivity]) {
              const decision = authorizeOperation({
                ...policy,
                operation: 'READ_SOURCE',
                source: { ...policy.source, path: file.path, form: 'RAW', classification },
              });
              if (!decision.allowed)
                throw Object.assign(new Error(decision.code), { code: decision.code });
            }
          };
          authorize();
          await verifySelection();
          const result = await readDocumentSourceBytes(
            { rootPath: observation.rootPath, file },
            input.account,
            authorize,
          );
          await verifySelection();
          authorize();
          input.account.checkpoint();
          return result;
        } catch (e) {
          return fail(e);
        }
      },
    });
  } catch (e) {
    return fail(e);
  }
}
