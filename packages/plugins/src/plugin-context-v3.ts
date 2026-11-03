import { z } from 'zod';
import {
  ensurePhase1Data,
  parseIr,
  parseSyntaxEvidenceV2,
  scopedRefKey,
  SyntaxEvidenceV2Schema,
  type SyntaxEvidenceV2,
  IrValidationError,
} from '@codeatlas/ir';
import { PluginV2ContextSchema, validatePluginV2Context } from './plugin-spi-v2.js';
import { MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';

export const PluginV3ContextSchema = PluginV2ContextSchema.extend({
  contextVersion: z.literal(3),
  syntaxSchemaVersion: z.literal(2),
  syntaxEvidence: z.array(SyntaxEvidenceV2Schema).max(MAX_PLUGIN_CONTEXT_FACTS),
});
export type PluginV3Context = z.infer<typeof PluginV3ContextSchema>;
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
export function validatePluginV3Context(value: unknown): PluginV3Context {
  ensurePhase1Data(value);
  const c = parseIr(PluginV3ContextSchema, value);
  const { syntaxSchemaVersion, ...base } = c;
  const legacy = validatePluginV2Context({
    ...base,
    contextVersion: 2,
    syntaxEvidence: [],
  });
  const check = (ok: unknown) => {
    if (!ok) throw new IrValidationError([{ path: [], message: 'Invalid Plugin V3 contract' }]);
  };
  check(c.nodes.length + c.edges.length + c.syntaxEvidence.length <= MAX_PLUGIN_CONTEXT_FACTS);
  check(new Set(c.syntaxEvidence.map((s) => s.id)).size === c.syntaxEvidence.length);
  check(new Set(c.syntaxEvidence.map((s) => s.syntaxKey)).size === c.syntaxEvidence.length);

  const availableEntities = [
    ...legacy.nodes.map((n) => ({ kind: 'CODE_NODE', id: n.id })),
    ...legacy.edges.map((e) => ({ kind: 'CODE_EDGE', id: e.id })),
    ...legacy.sourceFiles.map((f) => ({ kind: 'SOURCE_FILE', id: f.id })),
  ].map((entity) => ({
    scope: 'REPOSITORY',
    repositoryId: c.basis.repositoryId,
    entity: { ...entity, revisionId: c.basis.revisionId },
  }));
  const context = {
    references: { availableEntities, availableSupports: legacy.supportInventory },
    codeNodes: legacy.nodes,
    sourceFiles: legacy.sourceFiles,
  };
  for (const syntax of c.syntaxEvidence) {
    const sourceFile = legacy.sourceFiles.find((f) => f.id === syntax.sourceRange.sourceFileId);
    check(
      syntax.repositoryId === c.basis.repositoryId &&
        syntax.revisionId === c.basis.revisionId &&
        sourceFile !== undefined &&
        sourceFile.contentFingerprint === syntax.sourceFingerprint,
    );
    if (syntax.owner) {
      const node = legacy.nodes.find((n) => String(n.id) === String(syntax.owner!.entity.id));
      const file = legacy.sourceFiles.find((f) => f.id === syntax.sourceRange.sourceFileId);
      check(
        node?.sourceRange?.sourceFileId === syntax.sourceRange.sourceFileId ||
          (node?.kind === 'MODULE' &&
            node.sourceRange === null &&
            file !== undefined &&
            String(node.qualifiedName) === String(file.path) &&
            file.contentFingerprint === syntax.sourceFingerprint),
      );
    }
    parseSyntaxEvidenceV2(
      { schema: 'codeatlas.syntax-evidence', version: 2, payload: syntax },
      context,
    );
  }
  return freezeDeep(c);
}
/** Inputs already parsed as v2. Proves an exact syntactic relation only. */
export function isDirectAssignmentCall(a: SyntaxEvidenceV2, b: SyntaxEvidenceV2): boolean {
  if (
    a.syntaxKind !== 'ASSIGNMENT' ||
    a.payload.assignmentForm !== 'DIRECT_VALUE' ||
    b.syntaxKind !== 'INVOCATION' ||
    a.lexicalScope === null ||
    b.lexicalScope === null
  )
    return false;
  const range = a.payload.valueRange;
  return (
    range !== null &&
    a.repositoryId === b.repositoryId &&
    a.revisionId === b.revisionId &&
    a.sourceFingerprint === b.sourceFingerprint &&
    a.extractionVersion === b.extractionVersion &&
    scopedRefKey(a.lexicalScope) === scopedRefKey(b.lexicalScope) &&
    (['sourceFileId', 'startLine', 'startColumn', 'endLine', 'endColumn'] as const).every(
      (key) => range[key] === b.sourceRange[key],
    )
  );
}
