import { z } from 'zod';
import { EntityIdSchema } from '@codeatlas/ir';
/** Actual schema11 publication lineage, never an offline attempt or quality permit. */
export const receiptSourceProvenanceSchema = z.strictObject({
  kind: z.literal('SCHEMA11_RECEIPT'),
  version: z.literal(1),
  publicationId: EntityIdSchema,
  candidateId: EntityIdSchema,
  runId: EntityIdSchema,
  snapshotId: EntityIdSchema,
  revisionSetId: EntityIdSchema,
  evaluationId: EntityIdSchema,
});
