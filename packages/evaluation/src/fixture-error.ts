export type FixtureRegistryErrorCode =
  'ROOT_INVALID' | 'MANIFEST_INVALID' | 'ARTIFACT_INVALID' | 'DUPLICATE_ID';

export class FixtureRegistryError extends Error {
  constructor(
    readonly code: FixtureRegistryErrorCode,
    readonly manifestPath: string,
    readonly fieldPath: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`${manifestPath}${fieldPath ? `: ${fieldPath}` : ''}: ${reason}`, options);
    this.name = 'FixtureRegistryError';
  }
}
