import { readFrameworkSurfaceRequestSnapshotWithBudget } from '../../providers/dist/native-framework-surface-stream.js';
import type { FrameworkSurfaceRequest } from '../../providers/dist/native-framework-surface-contract.js';
import { NATIVE_CLIENT_HARD_LIMITS } from '../../providers/dist/native-client.js';
import { NativeSyntaxContractError } from '../../providers/dist/native-syntax-ipc.js';
import {
  NativeAnalyzeRequestV2Schema,
  type NativeAnalyzeRequestV2,
} from '../../providers/dist/native-ipc-v2.js';
import { computeSyntaxOwnerMapDigest } from '../../providers/dist/native-syntax-owner-binding.js';
import {
  readCodeSyntaxRequestSnapshotWithBudget,
  type CodeSyntaxRequest,
} from '../../providers/dist/native-code-syntax-request.js';
import { freezeComposition } from '../../providers/dist/native-composition-input.js';
import type { CodeSyntaxCompositionBudget } from '../../providers/dist/native-code-syntax-budget.js';
import type {
  readMixedJavaPreparation,
  readMixedCodeSyntaxPreparation,
} from '../../storage/dist/analysis/mixed-analysis-stage.js';
import {
  HistoryReadBudget,
  encodeHistoryValue,
  requireHistory,
} from '../../storage/dist/analysis/activation-history-format.js';
import { assertMixedRepositoryLocator } from './mixed-analysis-validation.js';

type Repository = NativeAnalyzeRequestV2['payload']['repository'];
type Revision = NativeAnalyzeRequestV2['payload']['revision'];
type JavaInput = Omit<NativeAnalyzeRequestV2['payload'], 'irSchemaVersion' | 'sourceFiles'> & {
  preparation: ReturnType<typeof readMixedJavaPreparation>;
  requestId: string;
};
type SyntaxInput = Pick<
  CodeSyntaxRequest['payload'],
  | 'repository'
  | 'providerVersion'
  | 'providerSnapshotId'
  | 'extractorVersion'
  | 'deadlineEpochMs'
  | 'resourceBudget'
  | 'languages'
> & {
  preparation: ReturnType<typeof readMixedCodeSyntaxPreparation>;
  requestId: string;
};
function locator(
  p: { targetSource: { repositoryId: string }; repositoryLocatorDigest: string },
  repository: Repository,
  b: HistoryReadBudget,
) {
  requireHistory(repository.id === p.targetSource.repositoryId);
  assertMixedRepositoryLocator(repository, p.repositoryLocatorDigest, b);
}
function prepareMixedJavaRequest(
  input: JavaInput,
  b: HistoryReadBudget,
): NativeAnalyzeRequestV2 | null {
  b.own(input);
  const p = input.preparation;
  locator(p, input.repository, b);
  const r: Revision = input.revision,
    t = p.targetSource;
  requireHistory(
    r.repositoryId === t.repositoryId &&
      r.id === t.revisionId &&
      r.contentFingerprint === t.contentFingerprint,
  );
  if (p.javaSourceFiles.length === 0) return null;
  const value = {
    protocolVersion: 2,
    requestId: input.requestId,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      repository: input.repository,
      revision: r,
      providerSnapshotId: input.providerSnapshotId,
      sourceFiles: p.javaSourceFiles,
      requestedCapabilities: input.requestedCapabilities,
      deadlineEpochMs: input.deadlineEpochMs,
      resourceBudget: input.resourceBudget,
    },
  };
  b.own(value); // Reserve the parsed schema-owned representation before parsing.
  return freezeComposition(NativeAnalyzeRequestV2Schema.parse(value));
}
function prepareMixedSyntaxRequest(
  input: SyntaxInput,
  b: HistoryReadBudget,
  mode: 5 | 8,
): Buffer | null {
  b.own(input);
  const p = input.preparation;
  locator(p, input.repository, b);
  if (p.mode === 'DELTA' && p.units.length === 0) return null;
  requireHistory(p.mode === 'FULL' || p.sourceFiles.length > 0);
  const binding = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: { kind: 'PROVISIONAL_CODE' as const, stageDigest: p.stageDigest },
    providerId: 'native',
    providerSnapshotId: input.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  };
  b.own(binding);
  b.pin(64);
  const ownerMapDigest = computeSyntaxOwnerMapDigest(binding);
  const request = {
    protocolVersion: mode,
    sequence: 0,
    requestId: input.requestId,
    type: 'OBSERVE_CODE_SYNTAX',
    payload: {
      ...binding,
      ownerBinding: { ...binding.ownerBinding, ownerMapDigest },
      repository: input.repository,
      irSchemaVersion: 1,
      providerVersion: input.providerVersion,
      extractorVersion: input.extractorVersion,
      codeContract: 'PYTHON_SYNTAX_CODE_V1',
      ...(mode === 8 ? { syntaxContract: 'SYNTAX_BINDING_V4' } : {}),
      languages: (p.sourceFiles.length
        ? [...new Set(p.sourceFiles.map((f) => f.languageHint))].sort()
        : ['python']
      ).map((id) => {
        const matches = input.languages.filter((l) => l.languageId === id);
        requireHistory(matches.length === 1);
        return matches[0]!;
      }),
      removedSourceFiles: p.removedSourceFiles,
      deadlineEpochMs: input.deadlineEpochMs,
      resourceBudget: input.resourceBudget,
    },
  };
  b.own(request);
  const raw = encodeHistoryValue(request, b),
    n = Buffer.byteLength(raw) + 1;
  if (
    n > input.resourceBudget.maxInputBytes ||
    n > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes ||
    n > NATIVE_CLIENT_HARD_LIMITS.maxLineBytes
  )
    throw new NativeSyntaxContractError('RESOURCE_LIMIT_EXCEEDED');
  b.add('serializedBytes', n);
  b.pin(n); // newline-bearing string
  b.add('serializedBytes', n);
  b.pin(n); // owned transport buffer
  const bytes = Buffer.from(raw + '\n');
  const rem = b.remaining(),
    cap = Math.min(rem.maxSerializedBytes, Math.floor(rem.memoryBudgetBytes / 2));
  requireHistory(cap > 0, 'HISTORY_LIMIT_EXCEEDED');
  const startBytes = b.serializedBytes,
    startItems = b.items;
  const context: CodeSyntaxCompositionBudget = {
    limits: {
      maxSerializedBytes: startBytes + cap,
      maxItems: b.limits.maxItems,
      maxDepth: b.limits.maxDepth,
    },
    budget: { serializedBytes: startBytes, items: startItems },
  };
  try {
    return mode === 8
      ? readFrameworkSurfaceRequestSnapshotWithBudget(bytes, context).bytes
      : readCodeSyntaxRequestSnapshotWithBudget(bytes, context).bytes;
  } finally {
    const delta = context.budget.serializedBytes - startBytes;
    b.add('serializedBytes', delta);
    b.add('items', context.budget.items - startItems);
    b.pin(delta);
  }
}
function prepareMixedCodeSyntaxRequest(input: SyntaxInput, b: HistoryReadBudget): Buffer | null {
  return prepareMixedSyntaxRequest(input, b, 5);
}
type FrameworkSurfaceInput = Omit<SyntaxInput, 'extractorVersion'> &
  Pick<FrameworkSurfaceRequest['payload'], 'extractorVersion'>;
function prepareMixedFrameworkSurfaceRequest(
  input: FrameworkSurfaceInput,
  b: HistoryReadBudget,
): Buffer | null {
  return prepareMixedSyntaxRequest(input, b, 8);
}
/** Fixed private construction only; does not confer profile, run or publication authority. */
export default Object.freeze({
  prepareMixedJavaRequest,
  prepareMixedCodeSyntaxRequest,
  prepareMixedFrameworkSurfaceRequest,
});
