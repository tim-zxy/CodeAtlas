import { DatabaseSync, constants } from 'node:sqlite';
import { StorageMigrationError } from './errors.js';
import { loadMigrationPlan, type LoadedMigrationPlan } from './manifest.js';
import type { MigrationRunResult, RunMigrationsRequest } from './types.js';

export interface MigrationApplicationHooks {
  readonly beforeAcquire?: (context: {
    readonly selectedVersion: number;
    readonly observedVersion: number;
  }) => void;
}

function invalidRequest(message: string): never {
  throw new StorageMigrationError('MIGRATION_MANIFEST_INVALID', message);
}

function validateRunRequest(request: RunMigrationsRequest): RunMigrationsRequest {
  if (request === null || typeof request !== 'object')
    invalidRequest('Migration request must be an object');
  if (
    typeof request.databasePath !== 'string' ||
    request.databasePath.length === 0 ||
    request.databasePath.trim() !== request.databasePath ||
    request.databasePath.includes('\0')
  )
    invalidRequest('Database path must be a non-empty unpadded string');
  if (request.databaseKind !== 'REPOSITORY' && request.databaseKind !== 'WORKSPACE') {
    invalidRequest('Database kind must be REPOSITORY or WORKSPACE');
  }
  if (!(request.manifestUrl instanceof URL) || request.manifestUrl.protocol !== 'file:') {
    invalidRequest('Manifest location must be a file URL');
  }
  if (
    request.lockTimeoutMs !== undefined &&
    (!Number.isSafeInteger(request.lockTimeoutMs) || request.lockTimeoutMs < 0)
  )
    invalidRequest('Lock timeout must be a safe non-negative integer');
  return request;
}

function readVersion(database: DatabaseSync): number {
  const value: unknown = database.prepare('PRAGMA user_version').get()?.user_version;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new StorageMigrationError('DATABASE_VERSION_INVALID', 'Database user_version is invalid');
  }
  return value as number;
}

function assertVersionWithinPlan(version: number, plan: LoadedMigrationPlan): void {
  if (version > plan.latestVersion) {
    throw new StorageMigrationError(
      'DATABASE_TOO_NEW',
      'Database version is newer than the migration plan',
      {
        details: { databaseVersion: version, latestVersion: plan.latestVersion },
      },
    );
  }
}

function isLockError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /database is locked|database is busy|SQLITE_BUSY|SQLITE_LOCKED/i.test(error.message)
  );
}

function executeMigrationSql(database: DatabaseSync, sql: string): void {
  database.setAuthorizer((actionCode, argument1) => {
    if (actionCode === constants.SQLITE_TRANSACTION) return constants.SQLITE_DENY;
    if (actionCode === constants.SQLITE_PRAGMA && argument1?.toLowerCase() === 'user_version') {
      return constants.SQLITE_DENY;
    }
    return constants.SQLITE_OK;
  });
  try {
    database.exec(sql);
  } finally {
    database.setAuthorizer(null);
  }
}

export function applyMigrationPlan(
  database: DatabaseSync,
  plan: LoadedMigrationPlan,
  hooks: MigrationApplicationHooks = {},
): MigrationRunResult {
  const initialVersion = readVersion(database);
  assertVersionWithinPlan(initialVersion, plan);
  const pending = plan.migrations.slice(initialVersion);
  if (pending.some((migration) => migration.backupRequired)) {
    throw new StorageMigrationError(
      'MIGRATION_BACKUP_REQUIRED',
      'Pending migration requires backup orchestration',
    );
  }
  const appliedVersions: number[] = [];
  let observedVersion = initialVersion;
  while (observedVersion < plan.latestVersion) {
    const selectedVersion = observedVersion + 1;
    const migration = plan.migrations[selectedVersion - 1];
    if (migration === undefined) {
      throw new StorageMigrationError(
        'MIGRATION_MANIFEST_INVALID',
        'Migration plan is missing a declared version',
      );
    }
    hooks.beforeAcquire?.({ selectedVersion, observedVersion });
    try {
      database.exec('BEGIN IMMEDIATE');
    } catch (cause) {
      if (isLockError(cause)) {
        throw new StorageMigrationError(
          'MIGRATION_LOCKED',
          'Could not acquire migration write lock',
          { cause },
        );
      }
      throw new StorageMigrationError('MIGRATION_FAILED', 'Could not begin migration transaction', {
        cause,
      });
    }
    try {
      const lockedVersion = readVersion(database);
      assertVersionWithinPlan(lockedVersion, plan);
      if (lockedVersion !== observedVersion) {
        if (lockedVersion < observedVersion || lockedVersion > selectedVersion) {
          throw new StorageMigrationError(
            'MIGRATION_VERSION_CHANGED',
            'Database version changed unexpectedly under migration lock',
          );
        }
        database.exec('ROLLBACK');
        observedVersion = lockedVersion;
        continue;
      }
      executeMigrationSql(database, migration.sql);
      if (!database.isTransaction) {
        throw new StorageMigrationError(
          'MIGRATION_TRANSACTION_ESCAPED',
          'Migration SQL escaped its transaction',
        );
      }
      database.exec(`PRAGMA user_version = ${selectedVersion}`);
      if (readVersion(database) !== selectedVersion) {
        throw new StorageMigrationError(
          'MIGRATION_FAILED',
          'Migration version did not persist inside transaction',
        );
      }
      database.exec('COMMIT');
      appliedVersions.push(selectedVersion);
      observedVersion = selectedVersion;
    } catch (cause) {
      if (database.isTransaction) {
        try {
          database.exec('ROLLBACK');
        } catch {
          /* preserve original error */
        }
      }
      if (cause instanceof StorageMigrationError) throw cause;
      throw new StorageMigrationError('MIGRATION_FAILED', `Migration ${selectedVersion} failed`, {
        cause,
      });
    }
  }
  return Object.freeze({
    databaseKind: plan.databaseKind,
    initialVersion,
    finalVersion: observedVersion,
    appliedVersions: Object.freeze([...appliedVersions]),
  });
}

export async function runMigrations(request: RunMigrationsRequest): Promise<MigrationRunResult> {
  const validated = validateRunRequest(request);
  const plan = await loadMigrationPlan(validated.manifestUrl, validated.databaseKind);
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(validated.databasePath, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
      timeout: validated.lockTimeoutMs,
    });
  } catch (cause) {
    throw new StorageMigrationError('MIGRATION_FAILED', 'Could not open migration database', {
      cause,
    });
  }
  try {
    return applyMigrationPlan(database, plan);
  } finally {
    database.close();
  }
}
