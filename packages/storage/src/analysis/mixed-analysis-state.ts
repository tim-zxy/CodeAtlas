import type { HistoryReadLimits } from './activation-history-format.js';
/** Internal synchronous computation only. Storage must authenticate inputs and validate outputs. */
export interface MixedAnalysisRulesPort {
  prepareJavaOwner(input: unknown, limits: HistoryReadLimits): unknown;
  validateObservation(input: unknown, limits: HistoryReadLimits): unknown;
  compose(input: unknown, limits: HistoryReadLimits): unknown;
}

export type MixedAnalysisErrorCode =
  | 'INVALID_STAGE'
  | 'STAGE_LIMIT_EXCEEDED'
  | 'STAGE_RELEASED'
  | 'STAGE_CHANGED'
  | 'INVALID_CANDIDATE'
  | 'FULL_ANALYSIS_REQUIRED'
  | 'OTHER_PROVIDER_REVALIDATION_REQUIRED'
  | 'HISTORY_CHANGED'
  | 'SOURCE_CHANGED'
  | 'INCOMPATIBLE_CONTRACT'
  | 'COMMIT_OUTCOME_UNKNOWN';
export class MixedAnalysisError extends Error {
  constructor(readonly code: MixedAnalysisErrorCode) {
    super(code);
    this.name = 'MixedAnalysisError';
  }
}
export function requireMixedAnalysis(
  value: unknown,
  code: MixedAnalysisErrorCode = 'INVALID_STAGE',
): asserts value {
  if (!value) throw new MixedAnalysisError(code);
}

/** Fixed internal port accounting on failure; never a readiness or authority token. */
export interface MixedAnalysisRulesUsage {
  readonly rows: number;
  readonly serializedBytes: number;
  readonly items: number;
  readonly retainedLogicalBytes: number;
}
export class MixedAnalysisRulesFailure extends Error {
  readonly usage: Readonly<MixedAnalysisRulesUsage>;
  constructor(
    readonly code: 'INVALID_CANDIDATE' | 'STAGE_LIMIT_EXCEEDED',
    usage: MixedAnalysisRulesUsage,
  ) {
    super(code);
    this.name = 'MixedAnalysisRulesFailure';
    this.usage = Object.freeze({ ...usage });
  }
}

const failureUsage = new WeakMap<object, Readonly<MixedAnalysisRulesUsage>>();
/** Private same-operation accounting; does not alter the original pure-component error. */
export function rememberMixedAnalysisFailure(error: object, usage: MixedAnalysisRulesUsage): void {
  failureUsage.set(error, Object.freeze({ ...usage }));
}
export function mixedAnalysisFailureUsage(
  error: unknown,
): Readonly<MixedAnalysisRulesUsage> | undefined {
  return error !== null && (typeof error === 'object' || typeof error === 'function')
    ? failureUsage.get(error)
    : undefined;
}
