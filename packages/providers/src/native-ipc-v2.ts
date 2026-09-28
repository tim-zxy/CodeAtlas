import {
  ProviderEdgeSchema,
  ProviderNodeSchema,
  ProviderSnapshotDiagnosticSchema,
  SourceFileSchema,
} from '@codeatlas/ir';
import { z } from 'zod';

import {
  AnalyzeCompletedPayloadSchema,
  AnalyzeRequestPayloadSchema,
  FailedPayloadSchema,
  NativeCapabilityCoverageSchema,
  NativeEventStreamSchema,
  RequestFailedPayloadSchema,
  StreamContextSchema,
} from './native-ipc.js';

const NonNegativeSafeIntegerSchema = z.number().int().safe().nonnegative();

export const NativeCoverageStatisticsV2Schema = z
  .strictObject({
    eligibleSites: NonNegativeSafeIntegerSchema,
    coveredSites: NonNegativeSafeIntegerSchema,
    unsupportedSites: NonNegativeSafeIntegerSchema,
    partialSites: NonNegativeSafeIntegerSchema,
    resolutionCounts: z.strictObject({
      EXACT: NonNegativeSafeIntegerSchema,
      HEURISTIC: NonNegativeSafeIntegerSchema,
      AMBIGUOUS: NonNegativeSafeIntegerSchema,
      UNRESOLVED: NonNegativeSafeIntegerSchema,
      UNSUPPORTED: NonNegativeSafeIntegerSchema,
    }),
  })
  .superRefine((statistics, context) => {
    if (
      statistics.eligibleSites !==
      statistics.coveredSites + statistics.unsupportedSites + statistics.partialSites
    ) {
      context.addIssue({
        code: 'custom',
        path: ['eligibleSites'],
        message: 'Site partition must balance',
      });
    }
  });
export type NativeCoverageStatisticsV2 = z.infer<typeof NativeCoverageStatisticsV2Schema>;

export const NativeAnalyzeRequestV2Schema = z.strictObject({
  protocolVersion: z.literal(2),
  requestId: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => value === value.trim()),
  type: z.literal('ANALYZE'),
  payload: AnalyzeRequestPayloadSchema,
});
export type NativeAnalyzeRequestV2 = z.infer<typeof NativeAnalyzeRequestV2Schema>;

export const NativeCapabilityCoverageV2Schema = NativeCapabilityCoverageSchema.safeExtend({
  statistics: NativeCoverageStatisticsV2Schema,
});

const EventBase = {
  protocolVersion: z.literal(2),
  requestId: NativeAnalyzeRequestV2Schema.shape.requestId,
  sequence: NonNegativeSafeIntegerSchema,
};
function event<TType extends string, TPayload extends z.ZodType>(type: TType, payload: TPayload) {
  return z.strictObject({ ...EventBase, type: z.literal(type), payload });
}

export const NativeAnalyzeEventEnvelopeV2Schema = z.discriminatedUnion('type', [
  event('ANALYSIS_STARTED', StreamContextSchema),
  event('SOURCE_FILE', SourceFileSchema),
  event('NODE', ProviderNodeSchema),
  event('EDGE', ProviderEdgeSchema),
  event('COVERAGE', NativeCapabilityCoverageV2Schema),
  event('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema),
  event('ANALYSIS_COMPLETED', AnalyzeCompletedPayloadSchema),
  event('ANALYSIS_FAILED', FailedPayloadSchema),
  event('REQUEST_FAILED', RequestFailedPayloadSchema),
]);
export type NativeAnalyzeEventEnvelopeV2 = z.infer<typeof NativeAnalyzeEventEnvelopeV2Schema>;

export const NativeAnalyzeEventStreamV2Schema = z
  .strictObject({
    request: NativeAnalyzeRequestV2Schema,
    events: z.array(NativeAnalyzeEventEnvelopeV2Schema).min(1),
  })
  .superRefine(({ request, events }, context) => {
    // Reuse the complete v1 stream rules after removing only v2's version and new field.
    const compatible = NativeEventStreamSchema.safeParse({
      request: { ...request, protocolVersion: 1 },
      events: events.map((entry) => ({
        ...entry,
        protocolVersion: 1,
        payload:
          entry.type === 'COVERAGE'
            ? {
                capability: entry.payload.capability,
                sourceFileId: entry.payload.sourceFileId,
                support: entry.payload.support,
                coverage: entry.payload.coverage,
              }
            : entry.payload,
      })),
    });
    if (!compatible.success) {
      for (const error of compatible.error.issues) {
        context.addIssue({ code: 'custom', path: error.path, message: error.message });
      }
    }

    const terminal = events.at(-1);
    if (terminal?.type !== 'ANALYSIS_COMPLETED') return;
    const expected = new Set(
      request.payload.sourceFiles.flatMap((file) =>
        request.payload.requestedCapabilities.map((capability) => `${file.id}\0${capability}`),
      ),
    );
    const seen = new Set<string>();
    events.forEach((entry, index) => {
      if (entry.type !== 'COVERAGE') return;
      const key = `${entry.payload.sourceFileId ?? ''}\0${entry.payload.capability}`;
      if (!expected.has(key) || seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'payload'],
          message: 'Coverage must identify one requested file and capability',
        });
      }
      seen.add(key);
      const counts = entry.payload.statistics.resolutionCounts;
      const resolvedTotal = Object.values(counts).reduce((total, value) => total + value, 0);
      if (
        entry.payload.capability === 'SYMBOL'
          ? resolvedTotal !== 0
          : resolvedTotal !== entry.payload.statistics.coveredSites
      ) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'payload', 'statistics', 'resolutionCounts'],
          message: 'Resolution distribution must balance covered sites',
        });
      }
    });
    if (seen.size !== expected.size) {
      context.addIssue({
        code: 'custom',
        path: ['events'],
        message: 'One coverage event is required for every requested file and capability',
      });
    }
  });
export type NativeAnalyzeEventStreamV2 = z.infer<typeof NativeAnalyzeEventStreamV2Schema>;
