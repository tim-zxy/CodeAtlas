import { z } from 'zod';

import { IrValidationError } from './errors.js';
import { EntityIdSchema } from './ids.js';
import { CommitIdentitySchema, ContentFingerprintSchema } from './source-identity.js';
import { parseIr } from './validation.js';

const RevisionBaseShape = {
  id: EntityIdSchema,
  repositoryId: EntityIdSchema,
  contentFingerprint: ContentFingerprintSchema,
};

export const RevisionKindSchema = z.enum(['COMMIT', 'WORKTREE', 'SNAPSHOT']);
export type RevisionKind = z.infer<typeof RevisionKindSchema>;

export const CommitRevisionSchema = z.strictObject({
  ...RevisionBaseShape,
  kind: z.literal('COMMIT'),
  commitIdentity: CommitIdentitySchema,
});
export type CommitRevision = z.infer<typeof CommitRevisionSchema>;

export const WorktreeRevisionSchema = z.strictObject({
  ...RevisionBaseShape,
  kind: z.literal('WORKTREE'),
  baseRevisionId: EntityIdSchema.nullable(),
});
export type WorktreeRevision = z.infer<typeof WorktreeRevisionSchema>;

export const SnapshotRevisionSchema = z.strictObject({
  ...RevisionBaseShape,
  kind: z.literal('SNAPSHOT'),
  sourceRevisionId: EntityIdSchema.nullable(),
});
export type SnapshotRevision = z.infer<typeof SnapshotRevisionSchema>;

export const RevisionSchema = z.discriminatedUnion('kind', [
  CommitRevisionSchema,
  WorktreeRevisionSchema,
  SnapshotRevisionSchema,
]);
export type Revision = z.infer<typeof RevisionSchema>;

function transitionError(field: string, message: string): never {
  throw new IrValidationError([{ path: ['next', field], message }]);
}

export function validateRevisionTransition(previous: unknown, next: unknown): Revision {
  const validatedPrevious = parseIr(RevisionSchema, previous);
  const validatedNext = parseIr(RevisionSchema, next);

  if (validatedPrevious.repositoryId !== validatedNext.repositoryId) {
    return transitionError('repositoryId', 'Revision repository ID cannot change');
  }

  if (validatedPrevious.id !== validatedNext.id) {
    return transitionError('id', 'Revision ID cannot change');
  }

  if (validatedPrevious.kind !== validatedNext.kind) {
    return transitionError('kind', 'Revision kind cannot change');
  }

  if (validatedNext.kind === 'WORKTREE') {
    return validatedNext;
  }

  if (validatedPrevious.kind === 'COMMIT' && validatedNext.kind === 'COMMIT') {
    if (validatedPrevious.commitIdentity !== validatedNext.commitIdentity) {
      return transitionError('commitIdentity', 'Commit identity cannot change');
    }

    if (validatedPrevious.contentFingerprint !== validatedNext.contentFingerprint) {
      return transitionError('contentFingerprint', 'Commit content fingerprint cannot change');
    }

    return validatedNext;
  }

  if (validatedPrevious.kind === 'SNAPSHOT' && validatedNext.kind === 'SNAPSHOT') {
    if (validatedPrevious.sourceRevisionId !== validatedNext.sourceRevisionId) {
      return transitionError('sourceRevisionId', 'Snapshot source revision ID cannot change');
    }

    if (validatedPrevious.contentFingerprint !== validatedNext.contentFingerprint) {
      return transitionError('contentFingerprint', 'Snapshot content fingerprint cannot change');
    }

    return validatedNext;
  }

  return validatedNext;
}
