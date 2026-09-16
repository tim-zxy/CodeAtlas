import { z } from 'zod';

import { ProviderFactIdSchema } from './code-fact-identity.js';
import { CanonicalIdSchema } from './ids.js';
import { ProviderIdSchema } from './source-identity.js';

export const FactTypeSchema = z.enum(['NODE', 'EDGE']);
export type FactType = z.infer<typeof FactTypeSchema>;

export const ProviderFactRefSchema = z.strictObject({
  factType: FactTypeSchema,
  providerId: ProviderIdSchema,
  providerFactId: ProviderFactIdSchema,
});
export type ProviderFactRef = z.infer<typeof ProviderFactRefSchema>;

export const CanonicalFactRefSchema = z.strictObject({
  factType: FactTypeSchema,
  id: CanonicalIdSchema,
});
export type CanonicalFactRef = z.infer<typeof CanonicalFactRefSchema>;

export const ProviderNodeRefSchema = ProviderFactRefSchema.extend({ factType: z.literal('NODE') });
export type ProviderNodeRef = z.infer<typeof ProviderNodeRefSchema>;

export const CanonicalNodeRefSchema = CanonicalFactRefSchema.extend({
  factType: z.literal('NODE'),
});
export type CanonicalNodeRef = z.infer<typeof CanonicalNodeRefSchema>;
