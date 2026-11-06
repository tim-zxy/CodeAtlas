import { ensurePhase1Data, parseDocumentBundle } from '@codeatlas/ir';
import {
  documentSourceGeometry,
  DocumentDraftError,
  type DocumentAccount,
} from './source-positions.js';
export type DocumentDraft = ReturnType<typeof parseDocumentBundle>;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Structural-only composition. Does not parse Markdown, authenticate capture or approve persistence. */
export function assembleDocumentDraft(
  source: Uint8Array,
  envelope: unknown,
  account: DocumentAccount,
): DocumentDraft {
  try {
    const geometry = documentSourceGeometry(source, account);
    account.own(envelope);
    ensurePhase1Data(envelope);
    // Prepay the strict IR parser's independent copy against this same account.
    account.own(envelope);
    const draft = parseDocumentBundle(envelope);
    const payload = draft.payload;
    if (payload.revision.sourceFingerprint !== geometry.fingerprint)
      throw new DocumentDraftError('DOCUMENT_SOURCE_MISMATCH');
    if (payload.claims.length) throw new DocumentDraftError('SEMANTIC_CLAIMS_REQUIRE_WORKFLOW');
    for (const group of [
      payload.sections,
      payload.blocks,
      payload.tables,
      payload.links,
      payload.codeSnippets,
      payload.mentions,
    ])
      for (const item of group) {
        account.checkpoint();
        account.visitItem();
        geometry.assertRange('sourceRange' in item ? item.sourceRange : item.textRange);
      }
    for (const diagnostic of payload.revision.diagnostics) {
      account.checkpoint();
      account.visitItem();
      if (diagnostic.sourceRange) geometry.assertRange(diagnostic.sourceRange);
    }
    const result = freeze(draft);
    account.checkpoint();
    return result;
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
