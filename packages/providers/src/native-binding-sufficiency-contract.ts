import { z } from 'zod';
import {
  ProviderNodeRefSchema,
  BindingControlContextSchema,
  BindingImportPayloadSchema,
  BindingEffectBasePayloadSchema,
  BindingScopeBasePayloadSchema,
  syntaxRangeContains,
} from '@codeatlas/ir';
import { BindingSyntaxObservationSchema } from './native-binding-contract.js';
import { CodeSyntaxRequestSchema } from './native-code-syntax-request.js';
const [decoration, invocation, declaration, assignment, artifact] =
  BindingSyntaxObservationSchema.options;
const control = { controlContext: BindingControlContextSchema };
const common = decoration.omit({ syntaxKind: true, payload: true }).extend(control);
/** Structure only. No stream, owner-map, producer or admission authority. */
export const BindingAwareSyntaxObservationSchema = z
  .discriminatedUnion('syntaxKind', [
    decoration.extend(control),
    invocation.extend(control),
    declaration.extend({
      ...control,
      payload: z.strictObject({
        ...declaration.shape.payload.shape,
        declarationForm: z.enum(['CALLABLE', 'TYPED_BINDING', 'TYPE', 'OTHER']),
      }),
    }),
    assignment.extend(control),
    artifact.extend(control),
    common.extend({ syntaxKind: z.literal('IMPORT_BINDING'), payload: BindingImportPayloadSchema }),
    common.extend({
      syntaxKind: z.literal('BINDING_EFFECT'),
      payload: BindingEffectBasePayloadSchema.safeExtend({
        targetScopeRef: ProviderNodeRefSchema.nullable(),
      }),
    }),
    common.extend({
      syntaxKind: z.literal('BINDING_SCOPE'),
      payload: BindingScopeBasePayloadSchema.safeExtend({
        scopeRef: ProviderNodeRefSchema,
        parentScopeRef: ProviderNodeRefSchema.nullable(),
      }),
    }),
  ])
  .superRefine((s, c) => {
    const ok = (v: unknown) => {
      if (!v) c.addIssue({ code: 'custom', message: 'Invalid binding-aware structure' });
    };
    if (s.syntaxKind === 'ASSIGNMENT') {
      const p = s.payload;
      ok((p.assignmentForm === 'DIRECT_VALUE') === (p.valueRange !== null));
      if (p.valueRange) ok(syntaxRangeContains(s.sourceRange, p.valueRange));
    }
    if (s.syntaxKind === 'DECLARATION')
      ok(s.payload.declarationForm === 'OTHER' || s.payload.declaredName !== null);
    if (s.syntaxKind === 'DECLARATION' && s.payload.declarationForm === 'TYPE')
      ok(s.owner !== null);
    if (s.syntaxKind === 'BINDING_SCOPE') {
      const same = (r: typeof s.owner) =>
        r !== null &&
        r.providerId === s.payload.scopeRef.providerId &&
        r.providerFactId === s.payload.scopeRef.providerFactId;
      ok(
        s.controlContext === 'UNCONDITIONAL' &&
          same(s.lexicalScope) &&
          (s.owner === null || same(s.owner)),
      );
    }
  });
export type BindingAwareSyntaxObservation = z.infer<typeof BindingAwareSyntaxObservationSchema>;
export const BindingAwareCodeSyntaxRequestSchema = CodeSyntaxRequestSchema.extend({
  protocolVersion: z.literal(7),
  payload: CodeSyntaxRequestSchema.shape.payload.extend({
    syntaxContract: z.literal('SYNTAX_BINDING_V3'),
  }),
});
export type BindingAwareCodeSyntaxRequest = z.infer<typeof BindingAwareCodeSyntaxRequestSchema>;
