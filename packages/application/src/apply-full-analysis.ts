import {
  ContentFingerprintSchema,
  EntityIdSchema,
  ProviderSnapshotSchema,
  type ContentFingerprint,
  type EntityId,
  type ProviderSnapshot,
} from '@codeatlas/ir';

export interface FullAnalysisInput {
  readonly repositoryId: EntityId;
  readonly revisionId: EntityId;
  readonly contentFingerprint: ContentFingerprint;
}

export interface FullAnalysisPorts<TStage> {
  readonly observeAndStage: (input: FullAnalysisInput) => Promise<{
    readonly outcome: 'SUCCEEDED' | 'PARTIAL';
    readonly snapshot: ProviderSnapshot;
    readonly stage: TStage;
  }>;
  readonly factStore: {
    applyAnalysisBatch(
      stage: TStage,
      expected: FullAnalysisInput & { readonly snapshot: ProviderSnapshot },
    ): void;
  };
}

export function parseFullAnalysisSnapshot(value: unknown): ProviderSnapshot {
  return ProviderSnapshotSchema.parse(value);
}

/** Application owns publication policy; the stage and SQL remain opaque ports. */
export async function applyFullAnalysis<TStage>(
  inputValue: FullAnalysisInput,
  ports: FullAnalysisPorts<TStage>,
): Promise<void> {
  const input = {
    repositoryId: EntityIdSchema.parse(inputValue.repositoryId),
    revisionId: EntityIdSchema.parse(inputValue.revisionId),
    contentFingerprint: ContentFingerprintSchema.parse(inputValue.contentFingerprint),
  };
  const observation = await ports.observeAndStage(input);
  const snapshot = parseFullAnalysisSnapshot(observation.snapshot);
  if (observation.outcome !== 'SUCCEEDED' || snapshot.outcome !== 'SUCCEEDED') {
    throw new Error('Full analysis is not eligible for publication');
  }
  if (
    snapshot.repositoryId !== input.repositoryId ||
    snapshot.requestedRevisionId !== input.revisionId ||
    snapshot.requestedRevisionFingerprint !== input.contentFingerprint
  ) {
    throw new Error('Analysis snapshot does not match requested source');
  }
  ports.factStore.applyAnalysisBatch(observation.stage, { ...input, snapshot });
}
