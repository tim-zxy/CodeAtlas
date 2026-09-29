import type {
  ContentFingerprint,
  EntityId,
  RepositoryRelativePath,
  SourceFile,
} from '@codeatlas/ir';

import type { StoredWorktreeState } from './reconcile-worktree.js';

export interface WorktreeChangeSet {
  readonly baseRevisionId: EntityId | null;
  readonly baseContentFingerprint: ContentFingerprint | null;
  readonly added: readonly SourceFile[];
  readonly modified: readonly SourceFile[];
  readonly deleted: readonly {
    id: EntityId;
    path: RepositoryRelativePath;
    previousContentFingerprint: ContentFingerprint;
  }[];
}

function differs(previous: SourceFile, next: SourceFile): boolean {
  return (
    previous.contentFingerprint !== next.contentFingerprint ||
    previous.languageHint !== next.languageHint ||
    previous.classification.role !== next.classification.role ||
    previous.classification.provenance !== next.classification.provenance ||
    previous.classification.contentKind !== next.classification.contentKind ||
    previous.sensitivity !== next.sensitivity
  );
}

export function detectWorktreeChanges(
  previous: StoredWorktreeState | null,
  next: StoredWorktreeState,
): WorktreeChangeSet {
  const before = new Map(previous?.files.map((file) => [file.path, file]));
  const after = new Map(next.files.map((file) => [file.path, file]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const added: SourceFile[] = [];
  const modified: SourceFile[] = [];
  const deleted: WorktreeChangeSet['deleted'][number][] = [];
  for (const path of paths) {
    const oldFile = before.get(path);
    const newFile = after.get(path);
    if (oldFile === undefined && newFile !== undefined) added.push(newFile);
    else if (oldFile !== undefined && newFile === undefined)
      deleted.push({
        id: oldFile.id,
        path: oldFile.path,
        previousContentFingerprint: oldFile.contentFingerprint,
      });
    else if (oldFile !== undefined && newFile !== undefined && differs(oldFile, newFile))
      modified.push(newFile);
  }
  return {
    baseRevisionId: previous?.revision.id ?? null,
    baseContentFingerprint: previous?.revision.contentFingerprint ?? null,
    added,
    modified,
    deleted,
  };
}
