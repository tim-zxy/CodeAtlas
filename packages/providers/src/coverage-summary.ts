import type { ValidatedNativeResult } from './native-client.js';
import { NativeEventStreamSchema } from './native-ipc.js';
import {
  NativeAnalyzeEventStreamV2Schema,
  type NativeCoverageStatisticsV2,
} from './native-ipc-v2.js';

export type NativeCoverageWarningCode =
  'STATISTICS_UNAVAILABLE' | 'PARTIAL_COVERAGE' | 'UNSUPPORTED_SITE' | 'INCOMPLETE_RESOLUTION';

export interface NativeCoverageWarning {
  readonly code: NativeCoverageWarningCode;
  readonly sourceFileId: string | null;
  readonly capability: string | null;
}

export interface NativeCoverageSummary {
  readonly statisticsAvailable: boolean;
  readonly files: readonly {
    readonly sourceFileId: string;
    readonly capability: string;
    readonly support: string;
    readonly coverage: string;
    readonly statistics: NativeCoverageStatisticsV2 | null;
  }[];
  readonly warnings: readonly NativeCoverageWarning[];
}

export function summarizeNativeCoverage(result: ValidatedNativeResult): NativeCoverageSummary {
  if (result.request.type !== 'ANALYZE' || result.terminal.type !== 'ANALYSIS_COMPLETED') {
    throw new TypeError('Only a completed ANALYZE result has applicable coverage');
  }
  const valid =
    result.request.protocolVersion === 2
      ? NativeAnalyzeEventStreamV2Schema.safeParse({
          request: result.request,
          events: result.events,
        })
      : NativeEventStreamSchema.safeParse({ request: result.request, events: result.events });
  if (!valid.success) {
    throw new TypeError('Native coverage result is not a complete valid stream');
  }

  const statisticsAvailable = result.request.protocolVersion === 2;
  const files = result.events
    .filter((event) => event.type === 'COVERAGE')
    .map((event) => ({
      sourceFileId: event.payload.sourceFileId ?? '',
      capability: event.payload.capability,
      support: event.payload.support,
      coverage: event.payload.coverage,
      statistics: 'statistics' in event.payload ? event.payload.statistics : null,
    }))
    .sort(
      (left, right) =>
        left.sourceFileId.localeCompare(right.sourceFileId) ||
        left.capability.localeCompare(right.capability),
    );
  const warnings: NativeCoverageWarning[] = [];
  if (!statisticsAvailable) {
    warnings.push({ code: 'STATISTICS_UNAVAILABLE', sourceFileId: null, capability: null });
  }
  for (const file of files) {
    if (file.coverage === 'PARTIAL' || (file.statistics?.partialSites ?? 0) > 0) {
      warnings.push({
        code: 'PARTIAL_COVERAGE',
        sourceFileId: file.sourceFileId,
        capability: file.capability,
      });
    }
    if ((file.statistics?.unsupportedSites ?? 0) > 0) {
      warnings.push({
        code: 'UNSUPPORTED_SITE',
        sourceFileId: file.sourceFileId,
        capability: file.capability,
      });
    }
    const counts = file.statistics?.resolutionCounts;
    if (counts && counts.AMBIGUOUS + counts.UNRESOLVED + counts.UNSUPPORTED > 0) {
      warnings.push({
        code: 'INCOMPLETE_RESOLUTION',
        sourceFileId: file.sourceFileId,
        capability: file.capability,
      });
    }
  }
  warnings.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      (left.sourceFileId ?? '').localeCompare(right.sourceFileId ?? '') ||
      (left.capability ?? '').localeCompare(right.capability ?? ''),
  );
  return { statisticsAvailable, files, warnings };
}
