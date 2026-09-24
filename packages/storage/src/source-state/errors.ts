export type SourceStateErrorCode =
  | 'REPOSITORY_NOT_REGISTERED'
  | 'WORKTREE_AMBIGUOUS'
  | 'SOURCE_STATE_INVALID'
  | 'SOURCE_STATE_CONFLICT'
  | 'SOURCE_STATE_WRITE_FAILED';

export class SourceStateError extends Error {
  readonly code: SourceStateErrorCode;

  constructor(code: SourceStateErrorCode) {
    super(code);
    this.name = 'SourceStateError';
    this.code = code;
  }
}
