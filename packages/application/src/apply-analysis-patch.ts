import {
  ContentFingerprintSchema,
  EntityIdSchema,
  ProviderSnapshotSchema,
  type ContentFingerprint,
  type EntityId,
  type ProviderSnapshot,
} from '@codeatlas/ir';

export interface PatchAnalysisInput {
  readonly repositoryId: EntityId;
  readonly baseRevisionId: EntityId;
  readonly baseContentFingerprint: ContentFingerprint;
  readonly targetRevisionId: EntityId;
  readonly targetContentFingerprint: ContentFingerprint;
}

export interface PatchAnalysisPorts<TStage> {
  readonly observeAndStage: (input: PatchAnalysisInput) => Promise<{
    readonly outcome: 'SUCCEEDED' | 'PARTIAL';
    readonly snapshot: ProviderSnapshot;
    readonly stage: TStage;
  }>;
  readonly factStore: {
    applyAnalysisPatch(
      stage: TStage,
      expected: PatchAnalysisInput & { readonly snapshot: ProviderSnapshot },
    ): number | void;
  };
}

/** Publication policy stays above the opaque provisional stage and persistent store. */
export async function applyAnalysisPatch<TStage>(
  inputValue: PatchAnalysisInput,
  ports: PatchAnalysisPorts<TStage>,
): Promise<void> {
  const input = {
    repositoryId: EntityIdSchema.parse(inputValue.repositoryId),
    baseRevisionId: EntityIdSchema.parse(inputValue.baseRevisionId),
    baseContentFingerprint: ContentFingerprintSchema.parse(inputValue.baseContentFingerprint),
    targetRevisionId: EntityIdSchema.parse(inputValue.targetRevisionId),
    targetContentFingerprint: ContentFingerprintSchema.parse(inputValue.targetContentFingerprint),
  };
  const observation = await ports.observeAndStage(input);
  const snapshot = ProviderSnapshotSchema.parse(observation.snapshot);
  if (observation.outcome !== 'SUCCEEDED' || snapshot.outcome !== 'SUCCEEDED')
    throw new Error('Analysis patch is not eligible for publication');
  if (
    snapshot.repositoryId !== input.repositoryId ||
    snapshot.requestedRevisionId !== input.targetRevisionId ||
    snapshot.requestedRevisionFingerprint !== input.targetContentFingerprint
  )
    throw new Error('Analysis patch snapshot does not match requested source');
  ports.factStore.applyAnalysisPatch(observation.stage, { ...input, snapshot });
}
