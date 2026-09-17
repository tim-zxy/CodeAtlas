import { z } from 'zod';

export const EvidenceIdSchema = z
  .string()
  .refine((value) => value.length > 0 && value.trim().length > 0 && value === value.trim(), {
    message: 'Evidence ID must be exact and non-blank',
  })
  .brand<'EvidenceId'>();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;
