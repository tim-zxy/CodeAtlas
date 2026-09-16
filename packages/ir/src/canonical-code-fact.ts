import { z } from 'zod';

import {
  CodeFactNameSchema,
  EdgeFactKeySchema,
  NodeFactKeySchema,
  QualifiedCodeFactNameSchema,
} from './code-fact-identity.js';
import { CanonicalNodeRefSchema } from './code-fact-reference.js';
import { CanonicalTargetSchema } from './code-fact-target.js';
import { ConfidenceSchema } from './confidence.js';
import { CanonicalIdSchema, EntityIdSchema } from './ids.js';
import { SourceRangeSchema } from './references.js';

export const CodeNodeKindSchema = z.enum(['REPOSITORY', 'MODULE', 'PACKAGE', 'TYPE', 'SYMBOL']);
export type CodeNodeKind = z.infer<typeof CodeNodeKindSchema>;

export const CodeTypeKindSchema = z.enum([
  'CLASS',
  'INTERFACE',
  'ENUM',
  'RECORD',
  'ANNOTATION',
  'TRAIT',
  'STRUCT',
  'UNION',
  'OTHER',
]);
export type CodeTypeKind = z.infer<typeof CodeTypeKindSchema>;

export const CodeSymbolKindSchema = z.enum([
  'METHOD',
  'CONSTRUCTOR',
  'FUNCTION',
  'FIELD',
  'PROPERTY',
  'VARIABLE',
  'PARAMETER',
  'CONSTANT',
  'OTHER',
]);
export type CodeSymbolKind = z.infer<typeof CodeSymbolKindSchema>;

const CanonicalNodeBaseShape = {
  id: CanonicalIdSchema,
  factKey: NodeFactKeySchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  name: CodeFactNameSchema,
  qualifiedName: QualifiedCodeFactNameSchema.nullable(),
  sourceRange: SourceRangeSchema.nullable(),
  confidence: ConfidenceSchema,
};

export const RepositoryCodeNodeSchema = z.strictObject({
  ...CanonicalNodeBaseShape,
  kind: z.literal('REPOSITORY'),
});
export type RepositoryCodeNode = z.infer<typeof RepositoryCodeNodeSchema>;

export const ModuleCodeNodeSchema = z.strictObject({
  ...CanonicalNodeBaseShape,
  kind: z.literal('MODULE'),
});
export type ModuleCodeNode = z.infer<typeof ModuleCodeNodeSchema>;

export const PackageCodeNodeSchema = z.strictObject({
  ...CanonicalNodeBaseShape,
  kind: z.literal('PACKAGE'),
});
export type PackageCodeNode = z.infer<typeof PackageCodeNodeSchema>;

export const TypeCodeNodeSchema = z.strictObject({
  ...CanonicalNodeBaseShape,
  kind: z.literal('TYPE'),
  typeKind: CodeTypeKindSchema,
});
export type TypeCodeNode = z.infer<typeof TypeCodeNodeSchema>;

export const SymbolCodeNodeSchema = z.strictObject({
  ...CanonicalNodeBaseShape,
  kind: z.literal('SYMBOL'),
  symbolKind: CodeSymbolKindSchema,
});
export type SymbolCodeNode = z.infer<typeof SymbolCodeNodeSchema>;

export const CanonicalNodeSchema = z.discriminatedUnion('kind', [
  RepositoryCodeNodeSchema,
  ModuleCodeNodeSchema,
  PackageCodeNodeSchema,
  TypeCodeNodeSchema,
  SymbolCodeNodeSchema,
]);
export type CanonicalNode = z.infer<typeof CanonicalNodeSchema>;

export const CodeEdgeKindSchema = z.enum([
  'IMPORT',
  'REFERENCE',
  'CALL',
  'INHERITANCE',
  'OVERRIDE',
]);
export type CodeEdgeKind = z.infer<typeof CodeEdgeKindSchema>;

export const CanonicalEdgeSchema = z.strictObject({
  id: CanonicalIdSchema,
  factKey: EdgeFactKeySchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  kind: CodeEdgeKindSchema,
  source: CanonicalNodeRefSchema,
  target: CanonicalTargetSchema,
  sourceRange: SourceRangeSchema.nullable(),
  confidence: ConfidenceSchema,
});
export type CanonicalEdge = z.infer<typeof CanonicalEdgeSchema>;
