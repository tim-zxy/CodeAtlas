import type { FrameworkContext } from './framework-bindings.js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  ensurePhase1Data,
  parseIr,
  phase1Assert,
  RepoBasisSchema,
  SourceRangeSchema,
  ScopedRefSchema,
  Phase1ExactStringSchema as Text,
  HttpContractSignatureSchema,
  MessageContractSignatureSchema,
  SyntaxValueSchema,
} from '@codeatlas/ir';
import { PluginV2SupportSchema } from './plugin-spi-v2.js';
import { validatePluginV4Context } from './plugin-context-v4.js';
const codeRef = ScopedRefSchema.refine(
  (r) => r.scope === 'REPOSITORY' && r.entity.kind === 'CODE_NODE',
  'Expected repository Code reference',
);
const resource = { resourceKind: Text, logicalName: Text.nullable(), namespace: Text.nullable() };
const proposal = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('HTTP'),
    direction: z.enum(['PROVIDER', 'CONSUMER']),
    implementationRef: codeRef,
    signature: HttpContractSignatureSchema,
  }),
  z.strictObject({
    kind: z.literal('TASK'),
    taskKind: z.enum(['JOB', 'TASK', 'BATCH']),
    implementationRef: codeRef,
    schedule: SyntaxValueSchema,
  }),
  z.strictObject({
    kind: z.literal('DATA_RESOURCE'),
    ...resource,
    schemaRef: ScopedRefSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('DATA_OPERATION'),
    ...resource,
    implementationRef: codeRef,
    operation: z.enum(['READ', 'WRITE', 'WATCH']),
    handlerRef: codeRef.nullable(),
  }),
  z.strictObject({
    kind: z.literal('MESSAGE'),
    implementationRef: codeRef,
    signature: MessageContractSignatureSchema,
  }),
  z.strictObject({ kind: z.literal('DEPENDENCY'), ownerRef: codeRef, dependencyRef: codeRef }),
]);
export const FrameworkDraftSchema = z.strictObject({
  capability: z.literal('FRAMEWORK_DRAFT'),
  value: z.strictObject({
    schema: z.literal('codeatlas.framework-draft'),
    version: z.literal(1),
    payload: z.strictObject({
      basis: RepoBasisSchema,
      framework: z.enum(['spring', 'mongo', 'kafka', 'fastapi']),
      ruleId: Text,
      draftKey: Text,
      sourceRange: SourceRangeSchema,
      proposal,
    }),
  }),
  support: z.array(PluginV2SupportSchema).min(1),
});
export type FrameworkDraft = z.infer<typeof FrameworkDraftSchema>;
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const r = v as Record<string, unknown>;
    return (
      '{' +
      Object.keys(r)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(r[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v)!;
}
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function validateFrameworkDraft(context: unknown, input: unknown): FrameworkDraft {
  return validateFromContext(validatePluginV4Context(context), input);
}
function validateFromContext(c: FrameworkContext, input: unknown): FrameworkDraft {
  ensurePhase1Data(input);
  const d = parseIr(FrameworkDraftSchema, input),
    p = d.value.payload;
  phase1Assert(isDeepStrictEqual(p.basis, c.basis));
  const supportKeys = d.support.map((s) =>
    s.kind === 'SYNTAX' ? 'SYNTAX:' + s.id : 'CANONICAL:' + s.ref.factType + ':' + s.ref.id,
  );
  phase1Assert(new Set(supportKeys).size === supportKeys.length);
  const syntax = [],
    codeIds = new Set<string>();
  for (const s of d.support) {
    if (s.kind === 'SYNTAX') {
      const item = c.syntaxEvidence.find((v) => v.id === s.id);
      phase1Assert(item);
      syntax.push(item!);
      for (const ref of item!.supportRefs)
        if (ref.entity.kind === 'CODE_NODE') codeIds.add(String(ref.entity.id));
    } else {
      const item = (s.ref.factType === 'NODE' ? c.nodes : c.edges).find(
        (v) => String(v.id) === String(s.ref.id),
      );
      phase1Assert(item);
      if (s.ref.factType === 'NODE') codeIds.add(String(s.ref.id));
    }
  }
  phase1Assert(syntax.some((s) => isDeepStrictEqual(s.sourceRange, p.sourceRange)));
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    const r = v as Record<string, unknown>;
    if (r.scope !== undefined) {
      const ref = ScopedRefSchema.parse(r);
      phase1Assert(
        ref.scope === 'REPOSITORY' &&
          ref.repositoryId === c.basis.repositoryId &&
          ref.entity.revisionId === c.basis.revisionId &&
          ref.entity.kind === 'CODE_NODE' &&
          codeIds.has(String(ref.entity.id)) &&
          c.nodes.some((n) => String(n.id) === String(ref.entity.id)),
      );
      return;
    }
    for (const [k, x] of Object.entries(r)) {
      if (k === 'schemaRef' || k.endsWith('SchemaRef')) phase1Assert(x === null);
      visit(x);
    }
  };
  visit(p.proposal);
  if (p.proposal.kind === 'DATA_OPERATION')
    phase1Assert((p.proposal.operation === 'WATCH') === (p.proposal.handlerRef !== null));
  const key = frameworkDraftKey(c, p.sourceRange, p.proposal, d.support);
  phase1Assert(p.draftKey === key);
  return freeze(d);
}

type DraftFields = Pick<
  FrameworkDraft['value']['payload'],
  'framework' | 'ruleId' | 'sourceRange' | 'proposal'
> &
  Pick<FrameworkDraft, 'support'>;
function frameworkDraftKey(
  c: FrameworkContext,
  sourceRange: DraftFields['sourceRange'],
  proposal: DraftFields['proposal'],
  support: DraftFields['support'],
): string {
  const syntaxKeys = [
    ...new Set(
      support
        .filter((s) => s.kind === 'SYNTAX')
        .map((s) => {
          const item = c.syntaxEvidence.find((v) => v.id === s.id);
          phase1Assert(item);
          return item!.syntaxKey;
        }),
    ),
  ].sort();
  return (
    'framework-draft:' +
    createHash('sha256')
      .update(
        'codeatlas-framework-draft-v1\0' +
          canonical({ basis: c.basis, sourceRange, proposal, syntaxKeys }),
      )
      .digest('hex')
  );
}
/** Private creation from an already validated Context4; uses the same strict draft checks. */
export function createFrameworkDraftFromValidatedContext(
  c: FrameworkContext,
  input: DraftFields,
): FrameworkDraft {
  const { support, ...fields } = input;
  return validateFromContext(c, {
    capability: 'FRAMEWORK_DRAFT',
    value: {
      schema: 'codeatlas.framework-draft',
      version: 1,
      payload: {
        ...fields,
        basis: c.basis,
        draftKey: frameworkDraftKey(c, fields.sourceRange, fields.proposal, support),
      },
    },
    support,
  });
}
