import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { EntityRefSchema, SourceRangeSchema } from './references.js';
import { ConfidenceSchema } from './confidence.js';
import { ContentFingerprintSchema, RepositoryRelativePathSchema } from './source-identity.js';
import { JsonValueSchema } from './envelope.js';
import { IrValidationError } from './errors.js';
import {
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  Phase1ExactStringSchema as Text,
  Phase1OrdinalSchema as Ordinal,
  Phase1DigestSchema,
  RepoBasisSchema,
  DocumentBasisSchema,
  ScopedRefSchema,
  Phase1ScopedRefsSchema,
  SupportRefSchema,
  Phase1SupportRefsSchema,
  KnowledgeScopeSchema,
  Phase1ReferenceContextSchema,
  parsePhase1Envelope,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertScopedRef,
  assertSupportRefs,
  assertUnique,
  type Phase1ReferenceContext,
} from './phase1-support.js';
export const DocumentRangeSchema = z
  .strictObject({
    documentRevisionId: DocumentRevisionIdSchema,
    startLine: SourceRangeSchema.shape.startLine,
    startColumn: SourceRangeSchema.shape.startColumn,
    endLine: SourceRangeSchema.shape.endLine,
    endColumn: SourceRangeSchema.shape.endColumn,
  })
  .superRefine((r, c) => {
    if (r.endLine < r.startLine || (r.endLine === r.startLine && r.endColumn < r.startColumn))
      c.addIssue({ code: 'custom', message: 'Range ends before start' });
  });
export const DocumentSchema = z.strictObject({
  id: DocumentIdSchema,
  workspaceId: EntityIdSchema,
  repositoryId: EntityIdSchema.nullable(),
  logicalPath: RepositoryRelativePathSchema,
  mediaType: z.literal('text/markdown'),
  sourceKind: z.enum(['MARKDOWN', 'ADR']),
  currentRevisionId: DocumentRevisionIdSchema.nullable(),
});
export const DocumentRevisionSchema = z.strictObject({
  id: DocumentRevisionIdSchema,
  documentId: DocumentIdSchema,
  sourceFingerprint: ContentFingerprintSchema,
  parserVersion: Text,
  policyVersion: Text,
  sourceBasis: z.union([RepoBasisSchema, DocumentBasisSchema]),
  blockRefs: z.array(EntityRefSchema),
  diagnostics: z.array(z.strictObject({ code: Text, sourceRange: DocumentRangeSchema.nullable() })),
  completeness: z.enum(['COMPLETE', 'PARTIAL']),
});
export const DocumentSectionSchema = z.strictObject({
  id: EntityIdSchema,
  documentRevisionId: DocumentRevisionIdSchema,
  parentSectionId: EntityIdSchema.nullable(),
  headingLevel: z.number().int().min(1).max(6),
  title: z.string(),
  ordinal: Ordinal,
  sourceRange: DocumentRangeSchema,
});
const BlockBase = {
  id: EntityIdSchema,
  documentRevisionId: DocumentRevisionIdSchema,
  sectionId: EntityIdSchema.nullable(),
  ordinal: Ordinal,
  sourceRange: DocumentRangeSchema,
};
export const DocumentTableContentSchema = z
  .strictObject({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) })
  .superRefine((v, c) => {
    if (v.rows.some((row) => row.length !== v.headers.length))
      c.addIssue({ code: 'custom', message: 'Table row width differs from header' });
  });
export const DocumentBlockSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...BlockBase,
    kind: z.literal('HEADING'),
    payload: z.strictObject({ text: z.string(), level: z.number().int().min(1).max(6) }),
  }),
  z.strictObject({
    ...BlockBase,
    kind: z.enum(['PARAGRAPH', 'QUOTE', 'OTHER']),
    payload: z.strictObject({ text: z.string() }),
  }),
  z.strictObject({
    ...BlockBase,
    kind: z.literal('LIST'),
    payload: z.strictObject({
      ordered: z.boolean(),
      items: z.array(z.strictObject({ text: z.string(), blockRefs: z.array(EntityRefSchema) })),
    }),
  }),
  z.strictObject({
    ...BlockBase,
    kind: z.literal('CODE'),
    payload: z.strictObject({
      language: Text.nullable(),
      text: z.string(),
      contentDigest: Phase1DigestSchema,
    }),
  }),
  z.strictObject({ ...BlockBase, kind: z.literal('TABLE'), payload: DocumentTableContentSchema }),
]);
const LinkedBase = {
  id: EntityIdSchema,
  documentRevisionId: DocumentRevisionIdSchema,
  blockRef: EntityRefSchema,
  sourceRange: DocumentRangeSchema,
};
export const DocumentTableSchema = z.strictObject({
  ...LinkedBase,
  typedContent: DocumentTableContentSchema,
});
export const DocumentLinkSchema = z
  .strictObject({
    ...LinkedBase,
    typedContent: z.strictObject({
      label: z.string(),
      target: Text,
      resolution: z.enum(['RESOLVED', 'AMBIGUOUS', 'UNRESOLVED', 'EXTERNAL']),
      targetRef: ScopedRefSchema.nullable(),
      candidates: Phase1ScopedRefsSchema,
    }),
  })
  .superRefine((v, c) => {
    if ((v.typedContent.resolution === 'RESOLVED') !== (v.typedContent.targetRef !== null))
      c.addIssue({ code: 'custom', message: 'Link target disagrees with resolution' });
  });
export const DocumentCodeSnippetSchema = z.strictObject({
  ...LinkedBase,
  typedContent: z.strictObject({ language: Text.nullable(), textDigest: Phase1DigestSchema }),
});
export const DocumentEntityMentionSchema = z.strictObject({
  id: EntityIdSchema,
  documentRevisionId: DocumentRevisionIdSchema,
  blockRef: EntityRefSchema,
  textRange: DocumentRangeSchema,
  resolution: z.enum(['EXACT', 'HEURISTIC', 'AMBIGUOUS', 'UNRESOLVED', 'UNSUPPORTED']),
  candidateRefs: Phase1ScopedRefsSchema,
});
export const DocumentChunkSchema = z.strictObject({
  id: EntityIdSchema,
  documentRevisionId: DocumentRevisionIdSchema,
  blockRefs: z.array(EntityRefSchema).min(1),
  contentDigest: Phase1DigestSchema,
  ordinal: Ordinal,
});
export const ClaimSchema = z.strictObject({
  id: EntityIdSchema,
  subject: ScopedRefSchema,
  predicate: Text,
  value: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('LITERAL'), value: JsonValueSchema }),
    z.strictObject({ kind: z.literal('ENTITY'), ref: ScopedRefSchema }),
  ]),
  scope: KnowledgeScopeSchema,
  stateIntent: z.enum(['CURRENT', 'TARGET', 'HISTORICAL', 'TRANSITION', 'DESIRED']),
  claimKind: z.enum(['OBSERVED', 'DECLARED', 'INFERRED', 'CURATED']),
  evidenceRefs: Phase1SupportRefsSchema,
  confidence: ConfidenceSchema,
  authority: z.enum(['OBSERVED', 'DECLARED', 'AUTHORITATIVE', 'CURATED']),
});
export type Claim = z.infer<typeof ClaimSchema>;
function validateClaim(claim: Claim, context: Phase1ReferenceContext): void {
  assertScopedRef(claim.subject, context);
  if (claim.value.kind === 'ENTITY') assertScopedRef(claim.value.ref, context);
  assertSupportRefs(claim.evidenceRefs, context);
  if (claim.scope.kind === 'REPOSITORY')
    phase1Assert(
      claim.subject.scope === 'REPOSITORY' &&
        claim.subject.repositoryId === claim.scope.repositoryId,
    );
  if (claim.scope.kind === 'CROSS_REPO' && claim.subject.scope === 'REPOSITORY')
    phase1Assert(claim.scope.repositoryIds.includes(claim.subject.repositoryId));
}
export function parseClaim(input: unknown, contextInput: unknown) {
  const result = parsePhase1Envelope('codeatlas.claim', ClaimSchema, input);
  validateClaim(result.payload, parsePhase1ReferenceContext(contextInput));
  return result;
}
const DocumentBundleObjectSchema = z.strictObject({
  document: DocumentSchema,
  revision: DocumentRevisionSchema,
  externalRefs: Phase1ScopedRefsSchema,
  supportInventory: z.array(SupportRefSchema),
  sections: z.array(DocumentSectionSchema),
  blocks: z.array(DocumentBlockSchema),
  tables: z.array(DocumentTableSchema),
  links: z.array(DocumentLinkSchema),
  codeSnippets: z.array(DocumentCodeSnippetSchema),
  mentions: z.array(DocumentEntityMentionSchema),
  chunks: z.array(DocumentChunkSchema),
  claims: z.array(ClaimSchema),
});
type DocumentBundle = z.infer<typeof DocumentBundleObjectSchema>;
function validateBundle(v: DocumentBundle): void {
  phase1Assert(
    v.revision.documentId === v.document.id &&
      (v.document.currentRevisionId === null || v.document.currentRevisionId === v.revision.id),
  );
  if ('repositoryId' in v.revision.sourceBasis)
    phase1Assert(v.document.repositoryId === v.revision.sourceBasis.repositoryId);
  else
    phase1Assert(
      v.revision.sourceBasis.documentId === v.document.id &&
        v.revision.sourceBasis.documentRevisionId === v.revision.id &&
        v.revision.sourceBasis.contentFingerprint === v.revision.sourceFingerprint,
    );
  const groups = [
    ['DOCUMENT_SECTION', v.sections],
    ['DOCUMENT_BLOCK', v.blocks],
    ['DOCUMENT_TABLE', v.tables],
    ['DOCUMENT_LINK', v.links],
    ['DOCUMENT_CODE_SNIPPET', v.codeSnippets],
    ['DOCUMENT_ENTITY_MENTION', v.mentions],
    ['DOCUMENT_CHUNK', v.chunks],
  ] as const;
  const ids = [
    ...v.sections,
    ...v.blocks,
    ...v.tables,
    ...v.links,
    ...v.codeSnippets,
    ...v.mentions,
    ...v.chunks,
  ];
  assertUnique(ids.map((x) => x.id));
  for (const item of ids) {
    phase1Assert(item.documentRevisionId === v.revision.id);
    const range =
      'sourceRange' in item ? item.sourceRange : 'textRange' in item ? item.textRange : null;
    if (range) phase1Assert(range.documentRevisionId === v.revision.id);
  }
  assertUnique(v.sections.map((s) => s.ordinal));
  assertUnique(v.blocks.map((s) => s.ordinal));
  assertUnique(v.chunks.map((s) => s.ordinal));
  const sections = new Map(v.sections.map((s) => [s.id, s]));
  const blocks = new Map(v.blocks.map((b) => [b.id, b]));
  function block(ref: z.infer<typeof EntityRefSchema>) {
    phase1Assert(
      ref.kind === 'DOCUMENT_BLOCK' && ref.revisionId === v.revision.id && blocks.has(ref.id),
    );
    return blocks.get(ref.id)!;
  }
  phase1Assert(v.revision.blockRefs.length === v.blocks.length);
  assertUnique(v.revision.blockRefs.map((ref) => ref.id));
  for (const ref of v.revision.blockRefs) block(ref);
  for (const section of v.sections) {
    const seen = new Set<string>([section.id]);
    let current = section;
    while (current.parentSectionId !== null) {
      const parent = sections.get(current.parentSectionId);
      phase1Assert(parent && !seen.has(parent.id) && parent.headingLevel < current.headingLevel);
      seen.add(parent.id);
      current = parent;
    }
  }
  for (const b of v.blocks) {
    if (b.sectionId !== null) phase1Assert(sections.has(b.sectionId));
    if (b.kind === 'LIST')
      for (const item of b.payload.items) for (const ref of item.blockRefs) block(ref);
  }
  for (const table of v.tables) {
    const b = block(table.blockRef);
    phase1Assert(b.kind === 'TABLE' && isDeepStrictEqual(b.payload, table.typedContent));
  }
  for (const snippet of v.codeSnippets) {
    const b = block(snippet.blockRef);
    phase1Assert(
      b.kind === 'CODE' &&
        b.payload.contentDigest === snippet.typedContent.textDigest &&
        b.payload.language === snippet.typedContent.language,
    );
  }
  for (const link of v.links) block(link.blockRef);
  for (const mention of v.mentions) block(mention.blockRef);
  for (const chunk of v.chunks) {
    assertUnique(chunk.blockRefs.map((r) => r.id));
    for (const ref of chunk.blockRefs) block(ref);
  }
  const availableEntities = [
    ...v.externalRefs,
    ...groups.flatMap(([kind, items]) =>
      items.map((item) => ({
        scope: 'WORKSPACE' as const,
        workspaceId: v.document.workspaceId,
        entity: { kind, id: item.id, revisionId: v.revision.id },
      })),
    ),
  ];
  const context = Phase1ReferenceContextSchema.parse({
    availableEntities,
    availableSupports: v.supportInventory,
  });
  for (const support of v.supportInventory) {
    if ('documentId' in support.basis)
      phase1Assert(
        support.basis.documentId === v.document.id &&
          support.basis.documentRevisionId === v.revision.id &&
          support.basis.contentFingerprint === v.revision.sourceFingerprint,
      );
  }
  for (const link of v.links) {
    if (link.typedContent.targetRef) assertScopedRef(link.typedContent.targetRef, context);
    for (const ref of link.typedContent.candidates) assertScopedRef(ref, context);
  }
  for (const mention of v.mentions)
    for (const ref of mention.candidateRefs) assertScopedRef(ref, context);
  for (const claim of v.claims) validateClaim(claim, context);
}
export const DocumentBundleSchema = DocumentBundleObjectSchema.superRefine((value, ctx) => {
  try {
    validateBundle(value);
  } catch (error) {
    if (!(error instanceof IrValidationError) && !(error instanceof z.ZodError)) throw error;
    ctx.addIssue({ code: 'custom', message: 'Invalid Document bundle reference closure' });
  }
});
export function parseDocumentBundle(input: unknown) {
  return parsePhase1Envelope('codeatlas.document-bundle', DocumentBundleSchema, input);
}
