import { randomUUID } from 'node:crypto';

import {
  EntityIdSchema,
  RevisionSchema,
  SourceFileSchema,
  WorktreeRevisionSchema,
  parseIr,
  validateRevisionTransition,
} from '@codeatlas/ir';
import type {
  CommitIdentity,
  EntityId,
  RepositoryRelativePath,
  SourceFile,
  WorktreeRevision,
} from '@codeatlas/ir';
import { observeGitWorktree } from '@codeatlas/source';
import type { ObservedFile, SourceScanRequest } from '@codeatlas/source';

export interface StoredWorktreeState {
  readonly revision: WorktreeRevision;
  readonly files: readonly SourceFile[];
}

export interface SourceStatePort {
  load(repositoryId: EntityId): StoredWorktreeState | null;
  findCommitRevisionId(repositoryId: EntityId, commitIdentity: CommitIdentity): EntityId | null;
  replace(expected: StoredWorktreeState | null, next: StoredWorktreeState): void;
}

export interface ReconcileWorktreeResult {
  readonly revision: WorktreeRevision;
  readonly files: readonly ObservedFile[];
  readonly changedPaths: readonly RepositoryRelativePath[];
}

function differs(previous: SourceFile | undefined, next: SourceFile | undefined): boolean {
  if (previous === undefined || next === undefined) return previous !== next;
  return (
    previous.contentFingerprint !== next.contentFingerprint ||
    previous.languageHint !== next.languageHint ||
    previous.classification.role !== next.classification.role ||
    previous.classification.provenance !== next.classification.provenance ||
    previous.classification.contentKind !== next.classification.contentKind ||
    previous.sensitivity !== next.sensitivity
  );
}

export async function reconcileGitWorktree(
  request: SourceScanRequest,
  store: SourceStatePort,
): Promise<ReconcileWorktreeResult> {
  const previous = store.load(request.repositoryId);
  const observation = await observeGitWorktree(request);
  const revision = parseIr(WorktreeRevisionSchema, {
    id: previous?.revision.id ?? EntityIdSchema.parse(randomUUID()),
    repositoryId: observation.repositoryId,
    kind: 'WORKTREE',
    contentFingerprint: observation.contentFingerprint,
    baseRevisionId:
      observation.headCommit === null
        ? null
        : store.findCommitRevisionId(observation.repositoryId, observation.headCommit),
  });
  parseIr(RevisionSchema, revision);
  if (previous !== null) validateRevisionTransition(previous.revision, revision);
  const previousByPath = new Map(previous?.files.map((file) => [file.path, file]));
  const files = observation.files.map((observed) =>
    parseIr(SourceFileSchema, {
      id: previousByPath.get(observed.path)?.id ?? EntityIdSchema.parse(randomUUID()),
      repositoryId: observation.repositoryId,
      revisionId: revision.id,
      path: observed.path,
      contentFingerprint: observed.contentFingerprint,
      classification: observed.classification,
      languageHint: observed.languageHint,
      sensitivity: 'INTERNAL',
    }),
  );
  const nextByPath = new Map(files.map((file) => [file.path, file]));
  const changedPaths = [...new Set([...previousByPath.keys(), ...nextByPath.keys()])]
    .filter((path) => differs(previousByPath.get(path), nextByPath.get(path)))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  store.replace(previous, { revision, files });
  return { revision, files: observation.files, changedPaths };
}
