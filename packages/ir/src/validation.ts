import { z } from 'zod';

import { IrValidationError } from './errors.js';

function validationMessage(code: z.core.$ZodIssue['code']): string {
  switch (code) {
    case 'invalid_type':
      return 'Value has an invalid type';
    case 'unrecognized_keys':
      return 'Object contains unknown keys';
    case 'too_small':
    case 'too_big':
      return 'Value is outside the allowed bounds';
    case 'invalid_format':
      return 'Value has an invalid format';
    default:
      return 'Value does not satisfy the IR schema';
  }
}

export function parseIr<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new IrValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map((segment) =>
          typeof segment === 'symbol' ? (segment.description ?? segment.toString()) : segment,
        ),
        message: validationMessage(issue.code),
      })),
    );
  }

  return result.data;
}
