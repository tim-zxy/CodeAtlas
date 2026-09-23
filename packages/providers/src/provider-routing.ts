import { ProviderIdSchema } from '@codeatlas/ir';
import { z } from 'zod';

import { ProviderDescriptorSchema } from './provider-spi.js';

const ExactStringSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), 'Value must be exact and non-blank');

export const ProviderRoleSchema = z.enum(['PRIMARY', 'SECONDARY', 'SHADOW']);
export type ProviderRole = z.infer<typeof ProviderRoleSchema>;

export const ProviderRegistrationSchema = z.strictObject({
  descriptor: ProviderDescriptorSchema,
  role: ProviderRoleSchema,
  priority: z.number().int().safe(),
});
export type ProviderRegistration = z.infer<typeof ProviderRegistrationSchema>;

export const ProviderRouteRequestSchema = z.strictObject({
  languageId: ExactStringSchema,
  requiredCapabilities: z.array(ExactStringSchema),
});
export type ProviderRouteRequest = z.infer<typeof ProviderRouteRequestSchema>;

const roleRank: Record<ProviderRole, number> = { PRIMARY: 0, SECONDARY: 1, SHADOW: 2 };

export function selectProviderCandidates(
  registrations: readonly ProviderRegistration[],
  request: ProviderRouteRequest,
): readonly ProviderRegistration[] {
  const validated = z.array(ProviderRegistrationSchema).parse(registrations);
  const wanted = ProviderRouteRequestSchema.parse(request);
  const seen = new Set<z.infer<typeof ProviderIdSchema>>();
  for (const registration of validated) {
    const id = registration.descriptor.providerId;
    if (seen.has(id)) throw new Error(`Duplicate provider ID: ${id}`);
    seen.add(id);
  }

  return validated
    .filter(
      ({ descriptor }) =>
        descriptor.languages.includes(wanted.languageId) &&
        wanted.requiredCapabilities.every((capability) =>
          descriptor.capabilities.includes(capability),
        ),
    )
    .sort(
      (a, b) =>
        roleRank[a.role] - roleRank[b.role] ||
        b.priority - a.priority ||
        (a.descriptor.providerId < b.descriptor.providerId
          ? -1
          : a.descriptor.providerId > b.descriptor.providerId
            ? 1
            : 0),
    );
}
