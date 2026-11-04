import { z } from 'zod';
import { ProviderNodeRefSchema, SourceRangeSchema } from '@codeatlas/ir';
import { NativeSyntaxObservationSchema } from './native-syntax-ipc.js';
import { CodeSyntaxRequestSchema } from './native-code-syntax-request.js';
const [decoration, invocation, declaration, assignment, artifact] =
  NativeSyntaxObservationSchema.options;
const scope = { lexicalScope: ProviderNodeRefSchema.nullable() };
/** Structural contract only; no byte-stream, producer or admission authority. */
export const BindingSyntaxObservationSchema = z
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
export type BindingSyntaxObservation = z.infer<typeof BindingSyntaxObservationSchema>;
export const BindingCodeSyntaxRequestSchema = CodeSyntaxRequestSchema.extend({
  protocolVersion: z.literal(6),
  payload: CodeSyntaxRequestSchema.shape.payload.extend({
    syntaxContract: z.literal('SYNTAX_BINDING_V2'),
  }),
});
export type BindingCodeSyntaxRequest = z.infer<typeof BindingCodeSyntaxRequestSchema>;
