export type StorageMigrationErrorCode =
  | 'MIGRATION_MANIFEST_INVALID'
  | 'MIGRATION_DATABASE_KIND_MISMATCH'
  | 'MIGRATION_FILE_INVALID'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'MIGRATION_BACKUP_REQUIRED'
  | 'DATABASE_VERSION_INVALID'
  | 'DATABASE_TOO_NEW'
  | 'MIGRATION_LOCKED'
  | 'MIGRATION_VERSION_CHANGED'
  | 'MIGRATION_TRANSACTION_ESCAPED'
  | 'MIGRATION_FAILED';

export class StorageMigrationError extends Error {
  readonly code: StorageMigrationErrorCode;
  readonly details: Readonly<Record<string, string | number | boolean>>;

  constructor(
    code: StorageMigrationErrorCode,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, string | number | boolean>>;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'StorageMigrationError';
    this.code = code;
    this.details = Object.freeze({ ...(options.details ?? {}) });
    Object.freeze(this);
  }
}
