import { z } from 'zod';

const OpaqueIdStringSchema = z
  .string()
  .refine((value) => value.length !== 0 && value.trim().length !== 0 && value === value.trim(), {
    message: 'Opaque IDs must be non-blank and must not have surrounding whitespace',
  });

export const EntityIdSchema = OpaqueIdStringSchema.brand<'EntityId'>();
export type EntityId = z.infer<typeof EntityIdSchema>;

export const CanonicalIdSchema = OpaqueIdStringSchema.brand<'CanonicalId'>();
export type CanonicalId = z.infer<typeof CanonicalIdSchema>;
