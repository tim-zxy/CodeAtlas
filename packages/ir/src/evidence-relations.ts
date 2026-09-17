import { z } from 'zod';

import { CanonicalFactRefSchema, ProviderFactRefSchema } from './code-fact-reference.js';
import { EvidenceIdSchema } from './evidence-identity.js';
import { EntityIdSchema } from './ids.js';

export const FactEvidenceSchema = z.strictObject({
  fact: CanonicalFactRefSchema,
  evidenceId: EvidenceIdSchema,
});
export type FactEvidence = z.infer<typeof FactEvidenceSchema>;

export const ProviderFactBindingSchema = z
  .strictObject({
    providerFact: ProviderFactRefSchema,
    providerSnapshotId: EntityIdSchema,
    canonicalFact: CanonicalFactRefSchema,
    evidenceId: EvidenceIdSchema,
  })
  .superRefine((binding, context) => {
    if (binding.providerFact.factType !== binding.canonicalFact.factType) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalFact', 'factType'],
        message: 'Provider and Canonical fact types must match',
      });
    }
  });
export type ProviderFactBinding = z.infer<typeof ProviderFactBindingSchema>;
