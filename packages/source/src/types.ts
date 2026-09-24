import type {
  CommitIdentity,
  ContentFingerprint,
  EntityId,
  RepositoryRelativePath,
  SourceFileClassification,
} from '@codeatlas/ir';

export interface GitContext {
  readonly rootPath: string;
  readonly branchName: string | null;
  readonly headCommit: CommitIdentity | null;
  readonly workspacePosition:
    | { readonly kind: 'ROOT' }
    | { readonly kind: 'CHILD'; readonly path: RepositoryRelativePath }
    | { readonly kind: 'EXTERNAL' };
}

export interface SourceScanRequest {
  readonly repositoryId: EntityId;
  readonly startingPath: string;
  readonly workspaceRoot: string;
  readonly config: Readonly<{ include: readonly string[]; exclude: readonly string[] }>;
}

export interface ScannedFile {
  readonly path: RepositoryRelativePath;
  readonly languageHint: string | null;
  readonly classification: SourceFileClassification;
}

export interface SourceScanResult extends GitContext {
  readonly repositoryId: EntityId;
  readonly files: readonly ScannedFile[];
}

export interface ObservedFile extends ScannedFile {
  readonly contentFingerprint: ContentFingerprint;
  readonly sizeBytes: number;
}

export interface ObservedWorktree extends Omit<SourceScanResult, 'files'> {
  readonly files: readonly ObservedFile[];
  readonly contentFingerprint: ContentFingerprint;
}
