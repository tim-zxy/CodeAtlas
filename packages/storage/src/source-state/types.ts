import type { SourceFile, WorktreeRevision } from '@codeatlas/ir';

export interface StoredWorktreeState {
  readonly revision: WorktreeRevision;
  readonly files: readonly SourceFile[];
}
