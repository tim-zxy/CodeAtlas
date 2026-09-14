import { z } from 'zod';

function exactNonBlankString(label: string) {
  return z
    .string()
    .refine((value) => value.length > 0 && value.trim().length > 0 && value === value.trim(), {
      message: `${label} must be exact and non-blank`,
    });
}

export const RepositoryRootPathSchema =
  exactNonBlankString('Repository root path').brand<'RepositoryRootPath'>();
export type RepositoryRootPath = z.infer<typeof RepositoryRootPathSchema>;

export const RepositoryRelativePathSchema = exactNonBlankString('Repository relative path')
  .refine(
    (value) =>
      !(
        value.includes('\\') ||
        value.includes('\0') ||
        value.startsWith('/') ||
        /^[A-Za-z]:\//.test(value) ||
        value.endsWith('/') ||
        value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
      ),
    { message: 'Repository relative path must be canonical' },
  )
  .brand<'RepositoryRelativePath'>();
export type RepositoryRelativePath = z.infer<typeof RepositoryRelativePathSchema>;

export const ContentFingerprintSchema =
  exactNonBlankString('Content fingerprint').brand<'ContentFingerprint'>();
export type ContentFingerprint = z.infer<typeof ContentFingerprintSchema>;

export const CommitIdentitySchema =
  exactNonBlankString('Commit identity').brand<'CommitIdentity'>();
export type CommitIdentity = z.infer<typeof CommitIdentitySchema>;

export const ProviderIdSchema = exactNonBlankString('Provider ID').brand<'ProviderId'>();
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ProviderVersionSchema =
  exactNonBlankString('Provider version').brand<'ProviderVersion'>();
export type ProviderVersion = z.infer<typeof ProviderVersionSchema>;

export const RuntimeVersionSchema =
  exactNonBlankString('Runtime version').brand<'RuntimeVersion'>();
export type RuntimeVersion = z.infer<typeof RuntimeVersionSchema>;
