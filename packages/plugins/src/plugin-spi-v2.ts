import { z } from 'zod';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  CanonicalFactRefSchema,
  EntityIdSchema,
  SourceFileSchema,
  RepoBasisSchema,
  SupportRefSchema,
  SyntaxEvidenceSchema,
  JsonValueSchema,
  SchemaEnvelopeSchema,
  ProviderSnapshotDiagnosticSchema,
  IrValidationError,
  parseIr,
  ensurePhase1Data,
  parseSyntaxEvidence,
  basisKey,
  entityRefKey,
  type Phase1ReferenceContext,
} from '@codeatlas/ir';
import {
  PluginDescriptorSchema,
  MAX_PLUGIN_CONTEXT_FACTS,
  MAX_PLUGIN_SOURCE_FILES,
} from './plugin-spi.js';

const fail = (): never => {
  throw new IrValidationError([{ path: [], message: 'Invalid Plugin V2 contract' }]);
};
const check = (value: unknown): void => {
  if (!value) fail();
};
function unique(values: readonly string[]): void {
  check(new Set(values).size === values.length);
}
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
function checked<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  ensurePhase1Data(value);
  return parseIr(schema, value);
}
export const PluginDescriptorV2Schema = PluginDescriptorSchema.extend({
  contextVersion: z.literal(2),
});
export const PluginV2SupportSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('CANONICAL'), ref: CanonicalFactRefSchema }),
  z.strictObject({ kind: z.literal('SYNTAX'), id: EntityIdSchema }),
]);
const ContextShape = {
  contextVersion: z.literal(2),
  basis: RepoBasisSchema,
  nodes: z.array(CanonicalNodeSchema).max(MAX_PLUGIN_CONTEXT_FACTS),
  edges: z.array(CanonicalEdgeSchema).max(MAX_PLUGIN_CONTEXT_FACTS),
  sourceFiles: z.array(SourceFileSchema).max(MAX_PLUGIN_SOURCE_FILES),
  syntaxEvidence: z.array(SyntaxEvidenceSchema).max(MAX_PLUGIN_CONTEXT_FACTS),
  supportInventory: z.array(SupportRefSchema),
  configuration: JsonValueSchema,
};
export const PluginV2ContextSchema = z.strictObject(ContextShape);
export type PluginV2Context = z.infer<typeof PluginV2ContextSchema>;
export const PluginV2DetectionSchema = z.strictObject({
  matched: z.boolean(),
  support: z.array(PluginV2SupportSchema),
  diagnostics: z.array(ProviderSnapshotDiagnosticSchema),
});
export type PluginV2Detection = z.infer<typeof PluginV2DetectionSchema>;
export const PluginV2ExtractionContextSchema = z.strictObject({
  ...ContextShape,
  detection: PluginV2DetectionSchema,
});
export const PluginV2CandidateSchema = z.strictObject({
  capability: PluginDescriptorSchema.shape.pluginId,
  value: SchemaEnvelopeSchema,
  support: z.array(PluginV2SupportSchema).min(1),
});
export type PluginV2Candidate = z.infer<typeof PluginV2CandidateSchema>;

export function validatePluginV2Context(value: unknown): PluginV2Context {
  const c = checked(PluginV2ContextSchema, value),
    b = c.basis;
  check(c.nodes.length + c.edges.length + c.syntaxEvidence.length <= MAX_PLUGIN_CONTEXT_FACTS);
  unique([...c.nodes, ...c.edges].map((x) => x.id));
  unique(c.nodes.map((x) => x.factKey));
  unique(c.edges.map((x) => x.factKey));
  unique(c.sourceFiles.map((x) => x.id));
  unique(c.sourceFiles.map((x) => x.path));
  unique(c.syntaxEvidence.map((x) => x.id));
  unique(c.syntaxEvidence.map((x) => x.syntaxKey));
  const files = new Map(c.sourceFiles.map((f) => [f.id, f]));
  const nodes = new Map<string, (typeof c.nodes)[number]>(c.nodes.map((n) => [n.id, n]));
  const known = new Set<string>();
  const availableEntities: Phase1ReferenceContext['availableEntities'] = [];
  for (const [kind, items] of [
    ['CODE_NODE', c.nodes],
    ['CODE_EDGE', c.edges],
    ['SOURCE_FILE', c.sourceFiles],
  ] as const) {
    for (const item of items) {
      check(item.repositoryId === b.repositoryId && item.revisionId === b.revisionId);
      const entity = { kind, id: EntityIdSchema.parse(item.id), revisionId: b.revisionId };
      availableEntities.push({ scope: 'REPOSITORY', repositoryId: b.repositoryId, entity });
      known.add(entityRefKey(entity));
    }
  }
  for (const fact of [...c.nodes, ...c.edges])
    if (fact.sourceRange !== null) check(files.has(fact.sourceRange.sourceFileId));
  for (const edge of c.edges) {
    check(nodes.has(edge.source.id));
    if (edge.target.state === 'RESOLVED') check(nodes.has(edge.target.target.id));
    else for (const ref of edge.target.candidates) check(nodes.has(ref.id));
  }
  unique(c.supportInventory.map((s) => entityRefKey(s.entity)));
  for (const support of c.supportInventory)
    check(basisKey(support.basis) === basisKey(b) && known.has(entityRefKey(support.entity)));
  const referenceContext: Phase1ReferenceContext = {
    availableEntities,
    availableSupports: c.supportInventory,
  };
  for (const syntax of c.syntaxEvidence) {
    check(syntax.repositoryId === b.repositoryId && syntax.revisionId === b.revisionId);
    const file = files.get(syntax.sourceRange.sourceFileId);
    check(file && file.contentFingerprint === syntax.sourceFingerprint);
    parseSyntaxEvidence(
      { schema: 'codeatlas.syntax-evidence', version: 1, payload: syntax },
      referenceContext,
    );
    if (syntax.owner) {
      check(syntax.owner.scope === 'REPOSITORY');
      const owner = nodes.get(syntax.owner.entity.id);
      check(owner?.sourceRange?.sourceFileId === syntax.sourceRange.sourceFileId);
    }
  }
  return freezeDeep(c);
}
function validateSupport(
  c: PluginV2Context,
  support: z.infer<typeof PluginV2SupportSchema>[],
): void {
  const canonical = new Set([
      ...c.nodes.map((n) => 'NODE:' + n.id),
      ...c.edges.map((e) => 'EDGE:' + e.id),
    ]),
    syntax = new Set(c.syntaxEvidence.map((s) => s.id));
  unique(
    support.map((s) =>
      s.kind === 'CANONICAL' ? 'CANONICAL:' + s.ref.factType + ':' + s.ref.id : 'SYNTAX:' + s.id,
    ),
  );
  for (const s of support)
    check(
      s.kind === 'CANONICAL' ? canonical.has(s.ref.factType + ':' + s.ref.id) : syntax.has(s.id),
    );
}
export function validatePluginV2Detection(context: unknown, value: unknown): PluginV2Detection {
  const c = validatePluginV2Context(context),
    d = checked(PluginV2DetectionSchema, value);
  check(d.matched === d.support.length > 0);
  validateSupport(c, d.support);
  for (const diagnostic of d.diagnostics)
    if (diagnostic.sourceRange)
      check(c.sourceFiles.some((f) => f.id === diagnostic.sourceRange!.sourceFileId));
  return freezeDeep(d);
}
export function validatePluginV2ExtractionContext(value: unknown) {
  const input = checked(PluginV2ExtractionContextSchema, value);
  const { detection, ...base } = input;
  const c = validatePluginV2Context(base),
    d = validatePluginV2Detection(c, detection);
  check(d.matched);
  return freezeDeep({ ...c, detection: d });
}
export function validatePluginV2Candidate(
  context: unknown,
  descriptor: unknown,
  value: unknown,
): PluginV2Candidate {
  const c = validatePluginV2ExtractionContext(context),
    d = checked(PluginDescriptorV2Schema, descriptor),
    candidate = checked(PluginV2CandidateSchema, value);
  check(d.producedSemanticCapabilities.includes(candidate.capability));
  validateSupport(c, candidate.support);
  return freezeDeep(candidate);
}
export interface FrameworkPluginV2 {
  describe(): z.infer<typeof PluginDescriptorV2Schema>;
  detect(input: PluginV2Context): Promise<PluginV2Detection>;
  extract(
    input: ReturnType<typeof validatePluginV2ExtractionContext>,
  ): AsyncIterable<PluginV2Candidate>;
}
