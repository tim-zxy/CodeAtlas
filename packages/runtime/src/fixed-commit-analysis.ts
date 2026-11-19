import type { DatabaseSync } from 'node:sqlite';
import {
  readFixedCommitCaptureFiles,
  createFixedCommitCapture,
  useFixedCommitCapture,
} from '../../application/dist/fixed-commit-source.js';

import {
  HistoryReadBudget,
  type HistoryReadLimits,
} from '../../storage/dist/analysis/activation-history-format.js';
import {
  fixedCommitSelection,
  installCommitSourceCapture,
} from '../../storage/dist/source-state/commit-capture.js';

import { isDeepStrictEqual } from 'node:util';
import { ensurePhase1Data, type CommitRevision } from '../../ir/dist/index.js';
import {
  NativeAnalyzeRequestV2Schema,
  type NativeAnalyzeRequestV2,
} from '../../providers/dist/native-ipc-v2.js';
import {
  FrameworkSurfaceRequestSchema,
  type FrameworkSurfaceRequest,
} from '../../providers/dist/native-framework-surface-contract.js';
import { freezeComposition } from '../../providers/dist/native-composition-input.js';
import { computeSyntaxOwnerMapDigest } from '../../providers/dist/native-syntax-owner-binding.js';
import {
  readMixedJavaPreparation,
  readMixedCodeSyntaxPreparation,
  type MixedAnalysisStage,
} from '../../storage/dist/analysis/mixed-analysis-stage.js';
import { assertMixedRepositoryLocator } from './mixed-analysis-validation.js';

type SourceAccount = Parameters<ReturnType<typeof createFixedCommitCapture>>[1];
const owners = new WeakMap<
  DatabaseSync,
  {
    handle: object;
    repositoryId: string;
    manifestDigest: string;
    account: SourceAccount;
    history: HistoryReadBudget;
  }
>();

// Internal composition. The trusted embedding supplies the existing RAW grant owner.
// Storage never takes a verifier or a root/manifest from the public request.
export async function prepareFixedCommitAnalysis(
  db: DatabaseSync,
  owner: Parameters<typeof createFixedCommitCapture>[0],
  paths: readonly string[],
  account: Parameters<ReturnType<typeof createFixedCommitCapture>>[1],
  limits: HistoryReadLimits,
) {
  const handle = await createFixedCommitCapture(owner)(paths, account);
  const recheck = () => useFixedCommitCapture(handle, () => undefined);
  const installed = useFixedCommitCapture(handle, (manifest) =>
    installCommitSourceCapture(db, manifest, limits, recheck),
  );
  owners.set(db, {
    handle,
    repositoryId: owner.repository.id,
    manifestDigest: installed.manifestDigest,
    account,
    history: new HistoryReadBudget({ ...limits }),
  });
  return installed;
}

type NativeRequest = NativeAnalyzeRequestV2 | FrameworkSurfaceRequest;
interface NativeInput {
  version: 1;
  protocolVersion: 2 | 8;
  requestId: string;
  repositoryId: string;
  rootPath: string;
  commitOid: string;
  rootTreeOid: string;
  manifestDigest: string;
  selectionFingerprint: string;
  revision: CommitRevision;
  files: Awaited<ReturnType<typeof readFixedCommitCaptureFiles>>;
}

function requireBound(value: unknown): asserts value {
  if (!value) throw Error('INVALID_FIXED_COMMIT_NATIVE_INPUT');
}

// Only the local trusted host supplies the native sink and Stage owner.
export async function withFixedCommitNativeInput<T>(
  db: DatabaseSync,
  request: unknown,
  consume: (input: NativeInput, request: NativeRequest) => T | Promise<T>,
  stageOwner:
    | { stage: MixedAnalysisStage; ownerHandle: object }
    | { stage: MixedAnalysisStage; contracts: unknown },
): Promise<T> {
  const owner = owners.get(db);
  requireBound(owner);
  owner.account.own(request);
  ensurePhase1Data(request);
  const q: NativeRequest = freezeComposition(
    (request as { protocolVersion?: number } | null)?.protocolVersion === 2
      ? NativeAnalyzeRequestV2Schema.parse(request)
      : FrameworkSurfaceRequestSchema.parse(request),
  );
  requireBound(stageOwner);
  const { stage } = stageOwner;
  const ownerHandle = 'ownerHandle' in stageOwner ? stageOwner.ownerHandle : undefined;
  const contracts = 'contracts' in stageOwner ? stageOwner.contracts : undefined;
  if (contracts !== undefined) {
    owner.account.own(contracts);
    ensurePhase1Data(contracts);
  }
  const checkedContracts =
    contracts === undefined ? undefined : freezeComposition(structuredClone(contracts));
  const m = useFixedCommitCapture(owner.handle, (manifest) => manifest);
  const revision = m.revision;
  requireBound(revision && m.selectionCoverage === 'COMPLETE');
  const { repository, sourceFiles } = q.payload;
  requireBound(repository.id === m.repositoryId && repository.rootPath === m.rootPath);
  requireBound(new Set(sourceFiles.map((f) => f.id)).size === sourceFiles.length);
  const checkLive = () => {
    requireBound(owners.get(db) === owner);
    const active = fixedCommitSelection(db, owner.repositoryId);
    requireBound(
      active &&
        active.manifestDigest === owner.manifestDigest &&
        active.rootTreeOid === m.rootTreeOid &&
        isDeepStrictEqual(active.revision, revision) &&
        sourceFiles.every((file) => active.matches(file)),
    );
    if (q.protocolVersion === 2) {
      requireBound(checkedContracts && isDeepStrictEqual(q.payload.revision, revision));
      const prep = readMixedJavaPreparation(stage, checkedContracts);
      assertMixedRepositoryLocator(repository, prep.repositoryLocatorDigest, owner.history);
      requireBound(
        isDeepStrictEqual(prep.javaSourceFiles, sourceFiles) &&
          isDeepStrictEqual(prep.targetSource, {
            repositoryId: m.repositoryId,
            revisionId: revision.id,
            contentFingerprint: m.selectionFingerprint,
          }),
      );
      return;
    }
    requireBound(stage && ownerHandle);
    const prep = readMixedCodeSyntaxPreparation(stage, ownerHandle);
    const p = q.payload;
    assertMixedRepositoryLocator(repository, prep.repositoryLocatorDigest, owner.history);
    requireBound(
      isDeepStrictEqual(p.targetSource, {
        repositoryId: m.repositoryId,
        revisionId: revision.id,
        contentFingerprint: m.selectionFingerprint,
      }) &&
        isDeepStrictEqual(p.targetSource, prep.targetSource) &&
        isDeepStrictEqual(p.expectedActivationBasis, prep.expectedActivationBasis) &&
        isDeepStrictEqual(sourceFiles, prep.sourceFiles) &&
        isDeepStrictEqual(p.owners, prep.owners) &&
        isDeepStrictEqual(p.removedSourceFiles, prep.removedSourceFiles) &&
        p.ownerBinding.kind === 'PROVISIONAL_CODE' &&
        p.ownerBinding.stageDigest === prep.stageDigest,
    );
    requireBound(
      p.ownerBinding.ownerMapDigest ===
        computeSyntaxOwnerMapDigest({
          targetSource: p.targetSource,
          expectedActivationBasis: p.expectedActivationBasis,
          ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: prep.stageDigest },
          providerId: p.providerId,
          providerSnapshotId: p.providerSnapshotId,
          sourceFiles,
          owners: p.owners,
        }),
    );
  };
  checkLive();
  const files = await readFixedCommitCaptureFiles(owner.handle, sourceFiles);
  checkLive();
  const result = await consume(
    {
      version: 1,
      protocolVersion: q.protocolVersion,
      requestId: q.requestId,
      repositoryId: m.repositoryId,
      rootPath: m.rootPath,
      commitOid: m.commitOid,
      rootTreeOid: m.rootTreeOid,
      manifestDigest: owner.manifestDigest,
      selectionFingerprint: m.selectionFingerprint,
      revision,
      files,
    },
    q,
  );
  checkLive();
  return result;
}
