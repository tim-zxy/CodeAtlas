import { z } from 'zod';

import { ProviderFactRefSchema } from './code-fact-reference.js';
import { EvidenceIdSchema } from './evidence-identity.js';
import { IrValidationError } from './errors.js';
import { EntityIdSchema } from './ids.js';
import { parseIr } from './validation.js';

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

function evidenceTransitionError(path: readonly (string | number)[], message: string): never {
  throw new IrValidationError([{ path: ['next', ...path], message }]);
}

export function validateEvidenceTransition(previous: unknown, next: unknown): Evidence {
  const before = parseIr(EvidenceSchema, previous);
  const after = parseIr(EvidenceSchema, next);

  if (before.id !== after.id) evidenceTransitionError(['id'], 'Evidence ID cannot change');
  if (before.repositoryId !== after.repositoryId)
    evidenceTransitionError(['repositoryId'], 'Evidence repository ID cannot change');
  if (before.revisionId !== after.revisionId)
    evidenceTransitionError(['revisionId'], 'Evidence revision ID cannot change');
  if (before.providerSnapshotId !== after.providerSnapshotId)
    evidenceTransitionError(['providerSnapshotId'], 'Evidence snapshot ID cannot change');
  for (const field of ['factType', 'providerId', 'providerFactId'] as const) {
    if (before.providerFact[field] !== after.providerFact[field])
      evidenceTransitionError(['providerFact', field], 'Evidence Provider Fact cannot change');
  }
  if (before.status !== 'ACTIVE' && before.status !== after.status)
    evidenceTransitionError(['status'], 'Terminal Evidence status cannot change');

  return after;
}
