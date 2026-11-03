import { z } from 'zod';
import {
  ensurePhase1Data,
  parseIr,
  phase1Assert,
  parseSyntaxEvidenceV3,
  SyntaxEvidenceV3Schema,
  validateSyntaxBindingScopeClosure,
} from '@codeatlas/ir';
import { PluginV2ContextSchema, validatePluginV2Context } from './plugin-spi-v2.js';
import { MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';
export const PluginV4ContextSchema = PluginV2ContextSchema.extend({
  contextVersion: z.literal(4),
  syntaxSchemaVersion: z.literal(3),
  syntaxEvidence: z.array(SyntaxEvidenceV3Schema).max(MAX_PLUGIN_CONTEXT_FACTS),
});
export type PluginV4Context = z.infer<typeof PluginV4ContextSchema>;
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function validatePluginV4Context(input: unknown): PluginV4Context {
  ensurePhase1Data(input);
  const c = parseIr(PluginV4ContextSchema, input),
    { syntaxSchemaVersion, ...base } = c;
  const legacy = validatePluginV2Context({ ...base, contextVersion: 2, syntaxEvidence: [] });
  phase1Assert(
    c.nodes.length + c.edges.length + c.syntaxEvidence.length <= MAX_PLUGIN_CONTEXT_FACTS,
  );
  phase1Assert(
    new Set(c.syntaxEvidence.map((s) => s.id)).size === c.syntaxEvidence.length &&
      new Set(c.syntaxEvidence.map((s) => s.syntaxKey)).size === c.syntaxEvidence.length,
  );
  const availableEntities = [
    ...c.nodes.map((n) => ({ kind: 'CODE_NODE', id: n.id })),
    ...c.edges.map((e) => ({ kind: 'CODE_EDGE', id: e.id })),
    ...c.sourceFiles.map((f) => ({ kind: 'SOURCE_FILE', id: f.id })),
  ].map((entity) => ({
    scope: 'REPOSITORY',
    repositoryId: c.basis.repositoryId,
    entity: { ...entity, revisionId: c.basis.revisionId },
  }));
  const parseContext = {
    references: { availableEntities, availableSupports: legacy.supportInventory },
    codeNodes: c.nodes,
    sourceFiles: c.sourceFiles,
  };
  for (const s of c.syntaxEvidence) {
    phase1Assert(s.repositoryId === c.basis.repositoryId && s.revisionId === c.basis.revisionId);
    parseSyntaxEvidenceV3(
      { schema: 'codeatlas.syntax-evidence', version: 3, payload: s },
      parseContext,
    );
  }
  validateSyntaxBindingScopeClosure(c.syntaxEvidence, parseContext);
  return freeze(c);
}
