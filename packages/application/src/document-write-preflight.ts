import { ensurePhase1Data, RepositoryRelativePathSchema } from '@codeatlas/ir';
import { assembleDocumentDraft } from '../../documents/dist/document-draft.js';
import { inspectDocumentSecrets } from '../../documents/dist/secret-preflight.js';
import type { DocumentAccount } from '../../documents/dist/source-positions.js';
import type prepareMixedSource from './mixed-source-workflow.js';

type Prepared = Awaited<ReturnType<typeof prepareMixedSource>>;
type Source = Pick<Prepared, 'observation' | 'effects' | 'readDocumentBytes' | 'verifySelection'>;
const safeCodes = new Set([
  'CANCELLED',
  'DEADLINE_EXCEEDED',
  'STAGE_RELEASED',
  'HISTORY_LIMIT_EXCEEDED',
  'STAGE_LIMIT_EXCEEDED',
  'PERMISSION_DENIED',
  'SECURITY_POLICY_BLOCKED',
  'SOURCE_CHANGED',
  'SOURCE_STATE_CONFLICT',
  'DOCUMENT_SOURCE_MISMATCH',
  'INVALID_DOCUMENT_INPUT',
  'INVALID_DOCUMENT_RANGE',
  'SEMANTIC_CLAIMS_REQUIRE_WORKFLOW',
]);
export class DocumentWritePreflightError extends Error {
  constructor(
    readonly code: string,
    readonly sourceEffects: Prepared['effects'],
  ) {
    super(code);
    this.name = 'DocumentWritePreflightError';
  }
}
/** Private deny-only write preparation. No parser/scan clearance, Store callback,
 * publication capability or remote path. A no-known-pattern result still cannot write. */
export async function checkDocumentWrite(input: {
  source: Source;
  path: string;
  envelope: unknown;
  account: DocumentAccount;
}) {
  const { source, account } = input;
  try {
    account.checkpoint();
    const path = RepositoryRelativePathSchema.parse(input.path);
    const repositoryId = source.observation.repositoryId;
    account.own(input.envelope);
    ensurePhase1Data(input.envelope);
    account.own(input.envelope);
    const envelope = structuredClone(input.envelope);
    // Refuse known scope/locator conflicts before opening any selected Source file.
    const document = (
      envelope as {
        payload?: { document?: { logicalPath?: unknown; repositoryId?: unknown } };
      } | null
    )?.payload?.document;
    if (!document || document.logicalPath !== path || document.repositoryId !== repositoryId)
      throw Object.assign(new Error('INVALID_DOCUMENT_INPUT'), { code: 'INVALID_DOCUMENT_INPUT' });
    const raw = await source.readDocumentBytes(path);
    const draft = assembleDocumentDraft(raw.bytes, envelope, account);
    if (
      draft.payload.document.logicalPath !== path ||
      draft.payload.document.repositoryId !== repositoryId
    )
      throw Object.assign(new Error('INVALID_DOCUMENT_INPUT'), { code: 'INVALID_DOCUMENT_INPUT' });
    const scan = inspectDocumentSecrets(raw.bytes, draft, account);
    await source.verifySelection();
    account.checkpoint();
    return Object.freeze({
      status: 'NOT_COMMITTED' as const,
      reason: scan.detected
        ? ('SECRET_DETECTED' as const)
        : ('SECRET_COVERAGE_INCOMPLETE' as const),
      scan,
      sourceEffects: source.effects,
    });
  } catch (error) {
    account.invalidate();
    const code =
      error !== null && typeof error === 'object'
        ? (Object.getOwnPropertyDescriptor(error, 'code')?.value as unknown)
        : undefined;
    const failure = new DocumentWritePreflightError(
      typeof code === 'string' && safeCodes.has(code) ? code : 'DOCUMENT_PREFLIGHT_FAILED',
      source.effects,
    );
    if (
      error !== null &&
      typeof error === 'object' &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN'
    )
      Object.assign(failure, { cleanupState: 'UNKNOWN' });
    throw failure;
  }
}
