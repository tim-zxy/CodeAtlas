import { z } from 'zod';

import { EntityIdSchema } from './ids.js';
import { ContentFingerprintSchema, RepositoryRelativePathSchema } from './source-identity.js';

export const SourceFileRoleSchema = z.enum(['SOURCE', 'TEST', 'OTHER']);
export type SourceFileRole = z.infer<typeof SourceFileRoleSchema>;

export const SourceFileProvenanceSchema = z.enum(['AUTHORED', 'GENERATED', 'VENDOR']);
export type SourceFileProvenance = z.infer<typeof SourceFileProvenanceSchema>;

export const SourceContentKindSchema = z.enum(['TEXT', 'BINARY']);
export type SourceContentKind = z.infer<typeof SourceContentKindSchema>;

export const SourceSensitivitySchema = z.enum(['PUBLIC', 'INTERNAL', 'SENSITIVE', 'SECRET']);
export type SourceSensitivity = z.infer<typeof SourceSensitivitySchema>;

export const SourceFileClassificationSchema = z.strictObject({
  role: SourceFileRoleSchema,
  provenance: SourceFileProvenanceSchema,
  contentKind: SourceContentKindSchema,
});
export type SourceFileClassification = z.infer<typeof SourceFileClassificationSchema>;

export const LanguageHintSchema = z
  .string()
  .refine((value) => value.length > 0 && value.trim().length > 0 && value === value.trim(), {
    message: 'Language hint must be exact and non-blank',
  });
export type LanguageHint = z.infer<typeof LanguageHintSchema>;

export const SourceFileSchema = z.strictObject({
  id: EntityIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  path: RepositoryRelativePathSchema,
  contentFingerprint: ContentFingerprintSchema,
  classification: SourceFileClassificationSchema,
  languageHint: LanguageHintSchema.nullable(),
  sensitivity: SourceSensitivitySchema,
});
export type SourceFile = z.infer<typeof SourceFileSchema>;
