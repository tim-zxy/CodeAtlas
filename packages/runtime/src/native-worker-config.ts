export interface EffectiveNativeIndexingConfig {
  readonly indexing: { readonly nativeAnalyzer: { readonly parseWorkers: 'AUTO' | number } };
}

export interface NativeWorkerBudget {
  readonly maxDurationMs: number;
  readonly maxMemoryBytes: number;
  readonly maxEvents: number;
}

export interface EffectiveNativeWorkerConfig {
  readonly requested: 'AUTO' | number;
  readonly effectiveCount: number;
  readonly reservationBytes: number;
}

export type NativeWorkerConfigErrorCode = 'INVALID_CONFIGURATION' | 'RESOURCE_LIMIT_EXCEEDED';

export class NativeWorkerConfigError extends Error {
  constructor(
    readonly code: NativeWorkerConfigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NativeWorkerConfigError';
  }
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function resolveNativeWorkerConfig(
  config: EffectiveNativeIndexingConfig,
  budget: NativeWorkerBudget,
  availableParallelism: number,
  measuredReservationBytes: number,
): EffectiveNativeWorkerConfig {
  const indexing = config?.indexing;
  const nativeAnalyzer = indexing?.nativeAnalyzer;
  if (
    typeof indexing !== 'object' ||
    indexing === null ||
    Object.keys(indexing).length !== 1 ||
    typeof nativeAnalyzer !== 'object' ||
    nativeAnalyzer === null ||
    Object.keys(nativeAnalyzer).length !== 1 ||
    !Object.hasOwn(nativeAnalyzer, 'parseWorkers') ||
    !positiveSafeInteger(availableParallelism) ||
    !positiveSafeInteger(measuredReservationBytes) ||
    !positiveSafeInteger(budget?.maxDurationMs) ||
    !positiveSafeInteger(budget?.maxMemoryBytes) ||
    !positiveSafeInteger(budget?.maxEvents)
  ) {
    throw new NativeWorkerConfigError(
      'INVALID_CONFIGURATION',
      'Invalid native worker configuration',
    );
  }
  const requested = nativeAnalyzer.parseWorkers;
  if (requested !== 'AUTO' && !positiveSafeInteger(requested)) {
    throw new NativeWorkerConfigError('INVALID_CONFIGURATION', 'Invalid parse worker count');
  }
  const affordable = Math.floor(budget.maxMemoryBytes / measuredReservationBytes);
  const maximum = Math.min(availableParallelism, affordable);
  if (maximum < 1 || (requested !== 'AUTO' && requested > maximum)) {
    throw new NativeWorkerConfigError(
      'RESOURCE_LIMIT_EXCEEDED',
      'Native parse workers exceed the resource budget',
    );
  }
  return Object.freeze({
    requested,
    effectiveCount: requested === 'AUTO' ? maximum : requested,
    reservationBytes: measuredReservationBytes,
  });
}

export function nativeLaunchArguments(config: EffectiveNativeWorkerConfig): readonly string[] {
  if (
    !positiveSafeInteger(config.effectiveCount) ||
    !positiveSafeInteger(config.reservationBytes)
  ) {
    throw new NativeWorkerConfigError('INVALID_CONFIGURATION', 'Invalid effective worker count');
  }
  return Object.freeze(['--parse-workers', String(config.effectiveCount)]);
}
