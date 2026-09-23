import { ProviderIdSchema, ProviderVersionSchema } from '@codeatlas/ir';
import { z } from 'zod';

const ExactStringSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), 'Value must be exact and non-blank');

const UniqueStringsSchema = z
  .array(ExactStringSchema)
  .min(1)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({ code: 'custom', path: [index], message: 'Values must be unique' });
      }
      seen.add(value);
    });
  });

const UniqueVersionsSchema = z
  .array(z.number().int().safe().positive())
  .min(1)
  .superRefine((values, context) => {
    const seen = new Set<number>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({ code: 'custom', path: [index], message: 'Values must be unique' });
      }
      seen.add(value);
    });
  });

export const ProviderDescriptorSchema = z.strictObject({
  providerId: ProviderIdSchema,
  providerVersion: ProviderVersionSchema,
  protocolVersions: UniqueVersionsSchema,
  irSchemaVersions: UniqueVersionsSchema,
  languages: UniqueStringsSchema,
  capabilities: UniqueStringsSchema,
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;
