import {
  ContentFingerprintSchema,
  EntityIdSchema,
  EpochMillisecondsSchema,
  ProviderCapabilityObservationSchema,
  ProviderEdgeSchema,
  ProviderFactRefSchema,
  ProviderIdSchema,
  ProviderNodeRefSchema,
  ProviderNodeSchema,
  ProviderSnapshotDiagnosticSchema,
  ProviderSnapshotOutcomeSchema,
  ProviderVersionSchema,
  RepositoryRelativePathSchema,
  RepositorySchema,
  RevisionSchema,
  RuntimeVersionSchema,
  SourceFileSchema,
} from '@codeatlas/ir';
import { z } from 'zod';

export const NATIVE_IPC_PROTOCOL_VERSION = 1 as const;
export const NATIVE_IPC_IR_SCHEMA_VERSION = 1 as const;

const ExactStringSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), 'Value must be exact and non-blank');
const PositiveSafeIntegerSchema = z.number().int().safe().positive();
const NonNegativeSafeIntegerSchema = z.number().int().safe().nonnegative();
const PositiveVersionArraySchema = z
  .array(PositiveSafeIntegerSchema)
  .min(1)
  .superRefine((values, context) => addDuplicateIssues(values, context));
const ExactStringArraySchema = z
  .array(ExactStringSchema)
  .min(1)
  .superRefine((values, context) => addDuplicateIssues(values, context));

function addDuplicateIssues(
  values: readonly (number | string)[],
  context: z.RefinementCtx,
  pathPrefix: PropertyKey[] = [],
): void {
  const seen = new Set<number | string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        path: [...pathPrefix, index],
        message: 'Values must be unique',
      });
    }
    seen.add(value);
  });
}

export const NativeIpcRequestTypeSchema = z.enum(['DESCRIBE', 'ANALYZE', 'REFRESH', 'CANCEL']);
export type NativeIpcRequestType = z.infer<typeof NativeIpcRequestTypeSchema>;

export const NativeIpcErrorCodeSchema = z.enum([
  'INCOMPATIBLE_PROTOCOL_VERSION',
  'INCOMPATIBLE_IR_SCHEMA_VERSION',
  'INVALID_REQUEST',
  'UNSUPPORTED_LANGUAGE',
  'UNSUPPORTED_CAPABILITY',
  'SOURCE_CHANGED',
  'RESOURCE_LIMIT_EXCEEDED',
  'BUDGET_EXCEEDED',
  'CANCELLED',
  'INTERNAL_ANALYZER_FAILURE',
  'PROTOCOL_CORRUPTION',
  'BASE_REVISION_MISMATCH',
]);
export type NativeIpcErrorCode = z.infer<typeof NativeIpcErrorCodeSchema>;

export const NativeIpcErrorSchema = z.strictObject({
  code: NativeIpcErrorCodeSchema,
  message: ExactStringSchema,
  retryable: z.boolean(),
});
export type NativeIpcError = z.infer<typeof NativeIpcErrorSchema>;

export const NativeIpcResourceBudgetSchema = z.strictObject({
  maxDurationMs: PositiveSafeIntegerSchema,
  maxMemoryBytes: PositiveSafeIntegerSchema,
  maxEvents: PositiveSafeIntegerSchema,
});
export type NativeIpcResourceBudget = z.infer<typeof NativeIpcResourceBudgetSchema>;

export const NativeAnalyzerLanguageSchema = z.strictObject({
  languageId: ExactStringSchema,
  grammarVersion: ExactStringSchema,
  analyzerVersion: ExactStringSchema,
  compatibilityVersion: ExactStringSchema,
});
export type NativeAnalyzerLanguage = z.infer<typeof NativeAnalyzerLanguageSchema>;

export const NativeAnalyzerDescriptorSchema = z
  .strictObject({
    providerId: ProviderIdSchema,
    providerVersion: ProviderVersionSchema,
    runtimeVersion: RuntimeVersionSchema,
    protocolVersions: PositiveVersionArraySchema,
    irSchemaVersions: PositiveVersionArraySchema,
    capabilities: ExactStringArraySchema,
    languages: z.array(NativeAnalyzerLanguageSchema).min(1),
    limits: z.strictObject({
      maxLineBytes: PositiveSafeIntegerSchema,
      maxEventCount: PositiveSafeIntegerSchema,
      maxTotalBytes: PositiveSafeIntegerSchema,
    }),
    build: z.strictObject({
      target: ExactStringSchema,
      profile: ExactStringSchema,
    }),
  })
  .superRefine((descriptor, context) => {
    addDuplicateIssues(
      descriptor.languages.map((language) => language.languageId),
      context,
      ['languages'],
    );
  });
export type NativeAnalyzerDescriptor = z.infer<typeof NativeAnalyzerDescriptorSchema>;

export const DescribeRequestPayloadSchema = z.strictObject({
  clientProtocolVersions: PositiveVersionArraySchema,
  clientIrSchemaVersions: PositiveVersionArraySchema,
});

const AnalysisRequestBaseShape = {
  irSchemaVersion: z.literal(NATIVE_IPC_IR_SCHEMA_VERSION),
  providerSnapshotId: EntityIdSchema,
  repository: RepositorySchema,
  requestedCapabilities: ExactStringArraySchema,
  deadlineEpochMs: EpochMillisecondsSchema.nullable(),
  resourceBudget: NativeIpcResourceBudgetSchema,
};

export const AnalyzeRequestPayloadSchema = z
  .strictObject({
    ...AnalysisRequestBaseShape,
    revision: RevisionSchema,
    sourceFiles: z.array(SourceFileSchema),
  })
  .superRefine((payload, context) => {
    validateRevisionContext(payload.repository.id, payload.revision, context, ['revision']);
    validateSourceFiles(payload.sourceFiles, payload.repository.id, payload.revision.id, context, [
      'sourceFiles',
    ]);
  });
export type AnalyzeRequestPayload = z.infer<typeof AnalyzeRequestPayloadSchema>;

const DeletedSourceFileSchema = z.strictObject({
  id: EntityIdSchema,
  path: RepositoryRelativePathSchema,
  previousContentFingerprint: ContentFingerprintSchema,
});

export const RefreshRequestPayloadSchema = z
  .strictObject({
    ...AnalysisRequestBaseShape,
    baseRevisionId: EntityIdSchema,
    baseRevisionFingerprint: ContentFingerprintSchema,
    targetRevision: RevisionSchema,
    changes: z.strictObject({
      added: z.array(SourceFileSchema),
      modified: z.array(SourceFileSchema),
      deleted: z.array(DeletedSourceFileSchema),
    }),
  })
  .superRefine((payload, context) => {
    validateRevisionContext(payload.repository.id, payload.targetRevision, context, [
      'targetRevision',
    ]);
    validateSourceFiles(
      [...payload.changes.added, ...payload.changes.modified],
      payload.repository.id,
      payload.targetRevision.id,
      context,
      ['changes'],
    );

    const changedIds = [
      ...payload.changes.added.map((file) => file.id),
      ...payload.changes.modified.map((file) => file.id),
      ...payload.changes.deleted.map((file) => file.id),
    ];
    addDuplicateIssues(changedIds, context, ['changes']);
  });
export type RefreshRequestPayload = z.infer<typeof RefreshRequestPayloadSchema>;

export const CancelRequestPayloadSchema = z.strictObject({
  targetRequestId: ExactStringSchema,
});

function validateRevisionContext(
  repositoryId: string,
  revision: { repositoryId: string },
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  if (revision.repositoryId !== repositoryId) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'repositoryId'],
      message: 'Revision repository ID must match request repository',
    });
  }
}

function validateSourceFiles(
  files: readonly { id: string; repositoryId: string; revisionId: string }[],
  repositoryId: string,
  revisionId: string,
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  const seen = new Set<string>();
  files.forEach((file, index) => {
    if (file.repositoryId !== repositoryId) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'repositoryId'],
        message: 'Source file repository ID must match request repository',
      });
    }
    if (file.revisionId !== revisionId) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'revisionId'],
        message: 'Source file revision ID must match request revision',
      });
    }
    if (seen.has(file.id)) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'id'],
        message: 'Source file IDs must be unique',
      });
    }
    seen.add(file.id);
  });
}

const RequestEnvelopeBase = {
  protocolVersion: z.literal(NATIVE_IPC_PROTOCOL_VERSION),
  requestId: ExactStringSchema,
};

export const NativeRequestEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...RequestEnvelopeBase,
    type: z.literal('DESCRIBE'),
    payload: DescribeRequestPayloadSchema,
  }),
  z.strictObject({
    ...RequestEnvelopeBase,
    type: z.literal('ANALYZE'),
    payload: AnalyzeRequestPayloadSchema,
  }),
  z.strictObject({
    ...RequestEnvelopeBase,
    type: z.literal('REFRESH'),
    payload: RefreshRequestPayloadSchema,
  }),
  z.strictObject({
    ...RequestEnvelopeBase,
    type: z.literal('CANCEL'),
    payload: CancelRequestPayloadSchema,
  }),
]);
export type NativeRequestEnvelope = z.infer<typeof NativeRequestEnvelopeSchema>;

export const NativeCapabilityCoverageSchema = z.strictObject({
  capability: ExactStringSchema,
  sourceFileId: EntityIdSchema.nullable(),
  support: ProviderCapabilityObservationSchema.shape.support,
  coverage: ProviderCapabilityObservationSchema.shape.coverage,
});

const StreamContextShape = {
  providerSnapshotId: EntityIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  revisionFingerprint: ContentFingerprintSchema,
};
const StreamContextSchema = z.strictObject(StreamContextShape);
const AnalyzeCountsSchema = z.strictObject({
  sourceFiles: NonNegativeSafeIntegerSchema,
  nodes: NonNegativeSafeIntegerSchema,
  edges: NonNegativeSafeIntegerSchema,
  coverage: NonNegativeSafeIntegerSchema,
  diagnostics: NonNegativeSafeIntegerSchema,
});
const RefreshCountsSchema = z.strictObject({
  sourceFiles: NonNegativeSafeIntegerSchema,
  upsertedNodes: NonNegativeSafeIntegerSchema,
  removedNodes: NonNegativeSafeIntegerSchema,
  upsertedEdges: NonNegativeSafeIntegerSchema,
  removedEdges: NonNegativeSafeIntegerSchema,
  coverage: NonNegativeSafeIntegerSchema,
  diagnostics: NonNegativeSafeIntegerSchema,
});

const AnalyzeCompletedPayloadSchema = z.strictObject({
  ...StreamContextShape,
  outcome: ProviderSnapshotOutcomeSchema.exclude(['FAILED', 'CANCELLED']),
  counts: AnalyzeCountsSchema,
  capabilities: z.array(ProviderCapabilityObservationSchema),
  contentFingerprint: ContentFingerprintSchema,
  integrityChecksum: ContentFingerprintSchema,
});
const RefreshCompletedPayloadSchema = z.strictObject({
  ...StreamContextShape,
  outcome: ProviderSnapshotOutcomeSchema.exclude(['FAILED', 'CANCELLED']),
  counts: RefreshCountsSchema,
  capabilities: z.array(ProviderCapabilityObservationSchema),
  contentFingerprint: ContentFingerprintSchema,
  integrityChecksum: ContentFingerprintSchema,
});
const FailedPayloadSchema = z.strictObject({
  ...StreamContextShape,
  error: NativeIpcErrorSchema,
});
const RequestFailedPayloadSchema = z.strictObject({ error: NativeIpcErrorSchema });
const ProviderEdgeRefSchema = ProviderFactRefSchema.extend({ factType: z.literal('EDGE') });

const EventEnvelopeBase = {
  protocolVersion: z.literal(NATIVE_IPC_PROTOCOL_VERSION),
  requestId: ExactStringSchema,
  sequence: NonNegativeSafeIntegerSchema,
};
function event<TType extends string, TPayload extends z.ZodType>(type: TType, payload: TPayload) {
  return z.strictObject({
    ...EventEnvelopeBase,
    type: z.literal(type),
    payload,
  });
}

export const NativeEventEnvelopeSchema = z.discriminatedUnion('type', [
  event('DESCRIBE_COMPLETED', NativeAnalyzerDescriptorSchema),
  event('ANALYSIS_STARTED', StreamContextSchema),
  event('SOURCE_FILE', SourceFileSchema),
  event('NODE', ProviderNodeSchema),
  event('EDGE', ProviderEdgeSchema),
  event('COVERAGE', NativeCapabilityCoverageSchema),
  event('DIAGNOSTIC', ProviderSnapshotDiagnosticSchema),
  event('ANALYSIS_COMPLETED', AnalyzeCompletedPayloadSchema),
  event('ANALYSIS_FAILED', FailedPayloadSchema),
  event('REFRESH_STARTED', StreamContextSchema),
  event('UPSERT_NODE', ProviderNodeSchema),
  event('REMOVE_NODE', ProviderNodeRefSchema),
  event('UPSERT_EDGE', ProviderEdgeSchema),
  event('REMOVE_EDGE', ProviderEdgeRefSchema),
  event('REFRESH_COMPLETED', RefreshCompletedPayloadSchema),
  event('REFRESH_FAILED', FailedPayloadSchema),
  event('CANCEL_ACCEPTED', z.strictObject({ targetRequestId: ExactStringSchema })),
  event('REQUEST_FAILED', RequestFailedPayloadSchema),
]);
export type NativeEventEnvelope = z.infer<typeof NativeEventEnvelopeSchema>;

const legalEventTypes: Record<NativeIpcRequestType, ReadonlySet<NativeEventEnvelope['type']>> = {
  DESCRIBE: new Set(['DESCRIBE_COMPLETED', 'REQUEST_FAILED']),
  ANALYZE: new Set([
    'ANALYSIS_STARTED',
    'SOURCE_FILE',
    'NODE',
    'EDGE',
    'COVERAGE',
    'DIAGNOSTIC',
    'ANALYSIS_COMPLETED',
    'ANALYSIS_FAILED',
    'REQUEST_FAILED',
  ]),
  REFRESH: new Set([
    'REFRESH_STARTED',
    'SOURCE_FILE',
    'UPSERT_NODE',
    'REMOVE_NODE',
    'UPSERT_EDGE',
    'REMOVE_EDGE',
    'COVERAGE',
    'DIAGNOSTIC',
    'REFRESH_COMPLETED',
    'REFRESH_FAILED',
    'REQUEST_FAILED',
  ]),
  CANCEL: new Set(['CANCEL_ACCEPTED', 'REQUEST_FAILED']),
};
const terminalEventTypes = new Set<NativeEventEnvelope['type']>([
  'DESCRIBE_COMPLETED',
  'ANALYSIS_COMPLETED',
  'ANALYSIS_FAILED',
  'REFRESH_COMPLETED',
  'REFRESH_FAILED',
  'CANCEL_ACCEPTED',
  'REQUEST_FAILED',
]);

export const NativeEventStreamSchema = z
  .strictObject({
    request: NativeRequestEnvelopeSchema,
    events: z.array(NativeEventEnvelopeSchema).min(1),
  })
  .superRefine(({ request, events }, context) => {
    const maxEvents =
      request.type === 'ANALYZE' || request.type === 'REFRESH'
        ? request.payload.resourceBudget.maxEvents
        : undefined;
    if (maxEvents !== undefined && events.length > maxEvents) {
      issue(context, ['events'], 'Event count exceeds the request budget');
    }

    events.forEach((eventEnvelope, index) => {
      if (eventEnvelope.requestId !== request.requestId) {
        issue(context, ['events', index, 'requestId'], 'Event request ID must match request');
      }
      if (eventEnvelope.sequence !== index) {
        issue(
          context,
          ['events', index, 'sequence'],
          'Event sequence must start at 0 and be contiguous',
        );
      }
      if (!legalEventTypes[request.type].has(eventEnvelope.type)) {
        issue(context, ['events', index, 'type'], 'Event type is not legal for this request');
      }
      if (eventEnvelope.type === 'REQUEST_FAILED' && index !== 0) {
        issue(
          context,
          ['events', index, 'type'],
          'REQUEST_FAILED is only valid before a request starts',
        );
      }
      if (terminalEventTypes.has(eventEnvelope.type) && index !== events.length - 1) {
        issue(context, ['events', index], 'No event may follow a terminal event');
      }
    });

    const terminalCount = events.filter((eventEnvelope) =>
      terminalEventTypes.has(eventEnvelope.type),
    ).length;
    if (terminalCount !== 1 || !terminalEventTypes.has(events.at(-1)?.type ?? 'SOURCE_FILE')) {
      issue(context, ['events'], 'Event stream must end with exactly one terminal event');
    }

    if (request.type === 'ANALYZE') {
      validateAnalyzeStream(request, events, context);
    } else if (request.type === 'REFRESH') {
      validateRefreshStream(request, events, context);
    } else if (request.type === 'CANCEL') {
      const accepted = events.at(-1);
      if (
        accepted?.type === 'CANCEL_ACCEPTED' &&
        accepted.payload.targetRequestId !== request.payload.targetRequestId
      ) {
        issue(
          context,
          ['events', events.length - 1, 'payload', 'targetRequestId'],
          'Cancelled request ID must match',
        );
      }
    }
  });
export type NativeEventStream = z.infer<typeof NativeEventStreamSchema>;

function validateAnalyzeStream(
  request: Extract<NativeRequestEnvelope, { type: 'ANALYZE' }>,
  events: NativeEventEnvelope[],
  context: z.RefinementCtx,
): void {
  if (events[0]?.type !== 'ANALYSIS_STARTED' && events[0]?.type !== 'REQUEST_FAILED') {
    issue(context, ['events', 0, 'type'], 'Analysis stream must start with ANALYSIS_STARTED');
  }
  validateEventContext(
    request,
    events,
    context,
    request.payload.revision.id,
    request.payload.revision.contentFingerprint,
  );
  const terminal = events.at(-1);
  if (terminal?.type === 'ANALYSIS_COMPLETED') {
    validateCounts(
      terminal.payload.counts,
      {
        sourceFiles: count(events, 'SOURCE_FILE'),
        nodes: count(events, 'NODE'),
        edges: count(events, 'EDGE'),
        coverage: count(events, 'COVERAGE'),
        diagnostics: count(events, 'DIAGNOSTIC'),
      },
      events.length - 1,
      context,
    );
  }
}

function validateRefreshStream(
  request: Extract<NativeRequestEnvelope, { type: 'REFRESH' }>,
  events: NativeEventEnvelope[],
  context: z.RefinementCtx,
): void {
  if (events[0]?.type !== 'REFRESH_STARTED' && events[0]?.type !== 'REQUEST_FAILED') {
    issue(context, ['events', 0, 'type'], 'Refresh stream must start with REFRESH_STARTED');
  }
  validateEventContext(
    request,
    events,
    context,
    request.payload.targetRevision.id,
    request.payload.targetRevision.contentFingerprint,
  );
  const terminal = events.at(-1);
  if (terminal?.type === 'REFRESH_COMPLETED') {
    validateCounts(
      terminal.payload.counts,
      {
        sourceFiles: count(events, 'SOURCE_FILE'),
        upsertedNodes: count(events, 'UPSERT_NODE'),
        removedNodes: count(events, 'REMOVE_NODE'),
        upsertedEdges: count(events, 'UPSERT_EDGE'),
        removedEdges: count(events, 'REMOVE_EDGE'),
        coverage: count(events, 'COVERAGE'),
        diagnostics: count(events, 'DIAGNOSTIC'),
      },
      events.length - 1,
      context,
    );
  }
}

function validateEventContext(
  request: Extract<NativeRequestEnvelope, { type: 'ANALYZE' | 'REFRESH' }>,
  events: NativeEventEnvelope[],
  context: z.RefinementCtx,
  revisionId: string,
  revisionFingerprint: string,
): void {
  events.forEach((eventEnvelope, index) => {
    if (eventEnvelope.type === 'SOURCE_FILE') {
      if (eventEnvelope.payload.repositoryId !== request.payload.repository.id) {
        issue(
          context,
          ['events', index, 'payload', 'repositoryId'],
          'Source file repository ID must match request',
        );
      }
      if (eventEnvelope.payload.revisionId !== revisionId) {
        issue(
          context,
          ['events', index, 'payload', 'revisionId'],
          'Source file revision ID must match request',
        );
      }
      return;
    }
    if (
      !('providerSnapshotId' in eventEnvelope.payload) ||
      !('repositoryId' in eventEnvelope.payload) ||
      !('revisionId' in eventEnvelope.payload)
    ) {
      return;
    }
    const payload = eventEnvelope.payload;
    if (payload.providerSnapshotId !== request.payload.providerSnapshotId) {
      issue(
        context,
        ['events', index, 'payload', 'providerSnapshotId'],
        'Provider snapshot ID must match request',
      );
    }
    if (payload.repositoryId !== request.payload.repository.id) {
      issue(
        context,
        ['events', index, 'payload', 'repositoryId'],
        'Repository ID must match request',
      );
    }
    if (payload.revisionId !== revisionId) {
      issue(context, ['events', index, 'payload', 'revisionId'], 'Revision ID must match request');
    }
    if ('revisionFingerprint' in payload && payload.revisionFingerprint !== revisionFingerprint) {
      issue(
        context,
        ['events', index, 'payload', 'revisionFingerprint'],
        'Revision fingerprint must match request',
      );
    }
  });
}

function validateCounts(
  actual: Record<string, number>,
  expected: Record<string, number>,
  terminalIndex: number,
  context: z.RefinementCtx,
): void {
  for (const [name, expectedCount] of Object.entries(expected)) {
    if (actual[name] !== expectedCount) {
      issue(
        context,
        ['events', terminalIndex, 'payload', 'counts', name],
        'Terminal count must match emitted events',
      );
    }
  }
}

function count(events: readonly NativeEventEnvelope[], type: NativeEventEnvelope['type']): number {
  return events.filter((eventEnvelope) => eventEnvelope.type === type).length;
}

function issue(context: z.RefinementCtx, path: PropertyKey[], message: string): void {
  context.addIssue({ code: 'custom', path, message });
}
