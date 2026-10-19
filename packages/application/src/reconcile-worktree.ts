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
import type { ObservedFile, ObservedWorktree, SourceScanRequest } from '@codeatlas/source';

import { detectWorktreeChanges } from './change-detector.js';
import type { WorktreeChangeSet } from './change-detector.js';

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
  readonly changes: WorktreeChangeSet;
  readonly changedPaths: readonly RepositoryRelativePath[];
}

export async function reconcileGitWorktree(
  request: SourceScanRequest,
  store: SourceStatePort,
): Promise<ReconcileWorktreeResult> {
  const previous = store.load(request.repositoryId);
  const observation = await observeGitWorktree(request);
  return reconcileObservedGitWorktree(observation, store, previous);
}

/** Reuse one observation with the original pre-observation optimistic base. */
export function reconcileObservedGitWorktree(
  observation: ObservedWorktree,
  store: SourceStatePort,
  previous: StoredWorktreeState | null,
): ReconcileWorktreeResult {
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
  const next = { revision, files };
  const changes = detectWorktreeChanges(previous, next);
  const changedPaths = [
    ...changes.added.map((file) => file.path),
    ...changes.modified.map((file) => file.path),
    ...changes.deleted.map((file) => file.path),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  store.replace(previous, next);
  return { revision, files: observation.files, changes, changedPaths };
}
