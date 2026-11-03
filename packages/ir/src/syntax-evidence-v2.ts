import { z } from 'zod';
import { CanonicalNodeSchema } from './canonical-code-fact.js';
import { SourceFileSchema } from './source-file.js';
import { SourceRangeSchema } from './references.js';
import {
  ensurePhase1Data,
  Phase1ReferenceContextSchema,
  ScopedRefSchema,
  phase1Assert,
  assertScopedRef,
  assertUnique,
} from './phase1-support.js';
import { parseIr } from './validation.js';
import { SyntaxEvidenceSchema, parseSyntaxEvidence } from './syntax-evidence.js';

const [decoration, invocation, declaration, assignment, artifact] = SyntaxEvidenceSchema.options;
const scope = { lexicalScope: ScopedRefSchema.nullable() };
export const SyntaxEvidenceV2Schema = z
  .discriminatedUnion('syntaxKind', [
    decoration.extend(scope),
    invocation.extend(scope),
    declaration.extend({
      ...scope,
      payload: declaration.shape.payload.extend({
        declarationForm: z.enum(['CALLABLE', 'TYPED_BINDING', 'OTHER']),
        declaredName: declaration.shape.payload.shape.declaredType,
      }),
    }),
    assignment.extend({
      ...scope,
      payload: assignment.shape.payload.extend({
        assignmentForm: z.enum(['IMPORT_ALIAS', 'DIRECT_VALUE', 'OTHER']),
        valueRange: SourceRangeSchema.nullable(),
      }),
    }),
    artifact.extend(scope),
  ])
  .superRefine((value, ctx) => {
    if (value.syntaxKind === 'ASSIGNMENT') {
      const p = value.payload,
        r = p.valueRange,
        outer = value.sourceRange;
      const before = (al: number, ac: number, bl: number, bc: number) =>
        al < bl || (al === bl && ac <= bc);
      if (
        (p.assignmentForm === 'DIRECT_VALUE') !== (r !== null) ||
        (r !== null &&
          (r.sourceFileId !== outer.sourceFileId ||
            !before(outer.startLine, outer.startColumn, r.startLine, r.startColumn) ||
            !before(r.endLine, r.endColumn, outer.endLine, outer.endColumn)))
      ) {
        ctx.addIssue({ code: 'custom', message: 'Invalid assignment value range' });
      }
    }
    if (
      value.syntaxKind === 'DECLARATION' &&
      value.payload.declarationForm !== 'OTHER' &&
      value.payload.declaredName === null
    ) {
      ctx.addIssue({ code: 'custom', message: 'Declaration requires a name' });
    }
  });
export type SyntaxEvidenceV2 = z.infer<typeof SyntaxEvidenceV2Schema>;
const EnvelopeSchema = z.strictObject({
  schema: z.literal('codeatlas.syntax-evidence'),
  version: z.literal(2),
  payload: SyntaxEvidenceV2Schema,
});
const ContextSchema = z.strictObject({
  references: Phase1ReferenceContextSchema,
  codeNodes: z.array(CanonicalNodeSchema),
  sourceFiles: z.array(SourceFileSchema).optional(),
});
export function parseSyntaxEvidenceV2(input: unknown, contextInput: unknown) {
  ensurePhase1Data(input);
  ensurePhase1Data(contextInput);
  const result = parseIr(EnvelopeSchema, input),
    context = parseIr(ContextSchema, contextInput);
  const p = result.payload;
  const { lexicalScope, ...legacy } = p;
  const payload = { ...legacy.payload } as Record<string, unknown>;
  delete payload.assignmentForm;
  delete payload.valueRange;
  delete payload.declarationForm;
  delete payload.declaredName;
  parseSyntaxEvidence(
    { schema: result.schema, version: 1, payload: { ...legacy, payload } },
    context.references,
  );
  assertUnique(context.codeNodes.map((n) => n.id));
  assertUnique(context.codeNodes.map((n) => n.factKey));
  for (const node of context.codeNodes) {
    phase1Assert(node.repositoryId === p.repositoryId && node.revisionId === p.revisionId);
  }
  if (context.sourceFiles) {
    assertUnique(context.sourceFiles.map((f) => f.id));
    assertUnique(context.sourceFiles.map((f) => f.path));
    for (const file of context.sourceFiles)
      phase1Assert(file.repositoryId === p.repositoryId && file.revisionId === p.revisionId);
  }
  if (lexicalScope !== null) {
    phase1Assert(
      lexicalScope.scope === 'REPOSITORY' &&
        lexicalScope.repositoryId === p.repositoryId &&
        lexicalScope.entity.kind === 'CODE_NODE' &&
        lexicalScope.entity.revisionId === p.revisionId,
    );
    assertScopedRef(lexicalScope, context.references);
    const node = context.codeNodes.find((n) => String(n.id) === lexicalScope.entity.id);
    const file = context.sourceFiles?.find((f) => f.id === p.sourceRange.sourceFileId);
    const belongsToFile =
      node?.sourceRange?.sourceFileId === p.sourceRange.sourceFileId ||
      (node?.kind === 'MODULE' &&
        node.sourceRange === null &&
        file !== undefined &&
        String(node.qualifiedName) === String(file.path) &&
        file.contentFingerprint === p.sourceFingerprint);
    phase1Assert(
      node !== undefined &&
        (node.kind === 'MODULE' ||
          node.kind === 'TYPE' ||
          (node.kind === 'SYMBOL' &&
            ['METHOD', 'CONSTRUCTOR', 'FUNCTION'].includes(node.symbolKind))) &&
        belongsToFile,
    );
  }
  ensurePhase1Data(result);
  return result;
}
