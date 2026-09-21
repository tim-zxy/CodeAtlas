export type MigrationDatabaseKind = 'REPOSITORY' | 'WORKSPACE';

export interface MigrationManifestEntryV1 {
  readonly version: number;
  readonly name: string;
  readonly file: string;
  readonly checksum: `sha256:${string}`;
  readonly backupRequired: boolean;
}

export interface MigrationManifestV1 {
  readonly schemaVersion: 1;
  readonly databaseKind: MigrationDatabaseKind;
  readonly migrations: readonly MigrationManifestEntryV1[];
}

export interface RunMigrationsRequest {
  readonly databasePath: string;
  readonly databaseKind: MigrationDatabaseKind;
  readonly manifestUrl: URL;
  readonly lockTimeoutMs?: number;
}

export interface MigrationRunResult {
  readonly databaseKind: MigrationDatabaseKind;
  readonly initialVersion: number;
  readonly finalVersion: number;
  readonly appliedVersions: readonly number[];
}
