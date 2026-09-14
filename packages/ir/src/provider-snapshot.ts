import { z } from 'zod';

import { IrValidationError } from './errors.js';
import { EntityIdSchema } from './ids.js';
import { SourceRangeSchema } from './references.js';
import { RevisionSchema } from './revision.js';
import {
  ContentFingerprintSchema,
  ProviderIdSchema,
  ProviderVersionSchema,
  RuntimeVersionSchema,
} from './source-identity.js';
import { UtcInstantSchema } from './time.js';
import { parseIr } from './validation.js';

export const ProviderCapabilitySupportSchema = z.enum(['SUPPORTED', 'UNSUPPORTED']);
export type ProviderCapabilitySupport = z.infer<typeof ProviderCapabilitySupportSchema>;

export const ProviderCoverageStatusSchema = z.enum(['COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN']);
export type ProviderCoverageStatus = z.infer<typeof ProviderCoverageStatusSchema>;

export const ProviderDiagnosticSeveritySchema = z.enum(['INFO', 'WARNING', 'ERROR']);
export type ProviderDiagnosticSeverity = z.infer<typeof ProviderDiagnosticSeveritySchema>;

export const ProviderSnapshotOutcomeSchema = z.enum([
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
]);
export type ProviderSnapshotOutcome = z.infer<typeof ProviderSnapshotOutcomeSchema>;

const ExactDiagnosticStringSchema = z
  .string()
  .refine((value) => value.length > 0 && value.trim().length > 0 && value === value.trim(), {
    message: 'Diagnostic text must be exact and non-blank',
  });

export const ProviderCapabilityObservationSchema = z.strictObject({
  name: ExactDiagnosticStringSchema,
  support: ProviderCapabilitySupportSchema,
  coverage: ProviderCoverageStatusSchema,
});
export type ProviderCapabilityObservation = z.infer<typeof ProviderCapabilityObservationSchema>;

export const ProviderSnapshotDiagnosticSchema = z.strictObject({
  code: ExactDiagnosticStringSchema,
  severity: ProviderDiagnosticSeveritySchema,
  message: ExactDiagnosticStringSchema.max(128),
  sourceRange: SourceRangeSchema.nullable(),
});
export type ProviderSnapshotDiagnostic = z.infer<typeof ProviderSnapshotDiagnosticSchema>;

export const ProviderSnapshotSchema = z
  .strictObject({
    id: EntityIdSchema,
    repositoryId: EntityIdSchema,
    providerId: ProviderIdSchema,
    providerVersion: ProviderVersionSchema,
    runtimeVersion: RuntimeVersionSchema,
    requestedRevisionId: EntityIdSchema,
    requestedRevisionFingerprint: ContentFingerprintSchema,
    startedAt: UtcInstantSchema,
    completedAt: UtcInstantSchema,
    capabilities: z.array(ProviderCapabilityObservationSchema),
    diagnostics: z.array(ProviderSnapshotDiagnosticSchema),
    outcome: ProviderSnapshotOutcomeSchema,
  })
  .superRefine((snapshot, context) => {
    if (snapshot.completedAt < snapshot.startedAt) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Provider snapshot completion cannot precede start',
      });
    }

    const capabilityIndexes = new Map<string, number>();
    snapshot.capabilities.forEach((capability, index) => {
      if (capabilityIndexes.has(capability.name)) {
        context.addIssue({
          code: 'custom',
          path: ['capabilities', index, 'name'],
          message: 'Provider snapshot capability names must be unique',
        });
        return;
      }

      capabilityIndexes.set(capability.name, index);
    });
  });
export type ProviderSnapshot = z.infer<typeof ProviderSnapshotSchema>;

function snapshotRevisionError(field: string, message: string): never {
  throw new IrValidationError([{ path: ['snapshot', field], message }]);
}

export function validateProviderSnapshotRevision(
  snapshot: unknown,
  revision: unknown,
): ProviderSnapshot {
  const validatedSnapshot = parseIr(ProviderSnapshotSchema, snapshot);
  const validatedRevision = parseIr(RevisionSchema, revision);

  if (validatedSnapshot.repositoryId !== validatedRevision.repositoryId) {
    return snapshotRevisionError(
      'repositoryId',
      'Provider snapshot repository ID does not match the requested revision',
    );
  }

  if (validatedSnapshot.requestedRevisionId !== validatedRevision.id) {
    return snapshotRevisionError(
      'requestedRevisionId',
      'Provider snapshot revision ID does not match the requested revision',
    );
  }

  if (validatedSnapshot.requestedRevisionFingerprint !== validatedRevision.contentFingerprint) {
    return snapshotRevisionError(
      'requestedRevisionFingerprint',
      'Provider snapshot fingerprint does not match the requested revision',
    );
  }

  return validatedSnapshot;
}
