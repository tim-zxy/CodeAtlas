import {
  ensurePhase1Data,
  CommitRevisionSchema,
  ContentFingerprintSchema,
  EntityIdSchema,
  SourceFileSchema,
  type CommitRevision,
  type SourceFile,
  RepositoryRelativePathSchema,
  RepositorySchema,
  type Repository,
} from '@codeatlas/ir';
import { createHash } from 'node:crypto';
import { classifyCommittedBytes } from '../../source/dist/classify.js';
import { fingerprintInventory } from '../../source/dist/fingerprint.js';
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

function bindCommitOwner(owner: CommitReadOwner) {
  const { workspaceId, commitOid, maxObjectBytes } = owner;
  const repository = RepositorySchema.parse(owner.repository);
  const currentGrant = owner.currentGrant.bind(owner);
  function authorize(path: string) {
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
    return policy.source.classification;
  }
  const read = async (paths: readonly string[], account: MixedSourceAccount) => {
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
        (path) => {
          authorize(path);
        },
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
  return { read, authorize, repository };
}

export function createFixedCommitSourceReader(owner: CommitReadOwner) {
  return bindCommitOwner(owner).read;
}

interface CommitManifest {
  version: 1;
  repositoryId: string;
  rootPath: string;
  commitOid: string;
  rootTreeOid: string;
  selectionCoverage: 'COMPLETE' | 'PARTIAL';
  revision: CommitRevision | null;
  inventory: readonly SourceFile[];
  files: readonly {
    path: string;
    blobOid: string;
    sizeBytes: number;
    contentFingerprint: string;
  }[];
  selectionFingerprint: string;
}

const captures = new WeakMap<
  object,
  {
    manifest: Readonly<CommitManifest>;
    authorize: () => void;
  }
>();

// Only this trusted Source observation can issue a handle. Request DTOs and
// persisted manifests cannot be submitted to useFixedCommitCapture.
export function createFixedCommitCapture(owner: CommitReadOwner) {
  const { read, authorize, repository } = bindCommitOwner(owner);
  return async (paths: readonly string[], account: MixedSourceAccount): Promise<object> => {
    try {
      const observed = await read(paths, account);
      const inventory: SourceFile[] = [];
      const files: CommitManifest['files'][number][] = [];
      const revisionId = EntityIdSchema.parse('commit:' + observed.commitOid);
      for (const f of observed.files.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      )) {
        account.checkpoint();
        account.visitItem();
        const path = RepositoryRelativePathSchema.parse(f.path);
        const contentFingerprint = ContentFingerprintSchema.parse(f.contentFingerprint);
        const digest = createHash('sha256')
          .update('codeatlas-commit-source-file-v1\0')
          .update(JSON.stringify([repository.id, path]))
          .digest('hex');
        const shape = classifyCommittedBytes(path, f.bytes);
        const source = SourceFileSchema.parse({
          id: 'file:' + digest,
          repositoryId: repository.id,
          revisionId,
          path,
          contentFingerprint,
          ...shape,
          sensitivity: authorize(path),
        });
        Object.freeze(source.classification);
        inventory.push(Object.freeze(source));
        files.push(
          Object.freeze({
            path,
            blobOid: f.blobOid,
            contentFingerprint,
            sizeBytes: f.bytes.length,
          }),
        );
      }
      const selectionFingerprint = fingerprintInventory(
        inventory.map((f, i) => ({ ...f, sizeBytes: files[i]!.sizeBytes })),
      );
      const revision =
        observed.selectionCoverage === 'COMPLETE'
          ? Object.freeze(
              CommitRevisionSchema.parse({
                id: revisionId,
                repositoryId: repository.id,
                kind: 'COMMIT',
                commitIdentity: observed.commitOid,
                contentFingerprint: selectionFingerprint,
              }),
            )
          : null;
      const manifest: CommitManifest = Object.freeze({
        version: 1,
        repositoryId: repository.id,
        rootPath: repository.rootPath,
        commitOid: observed.commitOid,
        rootTreeOid: observed.rootTreeOid,
        selectionCoverage: observed.selectionCoverage,
        inventory: Object.freeze(inventory),
        files: Object.freeze(files),
        revision,
        selectionFingerprint,
      });
      account.own(manifest);
      const recheck = () => {
        account.checkpoint();
        for (const f of inventory) {
          account.visitItem();
          if (authorize(f.path) !== f.sensitivity) throw Error('PERMISSION_DENIED');
        }
        account.checkpoint();
      };
      recheck();
      const handle = Object.freeze({});
      captures.set(handle, { manifest, authorize: recheck });
      return handle;
    } catch (error) {
      account.invalidate();
      throw error;
    }
  };
}

export function useFixedCommitCapture<T>(
  handle: object,
  consume: (manifest: Readonly<CommitManifest>) => T,
): T {
  const captured = captures.get(handle);
  if (!captured) throw Error('INVALID_COMMIT_CAPTURE');
  try {
    captured.authorize();
  } catch (error) {
    captures.delete(handle);
    throw error;
  }
  return consume(captured.manifest);
}
