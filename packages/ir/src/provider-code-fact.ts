import { z } from 'zod';

import {
  CodeFactNameSchema,
  ProviderFactIdSchema,
  ProviderFactKindSchema,
  QualifiedCodeFactNameSchema,
} from './code-fact-identity.js';
import { ProviderNodeRefSchema } from './code-fact-reference.js';
import { ProviderTargetSchema } from './code-fact-target.js';
import { ConfidenceSchema } from './confidence.js';
import { EntityIdSchema } from './ids.js';
import { SourceRangeSchema } from './references.js';
import { ProviderIdSchema } from './source-identity.js';

const ProviderFactBaseShape = {
  providerId: ProviderIdSchema,
  providerFactId: ProviderFactIdSchema,
  providerSnapshotId: EntityIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  providerKind: ProviderFactKindSchema,
};

export const ProviderNodeSchema = z.strictObject({
  ...ProviderFactBaseShape,
  name: CodeFactNameSchema,
  qualifiedName: QualifiedCodeFactNameSchema.nullable(),
  sourceRange: SourceRangeSchema.nullable(),
  confidence: ConfidenceSchema,
});
export type ProviderNode = z.infer<typeof ProviderNodeSchema>;

const ProviderEdgeObjectSchema = z.strictObject({
  ...ProviderFactBaseShape,
  source: ProviderNodeRefSchema,
  target: ProviderTargetSchema,
  sourceRange: SourceRangeSchema.nullable(),
  confidence: ConfidenceSchema,
});

export const ProviderEdgeSchema = ProviderEdgeObjectSchema.superRefine((value, context) => {
  if (value.source.providerId !== value.providerId) {
    context.addIssue({
      code: 'custom',
      path: ['source', 'providerId'],
      message: 'ProviderEdge source must use the edge Provider ID',
    });
    return;
  }

  if (value.target.state === 'RESOLVED') {
    if (value.target.target.providerId !== value.providerId) {
      context.addIssue({
        code: 'custom',
        path: ['target', 'target', 'providerId'],
        message: 'ProviderEdge target must use the edge Provider ID',
      });
    }
    return;
  }

  for (const [index, candidate] of value.target.candidates.entries()) {
    if (candidate.providerId !== value.providerId) {
      context.addIssue({
        code: 'custom',
        path: ['target', 'candidates', index, 'providerId'],
        message: 'ProviderEdge candidate must use the edge Provider ID',
      });
      return;
    }
  }
});
export type ProviderEdge = z.infer<typeof ProviderEdgeSchema>;
