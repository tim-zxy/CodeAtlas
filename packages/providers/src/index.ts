export * from './native-client.js';
export * from './native-ipc.js';
export * from './native-ipc-v2.js';
export * from './native-analysis-state.js';
export * from './native-analysis-validation.js';
export * from './native-analysis-output-v3.js';
export * from './native-refresh-output-v3.js';
export * from './native-refresh-request-v3.js';
export { validateNativeRefreshOverlay } from './native-refresh-overlay.js';
export type { NativeRefreshOverlayInput } from './native-refresh-overlay.js';
export * from './native-ipc-v3.js';
export * from './native-ipc-v3-bytes.js';
export * from './coverage-summary.js';
export * from './provider-routing.js';
export * from './provider-spi.js';
export { normalizeNativeAnalysis } from './canonical-normalizer.js';
export { normalizeStagedAnalysis } from './staged-normalization.js';
export { normalizeStagedPatch } from './staged-patch.js';
export { mergeStagedAnalysis, finalizeStagedSupports } from './staged-merger.js';
export type {
  NormalizedCanonicalAnalysis,
  NormalizedNodePair,
  NormalizedEdgePair,
} from './canonical-normalizer.js';
export { CanonicalNormalizationError, JAVA_NORMALIZER_VERSION } from './java-node-normalizer.js';
export type { CanonicalNormalizationErrorCode } from './java-node-normalizer.js';
export { mergeCanonicalObservations } from './fact-merger.js';
export { selectMergedGroup } from './fact-merger-selection.js';
export type { MergedCanonicalAnalysis } from './fact-merger.js';
export { FactMergeError } from './fact-merger-input.js';
export type { FactMergeErrorCode, MergeInput, MergeObservation } from './fact-merger-input.js';
export type { MergeExplanation, MergeSupportSummary } from './fact-merger-selection.js';
