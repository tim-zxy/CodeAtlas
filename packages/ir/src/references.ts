import { z } from 'zod';

import { EntityIdSchema } from './ids.js';

const EntityKindSchema = z
  .string()
  .refine((value) => value.length !== 0 && value.trim().length !== 0 && value === value.trim(), {
    message: 'Entity kinds must be non-blank and must not have surrounding whitespace',
  });

export const EntityRefSchema = z
  .strictObject({
    kind: EntityKindSchema,
    id: EntityIdSchema,
    revisionId: EntityIdSchema.optional(),
  })
  .superRefine((value, context) => {
    if (Object.hasOwn(value, 'revisionId') && value.revisionId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['revisionId'],
        message: 'An absent revision must omit revisionId',
      });
    }
  });
export type EntityRef = z.infer<typeof EntityRefSchema>;

const SourceCoordinateSchema = z
  .number()
  .int()
  .nonnegative()
  .refine((value) => !Object.is(value, -0), { message: 'Coordinates must not be negative zero' })
  .refine(Number.isSafeInteger, { message: 'Source coordinates must be safe integers' });

export const SourceRangeSchema = z
  .strictObject({
    sourceFileId: EntityIdSchema,
    startLine: SourceCoordinateSchema,
    startColumn: SourceCoordinateSchema,
    endLine: SourceCoordinateSchema,
    endColumn: SourceCoordinateSchema,
  })
  .superRefine(({ startLine, startColumn, endLine, endColumn }, context) => {
    if (endLine < startLine) {
      context.addIssue({
        code: 'custom',
        path: ['endLine'],
        message: 'Range end line must not precede its start line',
      });
    } else if (endLine === startLine && endColumn < startColumn) {
      context.addIssue({
        code: 'custom',
        path: ['endColumn'],
        message: 'Range end column must not precede its start column on the same line',
      });
    }
  });
export type SourceRange = z.infer<typeof SourceRangeSchema>;
