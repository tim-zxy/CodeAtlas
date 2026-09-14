import {
  CanonicalIdSchema,
  CommitIdentitySchema,
  ContentFingerprintSchema,
  EntityIdSchema,
  ProviderIdSchema,
  ProviderVersionSchema,
  RepositoryRelativePathSchema,
  RepositoryRootPathSchema,
  RuntimeVersionSchema,
  SourceFileSchema,
  type CanonicalId,
  type CommitIdentity,
  type ContentFingerprint,
  type EntityId,
  type ProviderId,
  type ProviderVersion,
  type RepositoryRelativePath,
  type RepositoryRootPath,
  type RuntimeVersion,
  type SourceFile,
} from '../src/index.js';

const repositoryRootPath: RepositoryRootPath =
  RepositoryRootPathSchema.parse('D:/workspace/project');
const repositoryRelativePath: RepositoryRelativePath =
  RepositoryRelativePathSchema.parse('src/main.ts');
const contentFingerprint: ContentFingerprint = ContentFingerprintSchema.parse('content:01');
const commitIdentity: CommitIdentity = CommitIdentitySchema.parse('commit:01');
const providerId: ProviderId = ProviderIdSchema.parse('provider:01');
const providerVersion: ProviderVersion = ProviderVersionSchema.parse('version:01');
const runtimeVersion: RuntimeVersion = RuntimeVersionSchema.parse('runtime:01');
const entityId: EntityId = EntityIdSchema.parse('entity:01');
const canonicalId: CanonicalId = CanonicalIdSchema.parse('canonical:01');
const sourceFile: SourceFile = SourceFileSchema.parse({
  id: 'entity:file-src-main',
  repositoryId: 'entity:repo-01',
  revisionId: 'entity:revision-worktree',
  path: 'src/main.ts',
  contentFingerprint: 'content:file-main-v1',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'typescript',
  sensitivity: 'INTERNAL',
});

const acceptRepositoryRelativePath = (value: RepositoryRelativePath): RepositoryRelativePath =>
  value;
const acceptContentFingerprint = (value: ContentFingerprint): ContentFingerprint => value;
const acceptProviderId = (value: ProviderId): ProviderId => value;
const acceptEntityId = (value: EntityId): EntityId => value;
const acceptCanonicalId = (value: CanonicalId): CanonicalId => value;

acceptRepositoryRelativePath(repositoryRelativePath);
acceptContentFingerprint(contentFingerprint);
acceptProviderId(providerId);
acceptEntityId(entityId);
acceptCanonicalId(canonicalId);

// @ts-expect-error ContentFingerprint must not masquerade as RepositoryRelativePath.
acceptRepositoryRelativePath(contentFingerprint);
// @ts-expect-error ProviderId must not masquerade as RepositoryRelativePath.
acceptRepositoryRelativePath(providerId);
// @ts-expect-error EntityId must not masquerade as RepositoryRelativePath.
acceptRepositoryRelativePath(entityId);
// @ts-expect-error CanonicalId must not masquerade as RepositoryRelativePath.
acceptRepositoryRelativePath(canonicalId);
// @ts-expect-error ProviderId must not masquerade as ContentFingerprint.
acceptContentFingerprint(providerId);
// @ts-expect-error EntityId must not masquerade as ContentFingerprint.
acceptContentFingerprint(entityId);
// @ts-expect-error CanonicalId must not masquerade as ContentFingerprint.
acceptContentFingerprint(canonicalId);
// @ts-expect-error EntityId must not masquerade as ProviderId.
acceptProviderId(entityId);
// @ts-expect-error CanonicalId must not masquerade as ProviderId.
acceptProviderId(canonicalId);
// @ts-expect-error CanonicalId must not masquerade as EntityId.
acceptEntityId(canonicalId);

void repositoryRootPath;
void commitIdentity;
void providerVersion;
void runtimeVersion;
void sourceFile;
