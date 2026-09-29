import { EvidenceIdSchema, type EvidenceId } from '@codeatlas/ir';

import { digestIdentityTuple } from './identity-tuple.js';

export function providerEvidenceId(
  repositoryId: string,
  revisionId: string,
  providerSnapshotId: string,
  factType: 'NODE' | 'EDGE',
  providerId: string,
  providerFactId: string,
): EvidenceId {
  return EvidenceIdSchema.parse(
    digestIdentityTuple('provider-evidence-v1', [
      repositoryId,
      revisionId,
      providerSnapshotId,
      factType,
      providerId,
      providerFactId,
    ]),
  );
}
