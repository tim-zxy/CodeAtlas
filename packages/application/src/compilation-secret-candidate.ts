import { DocumentSchema, SourceFileSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { inspectDocumentSecretCandidate } from '../../documents/dist/secret-candidate.js';
import { maskDocumentRanges } from '../../documents/dist/document-range-mask.js';
import type { DocumentAccount } from '../../documents/dist/source-positions.js';
import {
  CompilationInputContractError,
  parseCompilationInputSnapshot,
} from './compilation-input-contract.js';

const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;

/** Private offline evaluation of exact typed captured values/support closure.
 * Schema/digest validity is not provenance or authorization. This does not read
 * original Source, own capture/permission handles, or permit consumption/writes.
 */
function prepareInspection(
  input: unknown,
  control: RuntimeRequestControl,
  account: DocumentAccount,
) {
  account.checkpoint();
  if (!control || types.isProxy(control))
    throw new CompilationInputContractError('INVALID_COMPILATION_INPUT');
  const fields = Object.getOwnPropertyDescriptors(control);
  const data = (key: keyof RuntimeRequestControl) => {
    const descriptor = fields[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new CompilationInputContractError('INVALID_COMPILATION_INPUT');
    return descriptor.value;
  };
  const fixedControl = Object.freeze({
    signal: data('signal'),
    deadlineEpochMs: data('deadlineEpochMs'),
    maxItems: data('maxItems'),
    maxDepth: data('maxDepth'),
  }) as RuntimeRequestControl;
  account.own(input);
  const snapshot = parseCompilationInputSnapshot(input, fixedControl);
  const checkpoint = () => {
    account.checkpoint();
    if (aborted.call(fixedControl.signal)) throw new CompilationInputContractError('CANCELLED');
    if (Date.now() >= fixedControl.deadlineEpochMs)
      throw new CompilationInputContractError('DEADLINE');
  };
  account.own(snapshot);
  checkpoint();
  const scopedAccount: DocumentAccount = {
    checkpoint,
    own: (value) => account.own(value),
    reserveBuffer: (size) => account.reserveBuffer(size),
    visitItem: () => account.visitItem(),
    invalidate: () => account.invalidate(),
  };
  checkpoint();
  return { snapshot, account: scopedAccount };
}

export function inspectCapturedCompilationValues(
  input: unknown,
  control: RuntimeRequestControl,
  account: DocumentAccount,
) {
  try {
    const prepared = prepareInspection(input, control, account);
    const scan = inspectDocumentSecretCandidate(
      Buffer.alloc(0),
      prepared.snapshot,
      prepared.account,
    );
    prepared.account.checkpoint();
    return Object.freeze({
      inputKind: 'CAPTURED_VALUES_ONLY' as const,
      originalSource: 'NOT_INSPECTED' as const,
      scan,
    });
  } catch (error) {
    account.invalidate();
    throw error;
  }
}

type OriginalRequirement = Readonly<{
  key: string;
  kind: 'SOURCE_FILE' | 'DOCUMENT_REVISION';
  workspaceId: string;
  repositoryId: string | null;
  revisionId: string;
  entityId: string;
  path: string;
  contentFingerprint: string;
}>;

function originalManifest({ snapshot, account }: ReturnType<typeof prepareInspection>) {
  const required = new Map<string, OriginalRequirement>();
  const add = (value: Omit<OriginalRequirement, 'key'>) => {
    account.checkpoint();
    account.visitItem();
    const key = JSON.stringify([
      value.kind,
      value.workspaceId,
      value.repositoryId,
      value.revisionId,
      value.entityId,
    ]);
    const entry = Object.freeze({ key, ...value });
    account.own(entry);
    const previous = required.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry))
      throw new CompilationInputContractError('ORIGINAL_INPUT_CONFLICT');
    required.set(key, entry);
  };
  for (const repository of snapshot.repositories) {
    for (const record of [...repository.entities, ...repository.supports]) {
      account.checkpoint();
      account.visitItem();
      if (record.valueSchemaRef !== 'SourceFile@1') continue;
      account.own(record.value);
      const file = SourceFileSchema.parse(record.value);
      if (file.classification.contentKind !== 'TEXT')
        throw new CompilationInputContractError('ORIGINAL_INPUT_UNINSPECTABLE');
      add({
        kind: 'SOURCE_FILE',
        workspaceId: snapshot.workspaceId,
        repositoryId: file.repositoryId,
        revisionId: file.revisionId,
        entityId: file.id,
        path: file.path,
        contentFingerprint: file.contentFingerprint,
      });
    }
  }
  for (const capture of snapshot.documents) {
    const record = capture.entities.find((value) => value.valueSchemaRef === 'Document@1')!;
    account.own(record.value);
    const document = DocumentSchema.parse(record.value);
    if (document.sourceKind !== 'MARKDOWN' || document.mediaType !== 'text/markdown')
      throw new CompilationInputContractError('ORIGINAL_INPUT_UNINSPECTABLE');
    add({
      kind: 'DOCUMENT_REVISION',
      workspaceId: snapshot.workspaceId,
      repositoryId: document.repositoryId,
      revisionId: capture.documentBasis.documentRevisionId,
      entityId: document.id,
      path: document.logicalPath,
      contentFingerprint: capture.documentBasis.contentFingerprint,
    });
  }
  const entries = [...required.values()].sort((a, b) => {
    account.checkpoint();
    account.visitItem();
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  Object.freeze(entries);
  account.own(entries);
  account.checkpoint();
  return Object.freeze({
    schemaVersion: 1 as const,
    status: 'PROPOSED' as const,
    scope: 'CAPTURED_SUPPORT_CLOSURE_ONLY' as const,
    snapshotId: snapshot.snapshotId,
    inputDigest: snapshot.inputDigest,
    policyVersions: snapshot.policyVersions,
    required: Object.freeze(entries),
    originalSource: 'NOT_INSPECTED' as const,
    authorization: 'NOT_ESTABLISHED' as const,
    clearance: false as const,
  });
}

/** Candidate inventory of the supplied typed closure only; never a read grant. */
export function planCompilationOriginals(
  input: unknown,
  control: RuntimeRequestControl,
  account: DocumentAccount,
) {
  try {
    return originalManifest(prepareInspection(input, control, account));
  } catch (error) {
    account.invalidate();
    throw error;
  }
}

/** Offline byte integrity/evaluation only. Caller-supplied bytes and digests do
 * not establish Source origin, per-file permission or trusted consumption. */
export function inspectSuppliedCompilationOriginals(
  input: unknown,
  originals: ReadonlyMap<string, Uint8Array>,
  control: RuntimeRequestControl,
  account: DocumentAccount,
) {
  try {
    const prepared = prepareInspection(input, control, account);
    const plan = originalManifest(prepared);
    const scoped = prepared.account;
    if (
      !originals ||
      types.isProxy(originals) ||
      Object.getPrototypeOf(originals) !== Map.prototype
    )
      throw new CompilationInputContractError('ORIGINAL_INPUT_MISMATCH');
    const size = Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get!.call(originals);
    if (size !== plan.required.length)
      throw new CompilationInputContractError('ORIGINAL_INPUT_MISMATCH');
    const supplied = new Map<string, Uint8Array>(Map.prototype.entries.call(originals));
    const keys = new Set(plan.required.map((value) => value.key));
    for (const key of supplied.keys()) {
      scoped.checkpoint();
      scoped.visitItem();
      if (!keys.has(key)) throw new CompilationInputContractError('ORIGINAL_INPUT_MISMATCH');
    }
    const finalScan = inspectDocumentSecretCandidate(Buffer.alloc(0), prepared.snapshot, scoped);
    const rules = new Set(finalScan.rules);
    for (const required of plan.required) {
      scoped.checkpoint();
      const bytes = maskDocumentRanges(supplied.get(required.key)!, [], scoped);
      if (
        'sha256:' + createHash('sha256').update(bytes).digest('hex') !==
        required.contentFingerprint
      )
        throw new CompilationInputContractError('ORIGINAL_INPUT_MISMATCH');
      const scan = inspectDocumentSecretCandidate(bytes, {}, scoped);
      for (const rule of scan.rules) rules.add(rule);
    }
    scoped.checkpoint();
    return Object.freeze({
      ...finalScan,
      detected: rules.size > 0,
      rules: Object.freeze([...rules].sort()),
      inputsChecked: plan.required.length,
      snapshotId: plan.snapshotId,
      inputDigest: plan.inputDigest,
      scope: plan.scope,
      originalSource: plan.required.length
        ? ('SUPPLIED_BYTES_ONLY' as const)
        : ('NOT_INSPECTED' as const),
      authorization: 'NOT_ESTABLISHED' as const,
    });
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
