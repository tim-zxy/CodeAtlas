export * from './confidence.js';
export {
  CodeFactNameSchema,
  EdgeFactKeySchema,
  NodeFactKeySchema,
  ProviderFactIdSchema,
  ProviderFactKindSchema,
  QualifiedCodeFactNameSchema,
  UnresolvedTargetHintSchema,
} from './code-fact-identity.js';
export type {
  CodeFactName,
  EdgeFactKey,
  NodeFactKey,
  ProviderFactId,
  ProviderFactKind,
  QualifiedCodeFactName,
  UnresolvedTargetHint,
} from './code-fact-identity.js';
export {
  CanonicalFactRefSchema,
  CanonicalNodeRefSchema,
  FactTypeSchema,
  ProviderFactRefSchema,
  ProviderNodeRefSchema,
} from './code-fact-reference.js';
export type {
  CanonicalFactRef,
  CanonicalNodeRef,
  FactType,
  ProviderFactRef,
  ProviderNodeRef,
} from './code-fact-reference.js';
export {
  JsonValueSchema,
  SchemaEnvelopeSchema,
  createSchemaEnvelopeSchema,
  parseSchemaEnvelope,
} from './envelope.js';
export type { JsonValue, SchemaDescriptor, SchemaEnvelope } from './envelope.js';
export * from './errors.js';
export { CanonicalIdSchema, EntityIdSchema } from './ids.js';
export type { CanonicalId, EntityId } from './ids.js';
export { EntityRefSchema, SourceRangeSchema } from './references.js';
export type { EntityRef, SourceRange } from './references.js';
export { RepositorySchema } from './repository.js';
export type { Repository } from './repository.js';
export {
  LanguageHintSchema,
  SourceContentKindSchema,
  SourceFileClassificationSchema,
  SourceFileProvenanceSchema,
  SourceFileRoleSchema,
  SourceFileSchema,
  SourceSensitivitySchema,
} from './source-file.js';
export type {
  LanguageHint,
  SourceContentKind,
  SourceFile,
  SourceFileClassification,
  SourceFileProvenance,
  SourceFileRole,
  SourceSensitivity,
} from './source-file.js';
export {
  ProviderCapabilityObservationSchema,
  ProviderCapabilitySupportSchema,
  ProviderCoverageStatusSchema,
  ProviderDiagnosticSeveritySchema,
  ProviderSnapshotDiagnosticSchema,
  ProviderSnapshotOutcomeSchema,
  ProviderSnapshotSchema,
  validateProviderSnapshotRevision,
} from './provider-snapshot.js';
export type {
  ProviderCapabilityObservation,
  ProviderCapabilitySupport,
  ProviderCoverageStatus,
  ProviderDiagnosticSeverity,
  ProviderSnapshot,
  ProviderSnapshotDiagnostic,
  ProviderSnapshotOutcome,
} from './provider-snapshot.js';
export {
  CommitRevisionSchema,
  RevisionKindSchema,
  RevisionSchema,
  SnapshotRevisionSchema,
  WorktreeRevisionSchema,
  validateRevisionTransition,
} from './revision.js';
export type {
  CommitRevision,
  Revision,
  RevisionKind,
  SnapshotRevision,
  WorktreeRevision,
} from './revision.js';
export {
  CommitIdentitySchema,
  ContentFingerprintSchema,
  ProviderIdSchema,
  ProviderVersionSchema,
  RepositoryRelativePathSchema,
  RepositoryRootPathSchema,
  RuntimeVersionSchema,
} from './source-identity.js';
export type {
  CommitIdentity,
  ContentFingerprint,
  ProviderId,
  ProviderVersion,
  RepositoryRelativePath,
  RepositoryRootPath,
  RuntimeVersion,
} from './source-identity.js';
export * from './time.js';
export * from './validation.js';
