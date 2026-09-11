import { z } from 'zod';

import { IrValidationError } from './errors.js';

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
        message: issue.message,
      })),
    );
  }

  return result.data;
}
