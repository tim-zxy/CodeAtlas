import {
  ensurePhase1Data,
  RepositoryRelativePathSchema,
  RepositorySchema,
  type Repository,
} from '@codeatlas/ir';
import { readFixedCommitFiles } from '../../source/dist/fixed-commit-files.js';
import type { MixedSourceAccount } from '../../source/dist/mixed-source-verification.js';
import { authorizeOperation, type OperationPolicyInput } from './operation-policy.js';

interface CommitReadOwner {
  readonly workspaceId: string;
  readonly repository: Repository;
  readonly commitOid: string;
  readonly maxObjectBytes: number;
  // Trusted embedding resolves the live grant and classification for this exact path.
  currentGrant(path: string): Readonly<{
    repository: Repository;
    commitOid: string;
    policy: OperationPolicyInput;
  }> | null;
}

export function createFixedCommitSourceReader(owner: CommitReadOwner) {
  const { workspaceId, commitOid, maxObjectBytes } = owner;
  const repository = RepositorySchema.parse(owner.repository);
  const currentGrant = owner.currentGrant.bind(owner);
  function authorize(path: string): void {
    const grant = currentGrant(path);
    if (
      !grant ||
      grant.repository.id !== repository.id ||
      grant.repository.rootPath !== repository.rootPath ||
      grant.commitOid !== commitOid
    )
      throw Error('PERMISSION_DENIED');
    const policy = grant.policy;
    if (
      policy.operation !== 'READ_SOURCE' ||
      policy.phase !== 'PRIMARY' ||
      policy.destination !== 'LOCAL' ||
      policy.scope.workspaceId !== workspaceId ||
      policy.scope.repositoryId !== repository.id ||
      policy.source.path !== path ||
      policy.source.form !== 'RAW'
    )
      throw Error('PERMISSION_DENIED');
    const decision = authorizeOperation(policy);
    if (!decision.allowed) throw Error(decision.code);
  }
  return async (paths: readonly string[], account: MixedSourceAccount) => {
    try {
      account.checkpoint();
      account.own(paths);
      ensurePhase1Data(paths);
      if (!Array.isArray(paths)) throw Error('INVALID_INPUT');
      const selected = paths.map((path) => RepositoryRelativePathSchema.parse(path));
      for (const path of selected) authorize(path);
      const result = await readFixedCommitFiles(
        {
          repositoryId: repository.id,
          rootPath: repository.rootPath,
          commitOid,
          paths: selected,
          maxObjectBytes,
        },
        account,
        authorize,
      );
      account.checkpoint();
      for (const path of selected) authorize(path);
      account.checkpoint();
      return result;
    } catch (error) {
      account.invalidate();
      throw error;
    }
  };
}
