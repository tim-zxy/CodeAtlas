import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {
  DocumentSchema,
  DocumentRevisionSchema,
  EntityIdSchema,
  Phase1DigestSchema,
  Phase1ExactStringSchema,
  ensurePhase1Data,
} from '@codeatlas/ir';
import { assembleDocumentDraft, type DocumentDraft } from './document-draft.js';
import {
  documentSourceGeometry,
  mapMarkdownOffsets,
  DocumentDraftError,
  type DocumentAccount,
} from './source-positions.js';

type Bundle = DocumentDraft['payload'];
type EntityKind =
  | 'DOCUMENT_SECTION'
  | 'DOCUMENT_BLOCK'
  | 'DOCUMENT_LINK'
  | 'DOCUMENT_TABLE'
  | 'DOCUMENT_CODE_SNIPPET';
export interface DocumentParseInput {
  document: Bundle['document'];
  revision: Pick<
    Bundle['revision'],
    'id' | 'documentId' | 'sourceFingerprint' | 'policyVersion' | 'sourceBasis'
  >;
  /** Trusted caller allocation only: no title/path/content identity inference. */
  allocateId(kind: EntityKind): string;
}
export const MARKDOWN_PARSER_VERSION =
  'codeatlas-markdown-adapter-v1.2/unified-11.0.5/remark-parse-11.0.0/remark-gfm-4.0.1';
type Ast = {
  type: string;
  position: { start: { offset: number }; end: { offset: number } };
  children?: Ast[];
  value?: string;
  depth?: number;
  lang?: string | null;
  meta?: string | null;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  align?: (string | null)[];
  url?: string;
  identifier?: string;
};
const revisionMetadata = DocumentRevisionSchema.pick({
  id: true,
  documentId: true,
  sourceFingerprint: true,
  policyVersion: true,
  sourceBasis: true,
});
const arrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(arrayPrototype, 'buffer')!.get!;
const offsetGetter = Object.getOwnPropertyDescriptor(arrayPrototype, 'byteOffset')!.get!;
const lengthGetter = Object.getOwnPropertyDescriptor(arrayPrototype, 'byteLength')!.get!;
const digest = (text: string) =>
  Phase1DigestSchema.parse(createHash('sha256').update(text).digest('hex'));

/** Private structural parser. Source permission, genuine scan clearance, entity
 * resolution and publication remain Application responsibilities. Parsing is
 * synchronous: account checks surround parser execution, not its internal work;
 * no physical RSS/time or interruptible-parser guarantee is supplied here. */
export function parseDocument(
  source: Uint8Array,
  input: DocumentParseInput,
  account: DocumentAccount,
): DocumentDraft {
  try {
    account.checkpoint();
    // Validate and independently clone metadata before invoking any allocator.
    account.own(input.document);
    account.own(input.revision);
    ensurePhase1Data(input.document);
    ensurePhase1Data(input.revision);
    account.own(input.document);
    account.own(input.revision);
    const document = DocumentSchema.parse(input.document);
    const revision = revisionMetadata.parse(input.revision);
    const allocator = input.allocateId;
    if (typeof allocator !== 'function' || !types.isUint8Array(source) || types.isProxy(source))
      throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    const allocateId = (kind: EntityKind) => {
      account.checkpoint();
      const value = allocator(kind);
      account.own(value);
      return EntityIdSchema.parse(value);
    };
    const backing = bufferGetter.call(source) as ArrayBuffer;
    if (types.isSharedArrayBuffer(backing)) throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    const length = lengthGetter.call(source) as number;
    account.reserveBuffer(length);
    const bytes = Buffer.from(new Uint8Array(backing, offsetGetter.call(source), length));
    const geometry = documentSourceGeometry(bytes, account);
    if (geometry.fingerprint !== revision.sourceFingerprint)
      throw new DocumentDraftError('DOCUMENT_SOURCE_MISMATCH');
    const raw = bytes.toString('utf8');
    account.own(raw);
    account.checkpoint();
    const tree = unified().use(remarkParse).use(remarkGfm).parse(raw) as unknown as Ast;
    account.checkpoint();
    account.own(tree);
    const nodes: Ast[] = [];
    const definitions = new Map<string, Ast>();
    function collect(node: Ast): void {
      account.checkpoint();
      account.visitItem();
      account.own(node.position);
      nodes.push(node);
      if (node.type === 'definition' && !definitions.has(node.identifier!)) {
        account.own(node.identifier);
        definitions.set(node.identifier!, node);
      }
      for (const child of node.children ?? []) collect(child);
    }
    collect(tree);
    account.own(nodes);
    const mapped = mapMarkdownOffsets(
      bytes,
      nodes.flatMap((n) => [n.position.start.offset, n.position.end.offset]),
      account,
    );
    const ranges = new Map<Ast, Bundle['blocks'][number]['sourceRange']>();
    nodes.forEach((node, index) => {
      const start = mapped[index * 2]!,
        end = mapped[index * 2 + 1]!;
      const range = {
        documentRevisionId: revision.id,
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
      };
      account.own(range);
      ranges.set(node, range);
    });
    const range = (node: Ast) => ranges.get(node)!;
    // remark omits one initial BOM from its offset accounting.
    const literal = (node: Ast) =>
      raw.slice(
        node.position.start.offset + geometry.leadingBomUtf16Units,
        node.position.end.offset + geometry.leadingBomUtf16Units,
      );
    const sections: Bundle['sections'] = [],
      blocks: Bundle['blocks'] = [],
      links: Bundle['links'] = [],
      tables: Bundle['tables'] = [],
      codeSnippets: Bundle['codeSnippets'] = [],
      diagnostics: Bundle['revision']['diagnostics'] = [];
    const stack: Bundle['sections'] = [];
    let partial = false;
    function limitation(node: Ast, code: string): void {
      partial = true;
      const item = { code, sourceRange: range(node) };
      account.own(item);
      diagnostics.push(item);
    }
    const linkTarget = (node: Ast) =>
      node.type === 'link' ? node.url : definitions.get(node.identifier!)?.url;
    function text(node: Ast): string {
      account.checkpoint();
      account.visitItem();
      if (node.type === 'text' || node.type === 'inlineCode') return node.value!;
      if (node.type === 'break') return '\n';
      if (
        (node.type === 'link' || node.type === 'linkReference') &&
        !Phase1ExactStringSchema.safeParse(linkTarget(node)).success
      )
        return literal(node);
      if (
        [
          'emphasis',
          'strong',
          'delete',
          'link',
          'linkReference',
          'paragraph',
          'tableCell',
          'heading',
        ].includes(node.type)
      )
        return (node.children ?? []).map(text).join('');
      limitation(node, 'MARKDOWN_INLINE_PRESERVED_AS_TEXT');
      return literal(node);
    }
    const ref = (id: Bundle['blocks'][number]['id']) => ({
      kind: 'DOCUMENT_BLOCK' as const,
      id,
      revisionId: revision.id,
    });
    function extractLinks(node: Ast, blockId: Bundle['blocks'][number]['id']): void {
      account.checkpoint();
      account.visitItem();
      if (node.type === 'link' || node.type === 'linkReference') {
        const target = linkTarget(node);
        const parsedTarget = Phase1ExactStringSchema.safeParse(target);
        if (parsedTarget.success) {
          const item: Bundle['links'][number] = {
            id: allocateId('DOCUMENT_LINK'),
            documentRevisionId: revision.id,
            blockRef: ref(blockId),
            sourceRange: range(node),
            typedContent: {
              label: (node.children ?? []).map(text).join(''),
              target: parsedTarget.data,
              resolution: /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(parsedTarget.data)
                ? 'EXTERNAL'
                : 'UNRESOLVED',
              targetRef: null,
              candidates: [],
            },
          };
          account.own(item);
          links.push(item);
        } else
          limitation(
            node,
            target === undefined
              ? 'MARKDOWN_REFERENCE_UNRESOLVED'
              : 'MARKDOWN_LINK_TARGET_NOT_TYPED',
          );
      }
      for (const child of node.children ?? []) extractLinks(child, blockId);
    }
    for (const node of tree.children ?? []) {
      account.checkpoint();
      account.visitItem();
      if (node.type === 'heading') {
        while (stack.length && stack.at(-1)!.headingLevel >= node.depth!) stack.pop();
        const section = {
          id: allocateId('DOCUMENT_SECTION'),
          documentRevisionId: revision.id,
          parentSectionId: stack.at(-1)?.id ?? null,
          headingLevel: node.depth!,
          title: text(node),
          ordinal: sections.length,
          sourceRange: range(node),
        };
        account.own(section);
        sections.push(section);
        stack.push(section);
      }
      const base = {
        id: allocateId('DOCUMENT_BLOCK'),
        documentRevisionId: revision.id,
        sectionId: stack.at(-1)?.id ?? null,
        ordinal: blocks.length,
        sourceRange: range(node),
      };
      let block: Bundle['blocks'][number];
      if (node.type === 'heading')
        block = { ...base, kind: 'HEADING', payload: { text: text(node), level: node.depth! } };
      else if (node.type === 'paragraph')
        block = { ...base, kind: 'PARAGRAPH', payload: { text: text(node) } };
      else if (
        node.type === 'code' &&
        node.lang != null &&
        !Phase1ExactStringSchema.safeParse(node.lang).success
      ) {
        block = { ...base, kind: 'OTHER', payload: { text: literal(node) } };
        limitation(node, 'MARKDOWN_CODE_LANGUAGE_NOT_TYPED');
      } else if (node.type === 'code') {
        block = {
          ...base,
          kind: 'CODE',
          payload: {
            language: node.lang || null,
            text: node.value!,
            contentDigest: digest(node.value!),
          },
        };
        codeSnippets.push({
          id: allocateId('DOCUMENT_CODE_SNIPPET'),
          documentRevisionId: revision.id,
          blockRef: ref(base.id),
          sourceRange: range(node),
          typedContent: {
            language: block.payload.language,
            textDigest: block.payload.contentDigest,
          },
        });
        if (node.meta) limitation(node, 'MARKDOWN_CODE_META_NOT_TYPED');
      } else if (node.type === 'table') {
        const width = node.children![0]!.children!.length;
        if (node.children!.some((row) => row.children!.length !== width)) {
          // GFM permits short/long rows; Canonical tables require equal widths.
          // Preserve all original cells rather than padding or dropping content.
          block = { ...base, kind: 'OTHER', payload: { text: literal(node) } };
          limitation(node, 'MARKDOWN_TABLE_ROW_WIDTH_NOT_TYPED');
        } else {
          const rows = node.children!.map((row) => row.children!.map(text));
          const payload = { headers: rows[0]!, rows: rows.slice(1) };
          block = { ...base, kind: 'TABLE', payload };
          tables.push({
            id: allocateId('DOCUMENT_TABLE'),
            documentRevisionId: revision.id,
            blockRef: ref(base.id),
            sourceRange: range(node),
            typedContent: payload,
          });
          if (node.align?.some((alignment) => alignment !== null))
            limitation(node, 'MARKDOWN_TABLE_ALIGNMENT_NOT_TYPED');
        }
      } else if (
        node.type === 'list' &&
        node.children!.every(
          (item) =>
            item.checked == null && item.children!.every((child) => child.type === 'paragraph'),
        )
      ) {
        block = {
          ...base,
          kind: 'LIST',
          payload: {
            ordered: node.ordered!,
            items: node.children!.map((item) => ({
              text: item.children!.map(text).join('\n\n'),
              blockRefs: [],
            })),
          },
        };
        if (node.ordered && node.start !== 1) limitation(node, 'MARKDOWN_LIST_START_NOT_TYPED');
      } else if (
        node.type === 'blockquote' &&
        node.children!.every((child) => child.type === 'paragraph')
      )
        block = {
          ...base,
          kind: 'QUOTE',
          payload: { text: node.children!.map(text).join('\n\n') },
        };
      else {
        block = { ...base, kind: 'OTHER', payload: { text: literal(node) } };
        limitation(node, 'MARKDOWN_BLOCK_PRESERVED_AS_OTHER');
      }
      account.own(block);
      blocks.push(block);
      extractLinks(node, base.id);
    }
    const envelope = {
      schema: 'codeatlas.document-bundle',
      version: 1,
      payload: {
        document,
        revision: {
          ...revision,
          parserVersion: MARKDOWN_PARSER_VERSION,
          blockRefs: blocks.map((block) => ref(block.id)),
          diagnostics,
          completeness: partial ? 'PARTIAL' : 'COMPLETE',
        },
        externalRefs: [],
        supportInventory: [],
        sections,
        blocks,
        tables,
        links,
        codeSnippets,
        mentions: [],
        chunks: [],
        claims: [],
      },
    };
    account.own(envelope);
    return assembleDocumentDraft(bytes, envelope, account);
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
