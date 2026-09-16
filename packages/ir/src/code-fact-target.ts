import { z } from 'zod';

import { UnresolvedTargetHintSchema } from './code-fact-identity.js';
import { CanonicalNodeRefSchema, ProviderNodeRefSchema } from './code-fact-reference.js';

export const TargetStateSchema = z.enum(['RESOLVED', 'UNRESOLVED']);
export type TargetState = z.infer<typeof TargetStateSchema>;

export const ResolvedTargetResolutionSchema = z.enum(['EXACT', 'HEURISTIC']);
export type ResolvedTargetResolution = z.infer<typeof ResolvedTargetResolutionSchema>;

export const UnresolvedTargetResolutionSchema = z.enum(['AMBIGUOUS', 'UNRESOLVED', 'UNSUPPORTED']);
export type UnresolvedTargetResolution = z.infer<typeof UnresolvedTargetResolutionSchema>;

export const ProviderResolvedTargetSchema = z.strictObject({
  state: z.literal('RESOLVED'),
  resolution: ResolvedTargetResolutionSchema,
  target: ProviderNodeRefSchema,
});
export type ProviderResolvedTarget = z.infer<typeof ProviderResolvedTargetSchema>;

export const CanonicalResolvedTargetSchema = z.strictObject({
  state: z.literal('RESOLVED'),
  resolution: ResolvedTargetResolutionSchema,
  target: CanonicalNodeRefSchema,
});
export type CanonicalResolvedTarget = z.infer<typeof CanonicalResolvedTargetSchema>;

function nonResolvedTargetSchema<TRefSchema extends z.ZodType>(
  refSchema: TRefSchema,
  identity: (value: z.output<TRefSchema>) => string,
) {
  return z
    .strictObject({
      state: z.literal('UNRESOLVED'),
      resolution: UnresolvedTargetResolutionSchema,
      originalHint: UnresolvedTargetHintSchema,
      candidates: z.array(refSchema),
    })
    .superRefine((value, context) => {
      if (value.resolution === 'AMBIGUOUS' && value.candidates.length < 2) {
        context.addIssue({
          code: 'custom',
          path: ['candidates'],
          message: 'Ambiguous targets require at least two candidates',
        });
        return;
      }
      if (value.resolution === 'UNSUPPORTED' && value.candidates.length !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['candidates'],
          message: 'Unsupported targets cannot contain candidates',
        });
        return;
      }

      const seen = new Set<string>();
      value.candidates.forEach((candidate, index) => {
        const key = identity(candidate);
        if (seen.has(key)) {
          context.addIssue({
            code: 'custom',
            path: ['candidates', index],
            message: 'Target candidates must be unique',
          });
        } else {
          seen.add(key);
        }
      });
    });
}

export const ProviderNonResolvedTargetSchema = nonResolvedTargetSchema(
  ProviderNodeRefSchema,
  ({ providerId, providerFactId }) => `${providerId}\u0000${providerFactId}`,
);
export type ProviderNonResolvedTarget = z.infer<typeof ProviderNonResolvedTargetSchema>;

export const CanonicalNonResolvedTargetSchema = nonResolvedTargetSchema(
  CanonicalNodeRefSchema,
  ({ id }) => id,
);
export type CanonicalNonResolvedTarget = z.infer<typeof CanonicalNonResolvedTargetSchema>;

export const ProviderTargetSchema = z.discriminatedUnion('state', [
  ProviderResolvedTargetSchema,
  ProviderNonResolvedTargetSchema,
]);
export type ProviderTarget = z.infer<typeof ProviderTargetSchema>;

export const CanonicalTargetSchema = z.discriminatedUnion('state', [
  CanonicalResolvedTargetSchema,
  CanonicalNonResolvedTargetSchema,
]);
export type CanonicalTarget = z.infer<typeof CanonicalTargetSchema>;
