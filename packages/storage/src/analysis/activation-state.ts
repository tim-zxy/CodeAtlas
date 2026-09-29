import type { DatabaseSync } from 'node:sqlite';

import {
  ContentFingerprintSchema,
  EntityIdSchema,
  type ContentFingerprint,
  type EntityId,
} from '@codeatlas/ir';

export interface ActiveAnalysisState {
  readonly revisionId: EntityId | null;
  readonly contentFingerprint: ContentFingerprint | null;
}

export type AnalysisFreshness = 'NOT_INDEXED' | 'UNKNOWN' | 'STALE' | 'CURRENT';

export function readActiveAnalysisState(
  database: DatabaseSync,
  repositoryId: EntityId,
): ActiveAnalysisState {
  const id = EntityIdSchema.parse(repositoryId);
  const row = database
    .prepare(
      'SELECT indexed_revision_id, indexed_content_fingerprint FROM repository_state WHERE repository_id = ?',
    )
    .get(id) as
    { indexed_revision_id: string | null; indexed_content_fingerprint: string | null } | undefined;
  if (row === undefined) throw new Error('Repository state not found');
  return {
    revisionId:
      row.indexed_revision_id === null ? null : EntityIdSchema.parse(row.indexed_revision_id),
    contentFingerprint:
      row.indexed_content_fingerprint === null
        ? null
        : ContentFingerprintSchema.parse(row.indexed_content_fingerprint),
  };
}

export function readAnalysisFreshness(
  database: DatabaseSync,
  repositoryId: EntityId,
): AnalysisFreshness {
  const state = readActiveAnalysisState(database, repositoryId);
  if (state.revisionId === null && state.contentFingerprint === null) return 'NOT_INDEXED';
  if (state.revisionId === null || state.contentFingerprint === null) return 'UNKNOWN';
  const revision = database
    .prepare('SELECT content_fingerprint FROM revisions WHERE repository_id = ? AND id = ?')
    .get(repositoryId, state.revisionId) as { content_fingerprint: string } | undefined;
  if (revision === undefined) return 'UNKNOWN';
  return revision.content_fingerprint === state.contentFingerprint ? 'CURRENT' : 'STALE';
}
