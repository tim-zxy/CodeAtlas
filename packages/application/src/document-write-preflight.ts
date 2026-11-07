import { types } from 'node:util';
import {
  DocumentSchema,
  DocumentRevisionSchema,
  ensurePhase1Data,
  RepositoryRelativePathSchema,
} from '@codeatlas/ir';
import { assembleDocumentDraft, type DocumentDraft } from '../../documents/dist/document-draft.js';
import { parseDocument, type DocumentParseInput } from '../../documents/dist/parse-document.js';
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
function invalidInput(): never {
  throw Object.assign(new Error('INVALID_DOCUMENT_INPUT'), { code: 'INVALID_DOCUMENT_INPUT' });
}
function ownDataProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) invalidInput();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalidInput();
  return descriptor.value;
}
function errorProperty(error: unknown, key: string): unknown {
  try {
    return error !== null && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptor(error, key)?.value
      : undefined;
  } catch {
    return undefined;
  }
}
function fail(error: unknown, source: Source, account: DocumentAccount): never {
  let invalidationFailed = false;
  try {
    account.invalidate();
  } catch {
    invalidationFailed = true;
  }
  const code = errorProperty(error, 'code');
  const failure = new DocumentWritePreflightError(
    typeof code === 'string' && safeCodes.has(code) ? code : 'DOCUMENT_PREFLIGHT_FAILED',
    source.effects,
  );
  if (invalidationFailed || errorProperty(error, 'cleanupState') === 'UNKNOWN')
    Object.assign(failure, { cleanupState: 'UNKNOWN' });
  throw failure;
}
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset')!.get!;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
function snapshotBytes(value: unknown, account: DocumentAccount): Buffer {
  account.checkpoint();
  if (!types.isUint8Array(value) || types.isProxy(value)) invalidInput();
  const backing = bufferGetter.call(value) as ArrayBuffer;
  if (types.isSharedArrayBuffer(backing)) invalidInput();
  const offset = offsetGetter.call(value) as number;
  const length = lengthGetter.call(value) as number;
  account.reserveBuffer(length);
  const bytes = Buffer.from(new Uint8Array(backing, offset, length));
  account.checkpoint();
  return bytes;
}
async function inspectAndRecheck(
  source: Source,
  bytes: Uint8Array,
  draft: DocumentDraft,
  account: DocumentAccount,
) {
  const scan = inspectDocumentSecrets(bytes, draft, account);
  await source.verifySelection();
  account.checkpoint();
  return Object.freeze({
    status: 'NOT_COMMITTED' as const,
    reason: scan.detected ? ('SECRET_DETECTED' as const) : ('SECRET_COVERAGE_INCOMPLETE' as const),
    scan,
    sourceEffects: source.effects,
  });
}

const revisionMetadata = DocumentRevisionSchema.pick({
  id: true,
  documentId: true,
  sourceFingerprint: true,
  policyVersion: true,
  sourceBasis: true,
});
/** Offline/private Source-to-parser preparation. The trusted Application owner
 * supplies Source, workspace metadata and opaque IDs; this structural interface
 * does not authenticate them or enable production writes. No Store is called. */
export async function checkParsedDocumentWrite(input: {
  source: Source;
  path: string;
  metadata: DocumentParseInput;
  account: DocumentAccount;
}) {
  const { source, account } = input;
  try {
    account.checkpoint();
    const path = RepositoryRelativePathSchema.parse(input.path);
    const metadata = input.metadata;
    const documentInput = ownDataProperty(metadata, 'document');
    const revisionInput = ownDataProperty(metadata, 'revision');
    const allocateId = ownDataProperty(metadata, 'allocateId');
    if (Reflect.ownKeys(metadata).length !== 3 || typeof allocateId !== 'function') invalidInput();
    account.own(documentInput);
    account.own(revisionInput);
    ensurePhase1Data(documentInput);
    ensurePhase1Data(revisionInput);
    account.own(documentInput);
    account.own(revisionInput);
    // Strict IR parsing creates independent metadata before the asynchronous read.
    const document = DocumentSchema.parse(documentInput);
    const revision = revisionMetadata.parse(revisionInput);
    if (
      document.logicalPath !== path ||
      document.repositoryId !== source.observation.repositoryId ||
      revision.documentId !== document.id ||
      (document.currentRevisionId !== null && document.currentRevisionId !== revision.id)
    )
      invalidInput();
    const basis = revision.sourceBasis;
    if ('documentId' in basis) {
      if (
        basis.documentId !== document.id ||
        basis.documentRevisionId !== revision.id ||
        basis.contentFingerprint !== revision.sourceFingerprint
      )
        invalidInput();
    } else if (basis.repositoryId !== document.repositoryId) invalidInput();
    const fixed: DocumentParseInput = {
      document,
      revision,
      allocateId: allocateId as DocumentParseInput['allocateId'],
    };
    const raw = await source.readDocumentBytes(path);
    // Allocators may retain the Source transport buffer. Keep this private copy
    // for both parser and scanner so their source basis cannot diverge in memory.
    const bytes = snapshotBytes(ownDataProperty(raw, 'bytes'), account);
    if (ownDataProperty(raw, 'contentFingerprint') !== revision.sourceFingerprint)
      throw Object.assign(new Error('DOCUMENT_SOURCE_MISMATCH'), {
        code: 'DOCUMENT_SOURCE_MISMATCH',
      });
    const draft = parseDocument(bytes, fixed, account);
    return await inspectAndRecheck(source, bytes, draft, account);
  } catch (error) {
    return fail(error, source, account);
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
    return await inspectAndRecheck(source, raw.bytes, draft, account);
  } catch (error) {
    return fail(error, source, account);
  }
}
