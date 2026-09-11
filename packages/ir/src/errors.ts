export type IrErrorCode = 'IR_VALIDATION_FAILED' | 'SCHEMA_MISMATCH' | 'UNSUPPORTED_SCHEMA_VERSION';

export abstract class IrContractError extends Error {
  abstract readonly code: IrErrorCode;
}

export interface IrValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class IrValidationError extends IrContractError {
  readonly code = 'IR_VALIDATION_FAILED' as const;
  readonly issues: readonly IrValidationIssue[];

  constructor(issues: readonly IrValidationIssue[]) {
    super('IR validation failed');
    this.name = 'IrValidationError';
    this.issues = Object.freeze(
      issues.map(({ path, message }) =>
        Object.freeze({
          path: Object.freeze([...path]),
          message,
        }),
      ),
    );
  }
}

export class SchemaMismatchError extends IrContractError {
  readonly code = 'SCHEMA_MISMATCH' as const;

  constructor(
    readonly expectedSchema: string,
    readonly actualSchema: string,
  ) {
    super(`Expected schema ${expectedSchema}, received ${actualSchema}`);
    this.name = 'SchemaMismatchError';
  }
}

export class UnsupportedSchemaVersionError extends IrContractError {
  readonly code = 'UNSUPPORTED_SCHEMA_VERSION' as const;

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`Expected schema version ${expectedVersion}, received ${actualVersion}`);
    this.name = 'UnsupportedSchemaVersionError';
  }
}
