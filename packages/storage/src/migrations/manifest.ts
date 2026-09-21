import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StorageMigrationError } from './errors.js';
import type {
  MigrationDatabaseKind,
  MigrationManifestEntryV1,
  MigrationManifestV1,
} from './types.js';

export interface LoadedMigration extends MigrationManifestEntryV1 {
  readonly sql: string;
}

export interface LoadedMigrationPlan {
  readonly schemaVersion: 1;
  readonly databaseKind: MigrationDatabaseKind;
  readonly latestVersion: number;
  readonly migrations: readonly LoadedMigration[];
}

function failManifest(message: string): never {
  throw new StorageMigrationError('MIGRATION_MANIFEST_INVALID', message);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function hasExactKeys(input: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(input).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validFilePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[a-zA-Z]:/.test(value)
  ) {
    return false;
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function parseEntry(value: unknown, expectedVersion: number): MigrationManifestEntryV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['backupRequired', 'checksum', 'file', 'name', 'version'])
  ) {
    failManifest(
      `Migration ${expectedVersion} must have exact version, name, file, checksum, and backupRequired fields`,
    );
  }
  if (!Number.isSafeInteger(value.version) || value.version !== expectedVersion) {
    failManifest(`Migration versions must be contiguous from 1; expected ${expectedVersion}`);
  }
  if (
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    value.name.trim() !== value.name
  ) {
    failManifest(`Migration ${expectedVersion} name must be a non-empty trimmed string`);
  }
  if (!validFilePath(value.file)) {
    failManifest(`Migration ${expectedVersion} file must be a safe relative POSIX path`);
  }
  if (typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.checksum)) {
    failManifest(`Migration ${expectedVersion} checksum must be lowercase sha256`);
  }
  if (typeof value.backupRequired !== 'boolean') {
    failManifest(`Migration ${expectedVersion} backupRequired must be boolean`);
  }
  return Object.freeze({
    version: expectedVersion,
    name: value.name,
    file: value.file,
    checksum: value.checksum as `sha256:${string}`,
    backupRequired: value.backupRequired,
  });
}

function parseManifest(value: unknown, expectedKind: MigrationDatabaseKind): MigrationManifestV1 {
  if (!isRecord(value) || !hasExactKeys(value, ['databaseKind', 'migrations', 'schemaVersion'])) {
    failManifest('Manifest must have exact schemaVersion, databaseKind, and migrations fields');
  }
  if (value.schemaVersion !== 1) failManifest('Manifest schemaVersion must be 1');
  if (value.databaseKind !== 'REPOSITORY' && value.databaseKind !== 'WORKSPACE') {
    failManifest('Manifest databaseKind must be REPOSITORY or WORKSPACE');
  }
  if (value.databaseKind !== expectedKind) {
    throw new StorageMigrationError(
      'MIGRATION_DATABASE_KIND_MISMATCH',
      'Migration manifest database kind does not match request',
    );
  }
  if (!Array.isArray(value.migrations)) failManifest('Manifest migrations must be an array');
  const entries = value.migrations.map((entry, index) => parseEntry(entry, index + 1));
  const names = new Set(entries.map((entry) => entry.name));
  const files = new Set(entries.map((entry) => entry.file));
  if (names.size !== entries.length || files.size !== entries.length) {
    failManifest('Migration names and files must be unique');
  }
  return Object.freeze({
    schemaVersion: 1,
    databaseKind: value.databaseKind,
    migrations: Object.freeze(entries),
  });
}

function decodeSql(bytes: Uint8Array, version: number): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    throw new StorageMigrationError(
      'MIGRATION_FILE_INVALID',
      `Migration ${version} is not valid UTF-8`,
      { cause },
    );
  }
  if (text.charCodeAt(0) === 0xfeff) {
    throw new StorageMigrationError(
      'MIGRATION_FILE_INVALID',
      `Migration ${version} must not contain a BOM`,
    );
  }
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export async function loadMigrationPlan(
  manifestUrl: URL,
  expectedKind: MigrationDatabaseKind,
): Promise<LoadedMigrationPlan> {
  if (!(manifestUrl instanceof URL) || manifestUrl.protocol !== 'file:') {
    failManifest('Manifest location must be a file URL');
  }
  if (expectedKind !== 'REPOSITORY' && expectedKind !== 'WORKSPACE') {
    failManifest('Expected database kind must be REPOSITORY or WORKSPACE');
  }
  let manifest: MigrationManifestV1;
  try {
    const bytes = await readFile(manifestUrl);
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (content.charCodeAt(0) === 0xfeff) failManifest('Manifest must not contain a BOM');
    manifest = parseManifest(JSON.parse(content) as unknown, expectedKind);
  } catch (error) {
    if (error instanceof StorageMigrationError) throw error;
    throw new StorageMigrationError(
      'MIGRATION_MANIFEST_INVALID',
      'Unable to read or parse migration manifest',
      { cause: error },
    );
  }

  const manifestDirectory = dirname(fileURLToPath(manifestUrl));
  const realDirectory = await realpath(manifestDirectory);
  const loaded: LoadedMigration[] = [];
  for (const entry of manifest.migrations) {
    const candidate = resolve(manifestDirectory, ...entry.file.split('/'));
    if (isAbsolute(entry.file)) failManifest('Migration file must be relative');
    let bytes: Uint8Array;
    try {
      const realFile = await realpath(candidate);
      const pathFromDirectory = relative(realDirectory, realFile);
      if (
        pathFromDirectory === '' ||
        pathFromDirectory === '..' ||
        pathFromDirectory.startsWith(`..${sep}`) ||
        isAbsolute(pathFromDirectory)
      ) {
        throw new Error('Migration file escapes manifest directory');
      }
      bytes = await readFile(realFile);
    } catch (cause) {
      throw new StorageMigrationError(
        'MIGRATION_FILE_INVALID',
        `Unable to read migration ${entry.version}`,
        { cause },
      );
    }
    const sql = decodeSql(bytes, entry.version);
    const actual = createHash('sha256').update(sql, 'utf8').digest();
    const expected = Buffer.from(entry.checksum.slice('sha256:'.length), 'hex');
    if (!timingSafeEqual(actual, expected)) {
      throw new StorageMigrationError(
        'MIGRATION_CHECKSUM_MISMATCH',
        `Migration ${entry.version} checksum mismatch`,
        {
          details: { version: entry.version },
        },
      );
    }
    loaded.push(Object.freeze({ ...entry, sql }));
  }
  return Object.freeze({
    schemaVersion: 1,
    databaseKind: manifest.databaseKind,
    latestVersion: loaded.length,
    migrations: Object.freeze(loaded),
  });
}
