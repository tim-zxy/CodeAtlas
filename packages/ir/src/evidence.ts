import { z } from 'zod';

import { ProviderFactRefSchema } from './code-fact-reference.js';
import { EvidenceIdSchema } from './evidence-identity.js';
import { EntityIdSchema } from './ids.js';

export const EvidenceStatusSchema = z.enum(['ACTIVE', 'SUPERSEDED', 'INVALIDATED']);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceSchema = z.strictObject({
  id: EvidenceIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  providerSnapshotId: EntityIdSchema,
  providerFact: ProviderFactRefSchema,
  status: EvidenceStatusSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;
