export type CanonicalComparatorErrorCode = 'INPUT_INVALID' | 'DUPLICATE_ID' | 'DUPLICATE_FACT_KEY';

export class CanonicalComparatorError extends Error {
  constructor(
    readonly code: CanonicalComparatorErrorCode,
    readonly fieldPath: string,
    reason: string,
  ) {
    super(`${fieldPath}: ${reason}`);
    this.name = 'CanonicalComparatorError';
  }
}
