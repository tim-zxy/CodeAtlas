import { IrValidationError, parseIr } from '@codeatlas/ir';
import { z } from 'zod';

import { PluginDescriptorSchema } from './plugin-spi.js';

const ExactStringSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), 'Value must be exact and non-blank');

export const PluginRegistrationSchema = z.strictObject({
  descriptor: PluginDescriptorSchema,
  priority: z.number().int().safe(),
});
export type PluginRegistration = z.infer<typeof PluginRegistrationSchema>;

export const PluginRouteRequestSchema = z.strictObject({
  languageId: ExactStringSchema,
  frameworkId: ExactStringSchema,
  providerCapabilities: z.array(ExactStringSchema),
});
export type PluginRouteRequest = z.infer<typeof PluginRouteRequestSchema>;

export function selectPluginCandidates(
  registrations: readonly PluginRegistration[],
  request: PluginRouteRequest,
): readonly PluginRegistration[] {
  const validated = parseIr(z.array(PluginRegistrationSchema), registrations);
  const wanted = parseIr(PluginRouteRequestSchema, request);
  const seen = new Set<string>();
  for (const [index, registration] of validated.entries()) {
    const id = registration.descriptor.pluginId;
    if (seen.has(id)) {
      throw new IrValidationError([
        {
          path: ['registrations', index, 'descriptor', 'pluginId'],
          message: 'Duplicate plugin ID',
        },
      ]);
    }
    seen.add(id);
  }

  return validated
    .filter(
      ({ descriptor }) =>
        descriptor.languages.includes(wanted.languageId) &&
        descriptor.frameworks.includes(wanted.frameworkId) &&
        descriptor.requiredProviderCapabilities.every((capability) =>
          wanted.providerCapabilities.includes(capability),
        ),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.descriptor.pluginId < b.descriptor.pluginId
          ? -1
          : a.descriptor.pluginId > b.descriptor.pluginId
            ? 1
            : 0),
    );
}
