import {
  CanonicalEdgeSchema,
  CanonicalFactRefSchema,
  CanonicalNodeSchema,
  EntityIdSchema,
  IrValidationError,
  JsonValueSchema,
  ProviderSnapshotDiagnosticSchema,
  SchemaEnvelopeSchema,
  SourceFileSchema,
  parseIr,
} from '@codeatlas/ir';
import { z } from 'zod';

const ExactStringSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), 'Value must be exact and non-blank');

const UniqueStringsSchema = z.array(ExactStringSchema).superRefine((values, context) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({ code: 'custom', path: [index], message: 'Values must be unique' });
    }
    seen.add(value);
  });
});

export const PluginDescriptorSchema = z.strictObject({
  pluginId: ExactStringSchema,
  pluginVersion: ExactStringSchema,
  languages: UniqueStringsSchema.min(1),
  frameworks: UniqueStringsSchema.min(1),
  requiredProviderCapabilities: UniqueStringsSchema,
  producedSemanticCapabilities: UniqueStringsSchema.min(1),
  configurationSchema: z.strictObject({
    schema: ExactStringSchema,
    version: z.number().int().safe().positive(),
  }),
  trustClass: z.literal('BUILT_IN'),
});
export type PluginDescriptor = z.infer<typeof PluginDescriptorSchema>;

export const MAX_PLUGIN_CONTEXT_FACTS = 10_000;
export const MAX_PLUGIN_SOURCE_FILES = 10_000;

const ContextShape = {
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  nodes: z.array(CanonicalNodeSchema).max(MAX_PLUGIN_CONTEXT_FACTS),
  edges: z.array(CanonicalEdgeSchema).max(MAX_PLUGIN_CONTEXT_FACTS),
  sourceFiles: z.array(SourceFileSchema).max(MAX_PLUGIN_SOURCE_FILES),
  configuration: JsonValueSchema,
};

function validateContext(
  context: {
    repositoryId: string;
    revisionId: string;
    nodes: readonly { repositoryId: string; revisionId: string }[];
    edges: readonly { repositoryId: string; revisionId: string }[];
    sourceFiles: readonly { repositoryId: string; revisionId: string }[];
  },
  issues: z.RefinementCtx,
): void {
  if (context.nodes.length + context.edges.length > MAX_PLUGIN_CONTEXT_FACTS) {
    issues.addIssue({ code: 'custom', path: ['nodes'], message: 'Fact context exceeds limit' });
  }
  for (const name of ['nodes', 'edges', 'sourceFiles'] as const) {
    context[name].forEach((fact, index) => {
      if (fact.repositoryId !== context.repositoryId || fact.revisionId !== context.revisionId) {
        issues.addIssue({
          code: 'custom',
          path: [name, index],
          message: 'Input context must match repository and revision',
        });
      }
    });
  }
}

export const DetectionContextSchema = z.strictObject(ContextShape).superRefine(validateContext);
export type DetectionContext = z.infer<typeof DetectionContextSchema>;

export const DetectionResultSchema = z.strictObject({
  matched: z.boolean(),
  support: z.array(CanonicalFactRefSchema),
  diagnostics: z.array(ProviderSnapshotDiagnosticSchema),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

export const SemanticExtractionContextSchema = z
  .strictObject({ ...ContextShape, detection: DetectionResultSchema })
  .superRefine((context, issues) => {
    validateContext(context, issues);
    if (!context.detection.matched || context.detection.support.length === 0) {
      issues.addIssue({
        code: 'custom',
        path: ['detection'],
        message: 'Extraction requires a positive evidence-backed detection',
      });
      return;
    }
    try {
      validateSupport(context, context.detection.support);
    } catch (error) {
      if (!(error instanceof IrValidationError)) throw error;
      issues.addIssue({
        code: 'custom',
        path: ['detection', 'support'],
        message: 'Detection support must exist in the input context',
      });
    }
  });
export type SemanticExtractionContext = z.infer<typeof SemanticExtractionContextSchema>;

export const SemanticFactSchema = z.strictObject({
  capability: ExactStringSchema,
  value: SchemaEnvelopeSchema,
  support: z.array(CanonicalFactRefSchema).min(1),
});
export type SemanticFact = z.infer<typeof SemanticFactSchema>;

function validateSupport(
  context: DetectionContext,
  support: readonly z.infer<typeof CanonicalFactRefSchema>[],
): void {
  const available = new Set([
    ...context.nodes.map((node) => `NODE\0${node.id}`),
    ...context.edges.map((edge) => `EDGE\0${edge.id}`),
  ]);
  const seen = new Set<string>();
  support.forEach((ref, index) => {
    const key = `${ref.factType}\0${ref.id}`;
    if (!available.has(key) || seen.has(key)) {
      throw new IrValidationError([
        {
          path: ['support', index],
          message: seen.has(key)
            ? 'Support reference must be unique'
            : 'Support reference is absent',
        },
      ]);
    }
    seen.add(key);
  });
}

export function validateDetectionResult(context: unknown, result: unknown): DetectionResult {
  const input = parseIr(DetectionContextSchema, context);
  const detection = parseIr(DetectionResultSchema, result);
  if (detection.matched === (detection.support.length === 0)) {
    throw new IrValidationError([
      { path: ['support'], message: 'Detection match and support must agree' },
    ]);
  }
  validateSupport(input, detection.support);
  return detection;
}

export function validateSemanticFact(
  context: unknown,
  descriptor: unknown,
  fact: unknown,
): SemanticFact {
  const input = parseIr(DetectionContextSchema, context);
  const plugin = parseIr(PluginDescriptorSchema, descriptor);
  const candidate = parseIr(SemanticFactSchema, fact);
  if (!plugin.producedSemanticCapabilities.includes(candidate.capability)) {
    throw new IrValidationError([
      { path: ['capability'], message: 'Plugin did not declare this semantic capability' },
    ]);
  }
  validateSupport(input, candidate.support);
  return candidate;
}

export interface FrameworkPlugin {
  describe(): PluginDescriptor;
  detect(input: DetectionContext): Promise<DetectionResult>;
  extract(input: SemanticExtractionContext): AsyncIterable<SemanticFact>;
}
