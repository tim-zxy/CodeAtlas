import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import {
  ProviderNodeRefSchema,
  SourceRangeSchema,
  SyntaxEvidenceV4Schema,
  syntaxRangeContains,
} from '@codeatlas/ir';
import { BindingAwareSyntaxObservationSchema } from './native-binding-sufficiency-contract.js';
import { CodeSyntaxRequestSchema } from './native-code-syntax-request.js';
const [decoration, invocation, declaration, assignment, artifact, imported, effect, scope] =
  BindingAwareSyntaxObservationSchema.options;
const extra = { callbackScope: SourceRangeSchema.nullable() };
const common = decoration.omit({ syntaxKind: true, payload: true }).extend(extra);
const parameter = SyntaxEvidenceV4Schema.options[8].shape.payload.extend({
  callableRef: ProviderNodeRefSchema,
});
const link = SyntaxEvidenceV4Schema.options[9].shape.payload;
const callback = SyntaxEvidenceV4Schema.options[10].shape.payload.extend({
  parentScopeRef: ProviderNodeRefSchema,
});
const oldKinds = new Set<string>(
  BindingAwareSyntaxObservationSchema.options.map((o) => o.shape.syntaxKind.value),
);
/** Wire structure only. Full stream/owner closure and Source authority are separate. */
export const FrameworkSurfaceObservationSchema = z
  .discriminatedUnion('syntaxKind', [
    decoration.safeExtend(extra),
    invocation.safeExtend({
      ...extra,
      payload: invocation.shape.payload.safeExtend({
        invocationForm: z.enum(['CALL', 'CONSTRUCT']),
        calleeRange: SourceRangeSchema,
      }),
    }),
    declaration.safeExtend(extra),
    assignment.safeExtend(extra),
    artifact.safeExtend(extra),
    imported.safeExtend(extra),
    effect.safeExtend(extra),
    scope.safeExtend(extra),
    common.extend({ syntaxKind: z.literal('PARAMETER_BINDING'), payload: parameter }),
    common.extend({ syntaxKind: z.literal('VALUE_LINK'), payload: link }),
    common.extend({ syntaxKind: z.literal('CALLBACK_BINDING'), payload: callback }),
  ])
  .superRefine((s, c) => {
    const ok = (v: unknown) => {
      if (!v) c.addIssue({ code: 'custom', message: 'Invalid framework surface structure' });
    };
    if (oldKinds.has(s.syntaxKind)) {
      const { callbackScope: _, ...legacy } = s;
      if (legacy.syntaxKind === 'INVOCATION') {
        const { invocationForm: __, calleeRange: ___, ...payload } = legacy.payload;
        ok(BindingAwareSyntaxObservationSchema.safeParse({ ...legacy, payload }).success);
      } else ok(BindingAwareSyntaxObservationSchema.safeParse(legacy).success);
    }
    ok(s.sourceFileId === s.sourceRange.sourceFileId);
    const visit = (v: unknown): void => {
      if (v === null || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        for (const a of v) visit(a);
        return;
      }
      const r = v as Record<string, unknown>;
      if ('sourceFileId' in r && 'startLine' in r) ok(r.sourceFileId === s.sourceFileId);
      for (const a of Object.values(r)) visit(a);
    };
    visit(s);
    if (s.callbackScope)
      ok(
        s.syntaxKind === 'INVOCATION' &&
          s.lexicalScope === null &&
          s.controlContext === 'UNKNOWN' &&
          syntaxRangeContains(s.callbackScope, s.sourceRange),
      );
    if (s.syntaxKind === 'INVOCATION') {
      ok(syntaxRangeContains(s.sourceRange, s.payload.calleeRange));
      for (const arg of s.payload.arguments)
        ok(syntaxRangeContains(s.sourceRange, arg.sourceRange));
    }
    if (s.syntaxKind === 'PARAMETER_BINDING') {
      const p = s.payload;
      ok(
        isDeepStrictEqual(s.owner, p.callableRef) &&
          isDeepStrictEqual(s.lexicalScope, p.callableRef) &&
          s.callbackScope === null,
      );
      ok((p.typeRange === null) === (p.declaredType === null));
      for (const r of [p.typeRange, p.defaultValueRange])
        if (r) ok(syntaxRangeContains(s.sourceRange, r));
      if (p.language === 'java')
        ok(p.defaultValueRange === null && p.parameterForm === 'POSITIONAL');
    }
    if (s.syntaxKind === 'VALUE_LINK')
      ok(
        s.callbackScope === null &&
          (s.payload.relation === 'RECEIVER_RESULT'
            ? s.payload.argumentIndex === null
            : s.payload.argumentIndex !== null),
      );
    if (s.syntaxKind === 'CALLBACK_BINDING') {
      const p = s.payload;
      ok(
        isDeepStrictEqual(s.owner, p.parentScopeRef) &&
          isDeepStrictEqual(s.lexicalScope, p.parentScopeRef) &&
          s.callbackScope === null,
      );
      ok((p.status === 'COMPLETE') === (p.limitations.length === 0));
      ok(
        new Set(p.limitations).size === p.limitations.length &&
          new Set(p.parameterNames).size === p.parameterNames.length,
      );
      if (p.callbackForm === 'JAVA_METHOD_REFERENCE')
        ok(p.body === null && p.reference !== null && p.parameterNames.length === 0);
      else ok(p.body !== null && p.reference === null && p.parameterNames.length === 1);
    }
  });
export type FrameworkSurfaceObservation = z.infer<typeof FrameworkSurfaceObservationSchema>;
export const FrameworkSurfaceRequestSchema = CodeSyntaxRequestSchema.extend({
  protocolVersion: z.literal(8),
  payload: CodeSyntaxRequestSchema.shape.payload.extend({
    syntaxContract: z.literal('SYNTAX_BINDING_V4'),
    extractorVersion: z.literal('syntax-v2'),
  }),
});
export type FrameworkSurfaceRequest = z.infer<typeof FrameworkSurfaceRequestSchema>;

import { NativeSyntaxContractError } from './native-syntax-ipc.js';
/** Full raw collection closure, after request-owned refs/stream checks; no Canonical IDs. */
export function validateFrameworkSurfaceRawClosure(
  records: readonly FrameworkSurfaceObservation[],
  spend: () => void,
): void {
  function check(v: unknown): asserts v {
    if (!v) throw new NativeSyntaxContractError('PROTOCOL_CORRUPTION');
  }
  const same = (a: unknown, b: unknown) => a !== null && b !== null && isDeepStrictEqual(a, b);
  const key = (r: z.infer<typeof SourceRangeSchema>) =>
    JSON.stringify([r.sourceFileId, r.startLine, r.startColumn, r.endLine, r.endColumn]);
  const sites = new Map<
    string,
    Extract<FrameworkSurfaceObservation, { syntaxKind: 'INVOCATION' }>
  >();
  for (const r of records) {
    spend();
    if (r.syntaxKind === 'INVOCATION') {
      check(!sites.has(key(r.sourceRange)));
      sites.set(key(r.sourceRange), r);
    }
  }
  const get = (p: z.infer<typeof link>['producer'], record: FrameworkSurfaceObservation) => {
    spend();
    const r = sites.get(key(p.sourceRange));
    check(r && r.sourceFingerprint === record.sourceFingerprint);
    return r!;
  };
  for (const r of records) {
    spend();
    if (r.syntaxKind === 'DECLARATION' && r.payload.declarationForm === 'CALLABLE') {
      const ps = records
        .filter(
          (p): p is Extract<FrameworkSurfaceObservation, { syntaxKind: 'PARAMETER_BINDING' }> => {
            spend();
            return p.syntaxKind === 'PARAMETER_BINDING' && same(p.payload.callableRef, r.owner);
          },
        )
        .sort((a, b) => a.payload.ordinal - b.payload.ordinal);
      check(
        ps.length === r.payload.parameterNames.length &&
          new Set(r.payload.parameterNames).size === r.payload.parameterNames.length,
      );
      for (let i = 0; i < ps.length; i++)
        check(
          ps[i]!.payload.ordinal === i &&
            ps[i]!.payload.name === r.payload.parameterNames[i] &&
            syntaxRangeContains(r.sourceRange, ps[i]!.sourceRange),
        );
    }
    if (r.syntaxKind === 'PARAMETER_BINDING')
      check(
        records.filter((p) => {
          spend();
          return (
            p.syntaxKind === 'DECLARATION' &&
            p.payload.declarationForm === 'CALLABLE' &&
            same(p.owner, r.payload.callableRef)
          );
        }).length === 1,
      );
    if (r.syntaxKind === 'VALUE_LINK') {
      const a = get(r.payload.producer, r),
        b = get(r.payload.consumer, r);
      check(
        a !== b &&
          syntaxRangeContains(b.sourceRange, a.sourceRange) &&
          !isDeepStrictEqual(a.sourceRange, b.sourceRange) &&
          syntaxRangeContains(r.sourceRange, a.sourceRange) &&
          syntaxRangeContains(r.sourceRange, b.sourceRange) &&
          same(a.owner, b.owner) &&
          same(r.owner, b.owner) &&
          isDeepStrictEqual(a.callbackScope, b.callbackScope),
      );
      if (r.payload.relation === 'ARGUMENT_RESULT') {
        const arg = b.payload.arguments[r.payload.argumentIndex!];
        check(arg && syntaxRangeContains(arg.sourceRange, a.sourceRange));
      } else {
        check(b.payload.receiver !== null);
        check(!syntaxRangeContains(a.sourceRange, b.payload.calleeRange));
        for (const arg of b.payload.arguments)
          check(!syntaxRangeContains(arg.sourceRange, a.sourceRange));
      }
    }
    if (r.syntaxKind === 'CALLBACK_BINDING') {
      const p = r.payload,
        consumer = get(p.consumer, r),
        arg = consumer.payload.arguments[p.argumentIndex];
      check(
        arg &&
          isDeepStrictEqual(arg.sourceRange, r.sourceRange) &&
          same(consumer.owner, p.parentScopeRef) &&
          consumer.callbackScope === null,
      );
      if (p.body) {
        const body = get(p.body, r);
        check(
          isDeepStrictEqual(body.callbackScope, r.sourceRange) &&
            body.lexicalScope === null &&
            body.controlContext === 'UNKNOWN' &&
            same(body.owner, p.parentScopeRef) &&
            body.payload.invocationForm === 'CALL' &&
            body.payload.arguments.length === 1,
        );
        const value = body.payload.arguments[0]!.value;
        check(value.kind === 'REFERENCE' && value.name === p.parameterNames[0]);
        check(
          records.filter((q) => {
            spend();
            return (
              q.syntaxKind === 'INVOCATION' &&
              q.callbackScope &&
              isDeepStrictEqual(q.callbackScope, r.sourceRange)
            );
          }).length === 1,
        );
      }
    }
    if (r.callbackScope)
      check(
        records.filter((q) => {
          spend();
          return (
            q.syntaxKind === 'CALLBACK_BINDING' &&
            q.payload.body &&
            isDeepStrictEqual(q.sourceRange, r.callbackScope) &&
            isDeepStrictEqual(q.payload.body.sourceRange, r.sourceRange)
          );
        }).length === 1,
      );
  }
}
