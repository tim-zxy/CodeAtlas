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

function nonResolvedTargetSchema<TRefSchema extends z.ZodType, TSeen>(
  refSchema: TRefSchema,
  createSeen: () => TSeen,
  isDuplicateAndRecord: (seen: TSeen, value: z.output<TRefSchema>) => boolean,
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

      const seen = createSeen();
      value.candidates.forEach((candidate, index) => {
        if (isDuplicateAndRecord(seen, candidate)) {
          context.addIssue({
            code: 'custom',
            path: ['candidates', index],
            message: 'Target candidates must be unique',
          });
        }
      });
    });
}

export const ProviderNonResolvedTargetSchema = nonResolvedTargetSchema(
  ProviderNodeRefSchema,
  () => new Map<string, Set<string>>(),
  (seen, { providerId, providerFactId }) => {
    const providerFactIds = seen.get(providerId);
    if (providerFactIds?.has(providerFactId)) {
      return true;
    }
    if (providerFactIds) {
      providerFactIds.add(providerFactId);
    } else {
      seen.set(providerId, new Set([providerFactId]));
    }
    return false;
  },
);
export type ProviderNonResolvedTarget = z.infer<typeof ProviderNonResolvedTargetSchema>;

export const CanonicalNonResolvedTargetSchema = nonResolvedTargetSchema(
  CanonicalNodeRefSchema,
  () => new Set<string>(),
  (seen, { id }) => {
    if (seen.has(id)) {
      return true;
    }
    seen.add(id);
    return false;
  },
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
