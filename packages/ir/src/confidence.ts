import { z } from 'zod';

const NonBlankTrimmedStringSchema = z
  .string()
  .refine((value) => value.length !== 0 && value.trim().length !== 0 && value === value.trim(), {
    message: 'Strings must be non-blank and must not have surrounding whitespace',
  });

export const ResolutionLevelSchema = z.enum([
  'EXACT',
  'HEURISTIC',
  'AMBIGUOUS',
  'UNRESOLVED',
  'UNSUPPORTED',
]);
export type ResolutionLevel = z.infer<typeof ResolutionLevelSchema>;

export const ConfidenceSchema = z.strictObject({
  score: z
    .number()
    .finite()
    .min(0)
    .max(1)
    .refine((value) => !Object.is(value, -0), {
      message: 'Confidence must not be negative zero',
    }),
  method: NonBlankTrimmedStringSchema,
  reasons: z.array(NonBlankTrimmedStringSchema),
});
export type Confidence = z.infer<typeof ConfidenceSchema>;
