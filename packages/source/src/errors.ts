export type SourceScanErrorCode =
  'NON_GIT_DIRECTORY' | 'INVALID_INPUT' | 'GIT_FAILED' | 'FILE_READ_FAILED' | 'SOURCE_CHANGED';

export class SourceScanError extends Error {
  constructor(
    readonly code: SourceScanErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SourceScanError';
  }
}
