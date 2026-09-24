export { SourceScanError } from './errors.js';
export { observeGitWorktree } from './fingerprint.js';
export { scanGitRepository } from './scan.js';
export type { SourceScanErrorCode } from './errors.js';
export type {
  GitContext,
  ObservedFile,
  ObservedWorktree,
  ScannedFile,
  SourceScanRequest,
  SourceScanResult,
} from './types.js';
