export { StorageMigrationError } from './errors.js';
export type { StorageMigrationErrorCode } from './errors.js';
export type {
  MigrationDatabaseKind,
  MigrationManifestEntryV1,
  MigrationManifestV1,
  MigrationRunResult,
  RunMigrationsRequest,
} from './types.js';

import { StorageMigrationError } from './errors.js';
import type { MigrationRunResult, RunMigrationsRequest } from './types.js';

export async function runMigrations(_request: RunMigrationsRequest): Promise<MigrationRunResult> {
  throw new StorageMigrationError('MIGRATION_FAILED', 'Migration runner is not implemented');
}
